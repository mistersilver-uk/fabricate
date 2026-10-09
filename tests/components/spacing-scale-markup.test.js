/**
 * Spacing set in MARKUP is on the scale (issue 1523): a `style` attribute, a `style:` directive or
 * a component's `--custom` prop in every Svelte template. A spacing property, or a custom property
 * a spacing declaration reads, is classified as a `<style>` block's is in
 * `spacing-scale-ratchet.test.js`. A value computed at runtime cannot be read, so it is listed as a
 * diagnostic rather than banned.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STYLE_CORPUS,
  assertGateCases,
  gateOver,
  styleCorpusOf,
  templatesOf,
  workingTree,
} from '../helpers/designSystemRatchet.js';
import { walkNodes } from '../helpers/moduleAst.js';
import { declarationsIn, varReferencesIn } from '../helpers/styleBlockScan.js';
import { lineOf } from '../helpers/svelteTemplateScan.js';

import { SCANNED_SPACING_PROPERTIES, SPACING_SCALE_PREFIX } from './spacing-known-literals.js';
import { inSvelteScope, offScaleLengthsIn, spacingContext } from './spacing-scale-classifier.js';

/** 37 markup style sites when chosen, 27 of them in the manager and components. */
const MARKUP_SITE_FLOOR = 30;

const SCANNED_SPACING = new Set(SCANNED_SPACING_PROPERTIES);

/** Stands for a part of a value only the running component knows. */
const RUNTIME = '\u{FFFC}';

/** A runtime part where a declaration would start, hiding which property it sets. */
const RUNTIME_DECLARATION = new RegExp(String.raw`(?:^|;)\s*${RUNTIME}`, 'u');

/** Every text in `heads` followed by every text in `tails`. */
const joined = (heads, tails) => heads.flatMap((head) => tails.map((tail) => head + tail));

/** The texts an expression may evaluate to, or null when only the running component knows. */
function expressionTexts(node) {
  if (node.type === 'Literal') return [String(node.value ?? '')];
  if (node.type === 'Identifier') return node.name === 'undefined' ? [''] : null;
  if (node.type === 'TemplateLiteral') {
    return node.expressions.reduce(
      (texts, expression, index) =>
        joined(joined(texts, expressionTexts(expression) ?? [RUNTIME]), [
          node.quasis[index + 1].value.cooked,
        ]),
      [node.quasis[0].value.cooked]
    );
  }
  if (node.type !== 'ConditionalExpression') return null;
  const branches = [expressionTexts(node.consequent), expressionTexts(node.alternate)];
  return branches.includes(null) ? null : branches.flat();
}

/** The texts a markup value may be, each runtime part as RUNTIME. */
function valueTexts(value) {
  if (value === true) return [RUNTIME];
  return (Array.isArray(value) ? value : [value]).reduce(
    (texts, part) =>
      joined(
        texts,
        part.type === 'Text' ? [part.data] : (expressionTexts(part.expression) ?? [RUNTIME])
      ),
    ['']
  );
}

/** The template nodes that take a style, and those of them that take a `--custom` prop. */
const COMPONENT_NODE = new Set(['Component', 'SvelteComponent', 'SvelteSelf']);
const STYLED_NODE = new Set([...COMPONENT_NODE, 'RegularElement', 'SvelteElement']);

/** The property a markup attribute sets, `style` for a whole style attribute, or null. */
function propertyOf(element, attribute) {
  if (attribute.type === 'StyleDirective') return attribute.name;
  if (attribute.type !== 'Attribute') return null;
  if (attribute.name === 'style') return 'style';
  return COMPONENT_NODE.has(element.type) && attribute.name.startsWith('--')
    ? attribute.name
    : null;
}

/** Each style a scope template sets in markup, as `{ file, line, property, texts }`. */
function markupStyles(templates) {
  const found = [];
  for (const { file, source, ast } of templates) {
    for (const element of walkNodes(ast.fragment)) {
      if (!STYLED_NODE.has(element.type)) continue;
      for (const attribute of element.attributes ?? []) {
        const property = propertyOf(element, attribute);
        if (property === null) continue;
        const line = lineOf(source, attribute.start);
        found.push({ file, line, property, texts: valueTexts(attribute.value) });
      }
    }
  }
  return found;
}

/** Every custom property a spacing declaration reads, directly or through another definition. */
function spacingReads(styleCorpus) {
  const read = new Set(
    styleCorpus.declarations.flatMap((declaration) =>
      SCANNED_SPACING.has(declaration.property.toLowerCase())
        ? varReferencesIn(declaration.value).map(({ name }) => name)
        : []
    )
  );
  for (const name of read) {
    for (const value of styleCorpus.definitions.get(name) ?? []) {
      for (const reference of varReferencesIn(value)) read.add(reference.name);
    }
  }
  return read;
}

/** A site's `{ property, value }` pairs: a whole style attribute's declarations, or its own. */
const declarationsOf = ({ file, property, texts }) =>
  property === 'style'
    ? texts.flatMap((text) => declarationsIn(file, text))
    : texts.map((value) => ({ property, value: value.trim() }));

/** The scope's markup sites, those off the scale, and those computed at runtime. */
function markupSpacing(readFile, files) {
  const styleCorpus = styleCorpusOf(readFile, files);
  const { definitions, scale } = spacingContext(styleCorpus);
  const read = spacingReads(styleCorpus);
  const sites = markupStyles(templatesOf(readFile, files.filter(inSvelteScope)));
  const offScale = [];
  const runtime = new Set();
  for (const site of sites) {
    const where = `${site.file}:${site.line}`;
    if (site.property === 'style' && site.texts.some((text) => RUNTIME_DECLARATION.test(text))) {
      runtime.add(`${where} style`);
    }
    for (const { property, value } of declarationsOf(site)) {
      if (!SCANNED_SPACING.has(property.toLowerCase()) && !read.has(property)) continue;
      if (value.includes(RUNTIME)) {
        runtime.add(`${where} ${property}`);
        continue;
      }
      const lengths = offScaleLengthsIn(value, definitions, scale);
      if (lengths.length > 0) offScale.push({ ...site, id: `${property} ${lengths}` });
    }
  }
  return { sites, offScale, runtime: [...runtime] };
}

test('no spacing set in Svelte markup is off the scale', (t) => {
  const { readFile, listFiles } = workingTree(STYLE_CORPUS);
  const { sites, offScale, runtime } = markupSpacing(readFile, listFiles());
  assert.ok(
    sites.length >= MARKUP_SITE_FLOOR,
    `only ${sites.length} markup style sites read, so this check is not reading the templates`
  );
  for (const site of runtime) t.diagnostic(`computed at runtime, not read: ${site}`);
  const failures = offScale.map(({ file, line, id }) => `${file}:${line} ${id}`);
  assert.deepEqual(
    failures,
    [],
    'a spacing value set in markup is off the published scale. Write the ' +
      `\`${SPACING_SCALE_PREFIX}-*\` token in the template, as a \`<style>\` block would:\n  ` +
      failures.join('\n  ')
  );
});

const MARKUP_GATE = gateOver([STYLE_CORPUS], (readFile, files) =>
  markupSpacing(readFile, files).offScale.map(({ file, line, id }) => ({ file, line, id }))
);

const MANAGER = 'src/ui/svelte/apps/manager/Probe.svelte';
const PLAYER = 'src/ui/svelte/apps/crafting/Probe.svelte';

const MARKUP_BASE = Object.freeze({
  'styles/fabricate.css': `:root { ${SPACING_SCALE_PREFIX}-2: 8px; }\n`,
  'src/ui/svelte/components/Pad.svelte':
    '<i class="pad"></i>\n<style>\n  .pad { padding: var(--pad); }\n</style>\n',
});

test('markup spacing fails off the scale in each spelling, and a runtime value is not read', (t) => {
  const at = (markup, ids, file = MANAGER) => ({
    head: { [file]: `${markup}\n` },
    failures: ids.map((id) => `${file}: ${id} is new (1)`),
  });
  assertGateCases(t, MARKUP_GATE, MARKUP_BASE, [
    at('<div style="padding: 13px"></div>', ['padding 13px']),
    at('<div style:padding="13px"></div>', ['padding 13px']),
    at('<div style="--pad: 13px"></div>', ['--pad 13px']),
    at('<div style:--pad="13px"></div>', ['--pad 13px']),
    at('<Pad --pad="13px" />', ['--pad 13px']),
    at('<div style={`margin: 13px; --other: 13px`}></div>', ['margin 13px']),
    at('<div style="gap: var(--fab-space-2); --other: 13px"></div>', []),
    at('<div style="padding: {inset}px"></div><div style={computed}></div>', []),
    at('<div style="padding: 13px"></div>', ['padding 13px'], PLAYER),
    at('<svelte:element this="div" style="padding: 13px" />', ['padding 13px']),
    at('<svelte:component this={Pad} --pad="13px" />', ['--pad 13px']),
    at('{#if open}<svelte:self --pad="13px" />{/if}', ['--pad 13px']),
  ]);
});

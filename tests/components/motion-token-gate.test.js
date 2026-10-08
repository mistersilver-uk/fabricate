/**
 * Motion is one token on a control's state change (issue 1523). `design-system/spec.md`'s "Every
 * interactive primitive declares its full state set" names `--fab-motion-control` as the only
 * motion and the sheet's one `prefers-reduced-motion` block as the only way it is removed. This
 * gate reads the global sheet and every Svelte `<style>` under `src/`, player apps included.
 *
 * Out of scope, because none ships: Svelte `transition:`, `in:`, `out:` and `animate:`
 * directives, and a JS `duration:`. The 150ms tooltip grace the tab strips keep
 * (`editor-tabs-capabilities`, `world-downtime-tabs-a11y`) is a pointer timer, not motion.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
  STYLE_CORPUS,
  assertFloor,
  assertGateCases,
  checkGate,
  exemptAt,
  gateOver,
  styleCorpusOf,
  workingTree,
} from '../helpers/designSystemRatchet.js';
import { repoRoot } from '../helpers/sourceScan.js';
import { splitSelectorList, varReferencesIn } from '../helpers/styleBlockScan.js';

const MOTION_TOKEN = '--fab-motion-control';
const MOTION_FIGURE = '140ms ease';
const SHEET = 'styles/fabricate.css';

/** Every transition and animation property, longhands too, so no longhand carries what the shorthand may not. */
const MOTION_PROPERTY = /^(?:transition|animation)(?:-[a-z]+)*$/u;
const LITERAL_TIME = /(?<![\w.])-?(?:\d+(?:\.\d+)?|\.\d+)m?s\b/iu;
const TIMING_FUNCTION =
  /\b(?:ease(?:-in-out|-in|-out)?|linear|step-start|step-end)\b|\b(?:steps|cubic-bezier)\(/iu;
const REDUCED_MOTION_MEDIA = /@media\b([^{]*prefers-reduced-motion[^{]*)\{/gu;
const READS_TOKEN = `var(${MOTION_TOKEN})`;

/** `value` with each `var()` name blanked, so a token name never reads as a time; fallbacks stay. */
function withoutVarNames(value) {
  let out = '';
  let cursor = 0;
  for (const reference of varReferencesIn(value)) {
    out += value.slice(cursor, reference.start);
    out += reference.fallback === null ? 'var()' : `var(, ${withoutVarNames(reference.fallback)})`;
    cursor = reference.end;
  }
  return out + value.slice(cursor);
}

/** One `transition` item: a named property, not `all`, at the token and nothing else. */
function transitionItemProblem(item) {
  const [property, ...rest] = item.split(/\s+/u);
  if (property === READS_TOKEN) return 'names no property';
  if (property.toLowerCase() === 'all') return 'transitions all';
  return rest.join(' ') === READS_TOKEN ? null : `does not read ${MOTION_TOKEN}`;
}

/** Any other motion property's item: the token alone. */
const tokenItemProblem = (item) => (item === READS_TOKEN ? null : `does not read ${MOTION_TOKEN}`);

/** Why a motion declaration breaks the rule, or `null` when it is `none` or reads the token. */
function motionValueProblem(property, value) {
  const text = value.replace(/\s*!important\s*$/iu, '').trim();
  if (text.toLowerCase() === 'none') return null;
  const bare = withoutVarNames(text);
  if (LITERAL_TIME.test(bare)) return 'a literal time';
  if (TIMING_FUNCTION.test(bare)) return 'a timing function';
  const itemProblem =
    property.toLowerCase() === 'transition' ? transitionItemProblem : tokenItemProblem;
  // A selector list and a transition list both split on their top-level commas.
  const items = splitSelectorList(text).map((item) => item.replaceAll(/\s+/gu, ' '));
  return items.map(itemProblem).find((problem) => problem !== null) ?? null;
}

/** Each `@media` testing `prefers-reduced-motion` in one file's CSS, with its line. */
function reducedMotionBlocks(file, css) {
  const found = [];
  REDUCED_MOTION_MEDIA.lastIndex = 0;
  for (let match = REDUCED_MOTION_MEDIA.exec(css); match; match = REDUCED_MOTION_MEDIA.exec(css)) {
    found.push({ file, line: css.slice(0, match.index).split('\n').length });
  }
  return found;
}

/** Whether `declaration` is the one token declaration the rule allows. */
const isTheTokenDeclaration = (declaration) =>
  declaration.file === SHEET && declaration.selector === ':root';

/** Every site breaking the motion rule on one side: a declaration, a block or a redeclaration. */
function motionSites(styleCorpus) {
  const sites = [];
  let tokenSeen = false;
  for (const declaration of styleCorpus.declarations) {
    const { file, at, property, value } = declaration;
    if (property === MOTION_TOKEN) {
      if (isTheTokenDeclaration(declaration) && !tokenSeen) tokenSeen = true;
      else sites.push({ file, line: at, id: `${MOTION_TOKEN} declared again` });
      continue;
    }
    if (!MOTION_PROPERTY.test(property.toLowerCase())) continue;
    const problem = motionValueProblem(property, value);
    if (problem !== null) sites.push({ file, line: at, id: `${property}: ${value} (${problem})` });
  }
  for (const [file, css] of Object.entries(styleCorpus.styles)) {
    const blocks = reducedMotionBlocks(file, css);
    const extra = file === SHEET ? blocks.slice(1) : blocks;
    const id = file === SHEET ? 'a second reduced-motion block' : 'a scoped reduced-motion block';
    for (const block of extra) sites.push({ ...block, id });
  }
  return sites;
}

const MOTION_GATE = gateOver([STYLE_CORPUS], (readFile, files) =>
  motionSites(styleCorpusOf(readFile, files))
);

let cached = null;
function tree() {
  if (cached === null) {
    const { readFile, listFiles } = workingTree(STYLE_CORPUS);
    cached = styleCorpusOf(readFile, listFiles());
  }
  return cached;
}

const GUIDANCE =
  `A control's state change reads \`${MOTION_TOKEN}\` and names the properties that change ` +
  '(`border-color var(--fab-motion-control)`); nothing else animates. Reduced motion is the ' +
  "sheet's one block, so a component writes none of its own. See `design-system/spec.md`'s " +
  '"Every interactive primitive declares its full state set".';

test('no motion declaration carries a time or timing of its own', (t) => {
  checkGate(t, MOTION_GATE, GUIDANCE);
});

test('the working tree holds no unmarked motion site, whatever the base', () => {
  const corpus = tree();
  const unmarked = motionSites(corpus).filter(
    (site) => !exemptAt(site.file, corpus.sources[site.file], site.line)
  );
  assert.deepEqual(
    unmarked.map((site) => `${site.file}:${site.line} ${site.id}`),
    [],
    GUIDANCE
  );
});

test('the corpus is read: Svelte style blocks, and transitions reading the token', () => {
  const corpus = tree();
  const svelteBlocks = Object.keys(corpus.styles).filter((file) => file.endsWith('.svelte'));
  assertFloor('Svelte <style> blocks', svelteBlocks.length, 200);
  const readers = corpus.declarations.filter(
    (declaration) =>
      declaration.property.toLowerCase() === 'transition' && declaration.value.includes(READS_TOKEN)
  );
  assertFloor(`transitions reading ${MOTION_TOKEN}`, readers.length, 5);
  assert.ok(
    readers.some((declaration) => declaration.file.endsWith('.svelte')),
    'no Svelte transition reads the token, so the Svelte half of the scan reads nothing'
  );
});

test(`${MOTION_TOKEN} is declared once, in the sheet's :root, at the spec's figure`, () => {
  const declared = tree().declarations.filter(
    (declaration) => declaration.property === MOTION_TOKEN
  );
  assert.deepEqual(
    declared.map(({ file, selector, value }) => ({ file, selector, value })),
    [{ file: SHEET, selector: ':root', value: MOTION_FIGURE }]
  );
  const spec = readFileSync(join(repoRoot, 'openspec/specs/design-system/spec.md'), 'utf8');
  const heading = '### Requirement: Every interactive primitive declares its full state set';
  const start = spec.indexOf(heading);
  assert.ok(start !== -1, `the spec no longer carries "${heading}"; retarget this gate`);
  const requirement = spec.slice(start, spec.indexOf('\n### ', start + heading.length));
  assert.ok(requirement.includes(`\`${MOTION_TOKEN}\``), 'the requirement names the token');
  assert.ok(requirement.includes(MOTION_FIGURE), `the requirement states ${MOTION_FIGURE}`);
});

test('reduced motion is one sheet block removing every transition, and nothing under src', () => {
  const corpus = tree();
  const blocks = Object.entries(corpus.styles).flatMap(([file, css]) =>
    reducedMotionBlocks(file, css)
  );
  assert.deepEqual(
    blocks.map((block) => block.file),
    [SHEET],
    'prefers-reduced-motion appears once, in the sheet'
  );
  const inside = corpus.declarations.filter(
    (declaration) =>
      declaration.file === SHEET && declaration.context.includes('prefers-reduced-motion')
  );
  assert.deepEqual(
    inside.map(({ property, value }) => `${property}: ${value}`),
    ['transition: none !important'],
    'the block removes transitions, and only transitions: no keyframes ship to reset'
  );
  const selectors = splitSelectorList(inside[0].selector);
  assert.ok(
    selectors.some((selector) => /fabricate/u.test(selector) && /\s\*$/u.test(selector)),
    'the block reaches every element inside a Fabricate root'
  );
});

test('the value rule fails a time, a timing or an unread token, and passes the token', () => {
  const fails = [
    ['transition', 'color 120ms'],
    ['transition', 'opacity 0.12s ease'],
    ['transition', 'color var(--fab-motion-control) 50ms'],
    ['transition', 'color var(--fab-motion-control, 120ms)'],
    ['transition', 'color ease'],
    ['transition', 'color cubic-bezier(0.4, 0, 0.2, 1)'],
    ['transition', 'color var(--fab-other-motion)'],
    ['transition', 'all var(--fab-motion-control)'],
    ['transition', 'var(--fab-motion-control)'],
    ['transition', 'opacity'],
    ['transition-duration', '120ms'],
    ['animation', 'spin 2.2s linear infinite'],
    ['animation-duration', '.5s'],
  ];
  for (const [property, value] of fails) {
    assert.notEqual(motionValueProblem(property, value), null, `${property}: ${value}`);
  }
  const passes = [
    ['transition', 'none'],
    ['transition', 'none !important'],
    ['transition', 'color var(--fab-motion-control)'],
    ['transition', 'color var(--fab-motion-control), opacity var(--fab-motion-control)'],
    ['animation', 'none'],
  ];
  for (const [property, value] of passes) {
    assert.equal(motionValueProblem(property, value), null, `${property}: ${value}`);
  }
});

/* ───────────────────────── proofs against throwaway repositories ───────────────────────── */

const RESET =
  '@media (prefers-reduced-motion: reduce) { .fabricate * { transition: none !important; } }';

const sheetWith = (...lines) =>
  [
    `:root { ${MOTION_TOKEN}: ${MOTION_FIGURE}; }`,
    `.fabricate .a { transition: color var(${MOTION_TOKEN}); }`,
    RESET,
    ...lines,
    '',
  ].join('\n');

const svelteWith = (...rules) =>
  ['<div class="p"></div>', '<style>', ...rules.map((rule) => `  ${rule}`), '</style>', ''].join(
    '\n'
  );

const WIRING_BASE = Object.freeze({ [SHEET]: sheetWith(), 'README.md': 'unrelated\n' });

const MANAGER = 'src/ui/svelte/apps/manager/Probe.svelte';
const COMPONENT = 'src/ui/svelte/components/Probe.svelte';
const PLAYER = 'src/ui/svelte/apps/crafting/Probe.svelte';
const SCOPED_RESET = '@media (prefers-reduced-motion: reduce) { .p { transition: none; } }';

test('the gate fails a literal time anywhere under src or styles, and passes the token', (t) => {
  const at = (file, rule, failures) => ({ head: { [file]: svelteWith(rule) }, failures });
  assertGateCases(t, MOTION_GATE, WIRING_BASE, [
    {
      head: { [SHEET]: sheetWith('.fabricate .b { transition: color 120ms; }') },
      failures: [`${SHEET}: transition: color 120ms (a literal time) is new (1)`],
    },
    at(MANAGER, '.p { transition: opacity 0.12s; }', [
      `${MANAGER}: transition: opacity 0.12s (a literal time) is new (1)`,
    ]),
    at(COMPONENT, '.p { transition: opacity 120ms ease; }', [
      `${COMPONENT}: transition: opacity 120ms ease (a literal time) is new (1)`,
    ]),
    at(PLAYER, '.p { transition: transform 120ms ease; }', [
      `${PLAYER}: transition: transform 120ms ease (a literal time) is new (1)`,
    ]),
    at(PLAYER, `.p { transition: color var(${MOTION_TOKEN}); }`, []),
  ]);
});

test('the gate fails a scoped reduced-motion block, a second sheet reset and a redeclaration', (t) => {
  assertGateCases(t, MOTION_GATE, WIRING_BASE, [
    {
      head: { [PLAYER]: svelteWith(SCOPED_RESET) },
      failures: [`${PLAYER}: a scoped reduced-motion block is new (1)`],
    },
    {
      head: { [SHEET]: sheetWith(RESET) },
      failures: [`${SHEET}: a second reduced-motion block is new (1)`],
    },
    {
      head: { [COMPONENT]: svelteWith(`.p { ${MOTION_TOKEN}: 120ms ease; }`) },
      failures: [`${COMPONENT}: ${MOTION_TOKEN} declared again is new (1)`],
    },
  ]);
});

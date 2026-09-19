/** An ELEMENT-TYPED `select` leg may not outlive the `<select>` it was written for (issue 1510). */
import assert from 'node:assert/strict';
import test from 'node:test';
import { join, resolve } from 'node:path';

import { measureImporters } from '../scripts/lib/componentImporters.js';
import { compoundsOf, ruleBlocks } from '../scripts/lib/stylesheetLiveClasses.js';
import { collectSources } from './helpers/sourceScan.js';
import { collectStyleCorpus, splitSelectorList } from './helpers/styleBlockScan.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');

/** The legs that are already dead at this change and are not its to strip (issue 1523). */
const STRANDED_BASELINE = Object.freeze([
  Object.freeze({
    file: 'styles/fabricate.css',
    selector:
      '.fabricate-manager .manager-gathering-event-edit-view ' +
      ':is(input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), select, textarea)',
    why:
      'The gathering EVENT editor emits no `<select>`; the leg arrived with markup copied from ' +
      'the TASK editor, which does. Dead before this change and owned by issue 1523.',
  }),
  Object.freeze({
    file: 'styles/fabricate.css',
    selector:
      '.fabricate-manager .manager-gathering-event-edit-view ' +
      ':is(input:not([type="checkbox"]):not([type="radio"]), select)',
    why:
      'The focus half of the pair above, dead for the same reason and deleted by the same ' +
      'change. Owned by issue 1523.',
  }),
]);

const SOURCES = collectSources(join(REPO_ROOT, 'src'), { extensions: ['.svelte'] });
const IMPORT_GRAPH = measureImporters(REPO_ROOT);

const CLASS_TOKEN = /\.(-?[_a-zA-Z][\w-]*)/gu;
const ATTRIBUTE_TOKEN = /\[([-\w]+)/gu;

/** A compound with every functional pseudo-class ARGUMENT removed. */
function withoutFunctionalArguments(compound) {
  let out = '';
  let depth = 0;
  for (const character of compound) {
    if (character === '(') depth += 1;
    if (depth === 0) out += character;
    if (character === ')') depth -= 1;
  }
  return out;
}

/** The element type a compound names, or `''` when it names none. */
function elementOf(compound) {
  return (withoutFunctionalArguments(compound).match(/^[a-z][\w-]*/u) ?? [''])[0];
}

/**
 * A selector with its functional pseudo-classes OPENED OUT into ordinary descendant position.
 * `:is(input, select, textarea)` is three alternatives in one compound, and only one of them is the
 * element this file is about.
 */
function flattenGroups(selector) {
  return selector.replaceAll(/:(?:global|is|where|not|has|matches)\(/gu, ' ').replaceAll(')', ' ');
}

/** Each `.svelte` file's TEMPLATE text: no `<style>` block, no comment of either syntax. */
const TEMPLATES = new Map(
  Object.entries(SOURCES).map(([file, source]) => [
    file,
    source
      .replaceAll(/<style[\s\S]*?<\/style>/gu, ' ')
      .replaceAll(/<!--[\s\S]*?-->/gu, ' ')
      .replaceAll(/\/\*[\s\S]*?\*\//gu, ' '),
  ])
);

const RENDERS_SELECT = new Map(
  [...TEMPLATES].map(([file, template]) => [file, /<select[\s>]/u.test(template)])
);
const ACCEPTS_CHILDREN = new Map(
  [...TEMPLATES].map(([file, template]) => [file, /@render\s+children|<slot\b/u.test(template)])
);

const EMITTERS = new Map();

/** The templates that write a class or attribute token. */
function emittersOf(token) {
  if (!EMITTERS.has(token)) {
    const pattern = new RegExp(String.raw`(?<![\w-])${token}(?![\w-])`, 'u');
    EMITTERS.set(
      token,
      [...TEMPLATES.keys()].filter((file) => pattern.test(TEMPLATES.get(file)))
    );
  }
  return EMITTERS.get(token);
}

/**
 * Every selector item in the shipped CSS and in every Svelte scoped block that carries a bare
 * `select` element token, with the scope tokens governing it.
 */
function selectElementLegs() {
  const legs = [];
  for (const [file, css] of Object.entries(collectStyleCorpus())) {
    for (const rule of ruleBlocks(css)) {
      for (const item of splitSelectorList(rule.selector)) {
        const compounds = compoundsOf(flattenGroups(item));
        const index = compounds.findIndex((compound) => elementOf(compound) === 'select');
        if (index < 0) continue;
        const prefix = compounds.slice(0, index + 1).join(' ');
        legs.push({
          file,
          line: rule.line,
          selector: item.replaceAll(/\s+/gu, ' '),
          tokens: [
            ...[...prefix.matchAll(CLASS_TOKEN)].map((match) => match[1]),
            ...[...prefix.matchAll(ATTRIBUTE_TOKEN)].map((match) => match[1]),
          ],
        });
      }
    }
  }
  return legs;
}

/** The templates that could render inside a leg's scope. See the file header for the rule. */
function possibleHosts(leg) {
  const scored = leg.tokens
    .map((token, position) => ({ token, owners: emittersOf(token), position }))
    .filter((entry) => entry.owners.length > 0);
  if (scored.length === 0) return new Set();
  scored.sort((a, b) => a.owners.length - b.owners.length || b.position - a.position);

  const hosts = new Set(scored[0].owners);
  for (const owner of scored[0].owners) {
    // The owner's OWN directly rendered children are inside its DOM subtree too: a descendant
    // combinator reaches a `<select>` a child component renders just as it reaches one written
    // inline (issue 1707 phase 2, where the drop editor's `<select>` moved one file down).
    for (const child of IMPORT_GRAPH.importsOf(owner)) {
      if (child.endsWith('.svelte')) hosts.add(child);
    }
    if (!ACCEPTS_CHILDREN.get(owner)) continue;
    for (const importer of IMPORT_GRAPH.importersOf(owner)) hosts.add(importer);
  }
  // A scoped block's own component is always in its scope, whatever its selector names.
  if (leg.file.endsWith('.svelte')) hosts.add(leg.file);
  return hosts;
}

/** The legs whose whole possible-host set renders no `<select>`. */
function strandedLegs() {
  return selectElementLegs().filter((leg) => {
    const hosts = possibleHosts(leg);
    return hosts.size > 0 && ![...hosts].some((host) => RENDERS_SELECT.get(host));
  });
}

const key = (leg) => `${leg.file}  ${leg.selector}`;

test('the element-typed leg scan is alive, so the clause below is not quantifying over nothing', () => {
  const legs = selectElementLegs();
  assert.ok(
    TEMPLATES.size > 100,
    `the component walk found ${TEMPLATES.size} templates, so it is not walking`
  );
  assert.ok(
    legs.length > 30,
    `only ${legs.length} element-typed \`select\` legs found across both corpora, so the ` +
      'selector walk has stopped seeing them'
  );
  assert.ok(
    legs.some((leg) => leg.file.endsWith('.svelte')),
    'no Svelte scoped block reports a `select` leg, so half the corpus is invisible to this scan'
  );
  assert.ok(
    [...RENDERS_SELECT.values()].filter(Boolean).length > 5,
    'no template renders a `<select>` at all, so every leg would report as stranded and the ' +
      'baseline below would be measuring the scan rather than the sheet'
  );
});

test('no element-typed `select` leg outlives the <select> it was written for', () => {
  const baseline = new Set(STRANDED_BASELINE.map((entry) => key(entry)));
  const stranded = strandedLegs();
  const appeared = stranded
    .filter((leg) => !baseline.has(key(leg)))
    .map((leg) => `${leg.file}:${leg.line}  ${leg.selector}`);

  assert.deepEqual(
    appeared,
    [],
    'these rules reach a `<select>` by ELEMENT TYPE, and no template that can be inside their ' +
      'scope renders one. A converted call site leaves exactly this behind: the declarations ' +
      'survive, every ratchet still counts them, and they paint nothing. Delete the leg, or ' +
      're-point it at `.fabricate-select-trigger` where the geometry has to be preserved:\n  ' +
      appeared.join('\n  ')
  );
});

test('the stranded baseline shrinks and is never added to', () => {
  const stranded = new Set(strandedLegs().map((leg) => key(leg)));
  const spent = STRANDED_BASELINE.filter((entry) => !stranded.has(key(entry))).map((entry) =>
    key(entry)
  );

  for (const entry of STRANDED_BASELINE) {
    assert.ok(
      entry.why.length > 40,
      `${key(entry)} is baselined with no stated reason and no owning issue`
    );
  }
  assert.deepEqual(
    spent,
    [],
    'these baseline entries no longer match a stranded leg. That is the GOOD direction — the ' +
      'rule was deleted or a `<select>` came back — and the entry must be deleted with it, ' +
      'because a spent entry silently re-permits the next stranded leg with the same ' +
      'selector:\n  ' + spent.join('\n  ')
  );
});

/**
 * An ELEMENT-TYPED `select` leg may not outlive the `<select>` it was written for (issue 1510).
 *
 * ── WHY THIS GATE HAD TO EXIST BEFORE THE SWEEP, NOT AFTER IT ───────────────────────────────
 * Converting a native `<select>` onto `components/Select.svelte` turns it into a `<button>`. Every
 * rule that reached it by ELEMENT TYPE — `.manager-field select`, `.manager-x-card :is(select,
 * input)` — stops matching at that moment, silently, with no compiler error, no ESLint rule and no
 * failing test. The declarations are still in the sheet, still linted, still counted by every
 * ratchet, and they paint nothing. That is the exact shape of the pair this change found in
 * `ImportFolderMappingModal.svelte`: two scoped blocks with the identical selector, one carrying
 * the control font and one the width floor, both element-typed against a `<select>` the row no
 * longer rendered.
 *
 * `tests/styles-dead-classes.test.js` cannot see it. That gate keys on CLASS EMISSION — a rule is
 * dead when a class it names is emitted by no source — and every one of these legs names classes
 * that are emitted perfectly well. The element token is the dead half, and no class-based scan has
 * an opinion about it.
 *
 * ── WHAT "STRANDED" MEANS HERE, AND WHY IT IS DELIBERATELY NARROW ───────────────────────────
 * For each selector item carrying a bare `select` ELEMENT token, the scan takes the scope tokens —
 * the classes and attribute names of the compounds up to and including the select — and picks the
 * NARROWEST of them: the one emitted by the fewest `.svelte` templates, ties broken by the later
 * position, because the later compound is the nearer qualifier. The templates emitting that token
 * are the possible hosts. A host that ACCEPTS CHILDREN (`{@render children}` or a legacy `<slot>`)
 * extends the host set to its importers, because a wrapper primitive's own file is not where a
 * caller's `<select>` is written — `Field.svelte` emits `manager-field` and renders whatever its
 * eighty-one call sites put inside it. A leg is stranded when not one host holds a `<select`.
 *
 * The narrowness is the point. This answers "could a `<select>` be inside this scope at all",
 * which is mechanical, rather than "is one there", which needs the render tree. It therefore MISSES
 * a leg whose scope class is emitted by a file that still holds a `<select>` somewhere ELSE in its
 * markup, and it is written to miss those rather than to guess: a false red on a live rule teaches
 * contributors to widen the baseline, which is how a ratchet dies. Two of the three legs the
 * change's design named by hand are in that category and stay owned by issue 1523 and by this
 * conversion's third phase; the one this scan reaches is in the baseline below.
 *
 * ── SHRINK-ONLY, AND DATED ──────────────────────────────────────────────────────────────────
 * The baseline holds the legs that are ALREADY stranded and are not this change's to strip. An
 * entry leaves when the change that deletes its rule lands. NOTHING IS EVER ADDED: a new stranded
 * leg is a conversion that left its CSS behind, which is the whole failure this file exists for.
 * A baseline entry that stops matching also reds, because a spent entry silently re-permits the
 * next one.
 *
 * Keyed by file and SELECTOR TEXT rather than by line, because line anchors in a 26,000-line sheet
 * move under every neighbouring edit and a stale anchor would read as a resolved leg.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { join, resolve } from 'node:path';

import { measureImporters } from '../scripts/lib/componentImporters.js';
import { compoundsOf, ruleBlocks } from '../scripts/lib/stylesheetLiveClasses.js';
import { collectSources } from './helpers/sourceScan.js';
import { collectStyleCorpus, splitSelectorList } from './helpers/styleBlockScan.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');

/**
 * The legs that are already dead at this change and are not its to strip.
 *
 * Both are the gathering EVENT editor's, whose emitter renders no `<select>` at all: the view was
 * built from the TASK editor's markup, which does, and the two element-typed legs came with the
 * copy. Owned by issue 1523's geometry and token sweep, which is the change that will delete the
 * rules. `why` is required and is checked for length, so an entry cannot be parked without one.
 */
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

/**
 * A compound with every functional pseudo-class ARGUMENT removed.
 *
 * `select:not([multiple])` and `:is(input, select)` both have to reduce to their top-level shape
 * before an element head can be read off them.
 *
 * @param {string} compound
 * @returns {string}
 */
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

/**
 * The element type a compound names, or `''` when it names none.
 *
 * @param {string} compound
 * @returns {string}
 */
function elementOf(compound) {
  return (withoutFunctionalArguments(compound).match(/^[a-z][\w-]*/u) ?? [''])[0];
}

/**
 * A selector with its functional pseudo-classes OPENED OUT into ordinary descendant position.
 *
 * `:is(input, select, textarea)` is three alternatives in one compound, and only one of them is
 * the element this file is about. Flattening turns the group into separate compounds so the
 * `select` alternative can be found; it over-reports position and never under-reports presence,
 * which is the safe direction for a scan whose answer is "there is a select leg here".
 *
 * @param {string} selector
 * @returns {string}
 */
function flattenGroups(selector) {
  return selector.replaceAll(/:(?:global|is|where|not|has|matches)\(/gu, ' ').replaceAll(')', ' ');
}

/**
 * Each `.svelte` file's TEMPLATE text: no `<style>` block, no comment of either syntax.
 *
 * Both exclusions are load-bearing rather than tidiness. A component that documents
 * `.fabricate-field :is(input, select, textarea)` in its docblock would otherwise read as a file
 * that renders a `<select>`, and every leg scoped to a class it emits would go green on prose.
 */
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

/**
 * The templates that write a class or attribute token.
 *
 * Whole-token, with both boundaries as lookarounds: `manager-field` must not match
 * `manager-field-error`, and `select` must not match `manager-scope-select`.
 *
 * @param {string} token
 * @returns {string[]}
 */
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
 *
 * @returns {Array<{file: string, line: number, selector: string, tokens: string[]}>}
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

/**
 * The templates that could render inside a leg's scope. See the file header for the rule.
 *
 * @param {{file: string, tokens: string[]}} leg
 * @returns {Set<string>}
 */
function possibleHosts(leg) {
  const scored = leg.tokens
    .map((token, position) => ({ token, owners: emittersOf(token), position }))
    .filter((entry) => entry.owners.length > 0);
  if (scored.length === 0) return new Set();
  scored.sort((a, b) => a.owners.length - b.owners.length || b.position - a.position);

  const hosts = new Set(scored[0].owners);
  for (const owner of scored[0].owners) {
    if (!ACCEPTS_CHILDREN.get(owner)) continue;
    for (const importer of IMPORT_GRAPH.importersOf(owner)) hosts.add(importer);
  }
  // A scoped block's own component is always in its scope, whatever its selector names.
  if (leg.file.endsWith('.svelte')) hosts.add(leg.file);
  return hosts;
}

/**
 * The legs whose whole possible-host set renders no `<select>`.
 *
 * A leg whose scope tokens are emitted by NOTHING is skipped rather than reported: that is a dead
 * CLASS, which `tests/styles-dead-classes.test.js` owns, and reporting it here would put the same
 * rule under two gates with two different remedies.
 *
 * @returns {Array<{file: string, line: number, selector: string}>}
 */
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

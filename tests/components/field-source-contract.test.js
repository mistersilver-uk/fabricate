/**
 * The END STATE of the `.manager-field` conversion, pinned in source (issue 1428).
 *
 * ── WHAT IT PINS AND WHY EACH CLAUSE EXISTS ─────────────────────────────────────────────
 * `manager-field` was a CSS convention: write the class, then remember which HOST element the
 * field is supposed to be. Measured on the tree this change started from, 88 sites across 24
 * components used three hosts — 56 `<label>`, 31 `<div>`, 1 `<fieldset>` — and that split is
 * an ACCESSIBILITY contract rather than a styling variant. A `<label>` field wraps its control
 * and gives it its accessible name; a `<div>` field does not, and 31 sites depend on not doing
 * it. So the primitive takes the host as a required-shaped `as` prop from a closed set, and
 * this file is what makes "required-shaped" mean something: nothing in the compiler or the
 * linter requires a prop, so without a source gate a forgotten `as` is invisible until a
 * screen reader announces the wrong thing.
 *
 * Four clauses, each with its own failure to prevent:
 *
 *   1. No `.svelte` under `src/` writes `manager-field` into the class attribute of a RAW
 *      element, except the files in {@link RAW_FIELD_ALLOWLIST}. This is the conversion
 *      itself: a primitive that coexists with unconverted duplicates has added a variant
 *      rather than removed one.
 *   2. The allowlist is SELF-CLEANING. Each entry pins its site count EXACTLY and must be
 *      above zero, so converting one of the root's seven fields fails until the pin is
 *      lowered, and converting the last one fails until the entry is DELETED. A ceiling would
 *      let the debt sit at seven forever and would also permit a net-zero swap — convert one
 *      here, hand-roll one there.
 *   3. Every `<Field>` renders with a LITERAL `as` drawn from the closed set. Literal, not
 *      merely present: `as={host}` would satisfy a presence check and put the host back into
 *      per-site data, which is the state this change exists to leave.
 *   4. The closed set in `Field.svelte` is exactly `label`, `div`, `fieldset`. Clause 3 reads
 *      the set out of the component, so without this pin the cheapest way to green a new
 *      `as="section"` is to widen the set, which is the drift the closed set exists to catch.
 *
 * ── AND THE ANTI-VACUITY HALF ───────────────────────────────────────────────────────────
 * Clauses 1 and 3 are both "for every X, P(X)", which is vacuously true over zero X. A parser
 * that stopped finding call sites, a walk pointed at the wrong root, or a `Field` renamed
 * without this file noticing would all read as clean. So the census below is asserted too:
 * the conversion must still be spread across at least twenty components, and each of the three
 * hosts must still have real users — because the one silent way to "simplify" this primitive
 * is to flatten 31 `<div>` fields into `<label>`s, which changes nothing visible and changes
 * what a screen reader says on 31 screens.
 *
 * Host floors rather than exact counts, deliberately: a new field is an ordinary edit and
 * should not have to re-pin a number here, whereas the SPLIT disappearing is not ordinary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { parse } from 'svelte/compiler';

import { collectSources } from '../helpers/sourceScan.js';

const repoRoot = resolve(import.meta.dirname, '../..');

/** The primitive whose adoption this file pins. */
const FIELD_PATH = 'src/ui/svelte/components/Field.svelte';

/**
 * The class the primitive owns, matched as a WHOLE token.
 *
 * Both boundaries are lookarounds rather than character classes. The first draft anchored on
 * `(?:^|\s)` and matched NOTHING, because the text it runs over is the whole attribute —
 * `class="manager-field"` — whose delimiter is a quote. Two of this file's four clauses passed
 * vacuously on that first run, which is why `the raw-element detector discriminates` below
 * drives this pattern over a synthetic fixture instead of trusting the corpus to contain a
 * positive case.
 *
 * The trailing lookahead is what keeps `manager-field-error` (a real, different class on a
 * real sibling `<span>`) out of the count.
 */
const FIELD_CLASS = /(?<![\w-])manager-field(?![\w-])/;

/**
 * The components still writing a raw `class="manager-field …"`, with their EXACT site count.
 *
 * ONE entry, and it is a deliberate carve-out rather than an oversight.
 * `CraftingSystemManagerRoot.svelte` is the manager's 14,000-line root: its seven fields sit
 * in the drop-rate and condition editors, and converting them inside this change would have
 * put a sweep of 23 components and an edit to the one file every manager lane touches into the
 * same diff. The count is what keeps it honest — see clause 2 in the header.
 */
const RAW_FIELD_ALLOWLIST = Object.freeze([
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    sites: 7,
    why:
      'The manager root, 14k lines and the file every manager lane touches. Its seven fields ' +
      'are the drop-rate editor, the drop-count editor, two condition-modifier pickers, the ' +
      'condition shortcut and two bare fields. Deferred as a whole so the sweep and the root ' +
      'are separately reviewable, not because the sites differ from the 81 that converted.',
  }),
]);

/**
 * `{ repoRelativePath: text }` for every `.svelte` under `src/`.
 *
 * The SHARED corpus reader (`tests/helpers/sourceScan.js`), which seven suites and the
 * `primitiveSourceContract` factory already quantify over, rather than a walker of this file's
 * own: a second recursive directory walk is a copy that can silently stop recursing while this
 * file goes on reporting clean.
 */
const SOURCES = collectSources(join(repoRoot, 'src'), { extensions: ['.svelte'] });

/** @param {string} file repo-relative POSIX path @returns {string} the file's text */
const read = (file) => SOURCES[file];

/**
 * Walk a parsed template, yielding every element and component node.
 *
 * The Svelte parser rather than a regular expression, for two reasons this corpus makes
 * concrete: `manager-field` appears in DOCBLOCK PROSE in five of these components and inside a
 * scoped `<style>` in three more, and a text scan would report every one of those as an
 * unconverted site. A `class` attribute on an element node is the only thing that renders.
 *
 * @param {object} node any AST node
 * @param {(node: object) => void} visit
 */
function walkTemplate(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkTemplate(child, visit);
    return;
  }
  if (node.type === 'RegularElement' || node.type === 'Component' || node.type === 'SvelteElement') {
    visit(node);
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'parent') continue;
    walkTemplate(node[key], visit);
  }
}

/**
 * @typedef {object} FieldScan
 * @property {Map<string, number>} rawSites raw elements carrying `manager-field`, per file
 * @property {Array<{file: string, as: string|null, raw: string}>} callSites every `<Field>`
 * @property {Map<string, number>} hosts call sites per declared host
 */

/**
 * Count raw (non-component) elements whose `class` attribute carries the `manager-field` token.
 *
 * Split out from the corpus walk so `the raw-element detector discriminates` can drive it over
 * a synthetic source. That test is not decoration: the FIRST version of this file returned zero
 * for every file in the corpus, and both clauses built on it went green.
 *
 * @param {string} source component source text
 * @param {string} filename a filename for the parser's error messages
 * @returns {number} raw `.manager-field` elements
 */
function rawFieldSitesIn(source, filename) {
  let count = 0;
  const ast = parse(source, { modern: true, filename });
  walkTemplate(ast.fragment, (node) => {
    if (node.type === 'Component') return;
    const classAttribute = (node.attributes ?? []).find(
      (attribute) => attribute.type === 'Attribute' && attribute.name === 'class'
    );
    if (!classAttribute) return;
    if (FIELD_CLASS.test(source.slice(classAttribute.start, classAttribute.end))) count += 1;
  });
  return count;
}

/** @returns {FieldScan} */
function scanCorpus() {
  const rawSites = new Map();
  const callSites = [];
  const hosts = new Map();

  for (const [file, source] of Object.entries(SOURCES)) {
    const ast = parse(source, { modern: true, filename: join(repoRoot, file) });
    const rawCount = rawFieldSitesIn(source, join(repoRoot, file));
    if (rawCount > 0) rawSites.set(file, rawCount);
    walkTemplate(ast.fragment, (node) => {
      if (node.type !== 'Component' || node.name !== 'Field') return;

      const asAttribute = (node.attributes ?? []).find(
        (attribute) => attribute.type === 'Attribute' && attribute.name === 'as'
      );
      const declared = asAttribute ? source.slice(asAttribute.start, asAttribute.end) : '';
      const literal = /^as="([a-z]+)"$/.exec(declared);
      // `value === true` is the AST's marker for a VALUELESS attribute — `data-x` rather than
      // `data-x=""` or the shorthand `{x}`, both of which carry a value node.
      const valueless = (node.attributes ?? [])
        .filter((attribute) => attribute.type === 'Attribute' && attribute.value === true)
        .map((attribute) => attribute.name);
      callSites.push({ file, as: literal ? literal[1] : null, raw: declared, valueless });
      if (literal) hosts.set(literal[1], (hosts.get(literal[1]) ?? 0) + 1);
    });
  }
  return { rawSites, callSites, hosts };
}

const scan = scanCorpus();

/** The host set the primitive itself declares, read out of its source rather than re-typed. */
function declaredHosts() {
  const source = read(FIELD_PATH);
  const declaration = /const HOSTS = new Set\(\[([^\]]*)\]\)/.exec(source);
  assert.ok(declaration, `${FIELD_PATH} no longer declares \`const HOSTS = new Set([…])\``);
  return [...declaration[1].matchAll(/'([a-z]+)'/g)].map((match) => match[1]);
}

test('the corpus this file quantifies over is alive', () => {
  const files = Object.keys(SOURCES);
  assert.ok(files.length > 100, `the component walk found ${files.length} files, so it is not walking`);
  assert.ok(files.includes(FIELD_PATH), `${FIELD_PATH} is not on disk; every clause below is moot`);
  assert.ok(
    scan.callSites.length > 70,
    `only ${scan.callSites.length} <Field> call sites found, so the parser stopped seeing them`
  );
  assert.ok(
    new Set(scan.callSites.map((site) => site.file)).size >= 20,
    'the conversion is no longer spread across the corpus, so a per-file regression would hide'
  );
});

test('the raw-element detector discriminates, so clause 1 is not vacuous', () => {
  // THE ANTI-VACUITY ANCHOR, and it is here because this exact detector shipped returning zero
  // for the whole corpus on its first run. The corpus cannot prove it: the whole point of
  // clause 1 is that the corpus contains (almost) no positive case, and the day the manager
  // root converts it will contain none at all — at which point a broken detector and a
  // converted tree would be indistinguishable. A synthetic source keeps a positive case that
  // survives the debt being paid.
  const fixture = [
    '<!--',
    '  Prose mentioning manager-field, which is how five real components document the box.',
    '-->',
    '<script>',
    "  import Field from '../../components/Field.svelte';",
    '</script>',
    '',
    '<label class="manager-field">a converted-looking site that is still raw</label>',
    '<div class="wrapper manager-field manager-thing">a second one, mid-list</div>',
    '<span class="manager-field-error">a different class entirely</span>',
    '<div class="fab-manager-fields">a different class again</div>',
    '<Field as="div" class="manager-thing">the converted shape</Field>',
    '',
    '<style>',
    '  .manager-field { color: red; }',
    '</style>',
  ].join('\n');

  assert.equal(
    rawFieldSitesIn(fixture, 'fixture.svelte'),
    2,
    'the detector must count the two RAW elements and nothing else: not the docblock, not the ' +
      'scoped rule, not `manager-field-error`, not `fab-manager-fields`, and not the `<Field>`'
  );
  assert.equal(
    rawFieldSitesIn(fixture.replaceAll('class="manager-field"', 'class="manager-box"'), 'f.svelte'),
    1,
    'converting a site must LOWER the count, or the pin in clause 2 can never come down'
  );
});

test('no component outside the allowlist writes a raw manager-field element', () => {
  const allowed = new Set(RAW_FIELD_ALLOWLIST.map((entry) => entry.path));
  const offenders = [...scan.rawSites.entries()]
    .filter(([file]) => !allowed.has(file))
    .map(([file, count]) => `${file} (${count} site${count === 1 ? '' : 's'})`)
    .sort();
  assert.deepEqual(
    offenders,
    [],
    'these components hand-roll the `.manager-field` box that `src/ui/svelte/components/' +
      'Field.svelte` owns. Render `<Field as="label|div|fieldset">` instead — and choose the ' +
      '`as` from what the markup MEANS, because a `<label>` names the control it wraps and a ' +
      `\`<div>\` does not:\n  ${offenders.join('\n  ')}`
  );
});

test('the raw-field allowlist is pinned by exact count and cleans itself up', () => {
  for (const entry of RAW_FIELD_ALLOWLIST) {
    assert.ok(entry.why.length > 0, `${entry.path} is allowlisted with no stated reason`);
    // Above zero, so the last conversion in a file deletes its entry rather than leaving a
    // spent allowlist row behind that silently re-permits the next hand-rolled field.
    assert.ok(
      entry.sites > 0,
      `${entry.path} is allowlisted for 0 sites. An entry at zero is spent: DELETE it, or the ` +
        'allowlist keeps granting a permission nothing needs.'
    );
    assert.equal(
      scan.rawSites.get(entry.path) ?? 0,
      entry.sites,
      `${entry.path} is allowlisted for exactly ${entry.sites} raw \`.manager-field\` ` +
        'element(s). Converting one lowers this pin; adding one is a new hand-rolled field ' +
        'and is what the pin exists to refuse.'
    );
  }
});

test('every Field renders with a literal host from the closed set', () => {
  const hosts = declaredHosts();
  const bad = scan.callSites
    .filter((site) => !site.as || !hosts.includes(site.as))
    .map((site) => `${site.file}: ${site.raw || '<Field> with no `as`'}`)
    .sort();
  assert.deepEqual(
    bad,
    [],
    'a `<Field>` must state its host as a LITERAL `as="label" | "div" | "fieldset"`. A missing ' +
      '`as` renders a `<div>` and the field stops naming its control; a computed one puts the ' +
      `host back into per-site data, which is what this primitive exists to end:\n  ${bad.join('\n  ')}`
  );
});

test('no Field carries a VALUELESS attribute, because a component renders one differently', () => {
  // A rendering trap that belongs to the rest spread rather than to this primitive, and it is
  // invisible in the source diff: `<div data-x>` sets `data-x=""`, while the same `data-x`
  // written on a component arrives in `...rest` as boolean `true` and `set_attribute` writes
  // `data-x="true"`. Six sites in this conversion carried one, and all six are now explicit.
  //
  // Nothing in the tree reads these by VALUE today — every consumer is a `[data-x]` presence
  // selector — so this is markup fidelity rather than a live defect. It is pinned anyway
  // because the cost of getting it wrong is a `[data-x=""]` selector or a `dataset.x`
  // truthiness test flipping silently on a screen nobody was changing.
  const offenders = scan.callSites
    .filter((site) => site.valueless.length > 0)
    .map((site) => `${site.file}: ${site.valueless.join(', ')}`)
    .sort();
  assert.deepEqual(
    offenders,
    [],
    `write \`attribute=""\` instead — that renders identically on a raw element and through the ` +
      `rest spread:\n  ${offenders.join('\n  ')}`
  );
});

test('the host set is the closed three, and all three still have real users', () => {
  assert.deepEqual(
    declaredHosts(),
    ['label', 'div', 'fieldset'],
    'the `as` set changed. It is closed on purpose: a fourth host is a new accessibility ' +
      'contract, not a styling variant, and it is also the cheapest way to green a call site ' +
      'that should have picked one of these three.'
  );
  // Floors, not exact counts — a new field is an ordinary edit. What is NOT ordinary is the
  // SPLIT collapsing: flattening the 31 `<div>` fields into `<label>`s renders identically and
  // changes what a screen reader announces on 31 screens.
  // 49 / 31 / 1 as this lands: the corpus's 56 `<label>` sites less the seven still raw in the
  // allowlisted manager root, plus all 31 `<div>` sites and the one `<fieldset>`.
  for (const [host, floor] of [
    ['label', 45],
    ['div', 28],
    ['fieldset', 1],
  ]) {
    const count = scan.hosts.get(host) ?? 0;
    assert.ok(
      count >= floor,
      `only ${count} \`<Field as="${host}">\` call sites remain, below the floor of ${floor}. ` +
        'Each host is a different announcement, so a host losing its users means sites were ' +
        'moved onto another one.'
    );
  }
});

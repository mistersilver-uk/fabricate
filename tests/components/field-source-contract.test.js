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
 * ── WHERE THE FIRST FIVE CLAUSES LIVE ───────────────────────────────────────────────────
 * `tests/helpers/primitiveAdoptionContract.js`, shared with
 * `manager-filter-bar-source-contract.test.js`, which asks the same questions about
 * `<ManagerToolbar>` and `<ManagerSearchField>` (issue 1039). That file records why the
 * questions are shared and why they are NOT the ones
 * `tests/helpers/primitiveSourceContract.js` asks; the short version is that a text scan cannot
 * tell a raw element from a component tag and cannot tell `manager-field` from
 * `manager-field-label`, which is why this gate parsed the template from its first version.
 * It supplies:
 *
 *   1. No `.svelte` under `src/` writes `manager-field` on a RAW element, except the files in
 *      {@link RAW_FIELD_ALLOWLIST}. This is the conversion itself: a primitive that coexists
 *      with unconverted duplicates has added a variant rather than removed one.
 *   2. The allowlist is SELF-CLEANING, pinned by EXACT count and refused at zero.
 *   3. The detector discriminates, driven over the synthetic fixture below — which is not
 *      decoration, because the first version of this detector returned zero for the whole
 *      corpus and two clauses went green on it.
 *   4. No `<Field>` carries a VALUELESS attribute, which a component renders as `="true"`.
 *   5. The corpus is alive: a floor on call sites and on the components spreading them.
 *
 * ── AND THE TWO CLAUSES THAT EARN THIS FILE ─────────────────────────────────────────────
 * Both are about the host, which no other primitive in this programme has:
 *
 *   6. Every `<Field>` renders with a LITERAL `as` drawn from the closed set. Literal, not
 *      merely present: `as={host}` would satisfy a presence check and put the host back into
 *      per-site data, which is the state this change exists to leave.
 *   7. The closed set in `Field.svelte` is exactly `label`, `div`, `fieldset`, and all three
 *      still have real users. Clause 6 reads the set out of the component, so without this pin
 *      the cheapest way to green a new `as="section"` is to widen the set; and the one silent
 *      way to "simplify" this primitive is to flatten the 31 `<div>` fields into `<label>`s,
 *      which changes nothing visible and changes what a screen reader says on 31 screens.
 *
 * Host floors rather than exact counts, deliberately: a new field is an ordinary edit and
 * should not have to re-pin a number here, whereas the SPLIT disappearing is not ordinary.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { SOURCES, definePrimitiveAdoptionContract } from '../helpers/primitiveAdoptionContract.js';

/** The primitive whose adoption this file pins. */
const FIELD_PATH = 'src/ui/svelte/components/Field.svelte';

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

const { callSites } = definePrimitiveAdoptionContract({
  label: 'manager-field',
  tag: 'Field',
  primitive: FIELD_PATH,
  contractClass: 'manager-field',
  allowlist: RAW_FIELD_ALLOWLIST,
  callSiteFloor: 70,
  fileFloor: 20,

  detectorFixture: {
    source: [
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
    ].join('\n'),
    expected: 2,
    lowered: ['class="manager-field"', 'class="manager-box"'],
    loweredExpected: 1,
  },

  rawRemedy:
    'these components hand-roll the `.manager-field` box that `src/ui/svelte/components/' +
    'Field.svelte` owns. Render `<Field as="label|div|fieldset">` instead — and choose the ' +
    '`as` from what the markup MEANS, because a `<label>` names the control it wraps and a ' +
    '`<div>` does not',

  valuelessRemedy:
    'write `attribute=""` instead — that renders identically on a raw element and through the ' +
    'rest spread. Six sites in this conversion carried one, and all six are now explicit. ' +
    'Nothing in the tree reads these by VALUE today — every consumer is a `[data-x]` presence ' +
    'selector — so this is markup fidelity rather than a live defect. It is pinned anyway ' +
    'because the cost of getting it wrong is a `[data-x=""]` selector or a `dataset.x` ' +
    'truthiness test flipping silently on a screen nobody was changing',
});

/** The host set the primitive itself declares, read out of its source rather than re-typed. */
function declaredHosts() {
  const source = SOURCES[FIELD_PATH];
  const declaration = /const HOSTS = new Set\(\[([^\]]*)\]\)/.exec(source);
  assert.ok(declaration, `${FIELD_PATH} no longer declares \`const HOSTS = new Set([…])\``);
  return [...declaration[1].matchAll(/'([a-z]+)'/g)].map((match) => match[1]);
}

/** Every call site's declared host, or `null` where it is missing or computed. */
const literalHosts = callSites.map((site) => {
  const declared = site.attribute('as') ?? '';
  const literal = /^as="([a-z]+)"$/.exec(declared);
  return { file: site.file, raw: declared, as: literal ? literal[1] : null };
});

test('every Field renders with a literal host from the closed set', () => {
  const hosts = declaredHosts();
  const bad = literalHosts
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
    const count = literalHosts.filter((site) => site.as === host).length;
    assert.ok(
      count >= floor,
      `only ${count} \`<Field as="${host}">\` call sites remain, below the floor of ${floor}. ` +
        'Each host is a different announcement, so a host losing its users means sites were ' +
        'moved onto another one.'
    );
  }
});

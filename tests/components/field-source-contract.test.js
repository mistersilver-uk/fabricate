/** The END STATE of the `.manager-field` conversion, pinned in source (issue 1428). */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SOURCES,
  definePrimitiveAdoptionContract,
} from '../helpers/primitiveAdoptionContract.js';

/** The primitive whose adoption this file pins. */
const FIELD_PATH = 'src/ui/svelte/components/Field.svelte';

/** The components still writing a raw `class="manager-field …"`, with their EXACT site count. */
const RAW_FIELD_ALLOWLIST = Object.freeze([
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    sites: 1,
    why:
      'The manager root, the file every manager lane touches. Its one remaining field is the ' +
      'systems-list condition shortcut. It was seven until issue 1707 wrote the twice-authored ' +
      'modifier panel once (four left, two landed in the row below, two de-duplicated rather ' +
      'than converted), and three until its phase 2 moved the drop-rate and drop-count editors ' +
      'into the row below with the branch that drew them. Deferred as a whole so the sweep and ' +
      'the root are separately reviewable, not because the sites differ from the 81 that ' +
      'converted.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/environment/GatheringModifierEditor.svelte',
    sites: 2,
    why:
      'The condition-modifier picker and the expression-override field of the panel issue 1707 ' +
      'wrote once. RELOCATED without converting either, so the deferral is unchanged in ' +
      'substance; the file is now one screen\'s form, which a conversion lane can take on its own.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/environment/GatheringTaskInspector.svelte',
    sites: 2,
    why:
      'The drop-rate editor and the drop-count editor, relocated by issue 1707 phase 2 without ' +
      'converting either, so the deferral is unchanged in substance; the file is now one ' +
      "screen's form, which a conversion lane can take on its own.",
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
  // The `label` floor dropped 45 → 40 when the checks studio's selects moved onto the `Select`
  // primitive: each wrapper existed to name a native `<select>`, and the primitive now carries
  // that name itself (`ariaLabelledBy`/`ariaLabel`), so no site changed which host announces it.
  // It dropped again 40 → 36 when the gathering task editor's four captioned selects converted:
  // each `<Field as="label">` demoted to `as="div"` and the caption's id became the trigger's
  // `ariaLabelledBy`, so the same caption still names the same control. And again 36 → 35 when the
  // environment overview's danger ceiling converted, the one captioned select of that commit. And
  // 35 → 34 when the environments browser's conditions card converted its current-value picker.
  for (const [host, floor] of [
    ['label', 34],
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

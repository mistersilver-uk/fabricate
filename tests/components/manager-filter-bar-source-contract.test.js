/** The END STATE of the `.manager-toolbar` and `.manager-search` conversions (issue 1039). */
import test from 'node:test';
import assert from 'node:assert/strict';

import { definePrimitiveAdoptionContract } from '../helpers/primitiveAdoptionContract.js';

const TOOLBAR_PATH = 'src/ui/svelte/components/ManagerToolbar.svelte';
const FIELD_PATH = 'src/ui/svelte/components/ManagerSearchField.svelte';

/** The bar has NO allowlist, and the empty array is the claim rather than an omission. */
const RAW_TOOLBAR_ALLOWLIST = Object.freeze([]);

/** The two `.manager-search` sites that are not this primitive, with their exact counts. */
const RAW_SEARCH_ALLOWLIST = Object.freeze([
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/environment/GatheringModifierEditor.svelte',
    sites: 1,
    why:
      'one character-modifier combobox. The root held two — near-identical duplicates of one ' +
      'another, one on the gathering drop inspector and one on the event inspector — and this row ' +
      'said a root de-duplication that merged them would legitimately take the pin to 1 rather ' +
      'than read as a regression. Issue 1707 did exactly that: the panel is written once and ' +
      'rendered at both subjects, so the second was de-duplicated rather than converted. It still ' +
      'renders a `.manager-tag-suggestions` list inside the label and takes `bind:this` on it for ' +
      'popover positioning, which a component tag cannot supply.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
    sites: 1,
    why:
      'The component TAG search (`:1753`, re-measured at issue 1508), which renders a ' +
      '`.manager-tag-suggestions` list inside its label and swaps the glyph to `fa-tags`. Its ' +
      'three siblings in the same file ' +
      'converted; this one is a combobox and belongs to `SearchablePopover`, so it is an ' +
      'adjudicated opt-out rather than deferred work.',
  }),
]);

/**
 * A synthetic source for the raw-element detector.
 *
 * @param {{contract: string, prefixed: string, tag: string}} tokens
 * @returns {string}
 */
function detectorSource({ contract, prefixed, tag }) {
  return [
    '<!--',
    `  Prose mentioning ${contract}, which is how this primitive documents itself.`,
    '-->',
    '<script>',
    `  import ${tag} from '../../components/${tag}.svelte';`,
    '</script>',
    '',
    `<section class="${contract}">a converted-looking site that is still raw</section>`,
    `<label class="wrapper ${contract} is-compact">a second one, mid-list</label>`,
    `<div class="${prefixed}">a longer class the token is a PREFIX of</div>`,
    `<${tag} class="modifier">the converted shape</${tag}>`,
    '',
    '<style>',
    `  .${contract} { color: red; }`,
    '</style>',
  ].join('\n');
}

const toolbar = definePrimitiveAdoptionContract({
  label: 'manager-toolbar',
  tag: 'ManagerToolbar',
  primitive: TOOLBAR_PATH,
  contractClass: 'manager-toolbar',
  allowlist: RAW_TOOLBAR_ALLOWLIST,
  // 11 sites in 11 components as this lands. 8 is a real floor with headroom.
  callSiteFloor: 8,
  fileFloor: 8,
  detectorFixture: {
    source: detectorSource({
      contract: 'manager-toolbar',
      prefixed: 'manager-toolbar-pills',
      tag: 'ManagerToolbar',
    }),
    expected: 2,
    lowered: ['<section class="manager-toolbar">', '<section class="manager-bar">'],
    loweredExpected: 1,
  },
  rawRemedy:
    'these components hand-roll the `.manager-toolbar` bar that ' +
    '`src/ui/svelte/components/ManagerToolbar.svelte` owns. Render `<ManagerToolbar ' +
    'ariaLabel={…}>` instead — a per-site modifier travels as a pass-through on the `class` ' +
    'prop, the row `<div>` stays at the call site because `BulkSelectionToolbar` renders its ' +
    'own, and a `data-*` hook rides the rest spread',
  valuelessRemedy:
    'write `attribute=""` instead — that renders identically on a raw element and through the ' +
    'rest spread. Four of the bar`s converted attributes were written bare, and a bare ' +
    '`data-recipe-toolbar` on a COMPONENT tag spreads the boolean `true` and renders ' +
    '`="true"`. Presence selectors resolve either way, which is why the suites and smoke steps ' +
    'that use them would not have caught it',
});

const field = definePrimitiveAdoptionContract({
  label: 'manager-search',
  tag: 'ManagerSearchField',
  primitive: FIELD_PATH,
  contractClass: 'manager-search',
  allowlist: RAW_SEARCH_ALLOWLIST,
  // 19 sites in 16 components as this lands.
  callSiteFloor: 14,
  fileFloor: 12,
  // `compact` is a declared boolean prop.
  booleanProps: Object.freeze(['compact']),
  detectorFixture: {
    source: detectorSource({
      contract: 'manager-search',
      prefixed: 'manager-search-row',
      tag: 'ManagerSearchField',
    }),
    expected: 2,
    lowered: ['<section class="manager-search">', '<section class="manager-box">'],
    loweredExpected: 1,
  },
  rawRemedy:
    'these components hand-roll the `.manager-search` pill that ' +
    '`src/ui/svelte/components/ManagerSearchField.svelte` owns. Render `<ManagerSearchField ' +
    'ariaLabel={…} placeholder={…}>` instead — `compact` emits `is-compact`, a bespoke class ' +
    'travels on `class`, a label hook rides the rest spread and an INPUT hook goes in ' +
    '`inputAttrs`. If the site is a combobox with its own suggestion list, it belongs to ' +
    '`SearchablePopover` and to the allowlist above, not to this primitive',
  valuelessRemedy:
    'write `attribute=""` instead — that renders identically on a raw element and through the ' +
    'rest spread, where a bare `data-knowledge-search` arrives as the boolean `true` and ' +
    'renders `="true"`. The same is true of an `inputAttrs` entry: spell its value `\'\'`',
});

/** Every call site of both primitives, tagged with the primitive it belongs to. */
const NAMED = Object.freeze([
  Object.freeze({ tag: 'ManagerToolbar', sites: toolbar.callSites }),
  Object.freeze({ tag: 'ManagerSearchField', sites: field.callSites }),
]);

test('every filter bar and every search field passes an accessible name', () => {
  // NON-VACUITY first: the two floors above are asserted by the factory.
  const total = NAMED.reduce((sum, entry) => sum + entry.sites.length, 0);
  assert.ok(total >= 22, `only ${total} call sites across both primitives, so this clause has ` +
    'lost most of its domain');

  const offenders = [];
  for (const { tag, sites } of NAMED) {
    for (const site of sites) {
      const declared = site.attribute('ariaLabel');
      // Present AND non-empty. `ariaLabel=""` satisfies a presence check and names nothing,
      // and on a `<section>` it is worse than omitting the prop: an empty string is still an
      // `aria-label` attribute, so some assistive technology reports an unnamed region rather
      // than falling through to the element's other naming routes.
      if (declared && !/^ariaLabel=(""|'')$/.test(declared)) continue;
      offenders.push(`${site.file}: <${tag}> ${declared ?? 'passes no ariaLabel'}`);
    }
  }

  assert.deepEqual(
    offenders.sort(),
    [],
    'a `<ManagerToolbar>` without `ariaLabel` renders a `<section>` with no accessible name, ' +
      'which is not a `region` landmark at all — it disappears from the landmark list while ' +
      'looking identical. A `<ManagerSearchField>` without one renders a `<label>` that wraps ' +
      'an icon and an input and no text, so the control is announced as "search" and nothing ' +
      'else. Neither is visible in a frame and neither is a compiler error, which is why it is ' +
      `a source clause:\n  ${offenders.join('\n  ')}`
  );
});

test('no call site restates the class the primitive emits itself', () => {
  // Restating it would still WORK — the `class` prop APPENDS rather than replaces.
  // exactly why it needs a gate rather than a bug report: the site renders identically, the
  // token is emitted twice, and the convention this component exists to close is back.
  const offenders = [];
  for (const [{ tag, sites }, contract] of [
    [NAMED[0], 'manager-toolbar'],
    [NAMED[1], 'manager-search'],
  ]) {
    for (const site of sites) {
      const declared = site.attribute('class');
      if (!declared) continue;
      if (!new RegExp(String.raw`(?<![\w-])${contract}(?![\w-])`).test(declared)) continue;
      offenders.push(`${site.file}: <${tag}> ${declared}`);
    }
  }
  assert.deepEqual(
    offenders.sort(),
    [],
    'the primitive emits its contract class itself and APPENDS the `class` prop after it, so ' +
      `restating it emits the token twice:\n  ${offenders.join('\n  ')}`
  );
});

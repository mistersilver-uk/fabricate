/**
 * The END STATE of the `.manager-toolbar` and `.manager-search` conversions (issue 1039).
 *
 * ── TWO PRIMITIVES, ONE FILE, AND WHY THAT IS THE HONEST SHAPE ──────────────────────────
 * `openspec/specs/design-system/library.html:1233` sketches ONE `<FilterBar>` owning `query`
 * and `onQueryChange`, so the expected extraction is a bar that renders its own field. The
 * corpus refuses it, and the census is the argument. Measured by walking every component's
 * Svelte AST on the tree this change started from: 11 bars, every one a `<section>`; 22 search
 * fields, every one a `<label>`; and THIRTEEN of the 23 fields inside no bar at all. One bar
 * has no field (`BooksScrollsView`) and one has nothing else (`GatheringRealmsTab`). A single
 * component would have forced a bar around thirteen fields that have none.
 *
 * They share this file because they are one surface and one conversion, and because their
 * clauses are otherwise the same five questions asked twice — see the factory below.
 *
 * ── WHERE THE FIVE SHARED CLAUSES LIVE ──────────────────────────────────────────────────
 * `tests/helpers/primitiveAdoptionContract.js`, shared with `field-source-contract.test.js`.
 * That file records why the questions are shared and why they are NOT the ones
 * `tests/helpers/primitiveSourceContract.js` asks. The short version matters here in
 * particular: `manager-toolbar` is a PREFIX of `manager-toolbar-pills`, which
 * `GatheringTaskEditView.svelte` writes on a `<div>` chip row that is not a filter bar at all.
 * A `source.includes('manager-toolbar')` clause counts it, and a `\b`-terminated token pattern
 * counts it too, because `\b` matches before a hyphen. That single false positive is why a raw
 * grep says there are twelve bars.
 *
 * ── AND THE CLAUSE THAT EARNS THIS FILE ─────────────────────────────────────────────────
 * Every call site of both primitives passes an ACCESSIBLE NAME, and it is a different failure
 * for each:
 *
 *  - A `<section>` is a `region` landmark only while it has an accessible name. Without one it
 *    is a generic grouping element and drops out of the landmark list entirely — so a bar that
 *    forgets `ariaLabel` still renders pixel-identically and silently removes a landmark from
 *    the screen's structure. All 11 hand-rolled bars carried an `aria-label` and nothing made
 *    them.
 *  - The field's `<label>` wraps an icon and an input and NO TEXT, so it contributes no
 *    accessible name of its own. Every one of the 20 converted sites names the control with an
 *    `aria-label` on the inner input instead. A field that forgets it is announced as "search"
 *    and nothing else, on a screen that may hold three of them.
 *
 * Neither is visible in a frame, neither is a compiler error and neither is an ESLint rule.
 * This is the mirror of the accessible-name clause that earns
 * `tests/icon-button-source-contract.test.js`, and it is why these two primitives take the name
 * as a NAMED PROP rather than through the rest spread.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { definePrimitiveAdoptionContract } from '../helpers/primitiveAdoptionContract.js';

const TOOLBAR_PATH = 'src/ui/svelte/components/ManagerToolbar.svelte';
const FIELD_PATH = 'src/ui/svelte/components/ManagerSearchField.svelte';

/**
 * The bar has NO allowlist, and the empty array is the claim rather than an omission.
 *
 * All 11 sites converted in this one change. The primitive itself is not an entry either, and
 * that is structural rather than a carve-out: it emits the token from `class={classes}`, a
 * JavaScript expression, so the raw-element detector — which reads the `class` attribute's
 * source text — does not see it. `InspectorCard` needed an exemption for exactly this because
 * its guard is a text scan; this one does not.
 */
const RAW_TOOLBAR_ALLOWLIST = Object.freeze([]);

/**
 * The three `.manager-search` sites that are NOT this primitive, with their EXACT counts.
 *
 * All three are COMBOBOXES wearing the field's class: each renders a `.manager-tag-suggestions`
 * typeahead list as a SIBLING of the input, inside the label, and one of them swaps the leading
 * glyph to `fa-tags`. They match the CSS and not the meaning — what they are is
 * `SearchablePopover.svelte`'s surface — and folding a suggestion list into a plain field would
 * make the primitive own two meanings at once.
 *
 * The manager root's two carry a second, harder disqualifier, and it is structural rather than
 * editorial: both write `bind:this={characterModifierSearchAnchor}` on the label so the popover
 * can position against that element. `bind:this` on a COMPONENT tag binds the component
 * instance, not its host element, so converting either one needs an element-ref seam this
 * primitive does not have and should not grow for two callers.
 */
const RAW_SEARCH_ALLOWLIST = Object.freeze([
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte',
    sites: 2,
    why:
      'Two character-modifier COMBOBOXES (`:12051`, `:12460`) — near-identical duplicates of ' +
      'one another, one on the gathering drop inspector and one on the event inspector. Each ' +
      'renders a `.manager-tag-suggestions` list inside the label and takes ' +
      '`bind:this` on it for popover positioning, which a component tag cannot supply. A root ' +
      'de-duplication that merged the two would legitimately take this pin to 1 rather than ' +
      'reading as a regression.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/GatheringTaskEditView.svelte',
    sites: 1,
    why:
      'The component TAG search (`:1746`), which renders a `.manager-tag-suggestions` list ' +
      'inside its label and swaps the glyph to `fa-tags`. Its three siblings in the same file ' +
      'converted; this one is a combobox and belongs to `SearchablePopover`, so it is an ' +
      'adjudicated opt-out rather than deferred work.',
  }),
]);

/**
 * A synthetic source for the raw-element detector, shared in SHAPE by both primitives below and
 * written out per primitive because the tokens are what is being discriminated.
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
  // 11 sites in 11 components as this lands. 8 is a real floor with headroom: deleting a
  // browse screen must not red this, and losing a third of them must.
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
  // `compact` is a declared boolean prop, so `<ManagerSearchField compact>` is correct rather
  // than the `data-*` trap the valueless clause exists for. The factory verifies the primitive
  // really declares it with a `false` default before honouring the exemption.
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

/**
 * Every call site of both primitives, tagged with the primitive it belongs to.
 *
 * One list rather than two loops, because the clause below is the same sentence about both and
 * the failure message has to name which one is missing its name.
 */
const NAMED = Object.freeze([
  Object.freeze({ tag: 'ManagerToolbar', sites: toolbar.callSites }),
  Object.freeze({ tag: 'ManagerSearchField', sites: field.callSites }),
]);

test('every filter bar and every search field passes an accessible name', () => {
  // NON-VACUITY first: the two floors above are asserted by the factory, but they are stated
  // over the FACTORY's scan, and this clause reads the same scan through a different accessor.
  // A change that broke `attribute()` would leave every site reporting `null` — which is the
  // failing direction, so it cannot hide — while a change that made it return a constant would
  // leave every site passing. The count is what distinguishes those.
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
  // Restating it would still WORK — the `class` prop APPENDS rather than replaces — which is
  // exactly why it needs a gate rather than a bug report: the site renders identically, the
  // token is emitted twice, and the convention this component exists to close is back.
  //
  // The raw-element clause cannot see this: `<ManagerToolbar class="manager-toolbar">` is a
  // COMPONENT node, which that detector skips by design.
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

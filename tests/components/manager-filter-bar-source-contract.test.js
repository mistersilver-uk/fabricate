/** The END STATE of the `.fabricate-filter-bar` and `.fabricate-search` conversions (issue 1039). */
import test from 'node:test';
import assert from 'node:assert/strict';

import { definePrimitiveAdoptionContract } from '../helpers/primitiveAdoptionContract.js';

const TOOLBAR_PATH = 'src/ui/svelte/components/FilterBar.svelte';
const FIELD_PATH = 'src/ui/svelte/components/SearchField.svelte';

/** The bar has NO allowlist, and the empty array is the claim rather than an omission. */
const RAW_TOOLBAR_ALLOWLIST = Object.freeze([]);

/** The two `.fabricate-search` sites that are not this primitive, with their exact counts. */
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
      'writes a `.manager-tag-suggestions` list inside the label, which the primitive has no ' +
      'slot for; the open list is portalled out of the label to the application root (issue ' +
      '2157), so the label is where the source writes it and not where it renders.',
  }),
  Object.freeze({
    path: 'src/ui/svelte/apps/manager/gathering-task/GatheringTaskComponentBrowserCard.svelte',
    sites: 1,
    why:
      'The component TAG search, which writes a `.manager-tag-suggestions` list inside its label ' +
      'and swaps the glyph to `fa-tags`. Its three siblings in the task editor converted; this one ' +
      'is a typeahead combobox, which `design-system` adjudicates as not a picker, so it is an ' +
      'adjudicated opt-out rather than deferred work. The open list is portalled out of the label ' +
      'to the application root (issue 2157).',
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
  label: 'fabricate-filter-bar',
  tag: 'FilterBar',
  primitive: TOOLBAR_PATH,
  contractClass: 'fabricate-filter-bar',
  allowlist: RAW_TOOLBAR_ALLOWLIST,
  // 11 sites in 11 components as this lands. 8 is a real floor with headroom.
  callSiteFloor: 8,
  fileFloor: 8,
  detectorFixture: {
    source: detectorSource({
      contract: 'fabricate-filter-bar',
      prefixed: 'manager-toolbar-pills',
      tag: 'FilterBar',
    }),
    expected: 2,
    lowered: ['<section class="fabricate-filter-bar">', '<section class="manager-bar">'],
    loweredExpected: 1,
  },
  rawRemedy:
    'these components hand-roll the `.fabricate-filter-bar` bar that ' +
    '`src/ui/svelte/components/FilterBar.svelte` owns. Render `<FilterBar ' +
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
  label: 'fabricate-search',
  tag: 'SearchField',
  primitive: FIELD_PATH,
  contractClass: 'fabricate-search',
  allowlist: RAW_SEARCH_ALLOWLIST,
  // 34 sites in 31 components at issue 1782; the floors below keep headroom under that count.
  callSiteFloor: 14,
  fileFloor: 12,
  detectorFixture: {
    source: detectorSource({
      contract: 'fabricate-search',
      prefixed: 'manager-search-row',
      tag: 'SearchField',
    }),
    expected: 2,
    lowered: ['<section class="fabricate-search">', '<section class="manager-box">'],
    loweredExpected: 1,
  },
  rawRemedy:
    'these components hand-roll the `.fabricate-search` pill that ' +
    '`src/ui/svelte/components/SearchField.svelte` owns. Render `<SearchField ' +
    'ariaLabel={…} placeholder={…}>` instead — `density="compact"` emits `is-compact`, a bespoke class ' +
    'travels on `class`, a label hook rides the rest spread and an INPUT hook goes in ' +
    '`inputProps`. If the site is a combobox with its own suggestion list, it belongs to ' +
    '`SearchablePopover` and to the allowlist above, not to this primitive',
  valuelessRemedy:
    'write `attribute=""` instead — that renders identically on a raw element and through the ' +
    'rest spread, where a bare `data-knowledge-search` arrives as the boolean `true` and ' +
    'renders `="true"`. The same is true of an `inputProps` entry: spell its value `\'\'`',
});

/** Every call site of both primitives, tagged with the primitive it belongs to. */
const NAMED = Object.freeze([
  Object.freeze({ tag: 'FilterBar', sites: toolbar.callSites }),
  Object.freeze({ tag: 'SearchField', sites: field.callSites }),
]);

/**
 * The naming props a call site passes, present AND non-empty. `ariaLabel=""` satisfies a presence
 * check and names nothing, and an empty string is still an `aria-label` attribute, so some
 * assistive technology reports an unnamed control rather than falling through to another route.
 */
function namingRoutesOf(site, routes) {
  return routes.filter((name) => {
    const declared = site.attribute(name);
    return Boolean(declared) && !new RegExp(`^${name}=(""|''|\\{\\s*(""|''|\`\`)\\s*\\})$`).test(declared);
  });
}

test('every filter bar passes an accessible name', () => {
  // NON-VACUITY first: the floor above is asserted by the factory.
  assert.ok(toolbar.callSites.length >= 8, 'the bar has lost most of its call sites');
  const offenders = toolbar.callSites
    .filter((site) => namingRoutesOf(site, ['ariaLabel']).length === 0)
    .map((site) => `${site.file}: <FilterBar> ${site.attribute('ariaLabel') ?? 'passes no ariaLabel'}`);
  assert.deepEqual(
    offenders.sort((a, b) => a.localeCompare(b)),
    [],
    'a `<FilterBar>` without `ariaLabel` renders a `<section>` with no accessible name, which is ' +
      'not a `region` landmark at all — it disappears from the landmark list while looking ' +
      `identical, and no frame or compiler shows it:\n  ${offenders.join('\n  ')}`
  );
});

test('every search field takes exactly one naming route (issue 1782)', () => {
  assert.ok(field.callSites.length >= 14, 'the field has lost most of its call sites');
  const offenders = [];
  for (const site of field.callSites) {
    const routes = namingRoutesOf(site, ['label', 'ariaLabel', 'ariaLabelledBy']);
    if (routes.length !== 1) offenders.push(`${site.file}: <SearchField> ${routes.join(' + ') || 'no route'}`);
  }
  assert.deepEqual(
    offenders.sort((a, b) => a.localeCompare(b)),
    [],
    'a `<SearchField>` with no route renders a `<label>` wrapping a glyph and an input and no ' +
      'text, so it is announced as "search" and nothing else; with two, one name is dead text ' +
      'free to drift from the one that is read. Pass exactly one of `label`, `ariaLabel` and ' +
      `\`ariaLabelledBy\`:\n  ${offenders.join('\n  ')}`
  );
});

test('an empty literal is no naming route, quoted or as an expression', () => {
  const siteWith = (declared) => ({ attribute: (name) => (name === 'ariaLabel' ? declared : null) });
  for (const empty of ['ariaLabel=""', "ariaLabel=''", "ariaLabel={''}", 'ariaLabel={ "" }', 'ariaLabel={``}']) {
    assert.deepEqual(namingRoutesOf(siteWith(empty), ['ariaLabel']), [], empty);
  }
  assert.deepEqual(namingRoutesOf(siteWith("ariaLabel={text('x')}"), ['ariaLabel']), ['ariaLabel']);
});

test('no call site restates the class the primitive emits itself', () => {
  // Restating it would still WORK — the `class` prop APPENDS rather than replaces.
  // exactly why it needs a gate rather than a bug report: the site renders identically, the
  // token is emitted twice, and the convention this component exists to close is back.
  const offenders = [];
  for (const [{ tag, sites }, contract] of [
    [NAMED[0], 'fabricate-filter-bar'],
    [NAMED[1], 'fabricate-search'],
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

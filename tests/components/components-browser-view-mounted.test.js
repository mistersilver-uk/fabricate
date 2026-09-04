/**
 * The GM component library's group headers (issue 676).
 *
 * `ComponentsBrowserView` composes filter → sort → paginate → GROUP, so a group header
 * that reports only its bucket length says "General · 25 components" above page 1 of a
 * 282-strong General bucket — the nav, the pager and the header then disagree about the
 * same library. The header carries BOTH numbers, and the total must respect the active
 * filters, or it is a third wrong number.
 *
 * The Component Studio and the Recipe Studio must read as one product, so the sibling
 * assertions live in `recipes-browser-view-mounted.test.js` and both are fed by the same
 * shared `browserGroupCounts.js`.
 */
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import {
  COMPONENT_SCOPE_LEAF_MODULES,
  SCOPED_SHARED_COMPILED_MODULES,
} from '../helpers/componentScopeMountModules.js';
import { createComponentBrowserState } from '../../src/utils/componentBrowserModel.js';
import { buildInterleavedCategoryOrder } from '../helpers/interleavedCategoryLibrary.js';
import { describeBrowserBulkSelection } from '../helpers/browserBulkSelectionCases.js';
import { projectWorldScopeEntity as projectComponentScope } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const browser = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-components-browser-',
  // COMPOSED FROM THE SHARED TIERS (issue 1371, round 3), not spelled out again. The ten
  // component-scope leaves and the eleven design-system primitives below were literal lists here,
  // in `componentEditViewModules.js` and in two world-scope suites — four copies of one
  // arrangement, which is what SonarCloud's copy-paste detector reports and what a fifth suite
  // would copy next. A missing entry HANGS the suite (`# cancelled`) rather than failing it, so an
  // arrangement nobody can read back is the worst place for a manifest to drift.
  rawModules: [
    ...COMPONENT_SCOPE_LEAF_MODULES,
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/utils/componentCategories.js',
    'src/utils/componentBrowserModel.js',
    // componentBrowserModel imports the shared category totals; omitting it HANGS this
    // suite (`# cancelled`) rather than failing it.
    'src/utils/browserGroupCounts.js',
    // ... and, since issue 1036, the shared page-window model too. Same consequence.
    'src/utils/browserPagination.js',
    // The pure bulk selection + staging model (issue 772). The view imports it for the
    // selection helpers and its toolbar reads the description it returns.
    'src/utils/componentBulkEditModel.js',
    // Its shared leaf (issue 1010): those selection helpers now live here and
    // `componentBulkEditModel.js` re-exports them, so it is a STATIC import of that module.
    'src/utils/bulkSelectionModel.js',
  ],
  compiledModules: [
    ...SCOPED_SHARED_COMPILED_MODULES,
    // The catalogue ATTRIBUTION BANNER and the shared inherit row (issue 1371), both composed by
    // the two system-scope component screens.
    'src/ui/svelte/apps/manager/scoped/SharedDefinitionCallout.svelte',
    'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
    'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
    // The cohort filter is the shared segmented track since issue 1371's parity round 4; the
    // `<select>` it replaced needed no entry, and an omission here HANGS this suite.
    'src/ui/svelte/apps/manager/SegmentedControl.svelte',
    // The manager's ONE multi-select row (issue 772; extracted to a shared primitive under
    // `apps/manager/` for issue 1010, so this path moved out of the browser's own directory).
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/apps/manager/components/ComponentRow.svelte',
    'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte',
  ],
  componentPath: 'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte',
});

function makeComponent(overrides = {}) {
  return {
    id: overrides.id || 'c1',
    name: overrides.name || 'Iron Ore',
    description: 'A lump of ore.',
    img: 'icons/svg/item-bag.svg',
    essences: [],
    salvageSummary: { resultGroupCount: 0 },
    ...overrides
  };
}

/** A category holding more than one page, so the "of N" is actually exercised. */
function manyGeneral(count) {
  return Array.from({ length: count }, (_, index) =>
    makeComponent({
      id: `g${index + 1}`,
      // Zero-padded so name-ascending order is also numeric order.
      name: `Scrap ${String(index + 1).padStart(2, '0')}`
    })
  );
}

function countTexts(root) {
  return [...root.querySelectorAll('.fab-group-count')].map((node) => node.textContent.trim());
}

/** [category, countText] per rendered group, in DOM order, for the current page. */
function groupsOnPage(root) {
  return [...root.querySelectorAll('[data-component-group]')].map((section) => [
    section.dataset.componentGroup,
    section.querySelector('.fab-group-count').textContent.trim(),
  ]);
}

/**
 * A multi-category library whose row NAMES are assigned round-robin across the
 * categories, so a global name sort (the pre-issue-801 paginate-then-group order)
 * SCATTERS each category across every page. Only category-major ordering makes a category
 * contiguous — so this fixture is what binds the view's `categoryMajor` wiring.
 */
function interleavedLibrary(plan) {
  return buildInterleavedCategoryOrder(plan).map((category, index) =>
    makeComponent({
      id: `c${index}`,
      name: `Item ${String(index + 1).padStart(2, '0')}`,
      // `general` is the reserved catch-all — leave the category off to land there.
      category: category === 'general' ? undefined : category,
    })
  );
}

before(async () => {
  await browser.setup();
});
after(() => {
  browser.teardown();
});
afterEach(() => {
  browser.remount();
});

describe('ComponentsBrowserView group headers (issue 676)', () => {
  it('pairs the rendered count with the category total when the group spans pages', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(30) });

    assert.equal(root.querySelectorAll('.manager-component-row').length, 25, 'the default page holds 25');
    // A BARE NUMERAL since issue 1371's parity round 4 (`proto:1073`, gap-list row 107): the
    // reference draws the folder glyph, the category name and a mono count, and the noun is the
    // band's whole subject. The `of` form survives for the one case that needs it — a category
    // spanning a page boundary would otherwise report the slice as the whole bucket.
    assert.deepEqual(
      countTexts(root),
      ['25 of 30'],
      'the header must not say the General bucket holds 25'
    );
    // The pager and the header now agree about the same library, in the sentence the reference
    // writes for the in-system cohort (`proto:1069`).
    assert.equal(
      root.querySelector('[data-component-count]').textContent.trim(),
      '25 of 30 catalogue entries'
    );
  });

  it('says it once when the group is shown WHOLE', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(3) });
    assert.deepEqual(countTexts(root), ['3'], 'not "3 of 3", and not "3 components"');
  });

  it('handles the singular — a bare "1" whole, "1 of N" paged', async () => {
    // The plural agreement this case was written for is GONE with the noun: a bare numeral has
    // no singular branch to get wrong. What survives is the distinction the case really pins —
    // a group shown whole says one number, a group spanning a boundary says two.
    const root = await browser.mount({ itemCards: manyGeneral(1) });
    assert.deepEqual(countTexts(root), ['1'], 'a whole group says its size and nothing else');

    browser.remount();
    const paged = await browser.mount({ itemCards: manyGeneral(26) });
    const size = paged.querySelector('[data-pagination-size]');
    size.value = '25';
    size.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    paged.querySelector('[data-pagination-next]').click();
    flushSync();

    assert.equal(paged.querySelectorAll('.manager-component-row').length, 1, 'page 2 holds one row');
    assert.deepEqual(countTexts(paged), ['1 of 26'], 'a continuation page still says both numbers');
  });

  it('counts the total over the FILTERED rows, so an active filter is respected', async () => {
    const rows = [
      ...manyGeneral(2),
      makeComponent({ id: 'm1', name: 'Copper Ore', category: 'Metal' }),
      makeComponent({ id: 'm2', name: 'Tin Ore', category: 'Metal' })
    ];
    const root = await browser.mount({ itemCards: rows, categoryVocabulary: ['Metal'] });
    assert.deepEqual(countTexts(root), ['2', '2'], 'Metal then general');

    const categoryFilter = root.querySelector('[data-component-category-filter]');
    categoryFilter.value = 'Metal';
    categoryFilter.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();

    assert.deepEqual(
      countTexts(root),
      ['2'],
      'a total that counted the unfiltered roster would report the whole library here'
    );
  });
});

// Issue 806 — the editor round-trip. Opening a component editor UNMOUNTS this browser and
// returning REMOUNTS it. The system-change reset must fire on a genuine SYSTEM SWITCH
// only, so the sentinel lives on the persisted `browserState` (`ui.systemId`), not in
// component-local `$state` that reset to '' on every mount (the bug). These tests cross a
// real remount with a NON-EMPTY `selectedSystemId` and mutate the view-state — including
// the ESSENCE filter — AFTER the first mount, so they FAIL on revert rather than passing
// vacuously.
describe('ComponentsBrowserView editor round-trip (issue 806)', () => {
  function metalWithFireLibrary() {
    // 15 Metal (each carrying a Fire essence) + 5 Herb, so a page-2 (pageSize 10) filter
    // by BOTH category=Metal AND essence=Fire is a real, non-empty page.
    const rows = [];
    for (let i = 0; i < 15; i += 1) {
      rows.push(
        makeComponent({
          id: `m${i}`,
          name: `Metal ${String(i + 1).padStart(2, '0')}`,
          category: 'Metal',
          essences: [{ id: 'fire', name: 'Fire', quantity: 1 }]
        })
      );
    }
    for (let i = 0; i < 5; i += 1) {
      rows.push(makeComponent({ id: `h${i}`, name: `Herb ${String(i + 1).padStart(2, '0')}`, category: 'Herb' }));
    }
    return rows;
  }

  it('preserves page, category filter, essence filter and collapse across an editor round-trip', async () => {
    const shared = createComponentBrowserState();
    const itemCards = metalWithFireLibrary();

    await browser.mount({ itemCards, categoryVocabulary: ['Metal', 'Herb'], selectedSystemId: 'sys-1', browserState: shared });
    assert.equal(shared.systemId, 'sys-1', 'the first mount stamps the persisted system sentinel');

    shared.categoryFilter = 'Metal';
    shared.essenceFilter = 'Fire';
    shared.pageSize = 10;
    shared.pageIndex = 1;
    shared.sortKey = 'salvage';

    browser.remount();
    await browser.mount({ itemCards, categoryVocabulary: ['Metal', 'Herb'], selectedSystemId: 'sys-1', browserState: shared });

    assert.equal(shared.categoryFilter, 'Metal', 'the category filter survives the round-trip');
    assert.equal(shared.essenceFilter, 'Fire', 'the essence filter survives the round-trip');
    assert.equal(shared.pageIndex, 1, 'the page survives the round-trip');
    assert.equal(shared.sortKey, 'salvage', 'the sort key is a preference and is untouched');
  });

  it('resets category, essence, page and collapse on a genuine system switch, keeping sort/group', async () => {
    const shared = createComponentBrowserState();
    const itemCards = metalWithFireLibrary();

    await browser.mount({ itemCards, categoryVocabulary: ['Metal', 'Herb'], selectedSystemId: 'sys-1', browserState: shared });

    // Default page size keeps the 20-row library on one page, so the page index reads 0
    // deterministically: the plain-object `browserState` (not a `$state` proxy) cannot
    // drive the non-reactive `model` to recompute after the reset effect, so a smaller
    // page size would let the page-sync effect memoize a stale non-zero page. The app uses
    // a real proxy; page preservation on a same-system return is proven above.
    shared.categoryFilter = 'Metal';
    shared.essenceFilter = 'Fire';
    shared.pageIndex = 1;
    shared.collapsedCategories = new Set(['Metal']);
    shared.sortKey = 'salvage';
    shared.groupByCategory = false;

    browser.remount();
    await browser.mount({ itemCards, categoryVocabulary: ['Metal', 'Herb'], selectedSystemId: 'sys-2', browserState: shared });

    assert.equal(shared.categoryFilter, 'all', 'a switch clears the vocabulary-scoped category filter');
    assert.equal(shared.essenceFilter, 'all', 'a switch clears the essence filter too');
    assert.equal(shared.pageIndex, 0, 'a switch returns to the first page');
    // THE COLLAPSE SET IS NO LONGER THIS SCREEN'S (issue 1371, parity round 4; gap-list row 107).
    // The reference's group band draws no chevron and is not a button, so `collapsible={false}`
    // means nothing on this list collapses and nothing here writes that field. It is left on the
    // lifted state untouched — `createComponentBrowserState` still mints it and the Recipe Studio
    // still uses its own — rather than cleared, which would be this screen reaching into a field
    // it no longer owns.
    assert.equal(
      shared.collapsedCategories.has('Metal'),
      true,
      'a screen that no longer collapses must not write the collapse set either'
    );
    assert.equal(shared.systemId, 'sys-2', 'the persisted sentinel advances to the new system');
    assert.equal(shared.sortKey, 'salvage', 'sort key is a cross-system preference and is kept');
    assert.equal(shared.groupByCategory, false, 'group-by-category is a cross-system preference and is kept');
  });
});

// Issue 801 — the LOAD-BEARING components contiguity proof. The util test can only show
// `sortComponents({categoryMajor:true})` yields a flat category-major order; it cannot
// bind the view (which could pass `categoryMajor:false` and still pass the util test).
// This drives the real view: a category larger than the page must render contiguously
// across the boundary, reading "N of M" on the filling page AND the continuation page.
describe('ComponentsBrowserView category-major grouped pagination (issue 801)', () => {
  it('renders each category contiguously across a page boundary, N of M on both sides', async () => {
    // Herb (6) · Metal (12, the boundary-spanning bucket) · general (4) = 22 rows.
    const root = await browser.mount({
      itemCards: interleavedLibrary([
        ['Herb', 6],
        ['Metal', 12],
        ['general', 4],
      ]),
      categoryVocabulary: ['Herb', 'Metal'],
    });

    // Shrink the page to 10 so Metal (12) must span two pages.
    const size = root.querySelector('[data-pagination-size]');
    size.value = '10';
    size.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();

    // Page 1: the whole Herb bucket, then the first slice of Metal — NOT an interleaved
    // Herb/Metal/general alphabetical slice, which is what the pre-801 order produced.
    assert.equal(root.querySelectorAll('.manager-component-row').length, 10, 'page 1 holds ten');
    assert.deepEqual(groupsOnPage(root), [
      ['Herb', '6'],
      ['Metal', '4 of 12'],
    ]);

    // Page 2: Metal CONTINUES contiguously (its remaining 8), then general begins. Metal's
    // header reads "N of M" on this continuation page too, and no Metal rows are stranded
    // on any non-adjacent page.
    root.querySelector('[data-pagination-next]').click();
    flushSync();
    assert.deepEqual(groupsOnPage(root), [
      ['Metal', '8 of 12'],
      ['general', '2 of 4'],
    ]);

    // Page 3: general finishes; Metal never reappears (contiguity across the boundary).
    root.querySelector('[data-pagination-next]').click();
    flushSync();
    assert.deepEqual(groupsOnPage(root), [['general', '2 of 4']]);
  });
});

// Issue 772 — the multi-select. The rendered-rows control and the whole-results action are
// DISTINCT operations and these cases keep them distinct, because conflating them is the
// defect: a collapsed group's rows are not rendered, so the page control must never reach
// them while the results link must.
//
// Issue 1010 lifted the seven cases into `tests/helpers/browserBulkSelectionCases.js` and the
// Recipe Studio joined them there. They are stated ONCE and instantiated per studio, because
// both browsers render the same `BulkSelectionToolbar` over the same `bulkSelectionModel.js`
// — one contract, two consumers. Keeping a literal copy here as well would leave the contract
// single-sourced in name only: a case tightened on one studio and not the other is exactly the
// per-studio drift the extraction exists to prevent, and it is also the near-identical
// assertion block SonarCloud's new-code duplication gate counts (it analyses `tests/**` and
// ignores `cpd.exclusions`).
//
// Issue 924's focus-ring contract used to be asserted here too, against this view's rendered
// toolbar. It belongs to the primitive rather than to one of its two consumers, so it
// RELOCATED — unchanged in substance and widened in strength — to
// `tests/components/bulk-selection-toolbar-mounted.test.js`, which owns both the adjacency
// case and the drift assertion over the class tokens inside the toolbar's `:global()`.
// Do not re-add a per-studio copy of either; the primitive is what both studios render.
describeBrowserBulkSelection({
  label: 'ComponentsBrowserView',
  prefix: 'component',
  rowClass: 'manager-component-row',
  rowIdKey: 'componentId',
  selectionKey: 'bulkSelectedComponentIds',
  rowsProp: 'itemCards',
  harness: browser,
  createBrowserState: createComponentBrowserState,
  // `manyGeneral` zero-pads its names, so name-ascending order is also numeric order — which
  // is what makes `flatId(1)` reliably the first row of page 1.
  makeFlatRows: (count) => manyGeneral(count),
  flatId: (index) => `g${index}`,
  // NO `makeGroupedRows` / `grouped` SINCE ISSUE 1371's PARITY ROUND 4. The shared collapsed-group
  // case drives a category's REAL header button, and this screen's band is no longer a button:
  // the reference draws no chevron on it (gap-list row 107), so `collapsible={false}` leaves
  // nothing on this list to collapse. The helper's own contract covers this — a studio with no
  // grouping axis takes the flat branch, where the page box must still reach exactly the rendered
  // rows and no more — and the Recipe Studio still exercises the collapsed branch.
  //
  // The grouped `pageIds` branch is NOT lost with it: `reaches every rendered row with grouping
  // on` below drives it directly.
  props: (itemCards, extra = {}) => ({
    itemCards,
    // Derived from the rows rather than hard-coded, because the same `props` builds both the
    // flat fixtures (which carry no category and must land in the reserved `general` bucket,
    // vocabulary empty) and the grouped one (which must offer both categories or the grouped
    // branch of `pageIds` is never exercised).
    categoryVocabulary: [...new Set(itemCards.map((item) => item.category).filter(Boolean))],
    ...extra
  }),
  rowControls: {
    scope: '.manager-action-group',
    count: 1,
    why: 'the row still carries exactly ONE action — a labelled `Edit rules ↗` since parity round 4'
  }
});

// The grouped `pageIds` branch, which the shared cases stopped reaching when this screen's group
// band stopped being a control. It is the branch that decides which rows the tri-state page box
// acts on, so it needs a driver of its own rather than a comment saying grouping is on by default.
describe('ComponentsBrowserView grouped page selection (issue 1371)', () => {
  it('reaches every rendered row with grouping on, across both categories', async () => {
    const root = await browser.mount({
      itemCards: [
        makeComponent({ id: 'm1', name: 'Copper Ore', category: 'Metal' }),
        makeComponent({ id: 'm2', name: 'Tin Ore', category: 'Metal' }),
        makeComponent({ id: 'h1', name: 'Sage', category: 'Herb' }),
      ],
      categoryVocabulary: ['Metal', 'Herb'],
    });

    assert.equal(
      root.querySelectorAll('[data-component-group]').length,
      2,
      'grouping is on, so `pageIds` takes its grouped branch rather than the flat page list'
    );

    root.querySelector('[data-component-select-all-page]').click();
    flushSync();

    assert.deepEqual(
      [...root.querySelectorAll('.manager-component-row.is-bulk-selected')]
        .map((row) => row.dataset.componentId)
        .sort(),
      ['h1', 'm1', 'm2'],
      'every rendered row across every group, which is what the grouped branch flattens'
    );
  });
});

// Issue 772, acceptance 13 (row half). The badge used to gate on the CRAFTING resolution
// mode alone, so on a salvage-only or gathering-only progressive system the bulk panel
// would have offered a Progressive DC control whose result NO row could display. Nothing
// asserted the badge's absence before, so the re-gate breaks no test — and gains none
// unless these two cases are stated.
describe('ComponentsBrowserView progressive DC badge re-gate (issue 772)', () => {
  const withDifficulty = [makeComponent({ id: 'd1', name: 'Brass Casing', difficulty: 8 })];

  it('renders the row DC badge on a system progressive for SALVAGE only', async () => {
    const root = await browser.mount({
      itemCards: withDifficulty,
      selectedSystemResolutionMode: 'simple',
      difficultyAxisProgressive: true
    });

    const badge = root.querySelector('[data-component-id="d1"] [data-component-difficulty]');
    assert.ok(Boolean(badge), 'the row badge follows the shared three-axis predicate');
    assert.match(badge.textContent, /8/, 'and shows the authored value');
  });

  it('omits the badge when no axis is progressive, whatever the crafting mode says', async () => {
    const root = await browser.mount({
      itemCards: withDifficulty,
      selectedSystemResolutionMode: 'progressive',
      difficultyAxisProgressive: false
    });

    assert.ok(
      !root.querySelector('[data-component-id="d1"] [data-component-difficulty]'),
      'the badge reads ONE predicate — an unforwarded prop must not fall back to the old axis'
    );
  });
});

/**
 * The hydration REQUEST (issue 1081).
 *
 * Since issue 1081 a component card arrives cheap and resolves its linked source document —
 * the "Missing" verdict and the live description fallback — only when something asks it to.
 * `hydrateItemCards` is pinned by the projection suites, but the wiring that must CALL it is
 * a render effect in this component, and deleting that effect outright left every one of
 * those suites green: what is proven there is the helper, not that anything invokes it.
 *
 * Asserted through a spy on the card rather than a real projection, because the claim is
 * about WHICH cards the view asks for — exactly the ones it renders — and the view reaches
 * them through `card.hydrate()` off the published object.
 */
describe('ComponentsBrowserView hydration is scoped to the rendered page (issue 1081)', () => {
  /** Cards carrying a non-enumerable `hydrate` spy, exactly as the projection defines it. */
  function spyLibrary(count, requested) {
    return manyGeneral(count).map((card) => {
      Object.defineProperty(card, 'hydrate', {
        enumerable: false,
        configurable: true,
        value: () => {
          requested.add(card.id);
          return Promise.resolve(card);
        },
      });
      return card;
    });
  }

  it('asks the rendered page to hydrate, asks nothing off it, and asks page 2 on a page turn', async () => {
    const requested = new Set();
    const cards = spyLibrary(30, requested);
    const root = await browser.mount({ itemCards: cards });

    assert.equal(root.querySelectorAll('.manager-component-row').length, 25, 'page 1 holds 25');
    assert.deepEqual(
      [...requested].sort(),
      cards.slice(0, 25).map((card) => card.id).sort(),
      'the browser asked exactly the page it rendered'
    );
    // The negative half stated against the same set: the five off-page cards cost nothing,
    // which is the whole point of scoping the request to the page.
    assert.equal(
      cards.slice(25).some((card) => requested.has(card.id)),
      false,
      'and asked nothing off the page'
    );

    // POSITIVE CONTROL, same fixture, same spy: turning the page is what asks for the rest.
    const size = root.querySelector('[data-pagination-size]');
    size.value = '25';
    size.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    root.querySelector('[data-pagination-next]').click();
    flushSync();

    assert.deepEqual(
      [...requested].sort(),
      cards.map((card) => card.id).sort(),
      'the tail is reachable — the bound is page scope, not a dropped tail'
    );
  });

  it('renders a card with no `hydrate` at all, so an isolated fixture is not a crash', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(3) });
    assert.equal(root.querySelectorAll('.manager-component-row').length, 3);
  });
});

// -- THE WIDENED MEMBERSHIP COHORT (issue 1371) -----------------------------------------------
//
// The one route in the product to adopt a world component into a crafting system, and the state
// that made the sibling Tool Rules list ship it unreachable: three places asked "is there anything
// on this screen" and all three answered with the RAW `itemCards` prop, while the counts, the
// list, the pager and the result summary were all computed over the widened cohort. For a system
// that has adopted nothing the two disagree the moment the segment moves - the toolbar reads three
// rows over a body drawing the zero state, because `itemCards.length === 0` is true and stays true
// whatever the segment says.
//
// SO THE CRITERION IS THE COHORT'S ZERO POINT, not a populated library. On a populated one the
// gate and the cohort agree and the defect is invisible.
describe('ComponentsBrowserView world cohort (issue 1371)', () => {
  const WORLD_SYSTEMS = [{ id: 'sys-1', name: 'Forge' }];

  /** Three world components, NONE of which this system has a record for. */
  function ghostScope() {
    return projectComponentScope({
      entityType: 'component',
      corpus: {
        entities: [
          { id: 'w-1', name: 'Wildwood Resin', originItemUuid: 'Item.resin' },
          { id: 'w-2', name: 'Unbound Salt' },
          { id: 'w-3', name: 'Ash Glass', originItemUuid: 'Item.glass' },
        ],
        defaults: [],
        membership: [],
      },
      systems: WORLD_SYSTEMS,
    });
  }

  /** How the cohort switch is thrown, now that it is a segmented track rather than a select. */
  function widen(root) {
    root.querySelector('[data-component-membership-option="all"] input').click();
    flushSync();
  }

  it('counts each cohort on its own segment, in the mono badge', async () => {
    // THE CONTROL IS A TWO-SEGMENT TRACK since issue 1371's parity round 4 (gap-list row 145).
    // The `<select>` it replaced carried a third option, `Overriding`, that the reference draws
    // nowhere: it was a PREDICATE over the member cohort rather than a cohort of its own, which
    // is why it alone could carry no count.
    const root = await browser.mount({
      itemCards: [],
      scope: ghostScope(),
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
    });
    const options = [...root.querySelectorAll('[data-component-membership-option]')];
    assert.deepEqual(
      options.map((option) => option.getAttribute('data-component-membership-option')),
      ['in', 'all'],
      'two segments and no third: `Overriding` has no counterpart in the reference'
    );
    assert.deepEqual(
      options.map((option) => option.querySelector('.manager-segment-label').textContent.trim()),
      ['In this system', 'All world components'],
      'the count is the segment badge, not part of its label'
    );
    assert.deepEqual(
      options.map((option) => option.querySelector('[data-segment-badge]').textContent.trim()),
      ['0', '3'],
      'each segment carries its own count, so the widened set is legible before it is chosen'
    );
  });

  it('renders three ghost rows and NOT the zero state once the segment widens', async () => {
    const root = await browser.mount({
      itemCards: [],
      scope: ghostScope(),
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
    });
    // THE ZERO STATE FIRST, so the assertion below is a change rather than a state that was
    // always true.
    assert.equal(root.querySelectorAll('[data-component-member="false"]').length, 0);

    widen(root);

    assert.equal(
      root.querySelectorAll('[data-component-member="false"]').length,
      3,
      'the widened cohort renders, rather than being derived, counted and then discarded by one ' +
        'boolean read off the raw prop'
    );
    assert.ok(
      !root.querySelector('.manager-empty-state'),
      'and the zero state is gone: a body drawing it under a toolbar counting three rows is the ' +
        'exact defect this gate exists to prevent'
    );
  });

  it('draws a ghost as the SAME row, dimmed and stated', async () => {
    // Gap-list row 146. The ghost used to be a two-line stub — name, "No rules in this system
    // yet", and a filled green `+ Add`. The reference keeps every part of the member row and
    // states the difference, so each of these five is a part the stub had dropped.
    const root = await browser.mount({
      itemCards: [],
      scope: ghostScope(),
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
    });
    widen(root);

    const row = root.querySelector('[data-component-id="w-1"]');
    assert.ok(Boolean(row), 'the ghost row renders');
    assert.equal(row.dataset.componentMember, 'false');
    assert.ok(row.classList.contains('is-ghost'), 'and reads as the dimmed cohort');
    assert.ok(Boolean(row.querySelector('.fab-medallion')), 'the medallion stays');
    assert.equal(
      row.querySelector('[data-status-pill]').textContent.trim(),
      'Not in this system',
      'the name line states the membership fact rather than a salvage state it cannot have'
    );
    assert.equal(
      row.querySelector('[data-component-recipes]').getAttribute('data-component-recipes'),
      '\u2014',
      'the Recipes column stays and answers with an em dash rather than being dropped'
    );
    assert.ok(
      !row.querySelector('.manager-component-essence-dots'),
      'and it states NO behaviour: this system has authored no essence contribution for it'
    );

    const add = row.querySelector('[data-component-ghost-add="w-1"]');
    assert.ok(Boolean(add), 'its one control is the adoption verb');
    assert.ok(
      add.classList.contains('is-dashed'),
      'DASHED, not the filled green primary that shipped: adopting is an offer, not the row primary'
    );
    assert.ok(
      !row.querySelector('[data-component-select]'),
      'and it carries no bulk box: the prune effect drops every id this system has no component ' +
        'for, so a box here would be untickable in practice'
    );
  });

  it('adoption forwards addToSystem, which is the COMPOSED verb under that key', async () => {
    // The published component family replaces the generic membership-only verb under this key,
    // so this one call writes the membership record AND the in-system record the read union's row
    // set is built from. This proves the WIRE; the composition itself is pinned on the store.
    const calls = [];
    const root = await browser.mount({
      itemCards: [],
      scope: ghostScope(),
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
      actions: { addToSystem: (...args) => calls.push(args) },
    });
    widen(root);

    root.querySelector('[data-component-ghost-add="w-2"]').click();
    flushSync();

    assert.deepEqual(calls, [['w-2', 'sys-1']]);
  });

  it('states the cohort each sentence is true of, and never the other', async () => {
    // Gap-list rows 106 and 145. The count read `1-23 of 23 · 44 not in this system` — one range
    // over the MEMBER page beside a second number about a different cohort. The reference writes
    // one sentence per cohort: `{shown} of {total} catalogue entries` in this system, and
    // `{shown} shown · {mine} of {all} in this system` once the corpus is widened.
    const root = await browser.mount({
      itemCards: [makeComponent({ id: 'own', name: 'Bloom Ash' })],
      scope: ghostScope(),
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
    });
    const count = () => root.querySelector('[data-component-count]').textContent.trim();

    assert.equal(count(), '1 of 1 catalogue entries', 'in-system: the library and nothing else');

    widen(root);
    assert.equal(
      count(),
      '4 shown · 1 of 4 in this system',
      'widened: the rows on screen, then how many of the corpus this system actually holds'
    );
  });
});

// ── WHAT THE LIST HEAD NO LONGER DRAWS (issue 1371, parity round 4) ──────────────────────────
//
// Gap-list rows 101 and 105. This pane opened with a `SharedDefinitionCallout` — the component's
// name, a `World definition` pill and an `Edit shared definition` exit — and a centred
// `N inherit the world category · M override it` line. The reference draws that callout on the
// rules EDITOR only, and puts its content on THIS screen in the inspector's `Shared identity`
// card; the summary line has no counterpart anywhere. A card in the wrong screen is the exact
// class the parity inventory exists to name, so its ABSENCE here is the assertion.
//
// This is a removal, so it needs a positive control beside it or it passes on an empty tree: the
// fixture below is the one the round-2 suite used to prove the banner PRESENT — a real member
// scope with a selected component — and the rows it produces are asserted to render.
describe('ComponentsBrowserView list head (issue 1371, parity round 4)', () => {
  const SYSTEMS = [{ id: 'sys-1', name: 'Forge' }];

  function memberScope() {
    return projectComponentScope({
      entityType: 'component',
      corpus: {
        entities: [
          { id: 'c-inherit', name: 'Iron Ingot', originItemUuid: 'Item.ingot' },
          { id: 'c-override', name: 'Coal', originItemUuid: 'Item.coal' },
        ],
        defaults: [{ id: 'c-inherit', category: 'Refined' }],
        membership: [
          { entityId: 'c-inherit', systemId: 'sys-1', inherit: { category: true } },
          { entityId: 'c-override', systemId: 'sys-1', inherit: { category: false } },
        ],
      },
      systems: SYSTEMS,
    });
  }

  const CARDS = [
    makeComponent({ id: 'c-inherit', name: 'Iron Ingot', category: 'Refined' }),
    makeComponent({ id: 'c-override', name: 'Coal', category: 'Raw' }),
  ];

  it('draws neither the shared-definition callout nor the inherit summary', async () => {
    const root = await browser.mount({
      itemCards: CARDS,
      scope: memberScope(),
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
      selectedComponentId: 'c-inherit',
    });

    // THE POSITIVE CONTROL: the same fixture that used to render the banner still renders rows,
    // so the two absences below are a change rather than an empty tree.
    assert.equal(root.querySelectorAll('.manager-component-row').length, 2, 'the rows still draw');

    assert.ok(
      !root.querySelector('[data-scoped-shared-definition]'),
      'the callout belongs to the rules editor and to this screen INSPECTOR, not to the list pane'
    );
    assert.ok(
      !root.querySelector('[data-component-inherit-summary]'),
      'and the inherit summary has no counterpart in the reference at all'
    );
  });

  it('keeps the drop zone, which is the one licensed subject-only card here', async () => {
    // Maintainer ruling M2, "KEEP the system-scope one". Stated so the removals above cannot be
    // widened into it by a later sweep.
    const root = await browser.mount({ itemCards: CARDS, dropEnabled: true });
    assert.ok(Boolean(root.querySelector('.manager-component-drop-zone')));
  });
});

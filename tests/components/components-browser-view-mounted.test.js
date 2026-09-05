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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  componentScopeFor,
  createComponentScopeHarness,
  createComponentsBrowserViewHarness,
} from '../helpers/componentScopeMountModules.js';
import { createComponentBrowserState } from '../../src/utils/componentBrowserModel.js';
import { buildInterleavedCategoryOrder } from '../helpers/interleavedCategoryLibrary.js';
import { describeBrowserBulkSelection } from '../helpers/browserBulkSelectionCases.js';
import { projectWorldScopeEntity as projectComponentScope } from '../../src/ui/svelte/stores/worldScopeProjection.js';

const repoRoot = resolve(import.meta.dirname, '../..');

// ONE MANIFEST FOR THE TWO SUITES THAT MOUNT THIS VIEW (issue 1371 r16-list): the module list
// that used to sit here is `createComponentsBrowserViewHarness`'s now, so the rendered toolbar
// geometry suite reads the same arrangement rather than a second copy of it.
const { harness: browser } = createComponentsBrowserViewHarness({
  repoRoot,
  tmpPrefix: 'fabricate-components-browser-',
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

  /**
   * A world corpus of `count` records, NONE of which this system has a record for.
   *
   * A parameterised sibling of `ghostScope()` above rather than a widening of it: every existing
   * assertion in this block is written against those three named records, and the paging
   * assertions need a cohort that spans a page boundary. Zero-padded names so the list order is
   * also numeric order.
   */
  function wideGhostScope(count) {
    return projectComponentScope({
      entityType: 'component',
      corpus: {
        entities: Array.from({ length: count }, (_, index) => ({
          id: `wg-${String(index + 1).padStart(2, '0')}`,
          name: `World Record ${String(index + 1).padStart(2, '0')}`,
        })),
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

  it("a ghost's identity opens the world catalogue entry, not an in-system selection", async () => {
    // `onSelectComponent` writes `selectedComponentId`, which the inspector resolves against THIS
    // SYSTEM's row set — and a ghost has no row there by definition. Wiring the ghost's identity
    // to it EMPTIED the inspector: whatever was selected vanished and nothing replaced it, so the
    // click read as a control that visibly does nothing. The world catalogue entry is where that
    // record's name, art and description are authored, so it is the destination the click implied.
    //
    // BOTH props are passed, and both are asserted, because the defect is not "nothing happens" —
    // it is "the WRONG one fires". A test that only watched the navigation would stay green if the
    // selection fired alongside it and emptied the panel anyway.
    const opened = [];
    const selected = [];
    const root = await browser.mount({
      itemCards: [],
      scope: ghostScope(),
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
      onOpenWorldEntry: (...args) => opened.push(args),
      onSelectComponent: (...args) => selected.push(args),
    });
    widen(root);

    root.querySelector('[data-component-id="w-2"] .manager-component-identity').click();
    flushSync();

    assert.deepEqual(
      opened,
      [['world-component-entry', 'w-2']],
      'the ROUTE TOKEN travels with the id: the token is the half that decides whether the ' +
        'navigation resolves, and a page cannot route'
    );
    assert.deepEqual(selected, [], 'and the in-system selection is NOT also written');
  });

  it("a MEMBER's identity still selects it in this system", async () => {
    // The positive control for the test above. Without it, deleting the member branch's
    // `onSelect: onSelectComponent` — or wiring every row to the navigation — passes.
    //
    // MOUNTED WITH THE ROW ALREADY SELECTED (issue 1371 r13-list, M14): the list now selects its
    // first drawn row on open when nothing is, and that push would land in `selected` before the
    // click below did. Naming the row as selected keeps the recorder's one entry the CLICK's.
    const opened = [];
    const selected = [];
    const root = await browser.mount({
      itemCards: [makeComponent({ id: 'own', name: 'Bloom Ash' })],
      scope: ghostScope(),
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
      selectedComponentId: 'own',
      onOpenWorldEntry: (...args) => opened.push(args),
      onSelectComponent: (...args) => selected.push(args),
    });

    root.querySelector('[data-component-id="own"] .manager-component-identity').click();
    flushSync();

    assert.deepEqual(selected, [['own']], 'a member row selects, because it HAS a row to select');
    assert.deepEqual(opened, [], 'and does not navigate away from the list to do it');
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

  it('pages the GHOST half through the same window, so the pager and the body agree', async () => {
    // Reviewer finding 4. The ghost list used to render OUTSIDE the paginated `{#each}` while
    // `Pagination` was fed the member count alone: on a world with a large component corpus and a
    // system holding a few, the widened cohort drew every remaining world component in one column
    // beneath a pager reading `1–10 of 8`. Both halves of that are defects — an unbounded column,
    // and a count describing a different list from the one under it.
    //
    // THE FIXTURE IS BIGGER THAN ONE PAGE ON PURPOSE. AC-8's three-ghost fixture cannot see this:
    // at three ghosts under a 25-row page the unpaginated list and the correct one are the same
    // list, which is why four gate runs passed over it.
    const root = await browser.mount({
      itemCards: manyGeneral(8),
      scope: wideGhostScope(5),
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
    });
    widen(root);
    const size = root.querySelector('[data-pagination-size]');
    size.value = '10';
    size.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();

    const memberRows = () => root.querySelectorAll('[data-component-member="true"]').length;
    const ghostRows = () => root.querySelectorAll('[data-component-member="false"]').length;
    const summary = () => root.querySelector('[data-pagination-summary]').textContent.trim();

    assert.equal(summary(), 'Showing 1–10 of 13', 'the pager counts BOTH halves of the cohort');
    assert.equal(memberRows(), 8, 'page one holds every member');
    assert.equal(ghostRows(), 2, '…and exactly the two ghosts the window has room for');

    root.querySelector('[data-pagination-next]').click();
    flushSync();

    assert.equal(summary(), 'Showing 11–13 of 13');
    assert.equal(memberRows(), 0, 'page two is past the members entirely');
    assert.equal(
      ghostRows(),
      3,
      'and holds the REST of the ghost cohort — a member page clamped back into range would ' +
        'redraw the last member page here instead'
    );
  });

  it('and the toolbar count states the WINDOW, not the whole widened cohort', async () => {
    // The count reads `{shown} shown · {mine} of {all} in this system`. `shown` is what is on
    // screen, so it has to move with the page; `mine` and `all` are cohort totals and must not.
    const root = await browser.mount({
      itemCards: manyGeneral(8),
      scope: wideGhostScope(5),
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
    });
    widen(root);
    const size = root.querySelector('[data-pagination-size]');
    size.value = '10';
    size.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    const count = () => root.querySelector('[data-component-count]').textContent.trim();

    assert.equal(count(), '10 shown · 8 of 13 in this system');
    root.querySelector('[data-pagination-next]').click();
    flushSync();
    assert.equal(count(), '3 shown · 8 of 13 in this system');
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

// ── C7. THE SYSTEM RULES LIST'S INSPECTOR (issue 1371, parity round 4) ────────────────────────
//
// `proto:1247-1275`, gap-list rows 117-123. The panel that shipped was a name, two stat tiles, a
// source register and a FOUR-BUTTON stack; the reference draws a kicker, one identity line whose
// subline states both numbers, four named blocks and a PINNED foot carrying one primary, with the
// remaining commands behind a kebab. Every claim below is a part that anatomy either gained or
// lost, and the panel had no mounted coverage at all before this suite.
//
// A SECOND HARNESS in this file rather than a second file: the inspector is this browser's
// inspector — it is mounted by the shell into the same route — and `createComponentScopeHarness`
// is the shared factory precisely so a second suite does not restate the manifest.
const inspector = createComponentScopeHarness({
  repoRoot,
  tmpPrefix: 'fabricate-component-inspector-',
  componentPath: 'src/ui/svelte/apps/manager/components/ComponentBrowserInspector.svelte',
  // The overlay closure the kebab binds, and the category vocabulary the `Category` block reads.
  // An omission here HANGS the suite (`# cancelled`) rather than failing it.
  rawExtras: [...SEARCHABLE_POPOVER_RAW_MODULES, 'src/ui/svelte/util/actionMenuLayout.js'],
  compiledExtras: [
    'src/ui/svelte/components/ActionMenu.svelte',
    'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
  ],
});

describe('ComponentBrowserInspector — the reference anatomy (issue 1371, parity round 4)', () => {
  before(async () => {
    await inspector.setup();
  });
  after(() => {
    inspector.teardown();
  });
  afterEach(() => {
    inspector.remount();
  });

  const SCOPE = componentScopeFor();

  function entry(id) {
    return SCOPE.entries.find((candidate) => candidate.id === id) ?? null;
  }

  function systemRow(id, systemId) {
    return (entry(id)?.systems ?? []).find((row) => row?.systemId === systemId) ?? null;
  }

  /** The selected row as the read union hands it over: identity plus this system's own answers. */
  function selectedCoal(overrides = {}) {
    return {
      id: 'coal',
      name: 'Coal',
      img: 'icons/commodities/materials/coal.webp',
      category: 'Raw',
      tags: ['sooty'],
      essences: [{ id: 'fire', name: 'Fire', quantity: 2 }],
      hasRegisteredItemUuid: true,
      registeredItemUuidDisplay: 'Item.coal-source',
      salvageSummary: { resultCount: 2 },
      difficulty: 17,
      ...overrides,
    };
  }

  async function mountCoal(props = {}) {
    return inspector.mount({
      selectedComponent: selectedCoal(),
      showTags: true,
      worldEntry: entry('coal'),
      worldSystemRow: systemRow('coal', 'sys-forge'),
      systemName: 'Forge',
      salvageFeatureEnabled: true,
      salvageModeLabel: 'Progressive',
      ...props,
    });
  }

  it('opens on the kicker and ONE identity line, not on a pair of stat tiles', async () => {
    // Gap-list rows 117 and 118. There was no kicker, the name read at 21.6px/700, and the two
    // numbers the subline states were also drawn as `1 Tags` / `1 Essences` tiles beside it — the
    // same fact three times, over a panel that is about to list both.
    const root = await mountCoal();

    assert.equal(
      root.querySelector('[data-component-inspector-kicker]').textContent.trim(),
      'Selected component'
    );
    assert.equal(root.querySelector('.manager-component-inspector-name').textContent.trim(), 'Coal');
    assert.equal(
      root.querySelector('[data-component-inspector-subline]').textContent.trim(),
      // `fuel` (world, unmuted) and `sooty` (this system's own); `bulk` is muted here and is not
      // in effect, which is the same arithmetic the split counter states below.
      '2 tags · 1 essence',
      'the subline states BOTH counts, which is what retires the tiles'
    );
    assert.equal(
      root.querySelectorAll('.manager-stat-tile').length,
      0,
      'and no stat tile survives to say either of them a second time'
    );
  });

  it('carries the Shared identity card the LIST pane used to head with', async () => {
    // Gap-list rows 101 and 119. The reference draws this callout on the rules editor and puts its
    // content HERE; the list pane's own copy is asserted gone by the `list head` suite above, so
    // this is the other half of that move and neither is a claim about an empty tree on its own.
    const root = await mountCoal();
    const card = root.querySelector('[data-component-shared-identity]');

    assert.ok(Boolean(card), 'the card renders');
    assert.equal(
      card.querySelector('[data-component-shared-identity-label]').textContent.trim(),
      'Shared identity'
    );
    assert.ok(
      Boolean(card.querySelector('[data-component-open-catalogue]')),
      'and it EXITS to the catalogue entry, which is where that identity is authored'
    );
  });

  it('withholds that card for a component the world corpus does not hold', async () => {
    // The negative control for the assertion above: without it, a card that never rendered at all
    // would satisfy nothing and a card that ALWAYS rendered would claim a shared identity for a
    // record that has none.
    const root = await mountCoal({ worldEntry: null });
    assert.ok(!root.querySelector('[data-component-shared-identity]'));
    assert.ok(
      Boolean(root.querySelector('.manager-component-inspector-name')),
      'while the panel itself still draws, so this is a branch rather than an empty mount'
    );
  });

  it('states tags in effect as a SPLIT, and drops a tag this system mutes', async () => {
    // Gap-list row 120. `bulk` is a world tag `sys-forge` mutes, so it is not in effect here and
    // is neither listed nor counted; `fuel` is, and `sooty` is the system's own. A block titled
    // "Tags in effect" that listed the union would be naming something else.
    const root = await mountCoal();

    assert.deepEqual(
      [...root.querySelectorAll('[data-component-tag]')].map((chip) => [
        chip.getAttribute('data-component-tag'),
        chip.getAttribute('data-component-tag-source'),
      ]),
      [
        ['fuel', 'world'],
        ['sooty', 'system'],
      ],
      'the muted world tag is absent, and each chip names where it came from'
    );
    assert.equal(
      root.querySelector('[data-component-tag-split]').textContent.trim(),
      '1 world · 1 system'
    );
  });

  it('names the CATEGORY source, so inherited and set-here are distinguishable', async () => {
    // Gap-list row 121, and the home of the list head's deleted `N inherit · M override` line.
    const root = await mountCoal();
    assert.equal(
      root.querySelector('[data-component-category-source]').textContent.trim(),
      'set in this system'
    );

    const inherited = await inspector.mount({
      selectedComponent: selectedCoal({ id: 'ingot', name: 'Iron Ingot', category: 'Refined' }),
      showTags: true,
      worldEntry: entry('ingot'),
      worldSystemRow: systemRow('ingot', 'sys-forge'),
      systemName: 'Forge',
    });
    assert.equal(
      inherited.querySelector('[data-component-category-source]').textContent.trim(),
      'inherited from world',
      'the other branch reads differently, so the line is derived rather than a constant'
    );
  });

  it('inks a WORLD tag blue and the system\u2019s OWN tag purple, as both screens do', async () => {
    // `proto:5663` inks a world tag blue and `proto:5665` inks the system's own purple, which is
    // the same pairing the rules editor's two runs use one route away. This panel had it the
    // other way round — world purple, own neutral — so the two component screens disagreed about
    // what purple means, and the split counter above the run was the only thing saying which was
    // which. `is-info` and `is-tag` are `Chip`'s families for exactly those two colours.
    const root = await mountCoal();
    const chip = (tag) => root.querySelector(`[data-component-tag="${tag}"]`);

    assert.ok(
      chip('fuel').classList.contains('is-info'),
      `the world tag takes the info family; it carried "${chip('fuel').className}"`
    );
    assert.ok(
      chip('sooty').classList.contains('is-tag'),
      `and the system's own takes the tag family; it carried "${chip('sooty').className}"`
    );
    assert.ok(
      !chip('fuel').classList.contains('is-tag'),
      'and the two are different families rather than one tone with a second class on it'
    );
  });

  it('and draws BOTH halves of the run at the primitive’s INSPECTOR scale', async () => {
    // `proto:5663` and `proto:5665` draw the two halves at ONE geometry — `padding: 3px 9px`,
    // a stadium corner, `600 10px` — while inking them differently, which is the whole shape of
    // this run: one size, two origins. The default chip is that height (a 10px face in an
    // unauthored line box is ~12px, so 3 + 12 + 3 is the base rule's 20px floor) but not that
    // weight, corner or inset: it is 700 at `--fab-space-chip` with a 10px radius.
    //
    // `density="inspector"` is the primitive's name for exactly that — the default pill spoken
    // more quietly — and it is asserted on BOTH chips because a density applied to one half
    // would draw the run at two sizes and read as the origin split it is not.
    const root = await mountCoal();
    const chip = (tag) => root.querySelector(`[data-component-tag="${tag}"]`);

    for (const tag of ['fuel', 'sooty']) {
      assert.ok(
        chip(tag).classList.contains('is-inspector'),
        `the "${tag}" chip takes the inspector scale; it carried "${chip(tag).className}"`
      );
      assert.ok(
        !chip(tag).classList.contains('is-list') && !chip(tag).classList.contains('is-tag-run'),
        `and neither micro pill nor the clickable tag run, which are 15px and 25px against ` +
          `this run's 20; "${tag}" carried "${chip(tag).className}"`
      );
    }
  });

  it('draws the dangling-source warning in a class the stylesheet actually paints', async () => {
    // A DRIFT GUARD, not a style assertion. On `main` this paragraph carried
    // `environment-stale-warning` and borrowed that rule's danger ink; the C7 rebuild renamed it
    // to a panel-local class and never wrote the replacement, so the one thing on this screen a
    // GM has to act on rendered as unstyled body text. Nothing failed, because a class with no
    // rule behind it is invisible to every gate that reads the markup alone.
    //
    // So the class is read OFF THE RENDERED NODE and looked up in the sheet: renaming it in the
    // component reds this, and deleting the rule reds it too, which neither a hard-coded selector
    // nor a mounted-only check can both do.
    const root = await mountCoal({ selectedComponent: selectedCoal({ sourceMissing: true }) });
    const warning = root.querySelector('[data-component-source-missing]');
    assert.ok(Boolean(warning), 'the remediation paragraph renders in the dangling-link state');

    const sheet = readFileSync(resolve(repoRoot, 'styles/fabricate.css'), 'utf8');
    const painted = [...warning.classList].filter((token) => sheet.includes(`.${token} {`));
    assert.deepEqual(
      painted,
      ['manager-component-inspector-warning'],
      `no rule in styles/fabricate.css paints any class this paragraph carries ` +
        `("${warning.className}"), so it renders as body text`
    );

    assert.ok(
      !(await mountCoal()).querySelector('[data-component-source-missing]'),
      'and it is withheld when the source resolves, so the state above is a branch'
    );
  });

  it('pins ONE primary in the foot and moves the rest behind a kebab', async () => {
    // Gap-list row 123. Four buttons — Edit component, Copy source UUID, Unlink, Delete — scrolled
    // inline with the body and gave four commands equal weight where the reference pins one.
    const opened = [];
    const root = await mountCoal({ onEditSystemRules: (...args) => opened.push(args) });
    const foot = root.querySelector('[data-component-inspector-foot]');

    assert.ok(Boolean(foot), 'the foot renders');
    assert.equal(
      foot.querySelectorAll('button').length,
      1,
      'and holds exactly ONE action, which is the act this whole screen exists to reach'
    );
    foot.querySelector('[data-component-edit-system-rules]').click();
    flushSync();
    assert.deepEqual(opened, [['coal']]);

    assert.ok(
      Boolean(root.querySelector('[data-component-inspector-menu]')),
      'and the other three commands are behind the shared overflow trigger, not lost'
    );
  });

  it('heads the salvage block with `Salvage in` and the system name as its OWN node (issue 1371 r12-list)', async () => {
    // `proto:1263` draws `Salvage in {{ d.sysName }}`: the caption and the name are two text nodes
    // of one line, and the parity inventory keys the caption on its own. The subject folded both
    // into one string, so its normalised key never matched. The name is wrapped, and the whole
    // line is byte-identical to what it read before, so a screen reader hears the same sentence.
    const root = await mountCoal();
    const label = root.querySelector('[data-component-salvage-label]');
    assert.ok(Boolean(label), 'the heading renders');
    assert.equal(label.textContent.trim(), 'Salvage in Forge', 'the sentence is unchanged');
    const name = label.querySelector('[data-component-salvage-system]');
    assert.ok(Boolean(name), 'and the system name is its own node');
    assert.equal(name.textContent, 'Forge');
    const caption = [...label.childNodes]
      .filter((node) => node.nodeType === 3)
      .map((node) => node.textContent)
      .join('')
      .trim();
    assert.equal(caption, 'Salvage in', 'so the caption is the text the reference keys on');
  });
});

describe('ComponentsBrowserView toolbar control rungs (issue 1371, ruling M12b)', () => {
  /**
   * The reference draws this bar's search field and both filter selects at 38px
   * (`proto:1053-1055`) and all three shipped at 34. 38 is a published rung
   * (`design-system/spec.md`: 26 / 28 / 30 / 34 / 38 / 44, with 32 / 36 / 40 retired), so nothing
   * licensed the drop; ruling M12b made the rung reachable on the shared primitives and this bar
   * is one of the two consumers.
   *
   * WHAT THESE ASSERTIONS ARE FOR, given that `manager-control-rungs.test.js` already pins the
   * RULE. That file proves the sheet paints 38px and the band's 9px corner for
   * `.manager-search.is-size-38 input` and for a toolbar `select.is-size-38`. It cannot see
   * whether anything reaches those rules, and the opt-in has two silent ways to miss:
   *
   *  - the field takes a PROP whose value is checked against a closed set, so `size="38px"` or
   *    `size={38.0}` renders the shipped 34px control with no error at all — by design, and
   *    invisible to a className read that only asks whether the field exists;
   *  - the selects take the CLASS DIRECTLY, and the sheet's host for it is `.manager-toolbar
   *    select.is-size-38`. This bar wears `manager-toolbar` only because it is a
   *    `<ManagerToolbar>`; converted back to a bare `<div class="manager-component-toolbar">`
   *    the class would stay in the markup, keep every `data-*` selector resolving, and paint
   *    nothing.
   *
   * So each control is reached through the SHEET'S OWN SELECTOR rather than by reading a class
   * list, and the resolved node is then asserted to be this bar's control.
   */
  const FIELD_SELECTOR = '.manager-search.is-size-38 input';
  const SELECT_SELECTOR = '.manager-toolbar select.is-size-38';

  function metalWithFire() {
    return [
      makeComponent({
        id: 'm1',
        name: 'Iron Ingot',
        category: 'Metal',
        essences: [{ id: 'fire', name: 'Fire', quantity: 1 }],
      }),
      makeComponent({ id: 'h1', name: 'Sage', category: 'Herb' }),
    ];
  }

  it('opts the search field into the 38px rung, through the selector the sheet paints', async () => {
    const root = await browser.mount({
      itemCards: metalWithFire(),
      categoryVocabulary: ['Metal', 'Herb'],
      selectedSystemId: 'sys-1',
    });

    const field = root.querySelector(FIELD_SELECTOR);
    assert.ok(Boolean(field), `the toolbar search resolves through \`${FIELD_SELECTOR}\``);
    assert.ok(
      // `:scope` here and not on the two constants above, which are the sheet's own selector
      // text verbatim and stay that way. Without it a leading `[data-component-search]` is free
      // to match an input inside the root whose LABEL is outside it.
      field === root.querySelector(':scope [data-component-search] input'),
      'and it is this bar’s own search input, not another field that happens to carry the rung'
    );
  });

  it('opts BOTH filter selects into it, from inside the host that rule names', async () => {
    const root = await browser.mount({
      itemCards: metalWithFire(),
      categoryVocabulary: ['Metal', 'Herb'],
      selectedSystemId: 'sys-1',
    });

    const rung = [...root.querySelectorAll(SELECT_SELECTOR)];
    assert.deepEqual(
      rung.map((select) =>
        select.hasAttribute('data-component-category-filter') ? 'category' : 'essence'
      ),
      ['category', 'essence'],
      'the category and essence filters both reach the rung, in bar order'
    );
    for (const select of rung) {
      assert.ok(
        Boolean(select.closest('[data-component-toolbar]')),
        'and each one is inside this bar, so the host the sheet names is this bar’s section'
      );
    }
  });

  it('the row’s leading chip is the BORDERLESS variant the reference draws', async () => {
    // UX F12 → F-B (r9). The reference's leading chip declares no `border` at all (`proto:1085`),
    // so it computes `border-style: none`; the shipped tile carries a hairline, and that one
    // difference measured as three `compare` lines on this row — `borderTopWidth`,
    // `borderTopStyle` and `borderTopColor`. `Medallion`'s `variant="glyph-chip"` was BUILT for
    // this site and named it, and was wired at one of the three sites it was built for.
    //
    // Asserted through the class the variant emits rather than through a computed style, because
    // the rule lives in the primitive's own scoped block and a mounted tree carries no sheet: the
    // class IS the seam between the caller and the paint, and its rule is pinned where the
    // primitive is (`recipe-studio-primitives.test.js`).
    const root = await browser.mount({
      itemCards: metalWithFire(),
      categoryVocabulary: ['Metal', 'Herb'],
      selectedSystemId: 'sys-1',
    });
    // `:scope` so the query cannot climb out of the mount root, and so this line adds no ESLint
    // problem to a file `npm run lint` does not cover and therefore never cleans up.
    const chips = [...root.querySelectorAll(':scope .manager-component-row .fab-medallion')];
    assert.ok(chips.length > 0, 'the rows draw their chips, so the loop below is not vacuous');
    for (const chip of chips) {
      assert.ok(
        chip.classList.contains('is-glyph-chip'),
        `the row chip asks for the borderless face; it carried "${chip.className}"`
      );
    }
  });

  it('and the bar still wears `manager-toolbar`, which is what makes that host real', async () => {
    // Non-vacuity for the selector above: it is two classes and an element, and the FIRST class
    // is the shared primitive's, not this screen's. A bar that stopped being a `<ManagerToolbar>`
    // would take both assertions above down with it — which is the point — but it would read as
    // a markup change with no styling consequence, so the join is named here once.
    const root = await browser.mount({
      itemCards: metalWithFire(),
      categoryVocabulary: ['Metal', 'Herb'],
      selectedSystemId: 'sys-1',
    });
    const bar = root.querySelector('[data-component-toolbar]');
    assert.ok(Boolean(bar), 'the bar renders');
    assert.ok(
      bar.classList.contains('manager-toolbar'),
      'the section carries the shared bar class the 38px select rule is scoped to'
    );
    assert.ok(
      bar.classList.contains('manager-component-toolbar'),
      'and its own, so the extra class is still appended rather than replacing the primitive’s'
    );
  });
});

// ── issue 1371 r12-list ──────────────────────────────────────────────────────────────────────
describe('ComponentsBrowserView toolbar — the reference’s essence predicates, Tags sort and sort glyph (issue 1371 r12-list)', () => {
  /**
   * The first complete parity `inventory` pass on the `system` screen (`handoff-r11-gates.md` §1)
   * reported four structural lines on this bar that were real: the reference's essence filter
   * offers `Carries any essence` and `No essences` besides the per-essence entries (`proto:5533`,
   * predicates at `proto:5477-5479`); its sort-by list is `Name | Category | Essences | Tags`
   * (`proto:5536`, the `Tags` comparator at `proto:5485`); and its direction toggle draws
   * `fa-arrow-down-a-z` / `fa-arrow-up-a-z` (`proto:5538`) where the subject drew
   * `fa-arrow-down-short-wide`. Each control below is ACTED on, not merely found, and the state it
   * changes is the row order the body draws.
   */
  function toolbarRows() {
    return [
      makeComponent({ id: 'ash', name: 'Ash', tags: ['fuel', 'bulk'] }),
      makeComponent({
        id: 'brimstone',
        name: 'Brimstone',
        tags: [],
        essences: [{ id: 'fire', name: 'Fire', quantity: 1 }],
      }),
      makeComponent({
        id: 'cinder',
        name: 'Cinder',
        tags: ['fuel'],
        essences: [
          { id: 'fire', name: 'Fire', quantity: 1 },
          { id: 'air', name: 'Air', quantity: 1 },
        ],
      }),
      makeComponent({ id: 'dust', name: 'Dust', tags: [] }),
    ];
  }

  function rowIds(root) {
    return [...root.querySelectorAll(':scope .manager-component-row')].map(
      (row) => row.dataset.componentId
    );
  }

  function choose(select, value) {
    select.value = value;
    select.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
  }

  async function mountToolbar() {
    return browser.mount({
      itemCards: toolbarRows(),
      categoryVocabulary: [],
      selectedSystemId: 'sys-1',
    });
  }

  it('offers `Carries any essence` and `No essences` after `All essences`, and each one FILTERS', async () => {
    const root = await mountToolbar();
    const filter = root.querySelector('[data-component-essence-filter]');
    assert.ok(Boolean(filter), 'the essence filter renders, because a row carries an essence');
    assert.deepEqual(
      [...filter.options].map((option) => [option.value, option.textContent.trim()]),
      [
        ['all', 'All essences'],
        ['__any', 'Carries any essence'],
        ['__none', 'No essences'],
        ['Air', 'Air'],
        ['Fire', 'Fire'],
      ],
      'the reference’s order: the three predicates, then the per-essence entries'
    );
    assert.deepEqual(rowIds(root), ['ash', 'brimstone', 'cinder', 'dust'], 'unfiltered, by name');

    choose(filter, '__any');
    assert.deepEqual(rowIds(root), ['brimstone', 'cinder'], 'any essence at all keeps the row');

    choose(filter, '__none');
    assert.deepEqual(rowIds(root), ['ash', 'dust'], 'no essence keeps only the bare rows');

    choose(filter, 'Fire');
    assert.deepEqual(rowIds(root), ['brimstone', 'cinder'], 'and a named essence still works');
  });

  it('offers `Tags` as the fourth sort key, and it orders by tag count then name', async () => {
    const root = await mountToolbar();
    const sort = root.querySelector('[data-component-sort]');
    assert.deepEqual(
      [...sort.options].map((option) => [option.value, option.textContent.trim()]),
      [
        ['name', 'Name'],
        ['category', 'Category'],
        ['essences', 'Essences'],
        ['tags', 'Tags'],
        ['salvage', 'Salvage'],
      ],
      'the reference’s four keys in its order, with the subject-only Salvage kept last'
    );

    choose(sort, 'tags');
    assert.deepEqual(
      rowIds(root),
      ['brimstone', 'dust', 'cinder', 'ash'],
      'ascending: the two untagged rows by name, then one tag, then two'
    );

    root.querySelector('[data-component-sort-direction]').click();
    flushSync();
    assert.deepEqual(
      rowIds(root),
      ['ash', 'cinder', 'brimstone', 'dust'],
      'descending: the count reverses, the name tiebreak does not'
    );
  });

  it('draws the direction toggle with the reference’s alphabetical glyphs', async () => {
    const root = await mountToolbar();
    const toggle = root.querySelector('[data-component-sort-direction]');
    const glyph = () => toggle.querySelector('i').className;
    assert.match(glyph(), /\bfa-arrow-down-a-z\b/, 'ascending is `fa-arrow-down-a-z` (`proto:5538`)');
    assert.doesNotMatch(glyph(), /short-wide|wide-short/, 'and not the amount glyphs it drew');

    toggle.click();
    flushSync();
    assert.match(glyph(), /\bfa-arrow-up-a-z\b/, 'descending is `fa-arrow-up-a-z`');
    assert.doesNotMatch(glyph(), /short-wide|wide-short/);
  });
});

describe('ComponentsBrowserView auto-selects the first SHOWN row (issue 1371 r13-list, M14)', () => {
  /**
   * Maintainer ruling M14: the library opens with its first component selected. The View Lab's
   * `manager-components-normal` frame at `60e035d2` shows what the ruling closes — the inspector
   * describing `Iron Ore`, the manager's STORED-first card, while the list's first row is
   * `Chainmail Shirt` and no row is marked at all.
   *
   * THREE ROWS WITH THREE DIFFERENT "FIRST" ANSWERS, so the pick's basis is decidable from the
   * id it pushes: `zinc` is authored first (the stored order the root's fallback read), `alloy`
   * is first by name over the whole library (a flat name sort), and `coal` is first in the order
   * the body DRAWS — category-major (`Raw` before `Refined`, `general` last), name within.
   */
  function threeFirsts() {
    return [
      makeComponent({ id: 'zinc', name: 'Zinc Ore', category: 'Raw' }),
      makeComponent({ id: 'alloy', name: 'Alloy', category: 'Refined' }),
      makeComponent({ id: 'coal', name: 'Coal', category: 'Raw' }),
    ];
  }

  function rowIds(root) {
    return [...root.querySelectorAll(':scope .manager-component-row')].map(
      (row) => row.dataset.componentId
    );
  }

  function markedRowIds(root) {
    return [...root.querySelectorAll(':scope .manager-component-row[aria-current="true"]')].map(
      (row) => row.dataset.componentId
    );
  }

  /** A world corpus this system holds NO record for: every entry draws as a ghost. */
  function worldOnlyScope() {
    return projectComponentScope({
      entityType: 'component',
      corpus: {
        entities: [{ id: 'w-aether', name: 'Aether Dust' }],
        defaults: [],
        membership: [],
      },
      systems: [{ id: 'sys-1', name: 'Forge' }],
    });
  }

  function widen(root) {
    root.querySelector('[data-component-membership-option="all"] input').click();
    flushSync();
  }

  async function mountWithRecorder(props = {}) {
    const selected = [];
    const root = await browser.mount({
      itemCards: threeFirsts(),
      categoryVocabulary: ['Raw', 'Refined'],
      systemId: 'sys-1',
      selectedSystemId: 'sys-1',
      onSelectComponent: (id) => selected.push(id),
      ...props,
    });
    return { root, selected };
  }

  it('selects the first row in the SHOWN order once, and marks it when the owner feeds it back', async () => {
    const { root, selected } = await mountWithRecorder();

    // NON-VACUITY FIRST: the drawn order really does put a row first that is neither the
    // authored-first nor the name-first card.
    assert.deepEqual(rowIds(root), ['coal', 'zinc', 'alloy'], 'category-major, name within');
    assert.deepEqual(
      selected,
      ['coal'],
      'the pick is the row drawn at the top — not `zinc` (stored order) and not `alloy` (flat name order)'
    );
    assert.deepEqual(markedRowIds(root), [], 'nothing is marked until the owner answers');

    // The owner answers by feeding the id back, as the root does through `selectComponent`.
    await browser.setProps({ selectedComponentId: 'coal' });
    assert.deepEqual(selected, ['coal'], 'a selection this system holds is never pushed again');
    assert.deepEqual(markedRowIds(root), ['coal'], 'and exactly that row is marked');
  });

  it('leaves a deep-linked or remembered selection alone, even when it is not the first row', async () => {
    const { root, selected } = await mountWithRecorder({ selectedComponentId: 'zinc' });
    assert.deepEqual(markedRowIds(root), ['zinc'], 'the row the owner named is the marked one');
    assert.deepEqual(selected, [], 'and the auto-select does not override it');
  });

  it('does not re-select when the sort, a filter or the cohort segment changes', async () => {
    const { root, selected } = await mountWithRecorder({
      selectedComponentId: 'zinc',
      scope: worldOnlyScope(),
    });

    root.querySelector('[data-component-sort-direction]').click();
    flushSync();
    assert.deepEqual(rowIds(root), ['zinc', 'coal', 'alloy'], 'the flip really re-ordered the rows');
    assert.deepEqual(selected, [], 'a re-sort moves the list, not the selection');

    // A filter that hides the selected row: it is still a component this system holds, so the
    // panel keeps describing it rather than snapping to whatever is drawn first.
    const filter = root.querySelector('[data-component-category-filter]');
    const refined = [...filter.options].find((option) => /Refined/.test(option.textContent));
    assert.ok(Boolean(refined), 'the filter offers the Refined category');
    filter.value = refined.value;
    filter.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    assert.deepEqual(rowIds(root), ['alloy'], 'the filter really hid the selected row');
    assert.deepEqual(selected, [], 'and the selection is not moved onto the row that remains');

    widen(root);
    assert.ok(
      root.querySelector('[data-component-member="false"]'),
      'the widened cohort really drew a ghost'
    );
    assert.deepEqual(selected, [], 'widening the cohort moves nothing either');
  });

  it('re-selects when the selection names no row this system holds', async () => {
    // The root clears its id to `` on a system switch; a deleted or unlinked selection leaves a
    // dangling one. Both are the same state to this effect: nothing this cohort holds is selected.
    const { selected } = await mountWithRecorder({ selectedComponentId: 'gone' });
    assert.deepEqual(selected, ['coal'], 'the first drawn row is selected in the new cohort');
  });

  it('never selects a ghost: a page drawing only world rows selects nothing', async () => {
    const { root, selected } = await mountWithRecorder({
      itemCards: [],
      scope: worldOnlyScope(),
    });
    widen(root);

    assert.equal(
      root.querySelectorAll('[data-component-member="false"]').length,
      1,
      'the page really is one ghost row'
    );
    assert.deepEqual(selected, [], 'a ghost is not pushed through the in-system selection');
    assert.deepEqual(markedRowIds(root), [], 'and no row is marked');
  });

  it('picks the first MEMBER row on the page the GM is on, not on page one', async () => {
    const shared = createComponentBrowserState();
    shared.pageSize = 2;
    shared.pageIndex = 1;
    shared.systemId = 'sys-1';
    const rows = Array.from({ length: 5 }, (_, index) =>
      makeComponent({ id: `r${index + 1}`, name: `Row ${index + 1}`, category: 'Raw' })
    );
    const { root, selected } = await mountWithRecorder({ itemCards: rows, browserState: shared });

    assert.deepEqual(rowIds(root), ['r3', 'r4'], 'the remembered page is the one drawn');
    assert.deepEqual(selected, ['r3'], 'and its first row is the pick, not page one’s');
  });
});

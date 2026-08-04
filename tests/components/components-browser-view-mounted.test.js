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
import { createComponentBrowserState } from '../../src/utils/componentBrowserModel.js';
import { buildInterleavedCategoryOrder } from '../helpers/interleavedCategoryLibrary.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const browser = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-components-browser-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/actions/dragDrop.js',
    'src/utils/componentCategories.js',
    'src/utils/componentBrowserModel.js',
    // componentBrowserModel imports the shared category totals; omitting it HANGS this
    // suite (`# cancelled`) rather than failing it.
    'src/utils/browserGroupCounts.js',
    // The pure bulk selection + staging model (issue 772). The view imports it for the
    // selection helpers and its toolbar reads the description it returns.
    'src/utils/componentBulkEditModel.js',
    // Its shared leaf (issue 1010): those selection helpers now live here and
    // `componentBulkEditModel.js` re-exports them, so it is a STATIC import of that module.
    'src/utils/bulkSelectionModel.js'
  ],
  compiledModules: [
    // The manager's ONE chip (issue 883). A `.svelte` the tree renders but the
    // harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/Chip.svelte',
    // The shared no-state primitive (issue 785). A `.svelte` the tree renders but
    // the harness omits HANGS the suite (# cancelled) rather than failing it.
    'src/ui/svelte/apps/manager/EmptyState.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/Medallion.svelte',
    'src/ui/svelte/components/StatusPill.svelte',
    'src/ui/svelte/components/CollapsibleGroupHeader.svelte',
    // The manager's ONE selection control and the manager's ONE multi-select row
    // (issue 772; the row extracted to a shared primitive under `apps/manager/` for
    // issue 1010, so this path moved out of the browser's own `components/` directory).
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
    'src/ui/svelte/apps/manager/components/ComponentRow.svelte',
    'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/manager/ComponentsBrowserView.svelte'
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

/** The toolbar's `{N} selected` readout, or '' when nothing is selected (it is absent). */
function selectionCountText(root) {
  return root.querySelector('[data-component-selection-count]')?.textContent.trim() || '';
}

/** The ids of the rows currently rendered with a ticked selection box. */
function bulkSelectedIds(root) {
  return [...root.querySelectorAll('.manager-component-row.is-bulk-selected')].map(
    (row) => row.dataset.componentId
  );
}

function clickRowBox(root, id) {
  root.querySelector(`[data-component-select="${id}"]`).click();
  flushSync();
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
    assert.deepEqual(
      countTexts(root),
      ['25 of 30 components'],
      'the header must not say the General bucket holds 25'
    );
    // The pager and the header now agree about the same library.
    assert.equal(
      root.querySelector('[data-component-count]').textContent.trim(),
      '1–25 of 30'
    );
  });

  it('says it once when the group is shown WHOLE', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(3) });
    assert.deepEqual(countTexts(root), ['3 components'], 'not "3 of 3"');
  });

  it('handles the singular — "1 component" whole, "1 of N" paged', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(1) });
    assert.deepEqual(countTexts(root), ['1 component'], 'never "1 components"');

    browser.remount();
    const paged = await browser.mount({ itemCards: manyGeneral(26) });
    const size = paged.querySelector('[data-pagination-size]');
    size.value = '25';
    size.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();
    paged.querySelector('[data-pagination-next]').click();
    flushSync();

    assert.equal(paged.querySelectorAll('.manager-component-row').length, 1, 'page 2 holds one row');
    assert.deepEqual(countTexts(paged), ['1 of 26 components'], 'never "1 components", never a bare "1"');
  });

  it('counts the total over the FILTERED rows, so an active filter is respected', async () => {
    const rows = [
      ...manyGeneral(2),
      makeComponent({ id: 'm1', name: 'Copper Ore', category: 'Metal' }),
      makeComponent({ id: 'm2', name: 'Tin Ore', category: 'Metal' })
    ];
    const root = await browser.mount({ itemCards: rows, categoryVocabulary: ['Metal'] });
    assert.deepEqual(countTexts(root), ['2 components', '2 components'], 'Metal then general');

    const categoryFilter = root.querySelector('[data-component-category-filter]');
    categoryFilter.value = 'Metal';
    categoryFilter.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
    flushSync();

    assert.deepEqual(
      countTexts(root),
      ['2 components'],
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
    shared.collapsedCategories = new Set(['Metal']);
    shared.sortKey = 'salvage';

    browser.remount();
    await browser.mount({ itemCards, categoryVocabulary: ['Metal', 'Herb'], selectedSystemId: 'sys-1', browserState: shared });

    assert.equal(shared.categoryFilter, 'Metal', 'the category filter survives the round-trip');
    assert.equal(shared.essenceFilter, 'Fire', 'the essence filter survives the round-trip');
    assert.equal(shared.pageIndex, 1, 'the page survives the round-trip');
    assert.equal(shared.collapsedCategories.has('Metal'), true, 'the collapsed group survives the round-trip');
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
    assert.equal(shared.collapsedCategories.size, 0, 'a switch re-expands every group');
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
      ['Herb', '6 components'],
      ['Metal', '4 of 12 components'],
    ]);

    // Page 2: Metal CONTINUES contiguously (its remaining 8), then general begins. Metal's
    // header reads "N of M" on this continuation page too, and no Metal rows are stranded
    // on any non-adjacent page.
    root.querySelector('[data-pagination-next]').click();
    flushSync();
    assert.deepEqual(groupsOnPage(root), [
      ['Metal', '8 of 12 components'],
      ['general', '2 of 4 components'],
    ]);

    // Page 3: general finishes; Metal never reappears (contiguity across the boundary).
    root.querySelector('[data-pagination-next]').click();
    flushSync();
    assert.deepEqual(groupsOnPage(root), [['general', '2 of 4 components']]);
  });
});

// Issue 772 — the multi-select. The rendered-rows control and the whole-results action are
// DISTINCT operations and these tests keep them distinct, because conflating them is the
// defect: a collapsed group's rows are not rendered, so the page control must never reach
// them while the results link must.
describe('ComponentsBrowserView bulk selection (issue 772)', () => {
  function twoCategoryLibrary() {
    return [
      makeComponent({ id: 'm1', name: 'Copper Ore', category: 'Metal' }),
      makeComponent({ id: 'm2', name: 'Tin Ore', category: 'Metal' }),
      makeComponent({ id: 'h1', name: 'Sage', category: 'Herb' }),
      makeComponent({ id: 'h2', name: 'Thyme', category: 'Herb' })
    ];
  }

  it('ticks a row from its own trailing box, and that box is not a button', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(3) });

    const box = root.querySelector('[data-component-select="g1"]');
    assert.equal(box.tagName, 'INPUT', 'the selection control is a real checkbox input');
    assert.equal(
      root.querySelectorAll('[data-component-id="g1"] .manager-action-group button').length,
      1,
      'the row still carries exactly ONE button — the smoke walk reaches Edit through it'
    );

    clickRowBox(root, 'g1');
    assert.deepEqual(bulkSelectedIds(root), ['g1'], 'the ticked row carries is-bulk-selected');
    assert.match(selectionCountText(root), /1 selected/);

    clickRowBox(root, 'g1');
    assert.deepEqual(bulkSelectedIds(root), [], 'ticking again clears the row');
    assert.equal(selectionCountText(root), '', 'the readout disappears with an empty selection');
  });

  // Issue 924's focus-ring contract used to be asserted here, against this view's rendered
  // toolbar. Issue 1010 extracted that toolbar into the shared `BulkSelectionToolbar`, so the
  // contract belongs to the primitive rather than to one of its two consumers: it RELOCATED,
  // unchanged in substance and widened in strength, to
  // `tests/components/bulk-selection-toolbar-mounted.test.js`, which owns both the adjacency
  // case and the drift assertion over the class tokens inside the toolbar's `:global()`.
  // Do not re-add a per-studio copy of it; the primitive is what both studios render.

  it('toggles ONLY the rendered rows from the page box, leaving a collapsed group alone', async () => {
    const root = await browser.mount({
      itemCards: twoCategoryLibrary(),
      categoryVocabulary: ['Metal', 'Herb']
    });

    // Collapse Metal through its real header button, so its two rows stop being rendered.
    root.querySelector('[data-group-header="Metal"]').click();
    flushSync();
    assert.equal(
      root.querySelectorAll('.manager-component-row').length,
      2,
      'only the Herb rows are rendered once Metal is collapsed'
    );

    const pageBox = root.querySelector('[data-component-select-all-page]');
    pageBox.click();
    flushSync();

    assert.deepEqual(
      bulkSelectedIds(root).sort(),
      ['h1', 'h2'],
      'the page control must not reach rows the GM cannot see'
    );
    assert.match(selectionCountText(root), /2 selected/, 'and the count cannot exceed them');
    assert.equal(pageBox.checked, true, 'every RENDERED row is selected, so the box reads all');

    pageBox.click();
    flushSync();
    assert.deepEqual(bulkSelectedIds(root), [], 'clicking again clears the rendered rows');
  });

  it('reports the tri-state over the rendered rows', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(3) });
    const pageBox = root.querySelector('[data-component-select-all-page]');

    assert.equal(pageBox.checked, false, 'nothing selected reads unchecked');
    assert.equal(pageBox.indeterminate, false, 'and NOT indeterminate');

    clickRowBox(root, 'g1');
    assert.equal(pageBox.indeterminate, true, 'part of the page selected reads indeterminate');

    clickRowBox(root, 'g2');
    clickRowBox(root, 'g3');
    assert.equal(pageBox.checked, true, 'the whole page selected reads checked');
    assert.equal(pageBox.indeterminate, false);
  });

  it('reaches the whole filtered set through "Select all N results"', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(30) });

    assert.ok(
      !root.querySelector('[data-component-select-all-results]'),
      'the results link belongs to the selection cluster and is absent with nothing selected'
    );

    clickRowBox(root, 'g1');
    const link = root.querySelector('[data-component-select-all-results]');
    assert.match(link.textContent, /30/, 'the link names the whole filtered set, not the page');

    link.click();
    flushSync();
    assert.match(selectionCountText(root), /30 selected/, 'all 30 filtered rows are selected');
    assert.ok(
      !root.querySelector('[data-component-select-all-results]'),
      'the link disappears once the filtered set is fully selected'
    );
  });

  it('keeps a selection made on page 1 when the GM pages away', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(30) });

    clickRowBox(root, 'g1');
    root.querySelector('[data-pagination-next]').click();
    flushSync();

    assert.ok(!root.querySelector('[data-component-select="g1"]'), 'page 2 does not render g1');
    assert.match(
      selectionCountText(root),
      /1 selected/,
      'the count is the WHOLE selection, not its intersection with the page'
    );
  });

  it('drops a selected id that no longer resolves to a component', async () => {
    const root = await browser.mount({ itemCards: manyGeneral(3) });

    clickRowBox(root, 'g1');
    clickRowBox(root, 'g2');
    assert.match(selectionCountText(root), /2 selected/);

    // A delete / unlink / refresh republishes `itemCards` without the row.
    await browser.setProps({ itemCards: manyGeneral(3).filter((item) => item.id !== 'g1') });

    assert.deepEqual(bulkSelectedIds(root), ['g2'], 'the surviving row stays selected');
    assert.match(
      selectionCountText(root),
      /1 selected/,
      'a phantom id must never survive in the count or in an Apply'
    );
  });

  it('clears the selection on a genuine crafting-system switch', async () => {
    const shared = createComponentBrowserState();
    const itemCards = manyGeneral(3);

    await browser.mount({ itemCards, selectedSystemId: 'sys-1', browserState: shared });
    shared.bulkSelectedComponentIds = new Set(['g1', 'g2']);

    browser.remount();
    await browser.mount({ itemCards, selectedSystemId: 'sys-1', browserState: shared });
    assert.equal(
      shared.bulkSelectedComponentIds.size,
      2,
      'an editor round-trip is not a system switch and must not clear it'
    );

    browser.remount();
    await browser.mount({ itemCards, selectedSystemId: 'sys-2', browserState: shared });
    assert.equal(
      shared.bulkSelectedComponentIds.size,
      0,
      'the selection names components the new system does not have'
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

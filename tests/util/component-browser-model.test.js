/**
 * Issue 676 — the GM component library's pure list model.
 *
 * Covers AC1's grouping/filtering half at the model layer.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPONENT_DEFAULT_PAGE_SIZE,
  COMPONENT_ESSENCE_FILTER_ANY,
  COMPONENT_ESSENCE_FILTER_NONE,
  COMPONENT_SORT_KEYS,
  componentCategoryOf,
  componentCategoryOptions,
  createComponentBrowserState,
  describeActiveComponentFilters,
  filterComponents,
  groupComponentsByCategory,
  paginateComponents,
  sortComponents,
} from '../../src/utils/componentBrowserModel.js';
import { countByCategory } from '../../src/utils/browserGroupCounts.js';

const ROWS = [
  { id: 'a', name: 'Iron Ore', category: 'Metal', essences: [{ id: 'earth', name: 'Earth', quantity: 2 }] },
  { id: 'b', name: 'Glass Vial', essences: [] },
  { id: 'c', name: 'Sage', category: 'Herb', essences: [{ id: 'air', name: 'Air', quantity: 1 }] },
  { id: 'd', name: 'Copper Ore', category: 'Metal', essences: [] },
];

const names = (rows) => rows.map((row) => row.name);

describe('component browser model (issue 676)', () => {
  it('createComponentBrowserState returns a FRESH object with a fresh Set each call', () => {
    // A shared singleton would leak one browser's collapse state into every other
    // mount — including the isolated mounted tests, which don't lift the state.
    const first = createComponentBrowserState();
    const second = createComponentBrowserState();
    assert.notEqual(first, second);
    assert.notEqual(first.collapsedCategories, second.collapsedCategories);
    first.collapsedCategories.add('Metal');
    assert.equal(second.collapsedCategories.has('Metal'), false);
  });

  it('defaults group by category, sort by name ascending, and page from 0', () => {
    const state = createComponentBrowserState();
    assert.equal(state.categoryFilter, 'all');
    assert.equal(state.essenceFilter, 'all');
    assert.equal(state.groupByCategory, true);
    assert.equal(state.sortKey, 'name');
    assert.equal(state.sortDirection, 'asc');
    assert.equal(state.pageIndex, 0);
    assert.equal(state.pageSize, COMPONENT_DEFAULT_PAGE_SIZE);
    // The PERSISTED system sentinel (issue 806): starts empty so the first mount's reset
    // effect stamps it, and it survives the editor round-trip so a remount is not a switch.
    assert.equal(state.systemId, '');
  });

  it('every component has a category — an absent one reads general', () => {
    assert.equal(componentCategoryOf({ category: 'Metal' }), 'Metal');
    assert.equal(componentCategoryOf({}), 'general');
    assert.equal(componentCategoryOf({ category: '  ' }), 'general');
    assert.equal(componentCategoryOf(null), 'general');
  });

  it('filters by category, including the reserved general bucket', () => {
    assert.deepEqual(names(filterComponents(ROWS, { category: 'Metal' })), ['Iron Ore', 'Copper Ore']);
    assert.deepEqual(names(filterComponents(ROWS, { category: 'general' })), ['Glass Vial']);
    assert.deepEqual(names(filterComponents(ROWS, { category: 'all' })), names(ROWS));
    assert.deepEqual(names(filterComponents(ROWS, {})), names(ROWS));
  });

  it('filters by essence', () => {
    assert.deepEqual(names(filterComponents(ROWS, { essence: 'Earth' })), ['Iron Ore']);
    assert.deepEqual(names(filterComponents(ROWS, { essence: 'Air' })), ['Sage']);
  });

  it('combines the category and essence filters', () => {
    assert.deepEqual(names(filterComponents(ROWS, { category: 'Metal', essence: 'Earth' })), ['Iron Ore']);
    assert.deepEqual(filterComponents(ROWS, { category: 'Herb', essence: 'Earth' }), []);
  });

  it('groups by category with general pinned LAST as the catch-all', () => {
    const groups = groupComponentsByCategory(ROWS);
    assert.deepEqual(
      groups.map((group) => group.category),
      ['Herb', 'Metal', 'general']
    );
    assert.deepEqual(names(groups[1].components), ['Iron Ore', 'Copper Ore']);
  });

  // The view groups the PAGE, so a bucket's own length is only what is on screen. The
  // header pairs it with the category's FILTERED total ("2 of 5 components") — issue 676.
  it('carries the category total from the filtered rows, not the page slice', () => {
    const totals = countByCategory(ROWS, componentCategoryOf);
    const pageOne = groupComponentsByCategory([ROWS[0]], totals);

    assert.equal(pageOne[0].category, 'Metal');
    assert.equal(pageOne[0].components.length, 1, 'the page renders one Metal row');
    assert.equal(pageOne[0].total, 2, 'but the filtered Metal bucket holds two');
  });

  it('degrades total to the bucket length when no totals are supplied', () => {
    for (const group of groupComponentsByCategory(ROWS)) {
      assert.equal(group.total, group.components.length);
    }
  });

  it('sorts by name, category, essence count and salvage group count, with name as the tiebreak', () => {
    assert.deepEqual(names(sortComponents(ROWS, { key: 'name' })), [
      'Copper Ore',
      'Glass Vial',
      'Iron Ore',
      'Sage',
    ]);
    assert.deepEqual(names(sortComponents(ROWS, { key: 'name', direction: 'desc' })), [
      'Sage',
      'Iron Ore',
      'Glass Vial',
      'Copper Ore',
    ]);
    // Category ties break by name (Copper Ore before Iron Ore inside Metal), and
    // `general` pins LAST — matching groupComponentsByCategory, so switching grouping
    // off cannot reorder the catch-all bucket to the top.
    assert.deepEqual(names(sortComponents(ROWS, { key: 'category' })), [
      'Sage',
      'Copper Ore',
      'Iron Ore',
      'Glass Vial',
    ]);
    assert.deepEqual(names(sortComponents(ROWS, { key: 'essences', direction: 'desc' })), [
      'Iron Ore',
      'Sage',
      'Copper Ore',
      'Glass Vial',
    ]);
  });

  // The non-grouped path is the byte-identical pre-issue-801 order. These literal
  // orderings pin BOTH directions per key so a bug injected into the shared
  // `rowComparator` flips them (rather than a self-comparison against the code).
  it('pins each sort key in both directions (the flat, non-grouped path)', () => {
    assert.deepEqual(names(sortComponents(ROWS, { key: 'name', direction: 'asc' })), [
      'Copper Ore', 'Glass Vial', 'Iron Ore', 'Sage',
    ]);
    assert.deepEqual(names(sortComponents(ROWS, { key: 'name', direction: 'desc' })), [
      'Sage', 'Iron Ore', 'Glass Vial', 'Copper Ore',
    ]);
    // Category ASC: Herb, then Metal (Copper before Iron by name), then general LAST.
    assert.deepEqual(names(sortComponents(ROWS, { key: 'category', direction: 'asc' })), [
      'Sage', 'Copper Ore', 'Iron Ore', 'Glass Vial',
    ]);
    // Category DESC flips the group order — general (pinned last) floats to the FRONT —
    // while the within-category tiebreak stays name-ascending.
    assert.deepEqual(names(sortComponents(ROWS, { key: 'category', direction: 'desc' })), [
      'Glass Vial', 'Copper Ore', 'Iron Ore', 'Sage',
    ]);
    assert.deepEqual(names(sortComponents(ROWS, { key: 'essences', direction: 'asc' })), [
      'Copper Ore', 'Glass Vial', 'Iron Ore', 'Sage',
    ]);
    assert.deepEqual(names(sortComponents(ROWS, { key: 'essences', direction: 'desc' })), [
      'Iron Ore', 'Sage', 'Copper Ore', 'Glass Vial',
    ]);
  });

  // Issue 801 — with grouping ON the list is ordered category-major BEFORE pagination.
  // `compareCategories` (general pinned LAST) is the DIRECTION-INDEPENDENT primary; the
  // active sort orders rows only within a category.
  describe('category-major grouped ordering (issue 801)', () => {
    it('orders rows category-major with general pinned last, name-ascending within', () => {
      // A name-key sort with categoryMajor groups the rows into their category order
      // (Herb, Metal, general) with names ascending inside each bucket.
      assert.deepEqual(names(sortComponents(ROWS, { key: 'name', categoryMajor: true })), [
        'Sage', 'Copper Ore', 'Iron Ore', 'Glass Vial',
      ]);
    });

    // The components-only edge: grouping ON + key 'category' + direction 'desc'. The
    // direction must touch NEITHER the primary (groups stay ascending, general last) NOR
    // the tiebreak (names ascending) — it would otherwise double-apply and reverse the
    // very group order the headers render.
    it('keeps a desc category sort rendering ascending groups (general last), name-asc within', () => {
      assert.deepEqual(names(sortComponents(ROWS, { key: 'category', direction: 'desc', categoryMajor: true })), [
        'Sage', 'Copper Ore', 'Iron Ore', 'Glass Vial',
      ]);
      // Identical to the ascending category-major order — the direction is inert here,
      // exactly the opposite of the flat category-desc order pinned above.
      assert.deepEqual(
        names(sortComponents(ROWS, { key: 'category', direction: 'desc', categoryMajor: true })),
        names(sortComponents(ROWS, { key: 'category', direction: 'asc', categoryMajor: true }))
      );
    });

    it('confines a non-category sort direction to within-category rows only', () => {
      // desc by essences: groups stay Herb, Metal, general (direction-independent), and
      // only the rows within Metal descend by essence count (Iron Ore[1] before Copper[0]).
      assert.deepEqual(
        sortComponents(ROWS, { key: 'essences', direction: 'desc', categoryMajor: true }).map((row) => row.name),
        ['Sage', 'Iron Ore', 'Copper Ore', 'Glass Vial']
      );
    });
  });

  it('does not mutate the input, and falls back to name for an unknown key', () => {
    const before = names(ROWS);
    sortComponents(ROWS, { key: 'nonsense' });
    assert.deepEqual(names(ROWS), before, 'the input array is untouched');
    assert.deepEqual(names(sortComponents(ROWS, { key: 'nonsense' })), names(sortComponents(ROWS, { key: 'name' })));
    assert.ok(COMPONENT_SORT_KEYS.includes('category'));
  });

  it('category options list every present category plus unused vocabulary, general LAST, each with its count', () => {
    // An authored-but-unused category must still be selectable, or a GM cannot see
    // that a category they created has nothing in it — and it reports `0` rather than
    // being silently indistinguishable from a populated one.
    assert.deepEqual(componentCategoryOptions(ROWS, ['Reagent', 'Metal']), [
      { name: 'Herb', count: 1 },
      { name: 'Metal', count: 2 },
      { name: 'Reagent', count: 0 },
      { name: 'general', count: 1 },
    ]);
    // `general` is never DUPLICATED out of the vocabulary — it is never persisted there.
    assert.deepEqual(componentCategoryOptions(ROWS, ['general']), [
      { name: 'Herb', count: 1 },
      { name: 'Metal', count: 2 },
      { name: 'general', count: 1 },
    ]);
    assert.deepEqual(componentCategoryOptions([], []), [{ name: 'general', count: 0 }]);
  });

  it('describes the active filters as dismissible chips', () => {
    assert.deepEqual(describeActiveComponentFilters({}), []);
    assert.deepEqual(
      describeActiveComponentFilters({ category: 'all', essence: 'all', search: '   ' }),
      [],
      'the neutral `all` sentinel and a whitespace-only search are not active filters'
    );
    assert.deepEqual(
      describeActiveComponentFilters({ category: 'Metal', essence: 'Earth', search: ' iron ' }),
      [
        { id: 'category', value: 'Metal' },
        { id: 'essence', value: 'Earth' },
        { id: 'search', value: 'iron' },
      ],
      'the search chip reports the TRIMMED term the GM actually filtered by'
    );
  });

  it('paginates and reports a 1-based inclusive range', () => {
    const page = paginateComponents(ROWS, { pageIndex: 1, pageSize: 2 });
    assert.deepEqual(names(page.components), ['Sage', 'Copper Ore']);
    assert.equal(page.pageCount, 2);
    assert.equal(page.totalCount, 4);
    assert.equal(page.rangeStart, 3);
    assert.equal(page.rangeEnd, 4);
  });

  it('clamps an out-of-range page so a shrinking filter cannot strand the pager', () => {
    const page = paginateComponents(ROWS, { pageIndex: 9, pageSize: 2 });
    assert.equal(page.pageIndex, 1, 'clamped to the last page');
    assert.deepEqual(names(page.components), ['Sage', 'Copper Ore']);
  });

  it('reports an empty range for an empty list', () => {
    const page = paginateComponents([], {});
    assert.deepEqual(page.components, []);
    assert.equal(page.rangeStart, 0);
    assert.equal(page.rangeEnd, 0);
    assert.equal(page.pageCount, 1);
  });

  // Issue 1036 review: `paginateComponents` now delegates to the shared `paginateRows`,
  // and the one input class no pinned test covered was a `pageSize` that is falsy but
  // NUMERIC. `Number(0)` and `Number(null)` are both finite, so neither reaches the
  // default — they reach `Math.max(1, 0)` and clamp to a one-row page. Unreachable
  // through `Pagination.svelte`'s `next > 0` guard, but it is what makes the extraction
  // self-evidently neutral rather than neutral-by-argument.
  it('clamps a zero or null pageSize to one row per page rather than defaulting', () => {
    for (const pageSize of [0, null]) {
      const page = paginateComponents(ROWS, { pageIndex: 0, pageSize });
      assert.deepEqual(names(page.components), ['Iron Ore'], `pageSize ${pageSize} yields ONE row`);
      assert.equal(page.pageCount, ROWS.length, `pageSize ${pageSize} yields one page per row`);
      assert.deepEqual([page.rangeStart, page.rangeEnd], [1, 1]);
    }
  });

  it('tolerates junk input throughout', () => {
    assert.deepEqual(filterComponents(null, {}), []);
    assert.deepEqual(sortComponents(null, {}), []);
    assert.deepEqual(groupComponentsByCategory(null), []);
    assert.deepEqual(paginateComponents(null, {}).components, []);
  });
});

// ── issue 1371 r12-list ──────────────────────────────────────────────────────────────────────
//
// The system rules list's toolbar draws the reference's THREE essence predicates and its FOUR sort
// keys. `proto:5533` offers `All essences | Carries any essence | No essences` before the per-essence
// entries, and `proto:5477-5479` is the predicate for each; `proto:5536` lists the sort keys
// `Name | Category | Essences | Tags`, and `proto:5485` orders the `Tags` key by tag count and then
// by name. `Salvage` survives as a recorded subject-only extra.
describe('the system rules list draws the reference’s essence predicates and Tags sort (issue 1371 r12-list)', () => {
  it('offers the two predicate sentinels as values no authored essence can collide with', () => {
    // `all` predates them and is the lifted view-state's persisted default; the two new ones take
    // the dunder form so a GM who names an essence `Any` or `None` can still filter by it.
    assert.equal(COMPONENT_ESSENCE_FILTER_ANY, '__any');
    assert.equal(COMPONENT_ESSENCE_FILTER_NONE, '__none');
  });

  it('`Carries any essence` keeps every row with at least one essence, whichever it is', () => {
    assert.deepEqual(names(filterComponents(ROWS, { essence: COMPONENT_ESSENCE_FILTER_ANY })), [
      'Iron Ore',
      'Sage',
    ]);
  });

  it('`No essences` keeps only the rows that carry none', () => {
    assert.deepEqual(names(filterComponents(ROWS, { essence: COMPONENT_ESSENCE_FILTER_NONE })), [
      'Glass Vial',
      'Copper Ore',
    ]);
  });

  it('and both compose with the category filter, so neither is a bypass', () => {
    assert.deepEqual(
      names(filterComponents(ROWS, { category: 'Metal', essence: COMPONENT_ESSENCE_FILTER_ANY })),
      ['Iron Ore']
    );
    assert.deepEqual(
      names(filterComponents(ROWS, { category: 'Metal', essence: COMPONENT_ESSENCE_FILTER_NONE })),
      ['Copper Ore']
    );
  });

  it('lists the sort keys in the reference’s order, with the subject-only Salvage LAST', () => {
    assert.deepEqual([...COMPONENT_SORT_KEYS], ['name', 'category', 'essences', 'tags', 'salvage']);
  });

  it('sorts by tag COUNT and then by name, in both directions', () => {
    const tagged = [
      { id: 't1', name: 'Dust', tags: [] },
      { id: 't2', name: 'Ash', tags: ['fuel', 'bulk'] },
      { id: 't3', name: 'Brimstone', tags: [] },
      { id: 't4', name: 'Cinder', tags: ['fuel'] },
      { id: 't5', name: 'Ember' },
    ];
    // A row with no `tags` array at all counts as zero rather than throwing, because the
    // projection blanks the field when the system hides tags.
    assert.deepEqual(names(sortComponents(tagged, { key: 'tags' })), [
      'Brimstone',
      'Dust',
      'Ember',
      'Cinder',
      'Ash',
    ]);
    assert.deepEqual(names(sortComponents(tagged, { key: 'tags', direction: 'desc' })), [
      'Ash',
      'Cinder',
      'Brimstone',
      'Dust',
      'Ember',
    ]);
  });
});

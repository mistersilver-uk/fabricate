/**
 * Issue 676 — the GM component library's pure list model.
 *
 * Covers AC1's grouping/filtering half at the model layer.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMPONENT_DEFAULT_PAGE_SIZE,
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

  it('tolerates junk input throughout', () => {
    assert.deepEqual(filterComponents(null, {}), []);
    assert.deepEqual(sortComponents(null, {}), []);
    assert.deepEqual(groupComponentsByCategory(null), []);
    assert.deepEqual(paginateComponents(null, {}).components, []);
  });
});

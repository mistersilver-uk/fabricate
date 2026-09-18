/** Issue 1688 — the adapter-driven list pipeline, over a synthetic adapter only. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEntityBrowserModel,
  describeActiveEntityFilters,
  filterEntities,
  groupEntitiesByCategory,
  paginateEntities,
  sortEntities,
} from '../../src/ui/model/entityBrowserModel.js';

const SPARE = 'spare';

const kindOf = (widget) => {
  const raw = typeof widget?.kind === 'string' ? widget.kind.trim() : '';
  return raw || SPARE;
};

const STATE_FILTER = {
  id: 'state',
  matches: (widget, value) => {
    if (value === 'on') return widget?.enabled !== false;
    if (value === 'off') return widget?.enabled === false;
    return true;
  },
};

const KIND_FILTER = {
  id: 'kind',
  matches: (widget, value) => value === 'all' || kindOf(widget) === value,
};

const GRADE_FILTER = {
  id: 'grade',
  allowed: ['all', 'fine', 'rough'],
  matches: (widget, value) => value === 'all' || widget?.grade === value,
};

/** Plain alphabetical category ordering, one unnamed bucket when grouping is off. */
const PLAIN = Object.freeze({
  rowsKey: 'widgets',
  sortKeys: Object.freeze(['name', 'tier']),
  defaultPageSize: 25,
  sortValues: Object.freeze({ tier: (widget) => Number(widget?.tier) || 0 }),
  categoryOf: kindOf,
  ungroupedGroups: 'single',
  filters: Object.freeze([STATE_FILTER, KIND_FILTER, GRADE_FILTER]),
});

/** The reserved bucket pinned last, a category sort key, and no buckets when grouping is off. */
const RESERVED_LAST = Object.freeze({
  ...PLAIN,
  sortKeys: Object.freeze(['name', 'kind', 'tier']),
  categorySortKey: 'kind',
  compareCategories: (left, right) => {
    if (left === right) return 0;
    if (left === SPARE) return 1;
    if (right === SPARE) return -1;
    return left.localeCompare(right);
  },
  ungroupedGroups: 'none',
});

/** An entity with no category at all, which therefore never groups. */
const FLAT = Object.freeze({
  rowsKey: 'widgets',
  sortKeys: Object.freeze(['name', 'tier']),
  defaultPageSize: 4,
  sortValues: PLAIN.sortValues,
  filters: Object.freeze([STATE_FILTER]),
  searchOf: (options) => (typeof options.search === 'string' ? options.search.trim() : ''),
});

const ROWS = [
  { id: 'a', name: 'Anvil', kind: 'forge', tier: 2, grade: 'fine' },
  { id: 'b', name: 'Bellows', kind: '  ', tier: 1, grade: 'rough' },
  { id: 'c', name: 'Crucible', kind: 'alchemy', tier: 2, grade: 'fine', enabled: false },
  { id: 'd', name: 'Alembic', kind: 'alchemy', tier: 1 },
  { id: 'e', name: 'Ember', tier: 3, grade: 'rough' },
];

const names = (rows) => rows.map((row) => row.name);

/** 30 rows, so an absent page size is the only value that reaches the adapter's default. */
const BULK = Array.from({ length: 30 }, (_, index) => ({
  id: `w${index}`,
  name: `Widget ${String(index).padStart(2, '0')}`,
  kind: index % 2 === 0 ? 'forge' : '',
  tier: index % 3,
}));

describe('entity browser model — filtering (issue 1688)', () => {
  it('applies every axis in the adapter, and treats a falsy value as the neutral `all`', () => {
    assert.deepEqual(names(filterEntities(ROWS, { state: 'off' }, PLAIN)), ['Crucible']);
    assert.deepEqual(names(filterEntities(ROWS, { kind: 'alchemy' }, PLAIN)), [
      'Crucible',
      'Alembic',
    ]);
    for (const value of [undefined, '', 0, null]) {
      assert.equal(filterEntities(ROWS, { state: value, kind: value }, PLAIN).length, ROWS.length);
    }
  });

  it('coerces an unrecognised value to `all` on an axis with an allowed list, and not otherwise', () => {
    assert.equal(filterEntities(ROWS, { grade: 'bogus' }, PLAIN).length, ROWS.length);
    assert.deepEqual(names(filterEntities(ROWS, { grade: 'fine' }, PLAIN)), ['Anvil', 'Crucible']);
    // `state` has no allowed list, so an unknown value reaches the predicate and matches nothing.
    assert.equal(filterEntities(ROWS, { state: 'bogus' }, PLAIN).length, ROWS.length);
  });

  it('answers an empty list for rows that are not an array', () => {
    for (const rows of [null, undefined, {}, 'nope']) {
      assert.deepEqual(filterEntities(rows, {}, PLAIN), []);
    }
  });
});

describe('entity browser model — sorting (issue 1688)', () => {
  it('falls back to name for an unknown key and honours the direction', () => {
    assert.deepEqual(names(sortEntities(ROWS, { key: 'bogus' }, PLAIN)), [
      'Alembic',
      'Anvil',
      'Bellows',
      'Crucible',
      'Ember',
    ]);
    assert.deepEqual(
      names(sortEntities(ROWS, { key: 'name', direction: 'desc' }, PLAIN)),
      ['Ember', 'Crucible', 'Bellows', 'Anvil', 'Alembic']
    );
  });

  it('breaks a tie on the sort value by ascending name, in both directions', () => {
    assert.deepEqual(names(sortEntities(ROWS, { key: 'tier' }, PLAIN)), [
      'Alembic',
      'Bellows',
      'Anvil',
      'Crucible',
      'Ember',
    ]);
    assert.deepEqual(names(sortEntities(ROWS, { key: 'tier', direction: 'desc' }, PLAIN)), [
      'Ember',
      'Anvil',
      'Crucible',
      'Alembic',
      'Bellows',
    ]);
  });

  it('orders category-major so each bucket is one contiguous run', () => {
    const sorted = sortEntities(ROWS, { key: 'name', categoryMajor: true }, PLAIN);
    assert.deepEqual(sorted.map(kindOf), ['alchemy', 'alchemy', 'forge', SPARE, SPARE]);
    assert.deepEqual(names(sorted), ['Alembic', 'Crucible', 'Anvil', 'Bellows', 'Ember']);
  });

  it('pins the reserved bucket last when the adapter supplies a comparator', () => {
    const sorted = sortEntities(ROWS, { key: 'name', categoryMajor: true }, RESERVED_LAST);
    assert.deepEqual(sorted.map(kindOf), ['alchemy', 'alchemy', 'forge', SPARE, SPARE]);
  });

  it('sorts on the category comparator for the category sort key, tiebreaking by name', () => {
    const descending = sortEntities(ROWS, { key: 'kind', direction: 'desc' }, RESERVED_LAST);
    assert.deepEqual(descending.map(kindOf), [SPARE, SPARE, 'forge', 'alchemy', 'alchemy']);
    // Under categoryMajor the buckets are always ascending, so the secondary is an ascending name.
    const major = sortEntities(
      ROWS,
      { key: 'kind', direction: 'desc', categoryMajor: true },
      RESERVED_LAST
    );
    assert.deepEqual(names(major), ['Alembic', 'Crucible', 'Anvil', 'Bellows', 'Ember']);
  });

  it('ignores categoryMajor for an adapter with no category', () => {
    assert.deepEqual(
      names(sortEntities(ROWS, { key: 'name', categoryMajor: true }, FLAT)),
      names(sortEntities(ROWS, { key: 'name' }, FLAT))
    );
  });
});

describe('entity browser model — pagination (issue 1688)', () => {
  it('slices under the adapter row-collection key and reads the page window', () => {
    const page = paginateEntities(ROWS, { pageIndex: 1, pageSize: 2 }, PLAIN);
    assert.deepEqual(names(page.widgets), ['Crucible', 'Alembic']);
    assert.deepEqual(
      { ...page, widgets: undefined },
      {
        widgets: undefined,
        pageIndex: 1,
        pageCount: 3,
        totalCount: 5,
        rangeStart: 3,
        rangeEnd: 4,
      }
    );
  });

  it('reaches the adapter default only when no page size is supplied', () => {
    assert.equal(paginateEntities(BULK, {}, PLAIN).widgets.length, 25);
    assert.equal(paginateEntities(BULK, {}, FLAT).widgets.length, 4);
    assert.equal(paginateEntities(BULK, { pageSize: 26 }, PLAIN).widgets.length, 26);
  });

  it('clamps a page index out of range and a page size below one', () => {
    assert.equal(paginateEntities(BULK, { pageIndex: 99 }, PLAIN).pageIndex, 1);
    assert.equal(paginateEntities(BULK, { pageIndex: -1 }, PLAIN).pageIndex, 0);
    assert.equal(paginateEntities(BULK, { pageIndex: 'x' }, PLAIN).pageIndex, 0);
    assert.equal(paginateEntities(BULK, { pageSize: 0 }, PLAIN).widgets.length, 1);
  });
});

describe('entity browser model — grouping (issue 1688)', () => {
  it('orders the buckets with the adapter comparator', () => {
    const plain = groupEntitiesByCategory(ROWS, undefined, PLAIN);
    assert.deepEqual(
      plain.map((group) => group.category),
      ['alchemy', 'forge', SPARE]
    );
    const reserved = groupEntitiesByCategory(ROWS, undefined, RESERVED_LAST);
    assert.deepEqual(
      reserved.map((group) => group.category),
      ['alchemy', 'forge', SPARE]
    );
  });

  it('reads the cohort total from the map, and never below the rendered count', () => {
    const totals = new Map([
      ['alchemy', 9],
      ['forge', 0],
    ]);
    const groups = groupEntitiesByCategory(ROWS, totals, PLAIN);
    assert.deepEqual(
      groups.map((group) => [group.category, group.widgets.length, group.total]),
      [
        ['alchemy', 2, 9],
        ['forge', 1, 1],
        [SPARE, 2, 2],
      ]
    );
  });
});

describe('entity browser model — chips (issue 1688)', () => {
  it('emits one chip per active axis, in the adapter filter order', () => {
    assert.deepEqual(
      describeActiveEntityFilters({ grade: 'fine', kind: 'forge', state: 'on' }, PLAIN),
      [
        { id: 'state', value: 'on' },
        { id: 'kind', value: 'forge' },
        { id: 'grade', value: 'fine' },
      ]
    );
    assert.deepEqual(describeActiveEntityFilters({ state: 'all', kind: '' }, PLAIN), []);
  });

  it('coerces the search term by default and defers to the adapter reader when it has one', () => {
    assert.deepEqual(describeActiveEntityFilters({ search: 42 }, PLAIN), [
      { id: 'search', value: '42' },
    ]);
    assert.deepEqual(describeActiveEntityFilters({ search: 42 }, FLAT), []);
    assert.deepEqual(describeActiveEntityFilters({ search: '  x  ' }, FLAT), [
      { id: 'search', value: 'x' },
    ]);
  });
});

describe('entity browser model — the assembled model (issue 1688)', () => {
  it('counts the category totals over the filtered cohort, before pagination', () => {
    const model = buildEntityBrowserModel(
      BULK,
      { categoryMajor: true, pageSize: 3, key: 'name' },
      PLAIN
    );
    assert.equal(model.page.length, 3);
    assert.equal(model.totalCount, 30);
    assert.deepEqual(
      [...model.categoryTotals.entries()].sort(([a], [b]) => a.localeCompare(b)),
      [
        ['forge', 15],
        [SPARE, 15],
      ]
    );
    assert.deepEqual(
      model.groups.map((group) => [group.category, group.total]),
      [['forge', 15]]
    );
  });

  it('emits one unnamed bucket when grouping is off and the adapter asks for it', () => {
    const model = buildEntityBrowserModel(ROWS, { key: 'name' }, PLAIN);
    assert.equal(model.groups.length, 1);
    assert.deepEqual(model.groups[0].category, '');
    assert.deepEqual(names(model.groups[0].widgets), names(model.page));
    assert.equal(model.groups[0].total, 5);
  });

  it('emits no buckets when grouping is off and the adapter asks for none', () => {
    assert.deepEqual(buildEntityBrowserModel(ROWS, { key: 'name' }, RESERVED_LAST).groups, []);
    assert.deepEqual(buildEntityBrowserModel(ROWS, { key: 'name' }, FLAT).groups, []);
  });

  it('holds the filtered cohort unsorted and the sorted cohort whole', () => {
    const model = buildEntityBrowserModel(
      ROWS,
      { key: 'name', direction: 'desc', pageSize: 2 },
      PLAIN
    );
    assert.deepEqual(names(model.filtered), names(ROWS));
    assert.deepEqual(names(model.sorted), ['Ember', 'Crucible', 'Bellows', 'Anvil', 'Alembic']);
    assert.deepEqual(names(model.page), ['Ember', 'Crucible']);
    assert.deepEqual(model.chips, []);
  });

  it('never groups, and counts nothing, for an adapter with no category', () => {
    const model = buildEntityBrowserModel(ROWS, { categoryMajor: true }, FLAT);
    assert.deepEqual(model.groups, []);
    assert.equal(model.categoryTotals.size, 0);
  });
});

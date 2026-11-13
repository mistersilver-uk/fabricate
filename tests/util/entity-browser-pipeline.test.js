/**
 * Issue 1815 — the pipeline cases the recipe, component and essence browser models share through
 * `src/ui/model/entityBrowserModel.js`, written once and run per entity. Every entity is driven
 * through its OWN public export names, never the generic ones, and the expected values are the
 * ones the three per-entity suites pinned before this fold.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createComponentBrowserState,
  paginateComponents,
  sortComponents,
} from '../../src/ui/model/componentBrowserModel.js';
import {
  buildEssenceBrowserModel,
  createEssenceBrowserState,
  sortEssences,
} from '../../src/ui/model/essenceBrowserModel.js';
import {
  createRecipeBrowserState,
  paginateRecipes,
  sortRecipes,
} from '../../src/ui/model/recipeBrowserModel.js';

const ids = (rows) => rows.map((row) => row.id);

const ENTITIES = [
  {
    name: 'recipe',
    createState: createRecipeBrowserState,
    selectionSetKey: 'collapsedCategories',
    paginate: (list, options) => {
      const page = paginateRecipes(list, options);
      return { ...page, rows: page.recipes };
    },
    sort: sortRecipes,
  },
  {
    name: 'component',
    createState: createComponentBrowserState,
    selectionSetKey: 'collapsedCategories',
    paginate: (list, options) => {
      const page = paginateComponents(list, options);
      return { ...page, rows: page.components };
    },
    sort: sortComponents,
  },
  {
    name: 'essence',
    createState: createEssenceBrowserState,
    selectionSetKey: 'bulkSelectedEssenceIds',
    paginate: (list, options) => {
      const model = buildEssenceBrowserModel(list, options);
      return { ...model, rows: model.essences };
    },
    sort: sortEssences,
  },
];

const SEVEN = Array.from({ length: 7 }, (_, index) => ({ id: `r${index}`, name: `R${index}` }));

describe('shared browser pipeline, one table-driven suite', () => {
  it('covers exactly the three entities', () => {
    assert.equal(ENTITIES.length, 3);
    assert.deepEqual(
      ENTITIES.map((entity) => entity.name),
      ['recipe', 'component', 'essence']
    );
  });

  for (const entity of ENTITIES) {
    describe(entity.name, () => {
      it('creates a FRESH view state with a fresh Set each call', () => {
        const first = entity.createState();
        const second = entity.createState();
        assert.notEqual(first, second);
        assert.notEqual(first[entity.selectionSetKey], second[entity.selectionSetKey]);
        first[entity.selectionSetKey].add('probe');
        assert.equal(second[entity.selectionSetKey].has('probe'), false);
      });

      it('slices the requested page and counts the pages and rows', () => {
        const page = entity.paginate(SEVEN, { pageIndex: 1, pageSize: 3 });
        assert.deepEqual(ids(page.rows), ['r3', 'r4', 'r5']);
        assert.equal(page.pageCount, 3);
        assert.equal(page.totalCount, 7);
      });

      it('clamps an out-of-range page index back into the list', () => {
        const page = entity.paginate(SEVEN, { pageIndex: 99, pageSize: 3 });
        assert.equal(page.pageIndex, 2);
        assert.deepEqual(ids(page.rows), ['r6']);
      });

      it('reports one empty page, with range 0..0 rather than 1..0, for an empty list', () => {
        const page = entity.paginate([], { pageIndex: 0, pageSize: 10 });
        assert.deepEqual(page.rows, []);
        assert.equal(page.pageCount, 1);
        assert.equal(page.pageIndex, 0);
        assert.deepEqual([page.rangeStart, page.rangeEnd], [0, 0]);
      });

      it('reports the page window as a 1-based inclusive range', () => {
        assert.deepEqual(
          [0, 1, 2]
            .map((pageIndex) => entity.paginate(SEVEN, { pageIndex, pageSize: 3 }))
            .map((page) => [page.rangeStart, page.rangeEnd]),
          [
            [1, 3],
            [4, 6],
            [7, 7],
          ]
        );
      });

      it('clamps a zero or null pageSize to one row per page rather than defaulting', () => {
        for (const pageSize of [0, null]) {
          const page = entity.paginate(SEVEN, { pageIndex: 0, pageSize });
          assert.deepEqual(ids(page.rows), ['r0'], `pageSize ${pageSize} yields ONE row`);
          assert.equal(
            page.pageCount,
            SEVEN.length,
            `pageSize ${pageSize} yields one page per row`
          );
          assert.deepEqual([page.rangeStart, page.rangeEnd], [1, 1]);
        }
      });

      it('sorts a copy: name descending reverses the order and the input is untouched', () => {
        const input = [
          { id: 'b', name: 'Beta' },
          { id: 'a', name: 'Alpha' },
          { id: 'g', name: 'Gamma' },
        ];
        const sorted = entity.sort(input, { key: 'name', direction: 'desc' });
        assert.deepEqual(ids(sorted), ['g', 'b', 'a']);
        assert.deepEqual(ids(input), ['b', 'a', 'g']);
      });
    });
  }
});

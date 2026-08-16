/**
 * Cohort-scoped counting for the two GM libraries (issue 1081).
 *
 * Page-scoping the row projection makes ONE number dangerous: a group header's category
 * total. Grouping is applied to the PAGE — the pager is the unit of truth for how many rows
 * are on screen — so the total beside the rendered count has to come from the FILTERED
 * COHORT, and the array nearest to hand once projection is page-scoped is the page.
 *
 * `categoryTotalOf` (`browserGroupCounts.js`) cannot catch that mistake: it guards one
 * direction only, falling back to the rendered count whenever the supplied total is not
 * strictly greater. A total counted over a NARROWER cohort than what is rendered therefore
 * collapses silently to the rendered count and the header reads plausibly and wrongly.
 *
 * So the fixtures below are built so the two answers DIFFER, and each assertion is paired
 * with the page-scoped number it must not be. A fixture whose page happens to hold the whole
 * category would pass against either implementation and would prove nothing.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { countByCategory } from '../src/utils/browserGroupCounts.js';
import { buildRecipeBrowserModel, recipeCategoryOf } from '../src/utils/recipeBrowserModel.js';
import {
  buildComponentBrowserModel,
  componentCategoryOf,
} from '../src/utils/componentBrowserModel.js';

/** Deliberately > one page (25) in the first bucket, so page 1 cannot hold the category. */
const ALCHEMY_ROWS = 40;
const SMITHING_ROWS = 20;
const PAGE_SIZE = 25;

function recipeRows() {
  const rows = [];
  for (let index = 0; index < ALCHEMY_ROWS; index += 1) {
    rows.push({
      id: `alchemy-${index}`,
      // Zero-padded so the name order is the index order and the page contents are
      // predictable rather than lexicographically shuffled.
      name: `Alchemy ${String(index).padStart(3, '0')}`,
      category: 'alchemy',
      enabled: true,
      locked: false,
    });
  }
  for (let index = 0; index < SMITHING_ROWS; index += 1) {
    rows.push({
      id: `smithing-${index}`,
      name: `Smithing ${String(index).padStart(3, '0')}`,
      category: 'smithing',
      enabled: true,
      locked: false,
    });
  }
  return rows;
}

function componentRows() {
  return recipeRows().map((row) => ({ ...row, essences: [], salvageSummary: null }));
}

describe('GM recipe library: category totals are cohort-scoped, never page-scoped', () => {
  const options = {
    status: 'all',
    lock: 'all',
    category: 'all',
    sortKey: 'name',
    sortDirection: 'asc',
    groupByCategory: true,
    pageSize: PAGE_SIZE,
  };

  it('reports the FILTERED-cohort total beside a rendered count that differs from it', () => {
    const model = buildRecipeBrowserModel(recipeRows(), { ...options, pageIndex: 0 });

    const alchemy = model.groups.find((group) => group.category === 'alchemy');
    assert.ok(alchemy, 'page 1 renders the alchemy bucket');
    assert.equal(alchemy.recipes.length, PAGE_SIZE, 'the page renders 25 alchemy rows');
    assert.equal(alchemy.total, ALCHEMY_ROWS, 'the header total is the whole filtered bucket');

    // The number the page-scoped mistake would have produced, computed here so the fixture
    // proves the two answers genuinely differ rather than merely agreeing.
    const pageScoped = countByCategory(model.page, recipeCategoryOf);
    assert.equal(pageScoped.get('alchemy'), PAGE_SIZE);
    assert.notEqual(
      pageScoped.get('alchemy'),
      alchemy.total,
      'the fixture is non-vacuous: page-scoped and cohort-scoped counting disagree here'
    );
  });

  it('keeps the total constant across pages while the rendered count changes', () => {
    const first = buildRecipeBrowserModel(recipeRows(), { ...options, pageIndex: 0 });
    const second = buildRecipeBrowserModel(recipeRows(), { ...options, pageIndex: 1 });

    const firstAlchemy = first.groups.find((group) => group.category === 'alchemy');
    const secondAlchemy = second.groups.find((group) => group.category === 'alchemy');
    const secondSmithing = second.groups.find((group) => group.category === 'smithing');

    assert.equal(firstAlchemy.recipes.length, 25);
    assert.equal(secondAlchemy.recipes.length, 15, 'the bucket spans the page boundary');
    assert.equal(secondSmithing.recipes.length, 10);

    assert.equal(firstAlchemy.total, ALCHEMY_ROWS);
    assert.equal(secondAlchemy.total, ALCHEMY_ROWS, 'the total does not follow the page');
    assert.equal(secondSmithing.total, SMITHING_ROWS);
  });

  it('counts over the FILTERED cohort, not the raw roster', () => {
    const rows = recipeRows().map((row, index) =>
      row.category === 'alchemy' && index % 2 === 0 ? { ...row, enabled: false } : row
    );
    const model = buildRecipeBrowserModel(rows, { ...options, status: 'on', pageIndex: 0 });

    const alchemy = model.groups.find((group) => group.category === 'alchemy');
    assert.equal(alchemy.total, ALCHEMY_ROWS / 2, 'the status filter narrows the total too');
    assert.equal(model.categoryTotals.get('alchemy'), ALCHEMY_ROWS / 2);
    assert.notEqual(alchemy.total, ALCHEMY_ROWS, 'a roster-scoped total would have been 40');
  });

  it('exports the cohort totals so a caller cannot have to recount the page', () => {
    const model = buildRecipeBrowserModel(recipeRows(), { ...options, pageIndex: 0 });
    assert.ok(model.categoryTotals instanceof Map);
    assert.deepEqual(
      [...model.categoryTotals.entries()].sort(([a], [b]) => a.localeCompare(b)),
      [
        ['alchemy', ALCHEMY_ROWS],
        ['smithing', SMITHING_ROWS],
      ]
    );
  });
});

describe('GM component library: category totals are cohort-scoped, never page-scoped', () => {
  const options = {
    category: 'all',
    essence: 'all',
    sortKey: 'name',
    sortDirection: 'asc',
    groupByCategory: true,
    pageSize: PAGE_SIZE,
  };

  it('reports the FILTERED-cohort total beside a rendered count that differs from it', () => {
    const model = buildComponentBrowserModel(componentRows(), { ...options, pageIndex: 0 });

    const alchemy = model.groups.find((group) => group.category === 'alchemy');
    assert.ok(alchemy, 'page 1 renders the alchemy bucket');
    assert.equal(alchemy.components.length, PAGE_SIZE);
    assert.equal(alchemy.total, ALCHEMY_ROWS);

    const pageScoped = countByCategory(model.page, componentCategoryOf);
    assert.equal(pageScoped.get('alchemy'), PAGE_SIZE);
    assert.notEqual(
      pageScoped.get('alchemy'),
      alchemy.total,
      'the fixture is non-vacuous: page-scoped and cohort-scoped counting disagree here'
    );
  });

  it('keeps the total constant across pages while the rendered count changes', () => {
    const second = buildComponentBrowserModel(componentRows(), { ...options, pageIndex: 1 });
    const alchemy = second.groups.find((group) => group.category === 'alchemy');
    const smithing = second.groups.find((group) => group.category === 'smithing');

    assert.equal(alchemy.components.length, 15);
    assert.equal(alchemy.total, ALCHEMY_ROWS);
    assert.equal(smithing.components.length, 10);
    assert.equal(smithing.total, SMITHING_ROWS);
  });

  it('narrows the total with the category/essence filters', () => {
    const rows = componentRows().map((row, index) =>
      row.category === 'alchemy' && index % 4 === 0
        ? { ...row, essences: [{ id: 'fire', name: 'Fire' }] }
        : row
    );
    const model = buildComponentBrowserModel(rows, { ...options, essence: 'Fire', pageIndex: 0 });

    assert.equal(model.totalCount, ALCHEMY_ROWS / 4);
    assert.equal(model.categoryTotals.get('alchemy'), ALCHEMY_ROWS / 4);
  });

  it('is the one place the four pipeline steps compose, page window included', () => {
    const model = buildComponentBrowserModel(componentRows(), { ...options, pageIndex: 1 });
    assert.equal(model.totalCount, ALCHEMY_ROWS + SMITHING_ROWS);
    assert.equal(model.pageIndex, 1);
    assert.equal(model.pageCount, 3);
    assert.equal(model.rangeStart, 26);
    assert.equal(model.rangeEnd, 50);
    assert.equal(model.page.length, PAGE_SIZE);
  });
});

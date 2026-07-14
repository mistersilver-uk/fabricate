import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECIPE_DEFAULT_PAGE_SIZE,
  attentionRank,
  buildRecipeBrowserModel,
  deriveRecipeIo,
  deriveRecipeStatuses,
  describeActiveFilters,
  filterRecipes,
  groupRecipesByCategory,
  paginateRecipes,
  sortRecipes
} from '../../src/utils/recipeBrowserModel.js';

function makeRecipe(overrides = {}) {
  return {
    id: overrides.id || 'r1',
    name: overrides.name || 'Recipe',
    category: 'general',
    enabled: true,
    locked: false,
    incomplete: false,
    ingredientCount: 0,
    resultItemCount: 0,
    resultGroupCount: 0,
    checkSummary: { kind: 'none', dc: null },
    ...overrides
  };
}

const names = (rows) => rows.map((row) => row.name);

describe('recipeBrowserModel — filtering', () => {
  const rows = [
    makeRecipe({ id: 'a', name: 'Alpha', enabled: true, locked: false, category: 'alchemy' }),
    makeRecipe({ id: 'b', name: 'Bravo', enabled: false, locked: true, category: 'smithing' }),
    makeRecipe({ id: 'c', name: 'Charlie', enabled: true, locked: true, category: 'alchemy' })
  ];

  it('defaults to every recipe', () => {
    assert.deepEqual(names(filterRecipes(rows, {})), ['Alpha', 'Bravo', 'Charlie']);
  });

  it('filters by status', () => {
    assert.deepEqual(names(filterRecipes(rows, { status: 'on' })), ['Alpha', 'Charlie']);
    assert.deepEqual(names(filterRecipes(rows, { status: 'off' })), ['Bravo']);
  });

  it('filters by lock state independently of status', () => {
    assert.deepEqual(names(filterRecipes(rows, { lock: 'locked' })), ['Bravo', 'Charlie']);
    assert.deepEqual(names(filterRecipes(rows, { lock: 'unlocked' })), ['Alpha']);
    assert.deepEqual(names(filterRecipes(rows, { status: 'on', lock: 'locked' })), ['Charlie']);
  });

  it('filters by category, treating a blank category as general', () => {
    assert.deepEqual(names(filterRecipes(rows, { category: 'alchemy' })), ['Alpha', 'Charlie']);
    const uncategorized = [makeRecipe({ name: 'Nameless', category: '  ' })];
    assert.deepEqual(names(filterRecipes(uncategorized, { category: 'general' })), ['Nameless']);
  });
});

describe('recipeBrowserModel — sorting', () => {
  const rows = [
    makeRecipe({ name: 'Beta', ingredientCount: 3, resultItemCount: 1, checkSummary: { dc: 18 } }),
    makeRecipe({ name: 'Alpha', ingredientCount: 10, resultItemCount: 4, checkSummary: { dc: 9 } }),
    makeRecipe({ name: 'Gamma', ingredientCount: 1, resultItemCount: 2, checkSummary: { dc: 30 } })
  ];

  it('sorts by name ascending by default and flips on direction', () => {
    assert.deepEqual(names(sortRecipes(rows, {})), ['Alpha', 'Beta', 'Gamma']);
    assert.deepEqual(names(sortRecipes(rows, { key: 'name', direction: 'desc' })), ['Gamma', 'Beta', 'Alpha']);
  });

  it('sorts numeric keys numerically, not lexicographically', () => {
    // A comparator-less Array#sort() would put 10 before 3 here (and fails Sonar).
    assert.deepEqual(names(sortRecipes(rows, { key: 'ingredients' })), ['Gamma', 'Beta', 'Alpha']);
    assert.deepEqual(names(sortRecipes(rows, { key: 'dc' })), ['Alpha', 'Beta', 'Gamma']);
    assert.deepEqual(names(sortRecipes(rows, { key: 'results' })), ['Beta', 'Gamma', 'Alpha']);
  });

  it('ranks attention as blocked > incomplete > clear and tiebreaks by name', () => {
    const blocked = makeRecipe({ name: 'Blocked', incomplete: true, enabled: false });
    const incomplete = makeRecipe({ name: 'Incomplete', incomplete: true, enabled: true });
    const clear = makeRecipe({ name: 'Clear' });

    assert.equal(attentionRank(blocked), 2);
    assert.equal(attentionRank(incomplete), 1);
    assert.equal(attentionRank(clear), 0);
    assert.deepEqual(
      names(sortRecipes([clear, incomplete, blocked], { key: 'attention', direction: 'desc' })),
      ['Blocked', 'Incomplete', 'Clear']
    );
  });

  it('does not mutate the input array', () => {
    const input = [...rows];
    sortRecipes(input, { key: 'name', direction: 'desc' });
    assert.deepEqual(names(input), ['Beta', 'Alpha', 'Gamma']);
  });

  it('falls back to name for an unknown sort key', () => {
    assert.deepEqual(names(sortRecipes(rows, { key: 'bogus' })), ['Alpha', 'Beta', 'Gamma']);
  });
});

describe('recipeBrowserModel — grouping', () => {
  it('buckets by category, name-orders the buckets and preserves row order inside', () => {
    const groups = groupRecipesByCategory([
      makeRecipe({ name: 'Zinc', category: 'smithing' }),
      makeRecipe({ name: 'Acid', category: 'alchemy' }),
      makeRecipe({ name: 'Brew', category: 'alchemy' })
    ]);

    assert.deepEqual(groups.map((group) => group.category), ['alchemy', 'smithing']);
    assert.deepEqual(names(groups[0].recipes), ['Acid', 'Brew']);
    assert.deepEqual(names(groups[1].recipes), ['Zinc']);
  });
});

describe('recipeBrowserModel — pagination boundaries', () => {
  const rows = Array.from({ length: 7 }, (_, index) => makeRecipe({ id: `r${index}`, name: `R${index}` }));

  it('slices the requested page', () => {
    const page = paginateRecipes(rows, { pageIndex: 1, pageSize: 3 });
    assert.deepEqual(names(page.recipes), ['R3', 'R4', 'R5']);
    assert.equal(page.pageCount, 3);
    assert.equal(page.totalCount, 7);
  });

  it('clamps an out-of-range page index back into the list', () => {
    const page = paginateRecipes(rows, { pageIndex: 99, pageSize: 3 });
    assert.equal(page.pageIndex, 2);
    assert.deepEqual(names(page.recipes), ['R6']);
  });

  it('reports one empty page for an empty list', () => {
    const page = paginateRecipes([], { pageIndex: 0, pageSize: 10 });
    assert.deepEqual(page.recipes, []);
    assert.equal(page.pageCount, 1);
    assert.equal(page.pageIndex, 0);
  });

  it('defaults to a page size that clears the smoke fixture recipe count', () => {
    // The smoke harness waits for a VISIBLE row and throws "Manager rendered no
    // table rows" on zero, so the default page must hold the fixture's recipes.
    assert.ok(RECIPE_DEFAULT_PAGE_SIZE > 6);
  });
});

describe('recipeBrowserModel — row derivations', () => {
  it('always reports N in and reports N out only in simple and progressive', () => {
    const recipe = makeRecipe({ ingredientCount: 2, resultItemCount: 5, resultGroupCount: 3 });

    for (const mode of ['simple', 'progressive']) {
      assert.deepEqual(deriveRecipeIo(recipe, mode), { inCount: 2, outKind: 'items', outCount: 5, empty: false });
    }
    for (const mode of ['routedByIngredients', 'routedByCheck', 'alchemy']) {
      assert.deepEqual(deriveRecipeIo(recipe, mode), { inCount: 2, outKind: 'groups', outCount: 3, empty: false });
    }
  });

  it('flags an empty output readout', () => {
    const recipe = makeRecipe({ ingredientCount: 1, resultItemCount: 0, resultGroupCount: 0 });
    assert.equal(deriveRecipeIo(recipe, 'simple').empty, true);
    assert.equal(deriveRecipeIo(recipe, 'routedByCheck').empty, true);
  });

  it('derives the four row states', () => {
    assert.deepEqual(deriveRecipeStatuses(makeRecipe({})), []);
    assert.deepEqual(
      deriveRecipeStatuses(makeRecipe({ enabled: false })).map((pill) => pill.id),
      ['disabled']
    );
    assert.deepEqual(
      deriveRecipeStatuses(makeRecipe({ locked: true })).map((pill) => [pill.id, pill.tone]),
      [['locked', 'accent']]
    );
    // Off + incomplete: enabling would be REFUSED, so the row says "can't enable".
    assert.deepEqual(
      deriveRecipeStatuses(makeRecipe({ enabled: false, incomplete: true })).map((pill) => [pill.id, pill.tone]),
      [['disabled', 'subtle'], ['blocked', 'danger']]
    );
    // On + incomplete: nothing is being refused, it is just unfinished.
    assert.deepEqual(
      deriveRecipeStatuses(makeRecipe({ enabled: true, incomplete: true })).map((pill) => [pill.id, pill.tone]),
      [['incomplete', 'warning']]
    );
  });
});

describe('recipeBrowserModel — active-filter chips', () => {
  it('lists only the non-default filters, including the search term', () => {
    assert.deepEqual(describeActiveFilters({}), []);
    assert.deepEqual(describeActiveFilters({ status: 'all', lock: 'all', category: 'all', search: '  ' }), []);
    assert.deepEqual(
      describeActiveFilters({ status: 'off', lock: 'locked', category: 'alchemy', search: ' ink ' }),
      [
        { id: 'status', value: 'off' },
        { id: 'lock', value: 'locked' },
        { id: 'category', value: 'alchemy' },
        { id: 'search', value: 'ink' }
      ]
    );
  });
});

describe('recipeBrowserModel — the whole pipeline', () => {
  const rows = [
    makeRecipe({ id: 'a', name: 'Acid Flask', category: 'alchemy', ingredientCount: 4 }),
    makeRecipe({ id: 'b', name: 'Bronze Ingot', category: 'smithing', enabled: false, ingredientCount: 2 }),
    makeRecipe({ id: 'c', name: 'Cure Draught', category: 'alchemy', ingredientCount: 6 })
  ];

  it('filters, sorts, paginates and groups the page', () => {
    const model = buildRecipeBrowserModel(rows, {
      status: 'on',
      sortKey: 'ingredients',
      sortDirection: 'desc',
      groupByCategory: true,
      pageSize: 10
    });

    assert.deepEqual(names(model.filtered), ['Cure Draught', 'Acid Flask']);
    assert.deepEqual(model.groups.map((group) => group.category), ['alchemy']);
    assert.deepEqual(names(model.groups[0].recipes), ['Cure Draught', 'Acid Flask']);
    assert.deepEqual(model.chips, [{ id: 'status', value: 'on' }]);
    assert.equal(model.pageCount, 1);
  });

  it('emits one unnamed group when grouping is off', () => {
    const model = buildRecipeBrowserModel(rows, { groupByCategory: false, pageSize: 10 });
    assert.equal(model.groups.length, 1);
    assert.equal(model.groups[0].category, '');
    assert.equal(model.groups[0].recipes.length, 3);
  });
});

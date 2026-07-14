import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECIPE_DEFAULT_PAGE_SIZE,
  attentionRank,
  buildRecipeBrowserModel,
  buildRecipeProduceRows,
  buildRecipeRequirementRows,
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

  // The library's count reads "1–5 of 12". A bare "5 of 12" never told the GM WHICH page
  // they were on, which is the whole job of a count above a paged list.
  it('reports the page window as a 1-based inclusive range', () => {
    assert.deepEqual(
      [0, 1, 2]
        .map((pageIndex) => paginateRecipes(rows, { pageIndex, pageSize: 3 }))
        .map((page) => [page.rangeStart, page.rangeEnd]),
      [
        [1, 3],
        [4, 6],
        [7, 7],
      ]
    );
  });

  it('reports an empty range for an empty list rather than 1-0', () => {
    const page = paginateRecipes([], { pageIndex: 0, pageSize: 10 });
    assert.deepEqual([page.rangeStart, page.rangeEnd], [0, 0]);
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

// ---------------------------------------------------------------------------
// The library inspector's Requires / Produces lists (issue 643 §3.3).
//
// Both walk the same nested shape — execution scope (the recipe, or each step) ->
// sets / result groups -> options / results — so both are exercised against the same
// two fixtures: a single-scope recipe and a multi-step one.
// ---------------------------------------------------------------------------

const COMPONENTS = [
  { id: 'cmp-herb', name: 'Mountain Herb', img: 'icons/herb.webp' },
  { id: 'cmp-potion', name: 'Healing Potion', img: 'icons/potion.webp' },
  { id: 'cmp-sludge', name: 'Sludge', img: '' }
];
const ESSENCES = [{ id: 'fire', name: 'Fire', icon: 'fas fa-fire' }];

const SINGLE_SCOPE = {
  id: 'r1',
  ingredientSets: [
    {
      id: 'set-1',
      name: 'Primary',
      essences: { fire: 2 },
      ingredientGroups: [
        {
          id: 'grp-1',
          options: [
            { id: 'o1', quantity: 2, match: { type: 'component', componentId: 'cmp-herb' } },
            {
              id: 'o2',
              quantity: 1,
              match: { type: 'tags', tags: ['herbal', 'rare'], tagMatch: 'all' }
            },
            { id: 'o3', quantity: 1, match: { type: 'currency', unit: 'gp', amount: 25 } }
          ]
        }
      ]
    }
  ],
  resultGroups: [
    {
      id: 'g-success',
      name: 'On success',
      results: [{ id: 'res-1', componentId: 'cmp-potion', quantity: 2 }]
    },
    {
      id: 'g-failure',
      name: 'On a failed check',
      role: 'failure',
      results: [{ id: 'res-2', componentId: 'cmp-sludge', quantity: 1 }]
    }
  ]
};

describe('recipeBrowserModel — the inspector Requires list', () => {
  const rows = buildRecipeRequirementRows(SINGLE_SCOPE, {
    componentOptions: COMPONENTS,
    essenceOptions: ESSENCES
  });

  it('reports each option AS ITS OWN MATCH TYPE, never flattened into a component', () => {
    assert.deepEqual(
      rows.map((row) => row.kind),
      ['component', 'tags', 'currency', 'essence'],
      'the three real match types, then the set-scoped essence requirement'
    );
    assert.equal(rows[0].name, 'Mountain Herb');
    assert.equal(rows[0].img, 'icons/herb.webp');
    assert.equal(rows[0].quantity, 2);
    assert.deepEqual(rows[1].tags, ['herbal', 'rare']);
    assert.equal(rows[1].tagMatch, 'all', 'tagMatch is carried, not dropped');
    assert.deepEqual([rows[2].unit, rows[2].amount], ['gp', 25]);
  });

  it('flags every option after the first as an ALTERNATIVE (any one satisfies the requirement)', () => {
    assert.deepEqual(
      rows.map((row) => row.alternative),
      [false, true, true, false],
      'the OR alternatives are flagged; the set-scoped essence is an AND requirement'
    );
  });

  it('carries the per-SET essence requirement with its resolved name and amount', () => {
    const essence = rows.at(-1);
    assert.equal(essence.name, 'Fire');
    assert.equal(essence.quantity, 2);
    assert.equal(essence.setId, 'set-1');
  });

  it('leaves an unresolvable component NAMELESS rather than inventing one', () => {
    const [row] = buildRecipeRequirementRows(
      {
        ingredientSets: [
          {
            id: 's',
            ingredientGroups: [
              {
                id: 'g',
                options: [{ id: 'o', match: { type: 'component', componentId: 'gone' } }]
              }
            ]
          }
        ]
      },
      { componentOptions: COMPONENTS }
    );
    assert.equal(row.name, '', 'the caller localizes the "unknown component" fallback');
    assert.equal(row.componentId, 'gone', 'the id survives so the GM can still trace it');
    assert.equal(row.quantity, 1, 'a missing quantity defaults to 1');
  });
});

describe('recipeBrowserModel — the inspector Produces list', () => {
  const rows = buildRecipeProduceRows(SINGLE_SCOPE, { componentOptions: COMPONENTS });

  it('reports each result item with its group, name, image and quantity', () => {
    const success = rows.find((row) => row.groupId === 'g-success');
    assert.equal(success.name, 'Healing Potion');
    assert.equal(success.img, 'icons/potion.webp');
    assert.equal(success.quantity, 2);
    assert.equal(success.groupName, 'On success');
    assert.equal(success.failure, false);
  });

  it("marks the reserved role: 'failure' group so it is never shown as an output", () => {
    const failure = rows.find((row) => row.groupId === 'g-failure');
    assert.equal(
      failure.failure,
      true,
      'what a FAILED craft makes is not what the recipe produces'
    );
  });

  it('returns an empty list for a recipe with no results — the danger state, not an error', () => {
    assert.deepEqual(buildRecipeProduceRows({ resultGroups: [] }, {}), []);
    assert.deepEqual(buildRecipeProduceRows({}, {}), []);
  });
});

describe('recipeBrowserModel — multi-step recipes', () => {
  const MULTI_STEP = {
    id: 'r2',
    steps: [
      {
        id: 'step-1',
        name: 'Macerate',
        ingredientSets: [
          {
            id: 's1',
            essences: { fire: 1 },
            ingredientGroups: [
              {
                id: 'g1',
                options: [
                  { id: 'o1', quantity: 3, match: { type: 'component', componentId: 'cmp-herb' } }
                ]
              }
            ]
          }
        ],
        resultGroups: [
          { id: 'rg1', name: 'Pulp', results: [{ id: 'x1', componentId: 'cmp-sludge', quantity: 1 }] }
        ]
      },
      {
        id: 'step-2',
        name: 'Distil',
        ingredientSets: [
          {
            id: 's2',
            ingredientGroups: [
              {
                id: 'g2',
                options: [
                  { id: 'o2', quantity: 1, match: { type: 'component', componentId: 'cmp-sludge' } }
                ]
              }
            ]
          }
        ],
        resultGroups: [
          {
            id: 'rg2',
            name: 'On success',
            results: [{ id: 'x2', componentId: 'cmp-potion', quantity: 1 }]
          }
        ]
      }
    ]
  };

  it('walks EVERY step, tagging each row with the step it belongs to', () => {
    const requires = buildRecipeRequirementRows(MULTI_STEP, {
      componentOptions: COMPONENTS,
      essenceOptions: ESSENCES
    });
    assert.deepEqual(
      requires.map((row) => [row.scopeName, row.kind]),
      [
        ['Macerate', 'component'],
        ['Macerate', 'essence'],
        ['Distil', 'component']
      ],
      'a step-scoped requirement is not silently attributed to the recipe'
    );

    const produces = buildRecipeProduceRows(MULTI_STEP, { componentOptions: COMPONENTS });
    assert.deepEqual(
      produces.map((row) => [row.scopeName, row.name]),
      [
        ['Macerate', 'Sludge'],
        ['Distil', 'Healing Potion']
      ]
    );
  });

  it('leaves the scope name blank for a single-step recipe (there is nothing to disambiguate)', () => {
    const rows = buildRecipeRequirementRows(SINGLE_SCOPE, { componentOptions: COMPONENTS });
    assert.deepEqual(new Set(rows.map((row) => row.scopeName)), new Set(['']));
  });

  it('emits stable, unique row ids so a Svelte keyed each cannot collide', () => {
    const ids = buildRecipeRequirementRows(MULTI_STEP, {
      componentOptions: COMPONENTS,
      essenceOptions: ESSENCES
    }).map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

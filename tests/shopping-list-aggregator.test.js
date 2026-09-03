/**
 * Tests for shoppingListAggregator (T-059)
 * Uses node:test + node:assert/strict
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { aggregateShoppingList } = await import('../src/ui/svelte/util/shoppingListAggregator.js');

// Issue 1493 needs a REAL evaluation, not a stub: the defect is that the aggregation
// never told the evaluator who was crafting, and only the real currency probe is
// actor-bound. The Foundry globals the manager loads against are installed here.
globalThis.foundry = {
  utils: {
    randomID: () => 'aggregator-fixture-id',
    getProperty: (object, path) =>
      String(path)
        .split('.')
        .reduce((value, key) => (value == null ? undefined : value[key]), object),
  },
};
globalThis.game = { user: { isGM: true }, fabricate: null };

const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { Recipe } = await import('../src/models/Recipe.js');

// Global-free fixture module, so it may be imported statically alongside the dynamic
// imports above.
const { makeCurrencyRecipeManager, makePurseActor, currencyOption } = await import(
  './helpers/currencyRequirementFixtures.js'
);


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecipe(id, name = `Recipe-${id}`) {
  return { id, name };
}

function makeIngredientState(opts = {}) {
  return {
    componentId: opts.componentId ?? null,
    itemUuid: opts.itemUuid ?? null,
    description: opts.description ?? 'Some Material',
    need: opts.need ?? 1,
    have: opts.have ?? 0,
    satisfied: (opts.have ?? 0) >= (opts.need ?? 1),
    ...opts
  };
}

function makeEssenceState(opts = {}) {
  return {
    type: opts.type ?? 'fire',
    need: opts.need ?? 1,
    have: opts.have ?? 0,
    satisfied: (opts.have ?? 0) >= (opts.need ?? 1),
    ...opts
  };
}

function makeToolState(opts = {}) {
  return {
    componentId: opts.componentId ?? 'cat-1',
    name: opts.name ?? 'Mortar & Pestle',
    available: opts.available ?? false,
    satisfied: opts.available ?? false,
    ...opts
  };
}

function makeRecipeManager(recipes = [], evaluationFn = null) {
  const recipeMap = new Map(recipes.map(r => [r.id, r]));
  return {
    getRecipe: (id) => recipeMap.get(id) ?? null,
    evaluateCraftability: evaluationFn ?? (() => ({
      ingredientStates: [],
      essenceStates: [],
      toolStates: []
    }))
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('aggregateShoppingList', () => {

  it('empty list returns default empty result', () => {
    const result = aggregateShoppingList([], makeRecipeManager(), []);
    assert.deepEqual(result, {
      ingredients: [],
      essences: [],
      tools: [],
      allSatisfied: true,
      totalRecipes: 0,
      totalQuantity: 0
    });
  });

  it('null/undefined entries returns empty result', () => {
    const result = aggregateShoppingList(null, makeRecipeManager(), []);
    assert.deepEqual(result.ingredients, []);
    assert.equal(result.allSatisfied, true);
  });

  it('single recipe single ingredient: have >= need => satisfied', () => {
    const recipe = makeRecipe('r1', 'Healing Potion');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [makeIngredientState({ componentId: 'iron-ore', description: 'Iron Ore', need: 2, have: 3 })],
      essenceStates: [],
      toolStates: []
    }));

    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 1 }], manager, ['actor1']);

    assert.equal(result.ingredients.length, 1);
    const [ing] = result.ingredients;
    assert.equal(ing.totalNeed, 2);
    assert.equal(ing.have, 3);
    assert.equal(ing.missing, 0);
    assert.equal(ing.satisfied, true);
    assert.equal(result.allSatisfied, true);
    assert.equal(result.totalRecipes, 1);
    assert.equal(result.totalQuantity, 1);
  });

  it('single recipe quantity > 1 multiplies totalNeed', () => {
    const recipe = makeRecipe('r1', 'Healing Potion');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [makeIngredientState({ componentId: 'iron-ore', need: 2, have: 10 })],
      essenceStates: [],
      toolStates: []
    }));

    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 3 }], manager, ['actor1']);
    assert.equal(result.ingredients[0].totalNeed, 6);
    assert.equal(result.totalQuantity, 3);
  });

  it('multiple recipes with same ingredient merge totalNeed, share have', () => {
    const recipeA = makeRecipe('r1', 'Recipe A');
    const recipeB = makeRecipe('r2', 'Recipe B');

    const evaluations = {
      r1: {
        ingredientStates: [makeIngredientState({ componentId: 'iron', description: 'Iron', need: 2, have: 5 })],
        essenceStates: [],
        toolStates: []
      },
      r2: {
        ingredientStates: [makeIngredientState({ componentId: 'iron', description: 'Iron', need: 3, have: 5 })],
        essenceStates: [],
        toolStates: []
      }
    };

    const manager = makeRecipeManager([recipeA, recipeB], (_actors, recipe) => evaluations[recipe.id]);

    const result = aggregateShoppingList(
      [{ recipeId: 'r1', quantity: 1 }, { recipeId: 'r2', quantity: 1 }],
      manager,
      ['actor1']
    );

    assert.equal(result.ingredients.length, 1);
    const [ing] = result.ingredients;
    assert.equal(ing.totalNeed, 5);
    assert.equal(ing.have, 5);
    assert.equal(ing.missing, 0);
    assert.equal(ing.satisfied, true);
  });

  it('multiple recipes with different ingredients produce separate entries', () => {
    const recipeA = makeRecipe('r1', 'Recipe A');
    const recipeB = makeRecipe('r2', 'Recipe B');

    const evaluations = {
      r1: {
        ingredientStates: [makeIngredientState({ componentId: 'iron', description: 'Iron', need: 2, have: 0 })],
        essenceStates: [],
        toolStates: []
      },
      r2: {
        ingredientStates: [makeIngredientState({ componentId: 'copper', description: 'Copper', need: 3, have: 0 })],
        essenceStates: [],
        toolStates: []
      }
    };

    const manager = makeRecipeManager([recipeA, recipeB], (_actors, recipe) => evaluations[recipe.id]);

    const result = aggregateShoppingList(
      [{ recipeId: 'r1', quantity: 1 }, { recipeId: 'r2', quantity: 1 }],
      manager,
      ['actor1']
    );

    assert.equal(result.ingredients.length, 2);
    const ids = result.ingredients.map(i => i.componentId);
    assert.ok(ids.includes('iron'));
    assert.ok(ids.includes('copper'));
  });

  it('missing calculation: totalNeed > have => missing = difference', () => {
    const recipe = makeRecipe('r1');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [makeIngredientState({ componentId: 'iron', need: 5, have: 2 })],
      essenceStates: [],
      toolStates: []
    }));

    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 1 }], manager, ['actor1']);
    const [ing] = result.ingredients;
    assert.equal(ing.missing, 3);
    assert.equal(ing.satisfied, false);
    assert.equal(result.allSatisfied, false);
  });

  it('allSatisfied is true when all ingredients have enough', () => {
    const recipe = makeRecipe('r1');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [
        makeIngredientState({ componentId: 'iron', need: 2, have: 5 }),
        makeIngredientState({ componentId: 'wood', need: 1, have: 3 })
      ],
      essenceStates: [],
      toolStates: []
    }));

    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 1 }], manager, ['actor1']);
    assert.equal(result.allSatisfied, true);
  });

  it('allSatisfied is false when any ingredient is short', () => {
    const recipe = makeRecipe('r1');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [
        makeIngredientState({ componentId: 'iron', need: 2, have: 5 }),
        makeIngredientState({ componentId: 'gold', need: 3, have: 1 })
      ],
      essenceStates: [],
      toolStates: []
    }));

    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 1 }], manager, ['actor1']);
    assert.equal(result.allSatisfied, false);
  });

  it('essence aggregation sums totalNeed across recipes', () => {
    const recipeA = makeRecipe('r1', 'Recipe A');
    const recipeB = makeRecipe('r2', 'Recipe B');

    const evaluations = {
      r1: {
        ingredientStates: [],
        essenceStates: [makeEssenceState({ type: 'fire', need: 2, have: 3 })],
        toolStates: []
      },
      r2: {
        ingredientStates: [],
        essenceStates: [makeEssenceState({ type: 'fire', need: 1, have: 3 })],
        toolStates: []
      }
    };

    const manager = makeRecipeManager([recipeA, recipeB], (_actors, recipe) => evaluations[recipe.id]);

    const result = aggregateShoppingList(
      [{ recipeId: 'r1', quantity: 1 }, { recipeId: 'r2', quantity: 2 }],
      manager,
      ['actor1']
    );

    assert.equal(result.essences.length, 1);
    const [ess] = result.essences;
    assert.equal(ess.type, 'fire');
    assert.equal(ess.totalNeed, 4);  // 2*1 + 1*2
    assert.equal(ess.have, 3);
    assert.equal(ess.missing, 1);
    assert.equal(ess.satisfied, false);
  });

  for (const channel of ['ingredientStates', 'essenceStates']) {
    it(`retains the first nonblank authored icon for ${channel}`, () => {
      const recipes = ['blank-first', 'authored-a', 'authored-b', 'blank-last'].map((id) =>
        makeRecipe(id)
      );
      const icons = {
        'blank-first': ' ',
        'authored-a': 'fas fa-heart',
        'authored-b': 'fas fa-fire',
        'blank-last': null,
      };
      const manager = makeRecipeManager(recipes, (_actors, recipe) => {
        const state = {
          need: 1,
          have: 0,
          satisfied: false,
          isEssence: true,
          icon: icons[recipe.id],
        };
        return {
          ingredientStates:
            channel === 'ingredientStates'
              ? [makeIngredientState({ ...state, description: 'Restorative essence' })]
              : [],
          essenceStates:
            channel === 'essenceStates'
              ? [makeEssenceState({ ...state, type: 'restorative', name: 'Restorative' })]
              : [],
          toolStates: [],
        };
      });

      const result = aggregateShoppingList(
        recipes.map((recipe) => ({ recipeId: recipe.id, quantity: 1 })),
        manager,
        ['actor1']
      );
      const [state] =
        channel === 'ingredientStates' ? result.ingredients : result.essences;
      assert.equal(state.isEssence, true);
      assert.equal(state.icon, 'fas fa-heart');
    });
  }

  it('leaves an all-blank essence icon for render-time fallback', () => {
    const recipe = makeRecipe('r1');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [
        makeIngredientState({
          description: 'Aether essence',
          isEssence: true,
          icon: ' ',
          need: 1,
          have: 0,
        }),
      ],
      essenceStates: [
        makeEssenceState({ type: 'aether', isEssence: true, icon: '', need: 1, have: 0 }),
      ],
      toolStates: [],
    }));
    const result = aggregateShoppingList(
      [{ recipeId: recipe.id, quantity: 1 }],
      manager,
      ['actor1']
    );
    assert.equal(result.ingredients[0].icon, null);
    assert.equal(result.essences[0].icon, null);
  });

  it('tool deduplication: same tool from two recipes appears once', () => {
    const recipeA = makeRecipe('r1', 'Recipe A');
    const recipeB = makeRecipe('r2', 'Recipe B');

    const evaluations = {
      r1: {
        ingredientStates: [],
        essenceStates: [],
        toolStates: [makeToolState({ componentId: 'mortar', name: 'Mortar', available: true })]
      },
      r2: {
        ingredientStates: [],
        essenceStates: [],
        toolStates: [makeToolState({ componentId: 'mortar', name: 'Mortar', available: true })]
      }
    };

    const manager = makeRecipeManager([recipeA, recipeB], (_actors, recipe) => evaluations[recipe.id]);

    const result = aggregateShoppingList(
      [{ recipeId: 'r1', quantity: 1 }, { recipeId: 'r2', quantity: 1 }],
      manager,
      ['actor1']
    );

    assert.equal(result.tools.length, 1);
    assert.equal(result.tools[0].componentId, 'mortar');
    assert.equal(result.tools[0].available, true);
  });

  it('tool availability: if unavailable in any recipe, marks unavailable', () => {
    const recipeA = makeRecipe('r1', 'Recipe A');
    const recipeB = makeRecipe('r2', 'Recipe B');

    const evaluations = {
      r1: {
        ingredientStates: [],
        essenceStates: [],
        toolStates: [makeToolState({ componentId: 'mortar', name: 'Mortar', available: true })]
      },
      r2: {
        ingredientStates: [],
        essenceStates: [],
        toolStates: [makeToolState({ componentId: 'mortar', name: 'Mortar', available: false })]
      }
    };

    const manager = makeRecipeManager([recipeA, recipeB], (_actors, recipe) => evaluations[recipe.id]);

    const result = aggregateShoppingList(
      [{ recipeId: 'r1', quantity: 1 }, { recipeId: 'r2', quantity: 1 }],
      manager,
      ['actor1']
    );

    assert.equal(result.tools[0].available, false);
    assert.equal(result.allSatisfied, false);
  });

  it('recipeBreakdown tracks per-recipe contribution for each ingredient', () => {
    const recipeA = makeRecipe('r1', 'Recipe A');
    const recipeB = makeRecipe('r2', 'Recipe B');

    const evaluations = {
      r1: {
        ingredientStates: [makeIngredientState({ componentId: 'iron', need: 2, have: 0 })],
        essenceStates: [],
        toolStates: []
      },
      r2: {
        ingredientStates: [makeIngredientState({ componentId: 'iron', need: 3, have: 0 })],
        essenceStates: [],
        toolStates: []
      }
    };

    const manager = makeRecipeManager([recipeA, recipeB], (_actors, recipe) => evaluations[recipe.id]);

    const result = aggregateShoppingList(
      [{ recipeId: 'r1', quantity: 2 }, { recipeId: 'r2', quantity: 1 }],
      manager,
      ['actor1']
    );

    const [ing] = result.ingredients;
    assert.equal(ing.recipeBreakdown.length, 2);
    const r1entry = ing.recipeBreakdown.find(b => b.recipeId === 'r1');
    const r2entry = ing.recipeBreakdown.find(b => b.recipeId === 'r2');
    assert.equal(r1entry.need, 2);
    assert.equal(r1entry.quantity, 2);
    assert.equal(r2entry.need, 3);
    assert.equal(r2entry.quantity, 1);
    assert.equal(ing.totalNeed, 7);  // 2*2 + 3*1
  });

  it('entry with quantity 0 is skipped', () => {
    const recipe = makeRecipe('r1');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [makeIngredientState({ componentId: 'iron', need: 2, have: 0 })],
      essenceStates: [],
      toolStates: []
    }));

    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 0 }], manager, ['actor1']);
    assert.equal(result.ingredients.length, 0);
    assert.equal(result.totalRecipes, 0);
  });

  it('recipe not found in manager is skipped without error', () => {
    const manager = makeRecipeManager([], () => null);

    const result = aggregateShoppingList([{ recipeId: 'nonexistent', quantity: 1 }], manager, ['actor1']);
    assert.equal(result.ingredients.length, 0);
    assert.equal(result.totalRecipes, 0);
  });

  it('empty componentSourceActors: all have values are 0', () => {
    const recipe = makeRecipe('r1');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [makeIngredientState({ componentId: 'iron', need: 3, have: 0 })],
      essenceStates: [],
      toolStates: []
    }));

    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 1 }], manager, []);
    // Empty actors => no evaluation called, all have=0
    assert.equal(result.ingredients.length, 0);
  });

  it('itemUuid-based ingredient key when no componentId', () => {
    const recipe = makeRecipe('r1');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [
        makeIngredientState({ componentId: null, itemUuid: 'uuid-abc', description: 'Special Item', need: 1, have: 0 }),
        makeIngredientState({ componentId: null, itemUuid: 'uuid-abc', description: 'Special Item', need: 2, have: 1 })
      ],
      essenceStates: [],
      toolStates: []
    }));

    // Same item uuid in two different ingredient states from same recipe — should merge
    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 1 }], manager, ['actor1']);
    assert.equal(result.ingredients.length, 1);
    assert.equal(result.ingredients[0].itemUuid, 'uuid-abc');
    assert.equal(result.ingredients[0].totalNeed, 3);
  });

  it('description-based fallback key for tag-based ingredients', () => {
    const recipe = makeRecipe('r1');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [
        makeIngredientState({ componentId: null, itemUuid: null, description: 'Any Metal', need: 2, have: 1 })
      ],
      essenceStates: [],
      toolStates: []
    }));

    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 1 }], manager, ['actor1']);
    assert.equal(result.ingredients.length, 1);
    assert.equal(result.ingredients[0].description, 'Any Metal');
  });

  it('carries name/img onto ingredients and essences, and img/needsRepair onto tools', () => {
    const recipe = makeRecipe('r1');
    const manager = makeRecipeManager([recipe], () => ({
      ingredientStates: [
        makeIngredientState({ componentId: 'c1', name: 'Iron', img: 'icons/iron.webp', need: 2, have: 0 })
      ],
      essenceStates: [makeEssenceState({ type: 'fire', name: 'Fire', need: 2, have: 0 })],
      toolStates: [
        makeToolState({ name: 'Anvil', img: 'icons/anvil.webp', available: false, needsRepair: true })
      ]
    }));

    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 1 }], manager, ['actor1']);

    assert.equal(result.ingredients[0].name, 'Iron');
    assert.equal(result.ingredients[0].img, 'icons/iron.webp');
    assert.equal(result.essences[0].name, 'Fire');
    assert.equal(result.tools[0].img, 'icons/anvil.webp');
    assert.equal(result.tools[0].needsRepair, true, 'a broken tool carries needsRepair');
  });

  it('prefers evaluateShoppingRequirement (any-set union) over evaluateCraftability', () => {
    const recipe = makeRecipe('r1');
    const manager = {
      getRecipe: () => recipe,
      evaluateCraftability: () => ({
        ingredientStates: [makeIngredientState({ componentId: 'wrong', description: 'One set only', need: 9, have: 0 })],
        essenceStates: [],
        toolStates: []
      }),
      evaluateShoppingRequirement: () => ({
        ingredientStates: [makeIngredientState({ componentId: 'c1', description: 'Any set', need: 2, have: 0 })],
        essenceStates: [],
        toolStates: []
      })
    };

    const result = aggregateShoppingList([{ recipeId: 'r1', quantity: 1 }], manager, ['actor1']);
    assert.equal(result.ingredients.length, 1);
    assert.equal(result.ingredients[0].description, 'Any set', 'used the shopping requirement path');
  });
});

// ---------------------------------------------------------------------------
// Issue 1493 — the aggregation is evaluated AGAINST THE CRAFTING ACTOR.
//
// Asserted on `aggregate.ingredients`, never on the arguments handed to the manager.
// The defect being fixed is a silent no-op: `evaluateShoppingRequirement`'s third
// parameter is an OPTIONS BAG, so handing it a bare actor destructures
// `actor.craftingActor` to `undefined` and the currency probe stays constant-false.
// An argument spy passes on exactly that mistake.
// ---------------------------------------------------------------------------

const TOLL_SYSTEM_ID = 'sys-1493-shop';

/**
 * A real manager over a recipe whose single group offers "two specific planks OR 100 gp",
 * against a world ladder that resolves. Items are tried before currency, so a player who
 * holds no plank falls to the coin — IF the evaluation knows whose coin to look at.
 */
function makeTollManager() {
  const manager = makeCurrencyRecipeManager(RecipeManager, { systemId: TOLL_SYSTEM_ID });
  manager.recipes.set(
    'r-toll',
    new Recipe({
      id: 'r-toll',
      name: 'Toll Bridge Plank',
      craftingSystemId: TOLL_SYSTEM_ID,
      ingredientSets: [
        {
          ingredientGroups: [
            {
              id: 'g-toll',
              name: 'Toll',
              options: [
                { itemUuid: 'Item.plank', quantity: 2 },
                currencyOption(100),
              ],
            },
          ],
          essences: {},
        },
      ],
      resultGroups: [{ id: 'rg-1', results: [] }],
    })
  );
  return manager;
}


function tollDescriptions(manager, craftingActor, sourceActors) {
  const aggregate = aggregateShoppingList(
    [{ recipeId: 'r-toll', quantity: 1 }],
    manager,
    sourceActors,
    { craftingActor }
  );
  return aggregate.ingredients.map((ingredient) => ingredient.description);
}

describe('aggregateShoppingList currency affordability (issue 1493)', () => {
  it('drops the material from the list when the crafting actor can pay the cost instead', () => {
    const manager = makeTollManager();
    const rich = makePurseActor({ id: 'rich', gp: 1000 });

    assert.deepEqual(
      tollDescriptions(manager, rich, [{ id: 'bag', items: [] }, rich]),
      ['100 gp'],
      'the coin settles the group, so nothing has to be bought'
    );
  });

  it('puts the material back when the crafting actor cannot pay', () => {
    const manager = makeTollManager();
    const poor = makePurseActor({ id: 'poor', gp: 3 });

    assert.deepEqual(
      tollDescriptions(manager, poor, [{ id: 'bag', items: [] }, poor]),
      ['2x specific item'],
      'with no coin and no plank the player is told to buy planks'
    );
  });

  it('reports the material for every actor when no crafting actor is supplied at all', () => {
    // The shipped defect, kept as a regression guard: an aggregation with no crafting
    // actor cannot afford anything, however rich the source actors are.
    const manager = makeTollManager();
    const rich = makePurseActor({ id: 'rich', gp: 1000 });

    assert.deepEqual(tollDescriptions(manager, null, [rich]), ['2x specific item']);
  });

  it('forwards the crafting actor down the evaluateCraftability fallback too', () => {
    // A manager that predates `evaluateShoppingRequirement` (the stub shape several
    // tests above use) takes the other branch, which had the same omission.
    const manager = makeTollManager();
    const rich = makePurseActor({ id: 'rich', gp: 1000 });
    const legacy = {
      getRecipe: (id) => manager.getRecipe(id),
      evaluateCraftability: (actors, recipe, options) =>
        manager.evaluateCraftability(actors, recipe, options),
    };

    const aggregate = aggregateShoppingList(
      [{ recipeId: 'r-toll', quantity: 1 }],
      legacy,
      [{ id: 'bag', items: [] }, rich],
      { craftingActor: rich }
    );
    assert.deepEqual(
      aggregate.ingredients.map((ingredient) => ingredient.description),
      ['100 gp']
    );
  });
});

// ---------------------------------------------------------------------------
// Issue 1493 (revision 2) — a currency requirement is settled by AFFORDABILITY, and the
// entry carries the discriminator the shopping list branches on.
//
// The aggregation derived `satisfied` from `totalNeed - have` for every entry, and a
// currency state's `have` is a documented placeholder against a `need` that is a price.
// So a cost the player can trivially pay aggregated to `missing: 100, satisfied: false`
// and the shopping list told them to acquire a hundred of something.
// ---------------------------------------------------------------------------

function tollAggregate(manager, craftingActor, sourceActors) {
  return aggregateShoppingList(
    [{ recipeId: 'r-toll', quantity: 1 }],
    manager,
    sourceActors,
    { craftingActor }
  );
}

/** A manager over a recipe whose single group offers ONLY a 100 gp cost. */
function makeCoinOnlyManager() {
  const manager = makeCurrencyRecipeManager(RecipeManager, { systemId: TOLL_SYSTEM_ID });
  manager.recipes.set(
    'r-coin',
    new Recipe({
      id: 'r-coin',
      name: 'Bridge Toll',
      craftingSystemId: TOLL_SYSTEM_ID,
      ingredientSets: [
        {
          ingredientGroups: [{ id: 'g-coin', name: 'Toll', options: [currencyOption(100)] }],
          essences: {},
        },
      ],
      resultGroups: [{ id: 'rg-1', results: [] }],
    })
  );
  return manager;
}

function currencyEntry(aggregate) {
  return aggregate.ingredients.find((ingredient) => ingredient.isCurrency === true) ?? null;
}

describe('aggregateShoppingList currency entries (issue 1493)', () => {
  it('marks an affordable cost satisfied, so it never reaches the acquire list', () => {
    const manager = makeTollManager();
    const rich = makePurseActor({ id: 'rich', gp: 1000 });

    const entry = currencyEntry(tollAggregate(manager, rich, [{ id: 'bag', items: [] }, rich]));

    assert.ok(Boolean(entry), 'the currency requirement is carried as a currency entry');
    assert.equal(entry.affordable, true);
    assert.equal(entry.satisfied, true, 'a payable cost is met, not a shortfall of 100');
    assert.equal(entry.missing, 0, 'there is no quantity of anything to go and acquire');
  });

  it('keeps an unaffordable cost on the list without inventing a shortfall count', () => {
    // A coin-ONLY requirement, because a "planks OR 100 gp" group resolves to the plank
    // option when the coin is out of reach and produces no currency state at all.
    const manager = makeCoinOnlyManager();
    const poor = makePurseActor({ id: 'poor', gp: 3 });

    const entry = currencyEntry(
      aggregateShoppingList([{ recipeId: 'r-coin', quantity: 1 }], manager, [poor], {
        craftingActor: poor,
      })
    );

    assert.ok(Boolean(entry));
    assert.equal(entry.affordable, false);
    assert.equal(entry.satisfied, false, 'a player who cannot pay still needs telling');
    assert.equal(entry.missing, 0, 'but "buy 100 of it" is not the shortfall');
  });

  it('still shops a non-currency entry on its have/need ratio', () => {
    // The control: the currency branch must not swallow the ordinary path.
    const manager = makeTollManager();
    const poor = makePurseActor({ id: 'poor', gp: 3 });

    const plank = tollAggregate(manager, poor, [{ id: 'bag', items: [] }, poor]).ingredients.find(
      (ingredient) => ingredient.isCurrency !== true
    );

    assert.equal(plank.isCurrency, false);
    assert.equal(plank.missing, 2, 'two planks still to buy');
    assert.equal(plank.satisfied, false);
  });
});

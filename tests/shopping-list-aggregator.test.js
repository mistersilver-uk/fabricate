/**
 * Tests for shoppingListAggregator (T-059)
 * Uses node:test + node:assert/strict
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const { aggregateShoppingList } = await import('../src/ui/svelte/util/shoppingListAggregator.js');

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
});

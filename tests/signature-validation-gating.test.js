/**
 * Regression: RecipeManager only enforces ingredient-signature uniqueness for
 * alchemy-mode systems.
 *
 * Signatures exist so the engine can *infer* which recipe a player is crafting
 * from the submitted ingredients (CraftingEngine._matchAlchemySignature, gated
 * on resolutionMode === 'alchemy'). In every selected-recipe mode the player
 * picks the recipe, so overlapping base materials — iron+wood → axe OR spear OR
 * shield — are never ambiguous and must not be rejected.
 *
 * Reproduces the Mythwright 0.5.x update failure: a routed system whose recipes
 * share base materials had 98/105 recipes rejected with "Overlapping signatures"
 * on update, because every already-persisted recipe collided with its peers.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
const settingsStore = new Map();

let resolutionMode = 'routed';
const components = [{ id: 'comp-a', name: 'comp-a', tags: [] }];

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (obj, path) =>
      String(path || '')
        .split('.')
        .reduce((value, key) => value?.[key], obj),
  },
};

globalThis.game = {
  user: { isGM: true },
  actors: [],
  fabricate: {
    getCraftingSystemManager: () => ({
      getSystem: (id) => (id === 'sys-1' ? { id, resolutionMode, components } : null),
    }),
  },
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    },
  },
};

globalThis.ui = {
  notifications: { info() {}, warn() {}, error() {} },
};

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

// Two recipes that both require the same single component → overlapping
// signatures. In selected-recipe modes this is legal; in alchemy it is not.
function makeRecipeData(id, name) {
  return {
    id,
    name,
    craftingSystemId: 'sys-1',
    ingredientSets: [
      {
        id: `${id}-set`,
        ingredientGroups: [
          { id: `${id}-grp`, name: 'Ingredients', options: [{ componentId: 'comp-a', quantity: 1 }] },
        ],
        essences: {},
      },
    ],
    resultGroups: [{ id: `${id}-rg`, results: [{ id: `${id}-r`, itemUuid: 'Item.result', quantity: 1 }] }],
  };
}

function seedManagerWithCollidingRecipes() {
  const manager = new RecipeManager();
  manager.initialized = true;
  // Pre-persist both colliding recipes (mirrors the update flow, where every
  // recipe already exists before re-import re-validates it).
  manager.recipes.set('r-a', new Recipe(makeRecipeData('r-a', 'Forge a Spear')));
  manager.recipes.set('r-b', new Recipe(makeRecipeData('r-b', 'Forge an Axe')));
  return manager;
}

describe('RecipeManager signature validation gating', () => {
  beforeEach(() => {
    settingsStore.clear();
  });

  it('rejects overlapping signatures when the system is in alchemy mode', async () => {
    resolutionMode = 'alchemy';
    const manager = seedManagerWithCollidingRecipes();

    await assert.rejects(
      () => manager.updateRecipe('r-b', { name: 'Forge an Axe (edited)' }),
      /Overlapping signatures/,
      'Alchemy systems must still flag ambiguous ingredient signatures'
    );
  });

  it('allows overlapping signatures in routed (selected-recipe) mode', async () => {
    resolutionMode = 'routed';
    const manager = seedManagerWithCollidingRecipes();

    const updated = await manager.updateRecipe('r-b', { name: 'Forge an Axe (edited)' });
    assert.equal(updated.name, 'Forge an Axe (edited)');
  });

  it('allows overlapping signatures in simple mode', async () => {
    resolutionMode = 'simple';
    const manager = seedManagerWithCollidingRecipes();

    const updated = await manager.updateRecipe('r-b', { name: 'Forge an Axe (simple)' });
    assert.equal(updated.name, 'Forge an Axe (simple)');
  });
});

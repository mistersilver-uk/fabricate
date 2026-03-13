import test from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: () => undefined
  }
};
globalThis.ui = { notifications: { warn: () => {}, info: () => {}, error: () => {} } };

const settingsStore = new Map();
globalThis.game = {
  user: { isGM: true },
  actors: [],
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    }
  }
};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeRecipeManager(recipes = []) {
  let mutableRecipes = [...recipes];
  const deleted = [];

  return {
    getRecipes(filters = {}) {
      if (filters.craftingSystemId) {
        return mutableRecipes.filter(recipe => recipe.craftingSystemId === filters.craftingSystemId);
      }
      return mutableRecipes;
    },
    async deleteRecipe(recipeId) {
      deleted.push(recipeId);
      mutableRecipes = mutableRecipes.filter(recipe => recipe.id !== recipeId);
    },
    getDeletedRecipeIds() {
      return [...deleted];
    }
  };
}

function makeManager(recipeManager) {
  const manager = new CraftingSystemManager(recipeManager);
  manager.initialized = true;
  manager.save = async () => {};
  return manager;
}

test('changing resolutionMode deletes recipes in the system and cleans stale progressive preferences', async () => {
  settingsStore.clear();
  settingsStore.set('lastManagedCraftingSystem', 'sys-1');
  settingsStore.set('progressiveResultOrder', {
    'recipe-1': ['a', 'b'],
    'recipe-2': ['c', 'd']
  });

  const recipeManager = makeRecipeManager([
    { id: 'recipe-1', craftingSystemId: 'sys-1' },
    { id: 'recipe-2', craftingSystemId: 'sys-2' }
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Alchemy Bench',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { resolutionMode: 'tiered' });

  assert.equal(manager.getSystem('sys-1').resolutionMode, 'tiered');
  assert.deepEqual(recipeManager.getDeletedRecipeIds(), ['recipe-1']);
  assert.deepEqual(settingsStore.get('progressiveResultOrder'), {
    'recipe-2': ['c', 'd']
  });
  assert.equal(settingsStore.get('lastManagedCraftingSystem'), 'sys-1');
});

test('updating a system without changing resolutionMode does not delete recipes', async () => {
  settingsStore.clear();
  settingsStore.set('progressiveResultOrder', { 'recipe-1': ['a', 'b'] });

  const recipeManager = makeRecipeManager([
    { id: 'recipe-1', craftingSystemId: 'sys-1' }
  ]);
  const manager = makeManager(recipeManager);
  manager.systems.set('sys-1', manager._normalizeSystem({
    id: 'sys-1',
    name: 'Forge',
    resolutionMode: 'simple'
  }));

  await manager.updateSystem('sys-1', { name: 'Grand Forge' });

  assert.equal(manager.getSystem('sys-1').name, 'Grand Forge');
  assert.deepEqual(recipeManager.getDeletedRecipeIds(), []);
  assert.deepEqual(settingsStore.get('progressiveResultOrder'), { 'recipe-1': ['a', 'b'] });
});

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
const settingsStore = new Map();
const notifications = [];

globalThis.foundry = {
  utils: {
    randomID: () => `rid-${++idSeq}`,
    getProperty: (obj, path) => String(path || '').split('.').reduce((value, key) => value?.[key], obj)
  }
};

globalThis.game = {
  user: { isGM: true },
  actors: [],
  fabricate: {},
  settings: {
    get: (_namespace, key) => settingsStore.get(key),
    set: async (_namespace, key, value) => {
      settingsStore.set(key, value);
      return value;
    }
  }
};

globalThis.ui = {
  notifications: {
    info: message => notifications.push({ level: 'info', message }),
    warn: message => notifications.push({ level: 'warn', message }),
    error: message => notifications.push({ level: 'error', message })
  }
};

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

function makeRecipeData(overrides = {}) {
  return {
    id: overrides.id || `recipe-${++idSeq}`,
    name: overrides.name || 'Test Recipe',
    craftingSystemId: overrides.craftingSystemId || 'sys-1',
    ingredientSets: [{
      id: 'set-1',
      ingredientGroups: [{
        id: 'group-1',
        name: 'Ingredients',
        options: [{ id: 'ingredient-1', itemUuid: 'Item.ingredient', quantity: 1 }]
      }],
      essences: {}
    }],
    resultGroups: [{
      id: 'result-group-1',
      results: [{ id: 'result-1', itemUuid: 'Item.result', quantity: 1 }]
    }],
    ...overrides
  };
}

function makeManager() {
  const manager = new RecipeManager();
  manager.initialized = true;
  return manager;
}

describe('RecipeManager notification controls', () => {
  beforeEach(() => {
    notifications.length = 0;
    settingsStore.clear();
  });

  it('notifies for direct recipe create, update, and delete by default', async () => {
    const manager = makeManager();

    const recipe = await manager.createRecipe(makeRecipeData({ id: 'recipe-default', name: 'Default Notice' }));
    await manager.updateRecipe(recipe.id, { name: 'Updated Notice' });
    await manager.deleteRecipe(recipe.id);

    assert.deepEqual(
      notifications.filter(entry => entry.level === 'info').map(entry => entry.message),
      [
        'Recipe "Default Notice" created',
        'Recipe "Updated Notice" updated',
        'Recipe "Updated Notice" deleted'
      ]
    );
  });

  it('suppresses recipe create, update, and delete notifications when notify is false', async () => {
    const manager = makeManager();

    const recipe = await manager.createRecipe(
      makeRecipeData({ id: 'recipe-suppressed', name: 'Suppressed Notice' }),
      { notify: false }
    );
    await manager.updateRecipe(recipe.id, { name: 'Still Suppressed' }, { notify: false });
    await manager.deleteRecipe(recipe.id, { notify: false });

    assert.deepEqual(notifications, []);
    assert.equal(manager.getRecipe(recipe.id), null);
  });

  it('emits recipe change hooks for direct and import mutations', async () => {
    const previousHooks = globalThis.Hooks;
    const hookPayloads = [];
    globalThis.Hooks = {
      callAll: (hookName, payload) => {
        if (hookName === 'fabricate.recipesChanged') hookPayloads.push(payload);
      }
    };
    const manager = makeManager();

    try {
      const recipe = await manager.createRecipe(makeRecipeData({ id: 'recipe-hook', name: 'Hooked Recipe' }), { notify: false });
      await manager.updateRecipe(recipe.id, { name: 'Hooked Update' }, { notify: false });
      await manager.deleteRecipe(recipe.id, { notify: false });
      await manager.importRecipes([makeRecipeData({ id: 'recipe-import-hook', name: 'Hooked Import' })], true);

      assert.deepEqual(
        hookPayloads.map(payload => payload.action),
        ['create', 'update', 'delete', 'import']
      );
      assert.equal(hookPayloads[0].recipeId, 'recipe-hook');
      assert.equal(hookPayloads.at(-1).imported, 1);
      assert.equal(hookPayloads.at(-1).total, 1);
    } finally {
      globalThis.Hooks = previousHooks;
    }
  });

  it('importRecipes emits one aggregate notification and returns counts', async () => {
    const manager = makeManager();
    manager.recipes.set('existing-recipe', new Recipe(makeRecipeData({ id: 'existing-recipe', name: 'Existing' })));

    const result = await manager.importRecipes([
      makeRecipeData({ id: 'existing-recipe', name: 'Existing Import' }),
      makeRecipeData({
        id: 'new-recipe',
        name: 'New Import',
        ingredientSets: [{
          id: 'set-2',
          ingredientGroups: [{
            id: 'group-2',
            name: 'Ingredients',
            options: [{ id: 'ingredient-2', itemUuid: 'Item.other-ingredient', quantity: 1 }]
          }],
          essences: {}
        }]
      })
    ]);

    assert.deepEqual(result, { imported: 1, skipped: 1, total: 2 });
    assert.deepEqual(
      notifications.filter(entry => entry.level === 'info').map(entry => entry.message),
      ['Imported 1 recipes (1 skipped)']
    );
    assert.equal(manager.getRecipe('new-recipe')?.name, 'New Import');
  });
});

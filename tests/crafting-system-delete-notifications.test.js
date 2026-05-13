import test from 'node:test';
import assert from 'node:assert/strict';

let idSeq = 0;
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
  fabricate: {}
};

globalThis.ui = {
  notifications: {
    info: message => notifications.push(message),
    warn: () => {},
    error: () => {}
  }
};

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');

function makeRecipeManager() {
  let recipes = [
    { id: 'recipe-1', name: 'First Recipe', craftingSystemId: 'sys-delete' },
    { id: 'recipe-2', name: 'Second Recipe', craftingSystemId: 'sys-delete' },
    { id: 'recipe-other', name: 'Other Recipe', craftingSystemId: 'sys-other' }
  ];
  const deleteCalls = [];

  return {
    getRecipes(filters = {}) {
      if (filters.craftingSystemId) {
        return recipes.filter(recipe => recipe.craftingSystemId === filters.craftingSystemId);
      }
      return recipes;
    },
    async deleteRecipe(recipeId, options = {}) {
      const recipe = recipes.find(entry => entry.id === recipeId);
      deleteCalls.push({ recipeId, options });
      recipes = recipes.filter(entry => entry.id !== recipeId);
      if (recipe && options.notify !== false) {
        ui.notifications.info(`Recipe "${recipe.name}" deleted`);
      }
    },
    deleteCalls,
    remainingRecipes: () => recipes
  };
}

test('CraftingSystemManager.deleteSystem emits one summary and suppresses per-recipe delete notices', async () => {
  notifications.length = 0;
  const recipeManager = makeRecipeManager();
  const manager = new CraftingSystemManager(recipeManager);
  manager.initialized = true;
  manager.save = async () => {};

  manager.systems.set('sys-delete', manager._normalizeSystem({
    id: 'sys-delete',
    name: 'Alchemy',
    components: [
      { id: 'component-1', name: 'Iron' },
      { id: 'component-2', name: 'Salt' }
    ],
    essenceDefinitions: [
      { id: 'fire', name: 'Fire' }
    ],
    recipeItemDefinitions: [
      { id: 'recipe-item-1', name: 'Recipe Scroll' }
    ]
  }));

  await manager.deleteSystem('sys-delete');

  assert.equal(manager.getSystem('sys-delete'), null);
  assert.deepEqual(recipeManager.remainingRecipes().map(recipe => recipe.id), ['recipe-other']);
  assert.deepEqual(recipeManager.deleteCalls, [
    { recipeId: 'recipe-1', options: { notify: false } },
    { recipeId: 'recipe-2', options: { notify: false } }
  ]);
  assert.deepEqual(notifications, [
    'Deleted crafting system "Alchemy" and 6 related entities.'
  ]);
});

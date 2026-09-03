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

function makeFailingRecipeManager(failingId) {
  let recipes = [
    { id: 'recipe-1', name: 'First Recipe', craftingSystemId: 'sys-delete' },
    { id: 'recipe-2', name: 'Second Recipe', craftingSystemId: 'sys-delete' }
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
      deleteCalls.push({ recipeId, options });
      if (recipeId === failingId) {
        throw new Error('settings write failed');
      }
      recipes = recipes.filter(entry => entry.id !== recipeId);
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
    { recipeId: 'recipe-1', options: { notify: false, cleanupFlags: false } },
    { recipeId: 'recipe-2', options: { notify: false, cleanupFlags: false } }
  ]);
  assert.deepEqual(notifications, [
    'Deleted crafting system "Alchemy" and 6 related entities.'
  ]);
});

test('CraftingSystemManager.deleteSystem stays resilient when one recipe deletion fails', async () => {
  notifications.length = 0;
  const warnings = [];
  const errors = [];
  const originalWarn = ui.notifications.warn;
  const originalError = console.error;
  ui.notifications.warn = message => warnings.push(message);
  console.error = (...args) => errors.push(args);

  try {
    const recipeManager = makeFailingRecipeManager('recipe-1');
    const manager = new CraftingSystemManager(recipeManager);
    manager.initialized = true;
    let saved = 0;
    manager.save = async () => {
      saved += 1;
    };

    manager.systems.set('sys-delete', manager._normalizeSystem({
      id: 'sys-delete',
      name: 'Alchemy'
    }));

    await manager.deleteSystem('sys-delete');

    // (a) the system is still removed from the map despite the failure
    assert.equal(manager.getSystem('sys-delete'), null);
    // (b) the other recipe's deletion was still attempted (loop did not abort)
    assert.deepEqual(recipeManager.deleteCalls.map(call => call.recipeId), [
      'recipe-1',
      'recipe-2'
    ]);
    // (c) save still ran
    assert.equal(saved, 1);
    // (d) the failure was logged with its recipe id and the underlying error
    const recipeFailureLogs = errors.filter(
      args => args.includes('recipe-1') && args.some(arg => arg instanceof Error)
    );
    assert.equal(recipeFailureLogs.length, 1, 'the failing recipe deletion is logged exactly once');
    // the summary reflects the partial failure via the themed warn path
    assert.equal(notifications.length, 0, 'no info notification when a deletion failed');
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /1 recipe could not be auto-deleted/);
  } finally {
    ui.notifications.warn = originalWarn;
    console.error = originalError;
  }
});

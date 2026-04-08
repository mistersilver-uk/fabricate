/**
 * Recipe save coverage through the active editor store and RecipeManager.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEditorStore } from '../src/ui/svelte/stores/editorStore.js';
import { RecipeManager } from '../src/systems/RecipeManager.js';
import { Recipe } from '../src/models/Recipe.js';

let idCounter = 0;
const TEST_SYSTEM_ID = 'test-system-001';

globalThis.foundry = {
  utils: {
    randomID: () => `id-${++idCounter}`
  }
};

globalThis.game = {
  user: { isGM: true, name: 'Test GM' }
};

globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

function mockServices(overrides = {}) {
  return {
    randomID: () => `id-${++idCounter}`,
    getSystem: () => ({
      advancedOptionsEnabled: true,
      features: {}
    }),
    getItems: () => [],
    getRecipeItemDefinitions: () => [],
    getRecipeItemUsage: () => [],
    deleteRecipeItemDefinition: async () => ({ deleted: true, affectedRecipes: [] }),
    confirmDialog: async () => true,
    localize: (key) => key,
    resolveItem: () => null,
    saveRecipe: async () => {},
    onClose: () => {},
    notify: () => {},
    ...overrides
  };
}

function makeRecipe(overrides = {}) {
  const base = {
    id: 'existing-id',
    name: 'Existing Potion',
    craftingSystemId: TEST_SYSTEM_ID,
    img: 'icons/svg/item-bag.svg',
    ingredientSets: [],
    results: [],
    steps: [],
    recipeItemId: '',
    linkedRecipeItemUuid: '',
    ...overrides
  };
  return {
    ...base,
    toJSON: () => ({ ...base })
  };
}

function makeValidStore(overrides = {}, options = { craftingSystemId: TEST_SYSTEM_ID }) {
  const store = createEditorStore(mockServices(overrides), options);
  store.setField('name', 'Valid Recipe');
  store.assignIngredientItem(0, 0, 0, 'item-ingredient');
  store.assignResultItem(0, 0, 'item-result');
  return store;
}

function makeManager() {
  const manager = new RecipeManager();
  manager.initialized = true;
  manager.save = async () => {};
  manager._validateEssenceReferences = () => ({ valid: true, errors: [] });
  manager._validateTagPlaceholders = () => ({ valid: true, errors: [] });
  manager._validateResolutionMode = () => ({ valid: true, errors: [] });
  return manager;
}

test('editor store saveRecipe calls services.saveRecipe once for a new recipe payload', async () => {
  let saveCalls = 0;
  let savedPayload = null;
  const store = makeValidStore({
    saveRecipe: async (payload, id) => {
      saveCalls += 1;
      savedPayload = { payload, id };
    }
  });

  const result = await store.saveRecipe();

  assert.equal(result.success, true);
  assert.equal(saveCalls, 1);
  assert.equal(savedPayload.id, null);
  assert.equal(savedPayload.payload.name, 'Valid Recipe');
});

test('editor store saveRecipe passes the existing recipe id to services.saveRecipe', async () => {
  let savedId = undefined;
  const recipe = makeRecipe({ id: 'recipe-existing-001', name: 'Existing Potion' });
  const store = makeValidStore({
    saveRecipe: async (_payload, id) => { savedId = id; }
  }, { recipe });

  const result = await store.saveRecipe();

  assert.equal(result.success, true);
  assert.equal(savedId, 'recipe-existing-001');
});

test('editor store saveRecipe does not call services.saveRecipe when validation fails', async () => {
  let saveCallCount = 0;
  const store = createEditorStore(mockServices({
    saveRecipe: async () => { saveCallCount += 1; }
  }), { craftingSystemId: TEST_SYSTEM_ID });

  const result = await store.saveRecipe();

  assert.equal(result.success, false);
  assert.equal(saveCallCount, 0);
});

test('RecipeManager.createRecipe logs recipe name and ID after successful save', async () => {
  const manager = makeManager();
  const logMessages = [];
  const originalDebug = console.debug;
  console.debug = (...args) => logMessages.push(args.join(' '));

  try {
    const recipe = await manager.createRecipe({
      name: 'Logged Potion',
      craftingSystemId: TEST_SYSTEM_ID,
      ingredientSets: [{
        id: 's-1',
        ingredientGroups: [{ id: 'g-1', name: 'Group 1', options: [{ id: 'i-1', itemUuid: 'Item.herb', quantity: 1 }] }],
        essences: {},
        catalysts: []
      }],
      resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', itemUuid: 'Item.x', quantity: 1 }] }]
    });

    assert.ok(logMessages.some(message =>
      message.includes('Created recipe') &&
      message.includes('Logged Potion') &&
      message.includes(recipe.id)
    ));
  } finally {
    console.debug = originalDebug;
  }
});

test('RecipeManager.updateRecipe logs recipe name and ID after successful save', async () => {
  const manager = makeManager();
  const existing = new Recipe({
    id: 'recipe-to-update',
    name: 'Original Name',
    craftingSystemId: TEST_SYSTEM_ID,
    ingredientSets: [{
      id: 's-1',
      ingredientGroups: [{ id: 'g-1', name: 'Group 1', options: [{ id: 'i-1', itemUuid: 'Item.herb', quantity: 1 }] }],
      essences: {},
      catalysts: []
    }],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', itemUuid: 'Item.x', quantity: 1 }] }]
  });
  manager.recipes.set(existing.id, existing);

  const logMessages = [];
  const originalDebug = console.debug;
  console.debug = (...args) => logMessages.push(args.join(' '));

  try {
    const updated = await manager.updateRecipe(existing.id, { name: 'Updated Potion' });
    assert.ok(logMessages.some(message =>
      message.includes('Updated recipe') &&
      message.includes('Updated Potion') &&
      message.includes(updated.id)
    ));
  } finally {
    console.debug = originalDebug;
  }
});

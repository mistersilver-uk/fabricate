/**
 * Tests for T-036: Recipe save deduplication and console.log on create/update.
 *
 * These tests verify that:
 * 1. createRecipe is called exactly once when saving a new recipe via _onSaveRecipe
 * 2. updateRecipe is called exactly once when saving an existing recipe via _onSaveRecipe
 * 3. RecipeManager.createRecipe logs the recipe name and ID to console
 * 4. RecipeManager.updateRecipe logs the recipe name and ID to console
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal FoundryVTT stubs required by imported modules
// ---------------------------------------------------------------------------

globalThis.foundry = {
  applications: {
    api: {
      HandlebarsApplicationMixin: (Base) => class extends Base {},
      ApplicationV2: class {
        async _prepareContext() { return {}; }
        close() {}
      }
    }
  },
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`,
    getProperty: () => undefined
  }
};

globalThis.game = {
  user: { isGM: true, name: 'TestGM' },
  time: { worldTime: 0 },
  actors: [],
  fabricate: null  // overridden per-test where needed
};

globalThis.ui = {
  notifications: {
    info: () => {},
    warn: () => {},
    error: () => {}
  }
};

globalThis.ChatMessage = { create: () => {}, getSpeaker: () => ({}) };

// ---------------------------------------------------------------------------
// Imports (dynamic, after globals are set)
// ---------------------------------------------------------------------------

const { RecipeManager } = await import('../src/systems/RecipeManager.js');
const { RecipeEditorApp } = await import('../src/ui/RecipeEditorApp.js');

// ---------------------------------------------------------------------------
// Helper: build a minimal valid recipe payload that satisfies Recipe.validate()
// and IngredientSet.validate().
//
// An ingredient set must contain at least one ingredient group, each group must
// have at least one option, and each Ingredient option must have a match rule or
// itemUuid.  We use itemUuid for simplicity.
//
// craftingSystemId is set to TEST_SYSTEM_ID so the app-level guard inside
// _onSaveRecipe passes.  System-level validation (essence/tag/mode) is skipped
// when game.fabricate.getCraftingSystemManager() returns null, which the
// installGameFabricate helper below ensures.
// ---------------------------------------------------------------------------

const TEST_SYSTEM_ID = 'test-system-001';

function makeValidPayload(overrides = {}) {
  return {
    name: 'Test Potion',
    craftingSystemId: TEST_SYSTEM_ID,
    ingredientSets: [
      {
        id: 'set-1',
        name: 'Set 1',
        ingredientGroups: [
          {
            id: 'group-1',
            name: 'Group 1',
            options: [
              { id: 'ing-1', itemUuid: 'Item.test-herb-uuid', quantity: 1 }
            ]
          }
        ],
        essences: {},
        catalysts: []
      }
    ],
    resultGroups: [
      {
        id: 'rg-1',
        results: [
          { id: 'res-1', systemItemId: null, itemUuid: 'Item.some-uuid', quantity: 1 }
        ]
      }
    ],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Helper: minimal RecipeEditorApp harness (no DOM, no rendering).
// craftingSystemId must be non-null to pass the early-return guard inside
// _onSaveRecipe ("Recipe must belong to a crafting system.").
// ---------------------------------------------------------------------------

function makeEditorHarness({ existingRecipe = null } = {}) {
  const app = Object.create(RecipeEditorApp.prototype);
  app.recipe = existingRecipe;
  // A non-null craftingSystemId bypasses the guard that prevents saving
  app.craftingSystemId = TEST_SYSTEM_ID;
  app.draft = { craftingSystemId: TEST_SYSTEM_ID };
  app.options = { parentApp: null };
  app.close = async () => {};

  // Stub internal helpers used by _onSaveRecipe
  app._syncDraftFromForm = () => {};
  app._buildRecipePayload = () => makeValidPayload();
  app._validatePayload = () => ({ valid: true, errors: [] });
  app._getSystemFeatureState = () => ({});

  return app;
}

// ---------------------------------------------------------------------------
// Helper: build a RecipeManager with save() stubbed out so tests run without
// real Foundry settings storage.  System-level validators are also stubbed to
// avoid needing a real crafting system in game.fabricate.
// ---------------------------------------------------------------------------

function makeManager() {
  const manager = new RecipeManager();
  manager.initialized = true;
  // Override save so it doesn't hit game settings
  manager.save = async () => {};
  // Bypass system-level validation (essence/tag/mode checks require game.fabricate services)
  manager._validateEssenceReferences = () => ({ valid: true, errors: [] });
  manager._validateTagPlaceholders = () => ({ valid: true, errors: [] });
  manager._validateResolutionMode = () => ({ valid: true, errors: [] });
  return manager;
}

// ---------------------------------------------------------------------------
// Helper: install a minimal game.fabricate so _onSaveRecipe can call
// getRecipeManager().  getCraftingSystemManager returns null to cause all
// system-level validators to short-circuit (valid).
// ---------------------------------------------------------------------------

function installGameFabricate(manager) {
  game.fabricate = {
    getRecipeManager: () => manager,
    getCraftingSystemManager: () => null,
    getResolutionModeService: () => null
  };
}

// ---------------------------------------------------------------------------
// Test 1: createRecipe is called exactly once when saving a new recipe
// ---------------------------------------------------------------------------

test('_onSaveRecipe calls createRecipe exactly once for a new recipe', async () => {
  const app = makeEditorHarness({ existingRecipe: null });

  let createCallCount = 0;
  let updateCallCount = 0;

  const manager = makeManager();
  const originalCreate = manager.createRecipe.bind(manager);
  manager.createRecipe = async (payload) => {
    createCallCount++;
    return originalCreate(payload);
  };
  manager.updateRecipe = async () => {
    updateCallCount++;
  };

  installGameFabricate(manager);

  const originalDebug = console.debug;
  console.debug = () => {};
  try {
    await RecipeEditorApp._onSaveRecipe.call(app);
  } finally {
    console.debug = originalDebug;
  }

  assert.equal(createCallCount, 1, 'createRecipe should be called exactly once');
  assert.equal(updateCallCount, 0, 'updateRecipe should not be called for a new recipe');
});

// ---------------------------------------------------------------------------
// Test 2: updateRecipe is called exactly once when saving an existing recipe
// ---------------------------------------------------------------------------

test('_onSaveRecipe calls updateRecipe exactly once for an existing recipe', async () => {
  const fakeRecipe = { id: 'recipe-existing-001', name: 'Existing Potion', toJSON: () => ({}) };
  const app = makeEditorHarness({ existingRecipe: fakeRecipe });

  let createCallCount = 0;
  let updateCallCount = 0;

  const manager = makeManager();

  // Pre-populate the manager so updateRecipe can locate the recipe by ID
  const { Recipe } = await import('../src/models/Recipe.js');
  const existingRecipeObj = new Recipe({
    id: 'recipe-existing-001',
    name: 'Existing Potion',
    craftingSystemId: TEST_SYSTEM_ID,
    ingredientSets: [{
      id: 's-1',
      ingredientGroups: [{
        id: 'g-1',
        name: 'Group 1',
        options: [{ id: 'i-1', itemUuid: 'Item.x', quantity: 1 }]
      }],
      essences: {},
      catalysts: []
    }],
    resultGroups: [{ id: 'rg-1', results: [{ id: 'r-1', itemUuid: 'Item.x', quantity: 1 }] }]
  });
  manager.recipes.set('recipe-existing-001', existingRecipeObj);

  const originalUpdate = manager.updateRecipe.bind(manager);
  manager.updateRecipe = async (id, updates) => {
    updateCallCount++;
    return originalUpdate(id, updates);
  };
  manager.createRecipe = async () => {
    createCallCount++;
  };

  installGameFabricate(manager);

  const originalDebug = console.debug;
  console.debug = () => {};
  try {
    await RecipeEditorApp._onSaveRecipe.call(app);
  } finally {
    console.debug = originalDebug;
  }

  assert.equal(updateCallCount, 1, 'updateRecipe should be called exactly once');
  assert.equal(createCallCount, 0, 'createRecipe should not be called for an existing recipe');
});

// ---------------------------------------------------------------------------
// Test 3: RecipeManager.createRecipe logs the recipe name and ID to console
// ---------------------------------------------------------------------------

test('RecipeManager.createRecipe logs recipe name and ID after successful save', async () => {
  const manager = makeManager();

  const logMessages = [];
  const originalDebug = console.debug;
  console.debug = (...args) => logMessages.push(args.join(' '));

  try {
    const recipe = await manager.createRecipe(makeValidPayload({ name: 'Logged Potion' }));

    assert.ok(
      logMessages.some(msg =>
        msg.includes('Created recipe') &&
        msg.includes('Logged Potion') &&
        msg.includes(recipe.id)
      ),
      `Expected a console.debug containing "Created recipe", the recipe name, and its ID. Got: ${JSON.stringify(logMessages)}`
    );
  } finally {
    console.debug = originalDebug;
  }
});

// ---------------------------------------------------------------------------
// Test 4: RecipeManager.updateRecipe logs the recipe name and ID to console
// ---------------------------------------------------------------------------

test('RecipeManager.updateRecipe logs recipe name and ID after successful save', async () => {
  const manager = makeManager();

  // Seed an existing recipe so updateRecipe can find it
  const { Recipe } = await import('../src/models/Recipe.js');
  const existing = new Recipe({
    id: 'recipe-to-update',
    name: 'Original Name',
    craftingSystemId: TEST_SYSTEM_ID,
    ingredientSets: [{
      id: 's-1',
      ingredientGroups: [{
        id: 'g-1',
        name: 'Group 1',
        options: [{ id: 'i-1', itemUuid: 'Item.herb', quantity: 1 }]
      }],
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

    assert.ok(
      logMessages.some(msg =>
        msg.includes('Updated recipe') &&
        msg.includes('Updated Potion') &&
        msg.includes(updated.id)
      ),
      `Expected a console.debug containing "Updated recipe", the recipe name, and its ID. Got: ${JSON.stringify(logMessages)}`
    );
  } finally {
    console.debug = originalDebug;
  }
});

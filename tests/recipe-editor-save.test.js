/**
 * Tests for T-036: RecipeManager logs the recipe name and ID on create/update.
 *
 * These tests verify that:
 * 1. RecipeManager.createRecipe logs the recipe name and ID to console
 * 2. RecipeManager.updateRecipe logs the recipe name and ID to console
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Minimal FoundryVTT stubs required by imported modules
// ---------------------------------------------------------------------------

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`,
    getProperty: () => undefined
  }
};

globalThis.game = {
  user: { isGM: true, name: 'TestGM' },
  time: { worldTime: 0 },
  actors: [],
  fabricate: null
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

// ---------------------------------------------------------------------------
// Helper: build a minimal valid recipe payload that satisfies Recipe.validate()
// and IngredientSet.validate(). An ingredient set must contain at least one
// ingredient group, each group must have at least one option, and each
// Ingredient option must have a match rule or itemUuid.
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
        essences: {}
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
// Test 1: RecipeManager.createRecipe logs the recipe name and ID to console
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
// Test 2: RecipeManager.updateRecipe logs the recipe name and ID to console
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
      essences: {}
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

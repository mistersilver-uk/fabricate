/**
 * Unit tests for T-053: Disabled recipe editing and re-enabling
 *
 * Covers:
 *   AC1 - Disabled recipe remains in recipe list (enabled=false)
 *   AC2 - GM can update fields on a disabled recipe
 *   AC3 - GM can re-enable a disabled recipe
 *   AC4 - Re-enabled recipe persists after save/reload cycle
 *   AC5 - Non-GM cannot toggle recipe enabled state
 *   AC6 - Full disable -> edit -> re-enable flow
 *   AC7 - RecipeManager _buildDraft preserves enabled=false
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals
// ---------------------------------------------------------------------------

globalThis.foundry = {
  utils: {
    randomID: () => Math.random().toString(36).slice(2, 10)
  }
};

globalThis.ui = {
  notifications: { info: () => {}, warn: () => {}, error: () => {} }
};

// game stub — isGM is toggled per test where needed
globalThis.game = {
  user: { isGM: true, name: 'GM' }
};

// ---------------------------------------------------------------------------
// Module imports — after globals
// ---------------------------------------------------------------------------

const { Recipe } = await import('../src/models/Recipe.js');
const { RecipeManager } = await import('../src/systems/RecipeManager.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let savedData = null;

function makeManager() {
  const manager = new RecipeManager();
  manager.initialized = true;

  // Stub save/load so tests don't need real game settings
  manager.save = async () => {
    savedData = Array.from(manager.recipes.values()).map(r => r.toJSON());
  };

  return manager;
}

function makeRecipe(overrides = {}) {
  return {
    name: 'Test Recipe',
    craftingSystemId: 'system-1',
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: [
          {
            id: 'group-1',
            options: [{ itemUuid: 'Item.abc123', quantity: 1 }]
          }
        ]
      }
    ],
    resultGroups: [
      {
        id: 'result-group-1',
        name: 'Default',
        results: [{ id: 'result-1', itemUuid: 'Item.xyz789', quantity: 1 }]
      }
    ],
    enabled: true,
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// AC1 - Disabled recipe remains in recipe list
// ---------------------------------------------------------------------------

test('AC1 - disabled recipe appears in getRecipes() without enabled filter', async () => {
  const manager = makeManager();

  const recipe = await manager.createRecipe(makeRecipe({ enabled: false }));

  const all = manager.getRecipes();
  assert.equal(all.length, 1);
  assert.equal(all[0].id, recipe.id);
  assert.equal(all[0].enabled, false);
});

// ---------------------------------------------------------------------------
// AC2 - GM can update fields on a disabled recipe
// ---------------------------------------------------------------------------

test('AC2 - GM can update fields on a disabled recipe without re-enabling it', async () => {
  const manager = makeManager();

  const recipe = await manager.createRecipe(makeRecipe({ enabled: false }));

  const updated = await manager.updateRecipe(recipe.id, { name: 'Updated Name' });

  assert.equal(updated.name, 'Updated Name');
  assert.equal(updated.enabled, false, 'enabled should remain false after field update');
});

// ---------------------------------------------------------------------------
// AC3 - GM can re-enable a disabled recipe
// ---------------------------------------------------------------------------

test('AC3 - GM can re-enable a disabled recipe', async () => {
  const manager = makeManager();

  const recipe = await manager.createRecipe(makeRecipe({ enabled: false }));
  assert.equal(recipe.enabled, false);

  const updated = await manager.updateRecipe(recipe.id, { enabled: true });

  assert.equal(updated.enabled, true);
});

// ---------------------------------------------------------------------------
// AC4 - Re-enabled recipe persists after save/reload cycle
// ---------------------------------------------------------------------------

test('AC4 - re-enabled recipe persists in saved data', async () => {
  const manager = makeManager();
  savedData = null;

  const recipe = await manager.createRecipe(makeRecipe({ enabled: false }));
  await manager.updateRecipe(recipe.id, { enabled: true });

  // savedData is populated by the stubbed save()
  assert.ok(savedData, 'save() should have been called');
  const saved = savedData.find(r => r.id === recipe.id);
  assert.ok(saved, 'recipe should be in saved data');
  assert.equal(saved.enabled, true, 'saved data should reflect enabled: true');
});

// ---------------------------------------------------------------------------
// AC5 - Non-GM cannot toggle recipe enabled state
// ---------------------------------------------------------------------------

test('AC5 - non-GM cannot update recipe enabled state', async () => {
  const manager = makeManager();
  const recipe = await manager.createRecipe(makeRecipe({ enabled: false }));

  // Switch to non-GM
  globalThis.game.user.isGM = false;
  try {
    await assert.rejects(
      () => manager.updateRecipe(recipe.id, { enabled: true }),
      /GM permissions required/i,
      'should throw a GM permissions error'
    );
  } finally {
    // Restore GM
    globalThis.game.user.isGM = true;
  }
});

// ---------------------------------------------------------------------------
// AC6 - Disable -> edit other fields -> re-enable flow
// ---------------------------------------------------------------------------

test('AC6 - full disable/edit/re-enable flow preserves all changes', async () => {
  const manager = makeManager();

  const recipe = await manager.createRecipe(makeRecipe({ enabled: true }));

  // Disable
  await manager.updateRecipe(recipe.id, { enabled: false });
  // Edit while disabled
  await manager.updateRecipe(recipe.id, { description: 'Edited while disabled' });
  // Re-enable
  const final = await manager.updateRecipe(recipe.id, { enabled: true });

  assert.equal(final.enabled, true, 'recipe should be re-enabled');
  assert.equal(final.description, 'Edited while disabled', 'description should be preserved');
});

// ---------------------------------------------------------------------------
// AC7 - Recipe model preserves enabled=false (draft build equivalent)
// ---------------------------------------------------------------------------

test('AC7 - Recipe model preserves enabled=false when constructed from data', () => {
  const data = makeRecipe({ enabled: false });
  const recipe = new Recipe(data);

  assert.equal(recipe.enabled, false, 'Recipe should preserve enabled: false');
});

test('AC7b - Recipe.fromJSON round-trips enabled=false correctly', () => {
  const original = new Recipe(makeRecipe({ enabled: false }));
  const json = original.toJSON();
  const restored = Recipe.fromJSON(json);

  assert.equal(restored.enabled, false, 'Round-tripped recipe should have enabled: false');
});

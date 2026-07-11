/**
 * Unit tests for T-005: Add features.effectTransfer Toggle
 *
 * Group 1: _normalizeFeatures includes effectTransfer (3 tests)
 * Group 2: CraftingEngine gates effect transfer on system feature (4 tests)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingSystemManager } from '../src/systems/CraftingSystemManager.js';
import { CraftingEngine } from '../src/systems/CraftingEngine.js';

// ---------------------------------------------------------------------------
// Globals required for the modules to load
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = {
  utils: {
    getProperty,
    randomID: () => Math.random().toString(36).slice(2)
  }
};

globalThis.game = {};

globalThis.ui = {
  notifications: { info: () => {}, warn: () => {}, error: () => {} }
};

// ---------------------------------------------------------------------------
// Group 1: _normalizeFeatures includes effectTransfer
// ---------------------------------------------------------------------------

test('effectTransfer defaults to false when not specified', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const result = manager._normalizeFeatures({});
  assert.equal(result.effectTransfer, false);
});

test('effectTransfer is true when explicitly set to true', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const result = manager._normalizeFeatures({ features: { effectTransfer: true } });
  assert.equal(result.effectTransfer, true);
});

test('effectTransfer is false when set to a non-boolean truthy value', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  // Only the boolean value `true` passes; strings, numbers etc. should not
  const result = manager._normalizeFeatures({ features: { effectTransfer: 1 } });
  assert.equal(result.effectTransfer, false);
});

// ---------------------------------------------------------------------------
// #102: complexRecipes is removed as a normalized feature, but survives as a
// legacy compatibility input that seeds multiStepRecipes.
// ---------------------------------------------------------------------------

test('#102: complexRecipes is no longer emitted as a normalized feature', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  assert.equal('complexRecipes' in manager._normalizeFeatures({}), false);
  assert.equal('complexRecipes' in manager._normalizeFeatures({ features: { complexRecipes: true } }), false);
});

test('#102: legacy features.complexRecipes still seeds multiStepRecipes when multiStepRecipes is absent', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  assert.equal(manager._normalizeFeatures({ features: { complexRecipes: true } }).multiStepRecipes, true);
  assert.equal(manager._normalizeFeatures({ features: { complexRecipes: false } }).multiStepRecipes, false);
});

test('#102: an explicit multiStepRecipes wins over the legacy complexRecipes seed', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  assert.equal(
    manager._normalizeFeatures({ features: { multiStepRecipes: false, complexRecipes: true } }).multiStepRecipes,
    false
  );
  assert.equal(
    manager._normalizeFeatures({ features: { multiStepRecipes: true, complexRecipes: false } }).multiStepRecipes,
    true
  );
});

// ---------------------------------------------------------------------------
// Helpers for Group 2
// ---------------------------------------------------------------------------

/**
 * Configure globalThis.game with a crafting system whose features.effectTransfer
 * is set to the provided value.
 */
function setupGameWithEffectTransfer(effectTransferValue) {
  const system = {
    features: {
      effectTransfer: effectTransferValue
    },
    craftingCheck: {
      enabled: false
    }
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => system
      }),
      getResolutionModeService: () => null,
      getCraftingRunManager: () => null
    },
    user: { id: 'user-1' },
    time: { worldTime: 0 }
  };
  return system;
}

function buildFakeIngredientItem(id, quantity = 2) {
  return {
    id,
    uuid: `Item.${id}`,
    name: `Item ${id}`,
    parent: null,
    system: { quantity },
    deleteCalled: false,
    updateCalled: false,
    async delete() { this.deleteCalled = true; },
    async update(payload) {
      this.updateCalled = true;
      if (payload['system.quantity'] !== undefined) {
        this.system.quantity = payload['system.quantity'];
      }
    }
  };
}

function buildFakeIngredientSet(ingredientItem) {
  const ingredient = {
    systemItemId: ingredientItem.id,
    quantity: 1,
    extractEffects: false,
    getDescription: () => ingredientItem.name
  };
  return {
    id: 'set-1',
    matchIngredients(availableItems, matcher) {
      const matched = availableItems.find(i => i === ingredientItem);
      if (!matched) return [];
      return [{ item: matched, quantity: 1, ingredient }];
    }
  };
}

function buildFakeRecipe(ingredientSet, transferEffects) {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [],
    outcomeRouting: null,
    transferEffects,
    getExecutionSteps: null,
    validate() { return { valid: true, errors: [] }; },
    toJSON() { return { id: this.id, name: this.name }; }
  };
}

/**
 * Build a minimal CraftingEngine and run craft() to completion.
 * Returns whether _transferEffects was called.
 */
async function runCraftAndCheckTransfer(transferEffectsFlag, effectTransferValue) {
  setupGameWithEffectTransfer(effectTransferValue);

  const ingredientItem = buildFakeIngredientItem('ing-1');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet, transferEffectsFlag);

  const mockResolutionService = {
    validateRecipe() { return { valid: true, errors: [] }; },
    validateCheckResult() { return true; },
    resolveResultGroups() {
      // Return one result group with one result so _createSingleResult is called
      return {
        groups: [{ results: [{ systemItemId: 'item-a', quantity: 1 }] }],
        meta: {}
      };
    },
    getMode() { return 'simple'; }
  };

  const mockRecipeManager = {
    canCraft() {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [] } };
    },
    ingredientMatchesItem(recipe, ingredient, item) { return item === ingredientItem; }
  };

  const engine = new CraftingEngine(mockRecipeManager, null, mockResolutionService);
  // Stub out _runCraftingCheck so no macro execution is needed
  engine._runCraftingCheck = async () => ({ success: true, outcome: null, value: null, data: {} });

  let transferEffectsCalled = false;
  engine._transferEffects = async () => { transferEffectsCalled = true; };

  // _createSingleResult needs fromUuid and createEmbeddedDocuments
  // Provide a minimal fake source item lookup
  globalThis.fromUuid = async (uuid) => null;

  // Override _createSingleResult to call our instrumented _transferEffects
  // but still honour the conditional logic we're testing.
  // We do this by patching the system to return managedItems and a fake created item.
  const fakeCreatedItem = { id: 'created-1', uuid: 'Item.created-1', system: { quantity: 1 } };

  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem] };
  const craftingActor = {
    id: 'a1',
    name: 'Crafter',
    uuid: 'Actor.a1',
    items: { contents: [] },
    createEmbeddedDocuments: async () => [fakeCreatedItem]
  };

  // Also inject the system with components so _createSingleResult can find it
  globalThis.game.fabricate.getCraftingSystemManager = () => ({
    getSystem: () => ({
      features: { effectTransfer: effectTransferValue },
      craftingCheck: { enabled: false },
      components: [
        { id: 'item-a', name: 'Item A', img: 'icons/svg/item-bag.svg', registeredItemUuid: null }
      ]
    })
  });

  await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  return transferEffectsCalled;
}

// ---------------------------------------------------------------------------
// Group 2: CraftingEngine gates effect transfer on system feature
// ---------------------------------------------------------------------------

test('effect transfer executes when both recipe.transferEffects and system features.effectTransfer are true', async () => {
  const called = await runCraftAndCheckTransfer(true, true);
  assert.equal(called, true, '_transferEffects should be called when both flags are true');
});

test('effect transfer is skipped when system features.effectTransfer is false even if recipe.transferEffects is true', async () => {
  const called = await runCraftAndCheckTransfer(true, false);
  assert.equal(called, false, '_transferEffects should NOT be called when system feature is false');
});

test('effect transfer is skipped when recipe.transferEffects is false regardless of system features.effectTransfer', async () => {
  const called = await runCraftAndCheckTransfer(false, true);
  assert.equal(called, false, '_transferEffects should NOT be called when recipe.transferEffects is false');
});

test('effect transfer is skipped when both recipe.transferEffects and system features.effectTransfer are false', async () => {
  const called = await runCraftAndCheckTransfer(false, false);
  assert.equal(called, false, '_transferEffects should NOT be called when both flags are false');
});

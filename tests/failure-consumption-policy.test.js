/**
 * Unit tests for T-008: Failure Consumption Policy
 *
 * Tests that CraftingEngine correctly applies consumeIngredientsOnFail and
 * consumeCatalystsOnFail policies on both crafting check failure paths.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';

// ---------------------------------------------------------------------------
// Globals required for the module to load
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = { utils: { getProperty } };

// game is set per-test via setupGame()
globalThis.game = {};

globalThis.ui = {
  notifications: { info: () => {}, warn: () => {}, error: () => {} }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Configure globalThis.game with a crafting system that has the given
 * craftingCheck.consumption policy.
 */
function setupGame(consumptionPolicy = {}) {
  const system = {
    advancedOptionsEnabled: true,
    craftingCheck: {
      enabled: true,
      macroUuid: 'macro:check-uuid',
      consumption: {
        consumeIngredientsOnFail: consumptionPolicy.consumeIngredientsOnFail,
        consumeCatalystsOnFail: consumptionPolicy.consumeCatalystsOnFail
      }
    }
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => system
      }),
      getResolutionModeService: () => null
    },
    user: { id: 'user-1' },
    time: { worldTime: 0 }
  };
  return system;
}

/**
 * Build a minimal fake actor item that tracks calls to delete() and update().
 */
function buildFakeItem(id, quantity = 1) {
  const item = {
    id,
    uuid: `Item.${id}`,
    name: `Item ${id}`,
    parent: null,
    system: { quantity },
    deleteCalled: false,
    updateCalled: false,
    updatePayloads: [],
    async delete() {
      this.deleteCalled = true;
    },
    async update(payload) {
      this.updateCalled = true;
      this.updatePayloads.push(payload);
      if (payload['system.quantity'] !== undefined) {
        this.system.quantity = payload['system.quantity'];
      }
    }
  };
  return item;
}

/**
 * Build a fake catalyst model that tracks calls to applyDegradation().
 */
function buildFakeCatalyst(systemItemId = 'cat-1') {
  return {
    systemItemId,
    applyDegradationCalled: false,
    async applyDegradation(item) {
      this.applyDegradationCalled = true;
    }
  };
}

/**
 * Build a minimal fake ingredient set with one ingredient matching one item.
 * matchIngredients() is the method called by _consumeIngredients().
 */
function buildFakeIngredientSet(ingredientItem) {
  const ingredient = { systemItemId: ingredientItem.id, quantity: 1, getDescription: () => ingredientItem.name };
  return {
    id: 'set-1',
    matchIngredients(availableItems, matcher) {
      const matched = availableItems.find(i => i === ingredientItem);
      if (!matched) return [];
      return [{ item: matched, quantity: 1, ingredient }];
    }
  };
}

/**
 * Build a minimal recipe-like object. CraftingEngine uses duck-typed recipes
 * in its internal paths; craft() calls recipe.validate() then
 * recipe.getExecutionSteps() (or falls back to recipe.ingredientSets etc.).
 */
function buildFakeRecipe(ingredientSet, catalysts = []) {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [],
    catalysts,
    outcomeRouting: null,
    steps: [],
    transferEffects: false,
    getExecutionSteps: null, // force implicit step path
    validate() {
      return { valid: true, errors: [] };
    },
    toJSON() {
      return { id: this.id, name: this.name };
    }
  };
}

/**
 * Build a CraftingEngine with a mock RecipeManager and optional services.
 */
function buildEngine({ ingredientItem, catalystItem, fakeCatalyst, ingredientSet, options = {} } = {}) {
  const mockRecipeManager = {
    canCraft(actors, recipe) {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], catalysts: [] } };
    },
    getCatalystsForSet(recipe, set) {
      return fakeCatalyst ? [fakeCatalyst] : [];
    },
    catalystMatchesItem(recipe, catalyst, item) {
      return item === catalystItem;
    },
    ingredientMatchesItem(recipe, ingredient, item) {
      return item === ingredientItem;
    }
  };

  return new CraftingEngine(mockRecipeManager, null, null);
}

/**
 * Override the engine's _runCraftingCheck method to return a controlled result.
 * This avoids needing a real MacroExecutor and keeps the check deterministic.
 */
function stubCraftingCheck(engine, result) {
  engine._runCraftingCheck = async () => result;
}

// ---------------------------------------------------------------------------
// Test Group 1: _getFailureConsumptionPolicy helper
// ---------------------------------------------------------------------------

test('_getFailureConsumptionPolicy returns spec defaults when recipe has no craftingSystemId', () => {
  setupGame();
  const engine = new CraftingEngine({});
  const policy = engine._getFailureConsumptionPolicy({ craftingSystemId: null });
  assert.equal(policy.consumeIngredientsOnFail, true);
  assert.equal(policy.consumeCatalystsOnFail, false);
});

test('_getFailureConsumptionPolicy returns policy from system craftingCheck.consumption', () => {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => ({
          craftingCheck: {
            consumption: { consumeIngredientsOnFail: false, consumeCatalystsOnFail: true }
          }
        })
      })
    }
  };
  const engine = new CraftingEngine({});
  const policy = engine._getFailureConsumptionPolicy({ craftingSystemId: 'sys-1' });
  assert.equal(policy.consumeIngredientsOnFail, false);
  assert.equal(policy.consumeCatalystsOnFail, true);
});

test('_getFailureConsumptionPolicy defaults consumeIngredientsOnFail to true when consumption object is empty', () => {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => ({
          craftingCheck: { consumption: {} }
        })
      })
    }
  };
  const engine = new CraftingEngine({});
  const policy = engine._getFailureConsumptionPolicy({ craftingSystemId: 'sys-1' });
  assert.equal(policy.consumeIngredientsOnFail, true);
});

test('_getFailureConsumptionPolicy defaults consumeCatalystsOnFail to false when consumption object is empty', () => {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => ({
          craftingCheck: { consumption: {} }
        })
      })
    }
  };
  const engine = new CraftingEngine({});
  const policy = engine._getFailureConsumptionPolicy({ craftingSystemId: 'sys-1' });
  assert.equal(policy.consumeCatalystsOnFail, false);
});

// ---------------------------------------------------------------------------
// Test Group 2: Failure consumption on crafting check failure — all four flag combos
// ---------------------------------------------------------------------------

async function runCheckFailureScenario({ consumeIngredientsOnFail, consumeCatalystsOnFail }) {
  setupGame({ consumeIngredientsOnFail, consumeCatalystsOnFail });

  const ingredientItem = buildFakeItem('ing-1', 2);
  const catalystItem = buildFakeItem('cat-item-1', 1);
  const fakeCatalyst = buildFakeCatalyst('cat-1');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet, [fakeCatalyst]);

  const engine = buildEngine({ ingredientItem, catalystItem, fakeCatalyst, ingredientSet });
  stubCraftingCheck(engine, { success: false, message: 'Check failed', outcome: null, value: null, data: {} });

  // _validateCatalysts needs actor.items with a matching catalyst item
  catalystItem.id = 'cat-item-1';
  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem, catalystItem] };
  const craftingActor = { id: 'a1', name: 'Crafter', uuid: 'Actor.a1', items: { contents: [] } };

  // Also need catalystMatchesItem to match catalystItem for the fakeCatalyst
  engine.recipeManager.catalystMatchesItem = (recipe, catalyst, item) => {
    return catalyst === fakeCatalyst && item === catalystItem;
  };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  return { result, ingredientItem, fakeCatalyst };
}

test('craft() consumes ingredients AND degrades catalysts on check failure when both flags true', async () => {
  const { result, ingredientItem, fakeCatalyst } = await runCheckFailureScenario({
    consumeIngredientsOnFail: true,
    consumeCatalystsOnFail: true
  });
  assert.equal(result.success, false);
  assert.equal(ingredientItem.updateCalled, true, 'ingredient should have been partially consumed via update');
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should not have been deleted (quantity > requested)');
  assert.equal(fakeCatalyst.applyDegradationCalled, true, 'catalyst should have been degraded');
});

test('craft() consumes ingredients but NOT catalysts on check failure (default policy: true/false)', async () => {
  const { result, ingredientItem, fakeCatalyst } = await runCheckFailureScenario({
    consumeIngredientsOnFail: true,
    consumeCatalystsOnFail: false
  });
  assert.equal(result.success, false);
  assert.equal(ingredientItem.updateCalled, true, 'ingredient should have been partially consumed via update');
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should not have been deleted (quantity > requested)');
  assert.equal(fakeCatalyst.applyDegradationCalled, false, 'catalyst should NOT have been degraded');
});

test('craft() does NOT consume ingredients but DOES degrade catalysts on check failure (false/true)', async () => {
  const { result, ingredientItem, fakeCatalyst } = await runCheckFailureScenario({
    consumeIngredientsOnFail: false,
    consumeCatalystsOnFail: true
  });
  assert.equal(result.success, false);
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should NOT have been deleted');
  assert.equal(ingredientItem.updateCalled, false, 'ingredient should NOT have been updated');
  assert.equal(fakeCatalyst.applyDegradationCalled, true, 'catalyst should have been degraded');
});

test('craft() does NOT consume ingredients AND does NOT degrade catalysts on check failure when both flags false', async () => {
  const { result, ingredientItem, fakeCatalyst } = await runCheckFailureScenario({
    consumeIngredientsOnFail: false,
    consumeCatalystsOnFail: false
  });
  assert.equal(result.success, false);
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should NOT have been deleted');
  assert.equal(ingredientItem.updateCalled, false, 'ingredient should NOT have been updated');
  assert.equal(fakeCatalyst.applyDegradationCalled, false, 'catalyst should NOT have been degraded');
});

// ---------------------------------------------------------------------------
// Test Group 3: Failure consumption on check result validation failure
// ---------------------------------------------------------------------------

async function runValidationFailureScenario({ consumeIngredientsOnFail, consumeCatalystsOnFail }) {
  setupGame({ consumeIngredientsOnFail, consumeCatalystsOnFail });

  const ingredientItem = buildFakeItem('ing-2', 3);
  const catalystItem = buildFakeItem('cat-item-2', 1);
  const fakeCatalyst = buildFakeCatalyst('cat-2');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet, [fakeCatalyst]);

  const mockRecipeManager = {
    canCraft() {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], catalysts: [] } };
    },
    getCatalystsForSet() {
      return [fakeCatalyst];
    },
    catalystMatchesItem(recipe, catalyst, item) {
      return catalyst === fakeCatalyst && item === catalystItem;
    },
    ingredientMatchesItem(recipe, ingredient, item) {
      return item === ingredientItem;
    }
  };

  // resolutionModeService that makes validateCheckResult return false
  const mockResolutionService = {
    validateRecipe() { return { valid: true, errors: [] }; },
    validateCheckResult() { return false; },
    resolveResultGroups() { return { groups: [], meta: {} }; },
    getMode() { return 'simple'; }
  };

  const engine = new CraftingEngine(mockRecipeManager, null, mockResolutionService);
  // The check itself succeeds — only the validateCheckResult call fails
  stubCraftingCheck(engine, { success: true, outcome: 'pass', value: 10, data: {} });

  catalystItem.id = 'cat-item-2';
  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem, catalystItem] };
  const craftingActor = { id: 'a1', name: 'Crafter', uuid: 'Actor.a1', items: { contents: [] } };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  return { result, ingredientItem, fakeCatalyst };
}

test('craft() applies failure consumption policy when check result validation fails (both true)', async () => {
  const { result, ingredientItem, fakeCatalyst } = await runValidationFailureScenario({
    consumeIngredientsOnFail: true,
    consumeCatalystsOnFail: true
  });
  assert.equal(result.success, false);
  assert.match(result.message, /resolution mode requirements/i);
  assert.equal(ingredientItem.updateCalled, true, 'ingredient should have been partially consumed via update');
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should not have been deleted (quantity > requested)');
  assert.equal(fakeCatalyst.applyDegradationCalled, true, 'catalyst should have been degraded');
});

test('craft() does not consume when policy is false/false and check result validation fails', async () => {
  const { result, ingredientItem, fakeCatalyst } = await runValidationFailureScenario({
    consumeIngredientsOnFail: false,
    consumeCatalystsOnFail: false
  });
  assert.equal(result.success, false);
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should NOT have been deleted');
  assert.equal(ingredientItem.updateCalled, false, 'ingredient should NOT have been updated');
  assert.equal(fakeCatalyst.applyDegradationCalled, false, 'catalyst should NOT have been degraded');
});

// ---------------------------------------------------------------------------
// Test Group 4: Edge cases
// ---------------------------------------------------------------------------

test('craft() does not consume on pre-check failure (missing ingredients)', async () => {
  setupGame({ consumeIngredientsOnFail: true, consumeCatalystsOnFail: true });

  const ingredientItem = buildFakeItem('ing-3', 1);
  const fakeCatalyst = buildFakeCatalyst('cat-3');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet, [fakeCatalyst]);

  const mockRecipeManager = {
    canCraft() {
      return {
        canCraft: false,
        satisfiableSet: null,
        missing: {
          ingredients: [{ ingredient: { getDescription: () => 'Herb' }, have: 0, need: 1 }],
          essences: [],
          catalysts: []
        }
      };
    },
    getCatalystsForSet() { return [fakeCatalyst]; },
    catalystMatchesItem() { return false; },
    ingredientMatchesItem() { return false; }
  };

  const engine = new CraftingEngine(mockRecipeManager, null, null);
  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem] };
  const craftingActor = { id: 'a1', name: 'Crafter', uuid: 'Actor.a1', items: { contents: [] } };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false);
  assert.match(result.message, /Missing required items/i);
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should NOT be consumed on pre-check failure');
  assert.equal(fakeCatalyst.applyDegradationCalled, false, 'catalyst should NOT be degraded on pre-check failure');
});

test('craft() success path still consumes ingredients regardless of consumeIngredientsOnFail policy', async () => {
  // consumeIngredientsOnFail: false means nothing consumed ON FAILURE —
  // it should have no effect on the success path which always consumes.
  setupGame({ consumeIngredientsOnFail: false, consumeCatalystsOnFail: false });

  const ingredientItem = buildFakeItem('ing-4', 2);
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet, []);

  const mockResolutionService = {
    validateRecipe() { return { valid: true, errors: [] }; },
    validateCheckResult() { return true; },
    resolveResultGroups() { return { groups: [], meta: {} }; },
    getMode() { return 'simple'; }
  };

  const mockRecipeManager = {
    canCraft() {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], catalysts: [] } };
    },
    getCatalystsForSet() { return []; },
    catalystMatchesItem() { return false; },
    ingredientMatchesItem(recipe, ingredient, item) {
      return item === ingredientItem;
    }
  };

  const engine = new CraftingEngine(mockRecipeManager, null, mockResolutionService);
  // Crafting check passes
  stubCraftingCheck(engine, { success: true, outcome: null, value: null, data: {} });

  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem] };
  const craftingActor = { id: 'a1', name: 'Crafter', uuid: 'Actor.a1', items: { contents: [] }, createEmbeddedDocuments: async () => [] };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'craft should succeed');
  assert.ok(ingredientItem.deleteCalled || ingredientItem.updateCalled,
    'ingredient should be consumed on success regardless of failure policy');
});

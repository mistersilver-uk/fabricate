/**
 * Unit tests for T-008: Failure Consumption Policy
 *
 * Tests that CraftingEngine correctly applies consumeIngredientsOnFail and
 * breakToolsOnFail policies on both crafting check failure paths.
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
    craftingCheck: {
      enabled: true,
      macroUuid: 'macro:check-uuid',
      consumption: {
        consumeIngredientsOnFail: consumptionPolicy.consumeIngredientsOnFail,
        breakToolsOnFail: consumptionPolicy.breakToolsOnFail
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
 * Build a minimal fake actor item that tracks calls to delete() and update(),
 * plus a fabricate flag store so tool usage/breakage can be observed.
 */
function buildFakeItem(id, quantity = 1) {
  const flags = {};
  const item = {
    id,
    uuid: `Item.${id}`,
    name: `Item ${id}`,
    parent: null,
    system: { quantity },
    deleteCalled: false,
    updateCalled: false,
    updatePayloads: [],
    getFlag(ns, key) { return flags[`${ns}.${key}`]; },
    async setFlag(ns, key, value) { flags[`${ns}.${key}`] = value; return value; },
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
 * Build a fake library Tool (limitedUses) plus a spy recording whether it was
 * used on the failure-consumption path. The Tool itself is a plain object the
 * RecipeManager test-double resolves via getToolsForSet.
 */
function buildFakeTool(componentId = 'tool-1') {
  return {
    id: `lib-${componentId}`,
    componentId,
    breakage: { mode: 'limitedUses', maxUses: 5 },
    onBreak: { mode: 'flagBroken' }
  };
}

/**
 * Build a minimal fake ingredient set with one ingredient matching one item.
 * matchIngredients() is the method the engine's single-selection resolver
 * (_resolveCraftSelection) calls to build the consumption plan for this stub.
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
function buildFakeRecipe(ingredientSet, toolIds = []) {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    craftingSystemId: 'sys-1',
    ingredientSets: [ingredientSet],
    resultGroups: [],
    toolIds,
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
function buildEngine({ ingredientItem, toolItem, fakeTool, ingredientSet, options = {} } = {}) {
  const mockRecipeManager = {
    canCraft(actors, recipe) {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], tools: [] } };
    },
    getToolsForSet(recipe, set) {
      return fakeTool ? [fakeTool] : [];
    },
    toolMatchesItem(recipe, tool, item) {
      return item === toolItem;
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
  assert.equal(policy.breakToolsOnFail, false);
});

test('_getFailureConsumptionPolicy returns policy from system craftingCheck.consumption', () => {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => ({
          craftingCheck: {
            consumption: { consumeIngredientsOnFail: false, breakToolsOnFail: true }
          }
        })
      })
    }
  };
  const engine = new CraftingEngine({});
  const policy = engine._getFailureConsumptionPolicy({ craftingSystemId: 'sys-1' });
  assert.equal(policy.consumeIngredientsOnFail, false);
  assert.equal(policy.breakToolsOnFail, true);
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

test('_getFailureConsumptionPolicy defaults breakToolsOnFail to false when consumption object is empty', () => {
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
  assert.equal(policy.breakToolsOnFail, false);
});

// ---------------------------------------------------------------------------
// Test Group 2: Failure consumption on crafting check failure — all four flag combos
// ---------------------------------------------------------------------------

async function runCheckFailureScenario({ consumeIngredientsOnFail, breakToolsOnFail }) {
  setupGame({ consumeIngredientsOnFail, breakToolsOnFail });

  const ingredientItem = buildFakeItem('ing-1', 2);
  const toolItem = buildFakeItem('tool-item-1', 1);
  const fakeTool = buildFakeTool('tool-1');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet, [fakeTool.id]);

  const engine = buildEngine({ ingredientItem, toolItem, fakeTool, ingredientSet });
  stubCraftingCheck(engine, { success: false, message: 'Check failed', outcome: null, value: null, data: {} });

  const toolUsed = { value: false };
  engine._applyToolBreakage = async () => { toolUsed.value = true; return []; };

  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem, toolItem] };
  const craftingActor = { id: 'a1', name: 'Crafter', uuid: 'Actor.a1', items: { contents: [] } };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  return { result, ingredientItem, toolUsed };
}

test('craft() consumes ingredients AND breaks tools on check failure when both flags true', async () => {
  const { result, ingredientItem, toolUsed } = await runCheckFailureScenario({
    consumeIngredientsOnFail: true,
    breakToolsOnFail: true
  });
  assert.equal(result.success, false);
  assert.equal(ingredientItem.updateCalled, true, 'ingredient should have been partially consumed via update');
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should not have been deleted (quantity > requested)');
  assert.equal(toolUsed.value, true, 'tool should have been used/broken');
});

test('craft() consumes ingredients but NOT tools on check failure (default policy: true/false)', async () => {
  const { result, ingredientItem, toolUsed } = await runCheckFailureScenario({
    consumeIngredientsOnFail: true,
    breakToolsOnFail: false
  });
  assert.equal(result.success, false);
  assert.equal(ingredientItem.updateCalled, true, 'ingredient should have been partially consumed via update');
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should not have been deleted (quantity > requested)');
  assert.equal(toolUsed.value, false, 'tool should NOT have been used/broken');
});

test('craft() does NOT consume ingredients but DOES break tools on check failure (false/true)', async () => {
  const { result, ingredientItem, toolUsed } = await runCheckFailureScenario({
    consumeIngredientsOnFail: false,
    breakToolsOnFail: true
  });
  assert.equal(result.success, false);
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should NOT have been deleted');
  assert.equal(ingredientItem.updateCalled, false, 'ingredient should NOT have been updated');
  assert.equal(toolUsed.value, true, 'tool should have been used/broken');
});

test('craft() does NOT consume ingredients AND does NOT break tools on check failure when both flags false', async () => {
  const { result, ingredientItem, toolUsed } = await runCheckFailureScenario({
    consumeIngredientsOnFail: false,
    breakToolsOnFail: false
  });
  assert.equal(result.success, false);
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should NOT have been deleted');
  assert.equal(ingredientItem.updateCalled, false, 'ingredient should NOT have been updated');
  assert.equal(toolUsed.value, false, 'tool should NOT have been used/broken');
});

// ---------------------------------------------------------------------------
// Test Group 3: Failure consumption on check result validation failure
// ---------------------------------------------------------------------------

async function runValidationFailureScenario({ consumeIngredientsOnFail, breakToolsOnFail }) {
  setupGame({ consumeIngredientsOnFail, breakToolsOnFail });

  const ingredientItem = buildFakeItem('ing-2', 3);
  const toolItem = buildFakeItem('tool-item-2', 1);
  const fakeTool = buildFakeTool('tool-2');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet, [fakeTool.id]);

  const mockRecipeManager = {
    canCraft() {
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], tools: [] } };
    },
    getToolsForSet() {
      return [fakeTool];
    },
    toolMatchesItem(recipe, tool, item) {
      return tool === fakeTool && item === toolItem;
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

  const toolUsed = { value: false };
  engine._applyToolBreakage = async () => { toolUsed.value = true; return []; };

  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem, toolItem] };
  const craftingActor = { id: 'a1', name: 'Crafter', uuid: 'Actor.a1', items: { contents: [] } };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  return { result, ingredientItem, toolUsed };
}

test('craft() applies failure consumption policy when check result validation fails (both true)', async () => {
  const { result, ingredientItem, toolUsed } = await runValidationFailureScenario({
    consumeIngredientsOnFail: true,
    breakToolsOnFail: true
  });
  assert.equal(result.success, false);
  assert.match(result.message, /resolution mode requirements/i);
  assert.equal(ingredientItem.updateCalled, true, 'ingredient should have been partially consumed via update');
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should not have been deleted (quantity > requested)');
  assert.equal(toolUsed.value, true, 'tool should have been used/broken');
});

test('craft() does not consume when policy is false/false and check result validation fails', async () => {
  const { result, ingredientItem, toolUsed } = await runValidationFailureScenario({
    consumeIngredientsOnFail: false,
    breakToolsOnFail: false
  });
  assert.equal(result.success, false);
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should NOT have been deleted');
  assert.equal(ingredientItem.updateCalled, false, 'ingredient should NOT have been updated');
  assert.equal(toolUsed.value, false, 'tool should NOT have been used/broken');
});

// ---------------------------------------------------------------------------
// Test Group 4: Edge cases
// ---------------------------------------------------------------------------

test('craft() does not consume on pre-check failure (missing ingredients)', async () => {
  setupGame({ consumeIngredientsOnFail: true, breakToolsOnFail: true });

  const ingredientItem = buildFakeItem('ing-3', 1);
  const fakeTool = buildFakeTool('tool-3');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet, [fakeTool.id]);

  const mockRecipeManager = {
    canCraft() {
      return {
        canCraft: false,
        satisfiableSet: null,
        missing: {
          ingredients: [{ ingredient: { getDescription: () => 'Herb' }, have: 0, need: 1 }],
          essences: [],
          tools: []
        }
      };
    },
    getToolsForSet() { return [fakeTool]; },
    toolMatchesItem() { return false; },
    ingredientMatchesItem() { return false; }
  };

  const engine = new CraftingEngine(mockRecipeManager, null, null);
  const toolUsed = { value: false };
  engine._applyToolBreakage = async () => { toolUsed.value = true; return []; };
  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem] };
  const craftingActor = { id: 'a1', name: 'Crafter', uuid: 'Actor.a1', items: { contents: [] } };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false);
  assert.match(result.message, /Missing required items/i);
  assert.equal(ingredientItem.deleteCalled, false, 'ingredient should NOT be consumed on pre-check failure');
  assert.equal(toolUsed.value, false, 'tool should NOT be used/broken on pre-check failure');
});

test('_consumeIngredients defaults missing item.system.quantity to 1', async () => {
  const ingredientItem = buildFakeItem('ing-missing-system', 1);
  ingredientItem.system = undefined;
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const engine = buildEngine({ ingredientItem, ingredientSet });

  // _consumeIngredients now consumes a precomputed item plan (the single craft selection
  // is resolved once in craft()); pass the plan directly here.
  const consumptionPlan = [{ item: ingredientItem, quantity: 1, ingredient: { quantity: 1 } }];
  const consumedItems = await engine._consumeIngredients(consumptionPlan);

  assert.equal(consumedItems.length, 1, 'one matched ingredient should be returned');
  assert.equal(consumedItems[0].item, ingredientItem);
  assert.equal(consumedItems[0].quantity, 1);
  assert.equal(ingredientItem.deleteCalled, true, 'item without system data should default to quantity 1 and delete cleanly');
  assert.equal(ingredientItem.updateCalled, false, 'item should not be updated when default quantity is fully consumed');
});

test('craft() success path still consumes ingredients regardless of consumeIngredientsOnFail policy', async () => {
  // consumeIngredientsOnFail: false means nothing consumed ON FAILURE —
  // it should have no effect on the success path which always consumes.
  setupGame({ consumeIngredientsOnFail: false, breakToolsOnFail: false });

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
      return { canCraft: true, satisfiableSet: ingredientSet, missing: { ingredients: [], essences: [], tools: [] } };
    },
    getToolsForSet() { return []; },
    toolMatchesItem() { return false; },
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

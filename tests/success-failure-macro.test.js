/**
 * Unit tests for T-007: Success and Failure Macro Execution
 *
 * Tests that CraftingEngine correctly invokes successMacroUuid / failureMacroUuid
 * after step resolution, with the spec-defined context shapes, and that macro
 * errors are caught without blocking the crafting flow.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingEngine } from '../src/systems/CraftingEngine.js';

// ---------------------------------------------------------------------------
// Minimal globals required by CraftingEngine module load
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = { utils: { getProperty, setProperty: () => {} } };
globalThis.game = {};
globalThis.ui = {
  notifications: { info: () => {}, warn: () => {}, error: () => {} }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Set up globalThis.game with a system that has the given craftingCheck config.
 */
function setupGame(craftingCheck = {}) {
  const system = {
    id: 'sys-1',
    advancedOptionsEnabled: true,
    features: { craftingChecks: true },
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      successMacroUuid: craftingCheck.successMacroUuid || null,
      failureMacroUuid: craftingCheck.failureMacroUuid || null,
      consumption: {
        consumeIngredientsOnFail: false,
        consumeCatalystsOnFail: false
      }
    }
  };
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (id) => (id === 'sys-1' ? system : null)
      }),
      getResolutionModeService: () => null
    },
    user: { id: 'user-1' },
    time: { worldTime: 0 }
  };
  return system;
}

/** Build a minimal fake ingredient item. */
function buildFakeItem(id, quantity = 2) {
  return {
    id,
    uuid: `Item.${id}`,
    name: `Item ${id}`,
    parent: null,
    system: { quantity },
    async delete() {},
    async update(payload) {
      if (payload['system.quantity'] !== undefined) {
        this.system.quantity = payload['system.quantity'];
      }
    }
  };
}

/** Build a fake ingredient set that matches a specific item. */
function buildFakeIngredientSet(ingredientItem) {
  const ingredient = {
    systemItemId: ingredientItem.id,
    quantity: 1,
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

/** Build a minimal duck-typed recipe. */
function buildFakeRecipe(ingredientSet, systemId = 'sys-1') {
  return {
    id: 'recipe-1',
    name: 'Test Recipe',
    craftingSystemId: systemId,
    ingredientSets: [ingredientSet],
    resultGroups: [],
    catalysts: [],
    outcomeRouting: null,
    transferEffects: false,
    getExecutionSteps: null, // force implicit step path
    validate() { return { valid: true, errors: [] }; },
    toJSON() { return { id: this.id, name: this.name }; }
  };
}

/** Build a CraftingEngine with a mock RecipeManager and optional resolution service. */
function buildEngine(ingredientItem, ingredientSet, resolutionService = null) {
  const mockRecipeManager = {
    canCraft() {
      return {
        canCraft: true,
        satisfiableSet: ingredientSet,
        missing: { ingredients: [], essences: [], catalysts: [] }
      };
    },
    getCatalystsForSet() { return []; },
    catalystMatchesItem() { return false; },
    ingredientMatchesItem(recipe, ingredient, item) { return item === ingredientItem; }
  };
  return new CraftingEngine(mockRecipeManager, null, resolutionService);
}

/** Stub _runCraftingCheck to return a controlled result. */
function stubCraftingCheck(engine, result) {
  engine._runCraftingCheck = async () => result;
}

/** Build a default success resolution service mock. */
function buildSuccessResolutionService() {
  return {
    validateRecipe() { return { valid: true, errors: [] }; },
    validateCheckResult() { return true; },
    resolveResultGroups() { return { groups: [], meta: {} }; },
    getMode() { return 'simple'; }
  };
}

/** Build actors needed for craft() calls. */
function buildActors(ingredientItem) {
  const sourceActor = { id: 'a1', name: 'Crafter', items: [ingredientItem] };
  const craftingActor = {
    id: 'a1',
    name: 'Crafter',
    uuid: 'Actor.a1',
    items: { contents: [] },
    async createEmbeddedDocuments() { return []; }
  };
  return { sourceActor, craftingActor };
}

// ---------------------------------------------------------------------------
// Group 1: _getSuccessFailureMacroUuids helper
// ---------------------------------------------------------------------------

test('_getSuccessFailureMacroUuids returns null UUIDs when recipe has no craftingSystemId', () => {
  setupGame();
  const engine = new CraftingEngine({});
  const result = engine._getSuccessFailureMacroUuids({ craftingSystemId: null });
  assert.equal(result.successMacroUuid, null);
  assert.equal(result.failureMacroUuid, null);
});

test('_getSuccessFailureMacroUuids returns null UUIDs when system not found', () => {
  setupGame();
  const engine = new CraftingEngine({});
  // Use an ID that does not exist in the game system manager
  const result = engine._getSuccessFailureMacroUuids({ craftingSystemId: 'unknown-system' });
  assert.equal(result.successMacroUuid, null);
  assert.equal(result.failureMacroUuid, null);
});

test('_getSuccessFailureMacroUuids returns null UUIDs when craftingCheck has no macro UUIDs', () => {
  // System with craftingCheck but no macro UUIDs
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => ({
          craftingCheck: {}
        })
      })
    }
  };
  const engine = new CraftingEngine({});
  const result = engine._getSuccessFailureMacroUuids({ craftingSystemId: 'sys-1' });
  assert.equal(result.successMacroUuid, null);
  assert.equal(result.failureMacroUuid, null);
});

test('_getSuccessFailureMacroUuids returns UUIDs from system craftingCheck', () => {
  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => ({
          craftingCheck: {
            successMacroUuid: 'macro:success-uuid',
            failureMacroUuid: 'macro:failure-uuid'
          }
        })
      })
    }
  };
  const engine = new CraftingEngine({});
  const result = engine._getSuccessFailureMacroUuids({ craftingSystemId: 'sys-1' });
  assert.equal(result.successMacroUuid, 'macro:success-uuid');
  assert.equal(result.failureMacroUuid, 'macro:failure-uuid');
});

// ---------------------------------------------------------------------------
// Group 2: Success macro invocation via craft()
// ---------------------------------------------------------------------------

test('craft() calls _runSuccessMacro with spec-defined context on success', async () => {
  setupGame({ successMacroUuid: 'macro:success', failureMacroUuid: 'macro:failure' });

  const ingredientItem = buildFakeItem('ing-1');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet);
  const { sourceActor, craftingActor } = buildActors(ingredientItem);

  const engine = buildEngine(ingredientItem, ingredientSet, buildSuccessResolutionService());
  stubCraftingCheck(engine, { success: true, outcome: 'pass', value: 15, data: {} });

  let capturedArgs = null;
  engine._runSuccessMacro = async (recipeArg, context) => {
    capturedArgs = { recipeArg, context };
  };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'craft should succeed');
  assert.ok(capturedArgs !== null, '_runSuccessMacro should have been called');

  const ctx = capturedArgs.context;
  // Verify all spec-required context keys are present
  assert.ok('recipe' in ctx, 'context must include recipe');
  assert.ok('craftingSystem' in ctx, 'context must include craftingSystem');
  assert.ok('craftingActor' in ctx, 'context must include craftingActor');
  assert.ok('componentSourceActors' in ctx, 'context must include componentSourceActors');
  assert.ok('step' in ctx, 'context must include step');
  assert.ok('selectedIngredientSet' in ctx, 'context must include selectedIngredientSet');
  assert.ok('consumedIngredients' in ctx, 'context must include consumedIngredients');
  assert.ok('consumedCatalysts' in ctx, 'context must include consumedCatalysts');
  assert.ok('createdResults' in ctx, 'context must include createdResults');
  assert.ok('checkResult' in ctx, 'context must include checkResult');

  // Spot-check a few values
  assert.deepEqual(ctx.craftingActor, craftingActor);
  assert.deepEqual(ctx.componentSourceActors, [sourceActor]);
  assert.ok(Array.isArray(ctx.consumedCatalysts), 'consumedCatalysts should be an array');
  assert.ok(Array.isArray(ctx.createdResults), 'createdResults should be an array');
});

test('craft() does NOT call _runSuccessMacro when successMacroUuid is null', async () => {
  // No successMacroUuid configured
  setupGame({ successMacroUuid: null, failureMacroUuid: null });

  const ingredientItem = buildFakeItem('ing-2');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet);
  const { sourceActor, craftingActor } = buildActors(ingredientItem);

  const engine = buildEngine(ingredientItem, ingredientSet, buildSuccessResolutionService());
  stubCraftingCheck(engine, { success: true, outcome: null, value: null, data: {} });

  let macroRunnerCalled = false;
  // We test the real _runSuccessMacro code path — it checks for null uuid internally.
  // Patch MacroExecutor.run by verifying it is never reached (no fromUuid global).
  // Since successMacroUuid is null, _runSuccessMacro should return early without calling MacroExecutor.run.
  // Stub out the UUID resolution to detect if it would be called.
  globalThis.fromUuid = async () => {
    macroRunnerCalled = true;
    return null;
  };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'craft should succeed');
  assert.equal(macroRunnerCalled, false, 'MacroExecutor.run (via fromUuid) should NOT have been called');

  delete globalThis.fromUuid;
});

test('craft() does NOT call _runSuccessMacro on failure path', async () => {
  setupGame({ successMacroUuid: 'macro:success', failureMacroUuid: null });

  const ingredientItem = buildFakeItem('ing-3');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet);
  const { sourceActor, craftingActor } = buildActors(ingredientItem);

  const engine = buildEngine(ingredientItem, ingredientSet);
  stubCraftingCheck(engine, { success: false, message: 'Check failed', outcome: null, value: null, data: {} });

  let successMacroCalled = false;
  engine._runSuccessMacro = async () => { successMacroCalled = true; };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail');
  assert.equal(successMacroCalled, false, '_runSuccessMacro should NOT have been called on failure path');
});

// ---------------------------------------------------------------------------
// Group 3: Failure macro invocation via craft()
// ---------------------------------------------------------------------------

test('craft() calls _runFailureMacro with spec-defined context on check failure', async () => {
  setupGame({ successMacroUuid: null, failureMacroUuid: 'macro:failure' });

  const ingredientItem = buildFakeItem('ing-4');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet);
  const { sourceActor, craftingActor } = buildActors(ingredientItem);

  const engine = buildEngine(ingredientItem, ingredientSet);
  stubCraftingCheck(engine, { success: false, message: 'Dice roll too low', outcome: null, value: null, data: {} });

  let capturedArgs = null;
  engine._runFailureMacro = async (recipeArg, context) => {
    capturedArgs = { recipeArg, context };
  };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail');
  assert.ok(capturedArgs !== null, '_runFailureMacro should have been called');

  const ctx = capturedArgs.context;
  // Verify all spec-required context keys are present
  assert.ok('recipe' in ctx, 'context must include recipe');
  assert.ok('craftingSystem' in ctx, 'context must include craftingSystem');
  assert.ok('craftingActor' in ctx, 'context must include craftingActor');
  assert.ok('componentSourceActors' in ctx, 'context must include componentSourceActors');
  assert.ok('step' in ctx, 'context must include step');
  assert.ok('selectedIngredientSet' in ctx, 'context must include selectedIngredientSet');
  assert.ok('failureReason' in ctx, 'context must include failureReason');
  assert.ok('checkResult' in ctx, 'context must include checkResult');
  assert.ok('consumedIngredients' in ctx, 'context must include consumedIngredients');
  assert.ok('consumedCatalysts' in ctx, 'context must include consumedCatalysts');

  // Spot-check values
  assert.deepEqual(ctx.craftingActor, craftingActor);
  assert.equal(ctx.failureReason, 'Dice roll too low');
  assert.ok(Array.isArray(ctx.consumedIngredients), 'consumedIngredients should be an array');
  assert.ok(Array.isArray(ctx.consumedCatalysts), 'consumedCatalysts should be an array');
});

test('craft() calls _runFailureMacro on validation failure path', async () => {
  setupGame({ successMacroUuid: null, failureMacroUuid: 'macro:failure' });

  const ingredientItem = buildFakeItem('ing-5');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet);
  const { sourceActor, craftingActor } = buildActors(ingredientItem);

  // Resolution service that makes validateCheckResult return false
  const mockResolutionService = {
    validateRecipe() { return { valid: true, errors: [] }; },
    validateCheckResult() { return false; },
    resolveResultGroups() { return { groups: [], meta: {} }; },
    getMode() { return 'simple'; }
  };

  const engine = buildEngine(ingredientItem, ingredientSet, mockResolutionService);
  // Check itself passes but validation fails
  stubCraftingCheck(engine, { success: true, outcome: 'pass', value: 5, data: {} });

  let failureMacroContext = null;
  engine._runFailureMacro = async (_recipe, ctx) => { failureMacroContext = ctx; };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft should fail on validation failure');
  assert.ok(failureMacroContext !== null, '_runFailureMacro should have been called on validation failure path');

  // Verify context shape matches spec Failure Macro Contract
  const requiredKeys = [
    'recipe', 'craftingSystem', 'craftingActor', 'componentSourceActors',
    'step', 'selectedIngredientSet', 'failureReason', 'checkResult',
    'consumedIngredients', 'consumedCatalysts'
  ];
  for (const key of requiredKeys) {
    assert.ok(key in failureMacroContext, `context must include ${key}`);
  }
  assert.match(failureMacroContext.failureReason, /resolution mode/i, 'failureReason should describe validation failure');
});

test('craft() does NOT call _runFailureMacro on success path', async () => {
  setupGame({ successMacroUuid: null, failureMacroUuid: 'macro:failure' });

  const ingredientItem = buildFakeItem('ing-6');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet);
  const { sourceActor, craftingActor } = buildActors(ingredientItem);

  const engine = buildEngine(ingredientItem, ingredientSet, buildSuccessResolutionService());
  stubCraftingCheck(engine, { success: true, outcome: null, value: null, data: {} });

  let failureMacroCalled = false;
  engine._runFailureMacro = async () => { failureMacroCalled = true; };

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'craft should succeed');
  assert.equal(failureMacroCalled, false, '_runFailureMacro should NOT have been called on success path');
});

// ---------------------------------------------------------------------------
// Group 4: Error resilience
// ---------------------------------------------------------------------------

test('_runSuccessMacro catches errors and does not throw', async () => {
  // Provide a fromUuid that returns a macro whose command throws
  globalThis.fromUuid = async () => ({
    command: 'throw new Error("success macro boom");'
  });

  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => ({
          craftingCheck: {
            successMacroUuid: 'macro:success-throws',
            failureMacroUuid: null
          }
        })
      })
    }
  };

  const engine = new CraftingEngine({});
  // Should not throw
  await assert.doesNotReject(
    () => engine._runSuccessMacro({ craftingSystemId: 'sys-1' }, { recipe: {}, craftingActor: null }),
    'success macro errors must be swallowed'
  );

  delete globalThis.fromUuid;
});

test('_runFailureMacro catches errors and does not throw', async () => {
  // Provide a fromUuid that returns a macro whose command throws
  globalThis.fromUuid = async () => ({
    command: 'throw new Error("failure macro boom");'
  });

  globalThis.game = {
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: () => ({
          craftingCheck: {
            successMacroUuid: null,
            failureMacroUuid: 'macro:failure-throws'
          }
        })
      })
    }
  };

  const engine = new CraftingEngine({});
  // Should not throw
  await assert.doesNotReject(
    () => engine._runFailureMacro({ craftingSystemId: 'sys-1' }, { recipe: {}, craftingActor: null }),
    'failure macro errors must be swallowed'
  );

  delete globalThis.fromUuid;
});

test('craft() returns success even when success macro throws', async () => {
  setupGame({ successMacroUuid: 'macro:success', failureMacroUuid: null });

  const ingredientItem = buildFakeItem('ing-7');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet);
  const { sourceActor, craftingActor } = buildActors(ingredientItem);

  const engine = buildEngine(ingredientItem, ingredientSet, buildSuccessResolutionService());
  stubCraftingCheck(engine, { success: true, outcome: null, value: null, data: {} });

  // Override to simulate a throwing success macro
  engine._runSuccessMacro = async () => { throw new Error('success macro boom'); };

  // Use the real _runSuccessMacro (which wraps MacroExecutor.run in try/catch)
  // with a fromUuid that returns a macro whose command throws.
  globalThis.fromUuid = async () => ({ command: 'throw new Error("boom");' });

  // Restore the real _runSuccessMacro
  delete engine._runSuccessMacro;

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, true, 'craft() must return success even when macro throws');

  delete globalThis.fromUuid;
});

test('craft() returns failure result even when failure macro throws', async () => {
  setupGame({ successMacroUuid: null, failureMacroUuid: 'macro:failure' });

  const ingredientItem = buildFakeItem('ing-8');
  const ingredientSet = buildFakeIngredientSet(ingredientItem);
  const recipe = buildFakeRecipe(ingredientSet);
  const { sourceActor, craftingActor } = buildActors(ingredientItem);

  const engine = buildEngine(ingredientItem, ingredientSet);
  stubCraftingCheck(engine, { success: false, message: 'Check failed', outcome: null, value: null, data: {} });

  // Use the real _runFailureMacro with a fromUuid that throws inside the macro
  globalThis.fromUuid = async () => ({ command: 'throw new Error("failure macro boom");' });

  const result = await engine.craft(craftingActor, [sourceActor], recipe, null, {});

  assert.equal(result.success, false, 'craft() must return failure result even when macro throws');
  assert.match(result.message, /Check failed/i);

  delete globalThis.fromUuid;
});

/**
 * Tests for T-099: Cauldron Crafting Resolution Mode
 * Covers:
 *   - CraftingSystemManager: cauldron resolutionMode acceptance + config normalization
 *   - ResolutionModeService: cauldron validation + result resolution
 *   - RecipeVisibilityService: cauldron visibility rules + learnRecipeOnCraft
 *   - CraftingEngine.craftCauldron: signature matching, no-match, success, misconfiguration
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals
// ---------------------------------------------------------------------------

function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

globalThis.foundry = { utils: { randomID: () => `id-${Math.random().toString(36).slice(2)}`, getProperty } };
globalThis.game = {
  user: { isGM: true, id: 'gm-user' },
  actors: [],
  fabricate: {}
};
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.fromUuid = async () => null;

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');
const { RecipeVisibilityService } = await import('../src/systems/RecipeVisibilityService.js');
const { SignatureValidator } = await import('../src/systems/SignatureValidator.js');

// ---------------------------------------------------------------------------
// Flag helpers (same pattern as recipe-visibility-service.test.js)
// ---------------------------------------------------------------------------

function getPathValue(object, path) {
  return String(path).split('.').reduce((value, part) => {
    if (value == null || typeof value !== 'object') return undefined;
    return value[part];
  }, object);
}

function setPathValue(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let target = object;
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== 'object') target[part] = {};
    target = target[part];
  }
  target[last] = value;
}

class FakeDocument {
  constructor(flagsArg = {}) {
    this._flags = { fabricate: flagsArg };
    this._updates = {};
  }
  getFlag(scope, key) {
    return getPathValue(this._flags[scope], key);
  }
  async setFlag(scope, key, value) {
    if (!this._flags[scope]) this._flags[scope] = {};
    setPathValue(this._flags[scope], key, value);
  }
}

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function buildCauldronSystem(overrides = {}) {
  return {
    id: 'cauldron-sys',
    resolutionMode: 'cauldron',
    cauldron: { learnOnCraft: true, consumeOnFail: true, showAttemptHistoryToPlayers: false },
    recipeVisibility: { listMode: 'global' },
    craftingCheck: { enabled: false, macroUuid: null, outcomes: [] },
    features: { multiStepRecipes: false },
    components: [],
    managedItems: [],
    items: [],
    ...overrides
  };
}

function buildIngredientSet(groups) {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    ingredientGroups: groups
  };
}

function buildComponent(id, sourceItemUuid = null) {
  return { id, name: id, tags: [], sourceItemUuid, sourceUuid: sourceItemUuid };
}

function buildIngredientGroup(componentId) {
  return {
    id: `g-${Math.random().toString(36).slice(2)}`,
    options: [{ match: { type: 'component', componentId } }]
  };
}

function buildRecipe(id, ingredientSets, resultGroups = [], overrides = {}) {
  return {
    id,
    name: id,
    craftingSystemId: 'cauldron-sys',
    enabled: true,
    ingredientSets,
    resultGroups,
    getExecutionSteps: () => [],
    ...overrides
  };
}

function buildResolutionService(system) {
  const csm = { getSystem: (id) => (id === system.id ? system : null) };
  return new ResolutionModeService(csm);
}

function buildVisibilityService(system, recipes = []) {
  const recipeManager = {
    getRecipes: (filter) => {
      let result = recipes;
      if (filter.enabled !== undefined) result = result.filter(r => r.enabled === filter.enabled);
      if (filter.craftingSystemId) result = result.filter(r => r.craftingSystemId === filter.craftingSystemId);
      return result;
    }
  };
  const craftingSystemManager = { getSystem: (id) => (id === system.id ? system : null) };
  return new RecipeVisibilityService(recipeManager, craftingSystemManager);
}

// ============================================================================
// CraftingSystemManager: cauldron normalization
// ============================================================================

test('CraftingSystemManager accepts cauldron as a valid resolutionMode', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({ resolutionMode: 'cauldron' });
  assert.equal(system.resolutionMode, 'cauldron');
});

test('CraftingSystemManager normalizes cauldron config with defaults', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({ resolutionMode: 'cauldron', cauldron: {} });
  assert.ok(system.cauldron, 'cauldron config should be set');
  assert.equal(system.cauldron.learnOnCraft, false);
  assert.equal(system.cauldron.consumeOnFail, true);
  assert.equal(system.cauldron.showAttemptHistoryToPlayers, true);
});

test('CraftingSystemManager respects explicit cauldron config values', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({
    resolutionMode: 'cauldron',
    cauldron: { learnOnCraft: true, consumeOnFail: false, showAttemptHistoryToPlayers: false }
  });
  assert.equal(system.cauldron.learnOnCraft, true);
  assert.equal(system.cauldron.consumeOnFail, false);
  assert.equal(system.cauldron.showAttemptHistoryToPlayers, false);
});

test('CraftingSystemManager sets cauldron to null for non-cauldron modes', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({ resolutionMode: 'simple' });
  assert.equal(system.cauldron, null);
});

test('CraftingSystemManager defaults unknown resolutionMode to simple (not cauldron)', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({ resolutionMode: 'unknown-mode' });
  assert.equal(system.resolutionMode, 'simple');
});

// ============================================================================
// ResolutionModeService: cauldron validation
// ============================================================================

test('ResolutionModeService.validateRecipe: cauldron recipe with no ingredient sets is invalid', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const recipe = buildRecipe('r1', [], [{ id: 'rg1', name: 'group1', results: [] }], {
    resultSelection: { provider: 'ingredientSet' }
  });
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('ingredient set')));
});

test('ResolutionModeService.validateRecipe: cauldron recipe with no result groups is invalid', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const recipe = buildRecipe('r1', [buildIngredientSet([buildIngredientGroup('c1')])], [], {
    resultSelection: { provider: 'ingredientSet' }
  });
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('result group')));
});

test('ResolutionModeService.validateRecipe: cauldron recipe with no provider is invalid', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const recipe = buildRecipe(
    'r1',
    [buildIngredientSet([buildIngredientGroup('c1')])],
    [{ id: 'rg1', name: 'group1', results: [] }]
  );
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('provider')));
});

test('ResolutionModeService.validateRecipe: cauldron recipe with invalid provider is invalid', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const recipe = buildRecipe(
    'r1',
    [buildIngredientSet([buildIngredientGroup('c1')])],
    [{ id: 'rg1', name: 'group1', results: [] }],
    { resultSelection: { provider: 'unknownProvider' } }
  );
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('provider')));
});

test('ResolutionModeService.validateRecipe: cauldron recipe with rollTableOutcome but no UUID is invalid', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const recipe = buildRecipe(
    'r1',
    [buildIngredientSet([buildIngredientGroup('c1')])],
    [{ id: 'rg1', name: 'group1', results: [] }],
    { resultSelection: { provider: 'rollTableOutcome' } }
  );
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('UUID')));
});

test('ResolutionModeService.validateRecipe: valid cauldron recipe with ingredientSet provider passes', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const recipe = buildRecipe(
    'r1',
    [buildIngredientSet([buildIngredientGroup('c1')])],
    [{ id: 'rg1', name: 'group1', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('ResolutionModeService.validateRecipe: cauldron recipe with explicit steps fails validation', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  // Recipe whose getExecutionSteps() returns a named step (not the implicit-step fallback)
  const explicitStep = { id: 'explicit-step-1', name: 'Step One', ingredientGroups: [], resultGroups: [] };
  const recipe = {
    ...buildRecipe(
      'r1',
      [buildIngredientSet([buildIngredientGroup('c1')])],
      [{ id: 'rg1', name: 'group1', results: [] }],
      { resultSelection: { provider: 'ingredientSet' } }
    ),
    getExecutionSteps: () => [explicitStep]
  };
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('step')), 'should error about explicit steps');
});

// ============================================================================
// ResolutionModeService: cauldron resolveResultGroups
// ============================================================================

test('resolveResultGroups: cauldron + ingredientSet provider returns mapped group', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const allGroups = [
    { id: 'rg1', name: 'Group1', results: [] },
    { id: 'rg2', name: 'Group2', results: [] }
  ];
  const recipe = { craftingSystemId: 'cauldron-sys', resultSelection: { provider: 'ingredientSet' } };
  const ingredientSet = { resultGroupId: 'rg2' };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, ingredientSet });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].id, 'rg2');
});

test('resolveResultGroups: cauldron + ingredientSet provider falls back to first group when no mapping', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const allGroups = [
    { id: 'rg1', name: 'Group1', results: [] },
    { id: 'rg2', name: 'Group2', results: [] }
  ];
  const recipe = { craftingSystemId: 'cauldron-sys', resultSelection: { provider: 'ingredientSet' } };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, ingredientSet: {} });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].id, 'rg1');
});

test('resolveResultGroups: cauldron + macroOutcome provider returns matched group', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const allGroups = [
    { id: 'rg1', name: 'success', results: [] },
    { id: 'rg2', name: 'partial', results: [] }
  ];
  const recipe = { craftingSystemId: 'cauldron-sys', resultSelection: { provider: 'macroOutcome' } };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { outcome: 'success' }, ingredientSet: {} });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].id, 'rg1');
});

test('resolveResultGroups: cauldron + macroOutcome returns empty groups on fail keyword', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const allGroups = [{ id: 'rg1', name: 'success', results: [] }];
  const recipe = { craftingSystemId: 'cauldron-sys', resultSelection: { provider: 'macroOutcome' } };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { outcome: 'fail' }, ingredientSet: {} });
  assert.equal(result.groups.length, 0);
  assert.equal(result.meta.disposition, 'fail');
});

test('resolveResultGroups: cauldron + macroOutcome returns empty groups on miss keyword', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const allGroups = [{ id: 'rg1', name: 'success', results: [] }];
  const recipe = { craftingSystemId: 'cauldron-sys', resultSelection: { provider: 'macroOutcome' } };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { outcome: 'miss' }, ingredientSet: {} });
  assert.equal(result.groups.length, 0);
  assert.equal(result.meta.disposition, 'miss');
});

test('resolveResultGroups: cauldron + macroOutcome returns misconfiguration on no match', () => {
  const system = buildCauldronSystem();
  const service = buildResolutionService(system);
  const allGroups = [{ id: 'rg1', name: 'success', results: [] }];
  const recipe = { craftingSystemId: 'cauldron-sys', resultSelection: { provider: 'macroOutcome' } };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { outcome: 'nonexistent' }, ingredientSet: {} });
  assert.equal(result.groups.length, 0);
  assert.equal(result.meta.disposition, 'misconfiguration');
});

// ============================================================================
// RecipeVisibilityService: cauldron visibility
// ============================================================================

test('RecipeVisibilityService: GM sees all cauldron recipes', () => {
  const system = buildCauldronSystem({ cauldron: { learnOnCraft: false, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const result = service.evaluateRecipeAccess({
    recipe,
    viewer: { isGM: true },
    craftingActor: null
  });
  assert.equal(result.visible, true);
  assert.equal(result.craftable, true);
});

test('RecipeVisibilityService: non-GM sees no recipes in cauldron mode when learnOnCraft=false', () => {
  const system = buildCauldronSystem({ cauldron: { learnOnCraft: false, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const actor = new FakeDocument({});
  const result = service.evaluateRecipeAccess({
    recipe,
    viewer: { isGM: false, id: 'player1' },
    craftingActor: actor
  });
  assert.equal(result.visible, false);
  assert.equal(result.reason, 'cauldron-hidden');
});

test('RecipeVisibilityService: non-GM sees learned recipe when learnOnCraft=true', () => {
  const system = buildCauldronSystem({ cauldron: { learnOnCraft: true, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  // Seed learned recipe in actor flags
  // getFabricateFlag(actor, 'learnedRecipes', {}) reads actor.getFlag('fabricate', 'fabricate.learnedRecipes')
  const actor = new FakeDocument({ fabricate: { learnedRecipes: { 'r1': { learnedAt: 1000 } } } });
  const result = service.evaluateRecipeAccess({
    recipe,
    viewer: { isGM: false, id: 'player1' },
    craftingActor: actor
  });
  assert.equal(result.visible, true);
  assert.equal(result.reason, 'cauldron-learned');
});

test('RecipeVisibilityService: non-GM does NOT see un-learned recipe when learnOnCraft=true', () => {
  const system = buildCauldronSystem({ cauldron: { learnOnCraft: true, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const actor = new FakeDocument({});
  const result = service.evaluateRecipeAccess({
    recipe,
    viewer: { isGM: false, id: 'player1' },
    craftingActor: actor
  });
  assert.equal(result.visible, false);
  assert.equal(result.reason, 'cauldron-not-learned');
});

test('RecipeVisibilityService.learnRecipeOnCraft: adds recipe to actor learned map', async () => {
  const system = buildCauldronSystem({ cauldron: { learnOnCraft: true, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const actor = new FakeDocument({});
  await service.learnRecipeOnCraft(recipe, actor);

  const learnedMap = service._getLearnedMap(actor);
  assert.ok(learnedMap['r1'], 'recipe should be learned');
  assert.ok(learnedMap['r1'].learnedAt > 0);
});

test('RecipeVisibilityService.learnRecipeOnCraft: no-op when learnOnCraft=false', async () => {
  const system = buildCauldronSystem({ cauldron: { learnOnCraft: false, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const actor = new FakeDocument({});
  await service.learnRecipeOnCraft(recipe, actor);

  const learnedMap = service._getLearnedMap(actor);
  assert.equal(learnedMap['r1'], undefined);
});

test('RecipeVisibilityService.learnRecipeOnCraft: no-op for non-cauldron systems', async () => {
  const system = { id: 'simple-sys', resolutionMode: 'simple' };
  const service = buildVisibilityService(system);
  const recipe = { ...buildRecipe('r1', [], []), craftingSystemId: 'simple-sys' };

  const actor = new FakeDocument({});
  await service.learnRecipeOnCraft(recipe, actor);

  const learnedMap = service._getLearnedMap(actor);
  assert.equal(learnedMap['r1'], undefined);
});

test('RecipeVisibilityService.learnRecipeOnCraft: no-op if already learned', async () => {
  const system = buildCauldronSystem({ cauldron: { learnOnCraft: true, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const actor = new FakeDocument({ fabricate: { learnedRecipes: { 'r1': { learnedAt: 500 } } } });
  await service.learnRecipeOnCraft(recipe, actor);

  // learnedAt should not change
  const learnedMap = service._getLearnedMap(actor);
  assert.equal(learnedMap['r1'].learnedAt, 500);
});

// ============================================================================
// SignatureValidator: cauldron signature matching
// ============================================================================

test('SignatureValidator.computeSignature returns groups for cauldron ingredient sets', () => {
  const components = [buildComponent('c1', 'Item.abc'), buildComponent('c2', 'Item.def')];
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components
  });
  const set = buildIngredientSet([buildIngredientGroup('c1')]);
  const sig = validator.computeSignature(set, components);
  assert.equal(sig.length, 1);
  assert.ok(sig[0].has('c1'));
});

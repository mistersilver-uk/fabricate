/**
 * Tests for T-099 / T-189: Alchemy (formerly Cauldron) Crafting Resolution Mode
 * Covers:
 *   - CraftingSystemManager: alchemy resolutionMode acceptance + config normalization
 *   - CraftingSystemManager: legacy 'cauldron' normalizes to 'alchemy' (T-189 regression)
 *   - ResolutionModeService: alchemy validation + result resolution
 *   - RecipeVisibilityService: alchemy visibility rules + learnRecipeOnCraft
 *   - CraftingEngine.craftAlchemy: signature matching, no-match, success, misconfiguration
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

const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
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

function buildAlchemySystem(overrides = {}) {
  return {
    id: 'alchemy-sys',
    resolutionMode: 'alchemy',
    alchemy: { learnOnCraft: true, consumeOnFail: true, showAttemptHistoryToPlayers: false },
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

function makeSubmittedAlchemyItem({ uuid = `Item.${Math.random().toString(36).slice(2)}`, sourceUuid, quantity = 1 } = {}) {
  return {
    uuid,
    sourceUuid,
    sourceItemUuid: sourceUuid,
    system: { quantity },
    flags: { core: { sourceId: sourceUuid } }
  };
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
    craftingSystemId: 'alchemy-sys',
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
// CraftingSystemManager: alchemy normalization
// ============================================================================

test('CraftingSystemManager accepts alchemy as a valid resolutionMode', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({ resolutionMode: 'alchemy' });
  assert.equal(system.resolutionMode, 'alchemy');
});

test('CraftingSystemManager normalizes alchemy config with defaults', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  // Pass legacy 'cauldron' key to test the fallback path (system.alchemy ?? system.cauldron)
  const system = manager._normalizeSystem({ resolutionMode: 'alchemy', cauldron: {} });
  assert.ok(system.alchemy, 'alchemy config should be set');
  assert.equal(system.alchemy.learnOnCraft, false);
  assert.equal(system.alchemy.consumeOnFail, true);
  assert.equal(system.alchemy.showAttemptHistoryToPlayers, true);
});

test('CraftingSystemManager respects explicit alchemy config values', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({
    resolutionMode: 'alchemy',
    alchemy: { learnOnCraft: true, consumeOnFail: false, showAttemptHistoryToPlayers: false }
  });
  assert.equal(system.alchemy.learnOnCraft, true);
  assert.equal(system.alchemy.consumeOnFail, false);
  assert.equal(system.alchemy.showAttemptHistoryToPlayers, false);
});

test('CraftingSystemManager sets alchemy to null for non-alchemy modes', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({ resolutionMode: 'simple' });
  assert.equal(system.alchemy, null);
});

test('CraftingSystemManager defaults unknown resolutionMode to simple (not alchemy)', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({ resolutionMode: 'unknown-mode' });
  assert.equal(system.resolutionMode, 'simple');
});

// ============================================================================
// CraftingSystemManager: T-189 legacy 'cauldron' -> 'alchemy' normalization
// ============================================================================

test('CraftingSystemManager normalizes legacy cauldron resolutionMode to alchemy', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({ resolutionMode: 'cauldron' });
  assert.equal(system.resolutionMode, 'alchemy', 'legacy cauldron should be normalized to alchemy');
});

test('CraftingSystemManager preserves alchemy config when normalizing legacy cauldron to alchemy', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({
    resolutionMode: 'cauldron',
    cauldron: { learnOnCraft: true, consumeOnFail: false, showAttemptHistoryToPlayers: false }
  });
  assert.equal(system.resolutionMode, 'alchemy');
  assert.ok(system.alchemy, 'alchemy config should be carried over');
  assert.equal(system.alchemy.learnOnCraft, true);
  assert.equal(system.alchemy.consumeOnFail, false);
});

test('CraftingSystemManager: loading persisted data with cauldron mode produces alchemy mode', () => {
  // Regression test: simulates loading a JSON-persisted crafting system that still has
  // resolutionMode: 'cauldron' from before T-189. On normalization it must become 'alchemy'.
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const legacyPersistedData = {
    id: 'legacy-sys',
    name: 'Legacy Alchemist System',
    resolutionMode: 'cauldron',  // old persisted value
    cauldron: { learnOnCraft: true, consumeOnFail: true, showAttemptHistoryToPlayers: true }
  };
  const system = manager._normalizeSystem(legacyPersistedData);
  assert.equal(system.resolutionMode, 'alchemy',
    'persisted cauldron value must be mapped to alchemy on load');
  assert.ok(system.alchemy, 'alchemy sub-config must still be populated');
  assert.equal(system.alchemy.learnOnCraft, true);
});

// ============================================================================
// ResolutionModeService: alchemy validation
// ============================================================================

test('ResolutionModeService.validateRecipe: alchemy recipe with no ingredient sets is invalid', () => {
  const system = buildAlchemySystem();
  const service = buildResolutionService(system);
  const recipe = buildRecipe('r1', [], [{ id: 'rg1', name: 'group1', results: [] }], {
    resultSelection: { provider: 'ingredientSet' }
  });
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('ingredient set')));
});

test('ResolutionModeService.validateRecipe: alchemy recipe with no result groups is invalid', () => {
  const system = buildAlchemySystem();
  const service = buildResolutionService(system);
  const recipe = buildRecipe('r1', [buildIngredientSet([buildIngredientGroup('c1')])], [], {
    resultSelection: { provider: 'ingredientSet' }
  });
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('result group')));
});

test('ResolutionModeService.validateRecipe: alchemy recipe with no provider is invalid', () => {
  const system = buildAlchemySystem();
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

test('ResolutionModeService.validateRecipe: alchemy recipe with invalid provider is invalid', () => {
  const system = buildAlchemySystem();
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

test('ResolutionModeService.validateRecipe: alchemy recipe with rollTableOutcome but no UUID is invalid', () => {
  const system = buildAlchemySystem();
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

test('ResolutionModeService.validateRecipe: valid alchemy recipe with ingredientSet provider passes', () => {
  const system = buildAlchemySystem();
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

test('ResolutionModeService.validateRecipe: alchemy recipe with explicit steps fails validation', () => {
  const system = buildAlchemySystem();
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
// ResolutionModeService: alchemy resolveResultGroups
// ============================================================================

test('resolveResultGroups: alchemy + ingredientSet provider returns mapped group', () => {
  const system = buildAlchemySystem();
  const service = buildResolutionService(system);
  const allGroups = [
    { id: 'rg1', name: 'Group1', results: [] },
    { id: 'rg2', name: 'Group2', results: [] }
  ];
  const recipe = { craftingSystemId: 'alchemy-sys', resultSelection: { provider: 'ingredientSet' } };
  const ingredientSet = { resultGroupId: 'rg2' };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, ingredientSet });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].id, 'rg2');
});

test('resolveResultGroups: alchemy + ingredientSet provider falls back to first group when no mapping', () => {
  const system = buildAlchemySystem();
  const service = buildResolutionService(system);
  const allGroups = [
    { id: 'rg1', name: 'Group1', results: [] },
    { id: 'rg2', name: 'Group2', results: [] }
  ];
  const recipe = { craftingSystemId: 'alchemy-sys', resultSelection: { provider: 'ingredientSet' } };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, ingredientSet: {} });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].id, 'rg1');
});

test('resolveResultGroups: alchemy + macroOutcome provider returns matched group', () => {
  const system = buildAlchemySystem();
  const service = buildResolutionService(system);
  const allGroups = [
    { id: 'rg1', name: 'success', results: [] },
    { id: 'rg2', name: 'partial', results: [] }
  ];
  const recipe = { craftingSystemId: 'alchemy-sys', resultSelection: { provider: 'macroOutcome' } };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { outcome: 'success' }, ingredientSet: {} });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].id, 'rg1');
});

test('resolveResultGroups: alchemy + macroOutcome returns empty groups on fail keyword', () => {
  const system = buildAlchemySystem();
  const service = buildResolutionService(system);
  const allGroups = [{ id: 'rg1', name: 'success', results: [] }];
  const recipe = { craftingSystemId: 'alchemy-sys', resultSelection: { provider: 'macroOutcome' } };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { outcome: 'fail' }, ingredientSet: {} });
  assert.equal(result.groups.length, 0);
  assert.equal(result.meta.disposition, 'fail');
});

test('resolveResultGroups: alchemy + macroOutcome returns empty groups on miss keyword', () => {
  const system = buildAlchemySystem();
  const service = buildResolutionService(system);
  const allGroups = [{ id: 'rg1', name: 'success', results: [] }];
  const recipe = { craftingSystemId: 'alchemy-sys', resultSelection: { provider: 'macroOutcome' } };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { outcome: 'miss' }, ingredientSet: {} });
  assert.equal(result.groups.length, 0);
  assert.equal(result.meta.disposition, 'miss');
});

test('resolveResultGroups: alchemy + macroOutcome returns misconfiguration on no match', () => {
  const system = buildAlchemySystem();
  const service = buildResolutionService(system);
  const allGroups = [{ id: 'rg1', name: 'success', results: [] }];
  const recipe = { craftingSystemId: 'alchemy-sys', resultSelection: { provider: 'macroOutcome' } };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { outcome: 'nonexistent' }, ingredientSet: {} });
  assert.equal(result.groups.length, 0);
  assert.equal(result.meta.disposition, 'misconfiguration');
});

// ============================================================================
// RecipeVisibilityService: alchemy visibility
// ============================================================================

test('RecipeVisibilityService: GM sees all alchemy recipes', () => {
  const system = buildAlchemySystem({ alchemy: { learnOnCraft: false, consumeOnFail: true } });
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

test('RecipeVisibilityService: non-GM sees no recipes in alchemy mode when learnOnCraft=false', () => {
  const system = buildAlchemySystem({ alchemy: { learnOnCraft: false, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const actor = new FakeDocument({});
  const result = service.evaluateRecipeAccess({
    recipe,
    viewer: { isGM: false, id: 'player1' },
    craftingActor: actor
  });
  assert.equal(result.visible, false);
  assert.equal(result.reason, 'alchemy-hidden');
});

test('RecipeVisibilityService: non-GM sees learned recipe when learnOnCraft=true', () => {
  const system = buildAlchemySystem({ alchemy: { learnOnCraft: true, consumeOnFail: true } });
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
  assert.equal(result.reason, 'alchemy-learned');
});

test('RecipeVisibilityService: non-GM does NOT see un-learned recipe when learnOnCraft=true', () => {
  const system = buildAlchemySystem({ alchemy: { learnOnCraft: true, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const actor = new FakeDocument({});
  const result = service.evaluateRecipeAccess({
    recipe,
    viewer: { isGM: false, id: 'player1' },
    craftingActor: actor
  });
  assert.equal(result.visible, false);
  assert.equal(result.reason, 'alchemy-not-learned');
});

test('RecipeVisibilityService.learnRecipeOnCraft: adds recipe to actor learned map', async () => {
  const system = buildAlchemySystem({ alchemy: { learnOnCraft: true, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const actor = new FakeDocument({});
  await service.learnRecipeOnCraft(recipe, actor);

  const learnedMap = service._getLearnedMap(actor);
  assert.ok(learnedMap['r1'], 'recipe should be learned');
  assert.ok(learnedMap['r1'].learnedAt > 0);
});

test('RecipeVisibilityService.learnRecipeOnCraft: no-op when learnOnCraft=false', async () => {
  const system = buildAlchemySystem({ alchemy: { learnOnCraft: false, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const actor = new FakeDocument({});
  await service.learnRecipeOnCraft(recipe, actor);

  const learnedMap = service._getLearnedMap(actor);
  assert.equal(learnedMap['r1'], undefined);
});

test('RecipeVisibilityService.learnRecipeOnCraft: no-op for non-alchemy systems', async () => {
  const system = { id: 'simple-sys', resolutionMode: 'simple' };
  const service = buildVisibilityService(system);
  const recipe = { ...buildRecipe('r1', [], []), craftingSystemId: 'simple-sys' };

  const actor = new FakeDocument({});
  await service.learnRecipeOnCraft(recipe, actor);

  const learnedMap = service._getLearnedMap(actor);
  assert.equal(learnedMap['r1'], undefined);
});

test('RecipeVisibilityService.learnRecipeOnCraft: no-op if already learned', async () => {
  const system = buildAlchemySystem({ alchemy: { learnOnCraft: true, consumeOnFail: true } });
  const service = buildVisibilityService(system);
  const recipe = buildRecipe('r1', [], []);

  const actor = new FakeDocument({ fabricate: { learnedRecipes: { 'r1': { learnedAt: 500 } } } });
  await service.learnRecipeOnCraft(recipe, actor);

  // learnedAt should not change
  const learnedMap = service._getLearnedMap(actor);
  assert.equal(learnedMap['r1'].learnedAt, 500);
});

// ============================================================================
// SignatureValidator: alchemy signature matching
// ============================================================================

test('SignatureValidator.computeSignature returns groups for alchemy ingredient sets', () => {
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

test('CraftingEngine alchemy signature matches when submitted quantity meets requirement', () => {
  const engine = new CraftingEngine(null);
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => []
  });

  const component = buildComponent('iron-ingot', 'Compendium.world.items.iron-ingot');
  const components = [component];
  const group = buildIngredientGroup('iron-ingot');
  group.options[0].quantity = 3;
  const set = buildIngredientSet([group]);
  const recipe = buildRecipe('recipe-iron', [set]);

  const submitted = [
    makeSubmittedAlchemyItem({ sourceUuid: component.sourceUuid, quantity: 3, uuid: 'Actor.a.Item.iron' })
  ];

  const result = engine._matchAlchemySignature(submitted, [recipe], components, validator);
  assert.equal(result.matched, true);
  assert.equal(result.recipe.id, 'recipe-iron');
});

test('CraftingEngine alchemy signature rejects insufficient submitted quantity', () => {
  const engine = new CraftingEngine(null);
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => []
  });

  const component = buildComponent('iron-ingot', 'Compendium.world.items.iron-ingot');
  const components = [component];
  const group = buildIngredientGroup('iron-ingot');
  group.options[0].quantity = 5;
  const set = buildIngredientSet([group]);
  const recipe = buildRecipe('recipe-iron', [set]);

  const submitted = [
    makeSubmittedAlchemyItem({ sourceUuid: component.sourceUuid, quantity: 2, uuid: 'Actor.a.Item.iron' })
  ];

  const result = engine._matchAlchemySignature(submitted, [recipe], components, validator);
  assert.equal(result.matched, false);
});

test('CraftingEngine alchemy signature accepts surplus submitted quantity', () => {
  const engine = new CraftingEngine(null);
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => []
  });

  const component = buildComponent('iron-ingot', 'Compendium.world.items.iron-ingot');
  const components = [component];
  const group = buildIngredientGroup('iron-ingot');
  group.options[0].quantity = 3;
  const set = buildIngredientSet([group]);
  const recipe = buildRecipe('recipe-iron', [set]);

  const submitted = [
    makeSubmittedAlchemyItem({ sourceUuid: component.sourceUuid, quantity: 6, uuid: 'Actor.a.Item.iron' })
  ];

  const result = engine._matchAlchemySignature(submitted, [recipe], components, validator);
  assert.equal(result.matched, true);
  assert.equal(result.ingredientSetId, set.id);
});

test('craftAlchemy consumes submitted items when quantity is insufficient for alchemy match', async () => {
  const component = buildComponent('iron-ingot', 'Compendium.world.items.iron-ingot');
  const components = [component];
  const group = buildIngredientGroup('iron-ingot');
  group.options[0].quantity = 4;
  const set = buildIngredientSet([group]);
  const recipe = buildRecipe('recipe-iron', [set]);
  const system = buildAlchemySystem({ id: 'alchemy-sys', components });

  const signatureValidator = new SignatureValidator({
    getSystem: () => system,
    getRecipesForSystem: () => [recipe],
    getComponentsForSystem: () => components
  });

  const recipeManager = {
    getRecipes: () => [recipe],
    getRecipe: () => recipe
  };

  const engine = new CraftingEngine(recipeManager);

  const craftingActor = { id: 'crafter-1' };
  const actorItem = {
    uuid: 'Actor.a.Item.iron',
    system: { quantity: 1 },
    deleteCalled: false,
    async delete() {
      this.deleteCalled = true;
      this.system.quantity = 0;
    }
  };
  const sourceActor = { items: [actorItem] };

  const submittedItems = [
    makeSubmittedAlchemyItem({ sourceUuid: component.sourceUuid, quantity: 1, uuid: actorItem.uuid })
  ];

  const fabricate = game.fabricate || {};
  const originalGetSystemManager = fabricate.getCraftingSystemManager;
  const originalGetRecipeManager = fabricate.getRecipeManager;
  const craftingSystemManager = {
    getSystem: (id) => (id === system.id ? system : null)
  };

  fabricate.getCraftingSystemManager = () => craftingSystemManager;
  fabricate.getRecipeManager = () => recipeManager;
  game.fabricate = fabricate;

  const result = await engine.craftAlchemy(
    craftingActor,
    [sourceActor],
    submittedItems,
    { craftingSystemId: 'alchemy-sys', signatureValidator }
  );

  assert.equal(result.success, false);
  assert.equal(result.disposition, 'no-match');
  assert.equal(result.consumed, true);
  assert.equal(actorItem.deleteCalled, true);

  if (originalGetSystemManager) {
    fabricate.getCraftingSystemManager = originalGetSystemManager;
  } else {
    delete fabricate.getCraftingSystemManager;
  }
  if (originalGetRecipeManager) {
    fabricate.getRecipeManager = originalGetRecipeManager;
  } else {
    delete fabricate.getRecipeManager;
  }
});

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

const { CraftingSystemManager } = await import('../src/systems/CraftingSystemManager.js');
const { CraftingEngine } = await import('../src/systems/CraftingEngine.js');
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

function buildIngredientSet(groups, essences = {}) {
  return {
    id: `set-${Math.random().toString(36).slice(2)}`,
    ingredientGroups: groups,
    essences
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

test('CraftingSystemManager accepts legacy gatheringRegions/gatheringRegionSettings keys on read (pre-1.1.0 import)', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  const system = manager._normalizeSystem({
    id: 'legacy-realm-sys',
    name: 'Legacy Realm System',
    gatheringRegions: [{ id: 'r1', craftingSystemId: 'legacy-realm-sys', name: 'Verdant', enabled: true }],
    gatheringRegionSettings: { enabled: true, revealMode: 'alwaysVisible', modifierVisibility: 'gmOnly' }
  });
  assert.equal(system.gatheringRealms.length, 1, 'legacy gatheringRegions read as gatheringRealms');
  assert.equal(system.gatheringRealms[0].name, 'Verdant');
  assert.equal(system.gatheringRealmSettings.enabled, true, 'legacy gatheringRegionSettings read as gatheringRealmSettings');
  assert.equal(system.gatheringRealmSettings.revealMode, 'alwaysVisible');
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

test('CraftingEngine._matchAlchemySignature matches submitted items by canonical sourceItemUuid when live sourceUuid differs (no essences)', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const components = [{
    id: 'c1',
    name: 'Iron Ore',
    sourceUuid: 'Compendium.world.items.iron-ore-live',
    sourceItemUuid: 'Compendium.source.items.iron-ore',
    fallbackItemIds: []
  }];
  const recipe = buildRecipe(
    'alchemy-recipe',
    [buildIngredientSet([buildIngredientGroup('c1')])],
    [{ id: 'rg1', name: 'Result Group', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components
  });

  const result = engine._matchAlchemySignature([{
    uuid: 'Item.actor-owned-iron-ore',
    _stats: { compendiumSource: 'Compendium.source.items.iron-ore' },
    flags: {}
  }], [recipe], components, validator);

  assert.equal(result.matched, true);
  assert.equal(result.recipe.id, 'alchemy-recipe');
});

// ============================================================================
// CraftingEngine._matchAlchemySignature: essence matching
// ============================================================================

function buildEssenceItem(uuid, essences = {}) {
  return new FakeDocument({ fabricate: { essences } });
}

// Patch uuid onto FakeDocument for submitted item matching
function buildSubmittedItem(uuid, essences = {}) {
  const doc = new FakeDocument({ fabricate: { essences } });
  doc.uuid = uuid;
  return doc;
}

const essenceSystem = {
  features: { essences: true },
  advancedOptionsEnabled: true
};

const noEssenceSystem = {
  features: { essences: false },
  advancedOptionsEnabled: true
};

test('_matchAlchemySignature matches pure-essence recipe when submitted items satisfy essences', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const essenceId = 'essence-fire';
  const recipe = buildRecipe(
    'fire-potion',
    [buildIngredientSet([], { [essenceId]: 2 })],
    [{ id: 'rg1', name: 'Result', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => []
  });

  // Submit same item twice → 1 essence × 2 = 2 total
  const item = buildSubmittedItem('Item.herb-1', { [essenceId]: 1 });
  const result = engine._matchAlchemySignature(
    [item, item], [recipe], [], validator, { system: essenceSystem }
  );

  assert.equal(result.matched, true);
  assert.equal(result.recipe.id, 'fire-potion');
});

test('_matchAlchemySignature matches pure-essence recipe from component-defined essences', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const essenceId = 'restorative';
  const components = [
    {
      id: 'red-herb',
      name: 'Red Herb',
      sourceUuid: 'Compendium.test.red-herb',
      sourceItemUuid: 'Compendium.test.red-herb',
      essences: { [essenceId]: 1 }
    },
    {
      id: 'silverleaf',
      name: 'Silverleaf',
      sourceUuid: 'Compendium.test.silverleaf',
      sourceItemUuid: 'Compendium.test.silverleaf',
      essences: { [essenceId]: 1 }
    }
  ];
  const recipe = buildRecipe(
    'healing-potion',
    [buildIngredientSet([], { [essenceId]: 2 })],
    [{ id: 'rg1', name: 'Healing Potion', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components
  });

  const redHerb = buildSubmittedItem('Item.red-herb', {});
  redHerb._stats = { compendiumSource: 'Compendium.test.red-herb' };
  const silverleaf = buildSubmittedItem('Item.silverleaf', {});
  silverleaf._stats = { compendiumSource: 'Compendium.test.silverleaf' };

  const result = engine._matchAlchemySignature(
    [redHerb, silverleaf], [recipe], components, validator, { system: essenceSystem }
  );

  assert.equal(result.matched, true);
  assert.equal(result.recipe.id, 'healing-potion');
});

test('_matchAlchemySignature uses item-flag essences before component fallback', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const essenceId = 'restorative';
  const components = [{
    id: 'red-herb',
    name: 'Red Herb',
    sourceUuid: 'Compendium.test.red-herb',
    sourceItemUuid: 'Compendium.test.red-herb',
    essences: { [essenceId]: 5 }
  }];
  const recipe = buildRecipe(
    'healing-potion',
    [buildIngredientSet([], { [essenceId]: 2 })],
    [{ id: 'rg1', name: 'Healing Potion', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components
  });

  const redHerb = buildSubmittedItem('Item.red-herb', { [essenceId]: 1 });
  redHerb._stats = { compendiumSource: 'Compendium.test.red-herb' };

  const result = engine._matchAlchemySignature(
    [redHerb], [recipe], components, validator, { system: essenceSystem }
  );

  assert.equal(result.matched, false, 'item flag value should override the larger component fallback');
});

test('_matchAlchemySignature does not multiply component essences by stack quantity for submitted refs', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const essenceId = 'restorative';
  const components = [{
    id: 'red-herb',
    name: 'Red Herb',
    sourceUuid: 'Compendium.test.red-herb',
    sourceItemUuid: 'Compendium.test.red-herb',
    essences: { [essenceId]: 1 }
  }];
  const recipe = buildRecipe(
    'healing-potion',
    [buildIngredientSet([], { [essenceId]: 2 })],
    [{ id: 'rg1', name: 'Healing Potion', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components
  });

  const redHerb = buildSubmittedItem('Item.red-herb', {});
  redHerb._stats = { compendiumSource: 'Compendium.test.red-herb' };
  redHerb.system = { quantity: 5 };

  const result = engine._matchAlchemySignature(
    [redHerb], [recipe], components, validator, { system: essenceSystem }
  );

  assert.equal(result.matched, false, 'one submitted stack ref should count once because the workbench expands quantity');
});

test('_matchAlchemySignature rejects pure-essence recipe when essences are insufficient', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const essenceId = 'essence-fire';
  const recipe = buildRecipe(
    'fire-potion',
    [buildIngredientSet([], { [essenceId]: 3 })],
    [{ id: 'rg1', name: 'Result', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => []
  });

  // Only 2 essences submitted but 3 needed
  const item = buildSubmittedItem('Item.herb-1', { [essenceId]: 1 });
  const result = engine._matchAlchemySignature(
    [item, item], [recipe], [], validator, { system: essenceSystem }
  );

  assert.equal(result.matched, false);
});

test('_matchAlchemySignature skips essence check when system has essences disabled', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const essenceId = 'essence-fire';
  // Recipe has essences but system does not enable them
  const recipe = buildRecipe(
    'fire-potion',
    [buildIngredientSet([], { [essenceId]: 2 })],
    [{ id: 'rg1', name: 'Result', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => []
  });

  const item = buildSubmittedItem('Item.herb-1', { [essenceId]: 1 });
  // With essences disabled, the set has no groups and no recognized essences → skip
  const result = engine._matchAlchemySignature(
    [item, item], [recipe], [], validator, { system: noEssenceSystem }
  );

  assert.equal(result.matched, false);
});

test('_matchAlchemySignature matches mixed ingredient-group + essence recipe', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const essenceId = 'essence-light';
  const components = [buildComponent('c1', 'Compendium.source.items.crystal')];
  const recipe = buildRecipe(
    'light-crystal',
    [buildIngredientSet([buildIngredientGroup('c1')], { [essenceId]: 1 })],
    [{ id: 'rg1', name: 'Result', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components
  });

  // Item satisfies both the ingredient group AND carries essence
  const item = buildSubmittedItem('Item.actor-crystal', { [essenceId]: 1 });
  item._stats = { compendiumSource: 'Compendium.source.items.crystal' };

  const result = engine._matchAlchemySignature(
    [item], [recipe], components, validator, { system: essenceSystem }
  );

  assert.equal(result.matched, true);
  assert.equal(result.recipe.id, 'light-crystal');
});

test('_matchAlchemySignature rejects mixed recipe when groups match but essences do not', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const essenceId = 'essence-light';
  const components = [buildComponent('c1', 'Compendium.source.items.crystal')];
  const recipe = buildRecipe(
    'light-crystal',
    [buildIngredientSet([buildIngredientGroup('c1')], { [essenceId]: 3 })],
    [{ id: 'rg1', name: 'Result', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components
  });

  // Item matches ingredient group but only carries 1 essence (need 3)
  const item = buildSubmittedItem('Item.actor-crystal', { [essenceId]: 1 });
  item._stats = { compendiumSource: 'Compendium.source.items.crystal' };

  const result = engine._matchAlchemySignature(
    [item], [recipe], components, validator, { system: essenceSystem }
  );

  assert.equal(result.matched, false);
});

test('_buildEssenceContext resolves component-defined essences for effect transfer context', () => {
  const essenceId = 'restorative';
  const system = buildAlchemySystem({
    id: 'alchemy-sys',
    features: { essences: true },
    components: [{
      id: 'red-herb',
      name: 'Red Herb',
      sourceUuid: 'Compendium.test.red-herb',
      sourceItemUuid: 'Compendium.test.red-herb',
      essences: { [essenceId]: 1 }
    }]
  });
  game.fabricate.getCraftingSystemManager = () => ({
    getSystem: (id) => id === 'alchemy-sys' ? system : null
  });
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const item = {
    id: 'red-herb-item',
    name: 'Red Herb',
    uuid: 'Item.red-herb',
    _stats: { compendiumSource: 'Compendium.test.red-herb' },
    getFlag: () => undefined
  };

  const context = engine._buildEssenceContext(
    [{ item, quantity: 2 }],
    { craftingSystemId: 'alchemy-sys' }
  );

  assert.equal(context.resolvedEssences[essenceId], 2);
  assert.equal(context.essenceSources[essenceId][0].essencePerItem, 1);
  assert.equal(context.essenceSources[essenceId][0].essenceTotal, 2);
});

// ============================================================================
// CraftingEngine._consumeSubmittedAlchemyItems: quantity handling
// ============================================================================

test('_consumeSubmittedAlchemyItems consumes correct quantity when same item submitted multiple times', async () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });

  const deleteCalls = [];
  const updateCalls = [];

  const actorItem = {
    uuid: 'Item.herb-1',
    system: { quantity: 5 },
    async delete() { deleteCalls.push(this.uuid); },
    async update(data) { updateCalls.push({ uuid: this.uuid, data }); }
  };

  const actor = { items: [actorItem] };

  // Submit 3x of the same item
  const submitted = [
    { uuid: 'Item.herb-1' },
    { uuid: 'Item.herb-1' },
    { uuid: 'Item.herb-1' }
  ];

  await engine._consumeSubmittedAlchemyItems([actor], submitted);

  assert.equal(deleteCalls.length, 0, 'should not delete (5 - 3 = 2 remaining)');
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].data['system.quantity'], 2);
});

test('_consumeSubmittedAlchemyItems deletes item when quantity consumed equals item quantity', async () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });

  const deleteCalls = [];
  const updateCalls = [];

  const actorItem = {
    uuid: 'Item.herb-1',
    system: { quantity: 2 },
    async delete() { deleteCalls.push(this.uuid); },
    async update(data) { updateCalls.push({ uuid: this.uuid, data }); }
  };

  const actor = { items: [actorItem] };

  // Submit 2x — matches item quantity exactly
  const submitted = [
    { uuid: 'Item.herb-1' },
    { uuid: 'Item.herb-1' }
  ];

  await engine._consumeSubmittedAlchemyItems([actor], submitted);

  assert.equal(deleteCalls.length, 1, 'should delete when count >= qty');
  assert.equal(updateCalls.length, 0);
});

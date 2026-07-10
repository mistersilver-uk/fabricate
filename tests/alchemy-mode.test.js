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
const { getItemSourceReferences } = await import('../src/utils/sourceUuid.js');
const { component, roleItem } = await import('./helpers/componentIdentityFixtures.js');

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
    alchemy: { checkMode: 'none', learnOnCraft: true, consumeOnFail: true, showAttemptHistoryToPlayers: false },
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
  assert.equal(system.alchemy.checkMode, 'none', 'checkMode defaults to none');
  assert.equal(system.alchemy.learnOnCraft, false);
  assert.equal(system.alchemy.consumeOnFail, true);
  assert.equal(system.alchemy.showAttemptHistoryToPlayers, true);
});

test('CraftingSystemManager normalizes alchemy checkMode enum (none/simple/tiered; invalid → none)', () => {
  const manager = new CraftingSystemManager({ getRecipes: () => [] });
  for (const mode of ['none', 'simple', 'tiered']) {
    const system = manager._normalizeSystem({ resolutionMode: 'alchemy', alchemy: { checkMode: mode } });
    assert.equal(system.alchemy.checkMode, mode);
  }
  const bad = manager._normalizeSystem({ resolutionMode: 'alchemy', alchemy: { checkMode: 'bogus' } });
  assert.equal(bad.alchemy.checkMode, 'none', 'an invalid checkMode coerces to none');
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
  const recipe = buildRecipe('r1', [], [{ id: 'rg1', name: 'group1', results: [] }]);
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('ingredient set')));
});

test('ResolutionModeService.validateRecipe: alchemy recipe with more than one ingredient set is invalid', () => {
  const system = buildAlchemySystem();
  const service = buildResolutionService(system);
  const recipe = buildRecipe(
    'r1',
    [buildIngredientSet([buildIngredientGroup('c1')]), buildIngredientSet([buildIngredientGroup('c2')])],
    [{ id: 'rg1', name: 'group1', results: [] }]
  );
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /exactly 1 ingredient set/i.test(e)));
});

test('ResolutionModeService.validateRecipe: alchemy recipe with no result groups is invalid', () => {
  const system = buildAlchemySystem();
  const service = buildResolutionService(system);
  const recipe = buildRecipe('r1', [buildIngredientSet([buildIngredientGroup('c1')])], []);
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('result group')));
});

test('ResolutionModeService.validateRecipe: None-mode recipe with one set + one group is valid (no provider)', () => {
  const system = buildAlchemySystem({ alchemy: { checkMode: 'none' } });
  const service = buildResolutionService(system);
  const recipe = buildRecipe(
    'r1',
    [buildIngredientSet([buildIngredientGroup('c1')])],
    [{ id: 'rg1', name: 'group1', results: [] }]
  );
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, true, result.errors.join(', '));
  assert.equal(result.errors.length, 0);
});

test('ResolutionModeService.validateRecipe: Simple-mode recipe with success + reserved failure group is valid', () => {
  const system = buildAlchemySystem({ alchemy: { checkMode: 'simple' } });
  const service = buildResolutionService(system);
  const recipe = buildRecipe(
    'r1',
    [buildIngredientSet([buildIngredientGroup('c1')])],
    [
      { id: 'rg1', name: 'On success', results: [] },
      { id: 'rg-fail', name: 'On a failed check', role: 'failure', results: [] }
    ]
  );
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, true, result.errors.join(', '));
});

test('ResolutionModeService.validateRecipe: Simple-mode tolerates an absent failure group', () => {
  const system = buildAlchemySystem({ alchemy: { checkMode: 'simple' } });
  const service = buildResolutionService(system);
  const recipe = buildRecipe(
    'r1',
    [buildIngredientSet([buildIngredientGroup('c1')])],
    [{ id: 'rg1', name: 'On success', results: [] }]
  );
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, true, result.errors.join(', '));
});

test('ResolutionModeService.validateRecipe: None/Simple reject more than one SUCCESS group', () => {
  const system = buildAlchemySystem({ alchemy: { checkMode: 'none' } });
  const service = buildResolutionService(system);
  const recipe = buildRecipe(
    'r1',
    [buildIngredientSet([buildIngredientGroup('c1')])],
    [
      { id: 'rg1', name: 'group1', results: [] },
      { id: 'rg2', name: 'group2', results: [] }
    ]
  );
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /exactly 1 result group/i.test(e)));
});

test('ResolutionModeService.validateRecipe: Tiered-mode recipe with multiple result groups is valid', () => {
  const system = buildAlchemySystem({ alchemy: { checkMode: 'tiered' } });
  const service = buildResolutionService(system);
  const recipe = buildRecipe(
    'r1',
    [buildIngredientSet([buildIngredientGroup('c1')])],
    [
      { id: 'rg1', name: 'Fine', checkOutcomeIds: ['t1'], results: [] },
      { id: 'rg2', name: 'Superb', checkOutcomeIds: ['t2'], results: [] }
    ]
  );
  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, true, result.errors.join(', '));
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
      [{ id: 'rg1', name: 'group1', results: [] }]
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

test('resolveResultGroups: alchemy None returns the single success group', () => {
  const system = buildAlchemySystem({ alchemy: { checkMode: 'none' } });
  const service = buildResolutionService(system);
  const allGroups = [{ id: 'rg1', name: 'Group1', results: [] }];
  const recipe = { craftingSystemId: 'alchemy-sys' };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { success: true, outcome: null } });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].id, 'rg1');
});

test('resolveResultGroups: alchemy Simple PASS returns the success group (not the failure group)', () => {
  const system = buildAlchemySystem({ alchemy: { checkMode: 'simple' } });
  const service = buildResolutionService(system);
  const allGroups = [
    { id: 'rg1', name: 'On success', results: [] },
    { id: 'rg-fail', name: 'On a failed check', role: 'failure', results: [] }
  ];
  const recipe = { craftingSystemId: 'alchemy-sys' };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { success: true } });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].id, 'rg1');
});

test('resolveResultGroups: alchemy Simple FAIL returns the reserved failure group', () => {
  const system = buildAlchemySystem({ alchemy: { checkMode: 'simple' } });
  const service = buildResolutionService(system);
  const allGroups = [
    { id: 'rg1', name: 'On success', results: [] },
    { id: 'rg-fail', name: 'On a failed check', role: 'failure', results: [] }
  ];
  const recipe = { craftingSystemId: 'alchemy-sys' };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { success: false } });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].id, 'rg-fail');
  assert.equal(result.meta.disposition, 'fail');
});

test('resolveResultGroups: alchemy Simple FAIL with no failure group produces nothing (tolerated)', () => {
  const system = buildAlchemySystem({ alchemy: { checkMode: 'simple' } });
  const service = buildResolutionService(system);
  const allGroups = [{ id: 'rg1', name: 'On success', results: [] }];
  const recipe = { craftingSystemId: 'alchemy-sys' };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { success: false } });
  assert.equal(result.groups.length, 0);
  assert.equal(result.meta.disposition, 'fail');
});

test('resolveResultGroups: alchemy Tiered routes the outcome to its assigned tier group (checkOutcomeIds)', () => {
  const system = buildAlchemySystem({
    alchemy: { checkMode: 'tiered' },
    craftingCheck: {
      routed: {
        type: 'relative',
        relativeOutcomes: [
          { id: 't-fine', name: 'Fine', success: true },
          { id: 't-superb', name: 'Superb', success: true }
        ]
      }
    }
  });
  const service = buildResolutionService(system);
  const allGroups = [
    { id: 'rg1', name: 'Fine result', checkOutcomeIds: ['t-fine'], results: [] },
    { id: 'rg2', name: 'Superb result', checkOutcomeIds: ['t-superb'], results: [] }
  ];
  const recipe = { craftingSystemId: 'alchemy-sys' };
  const step = { resultGroups: allGroups };

  const result = service.resolveResultGroups({ recipe, step, checkResult: { outcome: 'Superb' } });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].id, 'rg2');
  assert.equal(result.meta.disposition, 'success');
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

test('RecipeVisibilityService: reveal-not-gate — a non-revealed global-mode recipe is NOT revealed but is still craftable', () => {
  // global mode reveals discovery-only; learnOnCraft off + not learned => not
  // revealed. Reveal-not-gate: craftable stays true (matched signature is the sole
  // brew gate).
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
  assert.equal(result.craftable, true, 'brewing is never gated by reveal state');
  assert.equal(result.reason, 'alchemy-unrevealed');
});

test('RecipeVisibilityService: a brew-discovered (learned) global-mode recipe is revealed and craftable', () => {
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
  assert.equal(result.craftable, true);
  assert.equal(result.reason, 'alchemy-revealed');
});

test('RecipeVisibilityService: an un-learned global-mode recipe is not revealed but stays craftable (brew never gated)', () => {
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
  assert.equal(result.craftable, true, 'brewing is never gated by reveal state');
  assert.equal(result.reason, 'alchemy-unrevealed');
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
};

const noEssenceSystem = {
  features: { essences: false },
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

// ============================================================================
// CraftingEngine._matchAlchemySignature: ingredient quantity enforcement (T-260)
// ============================================================================

// An ingredient group whose single option requires `quantity` of `componentId`.
function buildIngredientGroupQty(componentId, quantity) {
  return {
    id: `g-${Math.random().toString(36).slice(2)}`,
    options: [{ match: { type: 'component', componentId }, quantity }]
  };
}

// The workbench expands a stack into one submission per unit; mirror that here by
// returning `count` discrete submissions that all resolve to the same source.
function buildIngotSubmissions(sourceUuid, count) {
  return Array.from({ length: count }, () => ({
    uuid: sourceUuid,
    _stats: { compendiumSource: sourceUuid },
    system: { quantity: 1 },
    flags: {}
  }));
}

function buildQuantityRecipe(componentId, requiredQty) {
  return buildRecipe(
    'forge-blade',
    [buildIngredientSet([buildIngredientGroupQty(componentId, requiredQty)])],
    [{ id: 'rg1', name: 'Result', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
}

test('_matchAlchemySignature matches when submitted quantity equals the required ingredient quantity', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const components = [buildComponent('iron', 'Item.iron-ingot')];
  const recipe = buildQuantityRecipe('iron', 5);
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components
  });

  const result = engine._matchAlchemySignature(
    buildIngotSubmissions('Item.iron-ingot', 5), [recipe], components, validator
  );

  assert.equal(result.matched, true);
  assert.equal(result.recipe.id, 'forge-blade');
});

test('_matchAlchemySignature does NOT match when submitted quantity is below the required ingredient quantity', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const components = [buildComponent('iron', 'Item.iron-ingot')];
  const recipe = buildQuantityRecipe('iron', 5);
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components
  });

  // The headline defect: one ingot must NOT satisfy a five-ingot group.
  const single = engine._matchAlchemySignature(
    buildIngotSubmissions('Item.iron-ingot', 1), [recipe], components, validator
  );
  assert.equal(single.matched, false, 'one ingot must not satisfy a five-ingot group');

  // Boundary: one short of the requirement still fails.
  const oneShort = engine._matchAlchemySignature(
    buildIngotSubmissions('Item.iron-ingot', 4), [recipe], components, validator
  );
  assert.equal(oneShort.matched, false, 'four ingots must not satisfy a five-ingot group');
});

test('_matchAlchemySignature matches when submitted quantity exceeds the required ingredient quantity', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const components = [buildComponent('iron', 'Item.iron-ingot')];
  const recipe = buildQuantityRecipe('iron', 5);
  const validator = new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components
  });

  const result = engine._matchAlchemySignature(
    buildIngotSubmissions('Item.iron-ingot', 6), [recipe], components, validator
  );

  assert.equal(result.matched, true);
  assert.equal(result.recipe.id, 'forge-blade');
});

test('craftAlchemy reaches the no-match disposition (and consumes) when ingredient quantity is insufficient', async () => {
  const sourceUuid = 'Item.iron-ingot';
  const components = [buildComponent('iron', sourceUuid)];
  const recipe = buildQuantityRecipe('iron', 5);
  const system = buildAlchemySystem({
    id: 'alchemy-sys',
    components,
    alchemy: { learnOnCraft: false, consumeOnFail: true, showAttemptHistoryToPlayers: false }
  });
  game.fabricate.getCraftingSystemManager = () => ({
    getSystem: (id) => (id === 'alchemy-sys' ? system : null)
  });
  const validator = new SignatureValidator({
    getSystem: () => system,
    getRecipesForSystem: () => [recipe],
    getComponentsForSystem: () => components
  });
  const engine = new CraftingEngine({ getRecipes: () => [recipe] });

  const deleted = [];
  const actorItem = {
    uuid: sourceUuid,
    system: { quantity: 1 },
    async delete() { deleted.push(this.uuid); },
    async update() {}
  };
  const sourceActor = { items: [actorItem] };
  // Submit only one of the five required ingots.
  const submitted = buildIngotSubmissions(sourceUuid, 1);

  const result = await engine.craftAlchemy({ id: 'pc' }, [sourceActor], submitted, {
    craftingSystemId: 'alchemy-sys',
    signatureValidator: validator
  });

  assert.equal(result.success, false);
  assert.equal(result.disposition, 'no-match');
  assert.equal(result.consumed, true);
  assert.equal(deleted.length, 1, 'insufficient submission is still consumed on the no-match path');
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

// ============================================================================
// CraftingEngine._matchAlchemySignature: durable component identity (issue 558)
//
// Signature bucketing routes through the shared, list-aware, system-scoped
// resolver `resolveComponentForItem`, so a submission is attributed to the single
// component it IS (durable-flag-first), not to whichever component its raw
// source-reference chain happens to overlap.
// ============================================================================

// Convenience: the SignatureValidator these signature tests always feed the same
// three no-op lookups plus one component set. Hoisted so the new-code duplication
// stays under the SonarCloud gate.
function buildSignatureValidator(components) {
  return new SignatureValidator({
    getSystem: () => null,
    getRecipesForSystem: () => [],
    getComponentsForSystem: () => components,
  });
}

// A single-group signature recipe requiring one component by id.
function buildComponentRecipe(id, componentId) {
  return buildRecipe(
    id,
    [buildIngredientSet([buildIngredientGroup(componentId)])],
    [{ id: 'rg1', name: 'Result', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
}

// A single-group signature recipe whose one option matches by tag and requires
// `quantity` units. Used to exercise one-unit-per-group counting: the option
// expands to every component carrying `tag`.
function buildTagGroupRecipe(id, tag, quantity) {
  return buildRecipe(
    id,
    [
      buildIngredientSet([
        {
          id: `g-${Math.random().toString(36).slice(2)}`,
          options: [{ match: { type: 'tags', tags: [tag], tagMatch: 'any' }, quantity }],
        },
      ]),
    ],
    [{ id: 'rg1', name: 'Result', results: [] }],
    { resultSelection: { provider: 'ingredientSet' } }
  );
}

test('_matchAlchemySignature attributes a submission to its durable componentId flag, not its duplicate-lineage raw refs (A1, issue 558)', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const sys = 'alchemy-sys';
  // Two distinct components; A's source ref is Item.A, B's is Item.B.
  const componentA = component('cA', { sourceUuid: 'Item.A', sourceItemUuid: 'Item.A' });
  const componentB = component('cB', { sourceUuid: 'Item.B', sourceItemUuid: 'Item.B' });
  const components = [componentA, componentB];
  const validator = buildSignatureValidator(components);

  // A submission the collector attributed to B (durable roles flag) that STILL
  // carries a transitive duplicateSource pointing at A's source. Its raw refs
  // ([uuid, Item.A]) genuinely overlap A, so the pre-fix flag-blind matcher
  // credited A (non-vacuity: without the Item.A overlap this would pass for the
  // wrong reason).
  const item = roleItem({
    uuid: 'Item.owned-copy-of-A',
    duplicateSource: 'Item.A',
    roles: { [sys]: { componentId: 'cB' } },
    name: 'Restamped Draught',
  });
  assert.ok(
    getItemSourceReferences(item).includes('Item.A'),
    'non-vacuity: the submission raw refs must genuinely overlap component A'
  );

  const matchesB = engine._matchAlchemySignature(
    [item],
    [buildComponentRecipe('needs-B', 'cB')],
    components,
    validator,
    { system: { id: sys } }
  );
  const matchesA = engine._matchAlchemySignature(
    [item],
    [buildComponentRecipe('needs-A', 'cA')],
    components,
    validator,
    { system: { id: sys } }
  );

  assert.equal(matchesB.matched, true, 'submission is credited to its durable componentId B');
  assert.equal(
    matchesA.matched,
    false,
    'submission is NOT credited to duplicate-lineage component A'
  );
});

test('_matchAlchemySignature resolves a submission carrying only a bare top-level sourceUuid (A2b, characterization)', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const components = [buildComponent('bare', 'Item.bare-source')];
  const validator = buildSignatureValidator(components);

  // The item carries ONLY a bare top-level `sourceUuid` — no uuid, no
  // _stats.compendiumSource, no duplicateSource — so `getItemSourceReferences`
  // (and thus the shared resolver) sees nothing; only the LOCAL bare-sourceUuid
  // supplement can attribute it.
  const result = engine._matchAlchemySignature(
    [{ sourceUuid: 'Item.bare-source' }],
    [buildComponentRecipe('bare-recipe', 'bare')],
    components,
    validator
  );

  assert.equal(result.matched, true, 'bare top-level sourceUuid still resolves to its component');
});

test('_matchAlchemySignature counts a submission matching several of a group\'s components as one unit (A2c)', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  // Two components sharing a tag but with distinct source refs.
  const components = [
    { ...buildComponent('c1', 'Item.c1'), tags: ['metal'] },
    { ...buildComponent('c2', 'Item.c2'), tags: ['metal'] },
  ];
  const validator = buildSignatureValidator(components);
  // A single submission whose raw refs overlap BOTH components.
  const submission = { uuid: 'Item.c1', _stats: { compendiumSource: 'Item.c2' }, flags: {} };

  const result = engine._matchAlchemySignature(
    [submission],
    [buildTagGroupRecipe('needs-two-metal', 'metal', 2)],
    components,
    validator
  );

  // Counted as one unit (not two), so a group needing two metal units is unmet.
  assert.equal(result.matched, false, 'one submission contributes at most one unit to a group');
});

test('_matchAlchemySignature falls through a stale/foreign identity flag to the raw-ref tier (A2d)', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  const sys = 'alchemy-sys';
  const components = [component('cC', { sourceUuid: 'Item.C', sourceItemUuid: 'Item.C' })];
  const validator = buildSignatureValidator(components);
  // The roles flag names a component absent from this system's set (stale/foreign),
  // so it is inert; the raw refs overlap the real component C.
  const item = roleItem({
    uuid: 'Item.owned-C',
    compendiumSource: 'Item.C',
    roles: { [sys]: { componentId: 'ghost' } },
    name: 'Owned C',
  });

  const result = engine._matchAlchemySignature(
    [item],
    [buildComponentRecipe('needs-C', 'cC')],
    components,
    validator,
    { system: { id: sys } }
  );

  assert.equal(result.matched, true, 'an inert flag does not suppress the legitimate raw-ref match');
});

test('_matchAlchemySignature resolves a cross-group multi-overlap submission to a single component (order-dependent, issue 558)', () => {
  const engine = new CraftingEngine({ getRecipes: () => [] });
  // Component identity is now "one item = one component": a submission whose raw
  // refs overlap components in DIFFERENT groups resolves to the FIRST match in the
  // full set (order-dependent by design), not counted in both groups as the
  // pre-fix flag-blind intersection did.
  const componentX = component('cX', { sourceUuid: 'Item.X', sourceItemUuid: 'Item.X' });
  const componentY = component('cY', { sourceUuid: 'Item.Y', sourceItemUuid: 'Item.Y' });
  const components = [componentX, componentY];
  const validator = buildSignatureValidator(components);
  // Raw refs overlap both X and Y; cX is first in the set, so it resolves to cX.
  const submission = { uuid: 'Item.X', _stats: { compendiumSource: 'Item.Y' }, flags: {} };

  const matchesX = engine._matchAlchemySignature(
    [submission],
    [buildComponentRecipe('needs-X', 'cX')],
    components,
    validator
  );
  const matchesY = engine._matchAlchemySignature(
    [submission],
    [buildComponentRecipe('needs-Y', 'cY')],
    components,
    validator
  );

  assert.equal(matchesX.matched, true, 'resolves to the first overlapping component (cX)');
  assert.equal(matchesY.matched, false, 'not also counted toward the second overlapping component (cY)');
});

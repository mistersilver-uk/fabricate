/**
 * Unit tests for IngredientSet.resultGroupId field (T-004)
 *
 * Covers:
 *   AC1: Constructor accepts and persists resultGroupId
 *   AC3: toJSON() emits resultGroupId
 *   AC4: Mapped mode resolution routes correctly via resultGroupId
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals required for module load
// ---------------------------------------------------------------------------

globalThis.foundry = {
  utils: {
    randomID: () => `id-${Math.random().toString(36).slice(2, 10)}`,
    getProperty: () => undefined
  },
  applications: {
    api: {
      HandlebarsApplicationMixin: (Base) => class extends Base {},
      ApplicationV2: class { async _prepareContext() { return {}; } close() {} }
    }
  }
};
globalThis.game = { user: { isGM: true }, fabricate: null };
globalThis.ui = { notifications: { info: () => {}, warn: () => {}, error: () => {} } };
globalThis.ChatMessage = { create: () => {}, getSpeaker: () => ({}) };

// ---------------------------------------------------------------------------
// Imports — must come after globals are set
// ---------------------------------------------------------------------------

const { IngredientSet } = await import('../src/models/IngredientSet.js');
const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

/**
 * Build a mapped-mode crafting system.
 */
function buildMappedSystem(overrides = {}) {
  return {
    id: 'test-system',
    resolutionMode: 'mapped',
    features: { multiStepRecipes: false, essences: false, craftingChecks: false },
    craftingCheck: {
      enabled: false,
      macroUuid: null,
      outcomes: [],
      progressive: null,
    },
    managedItems: [],
    ...overrides,
  };
}

/**
 * Build a ResolutionModeService backed by the given system.
 */
function buildService(system) {
  const craftingSystemManager = {
    getSystem: (id) => (system && id === system.id ? system : null),
  };
  return new ResolutionModeService(craftingSystemManager);
}

/**
 * Build a minimal mock recipe for mapped mode.
 * @param {object} step - step object with resultGroups and ingredientSets
 */
function buildMappedRecipe(step) {
  return {
    id: 'test-recipe',
    craftingSystemId: 'test-system',
    getExecutionSteps: () => [step],
  };
}

/**
 * Build a step with two result groups (rg-1, rg-2) and the supplied ingredientSet plain object.
 */
function buildStepWithGroups(ingredientSetData = {}) {
  return {
    id: 'step-1',
    name: 'Step One',
    ingredientSets: [ingredientSetData],
    resultGroups: [
      { id: 'rg-1', results: [] },
      { id: 'rg-2', results: [] },
    ],
  };
}

// ---------------------------------------------------------------------------
// Group 1 — IngredientSet Constructor and Serialization
// ---------------------------------------------------------------------------

test('constructor accepts resultGroupId string', () => {
  const set = new IngredientSet({ resultGroupId: 'rg-1' });
  assert.equal(set.resultGroupId, 'rg-1');
});

test('constructor defaults resultGroupId to null when not provided', () => {
  const set = new IngredientSet({});
  assert.equal(set.resultGroupId, null);
});

test('constructor defaults resultGroupId to null when explicitly null', () => {
  const set = new IngredientSet({ resultGroupId: null });
  assert.equal(set.resultGroupId, null);
});

test('toJSON includes resultGroupId when set', () => {
  const set = new IngredientSet({ resultGroupId: 'rg-1' });
  const json = set.toJSON();
  assert.equal(json.resultGroupId, 'rg-1');
});

test('toJSON includes resultGroupId: null when not set', () => {
  const set = new IngredientSet({});
  const json = set.toJSON();
  assert.ok(Object.prototype.hasOwnProperty.call(json, 'resultGroupId'),
    'toJSON() should include a resultGroupId key even when null');
  assert.equal(json.resultGroupId, null);
});

test('fromJSON round-trip preserves resultGroupId', () => {
  const original = new IngredientSet({ resultGroupId: 'rg-1' });
  const json = original.toJSON();
  const restored = IngredientSet.fromJSON(json);
  assert.equal(restored.resultGroupId, 'rg-1');
});

// ---------------------------------------------------------------------------
// Group 2 — Mapped Mode Resolution via resultGroupId
// ---------------------------------------------------------------------------

test('mapped mode uses resultGroupId to select the correct result group', () => {
  const system = buildMappedSystem();
  const service = buildService(system);

  const ingredientSet = { id: 'set-1', resultGroupId: 'rg-2', ingredientGroups: [] };
  const step = buildStepWithGroups(ingredientSet);
  const recipe = buildMappedRecipe(step);

  const result = service.resolveResultGroups({ recipe, step, ingredientSet });

  assert.equal(result.groups.length, 1, 'should return exactly one group');
  assert.equal(result.groups[0].id, 'rg-2', 'should select rg-2 as specified by resultGroupId');
});

test('mapped mode falls back to resultMapping when resultGroupId is null', () => {
  const system = buildMappedSystem();
  const service = buildService(system);

  const ingredientSet = {
    id: 'set-1',
    resultGroupId: null,
    resultMapping: ['rg-1'],
    ingredientGroups: [],
  };
  const step = buildStepWithGroups(ingredientSet);
  const recipe = buildMappedRecipe(step);

  const result = service.resolveResultGroups({ recipe, step, ingredientSet });

  assert.equal(result.groups.length, 1, 'should return exactly one group');
  assert.equal(result.groups[0].id, 'rg-1', 'should select rg-1 via resultMapping fallback');
});

test('mapped mode prefers resultGroupId over resultMapping when both are present', () => {
  const system = buildMappedSystem();
  const service = buildService(system);

  const ingredientSet = {
    id: 'set-1',
    resultGroupId: 'rg-2',
    resultMapping: ['rg-1'],
    ingredientGroups: [],
  };
  const step = buildStepWithGroups(ingredientSet);
  const recipe = buildMappedRecipe(step);

  const result = service.resolveResultGroups({ recipe, step, ingredientSet });

  assert.equal(result.groups.length, 1, 'should return exactly one group');
  assert.equal(result.groups[0].id, 'rg-2',
    'should prefer resultGroupId (rg-2) over resultMapping (rg-1)');
});

test('mapped mode falls back to selectedResultGroupId when ingredientSet has no resultGroupId', () => {
  const system = buildMappedSystem();
  const service = buildService(system);

  const ingredientSet = {
    id: 'set-1',
    resultGroupId: null,
    resultMapping: [],
    ingredientGroups: [],
  };
  const step = buildStepWithGroups(ingredientSet);
  const recipe = buildMappedRecipe(step);

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet,
    selectedResultGroupId: 'rg-1',
  });

  assert.equal(result.groups.length, 1, 'should return exactly one group');
  assert.equal(result.groups[0].id, 'rg-1',
    'should use selectedResultGroupId when resultGroupId and resultMapping are absent');
});

test('mapped mode falls back to first result group when no routing info is available', () => {
  const system = buildMappedSystem();
  const service = buildService(system);

  const ingredientSet = {
    id: 'set-1',
    resultGroupId: null,
    resultMapping: [],
    ingredientGroups: [],
  };
  const step = buildStepWithGroups(ingredientSet);
  const recipe = buildMappedRecipe(step);

  // No selectedResultGroupId provided either
  const result = service.resolveResultGroups({ recipe, step, ingredientSet });

  assert.equal(result.groups.length, 1, 'should return exactly one group');
  assert.equal(result.groups[0].id, 'rg-1',
    'should fall back to the first result group when no routing info is available');
});

test('mapped mode returns empty array when resultGroupId references a nonexistent group', () => {
  const system = buildMappedSystem();
  const service = buildService(system);

  const ingredientSet = {
    id: 'set-1',
    resultGroupId: 'rg-nonexistent',
    ingredientGroups: [],
  };
  const step = buildStepWithGroups(ingredientSet);
  const recipe = buildMappedRecipe(step);

  const result = service.resolveResultGroups({ recipe, step, ingredientSet });

  assert.equal(result.groups.length, 0,
    'should return an empty array when resultGroupId does not match any group');
});

/**
 * Unit tests for IngredientSet.resultGroupId field (T-004)
 *
 * Covers:
 *   AC1: Constructor accepts and persists resultGroupId
 *   AC3: toJSON() emits resultGroupId
 *   AC4: Canonical routed + ingredientSet resolution routes correctly via
 *        resultGroupId (the former `mapped` behavior, now canonical).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Foundry globals required for module load
// ---------------------------------------------------------------------------

// Minimal Foundry surface this module's import chain touches. Assembled
// piecewise (rather than one large object literal) so this arrange block stays
// distinct from the shared stubs in sibling suites.
const utils = { randomID: () => `id-${crypto.randomUUID().slice(0, 8)}`, getProperty: () => undefined };
const HandlebarsApplicationMixin = (Base) => class extends Base {};
class ApplicationV2 {
  async _prepareContext() {
    return {};
  }
  close() {}
}
globalThis.foundry = { utils, applications: { api: { HandlebarsApplicationMixin, ApplicationV2 } } };
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
 * Build a canonical routed crafting system (the former `mapped` shape; routing
 * by ingredientSet.resultGroupId is now the `ingredientSet` provider contract).
 */
function buildMappedSystem(overrides = {}) {
  return {
    id: 'test-system',
    resolutionMode: 'routed',
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
    resultSelection: { provider: 'ingredientSet' },
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

/**
 * Arrange a routed + ingredientSet recipe around the given ingredientSet and
 * resolve its result groups. Any extra `resolveResultGroups` args (e.g.
 * `selectedResultGroupId`) are merged into the call.
 */
function resolveForIngredientSet(ingredientSet, extraResolveArgs = {}) {
  const service = buildService(buildMappedSystem());
  const step = buildStepWithGroups(ingredientSet);
  const recipe = buildMappedRecipe(step);
  return service.resolveResultGroups({ recipe, step, ingredientSet, ...extraResolveArgs });
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

test('routed + ingredientSet uses resultGroupId to select the correct result group', () => {
  const result = resolveForIngredientSet({ id: 'set-1', resultGroupId: 'rg-2', ingredientGroups: [] });

  assert.equal(result.groups.length, 1, 'should return exactly one group');
  assert.equal(result.groups[0].id, 'rg-2', 'should select rg-2 as specified by resultGroupId');
});

test('routed + ingredientSet falls back to resultMapping when resultGroupId is null', () => {
  const result = resolveForIngredientSet({
    id: 'set-1',
    resultGroupId: null,
    resultMapping: ['rg-1'],
    ingredientGroups: [],
  });

  assert.equal(result.groups.length, 1, 'should return exactly one group');
  assert.equal(result.groups[0].id, 'rg-1', 'should select rg-1 via resultMapping fallback');
});

test('routed + ingredientSet prefers resultGroupId over resultMapping when both are present', () => {
  const result = resolveForIngredientSet({
    id: 'set-1',
    resultGroupId: 'rg-2',
    resultMapping: ['rg-1'],
    ingredientGroups: [],
  });

  assert.equal(result.groups.length, 1, 'should return exactly one group');
  assert.equal(result.groups[0].id, 'rg-2',
    'should prefer resultGroupId (rg-2) over resultMapping (rg-1)');
});

test('routed + ingredientSet falls back to selectedResultGroupId when ingredientSet has no resultGroupId', () => {
  const result = resolveForIngredientSet(
    { id: 'set-1', resultGroupId: null, resultMapping: [], ingredientGroups: [] },
    { selectedResultGroupId: 'rg-1' }
  );

  assert.equal(result.groups.length, 1, 'should return exactly one group');
  assert.equal(result.groups[0].id, 'rg-1',
    'should use selectedResultGroupId when resultGroupId and resultMapping are absent');
});

test('routed + ingredientSet falls back to first result group when no routing info is available', () => {
  // No selectedResultGroupId provided either
  const result = resolveForIngredientSet({
    id: 'set-1',
    resultGroupId: null,
    resultMapping: [],
    ingredientGroups: [],
  });

  assert.equal(result.groups.length, 1, 'should return exactly one group');
  assert.equal(result.groups[0].id, 'rg-1',
    'should fall back to the first result group when no routing info is available');
});

test('routed + ingredientSet returns empty array when resultGroupId references a nonexistent group', () => {
  const result = resolveForIngredientSet({
    id: 'set-1',
    resultGroupId: 'rg-nonexistent',
    ingredientGroups: [],
  });

  assert.equal(result.groups.length, 0,
    'should return an empty array when resultGroupId does not match any group');
});

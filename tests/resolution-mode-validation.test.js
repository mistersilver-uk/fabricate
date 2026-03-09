/**
 * Unit tests for ResolutionModeService.validateRecipe (T-021)
 * Tests mode-specific validation logic for simple, mapped, tiered, and progressive modes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

/**
 * Build a mock crafting system config.
 * checkEnabled is true when craftingCheck.enabled === true OR macroUuid is non-empty.
 */
function buildSystem(overrides = {}) {
  return {
    id: 'test-system',
    resolutionMode: 'simple',
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
 * Build a minimal valid execution step.
 * @param {object} overrides - properties to override on the step object
 */
function buildStep(overrides = {}) {
  return {
    id: 'step-1',
    name: 'Step One',
    ingredientSets: [
      {
        id: 'set-1',
        ingredientGroups: [{ id: 'g-1', options: [{ id: 'i-1' }] }],
        catalysts: [],
      },
    ],
    resultGroups: [
      {
        id: 'rg-1',
        results: [],
      },
    ],
    ...overrides,
  };
}

/**
 * Build a mock recipe.
 * @param {object[]} steps - the execution steps returned by getExecutionSteps()
 * @param {object} overrides - properties to override on the recipe object
 */
function buildRecipe(steps, overrides = {}) {
  return {
    id: 'test-recipe',
    craftingSystemId: 'test-system',
    getExecutionSteps: () => steps,
    ...overrides,
  };
}

/**
 * Build a ResolutionModeService whose craftingSystemManager resolves the given system
 * when queried by id.
 */
function buildService(system) {
  const craftingSystemManager = {
    getSystem: (id) => (system && id === system.id ? system : null),
  };
  return new ResolutionModeService(craftingSystemManager);
}

// ---------------------------------------------------------------------------
// AC 1 — Simple mode: exactly 1 ingredient set and exactly 1 result group
// ---------------------------------------------------------------------------

test('simple mode — 1 ingredient set and 1 result group → valid', () => {
  const system = buildSystem({ resolutionMode: 'simple' });
  const service = buildService(system);
  const step = buildStep();
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('simple mode — 2 ingredient sets → invalid with error mentioning "ingredient set"', () => {
  const system = buildSystem({ resolutionMode: 'simple' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [
      { id: 'set-1', ingredientGroups: [], catalysts: [] },
      { id: 'set-2', ingredientGroups: [], catalysts: [] },
    ],
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /ingredient set/i.test(e)),
    `expected an error mentioning "ingredient set", got: ${JSON.stringify(result.errors)}`
  );
});

test('simple mode — 2 result groups → invalid with error mentioning "result group"', () => {
  const system = buildSystem({ resolutionMode: 'simple' });
  const service = buildService(system);
  const step = buildStep({
    resultGroups: [
      { id: 'rg-1', results: [] },
      { id: 'rg-2', results: [] },
    ],
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /result group/i.test(e)),
    `expected an error mentioning "result group", got: ${JSON.stringify(result.errors)}`
  );
});

test('simple mode — zero ingredient sets → invalid', () => {
  const system = buildSystem({ resolutionMode: 'simple' });
  const service = buildService(system);
  const step = buildStep({ ingredientSets: [] });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('simple mode — zero result groups → invalid', () => {
  const system = buildSystem({ resolutionMode: 'simple' });
  const service = buildService(system);
  const step = buildStep({ resultGroups: [] });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

// ---------------------------------------------------------------------------
// AC 2 — Mapped mode: resultGroupId references must be valid
// ---------------------------------------------------------------------------

test('mapped mode — each set has resultGroupId matching a result group → valid', () => {
  const system = buildSystem({ resolutionMode: 'mapped' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [
      { id: 'set-1', resultGroupId: 'rg-1', ingredientGroups: [], catalysts: [] },
    ],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('mapped mode — resultGroupId references non-existent group → invalid', () => {
  const system = buildSystem({ resolutionMode: 'mapped' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [
      { id: 'set-1', resultGroupId: 'rg-does-not-exist', ingredientGroups: [], catalysts: [] },
    ],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /invalid resultGroupId/i.test(e) || /resultGroupId/i.test(e)),
    `expected error about invalid resultGroupId, got: ${JSON.stringify(result.errors)}`
  );
});

test('mapped mode — resultGroupId is null → valid (null is treated as unset, not an error)', () => {
  // The source code: `const mappedId = set?.resultGroupId || null; if (mappedId && !groupIds.has(mappedId)) { ... }`
  // null/undefined resultGroupId is skipped — not an error.
  const system = buildSystem({ resolutionMode: 'mapped' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [
      { id: 'set-1', resultGroupId: null, ingredientGroups: [], catalysts: [] },
    ],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
});

test('mapped mode — multiple sets with valid mappings → valid', () => {
  const system = buildSystem({ resolutionMode: 'mapped' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [
      { id: 'set-1', resultGroupId: 'rg-1', ingredientGroups: [], catalysts: [] },
      { id: 'set-2', resultGroupId: 'rg-2', ingredientGroups: [], catalysts: [] },
    ],
    resultGroups: [
      { id: 'rg-1', results: [] },
      { id: 'rg-2', results: [] },
    ],
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('mapped mode — zero ingredient sets → invalid', () => {
  const system = buildSystem({ resolutionMode: 'mapped' });
  const service = buildService(system);
  const step = buildStep({ ingredientSets: [] });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('mapped mode — zero result groups → invalid', () => {
  const system = buildSystem({ resolutionMode: 'mapped' });
  const service = buildService(system);
  const step = buildStep({ resultGroups: [] });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

// ---------------------------------------------------------------------------
// AC 3 — Tiered mode: checks enabled, outcomes non-empty, valid routing
// ---------------------------------------------------------------------------

/**
 * Build a valid tiered system: checks enabled, outcomes declared, managedItems populated.
 */
function buildTieredSystem(overrides = {}) {
  return buildSystem({
    resolutionMode: 'tiered',
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: ['success', 'failure'],
      progressive: null,
    },
    ...overrides,
  });
}

/**
 * Build a valid tiered step: 1 set, 2 result groups, outcomeRouting covers all declared outcomes.
 */
function buildTieredStep(overrides = {}) {
  return buildStep({
    ingredientSets: [{ id: 'set-1', ingredientGroups: [], catalysts: [] }],
    resultGroups: [
      { id: 'rg-success', results: [] },
      { id: 'rg-failure', results: [] },
    ],
    outcomeRouting: {
      success: 'rg-success',
      failure: 'rg-failure',
    },
    ...overrides,
  });
}

test('tiered mode — checks enabled, outcomes present, valid routing → valid', () => {
  const system = buildTieredSystem();
  const service = buildService(system);
  const step = buildTieredStep();
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('tiered mode — crafting checks disabled → invalid', () => {
  const system = buildTieredSystem({
    craftingCheck: {
      enabled: false,
      macroUuid: null,
      outcomes: ['success', 'failure'],
      progressive: null,
    },
  });
  const service = buildService(system);
  const step = buildTieredStep();
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /crafting check/i.test(e) || /check/i.test(e)),
    `expected error about checks being disabled, got: ${JSON.stringify(result.errors)}`
  );
});

test('tiered mode — crafting checks enabled via macroUuid (not boolean enabled) → valid', () => {
  // checkEnabled = system.craftingCheck.enabled === true || !!system.craftingCheck.macroUuid
  const system = buildTieredSystem({
    craftingCheck: {
      enabled: false,
      macroUuid: 'Macro.some-uuid',
      outcomes: ['success', 'failure'],
      progressive: null,
    },
  });
  const service = buildService(system);
  const step = buildTieredStep();
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('tiered mode — empty outcomes array → invalid', () => {
  const system = buildTieredSystem({
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null,
    },
  });
  const service = buildService(system);
  const step = buildTieredStep();
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /outcome/i.test(e)),
    `expected error mentioning outcomes, got: ${JSON.stringify(result.errors)}`
  );
});

test('tiered mode — outcome maps to non-existent result group → invalid', () => {
  const system = buildTieredSystem();
  const service = buildService(system);
  const step = buildTieredStep({
    outcomeRouting: {
      success: 'rg-success',
      failure: 'rg-does-not-exist', // invalid target
    },
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /failure/i.test(e) || /outcome/i.test(e)),
    `expected error about invalid outcome routing, got: ${JSON.stringify(result.errors)}`
  );
});

test('tiered mode — missing routing entry for an outcome → invalid', () => {
  const system = buildTieredSystem();
  const service = buildService(system);
  const step = buildTieredStep({
    outcomeRouting: {
      success: 'rg-success',
      // 'failure' is missing entirely
    },
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /failure/i.test(e) || /outcome/i.test(e)),
    `expected error about missing routing for "failure", got: ${JSON.stringify(result.errors)}`
  );
});

test('tiered mode — step-level outcomeRouting overrides recipe-level routing', () => {
  const system = buildTieredSystem();
  const service = buildService(system);

  // Step has valid routing; recipe-level routing is intentionally invalid/incomplete.
  const step = buildTieredStep({
    outcomeRouting: {
      success: 'rg-success',
      failure: 'rg-failure',
    },
  });
  // Recipe-level routing is present but would be wrong — step-level wins
  const recipe = buildRecipe([step], {
    outcomeRouting: {
      success: 'rg-does-not-exist',
      failure: 'rg-also-wrong',
    },
  });

  const result = service.validateRecipe(recipe);

  // Step-level routing is valid, so overall result should be valid
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('tiered mode — no step-level routing, valid recipe-level routing → valid', () => {
  const system = buildTieredSystem();
  const service = buildService(system);

  // Step has NO outcomeRouting; recipe-level routing covers both outcomes
  const step = buildStep({
    ingredientSets: [{ id: 'set-1', ingredientGroups: [], catalysts: [] }],
    resultGroups: [
      { id: 'rg-success', results: [] },
      { id: 'rg-failure', results: [] },
    ],
    // No outcomeRouting on step
  });
  const recipe = buildRecipe([step], {
    outcomeRouting: {
      success: 'rg-success',
      failure: 'rg-failure',
    },
  });

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

// ---------------------------------------------------------------------------
// AC 4 — Progressive mode: checks enabled, progressive config, difficulty >= 1
// ---------------------------------------------------------------------------

/**
 * Build a system with progressive mode fully configured.
 * @param {object[]} managedItems - items with id and difficulty fields
 * @param {object} overrides
 */
function buildProgressiveSystem(managedItems = [], overrides = {}) {
  return buildSystem({
    resolutionMode: 'progressive',
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
    },
    managedItems,
    ...overrides,
  });
}

/**
 * Build a valid progressive step with one result group containing the given results.
 */
function buildProgressiveStep(results = [], overrides = {}) {
  return buildStep({
    ingredientSets: [{ id: 'set-1', ingredientGroups: [], catalysts: [] }],
    resultGroups: [{ id: 'rg-1', results }],
    ...overrides,
  });
}

test('progressive mode — checks enabled, progressive config, difficulty >= 1 → valid', () => {
  const system = buildProgressiveSystem([{ id: 'item-potion', difficulty: 3 }]);
  const service = buildService(system);
  const step = buildProgressiveStep([{ id: 'result-1', componentId: 'item-potion' }]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('progressive mode — crafting checks disabled → invalid', () => {
  const system = buildProgressiveSystem([], {
    craftingCheck: {
      enabled: false,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
    },
  });
  const service = buildService(system);
  const step = buildProgressiveStep([]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /progressive.*check|check.*progressive|crafting check/i.test(e) || /check/i.test(e)),
    `expected error about checks being disabled, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — missing progressive config → invalid', () => {
  const system = buildProgressiveSystem([], {
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: null, // missing config
    },
  });
  const service = buildService(system);
  const step = buildProgressiveStep([]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /progressive/i.test(e)),
    `expected error mentioning progressive config, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — difficulty < 1 on a result → invalid', () => {
  const system = buildProgressiveSystem([{ id: 'item-herb', difficulty: 0.5 }]);
  const service = buildService(system);
  const step = buildProgressiveStep([{ id: 'result-1', componentId: 'item-herb' }]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /difficulty|system item|component/i.test(e)),
    `expected error about invalid difficulty, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — difficulty = 0 → invalid', () => {
  const system = buildProgressiveSystem([{ id: 'item-zero', difficulty: 0 }]);
  const service = buildService(system);
  const step = buildProgressiveStep([{ id: 'result-1', componentId: 'item-zero' }]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /difficulty|system item|component/i.test(e)),
    `expected error about difficulty = 0, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — multiple results all with valid difficulty → valid', () => {
  const system = buildProgressiveSystem([
    { id: 'item-a', difficulty: 1 },
    { id: 'item-b', difficulty: 5 },
    { id: 'item-c', difficulty: 10 },
  ]);
  const service = buildService(system);
  const step = buildProgressiveStep([
    { id: 'result-a', componentId: 'item-a' },
    { id: 'result-b', componentId: 'item-b' },
    { id: 'result-c', componentId: 'item-c' },
  ]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('progressive mode — one result with invalid difficulty among valid ones → invalid', () => {
  const system = buildProgressiveSystem([
    { id: 'item-good', difficulty: 3 },
    { id: 'item-bad', difficulty: 0 }, // invalid
  ]);
  const service = buildService(system);
  const step = buildProgressiveStep([
    { id: 'result-1', componentId: 'item-good' },
    { id: 'result-2', componentId: 'item-bad' },
  ]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /result-2|difficulty|system item/i.test(e)),
    `expected error about the invalid result, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — exactly 1 result group required; multiple → invalid', () => {
  const system = buildProgressiveSystem([{ id: 'item-potion', difficulty: 2 }]);
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [{ id: 'set-1', ingredientGroups: [], catalysts: [] }],
    resultGroups: [
      { id: 'rg-1', results: [{ id: 'r-1', componentId: 'item-potion' }] },
      { id: 'rg-2', results: [{ id: 'r-2', componentId: 'item-potion' }] },
    ],
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /result group/i.test(e)),
    `expected error about too many result groups, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — no system found → early-return valid (no errors)', () => {
  // When craftingSystemManager cannot resolve the system, validateRecipe returns { valid: true, errors: [] }
  const service = buildService(null); // no system available
  const step = buildProgressiveStep([]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('progressive mode — result componentId not found in managedItems → invalid (no finite difficulty)', () => {
  const system = buildProgressiveSystem([]); // no managed items at all
  const service = buildService(system);
  const step = buildProgressiveStep([{ id: 'result-1', componentId: 'item-unknown' }]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /result-1|difficulty|system item/i.test(e)),
    `expected error about missing component difficulty, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — difficulty exactly 1 is valid (boundary check)', () => {
  const system = buildProgressiveSystem([{ id: 'item-exact', difficulty: 1 }]);
  const service = buildService(system);
  const step = buildProgressiveStep([{ id: 'result-1', componentId: 'item-exact' }]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('progressive mode — empty results array in the single group → invalid', () => {
  const system = buildProgressiveSystem([]);
  const service = buildService(system);
  const step = buildProgressiveStep([]); // empty results
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /ordered results|progressive/i.test(e)),
    `expected error about empty results in progressive mode, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — _getDifficulty falls back to system.items when managedItems absent', () => {
  // _getDifficulty: managedItems = Array.isArray(system.managedItems) ? system.managedItems : (system.items || [])
  const system = buildSystem({
    resolutionMode: 'progressive',
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
    },
    // No managedItems key — use items fallback
    items: [{ id: 'item-sword', difficulty: 4 }],
  });
  // Remove managedItems so it falls back to items
  delete system.managedItems;
  const service = buildService(system);
  const step = buildProgressiveStep([{ id: 'result-1', componentId: 'item-sword' }]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

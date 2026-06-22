/**
 * Unit tests for ResolutionModeService.validateRecipe (T-021)
 * Tests mode-specific validation logic for simple, routed (ingredientSet /
 * macroOutcome / rollTableOutcome), and progressive modes.
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
    components: [],
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
      { id: 'set-1', ingredientGroups: [] },
      { id: 'set-2', ingredientGroups: [] },
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
// AC 2 — Routed + ingredientSet: resultGroupId references must be valid
// (the former `mapped` reference-integrity contract, now canonical)
// ---------------------------------------------------------------------------

const INGREDIENT_SET = { provider: 'ingredientSet' };

test('routed ingredientSet — each set has resultGroupId matching a result group → valid', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [{ id: 'set-1', resultGroupId: 'rg-1', ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', results: [] }],
    resultSelection: INGREDIENT_SET,
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('routed ingredientSet — resultGroupId references non-existent group → invalid', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [{ id: 'set-1', resultGroupId: 'rg-does-not-exist', ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', results: [] }],
    resultSelection: INGREDIENT_SET,
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /invalid resultGroupId/i.test(e) || /resultGroupId/i.test(e)),
    `expected error about invalid resultGroupId, got: ${JSON.stringify(result.errors)}`
  );
});

test('routed ingredientSet — resultGroupId is null → valid (null is treated as unset, not an error)', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [{ id: 'set-1', resultGroupId: null, ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', results: [] }],
    resultSelection: INGREDIENT_SET,
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
});

test('routed ingredientSet — multiple sets with valid mappings → valid', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [
      { id: 'set-1', resultGroupId: 'rg-1', ingredientGroups: [] },
      { id: 'set-2', resultGroupId: 'rg-2', ingredientGroups: [] },
    ],
    resultGroups: [
      { id: 'rg-1', results: [] },
      { id: 'rg-2', results: [] },
    ],
    resultSelection: INGREDIENT_SET,
  });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('routed ingredientSet — zero ingredient sets → invalid', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const step = buildStep({ ingredientSets: [], resultSelection: INGREDIENT_SET });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('routed ingredientSet — zero result groups → invalid', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const step = buildStep({ resultGroups: [], resultSelection: INGREDIENT_SET });
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

// ---------------------------------------------------------------------------
// AC 3 — Routed mode: provider-dependent check requirement + reserved/duplicate
// ResultGroup.name rules under EVERY routed provider (the legacy tiered
// outcomeRouting validation is gone; its behavior is reproduced by migrated
// macroOutcome data).
// ---------------------------------------------------------------------------

/**
 * Build a routed system with crafting checks enabled (the macroOutcome contract).
 */
function buildRoutedCheckSystem(overrides = {}) {
  return buildSystem({
    resolutionMode: 'routed',
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
 * Build a routed step with two distinctly-named result groups and the given provider.
 */
function buildRoutedNamedStep(provider, overrides = {}) {
  return buildStep({
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
    resultGroups: [
      { id: 'rg-fine', name: 'Fine', results: [] },
      { id: 'rg-superb', name: 'Superb', results: [] },
    ],
    resultSelection: { provider },
    ...overrides,
  });
}

test('routed macroOutcome — checks enabled, distinct group names → valid', () => {
  const system = buildRoutedCheckSystem();
  const service = buildService(system);
  const recipe = buildRecipe([buildRoutedNamedStep('macroOutcome')]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true, result.errors.join(', '));
  assert.equal(result.errors.length, 0);
});

test('routed macroOutcome — crafting checks disabled → invalid (check required)', () => {
  const system = buildRoutedCheckSystem({
    craftingCheck: { enabled: false, macroUuid: null, outcomes: [], progressive: null },
  });
  const service = buildService(system);
  const recipe = buildRecipe([buildRoutedNamedStep('macroOutcome')]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /macroOutcome/i.test(e) || /check/i.test(e)),
    `expected error about macroOutcome requiring checks, got: ${JSON.stringify(result.errors)}`
  );
});

test('routed ingredientSet — check optional (no checks enabled still valid)', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const recipe = buildRecipe([buildRoutedNamedStep('ingredientSet')]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true, result.errors.join(', '));
});

test('routed rollTableOutcome — requires a roll table UUID', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const recipe = buildRecipe([buildRoutedNamedStep('rollTableOutcome')]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /roll table UUID/i.test(e)),
    `expected error about a missing roll table UUID, got: ${JSON.stringify(result.errors)}`
  );
});

test('routed rollTableOutcome — roll table UUID present → valid (check not required)', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const recipe = buildRecipe([
    buildRoutedNamedStep('rollTableOutcome', {
      resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'RollTable.x' },
    }),
  ]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true, result.errors.join(', '));
});

// Reserved-name + duplicate-name rules apply under EVERY routed provider.
for (const provider of ['ingredientSet', 'macroOutcome', 'rollTableOutcome']) {
  test(`routed ${provider} — reserved ResultGroup.name (hazard family) → invalid`, () => {
    const system = buildRoutedCheckSystem();
    const service = buildService(system);
    const recipe = buildRecipe([
      buildRoutedNamedStep(provider, {
        resultGroups: [
          { id: 'rg-ok', name: 'Fine', results: [] },
          { id: 'rg-bad', name: 'Hazard', results: [] },
        ],
        resultSelection:
          provider === 'rollTableOutcome'
            ? { provider, rollTableUuid: 'RollTable.x' }
            : { provider },
      }),
    ]);

    const result = service.validateRecipe(recipe);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => /reserved routing keyword/i.test(e)),
      `expected reserved-name error under ${provider}, got: ${JSON.stringify(result.errors)}`
    );
  });

  test(`routed ${provider} — duplicate ResultGroup.name (case-insensitive) → invalid`, () => {
    const system = buildRoutedCheckSystem();
    const service = buildService(system);
    const recipe = buildRecipe([
      buildRoutedNamedStep(provider, {
        resultGroups: [
          { id: 'rg-1', name: 'Fine', results: [] },
          { id: 'rg-2', name: 'fine', results: [] },
        ],
        resultSelection:
          provider === 'rollTableOutcome'
            ? { provider, rollTableUuid: 'RollTable.x' }
            : { provider },
      }),
    ]);

    const result = service.validateRecipe(recipe);

    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => /unique names/i.test(e) || /Duplicate result group name/i.test(e)),
      `expected duplicate-name error under ${provider}, got: ${JSON.stringify(result.errors)}`
    );
  });
}

// ---------------------------------------------------------------------------
// AC 4 — Progressive mode: checks enabled, progressive config, difficulty >= 1
// ---------------------------------------------------------------------------

/**
 * Build a system with progressive mode fully configured.
 * @param {object[]} components - items with id and difficulty fields
 * @param {object} overrides
 */
function buildProgressiveSystem(components = [], overrides = {}) {
  return buildSystem({
    resolutionMode: 'progressive',
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
    },
    components,
    ...overrides,
  });
}

/**
 * Build a valid progressive step with one result group containing the given results.
 */
function buildProgressiveStep(results = [], overrides = {}) {
  return buildStep({
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
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
    result.errors.some(
      (e) => /progressive.*check|check.*progressive|crafting check/i.test(e) || /check/i.test(e)
    ),
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
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
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

test('progressive mode — _getDifficulty reads difficulty from system.components', () => {
  const system = buildSystem({
    resolutionMode: 'progressive',
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
    },
    components: [{ id: 'item-sword', difficulty: 4 }],
  });
  const service = buildService(system);
  const step = buildProgressiveStep([{ id: 'result-1', componentId: 'item-sword' }]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

// ---------------------------------------------------------------------------
// Incomplete authoring shells — a not-yet-chosen provider is COMPLETENESS
// (waived under requireComplete:false so "Create recipe" can persist a shell),
// while an invalid provider VALUE is reference integrity and always errors.
// ---------------------------------------------------------------------------

test('routed mode — missing provider is waived when requireComplete is false (shell persists)', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  // The shape a freshly created shell has: no sets, no groups, no provider.
  const step = buildStep({ ingredientSets: [], resultGroups: [], resultSelection: null });
  const recipe = buildRecipe([step]);

  assert.equal(service.validateRecipe(recipe, { requireComplete: false }).valid, true);
});

test('routed mode — missing provider still errors under the strict default', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const recipe = buildRecipe([buildStep({ resultSelection: null })]);

  const result = service.validateRecipe(recipe);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /requires resultSelection\.provider/.test(e)),
    `expected the missing-provider error, got: ${JSON.stringify(result.errors)}`
  );
});

test('routed mode — an invalid provider VALUE errors even when requireComplete is false', () => {
  const system = buildSystem({ resolutionMode: 'routed' });
  const service = buildService(system);
  const recipe = buildRecipe([buildStep({ resultSelection: { provider: 'bogus' } })]);

  const result = service.validateRecipe(recipe, { requireComplete: false });
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /Invalid result selection provider/.test(e)),
    `expected the invalid-provider error, got: ${JSON.stringify(result.errors)}`
  );
});

test('alchemy mode — missing provider waived when incomplete, required under the strict default', () => {
  const system = buildSystem({ resolutionMode: 'alchemy' });
  const service = buildService(system);
  const recipe = buildRecipe([], { ingredientSets: [], resultGroups: [], resultSelection: null });

  assert.equal(service.validateRecipe(recipe, { requireComplete: false }).valid, true);
  const strict = service.validateRecipe(recipe);
  assert.equal(strict.valid, false);
  assert.ok(
    strict.errors.some((e) => /Alchemy recipe requires resultSelection\.provider/.test(e)),
    `expected the alchemy missing-provider error, got: ${JSON.stringify(strict.errors)}`
  );
});

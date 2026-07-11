/**
 * Unit tests for ResolutionModeService.validateRecipe (T-021)
 * Tests mode-specific validation logic for simple, routed (ingredientSet /
 * check), and progressive modes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

/**
 * Build a mock crafting system config.
 * A crafting check is "usable" only when its mode carries an authored roll formula
 * (e.g. `craftingCheck.progressive.rollFormula`); `enabled` is just the on/off toggle.
 */
function buildSystem(overrides = {}) {
  return {
    id: 'test-system',
    resolutionMode: 'simple',
    features: { multiStepRecipes: false, essences: false, craftingChecks: false },
    craftingCheck: {
      enabled: false,
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
// AC 2 — routedByIngredients: resultGroupId reference integrity (the former
// `mapped` reference-integrity contract, now a property of the mode). The routing
// basis is the MODE — there is no per-recipe provider to author.
// ---------------------------------------------------------------------------

test('routedByIngredients — each set has resultGroupId matching a result group → valid', () => {
  const system = buildSystem({ resolutionMode: 'routedByIngredients' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [{ id: 'set-1', resultGroupId: 'rg-1', ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });
  const result = service.validateRecipe(buildRecipe([step]));
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('routedByIngredients — resultGroupId references non-existent group → invalid', () => {
  const system = buildSystem({ resolutionMode: 'routedByIngredients' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [{ id: 'set-1', resultGroupId: 'rg-does-not-exist', ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });
  const result = service.validateRecipe(buildRecipe([step]));
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /resultGroupId/i.test(e)),
    `expected error about invalid resultGroupId, got: ${JSON.stringify(result.errors)}`
  );
});

test('routedByIngredients — resultGroupId is null → valid (null is treated as unset)', () => {
  const system = buildSystem({ resolutionMode: 'routedByIngredients' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [{ id: 'set-1', resultGroupId: null, ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });
  assert.equal(service.validateRecipe(buildRecipe([step])).valid, true);
});

test('routedByIngredients — zero ingredient sets → invalid', () => {
  const system = buildSystem({ resolutionMode: 'routedByIngredients' });
  const service = buildService(system);
  const result = service.validateRecipe(buildRecipe([buildStep({ ingredientSets: [] })]));
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('routedByIngredients — zero result groups → invalid', () => {
  const system = buildSystem({ resolutionMode: 'routedByIngredients' });
  const service = buildService(system);
  const result = service.validateRecipe(buildRecipe([buildStep({ resultGroups: [] })]));
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('routedByIngredients — check optional (no checks enabled still valid)', () => {
  const system = buildSystem({ resolutionMode: 'routedByIngredients' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
    resultGroups: [
      { id: 'rg-fine', name: 'Fine', results: [] },
      { id: 'rg-superb', name: 'Superb', results: [] },
    ],
  });
  assert.equal(service.validateRecipe(buildRecipe([step])).valid, true);
});

// ---------------------------------------------------------------------------
// AC 3 — routedByCheck: reserved/duplicate ResultGroup.name rules (check routing
// keys on the group name). A routedByCheck recipe is structurally valid regardless
// of the system check configuration; the missing-formula gap is a SYSTEM-level
// blocker surfaced by systemValidation, never a per-recipe error.
// ---------------------------------------------------------------------------

function buildRoutedCheckSystem(overrides = {}) {
  return buildSystem({
    resolutionMode: 'routedByCheck',
    craftingCheck: { enabled: true, outcomes: ['success', 'failure'], progressive: null },
    ...overrides,
  });
}

function buildRoutedNamedStep(overrides = {}) {
  return buildStep({
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
    resultGroups: [
      { id: 'rg-fine', name: 'Fine', results: [] },
      { id: 'rg-superb', name: 'Superb', results: [] },
    ],
    ...overrides,
  });
}

test('routedByCheck — distinct group names with a configured routed formula → valid', () => {
  const system = buildRoutedCheckSystem({ craftingCheck: { routed: { rollFormula: '1d20' } } });
  const service = buildService(system);
  const result = service.validateRecipe(buildRecipe([buildRoutedNamedStep()]));
  assert.equal(result.valid, true, result.errors.join(', '));
  assert.equal(result.errors.length, 0);
});

// A routedByCheck recipe is structurally valid regardless of the system's check
// configuration (the missing routed formula is a SYSTEM-level blocker, not a
// per-recipe error). Verify a complete save and a draft, with and without a formula.
for (const requireComplete of [true, false]) {
  test(`routedByCheck — valid WITH a system routed formula (requireComplete: ${requireComplete})`, () => {
    const system = buildRoutedCheckSystem({ craftingCheck: { routed: { rollFormula: '1d20' } } });
    const service = buildService(system);
    const result = service.validateRecipe(buildRecipe([buildRoutedNamedStep()]), { requireComplete });
    assert.equal(result.valid, true, result.errors.join(', '));
  });

  test(`routedByCheck — valid WITHOUT a system routed formula (requireComplete: ${requireComplete})`, () => {
    const system = buildSystem({
      resolutionMode: 'routedByCheck',
      craftingCheck: { enabled: false, outcomes: [], routed: { rollFormula: '' } },
    });
    const service = buildService(system);
    const result = service.validateRecipe(buildRecipe([buildRoutedNamedStep()]), { requireComplete });
    assert.equal(
      result.valid,
      true,
      `an unconfigured routed check is a system-level concern, not a per-recipe error: ${result.errors.join(', ')}`
    );
  });
}

// Reserved-name + duplicate-name rules apply under routedByCheck (check routing
// keys on the group name).
function validateRoutedCheckNamedGroups(resultGroups) {
  const service = buildService(buildRoutedCheckSystem());
  return service.validateRecipe(buildRecipe([buildRoutedNamedStep({ resultGroups })]));
}

test('routedByCheck — reserved ResultGroup.name (hazard family) → invalid', () => {
  const result = validateRoutedCheckNamedGroups([
    { id: 'rg-ok', name: 'Fine', results: [] },
    { id: 'rg-bad', name: 'Hazard', results: [] },
  ]);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /reserved routing keyword/i.test(e)),
    `expected reserved-name error, got: ${JSON.stringify(result.errors)}`
  );
});

test('routedByCheck — duplicate ResultGroup.name (case-insensitive) → invalid', () => {
  const result = validateRoutedCheckNamedGroups([
    { id: 'rg-1', name: 'Fine', results: [] },
    { id: 'rg-2', name: 'fine', results: [] },
  ]);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /unique names/i.test(e) || /Duplicate result group name/i.test(e)),
    `expected duplicate-name error, got: ${JSON.stringify(result.errors)}`
  );
});

// routedByIngredients keys on the resultGroupId, NOT the group name, so reserved/
// duplicate names are not a routedByIngredients concern (no name validation fires).
test('routedByIngredients — reserved/duplicate group names are not a per-recipe error', () => {
  const system = buildSystem({ resolutionMode: 'routedByIngredients' });
  const service = buildService(system);
  const step = buildStep({
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
    resultGroups: [
      { id: 'rg-1', name: 'Fine', results: [] },
      { id: 'rg-2', name: 'fine', results: [] },
    ],
  });
  assert.equal(service.validateRecipe(buildRecipe([step])).valid, true);
});

// ---------------------------------------------------------------------------
// AC 4 — Progressive mode: an authored progressive roll formula, progressive
// config, difficulty >= 1
// ---------------------------------------------------------------------------

/**
 * Build a system with progressive mode fully configured. A progressive check is
 * "usable" only when it carries an authored `progressive.rollFormula`.
 * @param {object[]} components - items with id and difficulty fields
 * @param {object} overrides
 */
function buildProgressiveSystem(components = [], overrides = {}) {
  return buildSystem({
    resolutionMode: 'progressive',
    craftingCheck: {
      enabled: true,
      outcomes: [],
      progressive: { awardMode: 'equal', rollFormula: '1d20' },
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

test('progressive mode — authored progressive formula, progressive config, difficulty >= 1 → valid', () => {
  const system = buildProgressiveSystem([{ id: 'item-potion', difficulty: 3 }]);
  const service = buildService(system);
  const step = buildProgressiveStep([{ id: 'result-1', componentId: 'item-potion' }]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('progressive mode — no progressive roll formula → invalid', () => {
  const system = buildProgressiveSystem([], {
    craftingCheck: {
      enabled: true,
      outcomes: [],
      progressive: { awardMode: 'equal', rollFormula: '' },
    },
  });
  const service = buildService(system);
  const step = buildProgressiveStep([]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /progressive.*roll formula|roll formula.*progressive/i.test(e)),
    `expected error about the missing progressive roll formula, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — missing progressive config → invalid', () => {
  const system = buildProgressiveSystem([], {
    craftingCheck: {
      enabled: true,
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

test('progressive mode — draft (requireComplete: false) with no progressive formula → valid', () => {
  // Drafting a recipe in a progressive system that has not yet authored its progressive
  // roll formula must succeed: that gap is a SYSTEM-level concern (systemValidation's
  // `progressiveNoCheck`), not a per-recipe drafting error. It is still enforced when a
  // complete recipe is required (see the two strict-mode tests above).
  const system = buildProgressiveSystem([], {
    craftingCheck: {
      enabled: false,
      outcomes: [],
      progressive: null,
    },
  });
  const service = buildService(system);
  const step = buildProgressiveStep([]);
  const recipe = buildRecipe([step]);

  const result = service.validateRecipe(recipe, { requireComplete: false });

  assert.equal(
    result.valid,
    true,
    `expected draft to be valid, got: ${JSON.stringify(result.errors)}`
  );
  assert.equal(result.errors.length, 0);
});

// Validate a progressive recipe whose single result references one component with
// the given id/difficulty.
function validateProgressiveDifficulty(itemId, difficulty) {
  const system = buildProgressiveSystem([{ id: itemId, difficulty }]);
  const service = buildService(system);
  const step = buildProgressiveStep([{ id: 'result-1', componentId: itemId }]);
  return service.validateRecipe(buildRecipe([step]));
}

test('progressive mode — difficulty < 1 on a result → invalid', () => {
  const result = validateProgressiveDifficulty('item-herb', 0.5);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /difficulty|system item|component/i.test(e)),
    `expected error about invalid difficulty, got: ${JSON.stringify(result.errors)}`
  );
});

test('progressive mode — difficulty = 0 → invalid', () => {
  const result = validateProgressiveDifficulty('item-zero', 0);

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
      outcomes: [],
      progressive: { awardMode: 'equal', rollFormula: '1d20' },
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
// Incomplete authoring shells — the routed modes derive their basis from the
// system mode and carry no per-recipe provider, so there is no missing/invalid
// provider to author: a routed shell waives only its completeness (cardinality).
// ---------------------------------------------------------------------------

for (const mode of ['routedByIngredients', 'routedByCheck']) {
  test(`${mode} — an empty shell is waived when requireComplete is false`, () => {
    const system = buildSystem({ resolutionMode: mode });
    const service = buildService(system);
    const step = buildStep({ ingredientSets: [], resultGroups: [], resultSelection: null });
    assert.equal(service.validateRecipe(buildRecipe([step]), { requireComplete: false }).valid, true);
  });

  test(`${mode} — an empty shell still fails the cardinality check under the strict default`, () => {
    const system = buildSystem({ resolutionMode: mode });
    const service = buildService(system);
    const result = service.validateRecipe(buildRecipe([buildStep({ ingredientSets: [], resultGroups: [] })]));
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
  });

  test(`${mode} — a stray resultSelection.provider is ignored (mode drives routing)`, () => {
    const system = buildSystem({ resolutionMode: mode });
    const service = buildService(system);
    // A leftover provider on the recipe must not produce a per-recipe error: the
    // routed modes never read resultSelection.
    const step = buildStep({
      ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
      resultGroups: [{ id: 'rg-1', name: 'Only', results: [] }],
      resultSelection: { provider: 'bogus' },
    });
    assert.equal(service.validateRecipe(buildRecipe([step])).valid, true);
  });
}

test('alchemy mode — completeness (sets/groups) waived when incomplete, required under the strict default', () => {
  const system = buildSystem({ resolutionMode: 'alchemy' });
  const service = buildService(system);
  const recipe = buildRecipe([], { ingredientSets: [], resultGroups: [] });

  assert.equal(service.validateRecipe(recipe, { requireComplete: false }).valid, true);
  const strict = service.validateRecipe(recipe);
  assert.equal(strict.valid, false);
  assert.ok(
    strict.errors.some((e) => /at least 1 ingredient set/.test(e)),
    `expected an alchemy completeness error, got: ${JSON.stringify(strict.errors)}`
  );
});

// ---------------------------------------------------------------------------
// Alchemy mode — the simple/routed/progressive step-level loop NEVER runs for
// alchemy (issue 88 / T-268). Every step-loop block is mode-gated, so alchemy
// is validated only by its own top-level checks (>=1 set, >=1 group, no explicit
// steps, provider VALUE). These tests guard against the per-step cardinality
// checks leaking onto alchemy if a step ever materializes.
// ---------------------------------------------------------------------------

// Matches the spurious step-loop cardinality messages that must never appear for
// an alchemy recipe ("...in simple/routed/progressive mode", "ordered results").
const STEP_LOOP_CARDINALITY =
  /in (simple|routedByIngredients|routedByCheck|progressive) mode|requires ordered results/i;

test('alchemy mode — an implicit step carrying multiple sets/groups is NOT subjected to step-level cardinality checks', () => {
  const system = buildSystem({ resolutionMode: 'alchemy' });
  const service = buildService(system);
  // The implicit step (id 'implicit-step') carries 2 sets + 2 groups — counts that
  // would trip the simple ("exactly 1") and progressive cardinality rules if the
  // step loop ran for alchemy. Top-level recipe data satisfies alchemy's own checks.
  const implicitStep = buildStep({
    id: 'implicit-step',
    ingredientSets: [
      { id: 'set-1', ingredientGroups: [] },
      { id: 'set-2', ingredientGroups: [] },
    ],
    resultGroups: [
      { id: 'rg-1', results: [] },
      { id: 'rg-2', results: [] },
    ],
  });
  const recipe = buildRecipe([implicitStep], {
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', results: [] }],
    resultSelection: { provider: 'ingredientSet' },
  });

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true, result.errors.join(', '));
  assert.ok(
    !result.errors.some((e) => STEP_LOOP_CARDINALITY.test(e)),
    `alchemy must not emit step-level cardinality errors, got: ${JSON.stringify(result.errors)}`
  );
});

test('alchemy mode — multiple top-level ingredient sets are INVALID (alchemy requires exactly 1 set)', () => {
  const system = buildSystem({ resolutionMode: 'alchemy' });
  const service = buildService(system);
  const recipe = buildRecipe([], {
    ingredientSets: [
      { id: 'set-1', ingredientGroups: [] },
      { id: 'set-2', ingredientGroups: [] },
    ],
    resultGroups: [{ id: 'rg-1', results: [] }],
  });

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /exactly 1 ingredient set/i.test(e)),
    `expected the exactly-1-set error, got: ${JSON.stringify(result.errors)}`
  );
});

test('alchemy mode — explicit (non-implicit) steps fail alchemy own check, not the step loop', () => {
  const system = buildSystem({ resolutionMode: 'alchemy' });
  const service = buildService(system);
  // A real (non-implicit) step whose cardinality would trip the simple-mode rule.
  const explicitStep = buildStep({ id: 'step-1', ingredientSets: [], resultGroups: [] });
  const recipe = buildRecipe([explicitStep], {
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', results: [] }],
    resultSelection: { provider: 'ingredientSet' },
  });

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((e) => /Alchemy recipe must not have explicit steps/.test(e)),
    `expected the alchemy explicit-steps error, got: ${JSON.stringify(result.errors)}`
  );
  assert.ok(
    !result.errors.some((e) => STEP_LOOP_CARDINALITY.test(e)),
    `alchemy must not emit step-level cardinality errors, got: ${JSON.stringify(result.errors)}`
  );
});

test('alchemy mode — a leftover resultSelection.provider is IGNORED (the provider is retired)', () => {
  const system = buildSystem({ resolutionMode: 'alchemy' });
  const service = buildService(system);
  // A stray legacy provider value no longer produces any error — routing is driven
  // by the system-level alchemy.checkMode, not the retired per-recipe provider.
  const recipe = buildRecipe([], {
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', results: [] }],
    resultSelection: { provider: 'bogus' },
  });

  const result = service.validateRecipe(recipe);

  assert.equal(result.valid, true, result.errors.join(', '));
  assert.ok(
    !result.errors.some((e) => /provider/i.test(e)),
    `no provider error expected, got: ${JSON.stringify(result.errors)}`
  );
});

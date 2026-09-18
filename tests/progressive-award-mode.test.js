/**
 * Unit tests for ResolutionModeService.resolveResultGroups — progressive award mode (T-022)
 * Tests equal, exceed, and partial award semantics, plus edge cases.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { ResolutionModeService } = await import('../src/systems/ResolutionModeService.js');

/** A mock crafting system config with progressive-mode defaults. */
function buildSystem(overrides = {}) {
  return {
    id: 'test-system',
    resolutionMode: 'progressive',
    features: { multiStepRecipes: false, essences: false, craftingChecks: true },
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode: 'equal' },
    },
    components: [],
    ...overrides,
  };
}

/** A progressive system over `{ id, difficulty }` components under one `awardMode`. */
function buildProgressiveSystem(components = [], awardMode = 'equal', overrides = {}) {
  return buildSystem({
    components,
    craftingCheck: {
      enabled: true,
      macroUuid: null,
      outcomes: [],
      progressive: { awardMode },
    },
    ...overrides,
  });
}

/** A ResolutionModeService whose craftingSystemManager resolves the given system. */
function buildService(system) {
  const craftingSystemManager = {
    getSystem: (id) => (system && id === system.id ? system : null),
  };
  return new ResolutionModeService(craftingSystemManager);
}

/** A minimal result; `componentId` is what the difficulty lookup keys on. */
function makeResult(id, componentId) {
  return { id, componentId };
}

/** A step with a single result group holding the given results. */
function buildStep(results = [], overrides = {}) {
  return {
    id: 'step-1',
    name: 'Step One',
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
    resultGroups: [{ id: 'rg-1', results }],
    ...overrides,
  };
}

/** A minimal recipe referencing the default test system. */
function buildRecipe(overrides = {}) {
  return {
    id: 'test-recipe',
    craftingSystemId: 'test-system',
    ...overrides,
  };
}

/** A checkResult carrying the numeric budget. */
function buildCheckResult(value) {
  return { value };
}

// ---------------------------------------------------------------------------
// AC 1 — equal mode: awards when remaining >= cost, stops when remaining < cost
// ---------------------------------------------------------------------------

test('equal mode — budget exactly matches difficulty → result awarded, remaining = 0', () => {
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 3 }], 'equal');
  const service = buildService(system);
  const step = buildStep([makeResult('result-A', 'item-A')]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(3),
  });

  assert.equal(result.groups[0].results.length, 1);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A']);
  assert.equal(result.meta.remaining, 0);
});

test('equal mode — budget covers first result but not second → first awarded, second not', () => {
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 3 }, { id: 'item-B', difficulty: 5 }],
    'equal'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-B'),
  ]);
  const recipe = buildRecipe();

  // After awarding A (cost 3), remaining = 6 - 3 = 3. 3 < 5, so B not awarded.
  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(6),
  });

  assert.equal(result.groups[0].results.length, 1);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A']);
  assert.equal(result.meta.remaining, 3);
});

test('equal mode — budget covers both results → both awarded', () => {
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 2 }, { id: 'item-B', difficulty: 3 }],
    'equal'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-B'),
  ]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(5),
  });

  assert.equal(result.groups[0].results.length, 2);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A', 'result-B']);
  assert.equal(result.meta.remaining, 0);
});

test('equal mode — budget less than first result difficulty → none awarded', () => {
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 5 }], 'equal');
  const service = buildService(system);
  const step = buildStep([makeResult('result-A', 'item-A')]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(4),
  });

  assert.equal(result.groups[0].results.length, 0);
  assert.deepEqual(result.meta.awardedResultIds, []);
  assert.equal(result.meta.remaining, 4);
});

test('equal mode — budget exactly covers multiple results sequentially → all awarded, remaining = 0', () => {
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 1 }, { id: 'item-B', difficulty: 2 }, { id: 'item-C', difficulty: 3 }],
    'equal'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-B'),
    makeResult('result-C', 'item-C'),
  ]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(6),
  });

  assert.equal(result.groups[0].results.length, 3);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A', 'result-B', 'result-C']);
  assert.equal(result.meta.remaining, 0);
});

// ---------------------------------------------------------------------------
// AC 2 — exceed mode: awards when remaining > cost (strict inequality)
// ---------------------------------------------------------------------------

test('exceed mode — budget greater than difficulty → result awarded', () => {
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 3 }], 'exceed');
  const service = buildService(system);
  const step = buildStep([makeResult('result-A', 'item-A')]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(4),
  });

  assert.equal(result.groups[0].results.length, 1);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A']);
  assert.equal(result.meta.remaining, 1);
});

test('exceed mode — budget exactly equals difficulty → NOT awarded (strict > required)', () => {
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 3 }], 'exceed');
  const service = buildService(system);
  const step = buildStep([makeResult('result-A', 'item-A')]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(3),
  });

  assert.equal(result.groups[0].results.length, 0);
  assert.deepEqual(result.meta.awardedResultIds, []);
  assert.equal(result.meta.remaining, 3);
});

test('exceed mode — budget strictly exceeds first, equals second → first awarded only', () => {
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 2 }, { id: 'item-B', difficulty: 5 }],
    'exceed'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-B'),
  ]);
  const recipe = buildRecipe();

  // value = 7. After A (cost 2): remaining = 5. 5 > 5 is false. B not awarded.
  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(7),
  });

  assert.equal(result.groups[0].results.length, 1);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A']);
  assert.equal(result.meta.remaining, 5);
});

test('exceed mode — budget less than difficulty → none awarded', () => {
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 3 }], 'exceed');
  const service = buildService(system);
  const step = buildStep([makeResult('result-A', 'item-A')]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(2),
  });

  assert.equal(result.groups[0].results.length, 0);
  assert.deepEqual(result.meta.awardedResultIds, []);
  assert.equal(result.meta.remaining, 2);
});

test('exceed mode — budget strictly exceeds all results → all awarded', () => {
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 2 }, { id: 'item-B', difficulty: 3 }],
    'exceed'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-B'),
  ]);
  const recipe = buildRecipe();

  // value = 10. After A (cost 2): remaining = 8. 8 > 3 = true. After B (cost 3): remaining = 5.
  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(10),
  });

  assert.equal(result.groups[0].results.length, 2);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A', 'result-B']);
  assert.equal(result.meta.remaining, 5);
});

// ---------------------------------------------------------------------------
// AC 3 — partial mode: awards partial credit on last result, then stops
// ---------------------------------------------------------------------------

test('partial mode — budget >= difficulty → full result awarded', () => {
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 3 }], 'partial');
  const service = buildService(system);
  const step = buildStep([makeResult('result-A', 'item-A')]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(5),
  });

  assert.equal(result.groups[0].results.length, 1);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A']);
  assert.equal(result.meta.remaining, 2);
});

test('partial mode — 0 < budget < difficulty → partial credit awarded, remaining = 0', () => {
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 5 }], 'partial');
  const service = buildService(system);
  const step = buildStep([makeResult('result-A', 'item-A')]);
  const recipe = buildRecipe();

  // budget = 2 < cost = 5, but 2 > 0, so partial credit: result awarded, remaining = 0
  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(2),
  });

  assert.equal(result.groups[0].results.length, 1);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A']);
  assert.equal(result.meta.remaining, 0);
});

test('partial mode — partial on first result stops processing of subsequent results', () => {
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 5 }, { id: 'item-B', difficulty: 2 }],
    'partial'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-B'),
  ]);
  const recipe = buildRecipe();

  // budget = 3 < cost(A) = 5, so A gets partial, remaining = 0, B not reached
  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(3),
  });

  assert.equal(result.groups[0].results.length, 1);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A']);
  assert.equal(result.meta.remaining, 0);
});

test('partial mode — full award on first, then partial on second', () => {
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 3 }, { id: 'item-B', difficulty: 5 }],
    'partial'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-B'),
  ]);
  const recipe = buildRecipe();

  // budget = 5. A costs 3: remaining = 2. 2 < 5 but > 0: B gets partial, remaining = 0.
  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(5),
  });

  assert.equal(result.groups[0].results.length, 2);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A', 'result-B']);
  assert.equal(result.meta.remaining, 0);
});

test('partial mode — remaining exactly matches difficulty → full award, no partial needed', () => {
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 3 }, { id: 'item-B', difficulty: 2 }],
    'partial'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-B'),
  ]);
  const recipe = buildRecipe();

  // budget = 3. A costs 3: awarded fully, remaining = 0. 0 is not > 0: B not awarded (no partial).
  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(3),
  });

  assert.equal(result.groups[0].results.length, 1);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A']);
  assert.equal(result.meta.remaining, 0);
});

// ---------------------------------------------------------------------------
// AC 4 — Edge cases
// ---------------------------------------------------------------------------

test('edge case — zero check value → no results awarded in equal mode', () => {
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 1 }], 'equal');
  const service = buildService(system);
  const step = buildStep([makeResult('result-A', 'item-A')]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(0),
  });

  assert.equal(result.groups[0].results.length, 0);
  assert.deepEqual(result.meta.awardedResultIds, []);
  assert.equal(result.meta.remaining, 0);
});

test('edge case — single result awarded → meta shows correct remaining', () => {
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 1 }], 'equal');
  const service = buildService(system);
  const step = buildStep([makeResult('result-A', 'item-A')]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(1),
  });

  assert.equal(result.groups[0].results.length, 1);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A']);
  assert.equal(result.meta.remaining, 0);
});

test('edge case — all results awarded with leftover budget → remaining > 0', () => {
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 1 }, { id: 'item-B', difficulty: 2 }],
    'equal'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-B'),
  ]);
  const recipe = buildRecipe();

  // budget = 10. A costs 1, B costs 2. All awarded. remaining = 7.
  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(10),
  });

  assert.equal(result.groups[0].results.length, 2);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A', 'result-B']);
  assert.equal(result.meta.remaining, 7);
});

test('edge case — no result groups → returns empty groups and zero remaining', () => {
  const system = buildProgressiveSystem([], 'equal');
  const service = buildService(system);
  // Step with no resultGroups (empty array), so allGroups falls back to recipe.resultGroups
  const step = {
    id: 'step-1',
    name: 'Step One',
    ingredientSets: [{ id: 'set-1', ingredientGroups: [] }],
    resultGroups: [],
  };
  // Recipe also has no resultGroups, so allGroups will be []
  const recipe = buildRecipe({ resultGroups: [] });

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(10),
  });

  assert.deepEqual(result.groups, []);
  assert.deepEqual(result.meta.awardedResultIds, []);
  assert.equal(result.meta.remaining, 0);
});

test('edge case — a MAX_SAFE_INTEGER value (a forced-success crit) awards every result', () => {
  // A progressive check's success crit forces value = Number.MAX_SAFE_INTEGER to
  // mean "award everything"; the budget loop awards every result regardless of
  // difficulty. Uses 'exceed' (the strictest mode) to prove the sentinel covers all.
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 100 }, { id: 'item-B', difficulty: 9999 }],
    'exceed'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-B'),
  ]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(Number.MAX_SAFE_INTEGER),
  });

  assert.equal(result.groups[0].results.length, 2, 'every result is awarded');
  assert.deepEqual(result.meta.awardedResultIds, ['result-A', 'result-B']);
});

test('edge case — result with missing componentId is skipped, valid results still awarded', () => {
  // Results with invalid difficulty (no matching managedItem) are skipped via `continue` (not `break`),
  // so subsequent valid results can still be awarded.
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 2 }, { id: 'item-C', difficulty: 3 }],
    'equal'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A', 'item-A'),
    makeResult('result-B', 'item-UNKNOWN'), // no matching managedItem → skipped via continue
    makeResult('result-C', 'item-C'),
  ]);
  const recipe = buildRecipe();

  // budget = 5. A (cost 2): awarded, remaining = 3. B: skipped (invalid). C (cost 3): awarded, remaining = 0.
  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(5),
  });

  assert.equal(result.groups[0].results.length, 2);
  assert.deepEqual(result.meta.awardedResultIds, ['result-A', 'result-C']);
  assert.equal(result.meta.remaining, 0);
});

// ---------------------------------------------------------------------------
// Quantity-less awards — progressive results grant one item per ordered entry
// ---------------------------------------------------------------------------

test('awarded results are forced to quantity 1, ignoring any legacy authored quantity', () => {
  // A recipe authored before the editor dropped the quantity field may still carry
  // quantity > 1 on a progressive result. Each entry must grant a single item.
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 2 }], 'equal');
  const service = buildService(system);
  const step = buildStep([{ id: 'result-A', componentId: 'item-A', quantity: 3 }]);
  const recipe = buildRecipe();

  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(2),
  });

  assert.equal(result.groups[0].results.length, 1);
  assert.equal(result.groups[0].results[0].quantity, 1, 'the legacy quantity is normalized to 1');
  assert.equal(result.groups[0].results[0].componentId, 'item-A', 'the component reference survives');
});

test('duplicate components award in order as separate quantity-1 entries', () => {
  // The GM expresses "two of item-A" by listing it twice; each costs the same
  // difficulty and is awarded as its own single-item entry, in order.
  const system = buildProgressiveSystem(
    [{ id: 'item-A', difficulty: 2 }, { id: 'item-B', difficulty: 3 }],
    'equal'
  );
  const service = buildService(system);
  const step = buildStep([
    makeResult('result-A1', 'item-A'),
    makeResult('result-B', 'item-B'),
    makeResult('result-A2', 'item-A'),
  ]);
  const recipe = buildRecipe();

  // budget = 7. A1 (2) → 5, B (3) → 2, A2 (2) → 0. All three awarded in order.
  const result = service.resolveResultGroups({
    recipe,
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(7),
  });

  assert.deepEqual(
    result.groups[0].results.map((r) => r.componentId),
    ['item-A', 'item-B', 'item-A'],
    'duplicate entries are awarded in their authored order'
  );
  assert.deepEqual(result.meta.awardedResultIds, ['result-A1', 'result-B', 'result-A2']);
  assert.ok(
    result.groups[0].results.every((r) => r.quantity === 1),
    'every awarded entry grants a single item'
  );
});

test('1645: a progressive stage drops its quantityFormula with its quantity', () => {
  const system = buildProgressiveSystem([{ id: 'item-A', difficulty: 3 }], 'equal');
  const step = buildStep([{ ...makeResult('result-A', 'item-A'), quantity: 9, quantityFormula: '1d4+1' }]);

  const result = buildService(system).resolveResultGroups({
    recipe: buildRecipe(),
    step,
    ingredientSet: null,
    checkResult: buildCheckResult(3),
  });

  const [awarded] = result.groups[0].results;
  assert.equal(awarded.quantity, 1, 'a stage awards exactly one');
  assert.equal(awarded.quantityFormula, null, 'so the rolled amount never reaches the resolver');
});

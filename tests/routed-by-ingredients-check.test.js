// Engine integration tests for the `routedByIngredients` crafting check
// (CraftingEngine._runPassFailCheck via the _runCraftingCheck routed dispatch).
//
// `routedByIngredients` routes result groups by the chosen ingredient set, NOT by
// check outcome tiers, so its check is a plain pass/fail gate against the DC —
// tiers are typically unconfigured. Regression guard: before the dispatch split,
// this mode ran through the tier evaluator (`runFormulaRouted`), which fails every
// roll when no tiers exist, so even a natural 20 failed a DC 12 check. These tests
// pin the pass/fail behaviour and prove the tier-routing path is NOT used here.
import test from 'node:test';
import assert from 'node:assert/strict';

const {
  installRoutedCheckEnv,
  stubRoll,
  evaluateArgs,
  clearRollEngine,
  defaultRouted,
  makeRoutedEngine,
  runRoutedCheck,
} = await import('./helpers/routedCheckEngine.js');

installRoutedCheckEnv();

// A unified trigger forcing `outcome` when the rolled group total equals `value`.
function totalTrigger({ id = 't', groupId = 0, value, outcome = 'none' }) {
  return {
    id,
    condition: { type: 'diceGroup', groupId, aggregate: 'total', operator: '==', value },
    outcome,
    breakTools: false,
  };
}

function ingredientsEngine(overrides = {}) {
  return makeRoutedEngine({
    resolutionMode: 'routedByIngredients',
    routed: defaultRouted({ rollFormula: '1d20', dc: 12, relativeOutcomes: [], fixedOutcomes: [], ...overrides }),
  });
}

// ── Core regression: a high roll passes with NO tiers configured ──────────────

test('routedByIngredients: a natural 20 (total 24) PASSES a DC 12 check with no tiers', async () => {
  const { engine } = ingredientsEngine();
  stubRoll(24, [{ number: 1, faces: 20, total: 24 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, true, '24 >= 12 must pass even with no outcome tiers');
  assert.equal(r.outcome, 'pass');
  assert.equal(r.value, 24);
  assert.equal(r.data.dc, 12);
});

test('routedByIngredients: a roll below the DC fails', async () => {
  const { engine } = ingredientsEngine();
  stubRoll(8, [{ number: 1, faces: 20, total: 8 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, false);
  assert.equal(r.outcome, 'fail');
  assert.equal(r.value, 8);
});

test('routedByIngredients: meet mode passes on an exact-DC roll', async () => {
  const { engine } = ingredientsEngine();
  stubRoll(12, [{ number: 1, faces: 20, total: 12 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, true, '12 >= 12 (meet)');
  assert.equal(r.data.comparison, 'meet');
});

// ── Threshold mode ────────────────────────────────────────────────────────────

test('routedByIngredients exceed: an exact-DC roll does NOT pass', async () => {
  const { engine } = ingredientsEngine({ thresholdMode: 'exceed' });
  stubRoll(12, [{ number: 1, faces: 20, total: 12 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, false, '12 is not > 12 (exceed)');
  assert.equal(r.data.comparison, 'exceed');
});

test('routedByIngredients exceed: a roll above the DC passes', async () => {
  const { engine } = ingredientsEngine({ thresholdMode: 'exceed' });
  stubRoll(13, [{ number: 1, faces: 20, total: 13 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, true, '13 > 12 (exceed)');
});

// ── engineEvaluated + non-interactive contract ────────────────────────────────

test('routedByIngredients: the result is tagged engineEvaluated', async () => {
  const { engine } = ingredientsEngine();
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.engineEvaluated, true);
});

test('routedByIngredients: the roll evaluates with { allowInteractive: false }', async () => {
  const { engine } = ingredientsEngine();
  stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
  await runRoutedCheck(engine);
  assert.deepEqual(evaluateArgs.at(-1), { allowInteractive: false });
});

// ── Forced-outcome triggers are still honoured on the pass/fail path ──────────

test('routedByIngredients: a forced-failure trigger overrides a passing roll', async () => {
  const { engine } = ingredientsEngine({
    checkBreakage: { triggers: [totalTrigger({ id: 'c-fail', value: 20, outcome: 'failure' })] },
  });
  stubRoll(20, [{ number: 1, faces: 20, total: 20 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, false, '20 >= 12 would pass, but the failure trigger forces a fail');
  assert.equal(r.outcome, 'fail');
});

test('routedByIngredients: a forced-success trigger overrides a failing roll', async () => {
  const { engine } = ingredientsEngine({
    checkBreakage: { triggers: [totalTrigger({ id: 'c-win', value: 5, outcome: 'success' })] },
  });
  stubRoll(5, [{ number: 1, faces: 20, total: 5 }]);
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, true, '5 < 12 would fail, but the success trigger forces a pass');
  assert.equal(r.outcome, 'pass');
});

// ── DC resolution flows through _resolveSimpleCheckDc over the routed config ───

test('routedByIngredients: a recipe tier shifts the DC (not the flat routed.dc)', async () => {
  const { engine } = ingredientsEngine({ dc: 12, tiers: [{ id: 'tier-hard', name: 'Hard', dc: 18 }] });
  stubRoll(17, [{ number: 1, faces: 20, total: 17 }]);
  const r = await runRoutedCheck(engine, { craftingSystemId: 'sys-1', checkTierId: 'tier-hard' });
  assert.equal(r.data.dc, 18, 'resolves the recipe tier DC, not the flat routed.dc');
  assert.equal(r.success, false, '17 < 18');
});

test('routedByIngredients: meeting the recipe-tier DC passes', async () => {
  const { engine } = ingredientsEngine({ dc: 12, tiers: [{ id: 'tier-hard', name: 'Hard', dc: 18 }] });
  stubRoll(18, [{ number: 1, faces: 20, total: 18 }]);
  const r = await runRoutedCheck(engine, { craftingSystemId: 'sys-1', checkTierId: 'tier-hard' });
  assert.equal(r.success, true, '18 >= 18');
});

// ── Optional (not loud) when no formula is configured ─────────────────────────

test('routedByIngredients with no rollFormula is an optional no-op success (not a loud failure)', async () => {
  const { engine } = makeRoutedEngine({
    resolutionMode: 'routedByIngredients',
    routed: defaultRouted({ rollFormula: '' }),
  });
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, true, 'the optional ingredient-routed check with no formula does not block');
  assert.equal(r.outcome, null);
});

// ── Headless (no dice engine) ─────────────────────────────────────────────────

test('routedByIngredients: no Roll engine does not block the craft', async () => {
  const { engine } = ingredientsEngine();
  clearRollEngine();
  const r = await runRoutedCheck(engine);
  assert.equal(r.success, true);
  assert.equal(r.outcome, 'pass');
});

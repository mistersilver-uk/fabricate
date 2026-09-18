// Shared fixtures for the routed tier-STEP runtime (issue 975), consumed by
// `tests/check-roll-tier-step.test.js`.

import test from 'node:test';
import assert from 'node:assert/strict';

import { runFormulaRouted } from '../../src/systems/checkRoll.js';

import { stubRoll } from './routedCheckEngine.js';

export { stubRoll };

/**
 * One five-tier ladder serving BOTH routed types: every tier carries a relative `dc` delta AND a
 * fixed `[start, end]` range, which is not a fixture convenience but the shape
 * `_normalizeRoutedOutcome` actually persists — it keeps both operands across a `type` switch so
 * switching modes in the editor destroys neither.
 */
export const TIER_LADDER = Object.freeze([
  Object.freeze({
    id: 'ruined',
    name: 'Ruined',
    success: false,
    breakTools: true,
    dc: -10,
    start: 1,
    end: 4,
  }),
  Object.freeze({
    id: 'poor',
    name: 'Poor',
    success: false,
    breakTools: false,
    dc: -5,
    start: 5,
    end: 8,
  }),
  Object.freeze({
    id: 'fair',
    name: 'Fair',
    success: true,
    breakTools: false,
    dc: 0,
    start: 9,
    end: 12,
  }),
  Object.freeze({
    id: 'good',
    name: 'Good',
    success: true,
    breakTools: false,
    dc: 5,
    start: 14,
    end: 16,
  }),
  Object.freeze({
    id: 'superb',
    name: 'Superb',
    success: true,
    breakTools: false,
    dc: 10,
    start: 17,
    end: 20,
  }),
]);

/** A condition that matches any roll this suite performs, so a case that is not
 * ABOUT condition matching need not restate one. */
export const ALWAYS = Object.freeze({
  type: 'rollTotal',
  operator: '>=',
  value: Number.MIN_SAFE_INTEGER,
});

/** A condition matching a `1d20` group showing exactly `face`, mirroring the pair
 * `_convertNatSteppingToTriggers` synthesises for a migrated `natStepping`. */
export function d20FaceCondition(face, groupId = 0) {
  return { type: 'diceGroup', groupId, aggregate: 'allDice', operator: '==', value: face };
}

/**
 * A normalized unified trigger carrying only a `tierStep` effect — the shape lane A1's
 * `_normalizeUnifiedTrigger` emits, with `outcome: 'none'` and `breakTools: false` written
 * explicitly.
 */
export function tierStepTrigger({ id, mode, steps = 1, tierId = null, condition = ALWAYS } = {}) {
  return {
    id: id ?? `step-${mode}-${steps}${tierId === null ? '' : `-${tierId}`}`,
    condition,
    outcome: 'none',
    breakTools: false,
    tierStep: { mode, steps, tierId },
  };
}

/** A trigger that FORCES a disposition on a `rollTotal` match, so a case can compose
 * forcing with stepping without restating the condition DSL. */
export function forcingTrigger(outcome, { id = `force-${outcome}`, value = 0 } = {}) {
  return {
    id,
    condition: { type: 'rollTotal', operator: '>=', value },
    outcome,
    breakTools: false,
    tierStep: { mode: 'none', steps: 1, tierId: null },
  };
}

const ROUTED_DEFAULTS = Object.freeze({
  formula: '1d20',
  dc: 10,
  thresholdMode: 'meet',
  type: 'relative',
  relativeOutcomes: TIER_LADDER,
  fixedOutcomes: TIER_LADDER,
  triggers: [],
});

/** Roll `total` and run it through `runFormulaRouted` against {@link TIER_LADDER}. */
export function runTierStepCase({ total, dice, ...overrides } = {}) {
  stubRoll(total, dice ?? [{ number: 1, faces: 20, total }]);
  return runFormulaRouted({ ...ROUTED_DEFAULTS, ...overrides });
}

/**
 * Check one row's expectations, plus the invariant that carries the whole disposition-preserving
 * design: whenever a tier routed, `data.success` and that FINAL tier's own `success` agree.
 */
export function assertTierStepRow(result, expected = {}, ladder = TIER_LADDER) {
  assert.equal(result.outcome, expected.outcome ?? null, 'final tier name');
  assert.equal(result.data.outcomeId, expected.outcomeId ?? null, 'final tier id');
  assert.equal(result.success, expected.success, 'disposition');
  assert.deepEqual(
    result.data.tierStepApplied ?? null,
    expected.tierStepApplied ?? null,
    'data.tierStepApplied evidence'
  );
  const finalTier = ladder.find((tier) => tier.id === result.data.outcomeId) ?? null;
  if (finalTier) {
    assert.equal(
      result.data.success,
      finalTier.success,
      'data.success never disagrees with the final tier'
    );
  }
}

/** Register a table of `runFormulaRouted` cases as one `test()` per row. */
export function tierStepTable(rows) {
  for (const { name, expect, also, ...row } of rows) {
    test(name, async () => {
      const result = await runTierStepCase(row);
      assertTierStepRow(result, expect);
      also?.(result);
    });
  }
}

/** The `data.tierStepApplied` shape. */
export function stepEvidence({ mode, steps, from, to, triggerIds, stepClamped = false }) {
  return {
    mode,
    steps,
    fromOutcomeId: from,
    toOutcomeId: to,
    stepClamped,
    triggerIds,
  };
}

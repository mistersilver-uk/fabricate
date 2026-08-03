// Shared fixtures for the routed tier-STEP runtime (issue 975), consumed by
// `tests/check-roll-tier-step.test.js`.
//
// It carries ONLY what does not already exist elsewhere in the suite: the frozen
// tier ladder, the trigger factory, and the table driver that runs a row through
// `runFormulaRouted` and checks it. In particular it deliberately exports NO roll
// stub — the suite already has four (`tests/helpers/routedCheckEngine.js`,
// `tests/helpers/gathering.js`, and module-private ones in `check-roll.test.js` and
// `check-roll-dice.test.js`), and a fifth would be new code duplicating existing
// code against SonarCloud's `new_duplicated_lines_density` gate. `stubRoll` is
// re-exported from `routedCheckEngine.js` so a consumer needs one import.

import test from 'node:test';
import assert from 'node:assert/strict';

import { runFormulaRouted } from '../../src/systems/checkRoll.js';

import { stubRoll } from './routedCheckEngine.js';

export { stubRoll };

/**
 * One five-tier ladder serving BOTH routed types: every tier carries a relative `dc`
 * delta AND a fixed `[start, end]` range, which is not a fixture convenience but the
 * shape `_normalizeRoutedOutcome` actually persists — it keeps both operands across a
 * `type` switch so switching modes in the editor destroys neither.
 *
 * Ranked ascending (worst first): ruined, poor, fair, good, superb. Two failure tiers
 * and three success ones, so a disposition-preserving step has somewhere to move AND
 * somewhere to clamp inside each subset.
 *
 * The fixed ranges leave a deliberate GAP at 13 (poor 5-8, fair 9-12, good 14-16), so
 * a "the total matched no tier at all" case is reachable without rolling off the end
 * of the ladder.
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
 * `_normalizeUnifiedTrigger` emits, with `outcome: 'none'` and `breakTools: false`
 * written explicitly.
 *
 * The default `id` is derived from the effect rather than a counter, so it stays
 * stable however many rows a table runs and in whatever order.
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

/**
 * Roll `total` and run it through `runFormulaRouted` against {@link TIER_LADDER}.
 * `dice` defaults to a single d20 term showing the total; pass it explicitly when the
 * case is about per-die faces.
 */
export function runTierStepCase({ total, dice, ...overrides } = {}) {
  stubRoll(total, dice ?? [{ number: 1, faces: 20, total }]);
  return runFormulaRouted({ ...ROUTED_DEFAULTS, ...overrides });
}

/**
 * Check one row's expectations, plus the invariant that carries the whole
 * disposition-preserving design: whenever a tier routed, `data.success` and that
 * FINAL tier's own `success` agree. Without it a forced success stepping onto a
 * `success: false` tier would report `success: true` under a failure tier's name,
 * which `ResolutionModeService._resolveRoutedTierId` filters out — a zero-mutation
 * misconfiguration abort, or the full success set awarded on a "Ruined" tier.
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

/**
 * Register a table of `runFormulaRouted` cases as one `test()` per row. A row is
 * `{ name, total, dice, expect, also, ...runFormulaRouted overrides }`; `also` is an
 * optional extra assertion callback receiving the result.
 */
export function tierStepTable(rows) {
  for (const { name, expect, also, ...row } of rows) {
    test(name, async () => {
      const result = await runTierStepCase(row);
      assertTierStepRow(result, expect);
      also?.(result);
    });
  }
}

/**
 * The `data.tierStepApplied` shape. `triggerIds` is deliberately NOT defaulted from
 * `mode`/`steps`: `steps` is the REALIZED magnitude while a trigger id carries the
 * REQUESTED one, so any such default would quietly be wrong on exactly the clamped
 * rows that most need checking.
 */
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

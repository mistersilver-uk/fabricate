import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveProgressiveAward } from '../src/utils/progressiveAward.js';

// ---------------------------------------------------------------------------
// Shared fixtures / builders (Sonar counts tests/**; keep one definition each).
// ---------------------------------------------------------------------------

// Three ordered results with costs 2, 3, 5 keyed by id. `costMap` is the
// difficulty lookup the util's `costFor` reads from.
const RESULTS = Object.freeze([
  { id: 'r-1', componentId: 'a' },
  { id: 'r-2', componentId: 'b' },
  { id: 'r-3', componentId: 'c' },
]);
const COSTS = Object.freeze({ a: 2, b: 3, c: 5 });

function costFor(result) {
  const cost = COSTS[result.componentId];
  return Number.isFinite(cost) ? cost : null;
}

function run({
  results = RESULTS,
  initialRemaining,
  awardMode,
  invalidCost = 'skip',
  zeroRemainingOnPartial = true,
  cost = costFor,
}) {
  return resolveProgressiveAward({
    results,
    initialRemaining,
    costFor: cost,
    awardMode,
    invalidCost,
    zeroRemainingOnPartial,
  });
}

function awardedIds(outcome) {
  return outcome.awarded.map((entry) => entry.id);
}

// ---------------------------------------------------------------------------
// Award-mode loop semantics (the three modes)
// ---------------------------------------------------------------------------

test('equal mode awards full results while remaining >= cost, then stops', () => {
  // value 5: r-1 (cost 2, remaining 3), r-2 (cost 3, remaining 0), r-3 (cost 5 > 0) stops.
  const outcome = run({ initialRemaining: 5, awardMode: 'equal' });
  assert.deepEqual(awardedIds(outcome), ['r-1', 'r-2']);
  assert.equal(outcome.remaining, 0);
});

test('equal mode awards nothing when the first cost cannot be met', () => {
  const outcome = run({ initialRemaining: 1, awardMode: 'equal' });
  assert.deepEqual(awardedIds(outcome), []);
  assert.equal(outcome.remaining, 1);
});

test('exceed mode awards only while remaining strictly exceeds cost', () => {
  // value 5: r-1 (5 > 2, remaining 3), r-2 (3 > 3 is false) stops.
  const outcome = run({ initialRemaining: 5, awardMode: 'exceed' });
  assert.deepEqual(awardedIds(outcome), ['r-1']);
  assert.equal(outcome.remaining, 3);
});

test('exceed mode awards nothing when remaining only equals the first cost', () => {
  const outcome = run({ initialRemaining: 2, awardMode: 'exceed' });
  assert.deepEqual(awardedIds(outcome), []);
  assert.equal(outcome.remaining, 2);
});

test('partial mode awards full results then one final partial tail on a remainder', () => {
  // value 4: r-1 (cost 2, remaining 2), r-2 (cost 3 > 2) → partial tail awarded, stop before r-3.
  const outcome = run({ initialRemaining: 4, awardMode: 'partial' });
  assert.deepEqual(awardedIds(outcome), ['r-1', 'r-2']);
});

test('partial mode with an exact budget awards no extra tail', () => {
  // value 5: r-1 (cost 2, remaining 3), r-2 (cost 3, remaining 0), r-3 (cost 5 > 0, remaining 0) → no tail.
  const outcome = run({ initialRemaining: 5, awardMode: 'partial' });
  assert.deepEqual(awardedIds(outcome), ['r-1', 'r-2']);
  assert.equal(outcome.remaining, 0);
});

test('award mode defaults to equal when omitted', () => {
  const outcome = resolveProgressiveAward({
    results: RESULTS,
    initialRemaining: 5,
    costFor,
  });
  assert.deepEqual(awardedIds(outcome), ['r-1', 'r-2']);
});

// ---------------------------------------------------------------------------
// invalidCost: 'skip' vs 'fail' (divergence 1) across all three modes
// ---------------------------------------------------------------------------

const INVALID_RESULTS = Object.freeze([
  { id: 'r-1', componentId: 'a' }, // cost 2
  { id: 'r-bad', componentId: 'zzz' }, // no cost -> invalid
  { id: 'r-3', componentId: 'c' }, // cost 5
]);

for (const awardMode of ['equal', 'exceed', 'partial']) {
  test(`invalidCost 'skip' skips a result with no valid cost and continues (${awardMode})`, () => {
    const outcome = run({
      results: INVALID_RESULTS,
      initialRemaining: 100,
      awardMode,
      invalidCost: 'skip',
    });
    assert.deepEqual(awardedIds(outcome), ['r-1', 'r-3']);
    assert.equal(outcome.invalidResultId, undefined);
  });

  test(`invalidCost 'fail' short-circuits with invalidResultId on an invalid cost (${awardMode})`, () => {
    const outcome = run({
      results: INVALID_RESULTS,
      initialRemaining: 100,
      awardMode,
      invalidCost: 'fail',
    });
    assert.deepEqual(awardedIds(outcome), ['r-1']);
    assert.equal(outcome.invalidResultId, 'r-bad');
  });
}

test("invalidCost treats a sub-1 cost as invalid", () => {
  const cost = (result) => (result.id === 'r-2' ? 0 : COSTS[result.componentId]);
  const skip = run({ initialRemaining: 100, awardMode: 'equal', invalidCost: 'skip', cost });
  assert.deepEqual(awardedIds(skip), ['r-1', 'r-3']);
  const fail = run({ initialRemaining: 100, awardMode: 'equal', invalidCost: 'fail', cost });
  assert.equal(fail.invalidResultId, 'r-2');
});

// ---------------------------------------------------------------------------
// zeroRemainingOnPartial (divergence 2) — the ONLY observable guard for the
// latent salvage partial-remaining behaviour.
// ---------------------------------------------------------------------------

test('zeroRemainingOnPartial true zeroes the budget after the partial tail award (crafting/gathering)', () => {
  // value 4: r-1 (cost 2, remaining 2), r-2 partial tail → remaining zeroed.
  const outcome = run({ initialRemaining: 4, awardMode: 'partial', zeroRemainingOnPartial: true });
  assert.deepEqual(awardedIds(outcome), ['r-1', 'r-2']);
  assert.equal(outcome.remaining, 0);
});

test('zeroRemainingOnPartial false leaves the budget positive after the partial tail award (salvage)', () => {
  // Same input; salvage leaves the leftover budget positive (latent, unobservable
  // through its own return shape — this is the sole guard for that divergence).
  const outcome = run({ initialRemaining: 4, awardMode: 'partial', zeroRemainingOnPartial: false });
  assert.deepEqual(awardedIds(outcome), ['r-1', 'r-2']);
  assert.equal(outcome.remaining, 2);
});

test('zeroRemainingOnPartial only applies to the partial tail, not exact/equal awards', () => {
  // No partial tail occurs (exact budget), so the flag does not change `remaining`.
  const zeroed = run({ initialRemaining: 5, awardMode: 'partial', zeroRemainingOnPartial: true });
  const kept = run({ initialRemaining: 5, awardMode: 'partial', zeroRemainingOnPartial: false });
  assert.equal(zeroed.remaining, 0);
  assert.equal(kept.remaining, 0);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('empty / non-array results award nothing and keep the budget', () => {
  for (const results of [[], null, undefined]) {
    const outcome = resolveProgressiveAward({
      results,
      initialRemaining: 9,
      costFor,
      awardMode: 'equal',
    });
    assert.deepEqual(awardedIds(outcome), []);
    assert.equal(outcome.remaining, 9);
  }
});

test('zero budget awards nothing in every mode', () => {
  for (const awardMode of ['equal', 'exceed', 'partial']) {
    const outcome = run({ initialRemaining: 0, awardMode });
    assert.deepEqual(awardedIds(outcome), []);
    assert.equal(outcome.remaining, 0);
  }
});

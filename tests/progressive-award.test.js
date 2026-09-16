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

// ---------------------------------------------------------------------------
// partialResult / haltedResult / skippedResults — the five-bucket stage model
// (issue 1286). Each stage in the ordered list lands in exactly ONE bucket:
//   full      — in `awarded` and NOT `partialResult`
//   partial   — the `partial`-mode tail award, itself a MEMBER of `awarded`
//   halted    — the one stage that stopped the loop and was NOT awarded
//   unreached — every stage after the halt, never evaluated
//   skipped   — an invalid cost, derived over the WHOLE ordered list
// ---------------------------------------------------------------------------

/** Derive the five buckets the way a consumer must: `full = awarded \ {partialResult}`. */
function buckets(outcome, ordered) {
  const partial = outcome.partialResult;
  const full = outcome.awarded.filter((entry) => entry !== partial);
  const halted = outcome.haltedResult ? [outcome.haltedResult] : [];
  const classified = new Set([...outcome.awarded, ...halted, ...outcome.skippedResults]);
  return {
    full,
    partial,
    halted,
    skipped: outcome.skippedResults,
    unreached: ordered.filter((entry) => !classified.has(entry)),
  };
}

/** Every stage lands in exactly one bucket, and the two tail states never co-occur. */
function assertPartition(outcome, ordered, label) {
  const { full, partial, halted, skipped, unreached } = buckets(outcome, ordered);
  const all = [...full, ...(partial ? [partial] : []), ...halted, ...skipped, ...unreached];
  assert.equal(all.length, ordered.length, `${label}: every stage lands in a bucket`);
  assert.equal(new Set(all).size, ordered.length, `${label}: no stage lands in two buckets`);
  assert.ok(
    !(partial && halted.length > 0),
    `${label}: a partial tail award and a halt are mutually exclusive`
  );
  // The loop stops at the halt OR just after the partial tail; nothing else ends it,
  // so an unreached stage exists only beyond that stop point.
  const stop = halted[0] ?? partial;
  if (!stop) {
    assert.equal(unreached.length, 0, `${label}: nothing is unreached without a stop`);
    return;
  }
  const stopIndex = ordered.indexOf(stop);
  for (const entry of unreached) {
    assert.ok(ordered.indexOf(entry) > stopIndex, `${label}: unreached stages follow the stop`);
  }
}

test('partialResult is null under equal and exceed at every budget', () => {
  for (const awardMode of ['equal', 'exceed']) {
    for (let initialRemaining = 0; initialRemaining <= 12; initialRemaining++) {
      const outcome = run({ initialRemaining, awardMode });
      assert.equal(
        outcome.partialResult,
        null,
        `${awardMode} awards no partial tail (budget ${initialRemaining})`
      );
      assertPartition(outcome, RESULTS, `${awardMode} @ ${initialRemaining}`);
    }
  }
});

test('partialResult is the awarded tail itself, by identity, and is a member of awarded', () => {
  // value 4: r-1 (cost 2, remaining 2), r-2 (cost 3 > 2) → r-2 is the partial tail.
  const outcome = run({ initialRemaining: 4, awardMode: 'partial' });
  assert.equal(outcome.partialResult, RESULTS[1], 'the same object the caller passed in');
  assert.ok(outcome.awarded.includes(outcome.partialResult), 'the tail is a member of awarded');
  assert.deepEqual(
    buckets(outcome, RESULTS).full.map((entry) => entry.id),
    ['r-1'],
    'full is awarded minus the partial tail'
  );
});

test('partial mode reports no halt alongside a partial tail award', () => {
  const outcome = run({ initialRemaining: 4, awardMode: 'partial' });
  assert.equal(outcome.haltedResult, null, 'the tail is awarded and THEN the loop breaks');
  assert.deepEqual(
    buckets(outcome, RESULTS).unreached.map((entry) => entry.id),
    ['r-3'],
    'the stage after the tail is unreached'
  );
});

test('partialResult is null under partial when the budget covers the visited stages exactly', () => {
  // value 5: r-1 (cost 2), r-2 (cost 3) → remaining 0, so r-3 halts with no tail.
  const outcome = run({ initialRemaining: 5, awardMode: 'partial' });
  assert.equal(outcome.partialResult, null, 'a budget of exactly 0 buys no tail');
  assert.equal(outcome.haltedResult, RESULTS[2], 'the stage the exhausted budget stopped at');
  assertPartition(outcome, RESULTS, 'partial @ 5');
});

test('partialResult is null under partial when the budget covers the WHOLE list', () => {
  const outcome = run({ initialRemaining: 10, awardMode: 'partial' });
  assert.deepEqual(awardedIds(outcome), ['r-1', 'r-2', 'r-3']);
  assert.equal(outcome.partialResult, null, 'nothing was awarded short');
  assert.equal(outcome.haltedResult, null, 'nothing stopped the loop');
});

test('zeroRemainingOnPartial false (salvage) still reports the same partialResult', () => {
  // The salvage divergence zeroes nothing, but "was there a partial" must not depend on it:
  // deriving it from `remaining` in the callers would make salvage and crafting disagree.
  const salvage = run({ initialRemaining: 4, awardMode: 'partial', zeroRemainingOnPartial: false });
  const crafting = run({ initialRemaining: 4, awardMode: 'partial', zeroRemainingOnPartial: true });
  assert.equal(salvage.partialResult, RESULTS[1], 'salvage reports the tail');
  assert.equal(salvage.partialResult, crafting.partialResult, 'both paths report the same tail');
  assert.equal(salvage.remaining, 2, 'the salvage leftover budget stays positive');
  assert.equal(salvage.haltedResult, null, 'a positive leftover is still not a halt');
});

test('haltedResult is the stage that stopped the loop, and is NOT awarded', () => {
  const equal = run({ initialRemaining: 5, awardMode: 'equal' });
  assert.equal(equal.haltedResult, RESULTS[2], 'equal halts on the cost it cannot cover');
  assert.ok(!equal.awarded.includes(equal.haltedResult), 'the halted stage is not awarded');

  const exceed = run({ initialRemaining: 5, awardMode: 'exceed' });
  assert.equal(exceed.haltedResult, RESULTS[1], 'exceed halts on the cost it cannot STRICTLY beat');
  assert.ok(!exceed.awarded.includes(exceed.haltedResult), 'the halted stage is not awarded');
});

test('the exceed boundary stage is halted where equal calls it full', () => {
  // Budget 2 against cost 2: `equal` awards it, `exceed` needs remaining > cost.
  const equal = run({ initialRemaining: 2, awardMode: 'equal' });
  const exceed = run({ initialRemaining: 2, awardMode: 'exceed' });
  assert.equal(buckets(equal, RESULTS).full[0], RESULTS[0], 'equal: full');
  assert.equal(exceed.haltedResult, RESULTS[0], 'exceed: halted');
});

test('haltedResult is null when the budget covers the whole list, in every mode', () => {
  for (const awardMode of ['equal', 'exceed', 'partial']) {
    const outcome = run({ initialRemaining: 50, awardMode });
    assert.deepEqual(awardedIds(outcome), ['r-1', 'r-2', 'r-3'], `${awardMode} awards everything`);
    assert.equal(outcome.haltedResult, null, `${awardMode}: nothing stopped the loop`);
    assert.deepEqual(buckets(outcome, RESULTS).unreached, [], `${awardMode}: nothing is unreached`);
  }
});

test('a zero budget halts on the first valid stage in every mode', () => {
  for (const awardMode of ['equal', 'exceed', 'partial']) {
    const outcome = run({ initialRemaining: 0, awardMode });
    assert.equal(outcome.haltedResult, RESULTS[0], `${awardMode} halts on the first stage`);
    assert.equal(outcome.partialResult, null, `${awardMode} awards no tail on a zero budget`);
  }
});

test('skippedResults lists every invalid cost, including one positioned AFTER the halt', () => {
  // Costs 2, 3, 0, 5: a budget of 2 halts on r-2, so the loop never visits the zero-cost
  // r-bad at all — it must still be `skipped`, not `unreached`.
  const results = [
    { id: 'r-1', componentId: 'a' }, // cost 2
    { id: 'r-2', componentId: 'b' }, // cost 3 — the halt
    { id: 'r-bad', componentId: 'zero' }, // cost 0 — invalid, AFTER the halt
    { id: 'r-3', componentId: 'c' }, // cost 5 — unreached
  ];
  const cost = (result) => (result.componentId === 'zero' ? 0 : COSTS[result.componentId]);
  const outcome = run({ results, initialRemaining: 2, awardMode: 'equal', cost });

  assert.deepEqual(awardedIds(outcome), ['r-1']);
  assert.equal(outcome.haltedResult, results[1], 'r-2 stopped the loop');
  assert.deepEqual(
    outcome.skippedResults.map((entry) => entry.id),
    ['r-bad'],
    'derived over the whole ordered list, not the visited prefix'
  );
  assert.deepEqual(
    buckets(outcome, results).unreached.map((entry) => entry.id),
    ['r-3'],
    'the post-halt stage with a VALID cost is unreached, not skipped'
  );
  assertPartition(outcome, results, 'equal @ 2 with a post-halt invalid cost');
});

test('skippedResults covers non-finite and sub-1 costs and is empty when every cost is valid', () => {
  const results = [
    { id: 'r-nan', cost: NaN },
    { id: 'r-neg', cost: -5 },
    { id: 'r-frac', cost: 0.5 },
    { id: 'r-ok', cost: 1 },
  ];
  const outcome = run({
    results,
    initialRemaining: 100,
    awardMode: 'equal',
    cost: (result) => result.cost,
  });
  assert.deepEqual(
    outcome.skippedResults.map((entry) => entry.id),
    ['r-nan', 'r-neg', 'r-frac'],
    'non-finite, negative and <1 costs are all invalid'
  );
  assert.deepEqual(run({ initialRemaining: 50, awardMode: 'equal' }).skippedResults, []);
});

test("invalidCost 'fail' returns the new fields alongside invalidResultId", () => {
  const outcome = run({
    results: INVALID_RESULTS,
    initialRemaining: 100,
    awardMode: 'partial',
    invalidCost: 'fail',
  });
  assert.equal(outcome.invalidResultId, 'r-bad');
  assert.equal(outcome.partialResult, null, 'an aborted loop awarded no tail');
  assert.equal(outcome.haltedResult, null, 'the abort is not a budget halt');
  assert.deepEqual(
    outcome.skippedResults.map((entry) => entry.id),
    ['r-bad'],
    'the invalid cost is still reported as a fact about the list'
  );
});

test('empty / non-array results report empty and null new fields', () => {
  for (const results of [[], null, undefined]) {
    // Called directly: the `run` builder's default would substitute RESULTS for undefined.
    const outcome = resolveProgressiveAward({
      results,
      initialRemaining: 9,
      costFor,
      awardMode: 'partial',
    });
    assert.deepEqual(outcome.skippedResults, []);
    assert.equal(outcome.partialResult, null);
    assert.equal(outcome.haltedResult, null);
  }
});

// ---------------------------------------------------------------------------
// The progressiveStageThresholds oracle — unchanged by the additive fields, and
// now extended to the skipped bucket (a stage with no threshold is never awarded
// at any budget, which is exactly what `skippedResults` reports).
// ---------------------------------------------------------------------------

const { progressiveStageThresholds } = await import('../src/utils/progressiveStageThresholds.js');

const ORACLE_COST = (result) => Number(result.cost);
const ORACLE_FIXTURES = [
  { label: 'a skipped stage mid-list', costs: [2, 0, 3, 5] },
  { label: 'a skipped stage after the halt', costs: [2, 3, 0, 5] },
  { label: 'uniform costs', costs: [3, 3, 3] },
];

for (const awardMode of ['equal', 'exceed', 'partial']) {
  for (const { label, costs } of ORACLE_FIXTURES) {
    test(`ORACLE (${awardMode}): ${label} — awarded and skipped agree with the thresholds at every budget`, () => {
      const results = costs.map((cost, index) => ({ id: `s-${index}`, cost }));
      const thresholds = progressiveStageThresholds({
        results,
        costFor: ORACLE_COST,
        awardMode,
      });
      const unreachable = results.filter((_, index) => thresholds[index] === null);
      for (let budget = 0; budget <= 20; budget++) {
        const outcome = run({
          results,
          initialRemaining: budget,
          awardMode,
          cost: ORACLE_COST,
        });
        assert.deepEqual(
          outcome.awarded,
          results.filter((_, index) => thresholds[index] !== null && budget >= thresholds[index]),
          `${awardMode} / ${label}: awarded disagrees with the thresholds at budget ${budget}`
        );
        assert.deepEqual(
          outcome.skippedResults,
          unreachable,
          `${awardMode} / ${label}: skipped disagrees with the un-thresholded stages at budget ${budget}`
        );
        assertPartition(outcome, results, `${awardMode} / ${label} @ ${budget}`);
      }
    });
  }
}

/**
 * Issue 651 D12a — the cumulative "reached at ≥N" threshold helper.
 *
 * The centrepiece is the ORACLE TEST: the display's claim is checked against
 * `resolveProgressiveAward` ITSELF, for every award mode and every budget. A naive running
 * sum passes a hand-written expectation and fails this, which is the whole point — D0 says
 * the award loop owns the arithmetic, so presentation must not re-derive it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

const { progressiveStageThresholds } = await import('../src/utils/progressiveStageThresholds.js');
const { resolveProgressiveAward } = await import('../src/utils/progressiveAward.js');

const costOf = (result) => Number(result.cost);
const stages = (...costs) => costs.map((cost, i) => ({ id: `s-${i}`, cost }));

// ---------------------------------------------------------------------------
// The oracle — the display must agree with the loop, mode by mode, budget by budget
// ---------------------------------------------------------------------------

/**
 * For a budget N, the index of the last stage the AWARD LOOP actually awards.
 * `awarded` holds result objects, so map the last one back to its index.
 */
function lastAwardedIndex(results, budget, awardMode) {
  const { awarded } = resolveProgressiveAward({
    results,
    initialRemaining: budget,
    costFor: costOf,
    awardMode,
    invalidCost: 'skip',
    zeroRemainingOnPartial: true,
  });
  if (awarded.length === 0) return -1;
  return results.indexOf(awarded[awarded.length - 1]);
}

/** For a budget N, the index of the last stage the DISPLAY claims is reached. */
function lastClaimedIndex(thresholds, budget) {
  let last = -1;
  for (let i = 0; i < thresholds.length; i++) {
    if (thresholds[i] !== null && budget >= thresholds[i]) last = i;
  }
  return last;
}

const ORACLE_FIXTURES = [
  { label: 'uniform costs', results: stages(3, 3, 3) },
  { label: 'ascending costs', results: stages(1, 2, 4, 8) },
  { label: 'descending costs', results: stages(9, 5, 2, 1) },
  { label: 'a cost of exactly 1', results: stages(1, 1, 1) },
  // invalidCost: 'skip' — consumes NO budget and is NEVER awarded.
  { label: 'a zero-cost (skipped) stage mid-list', results: stages(2, 0, 3) },
  { label: 'a negative-cost (skipped) stage', results: stages(2, -5, 3) },
  { label: 'a NaN-cost (skipped) stage', results: stages(2, Number.NaN, 3) },
  { label: 'a fractional-cost (skipped, <1) stage', results: stages(2, 0.5, 3) },
  { label: 'a leading skipped stage', results: stages(0, 2, 3) },
  { label: 'a trailing skipped stage', results: stages(2, 3, 0) },
  { label: 'all stages skipped', results: stages(0, 0) },
  // _getDifficulty does not truncate, so a fractional cost >= 1 is representable.
  { label: 'fractional costs >= 1', results: stages(1.5, 2.5, 1.5) },
  { label: 'a single stage', results: stages(4) },
];

for (const awardMode of ['equal', 'exceed', 'partial']) {
  for (const { label, results } of ORACLE_FIXTURES) {
    test(`ORACLE (${awardMode}): ${label} — the display agrees with the award loop at every budget`, () => {
      const thresholds = progressiveStageThresholds({ results, costFor: costOf, awardMode });
      for (let budget = 0; budget <= 40; budget++) {
        assert.equal(
          lastClaimedIndex(thresholds, budget),
          lastAwardedIndex(results, budget, awardMode),
          `${awardMode} / ${label}: disagreement at budget ${budget} (thresholds ${JSON.stringify(thresholds)})`
        );
      }
    });
  }
}

test('ORACLE: a skipped stage is claimed at NO budget, because it is awarded at none', () => {
  const results = stages(2, 0, 3);
  for (const awardMode of ['equal', 'exceed', 'partial']) {
    const thresholds = progressiveStageThresholds({ results, costFor: costOf, awardMode });
    assert.equal(thresholds[1], null, `${awardMode}: the skipped stage has no threshold`);
    for (let budget = 0; budget <= 40; budget++) {
      const { awarded } = resolveProgressiveAward({
        results,
        initialRemaining: budget,
        costFor: costOf,
        awardMode,
        invalidCost: 'skip',
      });
      assert.ok(!awarded.includes(results[1]), `${awardMode}: never awarded at budget ${budget}`);
    }
  }
});

// ---------------------------------------------------------------------------
// The three divergences, pinned explicitly — a naive running sum fails each
// ---------------------------------------------------------------------------

test('equal: the threshold IS the running cumulative sum (the only mode where it is)', () => {
  assert.deepEqual(
    progressiveStageThresholds({ results: stages(3, 3, 3), costFor: costOf, awardMode: 'equal' }),
    [3, 6, 9]
  );
});

test("exceed: STRICT `>` puts the threshold one ABOVE the sum, and the error compounds", () => {
  // A naive sum would say [3, 6, 9]; every one is wrong, not just the first.
  assert.deepEqual(
    progressiveStageThresholds({ results: stages(3, 3, 3), costFor: costOf, awardMode: 'exceed' }),
    [4, 7, 10]
  );
});

test('partial: the tail award makes a stage reachable BELOW its cumulative sum', () => {
  // Naive sum: [5, 10, 15]. Truth: stage 2 is reached at 6, not 10 — a "≥10" badge on a
  // stage the player gets at 6.
  assert.deepEqual(
    progressiveStageThresholds({ results: stages(5, 5, 5), costFor: costOf, awardMode: 'partial' }),
    [1, 6, 11]
  );
});

test('skip: an invalid-cost stage neither takes a threshold nor advances the total', () => {
  // Naive sum would advance past the 0 and shift every later threshold.
  assert.deepEqual(
    progressiveStageThresholds({ results: stages(2, 0, 3), costFor: costOf, awardMode: 'equal' }),
    [2, null, 5],
    'the skipped stage consumes no budget, so stage 3 is reached at 5 and not 2+0+3'
  );
});

// ---------------------------------------------------------------------------
// Shape / tolerance
// ---------------------------------------------------------------------------

test('returns one entry per result, in order', () => {
  assert.equal(
    progressiveStageThresholds({ results: stages(1, 2, 3), costFor: costOf }).length,
    3
  );
});

test('defaults to the `equal` mode', () => {
  assert.deepEqual(
    progressiveStageThresholds({ results: stages(2, 2), costFor: costOf }),
    progressiveStageThresholds({ results: stages(2, 2), costFor: costOf, awardMode: 'equal' })
  );
});

test('tolerates a non-array results input', () => {
  assert.deepEqual(progressiveStageThresholds({ results: null, costFor: costOf }), []);
  assert.deepEqual(progressiveStageThresholds({ results: undefined, costFor: costOf }), []);
});

test('fractional costs >= 1 yield integer thresholds (budgets are roll totals)', () => {
  // equal: ceil of the cumulative sum; a budget of 4 covers 1.5 + 2.5.
  assert.deepEqual(
    progressiveStageThresholds({ results: stages(1.5, 2.5), costFor: costOf, awardMode: 'equal' }),
    [2, 4]
  );
  // exceed: the least integer strictly above the sum.
  assert.deepEqual(
    progressiveStageThresholds({ results: stages(1.5, 2.5), costFor: costOf, awardMode: 'exceed' }),
    [2, 5]
  );
});

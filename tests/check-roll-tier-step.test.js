// Routed tier STEPPING (issue 975) — the per-trigger `tierStep` effect that replaced
// the `natStepping` boolean and its hard-coded d20 / ±1 / relative-only rule.
//
// Renamed from `check-roll-nat-stepping.test.js`. The behaviours that file pinned (a
// natural 20 steps up, a natural 1 steps down, the kept-face rule, the cap/floor
// no-op) survive as trigger-authored cases here; what does NOT survive is the forced
// bypass, which this file now pins in the opposite direction.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} from '../src/systems/checkRoll.js';

import {
  ALWAYS,
  TIER_LADDER,
  assertTierStepRow,
  d20FaceCondition,
  forcingTrigger,
  runTierStepCase,
  stepEvidence,
  stubRoll,
  tierStepTable,
  tierStepTrigger,
} from './helpers/tierStepFixtures.js';

// Relative thresholds at the fixture base DC of 10: ruined 0, poor 5, fair 10,
// good 15, superb 20. So total 12 rolls "Fair" (ranked index 2 of 5) and total 16
// rolls "Good" (index 3) — the two step bases the relative rows below use.
const ROLLS_FAIR = 12;
const ROLLS_GOOD = 16;

// ── the three modes, and how several triggers compose ────────────────────────

tierStepTable([
  {
    name: 'tierStep up moves the rolled tier one rank towards the top',
    total: ROLLS_FAIR,
    triggers: [tierStepTrigger({ mode: 'up' })],
    expect: {
      outcome: 'Good',
      outcomeId: 'good',
      success: true,
      tierStepApplied: stepEvidence({
        mode: 'up',
        steps: 1,
        from: 'fair',
        to: 'good',
        triggerIds: ['step-up-1'],
      }),
    },
  },
  {
    name: 'tierStep down moves the rolled tier one rank towards the bottom, and success follows it',
    total: ROLLS_FAIR,
    triggers: [tierStepTrigger({ mode: 'down' })],
    expect: {
      outcome: 'Poor',
      outcomeId: 'poor',
      // With no forced outcome the final tier owns the disposition, exactly as the
      // old `natStepping` already stepped a success tier down into a failure.
      success: false,
      tierStepApplied: stepEvidence({
        mode: 'down',
        steps: 1,
        from: 'fair',
        to: 'poor',
        triggerIds: ['step-down-1'],
      }),
    },
  },
  {
    name: 'tierStep target places the final tier directly, and steps is the realized distance',
    total: ROLLS_FAIR,
    triggers: [tierStepTrigger({ mode: 'target', tierId: 'superb' })],
    expect: {
      outcome: 'Superb',
      outcomeId: 'superb',
      success: true,
      tierStepApplied: stepEvidence({
        mode: 'target',
        steps: 2,
        from: 'fair',
        to: 'superb',
        triggerIds: ['step-target-1-superb'],
      }),
    },
  },
  {
    name: "tierStep mode 'none' is inert and emits no evidence",
    total: ROLLS_FAIR,
    triggers: [tierStepTrigger({ mode: 'none' })],
    expect: { outcome: 'Fair', outcomeId: 'fair', success: true },
  },
  {
    name: 'a trigger whose condition does not match steps nothing',
    total: ROLLS_FAIR,
    triggers: [
      tierStepTrigger({
        mode: 'up',
        condition: { type: 'rollTotal', operator: '==', value: 3 },
      }),
    ],
    expect: { outcome: 'Fair', outcomeId: 'fair', success: true },
  },
  {
    name: 'two up triggers sum into a two-rank step, crediting both ids',
    total: ROLLS_FAIR,
    triggers: [
      tierStepTrigger({ id: 'up-a', mode: 'up' }),
      tierStepTrigger({ id: 'up-b', mode: 'up' }),
    ],
    expect: {
      outcome: 'Superb',
      outcomeId: 'superb',
      success: true,
      tierStepApplied: stepEvidence({
        mode: 'up',
        steps: 2,
        from: 'fair',
        to: 'superb',
        triggerIds: ['up-a', 'up-b'],
      }),
    },
  },
  {
    name: 'up 1 and down 1 cancel to a deliberate no-op with no evidence',
    total: ROLLS_FAIR,
    triggers: [tierStepTrigger({ mode: 'up' }), tierStepTrigger({ mode: 'down' })],
    expect: { outcome: 'Fair', outcomeId: 'fair', success: true },
  },
  {
    name: 'an out-of-range up step clamps to the top tier rather than no-opping',
    total: ROLLS_FAIR,
    triggers: [tierStepTrigger({ mode: 'up', steps: 3 })],
    expect: {
      outcome: 'Superb',
      outcomeId: 'superb',
      success: true,
      tierStepApplied: stepEvidence({
        mode: 'up',
        steps: 2,
        from: 'fair',
        to: 'superb',
        stepClamped: true,
        triggerIds: ['step-up-3'],
      }),
    },
  },
  {
    name: 'steps reports the REALIZED magnitude: up 3 that moved one tier reports 1, clamped',
    total: ROLLS_GOOD,
    triggers: [tierStepTrigger({ mode: 'up', steps: 3 })],
    expect: {
      outcome: 'Superb',
      outcomeId: 'superb',
      success: true,
      tierStepApplied: stepEvidence({
        mode: 'up',
        steps: 1,
        from: 'good',
        to: 'superb',
        stepClamped: true,
        triggerIds: ['step-up-3'],
      }),
    },
  },
  {
    name: 'an out-of-range down step clamps to the bottom tier',
    total: ROLLS_FAIR,
    triggers: [tierStepTrigger({ mode: 'down', steps: 5 })],
    expect: {
      outcome: 'Ruined',
      outcomeId: 'ruined',
      success: false,
      tierStepApplied: stepEvidence({
        mode: 'down',
        steps: 2,
        from: 'fair',
        to: 'ruined',
        stepClamped: true,
        triggerIds: ['step-down-5'],
      }),
    },
  },
  {
    name: 'a target applies BEFORE the net offset, and the mode stays target',
    total: ROLLS_FAIR,
    triggers: [
      tierStepTrigger({ id: 'to-good', mode: 'target', tierId: 'good' }),
      tierStepTrigger({ id: 'plus-one', mode: 'up' }),
    ],
    expect: {
      outcome: 'Superb',
      outcomeId: 'superb',
      success: true,
      // "You were placed on Superb" has no direction, so the resolved NET mode is
      // `target` however far the composed offset moved it.
      tierStepApplied: stepEvidence({
        mode: 'target',
        steps: 2,
        from: 'fair',
        to: 'superb',
        triggerIds: ['to-good', 'plus-one'],
      }),
    },
  },
  {
    name: 'a target naming the rolled tier itself is a no-op with no evidence',
    total: ROLLS_FAIR,
    triggers: [tierStepTrigger({ mode: 'target', tierId: 'fair' })],
    expect: { outcome: 'Fair', outcomeId: 'fair', success: true },
  },
  {
    name: 'a lone dangling target no-ops',
    total: ROLLS_FAIR,
    triggers: [tierStepTrigger({ mode: 'target', tierId: 'ghost' })],
    expect: { outcome: 'Fair', outcomeId: 'fair', success: true },
  },
  {
    name: 'a dangling target is DISCARDED before the comparison, not left to win and no-op',
    total: ROLLS_FAIR,
    triggers: [
      tierStepTrigger({ id: 'dangling', mode: 'target', tierId: 'ghost' }),
      tierStepTrigger({ id: 'valid', mode: 'target', tierId: 'poor' }),
    ],
    expect: {
      outcome: 'Poor',
      outcomeId: 'poor',
      success: false,
      // Only the winning target is credited; the discarded one contributed nothing.
      tierStepApplied: stepEvidence({
        mode: 'target',
        steps: 1,
        from: 'fair',
        to: 'poor',
        triggerIds: ['valid'],
      }),
    },
  },
  {
    name: 'among eligible competing targets the LOWEST-ranked tier wins, whatever the author order',
    total: ROLLS_FAIR,
    triggers: [
      tierStepTrigger({ id: 'to-superb', mode: 'target', tierId: 'superb' }),
      tierStepTrigger({ id: 'to-ruined', mode: 'target', tierId: 'ruined' }),
    ],
    expect: {
      outcome: 'Ruined',
      outcomeId: 'ruined',
      success: false,
      tierStepApplied: stepEvidence({
        mode: 'target',
        steps: 2,
        from: 'fair',
        to: 'ruined',
        triggerIds: ['to-ruined'],
      }),
    },
  },
  {
    name: 'a check that matched no tier steps nothing, target included',
    // Below every relative threshold (the lowest is 0) and clampToNearest is off, so
    // `matchRoutedOutcome` returns null — the deliberate "no route" path.
    total: -1,
    triggers: [tierStepTrigger({ mode: 'target', tierId: 'superb' })],
    expect: { outcome: null, outcomeId: null, success: false },
  },
]);

// ── the forced + step matrix ────────────────────────────────────────────────
//
// Stepping is DISPOSITION-PRESERVING: with a forced outcome in play the array the
// step moves within is the ranked SUBSET of tiers sharing that disposition
// ([ruined, poor] / [fair, good, superb]), and it clamps there. Every row below also
// runs the `data.success === the final tier's success` invariant through
// `assertTierStepRow`, which is the whole point of the subset rule.

tierStepTable([
  {
    name: 'forced success then down 1 lands on a lower SUCCESS tier and still succeeds',
    total: ROLLS_FAIR,
    triggers: [forcingTrigger('success'), tierStepTrigger({ mode: 'down' })],
    expect: {
      outcome: 'Good',
      outcomeId: 'good',
      success: true,
      tierStepApplied: stepEvidence({
        mode: 'down',
        steps: 1,
        from: 'superb',
        to: 'good',
        triggerIds: ['step-down-1'],
      }),
    },
  },
  {
    name: 'forced success then down 5 clamps at the BOTTOM OF THE SUCCESS SUBSET, never crossing into failure',
    total: ROLLS_FAIR,
    triggers: [forcingTrigger('success'), tierStepTrigger({ mode: 'down', steps: 5 })],
    expect: {
      outcome: 'Fair',
      outcomeId: 'fair',
      success: true,
      tierStepApplied: stepEvidence({
        mode: 'down',
        steps: 2,
        from: 'superb',
        to: 'fair',
        stepClamped: true,
        triggerIds: ['step-down-5'],
      }),
    },
  },
  {
    name: 'forced failure then up 1 lands on a higher FAILURE tier and still fails',
    total: ROLLS_FAIR,
    triggers: [forcingTrigger('failure'), tierStepTrigger({ mode: 'up' })],
    expect: {
      outcome: 'Poor',
      outcomeId: 'poor',
      success: false,
      tierStepApplied: stepEvidence({
        mode: 'up',
        steps: 1,
        from: 'ruined',
        to: 'poor',
        triggerIds: ['step-up-1'],
      }),
    },
  },
  {
    name: 'forced failure then up 5 clamps at the TOP OF THE FAILURE SUBSET, never crossing into success',
    total: ROLLS_FAIR,
    triggers: [forcingTrigger('failure'), tierStepTrigger({ mode: 'up', steps: 5 })],
    expect: {
      outcome: 'Poor',
      outcomeId: 'poor',
      success: false,
      tierStepApplied: stepEvidence({
        mode: 'up',
        steps: 1,
        from: 'ruined',
        to: 'poor',
        stepClamped: true,
        triggerIds: ['step-up-5'],
      }),
    },
  },
  {
    name: 'forced success then up 1 is already at the top of its subset: no evidence',
    total: ROLLS_FAIR,
    triggers: [forcingTrigger('success'), tierStepTrigger({ mode: 'up' })],
    expect: { outcome: 'Superb', outcomeId: 'superb', success: true },
  },
  {
    name: 'forced failure then down 1 is already at the bottom of its subset: no evidence',
    total: ROLLS_FAIR,
    triggers: [forcingTrigger('failure'), tierStepTrigger({ mode: 'down' })],
    expect: { outcome: 'Ruined', outcomeId: 'ruined', success: false },
  },
  {
    name: 'under forcing a target naming the opposite disposition is discarded BEFORE the comparison',
    total: ROLLS_FAIR,
    // `ruined` is the lowest-ranked tier in the WHOLE ladder, so it would win outright
    // if eligibility were tested after the comparison — and then no-op, leaving the
    // craft on Superb. It is not in the success subset, so `good` wins instead.
    triggers: [
      forcingTrigger('success'),
      tierStepTrigger({ id: 'to-ruined', mode: 'target', tierId: 'ruined' }),
      tierStepTrigger({ id: 'to-good', mode: 'target', tierId: 'good' }),
    ],
    expect: {
      outcome: 'Good',
      outcomeId: 'good',
      success: true,
      tierStepApplied: stepEvidence({
        mode: 'target',
        steps: 1,
        from: 'superb',
        to: 'good',
        triggerIds: ['to-good'],
      }),
    },
  },
  {
    name: 'a forced outcome no longer bypasses stepping (the deleted natStepping bypass)',
    total: ROLLS_FAIR,
    // Exactly the old bypass case: a forced failure alongside a natural-20 step-up
    // trigger, the shape `_convertNatSteppingToTriggers` synthesises. The old runtime
    // returned `{ matched, natStep: null }` unconditionally here.
    dice: [{ number: 1, faces: 20, total: 20, results: [{ result: 20 }] }],
    triggers: [
      forcingTrigger('failure'),
      tierStepTrigger({ id: 'natstep-up', mode: 'up', condition: d20FaceCondition(20) }),
    ],
    expect: {
      outcome: 'Poor',
      outcomeId: 'poor',
      success: false,
      tierStepApplied: stepEvidence({
        mode: 'up',
        steps: 1,
        from: 'ruined',
        to: 'poor',
        triggerIds: ['natstep-up'],
      }),
    },
  },
]);

// ── one tier ORDER derivation: rankedRoutedOutcomes ─────────────────────────

test('equal-rank tiers resolve to the FIRST authored one in both forced directions', async (t) => {
  // No pre-975 test exercised equal-rank tiers, and `routeCritOutcome`'s strict
  // `>` / `<` kept the first author-ordered tier for BOTH dispositions. A `toSorted`
  // copy indexed for "the highest succeeding tier" keeps the LAST.
  const TIED = [
    { id: 'win-first', name: 'Win First', success: true, dc: 5 },
    { id: 'win-second', name: 'Win Second', success: true, dc: 5 },
    { id: 'lose-first', name: 'Lose First', success: false, dc: -5 },
    { id: 'lose-second', name: 'Lose Second', success: false, dc: -5 },
  ];

  await t.test('forced success keeps the first of the equal-highest success tiers', async () => {
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      relativeOutcomes: TIED,
      triggers: [forcingTrigger('success')],
    });
    assert.equal(r.data.outcomeId, 'win-first');
  });

  await t.test('forced failure keeps the first of the equal-lowest failure tiers', async () => {
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      relativeOutcomes: TIED,
      triggers: [forcingTrigger('failure')],
    });
    assert.equal(r.data.outcomeId, 'lose-first');
  });

  await t.test('a step across equal-rank tiers walks them in author order', async () => {
    // Rolled tier is `win-first` (threshold 15 at base DC 10; total 16 matches it and,
    // on the tie, `matchRoutedOutcome`'s strict `>` keeps the first). Stepping up one
    // must land on its equal-ranked sibling, the very next entry in author order.
    const r = await runTierStepCase({
      total: ROLLS_GOOD,
      relativeOutcomes: TIED,
      triggers: [tierStepTrigger({ mode: 'up' })],
    });
    assert.equal(r.data.tierStepApplied.fromOutcomeId, 'win-first');
    assert.equal(r.data.tierStepApplied.toOutcomeId, 'win-second');
  });
});

test('a duplicate tier id resolves to the first match in RANK order', async () => {
  // `_normalizeRoutedOutcome` never enforces id uniqueness, so a target naming a
  // duplicated id must resolve deterministically: the first match in the ranked
  // array, which is the lower-ranked of the two.
  const DUPES = [
    { id: 'twin', name: 'Twin High', success: true, dc: 5 },
    { id: 'twin', name: 'Twin Low', success: false, dc: -5 },
    { id: 'base', name: 'Base', success: true, dc: 0 },
  ];
  const r = await runTierStepCase({
    total: ROLLS_FAIR,
    relativeOutcomes: DUPES,
    triggers: [tierStepTrigger({ mode: 'target', tierId: 'twin' })],
  });
  assert.equal(r.outcome, 'Twin Low', 'the lower-ranked duplicate is the first match');
  assert.equal(r.success, false, "the final tier's own disposition applies");
});

test('a tier whose rank is not a finite number is dropped from the order entirely', async () => {
  // Both pre-975 derivations filtered non-finite ranks. The junk tier sits BETWEEN
  // fair and good in author order, so a step that failed to drop it would land there.
  const WITH_JUNK = [
    { id: 'fair', name: 'Fair', success: true, dc: 0 },
    { id: 'junk', name: 'Junk', success: true, dc: 'not-a-number' },
    { id: 'good', name: 'Good', success: true, dc: 5 },
  ];
  const r = await runTierStepCase({
    total: ROLLS_FAIR,
    relativeOutcomes: WITH_JUNK,
    triggers: [tierStepTrigger({ mode: 'up' })],
  });
  assert.equal(r.outcome, 'Good', 'the unrankable tier is not a step destination');
  assert.equal(r.data.tierStepApplied.toOutcomeId, 'good');
});

test('the minOutcomeId gate still compares threshold VALUES, so tiers sharing a start pass', async () => {
  // Two fixed tiers share `start: 6` — `_normalizeRoutedOutcome` stores duplicate and
  // overlapping ranges without complaint (non-overlap is only a readiness WARNING).
  // By value they compare equal and the craft passes; by rank INDEX it would fail.
  const SHARED_START = [
    { id: 'a', name: 'A', success: true, breakTools: false, start: 6, end: 10 },
    { id: 'b', name: 'B', success: true, breakTools: false, start: 6, end: 12 },
  ];
  const r = await runTierStepCase({
    total: 8,
    type: 'fixed',
    fixedOutcomes: SHARED_START,
    minOutcomeId: 'b',
  });
  assert.equal(r.outcome, 'A');
  assert.equal(r.success, true);
  assert.equal(r.data.minTierFailed, undefined, 'equal starts are not "below" one another');
});

// ── outcomeTier conditions in the step pass ─────────────────────────────────

test('an outcomeTier-conditioned step reads the ROLLED tier and the pass does not iterate', async (t) => {
  await t.test('an outcomeTier condition can now drive a step', async () => {
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      triggers: [
        tierStepTrigger({
          id: 'on-fair',
          mode: 'up',
          condition: { type: 'outcomeTier', tierIds: ['fair'], outcomeKeys: [] },
        }),
      ],
    });
    assert.equal(r.outcome, 'Good');
    assert.deepEqual(r.data.tierStepApplied.triggerIds, ['on-fair']);
  });

  await t.test('an outcomeTier condition matches the rolled tier NAME too', async () => {
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      triggers: [
        tierStepTrigger({
          id: 'on-fair-name',
          mode: 'up',
          condition: { type: 'outcomeTier', tierIds: [], outcomeKeys: ['fair'] },
        }),
      ],
    });
    assert.equal(r.outcome, 'Good');
  });

  await t.test('a condition on the STEPPED tier never fires — one pass, no fixpoint', async () => {
    // The obvious non-terminating cycle: "landed on Fair, step up" plus "landed on
    // Good, step up". Only the first matches, because every condition is evaluated
    // once against the frozen rolled-tier snapshot.
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      triggers: [
        tierStepTrigger({
          id: 'on-fair',
          mode: 'up',
          condition: { type: 'outcomeTier', tierIds: ['fair'], outcomeKeys: [] },
        }),
        tierStepTrigger({
          id: 'on-good',
          mode: 'up',
          condition: { type: 'outcomeTier', tierIds: ['good'], outcomeKeys: [] },
        }),
      ],
    });
    assert.equal(r.outcome, 'Good', 'exactly one rank, not two and not an endless climb');
    assert.equal(r.data.tierStepApplied.steps, 1);
    assert.deepEqual(r.data.tierStepApplied.triggerIds, ['on-fair']);
  });

  await t.test('the oscillating half of the cycle is equally inert', async () => {
    // "Landed on Fair, step up" + "landed on Good, step DOWN" would oscillate under
    // any fixpoint iteration; the snapshot makes it a single deterministic move.
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      triggers: [
        tierStepTrigger({
          id: 'on-fair',
          mode: 'up',
          condition: { type: 'outcomeTier', tierIds: ['fair'], outcomeKeys: [] },
        }),
        tierStepTrigger({
          id: 'on-good',
          mode: 'down',
          condition: { type: 'outcomeTier', tierIds: ['good'], outcomeKeys: [] },
        }),
      ],
    });
    assert.equal(r.outcome, 'Good');
  });

  await t.test('a progressiveValue condition stays invisible to the step pass', async () => {
    // `value` is left undefined in the snapshot, matching the forced-outcome call.
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      triggers: [
        tierStepTrigger({
          mode: 'up',
          condition: { type: 'progressiveValue', operator: '>=', value: 0 },
        }),
      ],
    });
    assert.equal(r.outcome, 'Fair');
    assert.equal(r.data.tierStepApplied, undefined);
  });
});

// ── fixed type: stepping, range gaps, and the recipe-minimum gate ───────────

tierStepTable([
  {
    name: 'fixed-type checks step too (the old boolean was relative-only)',
    total: 10,
    type: 'fixed',
    triggers: [tierStepTrigger({ mode: 'up' })],
    expect: {
      outcome: 'Good',
      outcomeId: 'good',
      success: true,
      tierStepApplied: stepEvidence({
        mode: 'up',
        steps: 1,
        from: 'fair',
        to: 'good',
        triggerIds: ['step-up-1'],
      }),
    },
  },
  {
    name: 'a fixed total in a range gap matched no tier, so even a target produces no outcome and no evidence',
    // 13 falls between fair (9-12) and good (14-16). A GM wanting a floor for
    // un-ranged totals authors a covering range, not a step.
    total: 13,
    type: 'fixed',
    triggers: [tierStepTrigger({ mode: 'target', tierId: 'superb' })],
    expect: { outcome: null, outcomeId: null, success: false },
  },
]);

test('the minOutcomeId gate judges the FINAL tier, and names the blocked tier', async (t) => {
  await t.test('a down step below the recipe minimum fails the craft outright', async () => {
    const r = await runTierStepCase({
      total: ROLLS_GOOD, // fixed 14-16 → "Good", which IS the required minimum
      type: 'fixed',
      minOutcomeId: 'good',
      triggers: [tierStepTrigger({ mode: 'down' })],
    });
    assert.equal(r.success, false, 'the gate judges the post-step tier, not the rolled one');
    assert.equal(r.outcome, null, 'no tier routes on a min-tier failure');
    assert.equal(r.data.outcomeId, null);
    assert.equal(r.data.minTierFailed, true);
    assert.equal(r.data.blockedOutcomeId, 'fair', 'the BLOCKED tier is post-step, pre-gate');
    assert.equal(r.data.rolledOutcomeId, undefined, 'the old key name is retired');
    // The step still happened and still reports itself: the gate is downstream of it.
    assert.equal(r.data.tierStepApplied.toOutcomeId, 'fair');
  });

  await t.test('an up step ONTO the recipe minimum rescues the craft', async () => {
    const r = await runTierStepCase({
      total: 10, // fixed 9-12 → "Fair", below the "good" minimum
      type: 'fixed',
      minOutcomeId: 'good',
      triggers: [tierStepTrigger({ mode: 'up' })],
    });
    assert.equal(r.outcome, 'Good');
    assert.equal(r.success, true);
    assert.equal(r.data.minTierFailed, undefined);
  });

  await t.test('a forced outcome still bypasses the gate, step and all', async () => {
    const r = await runTierStepCase({
      total: 10,
      type: 'fixed',
      minOutcomeId: 'superb',
      triggers: [forcingTrigger('success'), tierStepTrigger({ mode: 'down' })],
    });
    assert.equal(r.success, true, 'a forced crit is never downgraded by a recipe minimum');
    assert.equal(r.outcome, 'Good', 'stepped down within the success subset');
    assert.equal(r.data.minTierFailed, undefined);
  });
});

// ── clampToNearest interacts with the step clamp only by composition ────────

test('clampToNearest and the step clamp are independent concepts', async (t) => {
  // `clampToNearest` decides whether a tier matched AT ALL; the step clamp decides
  // where an out-of-range step lands. A total below every threshold clamps onto the
  // lowest tier, and a `down` step from there has nowhere to go.
  await t.test('a down step at the clamped lowest tier no-ops with no evidence', async () => {
    const r = await runTierStepCase({
      total: -1,
      clampToNearest: true,
      triggers: [tierStepTrigger({ mode: 'down' })],
    });
    assertTierStepRow(r, { outcome: 'Ruined', outcomeId: 'ruined', success: false });
  });

  await t.test('an up step from the clamped lowest tier still moves', async () => {
    const r = await runTierStepCase({
      total: -1,
      clampToNearest: true,
      triggers: [tierStepTrigger({ mode: 'up' })],
    });
    assert.equal(r.outcome, 'Poor');
    assert.equal(r.data.tierStepApplied.fromOutcomeId, 'ruined');
    assert.equal(r.data.tierStepApplied.stepClamped, false);
  });
});

// ── inertness on the non-routed runners ─────────────────────────────────────

test('tierStep is inert on simple and progressive checks', async (t) => {
  const triggers = [
    tierStepTrigger({ mode: 'up' }),
    tierStepTrigger({ mode: 'target', tierId: 'superb' }),
  ];

  await t.test('runFormulaPassFail ignores it entirely', async () => {
    stubRoll(15, [{ number: 1, faces: 20, total: 15 }]);
    const r = await runFormulaPassFail({
      formula: '1d20',
      dc: 15,
      thresholdMode: 'meet',
      triggers,
    });
    assert.equal(r.success, true);
    assert.equal(r.outcome, 'pass');
    assert.equal(r.data.tierStepApplied, undefined);
  });

  await t.test('runFormulaProgressive ignores it entirely', async () => {
    stubRoll(8, [{ number: 2, faces: 6, total: 8 }]);
    const r = await runFormulaProgressive({ formula: '2d6', triggers });
    assert.equal(r.value, 8);
    assert.equal(r.data.tierStepApplied, undefined);
  });
});

// ── the behaviours the retired natStepping boolean used to own ──────────────

test('a migrated natural-20 / natural-1 trigger pair reproduces the old stepping', async (t) => {
  // The exact pair `_convertNatSteppingToTriggers` synthesises for a legacy
  // `natStepping: true`, driven through the runtime that now interprets it.
  const natStepPair = [
    tierStepTrigger({ id: 'natstep-up', mode: 'up', condition: d20FaceCondition(20) }),
    tierStepTrigger({ id: 'natstep-down', mode: 'down', condition: d20FaceCondition(1) }),
  ];

  await t.test('a natural 20 steps up one tier', async () => {
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      dice: [{ number: 1, faces: 20, total: 20, results: [{ result: 20 }] }],
      triggers: natStepPair,
    });
    assert.equal(r.outcome, 'Good');
    assert.deepEqual(r.data.tierStepApplied.triggerIds, ['natstep-up']);
  });

  await t.test('a natural 1 steps down one tier', async () => {
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      dice: [{ number: 1, faces: 20, total: 1, results: [{ result: 1 }] }],
      triggers: natStepPair,
    });
    assert.equal(r.outcome, 'Poor');
    assert.deepEqual(r.data.tierStepApplied.triggerIds, ['natstep-down']);
  });

  await t.test('advantage inspects only the kept face', async () => {
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      dice: [
        {
          number: 2,
          faces: 20,
          total: 20,
          results: [
            { result: 1, active: false },
            { result: 20, active: true },
          ],
        },
      ],
      triggers: natStepPair,
    });
    assert.equal(r.outcome, 'Good', 'the dropped natural 1 is not an active face');
  });

  await t.test('an ordinary face steps nothing', async () => {
    const r = await runTierStepCase({
      total: ROLLS_FAIR,
      dice: [{ number: 1, faces: 20, total: 11, results: [{ result: 11 }] }],
      triggers: natStepPair,
    });
    assert.equal(r.outcome, 'Fair');
    assert.equal(r.data.tierStepApplied, undefined);
  });

  await t.test('a roll with no d20 group cannot fire the pair', async () => {
    const r = await runTierStepCase({
      formula: '2d6',
      total: ROLLS_FAIR,
      dice: [{ number: 2, faces: 6, total: 8, results: [{ result: 6 }, { result: 2 }] }],
      triggers: natStepPair,
    });
    assert.equal(r.outcome, 'Fair');
    assert.equal(r.data.tierStepApplied, undefined);
  });
});

// ── the retired boolean and its evidence key ────────────────────────────────

test('the retired natStepping option and its natStep evidence no longer exist', async () => {
  // Belt and braces for the two `CraftingEngine` call sites lane A3 removes: passing
  // the dead option must neither step anything nor resurrect the old evidence key.
  stubRoll(ROLLS_FAIR, [{ number: 1, faces: 20, total: 20, results: [{ result: 20 }] }]);
  const r = await runFormulaRouted({
    formula: '1d20',
    dc: 10,
    thresholdMode: 'meet',
    type: 'relative',
    relativeOutcomes: TIER_LADDER,
    triggers: [],
    natStepping: true,
  });
  assert.equal(r.outcome, 'Fair', 'the boolean no longer steps anything');
  assert.equal(r.data.natStep, undefined, 'the natStep evidence key is retired');
  assert.equal(r.data.tierStepApplied, undefined, 'and no trigger authored a step');
});

test('a tierStep trigger with an unrecognised mode is inert', async () => {
  const r = await runTierStepCase({
    total: ROLLS_FAIR,
    triggers: [{ id: 'weird', condition: ALWAYS, outcome: 'none', tierStep: { mode: 'sideways' } }],
  });
  assert.equal(r.outcome, 'Fair');
  assert.equal(r.data.tierStepApplied, undefined);
});

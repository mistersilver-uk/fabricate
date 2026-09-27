/**
 * Issue 2004 — a success-counting check at the runner: the refusals raised once a pre-roll
 * settles or while Foundry rolls, a cancelled prompt, and forcing, stepping, the minimum gate and
 * zero-pool tool breakage, over the core-faithful dice double.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { installCountDice } from './helpers/countEngineDice.js';
import { countEvaluation } from './helpers/countFixtures.js';
import {
  runFormulaPassFail,
  runFormulaProgressive,
  runFormulaRouted,
} from '../src/systems/checkRoll.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';

const ACTOR = { getRollData: () => ({}) };
const normalized = (pool, direction) => normalizeCheckEvaluation(countEvaluation({ direction, ...pool }));
const cannotRoll = (label, detail) => `${label} check cannot roll: ${detail}.`;
const POOL_TOO_LARGE = { targetRefusal: 'pool-too-large', refusedInput: 'pool' };
/** A player's situational `1d4`, answered without a prompt and never posted. */
const BONUS_1D4 = { interactive: true, prompt: null, post: false, rollDecision: { bonus: '1d4' } };

async function withDice(faces, body) {
  const dice = installCountDice({ faces });
  try {
    return await body(dice);
  } finally {
    dice.restore();
  }
}

// ── refusals and a cancelled prompt ───────────────────────────────────────────

test('a pool above 999 dice refuses pool-too-large once it settles, before the main roll', async () => {
  await withDice([], async (dice) => {
    const result = await runFormulaPassFail({
      formula: '',
      dc: 1,
      actor: ACTOR,
      label: 'Salvage',
      evaluation: normalized({ base: '1000' }),
    });
    assert.deepEqual([result.misconfigured, result.data], [true, POOL_TOO_LARGE]);
    assert.equal(
      result.message,
      cannotRoll('Salvage', 'its dice pool is more than 999 dice once modifiers apply')
    );
    assert.deepEqual(dice.constructed, []);
  });
});

test('a settled pre-roll that pushes the pool past 999 refuses after rolling only the pre-roll', async () => {
  await withDice([3], async (dice) => {
    const result = await runFormulaPassFail({
      formula: '',
      dc: 1,
      actor: ACTOR,
      evaluation: normalized({ base: '998' }),
      rollOptions: BONUS_1D4,
    });
    assert.deepEqual([result.misconfigured, result.data], [true, POOL_TOO_LARGE]);
    assert.deepEqual(dice.formulas(), ['1d4']);
  });
});

test('an unresolved threshold refuses before the situational pre-roll, naming its path', async () => {
  await withDice([3], async (dice) => {
    const result = await runFormulaPassFail({
      formula: '',
      dc: 1,
      actor: ACTOR,
      label: 'Salvage',
      evaluation: normalized({ threshold: '@a.b' }),
      rollOptions: BONUS_1D4,
    });
    assert.deepEqual(result.data, { targetRefusal: 'unresolved-path', refusedInput: 'threshold' });
    assert.match(result.message, /@a\.b/);
    assert.deepEqual(dice.constructed, []);
  });
});

test("Foundry's explosion limit refuses explode-unbounded, never a failed roll, and posts nothing", async () => {
  const explode = { enabled: true, faces: { kind: 'from', value: 10 }, once: false };
  await withDice(Array.from({ length: 1100 }, () => 10), async (dice) => {
    const result = await runFormulaPassFail({
      formula: '',
      dc: 1,
      actor: ACTOR,
      label: 'Salvage',
      evaluation: normalized({ base: '1', explode }),
      rollOptions: { speaker: { alias: 'Salvager' } },
    });
    assert.deepEqual(
      [result.misconfigured, result.data],
      [true, { targetRefusal: 'explode-unbounded', refusedInput: 'explode' }]
    );
    assert.equal(
      result.message,
      cannotRoll('Salvage', 'its dice would explode past the most Foundry can roll at once')
    );
    assert.deepEqual(dice.posts, []);
  });
});

test('a cancelled count prompt answers cancelled and rolls nothing', async () => {
  await withDice([], async (dice) => {
    const result = await runFormulaPassFail({
      formula: '',
      dc: 1,
      actor: ACTOR,
      evaluation: normalized({}),
      rollOptions: { interactive: true, prompt: async () => ({ confirmed: false }) },
    });
    assert.equal(result.cancelled, true);
    assert.deepEqual(dice.constructed, []);
  });
});

test('the count prompt shows no formula, even with a deferred modifier choice', async () => {
  const prompts = [];
  await withDice([], () =>
    runFormulaPassFail({
      formula: '',
      dc: 1,
      actor: ACTOR,
      evaluation: normalized({}),
      rollOptions: {
        interactive: true,
        modifierChoice: { modifiers: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] },
        prompt: async (input) => {
          prompts.push(input);
          return { confirmed: false };
        },
      },
    })
  );
  assert.deepEqual([prompts[0].formula, prompts[0].displayFormula], ['', '']);
});

// ── forcing, stepping, the minimum gate and zero-pool breakage ────────────────

test('a pass/fail forced success fires on a raw negative net', async () => {
  const cancelWorst = { cancel: { enabled: true, faces: { kind: 'worst', value: null } } };
  const lucky = { id: 'x', outcome: 'success', condition: { type: 'rollTotal', operator: '<', value: 0 } };
  const result = await withDice([1, 3], () =>
    runFormulaPassFail({ formula: '', dc: 1, actor: ACTOR, evaluation: normalized(cancelWorst), triggers: [lucky] })
  );
  assert.deepEqual([result.success, result.data.total], [true, -1]);
});

test('routed count exceed grades the net as met: a net equal to the tier count matches', async () => {
  const result = await withDice([9, 8], () =>
    runFormulaRouted({
      formula: '',
      dc: 1,
      thresholdMode: 'exceed',
      type: 'relative',
      relativeOutcomes: [
        { id: 'fine', name: 'Fine', success: true, dc: 0 },
        { id: 'botch', name: 'Botch', success: false, dc: -1 },
      ],
      fixedOutcomes: [],
      clampToNearest: true,
      actor: ACTOR,
      evaluation: normalized({}),
    })
  );
  assert.equal(result.outcome, 'Fine', '9 exceeds 8 and 8 does not: a net of 1 meets 1');
});

/** Relative count tiers against a required count of 1: Fine needs 2, Success 1, Botch 0. */
const LADDER = [
  { id: 'botch', name: 'Botch', success: false, dc: -1, breakTools: true },
  { id: 'success', name: 'Success', success: true, dc: 0 },
  { id: 'fine', name: 'Fine', success: true, dc: 1 },
];
const routedUnder = (faces, extra) =>
  withDice(faces, () =>
    runFormulaRouted({
      formula: '',
      dc: 1,
      type: 'relative',
      relativeOutcomes: LADDER,
      fixedOutcomes: [],
      clampToNearest: true,
      actor: ACTOR,
      evaluation: normalized({ base: '2', threshold: '5' }, 'under'),
      ...extra,
    })
  );

test('count/under routed: a step moves up by higher net, and the minimum gate blocks a lower net', async () => {
  const up = { id: 'up', tierStep: { mode: 'up', steps: 1 }, condition: { type: 'rollTotal', operator: '>=', value: 1 } };
  const stepped = await routedUnder([2, 9], { triggers: [up] });
  assert.equal(stepped.outcome, 'Fine', 'the net of 1 matches Success and steps up');
  assert.ok(stepped.data.tierStepApplied);

  const gated = await routedUnder([2, 9], {
    type: 'fixed',
    relativeOutcomes: [],
    minOutcomeId: 'great',
    fixedOutcomes: [
      { id: 'plain', name: 'Plain', success: false, start: 0, end: 0 },
      { id: 'good', name: 'Good', success: true, start: 1, end: 1 },
      { id: 'great', name: 'Great', success: true, start: 2, end: 5 },
    ],
  });
  assert.deepEqual(
    [gated.success, gated.data.minTierFailed, gated.data.blockedOutcomeId],
    [false, true, 'good']
  );
});

test('a zero pool routes to a lowest failing tier that breaks tools, and says so', async () => {
  const result = await withDice([], () =>
    runFormulaRouted({
      formula: '',
      dc: 1,
      type: 'relative',
      relativeOutcomes: LADDER,
      fixedOutcomes: [],
      actor: ACTOR,
      evaluation: normalized({ base: '0' }),
    })
  );
  assert.deepEqual([result.outcome, result.data.breakTools], ['Botch', true]);
});

test('a progressive forced failure spends nothing, even with successes', async () => {
  const fail = { id: 'f', outcome: 'failure', condition: { type: 'rollTotal', operator: '>=', value: 0 } };
  const result = await withDice([9, 9], () =>
    runFormulaProgressive({ formula: '', triggers: [fail], actor: ACTOR, evaluation: normalized({}) })
  );
  assert.deepEqual([result.value, result.data.total], [0, 2]);
});

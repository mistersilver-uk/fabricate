/**
 * Issue 2003 — direction-aware grading, routing and evidence for summed checks: pass/fail under,
 * the routed fixtures R1–R7, the D3 fixed-range shift, the prepared and secret evaluator (QE6),
 * the empty-formula backstop (QE9), executed evidence, the history gate and the one derivation.
 */
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveCheckRoll,
  evaluatePreparedRunCheck,
  resolveCheckFormulaDisplay,
  resolveRolledFormula,
  runFormulaPassFail,
  runFormulaRouted,
} from '../src/systems/checkRoll.js';
import { resolveCheckTarget } from '../src/systems/checkTarget.js';
import { craftingStepHistoryEvidence } from '../src/systems/CraftingRunManager.js';
import { historyEvidenceFields } from '../src/systems/runHistoryEvidence.js';

const SUM_UNDER = { product: 'sum', direction: 'under', target: { source: 'fixed' } };
const SUM_OVER = { product: 'sum', direction: 'over', target: { source: 'fixed' } };
const attribute = (direction, adjustmentKind = 'add', baseAdjustment = null) => ({
  product: 'sum',
  direction,
  target: { source: 'attribute', expression: '@skill', adjustmentKind, baseAdjustment },
});
const UNDER_MULTIPLY = attribute('under', 'multiply');
const actor = { getRollData: () => ({ skill: 55 }) };
const ALWAYS = { type: 'rollTotal', operator: '>=', value: Number.MIN_SAFE_INTEGER };

/** A dice engine whose main check totals `total` and whose `1d4` pre-roll totals 3. */
function installRoll(total) {
  const constructed = [];
  globalThis.Roll = class FixedRoll {
    constructor(formula) {
      this.formula = String(formula);
      constructed.push(this.formula);
      this.total = this.formula.includes('1d4') ? 3 : total;
      this.dice = [{ number: 1, faces: 20, total: this.total, results: [{ result: this.total }] }];
    }
    async evaluate() {
      return this;
    }
    evaluateSync() {
      return this;
    }
    toJSON() {
      return { formula: this.formula, total: this.total };
    }
    static replaceFormulaData(formula) {
      return formula;
    }
    static validate() {
      return true;
    }
  };
  return constructed;
}

afterEach(() => {
  delete globalThis.Roll;
});

/** A settled Tool scalar: under a sum/under check it raises the target by `value`. */
const benefit = (value) => ({
  toolContributions: [{ source: 'tool', label: 'Hammer', form: 'scalar', value }],
});

function passFail(total, { dc = 55, comparison = 'meet', evaluation = SUM_UNDER, delta = 0 } = {}) {
  installRoll(total);
  return runFormulaPassFail({
    formula: '1d100',
    dc,
    thresholdMode: comparison,
    actor,
    evaluation,
    rollOptions: benefit(delta),
  });
}

/** Extreme ×⅕, Hard ×½, Regular ×1 and Otherwise, as the maintainer's percentile ladder. */
const LADDER = [
  { id: 'extreme', name: 'Extreme', success: true, breakTools: false, dc: 0, adjustment: 0.2 },
  { id: 'hard', name: 'Hard', success: true, breakTools: false, dc: 0, adjustment: 0.5 },
  { id: 'regular', name: 'Regular', success: true, breakTools: false, dc: 0, adjustment: 1 },
  { id: 'otherwise', name: 'Otherwise', success: false, breakTools: false, dc: 0, adjustment: null },
];

function routedArgs(total, options = {}) {
  const {
    dc = 55,
    evaluation = UNDER_MULTIPLY,
    outcomes = LADDER,
    type = 'relative',
    comparison = 'meet',
    triggers = [],
    minOutcomeId = null,
  } = options;
  return {
    formula: '1d100',
    dc,
    thresholdMode: comparison,
    type,
    relativeOutcomes: type === 'fixed' ? [] : outcomes,
    fixedOutcomes: type === 'fixed' ? outcomes : [],
    triggers,
    actor,
    clampToNearest: true,
    minOutcomeId,
    evaluation,
  };
}

function routed(total, options = {}) {
  installRoll(total);
  return runFormulaRouted({ ...routedArgs(total, options), rollOptions: benefit(options.delta ?? 0) });
}

const outcomeOf = async (total, options) => (await routed(total, options)).data.outcomeId;

// ── pass/fail ─────────────────────────────────────────────────────────────────

test('fixed 55 under: meet accepts 55 and rejects 56, exceed rejects 55', async () => {
  for (const evaluation of [SUM_UNDER, attribute('under')]) {
    assert.equal((await passFail(55, { evaluation })).success, true);
    assert.equal((await passFail(56, { evaluation })).success, false);
    assert.equal((await passFail(55, { evaluation, comparison: 'exceed' })).success, false);
    assert.equal((await passFail(54, { evaluation, comparison: 'exceed' })).success, true);
  }
  assert.equal((await passFail(55, { evaluation: SUM_OVER })).success, true);
  assert.equal((await passFail(54, { evaluation: attribute('over') })).success, false);
});

test('data.dc names only a fixed target; the executed evidence carries direction and margin', async () => {
  const fixed = await passFail(50);
  assert.deepEqual(
    [fixed.data.dc, fixed.data.total, fixed.data.direction, fixed.data.target, fixed.data.margin],
    [55, 50, 'under', 55, 5],
    'the margin is benefit-positive: target − total'
  );
  const character = await passFail(50, { evaluation: attribute('under') });
  assert.deepEqual([character.data.dc, character.data.target], [null, 55]);
  const over = await passFail(60, { evaluation: attribute('over') });
  assert.deepEqual([over.data.dc, over.data.direction, over.data.margin], [null, 'over', 5]);
});

test('attribute 12 with an added −2 grades against 10, and a +1 benefit raises it to 11', async () => {
  const evaluation = attribute('under', 'add', -2);
  const resolved = resolveCheckTarget({ evaluation, rollData: { skill: 12 }, adjustment: -2 });
  assert.deepEqual(resolved, { ok: true, target: 10, source: 'attribute' });
  const passed = await passFail(11, { evaluation, dc: resolved.target, delta: 1 });
  assert.deepEqual([passed.success, passed.data.target], [true, 11]);
  assert.equal((await passFail(12, { evaluation, dc: resolved.target, delta: 1 })).success, false);
});

test('the settled targetDelta applies exactly once and a fractional one is not rounded', async () => {
  const raised = await passFail(13, { dc: 10, delta: 3 });
  assert.deepEqual([raised.success, raised.data.target, raised.data.total], [true, 13, 13]);
  assert.equal((await passFail(14, { dc: 10, delta: 3 })).success, false);
  const half = await passFail(10, { dc: 10, delta: 0.5, comparison: 'exceed' });
  assert.deepEqual([half.success, half.data.target], [true, 10.5]);
});

// ── the multiply ladder (R2) and QE14 boundaries ──────────────────────────────

test('R2: attribute 55 with ×⅕, ×½ and ×1 routes 11, 27, 50 and 70 by threshold', async () => {
  assert.equal(await outcomeOf(11), 'extreme');
  assert.equal(await outcomeOf(27), 'hard');
  assert.equal(await outcomeOf(50), 'regular');
  const otherwise = await routed(70);
  assert.deepEqual(
    [otherwise.data.outcomeId, otherwise.success, otherwise.data.target, otherwise.data.margin],
    ['otherwise', false, null, null],
    'Otherwise has no threshold, so no target or margin'
  );
  const hard = await routed(27);
  assert.deepEqual([hard.data.dc, hard.data.target, hard.data.margin], [null, 27, 0]);
});

test('R2: a +5 benefit makes Hard 32 and a −5 benefit makes it 22', async () => {
  assert.equal(await outcomeOf(32, { delta: 5 }), 'hard');
  assert.equal(await outcomeOf(33, { delta: 5 }), 'regular');
  assert.equal((await routed(32, { delta: 5 })).data.target, 32);
  assert.equal(await outcomeOf(22, { delta: -5 }), 'hard');
  assert.equal(await outcomeOf(23, { delta: -5 }), 'regular');
});

test('QE14: flooring comes before a fractional benefit, and exceed misses an exact threshold', async () => {
  assert.equal(await outcomeOf(28), 'regular', '55 × ½ floors to 27');
  const half = await routed(28, { delta: 0.5 });
  assert.deepEqual([half.data.outcomeId, half.data.target], ['regular', 55.5], '27 + 0.5 misses 28');
  assert.equal(await outcomeOf(27, { comparison: 'exceed' }), 'regular');
  const doubled = [{ ...LADDER[0], id: 'double', adjustment: 2 }, LADDER[3]];
  assert.equal(await outcomeOf(110, { outcomes: doubled }), 'double', '55 × 2 is 110');
  assert.equal(await outcomeOf(111, { outcomes: doubled }), 'otherwise');
  const nine = resolveCheckTarget({
    evaluation: attribute('under', 'multiply', 0.5),
    rollData: { skill: 9 },
    adjustment: 0.5,
  });
  assert.equal(nine.target, 4);
  assert.equal(await outcomeOf(8, { dc: nine.target, outcomes: doubled }), 'double', '9 × ½ × 2 = 8');
  const halved = [{ ...LADDER[1] }, LADDER[3]];
  assert.equal(await outcomeOf(-3, { dc: -5, outcomes: halved }), 'hard', '−5 × ½ floors to −3');
  assert.equal(await outcomeOf(-2, { dc: -5, outcomes: halved }), 'otherwise');
});

// ── R1, R3, R7: relative fixed/additive ranking and the clamp ─────────────────

const ADDITIVE = [
  { id: 'superb', name: 'Superb', success: true, dc: 5, adjustment: null },
  { id: 'fine', name: 'Fine', success: true, dc: 0, adjustment: null },
  { id: 'poor', name: 'Poor', success: false, dc: -20, adjustment: null },
];

test('R1: relative fixed under routes the best qualifying tier and clamps to the least demanding', async () => {
  const options = { dc: 12, evaluation: SUM_UNDER, outcomes: ADDITIVE };
  assert.equal(await outcomeOf(7, options), 'superb', 'threshold 12 − 5');
  assert.equal(await outcomeOf(8, options), 'fine');
  const clamped = await routed(40, options);
  assert.deepEqual([clamped.data.outcomeId, clamped.data.target], ['poor', 32], 'threshold 12 + 20');
  assert.equal(await outcomeOf(9, { ...options, delta: 2 }), 'superb', 'a benefit raises every threshold');
});

test('R3: tied thresholds keep authored order', async () => {
  const tied = [
    { id: 'a', name: 'A', success: true, dc: 0, adjustment: 0.5 },
    { id: 'b', name: 'B', success: true, dc: 0, adjustment: 0.59 },
    LADDER[3],
  ];
  assert.equal(await outcomeOf(1, { dc: 5, outcomes: tied }), 'a', 'both floor to 2');
  assert.equal(await outcomeOf(1, { dc: 5, outcomes: [tied[1], tied[0], tied[2]] }), 'b');
});

test('R7: a fixed/additive check without Otherwise keeps its clamp, null adjustments included', async () => {
  const legacy = [
    { id: 'fine', name: 'Fine', success: true, dc: 0, adjustment: null },
    { id: 'botch', name: 'Botch', success: false, dc: -10, adjustment: null },
  ];
  assert.equal(await outcomeOf(-5, { dc: 10, evaluation: SUM_OVER, outcomes: legacy }), 'botch');
  const under = { dc: 10, evaluation: attribute('under'), outcomes: legacy };
  assert.equal(await outcomeOf(25, under), 'botch', 'the highest threshold under');
  assert.equal(await outcomeOf(9, under), 'fine');
});

test('a multiply check without Otherwise clamps, and several Otherwise tiers take the first', async () => {
  assert.equal(await outcomeOf(70, { outcomes: LADDER.slice(0, 3) }), 'regular');
  const twice = [...LADDER, { ...LADDER[3], id: 'otherwise-2' }];
  assert.equal(await outcomeOf(70, { outcomes: twice }), 'otherwise');
});

// ── R4, R5: steps and forcing ─────────────────────────────────────────────────

const step = (mode, steps = 1, tierId) => ({
  id: `step-${mode}`,
  condition: ALWAYS,
  tierStep: { mode, steps, ...(tierId && { tierId }) },
});

test('R4: up is better; down, target and clamped steps move through Otherwise as the lowest', async () => {
  const up = await routed(27, { triggers: [step('up')] });
  assert.deepEqual(
    [up.data.outcomeId, up.data.tierStepApplied.mode, up.data.target],
    ['extreme', 'up', 27],
    'the evidence keeps the rolled threshold'
  );
  assert.equal(await outcomeOf(27, { triggers: [step('down')] }), 'regular');
  const clamped = await routed(27, { triggers: [step('down', 5)] });
  assert.deepEqual(
    [clamped.data.outcomeId, clamped.data.tierStepApplied.steps, clamped.data.tierStepApplied.stepClamped],
    ['otherwise', 2, true]
  );
  assert.equal(await outcomeOf(27, { triggers: [step('target', 1, 'regular')] }), 'regular');
});

test('Otherwise ranks lowest regardless of its success flag', async () => {
  const lucky = [...LADDER.slice(0, 3), { ...LADDER[3], success: true }];
  assert.equal(await outcomeOf(27, { outcomes: lucky, triggers: [step('down', 2)] }), 'otherwise');
  assert.equal(await outcomeOf(11, { outcomes: lucky, triggers: [step('down', 3)] }), 'otherwise');
});

test('R5: forced success picks Extreme and forced failure picks Otherwise', async () => {
  const forced = (outcome) => [{ id: `crit-${outcome}`, outcome, condition: ALWAYS }];
  const success = await routed(99, { triggers: forced('success') });
  assert.deepEqual([success.data.outcomeId, success.success], ['extreme', true]);
  const failure = await routed(1, { triggers: forced('failure') });
  assert.deepEqual([failure.data.outcomeId, failure.success], ['otherwise', false]);
});

// ── R6: fixed ranges and the minimum gate ─────────────────────────────────────

const RANGES = [
  { id: 'great', name: 'Great', success: true, start: 1, end: 10 },
  { id: 'poor', name: 'Poor', success: false, start: 11, end: 20 },
];

test('R6: under fixed ranges match total − targetDelta, keeping the raw total', async () => {
  const options = { type: 'fixed', evaluation: SUM_UNDER, outcomes: RANGES };
  const shifted = await routed(12, { ...options, delta: 3 });
  assert.deepEqual(
    [shifted.data.outcomeId, shifted.data.total, shifted.data.target, shifted.data.margin],
    ['great', 12, null, null]
  );
  assert.equal(await outcomeOf(12, options), 'poor');
  assert.equal(await outcomeOf(12, { ...options, evaluation: SUM_OVER, delta: 3 }), 'poor');
  const multiply = { type: 'fixed', evaluation: UNDER_MULTIPLY, outcomes: RANGES };
  assert.equal(await outcomeOf(5, multiply), 'great', 'a range is never an Otherwise tier');
});

test('R6: the minimum gate compares starts in the direction, and equal starts pass', async () => {
  const ranges = [
    { id: 'fine', name: 'Fine', success: true, start: 1, end: 10 },
    { id: 'also-fine', name: 'Also fine', success: true, start: 1, end: 8 },
    { id: 'poor', name: 'Poor', success: true, start: 11, end: 20 },
  ];
  const options = { type: 'fixed', evaluation: SUM_UNDER, outcomes: ranges, minOutcomeId: 'also-fine' };
  const equal = await routed(9, options);
  assert.deepEqual([equal.data.outcomeId, equal.success, equal.data.minTierFailed], ['fine', true, undefined]);
  const blocked = await routed(15, options);
  assert.deepEqual(
    [blocked.success, blocked.data.minTierFailed, blocked.data.blockedOutcomeId],
    [false, true, 'poor'],
    'start 11 is worse than 1 under'
  );
  assert.equal(await outcomeOf(5, options), 'fine', 'overlapping ranges tie on start, first authored');
});

// ── the prepared evaluator (QE6) ──────────────────────────────────────────────

/** A prepared check whose decision policy captured `target` and whose config carries `evaluation`. */
function preparation({ evaluation, target, type = null, outcomes = [], triggers = [], minOutcomeId = null, extra = {} }) {
  return {
    slot: type ? 'routed' : 'simple',
    mode: type ? 'routedByCheck' : 'simple',
    rollFormula: '1d100',
    checkConfig: { rollFormula: '1d100', evaluation, checkBreakage: { triggers }, ...extra },
    decisionPolicy: {
      dc: evaluation.target.source === 'fixed' ? target : null,
      target,
      targetSource: evaluation.target.source,
      thresholdMode: 'meet',
      type,
      relativeOutcomes: type === 'fixed' ? [] : outcomes,
      fixedOutcomes: type === 'fixed' ? outcomes : [],
      clampToNearest: Boolean(type),
      minOutcomeId,
    },
  };
}

const EVIDENCE = ['outcomeId', 'success', 'target', 'margin', 'direction', 'tierStepApplied', 'minTierFailed'];
const evidenceOf = (result) => EVIDENCE.map((key) => result.data[key]);

test('the ordinary and prepared paths agree on thresholds, ties, forcing, steps and gates', async () => {
  const cases = [
    { total: 40, dc: 12, evaluation: SUM_UNDER, outcomes: ADDITIVE },
    { total: 32, delta: 5 },
    { total: 1, dc: 5, outcomes: [{ ...LADDER[0], id: 'a', adjustment: 0.5 }, { ...LADDER[0], id: 'b', adjustment: 0.59 }] },
    { total: 27, triggers: [step('down', 5)] },
    { total: 99, triggers: [{ id: 'crit', outcome: 'success', condition: ALWAYS }] },
    { total: 12, delta: 3, type: 'fixed', evaluation: SUM_UNDER, outcomes: RANGES, minOutcomeId: 'great' },
  ];
  for (const { total, delta = 0, ...options } of cases) {
    const args = routedArgs(total, options);
    const ordinary = await routed(total, { ...options, delta });
    const prepared = await evaluatePreparedRunCheck(
      preparation({
        evaluation: args.evaluation,
        target: args.dc,
        type: args.type,
        outcomes: options.outcomes ?? LADDER,
        triggers: args.triggers,
        minOutcomeId: args.minOutcomeId,
        extra: benefit(delta),
      }),
      actor
    );
    assert.deepEqual(evidenceOf(prepared), evidenceOf(ordinary), JSON.stringify(options));
  }
});

test('a prepared check grades its captured target, not a later actor or config value', async () => {
  installRoll(12);
  const prepared = preparation({ evaluation: attribute('under'), target: 12, extra: { dc: 99 } });
  const result = await evaluatePreparedRunCheck(prepared, actor);
  assert.deepEqual(
    [result.success, result.data.dc, result.data.target, result.data.direction],
    [true, null, 12, 'under'],
    'the actor now reads 55 and the config names 99; the captured 12 still grades'
  );
});

const LIBRARY = {
  catalogue: [
    { id: 'flat', label: 'Flat', expression: '2' },
    { id: 'rune', label: 'Rune', expression: '1d4' },
  ],
  systemPolicy: 'addAll',
  defaultModifierIds: ['flat', 'rune'],
};

test('QE6: a secret sum/under check classifies against target + delta and returns no placement', async () => {
  const secretCheck = (total) => {
    installRoll(total);
    return evaluatePreparedRunCheck(
      preparation({ evaluation: SUM_UNDER, target: 10, extra: { craftingModifier: LIBRARY } }),
      actor,
      {},
      { secret: true }
    );
  };
  const passed = await secretCheck(15);
  assert.deepEqual(
    [passed.success, passed.data.target, passed.data.margin],
    [true, 15, 0],
    'the +2 scalar and the 1d4 pre-roll of 3 raise 10 to 15 inside the authority'
  );
  assert.equal((await secretCheck(16)).success, false);
  const reply = JSON.stringify(passed);
  for (const hidden of ['preRolls', 'modifierPlacement', 'targetDelta', 'rollHandoff', '1d4']) {
    assert.equal(reply.includes(hidden), false, `the reply omits ${hidden}`);
  }
  assert.equal(passed.secret, true);
});

// ── QE9 and non-evidence exits ────────────────────────────────────────────────

test('QE9: an empty sum/under formula refuses formula-empty before any roll', async () => {
  const constructed = installRoll(0);
  const refusals = [
    await runFormulaPassFail({ formula: '  ', dc: 10, actor, evaluation: SUM_UNDER }),
    await runFormulaRouted({ ...routedArgs(0), formula: '' }),
    await evaluatePreparedRunCheck(
      { ...preparation({ evaluation: SUM_UNDER, target: 10 }), rollFormula: '' },
      actor
    ),
  ];
  for (const refused of refusals) {
    assert.equal(refused.misconfigured, true);
    assert.deepEqual(refused.data, { targetRefusal: 'formula-empty' });
  }
  assert.deepEqual(constructed, []);
  const over = await runFormulaPassFail({ formula: '', dc: 10, actor });
  assert.equal(over.misconfigured, undefined, 'sum/over keeps its empty-formula grading');
});

test('a headless, cancelled or thrown sum/under roll records no executed evidence', async () => {
  const rolled = await passFail(1);
  delete globalThis.Roll;
  const noEngine = await runFormulaPassFail({ formula: '1d20', dc: 10, actor, evaluation: SUM_UNDER });
  installRoll(1);
  const cancelled = await runFormulaRouted({
    ...routedArgs(1),
    rollOptions: { interactive: true, prompt: async () => null },
  });
  globalThis.Roll = class {
    constructor() {
      throw new Error('bad formula');
    }
  };
  const thrown = await runFormulaPassFail({ formula: '1d20', dc: 10, actor, evaluation: SUM_UNDER });
  assert.equal(rolled.data.product, 'sum', 'a rolled check does record evidence');
  for (const exit of [noEngine, cancelled, thrown]) {
    assert.equal(Object.hasOwn(exit.data, 'product'), false);
  }
});

// ── the history gate ──────────────────────────────────────────────────────────

test('both history allowlists keep an agreeing sum/under and drop a disagreeing one', () => {
  const executed = (snapshotDirection, resultDirection) => ({
    resolutionSnapshot: { kind: 'check', mode: 'simple', product: 'sum', direction: snapshotDirection },
    lastCheckResult: { data: { total: 9, product: 'sum', direction: resultDirection } },
  });
  for (const allow of [craftingStepHistoryEvidence, historyEvidenceFields]) {
    assert.deepEqual(allow(executed('under', 'under'), { executed: true }).resolutionSnapshot, {
      kind: 'check',
      mode: 'simple',
      product: 'sum',
      direction: 'under',
    });
    for (const [snapshot, result] of [['under', 'over'], ['over', 'under'], ['sideways', 'sideways']]) {
      assert.deepEqual(allow(executed(snapshot, result), { executed: true }).resolutionSnapshot, {
        kind: 'check',
        mode: 'simple',
      });
    }
  }
});

// ── the one derivation ────────────────────────────────────────────────────────

test('one derivation places sum/under benefits on the target and appends them under sum/over', () => {
  installRoll(10);
  const tool = [{ source: 'tool', label: 'Hammer', form: 'scalar', value: 1 }];
  const under = deriveCheckRoll('1d20', actor, LIBRARY, undefined, SUM_UNDER, tool);
  assert.equal(under.formula, '1d20', 'nothing appends under');
  assert.equal(under.placement.targetDelta, 3, 'the Tool 1 and the flat 2');
  assert.deepEqual(
    under.placement.preRolls.map(({ source, destination }) => [source, destination]),
    [['library', 'target']]
  );
  const over = deriveCheckRoll('1d20', actor, LIBRARY, undefined, undefined, tool);
  assert.notEqual(over.formula, '1d20');
  assert.equal(over.formula, resolveRolledFormula('1d20', actor, LIBRARY));
  assert.equal(over.placement.targetDelta, 0);
  assert.equal(resolveRolledFormula('1d20', actor, LIBRARY, undefined, SUM_UNDER), '1d20');
  assert.equal(
    resolveCheckFormulaDisplay('1d20', actor, LIBRARY, undefined, SUM_UNDER).display,
    '1d20'
  );
});

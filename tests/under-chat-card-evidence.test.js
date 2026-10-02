/**
 * The real-Foundry roll-under chat card assertions (issue 2005), driven over cards the shipped
 * renderer builds, so a change to the card's markup reaches these checks rather than a copy; and
 * the proof that each smoke case is decided by its configuration whatever the dice show.
 */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { pickCraftCardMessage } from '../scripts/lib/craftChatCardSummary.js';
import {
  UNDER_CHARACTER_PATH,
  UNDER_CHAT_CARD_CASES,
  UNDER_MIN_CHARACTER_VALUE,
  misconfiguredFailures,
  underCardFailures,
} from '../scripts/lib/underChatCardEvidence.js';
import { runFormulaPassFail, runFormulaRouted } from '../src/systems/checkRoll.js';
import { resolveCheckTarget } from '../src/systems/checkTarget.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';
import { buildCraftingChatContent } from '../src/ui/presenters/CraftingChatCard.js';

import {
  NOT_PUBLIC,
  PUBLIC,
  executedCheck,
  shippedLocalize,
} from './helpers/checkEvidenceFixtures.js';

const caseOf = (id) => UNDER_CHAT_CARD_CASES.find((entry) => entry.id === id);

const dice = (formula, face, total) => ({
  resolvedFormula: formula,
  diceGroups: [{ groupId: 0, group: '1d6', sum: face, results: [face] }],
  total,
});

/** What each rolled case executes, as the engine records it: Strength 12, a 4 on the d6. */
const EXECUTED = {
  pass: {
    product: 'sum',
    direction: 'under',
    comparison: 'meet',
    ...dice('1d6', 4, 4),
    target: 14,
    margin: 10,
    preRolls: [
      { source: 'situational', label: '', expression: '1d4', total: 2, destination: 'target' },
    ],
    targetSource: 'attribute',
    targetExpression: UNDER_CHARACTER_PATH,
    targetActor: 'Smoke Crafter',
    targetTerms: [{ kind: 'anchor', value: 12 }],
  },
  fail: {
    product: 'sum',
    direction: 'under',
    comparison: 'meet',
    dc: 12,
    ...dice('1d6 + 30', 4, 34),
    target: 12,
    margin: -22,
    preRolls: [],
    targetSource: 'fixed',
    targetTerms: [{ kind: 'anchor', value: 12 }],
  },
  otherwise: {
    product: 'sum',
    direction: 'under',
    comparison: 'meet',
    ...dice('1d6 + 30', 4, 34),
    target: null,
    margin: null,
    outcomeId: 'under-otherwise',
  },
};

function underCard(caseId, { data = EXECUTED[caseId], visibility = PUBLIC } = {}) {
  return buildCraftingChatContent(
    {
      status: caseId === 'pass' ? 'succeeded' : 'failed',
      actorName: 'Smoke Crafter',
      recipeName: 'Smoke Under Charm',
      rollValue: data.total,
      check: executedCheck(data, visibility),
    },
    shippedLocalize
  );
}

/** The message the execute posts: the main roll first, then any pre-roll, as `rolls`. */
function rollMessage(caseId, { preRollTotal = 2, face = 4 } = {}) {
  const formula = caseId === 'pass' ? '1d6' : '1d6 + 30';
  const rolls = [
    {
      formula,
      total: caseId === 'pass' ? face : face + 30,
      results: [{ result: face, active: true }],
    },
  ];
  if (caseId === 'pass') {
    rolls.push({ formula: '1d4', total: preRollTotal, results: [{ result: preRollTotal }] });
  }
  return { content: '', rolls };
}

const failuresOf = (caseId, card, message = rollMessage(caseId), characterValue = 12) =>
  underCardFailures(caseId, { card, rollMessages: [message], characterValue });

test('each public roll-under card the renderer builds passes its own case, and only its own', () => {
  for (const caseId of ['pass', 'fail', 'otherwise']) {
    assert.deepEqual(failuresOf(caseId, underCard(caseId)), [], caseId);
  }
  assert.notDeepEqual(
    failuresOf('pass', underCard('fail'), rollMessage('pass')),
    [],
    'a failed card cannot pass as the passing case'
  );
  assert.match(
    failuresOf('otherwise', underCard('fail'), rollMessage('otherwise')).join('\n'),
    /evidence rows target, margin, expected none/
  );
  assert.match(
    failuresOf('fail', underCard('otherwise'), rollMessage('fail')).join('\n'),
    /evidence rows none, expected target, margin/
  );
});

test('the result pill must agree with the case, not just the rest of the card', () => {
  // Same evidence as the passing case, flipped only to a failed status: every other check
  // (dice line, target, pre-rolled, margin) still reads as 'pass' would.
  const flipped = buildCraftingChatContent(
    {
      status: 'failed',
      actorName: 'Smoke Crafter',
      recipeName: 'Smoke Under Charm',
      rollValue: EXECUTED.pass.total,
      check: executedCheck(EXECUTED.pass, PUBLIC),
    },
    shippedLocalize
  );
  assert.match(
    failuresOf('pass', flipped, rollMessage('pass')).join('\n'),
    /pass: result pill failure, expected success/
  );
});

test('the passing card must fold its character value and pre-roll into its target', () => {
  assert.match(
    failuresOf('pass', underCard('pass'), rollMessage('pass'), 11).join('\n'),
    /Target read 12, not 11/
  );
  const unfolded = { ...EXECUTED.pass, target: 15, margin: 11 };
  assert.match(
    failuresOf('pass', underCard('pass', { data: unfolded })).join('\n'),
    /Target 15 does not fold/
  );
  assert.match(
    failuresOf('pass', underCard('pass'), rollMessage('pass', { preRollTotal: 3 })).join('\n'),
    /pre-roll disagrees/
  );
});

test('the failing card must show the literal fixed target', () => {
  // Same total and margin as the failing case, its target anchor term dropped: the label
  // falls back to the bare number, breaking only the literal "12 · fixed" text.
  const noAnchor = { ...EXECUTED.fail, targetTerms: [] };
  assert.match(
    failuresOf('fail', underCard('fail', { data: noAnchor })).join('\n'),
    /fail: Target is not "12 · fixed"/
  );
});

test('the card must agree with the roll the execute posted', () => {
  assert.match(
    failuresOf('fail', underCard('fail'), rollMessage('fail', { face: 5 })).join('\n'),
    /disagrees with the posted roll/
  );
  assert.match(
    failuresOf('otherwise', underCard('otherwise'), { rolls: [] }).join('\n'),
    /0 posted 1d6 \+ 30 rolls/
  );
});

test('a roll-under card rolled in any other mode states no dice line, so it fails every case', () => {
  for (const visibility of NOT_PUBLIC) {
    const failures = failuresOf('pass', underCard('pass', { visibility })).join('\n');
    assert.match(failures, /pass: dice line "null"/, JSON.stringify(visibility));
  }
});

test('the assertions bind to the one crafting card the execute created', () => {
  const card = { id: 'card', content: underCard('fail') };
  assert.equal(pickCraftCardMessage([rollMessage('fail'), card]).message, card);
  assert.match(pickCraftCardMessage([rollMessage('fail')]).error, /created 0 crafting cards/);
});

test('the refusal passes only when nothing is posted and the Crafting tab names it', () => {
  const sentence = shippedLocalize('FABRICATE.Check.TargetRefusal.UnresolvedPath');
  const refused = {
    result: { success: false, reason: 'roll-unavailable', message: sentence },
    createdMessages: [],
    cardCount: { before: 7, after: 7 },
    promptOpened: false,
    refusalText: shippedLocalize('FABRICATE.Check.Roll.TargetUnresolved').replace(
      '{label}',
      'Crafting'
    ),
  };
  assert.deepEqual(misconfiguredFailures(refused), []);
  const direct = {
    success: false,
    misconfigured: true,
    data: { targetRefusal: 'unresolved-path' },
  };
  assert.deepEqual(
    misconfiguredFailures({ ...refused, result: { ...direct, message: sentence } }),
    []
  );
  const broken = [
    { result: { success: false, data: {} } },
    {
      result: { success: false, message: 'Crafting check cannot roll: no target formula is set.' },
    },
    { result: { ...direct, message: sentence, data: { targetRefusal: 'non-finite' } } },
    { result: { success: false, reason: 'operation-failed', message: sentence } },
    { promptOpened: true },
    { createdMessages: [{ id: 'roll' }] },
    { cardCount: { before: 7, after: 8 } },
    { refusalText: '' },
  ];
  for (const change of broken) {
    assert.equal(
      misconfiguredFailures({ ...refused, ...change }).length,
      1,
      JSON.stringify(change)
    );
  }
});

/** A dice engine whose d6 shows `face`, plus 30 where the formula adds it. */
function installRoll(face) {
  class FixedRoll {
    constructor(formula) {
      this.formula = String(formula);
      this.total = face + (/\+\s*30/.test(this.formula) ? 30 : 0);
      this.dice = [{ number: 1, faces: 6, total: face, results: [{ result: face }] }];
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
  }
  Object.assign(globalThis, { Roll: FixedRoll });
}

afterEach(() => {
  delete globalThis.Roll;
});

const strength = (value) => ({ abilities: { str: { value } } });
/** A case's check as the runners take it: the authored formula is their `formula`. */
const runnerArgs = ({ check }) => ({ ...check, formula: check.rollFormula, actor: null });
const targetFor = (entry, rollData) =>
  resolveCheckTarget({
    evaluation: normalizeCheckEvaluation(entry.check.evaluation),
    rollData,
    anchor: entry.check.dc,
  });

test('every case is decided by its configuration, on the die face least in its favour', async () => {
  const pass = caseOf('pass');
  const lowest = targetFor(pass, strength(UNDER_MIN_CHARACTER_VALUE));
  installRoll(6);
  const passed = await runFormulaPassFail({ ...runnerArgs(pass), dc: lowest.target });
  assert.equal(passed.success, true, 'a 6 stays at or under the least Strength, bonus aside');

  const fail = caseOf('fail');
  installRoll(1);
  const failed = await runFormulaPassFail(runnerArgs(fail));
  assert.deepEqual([failed.success, failed.data.target], [false, 12]);

  const otherwise = caseOf('otherwise');
  const highest = targetFor(otherwise, strength(30));
  installRoll(1);
  const routed = await runFormulaRouted({
    ...runnerArgs(otherwise),
    dc: highest.target,
    fixedOutcomes: [],
    triggers: [],
    clampToNearest: true,
  });
  assert.deepEqual([routed.data.outcomeId, routed.success], ['under-otherwise', false]);

  const refused = targetFor(caseOf('misconfigured'), strength(12));
  assert.deepEqual([refused.ok, refused.reason], [false, 'unresolved-path']);
  assert.deepEqual(
    UNDER_CHAT_CARD_CASES.map(({ id }) => id),
    ['pass', 'fail', 'otherwise', 'misconfigured']
  );
});

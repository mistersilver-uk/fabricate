/**
 * The real-Foundry count chat card assertions (issue 2006), driven over cards the shipped renderer
 * builds, so a change to the card's markup reaches these checks rather than a hand-written copy.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COUNT_CHAT_CARD_CASES,
  countCardFailures,
  pickCraftCardMessage,
  summarizeCraftCard,
} from '../scripts/lib/countChatCardEvidence.js';
import { resolvePool } from '../src/systems/countEvaluation.js';
import { normalizeCheckEvaluation } from '../src/systems/normalize/checkEvaluation.js';
import { executedCheckDisplay } from '../src/ui/presenters/checkDisplay.js';
import { buildCraftingChatContent } from '../src/ui/presenters/CraftingChatCard.js';

import { OVER_FIXED_DATA, PUBLIC, shippedLocalize } from './helpers/checkEvidenceFixtures.js';

const die = (index, face, marks = {}) => ({
  index,
  face,
  active: true,
  explodedFrom: null,
  ...marks,
});

/** What each deterministic case executes: its dice in append order and its net. */
const EXECUTED = {
  pass: {
    results: [
      die(0, 4, { qualified: true, exploded: true }),
      die(1, 2, { qualified: true, exploded: true }),
      die(2, 3, { qualified: true, explodedFrom: 0 }),
      die(3, 6, { qualified: true, explodedFrom: 1 }),
    ],
    qualified: 4,
    cancelled: 0,
    required: 2,
    base: 2,
    threshold: 1,
  },
  fail: {
    results: [die(0, 5), die(1, 3)],
    qualified: 0,
    cancelled: 0,
    required: 1,
    base: 2,
    threshold: 7,
  },
  botch: {
    results: [
      die(0, 6, { cancelled: true }),
      die(1, 2, { cancelled: true }),
      die(2, 1, { cancelled: true }),
    ],
    qualified: 0,
    cancelled: 3,
    required: 1,
    base: 3,
    threshold: 7,
  },
  zero: { results: [], qualified: null, cancelled: null, required: 1, base: 0, threshold: 4 },
};

function countCard(caseId, visibility = PUBLIC) {
  const { results, qualified, cancelled, required, base, threshold } = EXECUTED[caseId];
  const zeroPool = results.length === 0;
  const net = zeroPool ? null : qualified - cancelled;
  const margin = zeroPool ? null : net - required;
  const countDisplay = {
    die: 6,
    results,
    qualified,
    cancelled,
    net,
    required,
    margin,
    zeroPool,
    pool: { base, terms: [], rolled: zeroPool ? 0 : base },
    threshold: { anchor: threshold, source: 'fixed', terms: [], effective: threshold },
  };
  const data = {
    product: 'count',
    direction: 'over',
    comparison: 'meet',
    dc: null,
    target: threshold,
    total: net,
    successes: qualified,
    cancelled,
    margin,
    ...(zeroPool && { zeroPool: true }),
  };
  const check = executedCheckDisplay({ data, visibility, countDisplay });
  return buildCraftingChatContent(
    {
      status: net !== null && net >= required ? 'succeeded' : 'failed',
      actorName: 'Smoke Crafter',
      recipeName: 'Smoke Count Charm',
      rollValue: net,
      check,
    },
    shippedLocalize
  );
}

/** The count Roll message the execute posts: its dice in Foundry's own result flags. */
function countRollMessage(caseId, edit = (results) => results) {
  const results = EXECUTED[caseId].results.map((entry) => ({
    result: entry.face,
    active: true,
    ...(entry.qualified && { success: true }),
    ...(entry.cancelled && { failure: true }),
    ...(entry.exploded && { exploded: true }),
  }));
  return { className: 'FabricateCountRoll', results: edit(results) };
}

const rollsFor = (caseId) => (caseId === 'zero' ? [] : [countRollMessage(caseId)]);

test('the smoke cases roll the deterministic configurations through the real normalizer', () => {
  assert.deepEqual(
    COUNT_CHAT_CARD_CASES.map(({ id }) => id),
    ['pass', 'fail', 'botch', 'zero', 'over-control']
  );
  const pools = Object.fromEntries(
    COUNT_CHAT_CARD_CASES.filter(({ check }) => check.evaluation.product === 'count').map(
      ({ id, check }) => {
        const evaluation = normalizeCheckEvaluation(check.evaluation);
        return [id, resolvePool({ evaluation, thresholdMode: check.thresholdMode })];
      }
    )
  );
  for (const [id, pool] of Object.entries(pools)) assert.equal(pool.ok, true, id);
  assert.deepEqual(pools.pass.policy.explode, { kind: 'from', value: 1, once: true });
  assert.equal(pools.pass.policy.threshold, 1, 'every d6 meets 1');
  assert.equal(pools.fail.policy.threshold, 7, 'no d6 reaches 7');
  assert.equal(pools.botch.policy.cancel.value, 6, 'every face of a d6 is 6 or under');
  assert.equal(pools.zero.policy.zeroPool, true);
});

test('each public count card the renderer builds passes its own case, and only its own', () => {
  for (const caseId of ['pass', 'fail', 'botch', 'zero']) {
    const card = countCard(caseId);
    assert.deepEqual(
      countCardFailures(caseId, { card, rollMessages: rollsFor(caseId) }),
      [],
      caseId
    );
  }
  assert.notDeepEqual(
    countCardFailures('pass', { card: countCard('fail'), rollMessages: rollsFor('fail') }),
    [],
    'a failed card cannot pass as the passing case'
  );
  assert.notDeepEqual(
    countCardFailures('botch', { card: countCard('fail'), rollMessages: rollsFor('fail') }),
    []
  );
});

test('the card must agree with its count Roll die for die', () => {
  const card = countCard('pass');
  const unexploded = countRollMessage('pass', (results) =>
    results.map((result, index) => (index === 0 ? { ...result, exploded: false } : result))
  );
  assert.match(
    countCardFailures('pass', { card, rollMessages: [unexploded] }).join('\n'),
    /disagree with the Roll/
  );
  assert.match(
    countCardFailures('pass', { card, rollMessages: [] }).join('\n'),
    /0 count Roll messages/
  );
  assert.match(
    countCardFailures('zero', {
      card: countCard('zero'),
      rollMessages: [countRollMessage('fail')],
    }).join('\n'),
    /posted a roll message/
  );
});

test('a count card rolled in any other mode states no tiles or rows, so it fails every case', () => {
  const card = countCard('pass', { rollMode: 'gmroll', secret: false });
  const summary = summarizeCraftCard(card);
  assert.deepEqual([summary.tiles, summary.evidence, summary.countSummary], [[], [], false]);
  assert.notDeepEqual(countCardFailures('pass', { card, rollMessages: rollsFor('pass') }), []);
});

test('the summed control states its Needed and Margin rows and no count evidence', () => {
  const card = buildCraftingChatContent(
    {
      status: 'succeeded',
      actorName: 'Smoke Crafter',
      recipeName: 'Smoke Count Charm',
      rollValue: 45,
      check: executedCheckDisplay({ data: { ...OVER_FIXED_DATA }, visibility: PUBLIC }),
    },
    shippedLocalize
  );
  const summed = { className: 'Roll', results: [{ result: 15, active: true }] };
  assert.deepEqual(countCardFailures('over-control', { card, rollMessages: [summed] }), []);
  assert.notDeepEqual(
    countCardFailures('over-control', { card: countCard('pass'), rollMessages: [summed] }),
    []
  );
});

/** The fail case's count display, `net` and `required` overridable in isolation. */
function failCountDisplay({ net = 0, required = 1 } = {}) {
  const { results, qualified, cancelled, base, threshold } = EXECUTED.fail;
  return {
    die: 6,
    results,
    qualified,
    cancelled,
    net,
    required,
    margin: required === null ? null : net - required,
    zeroPool: false,
    pool: { base, terms: [], rolled: base },
    threshold: { anchor: threshold, source: 'fixed', terms: [], effective: threshold },
  };
}

/** A card built from the fail case's check display, its `check` fully overridable. */
function failCard(check) {
  return buildCraftingChatContent(
    {
      status: 'failed',
      actorName: 'Smoke Crafter',
      recipeName: 'Smoke Count Charm',
      rollValue: 0,
      check,
    },
    shippedLocalize
  );
}

test('the botch pill must agree with a botched net, not just the failing case', () => {
  const countDisplay = failCountDisplay({ net: -1 });
  const check = executedCheckDisplay({
    data: {
      product: 'count',
      direction: 'over',
      comparison: 'meet',
      dc: null,
      target: EXECUTED.fail.threshold,
      total: -1,
      successes: 0,
      cancelled: 0,
      margin: -1,
    },
    visibility: PUBLIC,
    countDisplay,
  });
  assert.match(
    countCardFailures('fail', { card: failCard(check), rollMessages: rollsFor('fail') }).join('\n'),
    /fail: botch pill shown/
  );
});

test('the needed row must be present whenever the case expects one', () => {
  const countDisplay = failCountDisplay({ required: null });
  const check = executedCheckDisplay({
    data: {
      product: 'count',
      direction: 'over',
      comparison: 'meet',
      dc: null,
      target: EXECUTED.fail.threshold,
      total: 0,
      successes: 0,
      cancelled: 0,
      margin: null,
    },
    visibility: PUBLIC,
    countDisplay,
  });
  assert.match(
    countCardFailures('fail', { card: failCard(check), rollMessages: rollsFor('fail') }).join('\n'),
    /fail: no needed row/
  );
});

test('the count summary must replace the numeric roll row even without dice evidence', () => {
  // `countDisplay: null` withholds statesCountEvidence's gate, which the evidence-row loop
  // shares (issue 2005/2006's renderer): a card with no count evidence at all necessarily
  // loses its 'result' row too, so this fixture also trips that loop's check — unavoidable,
  // not a separate gap. `rollValue: 0` (not null) keeps the head from going fully empty, so
  // the pill still renders and stays comparable to the case's expected result.
  const check = executedCheckDisplay({
    data: {
      product: 'count',
      direction: 'over',
      comparison: 'meet',
      dc: null,
      target: EXECUTED.zero.threshold,
      total: null,
      successes: null,
      cancelled: null,
      margin: null,
      zeroPool: true,
    },
    visibility: PUBLIC,
    countDisplay: null,
  });
  const card = buildCraftingChatContent(
    {
      status: 'failed',
      actorName: 'Smoke Crafter',
      recipeName: 'Smoke Count Charm',
      rollValue: 0,
      check,
    },
    shippedLocalize
  );
  assert.match(
    countCardFailures('zero', { card, rollMessages: rollsFor('zero') }).join('\n'),
    /zero: the count summary line must replace the numeric roll row/
  );
});

test('the assertions bind to the one crafting card the execute created', () => {
  const card = { id: 'card', content: countCard('fail') };
  const roll = { id: 'roll', content: '<div class="dice-roll"></div>' };
  assert.equal(pickCraftCardMessage([roll, card]).message, card);
  assert.match(pickCraftCardMessage([roll]).error, /created 0 crafting cards/);
  assert.match(pickCraftCardMessage([card, { ...card, id: 'other' }]).error, /created 2/);
});

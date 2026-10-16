/**
 * Issue 1773 PR3: a result-side choice group's award logic (`choiceGroupAward.js`) against a Roll
 * double scripted by formula: N once, the selection once per award against the crafting
 * character, the ladder read with a clamp and never a gap, repeats, the cap, and the pick rules.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  awardPickRefusal,
  awardRoutedResults,
  drawRolledAwards,
  groupAwardRecord,
  holdsUnsettledAwardChoice,
  pendingAwardChoiceRecord,
  selectFromLadder,
  selectionLadder,
  trimRunHistory,
} from '../src/systems/choiceGroupAward.js';

import { scriptedFormulaRoll } from './helpers/scriptedFormulaRoll.js';

const member = (id, from, to, extra = {}) => ({
  id,
  componentId: `comp-${id}`,
  quantity: 1,
  selectionRange: { from, to },
  ...extra,
});

/** Authored out of ladder order, with a hole at 6 and 7. */
const LADDER = [member('c', 11, 20), member('a', 1, 5), member('b', 8, 10)];

const rolledGroup = (extra = {}) => ({
  id: 'carrier',
  chooser: 'rolled',
  awardStrategy: 'upTo',
  awardCountFormula: '1d3',
  selectionFormula: '1d20',
  alternatives: LADDER,
  ...extra,
});

const crafter = { getRollData: () => ({ who: 'crafter' }) };

/** Award `group` as the only routed result, recording which members `awardOne` was handed. */
async function award(group, script, { actor = crafter, role } = {}) {
  const roll = scriptedFormulaRoll(script);
  const awarded = [];
  const answer = await awardRoutedResults([{ id: 'set', role, results: [group] }], {
    actor,
    Roll: roll.Roll,
    awardOne: async (result, carrier) => {
      awarded.push([result.id, carrier?.id ?? null]);
    },
  });
  return { ...answer, awarded, counts: roll.counts, rollData: roll.rollData };
}

test('1773 V&A 8: up to 3 by roll draws three distinct rungs in order, the count rolled apart', async () => {
  const { awarded, counts, groupAwards } = await award(rolledGroup(), {
    '1d3': [3],
    '1d20': [1, 9, 15],
  });
  assert.deepEqual(awarded, [
    ['a', 'carrier'],
    ['b', 'carrier'],
    ['c', 'carrier'],
  ]);
  assert.deepEqual(counts, { '1d3': 1, '1d20': 3 }, 'one count roll, one selection roll per award');
  assert.deepEqual(groupAwards, [
    {
      choiceId: 'carrier',
      chooser: 'rolled',
      awardStrategy: 'upTo',
      count: 3,
      countRoll: { formula: '1d3', total: 3 },
      selections: [
        { alternativeId: 'a', roll: { formula: '1d20', total: 1 } },
        { alternativeId: 'b', roll: { formula: '1d20', total: 9 } },
        { alternativeId: 'c', roll: { formula: '1d20', total: 15 } },
      ],
    },
  ]);
});

test('1773 V&A 8: an exhausted draw rolls no more than the members it has', async () => {
  const group = rolledGroup({ awardCountFormula: null, awardCount: 5 });
  const { awarded, counts } = await award(group, { '1d20': [20, 20, 20, 20, 20] });
  assert.deepEqual(
    awarded.map(([id]) => id),
    ['c', 'b', 'a']
  );
  assert.deepEqual(counts, { '1d20': 3 }, 'three members, three selection rolls');
});

test('1773 V&A 9: without repeats each later roll reads the members not yet awarded', async () => {
  const { awarded } = await award(rolledGroup(), { '1d3': [3], '1d20': [1, 1, 1] });
  assert.deepEqual(
    awarded.map(([id]) => id),
    ['a', 'b', 'c'],
    'a roll below every remaining start falls to the lowest remaining rung'
  );
});

test('1773 V&A 9: with repeats the count is exact and a member may repeat', async () => {
  const group = rolledGroup({ withReplacement: true, awardCountFormula: null, awardCount: 4 });
  const { awarded, counts } = await award(group, { '1d20': [1, 1, 9, 1] });
  assert.deepEqual(
    awarded.map(([id]) => id),
    ['a', 'a', 'b', 'a']
  );
  assert.equal(counts['1d20'], 4);
});

test('1773 scenario "A selection roll lands between two ranges": the hole falls to the rung below', () => {
  const ladder = selectionLadder(LADDER);
  assert.deepEqual(
    ladder.map((entry) => entry.id),
    ['a', 'b', 'c'],
    'the ladder reads range starts, not authored order'
  );
  const pick = (total) => selectFromLadder(ladder, total).id;
  assert.equal(pick(6), 'a');
  assert.equal(pick(7), 'a');
});

test('1773 V&A 8: rolls at a start and an end, below every start and above every end clamp', () => {
  const ladder = selectionLadder(LADDER);
  const pick = (total) => selectFromLadder(ladder, total).id;
  assert.equal(pick(1), 'a', 'at the lowest start');
  assert.equal(pick(5), 'a', 'at an end');
  assert.equal(pick(8), 'b', 'at a start');
  assert.equal(pick(10), 'b');
  assert.equal(pick(11), 'c');
  assert.equal(pick(-3), 'a', 'below every start selects the lowest');
  assert.equal(pick(99), 'c', 'above every rung selects the highest');
  const withoutLowest = ladder.filter((entry) => entry.id !== 'a');
  assert.equal(selectFromLadder(withoutLowest, 1).id, 'b', 'clamps to the new lowest rung');
});

test('1773 V&A 8: the selection reads the crafting character roll data', async () => {
  const actor = { getRollData: () => ({ who: 'crafting character' }) };
  const { rollData } = await award(rolledGroup(), { '1d3': [1], '1d20': [4] }, { actor });
  assert.deepEqual(
    rollData.map((entry) => entry.data.who),
    ['crafting character', 'crafting character']
  );
});

test('1773 V&A 8: a count above 64 is capped at 64', async () => {
  const group = rolledGroup({ withReplacement: true, awardCountFormula: '100' });
  const { groupAwards, counts } = await award(group, { 100: [100], '1d20': [1] });
  assert.equal(groupAwards[0].count, 64);
  assert.equal(counts['1d20'], 64);
});

test('1773 scenario "A rolled count comes up zero": nothing is awarded and no choice is left', async () => {
  for (const chooser of ['rolled', 'playerChooses']) {
    const group = rolledGroup({ chooser, awardCountFormula: '1d4-4' });
    const answer = await award(group, { '1d4-4': [-2] });
    assert.deepEqual(answer.awarded, [], chooser);
    assert.deepEqual(answer.pendingAwardChoices, [], `${chooser}: no pending choice`);
    assert.equal(answer.groupAwards[0].count, 0);
    assert.deepEqual(answer.groupAwards[0].selections, []);
    assert.equal(answer.counts['1d20'], undefined, 'no selection is rolled');
  }
});

test('1773 scenario "A player picks a reward at award time": the group awards nothing yet', async () => {
  const group = rolledGroup({ chooser: 'playerChooses', awardCountFormula: null, awardCount: 2 });
  const { awarded, groupAwards, pendingAwardChoices } = await award(group, {});
  assert.deepEqual(awarded, []);
  assert.deepEqual(groupAwards, []);
  assert.deepEqual(pendingAwardChoices, [
    {
      choiceId: 'carrier',
      resultGroupId: 'set',
      awardStrategy: 'upTo',
      count: 2,
      alternatives: LADDER.map(({ selectionRange: _range, ...snapshot }) => snapshot),
    },
  ]);
});

test('1773 V&A 8: a failure-role set awards its group on the same terms', async () => {
  const { awarded } = await award(
    rolledGroup({ awardStrategy: 'anyOne' }),
    { '1d20': [9] },
    {
      role: 'failure',
    }
  );
  assert.deepEqual(awarded, [['b', 'carrier']]);
});

test('1773 V&A 8: a draw without a selection formula refuses rather than awarding nothing', async () => {
  const roll = scriptedFormulaRoll({});
  await assert.rejects(
    drawRolledAwards(rolledGroup({ selectionFormula: null }), crafter, {
      Roll: roll.Roll,
      count: 1,
    }),
    /needs a selection formula/
  );
});

test('1773: a group with no alternatives left draws nothing, even with repeats', async () => {
  const roll = scriptedFormulaRoll({ '1d20': [5] });
  const empty = rolledGroup({ alternatives: [], withReplacement: true });
  assert.deepEqual(await drawRolledAwards(empty, crafter, { Roll: roll.Roll, count: 2 }), []);
  assert.deepEqual(roll.counts, {}, 'and rolls nothing');
});

const choice = (extra = {}) => ({
  choiceId: 'carrier',
  awardStrategy: 'upTo',
  count: 2,
  alternatives: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  ...extra,
});

test('1773 scenario "A player picks fewer than N": one or two picks settle, a third is refused', () => {
  const claimable = () => true;
  assert.equal(awardPickRefusal(choice(), ['a'], claimable), null);
  assert.equal(awardPickRefusal(choice(), ['a', 'b'], claimable), null);
  assert.match(awardPickRefusal(choice(), ['a', 'b', 'c'], claimable), /Too many/);
});

test('1773 V&A 12: the pick rules refuse what a settle cannot honour', () => {
  const claimable = (entry) => entry.id !== 'c';
  const refused = (picks, extra = {}) => awardPickRefusal(choice(extra), picks, claimable);
  assert.match(refused([]), /Pick a reward/, 'zero picks while a member is claimable');
  assert.match(refused(['a', 'a']), /once/, 'a duplicate');
  assert.match(refused(['z']), /names no alternative/, 'an id outside the snapshot');
  assert.match(refused(['a', 'b'], { awardStrategy: 'anyOne' }), /Too many/, 'two under anyOne');
  assert.match(refused(['c']), /cannot be claimed/, 'an unclaimable pick');
  assert.match(refused(['a'], { settledAt: 5, outcome: 'awarded' }), /already settled/);
  assert.equal(
    awardPickRefusal(choice(), [], () => false),
    null,
    'zero picks settle a choice with no claimable member'
  );
  assert.match(
    awardPickRefusal(choice({ count: 1 }), ['a', 'b'], claimable),
    /Too many/,
    'the ceiling is min(N, members)'
  );
});

test('1773 V&A 15: history trimming keeps a run that still owes an award choice', () => {
  const owed = { id: 'owed', steps: [{ pendingAwardChoices: [choice()] }] };
  const settled = {
    id: 'settled',
    steps: [{ pendingAwardChoices: [choice({ settledAt: 3, outcome: 'awarded' })] }],
  };
  const history = [
    ...Array.from({ length: 50 }, (_, index) => ({ id: `run-${index}` })),
    owed,
    settled,
  ];
  assert.deepEqual(
    trimRunHistory(history, 50).map((run) => run.id),
    [...history.slice(0, 50).map((run) => run.id), 'owed']
  );
  const newest = [owed, ...history.slice(0, 50), { id: 'run-50' }];
  assert.deepEqual(
    trimRunHistory(newest, 50).map((run) => run.id),
    ['owed', ...history.slice(0, 50).map((run) => run.id)],
    'an owed run does not take a place under the cap'
  );
  assert.equal(holdsUnsettledAwardChoice(owed), true);
  assert.equal(holdsUnsettledAwardChoice(settled), false);
  assert.equal(holdsUnsettledAwardChoice(owed.steps[0]), true, 'a step answers for itself');
});

test('1773: the group records persist their shape and drop what is malformed', () => {
  assert.equal(groupAwardRecord({ choiceId: 'g', count: -1, selections: [] }), null);
  assert.deepEqual(
    groupAwardRecord({
      choiceId: 'g',
      chooser: 'rolled',
      awardStrategy: 'anyOne',
      count: 1,
      selections: [{ alternativeId: 'a', roll: { formula: '1d4', total: 2 }, live: {} }, {}],
      extra: true,
    }),
    {
      choiceId: 'g',
      chooser: 'rolled',
      awardStrategy: 'anyOne',
      count: 1,
      selections: [{ alternativeId: 'a', roll: { formula: '1d4', total: 2 } }],
    }
  );
  const pending = pendingAwardChoiceRecord({
    ...choice(),
    resultGroupId: 'set',
    picks: ['a'],
    settledAt: 9,
    outcome: 'awarded',
  });
  assert.deepEqual(pending.picks, ['a']);
  assert.equal(pending.outcome, 'awarded');
  const unsettled = pendingAwardChoiceRecord({ ...choice(), resultGroupId: 'set', picks: ['a'] });
  assert.ok(!('picks' in unsettled), 'picks are written only with the settle');
  assert.ok(!('resultRowId' in unsettled), 'no row id is written for a choice without one');
  const linked = pendingAwardChoiceRecord({ ...choice(), resultRowId: 'set:carrier:0' });
  assert.equal(linked.resultRowId, 'set:carrier:0', "the carrier's row id is kept for the settle");
});

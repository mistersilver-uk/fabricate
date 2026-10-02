import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  actionDeltas,
  additionalDiceCopy,
  bulkAdditionalDiceNoticeText,
  describeAdditionalDice,
} from '../src/ui/presenters/additionalDicePrompt.js';
import {
  buildBulkPromptData,
  promptActions,
  promptBulkCheckRoll,
} from '../src/ui/svelte/apps/crafting/rollPrompt.js';
import { stubPromptSurface } from './helpers/rollPromptDialogStub.js';

const subjects = [
  { name: 'Ore', need: { kind: 'dc', dc: 17 } },
  { name: 'Scrap', need: { kind: 'noCheck' } },
  { name: 'Map', need: { kind: 'noSingleTarget' } },
];

async function open(args, answer) {
  const surface = stubPromptSurface(() => answer);
  try {
    const result = await promptBulkCheckRoll(args);
    return { view: surface.view, result };
  } finally {
    surface.restore();
  }
}

describe('bulk roll prompt adapter', () => {
  it('preserves one decision for a mixed batch', async () => {
    const { view, result } = await open(
      { count: 3, subjects },
      { confirmed: true, bonus: '+3', rollMode: 'blindroll', advantage: 'normal' }
    );
    assert.equal(view.kind, 'bulk');
    assert.equal(view.allowAdvantage, false);
    assert.deepEqual(
      view.subjects,
      subjects.map((subject, index) => ({ ...subject, needText: ['DC 17', 'No check', 'No single target'][index] })),
      'each need arrives formatted beside its raw shape'
    );
    assert.equal(view.dcText, '', 'a batch has no single DC');
    assert.deepEqual(result, { confirmed: true, bonus: '3', rollMode: 'blindroll', advantage: 'normal' });
  });

  it('formats a roll-under row as a target', async () => {
    const { view } = await open({ count: 1, subjects: [{ name: 'Gear', need: { kind: 'target', target: 12 } }] }, null);
    assert.equal(view.subjects[0].needText, 'Target 12');
  });

  it('counts the batch, not the rows, and names the activity and one actor when known', () => {
    assert.equal(buildBulkPromptData({ count: 25, subjects }).subtitle, '25 items');
    assert.equal(buildBulkPromptData({ subjects: [...subjects, subjects[0]] }).subtitle, '4 items');
    const fallback = buildBulkPromptData({ count: 3 });
    assert.equal(fallback.title, 'Bulk check');
    assert.deepEqual(fallback.subjects, []);
    const named = buildBulkPromptData({ count: 3, subjects, activity: 'Salvage', actorName: 'Brenna' });
    assert.equal(named.title, 'Salvage checks');
    assert.equal(named.subtitle, 'Brenna · 3 items');
    assert.equal(buildBulkPromptData({ count: 2, activity: '$&', actorName: '$1' }).subtitle, '$1 · 2 items');
  });

  it('computes direction from the rows: all-target is under, otherwise over', () => {
    const under = [{ need: { kind: 'target', target: 12 } }, { need: { kind: 'target', target: 9 } }];
    const mixed = [{ need: { kind: 'target', target: 12 } }, { need: { kind: 'dc', dc: 15 } }];
    assert.equal(buildBulkPromptData({ subjects: under }).direction, 'under');
    assert.equal(buildBulkPromptData({ subjects: mixed }).direction, 'over');
    assert.equal(buildBulkPromptData({ subjects: [] }).direction, 'over');
  });

  it('counts an under character-value row as rolling under, and an over one as not', () => {
    const target = { need: { kind: 'target', target: 12 } };
    const underValue = { need: { kind: 'noSingleTarget', direction: 'under' } };
    const overValue = { need: { kind: 'noSingleTarget', direction: 'over' } };
    assert.equal(buildBulkPromptData({ subjects: [target, underValue] }).direction, 'under');
    assert.equal(buildBulkPromptData({ subjects: [target, overValue] }).direction, 'over');
    assert.equal(buildBulkPromptData({ subjects: [{ need: { kind: 'noSingleTarget' } }] }).direction, 'over');
  });

  it('gives an all-target batch the roll-under bonus help; a mixed batch keeps roll-over copy', async () => {
    const under = [
      { name: 'Tempered Blade', need: { kind: 'target', target: 12 } },
      { name: 'Fitted Hilt', need: { kind: 'target', target: 9 } },
    ];
    const mixed = [
      { name: 'Tempered Blade', need: { kind: 'target', target: 12 } },
      { name: 'Ore', need: { kind: 'dc', dc: 17 } },
    ];
    const { view: underView } = await open({ subjects: under }, null);
    assert.equal(
      underView.labels.bonusHelp,
      'A bonus raises the target. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
    );
    const { view: mixedView } = await open({ subjects: mixed }, null);
    assert.equal(
      mixedView.labels.bonusHelp,
      'A bonus adds to the total. A rolled bonus such as 1d4 is rolled with the check.'
    );
  });

  it('keeps count-only companion calls operable without subjects', async () => {
    const { view, result } = await open({ count: 3 }, { confirmed: true, bonus: '' });
    assert.deepEqual(view.subjects, []);
    assert.equal(view.subtitle, '3 items');
    assert.deepEqual(result, { confirmed: true, bonus: null, rollMode: 'publicroll', advantage: 'normal' });
  });

  it('offers the unchanged three advantage results', async () => {
    const { view, result } = await open(
      { allowAdvantage: true, subjects },
      { confirmed: true, advantage: 'advantage' }
    );
    assert.equal(view.allowAdvantage, true);
    assert.equal(result.advantage, 'advantage');
    assert.ok(!Object.hasOwn(result, 'chosenModifierIds'), 'a batch offers no modifier choice');
  });

  it('normalizes dismissal and confirms headlessly', async () => {
    assert.deepEqual((await open({ subjects }, null)).result, { confirmed: false });
    assert.deepEqual(await promptBulkCheckRoll({ count: 3 }), {
      confirmed: true, bonus: null, rollMode: undefined, advantage: 'normal',
    });
  });
});

const EN = JSON.parse(readFileSync(resolve(import.meta.dirname, '../lang/en.json'), 'utf8'));
/** The shipped strings, so a missing or misspelt leaf reads as its fallback, never as a key. */
const shipped = (key, fallback) =>
  key.split('.').reduce((node, segment) => node?.[segment], EN) ?? fallback;

const ACTION_LABELS = { roll: 'Roll', advantage: 'Advantage', disadvantage: 'Disadvantage' };
const COUNT_ADVANTAGE = { advantage: true, disadvantage: true, kind: 'count', detail: { dice: 1 } };
const THREE = actionDeltas(promptActions(COUNT_ADVANTAGE, ACTION_LABELS), COUNT_ADVANTAGE);
const SINGLE = actionDeltas(promptActions(null, ACTION_LABELS), null);

const batchOffer = (over = {}) => ({
  available: 0,
  limit: 0,
  max: 1,
  resourceLabel: 'Momentum',
  unavailable: null,
  reach: null,
  ...over,
});

/** A covered count row: its pool before bought dice and the reach its own prompt would judge. */
function countRow(needed, { base = 2, zeroPoolFails = true, rescued = false, perDieMost = 1 } = {}) {
  return {
    name: `Needs ${needed}`,
    need: { kind: 'successes', count: needed, destination: 'pool' },
    offerSituationalBonus: true,
    additionalDice: {
      countDice: { base, poolDelta: 0, zeroPoolFails, destination: 'pool' },
      reach: { needed, perDieMost, explode: 'off', rescued },
    },
  };
}

/** `countRow` with its needed count withheld, as a progressive or routed row carries it. */
function unstatedRow(options) {
  const row = countRow(1, options);
  return { ...row, additionalDice: { ...row.additionalDice, reach: { ...row.additionalDice.reach, needed: null } } };
}

function judgeBatch(rows, { offer = batchOffer(), deltas = THREE, chosen = 0, bonus = '' } = {}) {
  return describeAdditionalDice({
    offer,
    deltas,
    chosen,
    bonus,
    rows,
    rolls: rows.filter((row) => row.additionalDice).length,
    labels: additionalDiceCopy(offer, shipped),
    actorName: 'Brenna',
  });
}

const blockedActions = (view) =>
  ['disadvantage', 'normal', 'advantage'].filter((action) => view.blocked[action]);

describe('bulk additional dice (issue 2008)', () => {
  it('states the whole batch spend and an unaffordable batch (frame 36, AD47)', () => {
    const four = [countRow(1), countRow(1), countRow(1), countRow(1)];
    const unaffordable = judgeBatch(four, { offer: batchOffer({ available: 2 }) });
    assert.equal(unaffordable.resourceLine, 'Momentum 2 available');
    assert.equal(unaffordable.spendLine, 'Spends 0 Momentum across 4 rolls (0 each)');
    assert.deepEqual(unaffordable.message, {
      tone: 'info',
      text: 'Not enough Momentum to buy a die for every roll.',
    });
    const three = four.slice(1);
    const offer = batchOffer({ available: 3, limit: 1 });
    assert.equal(judgeBatch(three, { offer, chosen: 1 }).spendLine, 'Spends 3 Momentum across 3 rolls (1 each)');
    const bare = batchOffer({ available: 3, limit: 1, resourceLabel: '' });
    assert.equal(judgeBatch(three, { offer: bare, chosen: 1 }).spendLine, 'Spends 3 across 3 rolls (1 each)');
    assert.equal(judgeBatch([countRow(1)], { offer, chosen: 1 }).spendLine, 'Spends 1 Momentum');
  });

  it('disables only the actions every covered roll fails under, and marks no row Advantage reaches (D3)', () => {
    const view = judgeBatch([countRow(3), countRow(3), countRow(3)]);
    assert.deepEqual(blockedActions(view), ['disadvantage', 'normal']);
    assert.equal(view.blockNote, 'Only Advantage can reach the successes needed.');
    assert.deepEqual(view.unreachableRows, [false, false, false]);
  });

  it('disables every action and marks every row when no roll can reach (D3, AD47)', () => {
    const view = judgeBatch([countRow(4), countRow(4)]);
    assert.deepEqual(blockedActions(view), ['disadvantage', 'normal', 'advantage']);
    assert.equal(view.blockNote, 'Rolling is disabled: none of these rolls can reach the successes they need.');
    assert.deepEqual(view.unreachableRows, [true, true]);
    const one = judgeBatch([countRow(4)], { deltas: SINGLE });
    assert.deepEqual(blockedActions(one), ['normal']);
    assert.equal(one.blockNote, 'Rolling is disabled: this attempt cannot reach the successes it needs.');
  });

  it('keeps every action while some covered roll can still succeed, marking only the row that cannot', () => {
    const view = judgeBatch([countRow(1), countRow(5), countRow(2)]);
    assert.deepEqual(blockedActions(view), []);
    assert.equal(view.blockNote, '');
    assert.deepEqual(view.unreachableRows, [false, true, false]);
  });

  it('lets a rescued row, an unjudged row or a row with no offer keep every action (AD47)', () => {
    const unjudged = { ...countRow(4), additionalDice: { countDice: null, reach: null } };
    const summed = { name: 'Ore', need: { kind: 'dc', dc: 18 }, offerSituationalBonus: true };
    for (const [label, keeper] of [
      ['rescued', countRow(4, { rescued: true })],
      ['unjudged', unjudged],
      ['without an offer', summed],
    ]) {
      const view = judgeBatch([countRow(4), countRow(4), keeper]);
      assert.deepEqual(blockedActions(view), [], label);
      assert.deepEqual(view.unreachableRows, [true, true, false], label);
    }
    const noCheck = { name: 'Scrap', need: { kind: 'noCheck' } };
    assert.deepEqual(
      blockedActions(judgeBatch([countRow(4), noCheck])),
      ['disadvantage', 'normal', 'advantage'],
      'a row that rolls nothing has no say'
    );
  });

  it('never lets a rescue lift a zero pool, nor marks a row whose needed count it may not state (R4)', () => {
    const view = judgeBatch([
      countRow(1, { base: -1, rescued: true }),
      unstatedRow({ base: -1, rescued: true }),
    ]);
    assert.deepEqual(blockedActions(view), ['disadvantage', 'normal', 'advantage']);
    assert.deepEqual(view.unreachableRows, [true, false], 'a null needed count is never stated');
  });

  it('judges the typed batch bonus on every row whose own check takes it', () => {
    const rows = [countRow(4), countRow(4)];
    assert.deepEqual(blockedActions(judgeBatch(rows, { bonus: '+2' })), ['disadvantage']);
    assert.deepEqual(blockedActions(judgeBatch(rows, { bonus: '1d4' })), [], 'a rolled bonus may reach');
    const declined = rows.map((row) => ({ ...row, offerSituationalBonus: false }));
    assert.equal(blockedActions(judgeBatch(declined, { bonus: '+2' })).length, 3);
  });

  it('offers the batch control only over the rows it covers, allowlisted, and answers its dice', async () => {
    const subjects = [
      { ...countRow(1), additionalDice: { ...countRow(1).additionalDice, path: 'system.x' } },
      countRow(2),
      { name: 'Ore', need: { kind: 'dc', dc: 18 } },
      { name: 'Scrap', need: { kind: 'noCheck' } },
    ];
    const additionalDiceOffer = { ...batchOffer({ available: 4, limit: 1 }), path: 'system.x' };
    const { view, result } = await open(
      { count: 4, subjects, actorName: 'Brenna', additionalDiceOffer },
      { confirmed: true, advantage: 'normal', additionalDice: 1 }
    );
    assert.equal(view.additionalDiceRolls, 2, 'never the summed or no-check rows');
    assert.equal(view.actorName, 'Brenna');
    assert.ok(!JSON.stringify(view).includes('system.x'), 'no path reaches the view');
    assert.deepEqual(view.subjects[0].additionalDice.countDice, {
      base: 2,
      poolDelta: 0,
      zeroPoolFails: true,
      destination: 'pool',
    });
    assert.equal(view.labels.additionalDice.cannotReach, 'cannot reach');
    assert.equal(result.additionalDice, 1);
    const above = await open(
      { count: 4, subjects, additionalDiceOffer },
      { confirmed: true, advantage: 'normal', additionalDice: 2 }
    );
    assert.equal(above.result.additionalDiceRefusal, 'choiceAboveLimit', 'never clamped');
    assert.equal((await promptBulkCheckRoll({ count: 4, additionalDiceOffer })).additionalDice, 0);
  });

  it('notes a batch whose rows differ in actor or resource, with no control', async () => {
    const { view } = await open({ count: 2, subjects, additionalDiceMixed: true }, null);
    assert.equal(view.additionalDiceOffer, undefined);
    assert.equal(
      view.labels.additionalDiceMixed,
      'Rolls in this batch use different resources, so no dice can be added.'
    );
    const { view: plain } = await open({ count: 2, subjects }, null);
    assert.equal(plain.labels.additionalDiceMixed, undefined, 'and says nothing otherwise');
  });

  it('words the mid-batch stop, labelled or not, and a refused batch choice', () => {
    const stopped = (resourceLabel) => ({
      items: [{ outcome: 'succeeded' }, { additionalDiceExhaustion: { resourceLabel, done: 2, rolls: 4 } }],
    });
    assert.equal(
      bulkAdditionalDiceNoticeText(stopped('Momentum'), { localize: shipped }),
      'Momentum ran out after 2 of 4 rolls. The rolls already made stand.'
    );
    assert.equal(
      bulkAdditionalDiceNoticeText(stopped(''), { localize: shipped }),
      'The resource ran out after 2 of 4 rolls. The rolls already made stand.'
    );
    const refused = {
      cancelled: true,
      additionalDiceRefusal: 'choiceAboveLimit',
      additionalDiceNotice: { dice: 2, limit: 1 },
    };
    assert.equal(
      bulkAdditionalDiceNoticeText(refused, { localize: shipped }),
      '2 additional dice is more than the 1 that can be added.'
    );
    assert.equal(bulkAdditionalDiceNoticeText({ items: [{ outcome: 'succeeded' }] }), null);
  });
});

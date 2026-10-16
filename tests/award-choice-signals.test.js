/**
 * Issue 1773 PR4: the signals around a pending award choice and the readers of a choice group:
 * the award face's rows, the run's reward attention and state notice, the closed guidance, the
 * chat card's sentence, the group preview and the outcome signature.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { rolledAwardChatParts } from '../src/systems/craftChatEntries.js';
import {
  awardKicker,
  awardSlot,
  canConfirm,
  confirmLabel,
  nextAwardPicks,
} from '../src/ui/presenters/awardChoiceRows.js';
import { buildCraftingChatContent } from '../src/ui/presenters/CraftingChatCard.js';
import { resultOutputRows, resultSignature } from '../src/ui/presenters/resultOutputRows.js';
import { presentHistory } from '../src/ui/svelte/apps/journal/historyPresentation.js';
import { runAttentionPresentation } from '../src/ui/svelte/apps/journal/journalRunStatus.js';
import { runStateNotice } from '../src/ui/svelte/apps/journal/runStateNotice.js';

import { craftWithGroup, pickGroup } from './helpers/choiceGroupWorld.js';

const localize = (key, data) => (data ? `${key}${JSON.stringify(data)}` : key);

const choice = (extra = {}) => ({
  choiceId: 'pick',
  stepIndex: 0,
  awardStrategy: 'upTo',
  count: 2,
  countRoll: null,
  ceiling: 2,
  alternatives: [
    { id: 'gem', kind: 'component', name: 'Gem', quantity: 2, unclaimable: null },
    {
      id: 'coin',
      kind: 'currency',
      name: 'Gold',
      quantity: 3,
      amountText: '3 gp',
      unclaimable: null,
    },
    { id: 'lore', kind: 'knowledge', name: 'Tonic', quantity: 1, unclaimable: 'alreadyKnown' },
  ],
  ...extra,
});

test('1773 V&A 13: the rows cap the picks at the ceiling and never pick an unclaimable tile', () => {
  const upTo = choice();
  assert.deepEqual(nextAwardPicks(upTo, [], 'gem'), ['gem']);
  assert.deepEqual(nextAwardPicks(upTo, ['gem'], 'coin'), ['gem', 'coin']);
  const third = { ...upTo, alternatives: [...upTo.alternatives, { id: 'ore', name: 'Ore' }] };
  assert.deepEqual(nextAwardPicks(third, ['gem', 'coin'], 'ore'), ['gem', 'coin'], 'N+1 refused');
  assert.deepEqual(nextAwardPicks(upTo, ['gem', 'coin'], 'gem'), ['coin'], 'a press unpicks');
  assert.deepEqual(nextAwardPicks(upTo, [], 'lore'), [], 'an unclaimable tile is never picked');
  const anyOne = choice({ awardStrategy: 'anyOne', ceiling: 1 });
  assert.deepEqual(nextAwardPicks(anyOne, ['gem'], 'coin'), ['coin'], 'any one of moves the pick');
});

test('1773 V&A 13: the award slot disables only past the ceiling under up to N, never under any one of', () => {
  const capped = awardSlot(choice(), ['gem', 'coin'], localize);
  assert.deepEqual(
    capped.alternatives.map(({ id, disabled, selected }) => ({ id, disabled, selected })),
    [
      { id: 'gem', disabled: false, selected: true },
      { id: 'coin', disabled: false, selected: true },
      { id: 'lore', disabled: true, selected: false },
    ]
  );
  assert.match(capped.status, /AwardChoice\.Ceiling\{"picked":2,"count":2\}/);
  assert.equal(
    capped.alternatives[2].reading,
    'FABRICATE.App.Journal.AwardChoice.Unclaimable.alreadyKnown{"name":"Tonic"}'
  );
  const open = awardSlot(choice({ awardStrategy: 'anyOne', ceiling: 1 }), ['gem'], localize);
  assert.deepEqual(
    open.alternatives.map((entry) => entry.disabled),
    [false, false, true],
    'only the unclaimable tile is disabled'
  );
  assert.equal(open.status, '');
  assert.deepEqual(
    capped.alternatives.map((entry) => entry.pip),
    ['×2', '3 gp', ''],
    'a component its amount, a credit its unit, a recipe none'
  );
  assert.match(
    capped.alternatives[2].label,
    /TileLabel\{"name":"Tonic","amount":"FABRICATE\.App\.Journal\.AwardChoice\.RecipeAmount"\}/,
    "a recipe's accessible name states that it is a recipe"
  );
});

test('1773: a rolled N reads as its resolved number, and confirm is named for what it claims', () => {
  const rolled = choice({ count: 2, countRoll: { formula: '1d3', total: 2 } });
  assert.match(
    awardKicker(rolled, localize),
    /ChooseUpToRolled\{"count":2,"rolled":2,"formula":"1d3"\}/
  );
  assert.equal(
    awardKicker(choice({ awardStrategy: 'anyOne' }), localize),
    'FABRICATE.App.Journal.AwardChoice.ChooseOne'
  );
  assert.match(confirmLabel(choice(), ['coin'], localize), /ClaimOne\{"name":"Gold"\}/);
  assert.match(confirmLabel(choice(), ['gem', 'coin'], localize), /ClaimMany\{"count":2\}/);
  assert.equal(canConfirm(choice(), []), false, 'zero picks while a tile is claimable');
  const none = choice({ alternatives: [{ id: 'lore', unclaimable: 'alreadyKnown' }] });
  assert.equal(canConfirm(none, []), true, 'with nothing claimable it settles empty');
  assert.match(confirmLabel(none, [], localize), /AwardChoice\.Forfeit/);
});

test('1773: a reward owed outranks every other attention and states its own notice', () => {
  const owed = {
    awardChoicePending: true,
    awaitingChoice: true,
    actions: { disabledReason: 'awardChoicePending' },
  };
  assert.equal(runAttentionPresentation(owed).kind, 'reward');
  assert.equal(runAttentionPresentation({ awaitingChoice: true }).kind, 'choice');
  const notice = runStateNotice(owed, localize);
  assert.equal(notice.title, 'FABRICATE.App.Journal.Notice.RewardTitle');
  assert.equal(notice.blocking, false);
  assert.equal(notice.hooks['data-journal-award-pending'], 'true');
  const recovering = runStateNotice({ ...owed, recoveryEvidence: { required: true } }, localize);
  assert.equal(
    recovering.title,
    'FABRICATE.App.Journal.Notice.RecoveryTitle',
    'recovery outranks it'
  );
});

const noticeFor = (extra) =>
  runStateNotice({ awardChoicePending: true, awardChoices: [choice()], ...extra }, localize);

test('1773: the reward notice and attention are worded for what this viewer can do', () => {
  const read = (extra) => {
    const notice = noticeFor(extra);
    return [notice.title, notice.detail].map((key) => key.replace(/^.*\.Notice\./, ''));
  };
  assert.deepEqual(read({}), ['RewardTitle', 'RewardDetail']);
  assert.deepEqual(read({ awardChoiceBlocker: 'notOwner' }), [
    'RewardWaitingTitle',
    'RewardOwnerDetail',
  ]);
  assert.deepEqual(read({ awardChoiceBlocker: 'notEntitled', awardChoices: [] }), [
    'RewardWaitingTitle',
    'RewardGmDetail',
  ]);
  const unclaimable = (entry) => ({ ...entry, unclaimable: 'unitMissing' });
  const none = choice({ alternatives: choice().alternatives.map(unclaimable) });
  assert.deepEqual(read({ awardChoices: [none] }), ['RewardTitle', 'RewardNoneClaimableDetail']);
  const label = (extra) =>
    runAttentionPresentation({ awardChoicePending: true, ...extra }).labelKey;
  assert.match(label({}), /Status\.awaitingReward$/);
  assert.match(label({ awardChoiceBlocker: 'notOwner' }), /Status\.rewardPending$/);
  assert.match(label({ awardChoiceBlocker: 'notEntitled' }), /Status\.rewardPending$/);
  assert.match(label({ awardChoiceBlocker: 'active-gm-missing' }), /Status\.awaitingReward$/);
});

test('1773: the closed guidance waits on the reward rather than calling the run closed', () => {
  const run = { status: 'succeeded', awardChoicePending: true, steps: [] };
  assert.match(
    presentHistory(run, localize).closed,
    /^FABRICATE\.App\.Journal\.History\.ClosedAwardPending/
  );
});

test('1773: a stage that left a pick states "A reward awaits your choice" on its card', async () => {
  const { cards } = await craftWithGroup(pickGroup());
  const { extraRows } = rolledAwardChatParts(cards[0].createdResults);
  assert.deepEqual(
    extraRows.filter((row) => row.kind === 'awardChoice'),
    [{ kind: 'awardChoice', choiceId: 'pick' }]
  );
  const html = buildCraftingChatContent(
    { status: 'succeeded', actorName: 'Sera', recipeName: 'Tonic', results: extraRows },
    localize
  );
  assert.match(html, /data-reward-kind="awardChoice"[^]*FABRICATE\.Chat\.AwardChoicePending/);
});

const group = (extra = {}) => ({
  id: 'g',
  alternatives: [
    { id: 'gem', componentId: 'gem', quantity: 2 },
    { id: 'coin', kind: 'currency', unit: 'gp', quantity: 3 },
  ],
  ...extra,
});

test('1773 V&A 16: a group signs its settings and alternatives, and never as an empty component', () => {
  const sign = (...results) => resultSignature([{ id: 'set', results }]);
  assert.doesNotMatch(sign(group()), /^:1$/, 'a carrier does not sign :1');
  assert.notEqual(sign(group()), sign({ componentId: 'gem', quantity: 2 }));
  assert.notEqual(sign(group()), sign(group({ chooser: 'rolled' })), 'the chooser signs');
  assert.notEqual(sign(group()), sign(group({ awardStrategy: 'upTo', awardCount: 2 })));
  const swapped = group({ alternatives: group().alternatives.toReversed() });
  assert.equal(sign(group()), sign(swapped), 'alternative order does not sign');
  const upTo = group({ awardStrategy: 'upTo', awardCount: 2 });
  assert.notEqual(sign(upTo), sign(group({ awardStrategy: 'upTo', awardCount: 3 })), 'the count');
  const rolled = (extra = {}) =>
    group({
      chooser: 'rolled',
      selectionFormula: '1d6',
      alternatives: [
        { id: 'gem', componentId: 'gem', quantity: 2, selectionRange: { from: 1, to: 3 } },
        { id: 'ore', componentId: 'ore', quantity: 1, selectionRange: { from: 4, to: 6 } },
      ],
      ...extra,
    });
  assert.notEqual(sign(rolled()), sign(rolled({ selectionFormula: '1d8' })), 'the selection roll');
  assert.notEqual(
    sign(rolled({ awardStrategy: 'upTo', awardCount: 2 })),
    sign(rolled({ awardStrategy: 'upTo', awardCount: 2, withReplacement: true })),
    'replacement'
  );
  const ladder = rolled().alternatives.map((member, index) => ({
    ...member,
    selectionRange: index === 0 ? { from: 1, to: 2 } : { from: 3, to: 6 },
  }));
  assert.notEqual(sign(rolled()), sign(rolled({ alternatives: ladder })), "each member's range");
  assert.equal(
    sign({ componentId: 'gem', quantity: 2 }),
    'gem:2',
    'a plain result signs exactly as before'
  );
  assert.notEqual(
    sign(group()),
    sign(
      group({
        alternatives: [
          group().alternatives[0],
          { id: 'coin', kind: 'currency', unit: 'sp', quantity: 3 },
        ],
      })
    )
  );
});

test('1773: the group preview reads who chooses and how many, over its alternatives', () => {
  const rows = (...results) =>
    resultOutputRows([{ results }], {
      system: { components: [{ id: 'gem', name: 'Gem', img: 'gem.webp' }] },
      currencyUnits: () => [{ id: 'gp', label: 'Gold', abbreviation: 'gp' }],
      taughtName: () => null,
      localize,
    });
  const [player] = rows(group());
  assert.equal(player.kind, 'group');
  assert.equal(player.name, 'FABRICATE.App.Crafting.Io.GroupPlayerAnyOne{}');
  assert.deepEqual(
    player.members.map((member) => member.name),
    ['Gem', 'gp'],
    'an unlabelled currency alternative reads its unit, as a currency result row does'
  );
  const [rolled] = rows(
    group({ chooser: 'rolled', awardStrategy: 'upTo', awardCountFormula: '1d3' })
  );
  assert.equal(rolled.name, 'FABRICATE.App.Crafting.Io.GroupRolledUpTo{"count":"1d3"}');
});

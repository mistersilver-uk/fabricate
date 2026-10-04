/**
 * Issue 1773 PR3: a choice group through the real engine, run manager and serialized actor flags.
 * A rolled group awards its draws through each member's own kind path; a player-chooser group
 * persists a pending choice that the award-choice lane settles once, on an active or terminal run.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { rewardableCrafter } from './helpers/companionRewardWorld.js';
import { createPersistedCraftingHistory } from './helpers/journal-fixtures.js';
import { scriptedFormulaRoll } from './helpers/scriptedFormulaRoll.js';

const CHOOSE = Object.freeze({ operation: 'chooseAward' });
const EXECUTE = Object.freeze({ operation: 'execute' });

const gem = (extra = {}) => ({ id: 'gem', componentId: 'award-stage-0', quantity: 2, ...extra });
const coin = (extra = {}) => ({ id: 'coin', kind: 'currency', unit: 'gp', quantity: 3, ...extra });
const lore = { id: 'lore', kind: 'knowledge', recipeId: 'historical-recipe', quantity: 1 };

const pickGroup = (extra = {}) => ({
  id: 'pick',
  awardStrategy: 'upTo',
  awardCount: 2,
  alternatives: [gem(), coin(), lore],
  ...extra,
});

/** A grant object is bound to the operation it was issued for; the fixture's own string is not. */
function bindGrants(engine) {
  const consume = engine.versionedRunAuthority.consumeExecutionGrant;
  engine.versionedRunAuthority.consumeExecutionGrant = async (grant, context) =>
    typeof grant === 'object' && grant.operation !== context.operation
      ? null
      : consume(grant, context);
}

/** A run whose first stage awards `group`; `act` drives it after the start and answers extras. */
function craftWithGroup(group, { stageCount = 1, script = {}, act = null } = {}) {
  return createPersistedCraftingHistory({
    stageCount,
    drive: async ({ engine, actor, sources, gm, runId, manager, steps }) => {
      rewardableCrafter(actor);
      game.fabricate.getRecipeVisibilityService().isLearnedKnowledgeObservable = () => true;
      Object.assign(globalThis, { Roll: scriptedFormulaRoll(script).Roll });
      bindGrants(engine);
      steps[0].resultGroups[0].results.push(group);
      game.time.worldTime += 60;
      const run = () => manager().getRun(actor, runId);
      const request = (requestId) => ({
        viewer: gm,
        actor,
        componentSourceActors: sources,
        runId,
        expectedRevision: run().runRevision,
        requestId,
        executionGrant: 'grant',
      });
      const world = {
        engine,
        actor,
        manager,
        run,
        execute: (requestId = 'execute') => engine.executeVersionedStage(request(requestId)),
        begin: (requestId = 'begin') => engine.beginVersionedStage(request(requestId)),
        settle: (picks, requestId = 'choose', executionGrant = CHOOSE) =>
          engine.settleAwardChoice({
            actor,
            runId,
            expectedRevision: run().runRevision,
            requestId,
            executionGrant,
            choiceId: group.id,
            picks,
          }),
      };
      const extra = act ? await act(world) : { executed: await world.execute() };
      const learned = actor._source.flags.fabricate?.fabricate?.learnedRecipes ?? {};
      return { ...extra, gp: actor._source.system.currency.gp, learned: Object.keys(learned) };
    },
  });
}

test('1773 V&A 1: a component-only run persists byte-identically to the base commit', async () => {
  const base = JSON.parse(
    readFileSync(new URL('fixtures/choiceGroupBaseShapes.golden.json', import.meta.url), 'utf8')
  );
  const { record } = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async ({ engine, actor, sources, gm, runId, manager }) => {
      game.time.worldTime += 60;
      await engine.executeVersionedStage({
        viewer: gm,
        actor,
        componentSourceActors: sources,
        runId,
        expectedRevision: manager().getRun(actor, runId).runRevision,
        requestId: 'execute',
        executionGrant: 'grant',
      });
      return {};
    },
  });
  assert.equal(JSON.stringify(record), base.record, 'no empty group key, no new effect');
});

const effectIds = (journal) => journal.effects.map((effect) => effect.effectId);
const receiptOf = (journal, id) =>
  journal.effects.find((effect) => effect.effectId === id)?.receipt;
const awarded = (step) => step.createdResults.reduce((sum, entry) => sum + entry.quantity, 0);

test('1773 V&A 8: a rolled group awards each draw through its own kind and records the draw', async () => {
  const group = {
    id: 'loot',
    chooser: 'rolled',
    awardStrategy: 'upTo',
    awardCountFormula: '1d2',
    selectionFormula: '1d10',
    alternatives: [
      gem({ selectionRange: { from: 1, to: 5 } }),
      coin({ quantity: 4, selectionRange: { from: 6, to: 10 } }),
    ],
  };
  const { record, gp } = await craftWithGroup(group, { script: { '1d2': [2], '1d10': [3, 8] } });
  const [step] = record.steps;
  assert.deepEqual(step.groupAwards, [
    {
      choiceId: 'loot',
      chooser: 'rolled',
      awardStrategy: 'upTo',
      count: 2,
      countRoll: { formula: '1d2', total: 2 },
      selections: [
        { alternativeId: 'gem', roll: { formula: '1d10', total: 3 } },
        { alternativeId: 'coin', roll: { formula: '1d10', total: 8 } },
      ],
    },
  ]);
  assert.equal(gp, 5, 'the drawn currency member was credited once');
  assert.deepEqual(step.currencyCredits, [
    { resultId: 'loot', alternativeId: 'coin', unit: 'gp', amount: 4, unitName: 'gp' },
  ]);
  assert.equal(awarded(step), 3, 'the stage result and the drawn component, two of it');
  assert.ok(!('pendingAwardChoices' in step), 'a rolled group leaves no choice');
  const planned = record.executionJournal.effects.find((e) => e.effectId === 'award-rewards');
  assert.deepEqual(planned.planned, ['loot'], 'a group is planned whatever it draws');
});

test('1773 V&A 12: execute persists a player choice and awards nothing from the group', async () => {
  const { record, gp, learned } = await craftWithGroup(pickGroup());
  const [step] = record.steps;
  assert.equal(record.status, 'succeeded', 'the stage completes as today');
  assert.deepEqual(step.pendingAwardChoices, [
    {
      choiceId: 'pick',
      resultGroupId: 'outputs-0',
      awardStrategy: 'upTo',
      count: 2,
      alternatives: [
        { id: 'gem', componentId: 'award-stage-0', quantity: 2 },
        { id: 'coin', kind: 'currency', unit: 'gp', quantity: 3 },
        { id: 'lore', kind: 'knowledge', recipeId: 'historical-recipe', quantity: 1 },
      ],
    },
  ]);
  assert.equal(gp, 1, 'no currency was credited');
  assert.deepEqual(learned, [], 'no recipe was taught');
  assert.equal(awarded(step), 1, 'only the stage result was created');
  assert.deepEqual(
    receiptOf(record.executionJournal, 'award-results').pendingAwardChoices,
    step.pendingAwardChoices,
    'the award receipt carries the choice'
  );
});

test('1773 V&A 12: a settle on a terminal run awards once and keeps the stage history', async () => {
  const { record, gp, learned, settled, again, fresh, beforeJournal } = await craftWithGroup(
    pickGroup(),
    {
      act: async ({ execute, settle, run }) => {
        await execute();
        const before = structuredClone(run().executionJournal);
        const refusedEmpty = await settle([]);
        assert.equal(refusedEmpty.success, false, 'zero picks while a member is claimable');
        return {
          beforeJournal: before,
          settled: await settle(['coin', 'lore']),
          again: await settle(['coin', 'lore']),
          fresh: await settle(['coin'], 'choose-again'),
        };
      },
    }
  );
  assert.equal(settled.success, true, settled.message);
  assert.equal(settled.disposition, 'awarded');
  assert.equal(again.success, true, 'the same request answers its committed outcome');
  assert.equal(fresh.success, false, 'a new request finds the choice settled');
  assert.match(fresh.message, /already settled/);
  assert.equal(gp, 4, 'credited exactly once');
  assert.deepEqual(learned, ['historical-recipe']);

  const [step] = record.steps;
  assert.deepEqual(step.pendingAwardChoices[0].picks, ['coin', 'lore']);
  assert.equal(step.pendingAwardChoices[0].outcome, 'awarded');
  assert.equal(typeof step.pendingAwardChoices[0].settledAt, 'number');
  assert.equal(awarded(step), 1, "the stage's created results are kept");
  assert.deepEqual(step.currencyCredits, [
    { resultId: 'pick', alternativeId: 'coin', unit: 'gp', amount: 3, unitName: 'gp' },
  ]);
  assert.equal(step.knowledgeGrants[0].alternativeId, 'lore');
  assert.deepEqual(step.groupAwards.at(-1).selections, [
    { alternativeId: 'coin' },
    { alternativeId: 'lore' },
  ]);
  assert.deepEqual(record.executionJournal, beforeJournal, 'the stage journal is untouched');
  assert.equal(record.awardChoiceJournal.status, 'committed');
  assert.deepEqual(effectIds(record.awardChoiceJournal), [
    'award-choice',
    'settle-choice',
    'post-chat',
  ]);
});

test('1773 V&A 12: a grant issued for execute is refused for the award choice', async () => {
  const { refused, gp, record } = await craftWithGroup(pickGroup(), {
    act: async ({ execute, settle }) => {
      await execute();
      return { refused: await settle(['coin'], 'choose', EXECUTE) };
    },
  });
  assert.equal(refused.success, false);
  assert.equal(refused.authorityUnavailable, true);
  assert.equal(gp, 1);
  assert.ok(!record.awardChoiceJournal, 'nothing was planned');
});

test('1773 V&A 12: a crash between the award and the settle never awards twice', async () => {
  const { gp, record, retried } = await craftWithGroup(pickGroup(), {
    act: async ({ execute, settle, manager }) => {
      await execute();
      const runs = manager();
      const update = runs.updateExecutionJournal.bind(runs);
      runs.updateExecutionJournal = async (...args) => {
        if (args[2].type === 'effectApplying' && args[2].effectId === 'settle-choice') {
          throw new Error('stopped between award and settle');
        }
        return update(...args);
      };
      await assert.rejects(settle(['coin']), /stopped between award and settle/);
      runs.updateExecutionJournal = update;
      await assert.rejects(settle(['coin'], 'choose-fresh'), { code: 'PLAN_MISMATCH' });
      return { retried: await settle(['coin']) };
    },
  });
  assert.equal(retried.success, true, 'the interrupted request resumes and settles');
  assert.equal(gp, 4, 'the coin was credited once across all three requests');
  assert.equal(record.steps[0].pendingAwardChoices[0].outcome, 'awarded');
});

test('1773 V&A 12: a count of zero persists no choice', async () => {
  const group = pickGroup({ awardCount: undefined, awardCountFormula: '1d2-2' });
  const { record } = await craftWithGroup(group, { script: { '1d2-2': [0] } });
  const [step] = record.steps;
  assert.ok(!('pendingAwardChoices' in step));
  assert.deepEqual(step.groupAwards, [
    {
      choiceId: 'pick',
      chooser: 'playerChooses',
      awardStrategy: 'upTo',
      count: 0,
      countRoll: { formula: '1d2-2', total: 0 },
      selections: [],
    },
  ]);
});

test('1773 V&A 12: a choice with no claimable member settles forfeited', async () => {
  const unclaimable = pickGroup({
    alternatives: [coin({ id: 'mark', unit: 'mark' }), gem({ componentId: 'retired' })],
  });
  const { settled, record, gp } = await craftWithGroup(unclaimable, {
    act: async ({ execute, settle }) => {
      await execute();
      return { settled: await settle([]) };
    },
  });
  assert.equal(settled.success, true, settled.message);
  assert.equal(settled.disposition, 'forfeited');
  assert.equal(gp, 1);
  assert.equal(record.steps[0].pendingAwardChoices[0].outcome, 'forfeited');
  assert.deepEqual(record.steps[0].pendingAwardChoices[0].picks, []);
});

test('1773 V&A 12: a later stage waits on the choice, and a cancelled run keeps it settleable', async () => {
  const { record, gp, refused, due, cancelled, settled } = await craftWithGroup(pickGroup(), {
    stageCount: 2,
    act: async ({ engine, execute, begin, settle, run, actor, manager }) => {
      await execute();
      const blocked = await begin();
      const listed = manager().listDueVersionedRuns(Number.MAX_SAFE_INTEGER);
      const answer = await engine.cancelVersionedRun({
        actor,
        runId: run().id,
        expectedRevision: run().runRevision,
        requestId: 'cancel',
        executionGrant: 'grant',
      });
      return { refused: blocked, due: listed, cancelled: answer, settled: await settle(['coin']) };
    },
  });
  assert.equal(refused.success, false);
  assert.match(refused.message, /pending reward/);
  assert.deepEqual(due, [], 'the world-time sweep skips a run owing a choice');
  assert.equal(cancelled.success, true);
  assert.equal(record.status, 'cancelled');
  assert.equal(settled.success, true, settled.message);
  assert.equal(gp, 4);
});

test('1773 V&A 12: once settled, the later stage may begin', async () => {
  const { begun } = await craftWithGroup(pickGroup(), {
    stageCount: 2,
    act: async ({ execute, begin, settle }) => {
      await execute();
      await settle(['gem']);
      return { begun: await begin() };
    },
  });
  assert.equal(begun.success, true, begun.message);
});

test('1773 V&A 14: a resume after award-results persists the choice and awards nothing twice', async () => {
  const { record, gp } = await craftWithGroup(pickGroup(), {
    act: async ({ execute, manager }) => {
      const runs = manager();
      const update = runs.updateExecutionJournal.bind(runs);
      runs.updateExecutionJournal = async (...args) => {
        if (args[2].type === 'effectApplying' && args[2].effectId === 'award-rewards') {
          throw new Error('stopped after the award');
        }
        return update(...args);
      };
      await assert.rejects(execute(), /stopped after the award/);
      runs.updateExecutionJournal = update;
      return { resumed: await execute() };
    },
  });
  assert.equal(record.status, 'succeeded');
  assert.equal(record.steps[0].pendingAwardChoices.length, 1, 'the hydrated choice persisted');
  assert.equal(awarded(record.steps[0]), 1, 'award-results was not replayed');
  assert.equal(gp, 1);
});

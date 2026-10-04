/**
 * Issue 1773 PR3: a choice group through the real engine, run manager and serialized actor flags.
 * A rolled group awards its draws through each member's own kind path; a group whose chooser is the
 * player persists a pending choice that the award-choice lane settles once, on an active or
 * terminal run. Since PR4 the versioned stages award it, and only the unversioned paths refuse it.
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

/** No alternative here can be claimed: an unconfigured unit and a retired component. */
const unclaimableGroup = () =>
  pickGroup({
    alternatives: [coin({ id: 'mark', unit: 'mark' }), gem({ componentId: 'retired' })],
  });

/** A grant object is bound to the operation it was issued for; the fixture's own string is not. */
function bindGrants(engine) {
  const consume = engine.versionedRunAuthority.consumeExecutionGrant;
  engine.versionedRunAuthority.consumeExecutionGrant = async (grant, context) =>
    typeof grant === 'object' && grant.operation !== context.operation
      ? null
      : consume(grant, context);
}

/** Stops `manager()`'s journal writes at the transition `stopAt` matches until `release()`. */
function interrupt(manager, stopAt) {
  const runs = manager();
  const update = runs.updateExecutionJournal.bind(runs);
  runs.updateExecutionJournal = async (...args) => {
    if (stopAt(args[2], args[3])) throw new Error(`stopped at ${args[2].effectId ?? args[2].type}`);
    return update(...args);
  };
  return () => {
    runs.updateExecutionJournal = update;
  };
}

/**
 * A run whose stages `onSteps` award `group`, from the start unless `midRun`; `act` drives it after
 * the start and answers extras.
 */
function craftWithGroup(group, options = {}) {
  const { stageCount = 1, script = {}, extremes = {}, act = null } = options;
  const { onSteps = [0], midRun = false, ...fixture } = options;
  const award = (steps) => {
    for (const index of onSteps) steps[index].resultGroups[0].results.push(group);
  };
  const dice = scriptedFormulaRoll(script, { extremes });
  return createPersistedCraftingHistory({
    stageCount,
    ...(fixture.timed !== undefined && { timed: fixture.timed }),
    ...(fixture.checked !== undefined && { checked: fixture.checked }),
    beforeStart: ({ engine, actor, steps }) => {
      rewardableCrafter(actor);
      game.fabricate.getRecipeVisibilityService().isLearnedKnowledgeObservable = () => true;
      Object.assign(globalThis, { Roll: dice.Roll });
      bindGrants(engine);
      if (!midRun) award(steps);
    },
    drive: async ({ engine, actor, sources, gm, runId, manager, steps, system }) => {
      if (midRun) award(steps);
      game.time.worldTime += 60;
      const cards = [];
      engine._postCraftChatMessage = async (card) => {
        cards.push(card);
      };
      const run = () => manager().getRun(actor, runId);
      const request = (requestId, extra = {}) => ({
        viewer: gm,
        actor,
        componentSourceActors: sources,
        runId,
        expectedRevision: run().runRevision,
        requestId,
        executionGrant: 'grant',
        ...extra,
      });
      const world = {
        engine,
        actor,
        manager,
        run,
        steps,
        system,
        cards,
        dice,
        request,
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
      manager().invalidateCache(actor.id);
      const learned = actor._source.flags.fabricate?.fabricate?.learnedRecipes ?? {};
      const marker = actor._source.flags.fabricate?.companionEffect ?? null;
      return {
        ...extra,
        cards,
        marker,
        counts: dice.counts,
        gp: actor._source.system.currency.gp,
        learned: Object.keys(learned),
      };
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
  assert.equal(step.createdResults[1].resultRowId, 'outputs-0:loot:1:gem', 'under its carrier');
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
      resultRowId: 'outputs-0:pick:1',
      awardStrategy: 'upTo',
      count: 2,
      alternatives: [
        { id: 'gem', componentId: 'award-stage-0', quantity: 2 },
        { id: 'coin', kind: 'currency', unit: 'gp', quantity: 3 },
        { id: 'lore', kind: 'knowledge', recipeId: 'historical-recipe', quantity: 1 },
      ],
    },
  ]);
  // V&A 15 holds because a versioned step never carries `historySettlement`, so nothing can read
  // the owed step's awards as complete; only a legacy step has the key, and it never owes a choice.
  assert.ok(!('historySettlement' in step));
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
  const { record, gp, learned, settled, again, fresh, beforeJournal, marker } =
    await craftWithGroup(pickGroup(), {
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
    });
  assert.equal(settled.success, true, settled.message);
  assert.equal(settled.disposition, 'awarded');
  assert.equal(again.success, true, 'the same request answers its committed outcome');
  assert.equal(fresh.success, false, 'a new request finds the choice settled');
  assert.match(fresh.message, /already settled/);
  assert.equal(gp, 4, 'credited exactly once');
  assert.deepEqual(learned, ['historical-recipe']);
  assert.deepEqual(
    marker,
    { runId: record.id, effectId: 'award-choice', resultId: 'pick', index: 0 },
    "the credit marker names the settle's own effect"
  );

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

test('1773 V&A 12: a picked rolled amount is rolled once and written under the stage row id', async () => {
  const group = pickGroup({ alternatives: [gem({ quantityFormula: '1d4' }), coin(), lore] });
  const { record, settled, counts } = await craftWithGroup(group, {
    script: { '1d4': [3] },
    act: async ({ execute, settle }) => {
      await execute();
      return { settled: await settle(['gem']) };
    },
  });
  assert.equal(settled.success, true, settled.message);
  assert.equal(counts['1d4'], 1, 'resolved before the first write and never rolled again');
  const created = record.steps[0].createdResults.at(-1);
  assert.equal(created.quantity, 3);
  assert.equal(created.resultRowId, 'outputs-0:pick:1:gem', 'the shape a stage draw writes');
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
  const { gp, record, retried, cards } = await craftWithGroup(pickGroup(), {
    act: async ({ execute, settle, manager, system, cards: posted }) => {
      await execute();
      posted.length = 0;
      const release = interrupt(
        manager,
        (transition) =>
          transition.type === 'effectApplying' && transition.effectId === 'settle-choice'
      );
      await assert.rejects(settle(['coin']), /stopped at settle-choice/);
      release();
      await assert.rejects(settle(['coin'], 'choose-fresh'), { code: 'PLAN_MISMATCH' });
      // The resume runs its persisted plan: a coin unclaimable now is not judged again.
      system.requirements.currency.enabled = false;
      return { retried: await settle(['coin']) };
    },
  });
  assert.equal(retried.success, true, retried.message);
  assert.equal(gp, 4, 'the coin was credited once across all three requests');
  const [step] = record.steps;
  assert.equal(step.pendingAwardChoices[0].outcome, 'awarded');
  assert.deepEqual(
    step.currencyCredits,
    [{ resultId: 'pick', alternativeId: 'coin', unit: 'gp', amount: 3, unitName: 'gp' }],
    "the resumed settle records the award's receipt"
  );
  assert.equal(cards.length, 1, 'one card, from the resumed settle');
  assert.deepEqual(cards[0].createdResults.rewardAwards.currencyCredits, step.currencyCredits);
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

test('1773 V&A 12: a choice with no claimable member settles forfeited, posting no card', async () => {
  const { settled, record, gp, cards } = await craftWithGroup(unclaimableGroup(), {
    midRun: true,
    act: async ({ execute, settle, cards: posted }) => {
      await execute();
      posted.length = 0;
      return { settled: await settle([]) };
    },
  });
  assert.equal(settled.success, true, settled.message);
  assert.equal(settled.disposition, 'forfeited');
  assert.equal(gp, 1);
  assert.equal(record.steps[0].pendingAwardChoices[0].outcome, 'forfeited');
  assert.deepEqual(record.steps[0].pendingAwardChoices[0].picks, []);
  assert.equal(cards.length, 0, 'a forfeit posts no card');
});

test('1773 V&A 12: a later stage waits on the choice, and a cancelled run keeps it settleable', async () => {
  const { record, gp, refused, cancelled, settled } = await craftWithGroup(pickGroup(), {
    stageCount: 2,
    act: async ({ engine, execute, begin, settle, run, actor }) => {
      await execute();
      const blocked = await begin();
      const answer = await engine.cancelVersionedRun({
        actor,
        runId: run().id,
        expectedRevision: run().runRevision,
        requestId: 'cancel',
        executionGrant: 'grant',
      });
      return { refused: blocked, cancelled: answer, settled: await settle(['coin']) };
    },
  });
  assert.equal(refused.success, false);
  assert.match(refused.message, /pending reward/);
  assert.equal(refused.blocker, 'awardChoicePending', 'begin names the blocker');
  assert.equal(cancelled.success, true);
  assert.equal(record.status, 'cancelled');
  assert.equal(settled.success, true, settled.message);
  assert.equal(gp, 4);
});

test('1773 V&A 12: execute on a stage that needs no start waits on the choice too', async () => {
  const { refused, record } = await craftWithGroup(pickGroup(), {
    stageCount: 2,
    timed: false,
    act: async ({ execute }) => {
      await execute('first');
      return { refused: await execute('second') };
    },
  });
  assert.equal(refused.success, false);
  assert.equal(refused.blocker, 'awardChoicePending', 'execute names the blocker');
  assert.equal(record.currentStepIndex, 1, 'the second stage did not run');
  assert.ok(!record.steps[1].createdResults?.length, 'and awarded nothing');
});

test('1773 V&A 12: a choice with no claimable member does not hold the next stage', async () => {
  const { begun } = await craftWithGroup(unclaimableGroup(), {
    midRun: true,
    stageCount: 2,
    act: async ({ execute, begin }) => {
      await execute();
      return { begun: await begin() };
    },
  });
  assert.equal(begun.success, true, begun.message);
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
      const release = interrupt(
        manager,
        (transition) =>
          transition.type === 'effectApplying' && transition.effectId === 'award-rewards'
      );
      await assert.rejects(execute(), /stopped at award-rewards/);
      release();
      return { resumed: await execute() };
    },
  });
  assert.equal(record.status, 'succeeded');
  assert.equal(record.steps[0].pendingAwardChoices.length, 1, 'the hydrated choice persisted');
  assert.equal(awarded(record.steps[0]), 1, 'award-results was not replayed');
  assert.equal(gp, 1);
});

test('1773 V&A 18: a later stage begins with a player choice added mid-run', async () => {
  const { begun, record } = await craftWithGroup(pickGroup(), {
    stageCount: 2,
    onSteps: [1],
    midRun: true,
    act: async ({ execute, begin }) => {
      await execute();
      return { begun: await begin() };
    },
  });
  assert.equal(begun.success, true, begun.message);
  assert.ok(record.steps[1].preparedConsumption, 'the stage started');
});

test('1773 V&A 18: a started stage awards a player choice added mid-run as a pending choice', async () => {
  const { executed, record } = await craftWithGroup(pickGroup(), { midRun: true });
  assert.equal(executed.success, true, executed.message);
  assert.equal(record.status, 'succeeded', 'the stage resolved');
  assert.equal(record.steps[0].pendingAwardChoices.length, 1, 'and owes the pick');
});

test('1773 V&A 5: a started stage refuses a group formula that cannot total for the crafter', async () => {
  const group = {
    id: 'loot',
    chooser: 'rolled',
    selectionFormula: '@details.name',
    alternatives: [
      gem({ selectionRange: { from: 1, to: 5 } }),
      coin({ selectionRange: { from: 6, to: 9 } }),
    ],
  };
  const { executed, record } = await craftWithGroup(group, {
    midRun: true,
    extremes: { '@details.name': [NaN, NaN] },
  });
  assert.equal(executed.success, false);
  assert.match(executed.message, /"@details.name" cannot be rolled for this character/);
  assert.ok(!record.steps[0].groupAwards, 'nothing was drawn');
});

test('1773: the settle lane refuses while a stage is mid-plan, and writes nothing', async () => {
  const { refused, gp, record, settled } = await craftWithGroup(pickGroup(), {
    act: async ({ execute, settle, manager, run }) => {
      const release = interrupt(
        manager,
        (transition) => transition.type === 'effectApplying' && transition.effectId === 'post-chat'
      );
      await assert.rejects(execute(), /stopped at post-chat/);
      release();
      assert.equal(run().executionJournal.status, 'planned', 'the terminal stage is still planned');
      const answer = await settle(['coin']).catch((error) => ({ code: error.code }));
      assert.equal(run().awardChoiceJournal, undefined, 'no award choice was planned');
      await execute();
      return { refused: answer, settled: await settle(['coin']) };
    },
  });
  assert.equal(refused.code, 'EXECUTION_IN_PROGRESS');
  assert.equal(settled.success, true, 'the resumed stage frees the lane');
  assert.equal(gp, 4, 'credited once, by the second settle');
  assert.equal(record.awardChoiceJournal.status, 'committed');
});

test('1773: a stage refuses while a settle is mid-plan', async () => {
  const { refused, begun } = await craftWithGroup(unclaimableGroup(), {
    midRun: true,
    stageCount: 2,
    act: async ({ execute, settle, begin, manager }) => {
      await execute();
      const release = interrupt(
        manager,
        (transition) =>
          transition.type === 'effectApplying' && transition.effectId === 'settle-choice'
      );
      await assert.rejects(settle([]), /stopped at settle-choice/);
      release();
      const answer = await begin().catch((error) => ({ code: error.code }));
      await settle([]);
      return { refused: answer, begun: await begin('begin-again') };
    },
  });
  assert.equal(refused.code, 'EXECUTION_IN_PROGRESS');
  assert.equal(begun.success, true, begun.message);
});

test('1773: a settle refuses before it writes when the world writer would refuse the credit', async () => {
  const { refused, record, picked } = await craftWithGroup(pickGroup(), {
    act: async ({ execute, settle, actor, run }) => {
      await execute();
      delete actor._source.system.currency.gp;
      const answer = await settle(['coin']);
      assert.equal(run().awardChoiceJournal, undefined, 'nothing was planned');
      return { refused: answer, picked: await settle(['gem'], 'choose-gem') };
    },
  });
  assert.equal(refused.success, false);
  assert.match(refused.message, /cannot be claimed/);
  assert.equal(picked.success, true, 'the choice is still settleable');
  assert.deepEqual(record.steps[0].pendingAwardChoices[0].picks, ['gem']);
});

test('1773: a settle refuses before it writes when a picked amount cannot be rolled', async () => {
  const group = pickGroup({ alternatives: [gem({ quantityFormula: '1d6' }), coin(), lore] });
  const { refused, settled, gp } = await craftWithGroup(group, {
    script: { '1d6': [NaN] },
    act: async ({ execute, settle, run }) => {
      await execute();
      const answer = await settle(['gem']);
      assert.equal(run().awardChoiceJournal, undefined, 'nothing was planned');
      return { refused: answer, settled: await settle(['coin'], 'choose-coin') };
    },
  });
  assert.equal(refused.success, false);
  assert.match(refused.message, /totalled NaN/);
  assert.equal(settled.success, true, settled.message);
  assert.equal(gp, 4);
});

test('1773: a settle runs the craft-time formula pre-flight over its picks', async () => {
  const group = pickGroup({ alternatives: [gem({ quantityFormula: '1d6' }), coin(), lore] });
  const extremes = {};
  const { refused, counts } = await craftWithGroup(group, {
    script: { '1d6': [4] },
    extremes,
    act: async ({ execute, settle }) => {
      await execute();
      // The crafter's roll data changes after the award: the formula no longer totals.
      extremes['1d6'] = [NaN, NaN];
      return { refused: await settle(['gem']) };
    },
  });
  assert.equal(refused.success, false);
  assert.match(refused.message, /"1d6" cannot be rolled for this character/);
  assert.equal(counts['1d6'], undefined, 'refused before anything was rolled');
});

test('1773: a reload during the award leaves the award choice for recovery, not a mismatch', async () => {
  const { reconstructed, record, refused } = await craftWithGroup(pickGroup(), {
    act: async ({ execute, settle, manager }) => {
      await execute();
      interrupt(
        manager,
        (transition) =>
          (transition.type === 'effectApplied' && transition.effectId === 'award-choice') ||
          transition.type === 'recoveryRequired'
      );
      await assert.rejects(settle(['coin']));
      const runs = new (manager().constructor)();
      const answer = await runs.reconstructVersionedExecutions({ orphaned: true });
      return {
        reconstructed: answer,
        refused: await settle(['coin'], 'choose-fresh').catch((error) => error.code),
      };
    },
  });
  assert.equal(reconstructed.reconstructed, 1);
  assert.equal(reconstructed.runs[0].journalStatus, 'recoveryRequired');
  assert.equal(record.awardChoiceJournal.status, 'recoveryRequired');
  assert.equal(refused, 'RECOVERY_REQUIRED', 'a new request meets recovery');
});

test('1773: a settle finds the first choice still owed when two stages share its id', async () => {
  const { settled, record } = await craftWithGroup(pickGroup(), {
    stageCount: 2,
    onSteps: [0, 1],
    act: async ({ execute, begin, settle }) => {
      await execute();
      await settle(['gem']);
      await begin();
      game.time.worldTime += 60;
      await execute('second');
      return { settled: await settle(['coin'], 'choose-second') };
    },
  });
  assert.equal(settled.success, true, settled.message);
  assert.deepEqual(record.steps[1].pendingAwardChoices[0].picks, ['coin']);
  assert.deepEqual(record.steps[0].pendingAwardChoices[0].picks, ['gem']);
});

test('1773 Decision 10: a run whose recipe was deleted settles against its recorded ids', async () => {
  const { settled, gp } = await craftWithGroup(pickGroup(), {
    act: async ({ execute, settle, engine }) => {
      await execute();
      engine.recipeManager.getRecipe = () => null;
      return { settled: await settle(['coin']) };
    },
  });
  assert.equal(settled.success, true, settled.message);
  assert.equal(gp, 4, 'credited through the recorded system');
});

/** Wires the fixture engine's world-time sweep to its own execute, as the authority does. */
function sweepVia({ engine, request }) {
  let sequence = 0;
  engine.versionedRunAuthority.requestExecute = (candidate) =>
    engine.executeVersionedStage(
      request(`sweep-${(sequence += 1)}`, {
        expectedRevision: candidate.expectedRevision,
        trigger: candidate.trigger,
      })
    );
  return () => engine.processVersionedWorldTime({ worldTime: game.time.worldTime });
}

test('1773 V&A 15: the world-time sweep completes a stage an unclaimable choice does not hold', async () => {
  const { record } = await craftWithGroup(unclaimableGroup(), {
    midRun: true,
    stageCount: 2,
    checked: false,
    act: async (world) => {
      const { execute, begin, manager, actor, run } = world;
      await execute();
      await manager().setCompletionMode(actor, run().id, 'worldTime', {
        expectedRevision: run().runRevision,
      });
      await begin();
      game.time.worldTime += 60;
      return { swept: await sweepVia(world)() };
    },
  });
  assert.equal(record.status, 'succeeded', 'the sweep resolved the second stage');
});

test('1773 V&A 15: the world-time sweep skips a stage a claimable choice holds', async () => {
  const group = pickGroup({ alternatives: [lore, coin({ id: 'mark', unit: 'mark' })] });
  const { record, swept } = await craftWithGroup(group, {
    midRun: true,
    stageCount: 2,
    checked: false,
    act: async (world) => {
      const { execute, begin, manager, actor, run } = world;
      const visibility = game.fabricate.getRecipeVisibilityService();
      visibility.isLearnedKnowledgeObservable = () => false;
      await execute();
      await manager().setCompletionMode(actor, run().id, 'worldTime', {
        expectedRevision: run().runRevision,
      });
      await begin();
      visibility.isLearnedKnowledgeObservable = () => true;
      game.time.worldTime += 60;
      return { swept: await sweepVia(world)() };
    },
  });
  assert.deepEqual(swept, [], 'the owed run was not even requested');
  assert.equal(record.status, 'waitingTime');
});

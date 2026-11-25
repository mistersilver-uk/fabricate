/** A terminal Iterative Attempt settles once: routing, awards, Tools, evidence and the card. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { RunJournalBuilder } from '../src/ui/presenters/RunJournalBuilder.js';

import { forgeRecipe, iterativeCommandWorld } from './helpers/iterativeCommandWorld.js';

async function startedWorld(options = {}) {
  const world = iterativeCommandWorld(options);
  const started = await world.start();
  assert.equal(started.success, true, JSON.stringify(started));
  return world;
}

async function takeAll(world, actionIds) {
  const replies = [];
  for (const actionId of actionIds) replies.push(await world.take(actionId));
  return replies;
}

const awarded = (world) => world.actor.created.flat().map((entry) => entry.name);
const cards = (world) =>
  world.messages.filter((message) =>
    String(message.content ?? '').includes('fabricate-craft-chat')
  );
const historyRun = (world) => {
  world.manager.invalidateCache(world.actor.id);
  return world.manager.getRunHistory(world.actor)[0];
};

describe('a terminal success', () => {
  it('awards the selected group once, records recipe use once, and advances unstarted', async () => {
    const world = await startedWorld();
    const replies = await takeAll(world, ['stoke', 'stoke', 'stoke']);
    assert.ok(replies.every((reply) => reply.success === true));
    const ended = await world.take('stoke', { attemptId: 'end' });
    assert.equal(ended.success, true, JSON.stringify(ended));
    assert.deepEqual(ended.iterative.stepEnd, {
      kind: 'success',
      attempt: 4,
      resultGroupId: 's0-plain',
    });
    assert.equal(world.actor.created.length, 1, 'createEmbeddedDocuments once');
    assert.deepEqual(awarded(world), ['blade']);
    assert.equal(world.recipeUses, 1);
    const run = world.run();
    assert.equal(run.currentStepIndex, 1);
    assert.equal(run.steps[0].status, 'succeeded');
    assert.equal(run.steps[1].preparedConsumption, undefined, 'the next step is unstarted');
    assert.equal(run.steps[1].iterative, undefined);
    assert.equal(run.executionJournal.status, 'committed');

    const replay = await world.take('stoke', { attemptId: 'end', expectedRevision: 0 });
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.iterative.stepEnd, ended.iterative.stepEnd);
    assert.equal(world.actor.created.length, 1);
    assert.equal(world.recipeUses, 1);
  });

  it('records recipe use once through the visibility service the composition injects', async () => {
    const world = await startedWorld({ steps: 1 });
    const calls = [];
    world.visibility.applyRecipeItemUseOnCraft = async (args) => {
      calls.push(args);
    };
    globalThis.game.fabricate.getRecipeVisibilityService = () => null;
    const replies = await takeAll(world, ['stoke', 'stoke', 'stoke', 'stoke']);
    assert.equal(replies.at(-1).iterative.stepEnd.kind, 'success');
    assert.equal(calls.length, 1, 'the injected applyRecipeItemUseOnCraft, exactly once');
    assert.equal(calls[0].recipe.id, world.recipe.id);
    assert.equal(calls[0].craftingActor, world.actor);
  });

  it('credits the selected group currency reward once, and a replay credits nothing', async () => {
    const fee = { id: 'fee', kind: 'currency', unit: 'gp', quantity: 2, label: 'Fee' };
    const recipe = forgeRecipe({ steps: 1, rewards: [fee] });
    const world = await startedWorld({ recipe, currency: true });
    await takeAll(world, ['stoke', 'stoke', 'stoke']);
    const ended = await world.take('stoke', { attemptId: 'paid' });
    assert.equal(ended.iterative.stepEnd.resultGroupId, 's0-plain', JSON.stringify(ended));
    const run = historyRun(world);
    const rewards = run.executionJournal.effects.filter((effect) => effect.kind === 'awardRewards');
    assert.equal(rewards.length, 1, 'one award-rewards effect');
    assert.deepEqual(rewards[0].planned, ['fee'], 'planned over the selected group once');
    assert.equal(rewards[0].receipt.currencyCredits.length, 1, 'one credit receipt');
    assert.equal(world.actor._source.system.currency.gp, 3, 'credited 2 gp once');
    const replay = await world.take('stoke', {
      attemptId: 'paid',
      expectedRevision: ended.runRevision,
    });
    assert.equal(replay.replayed, true);
    assert.equal(world.actor._source.system.currency.gp, 3, 'the replay credited nothing');
  });

  it('routes otherwise identical successes to different groups through producedWhen', async () => {
    const plain = await startedWorld({ steps: 1 });
    await takeAll(plain, ['stoke', 'stoke', 'stoke', 'stoke']);
    const fine = await startedWorld({ steps: 1 });
    await takeAll(fine, ['stoke', 'stoke', 'stoke', 'blast']);
    assert.deepEqual(plain.actor.created[0][0].system.quantity, 1);
    assert.deepEqual(fine.actor.created[0][0].system.quantity, 2);
    assert.equal(historyRun(fine).status, 'succeeded');
  });

  it('completes the step with nothing awarded when no group matches', async () => {
    const recipe = forgeRecipe({ steps: 1 });
    for (const group of recipe.resultGroups) {
      if (group.id === 's0-plain')
        group.producedWhen = [
          { end: 'success', rules: [{ source: 'sessionCount', op: '>', value: 99 }] },
        ];
    }
    const world = await startedWorld({ recipe });
    const replies = await takeAll(world, ['stoke', 'stoke', 'stoke', 'stoke']);
    assert.equal(replies.at(-1).iterative.stepEnd.resultGroupId, null);
    assert.equal(world.actor.created.length, 0);
    assert.equal(historyRun(world).status, 'succeeded');
  });

  it('replays a terminal attempt that archived the run, awarding nothing again', async () => {
    const world = await startedWorld({ steps: 1 });
    await takeAll(world, ['stoke', 'stoke', 'stoke']);
    const ended = await world.take('stoke', { attemptId: 'last' });
    assert.equal(historyRun(world).status, 'succeeded');
    const replay = await world.take('stoke', {
      attemptId: 'last',
      expectedRevision: ended.runRevision,
    });
    assert.equal(replay.replayed, true);
    assert.equal(world.actor.created.length, 1);
    assert.equal(world.recipeUses, 1);
  });
});

describe('a terminal failure', () => {
  it('awards only its failure group, refunds nothing, never advances, and words the card', async () => {
    const world = await startedWorld({ steps: 1, fuel: 2 });
    const ores = world.actor.items.filter((item) => item.componentId === 'ore').length;
    const [, ended] = await takeAll(world, ['stoke', 'stoke']);
    assert.equal(ended.success, true, 'a failed step is an outcome, not a refusal');
    assert.equal(ended.iterative.stepEnd.kind, 'failure');
    const run = historyRun(world);
    assert.equal(run.status, 'failed');
    assert.equal(run.steps[0].failureReason, 'iterativeFailure');
    assert.equal(run.steps[0].lastCheckResult, undefined);
    assert.deepEqual(awarded(world), ['slag']);
    assert.equal(world.actor.items.filter((item) => item.componentId === 'ore').length, ores);
    assert.equal(world.recipeUses, 0);
    const [card] = cards(world);
    assert.match(card.content, /FABRICATE\.Chat\.IterativeFailure/);
    assert.doesNotMatch(card.content, /: iterativeFailure/);
    const journal = new RunJournalBuilder({
      recipeManager: world.recipeManager,
      getSystem: (id) => world.systems.getSystem(id),
      craftingRunManager: world.manager,
      localize: (key) => key,
    });
    const [entry] = journal.buildListing({
      actor: world.actor,
      viewer: globalThis.game.user,
    }).history;
    assert.equal(entry.failureReason, 'FABRICATE.Chat.IterativeFailure');
    assert.doesNotMatch(JSON.stringify(entry), /"iterativeFailure"/, 'the Journal never prints it');
  });

  it('refuses against a planned award-choice journal and keeps the authority available', async () => {
    const world = await startedWorld({ steps: 1 });
    await takeAll(world, ['stoke', 'stoke', 'stoke']);
    await world.manager.updateExecutionJournal(
      world.actor,
      world.runId,
      {
        type: 'plan',
        plan: {
          operationId: 'choice-op',
          requestId: 'choice-req',
          baseRunRevision: world.revision(),
          intent: { stepIndex: 0 },
          effects: [{ effectId: 'award-choice', kind: 'awardChoice', planned: null }],
        },
      },
      { expectedRevision: world.revision(), journal: 'awardChoiceJournal' }
    );
    const before = world.flag();
    const reply = await world.take('stoke');
    assert.equal(reply.success, false);
    assert.deepEqual(world.flag(), before);
    assert.equal(world.authority.availability().available, true);
  });

  it('refuses stale-run when another manager moves the run as the plan is written', async () => {
    const world = await startedWorld({ steps: 1 });
    await takeAll(world, ['stoke', 'stoke', 'stoke']);
    const journal = world.manager.updateExecutionJournal.bind(world.manager);
    world.manager.updateExecutionJournal = async (actor, runId, transition, options) => {
      world.manager.updateExecutionJournal = journal;
      const { CraftingRunManager } = await import('../src/systems/CraftingRunManager.js');
      const other = new CraftingRunManager();
      const current = other.getActiveRun(actor, runId);
      await other.updateRun(actor, current, { expectedRevision: current.runRevision });
      return journal(actor, runId, transition, options);
    };
    const reply = await world.take('stoke');
    assert.equal(reply.reason, 'stale-run', JSON.stringify(reply));
    assert.equal(world.actor.created.length, 0);
    assert.equal(world.run().executionJournal?.status ?? 'committed', 'committed');
    assert.deepEqual(cards(world), []);
  });
});

describe('Captured Resolution Evidence', () => {
  it('is none at start, check after the first checked attempt, and kept at the end', async () => {
    const world = await startedWorld({ steps: 1 });
    assert.deepEqual(world.run().steps[0].resolutionSnapshot, { kind: 'none', mode: 'iterative' });
    await world.take('hammer');
    assert.equal(world.run().steps[0].resolutionSnapshot.kind, 'check');
    await takeAll(world, ['stoke', 'stoke', 'stoke']);
    assert.deepEqual(historyRun(world).steps[0].resolutionSnapshot, {
      kind: 'check',
      mode: 'iterative',
    });
  });

  it('stays none for a step taken only with unchecked actions', async () => {
    const world = await startedWorld({ steps: 1 });
    await takeAll(world, ['stoke', 'stoke', 'stoke', 'stoke']);
    assert.deepEqual(historyRun(world).steps[0].resolutionSnapshot, {
      kind: 'none',
      mode: 'iterative',
    });
  });
});

describe('Tools at an iterative step end', () => {
  const trigger = {
    id: 'shatter',
    breakTools: true,
    condition: { type: 'rollTotal', operator: '>=', value: 18 },
  };

  it('latches a checkDriven trigger on its attempt and breaks once at the end', async () => {
    const world = iterativeCommandWorld({
      steps: 1,
      tools: ['tongs'],
      toolBreakage: { authority: 'checkDriven' },
      routed: {
        rollFormula: '1d20',
        type: 'fixed',
        fixedOutcomes: [
          { id: 'miss', name: 'Miss', success: false, start: 1, end: 9 },
          { id: 'hit', name: 'Hit', success: true, start: 10, end: 20 },
        ],
        checkBreakage: { triggers: [trigger] },
      },
    });
    await world.start();
    const applied = [];
    const apply = world.engine._applyToolBreakage.bind(world.engine);
    world.engine._applyToolBreakage = async (...args) => {
      applied.push(args[2]);
      return apply(...args);
    };
    world.nextTotal = 12;
    await world.take('hammer');
    world.nextTotal = 19;
    await world.take('hammer');
    assert.deepEqual(world.stepState().toolBreakOwed, { attempt: 2 });
    world.nextTotal = 19;
    await world.take('hammer');
    assert.deepEqual(
      world.stepState().toolBreakOwed,
      { attempt: 2 },
      'a later trigger never moves it'
    );
    assert.deepEqual(applied, [], 'no Tool breaks before the end');
    await world.take('stoke');
    assert.equal(applied.length, 1);
    assert.equal(applied[0].forceBreak, true);
    assert.equal(historyRun(world).steps[0].usedTools[0].broken, true);
  });

  it('uses Tools once, at the step end, under toolSpecific', async () => {
    const world = iterativeCommandWorld({ steps: 1, tools: ['tongs'] });
    await world.start();
    const applied = [];
    const apply = world.engine._applyToolBreakage.bind(world.engine);
    world.engine._applyToolBreakage = async (...args) => {
      applied.push(args[2]);
      return apply(...args);
    };
    await takeAll(world, ['hammer', 'stoke', 'stoke']);
    assert.equal(applied.length, 0);
    await world.take('stoke');
    assert.equal(applied.length, 1);
    assert.equal(applied[0].authority, 'toolSpecific');
    assert.equal(applied[0].forceBreak, false);
  });
});

describe('cancelling an iterative run', () => {
  const oreCount = (world) => world.actor.items.filter((item) => item.name === 'ore').length;
  const cancel = (world) =>
    world.service.executeJournalRunCommand(
      {
        actorUuid: world.actor.uuid,
        runType: 'crafting',
        runId: world.runId,
        expectedRevision: world.revision(),
        action: 'cancel',
        payload: { sourceActorUuids: [world.actor.uuid] },
      },
      { interactive: false }
    );

  it('restores the current step inputs and trims and labels the step state', async () => {
    const world = iterativeCommandWorld();
    world.system.features.refundOnPlayerCancel = true;
    const before = oreCount(world);
    assert.equal((await world.start()).success, true);
    assert.equal(oreCount(world), before - 1, 'the start spent one ore');
    await takeAll(world, ['stoke', 'rest']);
    const cancelled = await cancel(world);
    assert.equal(cancelled.success, true, JSON.stringify(cancelled));
    assert.equal(cancelled.refunded, true);
    assert.equal(cancelled.restoredCount, 1);
    assert.equal(oreCount(world), before);
    const run = historyRun(world);
    assert.equal(run.status, 'cancelled');
    assert.equal(run.termsSnapshot, undefined);
    assert.equal(run.steps[0].iterative.log.length, 2);
    assert.deepEqual(
      run.steps[0].iterative.labels.actions.map((entry) => entry.id),
      ['stoke', 'hammer', 'rest', 'blast', 'heave']
    );
  });

  it('restores nothing when refundOnPlayerCancel is off', async () => {
    const world = iterativeCommandWorld();
    world.system.features.refundOnPlayerCancel = false;
    const before = oreCount(world);
    await world.start();
    await takeAll(world, ['stoke', 'rest']);
    const cancelled = await cancel(world);
    assert.equal(cancelled.success, true, JSON.stringify(cancelled));
    assert.equal(cancelled.refunded, false);
    assert.equal(cancelled.restoredCount, 0);
    assert.equal(oreCount(world), before - 1);
    assert.equal(historyRun(world).status, 'cancelled');
  });

  it('restores only the current step, and a completed step award stands', async () => {
    const world = iterativeCommandWorld();
    world.system.features.refundOnPlayerCancel = true;
    const before = oreCount(world);
    await world.start();
    const replies = await takeAll(world, ['stoke', 'stoke', 'stoke', 'stoke']);
    assert.equal(replies.at(-1).iterative.stepEnd.kind, 'success');
    assert.equal((await world.begin()).success, true);
    assert.equal(oreCount(world), before - 2, 'each step spent one ore');
    const cancelled = await cancel(world);
    assert.equal(cancelled.success, true, JSON.stringify(cancelled));
    assert.equal(cancelled.restoredCount, 1);
    assert.equal(oreCount(world), before - 1, "only step 1's ore returns");
    assert.deepEqual(awarded(world), ['blade', 'ore'], 'the award, then the refunded ore');
    const blades = world.actor.items.filter((item) => item.name === 'blade');
    assert.equal(blades.length, 1, "step 0's award stands");
    const run = historyRun(world);
    assert.equal(run.steps[0].status, 'succeeded');
    assert.deepEqual(run.steps[1].iterative.log, [], 'step 1 started and took no attempt');
  });
});

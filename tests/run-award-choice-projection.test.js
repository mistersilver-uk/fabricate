/**
 * Issue 1773 PR4: the Journal projection of a run that owes an award choice, built from the real
 * engine's persisted run. It lists the run under Active and counts it there until it is settled,
 * and projects the face's choices and the `chooseAward` action. It holds a later stage on
 * `awardChoicePending` and refuses dismissal. A settle that stopped is projected as recovery or
 * as a resume of its own request.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { RunJournalBuilder } from '../src/ui/presenters/RunJournalBuilder.js';

import {
  coin,
  craftWithGroup,
  gem,
  interrupt,
  lore,
  pickGroup,
} from './helpers/choiceGroupWorld.js';

/** The listing as `journalFacade` wires it: the engine's own claimability, for `viewer`. */
function listing(world, { viewer = world.gm, authority = null } = {}) {
  const builder = new RunJournalBuilder({
    craftingRunManager: world.manager(),
    recipeManager: world.engine.recipeManager,
    getSystem: () => world.system,
    getResultItem: () => null,
    getComponent: () => null,
    nowWorldTime: () => Number(game.time?.worldTime ?? 0),
    getJournalActionAvailability: () => authority ?? { available: true, reason: null },
    getAwardChoiceClaimability: ({ run, actor }) =>
      world.engine._awardChoices().unclaimable(run, actor),
  });
  world.manager().invalidateCache(world.actor.id);
  return builder.buildListing({ actor: world.actor, viewer });
}

const owedRun = (built) => built.activeRuns.find((run) => run.awardChoicePending === true);

test('1773 PR4: a closed run owing a pick is listed and counted under Active, with its choice', async () => {
  const { built, settled } = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      const before = listing(world);
      await world.settle(['coin', 'lore']);
      return { built: before, settled: listing(world) };
    },
  });
  const run = owedRun(built);
  assert.ok(run, 'the succeeded run is under Active');
  assert.equal(run.status, 'succeeded');
  assert.equal(built.counts.active, 1, 'and the badge counts it');
  assert.equal(built.history.length, 0);
  assert.equal(run.actions.chooseAward, true);
  assert.equal(run.actions.dismiss, false, 'a run owing a pick is not dismissible');
  const [choice] = run.awardChoices;
  assert.deepEqual(
    { choiceId: choice.choiceId, awardStrategy: choice.awardStrategy, ceiling: choice.ceiling },
    { choiceId: 'pick', awardStrategy: 'upTo', ceiling: 2 }
  );
  assert.deepEqual(
    choice.alternatives.map(({ id, kind, quantity, unclaimable }) => ({
      id,
      kind,
      quantity,
      unclaimable,
    })),
    [
      { id: 'gem', kind: 'component', quantity: 2, unclaimable: null },
      { id: 'coin', kind: 'currency', quantity: 3, unclaimable: null },
      { id: 'lore', kind: 'knowledge', quantity: 1, unclaimable: null },
    ]
  );
  assert.equal(choice.alternatives[0].name, 'Award stage-0', 'a component reads its library name');
  assert.equal(choice.alternatives[1].amountText, '3 gp');
  // Hand-off 6: the stage's own results read as recorded while its pick is owed.
  const [step] = run.steps;
  assert.equal(step.createdResultsRecorded, true);
  assert.equal(step.pendingAwardChoices.length, 1, 'the step projects its pending choice');
  assert.equal(settled.activeRuns.length, 0, 'once settled the run leaves Active');
  assert.equal(settled.history[0].awardChoicePending, undefined);
  assert.deepEqual(settled.history[0].steps[0].groupAwards.at(-1).selections, [
    { alternativeId: 'coin' },
    { alternativeId: 'lore' },
  ]);
});

test('1773 PR4 Escalation 12: an already-known recipe and a gone component are disabled with a reason', async () => {
  const group = pickGroup({ alternatives: [gem({ componentId: 'retired' }), coin(), lore] });
  const { built } = await craftWithGroup(group, {
    midRun: true,
    act: async (world) => {
      await world.execute();
      world.actor._source.flags.fabricate = {
        fabricate: { learnedRecipes: { 'historical-recipe': { learnedAt: 1, granted: true } } },
      };
      return { built: listing(world) };
    },
  });
  const reasons = owedRun(built).awardChoices[0].alternatives.map((entry) => entry.unclaimable);
  assert.deepEqual(reasons, ['componentMissing', null, 'alreadyKnown']);
});

test('1773 PR4: a later stage is held on awardChoicePending while a claimable pick is owed', async () => {
  const { built } = await craftWithGroup(pickGroup(), {
    stageCount: 2,
    act: async (world) => {
      await world.execute();
      return { built: listing(world) };
    },
  });
  const run = owedRun(built);
  assert.equal(run.status, 'inProgress', 'a live run owing a pick');
  assert.equal(run.actions.disabledReason, 'awardChoicePending');
  assert.equal(run.actions.beginStep, false);
  assert.equal(run.actions.execute, false);
  assert.equal(run.actions.chooseAward, true);
  assert.equal(run.awaitingChoice, false, 'a reward is not the stage choice');
});

test('1773 PR4: a viewer who is neither owner nor GM reads the choice and may not settle', async () => {
  const { built } = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      world.actor.isOwner = false;
      return { built: listing(world) };
    },
  });
  const run = owedRun(built);
  assert.equal(run.awardChoiceBlocker, 'notOwner');
  assert.equal(run.actions.chooseAward, false);
  assert.equal(run.awardChoices.length, 1, 'the GM viewer still sees the tiles');
});

test('1773 PR4: with no GM connected the settle is withheld for the authority reason', async () => {
  const { built } = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      return {
        built: listing(world, { authority: { available: false, reason: 'active-gm-missing' } }),
      };
    },
  });
  const run = owedRun(built);
  assert.equal(run.awardChoiceBlocker, 'active-gm-missing');
  assert.equal(run.actions.chooseAward, false);
  assert.ok(run, 'the choice stays pending');
});

test('1773 PR4 hand-off 4: an interrupted settle surfaces as recovery and may be dismissed', async () => {
  const { built } = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      interrupt(
        world.manager,
        (transition) =>
          transition.type === 'effectApplied' && transition.effectId === 'award-choice'
      );
      await assert.rejects(world.settle(['coin']));
      return { built: listing(world) };
    },
  });
  const run = owedRun(built);
  assert.equal(run.recoveryEvidence.required, true, "the award journal's recovery is the run's");
  assert.equal(run.recoveryEvidence.effects[0].kind, 'awardChoice');
  assert.equal(run.actions.chooseAward, false);
  assert.equal(run.awardChoiceBlocker, 'recoveryRequired');
  assert.equal(
    run.actions.dismiss,
    true,
    'nothing in the Journal can finish it, so it may be hidden'
  );
});

test('1773 PR4 hand-off 7: a settle stopped before it applied anything resumes under its request', async () => {
  const { built, resumed, gp } = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      const release = interrupt(
        world.manager,
        (transition) => transition.type === 'effectApplying'
      );
      await assert.rejects(world.settle(['coin', 'lore'], 'first-settle'));
      release();
      const projected = listing(world);
      const { resume } = owedRun(projected).awardChoices[0];
      return {
        built: projected,
        resumed: await world.settle(resume.picks, resume.requestId),
      };
    },
  });
  const choice = owedRun(built).awardChoices[0];
  assert.deepEqual(choice.resume, {
    requestId: 'first-settle',
    choiceId: 'pick',
    picks: ['coin', 'lore'],
  });
  assert.equal(owedRun(built).actions.chooseAward, true, 'the resume may be sent');
  assert.equal(resumed.success, true, resumed.message);
  assert.equal(gp, 4);
});

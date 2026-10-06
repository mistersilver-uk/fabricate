/**
 * Issue 1773 PR4: the Journal projection of a run that owes an award choice, built from the real
 * engine's persisted run through `journalFacade`'s own builder. It lists the run under Active and
 * counts it there until it is settled, and projects the face's choices and the `chooseAward`
 * action for an entitled owner only. It holds a later stage on `awardChoicePending` and refuses
 * dismissal, and a settle that stopped is projected as recovery.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { journalFacade } from '../src/bootstrap/journalFacade.js';

import {
  coin,
  craftWithGroup,
  gem,
  interrupt,
  lore,
  pickGroup,
  unclaimableGroup,
} from './helpers/choiceGroupWorld.js';

/**
 * The listing `journalFacade` builds, wiring the engine's own claimability, for `viewer`, with the
 * recipe visibility `recipeVisibility` reads (none, so only a GM is entitled, by default).
 */
function listing(world, { viewer = world.gm, authority = null, recipeVisibility = null } = {}) {
  const facade = Object.assign(Object.create(journalFacade), {
    craftingRunManager: world.manager(),
    recipeManager: world.engine.recipeManager,
    recipeVisibilityService: recipeVisibility,
    craftingSystemManager: { getSystem: () => world.system },
    craftingEngine: world.engine,
    getWorldTime: () => Number(game.time?.worldTime ?? 0),
    getDismissedJournalRunKeys: () => new Set(),
    getJournalRunAuthorityAvailability: () => authority ?? { available: true, reason: null },
  });
  world.manager().invalidateCache(world.actor.id);
  return facade._getRunJournalBuilder().buildListing({ actor: world.actor, viewer });
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
  assert.equal(settled.history[0].awardChoicePending, false, 'a run owing nothing says so');
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

test('1773 PR4: an owner not entitled to the run is shown no reward and may not settle it', async () => {
  const { hidden, shown } = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      const visible = { evaluateRecipeAccess: () => ({ visible: true }) };
      return {
        hidden: listing(world, { viewer: world.viewer }),
        shown: listing(world, { viewer: world.viewer, recipeVisibility: visible }),
      };
    },
  });
  const run = owedRun(hidden);
  assert.ok(run, 'the owed run is still listed under Active');
  assert.deepEqual(run.awardChoices, [], "a hidden recipe's rewards are never named");
  assert.equal(run.awardChoiceBlocker, 'notEntitled');
  assert.equal(run.actions.chooseAward, false);
  const entitled = owedRun(shown);
  assert.equal(entitled.awardChoices.length, 1, 'an entitled owner is shown the choice');
  assert.equal(entitled.awardChoiceBlocker, null);
  assert.equal(entitled.actions.chooseAward, true);
});

test('1773 PR4: an unclaimable alternative and the stage hold come through the facade wiring', async () => {
  const group = pickGroup({ alternatives: [gem({ componentId: 'retired' }), coin()] });
  const { built } = await craftWithGroup(group, {
    stageCount: 2,
    act: async (world) => {
      await world.execute();
      return { built: listing(world) };
    },
  });
  const run = owedRun(built);
  assert.deepEqual(
    run.awardChoices[0].alternatives.map((entry) => entry.unclaimable),
    ['componentMissing', null]
  );
  assert.equal(run.actions.disabledReason, 'awardChoicePending', 'the coin still holds the stage');
});

test('1773 PR4: a pick with nothing claimable holds no stage and blocks nothing', async () => {
  const { built, blocks } = await craftWithGroup(unclaimableGroup(), {
    midRun: true,
    stageCount: 2,
    act: async (world) => {
      await world.execute();
      const owed = world.run();
      return {
        built: listing(world),
        blocks: world.engine._awardChoices().blocks(owed, world.actor),
      };
    },
  });
  assert.equal(blocks, false, 'the engine’s own predicate finds nothing claimable');
  const run = built.activeRuns.find((entry) => entry.awardChoices?.length > 0);
  assert.ok(run, 'the unsettled pick is still listed');
  assert.notEqual(run.actions.disabledReason, 'awardChoicePending', 'so it holds no stage');
});

test('1773 PR4: the engine’s owed-pick predicate judges claimability against the run’s actor', async () => {
  const { blocks } = await craftWithGroup(pickGroup(), {
    stageCount: 2,
    act: async (world) => {
      await world.execute();
      return { blocks: world.engine._awardChoices().blocks(world.run(), world.actor) };
    },
  });
  assert.equal(blocks, true, 'a claimable coin and gem are owed to the actor');
});

test('1773 PR4: a recipe the actor already knows is no owed pick for that actor', async () => {
  const { blocks } = await craftWithGroup(pickGroup({ alternatives: [lore] }), {
    midRun: true,
    stageCount: 2,
    act: async (world) => {
      await world.execute();
      world.actor._source.flags.fabricate = {
        fabricate: { learnedRecipes: { 'historical-recipe': { learnedAt: 1, granted: true } } },
      };
      return { blocks: world.engine._awardChoices().blocks(world.run(), world.actor) };
    },
  });
  assert.equal(blocks, false, 'the only alternative is already known by the run’s actor');
});

test('1773 PR4: a taught recipe this viewer may not read is named as one not learned', async () => {
  const { built } = await craftWithGroup(pickGroup(), {
    act: async (world) => {
      await world.execute();
      // A teaser entitles the run's evidence but never names the recipe it teaches.
      const teaser = { evaluateRecipeAccess: () => ({ visible: true, reason: 'teaser' }) };
      return { built: listing(world, { viewer: world.viewer, recipeVisibility: teaser }) };
    },
  });
  const lore = owedRun(built).awardChoices[0].alternatives.find((entry) => entry.id === 'lore');
  assert.match(lore.name, /AwardChoice\.UnlearnedRecipe/);
});

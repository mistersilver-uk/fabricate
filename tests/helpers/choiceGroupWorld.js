/**
 * A choice group through the real engine, run manager and serialized actor flags (issue 1773): the
 * world `craftWithGroup` drives, shared by the engine suite and the Journal command suite.
 */
import { rewardableCrafter } from './companionRewardWorld.js';
import { createPersistedCraftingHistory } from './journal-fixtures.js';
import { scriptedFormulaRoll } from './scriptedFormulaRoll.js';

export const CHOOSE = Object.freeze({ operation: 'chooseAward' });
export const EXECUTE = Object.freeze({ operation: 'execute' });

export const gem = (extra = {}) => ({
  id: 'gem',
  componentId: 'award-stage-0',
  quantity: 2,
  ...extra,
});
export const coin = (extra = {}) => ({
  id: 'coin',
  kind: 'currency',
  unit: 'gp',
  quantity: 3,
  ...extra,
});
export const lore = { id: 'lore', kind: 'knowledge', recipeId: 'historical-recipe', quantity: 1 };

export const pickGroup = (extra = {}) => ({
  id: 'pick',
  awardStrategy: 'upTo',
  awardCount: 2,
  alternatives: [gem(), coin(), lore],
  ...extra,
});

/** No alternative here can be claimed: an unconfigured unit and a retired component. */
export const unclaimableGroup = () =>
  pickGroup({
    alternatives: [coin({ id: 'mark', unit: 'mark' }), gem({ componentId: 'retired' })],
  });

/** A grant object is bound to the operation it was issued for; the fixture's own string is not. */
export function bindGrants(engine) {
  const consume = engine.versionedRunAuthority.consumeExecutionGrant;
  engine.versionedRunAuthority.consumeExecutionGrant = async (grant, context) =>
    typeof grant === 'object' && grant.operation !== context.operation
      ? null
      : consume(grant, context);
}

/** Stops `manager()`'s journal writes at the transition `stopAt` matches until `release()`. */
export function interrupt(manager, stopAt) {
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
export function craftWithGroup(group, options = {}) {
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
    drive: async ({
      engine,
      actor,
      sources,
      gm,
      viewer,
      runId,
      manager,
      steps,
      system,
      project,
    }) => {
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
        gm,
        viewer,
        runId,
        project,
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

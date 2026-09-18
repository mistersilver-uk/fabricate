/**
 * The versioned stage-start commit: D-026 (materials are consumed when a stage starts) and D-028
 * (the component choice is made and LOCKED at that same moment), with the explicit begin control
 * and the roll-readiness rule the maintainer stated with them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createPersistedCraftingHistory } from './helpers/journal-fixtures.js';

let requests = 0;
// Every authority request needs its own id: the execution journal deduplicates by request,
// so a reused id replays the previous outcome instead of performing the next operation.
const grant = () => ({ requestId: `driven-${++requests}`, executionGrant: 'grant' });

function revision(context) {
  return context.manager().getRun(context.actorRef ?? context.actor, context.runId).runRevision;
}

function executeCall(context, extra = {}) {
  return context.engine.executeVersionedStage({
    viewer: context.gm,
    actor: context.actor,
    componentSourceActors: context.sources,
    runId: context.runId,
    expectedRevision: revision(context),
    ...grant(),
    ...extra,
  });
}

function beginCall(context, extra = {}) {
  return context.engine.beginVersionedStage({
    viewer: context.gm,
    actor: context.actor,
    componentSourceActors: context.sources,
    runId: context.runId,
    expectedRevision: revision(context),
    ...grant(),
    ...extra,
  });
}

test('D-026: a versioned run spends its materials when it starts, before anything is executed', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async (context) => ({
      remainingAtStart: context.remaining(),
      started: context.started,
      stage: context.manager().getRun(context.actor, context.runId).steps[0],
    }),
  });

  assert.deepEqual(fixture.remainingAtStart, [0, 0], 'both carriers were consumed at start');
  assert.equal(fixture.started.waiting, true);
  assert.equal(fixture.stage.preparedConsumption.consumedSummary.length, 2);
  assert.deepEqual(
    fixture.stage.preparedConsumption.consumedSummary.map((entry) => entry.name),
    ['Carrier 1', 'Carrier 2']
  );
  assert.equal(fixture.stage.preparedConsumption.essenceSpend.carriers.length, 2);
  assert.ok(fixture.stage.timeGate.availableAt > fixture.stage.timeGate.initiatedAt);
});

test('D-028/M14: the locked choice resolves the stage with NO selection plan supplied at execute', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async (context) => {
      game.time.worldTime += 600;
      const resolved = await executeCall(context);
      return { resolved, awarded: context.actor.items.length };
    },
  });

  assert.equal(fixture.resolved.success, true, JSON.stringify(fixture.resolved));
  assert.equal(fixture.resolved.disposition, 'succeeded');
  assert.equal(fixture.awarded, 1, 'the run awarded its result without a re-supplied selection');
});

test('D-028: a late selection plan naming a different route cannot change what a started stage rolls', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async (context) => {
      game.time.worldTime += 600;
      const resolved = await executeCall(context, {
        selectionPlan: { selectedIngredientSetId: 'next-route', ingredientOptionOverrides: {} },
      });
      return { resolved, record: structuredClone(context.manager().getRunHistory(context.actor)[0]) };
    },
  });

  assert.equal(fixture.resolved.success, true, JSON.stringify(fixture.resolved));
  assert.equal(
    fixture.record.steps[0].selectedIngredientSetId,
    'route',
    'the locked route resolved the stage, not the late one'
  );
  assert.equal(fixture.record.steps[0].selectionPlan.selectedIngredientSetId, 'route');
});

test('M13: a started stage refuses its check until the gate has elapsed, then describes it', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async (context) => {
      const describe = () =>
        context.engine.describeVersionedStageCheck({
          actor: context.actor,
          componentSourceActors: context.sources,
          runId: context.runId,
          preparationGrant: 'grant',
          requestId: 'describe',
        });
      let early = null;
      try {
        await describe();
      } catch (error) {
        early = error.code;
      }
      game.time.worldTime += 600;
      return { early, matured: await describe() };
    },
  });

  assert.equal(fixture.early, 'STAGE_NOT_EXECUTABLE', 'the roll is refused while time remains');
  assert.equal(fixture.matured.required, true, 'the same call succeeds once the gate elapses');
});

test('M15: only the begin control starts the next stage, and a manual execute is refused', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      game.time.worldTime += 600;
      await executeCall(context);
      const unstarted = context.manager().getRun(context.actor, context.runId);
      const refused = await executeCall(context);
      const stillUnstarted = context.manager().getRun(context.actor, context.runId).steps[1];
      const begun = await beginCall(context);
      return {
        unstartedStage: structuredClone(unstarted.steps[1]),
        currentIndex: unstarted.currentStepIndex,
        refused,
        stillUnstarted: structuredClone(stillUnstarted),
        begun,
        startedStage: structuredClone(
          context.manager().getRun(context.actor, context.runId).steps[1]
        ),
      };
    },
  });

  assert.equal(fixture.currentIndex, 1, 'the run advanced to its second stage');
  assert.equal(fixture.unstartedStage.preparedConsumption, undefined);
  assert.equal(fixture.unstartedStage.timeGate, undefined);
  assert.equal(fixture.refused.success, false);
  assert.match(fixture.refused.message, /Begin this crafting stage/);
  assert.equal(
    fixture.stillUnstarted.timeGate,
    undefined,
    'the refused execute armed nothing at all'
  );
  assert.equal(fixture.begun.started, true);
  assert.ok(fixture.startedStage.preparedConsumption, 'begin recorded the stage consumption');
  assert.ok(fixture.startedStage.timeGate, 'begin armed the clock');
});

test('M15: beginning an already-started stage is refused rather than spending twice', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async (context) => ({ again: await beginCall(context) }),
  });

  assert.equal(fixture.again.success, false);
  assert.match(fixture.again.message, /already started/);
});

test('D-026: cancelling a started run returns what its stage spent, and pausing returns nothing', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async (context) => {
      await context.manager().pauseRun(context.actor, context.runId, {
        expectedRevision: revision(context),
      });
      const afterPause = context.remaining();
      await context.manager().resumeRun(context.actor, context.runId, {
        expectedRevision: revision(context),
      });
      const cancelled = await context.engine.cancelVersionedRun({
        actor: context.actor,
        runId: context.runId,
        expectedRevision: revision(context),
        ...grant(),
      });
      return { afterPause, cancelled, restoredCrafterItems: context.actor.items.length };
    },
  });

  assert.deepEqual(fixture.afterPause, [0, 0], 'pausing refunds nothing');
  assert.equal(fixture.cancelled.cancelled, true);
  assert.equal(fixture.cancelled.refunded, true);
  assert.equal(fixture.cancelled.restoredCount, 2);
  assert.equal(fixture.restoredCrafterItems, 2, 'both consumed carriers were handed back');
});

test('the projection offers begin, withholds the roll, and locks the materials surface', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      const startedModel = context.project().activeRuns[0];
      game.time.worldTime += 600;
      await executeCall(context);
      const unstartedModel = context.project().activeRuns[0];
      await beginCall(context);
      return { startedModel, unstartedModel, begunModel: context.project().activeRuns[0] };
    },
  });

  assert.equal(fixture.startedModel.actions.beginStep, false, 'a started stage has begun');
  assert.equal(fixture.startedModel.actions.setSelection, false, 'its choice is locked');
  assert.equal(fixture.startedModel.currentStep.stageStarted, true);
  assert.equal(fixture.startedModel.currentStep.selectionAvailability.locked, true);
  assert.equal(fixture.startedModel.currentStep.selectionAvailability.knownMaterialShortfall, false);

  assert.equal(fixture.unstartedModel.actions.beginStep, true, 'the next stage offers begin');
  assert.equal(fixture.unstartedModel.actions.execute, false, 'and withholds the roll');
  assert.equal(fixture.unstartedModel.actions.disabledReason, 'stageNotStarted');
  assert.equal(fixture.unstartedModel.actions.setSelection, true, 'its choice is still editable');
  assert.equal(fixture.unstartedModel.currentStep.stageStarted, false);

  assert.equal(fixture.begunModel.actions.beginStep, false);
  assert.equal(fixture.begunModel.actions.setSelection, false);
  assert.equal(fixture.begunModel.currentStep.stageStarted, true);
});

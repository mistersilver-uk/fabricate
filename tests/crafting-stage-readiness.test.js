/**
 * No control may be offered where the command behind it refuses (issue 1648).
 *
 * Every case drives the REAL engine command and the REAL projection from ONE fixture and
 * asserts they agree: the projection's enabled state and the command's disposition are read
 * from the same run, in the same world, at the same moment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createPersistedCraftingHistory, historyItem } from './helpers/journal-fixtures.js';
import { IngredientSet } from '../src/models/IngredientSet.js';
import { RunJournalBuilder } from '../src/systems/RunJournalBuilder.js';

let requests = 0;
const grant = () => ({ requestId: `readiness-${++requests}`, executionGrant: 'grant' });

const revision = (context) => context.manager().getRun(context.actor, context.runId).runRevision;

const call = (context, operation, extra = {}) =>
  context.engine[operation]({
    viewer: context.gm,
    actor: context.actor,
    componentSourceActors: context.sources,
    runId: context.runId,
    expectedRevision: revision(context),
    ...grant(),
    ...extra,
  });

const executeCall = (context, extra) => call(context, 'executeVersionedStage', extra);
const beginCall = (context, extra) => call(context, 'beginVersionedStage', extra);

/**
 * Re-shape the live run into the state the SHIPPED release leaves behind: a gated stage
 * with no start-phase consumption record, its inputs still held because that release spent
 * them at execute. Nothing in production backfills this; there is no migration.
 */
function armBeforeStartCommit(context) {
  const stored = context.actor.flags.fabricate['fabricate.craftingRuns'].active[context.runId];
  delete stored.steps[0].preparedConsumption;
  context.manager().invalidateCache(context.actor.id);
  context.sources.forEach((source, index) => historyItem(source, index));
  return structuredClone(stored.steps[0]);
}

/** Advance the run to its second, unbegun stage and re-author that stage's requirements. */
async function reachUnbegunStage(context, authored) {
  game.time.worldTime += 600;
  await executeCall(context);
  Object.assign(context.steps[1], authored);
  return context.manager().getRun(context.actor, context.runId);
}

const missingTool = (context) => {
  context.engine.recipeManager.getToolsForSet = () => [
    { id: 'hammer', name: 'Hammer', enabled: true },
  ];
  context.engine.recipeManager.resolveToolStates = () => [
    { name: 'Hammer', img: null, available: false, needsRepair: false },
  ];
};

const route = (groups) => [new IngredientSet({ id: 'next-route', name: 'Next route', ingredientGroups: groups })];

test('QE-1: a stage armed before the start commit resolves through the control the projection offers', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async (context) => {
      const stage = armBeforeStartCommit(context);
      game.time.worldTime += 600;
      const model = context.project().activeRuns[0];
      return { stage, model, resolved: await executeCall(context) };
    },
  });

  assert.ok(fixture.stage.timeGate, 'the stage is gated');
  assert.equal(fixture.stage.preparedConsumption, undefined, 'and carries no start-phase receipt');
  // The shape the reviewer reproduced: an enabled primary, no begin control, no reason.
  assert.equal(fixture.model.actions.execute, true);
  assert.equal(fixture.model.actions.atStageStart, false, 'no begin control renders at all');
  assert.equal(fixture.model.actions.disabledReason, null);
  // So the command it drives MUST resolve the stage rather than refuse it.
  assert.equal(fixture.resolved.success, true, JSON.stringify(fixture.resolved));
  assert.equal(fixture.resolved.disposition, 'succeeded');
});

test('QE-1: beginning a stage armed before the start commit is refused, and arms nothing', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async (context) => {
      armBeforeStartCommit(context);
      game.time.worldTime += 600;
      const refused = await beginCall(context);
      return {
        refused,
        stage: structuredClone(context.manager().getRun(context.actor, context.runId).steps[0]),
      };
    },
  });

  assert.equal(fixture.refused.success, false);
  assert.match(fixture.refused.message, /already started/);
  assert.equal(fixture.stage.preparedConsumption, undefined, 'the refusal spent nothing');
});

test('QE-2: a tool the actor does not hold refuses begin, so the projection must not offer it', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      await reachUnbegunStage(context, { toolIds: ['hammer'] });
      missingTool(context);
      const model = context.project().activeRuns[0];
      return { model, refused: await beginCall(context) };
    },
  });

  assert.equal(fixture.refused.success, false);
  assert.match(fixture.refused.message, /Missing required tool/);
  assert.equal(fixture.model.actions.atStageStart, true, 'the begin control still renders');
  assert.equal(fixture.model.actions.beginStep, false, 'but it is refused, not offered');
  assert.equal(fixture.model.actions.disabledReason, 'toolRequired');
  assert.equal(fixture.model.awaitingChoice, false, 'a missing tool is not a choice');
  assert.deepEqual(
    fixture.model.currentStep.detail.tools.map((entry) => [entry.name, entry.available]),
    [['Hammer', false]],
    'and the tool row states that it is missing'
  );
});

test('QE-2: an essence gap the ledger cannot cover reports essences, never an unmade choice', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      await reachUnbegunStage(context, {
        ingredientSets: route([
          { id: 'sun', name: 'Sun', options: [{ match: { type: 'essence', essenceId: 'sun', amount: 4 } }] },
        ]),
      });
      const model = context.project().activeRuns[0];
      return { model, refused: await beginCall(context) };
    },
  });

  assert.equal(fixture.refused.success, false);
  // M14's exact sentence, reproduced through the very control D-028 added to eliminate it.
  assert.doesNotMatch(fixture.refused.message, /Choose the crafting requirements/);
  assert.match(fixture.refused.message, /Missing required items/);
  assert.equal(fixture.model.actions.beginStep, false);
  assert.equal(fixture.model.actions.disabledReason, 'essenceRequired');
  assert.equal(fixture.model.awaitingChoice, false, 'there is nothing to choose');
});

test('QE-2: an unmade pick between two workable options refuses begin, so it is not offered', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      await reachUnbegunStage(context, {
        ingredientSets: route([
          {
            id: 'metal',
            name: 'Metal',
            options: [
              { quantity: 1, match: { type: 'component', componentId: 'iron' } },
              { quantity: 1, match: { type: 'component', componentId: 'silver' } },
            ],
          },
        ]),
      });
      context.engine.recipeManager.ingredientMatchesItem = () => true;
      context.sources.forEach((source, index) => historyItem(source, index));
      const model = context.project().activeRuns[0];
      return { model, refused: await beginCall(context) };
    },
  });

  assert.equal(fixture.refused.success, false);
  assert.match(fixture.refused.message, /Choose the crafting requirements/);
  assert.equal(fixture.model.actions.beginStep, false, 'the engine demands a persisted pick');
  assert.equal(fixture.model.actions.disabledReason, 'choiceRequired');
  assert.equal(fixture.model.actions.setSelection, true, 'and the player has a control to make it');
  assert.equal(fixture.model.awaitingChoice, true);
});

test('QE-2: a currency ingredient the actor cannot afford reports currency, not materials', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      await reachUnbegunStage(context, {
        ingredientSets: route([
          { id: 'fee', name: 'Fee', options: [{ match: { type: 'currency', unit: 'gp', amount: 10 } }] },
        ]),
      });
      const model = context.project().activeRuns[0];
      return { model, refused: await beginCall(context) };
    },
  });

  assert.equal(fixture.refused.success, false);
  assert.equal(fixture.model.actions.beginStep, false);
  assert.equal(fixture.model.actions.disabledReason, 'currencyRequired');
  assert.equal(fixture.model.awaitingChoice, false, 'a price is not a choice');
});

test('QE-2: a tool sold while a started stage waits refuses its primary, so it is not offered', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 1,
    drive: async (context) => {
      context.steps[0].toolIds = ['hammer'];
      missingTool(context);
      game.time.worldTime += 600;
      const model = context.project().activeRuns[0];
      return { model, refused: await executeCall(context) };
    },
  });

  assert.equal(fixture.refused.success, false);
  assert.match(fixture.refused.message, /Missing required tool/);
  assert.equal(fixture.model.actions.execute, false, 'the started stage withholds its primary');
  assert.equal(fixture.model.actions.disabledReason, 'toolRequired');
});

/**
 * F2/QE2-4. The resolver's currency probe is PER OPTION, so two prices each affordable alone
 * resolved as success and the engine's aggregate gate then refused the begin the projection had
 * offered. 50 gp held against 30 + 30 required is the reviewer's own executed disagreement.
 */
test('QE-2: two prices affordable alone but not together refuse begin, so it is not offered', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      context.actor.system = { currency: { gp: 50, sp: 0 } };
      await reachUnbegunStage(context, {
        ingredientSets: route([
          { id: 'fee-a', name: 'Permit', options: [{ match: { type: 'currency', unit: 'gp', amount: 30 } }] },
          { id: 'fee-b', name: 'Bribe', options: [{ match: { type: 'currency', unit: 'gp', amount: 30 } }] },
        ]),
      });
      const model = context.project().activeRuns[0];
      return { model, refused: await beginCall(context) };
    },
  });

  assert.equal(fixture.refused.success, false, 'the engine refuses the aggregate');
  assert.match(fixture.refused.message, /currency|Insufficient/i, fixture.refused.message);
  assert.equal(fixture.model.actions.beginStep, false, 'so the projection must not offer it');
  assert.equal(fixture.model.actions.disabledReason, 'currencyRequired');
  assert.equal(fixture.model.awaitingChoice, false, 'a price is not a choice');
});

/** The same fixture, affordable: the aggregate gate is a gate, not a constant refusal. */
test('QE-2: two prices the actor CAN afford together offer begin, and it commits', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      context.actor.system = { currency: { gp: 80, sp: 0 } };
      context.actor.update = async (updates) => {
        for (const [path, value] of Object.entries(updates)) {
          const parts = path.split('.');
          let target = context.actor;
          for (const part of parts.slice(0, -1)) target = target[part];
          target[parts.at(-1)] = value;
        }
        return context.actor;
      };
      await reachUnbegunStage(context, {
        ingredientSets: route([
          { id: 'fee-a', name: 'Permit', options: [{ match: { type: 'currency', unit: 'gp', amount: 30 } }] },
          { id: 'fee-b', name: 'Bribe', options: [{ match: { type: 'currency', unit: 'gp', amount: 30 } }] },
        ]),
      });
      const model = context.project().activeRuns[0];
      return { model, began: await beginCall(context), gp: context.actor.system.currency.gp };
    },
  });

  assert.equal(fixture.model.actions.beginStep, true, 'the control is offered');
  assert.equal(fixture.model.actions.disabledReason, 'stageNotStarted',
    'the only thing outstanding is the click itself');
  assert.equal(fixture.began.success, true, JSON.stringify(fixture.began));
  assert.equal(fixture.gp, 20, 'and both prices were actually paid');
});

/**
 * F4/FI6. An item matched as BOTH a required tool and a selected ingredient is available to the
 * engine's tool validation only because that validation excludes the selection's items. The
 * projection's tool probe must exclude the same set, or it reads available where the command
 * reads missing.
 */
test('QE-2: an item that is both the selection and the tool is excluded from both probes alike', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      await reachUnbegunStage(context, {
        toolIds: ['hammer'],
        ingredientSets: route([
          { id: 'metal', name: 'Metal', options: [{ quantity: 1, match: { type: 'component', componentId: 'iron' } }] },
        ]),
      });
      // ONE physical item in the whole candidate set - the earlier stage's award included - so
      // the selection and the tool probe cannot reach for different copies and the exclusion is
      // what decides.
      for (const source of [...context.sources, context.actor]) source.items = [];
      const held = historyItem(context.sources[0], 0);
      context.engine.recipeManager.ingredientMatchesItem = () => true;
      context.engine.recipeManager.getToolsForSet = () => [{ id: 'hammer', name: 'Hammer', enabled: true }];
      // The SAME physical item satisfies the tool, and only while it is not excluded.
      context.engine.recipeManager.resolveToolStates = (_view, tools, actors, options) => {
        const excluded = options?.excludedItems ?? new Set();
        const candidates = actors.flatMap((entry) => [...(entry?.items ?? [])])
          .filter((item) => !excluded.has(item));
        return tools.map(() => ({ name: 'Hammer', img: null,
          available: candidates.some((item) => item.uuid === held.uuid), needsRepair: false }));
      };
      const model = context.project().activeRuns[0];
      return { model, refused: await beginCall(context) };
    },
  });

  assert.equal(fixture.refused.success, false, 'the engine refuses: the item is spent, not held');
  assert.match(fixture.refused.message, /Missing required tool/);
  assert.equal(fixture.model.actions.beginStep, false, 'so the projection must not offer begin');
  assert.equal(fixture.model.actions.disabledReason, 'toolRequired');
});

/**
 * F5/FI4. A run whose recorded source actors have gone is judged against an inventory that is not
 * its own, and the engine refuses it outright. The projection says so rather than reporting
 * whatever shortfall the crafting actor's own inventory happens to show.
 */
test('QE-2: a run whose source actors are gone reports that, not a material shortfall', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      await reachUnbegunStage(context, {
        ingredientSets: route([
          { id: 'metal', name: 'Metal', options: [{ quantity: 1, match: { type: 'component', componentId: 'iron' } }] },
        ]),
      });
      const orphaned = new RunJournalBuilder({
        craftingRunManager: context.manager(),
        recipeManager: context.engine.recipeManager,
        getSystem: () => context.system,
        nowWorldTime: () => Number(game.time?.worldTime ?? 0),
        getComponentSourceActors: () => [],
      }).buildListing({ actor: context.actor, viewer: context.gm });
      return {
        model: orphaned.activeRuns[0],
        refused: await context.engine.beginVersionedStage({
          viewer: context.gm, actor: context.actor, componentSourceActors: [],
          runId: context.runId, expectedRevision: revision(context), ...grant(),
        }),
      };
    },
  });

  assert.equal(fixture.refused.success, false);
  assert.match(fixture.refused.message, /component sources changed/);
  assert.equal(fixture.model.actions.beginStep, false);
  assert.equal(fixture.model.actions.disabledReason, 'sourcesUnavailable');
  assert.equal(fixture.model.awaitingChoice, false, 'a vanished stash is not a choice');
});

/**
 * The payload `StepDetails.changeAllocation` -> `journalStore.setSelection` -> `main.js`
 * builds, derived from the MODEL exactly as those three do, so the route id this test persists
 * is the one the screen would have sent.
 */
function allocationSelection(model, ingredientSet, allocation) {
  const step = model.currentStep;
  const routeId =
    step.selectionPlan?.selectedIngredientSetId ??
    step.selectionAvailability?.selectedIngredientSetId ??
    step.requirementSnapshot?.id ??
    null;
  return {
    routeId,
    selection: {
      ...(step.selectionPlan ?? {}),
      selectedIngredientSetId: routeId,
      ingredientEssenceAllocation: {
        stepId: step.stepId,
        ingredientSetId: routeId,
        allocation,
      },
      selectedRequirementSnapshot: ingredientSet.toJSON?.() ?? ingredientSet,
    },
  };
}

test('M17: an allocation set on a just-advanced stage persists, and begin then spends it', async () => {
  const fixture = await createPersistedCraftingHistory({
    stageCount: 2,
    drive: async (context) => {
      const set = route([
        {
          id: 'sun',
          name: 'Sun',
          options: [{ match: { type: 'essence', essenceId: 'sun', amount: 2 } }],
        },
      ])[0];
      await reachUnbegunStage(context, { ingredientSets: [set] });
      // The stage a multi-step run ARRIVES in: `completeStepSuccess` wrote it no plan and no
      // requirement snapshot, which is the state the maintainer hit.
      const arrived = context.manager().getRun(context.actor, context.runId).steps[1];
      const carriers = context.sources.map((source, index) => historyItem(source, index));
      const model = context.project().activeRuns[0];
      const { routeId, selection } = allocationSelection(model, set, {
        [carriers[0].uuid]: 3,
      });
      const persisted = await context
        .manager()
        .setStepSelectionPlan(context.actor, context.runId, model.stepIndex, selection, {
          expectedRevision: revision(context),
        });
      const begun = await beginCall(context);
      return {
        arrived: { plan: arrived.selectionPlan ?? null, snapshot: arrived.selectedRequirementSnapshot ?? null },
        modelRouteId: routeId,
        persistedAllocation: persisted?.steps?.[1]?.selectionPlan?.ingredientEssenceAllocation ?? null,
        begun,
        stage: structuredClone(context.manager().getRun(context.actor, context.runId).steps[1]),
        remaining: context.remaining(),
      };
    },
  });

  assert.equal(fixture.arrived.plan, null, 'the stage arrived with no persisted plan');
  assert.equal(fixture.arrived.snapshot, null, 'and no requirement snapshot to read a route from');
  // The projection is the only field that names the route, so the selection command can land.
  assert.equal(fixture.modelRouteId, 'next-route');
  assert.deepEqual(fixture.persistedAllocation.allocation, {
    'Actor.source-a.Item.same-id': 3,
  });
  // 3 allocated against a need of 2 is not an overshoot refusal: the stage begins and SPENDS.
  assert.equal(fixture.begun.success, true, JSON.stringify(fixture.begun));
  assert.equal(fixture.begun.started, true);
  assert.ok(fixture.stage.preparedConsumption, 'beginning recorded what the stage consumed');
  assert.ok(
    fixture.stage.preparedConsumption.consumedSummary.length > 0,
    'and the ingredients were actually consumed, not merely planned'
  );
  assert.deepEqual(fixture.remaining, [0, 1], 'the funding carrier left the source actor');
});

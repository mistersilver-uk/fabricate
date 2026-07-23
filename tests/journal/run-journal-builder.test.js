/**
 * Coverage for the unified RunJournalBuilder projection (crafting fully; a
 * gathering passthrough smoke). Verifies the crafting RunModel shape — stepLabel,
 * per-step timeGate, derivedStatus (ready vs waiting from `availableAt`, never
 * `run.status`), stepName/tool/check/time resolution, createdResults aggregation,
 * viewer redaction parity, and the gathering `*WorldTime` re-map.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { RunJournalBuilder } from '../../src/systems/RunJournalBuilder.js';

const ACTOR = { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Akra', img: 'icons/a.webp' };
const PLAYER = { id: 'user-1', isGM: false };
const GM = { id: 'gm-1', isGM: true };

// localize stub: surfaces key + interpolation data so label composition is testable.
const localize = (key, data) => (data ? `${key}|${JSON.stringify(data)}` : key);

const SYSTEM = {
  id: 'sys-1',
  name: 'Blacksmithing',
  resolutionMode: 'simple',
  // Multi-step feature ON: a multi-step recipe projects as a multi-step run. When
  // the feature is off the run collapses to a single-step projection (issue 710) —
  // see the dedicated collapse test below.
  features: { multiStepRecipes: true },
  craftingCheck: { simple: { rollFormula: '1d20', dc: 15, tiers: [] } },
  tools: [{ id: 't1', label: 'Hammer', componentId: 'c1' }],
  components: [{ id: 'c1', name: 'Smith Hammer', img: 'icons/hammer.webp' }],
};

const RECIPE = {
  id: 'recipe-1',
  name: 'Iron Sword',
  img: 'icons/sword.webp',
  craftingSystemId: 'sys-1',
  checkTierId: null,
  steps: [{ id: 's0' }, { id: 's1' }],
  getExecutionSteps: () => [
    { id: 's0', toolIds: [], timeRequirement: null },
    { id: 's1', toolIds: ['t1'], timeRequirement: { hours: 1 } },
  ],
};

// Same id as RECIPE (so a run's recipeId resolves), but a single execution step —
// exercises the single-step projection (blanked stepLabel, multiStep false).
const SINGLE_STEP_RECIPE = {
  ...RECIPE,
  name: 'Round Shield',
  steps: [{ id: 's0' }],
  getExecutionSteps: () => [{ id: 's0', toolIds: ['t1'], timeRequirement: { hours: 1 } }],
};

// A single-step run body (one recorded step) to pair with SINGLE_STEP_RECIPE.
function activeSingleStepRun(overrides = {}) {
  return activeCraftingRun({
    currentStepIndex: 0,
    steps: [
      {
        stepId: 's0',
        stepName: 'Step 1',
        index: 0,
        status: 'waitingTime',
        timeGate: { requiredSeconds: 3600, initiatedAt: 150, availableAt: 3750 },
      },
    ],
    ...overrides,
  });
}

function activeCraftingRun(overrides = {}) {
  return {
    id: 'run-1',
    craftingSystemId: 'sys-1',
    recipeId: 'recipe-1',
    status: 'waitingTime',
    startedAt: 100,
    updatedAt: 150,
    currentStepIndex: 1,
    componentSourceActorUuids: ['Actor.x'],
    steps: [
      {
        stepId: 's0',
        stepName: 'Forge',
        index: 0,
        status: 'succeeded',
        createdResults: [{ itemUuid: 'Item.a', quantity: 2 }],
      },
      {
        stepId: 's1',
        stepName: 'Temper',
        index: 1,
        status: 'waitingTime',
        timeGate: { requiredSeconds: 3600, initiatedAt: 150, availableAt: 3750 },
        lastCheckResult: null,
      },
    ],
    ...overrides,
  };
}

function terminalCraftingRun(overrides = {}) {
  return {
    id: 'run-0',
    craftingSystemId: 'sys-1',
    recipeId: 'recipe-1',
    status: 'succeeded',
    startedAt: 10,
    updatedAt: 60,
    finishedAt: 60,
    currentStepIndex: null,
    steps: [
      {
        stepId: 's0',
        stepName: 'Forge',
        index: 0,
        status: 'succeeded',
        createdResults: [{ itemUuid: 'Item.z', quantity: 1 }],
      },
    ],
    ...overrides,
  };
}

function makeBuilder({
  active = [],
  history = [],
  worldTime = 200,
  recipeVisibility = null,
  gatheringActive = [],
  salvageActive = [],
  salvageHistory = [],
  mode = 'simple',
  system = SYSTEM,
  recipe = RECIPE,
  getGatheringTask = null,
  getResultItem = null,
  getRecipeItemImg = null,
  getComponent = null,
} = {}) {
  return new RunJournalBuilder({
    craftingRunManager: {
      getActiveRuns: () => active,
      getRunHistory: () => history,
    },
    salvageRunManager: {
      getActiveRuns: () => salvageActive,
      getRunHistory: () => salvageHistory,
    },
    gatheringRunSource: {
      getActiveRuns: () => gatheringActive,
      getRunHistory: () => [],
    },
    recipeManager: { getRecipe: (id) => (id === recipe.id ? recipe : null) },
    resolutionModeService: { getMode: () => mode },
    recipeVisibility,
    getSystem: (id) => (id === system.id ? system : null),
    getTool: (systemId, toolId) => {
      if (systemId !== SYSTEM.id) return null;
      const tool = SYSTEM.tools.find((entry) => entry.id === toolId);
      return tool ? { id: tool.id, name: tool.label } : null;
    },
    getGatheringTask,
    getResultItem,
    getRecipeItemImg,
    getComponent,
    localize,
    nowWorldTime: () => worldTime,
  });
}

test('buildListing returns an empty shape with no actor', () => {
  const listing = makeBuilder({ active: [activeCraftingRun()] }).buildListing({ viewer: PLAYER });
  assert.equal(listing.actor, null);
  assert.deepEqual(listing.counts, { active: 0, history: 0 });
  assert.deepEqual(listing.activeRuns, []);
});

test('projects a crafting RunModel with stepLabel, per-step timeGate, and stepName', () => {
  const listing = makeBuilder({ active: [activeCraftingRun()] }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  });
  const [run] = listing.activeRuns;

  assert.equal(run.runType, 'crafting');
  assert.equal(run.manualAdvance, true);
  assert.equal(run.stepCount, 2);
  assert.equal(run.stepIndex, 1);
  assert.equal(run.multiStep, true);
  // Current step is the last (index 1 of 2), so the run is on its final step.
  assert.equal(run.isFinalStep, true);
  // The active step (s1 "Temper") name annotates the label via LabelNamed.
  assert.equal(
    run.stepLabel,
    'FABRICATE.App.Journal.Step.LabelNamed|{"index":2,"count":2,"name":"Temper"}'
  );
  // Per-step gate: the run-level timeGate is the CURRENT step's gate.
  assert.deepEqual(run.timeGate, { requiredSeconds: 3600, initiatedAt: 150, availableAt: 3750 });
  assert.equal(run.steps[0].stepName, 'Forge');
  assert.equal(run.steps[1].stepName, 'Temper');
  assert.deepEqual(run.steps[1].timeGate, run.timeGate);
});

test('canCancel is true only for an owned, live, discovered crafting run (issue 848)', () => {
  const ownedActor = { ...ACTOR, isOwner: true };
  const owned = makeBuilder({ active: [activeCraftingRun()] }).buildListing({
    actor: ownedActor,
    viewer: PLAYER,
  }).activeRuns[0];
  assert.equal(owned.canCancel, true, 'an owned in-progress run is cancellable');
  // SYSTEM carries no explicit refundOnPlayerCancel, so it defaults to refunding.
  assert.equal(owned.refundOnCancel, true, 'default-ON refund policy projects through');
});

test('canCancel is false for a run on an actor the viewer does not own', () => {
  const notOwnedActor = { ...ACTOR, isOwner: false };
  const notOwned = makeBuilder({ active: [activeCraftingRun()] }).buildListing({
    actor: notOwnedActor,
    viewer: PLAYER,
  }).activeRuns[0];
  assert.equal(notOwned.canCancel, false, 'a non-owner cannot cancel');
});

test('canCancel is false for a terminal (history) crafting run', () => {
  const ownedActor = { ...ACTOR, isOwner: true };
  const terminal = makeBuilder({ history: [terminalCraftingRun()] }).buildListing({
    actor: ownedActor,
    viewer: PLAYER,
  }).history[0];
  assert.equal(terminal.canCancel, false, 'a finished run is not cancellable');
});

test('refundOnCancel mirrors the system features.refundOnPlayerCancel toggle', () => {
  const forfeitSystem = { ...SYSTEM, features: { ...SYSTEM.features, refundOnPlayerCancel: false } };
  const ownedActor = { ...ACTOR, isOwner: true };
  const run = makeBuilder({ active: [activeCraftingRun()], system: forfeitSystem })
    .buildListing({ actor: ownedActor, viewer: PLAYER })
    .activeRuns[0];
  assert.equal(run.refundOnCancel, false, 'an explicit false projects as forfeit-on-cancel');
});

test('derivedStatus is waiting before the gate matures and ready after (not from run.status)', () => {
  const waiting = makeBuilder({ active: [activeCraftingRun()], worldTime: 200 }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];
  assert.equal(waiting.status, 'waitingTime');
  assert.equal(waiting.derivedStatus, 'waiting');

  // World time past availableAt: ready even though run.status is still waitingTime
  // (the engine flips it async off the same hook).
  const ready = makeBuilder({ active: [activeCraftingRun()], worldTime: 5000 }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];
  assert.equal(ready.derivedStatus, 'ready');
});

test('an un-armed step (no gate) is inProgress / actionable', () => {
  const run = activeCraftingRun({
    status: 'inProgress',
    currentStepIndex: 1,
    steps: [
      { stepId: 's0', stepName: 'Forge', index: 0, status: 'succeeded', createdResults: [] },
      { stepId: 's1', stepName: 'Temper', index: 1, status: 'inProgress' },
    ],
  });
  const model = makeBuilder({ active: [run] }).buildListing({ actor: ACTOR, viewer: PLAYER })
    .activeRuns[0];
  assert.equal(model.derivedStatus, 'inProgress');
  assert.equal(model.timeGate, null);
});

test('resolves tool, check (formula + DC), and required time on the step detail', () => {
  const run = makeBuilder({ active: [activeCraftingRun()] }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];
  const detail = run.steps[1].detail;

  assert.deepEqual(detail.toolNames, ['Hammer']);
  assert.equal(detail.primaryToolName, 'Hammer');
  assert.equal(
    detail.checkLabel,
    'FABRICATE.App.Journal.StepDetails.CheckWithDc|{"formula":"1d20","dc":15}'
  );
  assert.equal(detail.requiredSeconds, 3600);
  assert.equal(run.resolutionModeLabel, 'FABRICATE.App.Journal.Mode.Standard');
  assert.equal(run.structureLabel, 'FABRICATE.App.Journal.Structure.MultiStep');
});

test('isFinalStep is false on a non-final step of a multi-step recipe', () => {
  const run = makeBuilder({ active: [activeCraftingRun({ currentStepIndex: 0 })] }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];
  assert.equal(run.multiStep, true);
  assert.equal(run.isFinalStep, false);
});

test('collapses a multi-step run to a single-step projection when the feature is off (issue 710)', () => {
  // The run record still carries per-step detail, but with the system's multi-step
  // feature OFF the recipe ran as one atomic chain, so the Journal presents it as a
  // single-step run: multiStep false, a Single-Step structure label, and a blank
  // "Step X of Y" label. Re-enabling the feature restores the multi-step projection.
  const collapsedSystem = { ...SYSTEM, features: { multiStepRecipes: false } };
  const run = makeBuilder({
    active: [activeCraftingRun()],
    system: collapsedSystem,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];

  assert.equal(run.multiStep, false, 'a collapsed multi-step run projects as single-step');
  assert.equal(run.stepLabel, '', 'the "Step X of Y" label is blanked while collapsed');
  assert.equal(run.structureLabel, 'FABRICATE.App.Journal.Structure.SingleStep');
  // The per-step run record is untouched — both steps are still recorded.
  assert.equal(run.steps.length, 2, 'the run record retains its per-step detail');
});

test('single-step recipe blanks the step label and marks the run final', () => {
  const run = makeBuilder({
    active: [activeSingleStepRun()],
    recipe: SINGLE_STEP_RECIPE,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];

  assert.equal(run.stepCount, 1);
  assert.equal(run.multiStep, false);
  assert.equal(run.isFinalStep, true);
  // The redundant "Step 1 of 1" bookkeeping is suppressed; the structure chip stays.
  assert.equal(run.stepLabel, '');
  assert.equal(run.structureLabel, 'FABRICATE.App.Journal.Structure.SingleStep');
});

test('terminal single-step run blanks the label and stays final (currentStepIndex null)', () => {
  const run = makeBuilder({
    history: [terminalCraftingRun()],
    recipe: SINGLE_STEP_RECIPE,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).history[0];
  assert.equal(run.derivedStatus, 'succeeded');
  assert.equal(run.multiStep, false);
  // stepCount <= 1 marks it final even though currentStepIndex is null on a terminal run.
  assert.equal(run.isFinalStep, true);
  assert.equal(run.stepLabel, '');
});

test('check DC comes from the recipe tier, not a hardcoded default', () => {
  const tieredSystem = {
    ...SYSTEM,
    craftingCheck: { simple: { rollFormula: '1d20', dc: 12, tiers: [{ id: 'hard', dc: 22 }] } },
  };
  const builder = new RunJournalBuilder({
    craftingRunManager: { getActiveRuns: () => [activeCraftingRun()], getRunHistory: () => [] },
    recipeManager: { getRecipe: () => ({ ...RECIPE, checkTierId: 'hard' }) },
    resolutionModeService: { getMode: () => 'simple' },
    getSystem: () => tieredSystem,
    getTool: () => null,
    localize,
    nowWorldTime: () => 0,
  });
  const detail = builder.buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0].steps[1]
    .detail;
  assert.equal(
    detail.checkLabel,
    'FABRICATE.App.Journal.StepDetails.CheckWithDc|{"formula":"1d20","dc":22}'
  );
});

test('aggregates createdResults across steps', () => {
  const listing = makeBuilder({ history: [terminalCraftingRun()] }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  });
  const run = listing.history[0];
  assert.equal(run.derivedStatus, 'succeeded');
  // Terminal run: the final step (s0 "Forge") name annotates the label.
  assert.equal(
    run.stepLabel,
    'FABRICATE.App.Journal.Step.LabelNamed|{"index":1,"count":1,"name":"Forge"}'
  );
  assert.equal(run.createdResultCount, 1);
  assert.equal(run.createdResults[0].itemUuid, 'Item.z');
  assert.equal(run.createdResults[0].quantity, 1);
});

test('redacts an undiscovered recipe for a non-GM viewer but not for a GM', () => {
  const recipeVisibility = { evaluateRecipeAccess: () => ({ visible: false }) };

  const redacted = makeBuilder({ active: [activeCraftingRun()], recipeVisibility }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];
  assert.equal(redacted.redacted, true);
  assert.equal(redacted.names.title, 'FABRICATE.App.Journal.Redacted.Title');
  assert.equal(redacted.recipeId, null);
  assert.deepEqual(redacted.steps, []);
  assert.deepEqual(redacted.createdResults, []);
  // The step label is blanked so a hidden multi-step recipe never leaks its
  // step count / active step name through the run journal.
  assert.equal(redacted.stepLabel, '');
  // A hidden-identity run offers no "Trigger Next Step" advance.
  assert.equal(redacted.manualAdvance, false);
  // ...nor a player cancel (issue 848): a redacted run cannot be self-cancelled even by
  // an owner, since surfacing the affordance would leak that a run exists to cancel.
  const redactedOwned = makeBuilder({ active: [activeCraftingRun()], recipeVisibility })
    .buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: PLAYER })
    .activeRuns[0];
  assert.equal(redactedOwned.canCancel, false, 'a redacted run is never cancellable');

  const visible = makeBuilder({ active: [activeCraftingRun()], recipeVisibility }).buildListing({
    actor: ACTOR,
    viewer: GM,
  }).activeRuns[0];
  assert.equal(visible.redacted, false);
  assert.equal(visible.names.title, 'Iron Sword');
});

test('preserves crafting history order and reports counts', () => {
  const history = [
    terminalCraftingRun({ id: 'newest', finishedAt: 90 }),
    terminalCraftingRun({ id: 'older', finishedAt: 30 }),
  ];
  const listing = makeBuilder({ history }).buildListing({ actor: ACTOR, viewer: PLAYER });
  assert.deepEqual(
    listing.history.map((run) => run.id),
    ['newest', 'older']
  );
  assert.deepEqual(listing.counts, { active: 0, history: 2 });
});

test('gathering runs pass through with null steps and re-mapped *WorldTime fields', () => {
  const gatheringRun = {
    id: 'gather-1',
    craftingSystemId: 'sys-1',
    status: 'waitingTime',
    label: 'Gather Iron',
    taskId: 'task-a',
    timeGate: { requiredSeconds: 600, availableAt: 800 },
    startedAtWorldTime: 100,
    updatedAtWorldTime: 150,
  };
  const run = makeBuilder({ gatheringActive: [gatheringRun], worldTime: 200 }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];

  assert.equal(run.runType, 'gathering');
  assert.equal(run.manualAdvance, false);
  assert.deepEqual(run.steps, []);
  assert.equal(run.startedAt, 100);
  assert.equal(run.updatedAt, 150);
  assert.equal(run.derivedStatus, 'waiting');
  assert.equal(run.taskId, 'task-a');
});

test('gathering run resolves task name + image via getGatheringTask (no persisted label)', () => {
  const gatheringRun = {
    id: 'gather-2',
    craftingSystemId: 'sys-1',
    environmentId: 'env-1',
    status: 'waitingTime',
    taskId: 'mwTaskMineIronOre', // raw id, no label
    startedAtWorldTime: 100,
  };
  const getGatheringTask = (environmentId, taskId) =>
    environmentId === 'env-1' && taskId === 'mwTaskMineIronOre'
      ? { name: 'Mine Iron Ore', img: 'icons/tools/pick.webp' }
      : null;

  const run = makeBuilder({ gatheringActive: [gatheringRun], getGatheringTask }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];

  assert.equal(run.names.title, 'Mine Iron Ore', 'friendly task name, not the raw id');
  assert.equal(run.img, 'icons/tools/pick.webp', 'task image, not the generic default');
});

test('gathering run falls back to the raw taskId + default image when the task is unresolved', () => {
  const gatheringRun = {
    id: 'gather-3',
    craftingSystemId: 'sys-1',
    environmentId: 'env-x',
    status: 'waitingTime',
    taskId: 'mwTaskUnknown',
    startedAtWorldTime: 100,
  };
  const run = makeBuilder({
    gatheringActive: [gatheringRun],
    getGatheringTask: () => null,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];

  assert.equal(run.names.title, 'mwTaskUnknown');
  assert.equal(run.img, 'icons/svg/item-bag.svg');
});

test('gathering run with a blind/null taskId does not consult the task resolver', () => {
  let consulted = false;
  const getGatheringTask = () => {
    consulted = true;
    return { name: 'Should Not Appear', img: 'nope.webp' };
  };
  const blindRun = {
    id: 'gather-blind',
    craftingSystemId: 'sys-1',
    environmentId: 'env-1',
    status: 'waitingTime',
    taskId: 'blind',
    startedAtWorldTime: 100,
  };
  const run = makeBuilder({ gatheringActive: [blindRun], getGatheringTask }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];

  assert.equal(consulted, false, 'resolver not called for a blind task');
  assert.equal(run.names.title, 'blind');
  assert.equal(run.img, 'icons/svg/item-bag.svg');
});

test('crafting step exposes the recorded roll (resolved formula, total, dc) on lastCheckResult', () => {
  const run = terminalCraftingRun({
    status: 'failed',
    steps: [
      {
        stepId: 's0',
        stepName: 'Forge',
        index: 0,
        status: 'failed',
        failureReason: 'Crafting check failed',
        lastCheckResult: {
          success: false,
          outcome: 'fail',
          value: 11,
          reason: 'Crafting check failed',
          data: {
            dc: 16,
            formula: '1d20 + @abilities.int.mod',
            resolvedFormula: '1d20 + 3',
            total: 11,
            diceGroups: [],
          },
        },
        createdResults: [],
      },
    ],
  });
  const model = makeBuilder({ history: [run] }).buildListing({ actor: ACTOR, viewer: PLAYER })
    .history[0];
  const check = model.steps[0].lastCheckResult;
  assert.equal(check.formula, '1d20 + 3', 'resolved formula, not the authored placeholder');
  assert.equal(check.total, 11);
  assert.equal(check.dc, 16);
  assert.equal(check.success, false);
});

// A component resolver over the SYSTEM fixture's components, used to prove
// name/img resolution for projected requirements and legacy consumed refs.
const getSystemComponent = (systemId, componentId) => {
  if (systemId !== SYSTEM.id) return null;
  return SYSTEM.components.find((c) => c.id === componentId) ?? null;
};

test('projects a step\'s consumed ingredients with the captured name/img (issue 738)', () => {
  const run = terminalCraftingRun({
    status: 'failed',
    steps: [
      {
        stepId: 's0',
        stepName: 'Forge',
        index: 0,
        status: 'failed',
        failureReason: 'Crafting check failed',
        consumedIngredients: [
          { actorUuid: 'Actor.actor-1', itemUuid: 'Item.iron', quantity: 2, name: 'Iron Bar', img: 'icons/iron.webp' },
        ],
        createdResults: [],
      },
    ],
  });
  const step = makeBuilder({ history: [run] }).buildListing({ actor: ACTOR, viewer: GM })
    .history[0].steps[0];
  assert.equal(step.consumedIngredients.length, 1);
  assert.equal(step.consumedIngredients[0].name, 'Iron Bar');
  assert.equal(step.consumedIngredients[0].img, 'icons/iron.webp');
  assert.equal(step.consumedIngredients[0].quantity, 2);
});

test('resolves a legacy consumed ref (no name/img) from its componentId (issue 738)', () => {
  const run = terminalCraftingRun({
    status: 'failed',
    steps: [
      {
        stepId: 's0',
        stepName: 'Forge',
        index: 0,
        status: 'failed',
        failureReason: 'Crafting check failed',
        // Pre-capture record: only componentId + quantity persisted (item deleted).
        consumedIngredients: [{ componentId: 'c1', itemUuid: 'Item.gone', quantity: 1 }],
        createdResults: [],
      },
    ],
  });
  const step = makeBuilder({ history: [run], getComponent: getSystemComponent })
    .buildListing({ actor: ACTOR, viewer: GM })
    .history[0].steps[0];
  assert.equal(step.consumedIngredients[0].name, 'Smith Hammer', 'name resolved via componentId fallback');
  assert.equal(step.consumedIngredients[0].img, 'icons/hammer.webp');
});

test('projects a step\'s requirements snapshot, resolving name/img via getComponent (issue 738)', () => {
  const run = terminalCraftingRun({
    status: 'failed',
    steps: [
      {
        stepId: 's0',
        stepName: 'Forge',
        index: 0,
        status: 'failed',
        failureReason: 'Crafting check failed',
        requirements: [{ componentId: 'c1', quantity: 3 }],
        createdResults: [],
      },
    ],
  });
  const step = makeBuilder({ history: [run], getComponent: getSystemComponent })
    .buildListing({ actor: ACTOR, viewer: GM })
    .history[0].steps[0];
  assert.equal(step.requirements.length, 1);
  assert.equal(step.requirements[0].componentId, 'c1');
  assert.equal(step.requirements[0].name, 'Smith Hammer');
  assert.equal(step.requirements[0].img, 'icons/hammer.webp');
  assert.equal(step.requirements[0].quantity, 3);
});

test('a GM sees a deleted-recipe run un-redacted, keeping its persisted step snapshots (issue 738)', () => {
  const run = terminalCraftingRun({
    recipeId: 'recipe-gone',
    status: 'failed',
    steps: [
      {
        stepId: 's0',
        stepName: 'Forge',
        index: 0,
        status: 'failed',
        failureReason: 'Crafting check failed',
        lastCheckResult: { success: false, value: 11, data: { total: 11, dc: 16 } },
        requirements: [{ componentId: 'c1', quantity: 3 }],
        consumedIngredients: [{ componentId: 'c1', itemUuid: 'Item.gone', quantity: 3 }],
        createdResults: [],
      },
    ],
  });
  // recipe param resolves only RECIPE.id, so 'recipe-gone' is a deleted recipe.
  const model = makeBuilder({ history: [run], getComponent: getSystemComponent })
    .buildListing({ actor: ACTOR, viewer: GM })
    .history[0];
  assert.equal(model.redacted, false, 'a GM is never redacted, even for a deleted recipe');
  assert.equal(model.steps.length, 1, 'steps survive the missing recipe');
  assert.equal(model.steps[0].requirements[0].name, 'Smith Hammer');
  assert.equal(model.steps[0].consumedIngredients[0].name, 'Smith Hammer');
  assert.equal(model.steps[0].lastCheckResult.total, 11);
});

test('a non-GM still sees a deleted-recipe run redacted (issue 738)', () => {
  const run = terminalCraftingRun({ recipeId: 'recipe-gone', status: 'failed' });
  const model = makeBuilder({ history: [run] })
    .buildListing({ actor: ACTOR, viewer: PLAYER })
    .history[0];
  assert.equal(model.redacted, true, 'a non-GM cannot verify visibility of an unresolvable recipe');
  assert.deepEqual(model.steps, []);
});

test('crafting created results carry the recorded name/img', () => {
  const run = terminalCraftingRun({
    steps: [
      {
        stepId: 's0',
        stepName: 'Forge',
        index: 0,
        status: 'succeeded',
        createdResults: [
          { itemUuid: 'Item.plank', quantity: 2, name: 'Plank', img: 'icons/plank.webp' },
        ],
      },
    ],
  });
  const model = makeBuilder({ history: [run] }).buildListing({ actor: ACTOR, viewer: PLAYER })
    .history[0];
  assert.equal(model.createdResults.length, 1);
  assert.equal(model.createdResults[0].name, 'Plank');
  assert.equal(model.createdResults[0].img, 'icons/plank.webp');
  assert.equal(model.createdResults[0].quantity, 2);
});

test('gathering created results project the recorded name/img (not just a count)', () => {
  const gatheringRun = {
    id: 'gather-results',
    craftingSystemId: 'sys-1',
    environmentId: 'env-1',
    status: 'succeeded',
    taskId: 'task-a',
    startedAtWorldTime: 100,
    completedAtWorldTime: 200,
    createdResults: [
      {
        actorUuid: 'Actor.x',
        itemUuid: 'Item.ore',
        quantity: 3,
        name: 'Iron Ore',
        img: 'icons/ore.webp',
      },
    ],
  };
  const run = makeBuilder({ gatheringActive: [gatheringRun] }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];

  assert.equal(run.createdResultCount, 1);
  assert.equal(run.createdResults.length, 1);
  assert.equal(run.createdResults[0].name, 'Iron Ore');
  assert.equal(run.createdResults[0].img, 'icons/ore.webp');
  assert.equal(run.createdResults[0].quantity, 3);
});

test('created results without stored name/img resolve them by uuid (legacy history)', () => {
  const gatheringRun = {
    id: 'gather-legacy',
    craftingSystemId: 'sys-1',
    environmentId: 'env-1',
    status: 'succeeded',
    taskId: 'task-a',
    startedAtWorldTime: 100,
    // Legacy record: only actorUuid/itemUuid/quantity, no name/img.
    createdResults: [{ actorUuid: 'Actor.x', itemUuid: 'Item.legacy-ore', quantity: 2 }],
  };
  const getResultItem = (uuid) =>
    uuid === 'Item.legacy-ore' ? { name: 'Iron Ore', img: 'icons/ore.webp' } : null;

  const run = makeBuilder({ gatheringActive: [gatheringRun], getResultItem }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];

  assert.equal(run.createdResults[0].name, 'Iron Ore', 'name resolved via uuid fallback');
  assert.equal(run.createdResults[0].img, 'icons/ore.webp', 'img resolved via uuid fallback');
  assert.equal(run.createdResults[0].quantity, 2);
});

test('salvage runs pass through with crafting-named time fields, runType salvage, no manual advance', () => {
  const salvageRun = {
    id: 'salvage-1',
    craftingSystemId: 'sys-1',
    status: 'succeeded',
    label: 'Salvage Sword',
    startedAt: 200,
    updatedAt: 260,
    finishedAt: 260,
    createdResults: [{ itemUuid: 'Item.scrap', quantity: 4, name: 'Scrap' }],
  };
  const run = makeBuilder({ salvageHistory: [salvageRun], worldTime: 300 }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).history[0];

  assert.equal(run.runType, 'salvage');
  assert.equal(run.manualAdvance, false);
  assert.deepEqual(run.steps, []);
  // Salvage already uses the crafting startedAt/updatedAt/finishedAt names — no re-map.
  assert.equal(run.startedAt, 200);
  assert.equal(run.updatedAt, 260);
  assert.equal(run.finishedAt, 260);
  assert.equal(run.derivedStatus, 'succeeded');
  assert.equal(run.createdResultCount, 1);
  assert.equal(run.createdResults[0].itemUuid, 'Item.scrap');
});

// A realistic salvage run carries neither a `label` nor a `taskId` — only the source
// `componentId` + `craftingSystemId`. getComponent resolves the source component to
// its authored name/img for the run title + image (bug 1).
const SALVAGE_COMPONENT = { name: 'Balehound Teeth', img: 'icons/teeth.webp' };
const getSalvageComponent = (systemId, componentId) =>
  systemId === 'sys-1' && componentId === 'bhBalehoundTeth1' ? SALVAGE_COMPONENT : null;

test('salvage run resolves its title + image from the source componentId', () => {
  const salvageRun = {
    id: 'salvage-title',
    craftingSystemId: 'sys-1',
    componentId: 'bhBalehoundTeth1',
    status: 'succeeded',
    startedAt: 200,
    finishedAt: 260,
    createdResults: [],
  };
  const run = makeBuilder({
    salvageHistory: [salvageRun],
    getComponent: getSalvageComponent,
    worldTime: 300,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).history[0];

  assert.equal(run.names.title, 'Balehound Teeth', 'title is the bare source-component name');
  assert.equal(run.img, 'icons/teeth.webp', 'image is the source component img');
});

test('salvage run title falls back to the raw componentId when it cannot be resolved', () => {
  const salvageRun = {
    id: 'salvage-unresolved',
    craftingSystemId: 'sys-1',
    componentId: 'bhBalehoundTeth1',
    status: 'succeeded',
    startedAt: 200,
    finishedAt: 260,
    createdResults: [],
  };
  // No getComponent resolver: the builder falls back to the raw id + default image,
  // mirroring how a gathering run falls back to its raw taskId.
  const run = makeBuilder({ salvageHistory: [salvageRun], worldTime: 300 }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).history[0];

  assert.equal(run.names.title, 'bhBalehoundTeth1', 'falls back to the raw componentId');
  assert.equal(run.img, 'icons/svg/item-bag.svg', 'falls back to the default bag image');
});

test('salvage created result with only a componentId resolves name/img via getComponent', () => {
  // Records persisted before name/img capture carry only { itemUuid, componentId,
  // quantity }. This is the maintainer's already-persisted history — the componentId
  // resolver must repair it without any captured name/img and without a resolvable uuid.
  const salvageRun = {
    id: 'salvage-persisted',
    craftingSystemId: 'sys-1',
    componentId: 'bhSourceHide01',
    status: 'succeeded',
    startedAt: 200,
    finishedAt: 260,
    createdResults: [{ itemUuid: 'Item.gone', componentId: 'bhEarCartilage01', quantity: 2 }],
  };
  const getComponent = (systemId, componentId) =>
    systemId === 'sys-1' && componentId === 'bhEarCartilage01'
      ? { name: 'Ear Cartilage', img: 'icons/cartilage.webp' }
      : null;
  const run = makeBuilder({ salvageHistory: [salvageRun], getComponent, worldTime: 300 })
    .buildListing({ actor: ACTOR, viewer: PLAYER })
    .history[0];

  assert.equal(run.createdResults[0].name, 'Ear Cartilage', 'name resolved via componentId');
  assert.equal(run.createdResults[0].img, 'icons/cartilage.webp', 'img resolved via componentId');
  assert.equal(run.createdResults[0].quantity, 2);
});

test('a captured salvage result name/img is NOT overridden by the componentId resolver', () => {
  const salvageRun = {
    id: 'salvage-captured',
    craftingSystemId: 'sys-1',
    componentId: 'bhSourceHide01',
    status: 'succeeded',
    startedAt: 200,
    finishedAt: 260,
    // A new (post-fix) record captures name/img at award time.
    createdResults: [
      {
        itemUuid: 'Item.teeth',
        componentId: 'bhEarCartilage01',
        quantity: 1,
        name: 'Captured Name',
        img: 'icons/captured.webp',
      },
    ],
  };
  const getComponent = () => ({ name: 'Resolver Name', img: 'icons/resolver.webp' });
  const run = makeBuilder({ salvageHistory: [salvageRun], getComponent, worldTime: 300 })
    .buildListing({ actor: ACTOR, viewer: PLAYER })
    .history[0];

  assert.equal(run.createdResults[0].name, 'Captured Name', 'captured name wins');
  assert.equal(run.createdResults[0].img, 'icons/captured.webp', 'captured img wins');
});

test('a crafting run model is unaffected by the componentId result fallback', () => {
  // Crafting created-results carry name/img (and no componentId), so the new
  // componentId fallback is a no-op — the model is unchanged.
  const run = terminalCraftingRun({
    steps: [
      {
        stepId: 's0',
        stepName: 'Forge',
        index: 0,
        status: 'succeeded',
        createdResults: [
          { itemUuid: 'Item.plank', quantity: 2, name: 'Plank', img: 'icons/plank.webp' },
        ],
      },
    ],
  });
  // A getComponent that would fire if consulted — it must not be, since name/img exist.
  const getComponent = () => ({ name: 'WRONG', img: 'icons/wrong.webp' });
  const model = makeBuilder({ history: [run], getComponent }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).history[0];

  assert.equal(model.runType, 'crafting');
  assert.equal(model.names.title, 'Iron Sword');
  assert.equal(model.createdResults[0].name, 'Plank');
  assert.equal(model.createdResults[0].img, 'icons/plank.webp');
  assert.equal(model.createdResults[0].componentId, null);
});

test('aggregates createdResults across multiple result-bearing steps', () => {
  const multi = terminalCraftingRun({
    steps: [
      {
        stepId: 's0',
        stepName: 'Forge',
        index: 0,
        status: 'succeeded',
        createdResults: [{ itemUuid: 'Item.a', quantity: 2 }],
      },
      {
        stepId: 's1',
        stepName: 'Temper',
        index: 1,
        status: 'succeeded',
        createdResults: [
          { itemUuid: 'Item.b', quantity: 1 },
          { itemUuid: 'Item.c', quantity: 3 },
        ],
      },
    ],
  });
  const run = makeBuilder({ history: [multi] }).buildListing({ actor: ACTOR, viewer: PLAYER })
    .history[0];
  assert.equal(run.createdResultCount, 3);
  assert.deepEqual(
    run.createdResults.map((result) => result.itemUuid),
    ['Item.a', 'Item.b', 'Item.c']
  );
});

test('progressive mode surfaces a bare roll formula with no DC', () => {
  const progressiveSystem = {
    ...SYSTEM,
    craftingCheck: { progressive: { rollFormula: '2d6', dc: 99, tiers: [] } },
  };
  const detail = makeBuilder({
    active: [activeCraftingRun()],
    mode: 'progressive',
    system: progressiveSystem,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0].steps[1].detail;
  // Progressive is a value-budget check: the formula shows without a DC number.
  assert.equal(detail.checkLabel, '2d6');
});

test('routedByCheck reads check.routed.rollFormula and the RoutedByCheck label', () => {
  const routedSystem = {
    ...SYSTEM,
    resolutionMode: 'routedByCheck',
    craftingCheck: { routed: { rollFormula: '1d20+4', dc: 18, tiers: [] } },
  };
  const run = makeBuilder({
    active: [activeCraftingRun()],
    mode: 'routedByCheck',
    system: routedSystem,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];
  assert.equal(
    run.steps[1].detail.checkLabel,
    'FABRICATE.App.Journal.StepDetails.CheckWithDc|{"formula":"1d20+4","dc":18}'
  );
  assert.equal(run.resolutionModeLabel, 'FABRICATE.App.Journal.Mode.RoutedByCheck');
});

test('routedByIngredients reads check.simple (not routed) and the RoutedByIngredients label', () => {
  const routedSystem = {
    ...SYSTEM,
    resolutionMode: 'routedByIngredients',
    // The real pass/fail config lives in `simple` (DC 9); a stale value in `routed`
    // must be ignored — the label/DC come from the simple slot.
    craftingCheck: {
      simple: { rollFormula: '1d12', dc: 9, tiers: [] },
      routed: { rollFormula: '1d20+99', dc: 30, tiers: [] },
    },
  };
  const run = makeBuilder({
    active: [activeCraftingRun()],
    mode: 'routedByIngredients',
    system: routedSystem,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];
  assert.equal(
    run.steps[1].detail.checkLabel,
    'FABRICATE.App.Journal.StepDetails.CheckWithDc|{"formula":"1d12","dc":9}'
  );
  assert.equal(run.resolutionModeLabel, 'FABRICATE.App.Journal.Mode.RoutedByIngredients');
});

test('a dynamic-DC check surfaces the formula without a DC number', () => {
  const dynamicSystem = {
    ...SYSTEM,
    craftingCheck: { simple: { rollFormula: '1d20', dc: 15, dcMode: 'dynamic', tiers: [] } },
  };
  const detail = makeBuilder({ active: [activeCraftingRun()], system: dynamicSystem }).buildListing(
    { actor: ACTOR, viewer: PLAYER }
  ).activeRuns[0].steps[1].detail;
  assert.equal(detail.checkLabel, '1d20');
});

const BLUEPRINT_IMG = 'icons/sundries/documents/blueprint-recipe-alchemical.webp';
const ITEM_BAG = 'icons/svg/item-bag.svg';

test('a recipe-item crafting run resolves the recipe-item definition image (never the item bag)', () => {
  const recipeItemRecipe = { ...RECIPE, img: BLUEPRINT_IMG, recipeItemId: 'ri-1' };

  // The recipe-item definition image wins over recipe.img.
  let run = makeBuilder({
    active: [activeCraftingRun()],
    recipe: recipeItemRecipe,
    getRecipeItemImg: (systemId, recipeItemId) =>
      systemId === 'sys-1' && recipeItemId === 'ri-1' ? 'icons/tools/smithing/anvil.webp' : null,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];
  assert.equal(run.img, 'icons/tools/smithing/anvil.webp');

  // No definition image → recipe.img (blueprint), NEVER the item bag.
  run = makeBuilder({
    active: [activeCraftingRun()],
    recipe: recipeItemRecipe,
    getRecipeItemImg: () => null,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];
  assert.equal(run.img, BLUEPRINT_IMG);
  assert.notEqual(run.img, ITEM_BAG);
});

test('a crafting run with no recipe image falls back to the blueprint default, never the item bag', () => {
  const noImgRecipe = { ...RECIPE, img: '', recipeItemId: null };
  const run = makeBuilder({ active: [activeCraftingRun()], recipe: noImgRecipe }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0];
  assert.equal(run.img, BLUEPRINT_IMG);
  assert.notEqual(run.img, ITEM_BAG);
});

test('duplicate run ids in history are de-duplicated (first kept) so the keyed Journal each cannot crash', () => {
  // Corrupt/legacy data can archive the same run to history twice. The keyed
  // {#each ... (run.id)} would throw each_key_duplicate; the builder must drop
  // the repeat, keep the first, warn, and report the corrected count.
  const original = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(String(msg));
  try {
    const listing = makeBuilder({
      history: [terminalCraftingRun(), terminalCraftingRun()], // both id 'run-0'
    }).buildListing({ actor: ACTOR, viewer: PLAYER });
    const ids = listing.history.map((run) => run.id);
    assert.deepEqual(ids, ['run-0'], 'only the first occurrence survives');
    assert.equal(listing.counts.history, 1, 'counts reflect the de-duplicated list');
    assert.equal(new Set(ids).size, ids.length, 'no repeated key remains');
    assert.ok(
      warnings.some((w) => w.includes('duplicate history run "run-0"')),
      'a warning names the dropped duplicate'
    );
  } finally {
    console.warn = original;
  }
});

// ── Alchemy fizzle history entries ───────────────────────────────────────────

function fizzleRun(overrides = {}) {
  return {
    id: 'fizzle-1',
    craftingSystemId: 'sys-1',
    recipeId: null,
    isFizzle: true,
    status: 'failed',
    startedAt: 5,
    updatedAt: 5,
    finishedAt: 5,
    currentStepIndex: null,
    steps: [],
    ...overrides,
  };
}

const ALCHEMY_SYSTEM_VISIBLE = {
  ...SYSTEM,
  alchemy: { showAttemptHistoryToPlayers: true },
};
const ALCHEMY_SYSTEM_HIDDEN = {
  ...SYSTEM,
  alchemy: { showAttemptHistoryToPlayers: false },
};

test('a fizzle history entry projects a generic title with no recipe/step/signature data', () => {
  const listing = makeBuilder({
    history: [fizzleRun()],
    system: ALCHEMY_SYSTEM_VISIBLE,
  }).buildListing({ actor: ACTOR, viewer: GM });

  assert.equal(listing.history.length, 1, 'the GM always sees the fizzle');
  const [run] = listing.history;
  assert.equal(run.isFizzle, true);
  assert.equal(run.status, 'failed');
  assert.equal(run.names.title, 'FABRICATE.App.Journal.Fizzle.Title', 'generic, non-leaky title');
  assert.equal(run.recipeId, null, 'no recipe id leaks');
  assert.deepEqual(run.steps, [], 'no step/signature data leaks');
  assert.deepEqual(run.createdResults, [], 'a fizzle produced nothing');
  assert.equal(run.resolutionModeLabel, 'FABRICATE.App.Journal.Mode.Alchemy');
});

test('a fizzle is hidden from a non-GM viewer when showAttemptHistoryToPlayers is off', () => {
  const listing = makeBuilder({
    history: [fizzleRun()],
    system: ALCHEMY_SYSTEM_HIDDEN,
  }).buildListing({ actor: ACTOR, viewer: PLAYER });

  assert.equal(listing.history.length, 0, 'the player does not see the gated fizzle');
  assert.equal(listing.counts.history, 0);
});

test('a fizzle is visible (still non-leaky) to a non-GM viewer when the flag is on', () => {
  const listing = makeBuilder({
    history: [fizzleRun()],
    system: ALCHEMY_SYSTEM_VISIBLE,
  }).buildListing({ actor: ACTOR, viewer: PLAYER });

  assert.equal(listing.history.length, 1, 'the player sees the fizzle when the flag is on');
  const [run] = listing.history;
  assert.equal(run.names.title, 'FABRICATE.App.Journal.Fizzle.Title');
  assert.equal(run.recipeId, null, 'no recipe identity leaks even when visible');
});

test('the GM sees a fizzle even when showAttemptHistoryToPlayers is off', () => {
  const listing = makeBuilder({
    history: [fizzleRun()],
    system: ALCHEMY_SYSTEM_HIDDEN,
  }).buildListing({ actor: ACTOR, viewer: GM });

  assert.equal(listing.history.length, 1, 'the GM is never gated by the player-visibility flag');
});

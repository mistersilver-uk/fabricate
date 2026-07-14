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

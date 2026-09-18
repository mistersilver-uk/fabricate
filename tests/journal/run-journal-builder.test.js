/**
 * Coverage for the unified RunJournalBuilder projection (crafting fully; a gathering passthrough
 * smoke).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { CraftingRunManager } from '../../src/systems/CraftingRunManager.js';
import { ResolutionModeService } from '../../src/systems/ResolutionModeService.js';
import { RunJournalBuilder } from '../../src/systems/RunJournalBuilder.js';
import {
  craftingOutcomeBand,
  routedOutcomeBand,
} from '../../src/systems/runJournalOutcomeBands.js';
import { IngredientSet } from '../../src/models/IngredientSet.js';
import {
  runAttentionPresentation,
  runStatusPresentation,
} from '../../src/ui/svelte/apps/journal/journalRunStatus.js';
import { runStateNotice } from '../../src/ui/svelte/apps/journal/runStateNotice.js';

const ACTOR = { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Akra', img: 'icons/a.webp' };
const PLAYER = { id: 'user-1', isGM: false };
const GM = { id: 'gm-1', isGM: true };

for (const permission of ['denied', 'throws', 'absent']) {
  test(`future native evidence uses the requested viewer rather than ambient GM ownership (${permission})`, () => {
    const actor = { ...ACTOR, isOwner: true };
    if (permission !== 'absent') actor.testUserPermission = () => {
      if (permission === 'throws') throw new Error('permission unavailable');
      return false;
    };
    const record = { id: 'native-private', userId: 'another-user', craftingSystemId: 'sys', taskId: 'PRIVATE_TASK', status: 'succeeded',
      resolutionSnapshot: { kind: 'none', mode: 'straight' }, historySettlement: { awards: 'complete' },
      createdResults: [{ itemUuid: 'Item.private', name: 'PRIVATE_AWARD', img: 'PRIVATE_IMAGE', quantity: 3 }],
    };
    const builder = new RunJournalBuilder({ gatheringRunSource: { getRunHistory: () => [record] },
      getGatheringTask: () => ({ name: 'PRIVATE_TASK_NAME', img: 'PRIVATE_TASK_IMAGE' }) });
    const model = builder.buildListing({ actor, viewer: PLAYER }).history[0];
    assert.equal(model.redacted, true);
    assert.equal(model.createdResultsRecorded, false);
    assert.doesNotMatch(JSON.stringify(model), /PRIVATE_/);
    assert.equal(builder.buildListing({ actor, viewer: GM }).history[0].createdResults[0].quantity, 3);
  });
}

test('historical steps retain nullable source identities, distinct awards and recorded meaning', () => {
  const run = terminalCraftingRun({ steps: [
    { stepId: 'first', stepName: 'Old name', status: 'succeeded', completedAt: 42,
      presentationSnapshot: { name: 'Captured name', description: 'Captured purpose' },
      resolutionSnapshot: { kind: 'none', mode: 'simple', privateFormula: 'SECRET' },
      currencySpends: [],
      consumedIngredients: [{ actorUuid: 'Actor.source', itemUuid: 'Actor.source.Item.gone', quantity: 2, name: null, img: null }],
      usedTools: [{ itemUuid: 'Item.hammer', quantity: 1, broken: true }],
      createdResults: [{ itemUuid: 'Item.first', quantity: 1, name: 'First award' }] },
    { stepId: 'second', status: 'failed', completedAt: 50,
      createdResults: [{ itemUuid: 'Item.second', quantity: 3, name: 'Failure award' }] },
    { stepId: 'unexecuted', status: 'inProgress', startedAt: 50, consumedIngredients: [], createdResults: [] },
  ] });
  const model = makeBuilder({ history: [run], mode: 'progressive' }).buildListing({ actor: ACTOR, viewer: GM }).history[0];
  const [first, second, untouched] = model.steps;
  assert.deepEqual(first.resolutionSnapshot, { kind: 'none', mode: 'simple' });
  assert.equal(first.presentationSnapshot.description, 'Captured purpose');
  assert.equal(first.consumedIngredients[0].actorUuid, 'Actor.source');
  assert.equal(first.consumedIngredients[0].name, null);
  assert.equal(first.createdResults[0].name, 'First award');
  assert.equal(second.createdResults[0].name, 'Failure award');
  assert.equal(first.usedTools[0].broken, true);
  assert.equal(first.completedAt, 42);
  assert.equal(first.attempted, true);
  assert.equal(untouched.attempted, false);
  assert.deepEqual(first.currencySpends, []);
  assert.equal(second.currencySpends, null);
  assert.equal(second.resolutionSnapshot, null);
  assert.equal(JSON.stringify(model).includes('SECRET'), false);
});

// localize stub: surfaces key + interpolation data so label composition is testable.
for (const access of ['visible', 'denied', 'throws', 'null', 'absent']) {
  test(`captured enrichments require affirmative current viewer entitlement: ${access}`, () => {
    const run = terminalCraftingRun({ steps: [{ stepId: 's0', status: 'succeeded',
      presentationSnapshot: { name: 'ENRICHED_NAME', description: 'ENRICHED_PURPOSE' },
      resolutionSnapshot: { kind: 'none', mode: 'simple' }, currencySpends: [{ unit: 'SECRET_UNIT', amount: 3 }],
      essenceSpend: { labels: { sun: 'SECRET_ESSENCE' }, carriers: [] }, createdResults: [],
    }] });
    const recipeVisibility = access === 'absent' ? null : { evaluateRecipeAccess() {
      if (access === 'throws') throw new Error('unavailable');
      return access === 'null' ? null : { visible: access === 'visible' };
    } };
    for (const viewer of [PLAYER, GM]) {
      const model = makeBuilder({ history: [run], recipeVisibility })
        .buildListing({ actor: { ...ACTOR, isOwner: true }, viewer }).history[0];
      const entitled = viewer === GM || access === 'visible';
      assert.equal(JSON.stringify(model).includes('ENRICHED_PURPOSE'), entitled);
      assert.equal(JSON.stringify(model).includes('SECRET_UNIT'), entitled);
      assert.equal(JSON.stringify(model).includes('SECRET_ESSENCE'), entitled);
      if (!entitled && model.steps.length) {
        assert.equal(model.steps[0].resolutionSnapshot, null);
        assert.equal(model.steps[0].createdResultsRecorded, false);
      }
    }
  });
}

const localize = (key, data) => (data ? `${key}|${JSON.stringify(data)}` : key);

const SYSTEM = {
  id: 'sys-1',
  name: 'Blacksmithing',
  resolutionMode: 'simple',
  // Multi-step feature ON: a multi-step recipe projects as a multi-step run (issue 710).
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
    // The crafting actor's OWN uuid (issue 1648).
    componentSourceActorUuids: [ACTOR.uuid],
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
  recipeVisibility = { evaluateRecipeAccess: () => ({ visible: true }) },
  gatheringActive = [],
  gatheringHistory = [],
  salvageActive = [],
  salvageHistory = [],
  mode = 'simple',
  system = SYSTEM,
  recipe = RECIPE,
  getGatheringTask = null,
  getGatheringBlindSecret = null,
  getResultItem = null,
  getComponent = null,
  getComponentSourceActors = null,
  resolveItemEssences = null,
  affordCurrency = null,
  ingredientMatchesItem = null,
  getDismissedRunKeys = null,
  getJournalActionAvailability = null,
  resolutionModeService = null,
  getTool = null,
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
      getRunHistory: () => gatheringHistory,
    },
    recipeManager: {
      getRecipe: (id) => (id === recipe.id ? recipe : null),
      ingredientMatchesItem,
    },
    resolutionModeService: resolutionModeService ?? { getMode: () => mode },
    recipeVisibility,
    getSystem: (id) => (id === system.id ? system : null),
    getTool: getTool ?? ((systemId, toolId) => {
      if (systemId !== SYSTEM.id) return null;
      const tool = SYSTEM.tools.find((entry) => entry.id === toolId);
      return tool ? { id: tool.id, name: tool.label } : null;
    }),
    getGatheringTask,
    getGatheringBlindSecret,
    getResultItem,
    getComponent,
    getComponentSourceActors,
    resolveItemEssences,
    affordCurrency,
    getDismissedRunKeys,
    getJournalActionAvailability,
    localize,
    nowWorldTime: () => worldTime,
  });
}

test('historical tool fallback follows affirmative entitlement without fabricating identity or state', () => {
  const captured = { toolId: 't1', actorUuid: ACTOR.uuid, itemUuid: `${ACTOR.uuid}.Item.old`, quantity: 2,
    name: 'Captured hammer', img: 'captured.webp', broken: true };
  const record = terminalCraftingRun();
  record.steps[0].usedTools = [captured, { toolId: 't1', quantity: null, virtual: true }, { toolId: 'deleted' }];
  const lookups = [];
  const getTool = (systemId, toolId) => {
    lookups.push([systemId, toolId]);
    if (toolId === 'deleted') throw new Error('deleted');
    return { name: 'Current hammer', img: 'current.webp', registeredItemUuid: 'Item.never-invent' };
  };
  const project = (recipeVisibility, viewer = PLAYER) => makeBuilder({ history: [record], getTool, recipeVisibility })
    .buildListing({ actor: ACTOR, viewer }).history[0];
  const allowed = project({ evaluateRecipeAccess: () => ({ visible: true }) });
  const tools = allowed.steps[0].usedTools;
  assert.equal(tools[0].name, captured.name);
  assert.equal(tools[0].img, captured.img);
  assert.equal(tools[0].broken, true);
  assert.equal(tools[1].name, 'Current hammer');
  assert.equal(tools[1].img, 'current.webp');
  assert.equal(tools[1].itemUuid, null);
  assert.equal(tools[1].quantity, null);
  assert.equal(tools[1].virtual, true);
  assert.equal(Object.hasOwn(tools[1], 'broken'), false);
  assert.equal(tools[2].img, null);
  assert.equal(tools[2].name, null);
  for (const visibility of [null, { evaluateRecipeAccess: () => ({}) },
    { evaluateRecipeAccess: () => ({ visible: false }) }, { evaluateRecipeAccess: () => { throw new Error('unknown'); } }]) {
    lookups.length = 0;
    const denied = project(visibility);
    assert.ok(denied.steps.every((step) => step.usedTools.length === 0));
    assert.deepEqual(lookups, [], 'no tool metadata lookup before affirmative entitlement');
  }
  assert.equal(project(null, GM).steps[0].usedTools[1].img, 'current.webp');
});

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

  // Issue 1648: every REQUIRED tool, with the artwork the four-column card draws. There is no
  // "primary tool" in the domain, so the projection elects none.
  assert.deepEqual(
    detail.tools.map((tool) => tool.name),
    ['Hammer']
  );
  assert.ok(!Object.hasOwn(detail, 'primaryToolName'), 'the invented primary tool is gone');
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
  // The run record still carries per-step detail, but with the system's multi-step feature OFF the
  // recipe ran as one atomic chain, so the Journal presents it as a single-step run: multiStep
  // false, a Single-Step structure label, and a blank "Step X of Y" label.
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

test('terminal multi-stage projection preserves the absent execution index for final-stage browsing', () => {
  const terminal = terminalCraftingRun({ steps: activeCraftingRun().steps });
  const model = makeBuilder({ history: [terminal] }).buildListing({ actor: ACTOR, viewer: PLAYER }).history[0];
  assert.equal(model.stepIndex, null, 'null must not be numerically coerced to the first stage');
  assert.equal(model.currentStep, null);
  assert.equal(model.steps.length, 2);
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
  // The single recorded attempt stays single-stage after live recipe changes.
  assert.equal(run.stepLabel, '');
  assert.equal(run.createdResultCount, 1);
  assert.equal(run.createdResults[0].itemUuid, 'Item.z');
  assert.equal(run.createdResults[0].quantity, 1);
});

test('active simple crafting previews current authored yields without rewriting past, future, or history', () => {
  const system = {
    ...SYSTEM,
    resolutionMode: 'simple',
    craftingCheck: { simple: { rollFormula: '', dc: 15 } },
    components: [{ id: 'blade', name: 'Sword Blade', img: 'icons/blade.webp' }],
  };
  const resultGroup = {
    id: 'success',
    name: 'Success',
    results: [{ id: 'blade-result', componentId: 'blade', quantity: 2 }],
  };
  const recipe = {
    ...RECIPE,
    steps: [{ id: 'past' }, { id: 'current' }, { id: 'future' }],
    getExecutionSteps: () => [
      { id: 'past', resultGroups: [resultGroup] },
      { id: 'current', resultGroups: [resultGroup] },
      { id: 'future', resultGroups: [resultGroup] },
    ],
  };
  const run = activeCraftingRun({
    currentStepIndex: 1,
    steps: [
      { stepId: 'past', status: 'succeeded', createdResults: [{ componentId: 'blade', quantity: 1 }] },
      { stepId: 'current', status: 'inProgress' },
      { stepId: 'future', status: 'pending' },
    ],
  });
  const resolutionModeService = new ResolutionModeService({ getSystem: () => system });
  const builder = makeBuilder({
    active: [run],
    history: [terminalCraftingRun()],
    recipe,
    system,
    resolutionModeService,
    getComponent: (_systemId, id) => system.components.find((entry) => entry.id === id),
  });

  const listing = builder.buildListing({ actor: ACTOR, viewer: PLAYER });
  const active = listing.activeRuns[0];
  assert.deepEqual(active.craftingYield, {
    source: 'preview',
    stageIndex: 1,
    mode: 'simple',
    presentation: 'entries',
    entries: [
      {
        id: 'blade-result',
        name: 'Sword Blade',
        art: 'icons/blade.webp',
        qty: 2,
        chance: 100,
      },
    ],
    tiers: [],
    progressive: null,
  });
  assert.equal(active.steps[0].craftingYield, null, 'past stages use their recorded awards');
  assert.equal(active.steps[1].craftingYield, active.craftingYield);
  assert.equal(active.steps[2].craftingYield, null, 'current preview stays current-only');
  assert.equal(active.steps[2].yieldPreview.stageIndex, 2);
  assert.equal(active.steps[2].yieldPreview.entries[0].qty, 2);
  assert.deepEqual(active.steps[2].createdResults, [], 'future preview is not an award');
  assert.equal(listing.history[0].craftingYield, null, 'terminal entries retain actual awards only');
});

test('future ingredient routes preview their own outcomes without selecting a current route', () => {
  const system = { ...SYSTEM, resolutionMode: 'routedByIngredients' };
  const future = { id: 'future', ingredientSets: [
    { id: 'red', name: 'Red route', resultGroupId: 'red-output' },
    { id: 'blue', name: 'Blue route', resultGroupId: 'blue-output' },
  ], resultGroups: [
    { id: 'red-output', results: [{ id: 'red-result', name: 'Red prize', quantity: 2 }] },
    { id: 'blue-output', results: [{ id: 'blue-result', name: 'Blue prize', quantity: 5 }] },
  ] };
  const recipe = { ...RECIPE, getExecutionSteps: () => [{ id: 'current', resultGroups: [] }, future] };
  const raw = activeCraftingRun({ currentStepIndex: 0, steps: [
    { stepId: 'current', selectionPlan: { selectedIngredientSetId: 'red' } },
    { stepId: 'future', status: 'pending', selectionPlan: { selectedIngredientSetId: 'red' } },
  ] });
  const before = structuredClone(raw);
  const options = { active: [raw], recipe, system, resolutionModeService: new ResolutionModeService({ getSystem: () => system }) };
  const model = makeBuilder(options).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];
  assert.equal(model.steps[1].yieldPreview.presentation, 'routes');
  assert.deepEqual(model.steps[1].yieldPreview.routes.map((route) => route.entries.map((entry) => entry.name)), [['Red prize'], ['Blue prize']]);
  assert.deepEqual(raw, before, 'a preview cannot write future intent');
  assert.deepEqual(model.steps[1].createdResults, []);
  assert.equal(model.steps[0].yieldPreview, null);
  const hidden = makeBuilder({ ...options, recipeVisibility: { evaluateRecipeAccess: () => ({ visible: false }) } })
    .buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];
  assert.doesNotMatch(JSON.stringify(hidden), /Red prize|Blue prize/);
});

test('v1 gathering awards come only from applied result receipts, including old lost failure refs', () => {
  const award = { actorUuid: ACTOR.uuid, itemUuid: 'Item.actual', componentId: 'herb', name: 'Actual award', quantity: 3 };
  const planned = { ...award, name: 'PRIVATE_PLAN', quantity: 99 };
  for (const [status, phase, receipt, expected] of [
    ['planned', 'planned', undefined, []],
    ['planned', 'applying', [award], []],
    ['planned', 'applied', [award], [3]],
    ['committed', 'applied', [award], [3]],
    ['recoveryRequired', 'applying', undefined, []],
    ['recoveryRequired', 'applied', [award], [3]],
    ['committed', 'applied', { count: 1 }, []],
  ]) {
    const record = { id: 'v1-awards', craftingSystemId: SYSTEM.id, lifecycleVersion: 1, taskId: 'forage', status: 'failed', createdResults: [planned],
      checkResult: { provider: 'd100', roll: 80, itemRows: [{ id: 'herb', componentId: 'herb', dropped: true, finalDropRate: 70 }], items: [{ id: 'herb' }] },
      executionJournal: { status, effects: [{ effectId: 'results', kind: 'createGatheredResults', phase, receipt, planned: [planned] }] } };
    const builder = makeBuilder({ gatheringHistory: [record] });
    const model = builder.buildListing({ actor: ACTOR, viewer: PLAYER }).history[0];
    assert.deepEqual(model.createdResults.map((entry) => entry.quantity), expected, `${status}/${phase}`);
    assert.equal(model.gatheringYield.entries[0].qty, expected[0] ?? null);
    assert.doesNotMatch(JSON.stringify(model), /PRIVATE_PLAN|99/);
    record.createdResults = [];
    assert.deepEqual(builder.buildListing({ actor: ACTOR, viewer: PLAYER }).history[0].createdResults, model.createdResults, 'old normalization loss does not erase the independent applied receipt');
  }
});

test('recorded gathering quantities require unique receipt attribution and never use live configuration', () => {
  const rows = [
    { id: 'first', componentId: 'herb', quantity: 99, finalDropRate: 70, dropped: true },
    { id: 'second', componentId: 'herb', quantity: 99, finalDropRate: 20, dropped: true },
    { id: 'missed', componentId: 'seed', quantity: 99, finalDropRate: 5, dropped: false },
  ];
  const run = { id: 'actual', craftingSystemId: SYSTEM.id, taskId: 'forage', status: 'succeeded', checkResult: { provider: 'd100', roll: 100, itemRows: rows, items: rows.slice(0, 2) },
    createdResults: [{ componentId: 'herb', name: 'Actual Herb', quantity: 4 }] };
  const project = (record) => makeBuilder({ gatheringHistory: [record], getGatheringTask: () => ({ resolutionMode: 'straight', dropRows: [{ name: 'LIVE_SECRET' }] }) })
    .buildListing({ actor: ACTOR, viewer: PLAYER }).history[0];
  assert.deepEqual(project(run).gatheringYield.entries.map((entry) => entry.qty), [null, null, 0]);
  const limited = { ...run, checkResult: { ...run.checkResult, items: [rows[0]] } };
  assert.deepEqual(project(limited).gatheringYield.entries.map((entry) => entry.qty), [4, 0, 0]);
  const incomplete = { ...run, createdResults: undefined };
  assert.deepEqual(project(incomplete).gatheringYield.entries.map((entry) => entry.qty), [null, null, null]);
  assert.deepEqual(project({ ...run, status: 'failed', createdResults: [] }).gatheringYield.entries.map((entry) => entry.qty), [null, null, null], 'legacy failure normalization may have lost awards; empty is not proof of zero');
  assert.doesNotMatch(JSON.stringify(project(run)), /LIVE_SECRET|99/);
  assert.equal(project({ ...run, taskId: 'blind:env' }).gatheringYield, null);
  assert.equal(project({ ...run, checkResult: { blind: true, ...run.checkResult } }).gatheringYield, null);
  const legacy = { ...run, checkResult: { provider: 'd100', items: [{ ...rows[0], roll: 90 }] } };
  assert.equal(project(legacy).gatheringYield.roll, null);
  assert.equal(project(legacy).gatheringYield.rollModel, 'perRow');
  assert.equal(project(legacy).gatheringYield.entries[0].qty, 4);
  assert.equal(project({ ...legacy, checkResult: { provider: 'd100', roll: null } }).gatheringYield.roll, null);
});

test('routed-by-ingredients crafting previews the persisted selected route', () => {
  const system = { ...SYSTEM, resolutionMode: 'routedByIngredients' };
  const recipe = {
    ...SINGLE_STEP_RECIPE,
    getExecutionSteps: () => [
      {
        id: 's0',
        ingredientSets: [
          { id: 'iron-set', resultGroupId: 'iron-results' },
          { id: 'silver-set', resultGroupId: 'silver-results' },
        ],
        resultGroups: [
          {
            id: 'iron-results',
            name: 'Iron',
            results: [{ id: 'iron', componentId: 'iron', quantity: 1 }],
          },
          {
            id: 'silver-results',
            name: 'Silver',
            results: [{ id: 'silver', componentId: 'silver', quantity: 3 }],
          },
        ],
      },
    ],
  };
  const run = activeSingleStepRun({
    steps: [
      {
        stepId: 's0',
        status: 'inProgress',
        selectionPlan: { selectedIngredientSetId: 'silver-set' },
        selectedRequirementSnapshot: { id: 'silver-set', resultGroupId: 'silver-results' },
      },
    ],
  });
  const resolutionModeService = new ResolutionModeService({ getSystem: () => system });
  const preview = makeBuilder({
    active: [run],
    recipe,
    system,
    resolutionModeService,
    getComponent: (_systemId, id) => ({ id, name: `${id} component` }),
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0].craftingYield;

  assert.equal(preview.mode, 'routedByIngredients');
  assert.equal(preview.presentation, 'entries');
  assert.deepEqual(preview.entries, [
    { id: 'silver', name: 'silver component', qty: 3, chance: 100 },
  ]);
});

test('routed-by-check crafting projects the authored outcome ladder through resolution routing', () => {
  const system = {
    ...SYSTEM,
    resolutionMode: 'routedByCheck',
    craftingCheck: {
      failureResultPolicy: 'never',
      routed: {
        type: 'relative',
        dc: 12,
        thresholdMode: 'meet',
        relativeOutcomes: [
          { id: 'setback', name: 'Setback', success: false, dc: -3 },
          { id: 'masterwork', name: 'Masterwork', success: true, dc: 4 },
        ],
      },
    },
  };
  const recipe = {
    ...SINGLE_STEP_RECIPE,
    getExecutionSteps: () => [
      {
        id: 's0',
        resultGroups: [
          {
            id: 'failure-results',
            name: 'Setback',
            checkOutcomeIds: ['setback'],
            results: [{ id: 'scrap', componentId: 'scrap', quantity: 1 }],
          },
          {
            id: 'success-results',
            name: 'Masterwork',
            checkOutcomeIds: ['masterwork'],
            results: [{ id: 'sword', componentId: 'sword', quantity: 2 }],
          },
        ],
      },
    ],
  };
  const resolutionModeService = new ResolutionModeService({ getSystem: () => system });
  const preview = makeBuilder({
    active: [activeSingleStepRun({ steps: [{ stepId: 's0', status: 'inProgress' }] })],
    recipe,
    system,
    resolutionModeService,
    getComponent: (_systemId, id) => ({ id, name: id }),
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0].craftingYield;

  assert.deepEqual(preview, {
    source: 'preview',
    stageIndex: 0,
    mode: 'routedByCheck',
    presentation: 'tiers',
    entries: [],
    tiers: [
      { id: 'setback', name: 'Setback', band: '<16', fail: true, yields: [] },
      {
        id: 'masterwork',
        name: 'Masterwork',
        band: '16+',
        fail: false,
        yields: [{ id: 'sword', name: 'sword', quantity: '×2' }],
      },
    ],
    progressive: null,
  });
});

test('progressive crafting keeps ordered difficulty-budget stages distinct from chances and tiers', () => {
  const system = {
    ...SYSTEM,
    resolutionMode: 'progressive',
    craftingCheck: { progressive: { rollFormula: '2d6', awardMode: 'partial' } },
    components: [
      { id: 'pommel', name: 'Pommel', img: 'icons/pommel.webp', difficulty: 2 },
      { id: 'blade', name: 'Blade', img: 'icons/blade.webp', difficulty: 5 },
    ],
  };
  const recipe = {
    ...SINGLE_STEP_RECIPE,
    getExecutionSteps: () => [
      {
        id: 's0',
        resultGroups: [
          {
            id: 'progression',
            results: [
              { id: 'blade-result', componentId: 'blade' },
              { id: 'pommel-result', componentId: 'pommel' },
            ],
          },
        ],
      },
    ],
  };
  const resolutionModeService = new ResolutionModeService(
    { getSystem: () => system },
    { getPlayerResultOrder: () => ['pommel-result', 'blade-result'] }
  );
  const preview = makeBuilder({
    active: [activeSingleStepRun({ steps: [{ stepId: 's0', status: 'inProgress' }] })],
    recipe,
    system,
    resolutionModeService,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0].craftingYield;

  assert.equal(preview.presentation, 'progressive');
  assert.deepEqual(preview.entries, []);
  assert.deepEqual(preview.tiers, []);
  assert.deepEqual(preview.progressive, {
    awardMode: 'partial',
    stages: [
      {
        id: 'pommel-result',
        name: 'Pommel',
        art: 'icons/pommel.webp',
        quantity: '×1',
        cost: 2,
      },
      {
        id: 'blade-result',
        name: 'Blade',
        art: 'icons/blade.webp',
        quantity: '×1',
        cost: 5,
      },
    ],
  });
  assert.equal(JSON.stringify(preview).includes('chance'), false);
});

test('alchemy preview follows its check mode while redaction and missing references fail closed', () => {
  const system = {
    ...SYSTEM,
    resolutionMode: 'alchemy',
    alchemy: { checkMode: 'tiered' },
    craftingCheck: {
      routed: {
        type: 'fixed',
        fixedOutcomes: [{ id: 'fine', name: 'Fine', success: true, start: 10, end: 14 }],
      },
    },
  };
  const recipe = {
    ...SINGLE_STEP_RECIPE,
    getExecutionSteps: () => [
      {
        id: 's0',
        resultGroups: [
          {
            id: 'fine-results',
            name: 'Fine',
            checkOutcomeIds: ['fine'],
            results: [{ id: 'potion', componentId: 'potion', quantity: 1 }],
          },
        ],
      },
    ],
  };
  const resolutionModeService = new ResolutionModeService({ getSystem: () => system });
  const options = {
    active: [activeSingleStepRun({ steps: [{ stepId: 's0', status: 'inProgress' }] })],
    recipe,
    system,
    resolutionModeService,
    getComponent: (_systemId, id) => ({ id, name: 'Fine Potion' }),
  };
  const visible = makeBuilder(options).buildListing({ actor: ACTOR, viewer: GM }).activeRuns[0];
  assert.equal(visible.activityKind, 'alchemy');
  assert.equal(visible.craftingYield.mode, 'alchemy');
  assert.equal(visible.craftingYield.presentation, 'tiers');
  assert.deepEqual(visible.craftingYield.tiers[0].yields, [
    { id: 'potion', name: 'Fine Potion', quantity: '×1' },
  ]);

  const directSystem = {
    ...system,
    alchemy: { checkMode: 'none' },
  };
  const direct = makeBuilder({
    ...options,
    system: directSystem,
    resolutionModeService: new ResolutionModeService({ getSystem: () => directSystem }),
  }).buildListing({ actor: ACTOR, viewer: GM }).activeRuns[0];
  assert.equal(direct.craftingYield.presentation, 'entries');
  assert.deepEqual(direct.craftingYield.entries, [
    { id: 'potion', name: 'Fine Potion', qty: 1, chance: 100 },
  ]);

  const hidden = makeBuilder({
    ...options,
    recipeVisibility: { evaluateRecipeAccess: () => ({ visible: false }) },
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];
  assert.equal(hidden.craftingYield, null);
  assert.equal(JSON.stringify(hidden).includes('Fine Potion'), false);

  const missing = makeBuilder({ ...options, recipe: { ...recipe, getExecutionSteps: () => [] } })
    .buildListing({ actor: ACTOR, viewer: GM }).activeRuns[0];
  assert.equal(missing.craftingYield, null);
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
  // Redaction hides IDENTITY ONLY (issue 966).
  assert.equal(redacted.manualAdvance, true);
  // ...and an owner may still abandon it (issue 848 + 966).
  const redactedOwned = makeBuilder({ active: [activeCraftingRun()], recipeVisibility })
    .buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: PLAYER })
    .activeRuns[0];
  assert.equal(redactedOwned.canCancel, true, 'an owner can cancel a redacted run');
  // The identity redaction itself is unchanged on that owned projection.
  assert.equal(redactedOwned.recipeId, null);
  assert.equal(redactedOwned.names.title, 'FABRICATE.App.Journal.Redacted.Title');
  assert.deepEqual(redactedOwned.steps, []);

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
  assert.equal(run.environmentId, null);
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
  assert.equal(run.environmentId, 'env-1', 'visible gathering context can request a personalized preview');
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
  assert.equal(run.img, 'icons/containers/bags/pouch-leather-brown-green.webp');
});

test('gathering yield projects straight and d100 authored previews without replacing historical awards', () => {
  const straightTask = {
    id: 'straight-task',
    name: 'Quarry',
    resolutionMode: 'straight',
    resultGroups: [
      {
        id: 'stone-group',
        name: 'Stone',
        results: [{ id: 'stone-result', componentId: 'stone', quantity: 3 }],
      },
    ],
  };
  const d100Task = {
    id: 'd100-task',
    name: 'Bog',
    resolutionMode: 'd100',
    dropRows: [
      { id: 'moss-row', componentId: 'moss', quantity: 2, dropRate: 65, enabled: true },
      { id: 'reed-row', name: 'Bog Reed', quantity: 1, dropRate: 40, enabled: true },
      { id: 'disabled-row', componentId: 'secret', quantity: 9, dropRate: 100, enabled: false },
    ],
  };
  const historyRun = {
    id: 'd100-history',
    craftingSystemId: 'sys-1',
    environmentId: 'env-1',
    taskId: 'd100-task',
    status: 'succeeded',
    checkResult: {
      provider: 'd100',
      roll: 42,
      items: [{ id: 'moss-row', roll: 42, finalDropRate: 71 }],
      itemRows: [
        { id: 'moss-row', componentId: 'moss', roll: 42, finalDropRate: 71, dropped: true },
        { id: 'reed-row', name: 'Bog Reed', roll: 42, finalDropRate: 23, dropped: false },
      ],
    },
    createdResults: [{ componentId: 'moss', quantity: 2, name: 'Bog Moss', img: 'icons/moss.webp' }],
  };
  const listing = makeBuilder({
    gatheringActive: [
      {
        id: 'straight-active',
        craftingSystemId: 'sys-1',
        environmentId: 'env-1',
        taskId: 'straight-task',
        status: 'inProgress',
      },
    ],
    gatheringHistory: [historyRun],
    getGatheringTask: (_environmentId, taskId) =>
      taskId === straightTask.id ? straightTask : d100Task,
    getComponent: (_systemId, componentId) => ({
      id: componentId,
      name: componentId === 'stone' ? 'Granite' : 'Bog Moss',
      img: componentId === 'stone' ? 'icons/granite.webp' : 'icons/moss.webp',
    }),
  }).buildListing({ actor: ACTOR, viewer: PLAYER });

  assert.deepEqual(listing.activeRuns[0].gatheringYield, {
    mode: 'straight',
    entries: [
      {
        id: 'stone-result',
        name: 'Granite',
        art: 'icons/granite.webp',
        qty: 3,
        chance: 100,
      },
    ],
    roll: null,
    tiers: [],
  });
  assert.deepEqual(listing.history[0].gatheringYield, {
    source: 'recorded',
    mode: 'd100',
    entries: [
      {
        id: 'moss-row',
        name: 'Bog Moss',
        art: 'icons/moss.webp',
        qty: 2,
        chance: 71,
        cleared: true,
        rawRoll: 42,
        effectiveRoll: null,
        threshold: null,
      },
      {
        id: 'reed-row',
        name: 'Bog Reed',
        qty: 0,
        chance: 23,
        cleared: false,
        rawRoll: 42,
        effectiveRoll: null,
        threshold: null,
      },
    ],
    roll: 42,
    rollModel: 'shared',
    unattributedAwardIndexes: [],
    tiers: [],
    check: null,
  });
  assert.deepEqual(listing.history[0].createdResults, [
    {
      actorUuid: null,
      componentId: 'moss',
      itemUuid: null,
      quantity: 2,
      name: 'Bog Moss',
      img: 'icons/moss.webp',
    },
  ]);
});

test('1645: a rolled amount is stated beside the number every yield projection carries', () => {
  const rolled = { id: 'ore-result', componentId: 'ore', quantity: 3, quantityFormula: '1d4+1' };
  const fixed = { id: 'clay-result', componentId: 'clay', quantity: 2 };
  const getComponent = (_systemId, componentId) => ({ id: componentId, name: componentId });
  const task = {
    id: 'straight-task',
    name: 'Quarry',
    resolutionMode: 'straight',
    resultGroups: [{ id: 'stone-group', name: 'Stone', results: [rolled, fixed] }],
  };
  const listing = makeBuilder({
    gatheringActive: [
      {
        id: 'straight-active',
        craftingSystemId: 'sys-1',
        environmentId: 'env-1',
        taskId: 'straight-task',
        status: 'inProgress',
      },
    ],
    gatheringHistory: [
      {
        id: 'straight-history',
        craftingSystemId: 'sys-1',
        environmentId: 'env-1',
        taskId: 'straight-task',
        status: 'succeeded',
        createdResults: [
          { componentId: 'ore', quantity: 3, rolled: { formula: '1d4+1', total: 3 } },
          { componentId: 'clay', quantity: 2 },
        ],
      },
    ],
    getGatheringTask: () => task,
    getComponent,
  }).buildListing({ actor: ACTOR, viewer: PLAYER });

  const [rolledEntry, fixedEntry] = listing.activeRuns[0].gatheringYield.entries;
  assert.equal(rolledEntry.qty, 3, 'a null qty renders as "not recorded", so the number stays');
  assert.equal(rolledEntry.amountLabel, '1d4+1', 'and the expression rides beside it');
  assert.equal(fixedEntry.qty, 2);
  assert.ok(!('amountLabel' in fixedEntry), 'a fixed row states no expression at all');

  const [rolledAward, fixedAward] = listing.history[0].createdResults;
  assert.equal(rolledAward.quantity, 3, 'a recorded award states the integer it awarded');
  assert.equal(
    rolledAward.amountLabel,
    `FABRICATE.App.Journal.RolledAmount|${JSON.stringify({ formula: '1d4+1', total: 3 })}`
  );
  assert.equal(fixedAward.quantity, 2);
  assert.ok(!('amountLabel' in fixedAward), 'and a fixed award carries no label key');

  const system = {
    ...SYSTEM,
    gatheringCraftingCheck: {
      routed: {
        type: 'fixed',
        fixedOutcomes: [{ id: 'pass', name: 'Bounty', success: true, min: 10 }],
      },
    },
  };
  const tiers = makeBuilder({
    system,
    gatheringActive: [
      {
        id: 'routed-active',
        craftingSystemId: system.id,
        environmentId: 'env-1',
        taskId: 'routed-task',
        status: 'inProgress',
      },
    ],
    getGatheringTask: () => ({
      id: 'routed-task',
      name: 'Hunt',
      resolutionMode: 'routed',
      resultGroups: [{ id: 'bounty-group', name: 'Bounty', results: [rolled, fixed] }],
    }),
    getComponent,
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0].gatheringYield.tiers;
  assert.deepEqual(
    tiers[0].yields.map((entry) => entry.quantity),
    ['×1d4+1', '×2'],
    'a tier yield renders one amount string, so the expression occupies it directly'
  );
});

test('gathering routed yield uses authored tier bands, normalized group names, and failure policy', () => {
  const system = {
    ...SYSTEM,
    gatheringCraftingCheck: {
      failureResultPolicy: 'never',
      routed: {
        type: 'relative',
        dc: 12,
        thresholdMode: 'meet',
        relativeOutcomes: [
          { id: 'fail', name: ' Setback ', success: false, dc: -4 },
          { id: 'pass', name: 'Bounty', success: true, dc: 3 },
        ],
      },
    },
  };
  const task = {
    id: 'routed-task',
    name: 'Hunt',
    resolutionMode: 'routed',
    dcOverride: 14,
    resultGroups: [
      { id: 'failure-group', name: 'setback', results: [{ id: 'hide', componentId: 'hide', quantity: 1 }] },
      { id: 'success-group', name: ' BOUNTY ', results: [{ id: 'venison', componentId: 'venison', quantity: 4 }] },
    ],
  };
  const run = makeBuilder({
    system,
    gatheringActive: [
      {
        id: 'routed',
        craftingSystemId: system.id,
        environmentId: 'env-1',
        taskId: task.id,
        status: 'inProgress',
      },
    ],
    getGatheringTask: () => task,
    getComponent: (_systemId, componentId) => ({ id: componentId, name: componentId }),
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];

  assert.deepEqual(run.gatheringYield, {
    mode: 'routed',
    entries: [],
    roll: null,
    tiers: [
      { id: 'fail', name: 'Setback', band: '<17', fail: true, yields: [] },
      {
        id: 'pass',
        name: 'Bounty',
        band: '≥17',
        fail: false,
        yields: [{ id: 'venison', name: 'venison', quantity: '×4' }],
      },
    ],
  });
});

test('gathering yield prefers the persisted task snapshot and hides opaque blind details from owners', () => {
  const snapshotTask = {
    id: 'old-task',
    name: 'Old Grove',
    resolutionMode: 'd100',
    dropRows: [{ id: 'old-herb', name: 'Old Herb', quantity: 1, dropRate: 25 }],
  };
  const currentTask = {
    id: 'old-task',
    name: 'Edited Grove',
    resolutionMode: 'straight',
    resultGroups: [],
  };
  const blindTask = {
    id: 'secret-task',
    name: 'Secret Grove',
    resolutionMode: 'd100',
    dropRows: [{ id: 'secret-herb', name: 'Secret Herb', quantity: 1, dropRate: 90 }],
  };
  const runs = [
    {
      id: 'snapshotted',
      craftingSystemId: 'sys-1',
      environmentId: 'env-1',
      taskId: 'old-task',
      status: 'waitingTime',
      economyEvidence: { runtimeSnapshot: { task: snapshotTask } },
    },
    {
      id: 'blind-run',
      craftingSystemId: 'sys-1',
      environmentId: 'env-1',
      taskId: 'blind:env-1',
      status: 'waitingTime',
      checkResult: {
        provider: 'd100',
        roll: 7,
        items: [],
        itemRows: [{ id: 'secret-herb', roll: 7, finalDropRate: 90, dropped: false }],
      },
    },
  ];
  const builder = makeBuilder({
    gatheringActive: runs,
    getGatheringTask: (_environmentId, taskId) =>
      taskId === 'secret-task' ? blindTask : currentTask,
    getGatheringBlindSecret: () => ({ taskId: 'secret-task', snapshot: { task: blindTask } }),
  });

  const playerRuns = builder.buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: PLAYER }).activeRuns;
  assert.equal(playerRuns[0].gatheringYield.mode, 'd100');
  assert.equal(playerRuns[0].gatheringYield.entries[0].chance, 25);
  assert.equal(playerRuns[1].gatheringYield, null);
  assert.equal(playerRuns[1].environmentId, null, 'opaque blind runs expose no preview context');
  assert.equal(JSON.stringify(playerRuns[1]).includes('Secret Herb'), false);
  assert.equal(JSON.stringify(playerRuns[1]).includes('90'), false);

  const gmBlind = builder.buildListing({ actor: ACTOR, viewer: GM }).activeRuns[1];
  assert.equal(gmBlind.blindSecretPreview, true);
  assert.equal(gmBlind.gatheringYield.mode, 'd100');
  assert.equal(gmBlind.gatheringYield.entries[0].name, 'Secret Herb');
  assert.equal(gmBlind.gatheringYield.roll, 7);
});

test('progressive gathering is not misrepresented as routed yield', () => {
  const run = makeBuilder({
    gatheringActive: [
      {
        id: 'progressive',
        craftingSystemId: 'sys-1',
        environmentId: 'env-1',
        taskId: 'progressive-task',
        status: 'inProgress',
      },
    ],
    getGatheringTask: () => ({
      id: 'progressive-task',
      name: 'Long Hunt',
      resolutionMode: 'progressive',
      resultGroups: [{ id: 'not-a-tier', name: 'Progress', results: [] }],
    }),
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];

  assert.equal(run.gatheringYield, null);
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
  // Issue 901: the title is now the generic localization KEY, not the raw marker.
  assert.equal(run.names.title, 'FABRICATE.Gathering.BlindTaskLabel');
  assert.equal(run.img, 'icons/containers/bags/pouch-leather-brown-green.webp');
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

// A realistic salvage run carries neither a `label` nor a `taskId` — only the source `componentId`
// + `craftingSystemId`.
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
  // Records persisted before name/img capture carry only { itemUuid, componentId, quantity }.
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

// Inverted with issue 887. This case previously asserted the BORROW — that a linked recipe-item
// definition's image outranked the recipe's own.
test('a crafting run resolves the recipe OWN image, never a containing book/scroll', () => {
  const AUTHORED = 'icons/consumables/potions/bottle-round-corked-red.webp';

  // A recipe carrying the legacy scalar still renders its authored image.
  let run = makeBuilder({
    active: [activeCraftingRun()],
    recipe: { ...RECIPE, img: AUTHORED, recipeItemId: 'ri-1' },
  }).buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];
  assert.equal(run.img, AUTHORED, 'an authored image is never outranked by a containing book');

  // A bag-valued recipe resolves the blueprint, NEVER the bag — the sentinel handling
  // that made routing through `resolveRecipeImage` mandatory rather than collapsing to
  // `recipe.img || DEFAULT`.
  run = makeBuilder({
    active: [activeCraftingRun()],
    recipe: { ...RECIPE, img: ITEM_BAG, recipeItemId: 'ri-1' },
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
  // Corrupt/legacy data can archive the same run to history twice.
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

test('projects current lifecycle state, alchemy activity kind, pause precedence, and safe recovery evidence', () => {
  const run = activeCraftingRun({
    lifecycleVersion: 1,
    runRevision: 7,
    completionMode: 'worldTime',
    pausedDurationSeconds: 12,
    pauseState: { pausedAt: 180, remainingSeconds: 42 },
    executionJournal: {
      operationId: 'secret-operation',
      requestId: 'secret-request',
      baseRunRevision: 6,
      status: 'recoveryRequired',
      intent: { formula: '2d20kh + @secret' },
      effects: [
        {
          effectId: 'consume',
          kind: 'consumeIngredients',
          phase: 'applied',
          planned: { itemUuid: 'Actor.secret.Item.herb' },
          receipt: { itemUuid: 'Actor.secret.Item.herb', quantity: 1 },
        },
        {
          effectId: 'private-extension',
          kind: 'private:secret-effect-kind',
          phase: 'applied',
          planned: { privateFormula: 'secret' },
          receipt: { privateReceipt: 'secret' },
        },
        {
          effectId: 'award',
          kind: 'awardResults',
          phase: 'applying',
          planned: { componentId: 'secret-result' },
        },
      ],
    },
  });
  const listing = makeBuilder({ active: [run], mode: 'alchemy' }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  });
  const projected = listing.activeRuns[0];

  assert.equal(listing.selectedActorUuid, ACTOR.uuid);
  assert.equal(projected.key, JSON.stringify([ACTOR.uuid, 'crafting', 'run-1']));
  assert.equal(projected.actorUuid, ACTOR.uuid);
  assert.equal(projected.runType, 'crafting', 'native persistence type remains unchanged');
  assert.equal(projected.activityKind, 'alchemy');
  assert.equal(projected.lifecycleContract, 'current');
  assert.equal(projected.runRevision, 7);
  assert.equal(projected.completionMode, 'worldTime');
  assert.deepEqual(projected.pauseState, { pausedAt: 180, remainingSeconds: 42 });
  assert.equal(projected.derivedStatus, 'paused');
  assert.deepEqual(projected.recoveryEvidence, {
    status: 'recoveryRequired',
    appliedEffectCount: 2,
    effectCount: 3,
    effects: [
      { index: 0, kind: 'consumeIngredients', phase: 'applied', hasReceipt: true, receipt: { items: [], currencies: [] } },
      { index: 1, kind: 'other', phase: 'applied', hasReceipt: true, receipt: { items: [], currencies: [] } },
      { index: 2, kind: 'awardResults', phase: 'applying', hasReceipt: false, receipt: null },
    ],
    required: true,
    uncertainEffectIndex: 2,
  });
  assert.equal(projected.actions.execute, false);
  assert.equal(projected.actions.cancel, false);
  assert.equal(projected.actions.disabledReason, 'recoveryRequired');
  assert.equal(JSON.stringify(projected).includes('secret-operation'), false);
  assert.equal(JSON.stringify(projected).includes('2d20kh'), false);
  assert.equal(JSON.stringify(projected).includes('Actor.secret.Item.herb'), false);
  assert.equal(JSON.stringify(projected).includes('private:secret-effect-kind'), false);
});

test('unsupported lifecycle versions remain readable and expose no mutation actions', () => {
  const listing = makeBuilder({
    active: [activeCraftingRun({ lifecycleVersion: 2, runRevision: 99 })],
  }).buildListing({ actor: ACTOR, viewer: PLAYER });
  const run = listing.activeRuns[0];

  assert.equal(run.lifecycleContract, 'unsupported');
  assert.equal(run.lifecycleVersion, 2);
  assert.equal(run.actions.execute, false);
  assert.equal(run.actions.pause, false);
  assert.equal(run.actions.cancel, false);
  assert.equal(run.actions.disabledReason, 'unsupportedLifecycle');
});

test('redaction preserves owner execution/cancel availability without leaking selection plans', () => {
  const hiddenStep = {
    ...activeCraftingRun().steps[1],
    selectionPlan: {
      selectedIngredientSetId: 'set-secret',
      ingredientOptionOverrides: { choice: { optionIndex: 1, heldItemId: 'secret-item' } },
      ingredientEssenceAllocation: {
        stepId: 's1',
        ingredientSetId: 'set-secret',
        allocation: { 'secret-item': 2 },
      },
    },
    selectedRequirementSnapshot: { id: 'set-secret', hiddenRoute: 'critical-secret' },
  };
  const listing = makeBuilder({
    active: [
      activeCraftingRun({
        lifecycleVersion: 1,
        runRevision: 1,
        steps: [activeCraftingRun().steps[0], hiddenStep],
      }),
    ],
    recipeVisibility: { evaluateRecipeAccess: () => ({ visible: false }) },
    worldTime: 5000,
  }).buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: PLAYER });
  const run = listing.activeRuns[0];

  assert.equal(run.redacted, true);
  assert.deepEqual(run.steps, []);
  assert.equal(run.actions.execute, true);
  assert.equal(run.actions.cancel, true);
  assert.equal(JSON.stringify(run).includes('critical-secret'), false);
  assert.equal(JSON.stringify(run).includes('secret-item'), false);
});

test('entitled step history prefers the selected requirement snapshot and carries scoped selection intent', () => {
  const legacyRequirements = [{ componentId: 'legacy-iron', quantity: 2 }];
  const selectedRequirementSnapshot = {
    id: 'set-routed',
    resultGroupId: 'result-blue',
    ingredientGroups: [
      { id: 'choice', options: [{ match: { type: 'tag', value: 'metal' }, quantity: 1 }] },
    ],
    essences: { fire: 2 },
    currencyCost: { unit: 'gp', amount: 4 },
  };
  const selectionPlan = {
    selectedIngredientSetId: 'set-routed',
    ingredientOptionOverrides: { choice: { optionIndex: 0, heldItemId: 'Item.iron' } },
    ingredientEssenceAllocation: {
      stepId: 's1',
      ingredientSetId: 'set-routed',
      allocation: { 'Item.ember': 2 },
    },
  };
  const run = activeCraftingRun({
    lifecycleVersion: 1,
    steps: [
      activeCraftingRun().steps[0],
      {
        ...activeCraftingRun().steps[1],
        requirements: legacyRequirements,
        selectedRequirementSnapshot,
        selectionPlan,
      },
    ],
  });
  const projected = makeBuilder({ active: [run] }).buildListing({
    actor: ACTOR,
    viewer: PLAYER,
  }).activeRuns[0].currentStep;

  assert.deepEqual(projected.selectionPlan, selectionPlan);
  assert.deepEqual(projected.selectedRequirementSnapshot, selectedRequirementSnapshot);
  assert.deepEqual(projected.requirementSnapshot, selectedRequirementSnapshot);
  assert.equal(projected.requirements[0].componentId, 'legacy-iron', 'legacy flat rows remain available');
  assert.notEqual(projected.selectionPlan, selectionPlan, 'projection is cloned');
});

test('redacted checked countdown keeps owner actions but cannot offer automatic completion', () => {
  const builder = makeBuilder({
    active: [activeSingleStepRun({ lifecycleVersion: 1 })],
    recipeVisibility: { evaluateRecipeAccess: () => ({ visible: false }) },
  });
  const model = builder.buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: PLAYER }).activeRuns[0];
  assert.equal(model.derivedStatus, 'waiting');
  assert.equal(model.actions.setCompletionMode, false);
  assert.equal(model.actions.pause, true);
  assert.equal(model.actions.cancel, true);
  assert.deepEqual(model.steps, []);
  assert.equal(model.currentStep, null);
  assert.equal(JSON.stringify(model).includes('1d20'), false);
});

function materialShortfallFixture(sets, dependencies = {}) {
  const actor = { ...ACTOR, isOwner: true, items: [{
    id: 'ember', uuid: 'Actor.actor-1.Item.ember', name: 'Emberdust', system: { quantity: 1 },
  }] };
  const plan = { selectedIngredientSetId: sets[0].id };
  const raw = activeSingleStepRun({ lifecycleVersion: 1, steps: [{ stepId: 's0', selectionPlan: plan }] });
  const recipe = { ...SINGLE_STEP_RECIPE, getExecutionSteps: () => [{ id: 's0', ingredientSets: sets }] };
  const builder = makeBuilder({ active: [raw], recipe, ingredientMatchesItem: () => true, ...dependencies });
  return { actor, raw, plan, project: () => builder.buildListing({ actor, viewer: PLAYER }).activeRuns[0] };
}

for (const [kind, reference] of [
  ['component', { match: { type: 'component', componentId: 'ember' } }],
  ['tag', { match: { type: 'tags', tags: ['fire'] } }],
  ['item', { itemUuid: 'Item.ember' }],
]) {
  test(`known ${kind} shortage refuses execution and permits supply or alternate-route repair without spending`, () => {
    const sets = [2, 1].map((quantity) => new IngredientSet({
      id: `route-${quantity}`, ingredientGroups: [{ id: 'material', options: [{ quantity, ...reference }] }],
    }));
    const { actor, raw, plan, project } = materialShortfallFixture(sets);
    const before = structuredClone({ actor, raw });
    const short = project();
    assert.equal(short.derivedStatus, 'inProgress', 'no countdown supplies an unrelated execution blocker');
    assert.equal(short.currentStep.selectionAvailability.success, false);
    assert.deepEqual(short.currentStep.selectionAvailability.missingGroups.map(({ have, need }) => ({ have, need })), [{ have: 1, need: 2 }]);
    assert.equal(short.actions.execute, false);
    assert.equal(short.actions.disabledReason, 'selectionRequired');
    assert.equal(short.actions.setSelection, true);
    assert.equal(short.actions.cancel, true);
    assert.deepEqual({ actor, raw }, before, 'projection changes neither stock nor persisted intent');

    plan.selectedIngredientSetId = sets[1].id;
    const alternate = project();
    assert.equal(alternate.currentStep.selectionAvailability.success, true);
    assert.equal(alternate.actions.execute, true);
    assert.equal(alternate.actions.disabledReason, null);
    assert.equal(actor.items[0].system.quantity, 1);

    plan.selectedIngredientSetId = sets[0].id;
    assert.equal(project().actions.execute, false, 'returning to the scarce route re-applies the refusal');
    actor.items[0].system.quantity = 2;
    const supplied = project();
    assert.equal(supplied.currentStep.selectionAvailability.success, true);
    assert.equal(supplied.actions.execute, true);
    assert.equal(supplied.actions.disabledReason, null);
    assert.equal(actor.items[0].system.quantity, 2, 'supply is observed, never consumed by projection');
  });
}

test('incomplete essence allocation is not physical scarcity even with finite missing have/need', () => {
  const set = new IngredientSet({ id: 'essence', ingredientGroups: [{
    id: 'fire', options: [{ match: { type: 'essence', essenceId: 'fire', amount: 2 } }],
  }] });
  const { actor, plan, project } = materialShortfallFixture([set], { resolveItemEssences: () => ({ fire: 1 }) });
  actor.items[0].system.quantity = 3;
  plan.ingredientEssenceAllocation = { stepId: 's0', ingredientSetId: set.id, allocation: { [actor.items[0].uuid]: 1 } };
  const model = project();
  assert.equal(model.currentStep.selectionAvailability.success, false);
  assert.deepEqual(model.currentStep.selectionAvailability.missingGroups.map(({ have, need }) => ({ have, need })), [{ have: 1, need: 2 }]);
  assert.equal(model.currentStep.selectionAvailability.knownMaterialShortfall, false, 'the carrier ledger can cover it; only the allocation is unmade');
  // Issue 1648, M15 (defect 2): this is an untimed stage with a coverable-but-unmade choice,
  // so it must not offer a manual attempt that reaches `beginVersionedStage`'s own
  // "requirements are unavailable" refusal. The choice is refused here, before that.
  assert.equal(model.actions.execute, false, 'the allocation is a choice, not a proven shortfall, but it is still unmade');
  assert.equal(model.actions.disabledReason, 'choiceRequired');
  assert.equal(model.actions.setSelection, true, 'the choice remains repairable');
  assert.equal(actor.items[0].system.quantity, 3, 'nothing was consumed by projection');
});

test('absent or uncertain resolver evidence never proves a physical shortfall', () => {
  const missing = { ingredient: { match: { type: 'component', componentId: 'ember' } }, have: 1, need: 2 };
  // `success: true` answers the question outright regardless of the (contradictory)
  // `missingGroups` it also carries, so the stage is offered.
  const resolved = { id: 'resolved', ingredientGroups: [],
    resolveIngredientSelection: () => ({ success: true, missingGroups: [missing] }) };
  const offered = materialShortfallFixture([resolved]).project();
  assert.equal(offered.actions.execute, true);
  assert.equal(offered.actions.disabledReason, null);

  // A PROVEN `have < need` refuses the stage whatever ingredient kind the miss carries or
  // fails to carry — `_prepareVersionedStage` refuses all three — so the control is withheld
  // and reasoned by cause rather than offered and then refused (issue 1648).
  const proven = [
    [{ missingGroups: [missing] }, 'selectionRequired'],
    [{ success: false, missingGroups: [{ ...missing, ingredient: undefined }] }, 'selectionRequired'],
    [
      { success: false, missingGroups: [{ ...missing, ingredient: { match: { type: 'currency' } } }] },
      'currencyRequired',
    ],
  ];
  for (const [result, reason] of proven) {
    const set = { id: 'uncertain', ingredientGroups: [], resolveIngredientSelection: () => result };
    const model = materialShortfallFixture([set]).project();
    assert.equal(model.actions.execute, false, JSON.stringify(result));
    assert.equal(model.actions.disabledReason, reason, JSON.stringify(result));
    assert.equal(model.awaitingChoice, false, JSON.stringify(result));
  }

  // Every one of these is uncertain only about WHETHER anything is short — have/need absent,
  // non-finite, or already satisfied — never a PROVEN shortfall, so it reads as waiting on a choice
  // rather than as materials (issue 1648).
  const uncertainAsChoice = [
    null, undefined, {}, { success: false },
    ...[
      { have: undefined }, { have: null }, { have: NaN }, { have: -Infinity }, { have: '1' },
      { need: undefined }, { need: null }, { need: Infinity }, { need: '2' },
      { have: 2 }, { have: 3 },
    ].map((overrides) => ({ success: false, missingGroups: [{ ...missing, ...overrides }] })),
  ];
  for (const result of uncertainAsChoice) {
    const set = { id: 'uncertain', ingredientGroups: [], resolveIngredientSelection: () => result };
    const model = materialShortfallFixture([set]).project();
    assert.equal(model.actions.execute, false, JSON.stringify(result));
    assert.equal(model.actions.disabledReason, 'choiceRequired', JSON.stringify(result));
    assert.equal(
      model.currentStep.selectionAvailability.knownMaterialShortfall,
      false,
      `never proven a physical shortfall: ${JSON.stringify(result)}`
    );
  }

  // No resolver at all answers nothing about the stage, so `awaitingChoice` cannot fire either
  // — this is a distinct, pre-existing gap this lane does not close (there is no evidence to
  // gate on), and the manual attempt is unchanged.
  const absentResolver = materialShortfallFixture([{ id: 'absent' }]).project();
  assert.equal(absentResolver.currentStep.selectionAvailability, null);
  assert.equal(absentResolver.actions.execute, true);
  assert.equal(absentResolver.actions.disabledReason, null);

  // A stale route IS an open choice (a route to re-pick), so it is refused the same way — and
  // issue 1648's F5 gives that one cause its own code, because "choose this stage's route" is
  // the sentence it is the only cause that deserves.
  const stale = materialShortfallFixture([{ id: 'removed' }]);
  stale.plan.selectedIngredientSetId = 'gone';
  assert.equal(stale.project().currentStep.selectionAvailability.staleRoute, true);
  assert.equal(stale.project().actions.execute, false, 'a stale route waits on a replacement pick');
  assert.equal(stale.project().actions.disabledReason, 'routeRequired');
  assert.equal(stale.project().awaitingChoice, true, 'a route decision is still a decision');
});

// Waiting on the PLAYER's choice (issue 1648, M10). Post-D-026/D-028 a stage locks its choice and
// spends its materials when it STARTS, so the only state that can wait on a choice is an UNSTARTED
// stage whose plan does not resolve.
const CHOICE_ITEMS = [
  { id: 'iron', uuid: 'Actor.actor-1.Item.iron', name: 'Iron', system: { quantity: 5 } },
  { id: 'silver', uuid: 'Actor.actor-1.Item.silver', name: 'Silver', system: { quantity: 5 } },
];
const CHOICE_OWNER = { ...ACTOR, isOwner: true, items: CHOICE_ITEMS };
const componentOption = (componentId, quantity = 1) => ({ quantity, match: { type: 'component', componentId } });
const routeSet = (id, componentId) => new IngredientSet({ id, name: id,
  ingredientGroups: [{ id: 'metal', name: 'Metal', options: [componentOption(componentId)] }] });
const ironRoute = () => routeSet('route-iron', 'iron');
const silverRoute = () => routeSet('route-silver', 'silver');
const essenceSet = () => new IngredientSet({ id: 'ess', ingredientGroups: [{ id: 'fire',
  options: [{ match: { type: 'essence', essenceId: 'fire', amount: 2 } }] }] });

function projectChoiceRun({ executionSteps, runSteps, currentStepIndex = 0, actor = CHOICE_OWNER,
  run = {}, dependencies = {} }) {
  const recipe = { ...RECIPE, steps: executionSteps.map((entry) => ({ id: entry.id })),
    getExecutionSteps: () => executionSteps };
  const raw = { ...activeCraftingRun(), lifecycleVersion: 1, status: 'inProgress',
    currentStepIndex, steps: runSteps, ...run };
  return makeBuilder({ active: [raw], recipe,
    ingredientMatchesItem: (_recipe, ingredient, item) => ingredient.match?.componentId === item.id,
    ...dependencies }).buildListing({ actor, viewer: PLAYER }).activeRuns[0];
}

/** Stage 2 of a multi-step craft, advanced into by `completeStepSuccess` and never begun. */
function unbegunSecondStage(sets, stepOverrides = {}) {
  return projectChoiceRun({
    executionSteps: [
      { id: 's0', toolIds: [], timeRequirement: { hours: 1 }, ingredientSets: [ironRoute()] },
      { id: 's1', toolIds: [], timeRequirement: { hours: 1 }, ingredientSets: sets },
    ],
    currentStepIndex: 1,
    runSteps: [
      { stepId: 's0', stepName: 'Forge', index: 0, status: 'succeeded',
        preparedConsumption: { consumedSummary: [] }, createdResults: [] },
      { stepId: 's1', stepName: 'Temper', index: 1, status: 'inProgress', ...stepOverrides },
    ],
  });
}

/** The current stage of a recipe with no honoured time requirement: no separate start to take. */
function untimedStage(sets, stepOverrides = {}, rest = {}) {
  return projectChoiceRun({
    executionSteps: [{ id: 's0', toolIds: [], timeRequirement: null, ingredientSets: sets }],
    runSteps: [{ stepId: 's0', stepName: 'Make', index: 0, status: 'inProgress', ...stepOverrides }],
    ...rest,
  });
}

const notice = (run) => runStateNotice(run, localize);

test('an unbegun stage with no route chosen waits on the player rather than on the clock', () => {
  const run = unbegunSecondStage([ironRoute(), silverRoute()]);
  assert.equal(run.currentStep.stageStarted, false);
  assert.equal(run.currentStep.selectionAvailability.staleRoute, true);
  assert.equal(run.currentStep.selectionAvailability.knownMaterialShortfall, false);
  assert.equal(run.awaitingChoice, true, 'the projection reports the state; every surface reads it');
  // The clock says nothing about it: an unstarted stage has no gate, so the status chip alone
  // reads exactly as a run that needs nothing from anybody.
  assert.equal(run.derivedStatus, 'inProgress');
  // Issue 1648, M15: the begin control stays ON SCREEN — `atStageStart` is what decides that,
  // never `beginStep` — but is refused and reasoned as a CHOICE cause, distinct from a
  // materials cause, because pressing it would try to lock a choice nobody has made yet.
  assert.equal(run.actions.atStageStart, true, 'the begin control still renders instead of the primary');
  assert.equal(run.actions.beginStep, false, 'pressing it would refuse: "requirements are unavailable"');
  assert.equal(run.actions.execute, false);
  // Issue 1648, F5: the ROUTE decision in its own words.
  assert.equal(run.actions.disabledReason, 'routeRequired');
  assert.equal(runAttentionPresentation(run).kind, 'choice');
  assert.equal(runAttentionPresentation(run).labelKey, 'FABRICATE.App.Journal.Status.awaitingChoice');
  // Guidance, not an alarm: an unbegun stage is ordinary play.
  assert.equal(notice(run).tone, 'info');
  assert.equal(notice(run).blocking, false);
  assert.equal(notice(run).dataAttr, 'data-journal-awaiting-choice');
  assert.equal(notice(run).title, 'FABRICATE.App.Journal.Notice.ChoiceTitle');
});

test('an unbegun stage owes the player nothing only once its own pick is persisted', () => {
  const only = unbegunSecondStage([ironRoute()]);
  assert.equal(only.currentStep.selectionAvailability.success, true);
  assert.equal(only.awaitingChoice, false);
  // Issue 1648, U2. It owes no CHOICE, but it is not owed nothing: this stage is waiting for an
  // irreversible click and nothing else, and before this it carried no Active-row signal at all
  // — one badge and nothing beside it, indistinguishable from a run counting the clock down.
  assert.equal(runAttentionPresentation(only).kind, 'start');
  assert.equal(runAttentionPresentation(only).tone, 'accent');
  assert.equal(runAttentionPresentation(only).labelKey, 'FABRICATE.App.Journal.Status.readyToBegin');
  assert.equal(notice(only), null, 'and it is still ordinary play, so it raises no notice');
  // A satisfied choice never refuses the begin control: the gate only refuses while
  // `awaitingChoice` is true.
  assert.equal(only.actions.atStageStart, true);
  assert.equal(only.actions.beginStep, true);
  assert.equal(only.actions.disabledReason, 'stageNotStarted');
  // A multi-OPTION group IS an open choice (issue 1648).
  const multiOption = unbegunSecondStage([new IngredientSet({ id: 'only',
    ingredientGroups: [{ id: 'metal', name: 'Metal',
      options: [componentOption('iron'), componentOption('silver')] }] })]);
  assert.equal(multiOption.currentStep.selectionAvailability.success, true, 'the resolver can meet it');
  assert.equal(multiOption.awaitingChoice, true, 'but nobody has picked which option it spends');
  assert.equal(multiOption.actions.atStageStart, true, 'the begin control still renders');
  assert.equal(multiOption.actions.beginStep, false, 'and is refused until the pick is persisted');
  assert.equal(multiOption.actions.disabledReason, 'choiceRequired');
  assert.equal(multiOption.actions.setSelection, true, 'the control that makes the pick is offered');
  // Issue 1648, U2: the unmade pick outranks the start, because a stage that cannot be begun
  // must not advertise that it can be.
  assert.equal(runAttentionPresentation(multiOption).kind, 'choice');

  // Persisting the pick clears it: the same fixture, one override later, offers begin.
  const picked = unbegunSecondStage([new IngredientSet({ id: 'only',
    ingredientGroups: [{ id: 'metal', name: 'Metal',
      options: [componentOption('iron'), componentOption('silver')] }] })],
  { selectionPlan: { selectedIngredientSetId: 'only',
    ingredientOptionOverrides: { metal: { optionIndex: 0 } } } });
  assert.equal(picked.awaitingChoice, false);
  assert.equal(picked.actions.beginStep, true);
  assert.equal(picked.actions.disabledReason, 'stageNotStarted');
  assert.equal(runAttentionPresentation(picked).kind, 'start', 'and now it says so on the row');
});

test('an untimed stage keeps its choices open for its whole life and says so', () => {
  const carrier = { id: 'coal', uuid: 'Actor.actor-1.Item.coal', name: 'Coal', system: { quantity: 3 } };
  const run = untimedStage([essenceSet()], { selectionPlan: { selectedIngredientSetId: 'ess',
    ingredientEssenceAllocation: { stepId: 's0', ingredientSetId: 'ess',
      allocation: { 'Actor.actor-1.Item.coal': 1 } } } },
  { actor: { ...ACTOR, isOwner: true, items: [carrier] },
    dependencies: { resolveItemEssences: () => ({ fire: 1 }) } });
  assert.equal(run.actions.beginStep, false, 'an untimed stage has no separate start to take');
  assert.equal(run.actions.atStageStart, false, 'no start boundary exists to hold a begin control at');
  // Issue 1648, M15 (defect 2): an untimed stage has no separate begin control to withhold
  // instead, so the resolve action itself must stay refused rather than reach the engine and
  // be told "The selected crafting requirements are unavailable."
  assert.equal(run.actions.execute, false, 'the primary must not be offered while unchosen');
  assert.equal(run.actions.disabledReason, 'choiceRequired');
  assert.equal(run.actions.setSelection, true);
  assert.equal(run.currentStep.selectionAvailability.essencePool.requirements[0].owned, 3);
  assert.equal(run.awaitingChoice, true, 'the pool is coverable; the allocation is what is missing');
  assert.equal(notice(run).dataAttr, 'data-journal-awaiting-choice');

  // The ABSENT allocation, which is what the engine actually refuses: the resolver SUGGESTS
  // one and reports success, so only the persisted-plan question separates it from a ready
  // stage. Projecting the partial case alone left this one unguarded (issue 1648).
  const unallocated = untimedStage([essenceSet()], { selectionPlan: { selectedIngredientSetId: 'ess' } },
  { actor: { ...ACTOR, isOwner: true, items: [carrier] },
    dependencies: { resolveItemEssences: () => ({ fire: 1 }) } });
  assert.equal(unallocated.currentStep.selectionAvailability.success, true, 'the resolver suggests one');
  assert.equal(unallocated.awaitingChoice, true, 'but nothing persisted the allocation it would spend');
  assert.equal(unallocated.actions.execute, false, 'so the primary must not reach the refusal');
  assert.equal(unallocated.actions.disabledReason, 'choiceRequired');
  assert.equal(unallocated.actions.setSelection, true);
});

test('a pre-start plan that went stale waits on a replacement choice', () => {
  const removedOption = unbegunSecondStage([new IngredientSet({ id: 'only',
    ingredientGroups: [{ id: 'metal', name: 'Metal', options: [componentOption('iron')] }] })],
  { selectionPlan: { selectedIngredientSetId: 'only',
    ingredientOptionOverrides: { metal: { optionIndex: 4 } } } });
  assert.equal(removedOption.currentStep.selectionAvailability.success, false);
  assert.equal(removedOption.currentStep.selectionAvailability.knownMaterialShortfall, false);
  assert.equal(removedOption.awaitingChoice, true);
  const removedRoute = unbegunSecondStage([ironRoute()],
    { selectionPlan: { selectedIngredientSetId: 'deleted' } });
  assert.equal(removedRoute.currentStep.selectionAvailability.staleRoute, true);
  assert.equal(removedRoute.awaitingChoice, true);
});

test('a known material shortfall reads as materials, never as a choice', () => {
  const run = unbegunSecondStage([routeSet('route-gold', 'gold')]);
  assert.equal(run.currentStep.selectionAvailability.knownMaterialShortfall, true);
  assert.equal(run.awaitingChoice, false, 'choosing cannot supply stock the actor does not hold');
  const attention = runAttentionPresentation(run);
  assert.equal(attention.kind, 'materials');
  assert.equal(attention.labelKey, 'FABRICATE.App.Journal.Status.needsMaterials');
  // A different sentence as well as a different chip: one is fixed by choosing, the other by acquiring.
  assert.equal(run.actions.disabledReason, 'selectionRequired');
  // The same "offered, then refused" shape as the choice gap, on the materials axis: the
  // begin control stays visible (`atStageStart`) but refused, so pressing it never reaches
  // `beginVersionedStage`'s own "Missing required items" refusal.
  assert.equal(run.actions.atStageStart, true);
  assert.equal(run.actions.beginStep, false);
  assert.equal(notice(run).dataAttr, 'data-journal-action-blocker');
  assert.equal(notice(run).dataValue, 'selectionRequired');
  assert.equal(notice(run).title, 'FABRICATE.App.Journal.Actions.SelectionRequired');
});

test('a shortfall choosing cannot repair is never reported as a choice', () => {
  const thin = { id: 'coal', uuid: 'Actor.actor-1.Item.coal', name: 'Coal', system: { quantity: 1 } };
  const shortEssence = untimedStage([essenceSet()], { selectionPlan: { selectedIngredientSetId: 'ess' } },
    { actor: { ...ACTOR, isOwner: true, items: [thin] },
      dependencies: { resolveItemEssences: () => ({ fire: 1 }) } });
  assert.equal(shortEssence.currentStep.selectionAvailability.essencePool.requirements[0].owned, 1);
  assert.equal(shortEssence.awaitingChoice, false, 'the carrier ledger cannot cover the requirement');
  // Its own word and its own refusal: an essence gap is neither a choice nor a box of
  // components, and the primary must not reach the engine's refusal (issue 1648).
  assert.equal(shortEssence.actions.execute, false);
  assert.equal(shortEssence.actions.disabledReason, 'essenceRequired');
  assert.equal(runAttentionPresentation(shortEssence).kind, 'essences');
  assert.equal(notice(shortEssence).dataValue, 'essenceRequired');

  const currency = new IngredientSet({ id: 'coin', ingredientGroups: [{ id: 'fee',
    options: [{ match: { type: 'currency', unit: 'gp', amount: 10 } }] }] });
  const unaffordable = untimedStage([currency], { selectionPlan: { selectedIngredientSetId: 'coin' } },
    { dependencies: { affordCurrency: () => false } });
  assert.equal(unaffordable.currentStep.selectionAvailability.success, false);
  assert.equal(unaffordable.awaitingChoice, false);
  assert.equal(unaffordable.actions.execute, false, 'a price the actor cannot pay refuses the stage');
  assert.equal(unaffordable.actions.disabledReason, 'currencyRequired');
  assert.equal(runAttentionPresentation(unaffordable).kind, 'currency');
  assert.equal(notice(unaffordable).dataValue, 'currencyRequired');
});

test('a started stage and a paused run hold the choices they already made', () => {
  const started = unbegunSecondStage([ironRoute(), silverRoute()], {
    selectionPlan: { selectedIngredientSetId: 'route-iron' },
    preparedConsumption: { consumedSummary: [] },
    timeGate: { requiredSeconds: 3600, initiatedAt: 150, availableAt: 3750 },
  });
  assert.equal(started.currentStep.selectionAvailability.locked, true);
  assert.equal(started.awaitingChoice, false);
  assert.equal(runAttentionPresentation(started), null);
  assert.equal(notice(started), null);
  const paused = projectChoiceRun({
    executionSteps: [{ id: 's0', toolIds: [], timeRequirement: { hours: 1 },
      ingredientSets: [ironRoute(), silverRoute()] }],
    runSteps: [{ stepId: 's0', stepName: 'Make', index: 0, status: 'inProgress' }],
    run: { pauseState: { pausedAt: 160, remainingSeconds: 1200 } },
  });
  assert.equal(paused.currentStep.selectionAvailability.staleRoute, true, 'the stage plan itself is open');
  assert.equal(paused.awaitingChoice, false, 'a paused run waits on a resume, not on a pick');
  assert.equal(runAttentionPresentation(paused), null);
  assert.equal(notice(paused).dataAttr, 'data-journal-paused');
});

// Issue 1648, M21. A started stage's materials are gone, so the held/needed probe that describes an
// open stage describes nothing about a started one — the maintainer read `0/0 Drop essence` against
// an essence the stage had already spent.
test('a started stage projects what it consumed, never the requirement it was measured against', () => {
  const recorded = {
    selectedIngredientSetId: 'route-iron',
    consumedSummary: [
      { actorUuid: 'Actor.actor-1', itemUuid: 'Actor.actor-1.Item.star', componentId: 'star-iron',
        name: 'Star Iron', img: 'icons/star.webp', quantity: 3 },
      { actorUuid: 'Actor.actor-1', itemUuid: 'Actor.actor-1.Item.dust', componentId: 'dust',
        name: 'Ash Dust', img: null },
    ],
    essenceSpend: { labels: { fire: 'Fire' }, carriers: [{ actorUuid: 'Actor.actor-1',
      itemUuid: 'Actor.actor-1.Item.ember', name: 'Ember', img: null, quantity: 2,
      contributions: [{ essenceId: 'fire', amount: 4 }] }] },
  };
  const started = unbegunSecondStage([ironRoute()], {
    selectionPlan: { selectedIngredientSetId: 'route-iron' },
    preparedConsumption: recorded,
    timeGate: { requiredSeconds: 3600, initiatedAt: 150, availableAt: 3750 },
  });
  const record = started.currentStep.consumptionRecord;
  assert.equal(started.currentStep.selectionAvailability.locked, true);
  // The route authors ONE `iron` at quantity 1 and no essence at all, so none of these three
  // readings is derivable from the requirement snapshot.
  assert.deepEqual(
    record.materials.map((entry) => [entry.name, entry.quantity]),
    [['Star Iron', 3], ['Ash Dust', null]],
    'the receipt is rendered as recorded, and an uncaptured quantity stays uncaptured'
  );
  assert.equal(record.essence.carriers[0].contributions[0].amount, 4,
    'the essence contribution survives as a recorded contribution, not as a live probe');
  assert.equal(record.essence.labels.fire, 'Fire');
  // Tag-matched and fixed consumption arrive on the SAME footing: the receipt names items,
  // so nothing here depends on which kind of requirement matched them.
  assert.equal(record.materials[1].componentId, 'dust');

  // A stage that has not started has no receipt to show, and neither has a stage that is not
  // the one being viewed — the latter reads its record through the history entitlement rule.
  const unbegun = unbegunSecondStage([ironRoute()], {
    selectionPlan: { selectedIngredientSetId: 'route-iron' },
  });
  assert.equal(unbegun.currentStep.consumptionRecord, null);
  assert.equal(unbegun.currentStep.stageStarted, false);
  assert.equal(started.steps[0].consumptionRecord, null,
    'stage one is finished and is not the current stage, so it projects no live receipt');
  assert.equal(started.steps[0].stageStarted, true, 'though it certainly did start');
});

/**
 * D-031: a currency-only ingredient set is authorable, so the live receipt's THIRD field is the
 * payment — projected beside the materials and the essence recap, and read by the same helper the
 * terminal screen reads.
 */
test('the live receipt carries currency, and its catalogue fallback is not a disclosure', () => {
  const recorded = {
    selectedIngredientSetId: 'route-iron',
    currencySpends: [{ unit: 'gp', amount: 50 }],
    consumedSummary: [
      { actorUuid: 'Actor.actor-1', itemUuid: 'Actor.actor-1.Item.bare', componentId: 'iron',
        quantity: 1 },
    ],
  };
  const project = (recipeVisibility) =>
    projectChoiceRun({
      executionSteps: [
        { id: 's0', toolIds: [], timeRequirement: { hours: 1 }, ingredientSets: [ironRoute()] },
        { id: 's1', toolIds: [], timeRequirement: { hours: 1 }, ingredientSets: [ironRoute()] },
      ],
      currentStepIndex: 1,
      runSteps: [
        { stepId: 's0', stepName: 'Forge', index: 0, status: 'succeeded',
          preparedConsumption: { consumedSummary: [] }, createdResults: [] },
        { stepId: 's1', stepName: 'Temper', index: 1, status: 'inProgress',
          selectionPlan: { selectedIngredientSetId: 'route-iron' },
          preparedConsumption: recorded,
          // The NEIGHBOUR field, given the same id-only row so the two are comparable.
          consumedIngredients: recorded.consumedSummary,
          timeGate: { requiredSeconds: 3600, initiatedAt: 150, availableAt: 3750 } },
      ],
      dependencies: {
        recipeVisibility,
        getComponent: () => ({ id: 'iron', name: 'Catalogue Iron', img: 'icons/iron.webp' }),
      },
    });

  const disclosed = project({ evaluateRecipeAccess: () => ({ visible: true }) });
  assert.deepEqual(
    disclosed.currentStep.consumptionRecord.currencySpends,
    [{ unit: 'gp', amount: 50 }],
    'what the stage PAID at start, which no other projected field carried'
  );
  assert.equal(
    disclosed.currentStep.consumptionRecord.materials[0].name,
    'Catalogue Iron',
    'and a row the record named by id alone still reads, for the viewer it belongs to'
  );

  // Access ANSWERS NOTHING: the run is not redacted — its steps are still projected — and the
  // viewer is not history-entitled either. The receipt discloses no more than its neighbour.
  const withheld = project({ evaluateRecipeAccess: () => null });
  assert.equal(
    withheld.currentStep.consumedIngredients[0].name,
    'Catalogue Iron',
    'the neighbour resolves the catalogue for exactly this viewer'
  );
  assert.equal(
    withheld.currentStep.consumptionRecord.materials[0].name,
    'Catalogue Iron',
    'so the receipt is not the field that discloses; the two agree'
  );
});

test('a started stage whose locked route is deleted reports the edit, not an impossible choice', () => {
  const orphaned = unbegunSecondStage([silverRoute()], {
    selectionPlan: { selectedIngredientSetId: 'route-iron' },
    selectedIngredientSetId: 'route-iron',
    preparedConsumption: { consumedSummary: [] },
    timeGate: { requiredSeconds: 3600, initiatedAt: 150, availableAt: 3750 },
  });
  assert.equal(orphaned.currentStep.selectionAvailability.staleRoute, true);
  // The choice locked when the stage started, so `setSelection` is false: telling the player
  // to choose would name a control they do not have (issue 1648, QE-5).
  assert.equal(orphaned.actions.setSelection, false);
  assert.equal(orphaned.awaitingChoice, false, 'there is no pick left to make');
  assert.equal(orphaned.actions.execute, false, 'and the engine refuses the stage either way');
  assert.equal(orphaned.actions.disabledReason, 'routeUnavailable');
  assert.equal(orphaned.actions.cancel, true, 'cancel is the way out that actually exists');
  assert.equal(notice(orphaned).dataValue, 'routeUnavailable');
});

test('the projection reads a stage duration exactly as the run manager arms it', () => {
  // `RunJournalBuilder`'s `durationToSeconds` is a hand-maintained copy of
  // `CraftingRunManager._durationToSeconds`, and since issue 1648 that copy also decides whether
  // the begin control renders at all.
  const manager = new CraftingRunManager();
  const durations = [
    null, {}, { minutes: 1 }, { hours: 2 }, { days: 3 }, { months: 1 }, { years: 1 },
    { minutes: 30, hours: 1, days: 2, months: 3, years: 4 },
    { minutes: -5 }, { hours: '2' }, { days: NaN }, { weeks: 9 },
  ];
  for (const timeRequirement of durations) {
    const label = JSON.stringify(timeRequirement);
    const armed = manager.durationToSeconds(timeRequirement);
    const model = projectChoiceRun({
      executionSteps: [{ id: 's0', toolIds: [], timeRequirement, ingredientSets: [ironRoute()] }],
      runSteps: [{ stepId: 's0', stepName: 'Make', index: 0, status: 'inProgress' }],
    });
    assert.equal(model.currentStep.detail.requiredSeconds, armed > 0 ? armed : null, label);
    assert.equal(model.actions.atStageStart, armed > 0, `begin control renders iff gated: ${label}`);
  }
});

test('waiting on a choice is reported only to a viewer who can make it', () => {
  const executionSteps = [{ id: 's0', toolIds: [], timeRequirement: { hours: 1 },
    ingredientSets: [ironRoute(), silverRoute()] }];
  const runSteps = [{ stepId: 's0', stepName: 'Make', index: 0, status: 'inProgress' }];
  const project = (overrides) => projectChoiceRun({ executionSteps, runSteps, ...overrides });
  assert.equal(project({}).awaitingChoice, true);
  assert.equal(project({ actor: { ...CHOICE_OWNER, isOwner: false } }).awaitingChoice, false,
    'a non-owner cannot choose');
  assert.equal(project({ dependencies: { getJournalActionAvailability: () =>
    ({ available: false, reason: 'authorityUnavailable' }) } }).awaitingChoice, false,
  'an unavailable authority refuses the change the guidance would invite');
  assert.equal(project({ dependencies: { recipeVisibility:
    { evaluateRecipeAccess: () => ({ visible: false }) } } }).awaitingChoice, false,
  'a redacted run names no stage to choose for');
  assert.equal(project({ run: { lifecycleVersion: undefined } }).awaitingChoice, false,
    'a legacy run has no editable stage plan');
});

test('gathering and salvage runs never claim to be waiting on a crafting choice', () => {
  const timeGate = { requiredSeconds: 60, availableAt: 300 };
  const listing = makeBuilder({
    gatheringActive: [{ id: 'g1', craftingSystemId: 'sys-1', taskId: 't1', status: 'waitingTime',
      lifecycleVersion: 1, timeGate }],
    salvageActive: [{ id: 'sv1', craftingSystemId: 'sys-1', componentId: 'ore', status: 'waitingTime',
      lifecycleVersion: 1, timeGate }],
  }).buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: PLAYER });
  assert.equal(listing.activeRuns.length, 2);
  for (const run of listing.activeRuns) {
    assert.equal(run.awaitingChoice, false, run.runType);
    assert.equal(runAttentionPresentation(run), null, run.runType);
  }
});

test('shortfall preserves authority/recovery precedence and legacy execution', () => {
  const set = new IngredientSet({ id: 'short', ingredientGroups: [{
    id: 'material', options: [{ quantity: 2, match: { type: 'component', componentId: 'ember' } }],
  }] });
  const authority = { available: false, reason: 'authorityUnavailable' };
  const { raw, project } = materialShortfallFixture([set], { getJournalActionAvailability: () => authority });
  assert.equal(project().actions.disabledReason, 'authorityUnavailable');
  raw.executionJournal = { status: 'recoveryRequired', effects: [] };
  assert.equal(project().actions.disabledReason, 'recoveryRequired');
  raw.executionJournal.status = 'planned';
  assert.equal(project().actions.disabledReason, 'executionInProgress');
  delete raw.executionJournal;
  delete raw.lifecycleVersion;
  assert.equal(project().actions.execute, true);
  assert.equal(project().actions.disabledReason, null);
});

function projectMaterialSelection(override) {
  const ingredientSet = new IngredientSet({ id: 'materials', ingredientGroups: [{
    id: 'metal', name: 'Metal', options: [
      { id: 'iron-option', quantity: 1, match: { type: 'component', componentId: 'iron' } },
      { id: 'silver-option', quantity: 1, match: { type: 'component', componentId: 'silver' } },
    ],
  }] });
  const held = { id: 'iron', uuid: 'Actor.actor-1.Item.iron', name: 'Iron', system: { quantity: 5 } };
  const plan = JSON.parse(JSON.stringify({ selectedIngredientSetId: ingredientSet.id, ingredientOptionOverrides: { metal: override } }));
  const raw = activeSingleStepRun({ lifecycleVersion: 1, steps: [{ stepId: 's0', selectionPlan: plan }] });
  const recipe = { ...SINGLE_STEP_RECIPE, getExecutionSteps: () => [{ id: 's0', ingredientSets: [ingredientSet] }] };
  const model = makeBuilder({ active: [raw], recipe,
    ingredientMatchesItem: (_recipe, ingredient, item) => ingredient.match.componentId === item.id,
  }).buildListing({ actor: { ...ACTOR, isOwner: true, items: [held] }, viewer: PLAYER }).activeRuns[0];
  assert.deepEqual(model.currentStep.selectionPlan, plan, 'projection never repairs persisted intent');
  assert.equal(held.system.quantity, 5, 'projection does not spend stock');
  return model.currentStep.selectionAvailability;
}

for (const optionIndex of [2, -1, 0.5, null, '', ' ', 'removed', undefined, false]) {
  test(`invalid persisted option index ${String(optionIndex)} stays blocked rather than selecting stock`, () => {
    const availability = projectMaterialSelection({ optionIndex });
    assert.equal(availability.success, false);
    assert.equal(availability.requirements[0].selectedOptionIndex, null);
    assert.equal(availability.requirements[0].option, null, 'no fallback option is presented as selected');
    assert.equal(availability.choices[0].selectedOptionIndex, null);
    assert.equal(availability.choices[0].options[0].available, true, 'explicit replacement remains possible');
    assert.equal(availability.missingGroups[0].id, 'metal');
  });
}

test('valid explicit and absent material overrides retain canonical stock resolution', () => {
  for (const override of [{ optionIndex: 0 }, { optionIndex: '0' }, undefined]) {
    const availability = projectMaterialSelection(override);
    assert.equal(availability.success, true);
    assert.equal(availability.requirements[0].selectedOptionIndex, 0);
    assert.equal(availability.requirements[0].option.available, true);
  }
});

test('a missing held item remains pinned and blocked even when another candidate has stock', () => {
  const availability = projectMaterialSelection({ optionIndex: 0, heldItemId: 'Actor.actor-1.Item.removed' });
  assert.equal(availability.success, false);
  const requirement = availability.requirements[0];
  assert.equal(requirement.selectedItemId, 'Actor.actor-1.Item.removed');
  assert.equal(requirement.selectedOptionIndex, 0);
  assert.equal(requirement.option.available, false, 'selected claim is unavailable despite replacement stock');
  assert.equal(requirement.option.candidates[0].itemId, 'Actor.actor-1.Item.iron');
  assert.equal(availability.choices[0].options[0].available, true, 'replacement choice remains independently available');
});

test('two stale singleton groups can be repaired incrementally without replacing intent or bypassing shared stock', () => {
  const option = (id, quantity = 1) => ({ quantity, match: { type: 'component', componentId: id } });
  const set = new IngredientSet({ id: 'repair', ingredientGroups: [
    { id: 'a', options: [option('iron')] },
    { id: 'b', options: [option('silver')] },
  ] });
  const actor = { ...ACTOR, isOwner: true, items: ['iron', 'silver'].map((id) => ({
    id, uuid: `Actor.actor-1.Item.${id}`, name: id, system: { quantity: 1 },
  })) };
  const plan = { selectedIngredientSetId: set.id, ingredientOptionOverrides: {
    a: { optionIndex: 1 }, b: { optionIndex: 1 },
  } };
  const raw = activeSingleStepRun({ lifecycleVersion: 1, steps: [{ stepId: 's0', selectionPlan: plan }] });
  const recipe = { ...SINGLE_STEP_RECIPE, getExecutionSteps: () => [{ id: 's0', ingredientSets: [set] }] };
  const builder = makeBuilder({ active: [raw], recipe,
    ingredientMatchesItem: (_recipe, ingredient, item) => ingredient.match.componentId === item.id,
  });
  const project = () => builder.buildListing({ actor, viewer: PLAYER }).activeRuns[0];
  const before = structuredClone(plan);
  const initial = project();
  assert.equal(initial.currentStep.selectionAvailability.success, false);
  for (const choice of initial.currentStep.selectionAvailability.choices) {
    assert.equal(choice.selectedOptionIndex, null);
    assert.equal(choice.options[0].available, true);
    assert.equal(choice.options[0].candidates[0].available, true);
  }
  assert.deepEqual(plan, before, 'probing candidates never replaces the other stale choice');

  plan.ingredientOptionOverrides.a = { optionIndex: 0, heldItemId: actor.items[0].uuid };
  const partial = project();
  assert.equal(partial.currentStep.selectionAvailability.success, false);
  assert.equal(partial.currentStep.selectionAvailability.choices[1].options[0].available, true);
  assert.deepEqual(plan.ingredientOptionOverrides.b, { optionIndex: 1 });

  plan.ingredientOptionOverrides.b = { optionIndex: 0, heldItemId: actor.items[1].uuid };
  const repaired = project();
  assert.equal(repaired.currentStep.selectionAvailability.success, true);
  assert.deepEqual(actor.items.map((item) => item.system.quantity), [1, 1]);

  // A later fixed claim still competes with a candidate while another choice is stale.
  plan.ingredientOptionOverrides.b = { optionIndex: 1 };
  set.ingredientGroups.push(new IngredientSet({ id: 'fixed-probe', ingredientGroups: [
    { id: 'fixed', options: [option('iron')] },
  ] }).ingredientGroups[0]);
  const contested = project().currentStep.selectionAvailability;
  assert.equal(contested.choices[0].options[0].available, false);
  assert.equal(contested.choices[0].options[0].candidates[0].available, false);
  assert.equal(contested.success, false);
});

test('same run id across native run types remains collision-free while same-type duplicates are dropped', () => {
  const duplicateId = 'shared-id';
  const listing = makeBuilder({
    active: [activeCraftingRun({ id: duplicateId }), activeCraftingRun({ id: duplicateId })],
    gatheringActive: [
      {
        id: duplicateId,
        craftingSystemId: 'sys-1',
        taskId: 'task-1',
        status: 'inProgress',
        timeGate: null,
      },
    ],
    salvageActive: [
      {
        id: duplicateId,
        craftingSystemId: 'sys-1',
        componentId: 'c1',
        status: 'inProgress',
        timeGate: null,
      },
    ],
  }).buildListing({ actor: ACTOR, viewer: PLAYER });

  assert.deepEqual(listing.activeRuns.map((run) => run.runType), ['crafting', 'salvage', 'gathering']);
  assert.equal(new Set(listing.activeRuns.map((run) => run.key)).size, 3);
});

test('dismissed composite keys filter before counts and stay isolated by viewer at the service seam', () => {
  const hidden = terminalCraftingRun({ id: 'hidden' });
  const visible = terminalCraftingRun({ id: 'visible' });
  const hiddenKey = JSON.stringify([ACTOR.uuid, 'crafting', 'hidden']);
  let reads = 0;
  const builder = makeBuilder({
    history: [hidden, visible],
    getDismissedRunKeys: ({ actorUuid, viewerId }) => {
      reads += 1;
      assert.equal(actorUuid, ACTOR.uuid);
      return viewerId === PLAYER.id ? new Set([hiddenKey]) : new Set();
    },
  });
  const listing = builder.buildListing({ actor: ACTOR, viewer: PLAYER });
  const otherViewerListing = builder.buildListing({ actor: ACTOR, viewer: GM });

  assert.deepEqual(listing.history.map((run) => run.id), ['visible']);
  assert.deepEqual(listing.counts, { active: 0, history: 1 });
  assert.deepEqual(otherViewerListing.history.map((run) => run.id), ['hidden', 'visible']);
  assert.equal(reads, 2, 'the per-user setting is read once for each listing pass');
});

test('authority availability gates current actions with its safe reason', () => {
  let reads = 0;
  const builder = makeBuilder({
    active: [activeCraftingRun({ lifecycleVersion: 1, runRevision: 2 })],
    getJournalActionAvailability: () => {
      reads += 1;
      return { available: false, reason: 'authorityUnavailable' };
    },
  });
  const run = builder.buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: PLAYER }).activeRuns[0];

  assert.equal(run.actions.execute, false);
  assert.equal(run.actions.cancel, false);
  assert.equal(run.actions.disabledReason, 'authorityUnavailable');
  assert.equal(reads, 1, 'authority is read once for the listing pass');
});

// Issue 1648: the retained claim's token is what `reconcileJournalRunAuthority` needs, and it was
// reachable only from a console macro that read the ledger's flags by hand.
test('a retained authority claim reaches the blocked run, for a GM viewer only', () => {
  const availability = {
    available: false,
    reason: 'recovery-required',
    retained: {
      claimId: 'claim-7',
      requestId: 'req-7',
      requestKind: 'command',
      requestStatus: 'recoveryRequired',
      failureReason: 'operation-failed',
      failureMessage: 'The run is already paused',
      claimedAt: 1000,
    },
  };
  const project = (viewer) =>
    makeBuilder({
      active: [activeCraftingRun({ lifecycleVersion: 1, runRevision: 2 })],
      getJournalActionAvailability: () => availability,
    }).buildListing({ actor: { ...ACTOR, isOwner: true }, viewer }).activeRuns[0].actions;

  const gm = project(GM);
  assert.equal(gm.disabledReason, 'recovery-required');
  assert.deepEqual(gm.recoveryClaim, {
    claimId: 'claim-7',
    requestKind: 'command',
    failureReason: 'operation-failed',
    failureMessage: 'The run is already paused',
    claimedAt: 1000,
  });

  const player = project(PLAYER);
  assert.equal(player.disabledReason, 'recovery-required');
  assert.equal(player.recoveryClaim, undefined, 'a player is never handed a claim token');
});

test('a LIVE claim offers no release, because there is nothing a GM could clear', () => {
  // The control for the test above, in the shape the authority actually produces (issue 1648).
  const run = makeBuilder({
    active: [activeCraftingRun({ lifecycleVersion: 1, runRevision: 2 })],
    getJournalActionAvailability: () => ({ available: false, reason: 'claim-held' }),
  }).buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: GM }).activeRuns[0];
  assert.equal(run.actions.disabledReason, 'claim-held');
  assert.equal(run.actions.recoveryClaim, undefined);
});

test('a retained claim reaches the run whose OWN evidence is uncertain, which a GM opens first', () => {
  // M27: the maintainer was told to use `Release claim…` and answered "there is no release claim
  // button in the UI".
  const retained = {
    claimId: 'claim-9',
    requestKind: 'command',
    failureReason: 'operation-failed',
    failureMessage: 'The crafting run requires recovery',
    claimedAt: 2000,
  };
  const project = (viewer) =>
    makeBuilder({
      active: [
        activeCraftingRun({
          lifecycleVersion: 1,
          runRevision: 2,
          executionJournal: {
            status: 'recoveryRequired',
            operationId: 'op-9',
            requestId: 'req-9',
            effects: [{ effectId: 'consume-ingredients', kind: 'consumeIngredients', phase: 'applying' }],
          },
        }),
      ],
      getJournalActionAvailability: () => ({
        available: false,
        reason: 'recovery-required',
        retained: { ...retained, requestId: 'req-9', requestStatus: 'recoveryRequired' },
      }),
    }).buildListing({ actor: { ...ACTOR, isOwner: true }, viewer }).activeRuns[0];

  const gm = project(GM);
  assert.equal(gm.actions.disabledReason, 'recoveryRequired', 'its OWN evidence names the block');
  assert.deepEqual(gm.actions.recoveryClaim, retained, 'and the claim still reaches it');
  assert.equal(project(PLAYER).actions.recoveryClaim, undefined, 'never a player');
});

test('completion-mode switching is limited to an active countdown without a player check', () => {
  const waitingGate = { requiredSeconds: 600, availableAt: 800 };
  const gatheringRun = (id, taskId, timeGate = waitingGate) => ({
    id,
    craftingSystemId: 'sys-1',
    environmentId: 'env-1',
    taskId,
    status: 'waitingTime',
    lifecycleVersion: 1,
    runRevision: 0,
    timeGate,
  });
  const listing = makeBuilder({
    worldTime: 200,
    gatheringActive: [
      gatheringRun('straight', 'straight-task'),
      gatheringRun('rolled', 'rolled-task'),
      gatheringRun('ready', 'straight-task', { requiredSeconds: 600, availableAt: 100 }),
    ],
    getGatheringTask: (_environmentId, taskId) => ({
      name: taskId,
      resolutionMode: taskId === 'straight-task' ? 'straight' : 'd100',
    }),
  }).buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: PLAYER });
  const byId = Object.fromEntries(listing.activeRuns.map((run) => [run.id, run]));

  assert.equal(byId.straight.actions.setCompletionMode, true);
  assert.equal(byId.rolled.actions.setCompletionMode, false, 'player rolls stay manual');
  assert.equal(byId.ready.actions.setCompletionMode, false, 'a matured gate is no longer counting down');
});

test('salvage remains outside versioned completion-mode controls', () => {
  const run = makeBuilder({
    salvageActive: [
      {
        id: 'salvage-current',
        craftingSystemId: 'sys-1',
        componentId: 'ore',
        status: 'waitingTime',
        lifecycleVersion: 1,
        timeGate: { requiredSeconds: 60, availableAt: 300 },
      },
    ],
  }).buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: PLAYER }).activeRuns[0];

  assert.equal(run.actions.setCompletionMode, false);
});

test('current-step availability delegates material choices and shared essence allocation to the ingredient set', () => {
  const calls = [];
  const selectedSet = {
    id: 'set-1',
    ingredientGroups: [
      {
        id: 'choice',
        name: 'Metal',
        options: [
          { id: 'iron', quantity: 1, match: { type: 'component', componentId: 'iron' } },
          { id: 'silver', quantity: 1, match: { type: 'component', componentId: 'silver' } },
        ],
      },
      {
        id: 'essence',
        name: 'Essence',
        options: [
          { id: 'fire', match: { type: 'essence', essenceId: 'fire', amount: 2 } },
        ],
      },
    ],
    resolveIngredientSelection(items, matcher, options) {
      calls.push({ items, matcher, options });
      const selectedIndex = options.optionOverrides?.choice?.optionIndex ?? 0;
      return {
        success: false,
        missingGroups:
          selectedIndex === 0
            ? [
                {
                  group: { id: 'fixed', name: 'Fixed input' },
                  ingredient: { id: 'coal' },
                  need: 1,
                  have: 0,
                },
              ]
            : [{ group: { id: 'choice' }, ingredient: { id: 'silver' }, need: 1, have: 0 }],
        selectedIngredients: [selectedIndex === 0 ? this.ingredientGroups[0].options[0] : this.ingredientGroups[0].options[1]],
        plan: [{ item: items[0], quantity: 1 }],
        currencySpends: [],
        essenceAllocation: options.essenceAllocation,
        essencePool: {
          requirements: [{ groupId: 'essence', essenceId: 'fire', need: 2, delivered: 2, owned: 3, satisfied: true }],
          carriers: [{ itemKey: 'Item.ember', item: items[0], perUnit: { fire: 1 }, ownedUnits: 3, allocatedUnits: 2 }],
          allocation: { 'Item.ember': 2 },
          suggested: { 'Item.ember': 2 },
          totals: { fire: 2 },
        },
      };
    },
  };
  const recipe = {
    ...RECIPE,
    getExecutionSteps: () => [
      RECIPE.getExecutionSteps()[0],
      { ...RECIPE.getExecutionSteps()[1], ingredientSets: [selectedSet] },
    ],
  };
  const held = {
    id: 'ember',
    uuid: 'Item.ember',
    name: 'Ember',
    img: 'icons/ember.webp',
    system: { quantity: 3 },
  };
  const actor = { ...ACTOR, isOwner: true, items: [held] };
  const system = {
    ...SYSTEM,
    components: [
      { id: 'iron', name: 'Iron Ingot', img: 'icons/iron.webp' },
      { id: 'silver', name: 'Silver Ingot', img: 'icons/silver.webp' },
    ],
    essenceDefinitions: [
      { id: 'fire', name: 'Fire', icon: 'fas fa-fire', colorToken: 'ember' },
    ],
  };
  const run = activeCraftingRun({
    lifecycleVersion: 1,
    steps: [
      activeCraftingRun().steps[0],
      {
        ...activeCraftingRun().steps[1],
        selectionPlan: {
          selectedIngredientSetId: 'set-1',
          ingredientOptionOverrides: { choice: { optionIndex: 0, heldItemId: 'Item.ember' } },
          ingredientEssenceAllocation: {
            stepId: 's1',
            ingredientSetId: 'set-1',
            allocation: { 'Item.ember': 2 },
          },
        },
      },
    ],
  });
  const step = makeBuilder({
    active: [run],
    system,
    recipe,
    ingredientMatchesItem: (_recipe, ingredient, item) => ingredient.id === 'iron' && item.id === 'ember',
    resolveItemEssences: ({ item, recipe: resolvedRecipe }) => {
      assert.equal(item, held);
      assert.equal(resolvedRecipe, recipe);
      return { fire: 1 };
    },
    affordCurrency: () => true,
    getComponent: (_systemId, componentId) =>
      system.components.find((component) => component.id === componentId) ?? null,
  }).buildListing({ actor, viewer: PLAYER }).activeRuns[0].currentStep;

  assert.equal(calls.length, 5, 'selected plan, three authored options and one pinned held-item candidate use the canonical resolver');
  assert.equal(calls[0].items[0], held);
  assert.deepEqual(calls[0].options.essenceAllocation, { 'Item.ember': 2 });
  assert.equal(calls[0].options.resolveItemEssences(held).fire, 1);
  assert.equal(calls[0].options.affordCurrency({ unit: 'gp', amount: 1 }), true);
  const expectedAvailability = {
    success: false,
    // The fake resolver reports a group short of stock, so the plan waits on acquiring rather than
    // on a pick (issue 1648).
    blocker: 'selectionRequired',
    awaitingChoice: false,
    knownMaterialShortfall: true,
    missingGroups: [
      {
        id: 'fixed',
        name: 'Fixed input',
        ingredientId: 'coal',
        need: 1,
        have: 0,
      },
    ],
    choices: [
      {
        groupId: 'choice',
        selectedOptionIndex: 0,
        options: [
          {
            index: 0,
            id: 'iron',
            kind: 'component',
            name: 'Iron Ingot',
            img: 'icons/iron.webp',
            icon: null,
            colorToken: null,
            need: 1,
            available: true,
            candidates: [
              {
                itemId: 'Item.ember',
                name: 'Ember',
                img: 'icons/ember.webp',
                held: 3,
                available: true,
              },
            ],
          },
          {
            index: 1,
            id: 'silver',
            kind: 'component',
            name: 'Silver Ingot',
            img: 'icons/silver.webp',
            icon: null,
            colorToken: null,
            need: 1,
            available: false,
            candidates: [],
          },
        ],
      },
    ],
    requirements: [
      {
        groupId: 'choice',
        name: 'Metal',
        selectedOptionIndex: 0,
        selectedItemId: 'Item.ember',
        option: {
          index: 0,
          id: 'iron',
          kind: 'component',
          name: 'Iron Ingot',
          img: 'icons/iron.webp',
          icon: null,
          colorToken: null,
          need: 1,
          available: true,
          candidates: [
            {
              itemId: 'Item.ember',
              name: 'Ember',
              img: 'icons/ember.webp',
              held: 3,
              available: true,
            },
          ],
        },
      },
      {
        groupId: 'essence',
        name: 'Essence',
        selectedOptionIndex: 0,
        selectedItemId: null,
        option: {
          index: 0,
          id: 'fire',
          kind: 'essence',
          name: 'Fire essence',
          img: null,
          icon: 'fas fa-fire',
          colorToken: 'ember',
          need: 2,
          available: true,
          candidates: [],
        },
      },
    ],
    essencePool: {
      requirements: [
        {
          groupId: 'essence',
          essenceId: 'fire',
          name: 'Fire',
          icon: 'fas fa-fire',
          colorToken: 'ember',
          need: 2,
          delivered: 2,
          owned: 3,
          satisfied: true,
        },
      ],
      carriers: [{ itemKey: 'Item.ember', name: 'Ember', img: 'icons/ember.webp', perUnit: { fire: 1 }, ownedUnits: 3, allocatedUnits: 2 }],
      allocation: { 'Item.ember': 2 },
      suggested: { 'Item.ember': 2 },
      totals: { fire: 2 },
    },
  };
  expectedAvailability.selectedIngredientSetId = 'set-1';
  expectedAvailability.routes = [{ id: 'set-1', name: '' }];
  expectedAvailability.staleRoute = false;
  // A candidate that leaves a different required group short is infeasible too.
  expectedAvailability.choices[0].options[0].available = false;
  expectedAvailability.choices[0].options[0].candidates[0].available = false;
  expectedAvailability.choices[0].options[0].candidates[0].claimed = 1;
  expectedAvailability.requirements[0].option = structuredClone(expectedAvailability.choices[0].options[0]);
  expectedAvailability.requirements[1].option.available = false;
  expectedAvailability.choices.push({ groupId: 'essence', selectedOptionIndex: 0,
    options: [structuredClone(expectedAvailability.requirements[1].option)] });
  // A supplied selected requirement is met even when another group blocks the plan.
  expectedAvailability.requirements[0].option.available = true;
  expectedAvailability.requirements[1].option.available = true;
  assert.deepEqual(step.selectionAvailability, expectedAvailability);
  assert.equal(JSON.stringify(step.selectionAvailability).includes('system'), false, 'held document internals are not spread');
});

test('paused runs use an explicit neutral pause status presentation', () => {
  assert.deepEqual(runStatusPresentation('paused'), {
    tone: 'neutral',
    icon: 'fa-pause',
    labelKey: 'FABRICATE.App.Journal.Status.paused',
  });
});

test('alchemy check eligibility follows none/simple/tiered canonical active slots', () => {
  for (const [checkMode, expectedFormula, automatic] of [
    ['none', null, true], ['simple', '1d20', false], ['tiered', '2d10', false],
  ]) {
    const projected = makeBuilder({
      mode: 'alchemy', active: [activeCraftingRun({ lifecycleVersion: 1 })],
      system: { ...SYSTEM, resolutionMode: 'alchemy', alchemy: { checkMode },
        craftingCheck: { simple: { rollFormula: '1d20', dc: 12 }, routed: { rollFormula: '2d10', dc: 18 } } },
    }).buildListing({ actor: { ...ACTOR, isOwner: true }, viewer: PLAYER }).activeRuns[0];
    assert.equal(projected.actions.setCompletionMode, automatic, checkMode);
    if (expectedFormula) assert.ok(projected.currentStep.detail.checkLabel.includes(expectedFormula));
    else assert.equal(projected.currentStep.detail.checkLabel, null);
  }
});

test('recovery projects actual safe receipts and an uncertain boundary without leaking secret internals', () => {
  const executionJournal = { status: 'recoveryRequired', effects: [
    { kind: 'consumeIngredients', phase: 'applied', receipt: {
      items: [{ itemUuid: 'Item.iron', name: 'Iron', quantity: 2 }],
      consumedItems: [{ secret: 'PRIVATE_SNAPSHOT' }],
    } },
    { kind: 'awardResults', phase: 'applying', receipt: { results: [{ name: 'UNCONFIRMED', quantity: 5 }] } },
    { kind: 'postCraftChat', phase: 'planned', planned: { content: 'PRIVATE_CHAT' } },
  ] };
  const options = { active: [activeCraftingRun({ lifecycleVersion: 1, executionJournal })] };
  const visible = makeBuilder(options).buildListing({ actor: ACTOR, viewer: GM }).activeRuns[0];
  assert.equal(visible.recoveryEvidence.uncertainEffectIndex, 1);
  assert.equal(visible.recoveryEvidence.effects[0].receipt.items[0].quantity, 2);
  assert.equal(visible.recoveryEvidence.effects[1].receipt, null);
  assert.doesNotMatch(JSON.stringify(visible), /PRIVATE_|UNCONFIRMED/);
  const hidden = makeBuilder({ ...options, recipeVisibility: { evaluateRecipeAccess: () => ({ visible: false }) } })
    .buildListing({ actor: ACTOR, viewer: PLAYER }).activeRuns[0];
  assert.ok(hidden.recoveryEvidence.effects.every((effect) => effect.receipt === null && effect.kind === 'other'));
  assert.doesNotMatch(JSON.stringify(hidden.recoveryEvidence), /Iron|Item.iron|PRIVATE_|UNCONFIRMED/);
  const gatheringRun = {
    id: 'gather-recovery', userId: PLAYER.id, lifecycleVersion: 1, status: 'succeeded', taskId: 'visible-task',
    executionJournal: { status: 'recoveryRequired', effects: [{ kind: 'createGatheredResults',
      phase: 'applied', receipt: [{ name: 'Gathered herb', quantity: 3, secret: 'PRIVATE_SNAPSHOT' }] }] },
  };
  const gathering = makeBuilder({ gatheringHistory: [gatheringRun] })
    .buildListing({ actor: ACTOR, viewer: PLAYER }).history[0];
  assert.equal(gathering.recoveryEvidence.effects[0].receipt.items[0].name, 'Gathered herb');
  assert.doesNotMatch(JSON.stringify(gathering.recoveryEvidence), /PRIVATE_/);
  const blind = makeBuilder({ gatheringHistory: [{ ...gatheringRun, taskId: 'blind' }] })
    .buildListing({ actor: ACTOR, viewer: PLAYER }).history[0];
  assert.equal(blind.recoveryEvidence.effects[0].receipt, null);
});

// The bottom tier of a routed ladder has no lower bound (both activities resolve with
// `clampToNearest`), so stating it as `threshold+` was wrong in general and printed a
// nonsensical `-5+` whenever the offset drove the threshold below zero.
test('the lowest crafting tier reads as an upper bound, exactly as its gathering sibling does', () => {
  const tiers = [
    { id: 'setback', dc: -15 },
    { id: 'fine', dc: 0 },
    { id: 'masterwork', dc: 4 },
  ];
  const routed = { type: 'relative', thresholdMode: 'meet', relativeOutcomes: tiers };
  assert.equal(craftingOutcomeBand(tiers[0], routed, 10), '<10', 'no nonsensical -5+');
  assert.equal(craftingOutcomeBand(tiers[1], routed, 10), '10+');
  assert.equal(craftingOutcomeBand(tiers[2], routed, 10), '14+');

  const exceed = { ...routed, thresholdMode: 'exceed' };
  assert.equal(craftingOutcomeBand(tiers[0], exceed, 10), '≤10');
  assert.equal(craftingOutcomeBand(tiers[2], exceed, 10), '>14');

  // An unresolved DC keeps the relative vocabulary on the same ladder geometry.
  assert.equal(craftingOutcomeBand(tiers[0], routed, null), '<DC');
  assert.equal(craftingOutcomeBand(tiers[1], routed, null), 'DC+');
  assert.equal(craftingOutcomeBand(tiers[2], routed, null), 'DC+4+');

  // A one-tier ladder covers everything, and both renderers say so the same way.
  const only = { type: 'relative', relativeOutcomes: [{ id: 'only', dc: 0 }] };
  assert.equal(craftingOutcomeBand(only.relativeOutcomes[0], only, 10), '−∞–∞');
  assert.equal(routedOutcomeBand(only.relativeOutcomes[0], only, null), '−∞–∞');
});

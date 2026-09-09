import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { RunJournalBuilder } from '../../src/systems/RunJournalBuilder.js';
import {
  PLAYER_APP_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import {
  LAB_JOURNAL_CASE_STATE_RUN_IDS,
  buildLabRunStates,
} from '../view-lab/world/labRunStates.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-journal-lifecycle-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...STATUS_TONE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/formatDuration.js',
    'src/ui/svelte/util/worldTimeLabel.js',
    'src/systems/foundryCalendar.js',
    'src/ui/svelte/apps/journal/journalRunStatus.js',
  ],
  runeModules: ['src/ui/svelte/stores/journalStore.svelte.js'],
  compiledModules: [
    ...SELECT_COMPILED_MODULES,
    ...PLAYER_APP_COMPILED_MODULES,
    component('ManagerSearchField'),
    component('Pagination'),
    component('IconButton'),
    component('ManagerButton'),
    component('RunActionBar'),
    component('SlotTile'),
    component('ChoiceOptionList'),
    component('SlotRow'),
    component('Stepper'),
    component('EssencePool'),
    component('RunProgress'),
    component('StageNav'),
    component('StageCard'),
    component('YieldScale'),
    component('OutcomeLadder'),
    'src/ui/svelte/apps/journal/JournalCard.svelte',
    'src/ui/svelte/apps/journal/JournalListShell.svelte',
    'src/ui/svelte/apps/journal/JournalFactRow.svelte',
    'src/ui/svelte/apps/journal/RunCard.svelte',
    'src/ui/svelte/apps/journal/ActiveRunsList.svelte',
    'src/ui/svelte/apps/journal/HistoryRow.svelte',
    'src/ui/svelte/apps/journal/HistoryList.svelte',
    'src/ui/svelte/apps/journal/StepDetails.svelte',
    'src/ui/svelte/apps/journal/TimeRemainingBox.svelte',
    'src/ui/svelte/apps/journal/ActionsPanel.svelte',
    'src/ui/svelte/apps/journal/RunDetail.svelte',
    'src/ui/svelte/apps/journal/JournalView.svelte',
  ],
  rootClass: 'fabricate-app',
  componentPath: 'src/ui/svelte/apps/journal/JournalView.svelte',
});

const ACTOR_UUID = 'Actor.actor-1';
const SYSTEM = {
  id: 'sys-test',
  name: 'Test Forge',
  resolutionMode: 'simple',
  features: { multiStepRecipes: true },
  craftingCheck: { simple: { rollFormula: null, dc: 12 } },
  components: [
    { id: 'iron', name: 'Iron', img: 'icons/iron.webp' },
    { id: 'copper', name: 'Copper', img: 'icons/copper.webp' },
    { id: 'horseshoe', name: 'Horseshoe', img: 'icons/horseshoe.webp' },
  ],
};
const item = (id, componentId, quantity) => ({
  id,
  uuid: `Item.${id}`,
  name: `${componentId} stock`,
  img: `icons/${componentId}.webp`,
  componentId,
  system: { quantity },
});
const ACTOR = {
  id: 'actor-1',
  uuid: ACTOR_UUID,
  name: 'Brenna',
  img: 'icons/brenna.webp',
  isOwner: true,
  items: [item('iron-a', 'iron', 3), item('copper-a', 'copper', 2)],
};

function ingredientSet(id, groups) {
  const set = {
    id,
    name: id,
    ingredientGroups: groups,
    toJSON: () => ({ id, name: id, ingredientGroups: structuredClone(groups) }),
    resolveIngredientSelection(items, matcher, { optionOverrides = {} } = {}) {
      const selectedIngredients = [];
      const missingGroups = [];
      for (const group of groups) {
        const selectedIndex = Number(optionOverrides?.[group.id]?.optionIndex) || 0;
        const option = group.options[selectedIndex] ?? group.options[0];
        const candidates = items.filter((candidate) => matcher?.(option, candidate));
        const selectedItemId = optionOverrides?.[group.id]?.heldItemId;
        const heldItem =
          candidates.find((candidate) => candidate.uuid === selectedItemId) ?? candidates[0];
        const have = Number(heldItem?.system?.quantity) || 0;
        selectedIngredients.push(option);
        if (have < Number(option.quantity ?? 1)) {
          missingGroups.push({ group, ingredient: option, need: option.quantity ?? 1, have });
        }
      }
      return { success: missingGroups.length === 0, selectedIngredients, missingGroups };
    },
  };
  return set;
}

function componentOption(id, componentId, quantity = 1) {
  return { id, match: { type: 'component', componentId }, quantity };
}

function recipe(id, name, sets, stepCount = 1) {
  const steps = Array.from({ length: stepCount }, (_unused, index) => ({
    id: `${id}-step-${index + 1}`,
    name: `Stage ${index + 1}`,
    ingredientSets: sets,
    resultGroups: [],
    toolIds: [],
    timeRequirement: { hours: 1 },
  }));
  return {
    id,
    name,
    img: `icons/${id}.webp`,
    craftingSystemId: SYSTEM.id,
    steps: stepCount > 1 ? steps : [],
    ingredientSets: sets,
    getExecutionSteps: () => steps,
  };
}

const FIXED_SET = ingredientSet('fixed-set', [
  { id: 'metal', name: 'Metal', options: [componentOption('iron', 'iron')] },
]);
const CHOICE_SET = ingredientSet('choice-set', [
  {
    id: 'metal',
    name: 'Metal',
    options: [componentOption('iron', 'iron'), componentOption('copper', 'copper')],
  },
]);
const RECIPES = [
  recipe('sm-r-horseshoe', 'Bend Horseshoe', [FIXED_SET]),
  recipe('hb-r-grind', 'Grind Reagent', [CHOICE_SET]),
  recipe('sm-r-pattern-blade', 'Forge Pattern Blade', [FIXED_SET], 3),
  recipe('sm-r-chainmail', 'Rivet Chainmail', [FIXED_SET]),
  recipe('jw-r-cast', 'Cast Jewellery', [FIXED_SET]),
  recipe('rw-r-blade', 'Inscribe Runeblade', [FIXED_SET]),
  recipe('sm-r-deepbind', 'Deepbind Ingot', [FIXED_SET]),
  recipe('al-r-firebomb', 'Distil Firebomb', [FIXED_SET]),
];
const TASKS = ['straight', 'd100', 'routed'].map((mode) => ({
  id: `task-${mode}`,
  name: `${mode} task`,
  craftingSystemId: SYSTEM.id,
  resolutionMode: mode,
  dropRows: [
    { id: `${mode}-drop`, componentId: 'iron', quantity: 1, dropRate: 65, enabled: true },
  ],
  resultGroups: [
    { id: `${mode}-group`, name: 'Standard', results: [{ componentId: 'iron', quantity: 1 }] },
  ],
}));
const ENVIRONMENTS = [{ id: 'environment-1', craftingSystemId: SYSTEM.id }];

function makeBuilder(containers, dismissed, nowWorldTime) {
  const recipeById = new Map(RECIPES.map((entry) => [entry.id, entry]));
  const componentById = new Map(SYSTEM.components.map((entry) => [entry.id, entry]));
  return new RunJournalBuilder({
    craftingRunManager: {
      getActiveRuns: () => Object.values(containers.craftingRuns.active),
      getRunHistory: () => containers.craftingRuns.history,
    },
    salvageRunManager: {
      getActiveRuns: () => Object.values(containers.salvageRuns.active),
      getRunHistory: () => containers.salvageRuns.history,
    },
    gatheringRunSource: {
      getActiveRuns: () => Object.values(containers.gatheringRuns.active),
      getRunHistory: () => containers.gatheringRuns.history,
    },
    recipeManager: {
      getRecipe: (id) => recipeById.get(id) ?? null,
      ingredientMatchesItem: (_recipe, option, held) =>
        option?.match?.componentId === held?.componentId,
    },
    resolutionModeService: { getMode: () => 'simple' },
    recipeVisibility: { evaluateRecipeAccess: () => ({ visible: true }) },
    getSystem: () => SYSTEM,
    getComponent: (_systemId, id) => componentById.get(id) ?? null,
    getViewer: () => ({ id: 'user-1', isGM: false }),
    nowWorldTime,
    getComponentSourceActors: () => [ACTOR],
    resolveComponentForItem: (held) => componentById.get(held?.componentId) ?? null,
    getDismissedRunKeys: () => dismissed,
    getJournalActionAvailability: () => ({ available: true, reason: null }),
  });
}

function persistedRuntime(state) {
  const containers = buildLabRunStates({
    actor: ACTOR,
    userId: 'user-1',
    recipes: RECIPES,
    environments: ENVIRONMENTS,
    tasks: TASKS,
    journalCaseState: state,
  });
  const dismissed = new Set();
  const commands = [];
  let worldTime = 1_209_600;
  const builder = makeBuilder(containers, dismissed, () => worldTime);
  const services = {
    getWorldTime: () => worldTime,
    getWorldTimeComponents: () => ({ day: 15, hour: 0, minute: 0, secondsPerDay: 86_400 }),
    getSelectedActorId: () => ACTOR.id,
    listJournalForActor: async () => builder.buildListing({
      actor: ACTOR,
      viewer: { id: 'user-1', isGM: false },
    }),
    executeJournalRunCommand: async (command) => {
      commands.push(structuredClone(command));
      const run = containers.craftingRuns.active[command.runId];
      assert.ok(run, 'command targets a persisted active run');
      switch (command.action) {
        case 'setCompletionMode': {
          run.completionMode = command.payload.completionMode;
          run.runRevision += 1;
          break;
        }
        case 'setSelection': {
          assert.equal(command.payload.stepIndex, run.currentStepIndex);
          assert.ok(command.payload.selectionPlan, 'selection command carries its envelope');
          run.steps[run.currentStepIndex].selectionPlan = structuredClone(
            command.payload.selectionPlan
          );
          run.runRevision += 1;
          break;
        }
        case 'cancel':
        case 'execute': {
          delete containers.craftingRuns.active[run.id];
          run.status = command.action === 'cancel' ? 'cancelled' : 'succeeded';
          run.finishedAt = 1_209_600;
          containers.craftingRuns.history.unshift(run);
          break;
        }
      }
      return { success: true };
    },
    dismissJournalRun: async ({ runId, runType }) => {
      dismissed.add(JSON.stringify([ACTOR_UUID, runType, runId]));
      return { success: true };
    },
    notify: () => {},
    craftErrorMessage: () => 'Craft failed.',
  };
  return {
    containers,
    commands,
    services,
    dismissed,
    advanceWorldTime: (seconds) => (worldTime += seconds),
  };
}

let createJournalStore;

async function mountState(state) {
  const runtime = persistedRuntime(state);
  const store = createJournalStore({ services: runtime.services });
  await store.load();
  flushSync();
  const target = await harness.mount({
    services: {
      journal: store,
      actorBar: { selectedActorId: ACTOR.id },
      getWorldTimeComponents: runtime.services.getWorldTimeComponents,
    },
  });
  return { ...runtime, store, target };
}

function assertScrollContract(target) {
  for (const kind of ['active', 'finished']) {
    const section = target.querySelector(`[data-journal-list="${kind}"]`);
    const scroller = section?.querySelector('[data-journal-list-scroll]');
    const pager = section?.querySelector('.manager-pagination');
    assert.ok(section && scroller && pager, `${kind} has section, scroller, and pager`);
    assert.ok(!scroller.contains(pager), `${kind} pager stays outside its scroller`);
  }
}

function assertActionAlignment(target) {
  const header = target.querySelector('.journal-detail-header');
  const identity = header?.querySelector('.journal-detail-identity');
  const actions = header?.querySelector('[data-journal-actions]');
  assert.ok(header && identity && actions, 'identity and actions share the detail header');
}

function assertLockedStage(target) {
  const card = target.querySelector('[data-stage-card][data-stage-state="future"]');
  assert.ok(card, 'future stage is visible');
  assert.ok(!card.querySelector('button, input, select'), 'future stage exposes no editing control');
}

describe('Journal versioned lifecycle (mounted)', () => {
  before(async () => {
    await harness.setup();
    ({ createJournalStore } = await harness.loadRuneModule(
      'src/ui/svelte/stores/journalStore.svelte.js'
    ));
  });
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('pins every committed View Lab state to a persisted run identity', () => {
    assert.equal(LAB_JOURNAL_CASE_STATE_RUN_IDS['ready-single'], 'lab-v1-ready-single');
    assert.equal(LAB_JOURNAL_CASE_STATE_RUN_IDS['gathering-check'], 'lab-v1-gathering-check');
    assert.ok(Object.keys(LAB_JOURNAL_CASE_STATE_RUN_IDS).length >= 39);
    assert.equal(typeof buildLabRunStates, 'function');
    for (const [state, runId] of Object.entries(LAB_JOURNAL_CASE_STATE_RUN_IDS)) {
      if (!runId || ['legacy', 'redacted-owner'].includes(state)) continue;
      const containers = buildLabRunStates({
        actor: ACTOR,
        userId: 'user-1',
        recipes: RECIPES,
        environments: ENVIRONMENTS,
        tasks: TASKS,
        journalCaseState: state,
      });
      const runs = Object.values(containers).flatMap((container) => [
        ...Object.values(container.active),
        ...container.history,
      ]);
      assert.ok(runs.some((run) => run.id === runId), `${state} resolves ${runId}`);
    }
  });

  it('persists completion preference and completion through a rebuild of raw records', async () => {
    const { target, store, containers, advanceWorldTime } =
      await mountState('waiting-auto-eligible');
    const manual = target.querySelector(':scope [data-run-completion-switch] input[value="manual"]');
    assert.ok(manual, 'completion preference is actionable');
    manual.click();
    await new Promise((resolve) => setImmediate(resolve));
    flushSync();
    const persisted = containers.craftingRuns.active['lab-v1-waiting-auto-eligible'];
    assert.equal(persisted.completionMode, 'manual');
    assert.equal(store.selectedRun.completionMode, 'manual');

    advanceWorldTime(4 * 3600);
    await store.load(true);
    flushSync();
    target.querySelector('[data-run-action="primary"]').click();
    await new Promise((resolve) => setImmediate(resolve));
    flushSync();
    assert.ok(!containers.craftingRuns.active[persisted.id], 'active record moved to history');
    assert.ok(target.querySelector(`[data-history-run-id="${persisted.id}"]`));
  });

  it('persists an exact held-item choice through the versioned command envelope and reload', async () => {
    const { target, containers, commands } = await mountState('waiting-open-choice');
    target.querySelector(':scope [data-slot-id="metal"] button').click();
    flushSync();
    const copper = [...target.querySelectorAll('[data-choice-id]')].find((button) =>
      button.textContent.includes('copper stock')
    );
    assert.ok(copper, 'real held copper candidate is visible');
    copper.click();
    await new Promise((resolve) => setImmediate(resolve));
    flushSync();

    const persisted = containers.craftingRuns.active['lab-v1-waiting-open-choice'];
    assert.equal(persisted.steps[0].selectionPlan.ingredientOptionOverrides.metal.optionIndex, 1);
    assert.equal(
      persisted.steps[0].selectionPlan.ingredientOptionOverrides.metal.heldItemId,
      'Item.copper-a'
    );
    assert.equal(commands.at(-1).payload.stepIndex, 0);
    assert.match(target.querySelector('[data-slot-id="metal"]').textContent, /copper stock/);
  });

  it('keeps future stages inert and proves the lock assertion detects a control intrusion', async () => {
    const { target, commands } = await mountState('future-stage');
    target.querySelector('[data-stage-nav-index="2"]').click();
    flushSync();
    assertLockedStage(target);
    assert.equal(commands.length, 0);

    const card = target.querySelector('[data-stage-card][data-stage-state="future"]');
    const intrusion = document.createElement('button');
    card.appendChild(intrusion);
    assert.throws(() => assertLockedStage(target));
    intrusion.remove();
    assertLockedStage(target);
  });

  it('cancels and dismisses through persisted state rather than fixture-only labels', async () => {
    const cancelled = await mountState('cancel-confirmation');
    cancelled.target.querySelector('[data-run-action="cancel-arm"]').click();
    flushSync();
    assert.ok(cancelled.target.querySelector('[data-run-cancel-decision]'));
    cancelled.target.querySelector('[data-run-action="cancel-confirm"]').click();
    await new Promise((resolve) => setImmediate(resolve));
    flushSync();
    assert.ok(cancelled.target.querySelector('[data-history-run-id="lab-v1-cancel-confirmation"]'));

    harness.remount();
    const dismissed = await mountState('dismissal');
    dismissed.target.querySelector('[data-journal-dismiss]').click();
    await new Promise((resolve) => setImmediate(resolve));
    flushSync();
    assert.equal(dismissed.containers.craftingRuns.history.length, 1, 'history record remains');
    assert.ok(!dismissed.target.querySelector('[data-history-run-id="lab-v1-dismissal"]'));
  });

  it('guards independent scroll containment and detail action alignment with negative controls', async () => {
    const { target } = await mountState('active-page-two');
    assertScrollContract(target);
    assertActionAlignment(target);

    const active = target.querySelector('[data-journal-list="active"]');
    const activeScroller = active.querySelector('[data-journal-list-scroll]');
    const activePager = active.querySelector('.manager-pagination');
    activeScroller.appendChild(activePager);
    assert.throws(() => assertScrollContract(target));
    active.appendChild(activePager);
    assertScrollContract(target);

    const actions = target.querySelector('[data-journal-actions]');
    const detail = target.querySelector('[data-journal-detail]');
    detail.appendChild(actions);
    assert.throws(() => assertActionAlignment(target));
  });
});

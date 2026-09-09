import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { RunJournalBuilder } from '../../src/systems/RunJournalBuilder.js';
import { chooseSelectOption } from '../helpers/select-control.js';
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
  createLabJournalCaseController,
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
  gatheringCraftingCheck: {
    routed: {
      type: 'relative',
      rollFormula: '1d20',
      relativeOutcomes: [
        { id: 'standard-tier', name: 'Standard', success: true, dc: 0 },
        { id: 'failed-tier', name: 'Failed', success: false, dc: -10 },
      ],
    },
  },
  essenceDefinitions: [
    { id: 'earth', name: 'Earth', icon: 'fas fa-mountain', colorToken: 'earth' },
    { id: 'fire', name: 'Fire', icon: 'fas fa-fire', colorToken: 'fire' },
  ],
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
const SHORT_SET = ingredientSet('short-set', [
  { id: 'metal', name: 'Metal', options: [componentOption('iron', 'iron', 6)] },
]);
const ESSENCE_GROUPS = [
  {
    id: 'earth-group',
    name: 'Earth essence',
    options: [{ match: { type: 'essence', essenceId: 'earth', amount: 6 } }],
  },
  {
    id: 'fire-group',
    name: 'Fire essence',
    options: [{ match: { type: 'essence', essenceId: 'fire', amount: 3 } }],
  },
];
const ESSENCE_SET = {
  id: 'essence-set',
  name: 'Shared essence',
  ingredientGroups: ESSENCE_GROUPS,
  toJSON: () => ({
    id: 'essence-set',
    name: 'Shared essence',
    ingredientGroups: structuredClone(ESSENCE_GROUPS),
  }),
  resolveIngredientSelection(_items, _matcher, { essenceAllocation = {} } = {}) {
    const allocatedUnits = Math.max(0, Number(essenceAllocation?.['Item.iron-a']) || 0);
    const earth = allocatedUnits * 6;
    const fire = allocatedUnits * 3;
    return {
      success: earth >= 6 && fire >= 3,
      selectedIngredients: [],
      missingGroups: earth >= 6 && fire >= 3 ? [] : ESSENCE_GROUPS,
      essencePool: {
        requirements: [
          { groupId: 'earth-group', essenceId: 'earth', need: 6, delivered: earth, owned: 18, satisfied: earth >= 6 },
          { groupId: 'fire-group', essenceId: 'fire', need: 3, delivered: fire, owned: 9, satisfied: fire >= 3 },
        ],
        carriers: [
          {
            itemKey: 'Item.iron-a',
            item: ACTOR.items[0],
            perUnit: { earth: 6, fire: 3 },
            ownedUnits: 3,
            allocatedUnits,
          },
        ],
        allocation: structuredClone(essenceAllocation),
        suggested: { 'Item.iron-a': 1 },
        totals: { earth, fire },
      },
    };
  },
};
const RECIPES = [
  recipe('sm-r-horseshoe', 'Bend Horseshoe', [FIXED_SET]),
  recipe('sm-r-quenchoil', 'Quench in Fire-Bearing Stock', [CHOICE_SET]),
  recipe('sm-r-pattern-blade', 'Forge Pattern Blade', [FIXED_SET], 3),
  recipe('sm-r-chainmail', 'Rivet Chainmail', [SHORT_SET]),
  recipe('jw-r-cast', 'Cast Jewellery', [FIXED_SET]),
  recipe('rw-r-blade', 'Inscribe Runeblade', [FIXED_SET]),
  recipe('sm-r-deepbind', 'Deepbind Ingot', [ESSENCE_SET]),
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
  const notifications = [];
  let worldTime = 1_209_600;
  const builder = makeBuilder(containers, dismissed, () => worldTime);
  const controller = createLabJournalCaseController({
    actor: ACTOR,
    containers,
    state,
    recipes: RECIPES,
    nowWorldTime: () => worldTime,
  });
  const services = {
    getWorldTime: () => worldTime,
    getWorldTimeComponents: () => ({ day: 15, hour: 0, minute: 0, secondsPerDay: 86_400 }),
    getSelectedActorId: () => ACTOR.id,
    listJournalForActor: async () => builder.buildListing({
      actor: ACTOR,
      viewer: { id: 'user-1', isGM: false },
    }),
    executeJournalRunCommand: controller.execute,
    dismissJournalRun: async ({ runId, runType }) => {
      dismissed.add(JSON.stringify([ACTOR_UUID, runType, runId]));
      return { success: true };
    },
    notify: (message) => {
      notifications.push(message);
    },
    craftErrorMessage: () => 'Craft failed.',
  };
  return {
    containers,
    commands: controller.events,
    notifications,
    services,
    dismissed,
    advanceWorldTime: (seconds) => (worldTime += seconds),
  };
}

let createJournalStore;

async function mountState(state, { prepare = null, initialLoad = true } = {}) {
  const runtime = persistedRuntime(state);
  prepare?.(runtime);
  const store = createJournalStore({ services: runtime.services });
  if (initialLoad) await store.load();
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

async function settleAction() {
  await new Promise((resolve) => setImmediate(resolve));
  flushSync();
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

    const automatic = buildLabRunStates({
      actor: ACTOR,
      userId: 'user-1',
      recipes: RECIPES,
      environments: ENVIRONMENTS,
      tasks: TASKS,
      journalCaseState: 'automatic-completion',
    });
    assert.equal(Object.keys(automatic.craftingRuns.active).length, 0);
    assert.equal(automatic.craftingRuns.history[0].completionMode, 'worldTime');
    const gathering = buildLabRunStates({
      actor: ACTOR,
      userId: 'user-1',
      recipes: RECIPES,
      environments: ENVIRONMENTS,
      tasks: TASKS,
      journalCaseState: 'gathering-d100',
    });
    assert.equal(gathering.gatheringRuns.history.length, 0);
    assert.equal(gathering.gatheringRuns.active['lab-v1-gathering-d100'].status, 'waitingTime');
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

  it('pauses, advances world time, and resumes with a re-anchored persisted gate', async () => {
    const paused = await mountState('waiting-auto-eligible');
    const run = paused.containers.craftingRuns.active['lab-v1-waiting-auto-eligible'];
    paused.target.querySelector('[data-run-action="pause"]').click();
    await settleAction();
    assert.equal(run.pauseState.remainingSeconds, 3 * 3600);
    assert.ok(paused.target.querySelector('[data-journal-paused="true"]'));

    paused.advanceWorldTime(2 * 3600);
    paused.target.querySelector('[data-run-action="resume"]').click();
    await settleAction();
    assert.equal(run.pauseState, undefined);
    assert.equal(run.pausedDurationSeconds, 2 * 3600);
    assert.equal(run.steps[0].timeGate.availableAt, 1_209_600 + 5 * 3600);
    assert.equal(paused.store.selectedRun.derivedStatus, 'waiting');
  });

  it('keeps paging independent, retains off-page detail, and filters through real controls', async () => {
    const paging = await mountState('active-page-two');
    const firstCard = paging.target.querySelector(
      ':scope [data-journal-list="active"] [data-run-id]'
    );
    firstCard.click();
    flushSync();
    const selectedKey = paging.store.selectedRun.key;
    const selectedId = paging.store.selectedRun.id;

    paging.target
      .querySelector(':scope [data-journal-list="active"] [data-pagination-next]')
      .click();
    flushSync();
    assert.equal(paging.store.activePage, 1);
    assert.equal(paging.store.historyPage, 0);
    assert.equal(paging.store.selectedRun.key, selectedKey);
    assert.equal(paging.target.querySelector('[data-journal-detail]').dataset.runKey, selectedKey);
    assert.ok(
      !paging.target.querySelector(
        `:scope [data-journal-list="active"] [data-run-id="${selectedId}"]`
      )
    );

    paging.target
      .querySelector(':scope [data-journal-list="finished"] [data-pagination-next]')
      .click();
    flushSync();
    assert.equal(paging.store.activePage, 1);
    assert.equal(paging.store.historyPage, 1);

    harness.remount();
    const filtered = await mountState('filter-paused');
    filtered.target
      .querySelector(':scope [data-journal-status-filter] input[value="paused"]')
      .click();
    flushSync();
    assert.deepEqual(filtered.store.activeCounts, { all: 2, ready: 1, waiting: 0, paused: 1 });
    assert.equal(filtered.target.querySelectorAll('[data-run-id]').length, 1);
    assert.equal(filtered.target.querySelector('[data-run-id]').dataset.runStatus, 'paused');

    const retainedKey = filtered.store.selectedRun.key;
    const search = filtered.target.querySelector(':scope [data-journal-search] input');
    search.value = 'no journal run has this name';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    assert.equal(filtered.target.querySelectorAll('[data-run-id]').length, 0);
    assert.equal(filtered.store.selectedRun.key, retainedKey);
    assert.equal(filtered.target.querySelector('[data-journal-detail]').dataset.runKey, retainedKey);

    harness.remount();
    const salvage = await mountState('salvage');
    chooseSelectOption(salvage.target, '[data-journal-kind-filter]', 'salvage');
    assert.equal(salvage.store.kindFilter, 'salvage');
    assert.ok(salvage.target.querySelector('[data-history-run-id="lab-v1-salvage"]'));
  });

  it('persists one shared essence carrier and redraws both requirement totals', async () => {
    const essence = await mountState('essence-shared');
    const source = essence.target.querySelector('[data-essence-source="Item.iron-a"]');
    assert.ok(source, 'the authored dual-essence carrier is visible');
    source.querySelector('[data-stepper-increment]').click();
    await settleAction();

    const run = essence.containers.craftingRuns.active['lab-v1-essence-shared'];
    assert.equal(
      run.steps[0].selectionPlan.ingredientEssenceAllocation.allocation['Item.iron-a'],
      1
    );
    assert.match(essence.target.querySelector('[data-essence-total="earth"]').textContent, /6 \/ 6/);
    assert.match(essence.target.querySelector('[data-essence-total="fire"]').textContent, /3 \/ 3/);
  });

  it('collects all three gathering modes from active previews into actual history evidence', async () => {
    const cases = [
      ['gathering-straight', 'straight'],
      ['gathering-d100', 'd100'],
      ['gathering-check', 'routed'],
    ];
    for (const [state, mode] of cases) {
      const mounted = await mountState(state);
      const runId = LAB_JOURNAL_CASE_STATE_RUN_IDS[state];
      assert.equal(mounted.store.selectedRun.gatheringYield.mode, mode);
      if (mode === 'routed') assert.ok(mounted.target.querySelector('[data-outcome-ladder]'));
      else assert.ok(mounted.target.querySelector('[data-yield-scale]'));
      assert.equal(mounted.target.querySelectorAll('[data-yield-cut]').length, 0);

      mounted.target.querySelector('[data-run-action="primary"]').click();
      await settleAction();
      assert.ok(!mounted.containers.gatheringRuns.active[runId]);
      assert.ok(mounted.target.querySelector(`[data-history-run-id="${runId}"]`));
      assert.ok(mounted.store.selectedRun.createdResults.length > 0);
      if (mode === 'straight') assert.equal(mounted.store.selectedRun.gatheringYield.roll, null);
      if (mode === 'd100') {
        assert.equal(mounted.store.selectedRun.gatheringYield.roll, 63);
        assert.equal(mounted.target.querySelectorAll('[data-yield-cut]').length, 1);
      }
      if (mode === 'routed') {
        assert.equal(mounted.store.selectedRun.gatheringYield.tiers.length, 2);
        assert.equal(mounted.store.selectedRun.createdResults[0].componentId, 'iron');
      }
      harness.remount();
    }
  });

  it('retries a failed load and clears busy state for each named command refusal', async () => {
    let attempts = 0;
    const retry = await mountState('error-retry', {
      initialLoad: false,
      prepare(runtime) {
        const list = runtime.services.listJournalForActor;
        runtime.services.listJournalForActor = (...args) => {
          attempts += 1;
          if (attempts === 1) return Promise.reject(new Error('fixture load failure'));
          return list(...args);
        };
      },
    });
    await settleAction();
    assert.ok(retry.target.querySelector('[data-journal-state="error"]'));
    retry.target.querySelector('[data-notice-action]').click();
    await settleAction();
    assert.ok(retry.target.querySelector('[data-journal-state="populated"]'));
    assert.equal(attempts, 2);

    for (const [state, reason] of [
      ['stale-action', 'stale-run'],
      ['command-timeout', 'command-timeout'],
      ['automatic-blocker', 'selection-required'],
    ]) {
      harness.remount();
      const refused = await mountState(state);
      const runId = LAB_JOURNAL_CASE_STATE_RUN_IDS[state];
      refused.target.querySelector('[data-run-action="primary"]').click();
      flushSync();
      if (state === 'command-timeout') {
        assert.equal(
          refused.target.querySelector('[data-run-action-bar]').getAttribute('aria-busy'),
          'true'
        );
        await new Promise((resolve) => setTimeout(resolve, 35));
        flushSync();
      } else await settleAction();
      assert.ok(refused.containers.craftingRuns.active[runId]);
      assert.equal(refused.store.busyRunKey, '');
      assert.match(refused.notifications.at(-1), new RegExp(reason));
      assert.equal(refused.commands.at(-1).action, 'execute');
    }

    harness.remount();
    const cancelled = await mountState('roll-cancelled');
    const runId = LAB_JOURNAL_CASE_STATE_RUN_IDS['roll-cancelled'];
    cancelled.target.querySelector('[data-run-action="primary"]').click();
    await settleAction();
    assert.ok(cancelled.containers.craftingRuns.active[runId]);
    assert.equal(cancelled.store.busyRunKey, '');
    assert.equal(cancelled.notifications.length, 0);
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

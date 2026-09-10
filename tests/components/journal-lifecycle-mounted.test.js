import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { RunJournalBuilder } from '../../src/systems/RunJournalBuilder.js';
import { ResolutionModeService } from '../../src/systems/ResolutionModeService.js';
import { IngredientSet } from '../../src/models/IngredientSet.js';
import { Recipe } from '../../src/models/Recipe.js';
import english from '../../lang/en.json' with { type: 'json' };
import { getCaseById } from '../../scripts/lib/viewLabCases.js';
import { chooseSelectOption } from '../helpers/select-control.js';
import {
  PLAYER_APP_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import {
  buildLabContent,
  LAB_SYSTEM_IDS,
  seedJournalNoCheckFixture,
} from '../view-lab/world/labContent.js';
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
    'src/ui/svelte/components/ManagerSearchField.svelte',
    component('Pagination'),
    'src/ui/svelte/components/IconButton.svelte',
    component('ManagerButton'),
    'src/ui/svelte/components/InspectorCard.svelte',
    component('RunActionBar'),
    component('SlotTile'),
    component('ChoiceOptionList'),
    component('SlotRow'),
    'src/ui/svelte/components/Stepper.svelte',
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
  return new IngredientSet({ id, name: id, ingredientGroups: groups });
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
  recipe('al-r-fire', 'Distil Firebomb', [FIXED_SET]),
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

function makeBuilder(containers, dismissed, nowWorldTime, {
  recipes = RECIPES, system = SYSTEM, visible = true, authority = { available: true, reason: null },
  resolveItemEssences = null,
} = {}) {
  const recipeById = new Map(recipes.map((entry) => [entry.id, entry]));
  const componentById = new Map(system.components.map((entry) => [entry.id, entry]));
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
    resolutionModeService: new ResolutionModeService({ getSystem: () => system }),
    recipeVisibility: { evaluateRecipeAccess: () => ({ visible }) },
    getSystem: () => system,
    getComponent: (_systemId, id) => componentById.get(id) ?? null,
    getViewer: () => ({ id: 'user-1', isGM: false }),
    nowWorldTime,
    resolveItemEssences,
    getComponentSourceActors: () => [ACTOR],
    resolveComponentForItem: (held) => componentById.get(held?.componentId) ?? null,
    getDismissedRunKeys: () => dismissed,
    getJournalActionAvailability: () => authority,
  });
}

function persistedRuntime(state, builderOptions) {
  const recipes = builderOptions?.recipes ?? RECIPES;
  const containers = buildLabRunStates({
    actor: ACTOR,
    userId: 'user-1',
    recipes,
    environments: ENVIRONMENTS,
    tasks: TASKS,
    journalCaseState: state,
  });
  const dismissed = new Set();
  const notifications = [];
  let worldTime = 1_209_600;
  const builder = makeBuilder(containers, dismissed, () => worldTime, builderOptions);
  const controller = createLabJournalCaseController({
    actor: ACTOR,
    containers,
    state,
    recipes,
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

async function mountState(state, { prepare = null, initialLoad = true, builderOptions } = {}) {
  const runtime = persistedRuntime(state, builderOptions);
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

function selectionFixture(sets, plan, { mode = 'simple' } = {}) {
  const authored = recipe('sm-r-horseshoe', 'Selection trial', sets);
  authored.getExecutionSteps()[0].resultGroups = sets.map((set, index) => ({
    id: set.resultGroupId, name: set.name,
    results: [{ id: `yield-${index}`, componentId: index === 0 ? 'iron' : 'copper', quantity: index + 1 }],
  }));
  return {
    builderOptions: { recipes: [authored], system: { ...SYSTEM, resolutionMode: mode } },
    prepare({ containers }) {
      const run = containers.craftingRuns.active['lab-v1-ready-single'];
      run.currentStepIndex = 0;
      run.steps = [{ stepId: authored.getExecutionSteps()[0].id, status: 'inProgress', selectionPlan: plan }];
    },
  };
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

function craftingPreviewFixture(mode, checkMode = 'none') {
  const system = structuredClone(SYSTEM);
  system.resolutionMode = mode;
  system.alchemy = { checkMode };
  system.craftingCheck = {
    failureResultPolicy: 'never',
    simple: { rollFormula: checkMode === 'simple' ? '1d20' : '', dc: 12 },
    routed: {
      type: 'fixed',
      fixedOutcomes: [
        { id: 'failed', name: 'Setback', success: false, start: 1, end: 9 },
        { id: 'fine', name: 'Fine', success: true, start: 10, end: 20 },
      ],
    },
    progressive: { rollFormula: '2d6', awardMode: 'partial' },
  };
  system.components[0].difficulty = 2;
  system.components[1].difficulty = 5;
  const authored = recipe('sm-r-horseshoe', 'Yield trial', [FIXED_SET], 3);
  const groups = [
    { id: 'fine-results', name: 'Fine', checkOutcomeIds: ['fine'], results: [
      { id: 'iron-result', componentId: 'iron', quantity: 2 },
      { id: 'copper-result', componentId: 'copper', quantity: 3 },
    ] },
  ];
  if (mode === 'routedByIngredients') groups.push({
    id: 'other-route', name: 'Other route', results: [{ id: 'other', componentId: 'horseshoe', quantity: 9 }],
  });
  for (const step of authored.steps) step.resultGroups = groups;
  return {
    builderOptions: { system, recipes: [authored] },
    prepare({ containers }) {
      const run = containers.craftingRuns.active['lab-v1-ready-single'];
      run.currentStepIndex = 1;
      run.steps = authored.steps.map((step, index) => ({
        stepId: step.id, stepName: step.name,
        status: index === 0 ? 'succeeded' : 'inProgress',
        selectionPlan: { selectedIngredientSetId: 'fixed-set' },
        selectedRequirementSnapshot: { id: 'fixed-set', resultGroupId: 'fine-results' },
      }));
    },
  };
}

describe('Journal versioned lifecycle (mounted)', () => {
  before(async () => {
    await harness.setup();
    globalThis.game.i18n.localize = (key) =>
      key.split('.').reduce((value, part) => value?.[part], english) ?? key;
    globalThis.game.i18n.format = (key, data) =>
      globalThis.game.i18n.localize(key).replace(/\{(\w+)\}/g, (match, name) => data[name] ?? match);
    ({ createJournalStore } = await harness.loadRuneModule(
      'src/ui/svelte/stores/journalStore.svelte.js'
    ));
  });
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('changes the ingredient route through the real store and resets scoped intent and yields', async () => {
    const first = ingredientSet('route-a', [{ id: 'a', options: [componentOption('iron', 'iron')] }]);
    const second = ingredientSet('route-b', [{ id: 'b', options: [componentOption('copper', 'copper')] }]);
    first.resultGroupId = 'a-results';
    second.resultGroupId = 'b-results';
    const mounted = await mountState('ready-single', selectionFixture([first, second], {
      selectedIngredientSetId: first.id,
      ingredientOptionOverrides: { a: { optionIndex: 0, heldItemId: 'Item.iron-a' } },
      ingredientEssenceAllocation: { stepId: 'old', ingredientSetId: first.id, allocation: { old: 2 } },
    }, { mode: 'routedByIngredients' }));
    assert.ok(mounted.target.querySelector('[data-slot-id="a"]'));
    assert.match(mounted.target.querySelector('[data-journal-crafting-yield]').textContent, /Iron/);
    await chooseSelectOption(mounted.target, '[data-journal-route]', second.id);
    await settleAction();
    assert.ok(mounted.target.querySelector('[data-slot-id="b"]'));
    assert.ok(!mounted.target.querySelector('[data-slot-id="a"]'));
    assert.match(mounted.target.querySelector('[data-journal-crafting-yield]').textContent, /Copper/);
    const saved = mounted.containers.craftingRuns.active['lab-v1-ready-single'].steps[0].selectionPlan;
    assert.deepEqual(saved.ingredientOptionOverrides, {});
    assert.deepEqual(saved.ingredientEssenceAllocation.allocation, {});
    assert.equal(saved.ingredientEssenceAllocation.ingredientSetId, second.id);
  });

  it('requires explicit repair when a removed ingredient route leaves only one route', async () => {
    const remaining = ingredientSet('remaining', [{ id: 'metal', options: [componentOption('iron', 'iron')] }]);
    const mounted = await mountState('ready-single', selectionFixture([remaining], { selectedIngredientSetId: 'removed' }, { mode: 'routedByIngredients' }));
    assert.equal(mounted.store.selectedRun.currentStep.selectionAvailability.success, false);
    assert.equal(mounted.store.selectedRun.craftingYield, null);
    assert.ok(!mounted.target.querySelector('[data-slot-id="metal"]'));
    await chooseSelectOption(mounted.target, '[data-journal-route]', 'remaining');
    await settleAction();
    assert.ok(mounted.target.querySelector('[data-slot-id="metal"]'));
  });

  it('offers explicit option repair even when removal leaves a single candidate', async () => {
    const remaining = ingredientSet('remaining', [{ id: 'metal', options: [componentOption('iron', 'iron')] }]);
    const mounted = await mountState('ready-single', selectionFixture([remaining], {
      selectedIngredientSetId: remaining.id, ingredientOptionOverrides: { metal: { optionIndex: 1 } },
    }));
    assert.match(mounted.target.textContent, /no longer available/i);
    mounted.target.querySelector('[data-slot-id="metal"] button').click();
    await settleAction();
    const candidate = mounted.target.querySelector('[data-choice-id]');
    assert.equal(candidate.disabled, false);
    candidate.click();
    await settleAction();
    assert.equal(mounted.containers.craftingRuns.active['lab-v1-ready-single'].steps[0].selectionPlan.ingredientOptionOverrides.metal.optionIndex, 0);
  });

  it('states each option quantity and disables candidates that conflict with shared fixed stock', async () => {
    const set = ingredientSet('mixed', [
      { id: 'choice', options: [componentOption('large', 'iron', 3), componentOption('small', 'copper', 1)] },
      { id: 'fixed', options: [componentOption('reserved', 'iron', 1)] },
    ]);
    const mounted = await mountState('ready-single', selectionFixture([set], {
      selectedIngredientSetId: set.id, ingredientOptionOverrides: { choice: { optionIndex: 0 } },
    }));
    mounted.target.querySelector('[data-slot-id="choice"] button').click();
    await settleAction();
    const options = [...mounted.target.querySelectorAll('[data-choice-id]')];
    const large = options.find((option) => option.textContent.includes('iron stock'));
    const small = options.find((option) => option.textContent.includes('copper stock'));
    assert.match(large.textContent, /3 held · needs 3/);
    assert.equal(large.disabled, true, 'the candidate would leave the fixed iron group short');
    assert.match(small.textContent, /2 held · needs 1/);
    assert.equal(small.disabled, false, 'the smaller alternate uses its own required amount');
    small.click();
    await settleAction();
    assert.equal(mounted.store.selectedRun.currentStep.selectionAvailability.success, true);
  });

  it('keeps unsupported lifecycle controls disabled despite legacy-looking manual fields', async () => {
    const mounted = await mountState('unsupported-version');
    const primary = mounted.target.querySelector('[data-run-action="primary"]');
    assert.equal(primary.disabled, true);
    primary.click();
    assert.equal(mounted.commands.length, 0);
  });

  it('tests a held candidate against the same stock reserved for the essence allocation', async () => {
    const set = ingredientSet('shared', [
      { id: 'choice', options: [componentOption('iron', 'iron', 3), componentOption('copper', 'copper', 1)] },
      { id: 'fire', options: [{ match: { type: 'essence', essenceId: 'fire', amount: 2 } }] },
    ]);
    const fixture = selectionFixture([set], {
      selectedIngredientSetId: set.id,
      ingredientOptionOverrides: { choice: { optionIndex: 1 } },
      ingredientEssenceAllocation: {
        stepId: 'sm-r-horseshoe-step-1', ingredientSetId: set.id, allocation: { 'Item.iron-a': 1 },
      },
    });
    fixture.builderOptions.resolveItemEssences = ({ item }) => item.componentId === 'iron' ? { fire: 2 } : {};
    const mounted = await mountState('ready-single', fixture);
    mounted.target.querySelector('[data-slot-id="choice"] button').click();
    await settleAction();
    const options = [...mounted.target.querySelectorAll('[data-choice-id]')];
    assert.equal(options.find((entry) => entry.textContent.includes('iron stock')).disabled, true);
    assert.equal(options.find((entry) => entry.textContent.includes('copper stock')).disabled, false);
    assert.equal(mounted.store.selectedRun.currentStep.selectionAvailability.success, true);
  });

  it('states confirmed receipt rows, uncertainty and unstarted effects with strict redaction', async () => {
    for (const visible of [true, false]) {
      const mounted = await mountState('recovery-required', {
        builderOptions: { visible },
        prepare({ containers }) {
          containers.craftingRuns.active['lab-v1-recovery-required'].executionJournal = {
            status: 'recoveryRequired', effects: [
              { kind: 'consumeIngredients', phase: 'applied', receipt: {
                items: [{ name: 'Recorded iron', quantity: 2 }], private: 'PRIVATE_CANARY',
              } },
              { kind: 'awardResults', phase: 'applying', receipt: { results: [{ name: 'UNCERTAIN_CANARY', quantity: 1 }] } },
              { kind: 'postCraftChat', phase: 'planned' },
            ],
          };
        },
      });
      const evidence = mounted.target.querySelector('[data-journal-recovery-evidence]');
      assert.ok(evidence);
      assert.match(evidence.textContent, /Confirmed.*Uncertain.*Not started/s);
      assert.equal(evidence.textContent.includes('Recorded iron'), visible);
      assert.doesNotMatch(evidence.textContent, /PRIVATE_CANARY|UNCERTAIN_CANARY/);
      harness.remount();
    }
  });

  it('does not mark the unexecuted tail of a cancelled run completed', async () => {
    const mounted = await mountState('finished-cancelled');
    assert.ok(mounted.target.querySelector('[data-stage-state="unexecuted"]'));
    assert.ok(!mounted.target.querySelector('[data-stage-card] .is-complete'));
    const tracks = [...mounted.target.querySelectorAll('[data-stage-progress-state]')];
    assert.equal(tracks.filter((track) => track.dataset.stageProgressState === 'success').length, 1);
  });

  it('matches terminal and past-stage capture assertions against the emitted application DOM', async () => {
    const previousFoundry = globalThis.foundry;
    let fixtureId = 0;
    let recipes;
    try {
      globalThis.foundry = { utils: { randomID: () => `receipt-fixture-${++fixtureId}` } };
      recipes = buildLabContent().recipes.map((entry) => new Recipe(entry));
    } finally {
      globalThis.foundry = previousFoundry;
    }
    for (const state of ['past-stage', 'finished-success', 'finished-failure', 'finished-cancelled', 'automatic-completion', 'salvage']) {
      const capture = getCaseById(`fabricate-journal-lifecycle-${state}`);
      const mounted = await mountState(capture.query.journalCaseState, { builderOptions: { recipes } });
      for (const action of capture.steps ?? []) {
        const control = mounted.target.querySelector(action.selector);
        assert.ok(control, `${state} emits ${action.selector}`);
        control.click();
        await settleAction();
      }
      assert.ok(mounted.target.querySelector(capture.expectSelector), `${state} satisfies its real capture assertion: ${JSON.stringify({ steps: mounted.store.selectedRun.steps.map((step) => [step.status, step.consumedIngredients]), viewed: mounted.store.viewedStageIndex })}`);
      harness.remount();
    }
  });

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

  it('authors ready-single as a real formula-less simple craft', async () => {
    const content = buildLabContent();
    const smithing = content.systems.find((entry) => entry.id === LAB_SYSTEM_IDS.SMITHING);
    assert.match(smithing.craftingCheck.simple.rollFormula, /1d20/);

    seedJournalNoCheckFixture(content);
    assert.equal(smithing.craftingCheck.enabled, false);
    assert.equal(smithing.craftingCheck.simple.rollFormula, '');
    assert.ok(content.recipes.some((entry) => entry.id === 'sm-r-horseshoe'));

    const { target, store } = await mountState('ready-single');
    assert.equal(store.selectedRun.recipeId, 'sm-r-horseshoe');
    assert.equal(store.selectedRun.currentStep.detail.checkLabel, null);
    assert.doesNotMatch(target.textContent, /1d20/);
  });

  it('renders real-builder crafting previews only for the viewed current stage across resolution modes', async () => {
    for (const [mode, checkMode, presentation] of [
      ['simple', 'none', 'entries'], ['simple', 'simple', 'entries'],
      ['routedByIngredients', 'none', 'entries'], ['routedByCheck', 'none', 'tiers'],
      ['progressive', 'none', 'progressive'], ['alchemy', 'none', 'entries'],
      ['alchemy', 'tiered', 'tiers'],
    ]) {
      const mounted = await mountState('ready-single', craftingPreviewFixture(mode, checkMode));
      assert.equal(mounted.store.selectedRun.craftingYield.presentation, presentation);
      const preview = mounted.target.querySelector('[data-journal-crafting-yield]');
      assert.ok(preview, `${mode}/${checkMode} has a visible preview`);
      assert.match(preview.textContent, /Iron/);
      assert.doesNotMatch(preview.textContent, /Received|Awarded|100%|Horseshoe/);
      assert.equal(preview.querySelectorAll('[data-yield-cut]').length, 0);
      if (presentation === 'tiers') {
        assert.match(preview.textContent, /Setback/);
        assert.match(preview.textContent, /No items/);
        assert.ok(preview.querySelector('[data-outcome-ladder]'));
      } else if (presentation === 'progressive') {
        assert.ok(!preview.querySelector('[data-outcome-ladder], [data-yield-scale]'));
        assert.match(preview.textContent, /budget/i);
        assert.match(preview.textContent, /2/);
        assert.match(preview.textContent, /5/);
        assert.ok(preview.textContent.indexOf('Iron') < preview.textContent.indexOf('Copper'));
      }
      assert.ok(!preview.querySelector('button, input'), 'previews are read-only');
      for (const index of [0, 2]) {
        mounted.target.querySelector(`[data-stage-nav-index="${index}"]`).click();
        flushSync();
        assert.ok(!mounted.target.querySelector('[data-journal-crafting-yield]'), `stage ${index} has no current preview`);
      }
      mounted.target.querySelector('[data-stage-nav-return]').click();
      flushSync();
      assert.ok(mounted.target.querySelector('[data-journal-crafting-yield]'));
      harness.remount();
    }
  });

  it('keeps terminal awards immutable and suppresses previews when recipe access is redacted', async () => {
    const fixture = craftingPreviewFixture('simple');
    const mounted = await mountState('ready-single', fixture);
    const run = mounted.containers.craftingRuns.active['lab-v1-ready-single'];
    run.status = 'succeeded';
    run.currentStepIndex = null;
    run.steps[2].createdResults = [
      { componentId: 'horseshoe', name: 'Recorded Horseshoe', quantity: 1 },
      { componentId: 'iron', name: 'Refused award', quantity: 0 },
    ];
    mounted.containers.craftingRuns.history.push(run);
    delete mounted.containers.craftingRuns.active[run.id];
    await mounted.store.load(true);
    flushSync();
    assert.ok(!mounted.target.querySelector('[data-journal-crafting-yield]'));
    assert.equal(mounted.target.querySelector('[data-stage-nav-index="2"]').getAttribute('aria-pressed'), 'true');
    assert.ok(!mounted.target.querySelector('[data-stage-nav-return]'));
    mounted.target.querySelector('[data-stage-nav-index="0"]').click();
    flushSync();
    const returnFinal = mounted.target.querySelector('[data-stage-nav-return]');
    assert.match(returnFinal.textContent, /final stage 3/);
    returnFinal.click();
    flushSync();
    assert.equal(mounted.store.viewedStageIndex, 2);
    assert.equal(run.currentStepIndex, null, 'browsing history never changes execution state');
    const awards = mounted.target.querySelector('[data-yield-scale]');
    assert.match(awards.textContent, /Recorded Horseshoe/);
    assert.match(awards.textContent, /×0/);
    fixture.builderOptions.system.components[2].name = 'Changed live component';
    fixture.builderOptions.recipes[0].steps[2].resultGroups[0].results[0].quantity = 99;
    await mounted.store.load(true);
    flushSync();
    assert.doesNotMatch(awards.textContent, /Changed live component|99/);
    assert.equal(run.steps[2].createdResults[0].quantity, 1);
    harness.remount();

    const hidden = await mountState('ready-single', {
      ...fixture, builderOptions: { ...fixture.builderOptions, visible: false },
    });
    assert.equal(hidden.store.selectedRun.redacted, true);
    assert.ok(!hidden.target.querySelector('[data-journal-crafting-yield], [data-yield-scale], [data-outcome-ladder]'));
    assert.doesNotMatch(hidden.target.textContent, /Yield trial|Iron|Copper/);
  });

  it('uses actual authority refusal reasons even while a time gate is pending', async () => {
    for (const [reason, key] of [
      ['ledger-missing', 'LedgerMissing'], ['ledger-ambiguous', 'LedgerAmbiguous'],
      ['active-gm-missing', 'AuthorityUnavailable'], ['active-gm-required', 'ActiveGmRequired'],
      ['recovery-required', 'RecoveryRequired'], ['claim-held', 'ClaimHeld'],
      ['claim-release-failed', 'ClaimReleaseFailed'], ['secure-random-unavailable', 'SecureRandomUnavailable'],
    ]) {
      const mounted = await mountState('waiting-auto-eligible', {
        builderOptions: { authority: { available: false, reason } },
      });
      assert.equal(mounted.store.selectedRun.actions.disabledReason, reason);
      assert.equal(mounted.target.querySelector('[data-run-action="primary"]').title, english.FABRICATE.App.Journal.Actions[key]);
      assert.doesNotMatch(mounted.target.querySelector('[data-journal-actions]').textContent, /must own/);
      harness.remount();
    }
  });

  it('labels an executing run as in progress rather than blaming ownership', async () => {
    const mounted = await mountState('ready-single', {
      prepare({ containers }) {
        containers.craftingRuns.active['lab-v1-ready-single'].executionJournal = {
          status: 'planned', effects: [],
        };
      },
    });
    assert.equal(mounted.store.selectedRun.actions.disabledReason, 'executionInProgress');
    assert.equal(mounted.target.querySelector('[data-run-action="primary"]').title, english.FABRICATE.App.Journal.Actions.ExecutionInProgress);
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

  it('marks the effective initial selection and the fallback after its actual removal', async () => {
    const mounted = await mountState('filter-paused');
    const selectedId = mounted.store.selectedRun.id;
    assert.equal(mounted.target.querySelector(`[data-run-id="${selectedId}"]`).getAttribute('aria-pressed'), 'true');
    mounted.store.select(mounted.store.selectedRun);
    delete mounted.containers.craftingRuns.active[selectedId];
    await mounted.store.load(true);
    flushSync();
    assert.notEqual(mounted.store.selectedRun.id, selectedId);
    assert.equal(mounted.target.querySelector(`[data-run-id="${mounted.store.selectedRun.id}"]`).getAttribute('aria-pressed'), 'true');
  });

  it('keeps a missing selected held item unfilled until an explicit replacement is chosen', async () => {
    const mounted = await mountState('waiting-open-choice', {
      prepare({ containers }) {
        containers.craftingRuns.active['lab-v1-waiting-open-choice'].steps[0].selectionPlan.ingredientOptionOverrides = {
          metal: { optionIndex: 0, heldItemId: 'Item.removed-stock' },
        };
      },
    });
    const slot = mounted.target.querySelector('[data-slot-id="metal"]');
    assert.equal(mounted.store.selectedRun.currentStep.selectionAvailability.success, false);
    assert.doesNotMatch(slot.textContent, /iron stock/);
    slot.querySelector('button').click();
    flushSync();
    assert.ok(!mounted.target.querySelector('[data-choice-id][aria-pressed="true"]'));
    const iron = [...mounted.target.querySelectorAll('[data-choice-id]')].find((entry) => entry.textContent.includes('iron stock'));
    iron.click();
    await settleAction();
    assert.match(mounted.target.querySelector('[data-slot-id="metal"]').textContent, /iron stock/);
    assert.equal(mounted.commands.at(-1).payload.selectionPlan.ingredientOptionOverrides.metal.heldItemId, 'Item.iron-a');
  });

  it('disables choices and essence while a selection command is pending and discards refused optimism', async () => {
    for (const [state, accepted] of [
      ['waiting-open-choice', true], ['essence-shared', true], ['essence-shared', false],
    ]) {
      let finish;
      let submitted;
      let submissions = 0;
      const mounted = await mountState(state, {
        prepare({ services }) {
          const execute = services.executeJournalRunCommand;
          services.executeJournalRunCommand = (command) => {
            submitted = command;
            submissions += 1;
            return new Promise((resolve) => { finish = resolve; }).then(() =>
              accepted ? execute(command) : { success: false, message: 'selection refused' }
            );
          };
        },
      });
      let control;
      if (state === 'waiting-open-choice') {
        mounted.target.querySelector('[data-slot-id="metal"] button').click();
        flushSync();
        control = mounted.target.querySelector('[data-choice-id]');
      } else control = mounted.target.querySelector('[data-stepper-increment]');
      control.click();
      control.click();
      flushSync();
      assert.ok(mounted.store.busyRunKey);
      const controls = mounted.target.querySelectorAll('[data-journal-stage-details] button, [data-journal-stage-details] input');
      assert.ok(controls.length > 0);
      assert.ok([...controls].every((control) => control.disabled), 'all visible material controls are disabled');
      for (const control of controls) control.click();
      assert.equal(submitted.action, 'setSelection');
      assert.equal(submissions, 1, 'rapid input submits exactly one plan');
      finish();
      await settleAction();
      assert.equal(mounted.store.busyRunKey, '');
      if (accepted) {
        assert.deepEqual(
          mounted.containers.craftingRuns.active[submitted.runId].steps[0].selectionPlan,
          submitted.payload.selectionPlan,
          'the visible plan is the accepted persisted command'
        );
      }
      if (state === 'essence-shared') {
        assert.match(mounted.target.querySelector('[data-essence-total="earth"]').textContent, accepted ? /6 \/ 6/ : /0 \/ 6/);
        assert.equal(mounted.target.querySelector('[data-essence-source] input').value, accepted ? '1' : '0');
      }
      harness.remount();
    }
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
        assert.equal(mounted.store.selectedRun.gatheringYield.roll, 25);
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

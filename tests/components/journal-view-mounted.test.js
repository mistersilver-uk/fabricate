import { after, afterEach, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  PLAYER_APP_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import { makeCraftingRun, makeGatheringRun, makeSucceededRun } from '../helpers/journal-fixtures.js';
import { chooseSelectOption } from '../helpers/select-control.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-journal-view-',
  rawModules: [
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...STATUS_TONE_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/formatDuration.js',
    'src/ui/svelte/util/worldTimeLabel.js',
    'src/systems/foundryCalendar.js',
    'src/ui/svelte/apps/journal/journalRunStatus.js',
  ],
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
    component('InspectorCard'),
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

function makeJournal(overrides = {}) {
  const calls = Object.fromEntries(
    ['load', 'select', 'search', 'kind', 'status', 'activeSort', 'historySort', 'activePage',
      'activeSize', 'historyPage', 'historySize', 'execute', 'pause', 'resume',
      'completion', 'selection', 'cancel', 'dismiss', 'viewStage'].map((key) => [key, []])
  );
  const store = {
    loading: false,
    error: false,
    listing: { selectedActorId: 'Actor.actor-1' },
    worldTime: 0,
    activePageItems: [],
    activeRuns: [],
    activeCount: 0,
    activeCounts: { all: 0, ready: 0, waiting: 0, paused: 0 },
    activePage: 0,
    activePageSize: 4,
    pageSizes: [4, 6, 12, 25],
    historyPageItems: [],
    historyCount: 0,
    historyPage: 0,
    historyPageSize: 4,
    historyPageSizes: [4, 6, 12, 25],
    selectedRun: null,
    selectedRunKey: '',
    selectedRunId: '',
    viewedStageIndex: 0,
    search: '',
    kindFilter: 'all',
    activeStatusFilter: 'all',
    activeSort: 'soonestReady',
    historySort: 'newest',
    loadedOnce: true,
    busyRunKey: '',
    load: (...args) => calls.load.push(args),
    tickWorldTime() {},
    select: (value) => calls.select.push(value),
    setSearch: (value) => calls.search.push(value),
    setKindFilter: (value) => calls.kind.push(value),
    setActiveStatusFilter: (value) => calls.status.push(value),
    setActiveSort: (value) => calls.activeSort.push(value),
    setHistorySort: (value) => calls.historySort.push(value),
    setActivePage: (value) => calls.activePage.push(value),
    setActivePageSize: (value) => calls.activeSize.push(value),
    setHistoryPage: (value) => calls.historyPage.push(value),
    setHistoryPageSize: (value) => calls.historySize.push(value),
    execute: (run) => calls.execute.push(run),
    pause: (run) => calls.pause.push(run),
    resume: (run) => calls.resume.push(run),
    setCompletionMode: (run, value) => calls.completion.push([run, value]),
    setSelection: (run, value) => calls.selection.push([run, value]),
    cancel: (run) => calls.cancel.push(run),
    dismiss: (run) => calls.dismiss.push(run),
    viewStage: (run, value) => calls.viewStage.push([run, value]),
    ...overrides,
  };
  return { store, calls };
}

function makeServices(journal) {
  return {
    journal,
    actorBar: { selectedActorId: 'Actor.actor-1' },
    getWorldTimeComponents: () => ({ day: 13, hour: 8, minute: 0, secondsPerDay: 86400 }),
  };
}

async function settle() {
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  flushSync();
}

describe('JournalView mounted behavior', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('keeps loading, error, and no-actor branches explicit', async () => {
    for (const [overrides, state] of [
      [{ loading: true }, 'loading'],
      [{ error: true }, 'error'],
      [{ listing: { selectedActorId: null } }, 'empty'],
    ]) {
      const { store } = makeJournal(overrides);
      const target = await harness.mount({ services: makeServices(store) });
      assert.ok(target.querySelector(`[data-journal-state="${state}"]`));
      harness.remount();
    }
  });

  it('offers a working retry action after a load error', async () => {
    const { store, calls } = makeJournal({ error: true });
    const target = await harness.mount({ services: makeServices(store) });
    const beforeRetry = calls.load.length;
    target.querySelector('[data-notice-action]').click();
    assert.equal(calls.load.length, beforeRetry + 1);
  });

  it('renders Browse and Detail as two zones with independently paged Active and Finished lists', async () => {
    const active = makeCraftingRun();
    const finished = makeSucceededRun();
    const { store } = makeJournal({
      activePageItems: [active], activeRuns: [active], activeCount: 1,
      activeCounts: { all: 1, ready: 0, waiting: 1, paused: 0 },
      historyPageItems: [finished], historyCount: 1,
      selectedRun: active, selectedRunKey: active.key, selectedRunId: active.id,
    });
    const target = await harness.mount({ services: makeServices(store) });

    assert.equal(target.querySelectorAll('.journal-browse, .journal-detail-pane').length, 2);
    assert.ok(target.querySelector('[data-run-id="run-craft-1"]'));
    assert.ok(target.querySelector('[data-history-run-id="run-done-1"]'));
    const activeList = target.querySelector('[data-journal-list="active"]');
    const finishedList = target.querySelector('[data-journal-list="finished"]');
    assert.ok(activeList.querySelector('[data-journal-list-scroll]'));
    assert.ok(finishedList.querySelector('[data-journal-list-scroll]'));
    assert.ok(!activeList.querySelector('[data-journal-list-scroll]').contains(activeList.querySelector('[data-pagination]')));
    assert.ok(!finishedList.querySelector('[data-journal-list-scroll]').contains(finishedList.querySelector('[data-pagination]')));
    assert.equal(target.querySelectorAll('.journal-list-footer .manager-pagination').length, 2);
    assert.ok(target.querySelector('[data-journal-list="active"] [data-pagination-page]'));
    assert.ok(target.querySelector('[data-journal-list="finished"] [data-pagination-page]'));
    assert.ok(target.querySelector('[data-journal-detail]'));
    assert.ok(target.querySelector('[data-journal-time-remaining]'));
    assert.equal(target.querySelectorAll('[data-journal-summary-card]').length, 2);
    assert.ok(!target.querySelector('.journal-view-column-right'));
    assert.ok(!target.querySelector('[data-journal-card="recent"]'));
  });

  it('operates search, kind, status, and both independent sort controls', async () => {
    const run = makeGatheringRun();
    const finished = makeSucceededRun();
    const { store, calls } = makeJournal({
      activePageItems: [run], activeRuns: [run], activeCount: 9,
      activeCounts: { all: 4, ready: 1, waiting: 2, paused: 1 },
      historyPageItems: [finished], historyCount: 9,
    });
    const target = await harness.mount({ services: makeServices(store) });

    const search = target.querySelector('[data-journal-search] input');
    search.value = 'herb';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    chooseSelectOption(target, '[data-journal-kind-filter]', 'gathering');
    target.querySelector('[data-journal-status-filter] input[value="ready"]').click();
    chooseSelectOption(target, '[data-journal-sort="active"]', 'newest');
    chooseSelectOption(target, '[data-journal-sort="history"]', 'oldest');
    target.querySelector('[data-journal-list="active"] [data-pagination-next]').click();
    target.querySelector('[data-journal-list="finished"] [data-pagination-next]').click();
    chooseSelectOption(target, '[data-journal-list="active"] [data-pagination-size]', 6);
    chooseSelectOption(target, '[data-journal-list="finished"] [data-pagination-size]', 6);

    assert.deepEqual(calls.search, ['herb']);
    assert.deepEqual(calls.kind, ['gathering']);
    assert.deepEqual(calls.status, ['ready']);
    assert.deepEqual(calls.activeSort, ['newest']);
    assert.deepEqual(calls.historySort, ['oldest']);
    assert.deepEqual(calls.activePage, [1]);
    assert.deepEqual(calls.historyPage, [1]);
    assert.deepEqual(calls.activeSize, [6]);
    assert.deepEqual(calls.historySize, [6]);
    assert.equal(target.querySelector('[data-segment-badge="4"]').textContent, '4');
  });

  it('selects by the full run model so equal ids in different run types stay distinct', async () => {
    const crafting = makeCraftingRun({ id: 'same' });
    const gathering = makeGatheringRun({ id: 'same' });
    const { store, calls } = makeJournal({
      activePageItems: [crafting, gathering], activeRuns: [crafting, gathering], activeCount: 2,
      selectedRunKey: gathering.key,
    });
    const target = await harness.mount({ services: makeServices(store) });
    const rows = target.querySelectorAll('[data-run-id="same"]');
    assert.equal(rows.length, 2);
    assert.equal(rows[1].getAttribute('data-selected'), 'true');
    rows[0].click();
    assert.equal(calls.select[0], crafting);
  });

  it('dismisses a Finished row without selecting it', async () => {
    const run = makeSucceededRun();
    const { store, calls } = makeJournal({ historyPageItems: [run], historyCount: 1 });
    const target = await harness.mount({ services: makeServices(store) });
    target.querySelector('[data-journal-dismiss]').click();
    assert.deepEqual(calls.dismiss, [run]);
    assert.deepEqual(calls.select, []);
  });

  it('uses the shared action bar for primary, pause, completion preference, and armed cancellation', async () => {
    const run = makeCraftingRun({
      lifecycleContract: 'current', lifecycleVersion: 1, derivedStatus: 'ready', timeGate: null,
      actions: { execute: true, pause: true, resume: false, setCompletionMode: true, setSelection: false, cancel: true, dismiss: false, disabledReason: null },
    });
    const { store, calls } = makeJournal({
      activePageItems: [run], activeRuns: [run], activeCount: 1,
      selectedRun: run, selectedRunKey: run.key, selectedRunId: run.id,
    });
    const target = await harness.mount({ services: makeServices(store) });
    target.querySelector('[data-run-action="primary"]').click();
    target.querySelector('[data-run-action="pause"]').click();
    target.querySelector('[data-run-completion-switch] input[value="worldTime"]').click();
    target.querySelector('[data-run-action="cancel-arm"]').click();
    flushSync();
    assert.ok(target.querySelector('[data-run-cancel-decision]'));
    assert.ok(!target.querySelector('[data-run-action="primary"]'));
    target.querySelector('[data-run-action="cancel-confirm"]').click();
    assert.deepEqual(calls.execute, [run]);
    assert.deepEqual(calls.pause, [run]);
    assert.deepEqual(calls.completion, [[run, 'worldTime']]);
    assert.deepEqual(calls.cancel, [run]);
  });

  it('keeps stage browsing separate from the current stage and uses no navigation for one stage', async () => {
    const run = makeCraftingRun({ lifecycleContract: 'current', lifecycleVersion: 1 });
    const { store, calls } = makeJournal({
      activePageItems: [run], activeRuns: [run], activeCount: 1,
      selectedRun: run, selectedRunKey: run.key, selectedRunId: run.id, viewedStageIndex: 0,
    });
    const target = await harness.mount({ services: makeServices(store) });
    target.querySelector('[data-stage-nav-index="1"]').click();
    assert.deepEqual(calls.viewStage, [[run, 1]]);
    assert.equal(target.querySelector('[data-stage-card]').getAttribute('data-stage-state'), 'current');

    harness.remount();
    const single = makeCraftingRun({ steps: [run.steps[0]], stepCount: 1, multiStep: false });
    const { store: singleStore } = makeJournal({ selectedRun: single, selectedRunKey: single.key });
    const singleTarget = await harness.mount({ services: makeServices(singleStore) });
    assert.ok(!singleTarget.querySelector('[data-stage-nav]'));
    assert.ok(!singleTarget.querySelector('.fab-stage-card-heading'));
    assert.ok(singleTarget.querySelector('.fab-stage-card-body'), 'the single stage body remains rendered');

    harness.remount();
    const futureStep = {
      ...run.steps[1],
      detail: { ...run.steps[1].detail, failureText: 'The metal cracked.' },
      lastCheckResult: { formula: '1d20 + 2', total: 16, value: 14, dc: 10, success: false },
      requirementSnapshot: {
        id: 'future-set',
        ingredientGroups: [{
          id: 'fuel', name: 'Fuel', quantity: 2,
          options: [{ componentId: 'coal', name: 'Coal', quantity: 2 }],
        }],
      },
      selectionPlan: { selectedIngredientSetId: 'future-set' },
    };
    const futureRun = makeCraftingRun({ steps: [run.steps[0], futureStep] });
    const { store: futureStore } = makeJournal({
      selectedRun: futureRun, selectedRunKey: futureRun.key, viewedStageIndex: 1,
    });
    const futureTarget = await harness.mount({ services: makeServices(futureStore) });
    const futureCard = futureTarget.querySelector('[data-stage-card]');
    assert.equal(futureCard.getAttribute('data-stage-state'), 'future');
    assert.ok(futureCard.classList.contains('is-inactive'));
    assert.match(futureCard.textContent, /Coal/);
    assert.match(futureCard.textContent, /RollResultWithDc/);
    assert.match(futureCard.textContent, /The metal cracked/);
    assert.equal(futureCard.querySelector('button, input'), null);
  });

  it('persists an exact held-item choice and a stage-scoped essence allocation', async () => {
    const base = makeCraftingRun();
    const option = (index, id, name, candidate) => ({
      index, id, kind: 'component', name, img: '', icon: 'fas fa-cube', colorToken: 'sage',
      need: 1, available: true, candidates: [candidate],
    });
    const iron = option(0, 'iron', 'Iron', {
      itemId: 'Item.iron', name: 'Iron ingot', img: '', held: 3, available: true,
    });
    const copper = option(1, 'copper', 'Copper', {
      itemId: 'Item.copper', name: 'Copper ingot', img: '', held: 2, available: true,
    });
    const firstStep = {
      ...base.steps[0],
      selectionPlan: { selectedIngredientSetId: 'set-1', ingredientOptionOverrides: {} },
      requirementSnapshot: { id: 'set-1', ingredientGroups: [] },
      selectionAvailability: {
        requirements: [{
          groupId: 'metal', name: 'Metal', selectedOptionIndex: 0,
          selectedItemId: 'Item.iron', option: iron,
        }],
        choices: [{ groupId: 'metal', selectedOptionIndex: 0, options: [iron, copper] }],
        essencePool: {
          requirements: [{
            groupId: 'spark', essenceId: 'fire', name: 'Fire', icon: 'fas fa-fire',
            colorToken: 'ember', need: 4, delivered: 0, owned: 4, satisfied: false,
          }],
          carriers: [{
            itemKey: 'Item.crystal', componentId: 'crystal', name: 'Ember crystal', img: '',
            perUnit: { fire: 2 }, ownedUnits: 2, allocatedUnits: 0,
          }],
          allocation: {}, suggested: {}, totals: {},
        },
      },
    };
    const run = makeCraftingRun({
      lifecycleContract: 'current', lifecycleVersion: 1,
      steps: [firstStep, base.steps[1]], currentStep: firstStep,
      actions: { ...base.actions, setSelection: true },
    });
    const { store, calls } = makeJournal({ selectedRun: run, selectedRunKey: run.key });
    const target = await harness.mount({ services: makeServices(store) });
    target.querySelector('[data-slot-id="metal"] button').click();
    flushSync();
    const copperChoice = [...target.querySelectorAll('[data-choice-id]')]
      .find((node) => node.textContent.includes('Copper ingot'));
    copperChoice.click();
    const essenceIncrement = target.querySelector(
      '[data-essence-source="Item.crystal"] [data-stepper-increment]'
    );
    essenceIncrement.click();
    flushSync();
    essenceIncrement.click();

    assert.equal(calls.selection[0][1].ingredientOptionOverrides.metal.optionIndex, 1);
    assert.equal(calls.selection[0][1].ingredientOptionOverrides.metal.heldItemId, 'Item.copper');
    assert.equal(
      calls.selection[2][1].ingredientEssenceAllocation.allocation['Item.crystal'],
      2
    );
    assert.equal(calls.selection[2][1].ingredientEssenceAllocation.stepId, 's1');
    assert.equal(calls.selection[2][1].ingredientEssenceAllocation.ingredientSetId, 'set-1');
  });

  it('renders terminal awards through YieldScale and moves facts and guidance into Detail', async () => {
    const run = makeSucceededRun();
    const { store } = makeJournal({
      historyPageItems: [run], historyCount: 1,
      selectedRun: run, selectedRunKey: run.key, selectedRunId: run.id,
    });
    const target = await harness.mount({ services: makeServices(store) });
    assert.match(target.querySelector('[data-yield-scale]').textContent, /Healing Potion/);
    assert.ok(target.querySelector('[data-journal-record]'));
    assert.match(target.querySelector('[data-journal-record]').textContent, /DayWithClock/u);
    assert.ok(target.querySelector('[data-journal-guidance]'));
    assert.ok(target.querySelector('[data-journal-verdict="succeeded"]'));
  });

  it('renders the authoritative gathering preview separately from actual awards', async () => {
    const run = makeGatheringRun({
      gatheringYield: {
        mode: 'd100',
        entries: [
          { id: 'herb', name: 'Moon herb', qty: 2, chance: 70 },
          { id: 'seed', name: 'Moon seed', qty: 1, chance: 20 },
        ],
        roll: 41,
        tiers: [],
      },
      createdResults: [{ componentId: 'herb', name: 'Moon herb', quantity: 2 }],
    });
    const { store } = makeJournal({ selectedRun: run, selectedRunKey: run.key });
    const target = await harness.mount({ services: makeServices(store) });
    assert.equal(target.querySelectorAll('[data-yield-scale]').length, 2);
    assert.ok(target.querySelector('[data-yield-cut]'));
    assert.match(target.querySelector('[data-journal-record]').textContent, /d100/u);

    harness.remount();
    const routed = makeGatheringRun({
      gatheringYield: {
        mode: 'routed', entries: [], roll: null,
        tiers: [
          { id: 'rich', name: 'Rich seam', band: '20+', fail: false,
            yields: [{ id: 'ore', name: 'Moon ore', quantity: '×3' }] },
          { id: 'barren', name: 'Barren', band: '<10', fail: true, yields: [] },
        ],
      },
    });
    const { store: routedStore } = makeJournal({
      selectedRun: routed, selectedRunKey: routed.key,
    });
    const routedTarget = await harness.mount({ services: makeServices(routedStore) });
    assert.equal(routedTarget.querySelectorAll('[data-outcome-tier]').length, 2);
    assert.match(routedTarget.querySelector('[data-journal-record]').textContent, /Mode\.routed/u);
    assert.doesNotMatch(routedTarget.querySelector('[data-journal-record]').textContent, /null/u);

    harness.remount();
    const straight = makeGatheringRun({
      gatheringYield: {
        mode: 'straight',
        entries: [{ id: 'ore', name: 'Moon ore', qty: 3, chance: 100 }],
        roll: null,
        tiers: [],
      },
    });
    const { store: straightStore } = makeJournal({
      selectedRun: straight, selectedRunKey: straight.key,
    });
    const straightTarget = await harness.mount({ services: makeServices(straightStore) });
    assert.ok(straightTarget.querySelector('[data-yield-entry="ore"]'));
    assert.equal(straightTarget.querySelector('[data-yield-cut]'), null);
    assert.match(straightTarget.querySelector('[data-journal-record]').textContent, /Mode\.straight/u);
  });

  it('personalizes active d100 chances without replacing terminal evidence', async () => {
    const active = makeGatheringRun({
      environmentId: 'env-1',
      gatheringYield: {
        mode: 'd100',
        entries: [{ id: 'herb', name: 'Moon herb', qty: 2, chance: 30 }],
        roll: null,
        tiers: [],
      },
    });
    const { store } = makeJournal({ selectedRun: active, selectedRunKey: active.key });
    const calls = [];
    let resolveBreakdown;
    const services = {
      ...makeServices(store),
      getGatheringDropBreakdown: (options) => {
        calls.push(options);
        return new Promise((resolvePromise) => {
          resolveBreakdown = resolvePromise;
        });
      },
    };
    const target = await harness.mount({ services });
    await settle();
    assert.ok(target.querySelector('[data-journal-yield-loading]'));
    resolveBreakdown({ drops: [{ id: 'herb', finalChance: 0.72 }] });
    await settle();
    assert.deepEqual(calls, [{ environmentId: 'env-1', taskId: 'task-1', rememberedActorId: 'Actor.actor-1' }]);
    assert.match(target.querySelector('[data-yield-entry="herb"]').textContent, /72%/);

    harness.remount();
    const terminal = makeGatheringRun({
      derivedStatus: 'succeeded',
      status: 'succeeded',
      finishedAt: 100,
      environmentId: 'env-1',
      gatheringYield: {
        mode: 'd100',
        entries: [{ id: 'herb', name: 'Moon herb', qty: 2, chance: 41 }],
        roll: 40,
        tiers: [],
      },
    });
    const { store: terminalStore } = makeJournal({ selectedRun: terminal, selectedRunKey: terminal.key });
    const terminalTarget = await harness.mount({ services: { ...services, journal: terminalStore } });
    await settle();
    assert.equal(calls.length, 1, 'terminal evidence does not request a live preview');
    assert.match(terminalTarget.querySelector('[data-yield-entry="herb"]').textContent, /41%/);

    harness.remount();
    const redacted = makeGatheringRun({
      redacted: true,
      environmentId: 'env-1',
      gatheringYield: active.gatheringYield,
    });
    const { store: redactedStore } = makeJournal({ selectedRun: redacted, selectedRunKey: redacted.key });
    const redactedTarget = await harness.mount({ services: { ...services, journal: redactedStore } });
    await settle();
    assert.equal(calls.length, 1, 'redacted runs never request personalized evidence');
    assert.ok(!redactedTarget.querySelector('[data-journal-yield-loading]'));
  });

  it('reports a personalized gathering preview failure and keeps the authored scale visible', async () => {
    const run = makeGatheringRun({
      environmentId: 'env-1',
      gatheringYield: {
        mode: 'd100',
        entries: [{ id: 'herb', name: 'Moon herb', qty: 2, chance: 30 }],
        roll: null,
        tiers: [],
      },
    });
    const { store } = makeJournal({ selectedRun: run, selectedRunKey: run.key });
    const target = await harness.mount({
      services: {
        ...makeServices(store),
        getGatheringDropBreakdown: () => Promise.reject(new Error('unavailable')),
      },
    });
    await settle();
    assert.ok(target.querySelector('[data-journal-yield-error]'));
    assert.match(target.querySelector('[data-yield-entry="herb"]').textContent, /30%/);
  });

  it('hides a matured time callout while retaining time and no-check facts', async () => {
    const base = makeCraftingRun();
    const step = {
      ...base.steps[0],
      detail: { ...base.steps[0].detail, checkLabel: null },
      timeGate: { availableAt: 100, initiatedAt: 0, requiredSeconds: 100 },
    };
    const run = makeCraftingRun({
      derivedStatus: 'ready',
      steps: [step],
      currentStep: step,
      stepCount: 1,
      multiStep: false,
      timeGate: step.timeGate,
    });
    const { store } = makeJournal({ worldTime: 200, selectedRun: run, selectedRunKey: run.key });
    const target = await harness.mount({ services: makeServices(store) });
    assert.ok(!target.querySelector('[data-journal-time-remaining]'));
    assert.equal(target.querySelectorAll('[data-journal-summary-card]').length, 2);
    assert.match(target.querySelector('[data-journal-summary-card="check"]').textContent, /NoCheck|No check/u);
    const guidance = target.querySelector('[data-journal-guidance]').textContent;
    assert.match(guidance, /no check.*finish crafting to complete/iu);
    assert.doesNotMatch(guidance, /roll/iu);
  });

  it('describes current gathering as manually resolved while preserving legacy guidance', async () => {
    const current = makeGatheringRun({ lifecycleContract: 'current', lifecycleVersion: 1 });
    const { store } = makeJournal({ selectedRun: current, selectedRunKey: current.key });
    const currentTarget = await harness.mount({ services: makeServices(store) });
    const currentGuidance = currentTarget.querySelector('[data-journal-guidance]').textContent;
    assert.match(currentGuidance, /available action to resolve/iu);
    assert.doesNotMatch(currentGuidance, /resolves automatically/iu);

    harness.remount();
    const legacy = makeGatheringRun();
    const { store: legacyStore } = makeJournal({ selectedRun: legacy, selectedRunKey: legacy.key });
    const legacyTarget = await harness.mount({ services: makeServices(legacyStore) });
    assert.match(
      legacyTarget.querySelector('[data-journal-guidance]').textContent,
      /resolves automatically/iu
    );
  });

  it('freezes paused time and reads summary facts from the stage being viewed', async () => {
    const base = makeCraftingRun();
    const current = {
      ...base.steps[0],
      detail: { ...base.steps[0].detail, checkLabel: 'CURRENT CHECK' },
      timeGate: { availableAt: 1000, initiatedAt: 0, requiredSeconds: 1000 },
    };
    const future = {
      ...base.steps[1],
      detail: { ...base.steps[1].detail, requiredSeconds: 7200, checkLabel: 'FUTURE CHECK' },
      timeGate: null,
    };
    const paused = makeCraftingRun({
      derivedStatus: 'paused',
      pauseState: { pausedAt: 250, remainingSeconds: 750 },
      steps: [current, future],
      currentStep: current,
      timeGate: current.timeGate,
    });
    const { store } = makeJournal({ worldTime: 500, selectedRun: paused, selectedRunKey: paused.key });
    const currentTarget = await harness.mount({ services: makeServices(store) });
    assert.match(currentTarget.querySelector('[data-journal-summary-card="time"]').textContent, /12m 30s/u);
    assert.ok(!currentTarget.querySelector('[data-journal-time-remaining]'));

    harness.remount();
    store.viewedStageIndex = 1;
    const futureTarget = await harness.mount({ services: makeServices(store) });
    assert.match(futureTarget.querySelector('[data-journal-summary-card="time"]').textContent, /2h 0m 0s/u);
    const check = futureTarget.querySelector('[data-journal-summary-card="check"]').textContent;
    assert.match(check, /FUTURE CHECK/u);
    assert.doesNotMatch(check, /CURRENT CHECK/u);
  });

  it('shows a run-scoped command failure and operates its retry action', async () => {
    const run = makeCraftingRun({ lifecycleContract: 'current', lifecycleVersion: 1 });
    const { store, calls } = makeJournal({
      selectedRun: run,
      selectedRunKey: run.key,
      commandError: { runKey: run.key, actorUuid: run.actorUuid, message: 'The run changed.' },
    });
    store.retryCommandError = () => {
      calls.execute.push('retry');
      store.commandError = null;
    };
    const services = makeServices(store);
    const target = await harness.mount({ services });
    const notice = target.querySelector('[data-journal-command-error]');
    assert.ok(notice, 'the command failure notice is visible for the selected run');
    assert.match(notice.textContent, /The run changed\./u);
    notice.querySelector('[data-notice-action]').click();
    assert.deepEqual(calls.execute, ['retry']);

    harness.remount();
    const cleared = await harness.mount({ services });
    assert.ok(!cleared.querySelector('[data-journal-command-error]'));
  });

  it('shows recovery evidence without disclosing selection internals on a redacted owner run', async () => {
    const run = makeCraftingRun({
      redacted: true, names: { title: 'Hidden recipe', subtitle: '' }, steps: [], currentStep: null,
      lifecycleContract: 'current', lifecycleVersion: 1,
      recoveryEvidence: { required: true, appliedEffectCount: 2, effects: [] },
      actions: { execute: false, pause: false, resume: false, setCompletionMode: false, setSelection: false, cancel: false, dismiss: false, disabledReason: 'recoveryRequired' },
    });
    const { store } = makeJournal({ selectedRun: run, selectedRunKey: run.key });
    const target = await harness.mount({ services: makeServices(store) });
    assert.ok(target.querySelector('[data-journal-recovery]'));
    assert.match(target.textContent, /Hidden recipe/);
    assert.doesNotMatch(target.textContent, /selectedIngredientSetId/);
  });
});

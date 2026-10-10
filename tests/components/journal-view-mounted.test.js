import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { after, afterEach, before, describe, it } from 'node:test';

import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import { RunJournalBuilder } from '../../src/ui/presenters/RunJournalBuilder.js';
import { byCodePoint } from '../helpers/codePointOrder.js';
import { LOCALIZE_OR_RAW_MODULES } from '../helpers/foundryBridgeModules.js';
import { makeCraftingRun, makeGatheringRun, makeSucceededRun } from '../helpers/journal-fixtures.js';
import { chooseSelectOption } from '../helpers/select-control.js';
import {
  PLAYER_APP_COMPILED_MODULES,
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  OUTCOME_LADDER_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const english = JSON.parse(readFileSync(resolve(repoRoot, 'lang/en.json'), 'utf8'));
const component = (name) => `src/ui/svelte/components/${name}.svelte`;
const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-journal-view-',
  rawModules: [
    'src/ui/svelte/util/rollPromptOrigin.js',
    // Issue 1644: a candidate and its slot tile keep focus across a pending command.
    'src/ui/svelte/util/focusWhenEnabled.js',
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    ...LOCALIZE_OR_RAW_MODULES,
    ...STATUS_TONE_RAW_MODULES,
    ...OUTCOME_LADDER_RAW_MODULES,
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/formatDuration.js',
    'src/ui/svelte/util/worldTimeLabel.js',
    // Issue 1648: the shared authority-refusal wording the Journal panels and stores read.
    'src/ui/svelte/util/journalRunReasons.js',
    'src/systems/foundryCalendar.js',
    'src/ui/svelte/apps/journal/journalRunStatus.js',
    'src/ui/svelte/apps/journal/historyPresentation.js',
    // Issue 1773: a reward row's glyph.
    'src/ui/presenters/resultKindGlyphs.js',
    'src/ui/svelte/apps/journal/runStateNotice.js',
    // Issue 1773: the award face's rows.
    'src/ui/presenters/awardChoiceRows.js',
    'src/ui/svelte/apps/journal/runDetailPresentation.js',
    // The roll line signs an executed margin with the shared formatter (issue 2005).
    'src/utils/checkAdjustmentFormat.js',
    'src/utils/scalars.js',
    'src/ui/svelte/apps/journal/stageHeading.js',
    'src/ui/svelte/apps/journal/runRecovery.js',
    // The run kinds the store filters by and the kind filter draws and counts (issue 1644).
    'src/ui/svelte/util/journalRunKinds.js',
    // The real store the kind filter drives (issue 1518), and its raw closure.
    'src/ui/presenters/additionalDicePrompt.js',
    'src/systems/additionalDiceReach.js',
    'src/utils/fillPlaceholders.js',
    'src/utils/localizeWithFallback.js',
    'src/systems/countEvaluation.js',
    'src/systems/countTriggerReach.js',
    'src/systems/normalize/checkEvaluation.js',
    'src/systems/checkEvaluation.js',
    'src/systems/checkTarget.js',
  ],
  runeModules: [
    'src/ui/svelte/stores/browseListing.svelte.js',
    'src/ui/svelte/stores/journalStore.svelte.js',
  ],
  compiledModules: [
    ...SELECT_COMPILED_MODULES,
    ...PLAYER_APP_COMPILED_MODULES,
    'src/ui/svelte/components/SearchField.svelte',
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/components/IconButton.svelte',
    component('Button'),
    component('RunActionBar'),
    component('SlotTile'),
    component('ChoiceOptionList'),
    component('SlotRow'),
    'src/ui/svelte/components/Stepper.svelte',
    component('EssencePool'),
    component('RunProgress'),
    'src/ui/svelte/components/StageBars.svelte',
    component('StageNav'),
    component('StageCard'),
    'src/ui/svelte/components/ListRow.svelte',
    'src/ui/svelte/components/YieldScale.svelte',
    'src/ui/svelte/components/OutcomeLadder.svelte',
    'src/ui/svelte/components/InspectorCard.svelte',
    'src/ui/svelte/apps/journal/JournalCard.svelte',
    'src/ui/svelte/apps/journal/JournalListShell.svelte',
    'src/ui/svelte/apps/journal/JournalFactRow.svelte',
    'src/ui/svelte/apps/journal/RunCard.svelte',
    'src/ui/svelte/apps/journal/ActiveRunsList.svelte',
    'src/ui/svelte/components/LogList.svelte',
    'src/ui/svelte/apps/journal/HistoryList.svelte',
    'src/ui/svelte/apps/journal/StepDetails.svelte',
    'src/ui/svelte/components/RadioCardGroup.svelte',
    'src/ui/svelte/apps/journal/TimeRemainingBox.svelte',
    'src/ui/svelte/apps/journal/ActionsPanel.svelte',
    'src/ui/svelte/apps/journal/RunDetail.svelte',
    'src/ui/svelte/apps/journal/RunAwardChoice.svelte',
    'src/ui/svelte/apps/journal/HistoricalRunDetail.svelte', 'src/ui/svelte/apps/journal/ThisRun.svelte',
    // The run-type multi-select and the box its rows draw (issue 1644).
    'src/ui/svelte/components/SelectionCheckbox.svelte',
    'src/ui/svelte/apps/journal/JournalKindFilter.svelte',
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
    activeCounts: { all: 0, ready: 0, inProgress: 0, paused: 0 },
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
    kindFilter: ['crafting', 'gathering', 'salvage', 'alchemy'],
    activeStatusFilter: 'all',
    activeSort: 'soonestReady',
    historySort: 'newest',
    loadedOnce: true,
    busyRunKey: '',
    load: (...args) => calls.load.push(args),
    tickWorldTime() {},
    select: (value) => calls.select.push(value),
    setSearch: (value) => calls.search.push(value),
    toggleKind: (value) => calls.kind.push(value),
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

const HISTORY = 'FABRICATE.App.Journal.History.';

/** A terminal legacy gathering record as the builder projects it, never a hand-written yield. */
function historicalGatheringRun(id, rows, awards) {
  const record = {
    id,
    taskId: 'mining',
    status: 'succeeded',
    craftingSystemId: 'mining',
    checkResult: { provider: 'd100', items: rows },
    createdResults: awards,
  };
  const components = rows.map((row) => ({
    id: row.componentId,
    registeredItemUuid: `Compendium.ex.mat.Item.${row.componentId}`,
  }));
  return new RunJournalBuilder({
    gatheringRunSource: { getRunHistory: () => [record] },
    getSystem: () => ({ id: record.craftingSystemId, components }),
  }).buildListing({ actor: { id: 'a', uuid: 'Actor.a' }, viewer: { isGM: true } }).history[0];
}

const award = (componentId, quantity, name) => ({
  itemUuid: `Compendium.ex.mat.Item.${componentId}`,
  quantity,
  name,
});

/** The ` · `-joined evidence line, split back into the independent fields that built it. */
const fieldsOf = (row) => row.querySelector('.fabricate-list-row-detail').textContent.split(' · ');

function oddsChipOf(row) {
  const chips = row.querySelectorAll('.manager-chip');
  assert.equal(chips.length, 1, 'a yield row carries exactly one odds chip');
  return chips[0];
}

const RUN_KINDS = ['crafting', 'gathering', 'salvage', 'alchemy'];

/** One run per kind on each list, two of them matching the search `silver`. */
function kindListing() {
  const active = (id, kind, title, derivedStatus) =>
    makeCraftingRun({
      id, key: `active-${id}`, runType: kind === 'alchemy' ? 'crafting' : kind, activityKind: kind,
      derivedStatus, names: { title, subtitle: '' },
    });
  const finished = (id, kind, title, finishedAt) =>
    makeSucceededRun({
      id, key: `history-${id}`, runType: kind === 'alchemy' ? 'crafting' : kind, activityKind: kind,
      finishedAt, names: { title, subtitle: '' },
    });
  const activeRuns = [
    active('a-craft', 'crafting', 'Silver Sword', 'ready'),
    active('a-gather', 'gathering', 'Silver Herbs', 'waiting'),
    active('a-salvage', 'salvage', 'Copper Scrap', 'ready'),
    active('a-brew', 'alchemy', 'Copper Draught', 'paused'),
  ];
  const history = [
    finished('h-craft', 'crafting', 'Copper Nail', 40),
    finished('h-gather', 'gathering', 'Copper Ore', 30),
    finished('h-salvage', 'salvage', 'Silver Shard', 20),
    finished('h-brew', 'alchemy', 'Silver Tonic', 10),
  ];
  return {
    selectedActorId: 'Actor.actor-1',
    selectedActorUuid: 'Actor.actor-1',
    counts: { active: activeRuns.length, history: history.length },
    activeRuns,
    history,
  };
}

/** Every subset of the four kinds, the empty one included. */
const KIND_SUBSETS = Array.from({ length: 16 }, (_unused, mask) =>
  RUN_KINDS.filter((_kind, index) => mask & (1 << index))
);

const KIND_KEY = 'FABRICATE.App.Journal.Filters.Kind.';
const kindTrigger = (target) =>
  target.querySelector(':scope [data-journal-kind-filter] [data-journal-kind-trigger]');

/** The run-type panel, opened from its trigger when it is shut; portaled to the app root. */
function openKinds(target) {
  if (kindTrigger(target).getAttribute('aria-expanded') !== 'true') {
    kindTrigger(target).click();
    flushSync();
  }
  const panel = target.querySelector(':scope .journal-kind-popover');
  assert.ok(Boolean(panel), 'the run-type trigger opened its panel');
  return panel;
}

const kindOption = (target, kind) =>
  openKinds(target).querySelector(`[data-journal-kind-option="${kind}"]`);

/** Ticks or unticks one kind's row, as a player does, and settles. */
function chooseKind(target, kind) {
  kindOption(target, kind).click();
  flushSync();
}

async function mountHistory(run) {
  const { store } = makeJournal({
    historyPageItems: [run],
    historyCount: 1,
    selectedRun: run,
    selectedRunKey: run.key,
    selectedRunId: run.id,
  });
  return harness.mount({ services: makeServices(store) });
}

async function settle() {
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  flushSync();
}

describe('JournalView mounted behavior', () => {
  before(async () => {
    await harness.setup();
    const localize = globalThis.game.i18n.localize;
    globalThis.game.i18n.localize = (key) => {
      const prefix = 'FABRICATE.App.Journal.WhatToExpect.';
      return key.startsWith(prefix)
        ? english.FABRICATE.App.Journal.WhatToExpect[key.slice(prefix.length)] ?? key
        : localize(key);
    };
  });
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

  it('renders four Finished entries with truthful outcome glyphs and compact independent pagers', async () => {
    const statuses = ['succeeded', 'failed', 'cancelled', undefined];
    const runs = statuses.map((status, index) => makeSucceededRun({
      id: `outcome-${index}`, key: `outcome-${index}`, status, derivedStatus: status,
      createdResults: [{ name: 'Award does not establish success', quantity: 42 }],
    }));
    const { store, calls } = makeJournal({ historyPageItems: runs, historyCount: 12, activeCount: 11 });
    const target = await harness.mount({ services: makeServices(store) });
    await settle();
    const rows = [...target.querySelectorAll('[data-history-run-id]')];
    assert.equal(rows.length, 4);
    const finished = target.querySelector('.journal-history-list');
    assert.equal(finished.getAttribute('aria-label'), 'FABRICATE.App.Journal.History.Title', 'the Finished list is named');
    assert.ok(rows.every((row) => row.getAttribute('role') === 'button'), 'each Finished entry opens through a button');
    assert.equal(finished.querySelectorAll(':scope > [role="listitem"]').length, 4, 'one listitem per entry');
    assert.equal(target.querySelectorAll('[data-pagination-compact]').length, 2);
    assert.ok(!target.querySelector('[data-history-quantity], .fab-log-list-meta .manager-chip'));
    assert.deepEqual(rows.map((row) => row.querySelector('[data-history-outcome]')?.getAttribute('data-history-outcome')),
      ['succeeded', 'failed', 'cancelled', 'unknown']);
    assert.ok(rows.every((row) => row.querySelector('[data-history-outcome]')?.getAttribute('aria-label')));
    rows[3].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(calls.select[0].id, 'outcome-3');
    target.querySelector('[data-journal-dismiss="outcome-3"]').click();
    assert.ok(target.querySelector('[data-journal-dismiss="outcome-3"]').classList.contains('is-size-24'), 'dismiss uses the owning 24px variant');
    assert.equal(calls.dismiss[0].id, 'outcome-3');
    assert.equal(calls.select.length, 1, 'dismissal does not select the entry');
  });

  it('renders Browse and Detail as two zones with independently paged Active and Finished lists', async () => {
    const active = makeCraftingRun();
    const finished = makeSucceededRun();
    const { store } = makeJournal({
      activePageItems: [active], activeRuns: [active], activeCount: 1,
      activeCounts: { all: 1, ready: 0, inProgress: 1, paused: 0 },
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
    assert.ok(!activeList.querySelector('[data-journal-list-scroll]').contains(activeList.querySelector('.fabricate-pagination')));
    assert.ok(!finishedList.querySelector('[data-journal-list-scroll]').contains(finishedList.querySelector('.fabricate-pagination')));
    assert.equal(target.querySelectorAll('.journal-list-footer .fabricate-pagination').length, 2);
    assert.ok(target.querySelector('[data-journal-list="active"] [data-pagination-page]'));
    assert.ok(target.querySelector('[data-journal-list="finished"] [data-pagination-page]'));
    assert.ok(target.querySelector('[data-journal-detail]'));
    assert.ok(target.querySelector('[data-journal-time-remaining]'));
    assert.equal(target.querySelectorAll('[data-journal-summary-card]').length, 2);
    assert.ok(!target.querySelector('.journal-view-column-right'));
    assert.ok(!target.querySelector('[data-journal-card="recent"]'));
  });

  it('gives unknown, recovery and unsettled Finished outcomes localized non-success labels', async () => {
    const runs = [
      { derivedStatus: 'unrecognized', status: 'unrecognized' },
      { recoveryEvidence: { required: true } },
      { recoveryEvidence: { status: 'planned' } },
    ].map((fields, index) => makeSucceededRun({ ...fields, id: `uncertain-${index}`, key: `uncertain-${index}` }));
    const { store } = makeJournal({ historyPageItems: runs, historyCount: runs.length });
    const target = await harness.mount({ services: makeServices(store) });
    await settle();
    const outcomes = [...target.querySelectorAll('[data-history-outcome]')];
    assert.deepEqual(outcomes.map((node) => node.dataset.historyOutcome), ['unknown', 'recovery', 'inProgress']);
    assert.ok(outcomes.every((node) => !node.classList.contains('is-success')));
    assert.match(outcomes[0].getAttribute('aria-label'), /unknown/i);
    assert.match(outcomes[1].getAttribute('aria-label'), /Recovery/i);
    assert.match(outcomes[2].getAttribute('aria-label'), /progress/i);
  });

  it('operates search, kind, status, and both independent sort controls', async () => {
    const run = makeGatheringRun();
    const finished = makeSucceededRun();
    const { store, calls } = makeJournal({
      activePageItems: [run], activeRuns: [run], activeCount: 9,
      activeCounts: { all: 4, ready: 1, inProgress: 2, paused: 1 },
      historyPageItems: [finished], historyCount: 9,
    });
    const target = await harness.mount({ services: makeServices(store) });

    const search = target.querySelector('[data-journal-search] input');
    search.value = 'herb';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    chooseKind(target, 'gathering');
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

  // Issue 1648, D-029/M19. The filter vocabulary must not diverge from the badge vocabulary.
  it('offers All / Ready / In progress / Paused, with the merged count on the merged tab', async () => {
    const run = makeCraftingRun();
    const { store, calls } = makeJournal({
      activePageItems: [run], activeRuns: [run], activeCount: 6,
      activeCounts: { all: 6, ready: 1, inProgress: 4, paused: 1 },
    });
    const target = await harness.mount({ services: makeServices(store) });

    const inputs = [...target.querySelectorAll('[data-journal-status-filter] input')];
    assert.deepEqual(
      inputs.map((input) => input.value),
      ['all', 'ready', 'inProgress', 'paused'],
      'no tab names a badge the player is never shown'
    );
    const merged = target.querySelector('[data-journal-status-filter] label:has(input[value="inProgress"])');
    // The harness localizes to the key.
    assert.match(merged.textContent, /Filters\.Status\.InProgress/, 'the tab is the merged one');
    assert.match(merged.textContent, /4/, 'and carries the merged count');

    merged.querySelector('input').click();
    assert.deepEqual(calls.status, ['inProgress']);
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

  it('presses exactly the Finished entry whose run key is selected, even among equal ids', async () => {
    const first = makeSucceededRun({ id: 'same', key: 'history-first' });
    const second = makeSucceededRun({ id: 'same', key: 'history-second' });
    const { store } = makeJournal({
      historyPageItems: [first, second], historyCount: 2, selectedRunKey: 'history-second',
    });
    const target = await harness.mount({ services: makeServices(store) });
    const pressed = [...target.querySelectorAll('[data-history-run-id]')]
      .map((row) => row.getAttribute('aria-pressed'));
    assert.deepEqual(pressed, ['false', 'true'], 'the run key, not the shared id, picks the row');
  });

  it('refuses to select a Finished run that has no id', async () => {
    const run = makeSucceededRun({ id: '', key: 'history-idless' });
    const { store, calls } = makeJournal({ historyPageItems: [run], historyCount: 1 });
    const target = await harness.mount({ services: makeServices(store) });
    const row = target.querySelector(':scope .journal-history-list [role="button"]');
    row.click();
    row.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.deepEqual(calls.select, [], 'an id-less run is not opened');
  });

  it('tones only a failed Finished row as danger, and names its dismiss control by the run', async () => {
    const failed = makeSucceededRun({
      id: 'f', key: 'f', status: 'failed', derivedStatus: 'failed', names: { title: 'Cracked Vial', subtitle: '' },
    });
    const done = makeSucceededRun({ id: 's', key: 's' });
    const { store } = makeJournal({ historyPageItems: [failed, done], historyCount: 2 });
    const target = await harness.mount({ services: makeServices(store) });
    const [failedItem, doneItem] = target.querySelectorAll(':scope .journal-history-list > [role="listitem"]');
    assert.ok(failedItem.firstElementChild.classList.contains('is-danger'));
    assert.ok(!doneItem.firstElementChild.classList.contains('is-danger'));
    assert.match(
      target.querySelector('[data-journal-dismiss="f"]').getAttribute('aria-label'),
      /Cracked Vial/,
      'the dismiss control is named by the run it dismisses'
    );
  });

  it('falls back to the default bag art for a Finished run with no image', async () => {
    const run = makeSucceededRun({ img: '' });
    const { store } = makeJournal({ historyPageItems: [run], historyCount: 1 });
    const target = await harness.mount({ services: makeServices(store) });
    assert.match(
      target.querySelector(':scope .journal-history-list img').getAttribute('src'),
      /icons\/svg\/item-bag\.svg$/
    );
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
    assert.ok(!singleTarget.querySelector('.fab-stage-card-number'));
    assert.ok(singleTarget.querySelector('.fab-stage-card-body'), 'the single stage body remains rendered');

    harness.remount();
    const futureStep = {
      ...run.steps[1],
      inputPreview: { source: 'preview', stageIndex: 1, routes: [{ id: 'future-set', name: '',
        groups: [{ id: 'fuel', options: [{ id: 'coal', name: 'Coal', kind: 'component', need: 2 }] }] }] },
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
    assert.doesNotMatch(futureCard.textContent, /RollResultWithDc|The metal cracked/);
    assert.ok(!futureCard.querySelector('button, input'));
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
    assert.match(target.querySelector('[data-history-items="produced"]').textContent, /Healing Potion/);
    assert.ok(!target.querySelector('[data-journal-record]'));
    assert.match(target.querySelector('[data-journal-this-run]').textContent, /DayWithClock/u);
    assert.ok(target.querySelector('[data-journal-guidance]'));
    assert.ok(!target.querySelector('[data-journal-verdict="succeeded"]'), 'ordinary reselected history has no transient success banner');
  });

  it('keeps every unrecorded historical check field unknown and borrows nothing from a neighbour', async () => {
    const run = historicalGatheringRun(
      'unknown-legacy',
      [
        { id: 'moss', componentId: 'moss' },
        { id: 'fern', componentId: 'fern' },
      ],
      [award('moss', 3, 'Moss')]
    );
    assert.equal(run.gatheringYield.rollModel, 'unknown');
    const target = await mountHistory(run);
    const rows = [...target.querySelectorAll('[data-yield-entry]')];
    assert.deepEqual(
      rows.map((row) => row.getAttribute('data-yield-entry')),
      ['moss', 'fern']
    );
    for (const row of rows) {
      assert.deepEqual(fieldsOf(row), [
        `${HISTORY}RollNotRecorded`,
        `${HISTORY}ThresholdNotRecorded`,
        `${HISTORY}OutcomeNotRecorded`,
      ]);
      assert.equal(row.className.includes('is-cleared'), false, 'an unknown outcome is not a hit');
      assert.equal(row.className.includes('is-missed'), false, 'nor a miss');
      assert.equal(oddsChipOf(row).textContent, `${HISTORY}NotRecorded`);
    }
    assert.deepEqual(
      rows.map((row) => row.querySelector('.fabricate-list-row-quantity').textContent),
      ['FABRICATE.App.Journal.Quantity:{"n":3}', `${HISTORY}NotRecorded`],
      'the row with no receipt says so rather than inheriting the 3 or settling at zero'
    );
    assert.equal(
      target.querySelectorAll('[data-yield-cut], [data-yield-shared-roll]').length,
      0,
      'no recorded roll, so nothing cuts the scale and no shared roll is shown'
    );
    assert.equal(
      target.querySelector('[data-yield-scale] .fab-yield-kicker').textContent,
      `${HISTORY}ScalePerRow`,
      'and the heading does not assert "where THE roll landed" over a record with no roll at all'
    );
  });

  it('states a legacy row roll once and never paints a recorded row with the no-roll odds tone', async () => {
    const run = historicalGatheringRun(
      'legacy-mining',
      [
        { id: 'ore', componentId: 'ore', roll: 12, effectiveRoll: 12,
          threshold: 11, finalDropRate: 90, dropped: true },
        { id: 'grit', componentId: 'grit', roll: 5, effectiveRoll: 5,
          threshold: 1, finalDropRate: 100, dropped: true },
      ],
      [award('ore', 2, 'Ore'), award('grit', 1, 'Grit')]
    );
    assert.equal(run.gatheringYield.rollModel, 'perRow');
    assert.equal(run.gatheringYield.roll, null, 'the record has no root roll to share');
    const target = await mountHistory(run);
    // #1648 A8: two INDEPENDENT rolls.
    assert.equal(
      target.querySelector('[data-yield-scale] .fab-yield-kicker').textContent,
      `${HISTORY}ScalePerRow`
    );
    const rows = [...target.querySelectorAll('[data-yield-entry]')];
    assert.deepEqual(
      rows.map((row) => row.getAttribute('data-yield-entry')),
      ['grit', 'ore'],
      'rows read down from the highest recorded chance'
    );
    const evidence = 'exactly three fields: an effective roll equal to the raw roll adds nothing';
    assert.deepEqual(
      fieldsOf(rows[1]),
      [
        `${HISTORY}RolledValue:{"roll":12}`,
        `${HISTORY}RecordedThreshold:{"threshold":11}`,
        `${HISTORY}CheckCleared`,
      ],
      evidence
    );
    assert.deepEqual(
      fieldsOf(rows[0]),
      [
        `${HISTORY}RolledValue:{"roll":5}`,
        `${HISTORY}RecordedThreshold:{"threshold":1}`,
        `${HISTORY}CheckCleared`,
      ],
      evidence
    );
    const guaranteed = oddsChipOf(rows[0]);
    assert.equal(guaranteed.textContent, '100%');
    assert.ok(guaranteed.className.includes('is-neutral'), guaranteed.className);
    assert.equal(
      guaranteed.className.includes('is-positive'),
      false,
      'the guaranteed-odds tone belongs to a preview with no roll, not to a row with its own outcome'
    );
    assert.equal(target.querySelectorAll('[data-yield-cut], [data-yield-shared-roll]').length, 0);
    assert.ok(
      !target.querySelector('[data-history-unattributed]'),
      'every receipt is attributed, so nothing is listed a second time'
    );
  });

  it('anchors a terminal detail with no browse index at its final stage', async () => {
    const steps = Array.from({ length: 3 }, (_unused, index) => ({
      stepId: `finished-${index}`, stepName: `Finished ${index + 1}`, status: 'succeeded',
    }));
    const run = makeSucceededRun({ steps, stepIndex: null, currentStep: null });
    const { store, calls } = makeJournal({ selectedRun: run, viewedStageIndex: null });
    const target = await harness.mount({ services: makeServices(store) });
    assert.ok(!target.querySelector('[data-stage-nav]'));
    assert.ok(!target.querySelector('[data-stage-nav-return]'));
    assert.equal(target.querySelector('[data-stage-card]').dataset.stageState, 'past');
    assert.equal(target.querySelectorAll('[data-stage-card]').length, 3);
    assert.deepEqual(calls.viewStage, []);
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
    assert.equal(target.querySelectorAll('[data-yield-scale]').length, 1, 'active scale has no duplicate received aggregate');
    assert.ok(target.querySelector('[data-yield-cut]'));
    assert.match(target.querySelector('.player-detail-header-meta').textContent, /d100/u);

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
    assert.match(routedTarget.querySelector('.player-detail-header-meta').textContent, /Mode\.routed/u);
    assert.doesNotMatch(routedTarget.querySelector('.player-detail-header-meta').textContent, /null/u);
    const ruleHint = (root) => root.querySelector('[data-outcome-ladder] .fab-outcome-hint').textContent;
    assert.match(ruleHint(routedTarget), /Yields\.RoutedRule$/u);

    // Issue 2005: a roll-under or character-value ladder states its own selection rule.
    for (const [ladderRule, key] of [
      ['under', /Yields\.RoutedRuleUnder$/u],
      ['underStrict', /Yields\.RoutedRuleUnderStrict$/u],
      ['adjustment', /Yields\.RoutedRuleAdjustment$/u],
    ]) {
      harness.remount();
      const under = makeGatheringRun({ gatheringYield: { ...routed.gatheringYield, ladderRule } });
      const { store: underStore } = makeJournal({ selectedRun: under, selectedRunKey: under.key });
      assert.match(ruleHint(await harness.mount({ services: makeServices(underStore) })), key);
    }

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
    assert.match(straightTarget.querySelector('.player-detail-header-meta').textContent, /Mode\.straight/u);
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
      createdResults: [{ componentId: 'herb', name: 'Moon herb', quantity: 2 }],
      gatheringYield: {
        mode: 'd100',
        entries: [{ id: 'herb', name: 'Moon herb', qty: 2, chance: 41, cleared: true }],
        roll: 80,
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
      detail: { ...base.steps[0].detail, checkLabel: null, checkKind: 'none' },
      timeGate: { availableAt: 100, initiatedAt: 0, requiredSeconds: 100 },
    };
    const run = makeCraftingRun({
      lifecycleContract: 'current',
      lifecycleVersion: 1,
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
    assert.ok(!futureTarget.querySelector('[data-journal-summary]'));
    // D-025: a future stage states the time it NEEDS in words; only a live countdown is H:M:S.
    assert.match(
      futureTarget.querySelector('[data-stage-card]').textContent,
      /Duration\.HourMany:\{"count":2\}/u
    );
    assert.doesNotMatch(futureTarget.querySelector('[data-stage-card]').textContent, /2h 0m 0s/u);
    const check = futureTarget.querySelector('[data-stage-card]').textContent;
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

  it('records the window a retry came from as the host of the roll it starts (issue 2053)', async () => {
    const { activeRollPromptOrigin } = await harness.loadRawModule(
      'src/ui/svelte/util/rollPromptOrigin.js'
    );
    const run = makeCraftingRun({ lifecycleContract: 'current', lifecycleVersion: 1 });
    const { store } = makeJournal({
      selectedRun: run,
      selectedRunKey: run.key,
      commandError: { runKey: run.key, actorUuid: run.actorUuid, message: 'The run changed.' },
    });
    let origin = 'unread';
    store.retryCommandError = async () => {
      origin = activeRollPromptOrigin();
    };
    const target = await harness.mount({ services: makeServices(store) });
    const notice = target.querySelector('[data-journal-command-error]');
    const retry = notice.querySelector('[data-notice-action]');
    retry.click();
    await Promise.resolve();
    const root = retry.closest('.fabricate-app, .fabricate-manager');
    assert.ok(root && origin === root, 'the retry runs with its own window recorded as the origin');
    assert.ok(activeRollPromptOrigin() === null, 'the origin is released once the retry settles');
  });

  it('offers the GM the release on the very run whose own evidence is uncertain', async () => {
    // M27: the run holding the uncertain effect reports `recoveryRequired` from its OWN
    // evidence, so the notice that describes it used to answer `claim: null` and withhold the
    // one control that can clear the claim blocking the world. It is the run a GM opens first.
    const run = makeCraftingRun({
      lifecycleContract: 'current', lifecycleVersion: 1,
      recoveryEvidence: { required: true, appliedEffectCount: 1, effects: [] },
      actions: {
        execute: false, pause: false, resume: false, setCompletionMode: false,
        setSelection: false, cancel: false, dismiss: false, disabledReason: 'recoveryRequired',
        recoveryClaim: { claimId: 'claim-9', requestKind: 'command', claimedAt: 2000 },
      },
    });
    const { store } = makeJournal({ selectedRun: run, selectedRunKey: run.key });
    const target = await harness.mount({ services: makeServices(store) });
    const notice = target.querySelector('[data-journal-recovery]');
    assert.ok(notice, 'the uncertain-effect notice still leads');
    const action = notice.querySelector('[data-notice-action]');
    assert.ok(Boolean(action), 'and it carries the release the GM needs');
    assert.match(action.textContent, /Recovery\.Action/u);
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

  describe('the run-type multi-select through the real store', () => {
    let createJournalStore;
    before(async () => {
      ({ createJournalStore } = await harness.loadRuneModule(
        'src/ui/svelte/stores/journalStore.svelte.js'
      ));
    });

    async function mountStore(listing = kindListing()) {
      const store = createJournalStore({
        services: {
          listJournalForActor: async () => listing,
          getSelectedActorId: () => 'Actor.actor-1',
          getWorldTime: () => 0,
        },
      });
      await store.load();
      const target = await harness.mount({ services: makeServices(store) });
      await settle();
      return { store, target, listing };
    }

    const shown = (target, attribute) =>
      [...target.querySelectorAll(`[${attribute}]`)].map((row) => row.getAttribute(attribute)).sort(byCodePoint);
    const selectedOf = (target, kind) => kindOption(target, kind).getAttribute('aria-selected');
    const summaryOf = (target) =>
      kindTrigger(target).querySelector('.fabricate-select-value').textContent.trim();

    /** Tick or untick the rows whose state differs from `kinds`, then settle. */
    async function showOnly(target, kinds) {
      for (const kind of RUN_KINDS) {
        const selected = selectedOf(target, kind) === 'true';
        if (selected !== kinds.includes(kind)) chooseKind(target, kind);
      }
      await settle();
    }

    it('shows the union of the ticked kinds, under every combination and with search', async () => {
      const { store, target, listing } = await mountStore();
      assert.deepEqual(
        RUN_KINDS.map((kind) => selectedOf(target, kind)),
        ['true', 'true', 'true', 'true'],
        'every kind starts shown'
      );
      for (const query of ['', 'silver']) {
        const search = target.querySelector(':scope [data-journal-search] input');
        search.value = query;
        search.dispatchEvent(new Event('input', { bubbles: true }));
        await settle();
        for (const kinds of KIND_SUBSETS) {
          await showOnly(target, kinds);
          const expect = (runs) =>
            runs
              .filter((run) => kinds.includes(run.activityKind))
              .filter((run) => run.names.title.toLowerCase().includes(query))
              .map((run) => run.id)
              .sort(byCodePoint);
          const label = `kinds [${kinds}] with search "${query}"`;
          assert.deepEqual([...store.kindFilter].sort(byCodePoint), [...kinds].sort(byCodePoint), `${label}: the store set`);
          assert.deepEqual(shown(target, 'data-run-id'), expect(listing.activeRuns), `${label}: active`);
          assert.deepEqual(
            shown(target, 'data-history-run-id'),
            expect(listing.history),
            `${label}: finished`
          );
          for (const kind of RUN_KINDS) {
            assert.equal(
              selectedOf(target, kind),
              String(kinds.includes(kind)),
              `${label}: ${kind} reads its own state`
            );
          }
        }
      }
    });

    it('keeps the status control exclusive inside the shown kinds', async () => {
      const { target } = await mountStore();
      await showOnly(target, ['crafting', 'salvage', 'alchemy']);
      const checked = () =>
        [...target.querySelectorAll(':scope [data-journal-status-filter] input:checked')].map(
          (input) => input.value
        );
      target.querySelector(':scope [data-journal-status-filter] input[value="ready"]').click();
      await settle();
      assert.deepEqual(checked(), ['ready']);
      assert.deepEqual(shown(target, 'data-run-id'), ['a-craft', 'a-salvage']);
      target.querySelector(':scope [data-journal-status-filter] input[value="paused"]').click();
      await settle();
      assert.deepEqual(checked(), ['paused'], 'choosing a second status releases the first');
      assert.deepEqual(shown(target, 'data-run-id'), ['a-brew']);
    });

    it('words an empty list as filtered while any kind is hidden, and as plain when none is', async () => {
      const partial = kindListing();
      partial.history = partial.history.filter((entry) => entry.activityKind !== 'alchemy');
      const { target } = await mountStore(partial);
      await showOnly(target, ['alchemy']);
      assert.match(
        target.querySelector('[data-journal-empty="history"]').textContent,
        /Empty\.MatchingHistory/u,
        'one kind shown over no run of it is a filtered empty'
      );
      harness.remount();

      const { target: allOn } = await mountStore({ ...kindListing(), activeRuns: [], history: [] });
      const plain = allOn.querySelector('[data-journal-empty="history"]').textContent;
      assert.match(plain, /Empty\.History/u, 'every kind shown over an empty journal is plain');
      assert.doesNotMatch(plain, /Matching/u);
    });

    it('names each option by its visible kind name, and the whole row ticks it', async () => {
      const { store, target } = await mountStore();
      const option = kindOption(target, 'gathering');
      assert.equal(option.getAttribute('role'), 'option');
      assert.match(
        option.querySelector('.journal-kind-name').textContent,
        /Kind\.Gathering/u,
        'the row names its kind'
      );
      assert.ok(!option.hasAttribute('aria-label'), 'named by its own content, not a hidden string');
      assert.ok(!option.hasAttribute('aria-labelledby'), 'and not by an id ref');
      option.click();
      await settle();
      assert.equal(selectedOf(target, 'gathering'), 'false', 'clicking the row unticks it');
      assert.ok(!store.kindFilter.includes('gathering'));
    });

    it('opens a multi-selectable list under a listbox trigger, with no query field', async () => {
      const { target } = await mountStore();
      const field = target.querySelector(':scope [data-journal-kind-filter]');
      assert.ok(Boolean(field), 'the control keeps its data-journal-kind-filter hook');
      assert.equal(field.dataset.journalKindShown, RUN_KINDS.join(' '));
      assert.equal(target.querySelectorAll('[data-journal-kind-toggle]').length, 0);
      const trigger = kindTrigger(target);
      assert.equal(trigger.tagName, 'BUTTON');
      assert.equal(trigger.getAttribute('aria-haspopup'), 'listbox');
      assert.equal(trigger.getAttribute('aria-expanded'), 'false');
      assert.equal(trigger.dataset.keyboardFocus, 'true');
      assert.ok(trigger.querySelector('i.fa-layer-group'), 'the trigger leads with the layers glyph');
      assert.ok(trigger.querySelector('i.fa-chevron-down'), 'and trails a closed chevron');
      assert.equal(summaryOf(target), `${KIND_KEY}All`, 'every kind shown reads as all of them');
      assert.equal(
        trigger.getAttribute('aria-label'),
        `${KIND_KEY}Name:${JSON.stringify({ label: `${KIND_KEY}Label`, summary: `${KIND_KEY}All` })}`,
        'named by the filter label plus its summary'
      );

      const panel = openKinds(target);
      assert.equal(trigger.getAttribute('aria-expanded'), 'true');
      assert.ok(trigger.querySelector('i.fa-chevron-up'), 'the chevron flips while open');
      assert.equal(panel.querySelectorAll('input').length, 0, 'four options need no search');
      const list = panel.querySelector('[role="listbox"]');
      assert.equal(list.getAttribute('aria-multiselectable'), 'true');
      assert.equal(list.getAttribute('aria-label'), `${KIND_KEY}Label`);
      assert.equal(trigger.getAttribute('aria-controls'), list.id);
      const rows = [...list.querySelectorAll('[data-journal-kind-option]')];
      assert.deepEqual(rows.map((row) => row.dataset.journalKindOption), RUN_KINDS, 'in label order');
      assert.deepEqual(
        rows.map((row) => row.querySelector('.journal-kind-glyph').classList[2]),
        ['fa-hammer', 'fa-leaf', 'fa-recycle', 'fa-flask']
      );
      for (const row of rows) {
        assert.equal(row.dataset.keyboardFocus, 'true');
        const box = row.querySelector('.fab-selection-check');
        assert.equal(box.getAttribute('aria-hidden'), 'true', 'the box only draws the row state');
        assert.ok(box.classList.contains('is-checked'));
      }
      const showAll = panel.querySelector('[data-journal-kind-show-all]');
      assert.equal(showAll.dataset.keyboardFocus, 'true');
      assert.match(showAll.textContent, /Kind\.ShowAll/u);
      assert.equal(showAll.disabled, true, 'nothing is hidden, so there is nothing to switch back on');
      assert.ok(
        list.querySelector('.fab-selection-check').classList.contains('is-sm'),
        'the row box is the compact density'
      );
    });

    it('filters both lists by two ticked kinds and summarises them in label order', async () => {
      const { store, target } = await mountStore();
      await showOnly(target, []);
      assert.equal(summaryOf(target), `${KIND_KEY}None`);
      chooseKind(target, 'salvage');
      chooseKind(target, 'crafting');
      await settle();
      assert.equal(kindTrigger(target).getAttribute('aria-expanded'), 'true', 'the panel stays open');
      assert.deepEqual([...store.kindFilter], ['crafting', 'salvage']);
      assert.equal(summaryOf(target), `${KIND_KEY}Crafting, ${KIND_KEY}Salvage`, 'label order');
      assert.equal(
        target.querySelector(':scope [data-journal-kind-filter]').dataset.journalKindShown,
        'crafting salvage',
        'the field hook carries the partial set, in label order'
      );
      assert.equal(
        openKinds(target).querySelector('[data-journal-kind-show-all]').disabled,
        false,
        'hidden kinds enable the footer'
      );
      assert.match(kindTrigger(target).getAttribute('aria-label'), /Kind\.Crafting, .*Kind\.Salvage/u);
      assert.deepEqual(shown(target, 'data-run-id'), ['a-craft', 'a-salvage']);
      assert.deepEqual(shown(target, 'data-history-run-id'), ['h-craft', 'h-salvage']);
      for (const kind of RUN_KINDS) {
        const ticked = ['crafting', 'salvage'].includes(kind);
        const row = kindOption(target, kind);
        assert.equal(row.getAttribute('aria-selected'), String(ticked), `${kind} row state`);
        assert.equal(row.querySelector('.fab-selection-check').classList.contains('is-checked'), ticked);
      }
    });

    it('clears the filter from "Show all run types", so every kind shows again', async () => {
      const { store, target, listing } = await mountStore();
      await showOnly(target, ['salvage']);
      openKinds(target).querySelector('[data-journal-kind-show-all]').click();
      await settle();
      assert.deepEqual([...store.kindFilter], RUN_KINDS);
      assert.equal(summaryOf(target), `${KIND_KEY}All`);
      assert.deepEqual(
        shown(target, 'data-run-id'),
        listing.activeRuns.map((run) => run.id).sort(byCodePoint)
      );
      assert.deepEqual(RUN_KINDS.map((kind) => selectedOf(target, kind)), ['true', 'true', 'true', 'true']);
    });

    it('counts each kind across both lists, before search and the kind filter narrow them', async () => {
      const listing = kindListing();
      listing.activeRuns.push(
        makeCraftingRun({ id: 'a-craft-2', key: 'active-a-craft-2', activityKind: 'crafting' })
      );
      listing.history = listing.history.filter((run) => run.activityKind !== 'alchemy');
      const { target } = await mountStore(listing);
      const counts = () =>
        RUN_KINDS.map((kind) =>
          openKinds(target).querySelector(`[data-journal-kind-count="${kind}"]`).textContent.trim()
        );
      assert.deepEqual(counts(), ['3', '2', '2', '1']);
      const search = target.querySelector(':scope [data-journal-search] input');
      search.value = 'silver';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await showOnly(target, ['gathering']);
      assert.deepEqual(counts(), ['3', '2', '2', '1'], 'the counts are the journal total, not the view');
    });

    it('closes on Escape and hands focus back to the trigger', async () => {
      const { target } = await mountStore();
      openKinds(target).querySelector('[data-journal-kind-show-all]').focus();
      assert.ok(document.activeElement !== kindTrigger(target), 'focus starts inside the panel');
      document.activeElement.dispatchEvent(
        new globalThis.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      );
      await settle();
      await settle();
      assert.ok(!target.querySelector(':scope .journal-kind-popover'), 'the panel closed');
      assert.equal(kindTrigger(target).getAttribute('aria-expanded'), 'false');
      assert.ok(document.activeElement === kindTrigger(target), 'focus is back on the trigger');
    });

    it('draws the empty state for both lists when no kind is shown', async () => {
      const { target } = await mountStore();
      await showOnly(target, []);
      for (const list of ['active', 'history']) {
        const empty = target.querySelector(`[data-journal-empty="${list}"]`);
        assert.ok(Boolean(empty), `the ${list} list draws its empty state`);
        assert.ok(empty.classList.contains('manager-empty'), 'through the shared EmptyState');
        assert.match(empty.textContent, /Empty\.Matching/u, 'and words it as a filtered empty');
      }
      assert.equal(target.querySelectorAll('[data-run-id], [data-history-run-id]').length, 0);
      assert.equal(target.querySelectorAll('.journal-run-list, .journal-history-list').length, 0);
    });
  });
});

// Mounted coverage for JournalView: loading / error / no-actor states, the
// populated 3-column layout, per-column empty states, the world-time footer, and
// run selection wiring through the shared store. JournalView consumes a
// services.journal store; the test passes a plain mock store implementing the
// getter/action surface (the production store is a runes factory, exercised
// separately in tests/stores/journal-store.test.js). Uses the shared harness with
// the FULL JournalView subtree registered so the suite cannot hang as
// `# cancelled`.
import { describe, it, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createMountedComponentHarness } from '../helpers/svelte-component-harness.js';
import { makeCraftingRun, makeGatheringRun, makeSucceededRun } from '../helpers/journal-fixtures.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-journal-view-',
  rawModules: [
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/formatDuration.js',
    'src/ui/svelte/util/worldTimeLabel.js',
    'src/systems/foundryCalendar.js',
    'src/ui/svelte/apps/journal/journalRunStatus.js'
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    'src/ui/svelte/apps/journal/RunStatusPill.svelte',
    'src/ui/svelte/apps/journal/JournalCard.svelte',
    'src/ui/svelte/apps/journal/JournalListShell.svelte',
    'src/ui/svelte/apps/journal/JournalFactRow.svelte',
    'src/ui/svelte/apps/journal/RunCard.svelte',
    'src/ui/svelte/apps/journal/ActiveRunsList.svelte',
    'src/ui/svelte/apps/journal/HistoryRow.svelte',
    'src/ui/svelte/apps/journal/HistoryList.svelte',
    'src/ui/svelte/apps/journal/StepTimeline.svelte',
    'src/ui/svelte/apps/journal/StepDetails.svelte',
    'src/ui/svelte/apps/journal/TimeRemainingBox.svelte',
    'src/ui/svelte/apps/journal/ActionsPanel.svelte',
    'src/ui/svelte/apps/journal/RecentResults.svelte',
    'src/ui/svelte/apps/journal/AboutThisRun.svelte',
    'src/ui/svelte/apps/journal/WhatToExpect.svelte',
    'src/ui/svelte/apps/journal/JournalTips.svelte',
    'src/ui/svelte/apps/journal/RunDetail.svelte',
    'src/ui/svelte/apps/journal/JournalView.svelte'
  ],
  componentPath: 'src/ui/svelte/apps/journal/JournalView.svelte'
});

function makeJournal(overrides = {}) {
  const calls = { select: [] };
  const store = {
    loading: false,
    error: false,
    listing: { selectedActorId: 'Actor.1' },
    worldTime: 0,
    activeRuns: [],
    historyPageItems: [],
    recentTerminalRuns: [],
    selectedRun: null,
    selectedRunId: '',
    historyCount: 0,
    historyPage: 0,
    historyPageSize: 6,
    historyPageSizes: [6, 12, 25],
    activeSort: 'soonestReady',
    historySort: 'newest',
    navCount: 0,
    loadedOnce: true,
    busyRunId: '',
    load() {},
    select(id) { calls.select.push(id); },
    setActiveSort() {},
    setHistorySort() {},
    setHistoryPage() {},
    setHistoryPageSize() {},
    advance() {},
    tickWorldTime() {},
    ...overrides
  };
  return { store, calls };
}

function makeServices(journal) {
  return { journal, actorBar: { selectedActorId: 'Actor.1' }, getWorldTimeComponents: () => null };
}

describe('JournalView mounted behavior', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('renders the loading state', async () => {
    const { store } = makeJournal({ loading: true });
    const target = await harness.mount({ services: makeServices(store) });
    assert.ok(target.querySelector('[data-journal-state="loading"]'), 'loading state shown');
  });

  it('renders the error state', async () => {
    const { store } = makeJournal({ error: true });
    const target = await harness.mount({ services: makeServices(store) });
    assert.ok(target.querySelector('[data-journal-state="error"]'), 'error state shown');
  });

  it('renders the no-actor empty state', async () => {
    const { store } = makeJournal({ listing: { selectedActorId: null } });
    const target = await harness.mount({ services: makeServices(store) });
    assert.ok(target.querySelector('[data-journal-state="empty"]'), 'no-actor empty state shown');
  });

  it('renders the populated 3-column layout with the footer', async () => {
    const run = makeCraftingRun();
    const { store } = makeJournal({
      activeRuns: [run],
      selectedRun: run,
      selectedRunId: run.id,
      historyPageItems: [makeSucceededRun()],
      historyCount: 1,
      recentTerminalRuns: [makeSucceededRun()],
      navCount: 1
    });
    const target = await harness.mount({ services: makeServices(store) });
    assert.ok(target.querySelector('[data-journal-state="populated"]'), 'populated grid shown');
    assert.ok(target.querySelector('.journal-view-column-left'), 'left column present');
    assert.ok(target.querySelector('.journal-view-column-center'), 'center column present');
    assert.ok(target.querySelector('.journal-view-column-right'), 'right column present');
    assert.ok(target.querySelector('[data-run-id="run-craft-1"]'), 'the active run card renders');
    assert.ok(target.querySelector('[data-journal-detail]'), 'the run detail renders in the centre');
    assert.ok(target.querySelector('[data-journal-card="recent"]'), 'recent results render on the right');
    assert.ok(target.querySelector('[data-journal-card="about"]'), 'about-this-run renders when a run is selected');
    // Right-column order (mockup): about → recent (about now precedes recent).
    const about = target.querySelector('[data-journal-card="about"]');
    const recent = target.querySelector('[data-journal-card="recent"]');
    assert.ok(
      about.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING,
      'about-this-run is ordered before recent results in the right column'
    );
    // A multi-step crafting run uses the standard crafting explainer, not the single-step variant.
    const expect = target.querySelector('.journal-view-column-right [data-journal-card="expect"]');
    assert.match(expect.textContent, /WhatToExpect\.Crafting\b/, 'multi-step run uses the standard crafting copy');
    assert.doesNotMatch(expect.textContent, /CraftingSingleStep/, 'not the single-step variant');
  });

  it('suppresses the step timeline and uses finish copy for a single-step run', async () => {
    const base = makeCraftingRun();
    const run = makeCraftingRun({
      id: 'run-single-1',
      multiStep: false,
      isFinalStep: true,
      stepLabel: '',
      structureLabel: 'Single-Step Recipe',
      steps: [base.steps[0]]
    });
    const { store } = makeJournal({ activeRuns: [run], selectedRun: run, selectedRunId: run.id });
    const target = await harness.mount({ services: makeServices(store) });

    const center = target.querySelector('.journal-view-column-center');
    assert.ok(!center.querySelector('[data-journal-timeline]'), 'no step timeline for a single-step run');
    // Only the structure chip renders — the blanked step-label chip is gone from the DOM.
    assert.equal(center.querySelectorAll('.journal-detail-tag').length, 1, 'only the structure chip remains');

    const trigger = target.querySelector('[data-journal-trigger]');
    assert.ok(trigger, 'the primary action button renders');
    assert.match(trigger.textContent, /FinishCrafting/, 'button uses the finish-crafting label');
    // Gated (worldTime 0 < availableAt): the time-gate card shows the finish hint.
    const gate = target.querySelector('[data-journal-time-remaining]');
    assert.ok(gate, 'the time-gate card renders while gated');
    assert.match(gate.textContent, /WhenPassedFinal/, 'gate hint uses the finish variant');
    // The right-column explainer switches to the single-step crafting copy.
    const expect = target.querySelector('.journal-view-column-right [data-journal-card="expect"]');
    assert.match(expect.textContent, /CraftingSingleStep/, 'what-to-expect uses the single-step copy');
  });

  it('uses finish copy on the last step of a multi-step run while keeping the timeline', async () => {
    // multiStep stays true (timeline shown) but the run is on its final step
    // (isFinalStep true) — proving the finish copy keys off isFinalStep, not !multiStep.
    const run = makeCraftingRun({ id: 'run-last-step', stepIndex: 1, isFinalStep: true });
    const { store } = makeJournal({ activeRuns: [run], selectedRun: run, selectedRunId: run.id });
    const target = await harness.mount({ services: makeServices(store) });

    const center = target.querySelector('.journal-view-column-center');
    assert.ok(center.querySelector('[data-journal-timeline]'), 'the multi-step timeline is still shown');
    assert.match(
      target.querySelector('[data-journal-trigger]').textContent,
      /FinishCrafting/,
      'the last step uses the finish-crafting label'
    );
    assert.match(
      target.querySelector('[data-journal-time-remaining]').textContent,
      /WhenPassedFinal/,
      'the last step gate uses the finish variant'
    );
  });

  it('keeps the gathering explainer for a gathering run (not the single-step crafting copy)', async () => {
    const run = makeGatheringRun();
    const { store } = makeJournal({ activeRuns: [run], selectedRun: run, selectedRunId: run.id });
    const target = await harness.mount({ services: makeServices(store) });
    const expect = target.querySelector('.journal-view-column-right [data-journal-card="expect"]');
    assert.match(expect.textContent, /WhatToExpect\.Gathering/, 'gathering run keeps the gathering copy');
    assert.doesNotMatch(expect.textContent, /CraftingSingleStep/, 'gathering never mis-routes to the single-step copy');
  });

  it('shows per-column empty states when there are no active or history runs', async () => {
    const { store } = makeJournal({ activeRuns: [], historyPageItems: [], historyCount: 0 });
    const target = await harness.mount({ services: makeServices(store) });
    assert.ok(target.querySelector('[data-journal-empty="active"]'), 'no-active-runs empty state shown');
    assert.ok(target.querySelector('[data-journal-empty="history"]'), 'no-history empty state shown');
    assert.ok(target.querySelector('[data-journal-empty="detail"]'), 'no-run-selected empty state shown');
  });

  it('routes a run-card click to the store select action', async () => {
    const run = makeCraftingRun();
    const { store, calls } = makeJournal({ activeRuns: [run] });
    const target = await harness.mount({ services: makeServices(store) });
    target.querySelector('[data-run-id="run-craft-1"]').click();
    assert.deepEqual(calls.select, ['run-craft-1'], 'clicking the card calls store.select with the run id');
  });
});

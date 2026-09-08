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
import { flushSync } from '../../node_modules/svelte/src/index-client.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  SELECT_COMPILED_MODULES,
  STATUS_TONE_RAW_MODULES,
  createMountedComponentHarness,
  PLAYER_APP_COMPILED_MODULES,
} from '../helpers/svelte-component-harness.js';
import { makeCraftingRun, makeGatheringRun, makeSucceededRun } from '../helpers/journal-fixtures.js';
import { assertViewErrorTreatment } from '../helpers/playerViewStateAssertions.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-journal-view-',
  rawModules: [
    // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
    ...SEARCHABLE_POPOVER_RAW_MODULES,
    'src/ui/svelte/util/foundryBridge.js',
    'src/ui/svelte/util/listReorderAnnouncement.js',
    'src/ui/svelte/util/formatDuration.js',
    'src/ui/svelte/util/worldTimeLabel.js',
    'src/systems/foundryCalendar.js',
    'src/ui/svelte/apps/journal/journalRunStatus.js',
    // Issue 1506: the run's status is a `<Chip>` now, and the chip tone it wears comes from
    // the ONE map the retired status vocabularies were routed through.
    ...STATUS_TONE_RAW_MODULES
  ],
  compiledModules: [
    'src/ui/svelte/components/Pagination.svelte',
    // Issue 1504: the shared `<Select>`'s whole compiled closure, spread rather than copied.
    ...SELECT_COMPILED_MODULES,
    'src/ui/svelte/components/IconButton.svelte',
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
    // The ONE not-yet-ready chrome the five player views draw (issue 1514), the strip its error
    // branch composes, and the tile, track, label and no-state panel this tree adopted in the
    // same issue's third phase — as ONE spread. The claim that stood here, "this tree reaches
    // neither `Kicker` nor `Notice`", is retired by the commit that falsified half of it:
    // `JournalCard`'s title IS a `Kicker` now. An omission CANCELS this suite rather than
    // failing it.
    ...PLAYER_APP_COMPILED_MODULES,
    'src/ui/svelte/apps/journal/JournalView.svelte'
  ],
  // THE PRODUCTION HOST IS THE PLAYER WINDOW (issue 1504, decision YY). This tree renders a
  // `Pagination`, whose page-size control is a shared `<Select>` now, and a picker resolves its
  // portal host by walking up to the nearest Fabricate application root. `rootClass` IS that
  // host: on the `fabricate-manager` default the panel would portal to a root no production
  // mount of this component can reach, and every `target.querySelector` for a row would miss.
  rootClass: 'fabricate-app',
  componentPath: 'src/ui/svelte/apps/journal/JournalView.svelte'
});

function makeJournal(overrides = {}) {
  const calls = { select: [], cancel: [] };
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
    cancel(run) { calls.cancel.push(run?.id ?? run); },
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

  it('announces the loading root as busy, and does not once the view is ready', async () => {
    // Asserted on the RENDERED DOM (issue 1514): a composition that declares `aria-busy` and
    // stops rendering it passes every source-text reader, and the negative half is what makes
    // the attribute mean the loading state rather than the component.
    const { store: loadingStore } = makeJournal({ loading: true });
    const loading = await harness.mount({ services: makeServices(loadingStore) });
    const loadingRoot = loading.querySelector('[data-journal-state="loading"]');
    assert.equal(loadingRoot.getAttribute('aria-busy'), 'true', 'the loading root is busy');
    assert.ok(
      loadingRoot.textContent.includes('FABRICATE.App.Journal.Loading'),
      'and a VISIBLE label states what is loading'
    );

    harness.remount();
    const { store: readyStore } = makeJournal({});
    const ready = await harness.mount({ services: makeServices(readyStore) });
    assert.ok(ready.querySelector('[data-journal-state="populated"]'), 'the ready view is populated');
    assert.ok(!ready.querySelector('[aria-busy]'), 'nothing in the ready view claims to be busy');
  });

  it('renders the error state', async () => {
    const { store } = makeJournal({ error: true });
    const target = await harness.mount({ services: makeServices(store) });
    assert.ok(target.querySelector('[data-journal-state="error"]'), 'error state shown');
    assertViewErrorTreatment(target.querySelector('[data-journal-state="error"]'), {
      view: 'journal view',
      message: 'FABRICATE.App.Journal.Error'
    });
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

  it('shows an owner-only cancel affordance that confirms then routes to store.cancel', async () => {
    // A discovered, owned, in-progress crafting run offers the player cancel (issue 848).
    const run = makeCraftingRun({ canCancel: true, refundOnCancel: true });
    const { store, calls } = makeJournal({ activeRuns: [run], selectedRun: run, selectedRunId: run.id });
    const target = await harness.mount({ services: makeServices(store) });

    const startBtn = target.querySelector('[data-journal-cancel-start]');
    assert.ok(startBtn, 'the cancel-craft button renders for an owned in-progress run');
    // No cancel is issued until the player confirms.
    startBtn.click();
    flushSync();
    assert.equal(calls.cancel.length, 0, 'the first click only reveals the confirm step');
    const prompt = target.querySelector('[data-journal-cancel-prompt]');
    assert.ok(prompt, 'the confirm prompt appears');
    assert.match(prompt.textContent, /CancelConfirmRefund/, 'refund-on run explains inputs return');

    target.querySelector('[data-journal-cancel-confirm]').click();
    flushSync();
    assert.deepEqual(calls.cancel, [run.id], 'confirming routes to store.cancel with the run');
  });

  it('lets the player back out of a cancel with "keep crafting" (no cancel issued)', async () => {
    const run = makeCraftingRun({ canCancel: true, refundOnCancel: false });
    const { store, calls } = makeJournal({ activeRuns: [run], selectedRun: run, selectedRunId: run.id });
    const target = await harness.mount({ services: makeServices(store) });

    target.querySelector('[data-journal-cancel-start]').click();
    flushSync();
    // A forfeit system warns that inputs will NOT return.
    assert.match(
      target.querySelector('[data-journal-cancel-prompt]').textContent,
      /CancelConfirmForfeit/,
      'refund-off run warns inputs are forfeit'
    );
    target.querySelector('[data-journal-cancel-keep]').click();
    flushSync();
    assert.equal(calls.cancel.length, 0, 'backing out issues no cancel');
    assert.ok(!target.querySelector('[data-journal-cancel-prompt]'), 'the confirm step is dismissed');
  });

  it('hides the cancel affordance for a run the player does not own', async () => {
    const run = makeCraftingRun({ canCancel: false });
    const { store } = makeJournal({ activeRuns: [run], selectedRun: run, selectedRunId: run.id });
    const target = await harness.mount({ services: makeServices(store) });
    assert.ok(!target.querySelector('[data-journal-cancel]'), 'no cancel affordance for a not-owned run');
    // The advance button still renders — only the cancel affordance is gated.
    assert.ok(target.querySelector('[data-journal-trigger]'), 'the advance button is unaffected');
  });

  it('routes a run-card click to the store select action', async () => {
    const run = makeCraftingRun();
    const { store, calls } = makeJournal({ activeRuns: [run] });
    const target = await harness.mount({ services: makeServices(store) });
    target.querySelector('[data-run-id="run-craft-1"]').click();
    assert.deepEqual(calls.select, ['run-craft-1'], 'clicking the card calls store.select with the run id');
  });
});

/**
 * The Journal tab's adoption of the shared tile, bar, label, no-state panel and standing
 * statement (issue 1514, phase 3).
 *
 * Every assertion here is on the RENDERED DOM rather than on the source text, because the
 * failure this phase is exposed to is a component that keeps its import and stops emitting
 * what the import is for. A source grep for `<Medallion` cannot see a tile that renders at
 * the wrong size, an ARIA attribute that moved off the wrapper it was supposed to stay on,
 * or a hook whose dynamic value stopped being forwarded.
 */
describe('JournalView primitive adoption (issue 1514)', () => {
  before(() => harness.setup());
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  /** Mount the populated three-column layout with a selected, gated, succeeded-history run. */
  async function mountPopulated(overrides = {}) {
    const run = makeCraftingRun();
    const { store } = makeJournal({
      activeRuns: [run],
      selectedRun: run,
      selectedRunId: run.id,
      historyPageItems: [makeSucceededRun()],
      historyCount: 1,
      recentTerminalRuns: [makeSucceededRun()],
      navCount: 1,
      ...overrides
    });
    return harness.mount({ services: makeServices(store) });
  }

  /** The medallion's rendered edge length, read off the `style` attribute it composes. */
  function medallionSize(tile) {
    return /width:\s*(\d+)px/.exec(tile?.getAttribute('style') ?? '')?.[1] ?? '';
  }

  it('draws every record thumb as the shared tile, at the size its row already rendered', async () => {
    const target = await mountPopulated();
    const sizes = {
      'the active run card': medallionSize(
        target.querySelector('.journal-run-card-main .fab-medallion')
      ),
      'the history row': medallionSize(
        target.querySelector('.journal-history-row .fab-medallion')
      ),
      'the recent-results row': medallionSize(
        target.querySelector('.journal-recent-item .fab-medallion')
      ),
      'the run detail header': medallionSize(
        target.querySelector('.journal-detail-header .fab-medallion')
      )
    };
    assert.deepEqual(
      sizes,
      {
        'the active run card': '64',
        'the history row': '40',
        'the recent-results row': '28',
        'the run detail header': '64'
      },
      'a CONVERSION preserves the rendered size; these are the four the raw `<img>` rules drew'
    );
  });

  it('draws the succeeded run detail result thumb as the tile at 24, inside its image branch', async () => {
    const succeeded = makeSucceededRun();
    const { store } = makeJournal({
      historyPageItems: [succeeded],
      historyCount: 1,
      selectedRun: succeeded,
      selectedRunId: succeeded.id
    });
    const target = await harness.mount({ services: makeServices(store) });
    const results = target.querySelector('[data-journal-results]');
    assert.ok(Boolean(results), 'the succeeded run lists its created results');
    assert.equal(
      medallionSize(results.querySelector('.fab-medallion')),
      '24',
      'the result tile keeps the 24px box its own rule drew'
    );
  });

  it('keeps the progressbar role and its values on the CALLER, with the shared bar inside', async () => {
    const target = await mountPopulated();
    const wrapper = target.querySelector('.journal-run-card-progress');
    assert.ok(Boolean(wrapper), 'the gated run card draws a progress track');
    assert.equal(wrapper.getAttribute('role'), 'progressbar', 'the ROLE stays on the caller');
    assert.deepEqual(
      {
        min: wrapper.getAttribute('aria-valuemin'),
        max: wrapper.getAttribute('aria-valuemax'),
        now: wrapper.getAttribute('aria-valuenow')
      },
      { min: '0', max: '100', now: '0' },
      'all three aria-value* attributes stay on the caller — FillBar declares none of its own'
    );
    const bar = wrapper.querySelector('.fab-fill-bar');
    assert.ok(Boolean(bar), 'the track itself is the shared bar');
    assert.ok(bar.classList.contains('is-sm'), 'at the 6px rung the hand-rolled track drew');
    assert.equal(
      bar.getAttribute('data-fill-bar-tone'),
      'accent',
      'the accent fill the hand-rolled `.journal-run-card-progress-fill` painted'
    );
  });

  it('draws every titled card heading as the shared kicker, still on an h3', async () => {
    const target = await mountPopulated();
    const headings = [...target.querySelectorAll('[data-journal-card] > .fab-kicker')];
    assert.ok(headings.length >= 3, 'the right column draws several titled cards');
    assert.deepEqual(
      [...new Set(headings.map((heading) => heading.tagName.toLowerCase()))],
      ['h3'],
      'the kicker renders `h3`, so the card titles keep their place in the document outline'
    );
    assert.ok(
      !target.querySelector('.journal-card-title'),
      'the hand-rolled title class is gone rather than left beside the primitive'
    );
  });

  it('draws each list column empty as the shared panel, forwarding its DYNAMIC hook value', async () => {
    const { store } = makeJournal({ activeRuns: [], historyPageItems: [], historyCount: 0 });
    const target = await harness.mount({ services: makeServices(store) });
    for (const kind of ['active', 'history']) {
      const panel = target.querySelector(`[data-journal-empty="${kind}"]`);
      assert.ok(Boolean(panel), `the ${kind} column states its emptiness`);
      assert.ok(
        panel.classList.contains('manager-empty'),
        `the ${kind} empty is the shared panel, not a hand-rolled block`
      );
      assert.ok(
        panel.classList.contains('is-compact'),
        `the ${kind} empty takes the compact density its half-column affords`
      );
    }
    const detail = target.querySelector('[data-journal-empty="detail"]');
    assert.ok(
      detail.classList.contains('manager-empty'),
      'the centre column empty is the shared panel too, at its EXACT hook value'
    );
    // AND IT PASSES `title`, LIKE THE OTHER FOUR HERO EMPTIES (issue 1514). This is a
    // screen-level empty standing in for the whole centre column, which is what the base
    // variant is for; `hint` alone renders a 46px tile over an 11px subtle line in a
    // full-height fill with no statement above it. The objection to `title` belongs to the
    // pane one-liners, which take `note` and render no heading at all.
    assert.ok(
      Boolean(detail.querySelector('h3')),
      'the centre-column hero empty states its sentence as the panel TITLE, not as the hint ' +
        'line beneath a title that is not there'
    );
    assert.ok(
      !detail.querySelector('p'),
      'and it renders no second line, because the sentence is the statement rather than a ' +
        'gloss on one'
    );
  });

  it('draws the world-time gate as the shared standing statement at the warning tone', async () => {
    const target = await mountPopulated();
    const box = target.querySelector('[data-journal-time-remaining]');
    assert.ok(Boolean(box), 'a gated run states when it becomes available');
    assert.ok(box.classList.contains('manager-callout'), 'it is the shared callout');
    assert.equal(box.getAttribute('data-callout-tone'), 'warning', 'at the amber tone it drew');
    assert.match(
      box.textContent,
      /TimeRemaining\.WhenPassed/,
      'the "ready once time passes" line is the callout body'
    );
  });
});

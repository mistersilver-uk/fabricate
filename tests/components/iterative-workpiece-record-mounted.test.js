// Mounted coverage for a closed iterative run's history (issue 3011, D-13): the lab's real
// `workpiece` runs driven to their step end by the lab's own resolver, built by the real
// `RunJournalBuilder` and drawn by `RunDetail`, with the verdict a press froze handed in.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { iterativeStepEndVerdict } from '../../src/ui/presenters/iterative/iterativeVerdict.js';
import {
  WORKPIECE_GM,
  WORKPIECE_NOW,
  installWorkpieceEnv,
  workpieceListing,
  workpieceLocalize,
  workpieceModel,
  workpieceRuns,
} from '../helpers/iterativeJournalListing.js';
import {
  RUN_DETAIL_COMPILED_MODULES,
  RUN_DETAIL_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';
import {
  HIDDEN_COUNTER,
  ITERATIVE_SCENARIOS,
  applyAttempt,
} from '../view-lab/world/labIterativeRuns.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-workpiece-record-',
  rawModules: [...RUN_DETAIL_RAW_MODULES],
  compiledModules: [...RUN_DETAIL_COMPILED_MODULES],
  componentPath: 'src/ui/svelte/apps/journal/RunDetail.svelte',
});

const HIT = Object.freeze({ success: true, outcomeId: 'success', value: 14 });

/**
 * A state's run before and after one press of `actionId` ends its step: the active model the
 * press was drawn from, the closed model the reload lists, and the verdict the store freezes.
 */
function ended(state, actionId, options = {}) {
  const runs = workpieceRuns(state);
  const runId = ITERATIVE_SCENARIOS[state].runId;
  const listed = () =>
    workpieceListing({ active: Object.values(runs.active), history: runs.history, ...options });
  const pressed = listed().activeRuns.find((entry) => entry.id === runId);
  const reply = applyAttempt({
    container: runs,
    run: runs.active[runId],
    actionId,
    attemptId: 'iw-record-press',
    check: HIT,
    now: WORKPIECE_NOW,
  });
  const closed = listed().history.find((entry) => entry.id === runId);
  const counters = closed.iterative.counters.map(({ counterId, label, value }) => ({
    counterId,
    label,
    value,
  }));
  const verdict = iterativeStepEndVerdict(
    pressed.iterative,
    { stepEnd: reply.iterative.stepEnd, counters },
    workpieceLocalize
  );
  return { closed, verdict };
}

/** A journal that left `run` selected after the press that ended it, or `transient: false`. */
function journalFor(run, { verdict = null, transient = true } = {}) {
  const asked = [];
  return {
    asked,
    busyRunKey: '',
    busyRunId: '',
    commandError: null,
    commandResult: transient ? { runKey: run.key } : null,
    iterative: {
      noticeFor: () => null,
      verdictFor: (target) => {
        asked.push(target.id);
        return verdict;
      },
    },
  };
}

const mount = (run, journal = journalFor(run, { transient: false })) =>
  harness.mount({ run, journal, services: { getWorldTimeComponents: () => null } });
const query = (root, selector) => root.querySelector(selector);
const all = (root, selector) => [...root.querySelectorAll(selector)];
const before_ = (a, b) => Boolean(a.compareDocumentPosition(b) & 4);

/** What the closed record never draws: the step browser, action cards and the route strip. */
function assertNoLiveParts(root) {
  for (const selector of [
    '[data-stage-nav]',
    '[data-iterative-action]',
    '[data-outcome-ladder]',
    '[data-workpiece]',
  ])
    assert.ok(!query(root, selector), `${selector} is not drawn on a record`);
}

describe('A closed iterative record', () => {
  before(async () => {
    await harness.setup();
    installWorkpieceEnv();
  });
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('states the frozen verdict and its yields on the entry the ending press left selected', async () => {
    const { closed, verdict } = ended('iterative-finished', 'fitHilt');
    const journal = journalFor(closed, { verdict });
    const root = await mount(closed, journal);
    const notice = query(root, '[data-journal-verdict]');
    assert.equal(notice.getAttribute('data-journal-verdict'), 'succeeded');
    assert.equal(notice.getAttribute('data-notice-tone'), 'success');
    assert.match(notice.textContent, /Step 1 succeeded: Spearhead/);
    assert.match(notice.textContent, /The workpiece is finished\./);
    assert.ok(Boolean(query(notice, '.fa-flag-checkered')), 'the verdict keeps its glyph');
    const yields = all(notice, '[data-list-row]');
    assert.equal(yields.length, 1, 'the set it gives is one dense row');
    assert.match(yields[0].textContent, /Spearhead/);
    assert.ok(yields[0].textContent.includes('Quantity'), 'the row states its quantity');
    assert.match(query(yields[0], 'img').getAttribute('src'), /\S/, 'and draws its art');
    assert.ok(
      Boolean(query(notice, '.fab-notice-evidence')),
      'the yields sit in the evidence band'
    );
    assert.deepEqual(journal.asked, [closed.id]);
    // The verdict's yields own the produced rows, so Crafted is not drawn a second time.
    assert.ok(!query(root, '[data-history-items="produced"]'), 'Crafted is not drawn twice');
    assert.ok(!query(root, '[data-history-items="transient-produced"]'), 'not in the banner');
  });

  it('states a failed step with its set, and its bar full and in danger', async () => {
    const { closed, verdict } = ended('iterative-failed', 'hammer');
    const root = await mount(closed, journalFor(closed, { verdict }));
    const notice = query(root, '[data-journal-verdict]');
    assert.equal(notice.getAttribute('data-notice-tone'), 'danger');
    assert.match(notice.textContent, /Draw out the edge failed: Slag/);
    assert.match(
      notice.textContent,
      /Integrity reached 0 before Shape reached 100\. The step has failed and leaves Slag\./
    );
    assert.equal(all(notice, '[data-list-row]').length, 1);
    const bars = all(root, '[data-iterative-record] [role="progressbar"]');
    assert.equal(bars.length, 2, 'one inert bar per step');
    assert.equal(bars[1].getAttribute('aria-valuenow'), '100', 'the failed bar is drawn full');
    assert.match(bars[1].getAttribute('aria-valuetext'), /StageBars\.Failed/);
    assert.equal(
      all(root, '[data-iterative-record] [data-stage-bars-state="danger"]').length,
      1,
      'only the failed step is in danger'
    );
    assertNoLiveParts(root);
  });

  it('states a failed step that leaves nothing with no yield rows', async () => {
    const { closed, verdict } = ended('iterative-failed-nothing', 'hammer');
    const root = await mount(closed, journalFor(closed, { verdict }));
    const notice = query(root, '[data-journal-verdict]');
    assert.match(notice.textContent, /Rough out the blade failed/);
    assert.match(notice.textContent, /The step has failed and nothing is produced\./);
    assert.ok(!query(notice, '[data-list-row]'), 'nothing is produced, so no yield is listed');
    assert.ok(!query(notice, '.fab-notice-evidence'), 'no empty evidence band');
  });

  it('reads the shipped verdict text on a later open, with no rule text', async () => {
    const { closed, verdict } = ended('iterative-failed', 'hammer');
    const root = await mount(closed, journalFor(closed, { verdict, transient: false }));
    const notice = query(root, '[data-journal-verdict]');
    assert.match(notice.textContent, /FABRICATE\.App\.Journal\.Verdict\.failed/);
    assert.doesNotMatch(root.textContent, /before Shape reached/);
    assert.ok(!query(notice, '[data-list-row]'), 'the frozen yields went with the verdict');
  });

  it('falls back to the shipped banner when no verdict was frozen', async () => {
    const { closed } = ended('iterative-failed', 'hammer');
    const root = await mount(closed, journalFor(closed, { verdict: null }));
    assert.match(
      query(root, '[data-journal-verdict]').textContent,
      /FABRICATE\.App\.Journal\.Verdict\.failed/
    );
  });

  it('adds the final counters, the sessions and the bars after the receipts, before This run', async () => {
    const run = workpieceModel('iterative-record');
    const root = await mount(run);
    assert.ok(!query(root, '[data-journal-verdict]'), 'a reopened success states no verdict');
    assert.ok(
      Boolean(query(root, '[data-history-items="produced"]')),
      'a reopened record keeps Crafted'
    );
    const order = [
      '[data-iterative-record] [data-iterative-counter]',
      '[data-iterative-record] [data-iterative-sessions]',
      '[data-iterative-record] [data-run-progress]',
      '[data-journal-this-run]',
      '[data-journal-guidance]',
    ].map((selector) => {
      const element = query(root, selector);
      assert.ok(Boolean(element), `${selector} is drawn`);
      return element;
    });
    for (const [index, element] of order.slice(1).entries())
      assert.ok(before_(order[index], element), `${index} precedes ${index + 1}`);
    const receipts = query(root, '[data-history-items]');
    assert.ok(before_(receipts, order[0]), 'the receipts come first');
    assert.deepEqual(
      all(root, '[data-iterative-counter]').map((element) => element.dataset.iterativeCounter),
      ['shape', 'finish', 'integrity', 'heat']
    );
    assert.ok(!query(root, '[data-iterative-record] .fab-meter'), 'a record draws no meter');
    assert.equal(
      query(root, '[data-iterative-sessions]').getAttribute('data-iterative-rows'),
      String(run.iterative.sessions.length)
    );
    assert.match(query(root, '[data-player-detail-header]').textContent, /1 session/);
    assertNoLiveParts(root);
  });

  it('keeps a hidden counter from a player and marks it for the GM', async () => {
    const { closed: player, verdict } = ended('iterative-failed', 'hammer');
    const sentinels = [HIDDEN_COUNTER.label, HIDDEN_COUNTER.id, String(HIDDEN_COUNTER.value)];
    const root = await mount(player);
    const record = query(root, '[data-iterative-record]');
    for (const sentinel of sentinels)
      assert.ok(!root.outerHTML.includes(sentinel), `${sentinel} stays hidden on a later open`);
    assert.match(record.textContent, /1 counter is hidden by the GM\./);
    await harness.remount();
    const frozenRoot = await mount(player, journalFor(player, { verdict }));
    assert.ok(
      Boolean(query(frozenRoot, '[data-journal-verdict] [data-list-row]')),
      'verdict drawn'
    );
    for (const sentinel of sentinels)
      assert.ok(
        !frozenRoot.outerHTML.includes(sentinel),
        `${sentinel} stays hidden in the verdict`
      );
    await harness.remount();
    const gm = ended('iterative-failed', 'hammer', { viewer: WORKPIECE_GM }).closed;
    const gmRoot = await mount(gm);
    const hidden = query(gmRoot, `[data-iterative-counter="${HIDDEN_COUNTER.id}"]`);
    assert.ok(Boolean(hidden), 'the GM sees the hidden counter');
    assert.match(hidden.textContent, /Counter\.Hidden/);
    assert.doesNotMatch(query(gmRoot, '[data-iterative-record]').textContent, /hidden by the GM/);
  });

  it('draws no sessions table for a record with no attempts', async () => {
    const run = workpieceModel('iterative-record', {
      mutate: (target) => {
        target.status = 'cancelled';
        target.steps[0].iterative.log = [];
        target.steps[0].iterative.compacted = null;
      },
    });
    assert.equal(run.iterative.sessions.length, 0, 'the fixture lists no attempt');
    const root = await mount(run);
    assert.ok(Boolean(query(root, '[data-iterative-record]')), 'the record is drawn');
    assert.ok(!query(root, '[data-iterative-sessions]'), 'no empty table invites a first action');
  });

  it('draws neither the frozen verdict nor the record on a GM-closed or recovery run', async () => {
    const { closed, verdict } = ended('iterative-failed', 'hammer');
    const withRecovery = (status, extra = {}) => ({
      ...closed,
      recoveryEvidence: { status, required: false, effects: [], ...extra },
    });
    for (const run of [
      withRecovery('gmClosed'),
      withRecovery('recoveryRequired', { required: true }),
    ]) {
      const root = await mount(run, journalFor(run, { verdict }));
      assert.ok(!query(root, '[data-journal-verdict]'), `${run.recoveryEvidence.status} verdict`);
      assert.ok(!query(root, '[data-iterative-record]'), `${run.recoveryEvidence.status} record`);
      await harness.remount();
    }
  });

  it('draws a hidden caption with no visible counter, and no grid without either', async () => {
    const run = workpieceModel('iterative-record');
    const withHidden = (hidden) => ({
      ...run,
      iterative: { ...run.iterative, counters: [], meta: { ...run.iterative.meta, hidden } },
    });
    const record = query(
      await mount(withHidden('3 counters are hidden by the GM.')),
      '[data-iterative-record]'
    );
    assert.match(record.textContent, /3 counters are hidden by the GM\./);
    assert.equal(all(record, '[data-iterative-counter]').length, 0);
    await harness.remount();
    const bare = await mount(withHidden(''));
    assert.ok(!query(bare, '.counter-section-grid'), 'no counters and no caption draw no section');
  });

  it('draws the table for a log compacted to nothing, saying how many are not listed', async () => {
    const run = workpieceModel('iterative-record');
    const cut = { ...run, iterative: { ...run.iterative, sessions: [], compactedCount: 3 } };
    const table = query(await mount(cut), '[data-iterative-sessions]');
    assert.ok(Boolean(table), 'a compacted-only log still draws its table');
    assert.match(table.textContent, /Sessions\.EarlierMany/);
  });

  it('returns the table to its first page on another run', async () => {
    const run = workpieceModel('iterative-record');
    const sessions = Array.from({ length: 8 }, (_, index) => ({
      ...run.iterative.sessions[0],
      attempt: index + 1,
      sessionNumber: index + 1,
    }));
    const long = { ...run, iterative: { ...run.iterative, sessions } };
    const root = await mount(long);
    const rows = () => all(root, '[data-iterative-sessions] tbody tr');
    assert.equal(rows().length, 5, 'five a page');
    query(root, '[data-iterative-sessions] [data-pagination-next]').click();
    await new Promise((done) => setTimeout(done, 0));
    assert.equal(rows().length, 3, 'the second page');
    const other = { ...long, key: 'another-run' };
    await harness.setProps({ run: other, journal: journalFor(other, { transient: false }) });
    await new Promise((done) => setTimeout(done, 0));
    assert.equal(rows().length, 5, 'another run starts on its first page');
  });

  it('names the counters and the bars', async () => {
    const record = query(
      await mount(workpieceModel('iterative-record')),
      '[data-iterative-record]'
    );
    assert.match(record.textContent, /Workpiece\.Kicker/);
    assert.match(query(record, '[data-run-progress]').textContent, /Progress\.Label/);
  });

  it('draws the focus bar of a cancelled mid-step record empty', async () => {
    const base = workpieceModel('iterative-record');
    const stages = base.iterative.progress.stages.map((stage, index) =>
      index === base.iterative.focusStepIndex ? { ...stage, status: 'inProgress' } : stage
    );
    const run = {
      ...base,
      status: 'cancelled',
      derivedStatus: 'cancelled',
      iterative: { ...base.iterative, progress: { ...base.iterative.progress, stages } },
    };
    const bars = all(await mount(run), '[data-iterative-record] [role="progressbar"]');
    assert.equal(bars[run.iterative.focusStepIndex].getAttribute('aria-valuenow'), '0');
  });
});

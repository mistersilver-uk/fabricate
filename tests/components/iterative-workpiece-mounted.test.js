// Mounted coverage for the Workpiece view (issue 3011, D-5 to D-11): an active iterative run's
// detail, built from the lab's real `workpiece` runs by the real `RunJournalBuilder`, acted on
// through its own controls against a journal whose iterative store is a recording fake.
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it, before, after, afterEach } from 'node:test';

import { iterativeFocusTarget } from '../../src/ui/presenters/iterative/iterativeFocusTarget.js';
import {
  resultNotice,
  resumeNotice,
  verdictNotice,
} from '../../src/ui/presenters/iterative/iterativeNotice.js';
import {
  WORKPIECE_GM,
  installWorkpieceEnv,
  workpieceLocalize,
  workpieceModel,
} from '../helpers/iterativeJournalListing.js';
import { primaryButtons } from '../helpers/playerDetailHeaderAssertions.js';
import {
  RUN_DETAIL_COMPILED_MODULES,
  RUN_DETAIL_RAW_MODULES,
  createMountedComponentHarness,
} from '../helpers/svelte-component-harness.js';

const repoRoot = resolve(import.meta.dirname, '../..');

const harness = createMountedComponentHarness({
  repoRoot,
  tmpPrefix: 'fabricate-workpiece-',
  rawModules: [...RUN_DETAIL_RAW_MODULES],
  compiledModules: [...RUN_DETAIL_COMPILED_MODULES],
  componentPath: 'src/ui/svelte/apps/journal/RunDetail.svelte',
});

/** A journal whose iterative store records what the view asks of it. */
function journalFor(run, { notice = null, pressed = null, busy = false, settled = null } = {}) {
  const calls = { takeAction: [], beginStep: [], cancel: [] };
  return {
    calls,
    busyRunKey: busy ? run.key : '',
    busyRunId: '',
    commandError: null,
    cancel: (target) => {
      calls.cancel.push(target.id);
    },
    iterative: {
      pressed,
      settled,
      noticeFor: (target) => (target?.key === run.key ? notice : null),
      takeAction: async (_target, actionId) => {
        calls.takeAction.push(actionId);
      },
      beginStep: async (target) => {
        calls.beginStep.push(target.id);
      },
      isOtherWindow: (_target, row) => row.requestId === 'foreign',
      focusTarget: iterativeFocusTarget,
    },
  };
}

const services = (extra = {}) => ({ getWorldTimeComponents: () => null, ...extra });
const mount = (run, journal = journalFor(run), extra = {}) =>
  harness.mount({ run, journal, services: services(extra) });
const query = (root, selector) => root.querySelector(selector);
const all = (root, selector) => [...root.querySelectorAll(selector)];
const card = (root, id) => query(root, `[data-iterative-action="${id}"]`);
const click = async (element) => {
  element.click();
  await harness.setProps({});
};
const before_ = (a, b) => Boolean(a.compareDocumentPosition(b) & 4);
const K = (key) => `FABRICATE.App.Journal.Iterative.${key}`;

describe('The Workpiece view', () => {
  before(async () => {
    await harness.setup();
    installWorkpieceEnv();
  });
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  it('replaces the stages, time, yield and TIME/CHECK pair, in the specified order', async () => {
    const run = workpieceModel('iterative-resume');
    const notice = resumeNotice(run.iterative, workpieceLocalize);
    const root = await mount(run, journalFor(run, { notice }));
    const order = [
      '[data-player-detail-header]',
      '[data-iterative-notice="resume"]',
      '[data-run-progress]',
      '[data-stage-nav]',
      '[data-iterative-step-card]',
      '[data-iterative-sessions]',
      '[data-journal-this-run]',
      '[data-journal-guidance]',
    ].map((selector) => {
      const element = query(root, selector);
      assert.ok(Boolean(element), `${selector} is drawn`);
      return element;
    });
    for (const [index, element] of order.slice(1).entries()) {
      assert.ok(before_(order[index], element), `${index} precedes ${index + 1}`);
    }
    for (const gone of ['[data-journal-stages]', '[data-journal-summary]', '[data-time-remaining]'])
      assert.ok(!query(root, gone), `${gone} is not drawn for a workpiece`);
    assert.equal(
      query(root, '[data-journal-guidance]').textContent.trim(),
      'FABRICATE.App.Journal.WhatToExpect.Iterative'
    );
    const meta = query(root, '[data-player-detail-header]').textContent;
    assert.match(meta, /Step 1 of 2/);
    assert.match(meta, /Session 4 next/);
  });

  it('shows the idle state in the notice slot when no notice applies', async () => {
    const run = workpieceModel('iterative-resume');
    const root = await mount(run);
    const idle = query(root, '[data-workpiece] [data-iterative-idle]');
    assert.ok(Boolean(idle), 'the idle state is drawn');
    assert.match(idle.textContent, /Iterative\.Notice\.Idle/);
    assert.ok(!query(root, '[data-iterative-notice]'), 'no notice beside it');
  });

  it('carries the workpiece hooks on the detail', async () => {
    const run = workpieceModel('iterative-cards');
    run.refundOnCancel = false;
    const root = await mount(run);
    const detail = query(root, '[data-workpiece]');
    assert.equal(detail.getAttribute('data-iterative-steps'), '2');
    assert.equal(detail.getAttribute('data-iterative-refund'), 'off');
    assert.equal(detail.getAttribute('data-iterative-viewer'), 'player');
    assert.equal(detail.getAttribute('data-iterative-redacted'), 'false');
    const enabled = run.iterative.cards.filter((entry) => entry.enabled).length;
    assert.equal(detail.getAttribute('data-iterative-enabled'), String(enabled));
  });

  it('offers neither a primary nor a pause while a step is worked', async () => {
    const run = workpieceModel('iterative-cards');
    const root = await mount(run);
    assert.equal(primaryButtons(root).length, 0, 'no primary');
    for (const action of ['primary', 'pause', 'resume', 'begin'])
      assert.ok(!query(root, `[data-run-action="${action}"]`), `no ${action} control`);
    assert.ok(Boolean(query(root, '[data-run-action="cancel-arm"]')), 'cancel stays');
  });

  it('states each card note and takes an attempt only from an enabled card', async () => {
    const run = workpieceModel('iterative-cards');
    const journal = journalFor(run);
    const root = await mount(run, journal);
    const notes = Object.fromEntries(
      all(root, '[data-iterative-action]').map((element) => [
        element.getAttribute('data-iterative-action'),
        element.getAttribute('data-iterative-card-note'),
      ])
    );
    assert.deepEqual(notes, {
      hammer: 'rolls',
      planish: 'cost',
      stoke: 'hazard',
      normalise: 'needs',
      fitHilt: 'setup',
    });
    assert.equal(card(root, 'hammer').getAttribute('data-iterative-card-state'), 'ready');
    assert.equal(card(root, 'planish').getAttribute('data-iterative-card-state'), 'disabled');
    assert.ok(query(card(root, 'hammer'), '[data-iterative-action] button, button').textContent);
    await click(query(card(root, 'planish'), 'button'));
    assert.deepEqual(journal.calls.takeAction, [], 'a disabled card takes nothing');
    await click(query(card(root, 'hammer'), 'button'));
    assert.deepEqual(journal.calls.takeAction, ['hammer']);
    assert.match(card(root, 'planish').textContent, /Needs 50 Heat; the piece has 40/);
    assert.ok(
      Boolean(query(card(root, 'stoke'), '.manager-chip.is-danger.is-lit')),
      'a hazard is a lit danger chip'
    );
    assert.match(card(root, 'fitHilt').textContent, new RegExp(K('Card.NoCost')));
    assert.ok(Boolean(query(card(root, 'hammer'), '.manager-chip')), 'the Check tag is drawn');
  });

  it('marks the pressed card busy and disables every other card and the cancel control', async () => {
    const run = workpieceModel('iterative-cards');
    const pressed = { runKey: run.key, actionId: 'hammer', sessionNumber: 2 };
    const root = await mount(run, journalFor(run, { pressed, busy: true }));
    const hammer = card(root, 'hammer');
    assert.equal(hammer.getAttribute('data-iterative-card-state'), 'busy');
    assert.equal(hammer.getAttribute('data-iterative-card-note'), 'working');
    assert.equal(query(hammer, 'button').getAttribute('aria-busy'), 'true');
    assert.match(query(hammer, 'button').getAttribute('aria-label'), new RegExp(K('Card.Busy')));
    for (const id of ['planish', 'stoke', 'normalise', 'fitHilt'])
      assert.equal(card(root, id).getAttribute('data-iterative-card-state'), 'disabled', id);
    assert.ok(query(root, '[data-run-action="cancel-arm"]').disabled, 'cancel is disabled');
    assert.match(
      query(root, '[data-iterative-step-card]').textContent,
      new RegExp(K('Workpiece.Saving'))
    );
  });

  it('formats a waiting card through the world calendar', async () => {
    const run = workpieceModel('iterative-waiting');
    const asked = [];
    const root = await mount(run, journalFor(run), {
      getWorldTimeComponents: (time) => {
        asked.push(time);
        return { day: 3, hour: 4, minute: 5 };
      },
    });
    assert.equal(card(root, 'hammer').getAttribute('data-iterative-card-note'), 'waiting');
    assert.match(card(root, 'hammer').textContent, new RegExp(K('Card.Waiting')));
    assert.ok(asked.length > 0, 'the calendar was asked for the card time');
  });

  it('marks one reached result while the step is worked, and none once it ends', async () => {
    const worked = await mount(workpieceModel('iterative-routes'));
    assert.equal(all(worked, '[data-outcome-reached]').length, 1);
    harness.remount();
    const boundary = workpieceModel('iterative-starting');
    const ended = await mount(boundary);
    assert.equal(all(ended, '[data-outcome-reached]').length, 0);
    assert.equal(card(ended, 'hammer').getAttribute('data-iterative-card-note'), 'ended');
  });

  it('offers "Start step N" as the one primary at a boundary, and begins through the store', async () => {
    const run = workpieceModel('iterative-starting');
    const verdict = verdictNotice(run.iterative.boundary.verdict);
    const journal = journalFor(run, { notice: verdict });
    const root = await mount(run, journal);
    const primaries = primaryButtons(root);
    assert.equal(primaries.length, 1, 'one primary');
    assert.equal(primaries[0].getAttribute('data-run-action'), 'begin');
    assert.match(primaries[0].textContent, new RegExp(K('Begin.Label')));
    assert.ok(Boolean(query(root, '[data-iterative-notice="verdict"]')));
    await click(primaries[0]);
    assert.deepEqual(journal.calls.beginStep, [run.id]);
  });

  it('words the cancel prompt by the refund setting and the step count', async () => {
    const cases = [
      ['iterative-cancel', false, 'Cancel.StopStep'],
      ['iterative-cancel', true, 'Cancel.StopStepRefund'],
      ['iterative-single', false, 'Cancel.StopPiece'],
      ['iterative-single', true, 'Cancel.StopPieceRefund'],
    ];
    for (const [state, refund, key] of cases) {
      const run = workpieceModel(state);
      run.refundOnCancel = refund;
      const root = await mount(run);
      assert.equal(
        query(root, '[data-run-action="cancel-arm"]').getAttribute('aria-label'),
        K('Cancel.Aria')
      );
      await click(query(root, '[data-run-action="cancel-arm"]'));
      const prompt = query(root, '[data-run-cancel-prompt]').textContent;
      assert.ok(prompt.startsWith(K(key)) && !prompt.startsWith(`${K(key)}Refund`), key);
      harness.remount();
    }
  });

  it('browses a past and a future step without changing the worked one', async () => {
    const run = workpieceModel('iterative-past-step');
    const root = await mount(run);
    assert.ok(
      Boolean(query(root, '[data-iterative-step-card="1"][data-iterative-step-view="live"]'))
    );
    await click(query(root, '[data-stage-nav-index="0"]'));
    const past = query(root, '[data-iterative-step-card="0"][data-iterative-step-view="past"]');
    assert.ok(Boolean(past), 'the past step is frozen');
    assert.ok(Boolean(query(past, '[data-stage-fact="ended"]')), 'it says how it ended');
    assert.ok(!query(past, '[data-iterative-action]'), 'a frozen step has no cards');
    await click(query(root, '[data-stage-nav-return]'));
    assert.ok(
      Boolean(query(root, '[data-iterative-step-card="1"][data-iterative-step-view="live"]'))
    );

    harness.remount();
    const later = workpieceModel('iterative-future-step');
    const ahead = await mount(later);
    await click(query(ahead, '[data-stage-nav-index="1"]'));
    const future = query(
      ahead,
      '[data-iterative-step-card="1"][data-iterative-step-view="future"]'
    );
    assert.ok(Boolean(future));
    const carried = later.iterative.progress.stages[1].carriedWith;
    assert.ok(carried && query(future, '[data-stage-fact="starts"]').textContent.includes(carried));
    assert.ok(Boolean(query(future, '[data-stage-io="consumed"]')), 'it lists what it takes');
    const produced = query(future, '[data-stage-io="produced"]');
    assert.match(produced.textContent, new RegExp(K('Step.WillProduceOne')));
    assert.match(produced.textContent, /Longsword/);
    assert.doesNotMatch(produced.textContent, /Slag/, 'what failure leaves is not produced');
  });

  it('draws a single step with no browser and no number', async () => {
    const root = await mount(workpieceModel('iterative-single'));
    assert.ok(!query(root, '[data-stage-nav]'));
    assert.ok(!query(root, '.fab-stage-card-number'));
    assert.equal(query(root, '[data-workpiece]').getAttribute('data-iterative-steps'), '1');
  });

  it('draws a redacted run with no results, step heading or browser', async () => {
    const run = workpieceModel('iterative-redacted', { hidden: ['iw-r-veiled'] });
    const root = await mount(run);
    assert.equal(query(root, '[data-workpiece]').getAttribute('data-iterative-redacted'), 'true');
    for (const gone of ['[data-outcome-ladder]', '.fab-stage-card-heading', '[data-stage-nav]'])
      assert.ok(!query(root, gone), `${gone} is not drawn`);
    assert.ok(all(root, '[data-iterative-action]').length > 0, 'the cards stay');
    assert.ok(all(root, '[data-iterative-counter]').length > 0, 'the counters stay');
    harness.remount();
    // A redacted run of several steps keeps its progress but draws no browser either.
    const steps = await mount(workpieceModel('iterative-resume', { hidden: ['iw-r-longsword'] }));
    assert.equal(query(steps, '[data-workpiece]').getAttribute('data-iterative-steps'), '2');
    assert.ok(Boolean(query(steps, '[data-run-progress]')), 'progress stays');
    for (const gone of ['[data-outcome-ladder]', '.fab-stage-card-heading', '[data-stage-nav]'])
      assert.ok(!query(steps, gone), `${gone} is not drawn on a redacted run of several steps`);
  });

  it('marks a hidden counter for the GM and hides it from a player', async () => {
    const player = await mount(workpieceModel('iterative-gm'));
    assert.ok(!player.innerHTML.includes('Qzx-Hidden-Fit'), 'a player is never handed it');
    harness.remount();
    const gm = await mount(workpieceModel('iterative-gm', { viewer: WORKPIECE_GM }));
    const hidden = query(gm, '[data-iterative-counter="qzxHidden"]');
    assert.ok(Boolean(hidden), 'the GM sees it');
    assert.match(hidden.textContent, new RegExp(K('Counter.Hidden')));
    assert.equal(query(gm, '[data-workpiece]').getAttribute('data-iterative-viewer'), 'gm');
  });

  it('renders a result notice with its ledger, and a verdict with its yields', async () => {
    const run = workpieceModel('iterative-result');
    const row = run.iterative.sessions[0];
    const notice = resultNotice({
      reason: 'check-passed',
      row,
      fallback: { action: row.action, session: row.sessionNumber },
      replayed: false,
      localize: workpieceLocalize,
    });
    const root = await mount(run, journalFor(run, { notice }));
    const ledger = query(root, '[data-iterative-notice="result"] [data-iterative-ledger]');
    assert.ok(Boolean(ledger), 'the ledger is the notice evidence');
    const rows = all(ledger, '[data-journal-fact]');
    assert.equal(rows.length, 3);
    assert.match(rows[1].textContent, /Integrity −2/);
    assert.ok(all(rows[1], '.manager-chip.is-danger').length > 0, 'paid chips are danger');
    assert.ok(all(rows[2], '.manager-chip.is-positive').length > 0, 'changed chips are positive');

    harness.remount();
    const verdict = {
      ...verdictNotice(workpieceModel('iterative-starting').iterative.boundary.verdict),
      yields: [{ id: 'y1', name: 'Longsword', img: '', quantity: 1 }],
    };
    const shown = await mount(run, journalFor(run, { notice: verdict }));
    const yields = all(shown, '[data-iterative-notice="verdict"] [data-list-row]');
    assert.equal(yields.length, 1);
    assert.match(yields[0].textContent, /Longsword/);
  });

  it('moves focus to the pressed card once its press settles', async () => {
    const run = workpieceModel('iterative-cards');
    const journal = journalFor(run);
    const root = await mount(run, journal);
    const settled = { runKey: run.key, actionId: 'stoke', serial: 1 };
    await harness.setProps({
      journal: { ...journal, iterative: { ...journal.iterative, settled } },
    });
    await new Promise((done) => setTimeout(done, 0));
    const stoke = query(card(root, 'stoke'), 'button');
    assert.ok(document.activeElement === stoke, 'the pressed card holds focus');
  });
});

describe('The Workpiece sessions', () => {
  before(async () => {
    await harness.setup();
    installWorkpieceEnv();
  });
  afterEach(() => harness.remount());
  after(() => harness.teardown());

  const rowsOf = (root) => all(root, '[data-iterative-sessions] tbody tr');
  const summary = (root) => query(root, '[data-iterative-sessions] [data-pagination-summary]');

  it('lists five rows newest first, pages to the rest, and states the compacted ones', async () => {
    const run = workpieceModel('iterative-sessions');
    const root = await mount(run);
    const table = query(root, '[data-iterative-sessions]');
    assert.equal(table.getAttribute('data-iterative-rows'), '8');
    assert.equal(rowsOf(root).length, 5);
    assert.equal(rowsOf(root)[0].querySelector('td').textContent.trim(), '10');
    assert.ok(Boolean(summary(root)), 'the pager shows past five rows');
    await click(query(table, '[data-pagination-next]'));
    assert.equal(rowsOf(root).length, 3);
    assert.match(table.textContent, new RegExp(K('Sessions.EarlierMany')));
  });

  it('draws no pager at five rows, and the empty title with none', async () => {
    const run = workpieceModel('iterative-sessions');
    run.iterative.sessions = run.iterative.sessions.slice(0, 5);
    run.iterative.compactedCount = 1;
    const root = await mount(run);
    assert.ok(!summary(root), 'no pager at five');
    assert.match(
      query(root, '[data-iterative-sessions]').textContent,
      new RegExp(K('Sessions.EarlierOne'))
    );
    harness.remount();
    const fresh = await mount(workpieceModel('iterative-fresh'));
    assert.match(
      query(fresh, '[data-iterative-sessions]').textContent,
      new RegExp(K('Sessions.Empty'))
    );
    assert.ok(!query(fresh, '.fabricate-data-table-footer'), 'no footer without compaction');
  });

  it('returns to the first page on a new session', async () => {
    const run = workpieceModel('iterative-sessions');
    const root = await mount(run);
    await click(query(root, '[data-iterative-sessions] [data-pagination-next]'));
    assert.equal(rowsOf(root).length, 3);
    const newest = { ...run.iterative.sessions[0], attempt: 99, sessionNumber: 11 };
    const next = {
      ...run,
      iterative: { ...run.iterative, sessions: [newest, ...run.iterative.sessions] },
    };
    await harness.setProps({ run: next });
    assert.equal(rowsOf(root).length, 5, 'back on the first page');
    assert.equal(rowsOf(root)[0].querySelector('td').textContent.trim(), '11');
  });

  it('marks an entry from another window', async () => {
    const run = workpieceModel('iterative-sessions');
    run.iterative.sessions[0] = { ...run.iterative.sessions[0], requestId: 'foreign' };
    const root = await mount(run);
    assert.match(
      rowsOf(root)[0].querySelector('th').textContent,
      new RegExp(K('Sessions.OtherWindow'))
    );
    assert.doesNotMatch(rowsOf(root)[1].querySelector('th').textContent, /OtherWindow/);
  });
});

/**
 * The player Journal's iterative workpieces, on the lab's `workpiece` Ironworks (issue 3011): the
 * list, every state of the Workpiece view a player can reach, and the history a closed one leaves.
 */

import { JOURNAL_SOURCES } from './caseConstants.js';
import { playerCase, responsiveLayout } from './caseFactories.js';

/** The world every frame here renders: Ironworks as `workpiece`, in one of the `iterative-*` run states. */
const workpiece = (state, extra = {}) => ({
  tab: 'journal',
  iterative: 'workpiece',
  journalCaseState: `iterative-${state}`,
  ...extra,
});

/** The Workpiece view's own sources, beyond the Journal's: its components, presenters and store. */
const WORKPIECE_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/apps\/journal\/(?:iterative\/|CraftingYieldPreview\.svelte$|runStateNotice\.js$)/,
  /^src\/ui\/presenters\/iterative\//,
  /^src\/ui\/svelte\/stores\/(?:journalStore|iterativeAttempt)/,
]);

const notice = (kind, reason) =>
  `[data-iterative-notice="${kind}"][data-iterative-reason="${reason}"]`;
const card = (action, note) =>
  `[data-iterative-action="${action}"][data-iterative-card-note="${note}"]`;
const press = (action) => ({ selector: `[data-iterative-action="${action}"] button` });
const BEGIN = { selector: '[data-run-action="begin"]' };
const ARM_CANCEL = { selector: '[data-run-action="cancel-arm"]' };
const openRecord = (runId) => ({ selector: `[data-history-run-id="${runId}"]` });

/** One Workpiece frame, never on the smoke walk: the smoke never builds an iterative system. */
const workpieceCase = (entry) =>
  playerCase({
    reaches: 'beyond',
    smokeLabels: [],
    expectTab: 'journal',
    kinds: ['player', 'journal', 'iterative'],
    sourceMatches: [JOURNAL_SOURCES, ...WORKPIECE_SOURCES],
    ...entry,
  });

export const CASES = Object.freeze([
  workpieceCase({
    id: 'player-journal-iterative-list',
    label: 'Player Journal — iterative workpieces in the list',
    query: workpiece('list'),
    steps: [],
    expectSelector: '[data-run-id="iw-run-boundary"] [data-run-attention="stepDone"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-history',
    label: 'Player Journal — iterative records in the finished list',
    query: workpiece('history'),
    steps: [openRecord('iw-run-failed')],
    expectSelector: '[data-history-run-id="iw-run-failed"] [data-history-outcome="failed"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-resume',
    label: 'Player Journal — workpiece picked up again',
    query: workpiece('resume'),
    steps: [],
    expectSelector: notice('resume', 'success'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-idle',
    label: 'Player Journal — workpiece idle with progress',
    query: workpiece('idle'),
    steps: [
      { selector: '[data-run-id="iw-run-spear"]' },
      { selector: '[data-run-id="iw-run-longsword"]' },
    ],
    expectSelector: '[data-workpiece] [data-iterative-idle]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-fresh',
    label: 'Player Journal — workpiece fresh, no sessions',
    query: workpiece('fresh'),
    steps: [{ selector: '[data-iterative-sessions][data-iterative-rows="0"]', scroll: true }],
    expectSelector: '[data-iterative-sessions][data-iterative-rows="0"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-cards',
    label: 'Player Journal — workpiece action cards',
    query: workpiece('cards'),
    steps: [{ selector: card('planish', 'cost'), scroll: true }],
    expectSelector: card('planish', 'cost'),
    expectCenterHit: '[data-iterative-action="hammer"] button',
  }),
  workpieceCase({
    id: 'player-journal-iterative-no-action',
    label: 'Player Journal — workpiece with no action to take',
    query: workpiece('no-action'),
    steps: [{ selector: '[data-workpiece][data-iterative-enabled="0"]', scroll: true }],
    expectSelector: '[data-workpiece][data-iterative-enabled="0"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-result',
    label: 'Player Journal — workpiece result after a failed check',
    query: workpiece('result'),
    steps: [press('hammer'), { selector: notice('result', 'check-failed'), scroll: true }],
    expectSelector: notice('result', 'check-failed'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-result-nocheck',
    label: 'Player Journal — workpiece result with no check',
    query: workpiece('result-nocheck'),
    steps: [press('stoke'), { selector: notice('result', 'no-check'), scroll: true }],
    expectSelector: notice('result', 'no-check'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-busy',
    label: 'Player Journal — workpiece saving a press',
    query: workpiece('busy'),
    steps: [press('hammer')],
    expectSelector: notice('busy', 'success'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-busy-card',
    label: 'Player Journal — workpiece pressed card saving',
    query: workpiece('busy'),
    steps: [
      press('hammer'),
      {
        selector: '[data-iterative-action="hammer"][data-iterative-card-state="busy"]',
        scroll: true,
      },
    ],
    expectSelector: '[data-iterative-action="hammer"][data-iterative-card-state="busy"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-unanswered',
    label: 'Player Journal — workpiece press with no answer yet',
    query: workpiece('unanswered'),
    steps: [press('hammer'), { selector: notice('unanswered', 'command-timeout'), scroll: true }],
    expectSelector: notice('unanswered', 'command-timeout'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-stale',
    label: 'Player Journal — workpiece stale press',
    query: workpiece('stale'),
    steps: [press('hammer'), { selector: notice('stale', 'stale-run'), scroll: true }],
    expectSelector: notice('stale', 'stale-run'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-error',
    label: 'Player Journal — workpiece check that cannot roll',
    query: workpiece('error'),
    steps: [press('hammer'), { selector: notice('check', 'roll-unavailable'), scroll: true }],
    expectSelector: notice('check', 'roll-unavailable'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-thrown',
    label: 'Player Journal — workpiece press that threw',
    query: workpiece('throw'),
    steps: [press('hammer'), { selector: notice('unanswered', 'thrown'), scroll: true }],
    expectSelector: notice('unanswered', 'thrown'),
    allowedConsoleErrors: [/Fabricate \| Error taking an Iterative Attempt/],
  }),
  workpieceCase({
    id: 'player-journal-iterative-refusal-cost',
    label: 'Player Journal — workpiece refused for a cost',
    query: workpiece('refusal-cost-unaffordable'),
    steps: [press('hammer'), { selector: notice('refusal', 'cost-unaffordable'), scroll: true }],
    expectSelector: notice('refusal', 'cost-unaffordable'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-refusal-requirement',
    label: 'Player Journal — workpiece refused for a requirement',
    query: workpiece('refusal-action-unavailable'),
    steps: [press('hammer'), { selector: notice('refusal', 'action-unavailable'), scroll: true }],
    expectSelector: notice('refusal', 'action-unavailable'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-refusal-untracked',
    label: 'Player Journal — workpiece refused for an untracked counter',
    query: workpiece('refusal-unknown-counter'),
    steps: [press('hammer'), { selector: notice('refusal', 'unknown-counter'), scroll: true }],
    expectSelector: notice('refusal', 'unknown-counter'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-step-done',
    label: 'Player Journal — workpiece step done, start the next',
    query: workpiece('step-done'),
    steps: [press('hammer'), { selector: "[data-iterative-notice='verdict']", scroll: true }],
    expectSelector: notice('verdict', 'success'),
    expectCenterHit: '[data-run-action="begin"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-starting',
    label: 'Player Journal — workpiece starting the next step',
    query: workpiece('starting'),
    steps: [BEGIN],
    expectSelector: '[data-run-action="begin"][aria-busy="true"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-begin-refused',
    label: 'Player Journal — workpiece start refused',
    query: workpiece('begin-stale'),
    steps: [BEGIN],
    expectSelector: '[data-journal-command-error]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-step-started',
    label: 'Player Journal — workpiece next step started',
    query: workpiece('step-started'),
    steps: [BEGIN],
    expectSelector: notice('started', 'success'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-routes',
    label: 'Player Journal — workpiece routed results',
    query: workpiece('routes'),
    steps: [],
    expectSelector:
      '[data-iterative-step-card="1"][data-iterative-step-view="live"] [data-outcome-reached]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-finished',
    label: 'Player Journal — workpiece finished, its verdict and yield',
    query: workpiece('finished'),
    steps: [press('fitHilt'), { selector: '[data-journal-verdict]', scroll: true }],
    expectSelector: '[data-journal-verdict] [data-list-row]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-failed',
    label: 'Player Journal — workpiece failed with a set',
    query: workpiece('failed'),
    steps: [
      press('hammer'),
      { selector: '[data-iterative-record] [data-stage-bars-state="danger"]', scroll: true },
    ],
    expectSelector: '[data-iterative-record] [data-stage-bars-state="danger"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-failed-nothing',
    label: 'Player Journal — workpiece failed, nothing produced',
    query: workpiece('failed-nothing'),
    steps: [press('hammer'), { selector: '[data-journal-verdict]', scroll: true }],
    expectSelector: '[data-journal-verdict]:not(:has([data-list-row]))',
  }),
  workpieceCase({
    id: 'player-journal-iterative-record',
    label: 'Player Journal — workpiece record reopened',
    query: workpiece('record'),
    steps: [openRecord('iw-run-made')],
    expectSelector: '[data-iterative-record] [data-iterative-sessions]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-cancel',
    label: 'Player Journal — workpiece cancel, multi-step without refunds',
    query: workpiece('cancel'),
    steps: [ARM_CANCEL],
    expectSelector: '[data-workpiece][data-iterative-refund="off"] [data-run-cancel-decision]',
    expectCenterHit: '[data-run-action="cancel-keep"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-cancel-single-refund',
    label: 'Player Journal — workpiece cancel, single step with refunds',
    query: workpiece('cancel-single-refund'),
    steps: [ARM_CANCEL],
    expectSelector: '[data-workpiece][data-iterative-refund="on"] [data-run-cancel-decision]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-single',
    label: 'Player Journal — workpiece single step',
    query: workpiece('single'),
    steps: [],
    expectSelector: '[data-workpiece][data-iterative-steps="1"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-past-step',
    label: 'Player Journal — workpiece viewing a past step',
    query: workpiece('past-step'),
    steps: [
      { selector: '[data-stage-nav-index="0"]' },
      { selector: '[data-iterative-step-card="0"][data-iterative-step-view="past"]', scroll: true },
    ],
    expectSelector: '[data-iterative-step-card="0"][data-iterative-step-view="past"]',
    expectCenterHit: '[data-stage-nav-index="1"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-future-step',
    label: 'Player Journal — workpiece viewing a future step',
    query: workpiece('future-step'),
    steps: [
      { selector: '[data-stage-nav-index="1"]' },
      {
        selector: '[data-iterative-step-card="1"][data-iterative-step-view="future"]',
        scroll: true,
      },
    ],
    expectSelector: '[data-iterative-step-card="1"][data-iterative-step-view="future"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-waiting',
    label: 'Player Journal — workpiece timed step waiting',
    query: workpiece('waiting'),
    steps: [{ selector: card('hammer', 'waiting'), scroll: true }],
    expectSelector: card('hammer', 'waiting'),
  }),
  workpieceCase({
    id: 'player-journal-iterative-authority',
    label: 'Player Journal — workpiece needing an active GM',
    query: workpiece('authority'),
    steps: [{ selector: '[data-journal-action-blocker]', scroll: true }],
    expectSelector: '[data-journal-action-blocker]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-unsupported',
    label: 'Player Journal — workpiece from an unsupported version',
    query: workpiece('unsupported'),
    steps: [],
    expectSelector: '[data-journal-unsupported]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-gm',
    label: 'Player Journal — workpiece seen by the GM',
    query: workpiece('gm', { viewer: 'gm' }),
    steps: [],
    expectSelector: '[data-workpiece][data-iterative-viewer="gm"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-redacted',
    label: 'Player Journal — workpiece redacted, checked privately',
    query: workpiece('redacted'),
    steps: [],
    expectSelector: '[data-workpiece][data-iterative-redacted="true"]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-sessions',
    label: 'Player Journal — workpiece paged sessions',
    query: workpiece('sessions'),
    steps: [{ selector: '[data-iterative-sessions][data-iterative-rows="8"]', scroll: true }],
    expectSelector: '[data-iterative-sessions][data-iterative-rows="8"]',
    expectCenterHit: '[data-iterative-sessions] [data-pagination-next]',
  }),
  workpieceCase({
    id: 'player-journal-iterative-narrow',
    label: 'Player Journal — workpiece stacked',
    query: workpiece('narrow'),
    steps: [{ selector: '[data-iterative-step-card]', scroll: true }],
    expectSelector: '[data-workpiece]',
    // The stacked detail sits under the list, so the frame scrolls to the workpiece itself.
    position: { width: 1024, height: 860 },
    kinds: ['player', 'journal', 'iterative', 'responsive'],
    expectLayout: responsiveLayout('.journal-view-container', '.journal-view-grid'),
  }),
]);

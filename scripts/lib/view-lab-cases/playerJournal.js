/**
 * The player window's Journal, with the generated lifecycle, history and blind-run frames.
 */

import { ANCHORED_POPOVER_SOURCES, JOURNAL_SOURCES, PLAYER_VIEW_STATE } from './caseConstants.js';
import { playerCase, responsiveLayout } from './caseFactories.js';
import { journalBlindRunCases } from './journalBlindRunCases.js';
import { journalHistoryBatchCases, journalHistoryDataCases } from './journalHistoryCases.js';
import { journalLifecycleCases } from './journalLifecycleCases.js';

export const CASES = Object.freeze([
  playerCase({
    id: 'player-alchemy-chooser',
    label: 'Player app — Alchemy chooser',
    smokeLabels: ['player-alchemy-chooser'],
    // The discipline chooser, reached exactly as the counterpart reaches it: the world remembers a
    // chosen discipline, so the tab opens on the workbench and "Switch discipline"
    // (`[data-alchemy-switch]`) is what returns to the chooser.
    reaches: 'exact',
    query: { tab: 'alchemy' },
    steps: [{ selector: '[data-alchemy-switch]' }],
    kinds: ['player', 'alchemy'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/alchemy\//],
  }),
  playerCase({
    id: 'player-alchemy-workbench',
    label: 'Player app — Alchemy workbench',
    smokeLabels: ['player-alchemy-workbench'],
    reaches: 'exact',
    query: { tab: 'alchemy' },
    steps: [],
    kinds: ['player', 'alchemy'],
    // The ALCHEMY end of the same repair `player-inventory` above carries (issue 1513): this tab
    // is the third `showSourcesBar` renders in, and it is the alchemy frame that draws the bar at
    // the app's own default geometry with no step to reach it.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/alchemy\//,
      /^src\/ui\/svelte\/apps\/crafting\/ComponentSourcesBar\.svelte$/,
      PLAYER_VIEW_STATE,
    ],
  }),
  playerCase({
    id: 'player-alchemy-stacked',
    label: 'Player app — Alchemy stacked',
    smokeLabels: ['player-alchemy-stacked'],
    reaches: 'exact',
    query: { tab: 'alchemy' },
    steps: [],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'alchemy', 'responsive'],
    expectLayout: responsiveLayout('.alchemy-view-container', '.alchemy-view-grid'),
    sourceMatches: [/^src\/ui\/svelte\/apps\/alchemy\//],
  }),
  playerCase({
    id: 'player-journal-stacked',
    label: 'Player app — Journal stacked',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'journal' },
    steps: [],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'journal', 'responsive'],
    expectLayout: responsiveLayout('.journal-view-container', '.journal-view-grid'),
    sourceMatches: [JOURNAL_SOURCES, /^src\/ui\/svelte\/stores\/journalStore/],
  }),
  playerCase({
    id: 'player-journal-sort-list',
    label: 'Player app — Journal sort list',
    smokeLabels: [],
    reaches: 'beyond',
    // The panel that has to escape its column (issue 1511).
    query: { tab: 'journal' },
    steps: [{ selector: '[data-journal-sort="active"]' }],
    expectSelector:
      '.fabricate-app > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="newest"]',
    expectContained: [{ container: '.fabricate-app', target: '.fabricate-select-popover' }],
    kinds: ['player', 'journal'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/svelte\/stores\/journalStore/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'fabricate-journal',
    label: 'Player app — Journal',
    smokeLabels: ['fabricate-journal'],
    reaches: 'exact',
    query: { tab: 'journal' },
    steps: [],
    kinds: ['player', 'journal'],
    sourceMatches: [JOURNAL_SOURCES, /^src\/ui\/svelte\/stores\/journalStore/, PLAYER_VIEW_STATE],
  }),
  playerCase({
    id: 'fabricate-journal-craft-detail',
    label: 'Player app — Journal craft detail',
    smokeLabels: ['fabricate-journal-craft-detail'],
    // The counterpart's condition is a history crafting run selected, so the run-detail recorded
    // stage facts (`[data-stage-fact]`) are on screen — a different article from the one
    // `fabricate-journal` shows, which is the default active run.
    reaches: 'exact',
    query: { tab: 'journal' },
    steps: [
      { selector: '[data-history-run-id="lab-run-succeeded-multi"]' },
      {
        selector:
          '[data-journal-detail][data-run-key*="lab-run-succeeded-multi"] [data-stage-card]',
        scroll: true,
      },
    ],
    expectSelector:
      '[data-journal-detail][data-run-key*="lab-run-succeeded-multi"]:has([data-history-stages]):not(:has([data-stage-nav]))',
    kinds: ['player', 'journal'],
    sourceMatches: [JOURNAL_SOURCES, /^src\/ui\/svelte\/stores\/journalStore/],
  }),
  ...journalBlindRunCases(),
  ...journalLifecycleCases(),
  ...journalHistoryBatchCases(),
  ...journalHistoryDataCases(),
]);

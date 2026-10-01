/**
 * The player window's Journal, with the generated lifecycle, history and blind-run frames.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  COUNT_ADVANTAGE_FOOTER,
  JOURNAL_SOURCES,
  PLAYER_VIEW_STATE,
} from './caseConstants.js';
import { playerCase, responsiveLayout } from './caseFactories.js';
import { journalBlindRunCases } from './journalBlindRunCases.js';
import { journalHistoryBatchCases, journalHistoryDataCases } from './journalHistoryCases.js';
import { journalLifecycleCases } from './journalLifecycleCases.js';

/** A keep rule's footer (issue 2007): each outer button names the die it keeps. */
const KEEP_FOOTER =
  ':has(.manager-modal-footer button[data-action="disadvantage"] .action-note:text-is("keep the worse"))' +
  ':has(.manager-modal-footer button[data-action="advantage"] .action-note:text-is("keep the better"))';

/** The Journal's prepared prompt offering additional dice (issue 2008). */
const JOURNAL_ADDITIONAL_DICE_SOURCES = Object.freeze([
  /^src\/systems\/journalPreparedCheck\.js$/,
  /^src\/systems\/preparedDecisionPolicy\.js$/,
  /^src\/ui\/svelte\/apps\/crafting\/RollPromptAdditionalDice\.svelte$/,
]);

export const CASES = Object.freeze([
  playerCase({
    id: 'player-alchemy-chooser',
    label: 'Player app — Alchemy chooser',
    smokeLabels: ['player-alchemy-chooser'],
    // The world remembers a discipline, so the tab opens on the workbench and `[data-alchemy-switch]` returns.
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
    // The alchemy end of the repair `player-inventory` carries (issue 1513): `showSourcesBar`'s third tab.
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
    // The counterpart selects a history crafting run, so its recorded stage facts are on screen.
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
  playerCase({
    id: 'player-journal-check-roll-prompt',
    label: 'Player Journal — versioned check roll prompt',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'journal', journalCaseState: 'journal-check-prompt', dialog: 'open' },
    steps: [
      { selector: '[data-run-id="lab-v1-journal-check-prompt"]' },
      { selector: '[data-journal-detail] [data-run-action="primary"]' },
    ],
    expectTab: 'journal',
    expectSelector:
      '.fabricate-app .manager-modal[data-roll-prompt="single"]' +
      KEEP_FOOTER +
      ':has(.manager-modal-subtitle:has-text("Brenna Karrunsdottir · Inscribe a Runeblade"))' +
      ':has(.formula-content .formula:text-is("1d20 + 3"))' +
      ':not(:has(.formula-content .manager-chip))' +
      ':has(.static-modifiers .manager-chip:has-text("Rune lore +3"))' +
      ':has(.static-modifiers .manager-chip:has-text("Etching hand +0"))' +
      ':has(.static-modifiers .manager-chip:has-text("Inscriber’s chisel +3"))',
    kinds: ['player', 'journal'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/bootstrap\/journalOperations\.js$/,
      /^src\/systems\/CraftingEngine\.js$/,
      /^src\/ui\/svelte\/apps\/crafting\/(?:RollPrompt(?:Target|Footer)?\.svelte|rollPrompt(?:Target)?\.js)$/,
    ],
  }),
  // Issue 2007: the versioned prompt's notes come from the offer the stage check prepared.
  playerCase({
    id: 'player-journal-check-roll-prompt-bonus',
    label: 'Player Journal — versioned check roll prompt offering a bonus die',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'journal',
      journalCaseState: 'journal-check-prompt',
      rollPromptState: 'journal-bonus',
      dialog: 'open',
    },
    steps: [
      { selector: '[data-run-id="lab-v1-journal-check-prompt"]' },
      { selector: '[data-journal-detail] [data-run-action="primary"]' },
    ],
    expectTab: 'journal',
    expectSelector:
      '.fabricate-app .manager-modal[data-roll-prompt="single"]' +
      ':has(.manager-modal-subtitle:has-text("Brenna Karrunsdottir · Inscribe a Runeblade"))' +
      ':has(.manager-modal-footer button[data-action="disadvantage"] .action-note:text-is("−(1d8 + 1) to the total"))' +
      ' .manager-modal-footer button[data-action="advantage"] .action-note:text-is("+(1d8 + 1) to the total")',
    kinds: ['player', 'journal'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/bootstrap\/journalOperations\.js$/,
      /^src\/ui\/svelte\/apps\/crafting\/(?:RollPrompt(?:Footer)?\.svelte|rollPrompt\.js)$/,
    ],
  }),
  playerCase({
    id: 'player-gathering-journal-check-roll-prompt',
    label: 'Player Journal — versioned gathering roll-under check prompt',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'journal',
      journalCaseState: 'gathering-journal-check-prompt',
      gatheringTaskMode: 'routed-under',
      dialog: 'open',
    },
    steps: [
      { selector: '[data-run-id="lab-v1-gathering-journal-check-prompt"]' },
      { selector: '[data-journal-detail] [data-run-action="primary"]' },
    ],
    expectTab: 'journal',
    expectSelector:
      '.fabricate-app .manager-modal[data-roll-prompt="single"]' +
      KEEP_FOOTER +
      ':has(.manager-modal-subtitle:has-text("Brenna Karrunsdottir · Tend the Slow Bloom"))' +
      ':has(.formula-content .formula:text-is("1d20"))' +
      ':has(.target-row > .manager-chip[data-roll-prompt-target="under"]:has-text("Target 2 · stay at or under"))',
    kinds: ['player', 'journal', 'gathering'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/bootstrap\/journalOperations\.js$/,
      /^src\/systems\/GatheringEngine\.js$/,
      /^src\/ui\/svelte\/apps\/crafting\/(?:RollPrompt(?:Target|Footer)?\.svelte|rollPrompt(?:Target)?\.js)$/,
    ],
  }),
  // Issue 2006: a Journal-prompted count check opens the same count prompt, its faces named.
  playerCase({
    id: 'player-journal-check-roll-prompt-count',
    label: 'Player Journal — versioned gathering success-counting check prompt',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'journal',
      journalCaseState: 'gathering-journal-check-prompt',
      gatheringTaskMode: 'routed-count',
      dialog: 'open',
    },
    steps: [
      { selector: '[data-run-id="lab-v1-gathering-journal-check-prompt"]' },
      { selector: '[data-journal-detail] [data-run-action="primary"]' },
    ],
    expectTab: 'journal',
    expectSelector:
      '.fabricate-app .manager-modal[data-roll-prompt="single"]' +
      COUNT_ADVANTAGE_FOOTER +
      ':has(.manager-modal-subtitle:has-text("Brenna Karrunsdottir · Tend the Slow Bloom"))' +
      ':has(.formula-content .formula[data-roll-prompt-count="over"]:text-is("5d10 · each ≥ 7"))' +
      ':has(.formula-content .formula-note:text-is("Success on ≥ 7 · explodes on 9 or above once"))' +
      ' .formula-content .manager-chip[data-roll-prompt-required="2"]',
    kinds: ['player', 'journal', 'gathering'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/bootstrap\/journalOperations\.js$/,
      /^src\/systems\/GatheringEngine\.js$/,
      /^src\/ui\/svelte\/apps\/crafting\/(?:RollPrompt(?:Target|Footer)?\.svelte|rollPrompt(?:Target)?\.js)$/,
    ],
  }),
  // Issue 2008 (frame 30): the entitled prepared count prompt carries the additional-dice control.
  playerCase({
    id: 'player-journal-check-roll-prompt-count-additional',
    label: 'Player Journal — versioned success-counting check prompt offering additional dice',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'journal',
      journalCaseState: 'journal-check-prompt',
      runeworkCheckMode: 'routed-count',
      rollPromptState: 'journal-count-additional',
      dialog: 'open',
    },
    steps: [
      { selector: '[data-run-id="lab-v1-journal-check-prompt"]' },
      { selector: '[data-journal-detail] [data-run-action="primary"]' },
    ],
    expectTab: 'journal',
    expectSelector:
      '.fabricate-app .manager-modal[data-roll-prompt="single"]' +
      ':has(.manager-modal-subtitle:has-text("Brenna Karrunsdottir · Inscribe a Runeblade"))' +
      ':has([data-roll-prompt-additional-dice-resource]:text-is("Momentum 2 available"))' +
      ' input[data-roll-prompt-additional-dice]:not(:disabled)',
    kinds: ['player', 'journal'],
    sourceMatches: JOURNAL_ADDITIONAL_DICE_SOURCES,
  }),
  // R3: a recipe the player cannot see is redacted, so the prompt states only what can be spent.
  playerCase({
    id: 'player-journal-check-roll-prompt-count-additional-secret',
    label: 'Player Journal — a redacted check prompt offering additional dice (ruling R3)',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'journal',
      journalCaseState: 'journal-check-prompt',
      runeworkCheckMode: 'routed-count',
      rollPromptState: 'journal-count-additional-unentitled',
      dialog: 'open',
    },
    steps: [
      { selector: '[data-run-id="lab-v1-journal-check-prompt"]' },
      { selector: '[data-journal-detail] [data-run-action="primary"]' },
    ],
    expectTab: 'journal',
    expectSelector:
      '.fabricate-app .manager-modal[data-roll-prompt="single"]' +
      ':not(:has(.formula-content .manager-chip[data-roll-prompt-required]))' +
      ':has([data-roll-prompt-additional-dice-resource]:text-is("Momentum 2 available"))' +
      ':not(:has([data-roll-prompt-additional-dice-message]))' +
      ':not(:has([data-roll-prompt-block-note]))' +
      ' .manager-modal-footer button[data-action="normal"]:not([aria-disabled])',
    kinds: ['player', 'journal'],
    sourceMatches: JOURNAL_ADDITIONAL_DICE_SOURCES,
  }),
  // Issue 2005 (T6): a fixed roll-under ladder states `≤` bands, in ladder order.
  playerCase({
    id: 'player-journal-routed-bands-under',
    label: 'Player Journal — roll-under routed gathering ladder bands',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'journal',
      journalCaseState: 'gathering-journal-check-prompt',
      gatheringTaskMode: 'routed-under-fixed',
    },
    steps: [{ selector: '[data-run-id="lab-v1-gathering-journal-check-prompt"]' }],
    expectTab: 'journal',
    expectSelector:
      '[data-journal-detail] [data-outcome-ladder]' +
      ':has([data-outcome-tier="lab-abundant"] .manager-chip:text-is("≤15"))' +
      ':has([data-outcome-tier="lab-failed"] .manager-chip:text-is(">15"))',
    kinds: ['player', 'journal', 'gathering'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/presenters\/RunJournalBuilder\.js$/,
      /^src\/systems\/runJournalOutcomeBands\.js$/,
    ],
  }),
  // Issue 2005 fix round 1: the crafting ladder, the labelled character-value and Otherwise chips,
  // and the executed roll-under roll line, each on the surface it changes.
  ...[
    [
      'player-journal-routed-bands-under-crafting',
      { journalCaseState: 'journal-check-prompt', runeworkCheckMode: 'routed-under' },
      'lab-v1-journal-check-prompt',
      ':has([data-outcome-tier="rw-masterwork"] .manager-chip:text-is("≤7"))' +
        ':has([data-outcome-tier="rw-ruined"] .manager-chip:text-is(">12"))',
    ],
    [
      'player-journal-routed-bands-under-attribute',
      { journalCaseState: 'gathering-journal-check-prompt', gatheringTaskMode: 'routed-under' },
      'lab-v1-gathering-journal-check-prompt',
      ':has([data-outcome-tier="lab-failed"] .manager-chip:text-is("Failed · −15"))',
    ],
    [
      'player-journal-routed-bands-under-multiply',
      { journalCaseState: 'journal-check-prompt', runeworkCheckMode: 'routed-under-multiply' },
      'lab-v1-journal-check-prompt',
      ':has([data-outcome-tier="rw-ruined"] .manager-chip:text-is("Ruined · Otherwise"))' +
        ':has([data-outcome-tier="rw-standard"] .manager-chip:text-is("Standard · ×½"))',
    ],
  ].map(([id, query, runId, ladder]) =>
    playerCase({
      id,
      label: `Player Journal — ${id.replace('player-journal-', '').replaceAll('-', ' ')}`,
      smokeLabels: [],
      reaches: 'beyond',
      query: { tab: 'journal', ...query },
      steps: [{ selector: `[data-run-id="${runId}"]` }],
      expectTab: 'journal',
      expectSelector: `[data-journal-detail] [data-outcome-ladder]${ladder}`,
      kinds: ['player', 'journal'],
      sourceMatches: [
        JOURNAL_SOURCES,
        /^src\/ui\/presenters\/RunJournalBuilder\.js$/,
        /^src\/systems\/runJournalOutcomeBands\.js$/,
      ],
    })
  ),
  playerCase({
    id: 'player-journal-roll-line-under',
    label: 'Player Journal — past stage rolled roll-under, target and margin',
    smokeLabels: [],
    reaches: 'beyond',
    // Its live check rolls under a character value too, so the header names no DC (issue 2133).
    query: { tab: 'journal', journalCaseState: 'past-stage-under', rollPromptState: 'under' },
    steps: [
      { selector: '[data-run-id="lab-v1-stage-browser"]' },
      { selector: '[data-stage-nav-index="0"]' },
    ],
    expectTab: 'journal',
    expectSelector:
      '[data-journal-detail]:has(.journal-detail-meta span:text-is("Standard check"))' +
      ':has-text("1d20 = 11 · target 14 · margin +3")',
    kinds: ['player', 'journal'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/presenters\/(?:RunJournalBuilder|journalCheckText)\.js$/,
    ],
  }),
  // Issue 2103: a future stage under a roll-under crafting check names its Target, never a DC.
  playerCase({
    id: 'player-journal-future-stage-under',
    label: 'Player Journal — future stage step label under a roll-under crafting check',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'journal', journalCaseState: 'future-stage-under' },
    steps: [
      { selector: '[data-run-id="lab-v1-stage-browser"]' },
      { selector: '[data-stage-nav-index="2"]' },
    ],
    expectTab: 'journal',
    expectSelector:
      '[data-journal-detail] [data-stage-card="2"][data-stage-state="future"]' +
      ' [data-stage-fact="check"]' +
      ':has-text("1d20 + @abilities.int.mod · Target 15 · stay at or under"):not(:has-text("DC"))',
    kinds: ['player', 'journal'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/presenters\/(?:RunJournalBuilder|journalCheckText)\.js$/,
    ],
  }),
  // Issue 2006: a counting ladder in net successes, its Botch row beside the least demanding tier
  // while cancelling is on, and the step's successes-needed label.
  playerCase({
    id: 'player-journal-routed-bands-count',
    label: 'Player Journal — success-counting routed crafting ladder and step label',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'journal',
      journalCaseState: 'journal-check-prompt',
      runeworkCheckMode: 'routed-count',
    },
    steps: [{ selector: '[data-run-id="lab-v1-journal-check-prompt"]' }],
    expectTab: 'journal',
    expectSelector:
      '[data-journal-detail]' +
      ':has([data-journal-summary-card="check"]:has-text("2 successes needed · d10s"))' +
      ' [data-outcome-ladder]' +
      ':has([data-outcome-tier="count-botch"] .manager-chip:text-is("<0"))' +
      ':has([data-outcome-tier="rw-masterwork"] .manager-chip:text-is("4+"))' +
      ':has([data-outcome-tier="rw-standard"] .manager-chip:text-is("2–3"))' +
      ':has([data-outcome-tier="rw-ruined"] .manager-chip:text-is("0–1"))' +
      // In ladder order: a best-first ladder closes on its Botch row.
      ':has([data-outcome-tier="rw-masterwork"] ~ [data-outcome-tier="rw-ruined"] + [data-outcome-tier="count-botch"])',
    kinds: ['player', 'journal'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/presenters\/(?:RunJournalBuilder|journalCheckText)\.js$/,
      /^src\/systems\/runJournalOutcomeBands\.js$/,
    ],
  }),
  // Issue 2135: tiers authored out of order (Standard 0, Ruined −2, Masterwork +1 from three
  // needed), so the Botch row sits beside Ruined, the least demanding tier, not at an end.
  playerCase({
    id: 'player-journal-routed-bands-count-unordered',
    label: 'Player Journal — success-counting ladder authored out of order, Botch beside Ruined',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'journal',
      journalCaseState: 'journal-check-prompt',
      runeworkCheckMode: 'routed-count-unordered',
    },
    steps: [{ selector: '[data-run-id="lab-v1-journal-check-prompt"]' }],
    expectTab: 'journal',
    expectSelector:
      '[data-journal-detail] [data-outcome-ladder]' +
      ':has([data-outcome-tier="rw-standard"] .manager-chip:text-is("3"))' +
      ':has([data-outcome-tier="count-botch"] .manager-chip:text-is("<0"))' +
      ':has([data-outcome-tier="rw-ruined"] .manager-chip:text-is("0–2"))' +
      ':has([data-outcome-tier="rw-masterwork"] .manager-chip:text-is("4+"))' +
      ':has([data-outcome-tier="rw-standard"] + [data-outcome-tier="count-botch"]' +
      ' + [data-outcome-tier="rw-ruined"] + [data-outcome-tier="rw-masterwork"])',
    kinds: ['player', 'journal'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/presenters\/RunJournalBuilder\.js$/,
      /^src\/systems\/runJournalOutcomeBands\.js$/,
    ],
  }),
  // The executed count's roll line on a past stage: its net against the required count it cleared,
  // under a counting check whose header names no DC (issue 2133).
  playerCase({
    id: 'player-journal-roll-line-count',
    label: 'Player Journal — past stage that counted successes, net and successes needed',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'journal',
      journalCaseState: 'past-stage-count',
      checkPreviewState: 'dice-pool',
      rollPromptState: 'count',
    },
    steps: [
      { selector: '[data-run-id="lab-v1-stage-browser"]' },
      { selector: '[data-stage-nav-index="0"]' },
    ],
    expectTab: 'journal',
    expectSelector:
      '[data-journal-detail]:has(.journal-detail-meta span:text-is("Standard check"))' +
      ':has-text("3 successes, 2 needed")',
    kinds: ['player', 'journal'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/presenters\/(?:RunJournalBuilder|journalCheckText)\.js$/,
      /^src\/ui\/svelte\/apps\/journal\/runDetailPresentation\.js$/,
    ],
  }),
  // Issue 2133: a routed count's line states the check's own two needed, never its total less the
  // margin its matched Masterwork tier recorded.
  playerCase({
    id: 'player-journal-roll-line-routed-count',
    label: 'Player Journal — finished routed count run, net and its check successes needed',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'journal',
      journalCaseState: 'finished-routed-count',
      runeworkCheckMode: 'routed-count',
    },
    steps: [{ selector: '[data-history-run-id="lab-v1-finished-routed-count"]' }],
    expectTab: 'journal',
    expectSelector:
      '[data-journal-detail]:has(.journal-detail-meta span:text-is("Routed by Check"))' +
      ' [data-journal-history-detail]:has-text("6 successes, 2 needed")',
    kinds: ['player', 'journal'],
    sourceMatches: [
      JOURNAL_SOURCES,
      /^src\/ui\/presenters\/(?:RunJournalBuilder|journalCheckText)\.js$/,
      /^src\/ui\/svelte\/apps\/journal\/runDetailPresentation\.js$/,
    ],
  }),
  ...journalBlindRunCases(),
  ...journalLifecycleCases(),
  ...journalHistoryBatchCases(),
  ...journalHistoryDataCases(),
]);

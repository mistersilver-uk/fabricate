/**
 * The player window: the shell, the inventory grid, salvage and every bulk-selection state.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  BULK_DEFAULTS,
  CRAFTING_SHARED,
  PLAYER_DETAIL_HEADER,
  PLAYER_VIEW_STATE,
} from './caseConstants.js';
import {
  CARD,
  CARD_BUTTON,
  SHIFT_CLICK,
  chooseSelectOption,
  playerCase,
  responsiveLayout,
} from './caseFactories.js';

/** A book's Read & learn, which is its identity header's one primary. */
const READ_LEARN_ACTION = '[data-player-detail-header] [data-inventory-learn-all]';
/** The bulk roll prompt: Fabricate's own modal over the player window. */
const BULK_PROMPT = '.fabricate-app .manager-modal[data-roll-prompt="bulk"]';
/** The help line under the bonus field, then the batch list holding each `[name, need]` row. */
const BULK_PROMPT_ROWS = (help, rows) =>
  `${BULK_PROMPT}:has(.bonus-group > .help:text-is("${help}")) .bulk-list` +
  rows
    .map(
      ([name, need]) =>
        `:has(> .bulk-row > .bulk-name:text-is("${name}") + .bulk-need:text-is("${need}"))`
    )
    .join('');
const UNDER_BONUS_HELP =
  'A bonus raises the target. A rolled bonus such as 1d4 is rolled first, and its result is applied.';
const COUNT_BONUS_HELP =
  'A bonus adds that many dice. A rolled bonus such as 1d4 is rolled first, and its result is applied.';
const BULK_PROMPT_SOURCES = [
  ...BULK_DEFAULTS.sourceMatches,
  /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Footer)?\.svelte$/,
  /^src\/ui\/svelte\/apps\/crafting\/rollPrompt\.js$/,
];

/**
 * Issue 2008's bulk additional dice (frame 36): Air Shard and the Longsword on Smithing's simple
 * salvage, with Runework's routed Ruined Slag where a batch names it, every row paid from Sera
 * Vane's Momentum and seeded with no salvage tool, so each row's own reach is judged.
 */
const BULK_ADDITIONAL_SOURCES = [
  ...BULK_PROMPT_SOURCES,
  /^src\/ui\/svelte\/apps\/crafting\/RollPromptAdditionalDice\.svelte$/,
  /^src\/ui\/presenters\/additionalDicePrompt\.js$/,
];
const bulkAdditionalSteps = (keys) => [
  ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
  ...keys.map((key) => SHIFT_CLICK(key)),
  { selector: '[data-inventory-bulk-salvage]' },
];
const SMITHING_ROWS = ['lab-smithing:sm-air-shard', 'lab-smithing:sm-longsword'];
const THREE_ROWS = [...SMITHING_ROWS, 'lab-runework:rw-slag'];
const BULK_BLOCKED = (action) =>
  `:has(.manager-modal-footer button[data-action="${action}"][aria-disabled="true"])`;
const BULK_ENABLED = (action) =>
  `:has(.manager-modal-footer button[data-action="${action}"]:not([aria-disabled]))`;
const BULK_NOTE = (text) => `:has([data-roll-prompt-block-note]:text-is("${text}"))`;
const UNREACHABLE_ROWS = (count) =>
  `:has(.bulk-row:nth-child(${count}) [data-roll-prompt-bulk-unreachable])` +
  `:not(:has(.bulk-row:nth-child(${count + 1})))`;
/** Buy one die on the standing prompt, then roll (issue 2008). */
const buyOneAndRoll = (prompt) => [
  { selector: `${prompt} [data-roll-prompt-additional-dice-stepper] [data-stepper-increment]` },
  { selector: `${prompt} button[type="submit"]` },
];
const SINGLE_SALVAGE_PROMPT = '.fabricate-app .manager-modal[data-roll-prompt="single"]';
/** The Longsword's single salvage, its one bought die rolled at or under 20 (frame 39). */
const SALVAGE_LONGSWORD_BOUGHT = Object.freeze([
  { selector: '[data-inventory-search]', fill: 'Longsword' },
  { selector: CARD_BUTTON('lab-smithing:sm-longsword') },
  { selector: '[data-inventory-detail-tab="salvage"]' },
  { selector: '[data-inventory-salvage-action]' },
  ...buyOneAndRoll(SINGLE_SALVAGE_PROMPT),
]);
const LAST_TILE_BOUGHT = '.fabricate-dice-tiles__tile:last-child[data-dice-tile-marks~="bought"]';
const BOUGHT_SALVAGE_SOURCES = [
  /^src\/ui\/presenters\/(?:SalvageChatCard|BulkSalvageChatCard|countDiceTiles|countEvidenceRows)\.js$/,
];
function bulkAdditionalCase({ id, label, state, keys = SMITHING_ROWS, expectSelector }) {
  return playerCase({
    ...BULK_DEFAULTS,
    id,
    label: `Player app — Inventory bulk roll prompt, additional dice ${label}`,
    query: { tab: 'inventory', dialog: 'open', rollPromptState: state },
    steps: bulkAdditionalSteps(keys),
    expectSelector: BULK_PROMPT + expectSelector,
    sourceMatches: BULK_ADDITIONAL_SOURCES,
  });
}

/** The Salvage tab's roll-under target line (issue 2005): its presenter and the bodies drawing it. */
const SALVAGE_TARGET_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/apps\/inventory\/detail\/salvage\/Salvage(?:Simple|Routed)Body\.svelte$/,
  /^src\/ui\/svelte\/apps\/inventory\/detail\/InventorySalvagePanel\.svelte$/,
  /^src\/ui\/presenters\/(?:salvageCheckNeed|checkDescriptor)\.js$/,
]);

/** The inventory inspector's cross-reference frames: its own tree, its store and its header. */
const XREF_SOURCES = Object.freeze([
  /^src\/ui\/svelte\/apps\/inventory\//,
  /^src\/ui\/svelte\/stores\/inventory/,
  PLAYER_DETAIL_HEADER,
]);

export const CASES = Object.freeze([
  playerCase({
    id: 'player-gathering-environments',
    label: 'Player app — Gathering environments',
    smokeLabels: ['player-gathering-environments'],
    reaches: 'exact',
    query: { tab: 'gathering' },
    steps: [],
    kinds: ['player', 'gathering'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/gathering\//, PLAYER_VIEW_STATE],
  }),
  playerCase({
    id: 'fabricate-app-shell',
    label: 'Player app — App shell',
    smokeLabels: ['fabricate-app-shell'],
    reaches: 'exact',
    query: { tab: 'crafting' },
    steps: [],
    kinds: ['player', 'crafting'],
    sourceMatches: [
      CRAFTING_SHARED,
      /^src\/ui\/svelte\/stores\/craftingStore/,
      /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/,
      // The bar this frame draws, named explicitly as of issue 1500 rather than arriving by broad signal.
      /^src\/ui\/svelte\/apps\/ActorSelectTopBar\.svelte$/,
      PLAYER_VIEW_STATE,
    ],
  }),
  // The primitive's first player-window frame (issue 1475).
  playerCase({
    id: 'player-actor-picker',
    label: 'Player app — Actor picker',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'crafting' },
    steps: [{ selector: '.fabricate-app-actor-bar .actor-bar-trigger' }],
    expectSelector:
      '.fabricate-app > .fabricate-picker-popover.actor-bar-popover' +
      ':has(.manager-travel-popover-search)' +
      ' .manager-travel-option',
    kinds: ['player', 'crafting'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/FabricateAppRoot\.svelte$/,
      /^src\/ui\/svelte\/apps\/ActorSelectTopBar\.svelte$/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-inventory',
    label: 'Player app — Inventory',
    smokeLabels: ['player-inventory'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    steps: [],
    kinds: ['player', 'inventory'],
    // `ComponentSourcesBar` named explicitly (issue 1513), the repair issue 1500 made for `ActorSelectTopBar`.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/apps\/crafting\/ComponentSourcesBar\.svelte$/,
      PLAYER_VIEW_STATE,
      PLAYER_DETAIL_HEADER,
    ],
  }),
  // Issue 2321: a tool's Required for, a recipe row that opens beside a gathering row that does
  // not. Idrin is the crafting actor because only Idrin knows a recipe the Alembic is required for.
  playerCase({
    id: 'player-inventory-xref-tool',
    label: 'Player app — Inventory tool Required for, a recipe and a gathering task',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory' },
    steps: [
      { selector: '.fabricate-app-actor-bar .actor-bar-trigger' },
      { selector: '.actor-bar-popover .manager-travel-option:has-text("Idrin Ashfall")' },
      { selector: '[data-inventory-search]', fill: 'Alembic' },
      { selector: CARD_BUTTON('tool:lab-herbalism:hb-tool-alembic') },
    ],
    expectSelector:
      '[data-inventory-section="required"]' +
      ':has([data-inventory-required-for="hb-r-antitoxin"] > button)' +
      ':has([data-inventory-required-for-kind="gathering"])',
    expectCenterHit: '[data-inventory-required-for="hb-r-antitoxin"] > button',
    kinds: ['player', 'inventory'],
    sourceMatches: XREF_SOURCES,
  }),
  // Issue 2321: an essence's Contributing rows, each a component and the count it carries.
  playerCase({
    id: 'player-inventory-xref-essence',
    label: 'Player app — Inventory essence Contributing',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Earth' },
      { selector: CARD_BUTTON('essence:lab-smithing:earth') },
    ],
    expectSelector:
      '[data-inventory-section="contributors"]' +
      ':has([data-inventory-contributor="sm-iron-ore"] .fabricate-list-row-quantity)' +
      ':has([data-inventory-contributor="sm-oak-haft"])',
    kinds: ['player', 'inventory'],
    sourceMatches: XREF_SOURCES,
  }),
  playerCase({
    id: 'player-inventory-page-size',
    label: 'Player app — Inventory page size list',
    smokeLabels: [],
    reaches: 'beyond',
    // The `showTick={false}` half of the issue 1504 pair: only the ticked frame reads the gutter as gone.
    query: { tab: 'inventory' },
    steps: [{ selector: '.inventory-grid-pagination [data-pagination-size]' }],
    // Three claims: the panel is a child of the application frame, it is unticked, and it holds the option rows.
    expectSelector:
      '.fabricate-app > .fabricate-select-popover:not(.fabricate-select-popover-ticked) ' +
      '[data-popover-option="75"]',
    // Inside the captured window, which is `.fabricate-app`: a panel clamped outside that box proves nothing.
    expectContained: [{ container: '.fabricate-app', target: '.fabricate-select-popover' }],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  playerCase({
    id: 'player-inventory-sort-list',
    label: 'Player app — Inventory sort list',
    smokeLabels: [],
    reaches: 'beyond',
    // The ticked half of the player window's pair (issue 1511).
    query: { tab: 'inventory' },
    steps: [{ selector: '[data-inventory-sort]' }],
    // The portal, the ticked configuration and a row that is not the current value.
    expectSelector:
      '.fabricate-app > .fabricate-select-popover.fabricate-select-popover-ticked ' +
      '[data-popover-option="quantity"]',
    expectContained: [{ container: '.fabricate-app', target: '.fabricate-select-popover' }],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      ...ANCHORED_POPOVER_SOURCES,
    ],
  }),
  ...[
    { id: 'player-inventory-book-read-learn', label: '' },
    {
      id: 'player-inventory-book-read-learn-stacked',
      label: ', stacked',
      position: { width: 1024, height: 860 },
      kinds: ['responsive'],
      expectLayout: responsiveLayout('.inventory-view-container', '.inventory-view-grid'),
    },
  ].map(({ id, label, kinds = [], ...variant }) =>
    playerCase({
      id,
      label: `Player app — Inventory book, Read & learn${label}`,
      smokeLabels: [],
      reaches: 'beyond',
      // A held knowledge book whose learn cap covers its three recipes (issue 1518).
      query: { tab: 'inventory', learnableBook: '1' },
      steps: [
        { selector: '[data-inventory-search]', fill: 'Hedgerow' },
        { selector: CARD_BUTTON('recipeitem:lab-herbalism:hb-herbal') },
      ],
      expectSelector: READ_LEARN_ACTION,
      expectCenterHit: READ_LEARN_ACTION,
      kinds: ['player', 'inventory', ...kinds],
      sourceMatches: [
        /^src\/ui\/svelte\/apps\/inventory\//,
        /^src\/ui\/svelte\/stores\/inventory/,
        /^src\/ui\/svelte\/util\/bookRecipeBrowse\.js$/,
        PLAYER_DETAIL_HEADER,
      ],
      ...variant,
    })
  ),
  playerCase({
    id: 'player-salvage',
    label: 'Player app — Salvage',
    smokeLabels: ['player-salvage'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // The progressive salvage body with its reorderable stage list, which is the counterpart's own condition.
    steps: [
      { selector: '[data-inventory-search]', fill: 'Cracked Alembic' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-herbalism:hb-cracked-alembic"] .inventory-card-button',
      },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
    // The per-stage complication band (issue 1286) is asserted here: `SalvageProgressiveBody` passes `complications` on every render.
    expectSelector:
      '[data-inventory-salvage-panel="progressive"]' +
      ':has([data-progressive-stage="hb-salv-alembic-r2"] ' +
      '[data-progressive-stage-complications][data-progressive-stage-complication-tense="forecast"] ' +
      '[data-progressive-stage-complication="hb-comp-dust-cloud"])' +
      ':not(:has([data-progressive-stage-complication="hb-comp-dust-spoiled"]))' +
      ' [data-progressive-stage="hb-salv-alembic-r1"]' +
      ':not(:has([data-progressive-stage-complications]))',
  }),
  playerCase({
    id: 'player-salvage-no-check',
    label: 'Player app — Salvage no check',
    smokeLabels: ['player-salvage-no-check'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // Simple salvage with no authored roll formula, so every result is recovered outright.
    steps: [
      { selector: '[data-inventory-search]', fill: 'Longsword' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-longsword"] .inventory-card-button',
      },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  playerCase({
    id: 'player-salvage-tools',
    label: 'Player app — Salvage tools',
    smokeLabels: ['player-salvage-tools'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // The pre-roll tool disclosure in both states: the Forge Tongs the actor holds and the Anvil it does not.
    steps: [
      { selector: '[data-inventory-search]', fill: 'Field Toolchest' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-toolchest"] .inventory-card-button',
      },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  // Issue 2005: a salvage rolled under a fixed target states its evidence rows in the summary.
  playerCase({
    id: 'player-salvage-under-result',
    label: 'Player app — Salvage summary after a roll-under salvage, with its evidence rows',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', dialog: 'open', rollPromptState: 'salvage-under-evidence' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Longsword' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-longsword"] .inventory-card-button',
      },
      { selector: '[data-inventory-detail-tab="salvage"]' },
      { selector: '[data-inventory-salvage-action]' },
      {
        selector: '.fabricate-app .manager-modal[data-roll-prompt="single"] button[type="submit"]',
      },
      {
        selector: '[data-inventory-salvage-summary="success"] [data-check-evidence-rows]',
        scroll: true,
      },
    ],
    expectSelector:
      '[data-inventory-salvage-summary="success"] [data-check-evidence-rows]' +
      ':has([data-check-evidence="target"]):has([data-check-evidence="margin"])',
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\/detail\/salvage\/SalvageRollSummary\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/detail\/CheckEvidenceRows\.svelte$/,
      /^src\/ui\/presenters\/check(?:Display|EvidenceRows)\.js$/,
      /^src\/ui\/svelte\/stores\/inventorySalvageExecution/,
    ],
  }),
  // Issue 2092: a failed single salvage states the same Target/Margin rows, in a failure box.
  playerCase({
    id: 'player-salvage-under-result-fail',
    label: 'Player app — Salvage summary after a failed roll-under salvage, with its evidence rows',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', dialog: 'open', rollPromptState: 'salvage-under-evidence-fail' },
    // The failure toast the player is shown, which the lab reports as a console warning.
    allowedConsoleErrors: [/Salvage check failed/],
    steps: [
      { selector: '[data-inventory-search]', fill: 'Longsword' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-longsword"] .inventory-card-button',
      },
      { selector: '[data-inventory-detail-tab="salvage"]' },
      { selector: '[data-inventory-salvage-action]' },
      {
        selector: '.fabricate-app .manager-modal[data-roll-prompt="single"] button[type="submit"]',
      },
      {
        selector: '[data-inventory-salvage-summary="failure"] [data-check-evidence-rows]',
        scroll: true,
      },
    ],
    expectSelector:
      '[data-inventory-salvage-summary="failure"] [data-check-evidence-rows]' +
      ':has([data-check-evidence="target"]):has([data-check-evidence="margin"])',
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\/detail\/salvage\/SalvageRollSummary\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/detail\/CheckEvidenceRows\.svelte$/,
      /^src\/ui\/presenters\/check(?:Display|EvidenceRows)\.js$/,
      /^src\/ui\/svelte\/stores\/inventorySalvageExecution/,
    ],
  }),
  playerCase({
    id: 'player-inventory-multi-system',
    label: 'Player app — Inventory multi system',
    smokeLabels: ['player-inventory-multi-system'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // One stack registered in two systems collapses to a single card, carrying the system-selector drop-down.
    steps: [
      { selector: '[data-inventory-search]', fill: 'Air Shard' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-air-shard"] .inventory-card-button',
      },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      PLAYER_DETAIL_HEADER,
    ],
  }),
  // Issue 2005: a roll-under salvage names its target and source in place of a DC, and its banner
  // says the total must stay at or under the target.
  playerCase({
    id: 'player-salvage-under-simple',
    label: 'Player app — Salvage roll-under against a character value',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', rollPromptState: 'salvage-under-skill' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Air Shard' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-air-shard"] .inventory-card-button',
      },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    expectSelector:
      '[data-inventory-salvage-panel="simple"]' +
      ':has([data-inventory-salvage-banner]:has-text("stay at or under the target"))' +
      ':has([data-inventory-salvage-target="under"]):has([data-inventory-salvage-target-source])',
    kinds: ['player', 'inventory'],
    sourceMatches: SALVAGE_TARGET_SOURCES,
  }),
  playerCase({
    id: 'player-salvage-under-routed',
    label: 'Player app — Routed salvage roll-under, its base target in place of a DC',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', rollPromptState: 'salvage-under' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Ruined Slag' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-runework:rw-slag"] .inventory-card-button',
      },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    expectSelector:
      '[data-inventory-salvage-body="routed"]:has([data-inventory-salvage-target="under"])' +
      ':not(:has([data-inventory-salvage-dc]))',
    kinds: ['player', 'inventory'],
    sourceMatches: SALVAGE_TARGET_SOURCES,
  }),
  // Issue 2137: the control, a routed salvage summing against the slag's DC 11, its kicker and its
  // Reached-at thresholds.
  playerCase({
    id: 'player-salvage-routed-dc',
    label: 'Player app — Routed salvage against a DC, its kicker and thresholds',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Ruined Slag' },
      { selector: CARD_BUTTON('lab-runework:rw-slag') },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    expectSelector:
      '[data-inventory-salvage-body="routed"]' +
      ':has(.salvage-dc[data-inventory-salvage-dc="11"]:text-is("DC 11"))' +
      ':has([data-inventory-salvage-outcome="rw-salv-masterwork"] .manager-chip[data-inventory-outcome-threshold="16"])' +
      ':not(:has([data-inventory-outcome-band]))',
    kinds: ['player', 'inventory'],
    sourceMatches: [
      ...SALVAGE_TARGET_SOURCES,
      /^src\/ui\/presenters\/InventoryListingBuilder\.js$/,
    ],
  }),
  // Issue 2137: a routed salvage counting one success needed states each tier's band in net
  // successes, as the Journal does, in place of a Reached-at threshold.
  playerCase({
    id: 'player-salvage-count-routed',
    label: 'Player app — Routed salvage that counts successes, its tiers in net successes',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', rollPromptState: 'salvage-count' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Ruined Slag' },
      { selector: CARD_BUTTON('lab-runework:rw-slag') },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    expectSelector:
      '[data-inventory-salvage-body="routed"]:not(:has([data-inventory-salvage-dc]))' +
      ':has([data-inventory-salvage-outcome="rw-salv-masterwork"] [data-inventory-outcome-band="6+"])' +
      ':has([data-inventory-salvage-outcome="rw-salv-standard"] [data-inventory-outcome-band="1–5"])' +
      ':has([data-inventory-salvage-outcome="rw-salv-ruined"] .manager-chip.is-danger[data-inventory-outcome-band="0"])',
    kinds: ['player', 'inventory'],
    sourceMatches: [
      ...SALVAGE_TARGET_SOURCES,
      /^src\/ui\/presenters\/InventoryListingBuilder\.js$/,
      /^src\/systems\/runJournalOutcomeBands\.js$/,
    ],
  }),
  // With cancelling on, the same salvage closes on the Journal's Botch row beside Ruined: Ruined
  // (−5 from one needed) is met from a net of −4, so only a lower net is a Botch.
  playerCase({
    id: 'player-salvage-count-routed-botch',
    label: 'Player app — Routed counting salvage with cancelling, its Botch row beside Ruined',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', rollPromptState: 'salvage-count-cancel' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Ruined Slag' },
      { selector: CARD_BUTTON('lab-runework:rw-slag') },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    expectSelector:
      '[data-inventory-salvage-body="routed"]' +
      ':has([data-inventory-salvage-outcome="rw-salv-ruined"] [data-inventory-outcome-band="−4 – 0"])' +
      ':has([data-inventory-salvage-outcome="rw-salv-ruined"] + [data-inventory-salvage-outcome="count-botch"]' +
      ' .manager-chip[data-inventory-outcome-band="<−4"])',
    kinds: ['player', 'inventory'],
    sourceMatches: [
      ...SALVAGE_TARGET_SOURCES,
      /^src\/ui\/presenters\/InventoryListingBuilder\.js$/,
      /^src\/systems\/runJournalOutcomeBands\.js$/,
    ],
  }),
  // Issue 2152: a routed fixed salvage states its authored segments and no DC, a negative-ended
  // tier with the true minus spaced from the dash.
  playerCase({
    id: 'player-salvage-fixed-routed',
    label: 'Player app — Routed salvage on fixed ranges, a negative-ended tier and no DC',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', rollPromptState: 'salvage-fixed-routed' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Ruined Slag' },
      { selector: CARD_BUTTON('lab-runework:rw-slag') },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    expectSelector:
      '[data-inventory-salvage-body="routed"][data-inventory-routed-type="fixed"]' +
      ':not(:has([data-inventory-salvage-dc])):has([data-inventory-outcome-band="−2 – −1"])',
    kinds: ['player', 'inventory'],
    sourceMatches: [
      ...SALVAGE_TARGET_SOURCES,
      /^src\/ui\/presenters\/InventoryListingBuilder\.js$/,
      // `netRange` spaces the negative-ended tier's dash.
      /^src\/systems\/runJournalOutcomeBands\.js$/,
    ],
  }),
  // Issue 1644: after a routed salvage of the slag, the shared ladder marks the one tier it reached.
  playerCase({
    id: 'player-salvage-routed-reached',
    label: 'Player app — Routed salvage after its roll, the reached tier marked "Your roll"',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', dialog: 'open' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Ruined Slag' },
      { selector: CARD_BUTTON('lab-runework:rw-slag') },
      { selector: '[data-inventory-detail-tab="salvage"]' },
      { selector: '[data-inventory-salvage-action]' },
      { selector: `${SINGLE_SALVAGE_PROMPT} button[type="submit"]` },
      { selector: '[data-outcome-rolled="true"]', scroll: true },
    ],
    expectSelector:
      '[data-inventory-salvage-body="routed"]' +
      ':has([data-inventory-salvage-outcome="rw-salv-masterwork"][data-outcome-rolled="true"]' +
      ' .manager-chip[data-inventory-outcome-your-roll])',
    kinds: ['player', 'inventory'],
    sourceMatches: [
      ...SALVAGE_TARGET_SOURCES,
      /^src\/ui\/svelte\/stores\/inventorySalvageExecution/,
    ],
  }),
  playerCase({
    id: 'player-salvage-misconfigured',
    label: 'Player app — Salvage misconfigured',
    smokeLabels: ['player-salvage-misconfigured'],
    // Window, not exact: this renders the misconfigured salvage body for `routedNoFormula`, the smoke's for `simpleMultiGroup`.
    reaches: 'window',
    query: { tab: 'inventory' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Bent Clasp' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-jewelry:jw-bent-clasp"] .inventory-card-button',
      },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  // Every card named below sits on page one of the 25-per-page grid, verified by rendering rather than inferred.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mixed',
    label: 'Player app — Inventory bulk selection (mixed)',
    // The headline frame: one plain click, then three shift-clicks, partitioned into queue, yield and blocked list.
    steps: [
      // Plain, not shift: this is the card the first shift-click must promote, which the assertion below reads.
      { selector: CARD_BUTTON('lab-smithing:sm-air-shard') },
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
      SHIFT_CLICK('lab-jewelry:jw-bent-clasp'),
      SHIFT_CLICK('lab-smithing:sm-toolchest'),
    ],
    // One selector carrying two assertions, scoped to the app root, the only common ancestor of grid and panel.
    expectSelector:
      '.fabricate-app-shell' +
      `:has(${CARD('lab-smithing:sm-air-shard')}[data-inventory-card-bulk-selected="true"])` +
      ':has([data-inventory-bulk-yield] .manager-chip.is-positive)' +
      ':has([data-inventory-bulk-yield] .manager-chip.is-accent)',
    // The bulk panel draws the same identity row through `InventoryDetailHeader`.
    sourceMatches: [...BULK_DEFAULTS.sourceMatches, PLAYER_DETAIL_HEADER],
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mixed-narrow',
    label: 'Player app — Inventory bulk selection (narrowest window)',
    // The same selection at the narrowest window the app permits.
    steps: [
      { selector: CARD_BUTTON('lab-smithing:sm-air-shard') },
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
      SHIFT_CLICK('lab-jewelry:jw-bent-clasp'),
      SHIFT_CLICK('lab-smithing:sm-toolchest'),
    ],
    position: { width: 1024, height: 860 },
    kinds: ['player', 'inventory', 'bulk', 'responsive'],
    expectLayout: responsiveLayout('.inventory-view-container', '.inventory-view-grid'),
    expectSelector:
      '.fabricate-app-shell' +
      `:has(${CARD('lab-smithing:sm-air-shard')}[data-inventory-card-bulk-selected="true"])` +
      ':has([data-inventory-bulk-queue="preview"] [data-inventory-bulk-queue-row])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-none-salvageable',
    label: 'Player app — Inventory bulk selection with nothing salvageable',
    // The footer's asymmetry: Salvage is withheld with nothing to salvage, Destroy stays live and deletes whole stacks.
    steps: [
      { selector: CARD_BUTTON('lab-smithing:sm-coal') },
      SHIFT_CLICK('lab-smithing:sm-copper-ore'),
      SHIFT_CLICK('lab-herbalism:hb-empty-vial'),
    ],
    // The panel state alone passes on any footer, and the footer is what this case is named for, so both buttons are named.
    expectSelector:
      '[data-inventory-bulk-panel="empty"]' +
      ':has([data-inventory-bulk-empty])' +
      ':has([data-inventory-bulk-salvage][disabled])' +
      ':has([data-inventory-bulk-destroy]:not([disabled]))',
  }),
  // One frame per salvage resolution mode, plus one carrying all three at once.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mode-simple',
    label: 'Player app — Inventory bulk salvage, simple mode',
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-smithing:sm-longsword'),
    ],
    // Guaranteed: simple with no authored roll formula awards its whole result set, and the certainty chip shows it.
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-queue-row="lab-smithing:sm-longsword"])' +
      ':has([data-inventory-bulk-yield] .manager-chip.is-positive)',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mode-routed',
    label: 'Player app — Inventory bulk salvage, routed mode',
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-runework:rw-slag'),
    ],
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-queue-row="lab-runework:rw-slag"])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mode-progressive',
    label: 'Player app — Inventory bulk salvage, progressive mode',
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
    ],
    // Progressive is the one mode that honours a saved stage order, so it carries the footer's reorder note.
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-queue-row="lab-herbalism:hb-cracked-alembic"])' +
      ':has([data-inventory-bulk-reorder-note])' +
      ':has([data-inventory-bulk-complications] [data-inventory-bulk-complication-count])' +
      ':has([data-inventory-bulk-complication-group="lab-herbalism:hb-cracked-alembic"] ' +
      '[data-inventory-bulk-complication-position="2"] ' +
      '[data-inventory-bulk-complication="hb-comp-dust-cloud"])' +
      ':has([data-inventory-bulk-complication-position="3"] ' +
      '[data-inventory-bulk-complication="hb-comp-frostcap-shatter"])' +
      ':not(:has([data-inventory-bulk-complication-position="1"]))' +
      ':has([data-inventory-bulk-complication-order="arrangeable"])' +
      ':not(:has([data-inventory-bulk-complication-order="players"]))' +
      ':not(:has([data-inventory-bulk-complication="hb-comp-dust-spoiled"]))',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-all-modes',
    label: 'Player app — Inventory bulk salvage across all three resolution modes',
    // One of each, in one queue, across three systems — the case the other three exist to be read against.
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-smithing:sm-longsword'),
      SHIFT_CLICK('lab-runework:rw-slag'),
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
    ],
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-queue-row="lab-smithing:sm-longsword"])' +
      ':has([data-inventory-bulk-queue-row="lab-runework:rw-slag"])' +
      ':has([data-inventory-bulk-queue-row="lab-herbalism:hb-cracked-alembic"])',
  }),
  // The one complication state no existing frame reaches (issue 1286).
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-complications-reordered',
    label: 'Player app — Inventory bulk complications, reordered stage list',
    // The order note and the renumbering are photographed together, because neither means anything alone.
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      { selector: '[data-inventory-detail-tab="salvage"]' },
      { selector: '[data-progressive-stage-move-down]' },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
    ],
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-complication-group="lab-herbalism:hb-cracked-alembic"] ' +
      '[data-inventory-bulk-complication-order="players"])' +
      ':has([data-inventory-bulk-complication-position="1"] ' +
      '[data-inventory-bulk-complication="hb-comp-dust-cloud"])' +
      ':has([data-inventory-bulk-complication-position="3"] ' +
      '[data-inventory-bulk-complication="hb-comp-frostcap-shatter"])' +
      ':not(:has([data-inventory-bulk-complication-position="2"]))' +
      ':not(:has([data-inventory-bulk-complication="hb-comp-dust-spoiled"]))',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-tools-blocked',
    label: 'Player app — Inventory bulk selection blocked on missing tools',
    // `toolsUnavailable` is the one blocked reason a player can act on, and the only one whose copy is data-driven.
    steps: [
      { selector: CARD_BUTTON('lab-smithing:sm-toolchest') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
    ],
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ':has([data-inventory-bulk-blocked-row="toolsUnavailable"])' +
      ':has([data-inventory-bulk-queue="preview"] [data-inventory-bulk-queue-row])',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-roll-prompt',
    label: 'Player app — Inventory bulk roll prompt',
    // One prompt for the whole batch — the answer to the issue's open question, and the state acceptance 4 is about.
    query: { tab: 'inventory', dialog: 'open' },
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    // Held to the prompt's own element, never to the tab. The one row that rolls offers keep, so
    // the batch does; the row with no check never joins the offer (issue 2007).
    expectSelector:
      '.fabricate-app .manager-modal[data-roll-prompt="bulk"]' +
      ':has(.manager-modal-title:has-text("Salvage checks"))' +
      ':has(.bulk-need:text-is("No check"))' +
      ':has(.manager-modal-footer button[data-action="advantage"] .action-note:text-is("keep the better"))' +
      ':has(.bulk-list + .bulk-note) .bulk-row',
    sourceMatches: [
      ...BULK_DEFAULTS.sourceMatches,
      /^src\/ui\/svelte\/apps\/crafting\/RollPrompt(?:Footer)?\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPrompt\.js$/,
      /^src\/ui\/svelte\/apps\/crafting\/rollPromptHost\.js$/,
    ],
  }),
  // A roll-under batch names each row's target, and the bonus help says a bonus raises it.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-roll-prompt-under',
    label: 'Player app — Inventory bulk roll prompt, roll-under targets',
    query: { tab: 'inventory', dialog: 'open', rollPromptState: 'salvage-under' },
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      SHIFT_CLICK('lab-runework:rw-slag'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    expectSelector: BULK_PROMPT_ROWS(UNDER_BONUS_HELP, [
      ['Air Shard', 'Target 12'],
      ['Ruined Slag', 'Target 11'],
    ]),
    sourceMatches: BULK_PROMPT_SOURCES,
  }),
  // A character-value row has no single target, so the mixed batch keeps the roll-over help.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-roll-prompt-under-attribute',
    label: 'Player app — Inventory bulk roll prompt, a roll-under row with no single target',
    query: { tab: 'inventory', dialog: 'open', rollPromptState: 'salvage-under-attribute' },
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      SHIFT_CLICK('lab-runework:rw-slag'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    expectSelector: BULK_PROMPT_ROWS(UNDER_BONUS_HELP, [
      ['Air Shard', 'Target 12'],
      ['Ruined Slag', 'No single target'],
    ]),
    sourceMatches: BULK_PROMPT_SOURCES,
  }),
  // A count batch names each row's successes needed, and the help says a bonus adds dice.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-roll-prompt-count',
    label: 'Player app — Inventory bulk roll prompt, success-counting rows',
    query: { tab: 'inventory', dialog: 'open', rollPromptState: 'salvage-count' },
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      SHIFT_CLICK('lab-runework:rw-slag'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    expectSelector: BULK_PROMPT_ROWS(COUNT_BONUS_HELP, [
      ['Air Shard', '2 needed'],
      ['Ruined Slag', '1 needed'],
    ]),
    sourceMatches: BULK_PROMPT_SOURCES,
  }),
  // Issue 2007: two bonus dice of different sizes, so the batch offers both buttons and no note.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-roll-prompt-advantage',
    label: 'Player app — Inventory bulk roll prompt, rolls whose advantage notes differ',
    query: { tab: 'inventory', dialog: 'open', rollPromptState: 'salvage-advantage-mixed' },
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      SHIFT_CLICK('lab-runework:rw-slag'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    expectSelector:
      BULK_PROMPT +
      ':has(.manager-modal-footer button[data-action="disadvantage"])' +
      ':has(.manager-modal-footer button[data-action="normal"][type="submit"])' +
      ':has(.manager-modal-footer button[data-action="advantage"])' +
      ':not(:has(.action-note))' +
      ' .bulk-list:has(> .bulk-row > .bulk-name:text-is("Ruined Slag") + .bulk-need:text-is("Target 11"))',
    sourceMatches: BULK_PROMPT_SOURCES,
  }),
  // Issue 2007 (frame 36, `pBulk`): both bonus dice are the same `1d6`, so the batch's offer agrees
  // on `kind` and `detail`, and the sub-label shows once for the whole footer.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-roll-prompt-advantage-shared',
    label: 'Player app — Inventory bulk roll prompt, rolls that share an advantage note',
    query: { tab: 'inventory', dialog: 'open', rollPromptState: 'salvage-advantage-shared' },
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      SHIFT_CLICK('lab-runework:rw-slag'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    expectSelector:
      BULK_PROMPT +
      ':has(.manager-modal-footer button[data-action="advantage"] .action-note:text-is("+1d6 to the target"))' +
      ':has(.manager-modal-footer button[data-action="disadvantage"] .action-note:text-is("−1d6 to the target"))' +
      ' .bulk-list:has(> .bulk-row > .bulk-name:text-is("Ruined Slag") + .bulk-need:text-is("Target 11"))',
    sourceMatches: BULK_PROMPT_SOURCES,
  }),
  // Frame 36 (`pBulk`): three rolls share Sera Vane's 2 Momentum, too few for a die each.
  bulkAdditionalCase({
    id: 'player-inventory-bulk-roll-prompt-count-additional',
    label: 'too few for a die each (prototype frame 36)',
    state: 'salvage-count-additional',
    keys: THREE_ROWS,
    expectSelector:
      ':has([data-roll-prompt-additional-dice-resource]:text-is("Momentum 2 available"))' +
      ':has([data-roll-prompt-additional-dice-spend]:text-is("Spends 0 Momentum across 3 rolls (0 each)"))' +
      ':has([data-roll-prompt-additional-dice-message].is-info:has-text("Not enough Momentum to buy a die for every roll."))' +
      ':has(input[data-roll-prompt-additional-dice]:disabled)' +
      ':not(:has([data-roll-prompt-bulk-unreachable]))' +
      BULK_ENABLED('normal'),
  }),
  // R1 across the batch: no row reaches three successes without Advantage's extra die.
  bulkAdditionalCase({
    id: 'player-inventory-bulk-roll-prompt-count-additional-blocked',
    label: 'every row reaching only with Advantage (ruling R1)',
    state: 'salvage-count-additional-blocked',
    expectSelector:
      BULK_BLOCKED('disadvantage') +
      BULK_BLOCKED('normal') +
      BULK_ENABLED('advantage') +
      BULK_NOTE('Only Advantage can reach the successes needed.') +
      ':not(:has([data-roll-prompt-bulk-unreachable]))',
  }),
  bulkAdditionalCase({
    id: 'player-inventory-bulk-roll-prompt-count-additional-blocked-all',
    label: 'no row able to reach under any action (ruling R1)',
    state: 'salvage-count-additional-blocked-all',
    expectSelector:
      BULK_BLOCKED('disadvantage') +
      BULK_BLOCKED('normal') +
      BULK_BLOCKED('advantage') +
      BULK_NOTE('Rolling is disabled: none of these rolls can reach the successes they need.') +
      UNREACHABLE_ROWS(2),
  }),
  // One row cannot reach, the other can, so the batch keeps every action and marks the one row.
  bulkAdditionalCase({
    id: 'player-inventory-bulk-roll-prompt-count-additional-partial',
    label: 'one row unable to reach (ruling R1)',
    state: 'salvage-count-additional-partial',
    expectSelector:
      BULK_ENABLED('disadvantage') +
      BULK_ENABLED('normal') +
      BULK_ENABLED('advantage') +
      ':not(:has([data-roll-prompt-block-note]))' +
      ':has(.bulk-row:nth-child(1) > .bulk-name:text-is("Air Shard"))' +
      ':has(.bulk-row:nth-child(1) [data-roll-prompt-bulk-unreachable])' +
      ':has(.bulk-row:nth-child(2) > .bulk-need:text-is("1 needed"))' +
      ':not(:has(.bulk-row:nth-child(2) [data-roll-prompt-bulk-unreachable]))',
  }),
  // Two resources in one batch: the titled well with no stepper, and its note says why.
  bulkAdditionalCase({
    id: 'player-inventory-bulk-roll-prompt-count-additional-mixed',
    label: 'paid from two different resources',
    state: 'salvage-count-additional-mixed',
    keys: THREE_ROWS,
    expectSelector:
      ' .fab-well[data-roll-prompt-additional-dice-group]' +
      ':not(:has(input[data-roll-prompt-additional-dice]))' +
      ':has([data-roll-prompt-additional-dice-title]:text-is("Additional dice"))' +
      ' [data-roll-prompt-additional-dice-message].is-info:has-text("Rolls in this batch use different resources, so no dice can be added.")',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-destroy-confirm',
    label: 'Player app — Inventory bulk destroy confirmation',
    // The confirmation for the destructive half, standing unanswered.
    query: { tab: 'inventory', dialog: 'open' },
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-destroy]' },
    ],
    // Same failure mode as the roll prompt, and the same answer: hold it to the confirm's own copy.
    expectSelector: '.application.dialog:has(button[data-action="yes"]) .dialog-content p + p',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-broken-queued',
    label: 'Player app — Inventory bulk broken but salvageable',
    // Acceptance 3: brokenness is about usability and does not gate salvage, so a broken row stays in the queue.
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-longsword'),
    ],
    // One queue row carrying both pills, which is the whole claim in one selector a looser one would accept.
    expectSelector:
      '[data-inventory-bulk-panel="preview"]' +
      ' [data-inventory-bulk-queue="preview"]' +
      ' [data-inventory-bulk-queue-row]' +
      ':has(.manager-chip.is-positive)' +
      ':has(.manager-chip.is-danger)',
  }),
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-report',
    label: 'Player app — Inventory bulk report',
    // What a finished batch says it did: per-item outcome, per-item rolled total, and the two aggregates.
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    // The panel state plus the report's own subject list.
    expectSelector:
      '[data-inventory-bulk-panel="report"] [data-inventory-bulk-subjects] [data-inventory-bulk-subject]',
  }),
  // Issue 2006: a counting salvage names its successes needed and per-die test in place of a DC.
  playerCase({
    id: 'player-salvage-count-simple',
    label: 'Player app — Salvage that counts successes, its need and per-die test',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', rollPromptState: 'salvage-count' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Air Shard' },
      { selector: CARD_BUTTON('lab-smithing:sm-air-shard') },
      { selector: '[data-inventory-detail-tab="salvage"]' },
    ],
    expectSelector:
      '[data-inventory-salvage-panel="simple"]:not(:has([data-inventory-salvage-dc]))' +
      ':has([data-inventory-salvage-banner]:has-text("The count must reach the successes needed"))' +
      ' [data-inventory-salvage-target="over"]' +
      ':text-is("Salvage check · 2 successes needed · d10s, success on ≥ 8")',
    kinds: ['player', 'inventory'],
    sourceMatches: SALVAGE_TARGET_SOURCES,
  }),
  // Its executed dice: two d6s meeting 1 and exploding once, netting four against two needed.
  playerCase({
    id: 'player-salvage-count-result',
    label: 'Player app — Salvage summary after a counting salvage, with its tiles and rows',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', dialog: 'open', rollPromptState: 'salvage-count-result' },
    steps: [
      { selector: '[data-inventory-search]', fill: 'Longsword' },
      { selector: CARD_BUTTON('lab-smithing:sm-longsword') },
      { selector: '[data-inventory-detail-tab="salvage"]' },
      { selector: '[data-inventory-salvage-action]' },
      {
        selector: '.fabricate-app .manager-modal[data-roll-prompt="single"] button[type="submit"]',
      },
      {
        selector: '[data-inventory-salvage-summary="success"] [data-check-count-tiles]',
        scroll: true,
      },
    ],
    expectSelector:
      '[data-inventory-salvage-summary="success"]' +
      ':has([data-check-count-tiles] [data-dice-tile-generated][data-dice-tile-marks="qualified"])' +
      ':has([data-check-evidence="count"]:has-text("4 qualified − 0 cancelled = 4 net"))' +
      ' [data-check-evidence="needed"]:has-text("2 · margin +2")',
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\/detail\/salvage\/SalvageRollSummary\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/detail\/CheckEvidenceRows\.svelte$/,
      /^src\/ui\/presenters\/(?:checkDisplay|countDiceTiles|countEvidenceRows)\.js$/,
      /^src\/ui\/svelte\/stores\/inventorySalvageExecution/,
    ],
  }),
  // Issue 2008 (frame 39 on salvage): the summary marks the bought die and states its row.
  playerCase({
    id: 'player-salvage-count-result-bought',
    label: 'Player app — Salvage summary after a counting salvage with one bought die',
    smokeLabels: [],
    reaches: 'beyond',
    query: { tab: 'inventory', dialog: 'open', rollPromptState: 'salvage-count-result-bought' },
    steps: [
      ...SALVAGE_LONGSWORD_BOUGHT,
      {
        selector: '[data-inventory-salvage-summary="success"] [data-check-count-tiles]',
        scroll: true,
      },
    ],
    expectSelector:
      '[data-inventory-salvage-summary="success"]' +
      ':has([data-check-evidence="additionalDice"]:has-text("1 bought · spent 1 Momentum"))' +
      ':has([data-dice-tiles-legend]:has-text("dashed = bought"))' +
      ` [data-check-count-tiles] ${LAST_TILE_BOUGHT}`,
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\/detail\/salvage\/SalvageRollSummary\.svelte$/,
      /^src\/ui\/svelte\/apps\/crafting\/detail\/CheckEvidenceRows\.svelte$/,
      /^src\/ui\/presenters\/(?:checkDisplay|countDiceTiles|countEvidenceRows)\.js$/,
    ],
  }),
  // The single salvage's posted card: its summary, the dashed tile and the Additional dice row.
  playerCase({
    id: 'player-salvage-count-result-bought-chat',
    label: 'Player app — salvage result card with one bought die',
    smokeLabels: [],
    reaches: 'beyond',
    query: {
      tab: 'inventory',
      dialog: 'open',
      rollPromptState: 'salvage-count-result-bought',
      chatLog: '1',
    },
    steps: SALVAGE_LONGSWORD_BOUGHT,
    expectSelector:
      '.fabricate-craft-chat:has-text("Source: Longsword")' +
      ':has([data-check-count-summary]:has-text("3d20 (2 + 1 bought), each ≤ 20"))' +
      ':has([data-check-evidence="additionalDice"]:has-text("1 bought · spent 1 Momentum"))' +
      ` ${LAST_TILE_BOUGHT}`,
    kinds: ['player', 'inventory'],
    sourceMatches: BOUGHT_SALVAGE_SOURCES,
  }),
  // A bulk batch buying one die for each of its two rolls: each subject marks its own bought die.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-salvage-bought-chat',
    label: 'Player app — bulk salvage result card, one bought die on each roll',
    query: {
      tab: 'inventory',
      dialog: 'open',
      rollPromptState: 'salvage-count-result-bought',
      chatLog: '1',
    },
    steps: [...bulkAdditionalSteps(SMITHING_ROWS), ...buyOneAndRoll(BULK_PROMPT)],
    expectSelector:
      '.fabricate-craft-chat' +
      ':has(.fabricate-craft-chat__item--evidence:nth-child(2) [data-check-evidence="additionalDice"])' +
      ' .fabricate-craft-chat__item--evidence [data-check-evidence="additionalDice"]' +
      ':has-text("1 bought · spent 1 Momentum")',
    sourceMatches: BOUGHT_SALVAGE_SOURCES,
  }),
]);

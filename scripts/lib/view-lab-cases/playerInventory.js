/**
 * The player window: the shell, the inventory grid, salvage and every bulk-selection state.
 */

import {
  ANCHORED_POPOVER_SOURCES,
  BULK_DEFAULTS,
  CRAFTING_SHARED,
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
      // The bar this frame draws, named explicitly as of issue 1500. It used to arrive here for
      // free: it lived under `components/`, and a broad signal selects the representative pair, of
      // which this is one.
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
    // `ComponentSourcesBar` named explicitly (issue 1513), the repair issue 1500 made for
    // `ActorSelectTopBar` on the same measurement.
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/apps\/crafting\/ComponentSourcesBar\.svelte$/,
      PLAYER_VIEW_STATE,
    ],
  }),
  playerCase({
    id: 'player-inventory-page-size',
    label: 'Player app — Inventory page size list',
    smokeLabels: [],
    reaches: 'beyond',
    // The pair to `manager-recipes-bulk-edit-check-tier` (issue 1504), and the half that proves an
    // absence: this list is drawn at `showTick={false}`, and the ticked frame beside it is the only
    // way to read that the gutter is gone rather than merely empty.
    query: { tab: 'inventory' },
    steps: [{ selector: '.inventory-grid-pagination [data-pagination-size]' }],
    // Three claims, in the shape `player-actor-picker` uses for the same mechanism: the panel is a
    // child of the application frame (a portal that failed to land would leave it in the pager row,
    // under the grid's own overflow), it is the unticked configuration, and it holds the option
    // rows.
    expectSelector:
      '.fabricate-app > .fabricate-select-popover:not(.fabricate-select-popover-ticked) ' +
      '[data-popover-option="75"]',
    // Inside the captured window rather than merely in the document: the frame photographs
    // `[data-view-lab-frame]`, which IS the `.fabricate-app` window, so a panel clamped outside
    // that box would be evidence of nothing.
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
    // The ticked half of the PLAYER window's pair (issue 1511).
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
  playerCase({
    id: 'player-salvage',
    label: 'Player app — Salvage',
    smokeLabels: ['player-salvage'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // The progressive salvage body with its reorderable stage list — the counterpart's own
    // condition (`[data-inventory-salvage-panel="progressive"]` +
    // `[data-progressive-stage-reorderable]`).
    steps: [
      { selector: '.inventory-filters input', fill: 'Cracked Alembic' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-herbalism:hb-cracked-alembic"] .inventory-card-button',
      },
      { selector: '.inventory-detail-tab[data-inventory-detail-tab="salvage"]' },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
    // The per-stage complication band (issue 1286) is asserted here rather than given its own case,
    // and the reason is mechanical: `SalvageProgressiveBody` passes `complications` on every render
    // (`resolved ?
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
    // `[data-inventory-salvage-body="no-check"]`: Simple salvage mode with no authored roll
    // formula, so every result is recovered outright.
    steps: [
      { selector: '.inventory-filters input', fill: 'Longsword' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-longsword"] .inventory-card-button',
      },
      { selector: '.inventory-detail-tab[data-inventory-detail-tab="salvage"]' },
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
    // The pre-roll required-tool disclosure with both states in one frame: the Forge Tongs the
    // target actor holds (available) and the Anvil it does not (unavailable), which also disables
    // the pre-roll action.
    steps: [
      { selector: '.inventory-filters input', fill: 'Field Toolchest' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-toolchest"] .inventory-card-button',
      },
      { selector: '.inventory-detail-tab[data-inventory-detail-tab="salvage"]' },
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
    id: 'player-inventory-multi-system',
    label: 'Player app — Inventory multi system',
    smokeLabels: ['player-inventory-multi-system'],
    reaches: 'exact',
    query: { tab: 'inventory' },
    // One physical stack registered as a component in two systems must collapse to a single card
    // counted once, carrying the system-selector drop-down that re-scopes the whole detail body.
    steps: [
      { selector: '.inventory-filters input', fill: 'Air Shard' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-smithing:sm-air-shard"] .inventory-card-button',
      },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [/^src\/ui\/svelte\/apps\/inventory\//, /^src\/ui\/svelte\/stores\/inventory/],
  }),
  playerCase({
    id: 'player-salvage-misconfigured',
    label: 'Player app — Salvage misconfigured',
    smokeLabels: ['player-salvage-misconfigured'],
    // Window, not exact, and the gap is specific: this frame renders the misconfigured salvage body
    // for the `routedNoFormula` reason, where the smoke's counterpart renders it for
    // `simpleMultiGroup`.
    reaches: 'window',
    query: { tab: 'inventory' },
    steps: [
      { selector: '.inventory-filters input', fill: 'Bent Clasp' },
      {
        selector:
          '.inventory-card[data-inventory-card="lab-jewelry:jw-bent-clasp"] .inventory-card-button',
      },
      { selector: '.inventory-detail-tab[data-inventory-detail-tab="salvage"]' },
    ],
    kinds: ['player', 'inventory'],
    sourceMatches: [
      /^src\/ui\/svelte\/apps\/inventory\//,
      /^src\/ui\/svelte\/stores\/inventory/,
      /^src\/ui\/svelte\/stores\/playerResultOrder/,
      /^src\/utils\/progressiveResultOrder\.js$/,
    ],
  }),
  // Every card named below sits on page one of the 25-per-page grid, verified by rendering rather
  // than inferred: the listing sorts A→Z over the whole roster, so page-1 membership is fragile and
  // is exactly what the six existing inventory cases narrow with a search box to avoid.
  playerCase({
    ...BULK_DEFAULTS,
    id: 'player-inventory-bulk-mixed',
    label: 'Player app — Inventory bulk selection (mixed)',
    // The headline frame: one plain click, then three shift-clicks, and the panel partitions the
    // result into a queue, a best-case yield and a blocked list.
    steps: [
      // PLAIN, not shift: this is the card the first shift-click must PROMOTE. Selecting it here
      // is what makes the promotion assertion below mean something.
      { selector: CARD_BUTTON('lab-smithing:sm-air-shard') },
      SHIFT_CLICK('lab-herbalism:hb-cracked-alembic'),
      SHIFT_CLICK('lab-jewelry:jw-bent-clasp'),
      SHIFT_CLICK('lab-smithing:sm-toolchest'),
    ],
    // One selector carrying two assertions, because the driver takes one and the frame has to
    // answer for both. Scoped to the app root, which is the only common ancestor of the grid and
    // the panel.
    expectSelector:
      '.fabricate-app-shell' +
      `:has(${CARD('lab-smithing:sm-air-shard')}[data-inventory-card-bulk-selected="true"])` +
      ':has([data-inventory-bulk-yield] .manager-chip.is-positive)' +
      ':has([data-inventory-bulk-yield] .manager-chip.is-accent)',
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
    // The empty state, and the only frame that proves the footer's asymmetry: Salvage is withheld
    // because there is nothing to salvage, while Destroy stays live because destroy is not gated on
    // salvageability at all — it deletes whole stacks including blocked rows.
    steps: [
      { selector: CARD_BUTTON('lab-smithing:sm-coal') },
      SHIFT_CLICK('lab-smithing:sm-copper-ore'),
      SHIFT_CLICK('lab-herbalism:hb-empty-vial'),
    ],
    // The panel state alone would be satisfied by an empty panel with a footer in any condition,
    // and the footer IS what this case is named for — so both buttons are named, in the direction
    // each must be in.
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
    // Guaranteed, because simple with no authored roll formula awards its whole result set
    // outright — the certainty chip is the visible difference from the other two modes.
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
    // Progressive is the one mode that honours a player's saved stage order, so this is also the
    // frame that carries the footer's reorder note.
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
    // One of each, in one queue, across three systems — the case the other three exist to be read
    // against.
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
    // The order note and the renumbering are one fact and are photographed together, because
    // neither means anything alone: the note is the sentence that makes the numbers readable ("the
    // roll walks the list in this order"), and the numbers are what the sentence is about.
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      { selector: '.inventory-detail-tab[data-inventory-detail-tab="salvage"]' },
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
    // `toolsUnavailable` is the one blocked reason a player can act on, and the only one whose copy
    // is data-driven — "Needs {tools}", filled from the row's own missing-tool names through a
    // locale-correct list format rather than a hand-joined comma list.
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
    // One prompt for the whole batch — the answer to the issue's own open question, and the state
    // acceptance 4 is about.
    query: { tab: 'inventory', dialog: 'open' },
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    // Held to the prompt's own element, never to the tab.
    expectSelector: '.application.dialog .fabricate-roll-prompt__subjects',
    // It keeps the shared inventory `sourceMatches` and does not add `apps/crafting/rollPrompt.js`,
    // which builds the dialog.
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
    // Acceptance 3, and the most-argued behaviour in the whole feature: brokenness is about
    // usability and does not gate salvage, so a broken row belongs in the queue beside its
    // certainty chip and not in the blocked list.
    steps: [
      ...chooseSelectOption('.inventory-grid-pagination [data-pagination-size]', '75'),
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-longsword'),
    ],
    // One queue row carrying both pills, which is the whole claim in one selector. The three ways
    // this could go wrong each publish a plausible screen that a looser selector accepts.
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
    // What a finished batch says it did — the state the whole panel exists to arrive at, and the
    // only one that shows a per-item outcome, a per-item rolled total, and the two aggregates
    // ("added to your pack" / "not recovered") the player actually reads.
    steps: [
      { selector: CARD_BUTTON('lab-herbalism:hb-cracked-alembic') },
      SHIFT_CLICK('lab-smithing:sm-air-shard'),
      { selector: '[data-inventory-bulk-salvage]' },
    ],
    // The panel state plus the report's own subject list.
    expectSelector:
      '[data-inventory-bulk-panel="report"] [data-inventory-bulk-subjects] [data-inventory-bulk-subject]',
  }),
]);

/**
 * Signals too broad to attribute to one window, and the frames they select instead: the shared
 * primitives, the representative pair, and the per-file overrides that name a visible state.
 */

import { managerPrimitiveNamesByEvidence } from '../designSystemPrimitives.js';

/**
 * Signals too broad to attribute to one window. A shared primitive or a global stylesheet can
 * affect every window, so selecting every case would make the evidence set useless noise.
 */
export const MANAGER_PRIMITIVES = managerPrimitiveNamesByEvidence('broad');

export const BROAD_SIGNAL_PATTERN = new RegExp(
  [
    '^styles/',
    '^src/ui/svelte/components/',
    String.raw`^src/ui/theme\.js$`,
    String.raw`^src/ui/svelte/apps/manager/(${MANAGER_PRIMITIVES.join('|')})\.svelte$`,
  ].join('|')
);

/**
 * Deliberate visible states that a broad primitive's representative pair does not contain. Each
 * entry is attributed on its own, so keep one key per Prettier entry; an edit outside this map
 * selects surface coverage.
 */
export const BROAD_SIGNAL_CASE_OVERRIDES = Object.freeze({
  // The tint palette's selected tile (issue 2257), its cursor (issue 2416) and its grid form (issue
  // 2459): the New-biome popover at rest and under the cursor, the biome edit palette, and the
  // inline strip in the world essence entry and the catalogue's bulk panel.
  'src/ui/svelte/components/TintPicker.svelte': Object.freeze([
    'manager-gathering-biome-colour-popover',
    'world-essence-entry-dirty',
    'manager-gathering-biome-colour-popover-cursor',
    'manager-gathering-biome-colour-popover-cursor-selected',
    'manager-gathering-biome-colour-edit-popover',
    'world-essence-catalogue-bulk',
  ]),
  'src/ui/svelte/components/TintPickerButton.svelte': Object.freeze([
    'manager-gathering-biome-colour-popover',
  ]),
  // Issue 1648: each run control maps to a state that actually renders it.
  'src/ui/svelte/components/RunActionBar.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
    'fabricate-journal-lifecycle-cancel-confirmation',
    'fabricate-journal-lifecycle-paused',
    'fabricate-journal-lifecycle-waiting-auto-eligible',
  ]),
  'src/ui/svelte/components/WorldClockChip.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
  ]),
  // Issue 1644: the read-only row, and every frame that paints a partly delivered essence.
  'src/ui/svelte/components/SlotRow.svelte': Object.freeze([
    'fabricate-journal-lifecycle-waiting-open-choice',
    'fabricate-journal-lifecycle-material-shortage',
    'fabricate-journal-lifecycle-legacy',
  ]),
  'src/ui/svelte/components/SlotTile.svelte': Object.freeze([
    'fabricate-journal-lifecycle-waiting-open-choice',
    'fabricate-journal-lifecycle-material-shortage',
    'player-crafting-essence-pool-shared',
    'player-crafting-essence-shopping',
    'player-crafting-pick-for-me',
  ]),
  // Issue 1644: the Journal's open slot, and the crafting held-stack picker that adapts it.
  'src/ui/svelte/components/ChoiceOptionList.svelte': Object.freeze([
    'fabricate-journal-lifecycle-waiting-open-choice',
    'player-crafting-stack-picker',
  ]),
  // The Journal's shared essence stage and, since issue 1644, crafting's pool.
  'src/ui/svelte/components/EssencePool.svelte': Object.freeze([
    'fabricate-journal-lifecycle-essence-shared',
    'player-crafting-essence-pool',
    'player-crafting-essence-overshoot',
  ]),
  'src/ui/svelte/components/RunProgress.svelte': Object.freeze([
    'fabricate-journal-lifecycle-past-stage',
  ]),
  // The data table (issue 1782): the drop rules with a row selected, ranked at the intermediate width,
  // and the crafting detail's tool and output groups, one holding a choice group.
  'src/ui/svelte/components/DataTable.svelte': Object.freeze([
    'manager-gathering-task-drop-modifiers-normal',
    'manager-gathering-task-drops-ranked-narrow',
    'player-crafting-results-choice-group',
  ]),
  // The typeahead (issue 1782): the limits tab's two 38px fields, and each site's open list.
  'src/ui/svelte/components/Typeahead.svelte': Object.freeze([
    'manager-recipe-item-limits',
    'manager-recipe-item-limits-suggestions',
    'manager-gathering-task-component-tag-suggestions',
    'manager-gathering-task-drop-modifier-suggestions',
  ]),
  // The list and grid switch (issue 2412): the essence browser in each arrangement.
  'src/ui/svelte/components/ViewToggle.svelte': Object.freeze([
    'manager-essences-normal',
    'manager-essences-grid',
  ]),
  // The cross-reference list (issue 2321): the inventory inspector, a tool's Required for and an
  // essence's Contributing.
  'src/ui/svelte/components/XrefList.svelte': Object.freeze([
    'player-inventory',
    'player-inventory-xref-tool',
    'player-inventory-xref-essence',
  ]),
  // The published tier track (issue 2424): its column ladder mounted through the seam.
  'src/ui/svelte/components/TierTrack.svelte': Object.freeze([
    'manager-published-tier-track-specimen',
  ]),
  // The log list (issue 1782): the Finished list with a failed entry open, and a cancelled one open.
  'src/ui/svelte/components/LogList.svelte': Object.freeze([
    'fabricate-journal-lifecycle-finished-failure',
    'fabricate-journal-lifecycle-finished-cancelled',
  ]),
  // The instruments over the fill leaf (issue 1782): the run detail's stage track and a run card's.
  'src/ui/svelte/components/StageBars.svelte': Object.freeze([
    'fabricate-journal-lifecycle-past-stage',
    'fabricate-journal-lifecycle-waiting-auto-eligible',
  ]),
  // The essence pool's per-essence meters, in crafting and on the journal's shared essence stage.
  'src/ui/svelte/components/Meter.svelte': Object.freeze([
    'player-crafting-essence-pool',
    'fabricate-journal-lifecycle-essence-shared',
    'manager-published-leaves-specimen',
  ]),
  // One chance bar of each scale, and the Checks Studio's odds histogram and one-outcome chart.
  'src/ui/svelte/components/BandedBar.svelte': Object.freeze([
    'player-gathering-task-ready',
    'player-gathering-events',
    'manager-checks-crafting-odds-enumerable',
    'manager-checks-count-botch-odds',
    'manager-published-leaves-specimen',
  ]),
  // The rule row (issue 1782): an opened trigger, a counting check's presets, an attached drop modifier.
  'src/ui/svelte/components/RuleRow.svelte': Object.freeze([
    'manager-checks-crafting-tier-step',
    'manager-checks-v3-count-triggers',
    'manager-gathering-task-drop-condition-modifier-attached',
  ]),
  // Its sentence: an opened trigger's lead and quotation, and a counting check's net successes.
  'src/ui/svelte/components/RuleSentence.svelte': Object.freeze([
    'manager-checks-crafting-tier-step',
    'manager-checks-v3-count-triggers',
  ]),
  // No app caller since issue 1644: one frame per instrument over the leaf (stage, meter, band).
  'src/ui/svelte/components/FillBar.svelte': Object.freeze([
    'fabricate-journal-lifecycle-past-stage',
    'player-crafting-essence-pool',
    'player-gathering-task-ready',
    'manager-published-leaves-specimen',
  ]),
  'src/ui/svelte/components/StageNav.svelte': Object.freeze([
    'fabricate-journal-lifecycle-past-stage',
    'fabricate-journal-lifecycle-future-stage',
  ]),
  // `HistoricalRunDetail` renders this card too, so a change moves the multi-stage history cards as well.
  'src/ui/svelte/components/StageCard.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
    'fabricate-journal-lifecycle-past-stage',
    'fabricate-journal-lifecycle-future-stage',
    'fabricate-journal-lifecycle-claim-retained',
    'fabricate-journal-lifecycle-history-multi-success',
  ]),
  // The dense result rows, then one frame per selectable site (issue 1778): the Journal's Active
  // runs, the gathering environments, tasks and events, a selected uncraftable recipe, the alchemy
  // recipe and component rows, the alchemy chooser's cards, the inventory's inspected and
  // bulk-selected cards, and the essence editor's inert preview card; then the crafting routes'
  // dense product rows.
  'src/ui/svelte/components/ListRow.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
    'fabricate-journal-lifecycle-finished-success',
    'fabricate-journal-lifecycle-gathering-d100',
    'fabricate-journal-lifecycle-gathering-check',
    'fabricate-journal',
    'player-gathering-environments',
    'player-gathering-task-ready',
    'player-gathering-events',
    'player-crafting-check-unrollable-status',
    'player-inventory',
    'player-inventory-bulk-mixed',
    'manager-essence-edit-first-state',
    'player-crafting-ingredient-routed',
    'player-alchemy-known-recipe',
    'player-alchemy-workbench',
    'player-alchemy-chooser',
  ]),
  // The preview scale, the two historical branches no other frame draws, and the gathering
  // preview's authored-order scale, closed and with its breakdown open (issue 1644); then the
  // shared-model history rows at both widths (issue 2257).
  'src/ui/svelte/components/YieldScale.svelte': Object.freeze([
    'fabricate-journal-lifecycle-gathering-d100',
    'fabricate-journal-history-data-legacy-row-rolls-1240',
    'fabricate-journal-history-data-unknown-material-resolution-1240',
    'fabricate-journal-history-data-shared-roll-control-1240',
    'fabricate-journal-history-data-shared-roll-control-1024',
    'fabricate-journal-history-data-settled-zero-1240',
    'fabricate-journal-history-data-settled-zero-1024',
    'player-gathering-task-ready',
    'player-gathering-drop-open',
  ]),
  // The Journal's gathering ladder and its banded routes, crafting's and salvage's routed tiers,
  // before and after a roll.
  'src/ui/svelte/components/OutcomeLadder.svelte': Object.freeze([
    'fabricate-journal-lifecycle-gathering-check',
    'player-journal-routed-bands-under-crafting',
    'player-journal-routed-bands-under-attribute',
    'player-journal-routed-bands-under-multiply',
    'player-crafting-routed-by-check',
    'player-crafting-routed-tier-reward',
    'player-crafting-routed-reached',
    'player-salvage-routed-dc',
    'player-salvage-count-routed',
    'player-salvage-count-routed-botch',
    'player-salvage-fixed-routed',
    'player-salvage-under-routed',
    'player-salvage-routed-reached',
  ]),
  // The shared die tiles (issue 2006): the simulator's rolled pool, marked, and a botch's cancels.
  'src/ui/svelte/components/DiceTiles.svelte': Object.freeze([
    'manager-checks-count-over-rolled',
    'manager-checks-count-botch',
    // Issue 2008: the dashed bought tile, on the result box and the simulator.
    'player-crafting-roll-result-count-bought',
    'manager-checks-count-simulator-bought',
  ]),
  // The shared icon picker (issue 1269).
  'src/ui/svelte/components/IconPicker.svelte': Object.freeze(['manager-system-edit-lists']),
  // The most-used control in the app, and until issue 1378 it published no frame that renders one;
  // the outcome tiers' Failure row is its formatted null endpoint (issue 2357). Then the two
  // specimens that mount it through the published seam (issue 2452).
  'src/ui/svelte/components/Stepper.svelte': Object.freeze([
    'manager-gathering-economy-actors',
    'manager-checks-parity-outcomes-multiply',
    'manager-published-steppers-specimen',
    'manager-published-steppers-button-focus',
  ]),
  // The manager's one selection box, whose `sm` size has one caller and is absent from both representative frames.
  'src/ui/svelte/components/SelectionCheckbox.svelte': Object.freeze([
    'manager-tool-prerequisites-selected-1280x720',
  ]),
  // The app's one art tile (issue 1506), which is the change that earned it an entry.
  'src/ui/svelte/components/Medallion.svelte': Object.freeze([
    'world-component-entry-essences',
    'manager-published-leaves-specimen',
  ]),
  // The manager's on/off switch (issue 1040), whose three frames are chosen per host rather than per
  // state. Then the three specimens that mount it through the published seam (issue 2452).
  'src/ui/svelte/components/StatusToggle.svelte': Object.freeze([
    'manager-system-edit-normal',
    'coverage-mode-routed-check-checks',
    'manager-tool-parity-04-requirements-1280x720',
    'manager-published-controls-specimen',
    'manager-published-buttons-specimen',
    'manager-published-toggles-specimen',
  ]),
  // The range bar's marker (issue 2431), drawn only by the time-of-day bar: its clock line and dot.
  'src/ui/svelte/components/RangeBarMarker.svelte': Object.freeze([
    'manager-gathering-time-of-day-bar',
  ]),
  // Both check-strip frames, for the same two-mode reasoning `SearchablePopover` carries below, and
  // the time-of-day bar's markers, rail and start binding (issue 2431).
  'src/ui/svelte/components/ThresholdBandStrip.svelte': Object.freeze([
    'manager-checks-simple-two-band-strip',
    'coverage-mode-routed-check-checks',
    'manager-gathering-time-of-day-bar',
  ]),
  // The manager's labelled form field (issue 1428), on 81 call sites and in neither representative frame,
  // plus the captions issue 2532's kicker reaches and two scoped captions it must leave alone.
  'src/ui/svelte/components/Field.svelte': Object.freeze([
    'manager-gathering-task-editor-normal',
    'manager-system-edit-normal',
    'manager-recipe-edit-results-currency-body-filled',
    'manager-recipe-edit-results-currency-body-empty',
    'manager-selected-condition-select-long-option',
    'manager-checks-crafting-trigger-break-tools',
    'manager-gathering-task-stamina-modifier-list',
    'world-tool-entry',
    'interactables-config-configured',
    'manager-component-edit-salvage',
    'player-crafting-roll-prompt-basic',
    'manager-import-folder-mapping',
  ]),
  // The manager's icon-only button (issue 1422): 36 callers, and the representative pair reaches only its neutral state.
  'src/ui/svelte/components/IconButton.svelte': Object.freeze([
    'world-modifiers',
    'manager-environment-edit-blind-weights',
  ]),
  // The manager's filter bar (issue 1039), extracted from 11 hand-written toolbar sections: the
  // pane host, the gathering panel, and the three hosts that pad their own content (issue 2546).
  'src/ui/svelte/components/FilterBar.svelte': Object.freeze([
    'world-component-catalogue',
    'manager-environments-browse-normal',
    'manager-essences-normal',
    'world-tool-catalogue',
    'interactables-browser-tools',
    'world-vocabulary',
  ]),
  // The search field (issue 1039): the default 38px shell in each browse toolbar, the roster and the
  // Tools library card, the compact form in the task editor and the entry systems card, and the
  // specimen that mounts it through the published seam (issue 2453).
  'src/ui/svelte/components/SearchField.svelte': Object.freeze([
    'manager-gathering-task-editor-normal',
    'manager-knowledge-owned-copies',
    'manager-recipes-normal',
    'manager-recipes-narrow',
    'manager-books-scrolls-normal',
    'manager-gathering-tasks-browse-normal',
    'manager-default-selection',
    'manager-access-recipe-selected',
    'manager-tool-parity-01-library-1280x720',
    'world-component-entry-systems',
    'manager-published-search-specimen',
  ]),
  // The card shell (issue 1427), extracted from 80 hand-written inspector-card sections, and the
  // tool and travel inspectors whose cards issue 2315 moved off a pane-sized card.
  'src/ui/svelte/components/InspectorCard.svelte': Object.freeze([
    'manager-essences-disabled-in-use',
    'coverage-mode-routed-check-checks',
    'manager-published-leaves-specimen',
    'manager-tool-parity-01-library-1280x720',
    'manager-world-travel-realms-normal',
    'manager-world-travel-map-normal',
    'manager-world-travel-map-empty',
  ]),
  // The percentage slider (issue 1508): it is under `components/`, so no case's `sourceMatches` is ever consulted for it.
  'src/ui/svelte/components/ChanceSlider.svelte': Object.freeze(['world-tool-entry']),
  // An actor's portrait (issue 1506), the first entry gained by a primitive arriving rather than an extraction leaving.
  'src/ui/svelte/components/Avatar.svelte': Object.freeze([
    'manager-knowledge-owned-copies',
    'manager-published-leaves-specimen',
  ]),
  // The editor tab strip (issue 1509), the first key gained because a component moved rather than acquired a state.
  'src/ui/svelte/components/EditorTabs.svelte': Object.freeze([
    'manager-system-edit-normal',
    'manager-recipe-item-overview',
    'manager-recipe-item-validation',
    'manager-checks-section-badged-and-dotted',
    'manager-environment-edit-events',
    'manager-knowledge-learned-lost-copy',
    'interactables-browser-tasks',
    // The padlocked strip with its first tab's description, wide (`-tracking-described`) and wrapped with its last tab's (`-narrow-settings`) (issue 1779).
    'manager-world-downtime-tracking-described',
    'manager-world-downtime-narrow-settings',
    // One frame per remaining render site, and the tool strip's 832 to 900px rung (issue 2464).
    'manager-tool-parity-05-validation-1280x720',
    'manager-tool-parity-06-breakage-900x700',
    'manager-essence-edit-validation',
    'manager-recipe-edit-validation',
    'manager-gathering-task-editor-normal',
    'manager-component-edit-validation',
    'world-component-entry-validation',
    'world-essence-entry',
    'world-tool-entry-validation',
    'player-salvage',
    'player-gathering-events',
  ]),
  // The page header (issue 1777): the Tool library's header, and the Tool editor's on a tab.
  'src/ui/svelte/components/PageHeader.svelte': Object.freeze([
    'manager-tool-parity-01-library-1280x720',
    'manager-tool-parity-04-requirements-1280x720',
  ]),
  // The manager's title band (issue 2420), on the seven frames ManagerTitleBar's own cases draw.
  'src/ui/svelte/components/AppTitleBar.svelte': Object.freeze([
    'manager-default-selection',
    'manager-systems-empty',
    'manager-selected-normal',
    'manager-rail-expanded',
    'manager-rail-collapsed',
    'manager-selected-stacked',
    'manager-world-downtime-test-companion-installed',
  ]),
  // The app navigation (issue 1777): the manager sidebar expanded and collapsed, the collapsed
  // Downtime rail, and the player rail, its icon variant.
  'src/ui/svelte/components/NavSidebar.svelte': Object.freeze([
    'manager-rail-expanded',
    'manager-rail-collapsed',
    'manager-world-downtime-collapsed',
    'fabricate-app-shell',
  ]),
  // Its labelled rows and groups (issue 1777), which only the manager sidebar draws, and the two
  // cases that measure an open group's box (issue 2257 E3).
  'src/ui/svelte/components/NavSidebarRows.svelte': Object.freeze([
    'manager-rail-expanded',
    'manager-rail-collapsed',
    'manager-world-downtime-collapsed',
    'manager-recipes-normal',
    'manager-world-travel-with-gathering-expanded',
  ]),
  // The editor validation surface (issue 1444).
  'src/ui/svelte/components/EditorValidationSurface.svelte': Object.freeze([
    'manager-checks-validation',
    'manager-recipe-item-validation-blocked',
    'manager-recipe-edit-validation',
    'manager-checks-validation-retired-placeholder',
  ]),
  // The shared empty panel, then (issue 2550) the player window's `note` line, the `inline` form,
  // a `compact fill` journal body and the hero in a narrow host.
  'src/ui/svelte/components/EmptyState.svelte': Object.freeze([
    'manager-systems-empty',
    'world-tool-entry-on-break-repair-tag-picker-empty',
    'world-tool-catalogue-filtered-empty',
    'manager-gathering-task-availability-feedback-normal',
    'manager-gathering-task-availability-feedback-narrow',
    'manager-gathering-event-availability-feedback-normal',
    'manager-gathering-event-availability-feedback-narrow',
    'manager-published-leaves-specimen',
    'player-inventory-bulk-none-salvageable',
    'manager-component-complications-empty',
    'fabricate-journal-history-batch-empty-1240',
    'player-alchemy-workbench',
  ]),
  // The link field (issue 2466): the world Tool screens, then at least one frame of each of its nine other hosts.
  'src/ui/svelte/components/ItemDropZone.svelte': Object.freeze([
    'world-tool-catalogue-list-head',
    'world-tool-entry-overview',
    'world-tool-entry-unlinked',
    'world-tool-entry-source-missing',
    'world-component-entry-definition',
    'world-component-catalogue',
    'world-essence-entry',
    'manager-environment-edit-scene-linked',
    'manager-environment-edit-scene-unlinked-narrow',
    'manager-recipe-item-overview',
    'manager-essence-edit-on-craft',
    'manager-checks-crafting-dynamic-dc',
    'manager-checks-v3-count-additional-dice-macro',
    'manager-checks-v3-count-additional-dice-macro-narrow',
    'manager-checks-v3-count-additional-dice-macro-pair',
    'manager-checks-v3-count-additional-dice-macro-pair-narrow',
    'manager-component-complications-macro-linked',
    'manager-component-complications-macro-missing',
  ]),
  // The radio-card group (issue 1373), and the player's crafting routes (issue 1778).
  'src/ui/svelte/components/RadioCardGroup.svelte': Object.freeze([
    'world-tool-entry-requirements',
    'manager-tool-parity-03-breakage-1280x720',
    'player-crafting-ingredient-routed',
  ]),
  // The titled status card (issue 1509), and it gains an override in the same commit that moves it.
  'src/ui/svelte/components/ToggleCard.svelte': Object.freeze([
    'manager-recipe-edit-normal',
    'manager-recipe-edit-results-failure-optin',
  ]),
  // A third entry as of issue 1458, and it is a third mode rather than a third instance.
  'src/ui/svelte/components/SearchablePopover.svelte': Object.freeze([
    'manager-world-parties-actor-picker',
    'manager-world-parties-realm-override-picker',
    'manager-gathering-task-availability-menu',
    'player-actor-picker',
    'manager-recipe-edit-tag-picker',
    'world-tool-entry-on-break-repair-tag-picker-empty',
    // A seventh, and it is the primitive's grid list form (issue 1503).
    'manager-essences-source-picker',
    // An eighth and a ninth: the primitive's multi-select mode and the caller that stays open without it (issue 1513).
    'player-crafting-sources-picker',
    'manager-recipe-item-contents-picker',
  ]),
  // The art picker (issue 1522): filled art, the event's art, locked art, and the depleted marker
  // filled and empty.
  'src/ui/svelte/components/ArtPicker.svelte': Object.freeze([
    'manager-recipe-edit-normal',
    'manager-gathering-task-editor-normal',
    'manager-gathering-event-availability-feedback-normal',
    'manager-environment-edit-placeholder',
    'manager-gathering-task-depleted-image-filled',
    'manager-gathering-task-depleted-image-empty',
  ]),
  // The routing line (issue 2512): a routed result set in each routed mode, Assign open, and each
  // state it draws — shared, long and truncated, unreachable, by default, struck tiers, and the
  // longest hint at the floor.
  'src/ui/svelte/components/RouteSources.svelte': Object.freeze([
    'coverage-mode-routed-ingredients-results',
    'coverage-mode-routed-check-results',
    'manager-recipe-edit-results-failure-tier',
    'manager-recipe-edit-results-routed-shared',
    'manager-recipe-edit-results-routed-shared-narrow',
    'manager-recipe-edit-results-routed-unreachable',
    'manager-recipe-edit-results-routed-default',
    'manager-recipe-edit-results-routed-assign',
    'manager-recipe-edit-results-routed-check-stale',
    'manager-recipe-edit-results-routed-check-policy-hint-narrow',
  ]),
  // The routing overview (issue 2513): the salvage well's outcome routing, at rest and shared at
  // the declared floor, and the recipe Overview's routing card in each state it draws.
  'src/ui/svelte/components/RoutingOverview.svelte': Object.freeze([
    'manager-component-edit-salvage',
    'manager-component-edit-salvage-routed-narrow',
    'manager-recipe-edit-overview-routing-ingredients',
    'manager-recipe-edit-overview-routing-default',
    'manager-recipe-edit-overview-routing-check',
    'manager-recipe-edit-overview-routing-check-narrow',
    'manager-recipe-edit-overview-routing-check-permitted',
    'manager-recipe-edit-overview-routing-distinct',
    'manager-recipe-edit-overview-routing-multistep',
  ]),
  // The set card (issue 2512): an ingredient set, a routed result set in each routed mode, the
  // reserved pair and a salvage group.
  'src/ui/svelte/components/SetCard.svelte': Object.freeze([
    'manager-recipe-edit-ingredients-sets',
    'coverage-mode-routed-ingredients-results',
    'coverage-mode-routed-check-results',
    'manager-recipe-edit-results-alchemy',
    'manager-component-edit-salvage',
    'manager-recipe-edit-ingredients-check-rename',
    'manager-recipe-edit-tools-ingredient-sets',
    'manager-recipe-edit-results-routed-unreachable',
    'manager-recipe-edit-results-set-menu',
    'manager-recipe-edit-results-set-menu-narrow',
    'manager-recipe-edit-results-alchemy-narrow',
    'manager-recipe-edit-results-failure-optin-on',
  ]),
  // The set picker (issue 1782): the session form, and the staged form closed, open, staged and over its bound.
  'src/ui/svelte/components/SetPicker.svelte': Object.freeze([
    'player-crafting-sources-picker',
    'manager-recipe-item-contents',
    'manager-recipe-item-contents-picker',
    'manager-recipe-item-contents-picker-staged',
    'manager-recipe-item-contents-overflow',
  ]),
  // The primitive's portaled panel (issue 1719), which draws the whole of what a picker presents.
  // Fourteen frames rather than the parent's nine, because the panel is also what `Select`,
  // `ModifierPillSelect` and `IconPicker` open, and the three `Select` frames are the
  // only ones that draw it with no header and no search row — the shape most importers get.
  'src/ui/svelte/components/SearchablePopoverPanel.svelte': Object.freeze([
    'manager-world-parties-actor-picker',
    'manager-world-parties-realm-override-picker',
    'manager-gathering-task-availability-menu',
    'player-actor-picker',
    'manager-recipe-edit-tag-picker',
    'manager-recipe-edit-tag-picker-new-tag',
    'manager-recipe-edit-tag-picker-new-tag-created',
    'world-tool-entry-on-break-repair-tag-picker-empty',
    'manager-essences-source-picker',
    'player-crafting-sources-picker',
    'manager-recipe-item-contents-picker',
    'manager-recipes-bulk-edit-check-tier',
    'manager-component-edit-category-list',
    'interactables-manager-region-open',
    'manager-recipe-edit-crafting-modifier-cap-reached',
    'manager-system-edit-lists',
  ]),
  // The product's ONE ordered list (issue 1512). It draws nothing of its own on a browse screen, so
  // the representative pair would publish two frames that do not contain it; these three are the
  // AFTER frames for the surfaces whose row geometry moved, and each draws the full row set — grip,
  // badge, rocker — that the primitive is judged on.
  'src/ui/svelte/components/SortableList.svelte': Object.freeze([
    'manager-recipe-edit-step-open',
    'manager-checks-crafting-recipe-tiers-narrow',
    'manager-environment-edit-blind-weights-narrow',
    'player-crafting-progressive',
    'player-salvage',
  ]),
  // The product's ONE row disclosure (issue 1512), promoted on its second importer. Its own frame is
  // the open step row: the disclosure is the sole opener there, and `aria-expanded="true"` with the
  // body visible is the only state in which the control is more than a chevron.
  'src/ui/svelte/components/RowDisclosure.svelte': Object.freeze(['manager-recipe-edit-step-open']),
  // The app's own select (issue 1504); its whole subject — the option list — exists only while
  // open. The recipe studio's kind list adds the `inline` rung (issue 1510).
  'src/ui/svelte/components/Select.svelte': Object.freeze([
    'manager-recipes-bulk-edit-check-tier',
    'manager-recipe-edit-ingredients-kind-list',
    'manager-component-edit-category-list',
    'interactables-manager-region-open',
  ]),
  // The essence source picker (issue 1503), whose panel moved wholesale onto the primitive above.
  'src/ui/svelte/components/EssenceSourceSelector.svelte': Object.freeze([
    'manager-essences-source-picker',
  ]),
  // The overflow action menu (issue 1477), extracted from four hand-rolled menus and one `SearchablePopover`.
  // The requirement row's kind menu is its headed form with a caller's own trigger (issue 1516), as
  // is each of the ingredient and result adders' kind menus.
  'src/ui/svelte/components/ActionMenu.svelte': Object.freeze([
    'manager-environment-edit-automatic-force-add',
    'manager-systems-row-menu-open',
    'manager-recipe-edit-ingredients-or-menu',
    'manager-recipe-edit-choice-group-menu',
    'manager-recipe-edit-results-adder-menu',
    'manager-recipe-edit-ingredients-adder-menu',
  ]),
  // The pill multi-select (issue 1458), whose add menu became a `SearchablePopover` in the same change.
  'src/ui/svelte/components/ModifierPillSelect.svelte': Object.freeze([
    'manager-recipe-edit-crafting-modifier-cap-reached',
  ]),
  // The uppercase micro-label (issue 1505), on sixteen converted eyebrow sites across nine files.
  'src/ui/svelte/components/Kicker.svelte': Object.freeze([
    'player-crafting-slot-rail',
    'manager-recipe-item-overview',
    'manager-published-leaves-specimen',
  ]),
  // The at-a-glance figure (issue 1505).
  'src/ui/svelte/components/StatBox.svelte': Object.freeze([
    'player-crafting-essence-shopping',
    'manager-books-scrolls-item',
    'manager-published-leaves-specimen',
  ]),
  // The surface that reports something that just happened (issue 1505), on two callers. Then the
  // specimens that mount it through the published seam, its dismissal's two among them (issue 2452).
  'src/ui/svelte/components/Notice.svelte': Object.freeze([
    'player-inventory-bulk-report',
    'manager-published-leaves-specimen',
    'manager-published-controls-specimen',
    'manager-published-buttons-specimen',
    'manager-published-notice-dismiss-focus',
    'manager-published-notice-dismissed',
  ]),
  // The strip of current values (issue 1521): the check card's badge, target and source facts, its
  // formula fact over the danger notice, and the gathering stamina pool under its kicker.
  'src/ui/svelte/components/InfoStrip.svelte': Object.freeze([
    'player-crafting-check-descriptor-under-resolved',
    'player-crafting-check-formula-unresolved',
    'player-gathering-economy-strip',
    'manager-published-leaves-specimen',
  ]),
  // The standing statement (issue 1505), widened onto its specimen and re-authored at 15 importing files.
  'src/ui/svelte/components/Callout.svelte': Object.freeze([
    'manager-tool-parity-04-requirements-1280x720',
    'player-salvage',
    'manager-recipe-edit-results-failure-policy-never-present',
    // The `items` form, which only the essence On craft primer draws (issue 1521).
    'manager-essence-edit-unscoped-on-craft',
  ]),
  // The fact row at `rule` density: the essence catalogue's world-default cards and the tool entry's
  // effective-rules rail (issue 1521).
  'src/ui/svelte/apps/manager/IconFactRow.svelte': Object.freeze([
    'world-essence-catalogue',
    'world-tool-entry-overview',
    'world-tool-entry-on-break-replace',
    'world-tool-entry-destroyed-preview',
  ]),
  // The modal chrome's banded frame (issue 2021), which every dialog draws since epic 1997.
  'src/ui/svelte/components/Modal.svelte': Object.freeze([
    'player-crafting-roll-prompt-basic',
    'player-crafting-roll-prompt-compact',
    'manager-import-report',
    'manager-components-add-from-catalogue',
  ]),
  // The inspector rail section (issue 1782): the essence inspector's labelled sections, the tool
  // inspector's two groups and the recipe-item editor's preview rail.
  'src/ui/svelte/components/Rail.svelte': Object.freeze([
    'manager-essences-normal',
    'manager-tool-parity-01-library-1280x720',
    'manager-recipe-item-overview',
    'manager-published-leaves-specimen',
  ]),
  // The well below a card (issue 2008): the Formula card's roll-prompt and additional-dice groups,
  // and the roll prompt's additional-dice control.
  'src/ui/svelte/components/Well.svelte': Object.freeze([
    'manager-checks-crafting-advantage-keep',
    'manager-checks-v3-count-under',
    'player-crafting-roll-prompt-count-additional',
  ]),
  // The player window's chips (issue 1518): the recipe header's status chip and each row's icon-only one.
  'src/ui/svelte/components/Chip.svelte': Object.freeze([
    'player-crafting-simple',
    'manager-published-leaves-specimen',
  ]),
  // The player window draws it in the journal's run action bar: the primary, then the danger and
  // neutral pair. Then the three specimens that mount it through the published seam (issue 2452).
  'src/ui/svelte/components/Button.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
    'fabricate-journal-lifecycle-cancel-confirmation',
    'manager-published-leaves-specimen',
    'manager-published-controls-specimen',
    'manager-published-buttons-specimen',
  ]),
  // The arm-then-confirm control (issue 2563): the three bulk-delete cards and a knowledge row, armed.
  'src/ui/svelte/components/ArmedDangerButton.svelte': Object.freeze([
    'manager-recipes-bulk-delete-armed',
    'manager-components-bulk-delete-armed',
    'manager-essences-bulk-delete-armed',
    'manager-knowledge-delete-armed',
  ]),
  // The pager's two player forms (the inventory's persistent bar and the recipe browser's threshold
  // one), its manager footer on a second page, and the journal's compact pager.
  'src/ui/svelte/components/Pagination.svelte': Object.freeze([
    'player-inventory',
    'player-crafting-simple',
    'world-tool-catalogue-page-two',
    'player-journal-stacked',
  ]),
  // The requirement chooser (issue 1518): open on a choice slot, and the rail's three slot states;
  // its award face at the ceiling (issue 1773); and the partly delivered essences (issue 1644).
  'src/ui/svelte/components/RequirementChooser.svelte': Object.freeze([
    'player-crafting-chooser-open',
    'player-crafting-slot-rail',
    'player-journal-award-choice-ceiling',
    'player-crafting-essence-pool-shared',
    'player-crafting-essence-shopping',
    'player-crafting-pick-for-me',
  ]),
  // The track (issue 1516): its 30px inline rung is drawn by the requirement row's amount toggle and the compact pager's page-size control.
  'src/ui/svelte/components/SegmentedControl.svelte': Object.freeze([
    'manager-recipe-edit-results-rolled',
    'player-journal-stacked',
  ]),
  // The expression field (issue 2465): the cases that draw it, in a shell, an amount box and the baseline.
  'src/ui/svelte/components/RollDataExpressionInput.svelte': Object.freeze([
    'manager-system-edit-lists',
    'manager-checks-stacked-floor',
    'manager-checks-formula-card',
    'manager-checks-character-value-unresolved',
    'manager-checks-parity-under-attribute',
    'manager-checks-v3-count-over-narrow',
    'manager-checks-v3-count-additional-dice-path',
    'manager-recipe-edit-results-rolled',
    'manager-recipe-edit-results-rolled-narrow',
    'manager-component-edit-salvage-rolled-narrow',
    'manager-recipe-edit-results-group-player-anyone',
    'manager-recipe-edit-results-group-rolled-anyone',
    'manager-recipe-edit-results-group-rolled-upto-repeats',
    'manager-recipe-edit-results-group-rolled-upto-repeats-narrow',
    'manager-recipe-edit-results-group-rolled-overlap',
    'manager-recipe-edit-results-group-rolled-overlap-narrow',
    'manager-recipe-edit-results-group-failure-role',
  ]),
  // The requirement row family (issue 2510), each part on the states that draw it: the row itself on
  // ingredients, results, every chooser and strategy cell, salvage, a gathering task and Tool repair.
  'src/ui/svelte/components/PickerRow.svelte': Object.freeze([
    'manager-recipe-edit-ingredients',
    'manager-recipe-edit-ingredients-choice-group',
    'manager-recipe-edit-ingredients-suggestions',
    'manager-recipe-edit-ingredients-or-menu',
    'manager-recipe-edit-results-adder-menu',
    'manager-recipe-edit-results',
    'manager-recipe-edit-results-currency-body-filled',
    'manager-recipe-edit-results-group-player-anyone',
    'manager-recipe-edit-results-group-player-upto',
    'manager-recipe-edit-results-group-rolled-anyone',
    'manager-recipe-edit-results-group-rolled-upto-repeats',
    'manager-component-edit-salvage',
    'manager-gathering-task-editor-straight-rolled',
    'manager-tool-stress-repair',
    'world-tool-entry-on-break-repair',
    'world-tool-entry-on-break-repair-empty-tag',
    'world-tool-entry-on-break-repair-suggestions',
    'manager-component-edit-salvage-suggestions',
    'manager-recipe-edit-tag-picker-new-tag',
    'manager-recipe-edit-tag-picker-new-tag-created',
    'manager-recipe-edit-ingredients-tag-row-two-tags',
    'manager-recipe-edit-ingredients-cost',
    'manager-recipe-edit-tag-picker',
    'world-tool-entry-on-break-repair-tag-picker-empty',
  ]),
  'src/ui/svelte/components/PickerRowNameField.svelte': Object.freeze([
    'manager-recipe-edit-ingredients',
    'manager-recipe-edit-ingredients-choice-group',
    'manager-recipe-edit-ingredients-suggestions',
    'manager-recipe-edit-ingredients-or-menu',
    'manager-recipe-edit-results-adder-menu',
    'manager-recipe-edit-results',
    'manager-recipe-edit-results-suggestions',
    'manager-recipe-edit-results-group-player-anyone',
    'manager-recipe-edit-results-group-player-upto',
    'manager-recipe-edit-results-group-rolled-anyone',
    'manager-recipe-edit-results-group-rolled-upto-repeats',
    'manager-component-edit-salvage-suggestions',
    'manager-component-edit-salvage-narrow',
    'manager-gathering-task-editor-straight-rolled',
    'world-tool-entry-on-break-repair-suggestions',
    'manager-tool-stress-repair',
  ]),
  'src/ui/svelte/components/PickerRowAmount.svelte': Object.freeze([
    'manager-recipe-edit-ingredients',
    'manager-recipe-edit-ingredients-choice-group',
    'manager-recipe-edit-ingredients-suggestions',
    'manager-recipe-edit-ingredients-or-menu',
    'manager-recipe-edit-results-adder-menu',
    'manager-recipe-edit-results',
    'manager-recipe-edit-results-rolled',
    'manager-recipe-edit-results-rolled-narrow',
    'manager-recipe-edit-results-currency-body-filled',
    'manager-recipe-edit-results-group-player-anyone',
    'manager-recipe-edit-results-group-player-upto',
    'manager-recipe-edit-results-group-rolled-anyone',
    'manager-recipe-edit-results-group-rolled-upto-repeats',
    'manager-component-edit-salvage-rolled-narrow',
    'manager-gathering-task-editor-straight-rolled',
    'manager-tool-stress-repair',
    'world-tool-entry-on-break-repair',
  ]),
  'src/ui/svelte/components/PickerRowKindMenu.svelte': Object.freeze([
    'manager-recipe-edit-ingredients',
    'manager-recipe-edit-ingredients-choice-group',
    'manager-recipe-edit-ingredients-or-menu',
    'manager-recipe-edit-ingredients-kind-list',
    'manager-recipe-edit-results',
    'manager-recipe-edit-results-kinds',
    'manager-recipe-edit-results-group-player-anyone',
    'manager-tool-stress-repair',
    'world-tool-entry-on-break-repair',
  ]),
  'src/ui/svelte/components/PickerRowRewardBody.svelte': Object.freeze([
    'manager-recipe-edit-results-kinds',
    'manager-recipe-edit-results-kinds-narrow',
    'manager-recipe-edit-results-currency-body-empty',
    'manager-recipe-edit-results-currency-body-filled',
    'manager-recipe-edit-results-learning-off',
    'manager-recipe-edit-results-missing-recipe',
  ]),
  'src/ui/svelte/components/PickerRowRangeCell.svelte': Object.freeze([
    'manager-recipe-edit-results-group-rolled-anyone',
    'manager-recipe-edit-results-group-rolled-upto-repeats',
    'manager-recipe-edit-results-group-rolled-upto-repeats-narrow',
    'manager-recipe-edit-results-group-rolled-overlap',
    'manager-recipe-edit-results-group-rolled-overlap-narrow',
    'manager-recipe-edit-validation-choice-group',
  ]),
  'src/ui/svelte/components/ChoiceGroup.svelte': Object.freeze([
    'manager-recipe-edit-ingredients',
    'manager-recipe-edit-ingredients-choice-group',
    'manager-recipe-edit-ingredients-suggestions',
    'manager-recipe-edit-choice-group-menu',
    'manager-recipe-edit-ingredients-adder-menu',
    'manager-recipe-edit-results',
    'manager-recipe-edit-results-adder-menu',
    'manager-recipe-edit-results-currency-body-filled',
    'manager-recipe-edit-results-group-player-anyone',
    'manager-recipe-edit-results-group-player-upto',
    'manager-recipe-edit-results-group-rolled-anyone',
    'manager-recipe-edit-results-group-rolled-upto-repeats',
    'manager-recipe-edit-results-group-failure-role',
    'manager-tool-stress-repair',
    'world-tool-entry-on-break-repair',
    'manager-gathering-task-editor-straight-rolled',
  ]),
  'src/ui/svelte/components/ChoiceGroupAwardHeader.svelte': Object.freeze([
    'manager-recipe-edit-results-group-player-anyone',
    'manager-recipe-edit-results-group-player-upto',
    'manager-recipe-edit-results-group-rolled-anyone',
    'manager-recipe-edit-results-group-rolled-upto-repeats',
    'manager-recipe-edit-results-group-rolled-upto-repeats-narrow',
    'manager-recipe-edit-results-group-rolled-overlap',
    'manager-recipe-edit-results-group-rolled-overlap-narrow',
    'manager-recipe-edit-results-group-failure-role',
    'manager-recipe-edit-validation-choice-group',
  ]),
  'src/ui/svelte/components/KindAdder.svelte': Object.freeze([
    'manager-recipe-edit-ingredients',
    'manager-recipe-edit-ingredients-choice-group',
    'manager-recipe-edit-ingredients-adder-menu',
    'manager-recipe-edit-choice-group-menu',
    'manager-recipe-edit-ingredients-sets',
    'manager-recipe-edit-results',
    'manager-recipe-edit-results-adder-menu',
    'manager-recipe-edit-results-progressive-adder',
    'manager-recipe-edit-results-group-player-anyone',
    'manager-recipe-edit-results-group-rolled-anyone',
    'manager-tool-stress-repair',
    'world-tool-entry-on-break-repair',
    'world-tool-entry-on-break-repair-empty-tag',
  ]),
  'src/ui/svelte/components/pickerRowKinds.js': Object.freeze([
    'manager-recipe-edit-ingredients',
    'manager-recipe-edit-ingredients-kind-list',
    'manager-recipe-edit-results',
    'manager-recipe-edit-results-kinds',
    'manager-component-edit-salvage',
    'manager-component-edit-salvage-kind-list',
  ]),
  'src/ui/svelte/components/resultGroupEdits.js': Object.freeze([
    'manager-recipe-edit-ingredients-choice-group',
    'manager-recipe-edit-results',
    'manager-recipe-edit-results-group-player-anyone',
    'manager-recipe-edit-results-group-rolled-upto-repeats',
    'manager-recipe-edit-validation-choice-group',
  ]),
  'src/ui/svelte/components/resultRows.js': Object.freeze([
    'manager-recipe-edit-ingredients',
    'manager-recipe-edit-results',
    'manager-recipe-edit-results-rolled',
    'manager-recipe-edit-results-kinds',
    'manager-component-edit-salvage',
    'manager-component-edit-salvage-rolled-narrow',
  ]),
  // The sheet itself, and the first entry here whose key is not a component (issue 1515).
  // Every module-sheet partial stands as this key (issue 1711), so issue 2512's four name one frame
  // each: the set card's rules in the recipe-editor sheet, the recipe editor's set chrome, the
  // single bare set, and the salvage group card; issue 2513 adds the Overview's routing card.
  'styles/fabricate.css': Object.freeze([
    'manager-gathering-task-editor-normal',
    'manager-world-downtime-tracking',
    'manager-world-downtime-collapsed',
    'manager-recipe-edit-results-routed-shared',
    'manager-recipe-edit-ingredients-sets',
    'manager-recipe-edit-ingredients',
    'manager-component-edit-salvage',
    'manager-recipe-edit-overview-routing-check',
  ]),
});

/** One player screen and one manager screen: enough to show a shared-primitive change in context. */
export const REPRESENTATIVE_CASE_IDS = Object.freeze([
  'fabricate-app-shell',
  'manager-components-normal',
]);

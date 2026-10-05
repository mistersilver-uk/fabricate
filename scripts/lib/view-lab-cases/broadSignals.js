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

/** Deliberate visible states that a broad primitive's representative pair does not contain. */
export const BROAD_SIGNAL_CASE_OVERRIDES = Object.freeze({
  // Issue 1648: each run control maps to a state that actually renders it.
  'src/ui/svelte/components/RunActionBar.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
    'fabricate-journal-lifecycle-cancel-confirmation',
    'fabricate-journal-lifecycle-paused',
  ]),
  'src/ui/svelte/components/WorldClockChip.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
  ]),
  'src/ui/svelte/components/SlotRow.svelte': Object.freeze([
    'fabricate-journal-lifecycle-waiting-open-choice',
    'fabricate-journal-lifecycle-material-shortage',
  ]),
  'src/ui/svelte/components/SlotTile.svelte': Object.freeze([
    'fabricate-journal-lifecycle-waiting-open-choice',
    'fabricate-journal-lifecycle-material-shortage',
  ]),
  'src/ui/svelte/components/ChoiceOptionList.svelte': Object.freeze([
    'fabricate-journal-lifecycle-waiting-open-choice',
  ]),
  'src/ui/svelte/components/EssencePool.svelte': Object.freeze([
    'fabricate-journal-lifecycle-essence-shared',
  ]),
  'src/ui/svelte/components/RunProgress.svelte': Object.freeze([
    'fabricate-journal-lifecycle-past-stage',
  ]),
  // The instruments over the fill leaf (issue 1782): the run detail's stage track and a run card's.
  'src/ui/svelte/components/StageBars.svelte': Object.freeze([
    'fabricate-journal-lifecycle-past-stage',
    'fabricate-journal-lifecycle-waiting-auto-eligible',
  ]),
  // The crafting essence pool's requirement meters and the journal's shared essence stage.
  'src/ui/svelte/components/Meter.svelte': Object.freeze([
    'player-crafting-essence-pool',
    'fabricate-journal-lifecycle-essence-shared',
  ]),
  // One chance bar of each scale, and the Checks Studio's odds histogram and one-outcome chart.
  'src/ui/svelte/components/BandedBar.svelte': Object.freeze([
    'player-gathering-task-ready',
    'player-gathering-events',
    'manager-checks-crafting-odds-enumerable',
    'manager-checks-count-botch-odds',
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
  // The bare leaf's one remaining caller: an opened gathering drop row's chance track.
  'src/ui/svelte/components/FillBar.svelte': Object.freeze(['player-gathering-drop-open']),
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
  'src/ui/svelte/components/ListRow.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
    'fabricate-journal-lifecycle-finished-success',
    'fabricate-journal-lifecycle-gathering-d100',
    'fabricate-journal-lifecycle-gathering-check',
  ]),
  // The preview scale, plus the two historical branches no other frame draws.
  'src/ui/svelte/components/YieldScale.svelte': Object.freeze([
    'fabricate-journal-lifecycle-gathering-d100',
    'fabricate-journal-history-data-legacy-row-rolls-1240',
    'fabricate-journal-history-data-unknown-material-resolution-1240',
  ]),
  'src/ui/svelte/components/OutcomeLadder.svelte': Object.freeze([
    'fabricate-journal-lifecycle-gathering-check',
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
  // The most-used control in the app, and until issue 1378 it published no frame that renders one.
  'src/ui/svelte/components/Stepper.svelte': Object.freeze(['manager-gathering-economy-actors']),
  // The manager's one selection box, whose `sm` size has one caller and is absent from both representative frames.
  'src/ui/svelte/components/SelectionCheckbox.svelte': Object.freeze([
    'manager-tool-prerequisites-selected-1280x720',
  ]),
  // The app's one art tile (issue 1506), which is the change that earned it an entry.
  'src/ui/svelte/components/Medallion.svelte': Object.freeze(['world-component-entry-essences']),
  // The manager's on/off switch (issue 1040), whose three frames are chosen per host rather than per state.
  'src/ui/svelte/components/StatusToggle.svelte': Object.freeze([
    'manager-system-edit-normal',
    'coverage-mode-routed-check-checks',
    'manager-tool-parity-04-requirements-1280x720',
  ]),
  // Both band-strip frames, for the same two-mode reasoning `SearchablePopover` carries below.
  'src/ui/svelte/components/ThresholdBandStrip.svelte': Object.freeze([
    'manager-checks-simple-two-band-strip',
    'coverage-mode-routed-check-checks',
  ]),
  // The manager's labelled form field (issue 1428), on 81 call sites and in neither representative frame.
  'src/ui/svelte/components/Field.svelte': Object.freeze([
    'manager-gathering-task-editor-normal',
    'manager-system-edit-normal',
  ]),
  // The manager's icon-only button (issue 1422): 36 callers, and the representative pair reaches only its neutral state.
  'src/ui/svelte/components/IconButton.svelte': Object.freeze([
    'world-modifiers',
    'manager-environment-edit-blind-weights',
  ]),
  // The manager's filter bar (issue 1039), extracted from 11 hand-written toolbar sections.
  'src/ui/svelte/components/FilterBar.svelte': Object.freeze([
    'world-component-catalogue',
    'manager-environments-browse-normal',
  ]),
  // The manager's search field (issue 1039).
  'src/ui/svelte/components/SearchField.svelte': Object.freeze([
    'manager-gathering-task-editor-normal',
    'manager-knowledge-owned-copies',
  ]),
  // The manager's card shell (issue 1427), extracted from 80 hand-written inspector-card sections.
  'src/ui/svelte/components/InspectorCard.svelte': Object.freeze([
    'manager-essences-disabled-in-use',
    'coverage-mode-routed-check-checks',
  ]),
  // The percentage slider (issue 1508): it is under `components/`, so no case's `sourceMatches` is ever consulted for it.
  'src/ui/svelte/components/ChanceSlider.svelte': Object.freeze(['world-tool-entry']),
  // An actor's portrait (issue 1506), the first entry gained by a primitive arriving rather than an extraction leaving.
  'src/ui/svelte/components/Avatar.svelte': Object.freeze(['manager-knowledge-owned-copies']),
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
  ]),
  // The editor validation surface (issue 1444).
  'src/ui/svelte/components/EditorValidationSurface.svelte': Object.freeze([
    'manager-checks-validation',
    'manager-recipe-item-validation-blocked',
    'manager-recipe-edit-validation',
    'manager-checks-validation-retired-placeholder',
  ]),
  // The shared empty panel.
  'src/ui/svelte/components/EmptyState.svelte': Object.freeze([
    'manager-systems-empty',
    'world-tool-entry-on-break-repair-tag-picker-empty',
    'world-tool-catalogue-filtered-empty',
    'manager-gathering-task-availability-feedback-normal',
    'manager-gathering-task-availability-feedback-narrow',
    'manager-gathering-event-availability-feedback-normal',
    'manager-gathering-event-availability-feedback-narrow',
  ]),
  // Both parties pickers: between them they are the primitive's two modes, and neither renders the other's chrome.
  'src/ui/svelte/components/ItemDropZone.svelte': Object.freeze([
    'world-tool-catalogue-list-head',
    'world-tool-entry-overview',
    'world-tool-entry-unlinked',
    'world-tool-entry-source-missing',
  ]),
  // The radio-card group (issue 1373).
  'src/ui/svelte/components/RadioCardGroup.svelte': Object.freeze([
    'world-tool-entry-requirements',
    'manager-tool-parity-03-breakage-1280x720',
  ]),
  // The titled status card (issue 1509), and it gains an override in the same commit that moves it.
  'src/ui/svelte/components/ToggleCard.svelte': Object.freeze(['manager-recipe-edit-normal']),
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
    'world-tool-entry-on-break-repair-tag-picker-empty',
    'manager-essences-source-picker',
    'player-crafting-sources-picker',
    'manager-recipe-item-contents-picker',
    'manager-recipes-bulk-edit-check-tier',
    'player-inventory-page-size',
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
    'player-inventory-page-size',
    'interactables-manager-region-open',
  ]),
  // The essence source picker (issue 1503), whose panel moved wholesale onto the primitive above.
  'src/ui/svelte/components/EssenceSourceSelector.svelte': Object.freeze([
    'manager-essences-source-picker',
  ]),
  // The overflow action menu (issue 1477), extracted from four hand-rolled menus and one `SearchablePopover`.
  // The requirement row's kind menu is its headed form with a caller's own trigger (issue 1516).
  'src/ui/svelte/components/ActionMenu.svelte': Object.freeze([
    'manager-environment-edit-automatic-force-add',
    'manager-systems-row-menu-open',
    'manager-recipe-edit-ingredients-or-menu',
    'manager-recipe-edit-choice-group-menu',
  ]),
  // The pill multi-select (issue 1458), whose add menu became a `SearchablePopover` in the same change.
  'src/ui/svelte/components/ModifierPillSelect.svelte': Object.freeze([
    'manager-recipe-edit-crafting-modifier-cap-reached',
  ]),
  // The uppercase micro-label (issue 1505), on sixteen converted eyebrow sites across nine files.
  'src/ui/svelte/components/Kicker.svelte': Object.freeze([
    'player-crafting-slot-rail',
    'manager-recipe-item-overview',
  ]),
  // The at-a-glance figure (issue 1505).
  'src/ui/svelte/components/StatBox.svelte': Object.freeze([
    'player-crafting-essence-shopping',
    'manager-books-scrolls-item',
  ]),
  // The surface that reports something that just happened (issue 1505), on two callers.
  'src/ui/svelte/components/Notice.svelte': Object.freeze(['player-inventory-bulk-report']),
  // The strip of current values (issue 1521): the check card's badge, target and source facts, its
  // formula fact over the danger notice, and the gathering stamina pool under its kicker.
  'src/ui/svelte/components/InfoStrip.svelte': Object.freeze([
    'player-crafting-check-descriptor-under-resolved',
    'player-crafting-check-formula-unresolved',
    'player-gathering-economy-strip',
  ]),
  // The standing statement (issue 1505), widened onto its specimen and re-authored at 15 importing files.
  'src/ui/svelte/components/Callout.svelte': Object.freeze([
    'manager-tool-parity-04-requirements-1280x720',
    'player-salvage',
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
  // The well below a card (issue 2008): the Formula card's roll-prompt and additional-dice groups,
  // and the roll prompt's additional-dice control.
  'src/ui/svelte/components/Well.svelte': Object.freeze([
    'manager-checks-crafting-advantage-keep',
    'manager-checks-v3-count-under',
    'player-crafting-roll-prompt-count-additional',
  ]),
  // The player window's chips (issue 1518): the recipe header's status chip and each row's icon-only one.
  'src/ui/svelte/components/Chip.svelte': Object.freeze(['player-crafting-simple']),
  // The player window draws it in the journal's run action bar: the primary, then the danger and neutral pair.
  'src/ui/svelte/components/Button.svelte': Object.freeze([
    'fabricate-journal-lifecycle-ready-single',
    'fabricate-journal-lifecycle-cancel-confirmation',
  ]),
  // The pager's two player forms: the inventory's persistent bar and the recipe browser's threshold one.
  'src/ui/svelte/components/Pagination.svelte': Object.freeze([
    'player-inventory',
    'player-crafting-simple',
  ]),
  // The requirement chooser (issue 1518): open on a choice slot, and the rail's three slot states;
  // and its award face at the ceiling (issue 1773).
  'src/ui/svelte/components/RequirementChooser.svelte': Object.freeze([
    'player-crafting-chooser-open',
    'player-crafting-slot-rail',
    'player-journal-award-choice-ceiling',
  ]),
  // The track (issue 1516): its 30px inline rung is drawn only by the requirement row's amount toggle.
  'src/ui/svelte/components/SegmentedControl.svelte': Object.freeze([
    'manager-recipe-edit-results-rolled',
  ]),
  // The sheet itself, and the first entry here whose key is not a component (issue 1515).
  'styles/fabricate.css': Object.freeze([
    'manager-gathering-task-editor-normal',
    'manager-world-downtime-tracking',
    'manager-world-downtime-collapsed',
  ]),
});

/** One player screen and one manager screen: enough to show a shared-primitive change in context. */
export const REPRESENTATIVE_CASE_IDS = Object.freeze([
  'fabricate-app-shell',
  'manager-components-normal',
]);

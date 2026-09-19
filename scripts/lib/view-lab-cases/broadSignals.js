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
  'src/ui/svelte/components/ManagerToolbar.svelte': Object.freeze([
    'world-component-catalogue',
    'manager-environments-browse-normal',
  ]),
  // The manager's search field (issue 1039).
  'src/ui/svelte/components/ManagerSearchField.svelte': Object.freeze([
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
    'manager-recipe-edit-ingredients-or-menu',
    // An eighth, and it is the primitive's grid list form (issue 1503).
    'manager-essences-source-picker',
    // A ninth and a tenth: the primitive's multi-select mode and the caller that stays open without it (issue 1513).
    'player-crafting-sources-picker',
    'manager-recipe-item-contents-picker',
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
  // The app's own select (issue 1504), whose whole subject — the option list — exists only while it is open.
  'src/ui/svelte/components/Select.svelte': Object.freeze([
    'manager-recipes-bulk-edit-check-tier',
    'player-inventory-page-size',
    'interactables-manager-region-open',
  ]),
  // The essence source picker (issue 1503), whose panel moved wholesale onto the primitive above.
  'src/ui/svelte/components/EssenceSourceSelector.svelte': Object.freeze([
    'manager-essences-source-picker',
  ]),
  // The overflow action menu (issue 1477), extracted from four hand-rolled menus and one `SearchablePopover`.
  'src/ui/svelte/components/ActionMenu.svelte': Object.freeze([
    'manager-environment-edit-automatic-force-add',
    'manager-systems-row-menu-open',
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
  // The standing statement (issue 1505), widened onto its specimen and re-authored at 15 importing files.
  'src/ui/svelte/components/Callout.svelte': Object.freeze([
    'manager-tool-parity-04-requirements-1280x720',
    'player-salvage',
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

/**
 * Pure (playwright-free, no `main()` autorun) registration map for the live-Foundry screenshot
 * capture walk in `scripts/foundry-test-run.mjs`.
 */

// Walk phases that emit screenshots.
export const CAPTURE_PHASE_D0 = 'phase-D0';
export const CAPTURE_PHASE_E = 'phase-E';

/**
 * Behavioral-state classes (issue #826 Design B). illustrative metadata, not a scoping key: the
 * capture bodies live in the harness.
 */
export const CLASS_A_LABELS = Object.freeze(
  new Set([
    'post-craft',
    'crafter-post-craft-inventory',
    'chat-craft-card',
    'fabricate-journal',
    'fabricate-journal-craft-detail',
  ])
);

export const CLASS_B_LABELS = Object.freeze(
  new Set([
    // The interactive crafting-check roll prompt.
    'player-crafting-roll-prompt',
    'player-crafting-run-summary',
    'player-crafting-roll-result',
    'player-crafting-alternatives-switched',
    // The requirement-rail states that live in the store rather than the world db (issue 917):
    // which chooser is open, and how many units of each carrier the player has allocated.
    'player-crafting-slot-rail',
    'player-crafting-essence-pool',
    'player-crafting-pick-for-me',
    'player-crafting-essence-pool-shared',
    'player-crafting-consumption-plan',
    'player-crafting-progressive-reordered',
    'manager-import-report',
    'manager-import-folder-mapping',
    'manager-multistep-disable-confirm',
    'manager-components-description-repaired',
    'manager-components-description-ingested',
    'manager-system-edit-dirty',
    'manager-system-edit-lists',
    'interactables-manager-promote',
    'interactables-manager-empty',
    'manager-tool-stress-invalid-validation',
  ])
);

/** Every `VIEW_RECIPES` smoke label, in the harness's capture (walk) order. */
export const SCREENSHOT_CAPTURE_ORDER = Object.freeze([
  // ── phase-D0: Crafting System Manager walk ─────────────────────────
  'manager-recipes-editor-roundtrip',
  'manager-default-selection',
  'manager-selected-normal',
  'manager-rail-expanded',
  'manager-rail-collapsed',
  'manager-selected-stacked',
  'manager-system-edit-normal',
  'manager-system-edit-narrow',
  'manager-system-edit-dirty',
  'manager-system-edit-lists',
  'currency-actor-property',
  'currency-macro',
  'currency-actor-inventory',
  'manager-recipes-normal',
  // Issue 1010 — the Recipe Studio's bulk-edit states, captured immediately after the plain browser
  // frame so `manager-recipes` keeps winning its own `candidates[0]` with `manager-recipes-normal`
  // (the lowest capture counter among that view's three labels).
  'manager-recipes-bulk-edit',
  'manager-recipes-bulk-edit-unstaged',
  'manager-recipes-bulk-edit-blocked',
  'manager-recipes-narrow',
  'manager-recipes-no-check',
  'manager-recipes-grouped-continuation',
  'manager-crafting-group-expanded',
  'manager-books-scrolls-normal',
  'manager-crafting-settings',
  'manager-recipe-item-validation',
  'manager-recipe-item-validation-blocked',
  'manager-recipe-edit-normal',
  'manager-recipe-edit-books-scrolls',
  'manager-recipe-edit-tools',
  'manager-recipe-edit-ingredients',
  'manager-recipe-edit-ingredients-cost',
  'manager-recipe-edit-validation',
  'manager-recipe-edit-multistep',
  'manager-recipe-edit-results',
  'manager-recipe-edit-results-multistep',
  'manager-multistep-disable-confirm',
  'manager-recipe-edit-collapsed',
  'manager-recipe-edit-results-progressive',
  'manager-recipe-edit-results-alchemy',
  'manager-recipe-edit-access-rail',
  'manager-components-normal',
  'manager-components-bulk-edit',
  'manager-components-bulk-edit-unstaged',
  'manager-components-description-before',
  'manager-components-description-repaired',
  'manager-components-description-ingested',
  'manager-component-edit-normal',
  'manager-component-edit-salvage',
  'manager-component-edit-salvage-off',
  'manager-component-edit-salvage-simple',
  'manager-checks-gathering',
  'manager-checks-validation',
  'manager-checks-crafting-consumption',
  'manager-checks-crafting-modifiers',
  'manager-components-stacked',
  'manager-components-grouped-continuation',
  'manager-tags-categories-normal',
  'manager-tags-categories-tags-tab',
  'manager-tags-categories-stacked',
  'manager-essences-normal',
  'manager-essences-stacked',
  'manager-essence-edit-first-state',
  'manager-environments-browse-normal',
  'manager-environments-browse-stacked',
  'manager-gathering-task-editor-normal',
  'manager-gathering-task-editor-stacked',
  'manager-environment-edit-placeholder',
  'manager-gathering-events-normal',
  'manager-gathering-event-editor-normal',
  'manager-world-travel-default-collapsed',
  'manager-world-travel-expanded-neutral',
  'manager-world-travel-with-gathering-expanded',
  'manager-world-parties-normal',
  'manager-world-travel-realms-normal',
  'manager-world-travel-realms-stacked',
  'manager-world-travel-map-normal',
  'manager-world-travel-map-stacked',
  'manager-world-travel-map-collapsed-rail',
  'manager-world-travel-ungated',
  'manager-tool-parity-01-library-1280x720',
  'manager-tool-zero-state-empty-library-1280x720',
  'manager-tool-parity-02-remove-1280x720',
  'manager-tool-stress-long-name',
  'manager-tool-parity-03-breakage-1280x720',
  'manager-tool-stress-repair',
  'manager-tool-stress-replacement',
  'manager-tool-stress-immune',
  'manager-tool-parity-04-requirements-1280x720',
  'manager-tool-parity-05-validation-1280x720',
  'manager-tool-stress-invalid-validation',
  'manager-tool-parity-06-breakage-900x700',
  'manager-tool-stress-wrapping-680',
  'manager-knowledge-owned-copies',
  'manager-knowledge-empty-tab',
  'manager-knowledge-learned-lost-copy',
  'manager-knowledge-party-pool-warning',
  'manager-knowledge-delete-armed',
  'manager-knowledge-narrow',
  'manager-components-progressive',
  'manager-components-bulk-edit-progressive',
  'manager-component-edit-difficulty',
  'interactable-config-linked',
  'interactable-config-unlinked',
  'interactable-config-source-configured',
  'interactable-config-needs-configuration',
  'interactables-manager-list',
  'interactables-manager-promote',
  'interactables-manager-empty',
  'manager-import-report',
  'manager-import-folder-mapping',
  'manager-alchemy-settings',
  'manager-experimental-off',
  // ── phase-E: player apps + persisted-state craft/journal frames ─────
  'player-gathering-environments',
  'fabricate-app-shell',
  'player-inventory',
  'player-salvage',
  'player-salvage-no-check',
  'player-salvage-tools',
  'player-inventory-multi-system',
  'player-salvage-misconfigured',
  'player-gathering-events',
  'player-gathering-task-ready',
  'player-gathering-after-success',
  'player-gathering-tool-blocked',
  'player-gathering-timed-ready',
  'player-gathering-timed-active',
  'player-gathering-blind',
  'player-gathering-realm-locked',
  'player-gathering-stacked',
  'player-crafting-simple',
  'player-crafting-ingredient-routed',
  'player-crafting-routed-by-check',
  'player-crafting-roll-prompt',
  'player-crafting-run-summary',
  'player-crafting-roll-result',
  'player-crafting-essence-alternative',
  'player-crafting-alternatives',
  'player-crafting-essence-legacy',
  'player-crafting-essence-ingredient',
  'player-crafting-essence-shopping',
  // The requirement-rail redesign (issue 917), in walk order.
  'player-crafting-slot-rail',
  'player-crafting-tag-unmatched',
  'player-crafting-essence-pool',
  'player-crafting-pick-for-me',
  'player-crafting-essence-pool-shared',
  'player-crafting-consumption-plan',
  'player-crafting-multistep',
  'player-crafting-progressive',
  'player-crafting-progressive-reordered',
  'player-crafting-progressive-fixed',
  'player-crafting-progressive-stacked',
  'player-crafting-stacked',
  'player-alchemy-chooser',
  'player-alchemy-workbench',
  'player-alchemy-stacked',
  'chat-craft-card',
  'fabricate-journal',
  'fabricate-journal-craft-detail',
]);

const CAPTURE_ORDER_INDEX = new Map(SCREENSHOT_CAPTURE_ORDER.map((label, index) => [label, index]));

/** The phase that produces `label`, derived from its stable prefix. */
export function phaseForCaptureLabel(label) {
  if (label === 'manager-recipes-editor-roundtrip') return CAPTURE_PHASE_D0;
  if (
    label.startsWith('manager-') ||
    label.startsWith('currency-') ||
    label.startsWith('interactable-') ||
    label.startsWith('interactables-')
  ) {
    return CAPTURE_PHASE_D0;
  }
  return CAPTURE_PHASE_E;
}

/** True when `label` is one of the known capturable view labels. */
export function isCapturableLabel(label) {
  return CAPTURE_ORDER_INDEX.has(label);
}

/**
 * The capture-counter ordinal for `label` (its index in the walk). Lower sorts first in `collect`'s
 * filename sort, so this is what makes a view's intended frame win `candidates[0]`.
 */
export function captureOrderIndex(label) {
  return CAPTURE_ORDER_INDEX.has(label) ? CAPTURE_ORDER_INDEX.get(label) : -1;
}

/**
 * The set of view-bearing phases a scoped run must execute to produce every label in
 * `targetLabels`.
 */
export function phasesForTargetLabels(targetLabels) {
  const phases = new Set();
  for (const label of targetLabels) {
    if (isCapturableLabel(label)) phases.add(phaseForCaptureLabel(label));
  }
  return phases;
}

/** Whether the `phase-E` player/craft walk is needed for `targetLabels`. */
export function isPhaseNeededForTargets(phase, targetLabels) {
  return phasesForTargetLabels(targetLabels).has(phase);
}

/**
 * `phase-D0` (the Crafting System Manager walk) cannot be skipped wholesale (see
 * `isPhaseNeededForTargets`) because its opening spine seeds fixtures a later `phase-E` reads.
 */
function captureOrderSlice(fromLabel, toLabel) {
  const from = CAPTURE_ORDER_INDEX.get(fromLabel);
  const to = CAPTURE_ORDER_INDEX.get(toLabel);
  if (from === undefined || to === undefined || from > to) {
    throw new Error(`invalid capture-order slice: ${fromLabel}..${toLabel}`);
  }
  return SCREENSHOT_CAPTURE_ORDER.slice(from, to + 1);
}

export const D0_SPINE_LABELS = Object.freeze(
  captureOrderSlice('manager-default-selection', 'currency-actor-inventory')
);

/** The ordered, contiguous, independently-skippable D0 capture sections. */
const D0_SECTION_SPANS = [
  {
    name: 'recipes',
    from: 'manager-recipes-normal',
    to: 'manager-recipe-edit-access-rail',
    extra: ['manager-recipes-editor-roundtrip'],
  },
  {
    name: 'components-checks',
    from: 'manager-components-normal',
    to: 'manager-components-grouped-continuation',
  },
  {
    name: 'tags-essences',
    from: 'manager-tags-categories-normal',
    to: 'manager-essence-edit-first-state',
  },
  {
    name: 'gathering',
    from: 'manager-environments-browse-normal',
    to: 'manager-world-travel-ungated',
  },
  {
    name: 'tools',
    from: 'manager-tool-parity-01-library-1280x720',
    to: 'manager-tool-stress-wrapping-680',
  },
  {
    // The GM Knowledge surface (issue 785).
    name: 'knowledge',
    from: 'manager-knowledge-owned-copies',
    to: 'manager-knowledge-narrow',
  },
  {
    name: 'overview-interactables',
    from: 'manager-components-progressive',
    to: 'interactables-manager-empty',
  },
  {
    name: 'import-alchemy-experimental',
    from: 'manager-import-report',
    to: 'manager-experimental-off',
  },
];

export const D0_SKIPPABLE_SECTIONS = Object.freeze(
  D0_SECTION_SPANS.map(({ name, from, to, extra = [] }) =>
    Object.freeze({
      name,
      labels: Object.freeze([...extra, ...captureOrderSlice(from, to)]),
    })
  )
);

const D0_SECTION_LABELS_BY_NAME = new Map(D0_SKIPPABLE_SECTIONS.map((s) => [s.name, s.labels]));

/**
 * Whether the named D0 section must run to satisfy `targetLabels` — i.e. any of the section's
 * mapped labels is in the target set.
 */
export function isD0SectionNeededForTargets(sectionName, targetLabels) {
  const labels = D0_SECTION_LABELS_BY_NAME.get(sectionName);
  if (!labels) return true;
  const targets = targetLabels instanceof Set ? targetLabels : new Set(targetLabels);
  return labels.some((label) => targets.has(label));
}

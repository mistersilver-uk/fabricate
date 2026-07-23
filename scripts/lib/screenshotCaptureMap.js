/**
 * screenshotCaptureMap.js
 *
 * Pure (playwright-free, no `main()` autorun) registration map for the live-Foundry
 * screenshot capture walk in `scripts/foundry-test-run.mjs`. It is the label →
 * capture-routine METADATA — which smoke label is produced by which walk phase, in
 * which relative order, and its behavioral-state class — NOT the browser-driving
 * routine bodies. The harness imports it to scope a `screenshots`-profile run to the
 * views a PR affects (skip a phase whose labels are all off-target); the unit tests
 * import it to prove scoping/reachability/ordering WITHOUT booting Foundry.
 *
 * WHY a separate module (issue #826): `foundry-test-run.mjs` top-level-imports
 * playwright AND autoruns `main()` with no `import.meta.url` guard, so importing it in
 * `node:test` launches Chromium then `process.exit()`s — killing the whole `node --test`
 * run (the `# cancelled` catastrophe). Nothing here imports playwright or runs on load.
 *
 * DRIFT GUARD: this is a hand-maintained mirror of the harness's `screenshot(page,
 * '<label>')` calls and of `VIEW_RECIPES` in `scripts/ui-pr-screenshot-evidence.mjs`.
 * `tests/screenshot-capture-scoping.test.js` fails when they drift — every capturable
 * label here must appear as a string literal in the harness source, and every
 * `VIEW_RECIPES` smoke label must be reachable here.
 */

// Walk phases that emit screenshots. `boot-and-join`/`phase-B`/`phase-C` emit only
// health frames that no PR view maps, so the two view-bearing phases are the scoping
// unit: `phase-D0` (the Crafting System Manager walk) and `phase-E` (the player apps +
// persisted-state craft/journal frames).
export const CAPTURE_PHASE_D0 = 'phase-D0';
export const CAPTURE_PHASE_E = 'phase-E';

/**
 * Behavioral-state classes (issue #826 Design B). ILLUSTRATIVE metadata, not a
 * scoping key: the capture bodies live in the harness. Recorded here so a future
 * per-view runner (and a reviewer) can see which frames read persisted world state vs
 * an ephemeral post-click dialog.
 *
 * - Class A (persisted-state): rendered from world-DB state a live craft/import
 *   produces (run-history flag, crafted item, chat message).
 * - Class B (ephemeral in-session UI): exists only after a live click; not
 *   representable in any world DB, so its routine must retain the inline interaction.
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
    'player-crafting-run-summary',
    'player-crafting-roll-result',
    'player-crafting-alternatives-switched',
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
  ])
);

/**
 * Every `VIEW_RECIPES` smoke label, in the harness's capture (walk) order. `collect`
 * (`scripts/ui-pr-screenshot-evidence.mjs`) picks `candidates[0]` from a FILENAME sort
 * of `screenshot-<counter>-<label>.png`, i.e. the lowest capture counter among a view's
 * labels — so the relative order here is load-bearing: a scoped run renumbers the
 * counter, but because it only FILTERS which labels are written (never reorders), the
 * per-view first-captured label is preserved and `candidates[0]` still selects it.
 * @type {readonly string[]}
 */
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
  'manager-gathering-travel-normal',
  'manager-gathering-travel-stacked',
  'manager-tools-normal',
  'manager-components-progressive',
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
  'player-crafting-run-summary',
  'player-crafting-roll-result',
  'player-crafting-essence-alternative',
  'player-crafting-alternatives',
  'player-crafting-essence-legacy',
  'player-crafting-essence-ingredient',
  'player-crafting-essence-shopping',
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

/**
 * The phase that produces `label`, derived from its stable prefix. Manager /
 * currency / interactable frames belong to the `phase-D0` manager walk; player /
 * craft / journal / app-shell frames belong to `phase-E`. Deriving from the prefix
 * (rather than a second hand-maintained table) keeps the mapping self-consistent; the
 * one function-hosted exception is pinned explicitly.
 * @param {string} label
 * @returns {'phase-D0' | 'phase-E'}
 */
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
 * The capture-counter ordinal for `label` (its index in the walk). Lower sorts first
 * in `collect`'s filename sort, so this is what makes a view's intended frame win
 * `candidates[0]`. Returns -1 for an unknown label.
 * @param {string} label
 * @returns {number}
 */
export function captureOrderIndex(label) {
  return CAPTURE_ORDER_INDEX.has(label) ? CAPTURE_ORDER_INDEX.get(label) : -1;
}

/**
 * The set of view-bearing phases a scoped run must execute to produce every label in
 * `targetLabels`. Unknown labels are ignored (they carry no phase); an empty set
 * yields an empty set (the caller then treats it as "capture everything").
 * @param {Iterable<string>} targetLabels
 * @returns {Set<string>}
 */
export function phasesForTargetLabels(targetLabels) {
  const phases = new Set();
  for (const label of targetLabels) {
    if (isCapturableLabel(label)) phases.add(phaseForCaptureLabel(label));
  }
  return phases;
}

/**
 * Whether the `phase-E` player/craft walk is needed for `targetLabels`. `phase-E` is
 * the LAST view-bearing phase (only cleanup follows) and nothing earlier depends on
 * its side effects, so it is safe to skip when no target label maps to it. `phase-D0`
 * is NOT symmetrically skippable: `phase-E`'s player views read fixtures seeded inside
 * `phase-D0`, so a wholesale D0 skip would strand those seeds (deferred to the
 * follow-on that hoists the seed prerequisites).
 * @param {Iterable<string>} targetLabels
 * @returns {boolean}
 */
export function isPhaseNeededForTargets(phase, targetLabels) {
  return phasesForTargetLabels(targetLabels).has(phase);
}

/**
 * ── Phase-D0 intra-phase collapse (issue #826 increment 2) ─────────────────────
 *
 * `phase-D0` (the Crafting System Manager walk) cannot be skipped wholesale (see
 * `isPhaseNeededForTargets`) because its opening SPINE seeds fixtures a later
 * `phase-E` reads. But its body is a sequence of contiguous capture SECTIONS, and
 * measured `viewTimings` show D0 at ~64% of the walk. A scoped `screenshots` run
 * therefore skips the navigate+settle+capture work of any SECTION whose labels are
 * all off-target, keeping only the always-run spine + the sections a PR touches.
 *
 * SAFETY MODEL (why a whole-section skip cannot publish a wrong frame):
 * - The spine (`D0_SPINE_LABELS`) ALWAYS runs — it opens the manager, selects the
 *   smoke system, seeds the gathering library + travel/realm fixtures `phase-E`
 *   needs, and enables the persisted currency config a downstream view may read. It
 *   is the baseline every section re-navigates from.
 * - Each skippable section re-enters via ABSOLUTE manager navigation (a nav-parent /
 *   nav-button click or `openManager*` helper — never a relative move off the prior
 *   section's position), so a section never depends on an upstream section's UI
 *   state; and each section is persisted-NET-ZERO: it either only captures, or it
 *   mutates shared state and restores it INLINE (the multi-step feature toggle's
 *   `finally`, the issue-800 description-repair restore, the gathering-economy
 *   revert, every system switch's re-select, the import "(Copy)" deletion). Skipping
 *   a whole section skips the mutation AND its inline restore together, leaving world
 *   state exactly as if the section never ran — so no co-scoped reader is
 *   contaminated. (Section granularity is why the multi-step `finally` needs no
 *   per-routine split: the enabled-state frames, the toggle, and the restore are all
 *   inside ONE section and either all run or all skip.)
 *
 * These lists are the MAPPED (`VIEW_RECIPES`) labels only; unmapped ride-along frames
 * (e.g. `manager-system-overview`) are produced only when their section runs and are
 * never a PR target, so they need no entry here. `tests/screenshot-capture-scoping.js`
 * proves spine + sections PARTITION every mapped D0 label (nothing unguarded).
 */
/**
 * The inclusive `[fromLabel, toLabel]` slice of `SCREENSHOT_CAPTURE_ORDER`. The spine
 * and section label lists are DERIVED from these boundary markers rather than
 * re-listing every label, so each label string lives exactly once (in the capture
 * order) — the single source of truth. Re-listing them here instead would duplicate
 * ~70 label strings the new-code duplication gate rejects, and would drift silently
 * from the capture order. Throws on an unknown or inverted boundary (a fail-loud
 * mis-edit guard).
 * @param {string} fromLabel
 * @param {string} toLabel
 * @returns {string[]}
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

/**
 * The ordered, contiguous, independently-skippable D0 capture sections. Each `name`
 * is the token the harness passes to its `shouldRunScreenshotSection` guard; `labels`
 * are that section's mapped capture labels, DERIVED (see `captureOrderSlice`) from the
 * section's contiguous `[from, to]` span in the capture order. A section runs iff
 * scoping is inactive (rc/ci/full — the guard short-circuits true) OR at least one of
 * its labels is in the PR target set. `extra` carries a label the walk captures OUT of
 * its section's contiguous span: the recipe-editor roundtrip is hoisted to the front of
 * the capture order (for `candidates[0]`) but belongs to the recipes section.
 * @type {readonly {name: string, labels: readonly string[]}[]}
 */
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
    to: 'manager-gathering-travel-stacked',
  },
  {
    name: 'overview-interactables',
    from: 'manager-tools-normal',
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
 * Whether the named D0 section must run to satisfy `targetLabels` — i.e. any of the
 * section's mapped labels is in the target set. Pure: the harness composes it with
 * its own `SCREENSHOT_SCOPING_ACTIVE` short-circuit (rc/ci/full always run every
 * section). An unknown section name returns `true` (fail-safe: never silently skip a
 * section the harness knows about but the map does not).
 * @param {string} sectionName
 * @param {Iterable<string>} targetLabels
 * @returns {boolean}
 */
export function isD0SectionNeededForTargets(sectionName, targetLabels) {
  const labels = D0_SECTION_LABELS_BY_NAME.get(sectionName);
  if (!labels) return true;
  const targets = targetLabels instanceof Set ? targetLabels : new Set(targetLabels);
  return labels.some((label) => targets.has(label));
}

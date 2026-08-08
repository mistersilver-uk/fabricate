/**
 * The mount-harness module closure of `ComponentEditView.svelte`.
 *
 * This is a property of the COMPONENT, not of any suite: every mounted suite that renders
 * `ComponentEditView` needs exactly these modules, so the two lists live here once instead
 * of being restated per suite. Two suites already carried byte-identical copies, which is
 * the failure mode these lists are most exposed to — the omission does not FAIL a suite, it
 * HANGS it and is reported as `# cancelled` rather than `# fail`, so a list that drifts out
 * of date on one suite and not the other is easy to ship and hard to read back.
 *
 * Centralised on the same reasoning as `componentIdentityFixtures.js`: SonarCloud counts
 * `tests/**` duplication like `src/`, and its Automatic Analysis ignores `cpd.exclusions`.
 */

/**
 * Raw (uncompiled) modules the harness copies into the temp tree verbatim.
 *
 * A missing entry HANGS the suite rather than failing it, so the shared harness validator
 * throws for it up front.
 */
export const COMPONENT_EDIT_VIEW_RAW_MODULES = Object.freeze([
  'src/ui/svelte/util/foundryBridge.js',
  // The ONE derivation of a `<Stepper>`'s three accessible names from its field label
  // (issue 1050); `ComponentEditView` reaches it through the salvage quantity and DC fields.
  'src/ui/svelte/components/stepperLabels.js',
  'src/ui/svelte/util/componentEditor.js',
  // The add-new essence offer projection (issue 1036); ComponentEditView imports it to
  // withhold a disabled essence from the quantity grid.
  'src/utils/essenceValidation.js',
  // The component category vocabulary (issue 676), imported by ComponentEditView.
  // A deliberately import-free leaf, so this single entry suffices.
  'src/utils/componentCategories.js',
  // The salvage DC control's pure option model (issue 676). Import-free leaf.
  'src/ui/svelte/apps/manager/component/salvageDcPresets.js',
  // The salvage mode pill's label source (issue 676) — it already carries 'Routed by
  // check' for the persisted 'routed' token. Import-free leaf.
  'src/ui/svelte/apps/manager/resolutionModeOptions.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  // The identity strip's drop target + its portaled overflow menu (issue 676).
  'src/ui/svelte/actions/dragDrop.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/util/iconPickerPopover.js',
]);

/**
 * `.svelte` modules the harness compiles.
 *
 * The component under test is listed here too: the harness imports `componentPath` from the
 * temp tree but only compiles what this names. A `.svelte` the tree RENDERS but this list
 * omits does not fail — it HANGS, and is reported as `# cancelled`, never `# fail`.
 */
export const COMPONENT_EDIT_VIEW_COMPILED_MODULES = Object.freeze([
  // The manager's ONE chip (issue 883).
  'src/ui/svelte/apps/manager/Chip.svelte',
  // The shared no-state primitive (issue 785).
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  // Rendered by the salvage block.
  'src/ui/svelte/apps/manager/ToggleCard.svelte',
  'src/ui/svelte/apps/manager/SearchablePopover.svelte',
  // The salvage result quantity + the progressive DC are the shared Stepper (issue 676).
  // Import-free leaf, so it needs no `rawModules` entry — but omit it HERE and the suite
  // hangs.
  'src/ui/svelte/components/Stepper.svelte',
  // The shared essence quantity card (issue 772). `ComponentEditView` renders it after the
  // extraction, so it is in this tree's static import closure whether or not a given test
  // turns the essences section on.
  'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
  'src/ui/svelte/apps/manager/component/ComponentIdentityStrip.svelte',
  'src/ui/svelte/apps/manager/ComponentEditView.svelte',
]);

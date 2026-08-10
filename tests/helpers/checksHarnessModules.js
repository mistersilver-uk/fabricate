/**
 * The ONE dependency manifest every mounted CHECKS suite compiles against (issue 1095,
 * BM9).
 *
 * WHY THIS EXISTS. `createMountedComponentHarness` copies a declared set of raw `.js`
 * modules and compiles a declared set of `.svelte` modules into a temp tree; a component
 * that reaches for something absent from those lists does not FAIL the suite, it HANGS,
 * and the run reports `# cancelled` rather than `# fail`. Every checks-tree suite needs
 * the same closure, so before this constant existed each one restated it — which means a
 * new dependency had to be added to N files, and a suite that missed the edit went
 * silently unrunnable.
 *
 * It is also what keeps the must-not-regress characterization suite under the
 * dependency-manifest-only rule that governs it downstream: the ONLY permitted edit to
 * `tests/components/checks-must-not-regress-characterization.test.js` is its manifest, and
 * with the manifest hoisted here that edit lands in this file instead of in the suite.
 *
 * `tests/helpers/**` is outside the `npm test` glob, so this file adds no test count.
 *
 * IMPORT IT; DO NOT RE-TYPE IT. A copy would defeat the whole point — the copy would go on
 * naming a deleted module while this one moved on.
 */

/**
 * Raw `.js` modules the checks editor tree imports directly or transitively.
 *
 * `checksReadiness.js` is the readiness evaluator the Validation tab renders from; it
 * imports the range helpers out of `craftingCheckExpression.js` and, since issue 1095, the
 * eligibility + bounds derivations out of `checkModifierResolver.js`. That resolver in turn
 * imports `toolCheckBonus.js`, `craftingCheckExpression.js` and `salvageCheckUsability.js`,
 * all of which are listed, so this set closes the graph.
 * @type {ReadonlyArray<string>}
 */
export const CHECKS_TREE_RAW_MODULES = Object.freeze([
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/util/fontAwesomeFreeClassicIcons.js',
  'src/ui/svelte/util/iconPickerPopover.js',
  'src/ui/svelte/util/essenceIcons.js',
  'src/ui/svelte/components/stepperLabels.js',
  'src/systems/characterModifierPrerequisiteCopy.js',
  'src/systems/characterPrerequisites.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/apps/manager/checks/checksReadiness.js',
  // The attribute-name literals the rule group renders, hoisted out of Svelte markup so
  // `tests/view-lab-cases.test.js` can import rather than restate them (issue 1095).
  'src/ui/svelte/apps/manager/checks/modifierPolicyAttrs.js',
  'src/systems/checkModifierResolver.js',
  'src/systems/salvageCheckUsability.js',
  'src/utils/checkModifierPicks.js',
  'src/systems/toolCheckBonus.js',
  'src/utils/craftingCheckExpression.js',
  'src/utils/routedOutcomeKeywords.js',
]);

/**
 * Every `.svelte` module in the checks editor tree, plus the shared primitives those
 * components render.
 * @type {ReadonlyArray<string>}
 */
export const CHECKS_TREE_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/IconPicker.svelte',
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/StatusPill.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
  'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte',
  'src/ui/svelte/apps/manager/ToggleCard.svelte',
  'src/ui/svelte/apps/manager/checks/ChecksEditorTabs.svelte',
  'src/ui/svelte/apps/manager/checks/ChecksRightMenu.svelte',
  'src/ui/svelte/apps/manager/checks/ChecksValidationTab.svelte',
  'src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte',
]);

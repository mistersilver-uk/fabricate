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
  'src/ui/svelte/util/listReorderAnnouncement.js',
  'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
  'src/ui/svelte/util/iconPickerPopover.js',
  'src/ui/svelte/util/essenceIcons.js',
  'src/ui/svelte/components/stepperLabels.js',
  'src/systems/characterModifierPrerequisiteCopy.js',
  'src/systems/characterPrerequisites.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/apps/manager/checks/checksReadiness.js',
  // The ONE copy map (issue 1096): the Validation route and the section-level Callout both
  // render an issue's sentence from it, so both halves of the checks tree import it.
  'src/ui/svelte/apps/manager/checks/checksCopy.js',
  // The per-mode explanation the roll section opens with (issue 1096). A pure data table,
  // imported by `CheckModeCallout.svelte`, which `ChecksView` imports statically.
  'src/ui/svelte/apps/manager/checks/checkModeCallout.js',
  // A trigger's own summary and the common-trigger presets (issue 1096). Both are pure
  // modules imported by `CheckTriggers.svelte`.
  'src/ui/svelte/apps/manager/checks/checkTriggerSummary.js',
  'src/ui/svelte/apps/manager/checks/checkTriggerPresets.js',
  // The attribute-name literals the rule group renders, hoisted out of Svelte markup so
  // `tests/view-lab-cases.test.js` can import rather than restate them (issue 1095).
  'src/ui/svelte/apps/manager/checks/modifierPolicyAttrs.js',
  'src/systems/characterLibraries.js',
  'src/systems/checkModifierResolver.js',
  'src/systems/salvageCheckUsability.js',
  'src/utils/checkModifierPicks.js',
  'src/systems/toolCheckBonus.js',
  'src/utils/craftingCheckExpression.js',
  // Issue 1118: the resolver ranks a rolling modifier by the deterministic average this
  // import-free leaf computes, and the same walk is what tells it a modifier rolls at all.
  'src/utils/rollExpressionAverage.js',
  'src/utils/routedOutcomeKeywords.js',
  // Issue 1098: `routedOutcomeKeywords.js` now reads the failure-result policy to decide
  // which outcome tiers a result-authoring control may offer, so this leaf joins the
  // closure with it.
  'src/utils/failureResultPolicy.js',
  // The formula field's quick-add chips are DERIVED from the active world through this
  // module rather than hard-coded (issue 1096), so the whole checks tree now imports it.
  'src/config/modifierExpressionSuggestions.js',
  'src/config/gatheringCharacterModifierPresets.js',
  // The outcome simulator and the odds enumerator (issue 1097), plus the engine modules
  // they drive. `checkPreview.js` calls the SAME three runners the engines call and
  // `checkOdds.js` buckets through the SAME classifier `runFormulaRouted` uses, so
  // `checkRoll.js` — and its own `toolBreakageRuntime.js` condition evaluator and the
  // shared `progressiveAward.js` loop — are genuinely in the checks tree's import graph
  // now rather than being defensive entries.
  'src/ui/svelte/apps/manager/checks/checkPreview.js',
  'src/ui/svelte/apps/manager/checks/checkOdds.js',
  'src/systems/checkRoll.js',
  'src/systems/bulkChatVisibility.js',
  'src/utils/progressiveAward.js',
  // The progressive PREVIEW SANDBOX derivation (issue 1097). BOTH halves of the checks tree
  // import it — `ChecksView` to read and write the order, `ChecksRightMenu` to keep the
  // field's own text in step with it — and it lives under `src/systems/` because the
  // persistence normalizer and the manager root's draft clone share the same derivation.
  'src/systems/progressiveCheckSandbox.js',
  // `checkRoll.js` evaluates a trigger's condition through the shared breakage evaluator,
  // and that module's own closure is the rest of this block. Eight modules for one
  // evaluator reads like over-filling; it is not, and the check is mechanical — drop any
  // one of them and the checks suites HANG rather than fail.
  'src/toolBreakageRuntime.js',
  // Issue 1363 (epic 1357, PR 3): `toolBreakageRuntime.js` now resolves the EFFECTIVE
  // tool-breakage authority through the world scope rather than re-defaulting locally, so its
  // closure gains the resolver and the two pure scope modules underneath it. Mechanical, like
  // every entry in this block: drop one and the suite HANGS rather than fails.
  'src/systems/toolBreakageAuthority.js',
  'src/systems/toolScope.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
  // Issue 1370 (epic 1357, PR 8a): `toolBreakageRuntime.js` now reads the system's TOOL LIBRARY
  // through the shared read seam as well, so the closure gains the seam and the two scope
  // modules its sibling exports need. `scopedDefinitionStore.js` gained the migration module's
  // lifted-identity field list, which is the one definition of that list in the tree. Same
  // mechanical rule as the rest of this block: drop one and the suite HANGS rather than fails.
  'src/systems/scopedEntityReads.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/migration/worldScopeEntityGrouping.js',
  'src/utils/definitionIndex.js',
  'src/utils/sourceReferenceUnion.js',
  'src/config/flags.js',
  'src/config/stackQuantityPathPresets.js',
  'src/models/Ingredient.js',
  // Ingredient filters its payload through the shared omitted-when-default machinery
  // (issue 1135) — mechanical, like every other entry in this block.
  'src/models/reconstructibleDefaults.js',
  'src/models/IngredientGroup.js',
  'src/models/Tool.js',
  'src/models/match/matchTypes.js',
  'src/systems/itemStackQuantity.js',
  'src/utils/objectPath.js',
  // The shared, GM-configurable player-character predicate (issue 1024). The rail's
  // "Preview as" list is filtered by it — a crafting check is previewed against a
  // CHARACTER, and an unfiltered world roster is mostly bestiary — and `checkPreview.js`
  // imports it directly. It is an import-free leaf, so this single entry closes the graph.
  'src/config/playerCharacterTypes.js',
]);

/**
 * Every `.svelte` module in the checks editor tree, plus the shared primitives those
 * components render.
 * @type {ReadonlyArray<string>}
 */
export const CHECKS_TREE_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/IconPicker.svelte',
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  // `SelectionCheckbox` and `StatusPill` left this closure with issue 1096's parity round: the
  // modifier row's eligibility control was a checkbox plus an inert pill, and it is now ONE
  // `aria-pressed` toggle button that the card renders itself. Nothing else in the checks tree
  // reached for either. They are dropped rather than kept "in case", because a manifest that
  // names modules the tree does not import is the drift this file exists to stop; the validator
  // reports a MISSING module loudly, so re-adding one is a one-line fix if a tree grows back
  // into it.
  'src/ui/svelte/components/FillBar.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/RowDisclosure.svelte',
  'src/ui/svelte/components/ThresholdBandStrip.svelte',
  'src/ui/svelte/components/Stepper.svelte',
  // The shared button primitive. Every list in the studio is extended by the prototype's
  // full-width dashed control, which is this primitive's `dashed` role (issue 1096).
  'src/ui/svelte/components/ManagerButton.svelte',
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/manager/Chip.svelte',
  'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/InspectorActionButton.svelte',
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  'src/ui/svelte/apps/manager/RadioCardGroup.svelte',
  'src/ui/svelte/apps/manager/RollDataExpressionInput.svelte',
  // The manager's ONE searchable picker. The rail's "Preview as" actor control renders
  // through it rather than through a native `<select>`, so every checks suite that mounts
  // the rail compiles it — omit it and those suites HANG (`# cancelled`), they do not fail.
  // Its own closure (`Chip`, `EmptyState`, `iconPickerPopover.js`, `dismissOnOutsideClick.js`,
  // `portal.js`) is already declared here for other reasons.
  'src/ui/svelte/apps/manager/SearchablePopover.svelte',
  'src/ui/svelte/apps/manager/ToggleCard.svelte',
  // The On-failure section's failure-result policy card (issue 1098), rendered by all
  // three activity routes and by the alchemy branch through one snippet in `ChecksView`.
  'src/ui/svelte/apps/manager/checks/CheckFailurePolicy.svelte',
  'src/ui/svelte/apps/manager/checks/CheckOddsPanel.svelte',
  'src/ui/svelte/apps/manager/checks/CheckOutcomePreview.svelte',
  'src/ui/svelte/apps/manager/checks/ChecksEditorTabs.svelte',
  'src/ui/svelte/apps/manager/checks/ChecksRightMenu.svelte',
  'src/ui/svelte/apps/manager/checks/ChecksValidationTab.svelte',
  'src/ui/svelte/apps/manager/checks/CraftingModifierCatalogueCard.svelte',
]);

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

import { COMPONENT_SCOPE_LEAF_MODULES } from './componentScopeMountModules.js';

/**
 * Raw (uncompiled) modules the harness copies into the temp tree verbatim.
 *
 * A missing entry HANGS the suite rather than failing it, so the shared harness validator
 * throws for it up front.
 */
export const COMPONENT_EDIT_VIEW_RAW_MODULES = Object.freeze([
  // THE COMPONENT SCOPE LEAVES, spread from their own tier rather than restated (issue 1371,
  // round 3). Four manifests carried this list verbatim; see `COMPONENT_SCOPE_LEAF_MODULES`.
  ...COMPONENT_SCOPE_LEAF_MODULES,
  // The SHARED subject check-modifier picker's resolver (issue 1095): it asks what an
  // ABSENT `maxModifierPicks` means rather than coercing it. These four close its graph.
  'src/systems/characterLibraries.js',
  'src/systems/checkModifierResolver.js',
  'src/systems/salvageCheckUsability.js',
  'src/utils/checkModifierPicks.js',
  'src/systems/toolCheckBonus.js',
  'src/utils/craftingCheckExpression.js',
  'src/utils/rollExpressionAverage.js',
  'src/utils/rollFormulaRollability.js',
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/util/listReorderAnnouncement.js',
  // The ONE derivation of a `<Stepper>`'s three accessible names from its field label
  // (issue 1050); `ComponentEditView` reaches it through the salvage quantity and DC fields.
  'src/ui/svelte/components/stepperLabels.js',
  'src/ui/svelte/util/componentEditor.js',
  // The add-new essence offer projection (issue 1036); ComponentEditView imports it to
  // withhold a disabled essence from the quantity grid.
  'src/utils/essenceValidation.js',
  // The component category vocabulary (issue 676) is imported by ComponentEditView too, and is
  // no longer restated here: issue 1392 put it in `COMPONENT_SCOPE_LEAF_MODULES` above, because
  // `worldVocabulary.js` asks it whether a name is the general bucket and every tree spreading
  // that tier now needs it.
  // The salvage DC control's pure option model (issue 676). Import-free leaf.
  'src/ui/svelte/apps/manager/component/salvageDcPresets.js',
  // The salvage mode pill's label source (issue 676) — it already carries 'Routed by
  // check' for the persisted 'routed' token. Import-free leaf.
  'src/ui/svelte/apps/manager/resolutionModeOptions.js',
  'src/ui/svelte/actions/dismissOnOutsideClick.js',
  // The identity strip's drop target + its portaled overflow menu (issue 676).
  'src/ui/svelte/actions/dragDrop.js',
  'src/ui/svelte/actions/portal.js',
  'src/ui/svelte/actions/anchoredPopover.js',
  'src/ui/svelte/util/overlayBounds.js',
  'src/ui/svelte/util/iconPickerPopover.js',
  // `ActionMenu`'s own placement helper (issue 1477). Separate from `iconPickerPopover.js`
  // because a picker's layout DECIDES the panel width while an overflow menu's width is its
  // longest verb — the identity strip's overflow reaches this one.
  'src/ui/svelte/util/actionMenuLayout.js',
  'src/ui/svelte/util/overlayHost.js',
  // The complications section (issue 1286). Four leaves, each reached only through it:
  // the persisted vocabulary it seeds a new complication from, the ONE localized trigger
  // sentence it renders in the summary row, the operator table it filters the six numeric
  // comparators out of, and the macro link/drop pair the effect card uses.
  // `complicationSummary.js` imports `characterPrerequisites.js` for the operator GLYPH, so
  // the two travel together; the rest are import-free leaves and one entry each suffices.
  'src/utils/componentComplications.js',
  'src/utils/complicationSummary.js',
  'src/systems/characterPrerequisites.js',
  'src/utils/macroReference.js',
  // `ItemDropZone`'s payload resolver — it covers BOTH shipped drag shapes, so the macro
  // drop and the identity strip's item drop read one implementation.
  'src/ui/svelte/util/dropUtils.js',
  // The rules editor's own Validation tab model (issue 1371, parity round 4). It validates ONE
  // SYSTEM'S rules — the essence contribution, the salvage results, the routing and the
  // progressive DC — where `componentScopeValidation.js` validates the WORLD record, so the two
  // are separate modules and both are in this tree's static graph.
  'src/ui/svelte/apps/manager/component/componentRulesValidation.js',
]);

/**
 * `.svelte` modules the harness compiles.
 *
 * The component under test is listed here too: the harness imports `componentPath` from the
 * temp tree but only compiles what this names. A `.svelte` the tree RENDERS but this list
 * omits does not fail — it HANGS, and is reported as `# cancelled`, never `# fail`.
 */
export const COMPONENT_EDIT_VIEW_COMPILED_MODULES = Object.freeze([
  // The catalogue ATTRIBUTION BANNER and the shared inherit row (issue 1371), both composed by
  // the two system-scope component screens.
  'src/ui/svelte/apps/manager/scoped/SharedDefinitionCallout.svelte',
  'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/StatusPill.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
  // The manager's ONE chip (issue 883).
  'src/ui/svelte/apps/manager/Chip.svelte',
  // The manager's ONE icon-only push-button (issue 1422). `ComponentEditView` renders three
  // of them for the salvage editor's removes, and `ItemDropZone` and `ComplicationSummaryRow`
  // each render more, so every tree built on this list reaches it by several routes.
  'src/ui/svelte/components/IconButton.svelte',
  // The shared no-state primitive (issue 785).
  'src/ui/svelte/apps/manager/EmptyState.svelte',
  // Rendered by the salvage block.
  'src/ui/svelte/apps/manager/ToggleCard.svelte',
  'src/ui/svelte/components/SearchablePopover.svelte',
  // The salvage result quantity + the progressive DC are the shared Stepper (issue 676).
  // Import-free leaf, so it needs no `rawModules` entry — but omit it HERE and the suite
  // hangs.
  'src/ui/svelte/components/Stepper.svelte',
  // The shared essence quantity card (issue 772). `ComponentEditView` renders it after the
  // extraction, so it is in this tree's static import closure whether or not a given test
  // turns the essences section on.
  'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
  // THE shared overflow action menu (issue 1477), which the identity strip below renders for
  // its source commands. It replaced `SearchablePopover` at that site — the picker was
  // announcing two commands as selectable options — and it is a leaf TWO rungs down from this
  // tree's root, so omitting it HANGS every suite built on this list.
  'src/ui/svelte/components/ActionMenu.svelte',
  'src/ui/svelte/apps/manager/component/ComponentIdentityStrip.svelte',
  // The SHARED subject check-modifier picker (issue 1095), rendered inside the salvage
  // block. A `.svelte` the tree renders but this list omits HANGS the suite.
  'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/Field.svelte',
  // The manager's ONE labelled push-button (issue 1096); every salvage add control and
  // the Manage presets link render through it since issue 1118 task 9.
  'src/ui/svelte/components/ManagerButton.svelte',
  // The manager's ONE on/off switch (issue 1040). Reached twice over: the salvage gate
  // renders it directly, and `ToggleCard` above renders it too.
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  // The complications section and its two shared rows (issue 1286). `ComponentEditView`
  // imports the section STATICALLY, so all four are in this tree's module closure whether
  // or not a given test turns the section on — and an omission HANGS the suite (# cancelled)
  // rather than failing it.
  // The severity picker and the Any/All match control are the shared segmented track.
  'src/ui/svelte/apps/manager/SegmentedControl.svelte',
  'src/ui/svelte/apps/manager/ComplicationEffectRow.svelte',
  'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
  'src/ui/svelte/apps/manager/ItemDropZone.svelte',
  // The product's ONE row disclosure, back in a shipped tree: `ComplicationSummaryRow` is
  // the summary row its own docblock named as the site that would adopt it.
  'src/ui/svelte/components/RowDisclosure.svelte',
  'src/ui/svelte/apps/manager/component/ComponentComplicationsSection.svelte',
  // THE PART D REBUILD'S FOUR NEW LEAVES (issue 1371, parity round 4). The editor grew a two-tab
  // strip, the Validation tab's shared surface, the roll-budget `Callout` and the
  // `How players see it` rail — and the rail brings two leaves of its own. Every one is a STATIC
  // import of `ComponentEditView`, so an omission here HANGS every suite built on this list and
  // is reported as `# cancelled` rather than `# fail`.
  'src/ui/svelte/apps/manager/EditorTabs.svelte',
  'src/ui/svelte/apps/manager/EditorValidationSurface.svelte',
  'src/ui/svelte/apps/manager/Callout.svelte',
  'src/ui/svelte/apps/manager/ExplainerCard.svelte',
  // `ExplainerCard`'s own card shell, two rungs down from this tree's root.
  'src/ui/svelte/components/InspectorCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/scoped/ScopedEntityPreview.svelte',
  'src/ui/svelte/apps/manager/ComponentEditView.svelte',
]);

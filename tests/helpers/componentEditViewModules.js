/** The mount-harness module closure of `ComponentEditView.svelte`. */

import { resolve } from 'node:path';

import { COMPONENT_SCOPE_LEAF_MODULES } from './componentScopeMountModules.js';
import { FOUNDRY_BRIDGE_RAW_MODULES, LOCALIZE_OR_RAW_MODULES } from './foundryBridgeModules.js';
import {
  CHECK_TARGET_RAW_MODULES,
  createMountedComponentHarness,
  RESULT_ROW_COMPILED_MODULES,
  RESULT_ROW_RAW_MODULES,
  TYPEAHEAD_RUNE_MODULES,
} from './svelte-component-harness.js';

/** Raw (uncompiled) modules the harness copies into the temp tree verbatim. */
export const COMPONENT_EDIT_VIEW_RAW_MODULES = Object.freeze([
  // THE COMPONENT SCOPE LEAVES, spread from their own tier rather than restated (issue 1371,
  // round 3). Four manifests carried this list verbatim; see `COMPONENT_SCOPE_LEAF_MODULES`.
  ...COMPONENT_SCOPE_LEAF_MODULES,
  // The SHARED subject check-modifier picker's resolver (issue 1095): it asks what an
  // ABSENT `maxModifierPicks` means rather than coercing it. These four close its graph.
  'src/systems/characterLibraries.js',
  'src/systems/checkModifierResolver.js',
  'src/systems/checkModifierRouter.js',
  'src/systems/salvageCheckUsability.js',
  'src/utils/checkModifierPicks.js',
  'src/systems/toolCheckBonus.js',
  'src/utils/craftingCheckExpression.js',
  'src/utils/rollExpressionAverage.js',
  'src/utils/rollFormulaRollability.js',
  ...FOUNDRY_BRIDGE_RAW_MODULES,
  ...LOCALIZE_OR_RAW_MODULES,
  'src/ui/svelte/util/listReorderAnnouncement.js',
  // The ONE derivation of a `<Stepper>`'s three accessible names from its field label
  // (issue 1050); the tree reaches it through the salvage check override's custom field.
  'src/ui/svelte/components/stepperLabels.js',
  'src/ui/svelte/util/componentEditor.js',
  // The add-new essence offer projection (issue 1036); ComponentEditView imports it to
  // withhold a disabled essence from the quantity grid.
  'src/ui/model/essenceValidation.js',
  // The component category vocabulary (issue 676) is imported by ComponentEditView too, and is no
  // longer restated here: issue 1392 put it in `COMPONENT_SCOPE_LEAF_MODULES` above, because
  // `worldVocabulary.js` asks it whether a name is the general bucket and every tree spreading that
  // tier now needs it.
  'src/ui/svelte/apps/manager/component/salvageDcPresets.js',
  // The salvage check override (issue 2005): the target resolver for its Player sees line, the
  // adjustment labels its formatted Stepper reads, and the comparison word.
  ...CHECK_TARGET_RAW_MODULES,
  'src/utils/scalars.js',
  'src/ui/svelte/apps/manager/checks/checkAdjustmentLabel.js',
  'src/utils/checkAdjustmentFormat.js',
  'src/ui/svelte/apps/manager/checks/checksCopy.js',
  'src/ui/svelte/apps/manager/checks/previewActorId.js',
  'src/ui/svelte/apps/manager/component/overridePlayerSees.js',
  // A count check's override line reads the required count and the pool description (issue 2006).
  'src/systems/countCheck.js',
  'src/systems/countEvaluation.js',
  // The three converted selects' option vocabularies (issue 1510), mapped beside the view.
  'src/ui/svelte/apps/manager/component/componentEditSelectOptions.js',
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
  'src/ui/svelte/util/listboxNavigation.js',
  'src/ui/svelte/util/pickerOptionModel.js',
  // `ActionMenu`'s own placement helper (issue 1477).
  'src/ui/svelte/util/actionMenuLayout.js',
  'src/ui/svelte/util/overlayHost.js',
  // The complications section (issue 1286).
  'src/utils/componentComplications.js',
  'src/ui/model/complicationSummary.js',
  'src/systems/characterPrerequisites.js',
  'src/ui/model/macroReference.js',
  // `ItemDropZone`'s payload resolver — it covers BOTH shipped drag shapes, so the macro
  // drop and the identity strip's item drop read one implementation.
  'src/ui/svelte/util/dropUtils.js',
  // The rules editor's own Validation tab model (issue 1371, parity round 4).
  'src/ui/svelte/apps/manager/component/componentRulesValidation.js',
  // Both salvage result rows are the requirement row (issue 1516), whose search is a typeahead.
  ...RESULT_ROW_RAW_MODULES,
  'src/ui/svelte/actions/typeaheadPanel.js',
]);

/** Rune modules the harness compiles: the requirement row's typeahead. */
export { TYPEAHEAD_RUNE_MODULES as COMPONENT_EDIT_VIEW_RUNE_MODULES } from './svelte-component-harness.js';

/** `.svelte` modules the harness compiles. */
export const COMPONENT_EDIT_VIEW_COMPILED_MODULES = Object.freeze([
  // The catalogue ATTRIBUTION BANNER and the shared inherit row (issue 1371), both composed by
  // the two system-scope component screens.
  'src/ui/svelte/apps/manager/scoped/SharedDefinitionCallout.svelte',
  'src/ui/svelte/apps/manager/scoped/InheritRow.svelte',
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/Button.svelte',
  // The manager's ONE chip (issue 883).
  'src/ui/svelte/components/Chip.svelte',
  // The manager's ONE icon-only push-button (issue 1422).
  'src/ui/svelte/components/IconButton.svelte',
  // The shared no-state primitive (issue 785).
  'src/ui/svelte/components/EmptyState.svelte',
  // Rendered by the salvage block.
  'src/ui/svelte/components/ToggleCard.svelte',
  'src/ui/svelte/components/SearchablePopover.svelte',
    'src/ui/svelte/components/SearchablePopoverPanel.svelte',
  // THE SHARED ONE-OF-N PICKER (issue 1510). The category card, the outcome-routing rows, the
  // salvage DC presets and the complications section's two clause controls all render it, and a
  // `.svelte` the tree renders but this list omits HANGS the suite (# cancelled) rather than
  // failing it — so this one entry is what keeps six suites alive.
  'src/ui/svelte/components/Select.svelte',
  // The salvage result quantity + the progressive DC are the shared Stepper (issue 676).
  // Import-free leaf, so it needs no `rawModules` entry — but omit it HERE and the suite hangs.
  'src/ui/svelte/components/Stepper.svelte',
  // The shared essence quantity card (issue 772).
  'src/ui/svelte/apps/manager/components/EssenceQuantityCard.svelte',
  // THE shared overflow action menu (issue 1477), which the identity strip below renders for its
  // source commands.
  'src/ui/svelte/components/ActionMenu.svelte',
  'src/ui/svelte/apps/manager/component/ComponentIdentityStrip.svelte',
  // The SHARED subject check-modifier picker (issue 1095), rendered inside the salvage
  // block. A `.svelte` the tree renders but this list omits HANGS the suite.
  'src/ui/svelte/apps/manager/SubjectModifierPicker.svelte',
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/Field.svelte',
  // The manager's ONE labelled push-button (issue 1096); every salvage add control and
  // the Manage presets link render through it since issue 1118 task 9.
  'src/ui/svelte/components/Button.svelte',
  // The manager's ONE on/off switch (issue 1040). Reached twice over: the salvage gate
  // renders it directly, and `ToggleCard` above renders it too.
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/components/ModifierPillSelect.svelte',
  // The complications section and its two shared rows (issue 1286).
  'src/ui/svelte/components/SegmentedControl.svelte',
  'src/ui/svelte/apps/manager/ComplicationEffectRow.svelte',
  'src/ui/svelte/apps/manager/ComplicationSummaryRow.svelte',
  'src/ui/svelte/components/ItemDropZone.svelte',
  // The product's ONE row disclosure, back in a shipped tree: `ComplicationSummaryRow` is
  // the summary row its own docblock named as the site that would adopt it.
  'src/ui/svelte/components/RowDisclosure.svelte',
  // The product's ONE ordered list (issue 1512): the progressive salvage stage list renders it.
  'src/ui/svelte/components/SortableList.svelte',
  'src/ui/svelte/apps/manager/component/ComponentComplicationsSection.svelte',
  // THE PART D REBUILD'S FOUR NEW LEAVES (issue 1371, parity round 4).
  'src/ui/svelte/components/EditorTabs.svelte',
  'src/ui/svelte/components/EditorValidationSurface.svelte',
  'src/ui/svelte/components/Callout.svelte',
  'src/ui/svelte/components/InspectorCard.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/scoped/ScopedEntityPreview.svelte',
  // THE WORLD ENTRY'S OWN RAIL (issue 1371 r18-list, maintainer ruling M27).
  'src/ui/svelte/apps/manager/scoped/WorldComponentEntryPreviewRail.svelte',
  // THE RAIL'S ESSENCE RUN (issue 1371 r18-entry, maintainer ruling M31) is the shared essence chip
  // (M29), a static import of the rail and so two rungs down from this tree's root.
  'src/ui/svelte/apps/manager/components/EssenceChip.svelte',
  // The salvage check override (issue 2005) and the notice it names a kept override with.
  'src/ui/svelte/components/Notice.svelte',
  // Its Player sees block and the Checks Studio's own Preview-as picker it reuses.
  'src/ui/svelte/apps/manager/checks/PreviewAsPicker.svelte',
  'src/ui/svelte/components/Kicker.svelte',
  'src/ui/svelte/apps/manager/component/OverridePlayerSees.svelte',
  'src/ui/svelte/apps/manager/component/CheckOverrideField.svelte',
  ...RESULT_ROW_COMPILED_MODULES,
  // The rules editor's cards and Validation tab (issue 1522).
  'src/ui/svelte/apps/manager/component/ComponentCategoryTagsCards.svelte',
  'src/ui/svelte/apps/manager/component/ComponentDifficultyCard.svelte',
  'src/ui/svelte/apps/manager/component/ComponentEssencesCard.svelte',
  'src/ui/svelte/apps/manager/component/ComponentSalvageStages.svelte',
  'src/ui/svelte/apps/manager/component/ComponentSalvageCard.svelte',
  'src/ui/svelte/apps/manager/component/ComponentRulesValidationTab.svelte',
  'src/ui/svelte/apps/manager/ComponentEditView.svelte',
]);

/** A mount harness for one of the editor's cards under `component/` (issue 1522). */
export function componentCardHarness(name) {
  return createMountedComponentHarness({
    repoRoot: resolve(import.meta.dirname, '../..'),
    tmpPrefix: `fabricate-${name}-`,
    rawModules: COMPONENT_EDIT_VIEW_RAW_MODULES,
    runeModules: TYPEAHEAD_RUNE_MODULES,
    compiledModules: [...COMPONENT_EDIT_VIEW_COMPILED_MODULES],
    componentPath: `src/ui/svelte/apps/manager/component/${name}.svelte`,
  });
}

/** The fallback-only `text` and interpolating `format` a card takes from its host. */
export const cardText = (_key, fallback) => fallback;
export const cardFormat = (_key, fallback, data) =>
  Object.entries(data ?? {}).reduce(
    (result, [token, value]) => result.replaceAll(`{${token}}`, String(value)),
    fallback
  );

/** A call log, and callbacks that append `[name, ...args]` to it. */
export function callRecorder() {
  const calls = [];
  const record =
    (name) =>
    (...args) => {
      calls.push([name, ...args]);
    };
  return { calls, record };
}

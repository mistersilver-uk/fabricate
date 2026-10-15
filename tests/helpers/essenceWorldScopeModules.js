/** The dependency manifest the mounted world ESSENCE suites compile against (issue 1372). */
import { FOUNDRY_BRIDGE_RAW_MODULES, LOCALIZE_OR_RAW_MODULES } from './foundryBridgeModules.js';
import {
  SEARCHABLE_POPOVER_RAW_MODULES,
  STATUS_TONE_RAW_MODULES,
} from './svelte-component-harness.js';

export const ESSENCE_WORLD_SCOPE_RAW_MODULES = Object.freeze([
  // Issue 1506: the one tone map the converted status pills read at a dynamic site.
  ...STATUS_TONE_RAW_MODULES,
  // Issue 1504: the raw closure the shared `<Select>` reaches through `SearchablePopover`.
  ...SEARCHABLE_POPOVER_RAW_MODULES,
  ...FOUNDRY_BRIDGE_RAW_MODULES,
  ...LOCALIZE_OR_RAW_MODULES,
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/apps/manager/scoped/essenceScoped.js',
  'src/ui/svelte/apps/manager/scoped/componentScoped.js',
  'src/ui/svelte/apps/manager/scoped/componentCategoryFilter.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  // Issue 1392 (epic 1357, PR 7a): `worldScopeProjection.js` counts the World Vocabulary's
  // per-entry references now, so its own static closure reaches the vocabulary core and the
  // shipped counter. The harness validates this closure and names the miss, unlike the
  // hand-rolled trees elsewhere.
  'src/systems/worldVocabulary.js',
  'src/ui/model/vocabularyUsage.js',
  'src/utils/componentCategories.js',
  // #1663: the ONE implementation behind both category shims; imports nothing.
  'src/utils/categoryNormalization.js',
  'src/utils/recipeCategories.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/toolScope.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/scopedDefinitionStore.js',
  'src/utils/scalars.js',
  'src/systems/worldScopeEntityGrouping.js',
  'src/utils/definitionIndex.js',
  'src/utils/sourceReferenceUnion.js',
  'src/ui/model/browserPagination.js',
  'src/utils/bulkSelectionModel.js',
  'src/ui/model/scopedEntityListModel.js',
  // The frame's lifted view-state (issue 1438).
  'src/ui/model/managerBrowserViewState.js',
]);

export const ESSENCE_WORLD_SHELL_MODULES = Object.freeze([
  'src/ui/svelte/components/Callout.svelte',
  'src/ui/svelte/apps/manager/BulkSelectionToolbar.svelte',
  'src/ui/svelte/components/ArmedDangerButton.svelte',
  // THE manager's icon-only push-button (issue 1422). Not mounted directly by anything here:
  'src/ui/svelte/components/IconButton.svelte',
  'src/ui/svelte/components/Medallion.svelte',
  'src/ui/svelte/components/Pagination.svelte',
  // Select's own compiled closure (issue 1504) is spread beside this list wherever it is used
  // (`...ESSENCE_WORLD_SHELL_MODULES, ...SELECT_COMPILED_MODULES`), not folded in here: `Pagination` and the
  // frame below both render it now, so it and `SearchablePopover` are transitive dependencies of
  // this shell rather than new controls on these screens.
  'src/ui/svelte/components/SelectionCheckbox.svelte',
  'src/ui/svelte/components/SearchField.svelte',
  'src/ui/svelte/components/FilterBar.svelte',
  // THE manager's on/off switch (issue 1040). Not mounted directly by anything here.
  'src/ui/svelte/components/StatusToggle.svelte',
  'src/ui/svelte/apps/manager/scoped/EntityListInspectorFrame.svelte',
  // Its scroller's scroll-edge fade tracker (issue 2498).
  'src/ui/svelte/apps/manager/InspectorPanel.svelte',
  // THE SHARED FRAME'S MEMBERSHIP FILTER IS A SEGMENTED TRACK SINCE ISSUE 1373.
  'src/ui/svelte/components/SegmentedControl.svelte',
  'src/ui/svelte/apps/manager/scoped/MembershipActions.svelte',
  // The extracted `SYSTEM RULES n / m` panel (issue 1372). A rendered child missing from this
  // list does not fail — it HANGS, and `node --test` reports the blocked tests as `# cancelled`.
  'src/ui/svelte/apps/manager/scoped/SystemRulesRoster.svelte',
  // The world-default cards render through the fact row (issue 1521).
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/apps/manager/scoped/EntityCatalogueShell.svelte',
]);

/** The catalogue page's bulk face (issue 2485): its panel, the bulk chrome and both pickers. */
export const ESSENCE_CATALOGUE_BULK_RAW_MODULES = Object.freeze([
  'src/ui/model/essenceBulkEditModel.js',
  'src/ui/svelte/util/essenceIcons.js',
  'src/ui/svelte/util/foundryIconVocabulary.js',
  'src/ui/svelte/util/foundryIconCatalogue.js',
  'src/ui/svelte/util/foundryIconCatalogue.json',
  'src/ui/svelte/util/managerColorTokens.js',
]);

export const ESSENCE_CATALOGUE_BULK_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/apps/manager/BulkEditPanelShell.svelte',
  'src/ui/svelte/components/Notice.svelte',
  'src/ui/svelte/apps/manager/BulkEditSection.svelte',
  'src/ui/svelte/components/IconPicker.svelte',
  'src/ui/svelte/components/TintPicker.svelte',
  'src/ui/svelte/apps/manager/scoped/EssenceCatalogueBulkPanel.svelte',
]);

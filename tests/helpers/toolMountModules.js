/** The dependency manifest the mounted TOOL suites compile against (issue 1373, epic 1357). */

/** The Tool model closure, declared by every mounted tool suite (issue 1119). */
export const TOOL_TREE_RAW_MODULES = Object.freeze([
  'src/config/flags.js',
  'src/models/Ingredient.js',
  'src/models/IngredientGroup.js',
  'src/models/Tool.js',
  'src/models/match/matchTypes.js',
  'src/models/reconstructibleDefaults.js',
  'src/models/toolDisplay.js',
  'src/ui/svelte/apps/manager/tools/toolStudio.js',
  // The repair block's plain-language readback (issue 1373, maintainer round 5).
  'src/ui/svelte/apps/manager/tools/toolRepairSummary.js',
  // The ONE ingredient-kind table (issue 1373, round 8).
  'src/ui/svelte/apps/manager/recipe/ingredientKindMeta.js',
  'src/ui/svelte/util/foundryBridge.js',
  'src/ui/svelte/util/overlayHost.js',
  // The one tone map the converted status chips read (issue 1506).
  'src/ui/svelte/util/statusChipTone.js',
]);

/** The `.svelte` primitives every mounted tool tree renders (issue 883). */
export const TOOL_TREE_COMPILED_MODULES = Object.freeze([
  'src/ui/svelte/components/Chip.svelte',
  'src/ui/svelte/apps/manager/IconFactRow.svelte',
  'src/ui/svelte/components/ManagerButton.svelte',
]);

/** The WORLD SCOPE closure, spread on top of `TOOL_TREE_RAW_MODULES`. */
export const WORLD_TOOL_SCOPE_RAW_MODULES = Object.freeze([
  'src/migration/worldScopeEntityGrouping.js',
  'src/systems/componentScope.js',
  'src/systems/essenceScope.js',
  'src/systems/scopedDefinitionStore.js',
  'src/utils/scalars.js',
  'src/systems/scopedDefinitions.js',
  'src/systems/toolScope.js',
  'src/ui/svelte/apps/manager/scoped/scopedStudio.js',
  'src/ui/svelte/apps/manager/scoped/worldToolStudio.js',
  'src/ui/svelte/stores/worldScopeProjection.js',
  // Issue 1392 (epic 1357, PR 7a): `worldScopeProjection.js` counts the World Vocabulary's
  // per-entry references now, so its own static closure reaches the vocabulary core and the shipped
  // counter.
  'src/systems/worldVocabulary.js',
  'src/ui/model/vocabularyUsage.js',
  'src/utils/componentCategories.js',
  // #1663: the ONE implementation behind both category shims; imports nothing.
  'src/utils/categoryNormalization.js',
  'src/utils/recipeCategories.js',
  // The shared list frame's LIFTED VIEW-STATE (issue 1438), reached through `EntityCatalogueShell`
  // -> `EntityListInspectorFrame`.
  'src/ui/model/managerBrowserViewState.js',
]);

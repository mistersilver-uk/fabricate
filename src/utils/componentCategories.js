/**
 * Component category vocabulary (issue 676), re-exported from the shared implementation (#1663).
 *
 * WHAT IS SHARED AND WHAT IS NOT: the helpers below are ONE implementation in
 * `categoryNormalization.js`, because the component and recipe copies were identical modulo the
 * entity word. The VOCABULARIES are not shared and must not be — `CraftingSystem.componentCategories`
 * and `CraftingSystem.categories` are separate stored keys with separate call sites, and the
 * data-models spec requires they never be merged, aliased or cross-populated. A shared total
 * function over a string is not a shared list.
 *
 * This module is a re-export binding and nothing else; `tests/category-shim-bindings.test.js`
 * proves it, and proves each name resolves to the SAME object as its original rather than to a
 * behavioural twin.
 *
 * The names below are the PERMANENT public surface: `DOMAIN.md`'s Canonical Mapping cites this
 * path, and `component category` is the ubiquitous language. This is not a bridge to be collapsed
 * into its importers later.
 */
export {
  GENERAL_CATEGORY_NAME as GENERAL_COMPONENT_CATEGORY,
  getCategoryLabel as getComponentCategoryLabel,
  getEffectiveCategoryNames as getEffectiveComponentCategories,
  isGeneralCategoryName as isGeneralComponentCategory,
  normalizeCategoryName as normalizeComponentCategory,
  normalizeCustomCategoryNames as normalizeCustomComponentCategories,
} from './categoryNormalization.js';

/**
 * Component category vocabulary (issue 676), re-exported from the shared implementation (#1663).
 */
export {
  GENERAL_CATEGORY_NAME as GENERAL_COMPONENT_CATEGORY,
  getCategoryLabel as getComponentCategoryLabel,
  getEffectiveCategoryNames as getEffectiveComponentCategories,
  isGeneralCategoryName as isGeneralComponentCategory,
  normalizeCategoryName as normalizeComponentCategory,
  normalizeCustomCategoryNames as normalizeCustomComponentCategories,
} from './categoryNormalization.js';

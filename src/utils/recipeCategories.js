/** Recipe category vocabulary (issue 676), re-exported from the shared implementation (#1663). */
export {
  GENERAL_CATEGORY_NAME as GENERAL_RECIPE_CATEGORY,
  getCategoryLabel as getRecipeCategoryLabel,
  getEffectiveCategoryNames as getEffectiveRecipeCategories,
  isGeneralCategoryName as isGeneralRecipeCategory,
  normalizeCategoryName as normalizeRecipeCategory,
  normalizeCustomCategoryNames as normalizeCustomRecipeCategories,
} from './categoryNormalization.js';

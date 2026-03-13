export const GENERAL_RECIPE_CATEGORY = 'general';

export function isGeneralRecipeCategory(category) {
  return typeof category === 'string' && category.trim().toLowerCase() === GENERAL_RECIPE_CATEGORY;
}

export function normalizeRecipeCategory(category) {
  if (typeof category !== 'string') return GENERAL_RECIPE_CATEGORY;
  const trimmed = category.trim();
  if (!trimmed) return GENERAL_RECIPE_CATEGORY;
  return isGeneralRecipeCategory(trimmed) ? GENERAL_RECIPE_CATEGORY : trimmed;
}

export function normalizeCustomRecipeCategories(categories) {
  if (!Array.isArray(categories)) return [];

  const normalized = [];
  const seen = new Set();

  for (const category of categories) {
    const normalizedCategory = normalizeRecipeCategory(category);
    if (normalizedCategory === GENERAL_RECIPE_CATEGORY || seen.has(normalizedCategory)) continue;
    seen.add(normalizedCategory);
    normalized.push(normalizedCategory);
  }

  return normalized;
}

export function getEffectiveRecipeCategories(categories) {
  return [GENERAL_RECIPE_CATEGORY, ...normalizeCustomRecipeCategories(categories)];
}

export function getRecipeCategoryLabel(category, localize = null) {
  const normalized = normalizeRecipeCategory(category);
  if (normalized !== GENERAL_RECIPE_CATEGORY) return normalized;
  return typeof localize === 'function' ? localize('FABRICATE.Common.General') : 'General';
}

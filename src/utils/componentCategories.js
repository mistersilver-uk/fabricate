/**
 * Component category vocabulary (issue 676).
 *
 * A one-for-one SIBLING of `recipeCategories.js`, deliberately NOT a reuse of it.
 * The two taxonomies are independent by design: component categories (`Reagent`,
 * `Metal`, `Herb`) must never leak into the Recipe Studio's category filter or the
 * player-facing `RecipeListingModel.category` filter, and recipe categories must
 * never be offered as component categories. Merging, aliasing, or cross-populating
 * them is forbidden by canonical spec (`data-models` → CraftingSystem).
 *
 * Two properties are load-bearing and copied deliberately from the recipe sibling:
 *  - the reserved `general` bucket is NEVER persisted in the stored array; and
 *  - `Component.category` defaults to `general`, which is how "a default for every
 *    existing component" is achieved by normalization with NO migration.
 */

export const GENERAL_COMPONENT_CATEGORY = 'general';

export function isGeneralComponentCategory(category) {
  return (
    typeof category === 'string' && category.trim().toLowerCase() === GENERAL_COMPONENT_CATEGORY
  );
}

export function normalizeComponentCategory(category) {
  if (typeof category !== 'string') return GENERAL_COMPONENT_CATEGORY;
  const trimmed = category.trim();
  if (!trimmed) return GENERAL_COMPONENT_CATEGORY;
  return isGeneralComponentCategory(trimmed) ? GENERAL_COMPONENT_CATEGORY : trimmed;
}

export function normalizeCustomComponentCategories(categories) {
  if (!Array.isArray(categories)) return [];

  const normalized = [];
  const seen = new Set();

  for (const category of categories) {
    const normalizedCategory = normalizeComponentCategory(category);
    if (normalizedCategory === GENERAL_COMPONENT_CATEGORY || seen.has(normalizedCategory)) continue;
    seen.add(normalizedCategory);
    normalized.push(normalizedCategory);
  }

  return normalized;
}

export function getEffectiveComponentCategories(categories) {
  return [GENERAL_COMPONENT_CATEGORY, ...normalizeCustomComponentCategories(categories)];
}

export function getComponentCategoryLabel(category, localize = null) {
  const normalized = normalizeComponentCategory(category);
  if (normalized !== GENERAL_COMPONENT_CATEGORY) return normalized;
  return typeof localize === 'function' ? localize('FABRICATE.Common.General') : 'General';
}

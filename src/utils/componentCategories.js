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

/** The reserved catch-all bucket. Implied for every component, never persisted in the vocabulary array. */
export const GENERAL_COMPONENT_CATEGORY = 'general';

/**
 * Is this the reserved `general` bucket?
 *
 * Case- and whitespace-insensitive on purpose: a GM typing `General` into the Tags &
 * Categories field is naming the reserved bucket, not authoring a custom category that
 * would collide with it.
 *
 * @param {unknown} category
 * @returns {boolean}
 */
export function isGeneralComponentCategory(category) {
  return (
    typeof category === 'string' && category.trim().toLowerCase() === GENERAL_COMPONENT_CATEGORY
  );
}

/**
 * Coerce any stored or authored value to a category name.
 *
 * Everything unusable — a non-string, an empty string, whitespace, an absent key —
 * reads as `general`. That total-function property is what gives every EXISTING
 * component a category with no migration: `_normalizeSalvage`'s sibling
 * `_normalizeItem` calls this on a field that has never been written.
 *
 * A custom name keeps its authored casing; only the reserved bucket is folded to
 * lower case, so `Reagent` and `reagent` remain distinct categories.
 *
 * @param {unknown} category
 * @returns {string} a non-empty category name, `general` when there is nothing usable.
 */
export function normalizeComponentCategory(category) {
  if (typeof category !== 'string') return GENERAL_COMPONENT_CATEGORY;
  const trimmed = category.trim();
  if (!trimmed) return GENERAL_COMPONENT_CATEGORY;
  return isGeneralComponentCategory(trimmed) ? GENERAL_COMPONENT_CATEGORY : trimmed;
}

/**
 * Normalize the system's stored `componentCategories` vocabulary.
 *
 * Drops the reserved `general` bucket and de-duplicates, so `general` can never be
 * persisted into the array however it arrives — GM input, import, or a hand-edited
 * settings payload. Order is authored order, preserved.
 *
 * Note `CraftingSystemManager.updateSystem` REPLACES a whole array value rather than
 * deep-merging it, so a category removed from the returned array persists as removed
 * with no `-=` deletion needed.
 *
 * @param {unknown} categories the raw stored vocabulary.
 * @returns {string[]} the custom categories only; never contains `general`.
 */
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

/**
 * The full set a GM may assign: the reserved bucket FIRST, then the custom vocabulary.
 *
 * This is the authoring order (the default leads), and is deliberately not the browser's
 * filter/group order, where `componentBrowserModel.js` pins `general` LAST as the
 * catch-all. The two orders differ because they answer different questions.
 *
 * @param {unknown} categories the system's stored `componentCategories`.
 * @returns {string[]}
 */
export function getEffectiveComponentCategories(categories) {
  return [GENERAL_COMPONENT_CATEGORY, ...normalizeCustomComponentCategories(categories)];
}

/**
 * The display label for a category.
 *
 * Only the reserved bucket is localizable — a custom category is GM-authored free text
 * and is shown verbatim, so it is never passed through `localize`.
 *
 * @param {unknown} category
 * @param {((key: string) => string)|null} [localize] injected by the caller; this module
 *   imports no localization of its own.
 * @returns {string}
 */
export function getComponentCategoryLabel(category, localize = null) {
  const normalized = normalizeComponentCategory(category);
  if (normalized !== GENERAL_COMPONENT_CATEGORY) return normalized;
  return typeof localize === 'function' ? localize('FABRICATE.Common.General') : 'General';
}

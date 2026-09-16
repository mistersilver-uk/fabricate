/**
 * The category-name normaliser shared by the component and recipe vocabularies (issue 1663).
 *
 * This module implements the SHAPE shared by two independent stored vocabularies —
 * `CraftingSystem.categories` (recipe categories) and `CraftingSystem.componentCategories`
 * (component categories) — because their normalize/label/effective-list logic was identical. It
 * does not store, read, combine or share VALUES between them: every function takes the caller's
 * array as an explicit parameter and returns a result derived only from it. `data-models/spec.md`
 * requirement 6b ("the two vocabularies must not be merged, aliased, or cross-populated") binds
 * the persisted arrays, not this normaliser, and is still enforced by call sites always passing
 * `CraftingSystem.categories` on the recipe path and `CraftingSystem.componentCategories` on the
 * component path. A shared total function over a string is not a shared list.
 *
 * This file is a private implementation detail: `componentCategories.js` and `recipeCategories.js`
 * are the permanent public surface and the only sanctioned importers.
 *
 * NO `kind` DISCRIMINATOR, deliberately. Neither the reserved bucket's id nor its label key varies
 * between the two vocabularies, so a discriminator would select nothing — and it would invite a
 * caller to believe the two vocabularies are chosen between here, which is the very thing the
 * spec forbids.
 *
 * TWO PROPERTIES ARE LOAD-BEARING and were documented on the component copy before the merge:
 *  - the reserved `general` bucket is NEVER persisted in the stored array; and
 *  - `Component.category` defaults to `general`, which is how "a default for every existing
 *    component" is achieved by normalization with NO migration.
 *
 * That totality claim now carries the RECIPE path as well as the component one, so a future
 * change to `normalizeCategoryName` is a two-kind migration-semantics change: it silently
 * re-answers what every unwritten `Component.category` AND every unwritten `Recipe.category`
 * normalises to, on worlds that have never been migrated.
 */

/** The reserved catch-all bucket. Implied for every record, never persisted in the vocabulary array. */
export const GENERAL_CATEGORY_NAME = 'general';

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
export function isGeneralCategoryName(category) {
  return typeof category === 'string' && category.trim().toLowerCase() === GENERAL_CATEGORY_NAME;
}

/**
 * Coerce any stored or authored value to a category name.
 *
 * Everything unusable — a non-string, an empty string, whitespace, an absent key —
 * reads as `general`. That total-function property is what gives every EXISTING
 * record a category with no migration: `_normalizeSalvage`'s sibling `_normalizeItem`
 * calls this on a field that has never been written.
 *
 * A custom name keeps its authored casing; only the reserved bucket is folded to
 * lower case, so `Reagent` and `reagent` remain distinct categories.
 *
 * @param {unknown} category
 * @returns {string} a non-empty category name, `general` when there is nothing usable.
 */
export function normalizeCategoryName(category) {
  if (typeof category !== 'string') return GENERAL_CATEGORY_NAME;
  const trimmed = category.trim();
  if (!trimmed) return GENERAL_CATEGORY_NAME;
  return isGeneralCategoryName(trimmed) ? GENERAL_CATEGORY_NAME : trimmed;
}

/**
 * Normalize one system's stored category vocabulary.
 *
 * Drops the reserved `general` bucket and de-duplicates, so `general` can never be
 * persisted into the array however it arrives — GM input, import, or a hand-edited
 * settings payload. Order is authored order, preserved.
 *
 * Note `CraftingSystemManager.updateSystem` REPLACES a whole array value rather than
 * deep-merging it, so a category removed from the returned array persists as removed
 * with no `-=` deletion needed.
 *
 * @param {unknown} categories the raw stored vocabulary, supplied by the caller.
 * @returns {string[]} the custom categories only; never contains `general`.
 */
export function normalizeCustomCategoryNames(categories) {
  if (!Array.isArray(categories)) return [];

  const normalized = [];
  const seen = new Set();

  for (const category of categories) {
    const normalizedCategory = normalizeCategoryName(category);
    if (normalizedCategory === GENERAL_CATEGORY_NAME || seen.has(normalizedCategory)) continue;
    seen.add(normalizedCategory);
    normalized.push(normalizedCategory);
  }

  return normalized;
}

/**
 * The full set a GM may assign: the reserved bucket FIRST, then the custom vocabulary.
 *
 * THIS IS THE AUTHORING ORDER (the default leads), and it is deliberately NOT the browser's
 * filter/group order, where `componentBrowserModel.js` and `craftingStore.svelte.js` both pin
 * `general` LAST as the catch-all. The two orders differ because they answer different questions:
 * "what may I pick?" leads with the default, while "how do I read this list?" puts the catch-all
 * at the end. Stated once here, kind-neutrally, because it holds for both vocabularies.
 *
 * @param {unknown} categories the caller's stored vocabulary.
 * @returns {string[]}
 */
export function getEffectiveCategoryNames(categories) {
  return [GENERAL_CATEGORY_NAME, ...normalizeCustomCategoryNames(categories)];
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
export function getCategoryLabel(category, localize = null) {
  const normalized = normalizeCategoryName(category);
  if (normalized !== GENERAL_CATEGORY_NAME) return normalized;
  return typeof localize === 'function' ? localize('FABRICATE.Common.General') : 'General';
}

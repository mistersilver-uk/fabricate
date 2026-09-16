/**
 * The category-name normaliser shared by the component and recipe vocabularies (issue 1663) — the
 * SHAPE only. It stores, reads, combines and shares no VALUES: every function takes the caller's
 * array, so data-models requirement 6b ("the two vocabularies must not be merged, aliased, or
 * cross-populated") stays enforced by the call sites, and there is deliberately no `kind`
 * discriminator. Two load-bearing properties: the reserved `general` bucket is NEVER persisted,
 * and normalization is what gives every unwritten `category` its default with no migration.
 */

/** The reserved catch-all bucket. */
export const GENERAL_CATEGORY_NAME = 'general';

/** Is this the reserved `general` bucket? */
export function isGeneralCategoryName(category) {
  return typeof category === 'string' && category.trim().toLowerCase() === GENERAL_CATEGORY_NAME;
}

/** Coerce any stored or authored value to a category name. */
export function normalizeCategoryName(category) {
  if (typeof category !== 'string') return GENERAL_CATEGORY_NAME;
  const trimmed = category.trim();
  if (!trimmed) return GENERAL_CATEGORY_NAME;
  return isGeneralCategoryName(trimmed) ? GENERAL_CATEGORY_NAME : trimmed;
}

/** Normalize one system's stored category vocabulary. */
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

/** The full set a GM may assign: the reserved bucket FIRST, then the custom vocabulary. */
export function getEffectiveCategoryNames(categories) {
  return [GENERAL_CATEGORY_NAME, ...normalizeCustomCategoryNames(categories)];
}

/** The display label for a category. */
export function getCategoryLabel(category, localize = null) {
  const normalized = normalizeCategoryName(category);
  if (normalized !== GENERAL_CATEGORY_NAME) return normalized;
  return typeof localize === 'function' ? localize('FABRICATE.Common.General') : 'General';
}

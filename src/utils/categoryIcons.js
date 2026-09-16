/** Per-category icon persistence (issue 689). */

/** The icon shown for a category that has no persisted icon of its own. */
export const DEFAULT_CATEGORY_ICON = 'fas fa-folder';

// A Font Awesome class string is a short run of class tokens (`fas fa-flask`).
const ICON_TOKEN_PATTERN = /^[\w][\w\s-]*$/;
const MAX_ICON_LENGTH = 60;

/**
 * Coerce a stored or authored icon value to a safe Font Awesome class string, or `''` when there is
 * nothing usable.
 */
export function normalizeCategoryIcon(icon) {
  if (typeof icon !== 'string') return '';
  const trimmed = icon.trim();
  if (!trimmed || trimmed.length > MAX_ICON_LENGTH) return '';
  return ICON_TOKEN_PATTERN.test(trimmed) ? trimmed : '';
}

/**
 * Normalize a whole category-icon map against the set of category names that may legitimately carry
 * one.
 */
export function normalizeCategoryIconMap(icons, allowedNames) {
  const allowed = new Set();
  for (const name of allowedNames || []) {
    const key = String(name || '')
      .trim()
      .toLowerCase();
    if (key) allowed.add(key);
  }

  const result = {};
  if (icons && typeof icons === 'object') {
    for (const [rawKey, rawValue] of Object.entries(icons)) {
      const key = String(rawKey || '')
        .trim()
        .toLowerCase();
      if (!key || !allowed.has(key)) continue;
      const normalizedIcon = normalizeCategoryIcon(rawValue);
      if (normalizedIcon) result[key] = normalizedIcon;
    }
  }
  return result;
}

/** The icon to render for a category, falling back to a default when none is set. */
export function categoryIconFor(icons, name, fallback = DEFAULT_CATEGORY_ICON) {
  const key = String(name || '')
    .trim()
    .toLowerCase();
  const map = icons && typeof icons === 'object' ? icons : {};
  return normalizeCategoryIcon(map[key]) || fallback;
}

/**
 * Return a copy of a category-icon map with one category's icon set (or cleared when the icon
 * normalizes away).
 */
export function withCategoryIcon(icons, name, icon) {
  const key = String(name || '')
    .trim()
    .toLowerCase();
  const next = { ...(icons && typeof icons === 'object' && icons) };
  if (!key) return next;
  const normalizedIcon = normalizeCategoryIcon(icon);
  if (normalizedIcon) next[key] = normalizedIcon;
  else delete next[key];
  return next;
}

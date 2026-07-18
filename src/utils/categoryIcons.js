/**
 * Per-category icon persistence (issue 689).
 *
 * A category vocabulary (recipe categories, component categories) stays a bare
 * `string[]` for backwards compatibility; its icons live in a SEPARATE parallel
 * map keyed by the lowercased category name (`categoryIcons` /
 * `componentCategoryIcons` on the crafting system). Keying by the lowercased name
 * matches how the Tags & Categories screen derives a row `id`
 * (`normalizeVocabularyKey`), so a lookup by row id resolves the stored icon, and
 * the reserved `general` bucket can carry a default icon under the `general` key
 * without ever being persisted into the string array.
 */

/** The icon shown for a category that has no persisted icon of its own. */
export const DEFAULT_CATEGORY_ICON = 'fas fa-folder';

// A Font Awesome class string is a short run of class tokens (`fas fa-flask`).
// Reject anything with markup characters so a persisted icon can never smuggle
// HTML into an `<i class>` render.
const ICON_TOKEN_PATTERN = /^[\w][\w\s-]*$/;
const MAX_ICON_LENGTH = 60;

/**
 * Coerce a stored or authored icon value to a safe Font Awesome class string, or
 * `''` when there is nothing usable.
 *
 * @param {unknown} icon
 * @returns {string}
 */
export function normalizeCategoryIcon(icon) {
  if (typeof icon !== 'string') return '';
  const trimmed = icon.trim();
  if (!trimmed || trimmed.length > MAX_ICON_LENGTH) return '';
  return ICON_TOKEN_PATTERN.test(trimmed) ? trimmed : '';
}

/**
 * Normalize a whole category-icon map against the set of category names that may
 * legitimately carry one.
 *
 * Entries for names outside `allowedNames` are dropped, so a category removed from
 * the vocabulary automatically drops its icon (the manager replaces the whole map
 * on update — there is no `-=` deletion needed). Keys are folded to lower case so
 * the map lines up with the screen's row ids.
 *
 * @param {unknown} icons the raw stored map.
 * @param {Iterable<string>} allowedNames the category names allowed to carry an icon
 *   (typically `['general', ...customCategories]`).
 * @returns {Record<string, string>} a clean map of lowercased name → icon class.
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

/**
 * The icon to render for a category, falling back to a default when none is set.
 *
 * @param {unknown} icons the category-icon map.
 * @param {unknown} name the category name (any casing).
 * @param {string} [fallback] the icon when the category has none.
 * @returns {string}
 */
export function categoryIconFor(icons, name, fallback = DEFAULT_CATEGORY_ICON) {
  const key = String(name || '')
    .trim()
    .toLowerCase();
  const map = icons && typeof icons === 'object' ? icons : {};
  return normalizeCategoryIcon(map[key]) || fallback;
}

/**
 * Return a copy of a category-icon map with one category's icon set (or cleared
 * when the icon normalizes away).
 *
 * @param {unknown} icons the current map.
 * @param {unknown} name the category name (any casing).
 * @param {unknown} icon the icon to set.
 * @returns {Record<string, string>}
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

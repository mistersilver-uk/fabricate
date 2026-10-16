/**
 * LOCALIZE WITH A LITERAL-STRING FALLBACK: a missing key yields exactly `fallback`, which
 * `localizeOr` sets to the key itself when a caller gives none.
 */
export function localizeWith(localize, key, data, fallback) {
  try {
    const value = typeof localize === 'function' ? localize(key, data) : null;
    return typeof value === 'string' && value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

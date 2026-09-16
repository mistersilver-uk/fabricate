/** LOCALIZE WITH A LITERAL-STRING FALLBACK, so a missing key never renders as a key. */
export function localizeWith(localize, key, data, fallback) {
  try {
    const value = typeof localize === 'function' ? localize(key, data) : null;
    return typeof value === 'string' && value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

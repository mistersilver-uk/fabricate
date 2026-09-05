/**
 * LOCALIZE WITH A LITERAL-STRING FALLBACK, so a missing key never renders as a key.
 *
 * ONE OWNER FOR THE FALLBACK SEMANTICS, which is the reason this is a module rather than a
 * private helper in each notice builder. The rule has four parts and every one of them is a
 * decision a second copy could drift on: a non-function localizer is tolerated (unit fixtures
 * and the View Lab shim both pass one), a non-string result is refused (`Localization#localize`
 * returns the KEY when the key is missing, and a namespace object when the key names a
 * namespace), an empty string is refused, and a THROW from the localizer is caught rather than
 * propagated — because every caller is composing a notice inside a `catch` handler or a startup
 * hook, where a throw is the silent failure the notice exists to replace.
 *
 * Extracted from `src/migration/worldScopeEntityNotice.js` (issue 1565), which now imports it.
 *
 * @param {(key: string, data?: object) => string|undefined} localize The Foundry localizer seam.
 * @param {string} key The `FABRICATE.*` key.
 * @param {object|undefined} data Format data, or `undefined` for a plain localize.
 * @param {string} fallback The complete English sentence to render when the key is unusable.
 * @returns {string} The localized string, or `fallback`.
 */
export function localizeWith(localize, key, data, fallback) {
  try {
    const value = typeof localize === 'function' ? localize(key, data) : null;
    return typeof value === 'string' && value && value !== key ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The manager's ONE colour vocabulary (issue 1036).
 *
 * The eight `--fab-tag-*` palette keys and their English labels were written out THREE
 * times — in `ManagerColorPopover`'s `presets`, in `ManagerColorPicker`'s `normalizedToken`
 * and again in that file's swatch helper — so the palette, its order and its names could
 * drift between the trigger and the popover it opens. They are one constant here.
 *
 * The labels are also the only thing a screen reader gets from a colour cell: they serve as
 * both `aria-label` and `title`. Until this change they were derived English, which made
 * "Sage" the most repeated untranslated string on the essence Identity tab, so each carries
 * a real localization key under a SHARED namespace — `ManagerColorPopover` also draws the
 * environments biome popover and the character-modifier picker, so the keys cannot live
 * under `Essence.*`.
 *
 * Deliberately import-free. Every mount harness that compiles either colour component must
 * copy this module verbatim, and a leaf with dependencies would propagate that obligation.
 * Callers supply their own `localize` for the same reason: reaching for `foundryBridge`
 * here would make this module unusable from a pure unit test.
 */

/** The palette, in render order, with the English fallback each key falls back to. */
export const MANAGER_COLOR_TOKENS = Object.freeze([
  Object.freeze({ token: 'sage', label: 'Sage' }),
  Object.freeze({ token: 'mist', label: 'Mist' }),
  Object.freeze({ token: 'lavender', label: 'Lavender' }),
  Object.freeze({ token: 'rose', label: 'Rose' }),
  Object.freeze({ token: 'peach', label: 'Peach' }),
  Object.freeze({ token: 'butter', label: 'Butter' }),
  Object.freeze({ token: 'aqua', label: 'Aqua' }),
  Object.freeze({ token: 'mauve', label: 'Mauve' })
]);

/** Just the keys, for a caller that only needs membership. */
export const MANAGER_COLOR_TOKEN_KEYS = Object.freeze(
  MANAGER_COLOR_TOKENS.map((preset) => preset.token)
);

/** The localization namespace the eight labels live under. */
export const MANAGER_COLOR_TOKEN_KEY_PREFIX = 'FABRICATE.Admin.Manager.Colour.Token.';

/**
 * Fold any stored spelling of a colour onto a bare palette key.
 *
 * `--fab-tag-rose` and `rose` are the same colour and both spellings are already in the
 * wild, so a normalizer that accepted only one would silently mark nothing selected.
 * Anything outside the palette folds onto `sage`, which is the shipped behaviour of both
 * colour components and is why `unset` exists as a separate flag.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeManagerColorToken(value) {
  const token = String(value || '').replace(/^--fab-tag-/, '');
  return MANAGER_COLOR_TOKEN_KEYS.includes(token) ? token : 'sage';
}

/**
 * The localized name of one palette key.
 *
 * The key is written out in full at the call site rather than interpolated, because
 * `tests/lang-keys-no-orphans.test.js` treats a captured literal as a covering PREFIX: one
 * interpolated `` `…Colour.Token.${token}` `` would mark every `Colour.Token.*` orphan
 * entry stale at once. Interpolation here is safe only because this module is the single
 * producer and the key set is a frozen constant, and the orphan scan reads the constant.
 *
 * @param {string} token a bare palette key.
 * @param {(key: string) => string} localize the caller's localizer.
 * @returns {string} the localized label, or the English fallback.
 */
export function managerColorTokenLabel(token, localize) {
  const key = normalizeManagerColorToken(token);
  const preset = MANAGER_COLOR_TOKENS.find((entry) => entry.token === key);
  const fullKey = `${MANAGER_COLOR_TOKEN_KEY_PREFIX}${key}`;
  const translated = typeof localize === 'function' ? localize(fullKey) : '';
  return translated && translated !== fullKey ? translated : preset.label;
}

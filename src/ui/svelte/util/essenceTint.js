/**
 * The essence colour, as the PLAYER app spends it (issue 1036).
 *
 * An essence carries a bare palette key (`sage`) or the full custom-property spelling
 * (`--fab-tag-sage`); both are in the wild. This folds either onto the bare key and drops
 * anything else to `''`.
 *
 * Dropping to `''` rather than to a default colour is the whole point, and is where this
 * differs from `normalizeManagerColorToken`, which folds the unknown onto `sage`. In the
 * manager a colour is always being CHOSEN, so a fallback colour is right. In the player a
 * colour is being REPORTED, and an essence with no colour must render exactly as it did
 * before it could have one: the caller emits no inline custom property at all, so the
 * stylesheet's own `var(…, fallback)` paints, unchanged.
 *
 * @param {unknown} rawToken a bare palette key, a `--fab-tag-*` spelling, or anything.
 * @returns {string} the bare key, or `''` when there is no usable colour.
 */
export function essenceTintToken(rawToken) {
  const bare = String(rawToken || '').replace(/^--fab-tag-/, '');
  return /^[a-z0-9-]+$/.test(bare) ? bare : '';
}

/**
 * The inline style that publishes an essence's colour to CSS, or `undefined`.
 *
 * `undefined` (not `''`) so Svelte omits the attribute entirely rather than rendering an
 * empty one — the uncoloured essence keeps the DOM it already had.
 *
 * @param {unknown} rawToken as {@link essenceTintToken}.
 * @param {string} [property] the custom property to set.
 * @returns {string|undefined}
 */
export function essenceTintStyle(rawToken, property = '--fab-essence-tint') {
  const token = essenceTintToken(rawToken);
  return token ? `${property}:var(--fab-tag-${token})` : undefined;
}

// An essence's colour as the PLAYER app spends it (issue 1036). An unusable token folds to `''`,
// not to a default — unlike `normalizeManagerColorToken`, where a colour is CHOSEN rather than
// reported — and the style is then `undefined`, so Svelte omits the attribute and CSS's own paints.
export function essenceTintToken(rawToken) {
  const bare = String(rawToken || '').replace(/^--fab-tag-/, '');
  return /^[a-z0-9-]+$/.test(bare) ? bare : '';
}

export function essenceTintStyle(rawToken, property = '--fab-essence-tint') {
  const token = essenceTintToken(rawToken);
  return token ? `${property}:var(--fab-tag-${token})` : undefined;
}

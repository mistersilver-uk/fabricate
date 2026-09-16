// The manager's ONE colour vocabulary (issue 1036): the eight `--fab-tag-*` palette keys in render
// order, with their localization keys and English fallbacks. The labels are all a screen reader
// gets from a colour cell (`aria-label` and `title`), so they live under a SHARED namespace —
// `ManagerColorPopover` also draws the biome and character-modifier pickers, so the keys cannot sit
// under `Essence.*`. Import-free, and `localize` is the caller's: every mount harness compiling
// either colour component must copy this module verbatim, dependencies and all.
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

export const MANAGER_COLOR_TOKEN_KEYS = Object.freeze(
  MANAGER_COLOR_TOKENS.map((preset) => preset.token)
);

export const MANAGER_COLOR_TOKEN_KEY_PREFIX = 'FABRICATE.Admin.Manager.Colour.Token.';

// Both `--fab-tag-rose` and `rose` are in the wild, so accepting one spelling would silently mark
// nothing selected. Anything else folds onto `sage`, which is why `unset` is a separate flag.
export function normalizeManagerColorToken(value) {
  const token = String(value || '').replace(/^--fab-tag-/, '');
  return MANAGER_COLOR_TOKEN_KEYS.includes(token) ? token : 'sage';
}

// Interpolating the key is safe ONLY here: this module is the single producer over a frozen key set
// that `tests/lang-keys-no-orphans.test.js` reads, and that gate treats a literal as a PREFIX.
export function managerColorTokenLabel(token, localize) {
  const key = normalizeManagerColorToken(token);
  const preset = MANAGER_COLOR_TOKENS.find((entry) => entry.token === key);
  const fullKey = `${MANAGER_COLOR_TOKEN_KEY_PREFIX}${key}`;
  const translated = typeof localize === 'function' ? localize(fullKey) : '';
  return translated && translated !== fullKey ? translated : preset.label;
}

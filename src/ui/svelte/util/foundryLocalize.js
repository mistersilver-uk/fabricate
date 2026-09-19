// DELIBERATELY `i18n.format(key, data)` for the `data` branch: on V13.351 `localize` takes no
// `data` argument at all, and on V14.365 `format` survives as a prototype alias of `localize`. So
// this is correct on both supported builds, and "modernising" it silently breaks V13.351.
// Returns the key itself when no `game.i18n` is reachable, i.e. outside a running world.
export function localize(key, data) {
  const i18n = globalThis.game?.i18n;
  if (!i18n) return key;
  if (data !== undefined) return i18n.format(key, data);
  return i18n.localize(key);
}

// A comma-and-"and" join is a LANGUAGE rule, not an authored string: separator, conjunction and
// Oxford comma all vary by locale. These options are the "x, y and z" reading of a conjunction.
const LIST_FORMAT_OPTIONS = Object.freeze({ style: 'long', type: 'conjunction' });

// `getListFormatter` is bound to the language the world is actually running in, which is what makes
// this correct for a sentence assembled at render time — `items.join(', ')` and an authored
// separator key are both wrong outside English. Degrades to the platform locale with no i18n.
export function formatList(items) {
  const values = Array.isArray(items) ? items.map((item) => String(item ?? '')) : [];
  const i18n = globalThis.game?.i18n;
  if (typeof i18n?.getListFormatter !== 'function') {
    return new Intl.ListFormat(undefined, LIST_FORMAT_OPTIONS).format(values);
  }
  return i18n.getListFormatter(LIST_FORMAT_OPTIONS).format(values);
}

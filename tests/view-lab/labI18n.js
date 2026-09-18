/** Localization for the View Lab, backed by the shipped strings. */

function flatten(source, prefix, sink) {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, path, sink);
    else sink.set(path, value);
  }
  return sink;
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`view lab: could not load ${url} (${response.status})`);
  return response.json();
}

/**
 * Build a `game.i18n.localize`-shaped resolver over the module and core string tables.
 *
 * @returns {Promise<(key: string) => string>} Resolver returning the key itself when unmapped,
 *   exactly as Foundry does.
 */
export async function createLocalizer() {
  const strings = new Map();
  const [moduleStrings, coreStrings] = await Promise.all([
    loadJson('/lang/en.json'),
    // Absent only when the chrome has not been harvested, which the frame builder reports first.
    loadJson('/@foundry-chrome/lang/en.json').catch(() => ({})),
  ]);
  flatten(coreStrings, '', strings);
  flatten(moduleStrings, '', strings);
  return (key) => {
    const value = strings.get(key);
    return typeof value === 'string' ? value : key;
  };
}

/**
 * Build the `{localize, format}` pair Fabricate components read off `game.i18n`.
 *
 * @param {(key: string) => string} localize A resolver from {@link createLocalizer}.
 */
export function toI18nStub(localize) {
  return {
    localize,
    format: (key, data = {}) =>
      localize(key).replace(/\{(\w+)\}/g, (whole, token) =>
        Object.hasOwn(data, token) ? String(data[token]) : whole
      ),
  };
}

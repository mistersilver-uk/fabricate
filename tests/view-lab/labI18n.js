/**
 * Localization for the View Lab, backed by the shipped strings.
 *
 * The lab resolves keys against the real `lang/en.json` rather than a per-case string map, so a
 * window title, a button label, and a status chip are the strings players actually see — which
 * matters for a screenshot, where text width is layout.
 *
 * Foundry's own `APPLICATION.TOOLS.*` labels come from the harvested core `lang/en.json`. They
 * only ever reach `data-tooltip`/`aria-label`, so a miss is cosmetically irrelevant, but the
 * lookup is wired anyway to keep the DOM faithful.
 */

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
 * @returns {{localize: Function, format: Function}}
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

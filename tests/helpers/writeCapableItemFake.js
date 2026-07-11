/**
 * A WRITE-capable Foundry world-item fake for durable-flag write-path tests (component
 * restamp, tool stamp, whetstone coexistence). Faithfully models the double-nested flag
 * storage (`flags.fabricate.fabricate.<...>`) that `getFabricateFlag`/`setFabricateFlag`
 * use, with per-leaf `setFlag` deep-merge and `unsetFlag` leaf-delete — so a per-role clear
 * (`roles.<sys>.toolId`) preserves the sibling (`roles.<sys>.componentId`) and a whole-object
 * clear destroys it. The read-only `roleItem` fixture (`getFlag` only) cannot exercise these.
 *
 * Hoisted from `tests/component-identity-wiring.test.js` so the write-fake lives in ONE place
 * (SonarCloud counts `tests/**` duplication like `src/`).
 */

/**
 * @param {string|null} object
 * @param {string} path
 */
export function getProperty(object, path) {
  if (!object || !path) return undefined;
  return String(path)
    .split('.')
    .reduce((value, key) => (value == null ? undefined : value[key]), object);
}

/**
 * @param {{uuid:string, name?:string, duplicateSource?:string|null, compendiumSource?:string|null, pack?:string|null}} spec
 */
export function makeWorldItem({
  uuid,
  name = 'Item',
  duplicateSource = null,
  compendiumSource = null,
  pack = null,
}) {
  return {
    uuid,
    name,
    pack,
    _stats: { duplicateSource, compendiumSource },
    flags: {},
    updates: [],
    async update(patch) {
      this.updates.push(patch);
      if ('_stats.duplicateSource' in patch) {
        this._stats.duplicateSource = patch['_stats.duplicateSource'];
      }
    },
    getFlag(scope, key) {
      return getProperty(this.flags?.[scope], key);
    },
    async setFlag(scope, key, value) {
      const parts = key.split('.');
      let node = (this.flags[scope] ??= {});
      while (parts.length > 1) node = node[parts.shift()] ??= {};
      node[parts[0]] = value;
    },
    async unsetFlag(scope, key) {
      const parts = key.split('.');
      let node = this.flags?.[scope];
      while (node && parts.length > 1) node = node[parts.shift()];
      if (node) delete node[parts[0]];
    },
  };
}

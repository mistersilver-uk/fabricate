/**
 * A WRITE-capable Foundry world-item fake for durable-flag write-path tests (component
 * restamp, tool stamp, whetstone coexistence). Faithfully models the double-nested flag
 * storage (`flags.fabricate.fabricate.<...>`) that `getFabricateFlag`/`setFabricateFlag`
 * use. Foundry V13 `setFlag` stores its dotted key literally, while a flattened
 * `Document#update` path expands into nested data and `unsetFlag` deletes a dotted leaf.
 * The read-only `roleItem` fixture (`getFlag` only) cannot exercise these write semantics.
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

function applyFlattenedUpdate(object, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  let node = object;
  for (const part of parts) {
    node = node[part] ??= {};
  }
  if (last.startsWith('-=')) {
    delete node[last.slice(2)];
  } else {
    node[last] = value;
  }
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
      for (const [path, value] of Object.entries(patch)) {
        applyFlattenedUpdate(this, path, value);
      }
      return this;
    },
    updateSource() {},
    getFlag(scope, key) {
      return getProperty(this.flags?.[scope], key);
    },
    async setFlag(scope, key, value) {
      const namespace = (this.flags[scope] ??= {});
      namespace[key] = value;
      return this;
    },
    async unsetFlag(scope, key) {
      const parts = key.split('.');
      let node = this.flags?.[scope];
      while (node && parts.length > 1) node = node[parts.shift()];
      if (node) delete node[parts[0]];
    },
  };
}

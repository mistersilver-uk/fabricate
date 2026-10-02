/**
 * Test doubles for a resource an actor stores (issue 2008): core's dotted `foundry.utils`
 * property readers, and an actor whose `_source` holds the resource its `update` writes.
 */

/** Core's walk: the whole key `in` the object first, then each segment `in` its parent object. */
function walk(object, key) {
  if (!key || !object) return { found: false };
  if (key in object) return { found: true, value: object[key] };
  let target = object;
  for (const segment of key.split('.')) {
    if (!target || typeof target !== 'object' || !(segment in target)) return { found: false };
    target = target[segment];
  }
  return { found: true, value: target };
}

/** Core's `getProperty`. */
export const getProperty = (object, key) => walk(object, key).value;

/** Core's `hasProperty`: the key exists, even holding `undefined`. */
export const hasProperty = (object, key) => walk(object, key).found;

/** Install `getProperty`/`hasProperty` on `globalThis.foundry.utils`; returns the restore. */
export function installFoundryPropertyUtils() {
  const saved = globalThis.foundry;
  Object.assign(globalThis, {
    foundry: { ...saved, utils: { ...saved?.utils, getProperty, hasProperty } },
  });
  return () => Object.assign(globalThis, { foundry: saved });
}

/**
 * Give `actor` `value` stored at `path`: `_source` reads it, `update` writes `patch[path]` there and
 * resolves the actor, no effect overrides it, and `canUserModify` answers `writable`. `writes` and
 * `permissionChecks` record each update patch and each `[user, action]` asked.
 */
export function withStoredResource(actor, path, value, { writable = true } = {}) {
  const source = {};
  const keys = path.split('.');
  keys.slice(0, -1).reduce((node, key) => (node[key] = {}), source)[keys.at(-1)] = value;
  const writes = [];
  const permissionChecks = [];
  Object.defineProperty(actor, '_source', { get: () => source, configurable: true });
  Object.assign(actor, {
    overrides: {},
    canUserModify(user, action) {
      permissionChecks.push([user, action]);
      return writable;
    },
    async update(patch) {
      writes.push(patch);
      keys.slice(0, -1).reduce((node, key) => node[key], source)[keys.at(-1)] = patch[path];
      return actor;
    },
  });
  return { actor, source, writes, permissionChecks };
}

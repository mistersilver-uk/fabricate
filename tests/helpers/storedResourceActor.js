/**
 * Test doubles for a resource an actor stores (issue 2008): core's dotted `foundry.utils`
 * property readers, and an actor whose `_source` holds the resource its `update` writes.
 */

/** Core's `getProperty` for a dotted path. */
export const getProperty = (object, path) =>
  String(path)
    .split('.')
    .reduce((node, key) => node?.[key], object);

/** Core's `hasProperty`: the path holds a value. */
export const hasProperty = (object, path) => getProperty(object, path) !== undefined;

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

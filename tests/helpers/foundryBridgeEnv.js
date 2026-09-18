/**
 * Install the Foundry globals the `foundry*.js` bridge modules read at call time. Each option is the
 * implementation installed: `labels` as `game.i18n`, `dialog` as `DialogV2`, `textEditor` as
 * `foundry.applications.ux.TextEditor`, `fromUuid` as the bare global; `restore()` undoes all five.
 */

/** Foundry's own `deepClone` preserves functions, which dialog button callbacks depend on. */
function preservingDeepClone(value) {
  if (Array.isArray(value)) return value.map(preservingDeepClone);
  if (value && typeof value === 'object') {
    const clone = {};
    for (const key of Object.keys(value)) clone[key] = preservingDeepClone(value[key]);
    return clone;
  }
  return value;
}

/** Records handlers per hook name so a test can fire them and assert the on/off wiring. */
export function makeHooks() {
  const handlers = new Map();
  let nextId = 0;
  return {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Map());
      const id = ++nextId;
      handlers.get(name).set(id, fn);
      return id;
    },
    off(name, id) {
      handlers.get(name)?.delete(id);
    },
    fire(name, ...args) {
      for (const fn of [...(handlers.get(name)?.values() ?? [])]) fn(...args);
    },
    count(name) {
      return handlers.get(name)?.size ?? 0;
    },
  };
}

const GLOBALS = Object.freeze(['game', 'ui', 'foundry', 'Hooks', 'fromUuid']);

export function installFoundryBridgeEnv({ labels, dialog, textEditor, fromUuid } = {}) {
  const previous = GLOBALS.map((name) => [name, name in globalThis, globalThis[name]]);
  const hooks = makeHooks();
  const notifications = { info: [], warn: [], error: [] };

  globalThis.Hooks = hooks;
  globalThis.ui = {
    notifications: {
      info: (message) => notifications.info.push(message),
      warn: (message) => notifications.warn.push(message),
      error: (message) => notifications.error.push(message),
    },
  };
  globalThis.foundry = {
    utils: { deepClone: preservingDeepClone },
    applications: { api: { DialogV2: dialog }, ux: { TextEditor: textEditor } },
  };
  globalThis.game = { i18n: labels };
  if (fromUuid) globalThis.fromUuid = fromUuid;

  return {
    hooks,
    notifications,
    restore() {
      for (const [name, existed, value] of previous) {
        if (existed) globalThis[name] = value;
        else delete globalThis[name];
      }
    },
  };
}

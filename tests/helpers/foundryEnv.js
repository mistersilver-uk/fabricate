/**
 * Shared minimal Foundry environment for RecipeManager / CraftingSystemManager unit tests.
 *
 * Installs the small `globalThis.foundry`/`game`/`ui` shims those managers read at runtime and
 * returns the mutable bits tests assert against. Centralising it keeps the per-test boilerplate from
 * being duplicated across suites.
 */
let idSeq = 0;

/**
 * Install the `foundry.utils` / `ui.notifications` / `fromUuid` shims a model-layer suite
 * needs before its dynamic imports, WITHOUT touching `globalThis.game`.
 *
 * `installFoundryEnv` below owns `game` as well, which a suite that builds its own
 * settings store, pack list, or GM identity cannot use. This is the smaller half those
 * suites otherwise repeat verbatim — the copy is what the SonarCloud duplication gate
 * counts, and it counts `tests/**` exactly like `src/`.
 *
 * Call it at module scope, above the `await import(...)` of the module under test: the
 * managers read these globals while their own module graph is being evaluated.
 */
export function installFoundryUtilsEnv() {
  globalThis.foundry = {
    utils: {
      randomID: () => {
        idSeq += 1;
        return `rid-${idSeq}`;
      },
      getProperty: (object, path) =>
        String(path ?? '')
          .split('.')
          .reduce((value, key) => (value == null ? undefined : value[key]), object),
    },
  };
  globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
  globalThis.fromUuid = async () => null;
}

/**
 * @param {object} [options]
 * @param {object} [options.craftingSystemManager] - exposed via game.fabricate.getCraftingSystemManager
 * @returns {{ notifications: string[], settings: Map<string, unknown> }}
 */
export function installFoundryEnv({ craftingSystemManager } = {}) {
  const notifications = [];
  const settings = new Map();

  const fabricate = craftingSystemManager
    ? { getCraftingSystemManager: () => craftingSystemManager }
    : {};

  globalThis.foundry = {
    utils: {
      randomID: () => {
        idSeq += 1;
        return `rid-${idSeq}`;
      },
      getProperty: (obj, path) =>
        String(path || '')
          .split('.')
          .reduce((value, key) => value?.[key], obj),
    },
  };

  globalThis.game = {
    user: { isGM: true },
    actors: [],
    fabricate,
    settings: {
      get: (_namespace, key) => settings.get(key),
      set: async (_namespace, key, value) => {
        settings.set(key, value);
        return value;
      },
    },
  };

  globalThis.ui = {
    notifications: {
      info: (message) => notifications.push(message),
      warn: () => {},
      error: () => {},
    },
  };

  return { notifications, settings };
}

/**
 * Shared minimal Foundry environment for RecipeManager / CraftingSystemManager unit tests.
 *
 * Installs the small `globalThis.foundry`/`game`/`ui` shims those managers read at runtime and
 * returns the mutable bits tests assert against. Centralising it keeps the per-test boilerplate from
 * being duplicated across suites.
 */
let idSeq = 0;

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
      randomID: () => `rid-${(idSeq += 1)}`,
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

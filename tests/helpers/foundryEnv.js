/**
 * Shared minimal Foundry environment for RecipeManager / CraftingSystemManager unit tests.
 *
 * Installs the small `globalThis.foundry`/`game`/`ui` shims those managers read at runtime and
 * returns the mutable bits tests assert against. Centralising it keeps the per-test boilerplate from
 * being duplicated across suites.
 */
import { FABRICATE_SETTINGS_NAMESPACE } from '../../src/config/settings.js';
import { isWorldScopedSettingKey, settingPermissionError } from './settings.js';

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
 * @param {object[]} [options.actors] - seeds `game.actors`, for suites that assert on an
 *   actor-flag pass.
 * @param {boolean} [options.canModifySettings=true] - when `false`, `game.settings.set`
 *   REFUSES every world-scoped key exactly as Foundry's server does, while
 *   `game.user.isGM` stays `true`. That pair is the real, reachable configuration: the
 *   client-side `_assertGM` gate is `game.user.isGM`, while `SETTINGS_MODIFY` is separately
 *   revocable from assistant GMs, so a manager can pass its own gate and still have the
 *   write rejected. Every persistence fake in this suite is otherwise omnipotent — a
 *   `Map.set` that cannot say no — which makes a whole defect class structurally invisible.
 *   The scope table is read from the REAL setting definitions via `isWorldScopedSettingKey`,
 *   so it cannot drift from `src/config/settings.js`.
 * @param {string} [options.userName='Assistant'] - name in the refusal message.
 * @returns {{ notifications: string[], settings: Map<string, unknown>,
 *   writes: Array<{key: string, value: unknown}>, refused: string[] }}
 */
export function installFoundryEnv({
  craftingSystemManager,
  actors = [],
  canModifySettings = true,
  userName = 'Assistant',
} = {}) {
  const notifications = [];
  const settings = new Map();
  const writes = [];
  const refused = [];

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
    user: { isGM: true, name: userName },
    actors,
    fabricate,
    settings: {
      get: (_namespace, key) => settings.get(key),
      set: async (_namespace, key, value) => {
        if (!canModifySettings && isWorldScopedSettingKey(key)) {
          refused.push(String(key));
          throw settingPermissionError(userName, `${FABRICATE_SETTINGS_NAMESPACE}.${key}`);
        }
        settings.set(key, value);
        writes.push({ key, value });
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

  return { notifications, settings, writes, refused };
}

/**
 * The world-level `total` learn pool for recipe items (issue 511). A recipe item whose
 * `learn.learnScope === 'total'` draws every actor's learns from one budget keyed by the
 * recipe-item definition, across every copy, rather than the per-copy `perInstance` count. Writes
 * are GM-authoritative: a non-GM increment or decrement is skipped and answers `false`, never
 * throwing or forking the shared budget. The store is injected into `RecipeVisibilityService`; this
 * default persists to a hidden world setting it registers lazily on first use.
 */

const SETTING_SCOPE = 'fabricate';
const SETTING_KEY = 'recipeItemPartyLearnPool';
const SETTING_FULL_KEY = `${SETTING_SCOPE}.${SETTING_KEY}`;

function _isGM() {
  return globalThis.game?.user?.isGM === true;
}

function _ensureRegistered() {
  const settings = globalThis.game?.settings;
  if (!settings || typeof settings.register !== 'function') return false;
  const registered = settings.settings;
  if (registered?.has?.(SETTING_FULL_KEY)) return true;
  try {
    settings.register(SETTING_SCOPE, SETTING_KEY, {
      name: 'Recipe Item Party Learn Pool',
      scope: 'world',
      config: false,
      type: Object,
      default: {},
    });
    return true;
  } catch {
    return false;
  }
}

function _readPool() {
  if (!_ensureRegistered()) return {};
  try {
    const value = globalThis.game.settings.get(SETTING_SCOPE, SETTING_KEY);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/**
 * The default store: `get(key)`, `writable()`, and `increment`/`decrement(key)` resolving whether
 * the write landed.
 */
export function createDefaultPartyLearnPool() {
  return {
    get(key) {
      const pool = _readPool();
      return Number(pool?.[key] || 0);
    },
    /** Whether this client may mutate the pool; a refused non-GM is not a spent budget. */
    writable: () => _isGM(),
    async increment(key) {
      // A local non-GM increment would fork the shared budget; `false` fails the caller closed.
      if (!_isGM() || !_ensureRegistered()) return false;
      try {
        const pool = { ..._readPool() };
        pool[key] = Number(pool[key] || 0) + 1;
        await globalThis.game.settings.set(SETTING_SCOPE, SETTING_KEY, pool);
        return true;
      } catch {
        return false;
      }
    },
    async decrement(key) {
      // Floored at 0, so a double-free or a stale slot never drives the shared budget negative.
      if (!_isGM() || !_ensureRegistered()) return false;
      try {
        const pool = { ..._readPool() };
        pool[key] = Math.max(0, Number(pool[key] || 0) - 1);
        await globalThis.game.settings.set(SETTING_SCOPE, SETTING_KEY, pool);
        return true;
      } catch {
        return false;
      }
    },
  };
}

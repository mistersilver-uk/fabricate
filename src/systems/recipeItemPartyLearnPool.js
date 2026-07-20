/**
 * Shared, world-level "total" learn pool for recipe items (issue 511, PR-B).
 *
 * A recipe item whose `learn.learnScope === 'total'` draws every actor's learns
 * from ONE shared budget keyed by the recipe-item definition (i.e. across every copy
 * of the source item), rather than the per-copy (`perInstance`) document count. The
 * counter therefore lives
 * at world scope, and — like every other externally-observable world write in the
 * module — its increments are GM-authoritative: only a GM mutates the shared count,
 * and a non-GM path degrades safely (the write is skipped and reported as failed)
 * instead of throwing or letting a client fork the shared budget.
 *
 * The store is injected into `RecipeVisibilityService` so it is trivially fakeable
 * in unit tests; the default implementation persists to a hidden world setting,
 * registered lazily on first use so this module owns its storage end-to-end.
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
 * Build the default, world-setting-backed party learn pool store.
 *
 * @returns {{ get(key: string): number, increment(key: string): Promise<boolean>, decrement(key: string): Promise<boolean> }}
 */
export function createDefaultPartyLearnPool() {
  return {
    get(key) {
      const pool = _readPool();
      return Number(pool?.[key] || 0);
    },
    async increment(key) {
      // GM-authoritative: a world-setting write requires a GM, and letting a
      // non-GM client "increment" locally would fork the shared budget. Degrade
      // safely by reporting the write did not happen so the caller fails closed.
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
      // GM-authoritative and symmetric with `increment`: freeing a shared slot on
      // knowledge reset/erase decrements the pooled count, floored at 0 so a
      // double-free (or a stale slot) can never drive the shared budget negative.
      // A non-GM path degrades safely (skipped, reported failed) exactly as
      // `increment` does, so a client never mutates the shared budget.
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

import {
  buildCurrencySpendUpdates,
  currencyTotalForBase,
  formatCurrencyRequirement,
  readCurrencyBalances,
} from './currencyProfile.js';

/**
 * Coin spenders share one behavior-first interface so {@link CraftingEngine} can resolve
 * a spender by `spendStrategy` and drive it uniformly:
 *
 *   readCoins(actor, profileContext) -> { valid, copperValue?, message? }
 *   spend(actor, requirement, profileContext) -> Promise<{ valid, message? }>
 *
 * `profileContext` carries the already-validated currency profile and the resolved unit:
 *   { profile, unit, units }
 *
 * `readCoins` reports affordability for the up-front check (the engine compares the actor's
 * available base value against the requirement); `spend` performs the deduction and is the
 * authoritative insufficient-funds signal. The pure spend math and validation stay in
 * `currencyProfile.js`; the spenders own the actor I/O.
 */

/**
 * Generic actor-property spender (the default, dnd5e and general behavior).
 *
 * Reads balances from each unit's `actorPath`, computes the spend (with change-making
 * across configured sub-units) via {@link buildCurrencySpendUpdates}, and applies a single
 * batched `actor.update(...)`.
 */
export class ActorPropertyCoinSpender {
  /**
   * @param {object} actor
   * @param {{ profile: object, unit: object }} profileContext
   * @returns {{ valid: boolean, copperValue?: number, message?: string }}
   */
  readCoins(actor, { profile, unit } = {}) {
    const balances = readCurrencyBalances(actor, profile?.units || []);
    if (!balances.valid) return { valid: false, message: balances.message };
    const baseUnitId = profile?.metadata?.get(unit?.id)?.baseUnitId;
    const copperValue = currencyTotalForBase(balances.balances, profile, baseUnitId);
    return { valid: true, copperValue };
  }

  /**
   * @param {object} actor
   * @param {{ unit: object, amount: number }} requirement - `unit` is the resolved
   *   currency-profile unit; `buildCurrencySpendUpdates` resolves balances by `unit.id`.
   * @param {{ profile: object }} profileContext
   * @returns {Promise<{ valid: boolean, message?: string }>}
   */
  async spend(actor, { unit, amount } = {}, { profile } = {}) {
    const spend = buildCurrencySpendUpdates(
      actor,
      { unit: unit?.id, amount },
      profile?.units || []
    );
    if (!spend.valid) return { valid: false, message: spend.message };
    if (Object.keys(spend.updates || {}).length > 0) {
      await actor.update(spend.updates);
    }
    return { valid: true, formatted: spend.formatted };
  }
}

/**
 * Generic actor-inventory spender. Delegates the system-specific coin I/O to a per-system
 * coin adapter resolved by `game.system.id`. The pf2e adapter is the sole intended entry
 * (see {@link Pf2eInventoryCoinAdapter}); this is deliberately a small internal map, not a
 * third-party plugin registry.
 *
 * A coin adapter implements:
 *   readCoins(actor) -> { copperValue, ... } | null
 *   spend(actor, { unit, amount }) -> Promise<{ valid, message? }>
 *
 * When no adapter is registered for the current system the spender fails loudly with a
 * clear message — never a silent no-op.
 */
export class ActorInventoryCoinSpender {
  /**
   * @param {object} [options]
   * @param {Map<string, object>} [options.adapters] - systemId -> coin adapter.
   * @param {() => string} [options.getSystemId] - resolves the active Foundry system id.
   */
  constructor({ adapters = new Map(), getSystemId } = {}) {
    this._adapters = adapters instanceof Map ? adapters : new Map(adapters);
    this._getSystemId =
      typeof getSystemId === 'function'
        ? getSystemId
        : () => (typeof game === 'undefined' ? '' : game?.system?.id || '');
  }

  _resolveAdapter() {
    const systemId = String(this._getSystemId() || '').trim();
    return { systemId, adapter: this._adapters.get(systemId) || null };
  }

  /**
   * @param {object} actor
   * @param {{ unit: object }} profileContext
   * @returns {{ valid: boolean, copperValue?: number, message?: string }}
   */
  readCoins(actor, { unit } = {}) {
    const { systemId, adapter } = this._resolveAdapter();
    if (!adapter) {
      return {
        valid: false,
        message: `No currency inventory adapter is registered for system "${systemId || 'unknown'}".`,
      };
    }
    const coins = adapter.readCoins?.(actor) ?? null;
    if (!coins) {
      return {
        valid: false,
        message: `Currency unit "${unit?.label || unit?.id || ''}" is not available on ${actor?.name || 'actor'}.`,
      };
    }
    return { valid: true, copperValue: Number(coins.copperValue) || 0 };
  }

  /**
   * @param {object} actor
   * @param {{ unit: object, amount: number }} requirement
   * @param {{ profile: object }} profileContext
   * @returns {Promise<{ valid: boolean, message?: string }>}
   */
  async spend(actor, requirement, { profile } = {}) {
    const { systemId, adapter } = this._resolveAdapter();
    if (!adapter?.spend) {
      return {
        valid: false,
        message: `No currency inventory adapter is registered for system "${systemId || 'unknown'}".`,
      };
    }
    try {
      return await adapter.spend(actor, requirement);
    } catch (error) {
      console.error('Fabricate | Failed to decrement inventory currency', error);
      return {
        valid: false,
        message: `Could not spend currency (${formatCurrencyRequirement(requirement, profile?.units || [])}).`,
      };
    }
  }
}

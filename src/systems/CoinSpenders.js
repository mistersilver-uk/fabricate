import { MacroExecutor } from '../utils/MacroExecutor.js';

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
 * `check` reports affordability for the up-front gate; `spend` performs the deduction and is the
 * authoritative insufficient-funds signal. The pure spend math and validation stay in
 * `currencyProfile.js`; the spenders own the actor I/O. `readCoins` remains on the
 * actor-property/inventory spenders as the shared affordability primitive that `check` wraps.
 */

/**
 * Shared affordability check for the actor-property and actor-inventory spenders: read the
 * actor's coins, then compare the available base value against the requirement (amount × the
 * unit's base value). Returns `{ valid: true }` when affordable, otherwise `{ valid: false,
 * message }`. Reuses {@link formatCurrencyRequirement} for the shortfall message.
 *
 * @param {object} spender - a spender exposing `readCoins(actor, ctx)`.
 * @param {object} actor
 * @param {{ unit: object, amount: number }} requirement
 * @param {{ profile: object, unit: object, units: object[] }} ctx
 * @returns {{ valid: boolean, message?: string }}
 */
function checkAffordabilityViaReadCoins(spender, actor, requirement, ctx = {}) {
  const { profile, unit, units } = ctx;
  const coins = spender.readCoins(actor, { profile, unit, units: units || profile?.units || [] });
  if (!coins || coins.valid === false) {
    return {
      valid: false,
      message:
        coins?.message ||
        `Currency unit "${unit?.label || unit?.id || ''}" is not available on ${actor?.name || 'actor'}.`,
    };
  }
  const baseValue = Number(profile?.metadata?.get(unit?.id)?.baseValue) || 0;
  const requiredBase = Number(requirement?.amount || 0) * baseValue;
  if (Number(coins.copperValue) < requiredBase) {
    return {
      valid: false,
      message: `Insufficient currency. Requires ${formatCurrencyRequirement({ unit: unit?.id, amount: requirement?.amount }, profile?.units || [])}.`,
    };
  }
  return { valid: true };
}

/**
 * Build the SYNCHRONOUS affordability probe handed to ingredient-set resolution.
 *
 * The selection resolver is synchronous and calls `affordCurrency(match) -> boolean` to decide
 * whether a currency option may satisfy a group. It must answer without awaiting, so this probe
 * does a synchronous coin READ (not the async spend) for the property/inventory strategies, and
 * is optimistic for the `macro` strategy (the authoritative `canAfford` macro is async and runs
 * in the engine gate later — see {@link CraftingEngine}). It returns `false` for a null actor, an
 * invalid profile, an unknown unit, or insufficient held value.
 *
 * @param {object} args
 * @param {object|null} args.actor - the crafting actor; `null` short-circuits to never-affordable.
 * @param {object} args.profile - a validated currency profile ({@link validateCurrencyProfile}).
 * @param {string} args.spendStrategy
 * @param {object} args.spender - resolved coin spender (exposes `readCoins`).
 * @returns {(match: { unit?: string, amount?: number }) => boolean}
 */
export function buildAffordCurrencyProbe({ actor, profile, spendStrategy, spender } = {}) {
  return (match) => {
    if (!actor) return false;
    const amount = Math.max(0, Number(match?.amount) || 0);
    if (amount <= 0) return false;
    const unit = (profile?.units || []).find(
      (entry) => entry.id === String(match?.unit || '').trim()
    );
    if (!unit) return false;
    // Macro spending can only be checked by running the (async) canAfford macro, which the
    // synchronous probe cannot do. Stay optimistic here; the engine's async gate is authoritative
    // and aborts loudly on a real shortfall (never granting a free craft).
    if (spendStrategy === 'macro') return true;
    if (typeof spender?.readCoins !== 'function') return false;
    const coins = spender.readCoins(actor, { profile, unit, units: profile.units });
    if (!coins || coins.valid === false) return false;
    const baseValue = Number(profile?.metadata?.get(unit.id)?.baseValue) || 0;
    return Number(coins.copperValue) >= amount * baseValue;
  };
}

/**
 * Interpret a currency macro's return value into a uniform `{ valid, message? }` result. Reuses
 * the original currency-macro contract: a bare `true`, or an object with a truthy `success` or
 * `canAfford`, means the gate/deduction passed; `false`, `null`, a thrown error, or an object
 * with a falsy `success`/`canAfford` means it failed, surfacing the macro's `message` (or the
 * provided fallback) to the player. Pure — no Foundry access — so it is unit-testable in isolation.
 *
 * @param {any} result - the macro's raw return value.
 * @param {{ fallbackMessage?: string }} [options]
 * @returns {{ valid: boolean, message?: string }}
 */
export function interpretMacroSpendResult(result, { fallbackMessage } = {}) {
  const fallback = fallbackMessage || 'Currency macro reported failure.';
  if (result === true) return { valid: true };
  if (result && typeof result === 'object') {
    const ok = Boolean(result.success) || Boolean(result.canAfford);
    if (ok) return { valid: true };
    return { valid: false, message: String(result.message || fallback) };
  }
  return { valid: false, message: fallback };
}

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
   * Affordability gate. Wraps {@link readCoins} + base-value comparison.
   * @param {object} actor
   * @param {{ unit: object, amount: number }} requirement
   * @param {{ profile: object, unit: object, units: object[] }} ctx
   * @returns {{ valid: boolean, message?: string }}
   */
  check(actor, requirement, ctx = {}) {
    return checkAffordabilityViaReadCoins(this, actor, requirement, ctx);
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
   * Affordability gate. Wraps {@link readCoins} + base-value comparison.
   * @param {object} actor
   * @param {{ unit: object, amount: number }} requirement
   * @param {{ profile: object, unit: object, units: object[] }} ctx
   * @returns {{ valid: boolean, message?: string }}
   */
  check(actor, requirement, ctx = {}) {
    return checkAffordabilityViaReadCoins(this, actor, requirement, ctx);
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

/**
 * Macro-backed actor-inventory spender. Under the `actorInventory` strategy's `macro` mode the
 * GM supplies their own currency macros: `canAfford` gates the craft and `decrement` spends. The
 * configured `increment` macro is stored for a future refund flow but is NEVER invoked here (no
 * dead `refund()` method). Both `check` and `spend` build the agreed context (supplied by the
 * engine via `ctx.macroContext`) and pass the macro's return value through the shared, pure
 * {@link interpretMacroSpendResult}, so a `false`/`null`/throw aborts the craft loudly rather than
 * granting a silent free craft.
 */
export class MacroCoinSpender {
  /**
   * @param {object} [options]
   * @param {{ canAfford?: string, increment?: string, decrement?: string }} [options.macros]
   * @param {(uuid: string, context: object) => Promise<any>} [options.runMacro]
   */
  constructor({ macros = {}, runMacro = MacroExecutor.run } = {}) {
    this._macros = {
      canAfford: String(macros?.canAfford || '').trim(),
      increment: String(macros?.increment || '').trim(),
      decrement: String(macros?.decrement || '').trim(),
    };
    this._runMacro = typeof runMacro === 'function' ? runMacro : MacroExecutor.run;
  }

  async _runMacroKey(key, actor, requirement, ctx) {
    const macroUuid = this._macros[key];
    const fallbackMessage = `Could not spend currency (${formatCurrencyRequirement(requirement, ctx?.profile?.units || [])}).`;
    if (!macroUuid) {
      return { valid: false, message: `No "${key}" currency macro is configured.` };
    }
    const context = ctx?.macroContext || {};
    try {
      const result = await this._runMacro(macroUuid, context);
      return interpretMacroSpendResult(result, { fallbackMessage });
    } catch (error) {
      console.error(`Fabricate | Currency ${key} macro failed (${macroUuid}):`, error);
      return { valid: false, message: fallbackMessage };
    }
  }

  /**
   * Affordability gate — runs the `canAfford` macro.
   * @returns {Promise<{ valid: boolean, message?: string }>}
   */
  async check(actor, requirement, ctx = {}) {
    return this._runMacroKey('canAfford', actor, requirement, ctx);
  }

  /**
   * Deduction — runs the `decrement` macro.
   * @returns {Promise<{ valid: boolean, message?: string }>}
   */
  async spend(actor, requirement, ctx = {}) {
    return this._runMacroKey('decrement', actor, requirement, ctx);
  }
}

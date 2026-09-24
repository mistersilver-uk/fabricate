import { MacroExecutor } from '../utils/MacroExecutor.js';

import {
  CURRENCY_MACRO_KEYS,
  buildCurrencyRefundUpdates,
  buildCurrencySpendUpdates,
  currencyTotalForBase,
  formatCurrencyRequirement,
  readCurrencyBalances,
} from './currencyProfile.js';

/**
 * Coin spenders share one interface, resolved by `spendStrategy`: `readCoins(actor,
 * { profile, unit, units })` -> `{ valid, copperValue?, message? }`, `check` for the up-front gate,
 * and `spend`/`refund` -> `Promise<{ valid, message? }>`, `spend` being the authoritative
 * insufficient-funds signal. Spend math lives in `currencyProfile.js`; spenders own actor I/O.
 * `MacroCoinSpender#readCoins` is asynchronous where the other two are synchronous (issue 1342):
 * a caller that cannot await must never see a macro spender, since `Promise.valid` is `undefined`
 * and would read as a zero balance. `checkAffordabilityViaReadCoins` and `buildAffordCurrencyProbe`
 * are safe only because neither is reached with one.
 * A refusal `{ valid: false, message }` may carry `thrown: true` (the mechanism delivered no
 * answer; read as `checkUnavailable`, never as poor) and `wroteNothing: true` (provably nothing
 * written; read as `creditNotConfigured`) (issue 1301). Both are additive for the craft paths.
 */

/** The shared read-then-compare affordability check for the property and inventory spenders. */
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
 * The synchronous `affordCurrency(match) -> boolean` probe selection calls: a synchronous coin
 * read, optimistic for `macro` (its async `canAfford` gate runs later), `false` for a null actor,
 * unknown unit or shortfall.
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
    // Optimistic: the engine's async `canAfford` gate is authoritative and aborts on a shortfall.
    if (spendStrategy === 'macro') return true;
    if (typeof spender?.readCoins !== 'function') return false;
    const coins = spender.readCoins(actor, { profile, unit, units: profile.units });
    if (!coins || coins.valid === false) return false;
    const baseValue = Number(profile?.metadata?.get(unit.id)?.baseValue) || 0;
    return Number(coins.copperValue) >= amount * baseValue;
  };
}

/**
 * A requirement's unit id from either shape; `formatCurrencyRequirement` given the unit object
 * rendered "[object Object]" into a message a companion receives (issue 1289).
 */
function requirementUnitId(requirement) {
  const unit = requirement?.unit;
  return typeof unit === 'string' ? unit : (unit?.id ?? '');
}

/**
 * A currency macro's return as `{ valid, message? }`: `true`, or an object with a truthy `success`
 * or `canAfford`, passes; anything else fails with the macro's `message` or the fallback.
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
 * A `balance` macro's return as `readCoins` (issue 1342); separate, since a bare number is a
 * refusal to `interpretMacroSpendResult`. Only a finite number, `0` included, is an answer;
 * anything else, a numeric string too, is `{ valid: false }` ("cannot see"), never a zero.
 */
export function interpretMacroBalanceResult(result, { fallbackMessage } = {}) {
  if (typeof result === 'number' && Number.isFinite(result)) {
    return { valid: true, copperValue: result };
  }
  return {
    valid: false,
    message:
      fallbackMessage ||
      'The "balance" currency macro did not return a number, so the balance could not be read.',
  };
}

/** The default `actorProperty` spender: balances by `actorPath`, one batched `actor.update`. */
export class ActorPropertyCoinSpender {
  readCoins(actor, { profile, unit } = {}) {
    const balances = readCurrencyBalances(actor, profile?.units || []);
    if (!balances.valid) return { valid: false, message: balances.message };
    const baseUnitId = profile?.metadata?.get(unit?.id)?.baseUnitId;
    const copperValue = currencyTotalForBase(balances.balances, profile, baseUnitId);
    return { valid: true, copperValue };
  }

  check(actor, requirement, ctx = {}) {
    return checkAffordabilityViaReadCoins(this, actor, requirement, ctx);
  }

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

  /**
   * Refund by adding the unit's own denomination back in one `actor.update` (issue 848). The
   * write is judged by its return (issue 1301): `Document#update` resolves `undefined` for an empty
   * diff, which an off-schema `actorPath` produces, so that answers `wroteNothing` and a cancel
   * reports `partialRefund`. The test sits inside the zero-updates guard, as a non-positive amount
   * legitimately writes nothing.
   */
  async refund(actor, { unit, amount } = {}, { profile } = {}) {
    const refund = buildCurrencyRefundUpdates(
      actor,
      { unit: unit?.id, amount },
      profile?.units || []
    );
    if (!refund.valid) return { valid: false, wroteNothing: true, message: refund.message };
    if (Object.keys(refund.updates || {}).length > 0) {
      const written = await actor.update(refund.updates);
      if (written === undefined || written === null) {
        return {
          valid: false,
          wroteNothing: true,
          message: `Foundry accepted no change when refunding ${formatCurrencyRequirement({ unit: unit?.id, amount }, profile?.units || [])}. The configured currency path may not exist on this actor.`,
        };
      }
    }
    return { valid: true, formatted: refund.formatted };
  }
}

/**
 * The `actorInventory` spender, delegating coin I/O to a per-system adapter by `game.system.id`
 * (pf2e is the sole entry; an internal map, not a plugin registry). An adapter implements
 * `readCoins(actor)` and `spend(actor, { unit, amount })`; no adapter fails loudly.
 */
export class ActorInventoryCoinSpender {
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
   * Why this world cannot spend, or `null`: actor-independent, so a misconfigured world is never
   * sent to a character sheet; the per-actor sentence stays in `readCoins`.
   */
  describeUnavailable() {
    const { systemId, adapter } = this._resolveAdapter();
    if (adapter) return null;
    return `No currency inventory adapter is registered for system "${systemId || 'unknown'}".`;
  }

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

  check(actor, requirement, ctx = {}) {
    return checkAffordabilityViaReadCoins(this, actor, requirement, ctx);
  }

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

  /** Refund through the adapter's `refund` or `addCoins` (issue 848); none fails loudly. */
  async refund(actor, requirement, { profile } = {}) {
    const { systemId, adapter } = this._resolveAdapter();
    const refund = adapter?.refund ?? adapter?.addCoins;
    if (typeof refund !== 'function') {
      return {
        valid: false,
        message: `No currency inventory refund is available for system "${systemId || 'unknown'}".`,
      };
    }
    try {
      return (await refund.call(adapter, actor, requirement)) ?? { valid: true };
    } catch (error) {
      console.error('Fabricate | Failed to refund inventory currency', error);
      // `thrown`, not `wroteNothing`: a throwing adapter may already have created treasure.
      return {
        valid: false,
        thrown: true,
        message: `Could not refund currency (${formatCurrencyRequirement(requirement, profile?.units || [])}).`,
      };
    }
  }
}

/**
 * The `macro` spender: `canAfford` gates, `decrement` spends, `increment` refunds a player-cancel
 * (issue 848) and `balance` reports holdings (issue 1342). Acting macros go through
 * `interpretMacroSpendResult`, so a `false`, `null` or throw aborts loudly; `balance` goes through
 * `interpretMacroBalanceResult`. The context's `caller` is built by `CURRENCY_SPEND_CALLERS`.
 */
export class MacroCoinSpender {
  /**
   * Slots are copied by iterating `CURRENCY_MACRO_KEYS` (issue 1342), so a new key is never
   * silently dropped. `resolveMacro` defaults to a guarded `fromUuid`, so no Foundry global is
   * needed.
   */
  constructor({ macros = {}, runMacro = MacroExecutor.run, resolveMacro } = {}) {
    this._macros = {};
    for (const key of CURRENCY_MACRO_KEYS) {
      this._macros[key] = String(macros?.[key] || '').trim();
    }
    this._runMacro = typeof runMacro === 'function' ? runMacro : MacroExecutor.run;
    this._resolveMacro =
      typeof resolveMacro === 'function'
        ? resolveMacro
        : async (uuid) => {
            if (typeof fromUuid !== 'function') return null;
            try {
              return await fromUuid(uuid);
            } catch {
              return null;
            }
          };
  }

  /**
   * Why a macro cannot run, or `null`: the resolve-then-gate call-site check `MacroExecutor.js`
   * records (a chat macro is gated here, never in the executor). All four answer `wroteNothing`
   * (`creditNotConfigured`); a missing uuid, a non-string command and a non-`script` type also
   * answer `thrown` (`checkUnavailable`), while a blank command does not, since it already
   * answered `notAffordable` and marking it would move a published answer.
   */
  static _macroRefusal(macro) {
    if (!macro) return { reason: 'could not be found', thrown: true };
    if (typeof macro.command !== 'string') return { reason: 'has no command', thrown: true };
    if (macro.type !== 'script') {
      return { reason: `is a "${macro.type}" macro rather than a script macro`, thrown: true };
    }
    if (macro.command.trim() === '') return { reason: 'is empty', thrown: false };
    return null;
  }

  /**
   * Run an acting macro key. A throw is marked `thrown: true` (issue 1289), so the world-scoped
   * answer never reports a broken macro as a poor actor; the craft paths read only `valid`.
   */
  async _runMacroKey(key, actor, requirement, ctx) {
    const fallbackMessage = `Could not spend currency (${formatCurrencyRequirement({ unit: requirementUnitId(requirement), amount: requirement?.amount }, ctx?.profile?.units || [])}).`;
    return this._invokeMacro(key, ctx, {
      fallbackMessage,
      interpret: (result) => interpretMacroSpendResult(result, { fallbackMessage }),
    });
  }

  /**
   * Resolve, gate and run one macro key; only interpretation differs by key. Every refusal is
   * `{ valid: false }`, never a value, so a balance read that never ran is "cannot see".
   */
  async _invokeMacro(key, ctx, { fallbackMessage, interpret }) {
    const macroUuid = this._macros[key];
    if (!macroUuid) {
      // `wroteNothing`, not `thrown`: a world with no `canAfford` keeps its shipped
      // `checkAffordability` answer.
      return {
        valid: false,
        wroteNothing: true,
        message: `No "${key}" currency macro is configured.`,
      };
    }

    const refusal = MacroCoinSpender._macroRefusal(await this._resolveMacro(macroUuid));
    if (refusal) {
      const message = `The configured "${key}" currency macro ${refusal.reason}, so it did not run.`;
      return refusal.thrown
        ? { valid: false, thrown: true, wroteNothing: true, message }
        : { valid: false, wroteNothing: true, message };
    }

    const context = ctx?.macroContext || {};
    try {
      return interpret(await this._runMacro(macroUuid, context));
    } catch (error) {
      // `thrown`, not `wroteNothing`: a macro that threw part-way may have moved coins, and the
      // credit tests `wroteNothing` first, so it would read as retry-safe.
      console.error(`Fabricate | Currency ${key} macro failed (${macroUuid}):`, error);
      return { valid: false, thrown: true, message: fallbackMessage };
    }
  }

  /**
   * Holdings through the `balance` macro (issue 1342), asynchronously (see the module header).
   * `copperValue` is in the terminal base unit, as on the other spenders; the macro gets the unit
   * in `macroContext.requirement.unit` and a zero-amount `cost`. A refusal never becomes a zero.
   */
  async readCoins(actor, ctx = {}) {
    const fallbackMessage = `Could not read a currency balance for ${actor?.name || 'actor'}: the "balance" currency macro did not return a number.`;
    return this._invokeMacro('balance', ctx, {
      fallbackMessage,
      interpret: (result) => interpretMacroBalanceResult(result, { fallbackMessage }),
    });
  }

  async check(actor, requirement, ctx = {}) {
    return this._runMacroKey('canAfford', actor, requirement, ctx);
  }

  async spend(actor, requirement, ctx = {}) {
    return this._runMacroKey('decrement', actor, requirement, ctx);
  }

  /** Runs `increment`; a missing macro fails loudly (issue 848). */
  async refund(actor, requirement, ctx = {}) {
    return this._runMacroKey('increment', actor, requirement, ctx);
  }
}

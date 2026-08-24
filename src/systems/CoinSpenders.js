import { MacroExecutor } from '../utils/MacroExecutor.js';

import {
  buildCurrencyRefundUpdates,
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
 *
 * ## The two markers on a refusal, and what each one claims (issue 1301)
 *
 * A refusal is `{ valid: false, message }` and may carry either or both of:
 *
 * - **`thrown: true`** — the mechanism DELIVERED NO ANSWER. Named for the outcome class rather
 *   than for a stack unwinding, which is why it is also set where this module refuses BEFORE
 *   delegating to a mechanism that would have thrown. `currencyAffordance.js` reads it to
 *   answer `checkUnavailable`, so what it must keep meaning is "do not report this actor as
 *   poor".
 * - **`wroteNothing: true`** — NOTHING WAS WRITTEN, and this module can prove it, because the
 *   refusal was taken before the write or the write's own return said Foundry accepted no
 *   change. The world-scoped currency credit reads it to answer `creditNotConfigured`.
 *
 * Both are ADDITIVE for every existing caller: the craft paths read only `valid` and `message`,
 * so a broken macro still aborts a craft exactly as it did. The ONE exception is declared where
 * it is made — see {@link ActorPropertyCoinSpender#refund}, which now reports a discarded
 * `actor.update` as a failure and moves the player-cancel refund's shipped answer.
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
 * Resolve a requirement's unit ID from either shape the spender interface is driven with.
 *
 * Every caller in `currencyAffordance.js` hands a spender `{ unit: <the resolved unit OBJECT> }`,
 * while {@link formatCurrencyRequirement} expects `{ unit: <the unit ID> }` and falls back to
 * rendering whatever it was given. Handing it the object therefore rendered a GM-facing message as
 * `Could not spend currency (1 [object Object]).`, which is why this resolution is not optional
 * politeness: the world-scoped affordability answer publishes that message to a companion as its
 * `messageData.detail` (issue 1289).
 */
function requirementUnitId(requirement) {
  const unit = requirement?.unit;
  return typeof unit === 'string' ? unit : (unit?.id ?? '');
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

  /**
   * Refund a previously spent requirement (issue 848) — adds `amount` of the unit's own
   * denomination back to the actor's balance via a single batched `actor.update(...)`.
   *
   * **The write is judged by its own return, and that is a DECLARED BEHAVIOUR CHANGE**
   * (issue 1301). `Document#update` resolves `undefined` when the whole diff is empty, which is
   * exactly what a GM-authored `actorPath` that is not in the actor's data model produces:
   * `SchemaField` prunes the unknown key and the empty diff is skipped, with no error, no hook
   * and no notification. This method answered `{ valid: true }` regardless, so a discarded
   * write reported a successful refund.
   *
   * It now answers `{ valid: false, wroteNothing: true }` there, and that answer is READ: it
   * flows through `applySpenderToGroup` and `refundCurrencySpends` to
   * `CraftingEngine._refundCraftCurrency`, whose `console.error` now fires, and on to
   * `cancelCraft` — so a player cancelling a craft in a mis-typed `actorProperty` world moves
   * from `refunded: true` to `refunded: false, partialRefund: true`. That is the correct
   * report: a discarded write is not a refund.
   *
   * The test sits INSIDE the existing zero-updates guard deliberately.
   * `buildCurrencyRefundUpdates` legitimately answers `{ valid: true, updates: {} }` for a
   * non-positive amount, and outside the guard that no-op would become a reported failure.
   *
   * The pre-write refusal above it is marked `wroteNothing` too, and that one is provably
   * correct rather than merely judged: it RETURNS before `actor.update` is reached. Its
   * producer is a unit whose `actorPath` resolves a value that is present but non-numeric,
   * which `readCurrencyBalances` refuses — on the DEFAULT spend strategy, where an unmarked
   * refusal would otherwise read as a domain answer.
   *
   * @param {object} actor
   * @param {{ unit: object, amount: number }} requirement
   * @param {{ profile: object }} profileContext
   * @returns {Promise<{ valid: boolean, wroteNothing?: boolean, message?: string }>}
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

  /**
   * Refund a previously spent requirement (issue 848). Delegates to the per-system coin adapter's
   * `refund` (falling back to an `addCoins` capability when present). When the adapter offers no
   * refund capability the refund fails loudly with a clear message rather than silently losing coins.
   * @param {object} actor
   * @param {{ unit: object, amount: number }} requirement
   * @param {{ profile: object }} profileContext
   * @returns {Promise<{ valid: boolean, message?: string }>}
   */
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
      // `thrown` and NOT `wroteNothing`: a system adapter that threw part-way may already have
      // created a treasure item, so nothing here can prove the zero. Symmetric with
      // `MacroCoinSpender`'s shipped marker (issue 1301).
      return {
        valid: false,
        thrown: true,
        message: `Could not refund currency (${formatCurrencyRequirement(requirement, profile?.units || [])}).`,
      };
    }
  }
}

/**
 * Macro-backed actor-inventory spender. Under the `actorInventory` strategy's `macro` mode the
 * GM supplies their own currency macros: `canAfford` gates the craft, `decrement` spends, and
 * `increment` refunds. The `increment` macro is invoked by {@link refund} on the player-cancel
 * reversal (issue 848) — the refund flow it was always reserved for. Every macro path builds the
 * agreed context (supplied by the engine via `ctx.macroContext`) and passes the macro's return
 * value through the shared, pure {@link interpretMacroSpendResult}, so a `false`/`null`/throw
 * aborts loudly rather than silently granting a free craft or dropping a refund.
 *
 * The context carries a `caller` discriminator (`'craft'` or `'award'`) and, on an award call,
 * `recipe: null` and `craftingSystem: null` — see `CURRENCY_SPEND_CALLERS` in
 * `currencyAffordance.js`, which builds it.
 */
export class MacroCoinSpender {
  /**
   * @param {object} [options]
   * @param {{ canAfford?: string, increment?: string, decrement?: string }} [options.macros]
   * @param {(uuid: string, context: object) => Promise<any>} [options.runMacro]
   * @param {(uuid: string) => Promise<object|null>} [options.resolveMacro] resolves a macro
   *   document for the gate below; defaults to a guarded `fromUuid`, in the shape
   *   {@link ActorInventoryCoinSpender} already uses for `game.system.id`, so the class stays
   *   drivable without a Foundry global.
   */
  constructor({ macros = {}, runMacro = MacroExecutor.run, resolveMacro } = {}) {
    this._macros = {
      canAfford: String(macros?.canAfford || '').trim(),
      increment: String(macros?.increment || '').trim(),
      decrement: String(macros?.decrement || '').trim(),
    };
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
   * Why this macro cannot be run, or `null` when it can.
   *
   * The RESOLVE-THEN-GATE half of the idiom `MacroExecutor.js:4-18` records: the `type ===
   * 'script'` check is a CALL-SITE check and must not be centralised in the executor, because
   * centralising it would turn a `chat`-type essence property macro from a silent warn into a
   * per-essence-per-result error notification. This is the call site.
   *
   * Four spellings of "the macro never ran", answered identically, because from the GM's side
   * deleting a macro and switching its type to `chat` are the same action. The MARKERS differ
   * by one field, and the split is chosen so that no shipped answer moves:
   *
   * - a uuid resolving to nothing, and a document with no string `command`, THROW today inside
   *   `MacroExecutor.run`, so both keep `thrown: true` and `checkAffordability` keeps answering
   *   `checkUnavailable` for them;
   * - a BLANK or whitespace-only command compiles today and returns `undefined`, which
   *   `interpretMacroSpendResult` turns into an unmarked refusal and `checkAffordability`
   *   answers `notAffordable`. It is therefore `wroteNothing`-only: marking it `thrown` would
   *   move a published member's shipped answer as a side effect of a marker placement, which
   *   belongs to its own change;
   * - a non-`script` type carries `thrown: true`, because a chat macro's text is chat text: it
   *   is compiled as JavaScript at `MacroExecutor.js:90` and throws for any body that is not
   *   also valid JS, so `checkUnavailable` IS its shipped answer in every non-pathological
   *   case, and answering `notAffordable` instead would report a well-funded actor as poor.
   *   The residual is a chat macro whose text happens to be valid JS returning falsy, which
   *   moves from `notAffordable` to `checkUnavailable`.
   *
   * Every one of the four carries `wroteNothing: true`, which is what the world-scoped credit
   * reads to answer `creditNotConfigured` — the same answer for all four, which is the point.
   *
   * @param {object|null} macro
   * @returns {{ reason: string, thrown: boolean }|null}
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
   * Run one configured macro and normalize its answer.
   *
   * The catch branch marks its result `thrown: true` (issue 1289). The field is ADDITIVE and every
   * existing caller is unaffected: the craft paths read only `valid` and `message`, so a broken
   * macro still aborts the craft exactly as it did.
   *
   * It exists because without it a THROWN macro and a GENUINE SHORTFALL were the same value. Both
   * returned `{ valid: false, message }`, so nothing downstream could tell "this macro is broken"
   * from "this actor is poor" — a silent false negative. That cost nothing on the craft path, where
   * either answer correctly refuses the craft, but the world-scoped affordability answer REPORTS
   * its result to a companion and a GM, and reporting a well-funded actor as unable to pay because
   * a craft-shaped macro dereferenced a null `recipe` is a lie. `interpretMacroSpendResult` is
   * deliberately untouched: a `false`/`null` return already aborts loudly, and only the throw path
   * was silent.
   */
  async _runMacroKey(key, actor, requirement, ctx) {
    const macroUuid = this._macros[key];
    const fallbackMessage = `Could not spend currency (${formatCurrencyRequirement({ unit: requirementUnitId(requirement), amount: requirement?.amount }, ctx?.profile?.units || [])}).`;
    if (!macroUuid) {
      // `wroteNothing` and NOT `thrown`, so a `macro` world with no `canAfford` configured
      // answers `checkAffordability` exactly what it answers today. That answer is itself a
      // misconfiguration reported as a domain answer, and it is now DETECTABLE because this
      // marker exists — but widening the reader is a different change's decision.
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
      const result = await this._runMacro(macroUuid, context);
      return interpretMacroSpendResult(result, { fallbackMessage });
    } catch (error) {
      console.error(`Fabricate | Currency ${key} macro failed (${macroUuid}):`, error);
      return { valid: false, thrown: true, message: fallbackMessage };
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

  /**
   * Refund (issue 848) — runs the GM-supplied `increment` macro. This is the refund flow the
   * `increment` macro was always reserved for; a missing macro fails loudly via {@link _runMacroKey}.
   * @returns {Promise<{ valid: boolean, message?: string }>}
   */
  async refund(actor, requirement, ctx = {}) {
    return this._runMacroKey('increment', actor, requirement, ctx);
  }
}

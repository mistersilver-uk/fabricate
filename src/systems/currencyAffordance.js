/**
 * Recipe-currency affordance + spend resolution, shared by {@link CraftingEngine} (the craft-time
 * gate and deduction) and {@link RecipeManager} (the display-time affordability probe).
 *
 * Currency alternatives ({@link Ingredient} `match.type === 'currency'`, `{ unit, amount }`) are
 * resolved at the SELECTION level: ingredient-set resolution chooses an affordable currency option
 * for a group only when no item option satisfies it, and returns the chosen spends as
 * `currencySpends`. This module turns a recipe + actor into:
 *
 *   - a synchronous `affordCurrency(match) -> boolean` probe (display + selection),
 *   - an async all-affordable gate over the chosen `currencySpends` (engine, before any mutation),
 *   - an async deduction over the same spends (engine, after item consumption).
 *
 * It also answers TWO questions that have no recipe at all, and the second one WRITES:
 * {@link checkWorldCurrencyAffordability}, the world-scoped affordability answer the companion
 * contract publishes as `game.fabricate.checkAffordability` (issue 1289), and
 * {@link creditWorldCurrency}, the world-scoped credit it publishes as
 * `game.fabricate.creditCurrency` (issue 1301). Everything above is recipe-keyed and reads a
 * crafting system's participation toggle; those two are not, and deliberately do not — a
 * downtime activity is not a recipe and belongs to no crafting system. They share the world
 * ladder resolution ({@link resolveWorldCurrencyRequest}) and the spend context with the recipe
 * paths, and nothing else.
 *
 * The spend math and validation stay in `currencyProfile.js`; the spenders own the actor I/O. This
 * module only wires the strategy → spender resolution and the cross-unit aggregation.
 */
import {
  ActorPropertyCoinSpender,
  MacroCoinSpender,
  buildAffordCurrencyProbe,
} from './CoinSpenders.js';
import {
  COMPANION_OUTCOMES,
  affordabilityResult,
  currencyCreditResult,
  gateCompanionCallSite,
} from './companionContract.js';
import {
  findCurrencyUnit,
  formatCurrencyRequirement,
  validateCurrencyProfile,
} from './currencyProfile.js';

/**
 * Resolve the WORLD half of the currency configuration — the coin ladder, how coins are read and
 * spent, the provider, and the GM macro set (issue 1278). Every field it emits is world scope; it
 * reads no crafting system and takes no recipe.
 *
 * Extracted so the two scopes are composed in exactly one place ({@link
 * getCurrencyRequirementConfig}) while the world-only reader stays reusable by the world-scoped
 * affordability answer (issue 1289). That answer must be UNABLE to consult a system toggle rather
 * than merely disciplined about not doing so, and this function is what makes that structural: it
 * has no crafting-system seam to reach.
 *
 * Seam-first, global-fallback (issue 1072), with `??` rather than `||` at both hops. The
 * distinction matters at the last one: an injected seam returning `null`/`undefined` is treated as
 * ABSENT and falls through to the global, so a seam cannot express "this world has no ladder"
 * distinctly from "no seam was injected". That is deliberate — both resolve to `{}` here and the
 * caller cannot tell them apart anyway, because an empty ladder and a missing one produce the same
 * refusal downstream: an authored cost against zero units fails `validateCurrencyProfile`, so
 * `resolveCurrencyContext` sets `error`, the probe reads false, and the spend refuses. Display
 * agrees with execution either way. A future seam that needs the two to differ must say so with an
 * explicit sentinel.
 *
 * `globalThis.game?.` rather than a bare `game.`, because this fallback is reached often:
 * `CraftingEngine._currencySeams` returns `() => this.currencyConfigStore?.get()`, which is
 * legitimately `undefined` whenever the store was not injected — the options bag defaults it to
 * `null`. A bare reference throws `ReferenceError` in any context without the Foundry global, and a
 * throw here lands on the craftability path rather than degrading to the empty ladder this line is
 * written to return.
 *
 * @param {{ getCurrencyConfig?: () => object }} [seams]
 * @returns {{ spendStrategy: string, providerId: string, macros: object, units: object[] }}
 */
function resolveWorldCurrencySettings(seams = {}) {
  const world =
    seams.getCurrencyConfig?.() ??
    globalThis.game?.fabricate?.getCurrencyConfigStore?.()?.get() ??
    {};
  const spendStrategy = ['actorInventory', 'macro'].includes(world?.spendStrategy)
    ? world.spendStrategy
    : 'actorProperty';
  return {
    spendStrategy,
    providerId: String(world?.providerId || ''),
    macros: world?.macros && typeof world.macros === 'object' ? world.macros : {},
    units: Array.isArray(world?.units) ? world.units : [],
  };
}

/**
 * Resolve the effective currency config for a recipe, composed from TWO scopes.
 *
 * `enabled` is a per-crafting-system decision (`requirements.currency.enabled`): it says whether
 * this system participates in currency at all. Everything that describes WHAT the currency is —
 * the coin ladder, how coins are read and spent, the provider, the GM macro set — comes from the
 * WORLD config (issue 1278), because a world runs exactly one Foundry game system and so has
 * exactly one way actors store coins.
 *
 * This function is the single chokepoint through which every RECIPE-KEYED currency read composes
 * the two scopes: the engine's afford gate and spend/refund paths,
 * `RecipeManager.evaluateCraftability`, and `CraftingListingBuilder` all reach it via
 * `resolveCurrencyContext`. Composing the two scopes here is what let the config move scope without
 * any engine logic changing. The one currency reader that does NOT pass through here is
 * {@link checkWorldCurrencyAffordability}, and deliberately so: its question has no recipe, so
 * there is no system whose toggle could answer for it.
 *
 * @param {object} recipe
 * @param {{ getCraftingSystemManager?: () => object, getCurrencyConfig?: () => object }} [seams]
 * @returns {{ enabled: boolean, spendStrategy: string, providerId: string, macros: object,
 *   units: object[], system: object }|null}
 */
export function getCurrencyRequirementConfig(recipe, seams = {}) {
  const systemId = recipe?.craftingSystemId;
  if (!systemId) return null;
  // Seam-first, global-fallback (issue 1072). `evaluateCraftability` runs this once per
  // recipe on the player listing path, so it is part of the corpus-scaled read this
  // programme instruments — and a caller that has injected its system manager should not
  // silently reach past it to a `ready`-hook global here. The fallback keeps every
  // existing caller (and the whole engine spend path) byte-for-byte unchanged.
  const systemManager =
    seams.getCraftingSystemManager?.() ?? game.fabricate?.getCraftingSystemManager?.();
  const system = systemManager?.getSystem(systemId);
  if (!system) return null;

  // The world half follows the same seam-first, global-fallback rule, for the same reason.
  return {
    enabled: system?.requirements?.currency?.enabled === true,
    ...resolveWorldCurrencySettings(seams),
    system,
  };
}

/**
 * Resolve the coin spender for a spend strategy. `actorInventory` resolves the per-system inventory
 * spender (injected or via the `game.fabricate` accessor); `macro` builds a per-config macro
 * spender; `actorProperty` (default) is the generic property spender.
 *
 * `runMacro` and `resolveMacro` are optional seams on the `macro` branch alone, so a test can
 * drive the REAL {@link MacroCoinSpender} — including its throw handling and its resolve-then-gate
 * refusals — without a Foundry macro document or a `fromUuid` global. Omitting either is
 * byte-equivalent to the previous construction: the spender's own constructor falls back to
 * `MacroExecutor.run` and to a guarded `fromUuid` for anything that is not a function.
 *
 * @param {{ spendStrategy?: string, macros?: object }} config
 * @param {{ actorInventoryCoinSpender?: object|null, actorPropertyCoinSpender?: object|null,
 *   getCraftingSystemManager?: () => object,
 *   runMacro?: (uuid: string, context: object) => Promise<any>,
 *   resolveMacro?: (uuid: string) => Promise<object|null> }} [seams]
 */
export function resolveCoinSpender(config = {}, seams = {}) {
  if (config.spendStrategy === 'actorInventory') {
    return (
      seams.actorInventoryCoinSpender || game.fabricate?.getActorInventoryCoinSpender?.() || null
    );
  }
  if (config.spendStrategy === 'macro') {
    return new MacroCoinSpender({
      macros: config.macros,
      runMacro: seams.runMacro,
      resolveMacro: seams.resolveMacro,
    });
  }
  return (
    seams.actorPropertyCoinSpender ||
    game.fabricate?.getActorPropertyCoinSpender?.() ||
    new ActorPropertyCoinSpender()
  );
}

/**
 * Resolve everything the affordance/spend layer needs for a recipe: the config, the validated
 * profile, and the resolved spender. Returns `{ enabled: false }` when currency is disabled or the
 * config is absent, and `{ error }` when the profile is invalid.
 *
 * @param {object} recipe
 * @param {{ actorInventoryCoinSpender?: object|null, actorPropertyCoinSpender?: object|null,
 *   getCraftingSystemManager?: () => object }} [seams]
 */
export function resolveCurrencyContext(recipe, seams = {}) {
  const config = getCurrencyRequirementConfig(recipe, seams);
  if (!config?.enabled) return { enabled: false };

  const profile = validateCurrencyProfile(config.units || [], {
    spendStrategy: config.spendStrategy,
    macros: config.macros,
  });
  if (!profile.valid) {
    return {
      enabled: true,
      error: `Currency configuration is invalid: ${profile.errors.join('; ')}`,
      config,
      profile,
    };
  }
  const spender = resolveCoinSpender(config, seams);
  return { enabled: true, config, profile, spender };
}

/**
 * Build the synchronous `affordCurrency(match) -> boolean` probe bound to `craftingActor` and the
 * recipe's currency profile. Returns a probe that is ALWAYS `false` (currency never satisfies) when
 * currency is disabled, misconfigured, or no actor is supplied — so display agrees with execution
 * and a null actor never crashes (currency simply shows missing).
 *
 * @param {object|null} craftingActor
 * @param {object} recipe
 * @param {{ actorInventoryCoinSpender?: object|null, actorPropertyCoinSpender?: object|null,
 *   getCraftingSystemManager?: () => object }} [seams]
 * @returns {(match: object) => boolean}
 */
export function buildCurrencyAffordProbe(craftingActor, recipe, seams = {}) {
  const context = resolveCurrencyContext(recipe, seams);
  if (!context.enabled || context.error) return () => false;
  return buildAffordCurrencyProbe({
    actor: craftingActor || null,
    profile: context.profile,
    spendStrategy: context.config.spendStrategy,
    spender: context.spender,
  });
}

/**
 * Resolve one raw spend against the profile: its unit, its TERMINAL base unit, that unit's integer
 * base value, and the clamped amount. Returns `null` for a spend that is not spendable at all — an
 * unresolvable unit, a unit that reaches no base unit, or a non-positive amount.
 *
 * Shared by {@link aggregateCurrencySpends} (which groups by `baseUnitId`) and
 * {@link settledCurrencySpends} (which filters raw spends back down to the groups that settled).
 * The two MUST agree on what is droppable, so the rule lives here once.
 *
 * @param {{ unit?: string, amount?: number }} spend
 * @param {object} profile - a validated currency profile.
 * @returns {{ unit: object, baseUnitId: string, baseValue: number, amount: number }|null}
 */
function resolveSpendBaseUnit(spend, profile) {
  const unit = findCurrencyUnit(profile?.units || [], spend?.unit);
  if (!unit) return null;
  const meta = profile?.metadata?.get(unit.id);
  const baseValue = Number(meta?.baseValue) || 0;
  const amount = Math.max(0, Number(spend?.amount) || 0);
  if (!meta?.baseUnitId || baseValue <= 0 || amount <= 0) return null;
  return { unit, baseUnitId: meta.baseUnitId, baseValue, amount };
}

/**
 * Aggregate the chosen `currencySpends` by their COMMON base unit value, so units on the same
 * ladder share coins (e.g. 1 gp + 50 sp checked as one combined copper requirement). Spends whose
 * unit is unknown or non-positive are dropped. The returned groups are keyed by `baseUnitId`, each
 * carrying the combined base value and a representative requirement unit (the highest-value unit
 * in the group) so a single spend can settle the whole group.
 *
 * @param {Array<{unit: string, amount: number}>} currencySpends
 * @param {object} profile - a validated currency profile.
 * @returns {Array<{ baseUnitId: string, requiredBase: number, unit: object, amount: number }>}
 */
export function aggregateCurrencySpends(currencySpends, profile) {
  const byBase = new Map();
  for (const spend of currencySpends || []) {
    const resolved = resolveSpendBaseUnit(spend, profile);
    if (!resolved) continue;
    const { unit, baseUnitId, baseValue, amount } = resolved;
    const base = amount * baseValue;
    const existing = byBase.get(baseUnitId);
    if (!existing) {
      byBase.set(baseUnitId, { baseUnitId, requiredBase: base, unit, baseValue });
      continue;
    }
    existing.requiredBase += base;
    // Keep the highest-value unit as the group's representative so the deduction unit
    // makes change across the ladder rather than spending an absurd count of a tiny coin.
    if (baseValue > existing.baseValue) {
      existing.unit = unit;
      existing.baseValue = baseValue;
    }
  }
  // Express each group's combined base requirement back in the representative unit. The base is an
  // exact multiple of the representative unit's base value only when every contributing unit's
  // value divides it; when it does not, round UP so the gate never under-charges.
  return [...byBase.values()].map((group) => ({
    baseUnitId: group.baseUnitId,
    requiredBase: group.requiredBase,
    unit: group.unit,
    amount: Math.ceil(group.requiredBase / group.baseValue),
  }));
}

/**
 * WHO is asking a currency macro its question — the discriminator carried on both the spender `ctx`
 * and the `macroContext` a GM's macro actually receives (issue 1289).
 *
 * A GM authors one `canAfford` macro, and before this discriminator existed the only signal that a
 * call was not a craft was `recipe` and `craftingSystem` arriving `null`. A macro written for
 * crafts that dereferences `context.recipe.name` therefore threw on an award call, was swallowed by
 * {@link MacroCoinSpender}, and reported a well-funded actor as unable to pay. A discriminator a
 * macro can TEST beats a null it must infer, so the token is positive on BOTH arms: the craft path
 * says `craft` rather than leaving the field absent, and a macro can branch before it touches
 * anything craft-shaped.
 *
 * Declared beside the context builder, and frozen, for the reason the navigation seam declares its
 * tone classes beside its tone list: a third caller added without a token of its own is then a
 * syntactically visible omission rather than an `undefined` a macro silently reads as "not an
 * award".
 */
export const CURRENCY_SPEND_CALLERS = Object.freeze({
  craft: 'craft',
  award: 'award',
});

/**
 * Build the spender `ctx` for a single aggregated requirement (the shape the property/inventory
 * spenders read, plus the macro context the {@link MacroCoinSpender} reads).
 *
 * `caller` is REQUIRED and is never defaulted. Defaulting it to `craft` would make an award call
 * site that forgot to pass one indistinguishable from a craft — which is the exact confusion the
 * discriminator exists to remove — and a macro reading `undefined` cannot tell a missing field from
 * an unrecognised one.
 *
 * `config` is the composed two-scope config on the craft paths and `null` on the award path, whose
 * question belongs to no crafting system; `craftingSystem` is therefore `null` there by
 * construction rather than by a branch that could be forgotten.
 */
function buildSpendContext({ profile, unit, amount, recipe, config, caller }) {
  const requirement = { unit: unit.id, amount };
  const craftingSystem = config?.system || null;
  return {
    profile,
    unit,
    units: profile.units,
    requirement,
    recipe,
    craftingSystem,
    caller,
    macroContext: {
      actor: null,
      cost: [{ abbreviation: unit.abbreviation, amount }],
      units: (profile.units || []).map((entry) => ({
        id: entry.id,
        abbreviation: entry.abbreviation,
        label: entry.label,
      })),
      requirement: { unit: unit.id, amount },
      recipe,
      craftingSystem,
      caller,
    },
  };
}

/**
 * Async all-affordable gate over the chosen `currencySpends`. Aggregates cross-unit on the common
 * ladder, then runs each spender `check`. Returns `{ valid: true }` only when EVERY aggregated
 * requirement is affordable; on the first shortfall returns `{ valid: false, message }` with the
 * shortfall requirement formatted. Runs BEFORE any mutation.
 *
 * @returns {Promise<{ valid: boolean, message?: string }>}
 */
export async function checkCurrencySpends(craftingActor, recipe, currencySpends, seams = {}) {
  if (!currencySpends?.length) return { valid: true };
  const context = resolveCurrencyContext(recipe, seams);
  if (!context.enabled) return { valid: true };
  if (context.error) return { valid: false, message: context.error };
  const { profile, config, spender } = context;
  if (!spender?.check) {
    return { valid: false, message: 'Currency spending is not available on this actor.' };
  }

  for (const group of aggregateCurrencySpends(currencySpends, profile)) {
    const ctx = buildSpendContext({
      profile,
      unit: group.unit,
      amount: group.amount,
      recipe,
      config,
      caller: CURRENCY_SPEND_CALLERS.craft,
    });
    ctx.macroContext.actor = craftingActor;
    const result = await spender.check(
      craftingActor,
      { unit: group.unit, amount: group.amount },
      ctx
    );
    if (!result?.valid) {
      return {
        valid: false,
        message:
          result?.message ||
          `Insufficient currency. Requires ${formatCurrencyRequirement({ unit: group.unit.id, amount: group.amount }, profile.units)}.`,
      };
    }
  }
  return { valid: true };
}

/**
 * Filter the raw `currencySpends` down to the ones whose aggregated group actually settled.
 *
 * `aggregateCurrencySpends` discards which raw spends fed each group, so each spend's terminal
 * `baseUnitId` is re-derived here through the same {@link resolveSpendBaseUnit} rule. A group
 * settles or fails as one transaction (it is spent once, in its representative denomination), so
 * every raw spend feeding a settled group settled. Spends that aggregation drops entirely were
 * never spendable and are dropped from the record too.
 *
 * @param {Array<{unit: string, amount: number}>} currencySpends
 * @param {object} profile - a validated currency profile.
 * @param {Set<string>} settledBaseUnitIds
 * @returns {Array<{unit: string, amount: number}>}
 */
function settledCurrencySpends(currencySpends, profile, settledBaseUnitIds) {
  const settled = [];
  for (const spend of currencySpends || []) {
    const resolved = resolveSpendBaseUnit(spend, profile);
    if (!resolved || !settledBaseUnitIds.has(resolved.baseUnitId)) continue;
    settled.push(spend);
  }
  return settled;
}

/**
 * Build one aggregated group's outcome record. `outcomeKey` is `settled` for a deduction and
 * `refunded` for a refund; `attempted` distinguishes "tried and failed" from "never tried",
 * which a deduction's abort-on-first-group makes a real distinction and not bookkeeping.
 */
function groupOutcomeRecord(group, outcomeKey, { attempted, ok, message } = {}) {
  const record = {
    baseUnitId: group.baseUnitId,
    unitId: group.unit.id,
    amount: group.amount,
    requiredBase: group.requiredBase,
    attempted: attempted === true,
    [outcomeKey]: ok === true,
  };
  if (message) record.message = message;
  return record;
}

/**
 * Invoke one spender method against one aggregated group, normalising a falsy result and a thrown
 * error into the same `{ ok: false, message }` shape. Shared by the deduction and the refund so
 * their per-group mechanics cannot drift; only their LOOPS differ (see below).
 */
async function applySpenderToGroup({
  spender,
  method,
  verb,
  logVerb,
  craftingActor,
  group,
  profile,
  recipe,
  config,
}) {
  const ctx = buildSpendContext({
    profile,
    unit: group.unit,
    amount: group.amount,
    recipe,
    config,
    caller: CURRENCY_SPEND_CALLERS.craft,
  });
  ctx.macroContext.actor = craftingActor;
  const fallbackMessage = `Could not ${verb} currency (${formatCurrencyRequirement({ unit: group.unit.id, amount: group.amount }, profile.units)}).`;
  try {
    const result = await spender[method](
      craftingActor,
      { unit: group.unit, amount: group.amount },
      ctx
    );
    if (result?.valid) return { ok: true };
    return { ok: false, message: result?.message || fallbackMessage };
  } catch (error) {
    console.error(`Fabricate | Failed to ${logVerb} currency`, error);
    return { ok: false, message: fallbackMessage };
  }
}

/**
 * Drive the deduction across the aggregated groups, ABORTING at the first failure: no further
 * currency is taken for a craft already in an anomalous state. The remaining groups are still
 * reported, as `attempted: false`, so a caller can tell "tried and failed" from "never tried".
 */
async function runSpendGroups({ spender, craftingActor, groups, profile, recipe, config }) {
  const records = [];
  let failure = null;
  for (const group of groups) {
    if (failure !== null) {
      records.push(groupOutcomeRecord(group, 'settled', { attempted: false, ok: false }));
      continue;
    }
    const outcome = await applySpenderToGroup({
      spender,
      method: 'spend',
      verb: 'spend',
      logVerb: 'decrement',
      craftingActor,
      group,
      profile,
      recipe,
      config,
    });
    records.push(
      groupOutcomeRecord(group, 'settled', {
        attempted: true,
        ok: outcome.ok,
        message: outcome.message,
      })
    );
    if (!outcome.ok) failure = outcome.message;
  }
  return { records, failure };
}

/**
 * Async deduction over the chosen `currencySpends`, aggregated cross-unit. Runs AFTER item
 * consumption on success (or on a failure path only when the failure policy consumes ingredients).
 * A spend failure is logged and never refunded — the settled deductions are NOT rolled back and
 * the craft still proceeds — so the deduction ABORTS at the first failing group and reports which
 * groups settled.
 *
 * That report is load-bearing, not diagnostic (issue 902). Because a failure neither aborts the
 * craft nor rolls back, the only way a time-gated step's run can stay honest is to record what
 * SETTLED rather than what was planned; `settledSpends` is exactly that record, already filtered.
 *
 * @returns {Promise<{ valid: boolean, message?: string,
 *   groups: Array<{ baseUnitId: string, unitId: string, amount: number, requiredBase: number,
 *     attempted: boolean, settled: boolean, message?: string }>,
 *   settledSpends: Array<{unit: string, amount: number}> }>}
 */
export async function spendCurrencySpends(craftingActor, recipe, currencySpends, seams = {}) {
  // Nothing to spend, or currency is off: nothing settled, so the record is empty — which is
  // the correct record, not a missing one.
  if (!currencySpends?.length) return { valid: true, groups: [], settledSpends: [] };
  const context = resolveCurrencyContext(recipe, seams);
  if (!context.enabled) return { valid: true, groups: [], settledSpends: [] };
  if (context.error) {
    return { valid: false, message: context.error, groups: [], settledSpends: [] };
  }
  const { profile, config, spender } = context;
  const groups = aggregateCurrencySpends(currencySpends, profile);
  if (!spender?.spend) {
    const message = 'Currency spending is not available on this actor.';
    return {
      valid: false,
      message,
      groups: groups.map((group) =>
        groupOutcomeRecord(group, 'settled', { attempted: false, ok: false, message })
      ),
      settledSpends: [],
    };
  }

  const { records, failure } = await runSpendGroups({
    spender,
    craftingActor,
    groups,
    profile,
    recipe,
    config,
  });
  const settledBaseUnitIds = new Set(
    records.filter((record) => record.settled).map((record) => record.baseUnitId)
  );
  const result = {
    valid: failure === null,
    groups: records,
    settledSpends: settledCurrencySpends(currencySpends, profile, settledBaseUnitIds),
  };
  if (failure) result.message = failure;
  return result;
}

/**
 * Async REFUND over previously spent `currencySpends`, aggregated cross-unit — the inverse of
 * {@link spendCurrencySpends}. Used by the player-cancel reversal (issue 848) and shared with the
 * GM cancel/reverse (issue 847) so the un-spend logic is defined once. Each aggregated group is
 * handed back in its representative denomination, so the actor's total base value is restored.
 *
 * Unlike the deduction, the refund ACCUMULATES rather than aborting (issue 902): every group is
 * attempted even when an earlier one fails, because §RunModel requires the reversal to be
 * best-effort, and a group left unrefunded because an unrelated group failed is currency stranded
 * for no reason. The asymmetry is deliberate — the deduction bounds the loss by stopping, the
 * refund bounds the stranding by continuing.
 *
 * Returns `{ valid: true, groups: [] }` when currency is disabled or there is nothing to refund.
 *
 * @returns {Promise<{ valid: boolean, message?: string,
 *   groups: Array<{ baseUnitId: string, unitId: string, amount: number, requiredBase: number,
 *     attempted: boolean, refunded: boolean, message?: string }> }>}
 */
export async function refundCurrencySpends(craftingActor, recipe, currencySpends, seams = {}) {
  if (!currencySpends?.length) return { valid: true, groups: [] };
  const context = resolveCurrencyContext(recipe, seams);
  if (!context.enabled) return { valid: true, groups: [] };
  if (context.error) return { valid: false, message: context.error, groups: [] };
  const { profile, config, spender } = context;
  const groups = aggregateCurrencySpends(currencySpends, profile);
  if (!spender?.refund) {
    const message = 'Currency refund is not available on this actor.';
    return {
      valid: false,
      message,
      groups: groups.map((group) =>
        groupOutcomeRecord(group, 'refunded', { attempted: false, ok: false, message })
      ),
    };
  }

  const records = [];
  let firstFailure = null;
  for (const group of groups) {
    const outcome = await applySpenderToGroup({
      spender,
      method: 'refund',
      verb: 'refund',
      logVerb: 'refund',
      craftingActor,
      group,
      profile,
      recipe,
      config,
    });
    records.push(
      groupOutcomeRecord(group, 'refunded', {
        attempted: true,
        ok: outcome.ok,
        message: outcome.message,
      })
    );
    if (!outcome.ok && firstFailure === null) firstFailure = outcome.message;
  }
  const result = { valid: firstFailure === null, groups: records };
  if (firstFailure) result.message = firstFailure;
  return result;
}

// ---------------------------------------------------------------------------
// The WORLD-scoped affordability answer (issue 1289) and the WORLD-scoped credit (issue 1301).
//
// Everything above this line is recipe-keyed: it reaches a crafting system through
// `getCurrencyRequirementConfig` and short-circuits on that system's own participation toggle.
// A downtime activity settled by a companion is not a recipe and belongs to no crafting system, so
// these answers read the WORLD ladder alone and never resolve a system at all.
//
// The credit lives HERE, beside the check, rather than in a leaf of its own: it needs
// `resolveWorldCurrencySettings` and `buildSpendContext`, both private, and exporting them to
// feed a new module would widen a heavily-shared module's surface for no gain. Co-location is
// also what makes the check and the credit share their request resolution STRUCTURALLY rather
// than by discipline — see `resolveWorldCurrencyRequest`, which both call.
// ---------------------------------------------------------------------------

/**
 * Normalize a caller-supplied cost amount, REFUSING rather than coercing.
 *
 * A numeric string is accepted, because a companion reading an authored activity field legitimately
 * holds one and `Number('5')` is unambiguous. Everything else is refused rather than coerced:
 * `Number(true)` is `1`, so a coerced boolean would silently mean "one coin", and `Number([])` is
 * `0`, which this function must distinguish from a real zero rather than merge with it.
 *
 * @param {*} amount
 * @returns {number|null} the positive finite amount, or `null` when there is no usable one
 */
function coerceRequestedAmount(amount) {
  return typeof amount === 'number' || (typeof amount === 'string' && amount.trim() !== '')
    ? Number(amount)
    : NaN;
}

function resolveRequestedAmount(amount) {
  const numeric = coerceRequestedAmount(amount);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * The CREDIT's amount rule, which is deliberately NARROWER than the check's.
 *
 * `buildCurrencyRefundUpdates` does `Math.trunc`, so a credit of `2.5` would silently write `2`
 * — and a truncated coin amount is a different amount, on the same reasoning `normalizeGrantedBy`
 * refuses to truncate a label. `Number.isSafeInteger` rather than a bare integer test is a
 * CORRECTNESS floor rather than a policy: beyond it, `current + amount` in
 * `buildCurrencyRefundUpdates` silently stops being exact.
 *
 * {@link checkWorldCurrencyAffordability} is NOT narrowed to match, and must not be: narrowing
 * what a published member accepts is a `schemaVersion` bump, so the check still prices `2.5 gp`.
 * The asymmetry is deliberate and is pinned, so that a later harmonising tidy-up fails a test
 * rather than a companion's world.
 *
 * @param {*} amount
 * @returns {number|null} the whole positive amount, or `null` when there is no usable one
 */
function resolveCreditAmount(amount) {
  const numeric = coerceRequestedAmount(amount);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

/**
 * The human name of a resolved unit, through the same `abbreviation` → `label` → `id` chain
 * {@link formatCurrencyRequirement} uses, so the contract's message and a craft-time shortfall
 * message name the same coin the same way. Split out because the localization keys interpolate the
 * amount and the unit into SEPARATE placeholders, which a preformatted `"1 gp"` cannot fill.
 */
function unitDisplayName(unit) {
  return unit?.abbreviation || unit?.label || unit?.id || '';
}

/**
 * Resolve a world-scoped currency REQUEST — the amount, the ladder, the validated profile and
 * the unit — for both members that ask one (issue 1301, D8).
 *
 * Extracted from {@link checkWorldCurrencyAffordability}'s prefix so that `"50 gp"` means the
 * same thing to the check and to the credit STRUCTURALLY rather than by discipline: two copies
 * of a denomination resolution eventually disagree about what a unit is.
 *
 * The four refusals are REUSED BY TOKEN — `invalidAmount`, `ladderEmpty`, `ladderInvalid` and
 * `unitNotFound` are already declared and a fifth spelling of "no such unit" would be new
 * vocabulary for an identical fact — while each member supplies its OWN key table, because a
 * failed credit must not report itself in the words of a failed check. That is why this
 * function answers a TOKEN and a `messageData` bag rather than a built result.
 *
 * The ordering the check's own comment calls load-bearing is preserved for both callers: the
 * unit and the amount resolve BEFORE any spender is invoked.
 *
 * @param {*} unitId
 * @param {*} amount
 * @param {object} [seams]
 * @param {(amount: *) => number|null} [resolveAmount] the CALLER's amount rule; the credit's is
 *   narrower than the check's (see {@link resolveCreditAmount})
 * @returns {{outcome: string, messageData: object|null}|{outcome: null, unit: object,
 *   amount: number, baseValue: number, profile: object, world: object}}
 */
function resolveWorldCurrencyRequest(
  unitId,
  amount,
  seams = {},
  resolveAmount = resolveRequestedAmount
) {
  // The caller's own arguments are validated first, because they are the ones whose refusal
  // points at the call site; the world configuration is the GM's problem and is reported after.
  const requested = resolveAmount(amount);
  if (requested === null) {
    return { outcome: COMPANION_OUTCOMES.invalidAmount, messageData: null };
  }

  const world = resolveWorldCurrencySettings(seams);
  // An empty ladder is separated from an invalid one because they are different people's
  // problems: a world that has never been configured versus one whose configuration is broken.
  if (world.units.length === 0) {
    return { outcome: COMPANION_OUTCOMES.ladderEmpty, messageData: null };
  }

  const profile = validateCurrencyProfile(world.units, {
    spendStrategy: world.spendStrategy,
    macros: world.macros,
  });
  if (!profile.valid) {
    return {
      outcome: COMPANION_OUTCOMES.ladderInvalid,
      messageData: { detail: profile.errors.join('; ') },
    };
  }

  // `unitNotFound` covers both "no such unit" and the degenerate "a unit that reaches no base
  // unit", because a caller can do nothing different about them and both would otherwise price
  // the cost at zero. A valid profile resolves every unit, so the second half is a guard against
  // a future resolver change rather than a state reachable today.
  const unit = findCurrencyUnit(profile.units, unitId);
  const baseValue = Number(profile.metadata?.get(unit?.id)?.baseValue) || 0;
  if (!unit || baseValue <= 0) {
    return {
      outcome: COMPANION_OUTCOMES.unitNotFound,
      messageData: { unit: String(unitId ?? '') },
    };
  }

  return { outcome: null, unit, amount: requested, baseValue, profile, world };
}

/**
 * Run the resolved spender's `check` and turn its answer into a contract result.
 *
 * Three answers, not two, and the third is the point (issue 1289). A macro that THREW is reported
 * as `checkUnavailable` — the question could not be answered — rather than as `notAffordable`,
 * because the shipped catch branch returned the identical `{ valid: false, message }` a genuine
 * shortfall returns, so a GM macro broken on the award path reported a well-funded actor as unable
 * to pay and nothing downstream could tell the two apart. {@link MacroCoinSpender} marks its catch
 * with `thrown: true` for exactly this discrimination.
 *
 * A spender that throws OUTRIGHT is caught here for the same reason and, additionally, because a
 * `stable` contract member never throws: it is called inside a GM's automation tick, after other
 * side effects have committed, where a throw aborts work mid-flight.
 */
async function runWorldAffordabilityCheck({ actor, unit, amount, profile, world, seams }) {
  const spender = resolveCoinSpender(world, seams);
  const described = { actor: actor?.name || '', amount, unit: unitDisplayName(unit) };
  if (typeof spender?.check !== 'function') {
    return affordabilityResult(COMPANION_OUTCOMES.checkUnavailable, {
      detail: `No currency spender is available for the "${world.spendStrategy}" spend strategy.`,
    });
  }

  const ctx = buildSpendContext({
    profile,
    unit,
    amount,
    // This question has no recipe and no crafting system. Passing them as `null` is the whole
    // reason the macro context needed a positive `caller` token.
    recipe: null,
    config: null,
    caller: CURRENCY_SPEND_CALLERS.award,
  });
  ctx.macroContext.actor = actor || null;

  let result;
  try {
    result = await spender.check(actor || null, { unit, amount }, ctx);
  } catch (error) {
    console.error('Fabricate | Currency affordability check failed', error);
    return affordabilityResult(COMPANION_OUTCOMES.checkUnavailable, {
      detail: error?.message || String(error),
    });
  }

  if (result?.thrown === true) {
    return affordabilityResult(COMPANION_OUTCOMES.checkUnavailable, {
      detail: result.message || '',
    });
  }
  if (result?.valid) return affordabilityResult(COMPANION_OUTCOMES.affordable, described);
  // The spender's own free text is the shortfall itself ("Insufficient currency. Requires 1 gp."),
  // so it rides as `detail` while `message` stays a localization key.
  return affordabilityResult(COMPANION_OUTCOMES.notAffordable, {
    ...described,
    detail: result?.message || '',
  });
}

/**
 * Answer whether an actor can afford `amount` of `unitId` against the WORLD currency ladder — the
 * behaviour published as `game.fabricate.checkAffordability` (issue 1289).
 *
 * **World scope, never a crafting system.** The answer consults no system's `requirements.currency`
 * toggle, resolves no system, and calls no system-manager seam.
 *
 * **Single unit, deliberately.** The reader compares the actor's TOTAL base value across the whole
 * ladder branch, so 10 sp satisfies a 1 gp cost and a caller performs no aggregation of its own.
 *
 * **The unit and the amount are resolved BEFORE any spender is invoked**, and that ordering is
 * load-bearing rather than defensive. The craft path's only unknown-unit guard lives inside
 * `aggregateCurrencySpends` (see `resolveSpendBaseUnit`), which is precisely the step a single-unit
 * question skips. Skipping it too would compute `baseValue = 0`, hence `requiredBase = 0`, hence
 * `copperValue >= 0`, hence `valid: true` — an unknown unit id, and an amount of zero, would both
 * read as AFFORDABLE. So each is a refusal, and a refusal answers `affordable: null`: the builder
 * derives that field from the outcome, so "the actor is short" and "the question could not be
 * answered" can never collapse into the same confident `false`.
 *
 * Performs no write. The GM gate, the actor resolution and the readiness refusal belong to the
 * facade member that wraps this function, which resolves the `actorId` this function is handed the
 * document for.
 *
 * @param {object|null} actor - the already-resolved actor whose purse is read.
 * @param {{ unitId?: string, amount?: number }} request
 * @param {{ getCurrencyConfig?: () => object, actorPropertyCoinSpender?: object|null,
 *   actorInventoryCoinSpender?: object|null,
 *   runMacro?: (uuid: string, context: object) => Promise<any> }} [seams]
 * @returns {Promise<Readonly<{success: boolean, affordable: boolean|null, outcome: string,
 *   message: string, messageData?: object}>>}
 */
export async function checkWorldCurrencyAffordability(actor, { unitId, amount } = {}, seams = {}) {
  const request = resolveWorldCurrencyRequest(unitId, amount, seams);
  if (request.outcome) return affordabilityResult(request.outcome, request.messageData);

  const { unit, amount: requested, profile, world } = request;
  return runWorldAffordabilityCheck({ actor, unit, amount: requested, profile, world, seams });
}

/**
 * Read the actor's coin balance through the spender's own `readCoins`, normalising a missing
 * reader, a refusal and a throw into one shape.
 *
 * Used ONLY by the `actorInventory` credit arm, which is the one arm whose own answer carries
 * no information: `ActorInventoryCoinSpender.refund` returns `(await refund.call(...)) ?? {
 * valid: true }`, and the sole registered adapter returns `{ valid: true }` after a VOID
 * `addCoins`. Without an observation the member would report `credited: amount` for a write it
 * never saw.
 *
 * @param {object|null} spender
 * @param {object|null} actor
 * @param {{profile: object, unit: object, units: object[]}} context
 * @returns {Promise<{valid: boolean, copperValue?: number, message?: string}>}
 */
async function readCreditBalance(spender, actor, context) {
  if (typeof spender?.readCoins !== 'function') {
    return { valid: false, message: "This currency spender cannot read the actor's balance." };
  }
  try {
    const read = await spender.readCoins(actor || null, context);
    if (!read?.valid) {
      return {
        valid: false,
        message: read?.message || "The actor's coin balance could not be read.",
      };
    }
    return { valid: true, copperValue: Number(read.copperValue) || 0 };
  } catch (error) {
    console.error('Fabricate | Could not read a coin balance for a currency credit', error);
    return { valid: false, message: error?.message || String(error) };
  }
}

/**
 * Judge an `actorInventory` credit by the OBSERVED copper delta rather than by what the adapter
 * said (issue 1301, D7b).
 *
 * Three answers, and the third is the deliberate trade: a delta that is neither zero nor the
 * expected one means a mechanism ran and what it credited is not what was asked, so Fabricate
 * publishes NO number. That fails to the safe side — a player spending coins mid-credit yields
 * an unknown-labelled log entry rather than a wrong one, and because `creditUnavailable` sits
 * OUTSIDE the published zero-mutation set a compliant companion does not retry, so the race
 * cannot become a double credit.
 *
 * A zero delta is `creditFailed` rather than `creditNotConfigured` for the same reason it is not
 * in the zero-mutation set: a concurrent spend could have masked a real write, so Fabricate
 * observed the zero but cannot PROVE it.
 */
async function judgeObservedCredit({
  spender,
  actor,
  context,
  before,
  expected,
  amount,
  described,
}) {
  const read = await readCreditBalance(spender, actor, context);
  if (!read.valid) {
    return currencyCreditResult(COMPANION_OUTCOMES.creditUnavailable, { detail: read.message });
  }
  const delta = read.copperValue - before;
  if (delta === expected) {
    return currencyCreditResult(COMPANION_OUTCOMES.credited, described, { amount });
  }
  if (delta === 0) {
    return currencyCreditResult(COMPANION_OUTCOMES.creditFailed, {
      detail: "The currency mechanism ran and the actor's coin balance did not change.",
    });
  }
  return currencyCreditResult(COMPANION_OUTCOMES.creditUnavailable, {
    detail: `The actor's coin balance changed by ${delta} rather than the expected ${expected}, so no credited amount is reported.`,
  });
}

/**
 * Invoke the resolved spender's `refund` and turn its answer into a contract result.
 *
 * It mirrors {@link runWorldAffordabilityCheck}'s structure verbatim, and for the same reasons:
 * an outer `try/catch` because `ActorPropertyCoinSpender.refund` has none of its own and
 * `actor.update` genuinely rejects on a server-side refusal, and a separate MARKER test on the
 * result because a `stable` contract member never throws and must still tell a broken mechanism
 * from a declining one.
 *
 * The marker ladder is tested `wroteNothing` FIRST, then `thrown`. The macro spender's
 * resolve-then-gate refusal carries both — `thrown` solely so that the shipped
 * {@link runWorldAffordabilityCheck} test keeps answering `checkUnavailable` exactly as it does
 * today — so the order is what routes "the mechanism never ran" to `creditNotConfigured` here
 * while moving no shipped answer there.
 */
async function runWorldCurrencyCredit({ actor, unit, amount, baseValue, profile, world, seams }) {
  const spender = resolveCoinSpender(world, seams);
  // Detected BEFORE anything is invoked, exactly as the check detects it: without this guard the
  // member calls `null.refund` and THROWS, which a `stable` member may not do. A spender object
  // present but with no `refund` function is the same producer.
  if (typeof spender?.refund !== 'function') {
    return currencyCreditResult(COMPANION_OUTCOMES.creditNotConfigured, {
      detail: `No currency spender is available for the "${world.spendStrategy}" spend strategy.`,
    });
  }

  const ctx = buildSpendContext({
    profile,
    unit,
    amount,
    // This credit has no recipe and no crafting system. Under `spendStrategy: 'macro'` it runs
    // the GM's `increment` macro — until now reached only by the player-cancel refund — so the
    // `caller` token is what lets that macro tell a companion credit from a cancelled craft.
    recipe: null,
    config: null,
    caller: CURRENCY_SPEND_CALLERS.award,
  });
  ctx.macroContext.actor = actor || null;

  // VERIFIED on `actorInventory` alone, by name (D7b). `actorProperty` is made truthful by the
  // spender testing `actor.update`'s own return, which is stronger than a re-read and raises no
  // prepared-versus-`_source` question; `macro` cannot be verified at all, because
  // `MacroCoinSpender` exposes no `readCoins` — which is precisely why `creditUnavailable` exists.
  const observed = world.spendStrategy === 'actorInventory';
  const readContext = { profile, unit, units: profile.units };
  let before = 0;
  if (observed) {
    const read = await readCreditBalance(spender, actor, readContext);
    // A failed PRE-read is provably zero-mutation: nothing has been invoked yet. That makes
    // `creditNotConfigured` both safe and the STRONGER answer — it is the same voice as the
    // missing-spender refusal above, and it keeps the credit retry-safe for a companion.
    if (!read.valid) {
      return currencyCreditResult(COMPANION_OUTCOMES.creditNotConfigured, { detail: read.message });
    }
    before = read.copperValue;
  }

  let result;
  try {
    result = await spender.refund(actor || null, { unit, amount }, ctx);
  } catch (error) {
    console.error('Fabricate | Currency credit failed', error);
    return currencyCreditResult(COMPANION_OUTCOMES.creditUnavailable, {
      detail: error?.message || String(error),
    });
  }

  if (result?.wroteNothing === true) {
    return currencyCreditResult(COMPANION_OUTCOMES.creditNotConfigured, {
      detail: result.message || '',
    });
  }
  if (result?.thrown === true) {
    return currencyCreditResult(COMPANION_OUTCOMES.creditUnavailable, {
      detail: result.message || '',
    });
  }

  const described = { actor: actor?.name || '', amount, unit: unitDisplayName(unit) };
  if (observed) {
    return judgeObservedCredit({
      spender,
      actor,
      context: readContext,
      before,
      expected: amount * baseValue,
      amount,
      described,
    });
  }
  if (result?.valid)
    return currencyCreditResult(COMPANION_OUTCOMES.credited, described, { amount });
  // The spender's own free text is the decline itself, so it rides as `detail` while `message`
  // stays a localization key.
  return currencyCreditResult(COMPANION_OUTCOMES.creditFailed, { detail: result?.message || '' });
}

/**
 * Credit `amount` of `unitId` to an actor against the WORLD currency ladder — the behaviour
 * published as `game.fabricate.creditCurrency` (issue 1301).
 *
 * **World scope, never a crafting system**, exactly as the affordability answer is.
 *
 * **It goes through the resolved spender's `.refund`, and never through
 * `refundCurrencySpends`.** That function is not merely recipe-shaped: handed `recipe: null` it
 * returns `{ valid: true, groups: [] }` BEFORE its loop, a silent success that credits nothing
 * with `refund` never invoked, and it hardcodes `caller: 'craft'` besides. `.refund` is the
 * right primitive rather than a new `credit` method because `buildCurrencyRefundUpdates` "simply
 * adds `amount` of the requirement's own denomination back", which is what a credit IS — it is a
 * refund only in its name and its current callers — and because a fourth spender method would
 * have to be implemented on three spenders plus every third-party inventory adapter, and would
 * give a GM a second macro key to author for what `increment` already does.
 *
 * **Not idempotent.** Crediting 50 gp twice is legitimately 100 gp, and no state Fabricate can
 * read distinguishes a duplicate credit from a second, intended one. The caller owns not double
 * crediting; the `callSite` election gate removes the steady-state multi-client class and is not
 * a lease.
 *
 * **`credited` is an OBSERVATION, never a restatement of the request** — see
 * {@link judgeObservedCredit} for the one arm that needs a reading to make that true, and
 * `currencyCreditResult` for the rule that `0` means Fabricate can prove it and `null` means it
 * cannot.
 *
 * `buildCurrencyRefundUpdates` answers `{ valid: true, updates: {} }` for `amount <= 0` — a
 * sixth silent-success shape — and it is unreachable from here ONLY because
 * {@link resolveCreditAmount} refuses a non-positive amount first. It stays reachable from the
 * shipped `refundCurrencySpends` caller, where it is legitimate.
 *
 * @param {object|null} actor - the already-resolved actor whose purse is credited.
 * @param {{ unitId?: string, amount?: number|string, callSite?: string }} request
 * @param {{ getCurrencyConfig?: () => object, actorPropertyCoinSpender?: object|null,
 *   actorInventoryCoinSpender?: object|null, isElectedExecutor?: () => boolean,
 *   runMacro?: (uuid: string, context: object) => Promise<any> }} [seams]
 * @returns {Promise<Readonly<{success: boolean, credited: number|null, outcome: string,
 *   message: string, messageData?: object}>>}
 */
export async function creditWorldCurrency(actor, { unitId, amount, callSite } = {}, seams = {}) {
  // The call-site gate is request validation, so it sits here beside the amount rule rather than
  // in the facade preamble — the same siting as `invalidAmount` and `invalidGrantedBy`.
  const refusal = gateCompanionCallSite({ callSite }, seams);
  if (refusal) return currencyCreditResult(refusal);

  const request = resolveWorldCurrencyRequest(unitId, amount, seams, resolveCreditAmount);
  if (request.outcome) return currencyCreditResult(request.outcome, request.messageData);

  return runWorldCurrencyCredit({ actor, ...request, seams });
}

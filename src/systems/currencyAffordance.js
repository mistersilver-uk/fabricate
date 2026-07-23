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
 * The spend math and validation stay in `currencyProfile.js`; the spenders own the actor I/O. This
 * module only wires the strategy → spender resolution and the cross-unit aggregation.
 */
import {
  ActorPropertyCoinSpender,
  MacroCoinSpender,
  buildAffordCurrencyProbe,
} from './CoinSpenders.js';
import {
  findCurrencyUnit,
  formatCurrencyRequirement,
  validateCurrencyProfile,
} from './currencyProfile.js';

/**
 * Read the recipe's crafting-system currency config (`requirements.currency`).
 * @returns {{ enabled: boolean, spendStrategy: string, providerId: string, macros: object,
 *   units: object[], system: object }|null}
 */
export function getCurrencyRequirementConfig(recipe) {
  const systemId = recipe?.craftingSystemId;
  if (!systemId) return null;
  const systemManager = game.fabricate?.getCraftingSystemManager?.();
  const system = systemManager?.getSystem(systemId);
  if (!system) return null;

  const currency = system?.requirements?.currency || {};
  const spendStrategy = ['actorInventory', 'macro'].includes(currency.spendStrategy)
    ? currency.spendStrategy
    : 'actorProperty';
  const macros = currency.macros && typeof currency.macros === 'object' ? currency.macros : {};
  return {
    enabled: currency.enabled === true,
    spendStrategy,
    providerId: String(currency.providerId || ''),
    macros,
    units: Array.isArray(currency.units) ? currency.units : [],
    system,
  };
}

/**
 * Resolve the coin spender for a spend strategy. `actorInventory` resolves the per-system inventory
 * spender (injected or via the `game.fabricate` accessor); `macro` builds a per-config macro
 * spender; `actorProperty` (default) is the generic property spender.
 *
 * @param {{ spendStrategy?: string, macros?: object }} config
 * @param {{ actorInventoryCoinSpender?: object|null, actorPropertyCoinSpender?: object|null }} [seams]
 */
export function resolveCoinSpender(config = {}, seams = {}) {
  if (config.spendStrategy === 'actorInventory') {
    return (
      seams.actorInventoryCoinSpender || game.fabricate?.getActorInventoryCoinSpender?.() || null
    );
  }
  if (config.spendStrategy === 'macro') {
    return new MacroCoinSpender({ macros: config.macros });
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
 * @param {{ actorInventoryCoinSpender?: object|null, actorPropertyCoinSpender?: object|null }} [seams]
 */
export function resolveCurrencyContext(recipe, seams = {}) {
  const config = getCurrencyRequirementConfig(recipe);
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
 * @param {{ actorInventoryCoinSpender?: object|null, actorPropertyCoinSpender?: object|null }} [seams]
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
    const unit = findCurrencyUnit(profile?.units || [], spend?.unit);
    if (!unit) continue;
    const meta = profile?.metadata?.get(unit.id);
    const baseValue = Number(meta?.baseValue) || 0;
    const amount = Math.max(0, Number(spend?.amount) || 0);
    if (!meta?.baseUnitId || baseValue <= 0 || amount <= 0) continue;
    const base = amount * baseValue;
    const existing = byBase.get(meta.baseUnitId);
    if (!existing) {
      byBase.set(meta.baseUnitId, {
        baseUnitId: meta.baseUnitId,
        requiredBase: base,
        unit,
        baseValue,
      });
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
 * Build the spender `ctx` for a single aggregated requirement (the shape the property/inventory
 * spenders read, plus the macro context the {@link MacroCoinSpender} reads).
 */
function buildSpendContext({ profile, unit, amount, recipe, config }) {
  const requirement = { unit: unit.id, amount };
  return {
    profile,
    unit,
    units: profile.units,
    requirement,
    recipe,
    craftingSystem: config?.system || null,
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
      craftingSystem: config?.system || null,
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
 * Async deduction over the chosen `currencySpends`, aggregated cross-unit. Runs AFTER item
 * consumption on success (or on a failure path only when the failure policy consumes ingredients).
 * A mid-loop spend failure is logged (never refunded); the first hard failure surfaces its message.
 *
 * @returns {Promise<{ valid: boolean, message?: string }>}
 */
export async function spendCurrencySpends(craftingActor, recipe, currencySpends, seams = {}) {
  if (!currencySpends?.length) return { valid: true };
  const context = resolveCurrencyContext(recipe, seams);
  if (!context.enabled) return { valid: true };
  if (context.error) return { valid: false, message: context.error };
  const { profile, config, spender } = context;
  if (!spender?.spend) {
    return { valid: false, message: 'Currency spending is not available on this actor.' };
  }

  for (const group of aggregateCurrencySpends(currencySpends, profile)) {
    const ctx = buildSpendContext({
      profile,
      unit: group.unit,
      amount: group.amount,
      recipe,
      config,
    });
    ctx.macroContext.actor = craftingActor;
    try {
      const result = await spender.spend(
        craftingActor,
        { unit: group.unit, amount: group.amount },
        ctx
      );
      if (!result?.valid) {
        return {
          valid: false,
          message:
            result?.message ||
            `Could not spend currency (${formatCurrencyRequirement({ unit: group.unit.id, amount: group.amount }, profile.units)}).`,
        };
      }
    } catch (error) {
      console.error('Fabricate | Failed to decrement currency', error);
      return {
        valid: false,
        message: `Could not spend currency (${formatCurrencyRequirement({ unit: group.unit.id, amount: group.amount }, profile.units)}).`,
      };
    }
  }
  return { valid: true };
}

/**
 * Async REFUND over previously spent `currencySpends`, aggregated cross-unit — the inverse of
 * {@link spendCurrencySpends}. Used by the player-cancel reversal (issue 848) and shared with the
 * GM cancel/reverse (issue 847) so the un-spend logic is defined once. Each aggregated group is
 * handed back in its representative denomination, so the actor's total base value is restored. A
 * mid-loop refund failure is logged; the first hard failure surfaces its message. Returns
 * `{ valid: true }` when currency is disabled or there is nothing to refund.
 *
 * @returns {Promise<{ valid: boolean, message?: string }>}
 */
export async function refundCurrencySpends(craftingActor, recipe, currencySpends, seams = {}) {
  if (!currencySpends?.length) return { valid: true };
  const context = resolveCurrencyContext(recipe, seams);
  if (!context.enabled) return { valid: true };
  if (context.error) return { valid: false, message: context.error };
  const { profile, config, spender } = context;
  if (!spender?.refund) {
    return { valid: false, message: 'Currency refund is not available on this actor.' };
  }

  for (const group of aggregateCurrencySpends(currencySpends, profile)) {
    const ctx = buildSpendContext({
      profile,
      unit: group.unit,
      amount: group.amount,
      recipe,
      config,
    });
    ctx.macroContext.actor = craftingActor;
    try {
      const result = await spender.refund(
        craftingActor,
        { unit: group.unit, amount: group.amount },
        ctx
      );
      if (!result?.valid) {
        return {
          valid: false,
          message:
            result?.message ||
            `Could not refund currency (${formatCurrencyRequirement({ unit: group.unit.id, amount: group.amount }, profile.units)}).`,
        };
      }
    } catch (error) {
      console.error('Fabricate | Failed to refund currency', error);
      return {
        valid: false,
        message: `Could not refund currency (${formatCurrencyRequirement({ unit: group.unit.id, amount: group.amount }, profile.units)}).`,
      };
    }
  }
  return { valid: true };
}

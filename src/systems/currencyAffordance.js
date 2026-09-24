/**
 * Recipe-currency affordance and spend resolution, shared by `CraftingEngine` (the craft-time gate
 * and deduction) and `RecipeManager` (the display-time probe). Currency options are chosen at
 * selection, only when no item option satisfies a group, and arrive as `currencySpends`: a
 * synchronous `affordCurrency(match)` probe, an async all-affordable gate before any mutation,
 * and an async deduction after item consumption.
 * Four recipe-free, world-scoped answers live here too: `checkWorldCurrencyAffordability`
 * (issue 1289), `creditWorldCurrency` (issue 1301) and the pooled pair `readPooledCurrencyBalance`
 * and `consumePooledCurrency` (issue 1342). They read the world ladder only, never a crafting
 * system's toggle. Spend math and validation live in `currencyProfile.js`; spenders own actor I/O.
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
  currencyUnitDisplayName,
  decomposeBaseAmount,
  findCurrencyUnit,
  formatCurrencyRequirement,
  resolveCurrencyUnitByName,
  validateCurrencyProfile,
} from './currencyProfile.js';

/**
 * The world half of the currency config (issue 1278): ladder, strategy, provider and macros. It
 * has no crafting-system seam, so the world-scoped answers cannot consult a system toggle.
 * Seam-first, global-fallback (issue 1072) with `??`: a seam answering `null` falls through, and an
 * empty ladder and a missing one refuse alike downstream. `globalThis.game?.` because an
 * uninjected store is common, and a bare `game` would throw on the craftability path.
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
 * The last-resort reason when no spender resolved and none was composed (issue 1493); framed on
 * the game system, not the actor, since the cause is a world setting.
 */
const SPEND_UNAVAILABLE_FALLBACK =
  'Currency spending is not available: no coin spender is configured for this game system.';

/** How many profile errors `formatProfileErrors` names before summarising by count (issue 1493). */
const MAX_LISTED_PROFILE_ERRORS = 3;

/** Join profile errors into one sentence; byte-identical to `join('; ')` at or under the cap. */
function formatProfileErrors(errors) {
  const list = errors || [];
  if (list.length <= MAX_LISTED_PROFILE_ERRORS) return list.join('; ');
  const shown = list.slice(0, MAX_LISTED_PROFILE_ERRORS).join('; ');
  const remaining = list.length - MAX_LISTED_PROFILE_ERRORS;
  return `${shown}; and ${remaining} more issue${remaining === 1 ? '' : 's'}.`;
}

/**
 * The directive appended to a player-facing refusal caused by world misconfiguration (issue
 * 1493); the route mirrors the manager's own breadcrumb to the world Currency tab.
 */
const CURRENCY_SETUP_DIRECTIVE =
  "Ask your GM to finish the world's currency setup (Crafting Systems → World → Currency).";

/**
 * Append the setup directive to a player-facing reason. Only `checkCurrencySpends`'s
 * `spenderUnavailableReason` branch uses it; the spend and refund paths only log, and
 * `CraftingEngine._formatMissingItems` and the `context.error` branch render
 * `CURRENCY_SETUP_INCOMPLETE_MESSAGE` instead. The requirement rail shows the raw reason to the
 * crafting player, so any directive there belongs in the rail's render path.
 */
export function withCurrencySetupDirective(reason) {
  return reason ? `${reason} ${CURRENCY_SETUP_DIRECTIVE}` : reason;
}

/**
 * The constant, action-first sentence both toast-reaching readers of an invalid profile's `error`
 * render (issue 1493), so they cannot drift; the validator detail is only `console.warn`ed.
 */
export const CURRENCY_SETUP_INCOMPLETE_MESSAGE =
  "Currency setup is incomplete, so this cost can't be priced — a GM needs to finish it in Crafting Systems → World → Currency.";

/**
 * A recipe's effective currency config: `enabled` is the crafting system's participation toggle,
 * and everything else is world scope (issue 1278). The single chokepoint through which every
 * recipe-keyed currency read composes the two scopes, via `resolveCurrencyContext`.
 */
export function getCurrencyRequirementConfig(recipe, seams = {}) {
  const systemId = recipe?.craftingSystemId;
  if (!systemId) return null;
  // Seam-first, global-fallback (issue 1072): this runs per recipe on the player listing path, so
  // an injected system manager is never bypassed.
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
 * The coin spender for a strategy: `actorInventory` (injected or via `game.fabricate`), a
 * per-config `macro` spender, or the default `actorProperty`. `runMacro` and `resolveMacro` are
 * optional `macro` seams so tests drive the real `MacroCoinSpender`.
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
 * Why a resolved context cannot spend, or `null` (issue 1493). Two world-level causes: no spender
 * at all (composed here) or a spender with no adapter for the game system (its own
 * `describeUnavailable`). The per-actor "not available on ACTOR" sentence stays out: a
 * misconfigured world and a sheet lacking a field are different fixes.
 */
function describeUnavailableCoinSpender(config, spender) {
  if (!spender) {
    const systemId = String(globalThis.game?.system?.id || '').trim() || 'unknown';
    return `No coin spender is registered for the "${config?.spendStrategy || 'actorProperty'}" currency spend strategy in system "${systemId}".`;
  }
  return spender.describeUnavailable?.() || null;
}

/**
 * Config, validated profile, spender and `spenderUnavailableReason` for a recipe; `{ error }` for
 * an invalid profile. Disabled answers a bare `{ enabled: false }`, a shape
 * `tests/currency-two-scope-composition.test.js` pins.
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
      error: `Currency configuration is invalid: ${formatProfileErrors(profile.errors)}`,
      config,
      profile,
    };
  }
  const spender = resolveCoinSpender(config, seams);
  return {
    enabled: true,
    config,
    profile,
    spender,
    spenderUnavailableReason: describeUnavailableCoinSpender(config, spender),
  };
}

/**
 * The synchronous `affordCurrency(match)` probe, always `false` when currency is disabled,
 * misconfigured, unspendable or has no actor. It stays boolean: `matchTypes.js` does
 * `!!affordCurrency(match)`, so a refusal object would coerce to affordable. Reasons travel on
 * the context.
 */
export function buildCurrencyAffordProbe(craftingActor, recipe, seams = {}) {
  const context = resolveCurrencyContext(recipe, seams);
  if (!context.enabled || context.error || context.spenderUnavailableReason) return () => false;
  return buildAffordCurrencyProbe({
    actor: craftingActor || null,
    profile: context.profile,
    spendStrategy: context.config.spendStrategy,
    spender: context.spender,
  });
}

/**
 * Whether a set of spends is affordable together, aggregated as `checkCurrencySpends` does
 * (issue 1648). A `macro` strategy answers `true` here; the engine's async gate is authoritative.
 */
export function affordsCurrencySpends(craftingActor, recipe, currencySpends, seams = {}) {
  if (!currencySpends?.length) return true;
  const context = resolveCurrencyContext(recipe, seams);
  if (!context.enabled) return true;
  if (context.error || context.spenderUnavailableReason) return false;
  if (context.config.spendStrategy === 'macro') return true;
  const probe = buildAffordCurrencyProbe({
    actor: craftingActor || null,
    profile: context.profile,
    spendStrategy: context.config.spendStrategy,
    spender: context.spender,
  });
  return aggregateCurrencySpends(currencySpends, context.profile).every((group) =>
    probe({ unit: group.unit.id, amount: group.amount })
  );
}

/**
 * One spend's unit, terminal base unit, base value and amount, or `null` when unspendable; the
 * one drop rule `aggregateCurrencySpends` and `settledCurrencySpends` share.
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
 * Group spends by common base unit (1 gp + 50 sp is one copper requirement), each represented by
 * its highest-value unit so one spend settles the group.
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
    // The highest-value unit makes change rather than spending a count of a tiny coin.
    if (baseValue > existing.baseValue) {
      existing.unit = unit;
      existing.baseValue = baseValue;
    }
  }
  // Expressed back in the representative unit, rounded up so the gate never under-charges.
  return [...byBase.values()].map((group) => ({
    baseUnitId: group.baseUnitId,
    requiredBase: group.requiredBase,
    unit: group.unit,
    amount: Math.ceil(group.requiredBase / group.baseValue),
  }));
}

/**
 * Who asks a currency macro its question, on the spender `ctx` and the macro context (issue
 * 1289); positive on every arm so a macro branches instead of inferring from a `null` recipe.
 */
export const CURRENCY_SPEND_CALLERS = Object.freeze({
  craft: 'craft',
  award: 'award',
  // The pooled pair (issue 1342): one token for the read (`balance` macro) and the debit
  // (`decrement`), which the macro key already tells apart.
  consume: 'consume',
});

/**
 * The spender `ctx` for one aggregated requirement. `caller` is required, never defaulted to
 * `craft`; `config` is `null` on the world-scoped paths, so `craftingSystem` is `null` there.
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
 * The all-affordable gate over `currencySpends`, before any mutation: `{ valid: true }` only when
 * every aggregated requirement passes its spender `check`.
 */
export async function checkCurrencySpends(craftingActor, recipe, currencySpends, seams = {}) {
  if (!currencySpends?.length) return { valid: true };
  const context = resolveCurrencyContext(recipe, seams);
  if (!context.enabled) return { valid: true };
  // Both branches return straight into `CraftingEngine.craft`'s result, the crafting player's
  // read. An invalid profile makes the probe constant-`false`, so selection never reaches here
  // with spends (it fails in `_formatMissingItems`); the guard is defensive and renders the same
  // constant sentence.
  if (context.error) {
    console.warn('Fabricate | Currency requirement could not be priced:', context.error);
    return { valid: false, message: CURRENCY_SETUP_INCOMPLETE_MESSAGE };
  }
  const { profile, config, spender, spenderUnavailableReason } = context;
  if (!spender?.check) {
    return {
      valid: false,
      message: withCurrencySetupDirective(spenderUnavailableReason || SPEND_UNAVAILABLE_FALLBACK),
    };
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
 * The raw spends whose aggregated group settled, re-derived through `resolveSpendBaseUnit`; a
 * group settles as one transaction.
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

/** One group's outcome record; `attempted` separates tried-and-failed from never-tried. */
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

/** One spender call on one group, a falsy answer and a throw alike answering `ok: false`. */
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

/** Deduct group by group, aborting at the first failure; the rest report `attempted: false`. */
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
 * The deduction after item consumption. A failure is logged, never rolled back, and the craft
 * proceeds, so it aborts at the first failing group and `settledSpends` records what settled
 * (issue 902): the only honest record for a time-gated step.
 */
export async function spendCurrencySpends(craftingActor, recipe, currencySpends, seams = {}) {
  // Nothing settled, so the empty record is correct.
  if (!currencySpends?.length) return { valid: true, groups: [], settledSpends: [] };
  const context = resolveCurrencyContext(recipe, seams);
  if (!context.enabled) return { valid: true, groups: [], settledSpends: [] };
  if (context.error) {
    return { valid: false, message: context.error, groups: [], settledSpends: [] };
  }
  const { profile, config, spender, spenderUnavailableReason } = context;
  const groups = aggregateCurrencySpends(currencySpends, profile);
  if (!spender?.spend) {
    const message = spenderUnavailableReason || SPEND_UNAVAILABLE_FALLBACK;
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
 * Refund previously spent `currencySpends` (issues 847, 848), each group in its representative
 * denomination. Unlike the deduction it accumulates: the reversal is best-effort, and a group left
 * unrefunded by an unrelated failure is stranded currency (issue 902).
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

// The world-scoped affordability answer (issue 1289) and credit (issue 1301). Everything above is
// recipe-keyed; these read the world ladder alone and never resolve a crafting system. They share
// `resolveWorldCurrencyRequest`, so the check and the credit agree on a unit structurally.

/**
 * A caller amount as a number, refusing rather than coercing: only a number or a non-blank
 * numeric string, since `Number(true)` is `1` and `Number([])` is `0`.
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
 * The credit's amount rule, narrower than the check's: a safe integer, since
 * `buildCurrencyRefundUpdates` truncates and loses exactness past it. The check still prices
 * `2.5 gp`, because narrowing a published member is a bump; the asymmetry is pinned.
 */
function resolveCreditAmount(amount) {
  const numeric = coerceRequestedAmount(amount);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null;
}

/** A delegate to `currencyUnitDisplayName`; the keys interpolate amount and unit separately. */
function unitDisplayName(unit) {
  return currencyUnitDisplayName(unit);
}

/**
 * Resolve a world-scoped request (amount, ladder, profile, unit) for the check and the credit
 * (issue 1301, D8), so both read a denomination the same way. Answers a token and `messageData`,
 * since each member has its own key table; the amount resolves before any spender runs.
 */
function resolveWorldCurrencyRequest(
  unitId,
  amount,
  seams = {},
  resolveAmount = resolveRequestedAmount
) {
  // Caller arguments first; the world configuration is the GM's problem.
  const requested = resolveAmount(amount);
  if (requested === null) {
    return { outcome: COMPANION_OUTCOMES.invalidAmount, messageData: null };
  }

  const ladder = resolveWorldCurrencyLadder(unitId, seams);
  if (ladder.outcome) return ladder;
  return { ...ladder, amount: requested };
}

/**
 * The ladder half of a world-scoped question, with no amount: split out (issue 1342) for the
 * pooled read, which asks no amount. The amount rule still runs first where one exists.
 */
function resolveWorldCurrencyLadder(unitId, seams = {}) {
  const world = resolveWorldCurrencySettings(seams);
  // Empty and invalid ladders are different people's problems.
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

  // `unitNotFound` also covers a unit reaching no base unit, which a valid profile cannot produce
  // today; both would otherwise price the cost at zero.
  const unit = findCurrencyUnit(profile.units, unitId);
  const baseValue = Number(profile.metadata?.get(unit?.id)?.baseValue) || 0;
  if (!unit || baseValue <= 0) {
    return {
      outcome: COMPANION_OUTCOMES.unitNotFound,
      messageData: { unit: String(unitId ?? '') },
    };
  }

  return { outcome: null, unit, baseValue, profile, world };
}

/**
 * Run the spender's `check` as a contract result. A macro that threw (`thrown: true`) or a spender
 * that threw is `checkUnavailable`, never `notAffordable`, and a `stable` member never throws.
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
    // No recipe and no system: this is why the macro context carries a positive `caller`.
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
  // The spender's free text rides as `detail`; `message` stays a key.
  return affordabilityResult(COMPANION_OUTCOMES.notAffordable, {
    ...described,
    detail: result?.message || '',
  });
}

/**
 * `game.fabricate.checkAffordability` (issue 1289): whether an actor can afford `amount` of
 * `unitId` on the world ladder, consulting no crafting system and writing nothing. The actor's
 * whole ladder branch counts (10 sp meets 1 gp). Unit and amount resolve before any spender:
 * skipped, an unknown unit or a zero amount would price at zero and read affordable.
 */
export async function checkWorldCurrencyAffordability(actor, { unitId, amount } = {}, seams = {}) {
  const request = resolveWorldCurrencyRequest(unitId, amount, seams);
  if (request.outcome) return affordabilityResult(request.outcome, request.messageData);

  const { unit, amount: requested, profile, world } = request;
  return runWorldAffordabilityCheck({ actor, unit, amount: requested, profile, world, seams });
}

/**
 * An actor's coin balance through the spender's `readCoins`, for the `actorInventory` credit arm
 * only: its adapter answers `valid` after a void `addCoins`, so the credit must be observed.
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
 * Judge an `actorInventory` credit by the observed delta (issue 1301, D7b): the expected delta is
 * `credited`, zero is `creditFailed` (a concurrent spend could mask a write), and anything else is
 * `creditUnavailable`, outside the retry set, so a race cannot double-credit.
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
 * Run the spender's `refund` as a contract result, mirroring `runWorldAffordabilityCheck`. The
 * marker ladder tests `wroteNothing` before `thrown`, routing a never-ran macro refusal to
 * `creditNotConfigured` without moving the check's `checkUnavailable`.
 */
async function runWorldCurrencyCredit({ actor, unit, amount, baseValue, profile, world, seams }) {
  const spender = resolveCoinSpender(world, seams);
  // Detected before anything runs, as the check does; `null.refund` would throw.
  if (typeof spender?.refund !== 'function') {
    return currencyCreditResult(COMPANION_OUTCOMES.creditNotConfigured, {
      detail: `No currency spender is available for the "${world.spendStrategy}" spend strategy.`,
    });
  }

  const ctx = buildSpendContext({
    profile,
    unit,
    amount,
    // Under `macro` this runs `increment`; `caller` tells a credit from a cancelled craft.
    recipe: null,
    config: null,
    caller: CURRENCY_SPEND_CALLERS.award,
  });
  ctx.macroContext.actor = actor || null;

  // Only `actorInventory` is observed (D7b): `actorProperty` tests `actor.update`'s own return,
  // and `macro` stays unverified (`creditUnavailable`), since its `readCoins` runs the optional
  // `balance` macro and would refuse every world without one.
  const observed = world.spendStrategy === 'actorInventory';
  const readContext = { profile, unit, units: profile.units };
  let before = 0;
  if (observed) {
    const read = await readCreditBalance(spender, actor, readContext);
    // A failed pre-read invoked nothing, so `creditNotConfigured` is safe and retry-safe.
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
  // The spender's free text rides as `detail`.
  return currencyCreditResult(COMPANION_OUTCOMES.creditFailed, { detail: result?.message || '' });
}

/**
 * `game.fabricate.creditCurrency` (issue 1301): credit `amount` of `unitId` on the world ladder.
 * It goes through the spender's `.refund`, never `refundCurrencySpends`, which answers a silent
 * success for `recipe: null` and hardcodes `caller: 'craft'`; `.refund` adds the amount back in
 * its own denomination, which is what a credit is. Not idempotent: the caller owns not
 * double-crediting. `credited` is observed, never restated.
 */
export async function creditWorldCurrency(actor, { unitId, amount, callSite } = {}, seams = {}) {
  // The call-site gate is request validation, sited beside the amount rule.
  const refusal = gateCompanionCallSite({ callSite }, seams);
  if (refusal) return currencyCreditResult(refusal);

  const request = resolveWorldCurrencyRequest(unitId, amount, seams, resolveCreditAmount);
  if (request.outcome) return currencyCreditResult(request.outcome, request.messageData);

  return runWorldCurrencyCredit({ actor, ...request, seams });
}

// The pooled currency balance and debit (issue 1342), world-scoped like the two above. They live
// here so their private dependencies stay private; the companion leaves compose them.

// The pooled outcome tokens are read from `COMPANION_OUTCOMES`: one vocabulary (issue 1342).

/**
 * Resolve a coin from a human-written string against the world ladder (issue 1342), so the pooled
 * read names coins as it names components, through the same world settings its balance read uses.
 */
export function resolveWorldCurrencyUnitByName(name, seams = {}) {
  return resolveCurrencyUnitByName(resolveWorldCurrencySettings(seams).units, name);
}

/**
 * The terminal base unit (`baseValue === 1`) of a unit's branch, every pooled debit's
 * denomination, or `null`; a valid profile always has one, so `null` asserts the invariant.
 */
function resolveTerminalBaseUnit(profile, unit) {
  const baseUnitId = profile?.metadata?.get(unit?.id)?.baseUnitId;
  const baseUnit = findCurrencyUnit(profile?.units || [], baseUnitId);
  const baseValue = Number(profile?.metadata?.get(baseUnit?.id)?.baseValue) || 0;
  return baseValue === 1 ? baseUnit : null;
}

/** A pooled leg's spender `ctx` (`caller: consume`); `amount` is `0` on the read. */
function buildPooledContext({ profile, unit, amount, actor }) {
  const ctx = buildSpendContext({
    profile,
    unit,
    amount,
    recipe: null,
    config: null,
    caller: CURRENCY_SPEND_CALLERS.consume,
  });
  ctx.macroContext.actor = actor || null;
  return ctx;
}

/** The identity fields a pooled reading or ledger row reports an actor by. */
function describePooledActor(actor) {
  return {
    actorId: String(actor?.id ?? ''),
    actorUuid: String(actor?.uuid ?? ''),
    actorName: String(actor?.name ?? ''),
  };
}

/**
 * One actor's holdings on a branch; a missing reader, refusal, non-number or throw is
 * `copperValue: null`, never `0`, which would move a shortfall onto readable actors.
 */
async function readPooledActorCoins(spender, actor, { profile, unit }) {
  const described = describePooledActor(actor);
  if (typeof spender?.readCoins !== 'function') {
    return {
      ...described,
      actor,
      copperValue: null,
      message: 'This currency spender cannot read a coin balance.',
    };
  }
  try {
    const ctx = buildPooledContext({ profile, unit, amount: 0, actor });
    const read = await spender.readCoins(actor || null, ctx);
    if (!read?.valid) {
      return {
        ...described,
        actor,
        copperValue: null,
        message: read?.message || "The actor's coin balance could not be read.",
      };
    }
    const copperValue = Number(read.copperValue);
    if (!Number.isFinite(copperValue)) {
      return {
        ...described,
        actor,
        copperValue: null,
        message: "The actor's coin balance was not reported as a number.",
      };
    }
    return { ...described, actor, copperValue };
  } catch (error) {
    console.error('Fabricate | Could not read a coin balance for a pooled currency read', error);
    return { ...described, actor, copperValue: null, message: error?.message || String(error) };
  }
}

/**
 * Sum a set of actors' holdings on one branch (issue 1342). Every spender's `readCoins` answers
 * in the terminal base unit, so the answers add. One unreadable actor makes `available` `null`,
 * since a subset's sum is always too small; an empty set reads `0`. Writes nothing.
 */
export async function readPooledCurrencyBalance(actors, { unitId } = {}, seams = {}) {
  const ladder = resolvePooledLadder(unitId, seams);
  if (ladder.outcome) return ladder;
  const pooled = await poolActorCoins(actors, ladder);
  return { ...ladder, ...pooled };
}

/**
 * The ladder, terminal base unit and spender both pooled functions need before touching an
 * actor, so the debit's configuration refusals run before any `balance` macro.
 */
function resolvePooledLadder(unitId, seams) {
  const ladder = resolveWorldCurrencyLadder(unitId, seams);
  if (ladder.outcome) return ladder;

  const { unit, baseValue, profile, world } = ladder;
  const baseUnit = resolveTerminalBaseUnit(profile, unit);
  if (!baseUnit) {
    return {
      outcome: COMPANION_OUTCOMES.ladderInvalid,
      messageData: {
        detail: `Currency unit "${unit.id}" does not reach a terminal base denomination.`,
      },
    };
  }
  return {
    outcome: null,
    unit,
    baseUnit,
    baseValue,
    profile,
    world,
    spender: resolveCoinSpender(world, seams),
  };
}

/** Read every actor and sum; the one home of the null-propagation rule. */
async function poolActorCoins(actors, { spender, profile, unit }) {
  const readings = [];
  for (const actor of Array.isArray(actors) ? actors : []) {
    // Serially: a `macro` world runs a GM macro per actor.
    readings.push(await readPooledActorCoins(spender, actor, { profile, unit }));
  }
  const unreadable = readings.some((reading) => reading.copperValue === null);
  const available = unreadable
    ? null
    : readings.reduce((total, reading) => total + reading.copperValue, 0);
  return { available, readings };
}

/**
 * First-fit in the caller's actor order, which is the allocation policy, in the terminal base
 * unit; `remaining` is returned so a caller refuses rather than taking a partial payment.
 */
function planPooledDebit(readings, requiredBase) {
  const plan = [];
  let remaining = requiredBase;
  for (const reading of readings) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, reading.copperValue);
    if (amount <= 0) continue;
    plan.push({ reading, amount });
    remaining -= amount;
  }
  return { plan, remaining };
}

/** One pooled spender call; `applySpenderToGroup` is recipe-shaped and hardcodes `craft`. */
async function applyPooledSpender({ spender, method, verb, entry, profile, baseUnit }) {
  const requirement = { unit: baseUnit, amount: entry.amount };
  const ctx = buildPooledContext({
    profile,
    unit: baseUnit,
    amount: entry.amount,
    actor: entry.reading.actor,
  });
  const formatted = formatCurrencyRequirement(
    { unit: baseUnit.id, amount: entry.amount },
    profile.units
  );
  const fallbackMessage = `Could not ${verb} currency (${formatted}) for ${entry.reading.actorName || 'actor'}.`;
  try {
    const result = await spender[method](entry.reading.actor || null, requirement, ctx);
    if (result?.valid) return { ok: true };
    return { ok: false, message: result?.message || fallbackMessage };
  } catch (error) {
    console.error(`Fabricate | Failed to ${verb} pooled currency`, error);
    return { ok: false, message: error?.message || fallbackMessage };
  }
}

/**
 * Give back each settled payment in the base unit it was taken in: the total is exact, the coin
 * mix may differ. A failed give-back is recorded and forfeits the zero-mutation claim.
 */
async function restorePooledDebit({ settled, spender, profile, baseUnit }) {
  let restoredEverything = true;
  for (const entry of settled) {
    const outcome = await applyPooledSpender({
      spender,
      method: 'refund',
      verb: 'restore',
      entry,
      profile,
      baseUnit,
    });
    entry.record.restored = outcome.ok;
    if (!outcome.ok) {
      restoredEverything = false;
      entry.record.message = outcome.message;
    }
  }
  return restoredEverything;
}

/**
 * One ledger row. `amount` is in the terminal base unit and `share` is the same figure decomposed
 * down the ladder, published together (issue 1342): one for arithmetic, one for a person. An
 * unattempted payer's `share` is its planned amount.
 */
function pooledLedgerRow(entry, baseUnit, profile, { attempted, settled, message }) {
  const row = {
    ...describePooledActor(entry.reading.actor),
    unitId: baseUnit.id,
    amount: entry.amount,
    share: decomposeBaseAmount(entry.amount, profile, baseUnit.id),
    attempted: attempted === true,
    settled: settled === true,
  };
  if (message) row.message = message;
  return row;
}

/** Pay the plan, aborting at the first failure and giving back what settled. */
async function runPooledDebit({ plan, spender, profile, baseUnit }) {
  const ledger = [];
  const settled = [];
  let failure = null;
  for (const entry of plan) {
    if (failure !== null) {
      ledger.push(pooledLedgerRow(entry, baseUnit, profile, { attempted: false, settled: false }));
      continue;
    }
    const outcome = await applyPooledSpender({
      spender,
      method: 'spend',
      verb: 'spend',
      entry,
      profile,
      baseUnit,
    });
    const record = pooledLedgerRow(entry, baseUnit, profile, {
      attempted: true,
      settled: outcome.ok,
      message: outcome.message,
    });
    ledger.push(record);
    if (outcome.ok) settled.push({ ...entry, record });
    else failure = outcome.message;
  }
  if (failure === null) return { ledger, failure: null, wroteNothing: false };

  const restoredEverything = await restorePooledDebit({ settled, spender, profile, baseUnit });
  // Zero-mutation here means net zero: the give-back is exact in base value, which makes the
  // failed call safe to retry.
  return { ledger, failure, wroteNothing: restoredEverything };
}

/**
 * The debit's amount rule is the credit's: a whole coin count keeps `requiredBase` exact, and the
 * debit never takes what the credit could not put back.
 */
function resolvePooledDebitBase(amount, baseValue) {
  const requested = resolveCreditAmount(amount);
  if (requested === null) return null;
  const requiredBase = requested * baseValue;
  return Number.isSafeInteger(requiredBase) && requiredBase > 0 ? requiredBase : null;
}

/**
 * Refusals taken before anything runs, so zero-mutation. `increment` is optional, so a valid
 * `macro` world may have no give-back; taking from it is refused as `creditNotConfigured`. The
 * `refund` test states the rule generally; no shipped spender lacks one.
 */
function refusePooledDebitUpFront(world, spender) {
  if (typeof spender?.spend !== 'function') {
    return {
      outcome: COMPANION_OUTCOMES.creditNotConfigured,
      messageData: {
        detail: `No currency spender is available for the "${world.spendStrategy}" spend strategy.`,
      },
    };
  }
  if (typeof spender?.refund !== 'function') {
    return {
      outcome: COMPANION_OUTCOMES.creditNotConfigured,
      messageData: {
        detail: `The "${world.spendStrategy}" spend strategy cannot give currency back, so it is not used to take any.`,
      },
    };
  }
  if (world.spendStrategy === 'macro' && !String(world.macros?.increment || '').trim()) {
    return {
      outcome: COMPANION_OUTCOMES.creditNotConfigured,
      messageData: {
        detail:
          'This world spends currency through macros and has no "increment" macro configured, so currency taken could not be given back.',
      },
    };
  }
  return null;
}

/** A pooled debit refusal that wrote nothing, in the member's own answer shape. */
function pooledDebitRefusal(outcome, messageData, extra = {}) {
  return {
    outcome,
    messageData: messageData ?? null,
    wroteNothing: true,
    requiredBase: null,
    baseUnitId: '',
    available: null,
    ledger: [],
    ...extra,
  };
}

/**
 * Take `amount` of `unitId` from a set of actors' combined holdings on the world ladder (issue
 * 1342), the currency leg of the pooled consume. Every per-actor spend is in the terminal base
 * unit: `aggregateCurrencySpends`' per-payer `Math.ceil` would over-charge the pool by up to
 * `baseValue - 1` per payer. All-or-nothing, not idempotent; `wroteNothing` is what a caller
 * retries on. The wrapping member owns the GM, actor, readiness and `callSite` gates.
 */
export async function consumePooledCurrency(actors, { unitId, amount } = {}, seams = {}) {
  const ladder = resolvePooledLadder(unitId, seams);
  if (ladder.outcome) return pooledDebitRefusal(ladder.outcome, ladder.messageData);

  const { baseUnit, baseValue, profile, world, spender } = ladder;
  const requiredBase = resolvePooledDebitBase(amount, baseValue);
  if (requiredBase === null) return pooledDebitRefusal(COMPANION_OUTCOMES.invalidAmount, null);

  // Before the pool is read: these refusals read configuration alone, so "wrote nothing" also
  // means no `balance` macro ran.
  const refusal = refusePooledDebitUpFront(world, spender);
  if (refusal) {
    return pooledDebitRefusal(refusal.outcome, refusal.messageData, {
      requiredBase,
      baseUnitId: baseUnit.id,
    });
  }

  const { available, readings } = await poolActorCoins(actors, ladder);
  const planned = { requiredBase, baseUnitId: baseUnit.id, available };

  if (available === null) {
    const detail = readings.find((reading) => reading.copperValue === null)?.message || '';
    return pooledDebitRefusal(COMPANION_OUTCOMES.balanceNotConfigured, { detail }, planned);
  }

  const { plan, remaining } = planPooledDebit(readings, requiredBase);
  if (available < requiredBase || remaining > 0) {
    return pooledDebitRefusal(
      COMPANION_OUTCOMES.insufficient,
      {
        required: String(requiredBase),
        available: String(available),
        unit: unitDisplayName(baseUnit),
      },
      planned
    );
  }

  const { ledger, failure, wroteNothing } = await runPooledDebit({
    plan,
    spender,
    profile,
    baseUnit,
  });
  return {
    outcome: failure === null ? null : COMPANION_OUTCOMES.consumeFailed,
    messageData: failure === null ? null : { detail: failure },
    wroteNothing,
    ...planned,
    ledger,
  };
}

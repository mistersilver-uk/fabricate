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
 * The last-resort sentence for a spend refused because the resolved context has no usable spender
 * and carried no composed reason (issue 1493).
 *
 * SYSTEM-framed, not actor-framed. The cause is that no coin spender resolved for the world's spend
 * strategy in the active game system — `ActorInventoryCoinSpender._resolveAdapter` reads
 * `game.system.id` and takes no actor — so the previous wording ("not available on this actor")
 * sent a GM to a character sheet to fix a world setting.
 *
 * It is a fallback rather than the primary message because every shipped spender implements
 * `check`, `spend` and `refund`, so the `!spender?.check` / `!spender?.spend` guards are reachable
 * only when the spender is `null` — exactly the case `spenderUnavailableReason` already names, and
 * with more detail. Hand-maintaining a parallel literal at each guard would leave several places
 * stating one fact.
 */
const SPEND_UNAVAILABLE_FALLBACK =
  'Currency spending is not available: no coin spender is configured for this game system.';

/**
 * How many of `validateCurrencyProfile`'s errors {@link formatProfileErrors} lists by name before
 * summarising the rest by count (issue 1493).
 *
 * `validateCurrencyProfile` returns one error per malformed unit, so an unbounded join renders a
 * whole paragraph wherever a caller surfaces it directly: the requirement rail's fact (an
 * accessible name) and the GM editor's own validation surface. It no longer reaches any
 * player-facing toast at all (issue 1493 round-2 follow-up): both toast-reaching readers of
 * `context.error` — `CraftingEngine._formatMissingItems` and `checkCurrencySpends`'s own
 * `context.error` guard — render {@link CURRENCY_SETUP_INCOMPLETE_MESSAGE} instead now and only
 * `console.warn` this text for diagnosis. 3 was chosen by reading the actual output at each
 * count: it names enough faults that a GM fixing the FIRST reported problem is not left guessing
 * whether there are more, while a dozen broken units still collapses to one line ("...; and 9
 * more issues.") instead of a wall of text.
 */
const MAX_LISTED_PROFILE_ERRORS = 3;

/**
 * Join a validated profile's `errors` into one sentence, capped at
 * {@link MAX_LISTED_PROFILE_ERRORS}. At or under the cap this is byte-identical to
 * `errors.join('; ')` — the shape every existing caller and test already expects for the common
 * case of one or a few broken units. Past the cap, the remainder is summarised by count rather
 * than listed, so the whole thing stays one sentence regardless of how many units are broken.
 *
 * @param {string[]} errors
 * @returns {string}
 */
function formatProfileErrors(errors) {
  const list = errors || [];
  if (list.length <= MAX_LISTED_PROFILE_ERRORS) return list.join('; ');
  const shown = list.slice(0, MAX_LISTED_PROFILE_ERRORS).join('; ');
  const remaining = list.length - MAX_LISTED_PROFILE_ERRORS;
  return `${shown}; and ${remaining} more issue${remaining === 1 ? '' : 's'}.`;
}

/**
 * The player-facing directive appended to a currency refusal caused by world misconfiguration
 * (issue 1493). `error` and `spenderUnavailableReason` both name WHAT is wrong, but a player
 * reading either one is holding a problem only a GM can fix; this names who and where.
 *
 * The route is the live breadcrumb `CraftingSystemManagerRoot.svelte` renders for this exact tab
 * (`FABRICATE.Admin.Manager.Nav.Systems` → `World.Breadcrumb` → `World.CurrencyNav`), read from
 * the component rather than assumed, because the GM editor tab's own copy is edited separately.
 */
const CURRENCY_SETUP_DIRECTIVE =
  "Ask your GM to finish the world's currency setup (Crafting Systems → World → Currency).";

/**
 * Append {@link CURRENCY_SETUP_DIRECTIVE} to a player-facing currency-refusal reason.
 *
 * Called only by {@link checkCurrencySpends}'s `spenderUnavailableReason` guard branch, which
 * returns straight into `CraftingEngine.craft`'s result — the crafting player's own read.
 * `spenderUnavailableReason` is always a single short sentence (`describeUnavailableCoinSpender`
 * composes it from ONE cause, never a joined validator list), so appending the directive there
 * does not risk the paragraph problem `context.error` had (issue 1493 round-2 follow-up).
 *
 * Three other readers of the SAME `error`/`spenderUnavailableReason` fields must NOT use this:
 *
 *   - `spendCurrencySpends`/`refundCurrencySpends` compose from the same fields but only ever
 *     `console.error` the result (the deduction/refund never abort or surface a message a caller
 *     reads) — a GM reading their own console does not need to be told to ask themselves.
 *   - `CraftingEngine._formatMissingItems`, the OTHER path a refused currency cost reaches (when
 *     selection swallows it before any spend is ever handed to `checkCurrencySpends`), no longer
 *     composes this reason into its own message at all (issue 1493 round-2 follow-up): its player
 *     toast now renders {@link CURRENCY_SETUP_INCOMPLETE_MESSAGE} and only tests the reason's
 *     presence — see `_missingItemsCurrencyReason`'s doc comment.
 *   - `checkCurrencySpends`'s OWN `context.error` guard branch, for the same reason: it renders
 *     {@link CURRENCY_SETUP_INCOMPLETE_MESSAGE} too now, not this directive — see that branch's
 *     own comment for why a real craft is not known to reach it with a non-empty spend list at
 *     all.
 *
 * `resolveCurrencyContext`'s raw fields also stay undirected for the GM editor's own validation
 * report — a GM-only surface. The requirement rail is NOT the same kind of surface, though, and a
 * previous version of this comment mischaracterised it as one: `RecipeManager
 * ._resolveCurrencyIssue` hands the SAME raw, undirected reason to `RequirementRail.svelte`,
 * which renders on the crafting PLAYER's own recipe view, not a GM or display-only one. Any
 * directive for that surface belongs in the rail's own render path, not here.
 *
 * @param {string|null|undefined} reason
 * @returns {string|null|undefined}
 */
export function withCurrencySetupDirective(reason) {
  return reason ? `${reason} ${CURRENCY_SETUP_DIRECTIVE}` : reason;
}

/**
 * The constant, action-first sentence a currency refusal caused by an INVALID profile renders as
 * to the crafting player, regardless of how many units {@link formatProfileErrors} would have
 * joined (issue 1493 round-2 follow-up).
 *
 * Shared by BOTH toast-reaching readers of `resolveCurrencyContext`'s `error` field, so they
 * cannot drift apart: `CraftingEngine._formatMissingItems` (a currency option refused at
 * SELECTION — the reported defect's actual path) and `checkCurrencySpends`'s own `context.error`
 * guard below (see that branch's own comment for why a real craft is not known to reach it with a
 * non-empty spend list at all).
 *
 * A message composed from the joined validator text read as one skippable paragraph in the
 * player's toast — a client-local `ui.notifications.warn` call (`foundryBridge.js`) that
 * auto-dismisses after 5000ms and whose core CSS (`.notification`) collapses `\n` separators to
 * spaces — once there were three or more broken units, with the sole actionable clause ("ask your
 * GM") landing last. This sentence is constant length regardless of cause and puts the action
 * first; the raw validator detail is still `console.warn`ed for diagnosis and rendered in full by
 * the GM editor's own validation note and the requirement rail.
 */
export const CURRENCY_SETUP_INCOMPLETE_MESSAGE =
  "Currency setup is incomplete, so this cost can't be priced — a GM needs to finish it in Crafting Systems → World → Currency.";

/**
 * Resolve the effective currency config for a recipe, composed from TWO scopes.
 *
 * `enabled` is a per-crafting-system decision (`requirements.currency.enabled`): it says whether
 * this system participates in currency at all. Everything that describes WHAT the currency is —
 * the coin ladder, how coins are read and spent, the provider, the GM macro set — comes from the
 * WORLD config (issue 1278), because a world runs exactly one Foundry game system and so has
 * exactly one way actors store coins.
 *
 * This function is the single chokepoint through which the whole runtime reads currency: the
 * engine's afford gate and spend/refund paths, `RecipeManager.evaluateCraftability`, and
 * `CraftingListingBuilder` all reach it via `resolveCurrencyContext`. Composing the two scopes
 * here is what let the config move scope without any engine logic changing.
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

  // The world config follows the same seam-first, global-fallback rule, for the same reason.
  //
  // `??` rather than `||` throughout, and the distinction matters at the last hop: an injected
  // seam that returns `null`/`undefined` is treated as ABSENT and falls through to the global,
  // so a seam cannot express "this world has no ladder" distinctly from "no seam was injected".
  // That is deliberate — both resolve to `{}` here and the caller cannot tell them apart anyway,
  // because an empty ladder and a missing one produce the same refusal downstream: an authored
  // cost against zero units fails `validateCurrencyProfile`, so `resolveCurrencyContext` sets
  // `error`, the probe reads false, and the spend refuses. Display agrees with execution either
  // way. A future seam that needs the two to differ must say so with an explicit sentinel.
  //
  // `globalThis.game?.` rather than the bare `game.` its neighbour above uses, because this
  // fallback is reached far more often: `CraftingEngine._currencySeams` returns
  // `() => this.currencyConfigStore?.get()`, which is legitimately `undefined` whenever the
  // store was not injected — the options bag defaults it to `null`. A bare reference throws
  // `ReferenceError` in any context without the Foundry global, and a throw here lands on the
  // craftability path rather than degrading to the empty ladder this line is written to return.
  const world =
    seams.getCurrencyConfig?.() ??
    globalThis.game?.fabricate?.getCurrencyConfigStore?.()?.get() ??
    {};
  const spendStrategy = ['actorInventory', 'macro'].includes(world.spendStrategy)
    ? world.spendStrategy
    : 'actorProperty';
  const macros = world.macros && typeof world.macros === 'object' ? world.macros : {};
  return {
    enabled: system?.requirements?.currency?.enabled === true,
    spendStrategy,
    providerId: String(world.providerId || ''),
    macros,
    units: Array.isArray(world.units) ? world.units : [],
    system,
  };
}

/**
 * Resolve the coin spender for a spend strategy. `actorInventory` resolves the per-system inventory
 * spender (injected or via the `game.fabricate` accessor); `macro` builds a per-config macro
 * spender; `actorProperty` (default) is the generic property spender.
 *
 * @param {{ spendStrategy?: string, macros?: object }} config
 * @param {{ actorInventoryCoinSpender?: object|null, actorPropertyCoinSpender?: object|null,
 *   getCraftingSystemManager?: () => object }} [seams]
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
 * Why a resolved currency context cannot spend at all, or `null` when it can (issue 1493).
 *
 * There are TWO causes and they must not be conflated, because only one of them has an object to
 * ask:
 *
 *   - **No spender at all.** {@link resolveCoinSpender} returns `null` only under
 *     `actorInventory`, when neither the seam nor the `game.fabricate` accessor yields an inventory
 *     spender. `spender?.describeUnavailable?.()` is `undefined` for precisely this case, so the
 *     sentence is composed HERE, spender-independently.
 *   - **A spender with no adapter for the active game system.**
 *     `ActorInventoryCoinSpender.describeUnavailable` owns that sentence, because only the spender
 *     knows its adapter registry.
 *
 * Both are properties of the WORLD's configuration and the active game system, never of an actor.
 * The per-actor sentence (`Currency unit "X" is not available on ACTOR.`, `CoinSpenders.readCoins`)
 * deliberately stays out of this field: "your world is misconfigured" and "this actor's sheet lacks
 * the field" are different problems with different fixes, and merging them is the same class of
 * error this reason exists to fix.
 *
 * `globalThis.game?.` rather than the bare `game.` its neighbours use, for the reason documented at
 * {@link getCurrencyRequirementConfig}: a bare reference throws `ReferenceError` wherever the
 * Foundry global is absent, and a throw on the craftability path does not degrade.
 *
 * @param {{ spendStrategy?: string }} config
 * @param {object|null} spender
 * @returns {string|null}
 */
function describeUnavailableCoinSpender(config, spender) {
  if (!spender) {
    const systemId = String(globalThis.game?.system?.id || '').trim() || 'unknown';
    return `No coin spender is registered for the "${config?.spendStrategy || 'actorProperty'}" currency spend strategy in system "${systemId}".`;
  }
  return spender.describeUnavailable?.() || null;
}

/**
 * Resolve everything the affordance/spend layer needs for a recipe: the config, the validated
 * profile, the resolved spender, and — when the profile is valid but that spender cannot spend —
 * `spenderUnavailableReason`, the formed sentence saying why.
 *
 * Returns `{ enabled: false }` when currency is disabled or the config is absent, and `{ error }`
 * when the profile is invalid. The disabled short-circuit stays a BARE `{ enabled: false }`: it
 * says the system does not participate, which is not a fault to report, and
 * `tests/currency-two-scope-composition.test.js` pins that shape exactly. So
 * `spenderUnavailableReason` is populated on the enabled path only.
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
 * Build the synchronous `affordCurrency(match) -> boolean` probe bound to `craftingActor` and the
 * recipe's currency profile. Returns a probe that is ALWAYS `false` (currency never satisfies) when
 * currency is disabled, misconfigured, unspendable, or no actor is supplied — so display agrees
 * with execution and a null actor never crashes (currency simply shows missing).
 *
 * **The probe's boolean contract is deliberate and must not be widened to carry the reason.**
 * `src/models/match/matchTypes.js` does `!!affordCurrency(match)`, so a `{ valid: false, message }`
 * return would coerce TRUTHY and turn every refusal into "affordable". The reason travels on the
 * context instead — `error` for an invalid profile, `spenderUnavailableReason` for a valid one with
 * no usable spender — which is where callers that need to SAY why (the craft-failure message, the
 * requirement rail) read it from.
 *
 * @param {object|null} craftingActor
 * @param {object} recipe
 * @param {{ actorInventoryCoinSpender?: object|null, actorPropertyCoinSpender?: object|null,
 *   getCraftingSystemManager?: () => object }} [seams]
 * @returns {(match: object) => boolean}
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
  // Both branches return DIRECTLY to `CraftingEngine.craft`'s result, which is what the crafting
  // player reads.
  //
  // `context.error` truthy ALSO makes `buildCurrencyAffordProbe` constant-`false` (see its
  // neighbour above), which makes `IngredientSet.resolveIngredientSelection` refuse to ever
  // choose a currency option for its group. So a real craft against an INVALID profile never
  // reaches here with a non-empty `currencySpends` at all — it fails earlier, in
  // `CraftingEngine._formatMissingItems`, which is the reported defect's actual path. Traced both
  // `CraftingEngine.craft` call sites (issue 1493 round-2 follow-up): neither has a
  // macrotask-crossing `await` between resolving the selection and this call (only a same-tick
  // microtask resumption through `_validateTools`, which performs no I/O), so the two
  // `resolveCurrencyContext` reads in one craft cannot observe a config change in between — a live
  // `updateSetting` replication (`settingChangeBridge.js`) cannot land inside that gap. Every place
  // in THIS codebase that reaches this branch with `context.error` set does so by constructing
  // `currencySpends` directly rather than through selection (see
  // `tests/currency-two-scope-composition.test.js`). Kept as a defensive guard regardless, and
  // rendered with the SAME constant sentence `_formatMissingItems` uses, so the message shape
  // matches if it is ever reached.
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

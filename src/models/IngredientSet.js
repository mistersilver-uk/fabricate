import { getFabricateFlag } from '../config/flags.js';

import { IngredientGroup } from './IngredientGroup.js';
import { getMatchHandler } from './match/matchTypes.js';

/**
 * Represents a set of ingredients that can satisfy a recipe's input requirements
 * Multiple ingredient sets allow recipes to accept alternative combinations (e.g., "2xA OR 1xB + 1xC")
 */
export class IngredientSet {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || '';

    // Ingredient groups: all groups required, one option satisfies each group.
    const groups =
      Array.isArray(data.ingredientGroups) && data.ingredientGroups.length > 0
        ? data.ingredientGroups
        : this._legacyIngredientsToGroups(data.ingredients || []);
    this.ingredientGroups = groups.map((group) =>
      group instanceof IngredientGroup ? group : IngredientGroup.fromJSON(group)
    );

    // Legacy alias retained for older UI code paths.
    this.ingredients = this.ingredientGroups
      .map((group) => group.options?.[0] || null)
      .filter(Boolean);

    // Required essences (accumulated from ingredients)
    this.essences = data.essences || {}; // { 'light': 2, 'fire': 1 }

    // Shared library tool references applying to this ingredient set.
    this.toolIds = this._normalizeToolIds(data.toolIds);

    // Result IDs to produce when this set is used (for variable recipes)
    this.resultMapping = data.resultMapping || [];

    // Mapped mode: direct routing to a specific result group.
    this.resultGroupId = data.resultGroupId || null;
  }

  /**
   * Normalize an array of library tool id strings: coerce to trimmed, non-empty,
   * deduped strings. Tolerant of non-array / nullish input (returns []).
   * @param {unknown} toolIds
   * @returns {string[]}
   */
  _normalizeToolIds(toolIds) {
    if (!Array.isArray(toolIds)) return [];
    const seen = new Set();
    const out = [];
    for (const raw of toolIds) {
      const id = String(raw ?? '').trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  _legacyIngredientsToGroups(ingredients = []) {
    return (ingredients || []).map((ingredient, idx) => ({
      id: foundry.utils.randomID(),
      name: `Group ${idx + 1}`,
      options: [ingredient],
    }));
  }

  /**
   * Validate that this ingredient set has all required data
   * @param {{requireComplete?: boolean}} [options] - When `requireComplete` is
   *   false, the completeness check (must have at least one ingredient group or
   *   essence requirement) is waived; structural checks still fire.
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate({ requireComplete = true } = {}) {
    const errors = [];

    if (
      requireComplete &&
      this.ingredientGroups.length === 0 &&
      Object.keys(this.essences).length === 0
    ) {
      errors.push('Ingredient set must have at least one ingredient group or essence requirement');
    }

    // Validate ingredient groups/options. Name the group by author-name or 1-based
    // position (never its internal id) so this detail — surfaced through the recipe's
    // `ingredientSetInvalid` issue — cannot leak an id on save (issue 595).
    for (const [groupIndex, group] of this.ingredientGroups.entries()) {
      const groupValidation = group.validate({ requireComplete });
      if (!groupValidation.valid) {
        const groupLabel =
          typeof group.name === 'string' && group.name.trim()
            ? group.name.trim()
            : String(groupIndex + 1);
        errors.push(`Ingredient group "${groupLabel}": ${groupValidation.errors.join(', ')}`);
      }
    }

    // Validate essence requirements. The set is mode/system-unaware here, so it
    // cannot resolve an essence NAME; a bad quantity is reported name-free rather
    // than echoing the raw essence id (issue 595). RecipeManager's essence-reference
    // validator surfaces the same failure with a resolved essence name when it can.
    for (const quantity of Object.values(this.essences)) {
      if (typeof quantity !== 'number' || quantity <= 0) {
        errors.push('An essence requirement must have a positive quantity');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Check if this ingredient set can be crafted with the given items
   * @param {Item[]} availableItems - Items from actor(s)
   * @param {{ resolveItemEssences?: (item: object) => Record<string, number> }} [opts] -
   *   the bound essence resolver forwarded to {@link resolveIngredientSelection} so an
   *   essence group option can draw down essence-carrying items. Defaults (undefined)
   *   to the flag-only resolver, keeping the legacy item-only path byte-for-byte.
   * @returns {boolean}
   */
  canBeCraftedWith(availableItems, { resolveItemEssences } = {}) {
    const selection = this.resolveIngredientSelection(availableItems, null, {
      resolveItemEssences,
    });
    if (!selection.success) return false;

    // Check if all essence requirements are satisfied
    if (Object.keys(this.essences).length > 0) {
      const accumulatedEssences = this._accumulateEssences(availableItems);

      for (const [essenceType, requiredQty] of Object.entries(this.essences)) {
        const availableQty = accumulatedEssences[essenceType] || 0;
        if (availableQty < requiredQty) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Accumulate essences from all available items
   * @param {Item[]} items - Items to check
   * @returns {Object} - Accumulated essences { 'light': 3, 'fire': 2 }
   * @private
   */
  _accumulateEssences(items) {
    const accumulated = {};

    for (const item of items) {
      const itemEssences = getFabricateFlag(item, 'essences', {});
      for (const [essenceType, quantity] of Object.entries(itemEssences)) {
        accumulated[essenceType] = (accumulated[essenceType] || 0) + quantity;
      }
    }

    return accumulated;
  }

  /**
   * Match ingredients to available items and return consumption plan
   * @param {Item[]} availableItems - Items from actor(s)
   * @param {Function|null} [matcher] - `(ingredient, item) => boolean` override
   * @param {{ affordCurrency?: (match: object) => boolean }} [opts] - forwarded to
   *   {@link resolveIngredientSelection}; the `currencySpends` it returns are NOT
   *   part of the item plan this method returns (currency is spent separately).
   * @returns {Array<{item: Item, quantity: number, ingredient: Ingredient}>}
   */
  matchIngredients(availableItems, matcher = null, opts = {}) {
    const selection = this.resolveIngredientSelection(availableItems, matcher, opts);
    return selection.success ? selection.plan : [];
  }

  /**
   * Resolve which option satisfies each ingredient group, building the item
   * consumption plan and (when a currency probe is supplied) the currency spends.
   *
   * Per group the resolution is items-first, currency-fallback: every NON-currency
   * option is tried first and the first item-satisfiable one wins, even if a
   * currency option is authored earlier — items strictly beat currency. Only if no
   * item option satisfies does the resolver choose the first AFFORDABLE currency
   * option (author order among currency options). A satisfied currency group adds a
   * `{ unit, amount, ingredient }` entry to `currencySpends`; the item `plan` stays
   * item-only.
   *
   * With no `affordCurrency` probe (the default), currency is NEVER chosen, so the
   * result is byte-for-byte the legacy item-only behavior that `canBeCraftedWith`
   * and the display path rely on.
   *
   * A per-group `optionOverrides` map (keyed by `group.id` — an Ingredient has no
   * stable id) lets a caller (the player-facing per-slot selector, issue 552) pick
   * a SPECIFIC option for a group instead of the first-satisfiable default. Each
   * entry is `{ optionIndex, heldItemId? }`. When an override names a valid option
   * index, THAT option is resolved (never the author-order fallback), honoured
   * whether satisfiable or not: a satisfiable option wins; a short option reports
   * the group missing with THAT option's have/need (the caller still blocks the
   * craft with the usual missing-materials message). A `heldItemId` restricts a tag
   * option to one specific held stack so the player can choose which of several
   * matching held items to consume. An explicit currency override routes to
   * `currencySpends` when affordable (an EXPLICIT player choice may pick a currency
   * option over an available item — the default items-first rule is unchanged). A
   * group with no override keeps the byte-for-byte default resolution.
   *
   * @param {Item[]} availableItems
   * @param {Function|null} [matcher]
   * @param {{ affordCurrency?: (match: object) => boolean,
   *   optionOverrides?: Record<string, {optionIndex: number, heldItemId?: string|null}> }} [options]
   * @returns {{ success: boolean, selectedIngredients: Ingredient[],
   *   plan: Array<{item: Item, quantity: number, ingredient: Ingredient}>,
   *   currencySpends: Array<{unit: string, amount: number, ingredient: Ingredient}>,
   *   missingGroups: Array<object> }}
   */
  resolveIngredientSelection(
    availableItems,
    matcher = null,
    { affordCurrency, optionOverrides, resolveItemEssences } = {}
  ) {
    // Default to a flag-only essence resolver (mirroring the legacy
    // `_accumulateEssences`), so the no-probe `canBeCraftedWith`/display path stays
    // byte-for-byte. Component-aware callers (RecipeManager/CraftingEngine) bind the
    // real resolver so standard craft can also resolve component-defined essences.
    const resolveEssences =
      typeof resolveItemEssences === 'function'
        ? resolveItemEssences
        : (item) => getFabricateFlag(item, 'essences', {});
    const remaining = new Map();
    for (const item of availableItems) {
      remaining.set(this._itemKey(item), Number(item.system?.quantity || 1));
    }

    const selectedIngredients = [];
    const plan = [];
    const currencySpends = [];
    const missingGroups = [];

    for (const group of this.ingredientGroups) {
      const options = group.options || [];

      // Player override (issue 552): resolve the explicitly chosen option instead
      // of the first-satisfiable default. Honoured whether satisfiable or not.
      const override = this._resolveGroupOverride(optionOverrides, group, options);
      if (override) {
        const option = options[override.optionIndex];
        if (option?.match?.type === 'currency') {
          const spend = this._currencySpendFor(option, affordCurrency);
          if (spend) {
            selectedIngredients.push(option);
            currencySpends.push({ unit: spend.unit, amount: spend.amount, ingredient: option });
          } else {
            missingGroups.push({ group, ingredient: option, have: 0, need: option.quantity });
          }
          continue;
        }
        if (option?.match?.type === 'essence') {
          const essenceCandidate = this._buildPlanForEssenceOption(
            option,
            availableItems,
            remaining,
            resolveEssences
          );
          if (essenceCandidate.ok) {
            selectedIngredients.push(option);
            this._commitItemPlan(essenceCandidate.plan, plan, remaining);
          } else {
            missingGroups.push({
              group,
              ingredient: option,
              have: essenceCandidate.have,
              need: Math.max(0, Number(option?.match?.amount) || 0),
            });
          }
          continue;
        }
        const candidate = this._buildPlanForIngredient(
          option,
          availableItems,
          remaining,
          matcher,
          override.heldItemId
        );
        if (candidate.ok) {
          selectedIngredients.push(option);
          this._commitItemPlan(candidate.plan, plan, remaining);
        } else {
          missingGroups.push({
            group,
            ingredient: option,
            have: candidate.have,
            need: option.quantity,
          });
        }
        continue;
      }

      let chosen = null;
      let bestMissing = null;

      // Items-first: try every non-currency option; first item-satisfiable wins. An
      // essence option is item-satisfiable too — it draws down items carrying the
      // essence via `_buildPlanForEssenceOption` (parallel to `_buildPlanForIngredient`).
      for (const option of options) {
        if (option?.match?.type === 'currency') continue;
        const isEssence = option?.match?.type === 'essence';
        const candidate = isEssence
          ? this._buildPlanForEssenceOption(option, availableItems, remaining, resolveEssences)
          : this._buildPlanForIngredient(option, availableItems, remaining, matcher);
        if (candidate.ok) {
          chosen = { option, plan: candidate.plan };
          break;
        }
        const need = isEssence ? Math.max(0, Number(option?.match?.amount) || 0) : option.quantity;
        if (!bestMissing || candidate.have > bestMissing.have) {
          bestMissing = { ingredient: option, have: candidate.have, need };
        }
      }

      // Currency-fallback: only if no item option satisfied, choose the first
      // AFFORDABLE currency option (author order among currency options).
      let chosenCurrency = null;
      if (!chosen) {
        for (const option of options) {
          if (option?.match?.type !== 'currency') continue;
          const handler = getMatchHandler(option.match);
          if (handler.affords(option.match, { affordCurrency })) {
            chosenCurrency = { option, spend: handler.getCurrencySpend(option.match) };
            break;
          }
          // Track an unaffordable currency option as the missing representative
          // when the group has no item option at all (so the missing entry can
          // surface the currency requirement).
          if (!bestMissing) {
            bestMissing = { ingredient: option, have: 0, need: option.quantity };
          }
        }
      }

      if (chosenCurrency?.spend) {
        selectedIngredients.push(chosenCurrency.option);
        currencySpends.push({
          unit: chosenCurrency.spend.unit,
          amount: chosenCurrency.spend.amount,
          ingredient: chosenCurrency.option,
        });
        continue;
      }

      if (!chosen) {
        missingGroups.push({
          group,
          ...bestMissing,
        });
        continue;
      }

      selectedIngredients.push(chosen.option);
      this._commitItemPlan(chosen.plan, plan, remaining);
    }

    return {
      success: missingGroups.length === 0,
      selectedIngredients,
      plan,
      currencySpends,
      missingGroups,
    };
  }

  /**
   * Resolve a validated `{ optionIndex, heldItemId }` override for a group, or null
   * when there is no override (or it names an out-of-range option, in which case the
   * default author-order resolution applies). Keyed by `group.id`.
   * @private
   */
  _resolveGroupOverride(optionOverrides, group, options) {
    const raw = optionOverrides?.[group?.id];
    if (!raw) return null;
    const idx = Number(raw.optionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return null;
    return { optionIndex: idx, heldItemId: raw.heldItemId ?? null };
  }

  /**
   * The affordable currency spend for a currency option, or null when the option is
   * not currency or the actor cannot afford it.
   * @private
   */
  _currencySpendFor(option, affordCurrency) {
    if (option?.match?.type !== 'currency') return null;
    const handler = getMatchHandler(option.match);
    if (!handler.affords(option.match, { affordCurrency })) return null;
    return handler.getCurrencySpend(option.match);
  }

  /**
   * Append a chosen option's item plan entries to the running plan and deduct their
   * quantities from the remaining pool (shared by the default and override paths so
   * the remaining-quantity bookkeeping stays identical).
   * @private
   */
  _commitItemPlan(candidatePlan, plan, remaining) {
    for (const entry of candidatePlan) {
      plan.push(entry);
      const key = this._itemKey(entry.item);
      const next = (remaining.get(key) || 0) - entry.quantity;
      remaining.set(key, Math.max(0, next));
    }
  }

  _buildPlanForIngredient(
    ingredient,
    availableItems,
    remaining,
    matcher = null,
    restrictItemId = null
  ) {
    // A currency option is never item-satisfiable: short-circuit to not-satisfiable
    // so the resolver never item-matches it (currency is chosen by the affordability
    // probe in the fallback pass, not here).
    if (ingredient?.match?.type === 'currency') {
      return { ok: false, plan: [], have: 0 };
    }

    let neededQuantity = ingredient.quantity;
    const optionPlan = [];
    let totalAvailable = 0;

    // `restrictItemId` (issue 552 tag-stack choice) narrows a tag option to one
    // specific held stack the player picked, so the craft consumes THAT item.
    const matchingItems = availableItems.filter((item) => {
      if (restrictItemId && this._itemKey(item) !== restrictItemId) return false;
      return matcher ? matcher(ingredient, item) : ingredient.matches(item);
    });

    for (const item of matchingItems) {
      const key = this._itemKey(item);
      const availableQty = Number(remaining.get(key) || 0);
      if (availableQty <= 0) continue;

      totalAvailable += availableQty;
      if (neededQuantity <= 0) continue;

      const toConsume = Math.min(neededQuantity, availableQty);
      optionPlan.push({
        item,
        quantity: toConsume,
        ingredient,
      });
      neededQuantity -= toConsume;
    }

    return {
      ok: neededQuantity <= 0,
      plan: optionPlan,
      have: totalAvailable,
    };
  }

  /**
   * Build the item-consumption plan for an ESSENCE option: draw down items whose
   * accumulated `essenceId` essence reaches the option's `amount`, unit-granular.
   * Parallel to {@link _buildPlanForIngredient} — it reads the shared `remaining`
   * Map (skipping items already exhausted by a component/tag group in the same set,
   * the anti-double-consume invariant) and returns entries committed through
   * {@link _commitItemPlan}. Consumption is unit-granular, so an indivisible item
   * may over-consume past `amount` (symmetric with tag/component options).
   *
   * The per-item essence map comes from the injected `resolveItemEssences` probe
   * (flag-only by default, component-aware in callers), NEVER from
   * `Ingredient.matches()`.
   *
   * @param {object} option - the essence Ingredient option
   * @param {Item[]} availableItems
   * @param {Map<string, number>} remaining
   * @param {(item: object) => Record<string, number>} resolveItemEssences
   * @returns {{ ok: boolean, plan: Array<{item: object, quantity: number, ingredient: object}>, have: number }}
   * @private
   */
  _buildPlanForEssenceOption(option, availableItems, remaining, resolveItemEssences) {
    const essenceId = String(option?.match?.essenceId || '').trim();
    const amount = Math.max(0, Number(option?.match?.amount) || 0);
    if (!essenceId || amount <= 0) {
      // A zero-amount / id-less essence option is a runtime no-op — satisfied with no
      // consumption (mirrors dropping non-positive essence entries at migration).
      return { ok: true, plan: [], have: 0 };
    }

    let accumulated = 0;
    let totalAvailable = 0;
    const optionPlan = [];

    for (const item of availableItems) {
      const key = this._itemKey(item);
      const availableUnits = Number(remaining.get(key) || 0);
      if (availableUnits <= 0) continue;

      const essences = resolveItemEssences ? resolveItemEssences(item) : {};
      const perUnit = Number(essences?.[essenceId]) || 0;
      if (perUnit <= 0) continue;

      totalAvailable += perUnit * availableUnits;
      if (accumulated >= amount) continue;

      // Units needed to reach the remaining requirement (unit-granular; the last
      // unit may over-consume past `amount` when the item is worth more per unit).
      const unitsNeeded = Math.ceil((amount - accumulated) / perUnit);
      const unitsToConsume = Math.min(unitsNeeded, availableUnits);
      optionPlan.push({ item, quantity: unitsToConsume, ingredient: option });
      accumulated += perUnit * unitsToConsume;
    }

    return {
      ok: accumulated >= amount,
      plan: optionPlan,
      have: totalAvailable,
    };
  }

  _itemKey(item) {
    return item.uuid || item.id;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      ingredientGroups: this.ingredientGroups.map((group) => group.toJSON()),
      // Legacy alias retained for compatibility with older consumers.
      ingredients: this.ingredients.map((i) => i.toJSON()),
      essences: this.essences,
      toolIds: [...this.toolIds],
      resultMapping: this.resultMapping,
      resultGroupId: this.resultGroupId,
    };
  }

  static fromJSON(data) {
    return new IngredientSet(data);
  }
}

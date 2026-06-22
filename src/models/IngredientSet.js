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

    // Validate ingredient groups/options
    for (const group of this.ingredientGroups) {
      const groupValidation = group.validate({ requireComplete });
      if (!groupValidation.valid) {
        errors.push(
          `Ingredient group "${group.name || group.id}": ${groupValidation.errors.join(', ')}`
        );
      }
    }

    // Validate essence requirements
    for (const [essenceType, quantity] of Object.entries(this.essences)) {
      if (typeof quantity !== 'number' || quantity <= 0) {
        errors.push(`Essence "${essenceType}" must have a positive quantity`);
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
   * @returns {boolean}
   */
  canBeCraftedWith(availableItems) {
    const selection = this.resolveIngredientSelection(availableItems);
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
   * @param {Item[]} availableItems
   * @param {Function|null} [matcher]
   * @param {{ affordCurrency?: (match: object) => boolean }} [options]
   * @returns {{ success: boolean, selectedIngredients: Ingredient[],
   *   plan: Array<{item: Item, quantity: number, ingredient: Ingredient}>,
   *   currencySpends: Array<{unit: string, amount: number, ingredient: Ingredient}>,
   *   missingGroups: Array<object> }}
   */
  resolveIngredientSelection(availableItems, matcher = null, { affordCurrency } = {}) {
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
      let chosen = null;
      let bestMissing = null;

      // Items-first: try every non-currency option; first item-satisfiable wins.
      for (const option of options) {
        if (option?.match?.type === 'currency') continue;
        const candidate = this._buildPlanForIngredient(option, availableItems, remaining, matcher);
        if (candidate.ok) {
          chosen = { option, plan: candidate.plan };
          break;
        }
        if (!bestMissing || candidate.have > bestMissing.have) {
          bestMissing = { ingredient: option, have: candidate.have, need: option.quantity };
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
      for (const entry of chosen.plan) {
        plan.push(entry);
        const key = this._itemKey(entry.item);
        const next = (remaining.get(key) || 0) - entry.quantity;
        remaining.set(key, Math.max(0, next));
      }
    }

    return {
      success: missingGroups.length === 0,
      selectedIngredients,
      plan,
      currencySpends,
      missingGroups,
    };
  }

  _buildPlanForIngredient(ingredient, availableItems, remaining, matcher = null) {
    // A currency option is never item-satisfiable: short-circuit to not-satisfiable
    // so the resolver never item-matches it (currency is chosen by the affordability
    // probe in the fallback pass, not here).
    if (ingredient?.match?.type === 'currency') {
      return { ok: false, plan: [], have: 0 };
    }

    let neededQuantity = ingredient.quantity;
    const optionPlan = [];
    let totalAvailable = 0;

    const matchingItems = availableItems.filter((item) =>
      matcher ? matcher(ingredient, item) : ingredient.matches(item)
    );

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

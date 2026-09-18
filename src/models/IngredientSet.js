import { getFabricateFlag } from '../config/flags.js';

import { createIngredientSolver } from './ingredientAssignment.js';
import { IngredientGroup } from './IngredientGroup.js';
import {
  isEmptyArray,
  isEmptyMap,
  isEmptyString,
  isNull,
  omitReconstructibleDefaults,
} from './reconstructibleDefaults.js';

/**
 * Serialized ingredient-SET fields the `IngredientSet` constructor rebuilds to EXACTLY this value
 * when the key is absent, so emitting them is pure payload weight (issue 1135).
 */
export const INGREDIENT_SET_OMITTED_WHEN_DEFAULT = {
  name: isEmptyString,
  essences: isEmptyMap,
  toolIds: isEmptyArray,
  resultMapping: isEmptyArray,
  resultGroupId: isNull,
};

// Re-exported so callers of the model keep reading the cap from it while the ledger owns the value.
export { INGREDIENT_SEARCH_NODE_CAP } from './ingredientLedger.js';

/**
 * Represents a set of ingredients that can satisfy a recipe's input requirements. Multiple
 * ingredient sets allow recipes to accept alternative combinations (e.g., "2xA OR 1xB + 1xC")
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
   * Normalize an array of library tool id strings: coerce to trimmed, non-empty, deduped strings.
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

  /** PERMANENT INBOUND SHIM — do not remove with a "the alias is gone" cleanup. */
  _legacyIngredientsToGroups(ingredients = []) {
    return (ingredients || []).map((ingredient, idx) => ({
      id: foundry.utils.randomID(),
      name: `Group ${idx + 1}`,
      options: [ingredient],
    }));
  }

  /** Validate that this ingredient set has all required data */
  validate({ requireComplete = true } = {}) {
    const errors = [];

    if (
      requireComplete &&
      this.ingredientGroups.length === 0 &&
      Object.keys(this.essences).length === 0
    ) {
      errors.push('Ingredient set must have at least one ingredient group or essence requirement');
    }

    // Validate ingredient groups/options.
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

    // Validate essence requirements.
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

  /** Check if this ingredient set can be crafted with the given items */
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

  /** Accumulate essences from all available items */
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

  /** Match ingredients to available items and return consumption plan */
  matchIngredients(availableItems, matcher = null, opts = {}) {
    const selection = this.resolveIngredientSelection(availableItems, matcher, opts);
    return selection.success ? selection.plan : [];
  }

  /**
   * Resolve which option satisfies each ingredient group, building the item consumption plan and
   * (when a currency probe is supplied) the currency spends.
   */
  resolveIngredientSelection(availableItems, matcher = null, options = {}) {
    return createIngredientSolver({
      ingredientGroups: this.ingredientGroups,
      ingredientSetId: this.id,
    }).resolve(availableItems, matcher, options);
  }

  /**
   * Serialize this set, omitting every reconstructible default and the write-retired flat
   * `ingredients` alias (issue 1135).
   */
  toJSON() {
    return omitReconstructibleDefaults(
      {
        id: this.id,
        name: this.name,
        ingredientGroups: this.ingredientGroups.map((group) => group.toJSON()),
        essences: this.essences,
        toolIds: [...this.toolIds],
        resultMapping: this.resultMapping,
        resultGroupId: this.resultGroupId,
      },
      INGREDIENT_SET_OMITTED_WHEN_DEFAULT
    );
  }

  static fromJSON(data) {
    return new IngredientSet(data);
  }
}

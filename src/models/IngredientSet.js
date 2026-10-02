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

/** Fields the constructor rebuilds exactly from absence (issue 1135). */
export const INGREDIENT_SET_OMITTED_WHEN_DEFAULT = {
  name: isEmptyString,
  essences: isEmptyMap,
  toolIds: isEmptyArray,
  resultMapping: isEmptyArray,
  resultGroupId: isNull,
};

export { INGREDIENT_SEARCH_NODE_CAP } from './ingredientLedger.js';

/** One alternative combination that satisfies a recipe's inputs. */
export class IngredientSet {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || '';

    // Every group is required; one option satisfies each.
    const groups =
      Array.isArray(data.ingredientGroups) && data.ingredientGroups.length > 0
        ? data.ingredientGroups
        : this._legacyIngredientsToGroups(data.ingredients || []);
    this.ingredientGroups = groups.map((group) =>
      group instanceof IngredientGroup ? group : IngredientGroup.fromJSON(group)
    );

    this.ingredients = this.ingredientGroups
      .map((group) => group.options?.[0] || null)
      .filter(Boolean);

    this.essences = data.essences || {}; // { 'light': 2, 'fire': 1 }

    this.toolIds = this._normalizeToolIds(data.toolIds);

    // For variable recipes.
    this.resultMapping = data.resultMapping || [];

    this.resultGroupId = data.resultGroupId || null;
  }

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

  validate({ requireComplete = true } = {}) {
    const errors = [];

    if (
      requireComplete &&
      this.ingredientGroups.length === 0 &&
      Object.keys(this.essences).length === 0
    ) {
      errors.push('Ingredient set must have at least one ingredient group or essence requirement');
    }

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

  canBeCraftedWith(availableItems, { resolveItemEssences } = {}) {
    const selection = this.resolveIngredientSelection(availableItems, null, {
      resolveItemEssences,
    });
    if (!selection.success) return false;

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

  matchIngredients(availableItems, matcher = null, opts = {}) {
    const selection = this.resolveIngredientSelection(availableItems, matcher, opts);
    return selection.success ? selection.plan : [];
  }

  /** The option per group, the item plan and, given a currency probe, the spends. */
  resolveIngredientSelection(availableItems, matcher = null, options = {}) {
    return createIngredientSolver({
      ingredientGroups: this.ingredientGroups,
      ingredientSetId: this.id,
    }).resolve(availableItems, matcher, options);
  }

  /** Omits reconstructible defaults and the write-retired `ingredients` alias (issue 1135). */
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

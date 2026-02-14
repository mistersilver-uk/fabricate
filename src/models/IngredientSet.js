import { Ingredient } from './Ingredient.js';
import { Catalyst } from './Catalyst.js';

/**
 * Represents a set of ingredients that can satisfy a recipe's input requirements
 * Multiple ingredient sets allow recipes to accept alternative combinations (e.g., "2xA OR 1xB + 1xC")
 */
export class IngredientSet {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || '';

    // Ingredients required for this set
    this.ingredients = (data.ingredients || []).map(i =>
      i instanceof Ingredient ? i : Ingredient.fromJSON(i)
    );

    // Required essences (accumulated from ingredients)
    this.essences = data.essences || {}; // { 'light': 2, 'fire': 1 }

    // Catalysts for this specific ingredient set (non-consumable requirements)
    this.catalysts = (data.catalysts || []).map(c =>
      c instanceof Catalyst ? c : Catalyst.fromJSON(c)
    );

    // Result IDs to produce when this set is used (for variable recipes)
    this.resultMapping = data.resultMapping || [];
  }

  /**
   * Validate that this ingredient set has all required data
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    if (this.ingredients.length === 0 && Object.keys(this.essences).length === 0) {
      errors.push('Ingredient set must have at least one ingredient or essence requirement');
    }

    // Validate all ingredients
    for (const ingredient of this.ingredients) {
      const ingredientValidation = ingredient.validate();
      if (!ingredientValidation.valid) {
        errors.push(`Invalid ingredient: ${ingredientValidation.errors.join(', ')}`);
      }
    }

    // Validate essence requirements
    for (const [essenceType, quantity] of Object.entries(this.essences)) {
      if (typeof quantity !== 'number' || quantity <= 0) {
        errors.push(`Essence "${essenceType}" must have a positive quantity`);
      }
    }

    // Validate catalysts
    for (const catalyst of this.catalysts) {
      if (!catalyst.itemUuid && !catalyst.systemItemId && !catalyst.tag) {
        errors.push('Catalyst must have systemItemId, itemUuid, or tag');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Check if this ingredient set can be crafted with the given items
   * @param {Item[]} availableItems - Items from actor(s)
   * @returns {boolean}
   */
  canBeCraftedWith(availableItems) {
    // Check if all ingredients are satisfied
    for (const ingredient of this.ingredients) {
      const matchingItems = availableItems.filter(item => ingredient.matches(item));
      const totalQuantity = matchingItems.reduce((sum, item) =>
        sum + (item.system.quantity || 1), 0
      );

      if (totalQuantity < ingredient.quantity) {
        return false;
      }
    }

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
      const itemEssences = item.getFlag('fabricate-v2', 'essences') || {};
      for (const [essenceType, quantity] of Object.entries(itemEssences)) {
        accumulated[essenceType] = (accumulated[essenceType] || 0) + quantity;
      }
    }

    return accumulated;
  }

  /**
   * Match ingredients to available items and return consumption plan
   * @param {Item[]} availableItems - Items from actor(s)
   * @returns {Array<{item: Item, quantity: number, ingredient: Ingredient}>}
   */
  matchIngredients(availableItems, matcher = null) {
    const consumptionPlan = [];

    for (const ingredient of this.ingredients) {
      let neededQuantity = ingredient.quantity;
      const matchingItems = availableItems.filter(item =>
        matcher ? matcher(ingredient, item) : ingredient.matches(item)
      );

      for (const item of matchingItems) {
        if (neededQuantity <= 0) break;

        const itemQuantity = item.system.quantity || 1;
        const toConsume = Math.min(neededQuantity, itemQuantity);

        consumptionPlan.push({
          item,
          quantity: toConsume,
          ingredient
        });

        neededQuantity -= toConsume;
      }
    }

    return consumptionPlan;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      ingredients: this.ingredients.map(i => i.toJSON()),
      essences: this.essences,
      catalysts: this.catalysts.map(c => c.toJSON()),
      resultMapping: this.resultMapping
    };
  }

  static fromJSON(data) {
    return new IngredientSet(data);
  }
}

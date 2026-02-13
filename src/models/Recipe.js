import { IngredientSet } from './IngredientSet.js';
import { Catalyst } from './Catalyst.js';
import { Result } from './Result.js';
import { Ingredient } from './Ingredient.js';

/**
 * Represents a crafting recipe
 * Supports simple (A + B = C) and complex (multiple ingredient sets, variable output, essences) modes
 */
export class Recipe {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || 'Unnamed Recipe';
    this.description = data.description || '';
    this.img = data.img || 'icons/svg/item-bag.svg';
    this.category = data.category || 'general';
    this.system = data.system || 'all';
    this.tags = Array.isArray(data.tags) ? data.tags : [];
    this.enabled = data.enabled !== undefined ? data.enabled : true;

    // Input requirements (at least one set must be satisfied)
    this.ingredientSets = (data.ingredientSets || []).map(s =>
      s instanceof IngredientSet ? s : IngredientSet.fromJSON(s)
    );

    // Catalysts (non-consumable requirements)
    this.catalysts = (data.catalysts || []).map(c =>
      c instanceof Catalyst ? c : Catalyst.fromJSON(c)
    );

    // Output (multiple items can be produced)
    this.results = (data.results || []).map(r =>
      r instanceof Result ? r : Result.fromJSON(r)
    );

    // Recipe behavior
    this.isVariable = data.isVariable !== undefined ? data.isVariable : false;
    this.transferEffects = data.transferEffects !== undefined ? data.transferEffects : false;
    this.requiresAllSets = data.requiresAllSets !== undefined ? data.requiresAllSets : false;

    // Metadata
    this.metadata = data.metadata || {
      created: Date.now(),
      modified: Date.now(),
      author: game?.user?.name || 'Unknown',
      version: '1.0.0'
    };
  }

  /**
   * Get a simple description of what this recipe produces
   * @returns {string}
   */
  getResultDescription() {
    if (this.results.length === 0) return 'No result';
    if (this.results.length === 1) return this.results[0].getDescription();
    return `${this.results.length} items`;
  }

  /**
   * Check if this is a simple recipe (no advanced features)
   * @returns {boolean}
   */
  isSimpleRecipe() {
    // Single ingredient set with exact item matching (no tags)
    const hasSimpleIngredients =
      this.ingredientSets.length === 1 &&
      this.ingredientSets[0].ingredients.every(ing => ing.itemUuid && !ing.tag) &&
      Object.keys(this.ingredientSets[0].essences || {}).length === 0;

    const hasNoCatalysts = this.catalysts.length === 0;
    const hasNoVariableOutput = !this.isVariable;
    const hasNoEffectTransfer = !this.transferEffects;

    return hasSimpleIngredients && hasNoCatalysts && hasNoVariableOutput && hasNoEffectTransfer;
  }

  /**
   * Validate that this recipe has all required data
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    // Basic validation
    if (!this.name) errors.push('Recipe must have a name');

    // Ingredient set validation
    if (this.ingredientSets.length === 0) {
      errors.push('Recipe must have at least one ingredient set');
    }

    for (const ingredientSet of this.ingredientSets) {
      const setValidation = ingredientSet.validate();
      if (!setValidation.valid) {
        errors.push(`Ingredient set "${ingredientSet.name || ingredientSet.id}": ${setValidation.errors.join(', ')}`);
      }
    }

    // Result validation
    if (this.results.length === 0) {
      errors.push('Recipe must have at least one result');
    }

    const resultIds = new Set();
    for (const result of this.results) {
      // Check for duplicate IDs
      if (resultIds.has(result.id)) {
        errors.push(`Duplicate result ID: ${result.id}`);
      }
      resultIds.add(result.id);

      const resultValidation = result.validate();
      if (!resultValidation.valid) {
        errors.push(`Result "${result.id}": ${resultValidation.errors.join(', ')}`);
      }
    }

    // Variable recipe validation
    if (this.isVariable) {
      for (const ingredientSet of this.ingredientSets) {
        for (const resultId of ingredientSet.resultMapping) {
          if (!resultIds.has(resultId)) {
            errors.push(`Ingredient set "${ingredientSet.name || ingredientSet.id}" references invalid result ID: ${resultId}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      img: this.img,
      category: this.category,
      system: this.system,
      tags: this.tags,
      enabled: this.enabled,
      ingredientSets: this.ingredientSets.map(s => s.toJSON()),
      catalysts: this.catalysts.map(c => c.toJSON()),
      results: this.results.map(r => r.toJSON()),
      isVariable: this.isVariable,
      transferEffects: this.transferEffects,
      requiresAllSets: this.requiresAllSets,
      metadata: this.metadata
    };
  }

  static fromJSON(data) {
    return new Recipe(data);
  }

  /**
   * Create a simple recipe with minimal configuration
   * @param {string} name - Recipe name
   * @param {Array} ingredients - Array of {itemUuid, quantity} objects
   * @param {Object} result - {itemUuid, quantity} object
   * @returns {Recipe}
   */
  static createSimple(name, ingredients, result) {
    return new Recipe({
      name,
      ingredientSets: [
        new IngredientSet({
          id: 'default',
          ingredients: ingredients.map(ing => new Ingredient({
            itemUuid: ing.itemUuid,
            quantity: ing.quantity || 1
          }))
        })
      ],
      results: [
        new Result({
          id: 'default',
          itemUuid: result.itemUuid,
          quantity: result.quantity || 1
        })
      ],
      isVariable: false,
      transferEffects: false
    });
  }
}

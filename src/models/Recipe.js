import { IngredientSet } from './IngredientSet.js';
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
    this.craftingSystemId = data.craftingSystemId || null;
    this.system = data.system || 'all';
    this.tags = Array.isArray(data.tags) ? data.tags : [];
    this.enabled = data.enabled !== undefined ? data.enabled : true;

    // Input requirements (at least one set must be satisfied)
    this.ingredientSets = (data.ingredientSets || []).map(s =>
      s instanceof IngredientSet ? s : IngredientSet.fromJSON(s)
    );

    // Output groups (canonical). Legacy flat `results` is still accepted and flattened for compatibility.
    this.resultGroups = this._normalizeResultGroups(data);
    this.results = this.resultGroups.flatMap(group => group.results);

    // Recipe behaviour
    this.isVariable = data.isVariable !== undefined ? data.isVariable : false;
    this.transferEffects = data.transferEffects !== undefined ? data.transferEffects : false;
    this.requiresAllSets = data.requiresAllSets !== undefined ? data.requiresAllSets : false;
    this.outcomeRouting = data.outcomeRouting && typeof data.outcomeRouting === 'object'
      ? { ...data.outcomeRouting }
      : null;

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
    if (this.resultGroups.length === 0) return 'No result';
    if (this.resultGroups.length === 1 && this.resultGroups[0].results.length === 1) {
      return this.resultGroups[0].results[0].getDescription();
    }
    return `${this.resultGroups.length} result groups`;
  }

  /**
   * Check if this is a simple recipe (no advanced features)
   * @returns {boolean}
   */
  isSimpleRecipe() {
    // Single ingredient set with exact item matching (no tags)
    const hasSimpleIngredients =
      this.ingredientSets.length === 1 &&
      this.ingredientSets[0].ingredients.every(ing => (ing.itemUuid || ing.systemItemId) && !ing.tag) &&
      Object.keys(this.ingredientSets[0].essences || {}).length === 0;

    const hasNoCatalysts =
      this.ingredientSets.every(set => (set.catalysts?.length || 0) === 0);
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
    if (this.resultGroups.length === 0) {
      errors.push('Recipe must have at least one result group');
    }

    const resultGroupIds = new Set();
    const resultIds = new Set();
    for (const group of this.resultGroups) {
      if (resultGroupIds.has(group.id)) {
        errors.push(`Duplicate result group ID: ${group.id}`);
      }
      resultGroupIds.add(group.id);
      if (!Array.isArray(group.results) || group.results.length === 0) {
        errors.push(`Result group "${group.id}" must contain at least one result`);
        continue;
      }

      for (const result of group.results) {
        if (resultIds.has(result.id)) {
          errors.push(`Duplicate result ID: ${result.id}`);
        }
        resultIds.add(result.id);

        const resultValidation = result.validate();
        if (!resultValidation.valid) {
          errors.push(`Result "${result.id}": ${resultValidation.errors.join(', ')}`);
        }
      }
    }

    // Variable recipe validation
    if (this.isVariable) {
      for (const ingredientSet of this.ingredientSets) {
        for (const mappingId of ingredientSet.resultMapping) {
          const valid = resultGroupIds.has(mappingId) || resultIds.has(mappingId);
          if (!valid) {
            errors.push(`Ingredient set "${ingredientSet.name || ingredientSet.id}" references invalid result mapping ID: ${mappingId}`);
          }
        }
      }
    }

    if (this.outcomeRouting && typeof this.outcomeRouting === 'object') {
      for (const [outcome, resultGroupId] of Object.entries(this.outcomeRouting)) {
        if (resultGroupId && !resultGroupIds.has(resultGroupId)) {
          errors.push(`Outcome routing "${outcome}" references invalid result group ID: ${resultGroupId}`);
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
      craftingSystemId: this.craftingSystemId,
      system: this.system,
      tags: this.tags,
      enabled: this.enabled,
      ingredientSets: this.ingredientSets.map(s => s.toJSON()),
      resultGroups: this.resultGroups.map(group => ({
        id: group.id,
        name: group.name,
        results: group.results.map(r => r.toJSON())
      })),
      // Legacy alias retained for compatibility with older consumers.
      results: this.results.map(r => r.toJSON()),
      isVariable: this.isVariable,
      transferEffects: this.transferEffects,
      requiresAllSets: this.requiresAllSets,
      outcomeRouting: this.outcomeRouting,
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
      resultGroups: [
        {
          id: 'default',
          name: 'Default',
          results: [
            new Result({
              id: 'default-result',
              itemUuid: result.itemUuid,
              quantity: result.quantity || 1
            })
          ]
        }
      ],
      isVariable: false,
      transferEffects: false
    });
  }

  _normalizeResultGroups(data = {}) {
    if (Array.isArray(data.resultGroups) && data.resultGroups.length > 0) {
      return data.resultGroups.map((group, idx) => ({
        id: group?.id || foundry.utils.randomID(),
        name: group?.name || `Result Group ${idx + 1}`,
        results: (group?.results || []).map(r => (r instanceof Result ? r : Result.fromJSON(r)))
      }));
    }

    const legacyResults = Array.isArray(data.results) ? data.results : [];
    return legacyResults.map((r, idx) => {
      const result = r instanceof Result ? r : Result.fromJSON(r);
      return {
        id: result.id || foundry.utils.randomID(),
        name: `Result Group ${idx + 1}`,
        results: [result]
      };
    });
  }
}

/**
 * Represents an ingredient required for crafting
 * Supports both simple (exact item) and advanced (tag-based) matching
 */
export class Ingredient {
  constructor(data = {}) {
    // Item matching by Foundry Source UUID (core.sourceId flag)
    this.itemUuid = data.itemUuid || null;
    this.quantity = data.quantity || 1;

    // Advanced mode: tag-based matching
    this.tag = data.tag || null; // e.g., "metal", "herb:healing"
    this.tier = data.tier || null; // e.g., "common", "rare", "legendary"

    // Alternative ingredients (OR logic)
    this.alternatives = data.alternatives || []; // Array of Ingredient objects

    // Effect extraction settings
    this.extractEffects = data.extractEffects !== undefined ? data.extractEffects : false;
    this.effectFilter = data.effectFilter || null; // Regex or array of effect names to extract
  }

  /**
   * Check if a given item matches this ingredient requirement
   * @param {Item} item - The Foundry Item to check
   * @returns {boolean}
   */
  matches(item) {
    // Exact match by UUID
    if (this.itemUuid && item.uuid === this.itemUuid) return true;

    // Tag-based matching
    if (this.tag) {
      const itemTags = item.getFlag('fabricate-v2', 'tags') || [];
      if (itemTags.includes(this.tag)) {
        // Check tier if specified
        if (this.tier) {
          const itemTier = item.getFlag('fabricate-v2', 'tier');
          return itemTier === this.tier;
        }
        return true;
      }
    }

    // Check alternatives
    return this.alternatives.some(alt => alt.matches(item));
  }

  /**
   * Validate that this ingredient has all required data
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    if (!this.itemUuid && !this.tag) {
      errors.push('Ingredient must have either itemUuid or tag');
    }

    if (typeof this.quantity !== 'number' || this.quantity <= 0) {
      errors.push('Ingredient quantity must be a positive number');
    }

    // Validate alternatives
    for (const alt of this.alternatives) {
      const altValidation = alt.validate();
      if (!altValidation.valid) {
        errors.push(`Alternative ingredient: ${altValidation.errors.join(', ')}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get a simple description of this ingredient
   * @returns {string}
   */
  getDescription() {
    if (this.itemUuid) {
      return `${this.quantity}x specific item`;
    }
    if (this.tag) {
      const tierStr = this.tier ? ` (${this.tier})` : '';
      return `${this.quantity}x ${this.tag}${tierStr}`;
    }
    if (this.alternatives.length > 0) {
      return `${this.quantity}x (${this.alternatives.length} alternatives)`;
    }
    return 'Unknown ingredient';
  }

  toJSON() {
    return {
      itemUuid: this.itemUuid,
      quantity: this.quantity,
      tag: this.tag,
      tier: this.tier,
      alternatives: this.alternatives.map(alt => alt.toJSON()),
      extractEffects: this.extractEffects,
      effectFilter: this.effectFilter
    };
  }

  static fromJSON(data) {
    const ingredient = new Ingredient(data);
    if (data.alternatives) {
      ingredient.alternatives = data.alternatives.map(alt => Ingredient.fromJSON(alt));
    }
    return ingredient;
  }
}

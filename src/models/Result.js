/**
 * Represents an item produced by a recipe
 * Recipes can produce multiple different items
 */
export class Result {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();

    // Foundry Source UUID (core.sourceId flag) of item to create
    this.itemUuid = data.itemUuid || null;

    // Number of items created
    this.quantity = data.quantity || 1;

    // Dynamic property calculation
    // e.g., { "system.damage.parts": "1d6 + @tier" }
    this.propertyFormulas = data.propertyFormulas || {};
  }

  /**
   * Validate that this result has all required data
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    if (!this.itemUuid) {
      errors.push('Result must have an itemUuid (Foundry Source UUID)');
    }

    if (typeof this.quantity !== 'number' || this.quantity <= 0) {
      errors.push('Result quantity must be a positive number');
    }

    // Validate property formulas
    if (this.propertyFormulas && typeof this.propertyFormulas !== 'object') {
      errors.push('Property formulas must be an object');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get a simple description of this result
   * @returns {string}
   */
  getDescription() {
    return `${this.quantity}x item`;
  }

  toJSON() {
    return {
      id: this.id,
      itemUuid: this.itemUuid,
      quantity: this.quantity,
      propertyFormulas: this.propertyFormulas
    };
  }

  static fromJSON(data) {
    return new Result(data);
  }
}

/**
 * Represents an item produced by a recipe
 * Recipes can produce multiple different items
 */
export class Result {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();

    // Managed item reference inside a crafting system
    this.componentId = data.componentId || data.systemItemId || null;

    // Foundry Source UUID (core.sourceId flag) of item to create
    this.itemUuid = data.itemUuid || null;

    // Number of items created
    this.quantity = data.quantity || 1;

    // Macro-based property calculation
    this.propertyMacroUuid = data.propertyMacroUuid || null;
  }

  /**
   * Validate that this result has all required data
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    if (!this.itemUuid && !this.componentId) {
      errors.push('Result must have componentId or itemUuid');
    }

    if (typeof this.quantity !== 'number' || this.quantity <= 0) {
      errors.push('Result quantity must be a positive number');
    }

    if (this.propertyMacroUuid !== null && typeof this.propertyMacroUuid !== 'string') {
      errors.push('Property macro UUID must be a string or null');
    }

    return {
      valid: errors.length === 0,
      errors,
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
      componentId: this.componentId,
      systemItemId: this.componentId,
      itemUuid: this.itemUuid,
      quantity: this.quantity,
      propertyMacroUuid: this.propertyMacroUuid,
    };
  }

  static fromJSON(data) {
    return new Result(data);
  }
}

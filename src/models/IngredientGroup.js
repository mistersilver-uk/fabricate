import { Ingredient } from './Ingredient.js';

/**
 * Represents one ingredient group where any one option can satisfy the group.
 */
export class IngredientGroup {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();
    this.name = data.name || '';
    this.options = (data.options || []).map((option) =>
      option instanceof Ingredient ? option : Ingredient.fromJSON(option)
    );
  }

  validate() {
    const errors = [];

    if (!Array.isArray(this.options) || this.options.length === 0) {
      errors.push('Ingredient group must include at least one option');
    }

    for (const option of this.options) {
      const validation = option.validate();
      if (!validation.valid) {
        errors.push(...validation.errors.map((err) => `Option: ${err}`));
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      options: this.options.map((option) => option.toJSON()),
    };
  }

  static fromJSON(data) {
    return new IngredientGroup(data);
  }
}

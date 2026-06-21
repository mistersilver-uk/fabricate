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

  /**
   * Validate this ingredient group.
   * @param {{requireComplete?: boolean}} [options] - When `requireComplete` is
   *   false, the completeness check (must include at least one option) is waived so
   *   a freshly added, still-empty group persists; each option's structural checks
   *   still fire.
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate({ requireComplete = true } = {}) {
    const errors = [];

    if (requireComplete && (!Array.isArray(this.options) || this.options.length === 0)) {
      errors.push('Ingredient group must include at least one option');
    }

    for (const option of this.options) {
      const validation = option.validate({ requireComplete });
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

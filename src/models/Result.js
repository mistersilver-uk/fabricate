import { hasRollDataPath, maximisedTotal } from '../utils/rollFormulaRollability.js';

import { isNull, omitReconstructibleDefaults } from './reconstructibleDefaults.js';

/** Serialized result fields the constructor rebuilds to EXACTLY this value from absence, so
 *  emitting them is pure payload weight (issue 1135). */
export const RESULT_OMITTED_WHEN_DEFAULT = {
  quantityFormula: isNull,
};

/** The persisted form of an amount formula: a trimmed non-empty string, or `null` for absent. */
export function normalizeQuantityFormula(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}

/** The rollability floor an amount expression must clear, as validation errors; `Roll` is injected,
 *  and the gathering data boundary applies the same floor through this one function (issue 1645). */
export function quantityFormulaErrors(quantityFormula, Roll) {
  if (!quantityFormula || typeof Roll !== 'function') return [];
  const maximum = maximisedTotal(quantityFormula, Roll);
  if (maximum === null) return ['quantity formula cannot be rolled'];
  if (maximum <= 0 && !hasRollDataPath(quantityFormula)) {
    return ['quantity formula can never award a positive amount'];
  }
  return [];
}

/** An item a recipe produces; a recipe can produce several. */
export class Result {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();

    this.componentId = data.componentId || data.systemItemId || null;

    // Foundry Source UUID (core.sourceId flag) of item to create
    this.itemUuid = data.itemUuid || null;

    this.quantity = data.quantity || 1;

    // Presence is the mode: a non-empty formula ROLLS the amount and `quantity` becomes the authored
    // amount it falls back to. `''` and whitespace ARE absence, so the two on-disk states are one.
    this.quantityFormula = normalizeQuantityFormula(data.quantityFormula);

    this.propertyMacroUuid = data.propertyMacroUuid || null;
  }

  /** `Roll` is INJECTED: with none, nothing is reported about `quantityFormula`, because a missing
   *  dice engine can decide no formula and no actor-free reading can decide a path-bearing one. */
  validate({ Roll } = {}) {
    const errors = [];

    if (!this.itemUuid && !this.componentId) {
      errors.push('Result must have componentId or itemUuid');
    }

    if (typeof this.quantity !== 'number' || this.quantity <= 0) {
      errors.push('Result quantity must be a positive number');
    }

    errors.push(
      ...quantityFormulaErrors(this.quantityFormula, Roll).map((error) => `Result ${error}`)
    );

    if (this.propertyMacroUuid !== null && typeof this.propertyMacroUuid !== 'string') {
      errors.push('Property macro UUID must be a string or null');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /** The AUTHORED amount: a rolled result states its expression, never a number (issue 1645). */
  getDescription() {
    return `${this.quantityFormula ?? this.quantity}x item`;
  }

  toJSON() {
    return omitReconstructibleDefaults(
      {
        id: this.id,
        componentId: this.componentId,
        systemItemId: this.componentId,
        itemUuid: this.itemUuid,
        quantity: this.quantity,
        quantityFormula: this.quantityFormula,
        propertyMacroUuid: this.propertyMacroUuid,
      },
      RESULT_OMITTED_WHEN_DEFAULT
    );
  }

  static fromJSON(data) {
    return new Result(data);
  }
}

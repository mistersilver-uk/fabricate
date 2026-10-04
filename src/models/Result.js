import { hasRollDataPath, maximisedTotal } from '../utils/rollFormulaRollability.js';

import { isNull, omitReconstructibleDefaults } from './reconstructibleDefaults.js';

/** What a result awards (issue 1773); an absent `kind` is `component`. */
export const RESULT_KINDS = Object.freeze(['component', 'currency', 'knowledge']);

/** Fields the constructor rebuilds exactly from absence (issue 1135). */
export const RESULT_OMITTED_WHEN_DEFAULT = {
  kind: (value) => value === 'component',
  unit: isNull,
  recipeId: isNull,
  label: isNull,
  reason: isNull,
  quantityFormula: isNull,
};

/** The persisted form of an amount formula: a trimmed non-empty string, or `null` for absent. */
export function normalizeQuantityFormula(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > 0 ? text : null;
}

const textOrNull = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);

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

/** The kind-specific half of `Result.validate` (issue 1773). */
function kindErrors(result) {
  const { kind } = result;
  if (!RESULT_KINDS.includes(kind)) return [`Result kind "${kind}" is not recognised`];
  const errors = [];
  if (kind === 'component' && !result.itemUuid && !result.componentId) {
    errors.push('Result must have componentId or itemUuid');
  }
  if (kind === 'currency' && !result.unit) errors.push('Currency result must name a unit');
  if (kind === 'knowledge' && !result.recipeId) errors.push('Knowledge result must name a recipe');
  if (kind === 'knowledge' && result.quantityFormula) {
    errors.push('Knowledge result cannot roll an amount');
  }
  if (kind !== 'currency' && (result.label || result.reason)) {
    errors.push('Only a currency result carries a label or reason');
  }
  if (kind !== 'component' && result.propertyMacroUuid) {
    errors.push('Only a component result runs a property macro');
  }
  return errors;
}

/** One thing a recipe produces: a component, an amount of a currency, or a recipe's knowledge. */
export class Result {
  constructor(data = {}) {
    this.id = data.id || foundry.utils.randomID();

    // An unrecognised kind is kept verbatim so validation can report it as a misconfiguration.
    this.kind = data.kind ?? 'component';

    this.componentId = data.componentId || data.systemItemId || null;

    this.unit = textOrNull(data.unit);

    this.recipeId = textOrNull(data.recipeId);

    this.label = textOrNull(data.label);

    this.reason = textOrNull(data.reason);

    this.itemUuid = data.itemUuid || null;

    this.quantity = this.kind === 'knowledge' ? 1 : data.quantity || 1;

    // Presence is the mode: a non-empty formula ROLLS the amount and `quantity` becomes the authored
    // amount it falls back to. `''` and whitespace ARE absence, so the two on-disk states are one.
    this.quantityFormula = normalizeQuantityFormula(data.quantityFormula);

    this.propertyMacroUuid = data.propertyMacroUuid || null;
  }

  /** `Roll` is INJECTED: with none, nothing is reported about `quantityFormula`, because a missing
   *  dice engine can decide no formula and no actor-free reading can decide a path-bearing one. */
  validate({ Roll } = {}) {
    const errors = kindErrors(this);

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
        kind: this.kind,
        componentId: this.componentId,
        systemItemId: this.componentId,
        unit: this.unit,
        recipeId: this.recipeId,
        label: this.label,
        reason: this.reason,
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

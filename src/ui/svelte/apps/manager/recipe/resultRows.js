/**
 * What a result row's caller decides for every result set: the component catalogue the row names
 * from, the amount error the save path's own floor (`quantityFormulaErrors`) would raise, and the
 * results a set holds once a component is added. Recipe results, gathering task results and
 * salvage share them.
 */
import { normalizeQuantityFormula, quantityFormulaErrors } from '../../../../../models/Result.js';
import { diceEngine, maximisedTotal } from '../../../../../utils/rollFormulaRollability.js';

import { shownAmount } from './pickerRowKinds.js';

/** `PickerRow`'s `catalogue` for a result: components alone, an art-less one drawn as a glyph. */
export const componentCatalogue = (componentOptions) => ({
  component: (componentOptions || []).map((option) => ({
    id: option.id,
    label: option.name,
    img: option.img,
    icon: 'fas fa-cube',
  })),
});

/** `PickerRow`'s `invalid` for `result`: its amount's floor error in `text`'s words, else none. */
export function resultAmountInvalid(result, text) {
  const formula = normalizeQuantityFormula(result?.quantityFormula);
  if (quantityFormulaErrors(formula, diceEngine()).length === 0) return {};
  return {
    amount:
      maximisedTotal(formula) === null
        ? text(
            'FABRICATE.Admin.Manager.Recipe.AmountUnrollable',
            'This expression cannot be rolled.'
          )
        : text(
            'FABRICATE.Admin.Manager.Recipe.AmountNeverPositive',
            'This expression can never award a positive amount.'
          ),
  };
}

/**
 * `results` with `componentId` added: the fixed row already producing it gains one, and otherwise,
 * a rolled row included because a bump would not change its roll, a row of one is appended.
 */
export function withAddedResult(results, componentId, id) {
  const index = results.findIndex(
    (result) =>
      result?.componentId === componentId && !normalizeQuantityFormula(result?.quantityFormula)
  );
  if (index === -1) return [...results, { id, componentId, quantity: 1 }];
  return results.map((result, i) =>
    i === index ? { ...result, quantity: Math.min(9999, shownAmount(result.quantity) + 1) } : result
  );
}

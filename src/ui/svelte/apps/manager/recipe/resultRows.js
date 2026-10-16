/**
 * What a result row's caller decides for every result set: the catalogue the row names from, the
 * amount error the save path's own floor (`quantityFormulaErrors`) would raise, and the results a
 * set holds once one is added. Recipe results, gathering task results and salvage share them; only
 * a recipe's result set offers kinds beyond `component` (`recipeResultKinds`).
 */
import { normalizeQuantityFormula, quantityFormulaErrors } from '../../../../../models/Result.js';
import { diceEngine, maximisedTotal } from '../../../../../utils/rollFormulaRollability.js';
import { currencyUnitIcon, currencyUnitLabel } from '../../../util/recipeCurrency.js';

import { KIND_META, shownAmount } from './pickerRowKinds.js';

/** `PickerRow`'s `catalogue` for a result: components alone, an art-less one drawn as a glyph. */
export const componentCatalogue = (componentOptions) => ({
  component: (componentOptions || []).map((option) => ({
    id: option.id,
    label: option.name,
    img: option.img,
    icon: 'fas fa-cube',
  })),
});

/**
 * What a recipe's result rows offer and name (issue 1773): `component` always, `currency` while
 * the system takes part in currency and the world has units, and `knowledge` while learned
 * knowledge is observable. `readonlyKinds` draws an authored row of either kind inert while its
 * kind is not offered for that reason: currency off, or learning not observable.
 */
export function recipeResultKinds({
  componentOptions = [],
  currencyUnits = [],
  currencyEnabled = false,
  recipeOptions = [],
  knowledgeObservable = false,
} = {}) {
  const units = Array.isArray(currencyUnits) ? currencyUnits : [];
  return {
    kinds: [
      'component',
      ...(currencyEnabled && units.length > 0 ? ['currency'] : []),
      ...(knowledgeObservable ? ['knowledge'] : []),
    ],
    readonlyKinds: [
      ...(currencyEnabled ? [] : ['currency']),
      ...(knowledgeObservable ? [] : ['knowledge']),
    ],
    catalogue: {
      ...componentCatalogue(componentOptions),
      currency: units.map((unit) => ({
        id: unit.id,
        label: currencyUnitLabel(units, unit.id),
        icon: currencyUnitIcon(units, unit.id),
      })),
      knowledge: (recipeOptions || []).map((recipe) => ({
        id: recipe.id,
        label: recipe.name,
        img: recipe.img,
        icon: KIND_META.knowledge.icon,
      })),
    },
  };
}

/** Which floor a roll expression fails, `unrollable` or `neverPositive`, or `null` for none. */
export function formulaFloorProblem(quantityFormula) {
  const formula = normalizeQuantityFormula(quantityFormula);
  if (quantityFormulaErrors(formula, diceEngine()).length === 0) return null;
  return maximisedTotal(formula) === null ? 'unrollable' : 'neverPositive';
}

/**
 * `PickerRow`'s `invalid` for `result`: its amount's floor error in `text`'s words, a fixed
 * currency amount that is not whole, which every craft would refuse, else none.
 */
export function resultAmountInvalid(result, text) {
  const formula = normalizeQuantityFormula(result?.quantityFormula);
  if (result?.kind === 'currency' && !formula && !Number.isInteger(shownAmount(result.quantity))) {
    return {
      amount: text(
        'FABRICATE.Admin.Manager.Recipe.AmountNotWhole',
        'A currency amount must be a whole number.'
      ),
    };
  }
  const problem = formulaFloorProblem(formula);
  if (!problem) return {};
  return {
    amount:
      problem === 'unrollable'
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
 * Gathering task results and salvage add this way; a recipe's result set adds an empty row.
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

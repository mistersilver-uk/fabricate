/**
 * The recipe editor's tab record counts (issue 643 §F1): a multi-step recipe sums each tab's count
 * across its steps, and a single-step one reads the recipe's own arrays. Tools in multi-step mode
 * also counts the recipe-level tools.
 */
import { arrayOrEmpty } from '../../../../../utils/scalars.js';

function countIngredients(scope) {
  return arrayOrEmpty(scope?.ingredientSets).reduce((total, set) => {
    const groups = arrayOrEmpty(set?.ingredientGroups).length;
    const essences =
      set?.essences && typeof set.essences === 'object' ? Object.keys(set.essences).length : 0;
    return total + groups + essences;
  }, 0);
}

function countResults(scope) {
  return arrayOrEmpty(scope?.resultGroups).reduce(
    (total, group) => total + arrayOrEmpty(group?.results).length,
    0
  );
}

const countTools = (scope) => arrayOrEmpty(scope?.toolIds).length;

/** `{ ingredients, results, tools }` for `recipe`, multi-step while `steps` is non-empty. */
export function recipeTabCounts(recipe, steps) {
  const multi = steps.length > 0;
  const sum = (counter) =>
    multi ? steps.reduce((total, step) => total + counter(step), 0) : counter(recipe || {});
  return {
    ingredients: sum(countIngredients),
    results: sum(countResults),
    tools: sum(countTools) + (multi ? countTools(recipe || {}) : 0),
  };
}

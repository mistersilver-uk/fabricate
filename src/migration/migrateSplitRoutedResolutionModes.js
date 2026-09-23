/**
 * `1.9.0` — split the crafting `routed` mode into `routedByIngredients` and `routedByCheck`. Pure,
 * idempotent, version-gated; spec § Resolution-Model Migration owns the rules. `resolutionMode` is
 * system-wide while a legacy `routed` system may hold a MIX of providers, so the MAJORITY wins, ties
 * break to `routedByIngredients`, and a disagreeing recipe keeps its result data while its stale
 * routing surfaces as a validation issue. The salvage and gathering `routed` tokens are unrelated.
 */

import { isPlainObject, forEachSystem } from './migrationHelpers.js';

export function migrateSplitRoutedResolutionModes(data = {}) {
  const systems = _clone(data.systems);
  const recipes = _clone(data.recipes);

  if (!Array.isArray(systems)) {
    return { systems: data.systems, recipes: data.recipes };
  }

  const recipeList = Array.isArray(recipes) ? recipes : [];

  // Decide each routed system's new mode (majority provider; ties → ingredients)
  // BEFORE any provider field is dropped, then rewrite the system token.
  const modeBySystemId = new Map();
  forEachSystem(systems, (system) => {
    if (system.resolutionMode !== 'routed') return;
    const systemId = String(system.id);
    const target = _chooseSystemMode(recipeList, systemId);
    modeBySystemId.set(systemId, target);
    system.resolutionMode = target;
  });

  if (modeBySystemId.size === 0) {
    return { systems, recipes: Array.isArray(recipes) ? recipes : data.recipes };
  }

  for (const recipe of recipeList) {
    if (!isPlainObject(recipe)) continue;
    const target = modeBySystemId.get(String(recipe.craftingSystemId));
    if (!target) continue;
    _reconcileRecipe(recipe, target);
  }

  return { systems, recipes: Array.isArray(recipes) ? recipes : data.recipes };
}

/**
 * Choose a routed system's new mode by majority provider. More `check` recipes than `ingredientSet`
 * gives `routedByCheck`; a minority, a tie or no routed recipes gives `routedByIngredients`.
 */
function _chooseSystemMode(recipes, systemId) {
  let ingredientCount = 0;
  let checkCount = 0;
  for (const recipe of recipes) {
    if (!isPlainObject(recipe) || String(recipe.craftingSystemId) !== systemId) continue;
    const provider = recipe.resultSelection?.provider;
    if (provider === 'check') checkCount += 1;
    else if (provider === 'ingredientSet') ingredientCount += 1;
  }
  return checkCount > ingredientCount ? 'routedByCheck' : 'routedByIngredients';
}

/**
 * Reconcile one recipe for its system's new mode: drop the now-meaningless `resultSelection`,
 * logging it when its old provider disagrees with the chosen mode.
 */
function _reconcileRecipe(recipe, target) {
  const provider = recipe.resultSelection?.provider;
  const disagrees =
    (target === 'routedByCheck' && provider === 'ingredientSet') ||
    (target === 'routedByIngredients' && provider === 'check');
  if ('resultSelection' in recipe) delete recipe.resultSelection;
  if (disagrees) _logReconciledRecipe(recipe, target);
}

function _logReconciledRecipe(recipe, target) {
  console.log(
    `Fabricate | migrateSplitRoutedResolutionModes: reconciled minority recipe ${JSON.stringify({
      id: recipe.id,
      name: recipe.name,
      craftingSystemId: recipe.craftingSystemId,
    })} into ${target}; its routing must be re-authored for the new basis (surfaced as a validation issue).`
  );
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}

/**
 * 1.9.0 — Split the single crafting `routed` resolution mode into the two
 * first-class modes `routedByIngredients` / `routedByCheck` (pure, idempotent,
 * version-gated). Per `destructive-changes-and-migrations/spec.md §Resolution-Model
 * Migration`, the routing basis is now a property of the system MODE rather than a
 * per-recipe `resultSelection.provider`, so this one-time migration must make the
 * system-level basis decision the read-time normalizer cannot.
 *
 * `resolutionMode` is system-wide, but a legacy `routed` system has no system-level
 * provider constraint and may contain a MIX of `ingredientSet`- and `check`-routed
 * recipes. Carrying each recipe to its own provider's mode would mix modes inside
 * one system and violate the one-mode-per-system invariant, so the migration picks
 * the SYSTEM's new mode and reconciles disagreeing recipes:
 *
 *  - **Majority provider wins.** A `routed` system becomes the mode matching the
 *    provider used by the majority of its recipes. Ties — including a system with
 *    NO routed recipes — break to `routedByIngredients` (the optional-check,
 *    lower-friction mode).
 *  - **Minority reconciliation.** Recipes whose old provider disagrees with the
 *    chosen system mode keep their result data but have their now-meaningless
 *    `resultSelection` dropped; the stale routing (group names under check routing,
 *    ingredient-set `resultGroupId` under ingredient routing) is surfaced by
 *    system validation as a re-authoring issue — never silently mis-routed.
 *  - **Provider drop.** The routed modes derive their basis from the system mode and
 *    carry no `resultSelection`, so EVERY recipe of a migrated system has its
 *    `resultSelection` cleared (agreeing recipes lose only a redundant field).
 *
 * The salvage `salvageResolutionMode: 'routed'` and the gathering economy
 * `resolutionMode: 'routed'` are unrelated routing concepts on separate enums and
 * are explicitly left untouched.
 *
 * Idempotent: once no crafting `resolutionMode === 'routed'` token remains, a re-run
 * finds nothing to transform and is a no-op.
 *
 * Pure: returns `{ systems, recipes }` and performs no I/O (logging excepted).
 *
 * @param {object} data Runner payload.
 * @param {Array<object>} [data.systems] Raw craftingSystems setting.
 * @param {Array<object>} [data.recipes] Raw recipes setting.
 * @returns {{ systems: Array<object>, recipes: Array<object> }}
 */

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
  for (const system of systems) {
    if (!_isPlainObject(system) || system.resolutionMode !== 'routed') continue;
    const systemId = String(system.id);
    const target = _chooseSystemMode(recipeList, systemId);
    modeBySystemId.set(systemId, target);
    system.resolutionMode = target;
  }

  if (modeBySystemId.size === 0) {
    return { systems, recipes: Array.isArray(recipes) ? recipes : data.recipes };
  }

  for (const recipe of recipeList) {
    if (!_isPlainObject(recipe)) continue;
    const target = modeBySystemId.get(String(recipe.craftingSystemId));
    if (!target) continue;
    _reconcileRecipe(recipe, target);
  }

  return { systems, recipes: Array.isArray(recipes) ? recipes : data.recipes };
}

/**
 * Choose a routed system's new mode by majority provider across its recipes.
 * More `check` recipes than `ingredientSet` → `routedByCheck`; otherwise (a check
 * minority, a tie, or no routed recipes) → `routedByIngredients`.
 * @param {Array<object>} recipes
 * @param {string} systemId
 * @returns {'routedByIngredients'|'routedByCheck'}
 */
function _chooseSystemMode(recipes, systemId) {
  let ingredientCount = 0;
  let checkCount = 0;
  for (const recipe of recipes) {
    if (!_isPlainObject(recipe) || String(recipe.craftingSystemId) !== systemId) continue;
    const provider = recipe.resultSelection?.provider;
    if (provider === 'check') checkCount += 1;
    else if (provider === 'ingredientSet') ingredientCount += 1;
  }
  return checkCount > ingredientCount ? 'routedByCheck' : 'routedByIngredients';
}

/**
 * Reconcile one recipe for its system's new routed mode: drop the now-meaningless
 * `resultSelection`, logging the recipe when its old provider disagrees with the
 * chosen mode (stale routing the GM must re-author; system validation surfaces it).
 * @param {object} recipe
 * @param {'routedByIngredients'|'routedByCheck'} target
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

function _isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function _clone(value) {
  if (value === null || value === undefined) return value;
  return structuredClone(value);
}

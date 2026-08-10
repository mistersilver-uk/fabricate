/**
 * Whether a recipe references an essence — the ONE predicate behind the essence delete
 * cascade and the essence library's recipe-usage count (issue 1036).
 *
 * Extracted from `CraftingSystemManager._recipeReferencesEssence`, unchanged, because the
 * admin store's `recipeUsageCount` projection needs the identical walk and the store
 * deliberately calls no underscore-private manager method. Two implementations of "does
 * this recipe require that essence?" would let the count on the row disagree with the
 * cascade the delete actually performs — which is precisely the number the delete-impact
 * statement reports.
 *
 * A pure leaf: no Foundry globals, no store reads, no imports. Accepts either a `Recipe`
 * instance (via `toJSON()`) or an already-plain recipe object, so the manager can hand it
 * a model and the store can hand it a projection.
 */

/**
 * Whether a recipe references the given essence in any ingredient set — via EITHER the
 * legacy per-set `essences` map (back-compat read) OR a first-class essence ingredient
 * OPTION (`match.type === 'essence'`) inside an ingredient group.
 *
 * Walks BOTH recipe-level and step-level ingredient sets; a multi-step recipe that names
 * the essence only inside a step is a reference, and missing that was the original bug
 * this walk's step arm exists to prevent.
 *
 * @param {object} recipe a `Recipe` instance or a plain recipe object.
 * @param {string} essenceId
 * @returns {boolean}
 */
export function recipeReferencesEssence(recipe, essenceId) {
  const data = typeof recipe?.toJSON === 'function' ? recipe.toJSON() : recipe;
  const sets = [
    ...(data?.ingredientSets || []),
    ...(data?.steps || []).flatMap((step) => step?.ingredientSets || []),
  ];
  return sets.some((set) => {
    if (set?.essences && essenceId in set.essences) return true;
    return (set?.ingredientGroups || []).some((group) =>
      (group?.options || []).some(
        (option) => option?.match?.type === 'essence' && option.match.essenceId === essenceId
      )
    );
  });
}

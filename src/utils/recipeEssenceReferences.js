/**
 * Whether a recipe references an essence — the ONE predicate behind the essence delete cascade and
 * the essence library's recipe-usage count (issue 1036).
 */

/**
 * Whether a recipe references the given essence in any ingredient set — via EITHER the legacy
 * per-set `essences` map (back-compat read) OR a first-class essence ingredient OPTION (`match.type
 * === 'essence'`) inside an ingredient group.
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

/**
 * The summary phase's Tool read (issue 2306): the cheap-availability rule consults no Tool, so a
 * browse row asks `RecipeManager`, which owns Tool matching, once per (system, Tool) per pass.
 * Import-free, because the mounted-component harness copies what `CraftingListingBuilder` imports.
 */

/**
 * A per-pass probe over a recipe narrowed to its first step, the step the detail model's craft
 * button reads. It answers the sets whose Tools are all available, `[]` when none are, or `null`
 * when Tools rule nothing out or nothing could be asked (no source actor, no Tool seams).
 * An upper bound like the cheap rule: a Tool held only as one of the set's ingredients counts.
 *
 * @param {object} input
 * @param {object|null} input.recipeManager The pass's manager, a station view included.
 * @param {object[]} input.craftSources The crafting actor and its component sources.
 * @param {object|null} [input.craftingActor] The actor whose prerequisites gate a station's Tool.
 * @returns {(stepRecipe: object) => object[]|null}
 */
export function createToolReadySetsProbe({ recipeManager, craftSources, craftingActor = null }) {
  const sources = Array.isArray(craftSources) ? craftSources.filter(Boolean) : [];
  if (
    sources.length === 0 ||
    typeof recipeManager?.getToolsForSet !== 'function' ||
    typeof recipeManager?.resolveToolStates !== 'function'
  ) {
    return () => null;
  }

  const availableByKey = new Map();
  const toolAvailable = (recipe, tool) => {
    const toolId = String(tool?.id ?? '');
    const key = toolId ? `${recipe?.craftingSystemId ?? ''}\u{0}${toolId}` : null;
    if (key !== null && availableByKey.has(key)) return availableByKey.get(key);
    const [state] = recipeManager.resolveToolStates(recipe, [tool], sources, {
      primaryActor: craftingActor,
    });
    const available = state?.available === true;
    if (key !== null) availableByKey.set(key, available);
    return available;
  };
  const toolsReady = (stepRecipe, set) =>
    recipeManager.getToolsForSet(stepRecipe, set).every((tool) => toolAvailable(stepRecipe, tool));

  return (stepRecipe) => {
    const sets = Array.isArray(stepRecipe?.ingredientSets) ? stepRecipe.ingredientSets : [];
    if (sets.length === 0) return toolsReady(stepRecipe, null) ? null : [];
    const ready = sets.filter((set) => toolsReady(stepRecipe, set));
    return ready.length === sets.length ? null : ready;
  };
}

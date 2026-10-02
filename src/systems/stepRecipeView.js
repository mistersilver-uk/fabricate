/**
 * The step-to-recipe-view projection shared by the crafting read side (`CraftingListingBuilder`,
 * `evaluateSelectedSet`) and the write side (`CraftingEngine`), so a requirement tile never
 * disagrees with the craft it drives. Tool ids are the UNION of recipe- and step-level ids, never a
 * step-else-recipe fallback: `RecipeManager.getToolsForSet` dedupes by id, and the step's ids alone
 * would drop every recipe-level tool. Import-free, because the mounted-component harness copies
 * `CraftingListingBuilder` and everything it imports.
 */

/** A step's array wins even when empty (it declares nothing); else the recipe's, else `[]`. */
function stepArrayOrRecipe(stepValue, recipeValue) {
  if (Array.isArray(stepValue)) return stepValue;
  return Array.isArray(recipeValue) ? recipeValue : [];
}

/** A shallow copy of `recipe` narrowed to one execution step, or to its own arrays with no step. */
export function buildStepRecipeView(recipe, step) {
  return {
    ...recipe,
    ingredientSets: stepArrayOrRecipe(step?.ingredientSets, recipe?.ingredientSets),
    resultGroups: stepArrayOrRecipe(step?.resultGroups, recipe?.resultGroups),
    toolIds: [
      ...(Array.isArray(recipe?.toolIds) ? recipe.toolIds : []),
      ...(Array.isArray(step?.toolIds) ? step.toolIds : []),
    ],
  };
}

/**
 * The active run's parked step index and whether that step's world-time gate is armed, as
 * `CraftingEngine.craft` reads it; synchronous, so `evaluateSelectedSet` works from a `$derived`.
 */
export function activeRunStepState(runManager, actor, recipeId) {
  if (!actor || !recipeId || typeof runManager?.findActiveRunForRecipe !== 'function') {
    return { index: 0, timeGateArmed: false };
  }
  const run = runManager.findActiveRunForRecipe(actor, recipeId) ?? null;
  if (!run) return { index: 0, timeGateArmed: false };
  const raw = Number(run.currentStepIndex);
  const index = Number.isFinite(raw) && raw >= 0 ? Math.trunc(raw) : 0;
  return {
    // A collapsed chain arms its one summed gate on step 0, so this read covers both gates.
    index,
    timeGateArmed: Boolean(run.steps?.[index]?.timeGate),
  };
}

/**
 * The `{ step, set }` an ingredient-set-scoped caller means, or `null`. With no `stepId` the ACTIVE
 * step decides, never step 0: a multi-step recipe keeps its sets on `steps[]`, and a run parked on
 * a later step must not be judged by the first one's requirements. A set id matches only WITHIN
 * the resolved step, since `randomID()` set ids can collide across steps.
 */
export function resolveStepIngredientSet({
  steps = [],
  stepId = null,
  activeStepIndex = 0,
  setId = null,
} = {}) {
  const executionSteps = Array.isArray(steps) ? steps : [];
  if (executionSteps.length === 0) return null;
  const wanted = stepId == null ? '' : String(stepId);
  const step = wanted
    ? (executionSteps.find((candidate) => String(candidate?.id ?? '') === wanted) ?? null)
    : (executionSteps[activeStepIndex] ?? executionSteps[0] ?? null);
  if (!step) return null;
  const sets = Array.isArray(step.ingredientSets) ? step.ingredientSets : [];
  const set = sets.find((candidate) => String(candidate?.id ?? '') === String(setId ?? '')) ?? null;
  return set ? { step, set } : null;
}

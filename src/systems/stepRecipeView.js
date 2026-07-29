/**
 * Step → recipe-view projection shared by the crafting READ side
 * (`CraftingListingBuilder`, `Fabricate#evaluateSelectedSet`) and the WRITE side
 * (`CraftingEngine`).
 *
 * The two sides used to carry near-identical private copies of this projection
 * (`CraftingListingBuilder._stepRecipeView` and `CraftingEngine._buildStepRecipeView`).
 * They must not drift: the read side evaluates craftability against the view the
 * engine actually crafts against, so any divergence makes a requirement tile
 * disagree with the craft it drives.
 *
 * The tool ids are the UNION of recipe-level and step-level ids — deliberately NOT
 * a step-else-recipe fallback. `RecipeManager.getToolsForSet` dedupes by id, so a
 * recipe/step overlap resolves once; taking only the step's ids would silently drop
 * every recipe-level tool from a stepped recipe.
 *
 * This module is deliberately IMPORT-FREE. `CraftingListingBuilder` is copied
 * verbatim into the mounted-component harness allowlist
 * (`CRAFTING_APP_RAW_MODULES`), and every module it imports must be copied too, so
 * a transitive dependency here would ripple into the harness.
 */

/**
 * A step's array field, falling back to the recipe-level array and finally to an
 * empty array. An authored-but-empty step array wins over the recipe's (the step
 * genuinely declares nothing), matching both original implementations.
 */
function stepArrayOrRecipe(stepValue, recipeValue) {
  if (Array.isArray(stepValue)) return stepValue;
  return Array.isArray(recipeValue) ? recipeValue : [];
}

/**
 * A shallow copy of `recipe` narrowed to one execution step: that step's ingredient
 * sets and result groups, with the tool ids as the union described above.
 *
 * A shallow copy preserves the recipe's data fields (`craftingSystemId`,
 * `currencyCost`, …) and the `IngredientSet` instance methods hanging off
 * `ingredientSets`, which is all `RecipeManager.evaluateCraftability` and the engine
 * read — neither reaches for a `Recipe` prototype method on the view.
 *
 * @param {object} recipe
 * @param {object|null} step - An execution step (`recipe.getExecutionSteps()[i]`),
 *   or null/undefined to fall back to the recipe's own top-level arrays.
 * @returns {object} The step-narrowed recipe view.
 */
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
 * The state every crafting surface needs about a recipe's ACTIVE execution step:
 * which step index the actor's active run is parked on, and whether that step's
 * world-time gate is already armed.
 *
 * This is the same read `CraftingEngine.craft` performs before it resolves the step
 * it will execute (`findActiveRunForRecipe` → `run.currentStepIndex`, then
 * `run.steps[index].timeGate`), so a read-side projection and the craft can only
 * disagree across a real race — which the engine-side allocation drop then catches.
 *
 * `findActiveRunForRecipe` is SYNCHRONOUS, which is what lets `evaluateSelectedSet`
 * stay synchronous (the crafting store reads it from a `$derived`).
 *
 * No active run ⇒ `{ index: 0, timeGateArmed: false }`, so the common case is
 * byte-for-byte today's step-0 behaviour.
 *
 * @param {object|null} runManager - `CraftingRunManager`, or null when unavailable.
 * @param {object|null} actor - The crafting actor whose runs are read.
 * @param {string|null} recipeId
 * @returns {{ index: number, timeGateArmed: boolean }}
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
    // A collapsed multi-step chain arms its single summed gate on step 0, so this
    // one read covers both the per-step gate and the chain gate.
    index,
    timeGateArmed: Boolean(run.steps?.[index]?.timeGate),
  };
}

/**
 * Resolve the `{ step, set }` an ingredient-set-scoped caller means.
 *
 * Two rules make this safe, and both are load-bearing:
 *
 * 1. With no `stepId`, the ACTIVE step decides — never step 0. An explicit
 *    multi-step recipe leaves `recipe.ingredientSets` empty (its sets live on
 *    `steps[]`), and a run parked on a later step must not be re-evaluated against
 *    the first step's requirements.
 * 2. A set id is only ever matched WITHIN the resolved step. Set ids are
 *    `randomID()`, so scanning across steps for a matching id would silently
 *    evaluate a different step's set on a collision, with no way for the caller to
 *    notice.
 *
 * @param {object} options
 * @param {Array<object>} options.steps - `recipe.getExecutionSteps()`.
 * @param {string|null} [options.stepId] - Explicit step disambiguator.
 * @param {number} [options.activeStepIndex] - Index used when `stepId` is absent.
 * @param {string|null} [options.setId] - The ingredient set to resolve.
 * @returns {{ step: object, set: object }|null} Null when nothing resolves.
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

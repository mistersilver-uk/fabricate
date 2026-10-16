/**
 * A crafting run's accepted terms: its recipe and its system's crafting check as they stood when
 * the run began, persisted as `run.termsSnapshot = { recipe, craftingCheck }`. Resolution reads
 * them in place of the live corpus; roll data still comes from the live actor when the check rolls.
 */
import { Recipe } from '../models/Recipe.js';
import { cloneJson } from '../utils/scalars.js';

/** An own enumerable key, so every step view spread from a terms recipe carries it too. */
const ACCEPTED_CRAFTING_CHECK = Symbol('fabricate.acceptedCraftingCheck');

/** The `termsSnapshot` a new run persists, or `null` for a recipe that cannot serialize itself. */
export function snapshotRunTerms(recipe, system) {
  if (typeof recipe?.toJSON !== 'function') return null;
  return {
    recipe: cloneJson(recipe.toJSON()),
    craftingCheck: cloneJson(system?.craftingCheck ?? null),
  };
}

/** The recipe a begun run resolves against: its accepted terms, else the live recipe. */
export function resolveRunRecipe(run, recipeManager) {
  const terms = run?.termsSnapshot;
  if (!terms?.recipe) return recipeManager?.getRecipe?.(run?.recipeId) ?? null;
  const recipe = Recipe.fromJSON(cloneJson(terms.recipe));
  recipe[ACCEPTED_CRAFTING_CHECK] = cloneJson(terms.craftingCheck ?? null);
  return recipe;
}

/** The live system, with a terms recipe's accepted crafting check in place of its own. */
export function withAcceptedCraftingCheck(system, recipe) {
  if (!system || !recipe || !Object.hasOwn(recipe, ACCEPTED_CRAFTING_CHECK)) return system;
  return { ...system, craftingCheck: cloneJson(recipe[ACCEPTED_CRAFTING_CHECK]) };
}

/** Every recipe id an active run of these actors resolves against, so an import prune spares it. */
export function activeRunRecipeIds(runManager, actors) {
  const ids = new Set();
  for (const actor of actors ?? []) {
    for (const run of runManager?.getActiveRuns?.(actor) ?? []) {
      if (run?.recipeId) ids.add(String(run.recipeId));
    }
  }
  return ids;
}

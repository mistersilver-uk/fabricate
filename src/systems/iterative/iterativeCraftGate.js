/**
 * Every existing craft path refuses a recipe in an `iterative` system, before it creates a run,
 * consumes, spends, rolls or awards, until Iterative Attempts ship (`resolution-modes`).
 */
export const ITERATIVE_CRAFT_REFUSAL =
  'Iterative crafting is not available in this version of Fabricate.';

/** The refusal for a recipe resolving under `mode`, or `null`. */
export function iterativeCraftRefusal(mode) {
  return mode === 'iterative' ? ITERATIVE_CRAFT_REFUSAL : null;
}

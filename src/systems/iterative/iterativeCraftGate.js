/**
 * The craft paths an `iterative` recipe may not take (`resolution-modes` § Iterative Mode
 * Availability): only the versioned run start and the step start run for it, and every other
 * path refuses before it creates a run, consumes, spends, rolls or awards.
 */
import { buildRecipeActivationIssue } from '../../utils/recipeActivationMessages.js';

import { evaluateIterativeReadiness, iterativeStartBlockers } from './iterativeReadiness.js';

export const ITERATIVE_CRAFT_REFUSAL =
  'Iterative recipes are worked one action at a time from the Journal.';

/** The refusal for a recipe resolving under `mode`, or `null`; a `start` path is not refused. */
export function iterativeCraftRefusal(mode, { start = false } = {}) {
  return mode === 'iterative' && !start ? ITERATIVE_CRAFT_REFUSAL : null;
}

/** A new iterative run's refusal while its first start blocker stands, or `null`. */
export function iterativeStartRefusal(system, recipe) {
  if (system?.resolutionMode !== 'iterative') return null;
  const issues = evaluateIterativeReadiness(system, [recipe]);
  const [blocker] = iterativeStartBlockers(issues, recipe, system);
  if (!blocker) return null;
  const { code, message } = blocker;
  return { success: false, reason: 'iterative-not-ready', detail: { code, message } };
}

/**
 * `[iterativeNotReady]` counting the recipe's own critical readiness issues, each of which carries
 * `blocks: 'enable'`, or `[]` at none and outside `iterative`; a library issue never counts.
 */
export function iterativeActivationIssues(system, recipe) {
  const count = evaluateIterativeReadiness(system, [recipe]).filter(
    (issue) => issue.kind === 'recipe' && issue.severity === 'critical'
  ).length;
  return count > 0 ? [buildRecipeActivationIssue('iterativeNotReady', { count })] : [];
}

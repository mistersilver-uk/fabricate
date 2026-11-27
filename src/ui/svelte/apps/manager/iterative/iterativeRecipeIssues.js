/**
 * What the editor and the Recipes library say about one iterative recipe, as pure functions over
 * the issues `evaluateIterativeReadiness` raises: the recipe's own issues, its status, each step's
 * tally, and the pill the library and the editor header draw.
 */
import {
  iterativeStartBlockers,
  needsIterativeSetup,
} from '../../../../../systems/iterative/iterativeReadiness.js';
import { arrayOrEmpty } from '../../../../../utils/scalars.js';

/**
 * The recipe's own recipe-scoped issues, then the start blockers that are not recipe-scoped, which
 * count as recipe-wide because they refuse this recipe's start.
 */
export function iterativeRecipeIssues(issues, recipe, system = null) {
  const own = arrayOrEmpty(issues).filter(
    (issue) => issue?.entityKind === 'recipe' && issue.entityId === recipe?.id
  );
  const blockers = iterativeStartBlockers(issues, recipe, system).filter(
    (issue) => issue.entityKind !== 'recipe'
  );
  return [...own, ...blockers];
}

/** `setup`, else `blocking` with its critical count, else `ready`. */
export function iterativeRecipeStatus(recipeIssues) {
  if (needsIterativeSetup(recipeIssues)) return { id: 'setup' };
  const count = arrayOrEmpty(recipeIssues).filter((issue) => issue?.severity === 'critical').length;
  return count > 0 ? { id: 'blocking', count } : { id: 'ready' };
}

/** The critical and warning issues the step at `stepIndex` raises. */
export function iterativeStepTally(recipeIssues, stepIndex) {
  const own = arrayOrEmpty(recipeIssues).filter((issue) => issue?.stepIndex === stepIndex);
  const countOf = (severity) => own.filter((issue) => issue.severity === severity).length;
  return { blocking: countOf('critical'), warnings: countOf('warning') };
}

/** `status`, except that Ready is withheld while a structural gap beyond iterative blocks enabling. */
export function iterativeStatusPill(status, enableBlocked) {
  return status?.id === 'ready' && enableBlocked === true ? null : (status ?? null);
}

/** The input the editor's readiness mapper reads: the recipe's issues, its explicit steps and its Counter Instance ids. */
export function iterativeReadinessInput(recipeIssues, recipe) {
  return {
    issues: recipeIssues,
    counterIds: arrayOrEmpty(recipe?.iterative?.counters).map((instance) => instance?.counterId),
    steps: arrayOrEmpty(recipe?.steps).map((step, index) => ({
      index,
      id: step?.id ?? null,
      name: step?.name ?? '',
    })),
  };
}

/**
 * The Recipes library's iterative status on a projected row: `setup`, `blocking` with its count,
 * or `ready`, as the editor reads it. The cohort's readiness is evaluated once, on the first row
 * that reads its status, and a row of any other mode carries no `iterativeStatus` key at all.
 */
import { evaluateIterativeReadiness } from '../../../systems/iterative/iterativeReadiness.js';
import {
  iterativeRecipeIssues,
  iterativeRecipeStatus,
} from '../apps/manager/iterative/iterativeRecipeIssues.js';

/**
 * The cohort's shared readiness, or `null` outside an `iterative` system. `evaluate` is the
 * readiness evaluator, injected so a caller can count its calls.
 */
export function createIterativeStatusContext(
  system,
  roster,
  { evaluate = evaluateIterativeReadiness } = {}
) {
  if (system?.resolutionMode !== 'iterative') return null;
  let issues = null;
  return { system, issues: () => (issues ??= evaluate(system, roster)) };
}

/** Defines `row.iterativeStatus` as an enumerable memo over the cohort's issues; none without a context. */
export function defineIterativeStatus(row, recipe, context) {
  if (!context) return;
  let status = null;
  Object.defineProperty(row, 'iterativeStatus', {
    enumerable: true,
    configurable: true,
    get: () =>
      (status ??= iterativeRecipeStatus(
        iterativeRecipeIssues(context.issues(), recipe, context.system)
      )),
  });
}

/**
 * The expression-validity readiness checks (`resolution-modes` § Iterative Validation). Each
 * returns the codes it raises, and `iterativeReadiness.js` turns them into issues. Every amount and
 * start formula is judged by the analysis the resolver's evaluator shares, so readiness and
 * resolution never disagree on what parses.
 */
import { arrayOrEmpty } from '../../utils/scalars.js';
import { iterativeEntryFault } from '../normalize/iterativeLibrary.js';

import { effectiveBounds, namesCheckFact } from './attemptLibrary.js';
import { analyzeIterativeExpression } from './expression.js';

/** The reserved-root ids an analysis read, whichever root named them. */
const idsRead = ({ roots }) => [...roots.counter, ...roots.min, ...roots.max, ...roots.target];

/** An action's cost and effect amounts that parse as entries, each with the profile it is judged under. */
function amountsOf(action) {
  const amounts = (kind, entries, profile) =>
    arrayOrEmpty(entries)
      .filter((entry) => iterativeEntryFault(kind, entry) === null)
      .map((entry) => analyzeIterativeExpression(entry.amount, profile));
  return [
    ...amounts('cost', action?.costs, 'cost'),
    ...amounts('effect', action?.effects, 'effect'),
  ];
}

function readsCheckWithoutOne(action) {
  if (action?.check !== 'none') return false;
  return arrayOrEmpty(action.effects)
    .filter((entry) => iterativeEntryFault('effect', entry) === null)
    .some(
      (entry) =>
        namesCheckFact(entry.when) || analyzeIterativeExpression(entry.amount, 'effect').roots.check
    );
}

/**
 * The library codes one action's expressions raise: an amount that fails its profile, an
 * explosion that cannot stop, a reserved root naming no library counter, and a check fact read
 * where the action rolls no check.
 */
export function libraryExpressionCodes(action, { libraryCounterIds }) {
  const analyses = amountsOf(action);
  return [
    ...(analyses.some((analysis) => !analysis.ok) ? ['iterativeInvalidExpression'] : []),
    ...(analyses.some((analysis) => analysis.explodeUnbounded)
      ? ['iterativeExplodeUnbounded']
      : []),
    ...(analyses.some((analysis) => idsRead(analysis).some((id) => !libraryCounterIds.has(id)))
      ? ['iterativeUnknownCounter']
      : []),
    ...(readsCheckWithoutOne(action) ? ['iterativeCheckFactWithoutCheck'] : []),
  ];
}

/** Whether `analysis` reads a bound or target that the Counter Instances leave unset. */
function readsUnsetSide(analysis, { instances, library }) {
  const known = new Map(instances.map((instance) => [instance?.counterId, instance]));
  const bounds = { counters: library.counters, instances };
  const unsetBound = (side) => (id) => known.has(id) && effectiveBounds(id, bounds)[side] === null;
  return (
    analysis.roots.min.some(unsetBound('min')) ||
    analysis.roots.max.some(unsetBound('max')) ||
    analysis.roots.target.some((id) => known.has(id) && !Number.isFinite(known.get(id).target))
  );
}

/**
 * The recipe codes its expressions raise: a start formula that fails its profile or cannot stop
 * exploding, a reserved root naming no Counter Instance, and a bound or target left unset.
 * `actions` are the library actions the recipe's steps allow.
 */
export function recipeExpressionCodes({ library, instances, actions }) {
  const starts = instances
    .filter((instance) => instance?.startFormula)
    .map((instance) => analyzeIterativeExpression(instance.startFormula, 'start'));
  const analyses = [...starts, ...arrayOrEmpty(actions).flatMap(amountsOf)];
  const known = new Set(instances.map((instance) => instance?.counterId));
  return [
    ...(starts.some((analysis) => !analysis.ok) ? ['iterativeInvalidExpression'] : []),
    ...(starts.some((analysis) => analysis.explodeUnbounded) ? ['iterativeExplodeUnbounded'] : []),
    ...(analyses.some((analysis) => idsRead(analysis).some((id) => !known.has(id)))
      ? ['iterativeUnknownCounter']
      : []),
    ...(analyses.some((analysis) => readsUnsetSide(analysis, { instances, library }))
      ? ['iterativeExpressionBoundUnset']
      : []),
  ];
}

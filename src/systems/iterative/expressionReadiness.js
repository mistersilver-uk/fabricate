/**
 * The expression-validity readiness checks (`resolution-modes` § Iterative Validation), and the
 * `{ code, counterId?, actionId? }` entry builders the iterative readiness producers share. The
 * library check returns codes and the recipe check returns entries; `iterativeReadiness.js` turns
 * both into issues. Every amount and
 * start formula is judged by the analysis the resolver's evaluator shares, so readiness and
 * resolution never disagree on what parses.
 */
import { arrayOrEmpty } from '../../utils/scalars.js';
import { iterativeEntryFault } from '../normalize/iterativeLibrary.js';

import { effectiveBounds, namesCheckFact } from './attemptLibrary.js';
import { analyzeIterativeExpression } from './expression.js';

/** `{ code }` for each of `codes`, the entry of a fault that names no counter or action. */
export const bareEntries = (codes) => codes.map((code) => ({ code }));

/**
 * `{ code, [key]: id }` for a readable id, else `{ code }`; `key` is `'counterId'` or `'actionId'`.
 * The id names the first offender of its code; an entry whose offender has no readable id carries none.
 */
export function addressedEntry(code, key, id) {
  return typeof id === 'string' && id !== '' ? { code, [key]: id } : { code };
}

/** One entry of `code`, addressed to the first of `ids` absent from `known`, or none when all are known. */
export function unknownEntries(code, key, ids, known) {
  const absent = ids.filter((id) => !known.has(id));
  return absent.length === 0 ? [] : [addressedEntry(code, key, absent[0])];
}

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

/** The first root id `analysis` reads whose bound or target the Counter Instances leave unset. */
function firstUnsetRoot(analysis, { instances, library }) {
  const known = new Map(instances.map((instance) => [instance?.counterId, instance]));
  const bounds = { counters: library.counters, instances };
  const unsetBound = (side) => (id) => known.has(id) && effectiveBounds(id, bounds)[side] === null;
  const unsetTarget = (id) => known.has(id) && !Number.isFinite(known.get(id).target);
  return [
    ...analysis.roots.min.filter(unsetBound('min')),
    ...analysis.roots.max.filter(unsetBound('max')),
    ...analysis.roots.target.filter(unsetTarget),
  ][0];
}

/**
 * The recipe entries its expressions raise: a start formula that fails its profile or cannot stop
 * exploding, a reserved root naming no Counter Instance, and a bound or target left unset. The
 * last two carry the first offending root as `counterId`. `actions` are the library actions the
 * recipe's steps allow.
 */
export function recipeExpressionCodes({ library, instances, actions }) {
  const starts = instances
    .filter((instance) => instance?.startFormula)
    .map((instance) => analyzeIterativeExpression(instance.startFormula, 'start'));
  const analyses = [...starts, ...arrayOrEmpty(actions).flatMap(amountsOf)];
  const known = new Set(instances.map((instance) => instance?.counterId));
  const unset = analyses.map((analysis) => firstUnsetRoot(analysis, { instances, library }));
  const unsetId = unset.find((id) => id !== undefined);
  return [
    ...bareEntries([
      ...(starts.some((analysis) => !analysis.ok) ? ['iterativeInvalidExpression'] : []),
      ...(starts.some((analysis) => analysis.explodeUnbounded)
        ? ['iterativeExplodeUnbounded']
        : []),
    ]),
    ...unknownEntries('iterativeUnknownCounter', 'counterId', analyses.flatMap(idsRead), known),
    ...(unsetId === undefined
      ? []
      : [addressedEntry('iterativeExpressionBoundUnset', 'counterId', unsetId)]),
  ];
}

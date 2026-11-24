/**
 * The data one Iterative Attempt reads, gathered once: the system's counters and actions, the
 * recipe's Counter Instances, and one step's configuration and result groups. Everything here is
 * a pure function over that data and never mutates it.
 */
import { iterativeStepsOf } from '../../models/iterativeStepConfig.js';
import { arrayOrEmpty } from '../../utils/scalars.js';
import { ITERATIVE_LIBRARY_VERSION } from '../normalize/iterativeLibrary.js';

const finiteOrNull = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * The bounds a counter is held to: `global` uses the counter's own, `perRecipe` uses the Counter
 * Instance's over the counter's, and `none` is unbounded. An unbounded side is `null`.
 * @returns {{ min: number | null, max: number | null }}
 */
export function effectiveBounds(counterId, library) {
  const counter = arrayOrEmpty(library?.counters).find((entry) => entry?.id === counterId);
  const instance = arrayOrEmpty(library?.instances).find((entry) => entry?.counterId === counterId);
  if (counter?.limit === 'global') {
    return { min: finiteOrNull(counter.min), max: finiteOrNull(counter.max) };
  }
  if (counter?.limit === 'perRecipe') {
    return {
      min: finiteOrNull(instance?.min ?? counter.min),
      max: finiteOrNull(instance?.max ?? counter.max),
    };
  }
  return { min: null, max: null };
}

/** `value` held to `bounds`; an unbounded side is not applied. */
export function clampToBounds(value, { min, max }) {
  const floored = min === null ? value : Math.max(value, min);
  return max === null ? floored : Math.min(floored, max);
}

/**
 * Gathers one step's data: the system's counters and actions, the recipe's Counter Instances, and
 * the step's configuration and result groups, from live or terms-snapshot JSON alike. A step index
 * past the last gives `step: null` and no groups.
 */
export function buildAttemptLibrary(systemIterative, recipeLike, stepIndex = 0) {
  const view = iterativeStepsOf(recipeLike).find((entry) => entry.stepIndex === stepIndex);
  return {
    version: systemIterative?.version ?? ITERATIVE_LIBRARY_VERSION,
    counters: arrayOrEmpty(systemIterative?.counters),
    actions: arrayOrEmpty(systemIterative?.actions),
    instances: arrayOrEmpty(recipeLike?.iterative?.counters),
    step: view?.iterative ?? null,
    resultGroups: view?.resultGroups ?? [],
  };
}

/** Every counter and action id with its label, for the run to keep when the library later changes. */
export function iterativeLabels(library) {
  const labelled = (entries) =>
    arrayOrEmpty(entries).map((entry) => ({ id: entry?.id, label: entry?.label }));
  return { counters: labelled(library?.counters), actions: labelled(library?.actions) };
}

/** The roots an expression reads: counter values, effective bounds, targets, session count and check. */
export function expressionRoots(library, { counters, sessionCount, checkValue }) {
  const instances = arrayOrEmpty(library?.instances);
  const side = (name) =>
    new Map(
      instances.flatMap(({ counterId }) => {
        const bound = effectiveBounds(counterId, library)[name];
        return bound === null ? [] : [[counterId, bound]];
      })
    );
  const targets = instances.filter((entry) => Number.isFinite(entry?.target));
  return {
    counters,
    min: side('min'),
    max: side('max'),
    target: new Map(targets.map((entry) => [entry.counterId, entry.target])),
    sessionCount,
    checkValue,
  };
}

/** The facts a rule reads as the state stood: counter values, session count and the newest log action. */
export function stateFacts(state) {
  return {
    counters: new Map(arrayOrEmpty(state?.counters).map((row) => [row.counterId, row.value])),
    sessionCount: state?.sessionCount,
    previousActionId: arrayOrEmpty(state?.log).at(-1)?.actionId ?? null,
  };
}

/** `all` needs every condition and `any` needs one; no condition at all is unconditional. */
export function combineHolds(combine, conditions) {
  if (conditions.length === 0) return true;
  return combine === 'any' ? conditions.some(Boolean) : conditions.every(Boolean);
}

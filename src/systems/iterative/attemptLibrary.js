/**
 * The data one Iterative Attempt reads, gathered once: the system's counters and actions, the
 * recipe's Counter Instances, and one step's configuration and result groups. Everything here is
 * a pure function over that data and never mutates it.
 */
import { arrayOrEmpty } from '../../utils/scalars.js';

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

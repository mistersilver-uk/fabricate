/**
 * The recipe Overview's Counter Instance rows: each instance's library counter, its limit, the
 * bounds the runtime clamps it to, and its faults, judged as `evaluateIterativeReadiness` judges
 * them so a row and Validation agree. A fault names the readiness `code` and the `control` it marks.
 */
import { effectiveBounds } from '../../../../../../systems/iterative/attemptLibrary.js';
import { arrayOrEmpty } from '../../../../../../utils/scalars.js';
import { expressionFaults } from '../../iterative/iterativeFieldFaults.js';

/** The four numbers an instance holds, in the order their faults are stated. */
export const COUNTER_INSTANCE_NUMBERS = Object.freeze(['start', 'min', 'max', 'target']);

const finite = (value) => typeof value === 'number' && Number.isFinite(value);

function notNumberFaults(instance) {
  const fields = COUNTER_INSTANCE_NUMBERS.filter((field) => instance[field] === null);
  if (instance.startFormula === null && !fields.includes('start')) fields.unshift('start');
  return fields.map((field) => ({ code: 'iterativeInvalidNumber', field, control: field }));
}

function boundsFaults(instance, counter, bounds) {
  const { min, max } = bounds;
  if (min !== null && max !== null && min > max) {
    const shown = counter?.limit === 'perRecipe';
    return shown ? [{ code: 'iterativeBoundsInverted', control: 'min', min, max }] : [];
  }
  const { start } = instance;
  if (instance.startFormula !== undefined || !finite(start)) return [];
  const fault = { code: 'iterativeStartOutOfBounds', control: 'start', start, min, max };
  if (max !== null && start > max) return [{ ...fault, side: 'max' }];
  if (min !== null && start < min) return [{ ...fault, side: 'min' }];
  return [];
}

/**
 * One row per instance of `recipe.iterative.counters`, in order, keyed by its `counterId` with any
 * repeat made distinct.
 * @param {object[]} instances The draft's Counter Instances.
 * @param {object[]} counters The system's counter library.
 */
export function counterInstanceRows(instances, counters) {
  const library = arrayOrEmpty(counters);
  const counterIds = new Set(library.map((counter) => counter.id));
  const seen = new Set();
  return arrayOrEmpty(instances).map((instance, index) => {
    const counter = library.find((entry) => entry.id === instance?.counterId) ?? null;
    const counterId = String(instance?.counterId ?? '');
    const key = seen.has(counterId) ? `${counterId}#${index}` : counterId;
    seen.add(counterId);
    const bounds = effectiveBounds(counterId, { counters: library, instances: [instance] });
    const formula = typeof instance?.startFormula === 'string' ? instance.startFormula : '';
    return {
      key,
      index,
      counterId,
      instance,
      label: counter?.label || counterId,
      limit: counter?.limit ?? 'perRecipe',
      known: Boolean(counter),
      defaults: { min: counter?.min ?? null, max: counter?.max ?? null },
      bounds,
      faults: [
        ...(counter ? [] : [{ code: 'iterativeUnknownCounter', control: null }]),
        ...notNumberFaults(instance ?? {}),
        ...boundsFaults(instance ?? {}, counter, bounds),
      ],
      formulaFaults: formula.trim() ? expressionFaults(formula, 'start', { counterIds }) : [],
    };
  });
}

/** The library counters no instance names yet, in library order. */
export function unusedCounters(instances, counters) {
  const used = new Set(arrayOrEmpty(instances).map((instance) => instance?.counterId));
  return arrayOrEmpty(counters).filter((counter) => !used.has(counter.id));
}

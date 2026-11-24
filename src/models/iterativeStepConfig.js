/**
 * A recipe's iterative configuration: `Recipe.iterative = { counters, step? }`, `Step.iterative`
 * and `ResultGroup.producedWhen` (`data-models` Recipe 19, Step 4). Each is absent unless authored,
 * and each record is rebuilt with a fixed key set.
 */
import {
  enumOrDefault,
  isIterativeId,
  iterativeNumber,
  keepKnownKeys,
  normalizeAmount,
  normalizeCounterRuleList,
  optionalNumber,
  uniqueIdentified,
} from '../systems/iterative/counterRule.js';
import { arrayOrEmpty, cloneJson, isPlainObject, stringOnlyIdList } from '../utils/scalars.js';

export const STEP_ACTION_MODES = Object.freeze(['all', 'only']);
export const PRODUCED_WHEN_ENDS = Object.freeze(['success', 'failure']);

/**
 * `{ startFormula }` for an authored expression, `{ startFormula: null }` for a present one that is
 * not an expression (a persisted `null` included), and `{}` for an absent or empty one.
 */
function startFormulaEntry(value) {
  if (value === undefined) return {};
  const startFormula = value === null ? null : normalizeAmount(value);
  return startFormula === '' ? {} : { startFormula };
}

/** An instance's `startFormula` replaces `start` when present. */
function normalizeCounterInstance(raw) {
  return {
    counterId: raw.counterId,
    start: raw.start === undefined ? 0 : iterativeNumber(raw.start),
    ...startFormulaEntry(raw.startFormula),
    ...optionalNumber('min', raw.min),
    ...optionalNumber('max', raw.max),
    ...optionalNumber('target', raw.target),
    visible: raw.visible !== false,
  };
}

/** `true` for a present id list that is not an array or holds an entry that is not an id. */
export function stepIdListFault(value) {
  if (value == null) return false;
  return !Array.isArray(value) || !value.every(isIterativeId);
}

/** A list that does not parse is kept as authored, so it still blocks; an absent one is `[]`. */
const stepIdList = (value) => (stepIdListFault(value) ? cloneJson(value) : stringOnlyIdList(value));

/** A present `actions` that is not an object is kept as authored, so it still blocks. */
function stepActions(raw) {
  if (raw != null && !isPlainObject(raw)) return cloneJson(raw);
  const actions = raw ?? {};
  return {
    mode: enumOrDefault(actions.mode, 'all'),
    actionIds: stepIdList(actions.actionIds),
  };
}

/** `{ actions: { mode, actionIds }, hiddenCounterIds, lockedCounterIds, success, failure }`, or `null`. */
export function normalizeStepIterative(raw) {
  if (!isPlainObject(raw)) return null;
  return {
    actions: stepActions(raw.actions),
    hiddenCounterIds: stepIdList(raw.hiddenCounterIds),
    lockedCounterIds: stepIdList(raw.lockedCounterIds),
    success: normalizeCounterRuleList(raw.success),
    failure: normalizeCounterRuleList(raw.failure),
  };
}

/** `{ counters, step? }`, or `null`; `step` is dropped on a recipe with explicit steps. */
export function normalizeRecipeIterative(raw, { hasSteps = false } = {}) {
  if (!isPlainObject(raw)) return null;
  const step = hasSteps ? null : normalizeStepIterative(raw.step);
  return {
    counters: uniqueIdentified(raw.counters, 'counterId').map(normalizeCounterInstance),
    ...(step && { step }),
  };
}

/** `null` for a well-formed routing line, else `'line'`, `'end'` or `'rules'`. */
export function producedWhenLineFault(line) {
  if (!isPlainObject(line)) return 'line';
  if (!PRODUCED_WHEN_ENDS.includes(line.end)) return 'end';
  return line.rules === undefined || Array.isArray(line.rules) ? null : 'rules';
}

function normalizeProducedWhenLine(raw) {
  if (producedWhenLineFault(raw)) {
    const kept = keepKnownKeys(raw, ['end', 'rules']);
    if (Array.isArray(kept.rules)) kept.rules = normalizeCounterRuleList(raw.rules);
    return kept;
  }
  return { end: raw.end, rules: normalizeCounterRuleList(raw.rules) };
}

/** The routing lines, or `null` when none is authored. */
export function normalizeProducedWhen(raw) {
  const lines = arrayOrEmpty(raw).map(normalizeProducedWhenLine);
  return lines.length > 0 ? lines : null;
}

export function stepIterativeEntry(raw) {
  const iterative = normalizeStepIterative(raw);
  return iterative ? { iterative } : {};
}

export function producedWhenEntry(raw) {
  const producedWhen = normalizeProducedWhen(raw);
  return producedWhen ? { producedWhen } : {};
}

/**
 * @typedef {{ id: string, role?: 'failure', producedWhen?: object[] }} IterativeStepGroup
 * @typedef {{ stepIndex: number, iterative: object | null, resultGroups: IterativeStepGroup[] }}
 *   IterativeStepView `iterative` is the step's `StepIterative`, or `null` when none is authored.
 */

const stepGroups = (groups) =>
  arrayOrEmpty(groups).map((group) => ({
    id: group?.id,
    ...(group?.role === 'failure' && { role: 'failure' }),
    ...(group?.producedWhen && { producedWhen: group.producedWhen }),
  }));

/**
 * One `IterativeStepView` per execution step, for a `Recipe` or its plain JSON alike: each
 * explicit step's own configuration and groups, else the implicit step's `Recipe.iterative.step`
 * with the recipe-level groups.
 * @returns {IterativeStepView[]}
 */
export function iterativeStepsOf(recipeLike) {
  const steps = arrayOrEmpty(recipeLike?.steps);
  if (steps.length === 0) {
    const iterative = recipeLike?.iterative?.step ?? null;
    return [{ stepIndex: 0, iterative, resultGroups: stepGroups(recipeLike?.resultGroups) }];
  }
  return steps.map((step, stepIndex) => ({
    stepIndex,
    iterative: step?.iterative ?? null,
    resultGroups: stepGroups(step?.resultGroups),
  }));
}

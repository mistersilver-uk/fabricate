/**
 * The iterative part of a run's accepted terms: the library subset a recipe's steps can reach,
 * kept on `run.termsSnapshot.iterative` so a mid-run library edit changes no begun workpiece.
 */
import { iterativeStepsOf } from '../../models/iterativeStepConfig.js';
import { arrayOrEmpty, cloneJson, isPlainObject } from '../../utils/scalars.js';

/** Every action under any step allowing them all, else the union each step names. */
function reachableActions(recipe, actions) {
  const configs = iterativeStepsOf(recipe).map((view) => view.iterative);
  if (configs.some((config) => config?.actions?.mode !== 'only')) return actions;
  const named = new Set(configs.flatMap((config) => arrayOrEmpty(config.actions.actionIds)));
  return actions.filter((action) => named.has(action?.id));
}

/** The counters an action's costs, effect targets and counter rules name. */
function actionCounterIds(action) {
  const effects = arrayOrEmpty(action?.effects);
  const rules = [
    ...arrayOrEmpty(action?.availability?.rules),
    ...effects.flatMap((entry) => arrayOrEmpty(entry?.when?.rules)),
  ];
  return [
    ...arrayOrEmpty(action?.costs).map((entry) => entry?.counterId),
    ...effects.map((entry) => entry?.target?.counterId),
    ...rules.filter((rule) => rule?.source === 'counter').map((rule) => rule.counterId),
  ];
}

/** The library actions `recipe` can reach, and the counters its instances or those actions name. */
export function iterativeTermsSubset(recipe, library) {
  const actions = reachableActions(recipe, arrayOrEmpty(library?.actions));
  const named = new Set([
    ...arrayOrEmpty(recipe?.iterative?.counters).map((entry) => entry?.counterId),
    ...actions.flatMap(actionCounterIds),
  ]);
  const counters = arrayOrEmpty(library?.counters).filter((entry) => named.has(entry?.id));
  return { counters, actions };
}

/** `{ iterative: { version, counters, actions } }` for an iterative system with a library, else `{}`. */
export function iterativeTermsEntry(recipe, system) {
  const library = system?.iterative;
  if (system?.resolutionMode !== 'iterative' || !isPlainObject(library)) return {};
  const { counters, actions } = iterativeTermsSubset(recipe, library);
  return { iterative: cloneJson({ version: library.version, counters, actions }) };
}

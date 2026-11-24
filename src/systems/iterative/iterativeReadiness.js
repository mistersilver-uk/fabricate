/**
 * Structural readiness for an `iterative` system (`resolution-modes` § Iterative Validation).
 * Recipe issues block enabling and never the system or its visibility; library issues block
 * nothing. Every rule and entry is judged by the same fault helpers the normalizers use.
 */
import {
  iterativeStepsOf,
  producedWhenLineFault,
  STEP_ACTION_MODES,
} from '../../models/iterativeStepConfig.js';
import { buildRecipeActivationIssue } from '../../utils/recipeActivationMessages.js';
import { routedOutcomeTierOptions } from '../../utils/routedOutcomeKeywords.js';
import { arrayOrEmpty, trimString } from '../../utils/scalars.js';
import {
  ACTION_CHECKS,
  actionEntryFaults,
  COUNTER_LIMITS,
  iterativeLibraryVersionUnsupported,
  RULE_COMBINES,
} from '../normalize/iterativeLibrary.js';
import { hasActiveCheck } from '../salvageCheckUsability.js';

import { counterRuleFault } from './counterRule.js';

/** Headless English per code; the manager localizes by `code`. */
export const ITERATIVE_READINESS_MESSAGES = Object.freeze({
  iterativeNoCounters: 'The recipe has no counters yet, so it needs iterative setup.',
  iterativeNoSuccessRule: 'A step has no success rule yet, so it needs iterative setup.',
  iterativeUnknownCounter: 'A counter reference names a counter that does not exist.',
  iterativeUnknownAction: 'An action reference names a crafting action that does not exist.',
  iterativeInvalidNumber: 'A counter start, start formula, bound or target cannot be read.',
  iterativeBoundsInverted: 'A counter minimum is above its maximum.',
  iterativeInvalidRule: 'A counter rule cannot be read.',
  iterativeInvalidEntry: 'An iterative setting cannot be read.',
  iterativeCheckUnavailable:
    'An allowed action rolls a check, but the routed crafting check has no roll formula.',
  iterativeMultiStepOff: 'The recipe has steps while multi-step recipes are turned off.',
  iterativeSuccessLineOnFailureGroup: 'The failure result set is produced when a step succeeds.',
  iterativeFinalStepProducesNothing: 'Nothing is produced when the final step succeeds.',
  iterativeUnknownCheckOutcome: 'An effect names a crafting-check outcome that does not exist.',
  iterativeVersionUnsupported: 'The iterative settings were made by a newer version of Fabricate.',
});

export const ITERATIVE_READINESS_CODES = Object.freeze(Object.keys(ITERATIVE_READINESS_MESSAGES));

const SETUP_CODES = new Set(['iterativeNoCounters', 'iterativeNoSuccessRule']);
const WARNING_CODES = new Set([
  'iterativeSuccessLineOnFailureGroup',
  'iterativeFinalStepProducesNothing',
]);

/** The derived "Needs iterative setup" tier; nothing about it is persisted. */
export function needsIterativeSetup(issues) {
  return arrayOrEmpty(issues).some((issue) => SETUP_CODES.has(issue?.code));
}

/** `stepIngredientSetCountExact` for each step without exactly one set, waived while drafting. */
export function iterativeStepModeIssues(steps, { requireComplete = true } = {}) {
  if (!requireComplete) return [];
  return arrayOrEmpty(steps).flatMap((step, index) =>
    arrayOrEmpty(step?.ingredientSets).length === 1
      ? []
      : [
          buildRecipeActivationIssue('stepIngredientSetCountExact', {
            step: trimString(step?.name) || String(index + 1),
            mode: 'iterative',
          }),
        ]
  );
}

/** The codes `rules` raise against the ids they may name. */
function ruleCodes(rules, { counterIds, actionIds }) {
  return arrayOrEmpty(rules).flatMap((rule) => {
    if (counterRuleFault(rule)) return ['iterativeInvalidRule'];
    if (rule.source === 'counter' && !counterIds.has(rule.counterId)) {
      return ['iterativeUnknownCounter'];
    }
    const unknown =
      rule.source === 'previousAction' && rule.actionIds.some((id) => !actionIds.has(id));
    return unknown ? ['iterativeUnknownAction'] : [];
  });
}

const isNumber = (value) => typeof value === 'number';
const boundsInverted = (min, max) => isNumber(min) && isNumber(max) && min > max;
const hasNull = (record, keys) => keys.some((key) => record?.[key] === null);

function counterCodes(counter) {
  return [
    ...(COUNTER_LIMITS.includes(counter.limit) ? [] : ['iterativeInvalidEntry']),
    ...(hasNull(counter, ['min', 'max']) ? ['iterativeInvalidNumber'] : []),
    ...(counter.limit !== 'none' && boundsInverted(counter.min, counter.max)
      ? ['iterativeBoundsInverted']
      : []),
  ];
}

function actionCodes(action, context) {
  const { libraryCounterIds, tierIds } = context;
  const enumsHold =
    ACTION_CHECKS.includes(action.check) && RULE_COMBINES.includes(action.availability?.combine);
  const effects = arrayOrEmpty(action.effects);
  const targets = [
    ...arrayOrEmpty(action.costs).map((cost) => cost?.counterId),
    ...effects.map((effect) => effect?.target?.counterId),
  ];
  const outcomeIds = effects.flatMap((effect) => arrayOrEmpty(effect?.when?.checkOutcomeIds));
  const rules = [
    ...arrayOrEmpty(action.availability?.rules),
    ...effects.flatMap((effect) => arrayOrEmpty(effect?.when?.rules)),
  ];
  const listsHold = [action.availability?.rules, action.costs, action.effects].every(Array.isArray);
  return [
    ...(enumsHold && listsHold && actionEntryFaults(action).length === 0
      ? []
      : ['iterativeInvalidEntry']),
    ...(targets.some((id) => typeof id === 'string' && !libraryCounterIds.has(id))
      ? ['iterativeUnknownCounter']
      : []),
    ...(outcomeIds.some((id) => !tierIds.has(id)) ? ['iterativeUnknownCheckOutcome'] : []),
    ...ruleCodes(rules, { counterIds: libraryCounterIds, actionIds: context.libraryActionIds }),
  ];
}

/** One issue per code, in first-raised order. */
const uniqueCodes = (codes) => [...new Set(codes)];

/** `entityKind` is `'counter'`, `'action'`, or `'system'` for the library as a whole. */
function libraryIssue(system, record, code, entityKind) {
  return {
    kind: 'system',
    entityKind,
    entityId: record?.id ?? null,
    entityName: trimString(record?.label) || record?.id || trimString(system?.name) || 'system',
    severity: 'critical',
    blocks: undefined,
    code,
    message: ITERATIVE_READINESS_MESSAGES[code],
    nav: { view: 'system-overview' },
  };
}

function libraryIssues(system, context) {
  const { library } = context;
  return [
    ...arrayOrEmpty(library.counters).flatMap((counter) =>
      uniqueCodes(counterCodes(counter)).map((code) =>
        libraryIssue(system, counter, code, 'counter')
      )
    ),
    ...arrayOrEmpty(library.actions).flatMap((action) =>
      uniqueCodes(actionCodes(action, context)).map((code) =>
        libraryIssue(system, action, code, 'action')
      )
    ),
  ];
}

function instanceCodes(instance, context) {
  const counter = context.countersById.get(instance.counterId);
  const perRecipe = counter?.limit === 'perRecipe';
  const min = instance.min ?? counter?.min;
  const max = instance.max ?? counter?.max;
  return [
    ...(counter ? [] : ['iterativeUnknownCounter']),
    ...(hasNull(instance, ['start', 'startFormula', 'min', 'max', 'target'])
      ? ['iterativeInvalidNumber']
      : []),
    ...(perRecipe && boundsInverted(min, max) ? ['iterativeBoundsInverted'] : []),
  ];
}

/** The library actions a step allows: every one under `all`, else the ones it names. */
function allowedActions(config, context) {
  const mode = config?.actions?.mode ?? 'all';
  if (mode === 'all') return arrayOrEmpty(context.library.actions);
  const ids = new Set(arrayOrEmpty(config?.actions?.actionIds));
  return arrayOrEmpty(context.library.actions).filter((action) => ids.has(action.id));
}

function stepConfigCodes(config, references, context) {
  if (!config) return ['iterativeNoSuccessRule'];
  const named = [
    ...arrayOrEmpty(config.hiddenCounterIds),
    ...arrayOrEmpty(config.lockedCounterIds),
  ];
  const rolls = allowedActions(config, context).some((action) => action.check === 'roll');
  return [
    ...(arrayOrEmpty(config.success).length === 0 ? ['iterativeNoSuccessRule'] : []),
    ...(STEP_ACTION_MODES.includes(config.actions?.mode) ? [] : ['iterativeInvalidEntry']),
    ...(arrayOrEmpty(config.actions?.actionIds).some((id) => !references.actionIds.has(id))
      ? ['iterativeUnknownAction']
      : []),
    ...(named.some((id) => !references.counterIds.has(id)) ? ['iterativeUnknownCounter'] : []),
    ...ruleCodes([...arrayOrEmpty(config.success), ...arrayOrEmpty(config.failure)], references),
    ...(rolls && !context.routedCheckActive ? ['iterativeCheckUnavailable'] : []),
  ];
}

function producedWhenCodes(group, references) {
  return arrayOrEmpty(group.producedWhen).flatMap((line) => {
    if (producedWhenLineFault(line)) return ['iterativeInvalidEntry'];
    const misplaced = group.role === 'failure' && line.end === 'success';
    return [
      ...ruleCodes(line.rules, references),
      ...(misplaced ? ['iterativeSuccessLineOnFailureGroup'] : []),
    ];
  });
}

const producesOnSuccess = (groups) =>
  groups.some((group) => arrayOrEmpty(group.producedWhen).some((line) => line?.end === 'success'));

function recipeCodes(recipe, system, context) {
  const instances = arrayOrEmpty(recipe?.iterative?.counters);
  const references = {
    counterIds: new Set(instances.map((instance) => instance.counterId)),
    actionIds: context.libraryActionIds,
  };
  const views = iterativeStepsOf(recipe);
  const multiStep = arrayOrEmpty(recipe?.steps).length > 0;
  return [
    ...(instances.length === 0 ? ['iterativeNoCounters'] : []),
    ...instances.flatMap((instance) => instanceCodes(instance, context)),
    ...views.flatMap((view) => stepConfigCodes(view.iterative, references, context)),
    ...views.flatMap((view) => view.resultGroups.flatMap((g) => producedWhenCodes(g, references))),
    ...(multiStep && system?.features?.multiStepRecipes !== true ? ['iterativeMultiStepOff'] : []),
    ...(producesOnSuccess(views.at(-1).resultGroups) ? [] : ['iterativeFinalStepProducesNothing']),
  ];
}

function recipeIssue(recipe, code) {
  const severity = WARNING_CODES.has(code) ? 'warning' : 'critical';
  return {
    kind: 'recipe',
    entityKind: 'recipe',
    entityId: recipe?.id ?? null,
    entityName: trimString(recipe?.name) || recipe?.id || 'recipe',
    severity,
    blocks: severity === 'critical' ? 'enable' : undefined,
    code,
    message: ITERATIVE_READINESS_MESSAGES[code],
    nav: { view: 'recipe-edit', tab: 'overview' },
  };
}

function readinessContext(system) {
  const library = system?.iterative ?? {};
  const counters = arrayOrEmpty(library.counters);
  const routed = system?.craftingCheck?.routed;
  return {
    library,
    countersById: new Map(counters.map((counter) => [counter.id, counter])),
    libraryCounterIds: new Set(counters.map((counter) => counter.id)),
    libraryActionIds: new Set(arrayOrEmpty(library.actions).map((action) => action.id)),
    tierIds: new Set(routedOutcomeTierOptions(routed).map((tier) => tier.id)),
    routedCheckActive: hasActiveCheck(routed),
  };
}

/**
 * Every structural readiness issue of an `iterative` system, as `SystemValidationIssue`s, and
 * none for any other mode. A library newer than this build reports only that it is unsupported.
 */
export function evaluateIterativeReadiness(system, recipes) {
  if (system?.resolutionMode !== 'iterative') return [];
  if (iterativeLibraryVersionUnsupported(system.iterative)) {
    return [libraryIssue(system, null, 'iterativeVersionUnsupported', 'system')];
  }
  const context = readinessContext(system);
  return [
    ...libraryIssues(system, context),
    ...arrayOrEmpty(recipes).flatMap((recipe) =>
      uniqueCodes(recipeCodes(recipe, system, context)).map((code) => recipeIssue(recipe, code))
    ),
  ];
}

/** A predicate on the action ids a recipe's steps allow: every one unless each step names its own. */
function recipeAllowsAction(recipe) {
  const configs = iterativeStepsOf(recipe).map((view) => view.iterative);
  if (configs.some((config) => config?.actions?.mode !== 'only')) return () => true;
  const named = new Set(configs.flatMap((config) => arrayOrEmpty(config.actions.actionIds)));
  return (actionId) => named.has(actionId);
}

/**
 * The critical issues that refuse a new start of `recipe`: its own recipe-scoped ones, those on an
 * action one of its steps allows, and `iterativeVersionUnsupported`.
 */
export function iterativeStartBlockers(issues, recipe) {
  const allows = recipeAllowsAction(recipe);
  return arrayOrEmpty(issues).filter((issue) => {
    if (issue?.severity !== 'critical') return false;
    if (issue.code === 'iterativeVersionUnsupported') return true;
    if (issue.entityKind === 'recipe') return issue.entityId === recipe?.id;
    return issue.entityKind === 'action' && allows(issue.entityId);
  });
}

/**
 * The GM's view of the iterative library, as pure functions: the id a new entry is minted with,
 * the name rule a Counter keeps, and where a Counter or Crafting Action is used.
 */
import { iterativeStepsOf } from '../../../../../models/iterativeStepConfig.js';
import { analyzeIterativeExpression } from '../../../../../systems/iterative/expression.js';
import { isIterativeId } from '../../../../../systems/iterative/counterRule.js';
import { arrayOrEmpty, isPlainObject, trimString } from '../../../../../utils/scalars.js';

const ID_FALLBACKS = Object.freeze({
  counter: 'counter',
  action: 'action',
  cost: 'cost',
  effect: 'effect',
});

const capitalize = (word) => word.charAt(0).toUpperCase() + word.slice(1);
// A word typed in capitals reads as one acronym, so only its first letter keeps its case.
const settle = (word) => (word === word.toUpperCase() ? word.toLowerCase() : word);

function camelCase(label) {
  const words = trimString(label)
    .split(/[^A-Za-z0-9]+/u)
    .filter(Boolean)
    .map(settle);
  if (words.length === 0) return '';
  const [first, ...rest] = words;
  return `${first.charAt(0).toLowerCase()}${first.slice(1)}${rest.map(capitalize).join('')}`;
}

/**
 * The id a new `counter`, `action`, `cost` or `effect` is created with: its label in camelCase, or
 * the kind's fallback when the label holds no ASCII letter or digit, with a numeric suffix until it
 * is absent from `takenIds`. It is minted once and never rewritten, so a rename edits no reference.
 */
export function deriveIterativeId(label, kind, takenIds = []) {
  const fallback = ID_FALLBACKS[kind];
  if (!fallback) throw new Error(`no iterative id fallback for "${kind}"`);
  const camel = camelCase(label);
  const base = /^[a-z]/u.test(camel) ? camel : camel ? `${fallback}${capitalize(camel)}` : fallback;
  const taken = new Set(takenIds);
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) id = `${base}${suffix}`;
  if (!isIterativeId(id)) throw new Error(`derived iterative id "${id}" is not a valid id`);
  return id;
}

const nameKey = (label) => trimString(label).toLowerCase();

/** `'empty'` or `'duplicate'` when `label` may not name counter `id`, else `null`. */
export function counterNameFault(counters, id, label) {
  const key = nameKey(label);
  if (key === '') return 'empty';
  const clash = arrayOrEmpty(counters).some(
    (counter) => counter.id !== id && nameKey(counter.label) === key
  );
  return clash ? 'duplicate' : null;
}

/** The ids of every counter whose persisted name another counter shares. */
export function duplicateCounterIds(counters) {
  const list = arrayOrEmpty(counters);
  const tally = new Map();
  for (const counter of list)
    tally.set(nameKey(counter.label), (tally.get(nameKey(counter.label)) ?? 0) + 1);
  return new Set(
    list.filter((c) => nameKey(c.label) !== '' && tally.get(nameKey(c.label)) > 1).map((c) => c.id)
  );
}

const ruleNames = (rule, field, id) =>
  isPlainObject(rule) &&
  (field === 'counterId'
    ? rule.source === 'counter' && rule.counterId === id
    : rule.source === 'previousAction' && arrayOrEmpty(rule.actionIds).includes(id));

const anyRule = (rules, field, id) =>
  arrayOrEmpty(rules).some((rule) => ruleNames(rule, field, id));

function expressionReads(text, profile, id) {
  const { roots } = analyzeIterativeExpression(text, profile);
  return ['counter', 'min', 'max', 'target'].some((kind) => roots[kind].includes(id));
}

/** Every rule list an action carries: its availability and each effect's `when`. */
const actionRuleLists = (action) => [
  action?.availability?.rules,
  ...arrayOrEmpty(action?.effects).map((effect) => effect?.when?.rules),
];

function actionUsesCounter(action, id) {
  const costs = arrayOrEmpty(action?.costs);
  const effects = arrayOrEmpty(action?.effects);
  return (
    costs.some((cost) => cost?.counterId === id || expressionReads(cost?.amount, 'cost', id)) ||
    effects.some(
      (effect) => effect?.target?.counterId === id || expressionReads(effect?.amount, 'effect', id)
    ) ||
    actionRuleLists(action).some((rules) => anyRule(rules, 'counterId', id))
  );
}

const actionUsesAction = (action, id) =>
  actionRuleLists(action).some((rules) => anyRule(rules, 'previousAction', id));

/** Each step of `recipe` as `{ recipeId, recipeName, stepIndex, stepName, view }`. */
function stepsOf(recipe) {
  return iterativeStepsOf(recipe).map((view) => ({
    recipeId: recipe?.id ?? '',
    recipeName: trimString(recipe?.name) || recipe?.id || '',
    stepIndex: view.stepIndex,
    stepName: trimString(recipe?.steps?.[view.stepIndex]?.name),
    view,
  }));
}

const stepRuleLists = ({ view }) => [
  view.iterative?.success,
  view.iterative?.failure,
  ...view.resultGroups.flatMap((group) =>
    arrayOrEmpty(group.producedWhen).map((line) => line?.rules)
  ),
];

function stepUsesCounter(step, id) {
  const config = step.view.iterative;
  return (
    arrayOrEmpty(config?.hiddenCounterIds).includes(id) ||
    arrayOrEmpty(config?.lockedCounterIds).includes(id) ||
    stepRuleLists(step).some((rules) => anyRule(rules, 'counterId', id))
  );
}

function stepUsesAction(step, id) {
  const actions = step.view.iterative?.actions;
  const allowed = actions?.mode === 'only' && arrayOrEmpty(actions.actionIds).includes(id);
  return allowed || stepRuleLists(step).some((rules) => anyRule(rules, 'previousAction', id));
}

const publicStep = ({ view, ...step }) => step;

function usesOf({ actions, recipes, actionNames, stepNames, instances = false, id }) {
  const steps = arrayOrEmpty(recipes).flatMap((recipe) => {
    const whole =
      instances && arrayOrEmpty(recipe?.iterative?.counters).some((e) => e?.counterId === id);
    return stepsOf(recipe)
      .filter((step) => whole || stepNames(step, id))
      .map(publicStep);
  });
  const named = arrayOrEmpty(actions)
    .filter((action) => actionNames(action, id))
    .map((action) => ({ id: action.id, label: trimString(action.label) || action.id }));
  return { actions: named, steps };
}

/**
 * Where counter `id` is used: the Crafting Actions that name it in a cost, an effect target, a rule
 * or an expression, and the recipe steps that name it. A recipe holding a Counter Instance of it
 * counts every one of its steps, because the counter is live in each.
 * @returns {{ actions: {id: string, label: string}[], steps: object[] }}
 */
export function counterUses(library, recipes, id) {
  return usesOf({
    actions: library?.actions,
    recipes,
    actionNames: actionUsesCounter,
    stepNames: stepUsesCounter,
    instances: true,
    id,
  });
}

/**
 * Where Crafting Action `id` is used: the steps whose allow-list or rules name it, and the actions
 * whose availability or effects hold a `previousAction` rule naming it.
 * @returns {{ actions: {id: string, label: string}[], steps: object[] }}
 */
export function actionUses(library, recipes, id) {
  return usesOf({
    actions: library?.actions,
    recipes,
    actionNames: actionUsesAction,
    stepNames: stepUsesAction,
    id,
  });
}

/** `{ actions, steps }` counts of one {@link counterUses} or {@link actionUses} answer. */
export const usageCounts = (uses) => ({ actions: uses.actions.length, steps: uses.steps.length });

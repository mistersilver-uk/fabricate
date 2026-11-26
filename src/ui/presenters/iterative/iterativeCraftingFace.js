/**
 * The two faces of an iterative recipe on the player Crafting tab (issue 3011): the goal it works
 * toward before a workpiece exists, and the workpiece the actor's first active run of it holds.
 * A viewer who is not a GM sees no hidden counter in either, as on every other iterative surface.
 */
import { iterativeStepsOf } from '../../../models/iterativeStepConfig.js';
import { resolvedComponentsFor } from '../../../systems/scopedEntityReads.js';
import { arrayOrEmpty } from '../../../utils/scalars.js';

import { hiddenCounterIds } from './iterativeCounters.js';
import { listText, ruleText } from './iterativeRuleText.js';
import { readIterativeRun } from './iterativeRunRead.js';

const UNKNOWN_COMPONENT_KEY = 'FABRICATE.Labels.UnknownComponent';

/** Reads a counter's or action's label; a counter in `hidden` reads as none, so its rules drop. */
function labelReader({ counters, actions }, hidden) {
  const named = (entries) =>
    new Map(arrayOrEmpty(entries).map((entry) => [entry?.id, entry?.label]));
  const counterLabels = named(counters);
  const actionLabels = named(actions);
  return {
    counter: (id) => (hidden.has(id) ? null : (counterLabels.get(id) ?? null)),
    action: (id) => actionLabels.get(id) ?? null,
  };
}

const rulesText = (rules, combine, labels, localize) =>
  listText(
    arrayOrEmpty(rules).map((rule) => ruleText(rule, labels, localize)),
    combine,
    localize
  );

/** What the recipe's result groups name, once each, with a quantity past one: "Longsword ×2". */
function producedNames(recipe, system, localize) {
  const steps = arrayOrEmpty(recipe?.steps);
  const groups = arrayOrEmpty(steps.length > 0 ? steps.at(-1)?.resultGroups : recipe?.resultGroups);
  const byId = new Map(resolvedComponentsFor(system).map((entry) => [entry.id, entry.name]));
  const names = groups
    .flatMap((group) => (group?.role === 'failure' ? [] : arrayOrEmpty(group?.results)))
    .map((result) => {
      const name = byId.get(result?.componentId) || localize(UNKNOWN_COMPONENT_KEY);
      return Number(result?.quantity) > 1 ? `${name} ×${Number(result.quantity)}` : name;
    });
  return [...new Set(names)].join(', ');
}

/** `{ succeeds, fails, produces }`: the first step's rules and the result groups, as plain text. */
function goalOf({ recipe, system, gm, localize }) {
  const [first] = iterativeStepsOf(recipe);
  const hidden = hiddenCounterIds({
    instances: recipe?.iterative?.counters,
    step: first?.iterative,
    gm,
  });
  const labels = labelReader(system?.iterative ?? {}, hidden);
  return {
    succeeds: rulesText(first?.iterative?.success, 'all', labels, localize),
    fails: rulesText(first?.iterative?.failure, 'any', labels, localize),
    produces: producedNames(recipe, system, localize),
  };
}

/** The run's step, the counters this viewer may see on it, and the session it takes next. */
function workpieceOf({ run, gm }) {
  const read = readIterativeRun(run);
  if (!read?.supported) return null;
  const terms = run.termsSnapshot ?? {};
  const view = iterativeStepsOf(terms.recipe).find(
    (entry) => entry.stepIndex === read.focusStepIndex
  );
  const hidden = hiddenCounterIds({
    instances: terms.recipe?.iterative?.counters,
    step: view?.iterative,
    gm,
  });
  const labels = labelReader(terms.iterative ?? {}, hidden);
  const stepIndex = read.currentStepIndex ?? read.focusStepIndex;
  const live = read.started && read.state?.terminal == null;
  return {
    runId: run.id,
    stepIndex,
    stepName: run.steps?.[stepIndex]?.stepName || terms.recipe?.steps?.[stepIndex]?.name || '',
    stepCount: arrayOrEmpty(run.steps).length,
    counters: arrayOrEmpty(read.state?.counters)
      .filter((row) => labels.counter(row?.counterId))
      .map((row) => ({
        counterId: row.counterId,
        label: labels.counter(row.counterId),
        value: Number(row.value),
      })),
    nextSession: live ? Number(read.state.sessionCount ?? 0) + 1 : null,
  };
}

/**
 * `{ goal, workpiece }` for an iterative recipe: `workpiece` is `null` until the actor's active
 * run of it exists (or when this release cannot read it), and `goal` always reads the recipe.
 */
export function iterativeCraftingFace({ recipe, system, run, gm = false, localize }) {
  return {
    goal: goalOf({ recipe, system, gm, localize }),
    workpiece: run ? workpieceOf({ run, gm }) : null,
  };
}

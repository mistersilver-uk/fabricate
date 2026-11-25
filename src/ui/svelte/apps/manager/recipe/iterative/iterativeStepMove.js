/**
 * The one patch a step edit writes on an iterative recipe (`data-models` Recipe 19): giving the
 * recipe its first step moves `Recipe.iterative.step` onto it, and leaving none makes step 1 the
 * single step whole. Every patch carries the top-level `iterative` the draft holds, `null` included.
 */
import { isPlainObject } from '../../../../../../utils/scalars.js';

const carried = (draft) =>
  draft && Object.hasOwn(draft, 'iterative') ? { iterative: draft.iterative ?? null } : {};

/** `iterative` without its `step`, or `fallback` when the draft holds no object there. */
function withoutStep(iterative, fallback) {
  if (!isPlainObject(iterative)) return fallback;
  const { step: _moved, ...rest } = iterative;
  return rest;
}

function entered(draft, nextSteps) {
  if (!isPlainObject(draft.iterative)) return { steps: nextSteps, ...carried(draft) };
  const { step } = draft.iterative;
  const [first, ...others] = nextSteps;
  const steps = step == null ? nextSteps : [{ ...first, iterative: step }, ...others];
  return { steps, iterative: withoutStep(draft.iterative) };
}

function collapsed(draft, first) {
  const patch = {
    steps: [],
    ingredientSets: first?.ingredientSets ?? [],
    resultGroups: first?.resultGroups ?? [],
    toolIds: first?.toolIds ?? [],
    timeRequirement: first?.timeRequirement ?? null,
  };
  const step = first?.iterative ?? null;
  if (!isPlainObject(draft.iterative) && step == null) return { ...patch, ...carried(draft) };
  const recipeIterative = withoutStep(draft.iterative, { counters: [] });
  return { ...patch, iterative: step == null ? recipeIterative : { ...recipeIterative, step } };
}

/** The patch that sets `nextSteps` on the iterative recipe `draft`. */
export function withIterativeStepMoved(draft, nextSteps) {
  const prior = Array.isArray(draft?.steps) ? draft.steps : [];
  if (prior.length === 0 && nextSteps.length > 0) return entered(draft, nextSteps);
  if (prior.length > 0 && nextSteps.length === 0) return collapsed(draft, prior[0]);
  return { steps: nextSteps, ...carried(draft) };
}

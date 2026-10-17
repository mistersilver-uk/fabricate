/**
 * The recipe editor's routing and result-set edits, as pure functions over the draft: which scope
 * a write targets, the collapsed results projection, and the set, group and alchemy-slot writes.
 * `mintId` is injected so tests fix the ids.
 */
import { newDraftId } from '../../../util/draftId.js';

/** The step a scope-less write lands on: a collapsed chain's final step, else `stepId` itself. */
export function scopeTarget(stepId, finalStep) {
  return stepId == null && finalStep ? finalStep.id : stepId;
}

/**
 * The single-step recipe the Results tab edits while a chain is collapsed: the final step's groups,
 * sets and routing over the recipe, or `recipe` itself with no final step.
 */
export function resultsProjection(recipe, finalStep) {
  if (!finalStep) return recipe;
  return {
    ...recipe,
    resultGroups: Array.isArray(finalStep.resultGroups) ? finalStep.resultGroups : [],
    ingredientSets: Array.isArray(finalStep.ingredientSets) ? finalStep.ingredientSets : [],
    resultSelection: finalStep.resultSelection ?? recipe?.resultSelection ?? null,
    outcomeRouting: finalStep.outcomeRouting ?? recipe?.outcomeRouting ?? null,
  };
}

/** `sets` with the set `setId` routed to `groupId`, or unrouted when `groupId` is null. */
export function routeSet(sets, setId, groupId) {
  return sets.map((set) => (set.id === setId ? { ...set, resultGroupId: groupId ?? null } : set));
}

/** `groups` with an empty result set appended under an eager id, so it is routable at once. */
export function addResultGroup(groups, mintId = newDraftId) {
  return [...groups, { id: mintId(), name: '', checkOutcomeIds: [], results: [] }];
}

/** `sets` with an empty ingredient set appended under an eager id, so it is routable at once. */
export function addIngredientSet(sets, mintId = newDraftId) {
  return [...sets, { id: mintId(), name: '', ingredientGroups: [] }];
}

/**
 * Alchemy Simple's `[success, failure]` pair with `nextGroup` written into `slot`: the success set
 * is the first non-failure group and the failure set the reserved `role: 'failure'` one, each
 * synthesized when absent and spread so its id and name survive.
 */
export function withResultSlot(groups, slot, nextGroup, mintId = newDraftId) {
  const success = groups.find((group) => group?.role !== 'failure') || groups[0] || { results: [] };
  const failure = groups.find((group) => group?.role === 'failure') || {
    role: 'failure',
    results: [],
  };
  const write = (current, edit) => ({
    ...current,
    ...edit,
    id: current.id || edit?.id || mintId(),
  });
  return [
    write(success, slot === 'success' ? nextGroup : null),
    { ...write(failure, slot === 'failure' ? nextGroup : null), role: 'failure' },
  ];
}

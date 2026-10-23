/**
 * The recipe editor's routing and result-set edits, as pure functions over the draft: which scope
 * a write targets, the collapsed results projection, and the set, tier, group and alchemy-slot
 * writes.
 * `mintId` is injected so tests fix the ids.
 */
import { newDraftId } from '../../../util/draftId.js';

/** The step a scope-less write lands on: a collapsed chain's final step, else `stepId` itself. */
export function scopeTarget(stepId, finalStep) {
  return stepId == null && finalStep ? finalStep.id : stepId;
}

/**
 * The draft's scope writers: `sets(stepId, next)` and `groups(stepId, next)` patch the recipe for a
 * null `stepId` and that step otherwise, an unknown step writing nothing. `groups` and
 * `assignSet(stepId, groupId, setId, assigned)` send a null `stepId` through {@link scopeTarget};
 * `sets` does not.
 */
export function scopeWrites({ ingredientSets, steps, finalStep, onUpdateRecipe, onUpdateStep }) {
  const stepById = (stepId) => steps.find((step) => step.id === stepId) || null;
  function sets(stepId, nextSets) {
    if (stepId == null) onUpdateRecipe({ ingredientSets: nextSets });
    else if (stepById(stepId)) onUpdateStep(stepId, { ingredientSets: nextSets });
  }
  function groups(stepId, nextGroups) {
    const targetStepId = scopeTarget(stepId, finalStep);
    if (targetStepId == null) onUpdateRecipe({ resultGroups: nextGroups });
    else if (stepById(targetStepId)) onUpdateStep(targetStepId, { resultGroups: nextGroups });
  }
  // A set routes to at most one group, so assigning replaces any prior target.
  function assignSet(stepId, groupId, setId, assigned) {
    if (!setId || (assigned && !groupId)) return;
    const scopeStepId = scopeTarget(stepId, finalStep);
    const scopeSets =
      scopeStepId == null ? ingredientSets : stepById(scopeStepId)?.ingredientSets || [];
    sets(scopeStepId, routeSet(scopeSets, setId, assigned ? groupId : null));
  }
  return { sets, groups, assignSet };
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

/**
 * `groups` with `tierId` listed by `groups[index]` alone, appended last and stripped from every
 * other list; `groups` itself when that group is already its only lister, so a no-op writes nothing.
 */
export function routeTier(groups, tierId, index) {
  const listsIt = (group) =>
    Array.isArray(group?.checkOutcomeIds) && group.checkOutcomeIds.includes(tierId);
  const listers = groups.flatMap((group, i) => (listsIt(group) ? [i] : []));
  if (listers.length === 1 && listers[0] === index) return groups;
  return groups.map((group, i) => {
    const kept = (group?.checkOutcomeIds ?? []).filter((id) => id !== tierId);
    if (i === index) return { ...group, checkOutcomeIds: [...kept, tierId] };
    return listsIt(group) ? { ...group, checkOutcomeIds: kept } : group;
  });
}

/** `groups` with an empty result set appended under an eager id, so it is routable at once. */
export function addResultGroup(groups, mintId = newDraftId) {
  return [...groups, { id: mintId(), name: '', checkOutcomeIds: [], results: [] }];
}

/** `sets` with an empty ingredient set appended under an eager id, so it is routable at once. */
export function addIngredientSet(sets, mintId = newDraftId) {
  return [...sets, { id: mintId(), name: '', ingredientGroups: [] }];
}

const isFailureGroup = (group) => group?.role === 'failure';

/**
 * The two-slot editor's sets: the success set is the first non-failure group, else empty, and the
 * failure set is the reserved `role: 'failure'` group, else `null`; neither is ever filled in.
 */
export function alchemySlots(groups) {
  return {
    success: groups.find((group) => !isFailureGroup(group)) || { results: [] },
    failure: groups.find(isFailureGroup) || null,
  };
}

/**
 * `[success]`, plus the failure set only when one exists, with `nextGroup` written into `slot`;
 * each is spread so its id and name survive. A `'failure'` edit with no failure set is a no-op.
 */
export function withResultSlot(groups, slot, nextGroup, mintId = newDraftId) {
  const { success, failure } = alchemySlots(groups);
  if (slot === 'failure' && !failure) return groups;
  const write = (current, edit) => ({
    ...current,
    ...edit,
    id: current.id || edit?.id || mintId(),
  });
  const next = [write(success, slot === 'success' ? nextGroup : null)];
  if (!failure) return next;
  return [...next, { ...write(failure, slot === 'failure' ? nextGroup : null), role: 'failure' }];
}

/** Adds the reserved failure set empty (`on`) or removes every one; a no-op returns `groups`. */
export function withFailureSet(groups, on, mintId = newDraftId) {
  if (Boolean(on) === groups.some(isFailureGroup)) return groups;
  return on
    ? [...groups, { id: mintId(), name: '', role: 'failure', results: [] }]
    : groups.filter((group) => !isFailureGroup(group));
}

/**
 * The four GM Knowledge mutations, as a plain-JS collaborator (issue 785).
 *
 * These bodies used to live inline in `SvelteCraftingSystemManagerApp`, where every
 * acceptance bullet they carry — delete calls `item.delete()` exactly once and
 * `item.update` NEVER, a delete writes no `learnedRecipes` and no
 * `recipeItemLearning`, erase passes the EXACT options object
 * `{ freeLearnBudget: true, clearDiscovery: false }` — was only reachable through a
 * live Foundry Application. Extracted here they take explicit collaborators
 * (`actor`, `item`, `service`, `reset`) and nothing else, so each rule is asserted
 * on a fake's call log rather than inferred from source text.
 *
 * What deliberately did NOT move: the `game.user?.isGM` gate and the document
 * lookups. Those are Foundry-facing and belong to the seam; this module never
 * touches `game`, `ui`, `Hooks` or `fromUuid`.
 */

/** Knowledge-surface result keys. Static literals so the lang gates can see them. */
export const KNOWLEDGE_MESSAGES = Object.freeze({
  gmOnly: 'FABRICATE.Knowledge.Manage.GMOnly',
  unavailable: 'FABRICATE.Knowledge.Manage.Unavailable',
  noActor: 'FABRICATE.Knowledge.Manage.NoActor',
  noItem: 'FABRICATE.Knowledge.Manage.NoItem',
  noDefinition: 'FABRICATE.Knowledge.Manage.NoDefinition',
  deleted: 'FABRICATE.Knowledge.Manage.Deleted',
  deleteFailed: 'FABRICATE.Knowledge.Manage.DeleteFailed',
  erased: 'FABRICATE.Knowledge.Manage.Erased',
  eraseFailed: 'FABRICATE.Knowledge.Manage.EraseFailed',
  expendFailed: 'FABRICATE.Knowledge.Manage.ExpendFailed',
});

/**
 * Spend one charge of an owned recipe-item copy.
 *
 * The engine owns every rule here (the increment, the exhaustion test, the
 * `whenSpent` disposal AND the already-spent guard); this only routes to it and maps
 * a throw onto a result shape, because the store expects a result and never a throw.
 *
 * @param {{actor: object, item: object, service: object, definition: object}} deps
 * @returns {Promise<{success: boolean, message: string, messageData?: object}>}
 */
export async function expendOwnedRecipeItemUse({ actor, item, service, definition } = {}) {
  if (typeof service?.expendRecipeItemUse !== 'function') {
    return { success: false, message: KNOWLEDGE_MESSAGES.unavailable };
  }
  if (!definition) return { success: false, message: KNOWLEDGE_MESSAGES.noDefinition };
  try {
    return await service.expendRecipeItemUse(actor, item.id, definition);
  } catch (err) {
    console.error('Fabricate | Failed to expend a recipe item use:', err);
    return { success: false, message: KNOWLEDGE_MESSAGES.expendFailed };
  }
}

/**
 * Delete one owned copy: a plain `item.delete()`, no engine method.
 *
 * A stacked copy deletes the WHOLE document. `recipeItemUsage.timesUsed` and
 * `recipeItemLearning.learnedCount` are per-DOCUMENT counters shared by every unit,
 * so decrementing the stack-quantity path would leave one set of counters attached
 * to fewer units and silently falsify every derived `remaining`. That is a
 * deliberate exception to the component-consumption convention, and it is what all
 * three existing recipe-item disposal paths already do.
 *
 * Delete MUST NOT free learn budget and MUST NOT touch `learnedRecipes`, which is
 * why this function has no `actor` collaborator at all: it cannot write to one.
 *
 * @param {{item: object}} deps
 * @returns {Promise<{success: boolean, message: string, messageData?: object}>}
 */
export async function deleteOwnedRecipeItemCopy({ item } = {}) {
  const name = item?.name || '';
  try {
    await item.delete();
  } catch (err) {
    console.error('Fabricate | Failed to delete an owned recipe item:', err);
    return { success: false, message: KNOWLEDGE_MESSAGES.deleteFailed };
  }
  return { success: true, message: KNOWLEDGE_MESSAGES.deleted, messageData: { name } };
}

/**
 * Erase one learned recipe through the merged issue 773 primitive.
 *
 * BOTH option values are pinned and passed EXPLICITLY: `freeLearnBudget` must be
 * passed even though it already defaults true (otherwise an implementation passing
 * `false` satisfies the spec letter while breaking the acceptance), and
 * `clearDiscovery` is deliberately false — an erase is an un-learn, a reset is an
 * amnesia. The reset grains disclose that asymmetry in their confirm dialog.
 *
 * @param {{actor: object, service: object, recipeId: string}} deps
 * @returns {Promise<{success: boolean, message: string, messageData?: object}>}
 */
export async function eraseLearnedRecipeEntry({ actor, service, recipeId } = {}) {
  if (typeof service?.forgetLearnedRecipes !== 'function') {
    return { success: false, message: KNOWLEDGE_MESSAGES.unavailable };
  }
  try {
    const result = await service.forgetLearnedRecipes(actor, [recipeId], {
      freeLearnBudget: true,
      clearDiscovery: false,
    });
    const success = result?.success === true;
    return {
      // A failed erase must not render the success sentence: `success` was already
      // computed correctly here while the message was unconditional, so a failure
      // rendered a red toast reading "Erased 0 learned recipe(s)."
      success,
      message: success ? KNOWLEDGE_MESSAGES.erased : KNOWLEDGE_MESSAGES.eraseFailed,
      messageData: { count: result?.count || 0 },
    };
  } catch (err) {
    console.error('Fabricate | Failed to erase a learned recipe:', err);
    return { success: false, message: KNOWLEDGE_MESSAGES.eraseFailed };
  }
}

/**
 * Both reset grains route through the merged GM API rather than reimplementing
 * either. A null `systemId` is the all-systems grain — the only one that can clear
 * orphan learned keys, because `forgetSystemLearnedRecipes` deliberately leaves them.
 *
 * @param {{reset: Function, actorId: string, systemId: string|null, thisArg?: object}} deps
 * @returns {Promise<{success: boolean, message: string, messageData?: object}>}
 */
export async function resetActorKnowledgeState({
  reset,
  actorId,
  systemId = null,
  thisArg = null,
} = {}) {
  if (typeof reset !== 'function') {
    return { success: false, message: KNOWLEDGE_MESSAGES.unavailable };
  }
  return await reset.call(thisArg, { actorId, systemId });
}

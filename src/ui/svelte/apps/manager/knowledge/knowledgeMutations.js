/**
 * The four GM Knowledge mutations as a plain-JS collaborator taking explicit collaborators
 * (`actor`, `item`, `service`, `reset`) and nothing else, so every rule below is asserted on a
 * fake's call log rather than inferred from source text. The `game.user?.isGM` gate and the
 * document lookups stay in the seam: this module never touches `game`, `ui`, `Hooks` or `fromUuid`.
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
 * Spend one charge of an owned copy. The engine owns every rule — increment, exhaustion test,
 * `whenSpent` disposal and the already-spent guard; this routes to it and maps a throw onto a
 * result shape, because the store expects a result and never a throw.
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
 * Delete one owned copy: a plain `item.delete()`, no engine method. A stacked copy deletes the
 * WHOLE document, because `timesUsed` and `learnedCount` are per-DOCUMENT counters and the
 * stack-quantity path would leave them attached to fewer units. Delete MUST NOT free learn budget
 * nor touch `learnedRecipes`, which is why there is no `actor` collaborator: it cannot write to one.
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
 * Erase one learned recipe. BOTH option values are pinned and passed EXPLICITLY: `freeLearnBudget`
 * even though it already defaults true, and `clearDiscovery` deliberately false — an erase is an
 * un-learn, a reset is an amnesia, and the reset grains disclose that asymmetry in their dialog.
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
 * Both reset grains route through the merged GM API. A null `systemId` is the all-systems grain, the
 * only one that can clear orphan learned keys — `forgetSystemLearnedRecipes` deliberately leaves them.
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

/**
 * The GM Knowledge surface (issue 785), a section of `createAdminStore` (issue 1708). It owns its
 * snapshot cache and publishes out of band: a whole-world scan must never join `refresh()`.
 */
import { get } from 'svelte/store';

import {
  defaultKnowledgeTab,
  projectKnowledgeSnapshot,
} from '../apps/manager/knowledge/knowledgeStudio.js';

export function createKnowledgeSection({
  services,
  viewState,
  selectedSystemId,
  deleteConfirmButtons,
  onMicrotask,
  isDestroyed,
}) {
  // `knowledgeActive` makes `refreshKnowledge()` a total no-op while the surface is closed.
  let knowledgeActive = false;
  let knowledgeSnapshot = null;
  let knowledgeSelectedActorId = '';
  let knowledgeRefreshScheduled = false;
  // Resolved once per surface entry from the definition count, never as a live derivation: a GM
  // authoring the first recipe item elsewhere would flip 0 -> 1 and yank the open tab mid-task.
  let knowledgeDefaultTab = defaultKnowledgeTab(0);
  let knowledgeDefaultTabResolved = false;

  function knowledgeRawCharacter(actorId) {
    const characters = Array.isArray(knowledgeSnapshot?.characters)
      ? knowledgeSnapshot.characters
      : [];
    return characters.find((character) => String(character?.id) === String(actorId)) || null;
  }

  function knowledgeRawOwnedCopy(actorId, itemId) {
    const copies = knowledgeRawCharacter(actorId)?.ownedCopies || [];
    return copies.find((copy) => String(copy?.itemId) === String(itemId)) || null;
  }

  // Localized copy for the Knowledge surface's two heavyweight confirms. Every key is a static
  // literal at its call site: an interpolated key is invisible to `ui-lang-keys-resolve` and
  // `lang-keys-no-orphans`, so a missing message would ship silently.
  function knowledgeText(key, fallback, data = null) {
    const localized = data ? services.localize?.(key, data) : services.localize?.(key);
    if (localized) return localized;
    if (!data) return fallback;
    return Object.entries(data).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      fallback
    );
  }

  function notifyKnowledgeResult(result) {
    const message = result?.message;
    if (!message) return;
    const text = services.localize?.(message, result?.messageData) || message;
    if (result?.success === true) services.notify?.info?.(text);
    else services.notify?.error?.(text);
  }

  function publishKnowledge() {
    viewState.update((prev) => ({
      ...prev,
      knowledge: projectKnowledgeSnapshot(knowledgeSnapshot, {
        active: knowledgeActive,
        selectedActorId: knowledgeSelectedActorId,
        defaultTab: knowledgeDefaultTab,
      }),
    }));
  }

  function clearCache() {
    knowledgeSnapshot = null;
    knowledgeDefaultTabResolved = false;
    knowledgeSelectedActorId = '';
  }

  /**
   * Re-read the Knowledge snapshot.
   *
   * @param {{force?: boolean}} [options] `force` re-reads the seam; otherwise a cached snapshot is
   * simply re-published.
   */
  async function refreshKnowledge({ force = false } = {}) {
    if (!knowledgeActive) return false;
    if (force || !knowledgeSnapshot) {
      const systemId = get(selectedSystemId);
      knowledgeSnapshot = (await services.getKnowledgeSnapshot?.(systemId)) || null;
      if (!knowledgeDefaultTabResolved) {
        knowledgeDefaultTab = defaultKnowledgeTab(knowledgeSnapshot?.definitionCount || 0);
        knowledgeDefaultTabResolved = true;
      }
    }
    publishKnowledge();
    return true;
  }

  /** Hook entry point. */
  function scheduleKnowledgeRefresh() {
    if (isDestroyed() || !knowledgeActive || knowledgeRefreshScheduled) return;
    knowledgeRefreshScheduled = true;
    onMicrotask(async () => {
      knowledgeRefreshScheduled = false;
      if (isDestroyed()) return;
      await refreshKnowledge({ force: true });
    });
  }

  /** Enter or leave the Knowledge surface. */
  async function setKnowledgeActive(active) {
    const next = active === true;
    knowledgeActive = next;
    if (!next) {
      clearCache();
      publishKnowledge();
      return false;
    }
    await refreshKnowledge({ force: true });
    return true;
  }

  /** Select a roster character. Pure re-publication — no seam read. */
  function selectKnowledgeActor(actorId) {
    knowledgeSelectedActorId = String(actorId || '');
    if (!knowledgeActive) return false;
    publishKnowledge();
    return true;
  }

  async function runKnowledgeMutation(call) {
    const result = (await call()) || {
      success: false,
      message: 'FABRICATE.Knowledge.Manage.Failed',
    };
    notifyKnowledgeResult(result);
    await refreshKnowledge({ force: true });
    return result;
  }

  /** Spend one charge of an owned recipe-item copy. */
  async function expendRecipeItemUse(actorId, itemId) {
    const copy = knowledgeRawOwnedCopy(actorId, itemId);
    return runKnowledgeMutation(() =>
      services.expendRecipeItemUse?.({
        actorId,
        itemId,
        definitionId: copy?.definitionId || '',
        systemId: get(selectedSystemId),
      })
    );
  }

  /** Delete one owned copy. */
  async function deleteOwnedRecipeItem(actorId, itemId) {
    const copy = knowledgeRawOwnedCopy(actorId, itemId);
    const quantity = Number(copy?.quantity) || 1;
    if (quantity > 1) {
      const confirmed = await services.confirmDialog?.({
        title: knowledgeText(
          'FABRICATE.Admin.Manager.Knowledge.DeleteStackTitle',
          'Delete the whole stack?'
        ),
        content: `<p>${knowledgeText(
          'FABRICATE.Admin.Manager.Knowledge.DeleteStackContent',
          'This copy is a stack of {quantity}. Deleting removes every unit, because uses and learns are tracked per document.',
          { quantity }
        )}</p>`,
        ...deleteConfirmButtons(),
      });
      if (!confirmed) return { success: false, cancelled: true };
    }
    return runKnowledgeMutation(() => services.deleteOwnedRecipeItem?.({ actorId, itemId }));
  }

  /**
   * Erase one learned recipe. Frees the learn budget but deliberately leaves discovery progress
   * intact — an erase is an un-learn, a reset is an amnesia.
   */
  async function eraseLearnedRecipe(actorId, recipeId) {
    return runKnowledgeMutation(() => services.eraseLearnedRecipe?.({ actorId, recipeId }));
  }

  async function confirmKnowledgeReset(titleKey, titleFallback, contentKey, contentFallback) {
    const note = knowledgeText(
      'FABRICATE.Admin.Manager.Knowledge.ResetDiscoveryNote',
      'Erasing a single memory leaves discovery progress intact; a reset also clears it.'
    );
    return services.confirmDialog?.({
      title: knowledgeText(titleKey, titleFallback),
      content: `<p>${knowledgeText(contentKey, contentFallback)}</p><p>${note}</p>`,
      // A reset erases learned knowledge but deletes no definition, so it names its own
      // verb rather than reusing the delete pair.
      yes: {
        label: knowledgeText('FABRICATE.Admin.Manager.Knowledge.ResetConfirm', 'Reset'),
        callback: () => true,
      },
      no: { callback: () => false },
    });
  }

  /** Reset this character's learned knowledge for the selected system. */
  async function resetActorSystemKnowledge(actorId) {
    const confirmed = await confirmKnowledgeReset(
      'FABRICATE.Admin.Manager.Knowledge.ResetSystemTitle',
      'Reset this system?',
      'FABRICATE.Admin.Manager.Knowledge.ResetSystemContent',
      'Clear every recipe this character has learned in the selected crafting system.'
    );
    if (!confirmed) return { success: false, cancelled: true };
    const systemId = get(selectedSystemId);
    return runKnowledgeMutation(() => services.resetActorKnowledge?.({ actorId, systemId }));
  }

  /** Reset this character's learned knowledge across every system. */
  async function resetActorAllKnowledge(actorId) {
    const confirmed = await confirmKnowledgeReset(
      'FABRICATE.Admin.Manager.Knowledge.ResetAllTitle',
      'Reset every system?',
      'FABRICATE.Admin.Manager.Knowledge.ResetAllContent',
      'Clear every recipe this character has learned across all crafting systems, including entries whose recipe no longer exists.'
    );
    if (!confirmed) return { success: false, cancelled: true };
    return runKnowledgeMutation(() => services.resetActorKnowledge?.({ actorId, systemId: null }));
  }

  /** Leave the surface: no scheduled work, no cache, and no further seam read. */
  function deactivate() {
    knowledgeRefreshScheduled = false;
    knowledgeActive = false;
    clearCache();
  }

  return {
    setKnowledgeActive,
    refreshKnowledge,
    scheduleKnowledgeRefresh,
    selectKnowledgeActor,
    expendRecipeItemUse,
    deleteOwnedRecipeItem,
    eraseLearnedRecipe,
    resetActorSystemKnowledge,
    resetActorAllKnowledge,
    clearCache,
    deactivate,
  };
}

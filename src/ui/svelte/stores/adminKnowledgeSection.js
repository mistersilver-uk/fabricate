/**
 * The GM Knowledge surface (issue 785), a section of `createAdminStore` (issue 1708). It owns its
 * snapshot cache and publishes out of band: a whole-world scan must never join `refresh()`.
 */
import { get } from 'svelte/store';

import {
  defaultKnowledgeTab,
  projectKnowledgeSnapshot,
} from '../apps/manager/knowledge/knowledgeStudio.js';

// Localized copy for the Knowledge surface's two heavyweight confirms. Every key is a static
// literal at its call site: an interpolated key is invisible to `ui-lang-keys-resolve` and
// `lang-keys-no-orphans`, so a missing message would ship silently.
function knowledgeText(services, key, fallback, data = null) {
  const localized = data ? services.localize?.(key, data) : services.localize?.(key);
  if (localized) return localized;
  if (!data) return fallback;
  return Object.entries(data).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    fallback
  );
}

function notifyKnowledgeResult(services, result) {
  const message = result?.message;
  if (!message) return;
  const text = services.localize?.(message, result?.messageData) || message;
  if (result?.success === true) services.notify?.info?.(text);
  else services.notify?.error?.(text);
}

async function confirmKnowledgeReset(
  services,
  titleKey,
  titleFallback,
  contentKey,
  contentFallback
) {
  const note = knowledgeText(
    services,
    'FABRICATE.Admin.Manager.Knowledge.ResetDiscoveryNote',
    'Erasing a single memory leaves discovery progress intact; a reset also clears it.'
  );
  return services.confirmDialog?.({
    title: knowledgeText(services, titleKey, titleFallback),
    content: `<p>${knowledgeText(services, contentKey, contentFallback)}</p><p>${note}</p>`,
    // A reset erases learned knowledge but deletes no definition, so it names its own
    // verb rather than reusing the delete pair.
    yes: {
      label: knowledgeText(services, 'FABRICATE.Admin.Manager.Knowledge.ResetConfirm', 'Reset'),
      callback: () => true,
    },
    no: { callback: () => false },
  });
}

/**
 * The supersession rule for snapshot reads (issue 1969). Every read begins a generation, and
 * entering, leaving or switching advances it, so only the latest read may settle the surface.
 */
export function createKnowledgeReadTracker() {
  let generation = 0;
  return {
    begin() {
      generation += 1;
      return generation;
    },
    advance() {
      generation += 1;
    },
    isCurrent: (candidate) => candidate === generation,
  };
}

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
  // Resolved once per surface entry from the definition count, and again on a system switch, never
  // as a live derivation: a GM authoring the first recipe item elsewhere would flip 0 -> 1 and yank
  // the open tab mid-task.
  let knowledgeDefaultTab = defaultKnowledgeTab(0);
  let knowledgeDefaultTabResolved = false;
  // Never both true. The projection masks both while a snapshot is held, so a re-read never blanks.
  let knowledgeLoading = false;
  let knowledgeError = false;
  const reads = createKnowledgeReadTracker();

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

  function publishKnowledge() {
    viewState.update((prev) => ({
      ...prev,
      knowledge: projectKnowledgeSnapshot(knowledgeSnapshot, {
        active: knowledgeActive,
        selectedActorId: knowledgeSelectedActorId,
        defaultTab: knowledgeDefaultTab,
        loading: knowledgeLoading,
        error: knowledgeError,
      }),
    }));
  }

  function clearCache() {
    knowledgeSnapshot = null;
    knowledgeDefaultTabResolved = false;
    knowledgeSelectedActorId = '';
    knowledgeLoading = false;
    knowledgeError = false;
  }

  // Keeps the world-scoped character; an open surface publishes the cleared, loading projection.
  function resetForSystemChange() {
    reads.advance();
    knowledgeSnapshot = null;
    knowledgeDefaultTabResolved = false;
    if (!knowledgeActive) return;
    knowledgeLoading = true;
    knowledgeError = false;
    publishKnowledge();
  }

  // Only the latest read of the still-selected system settles the surface; a superseded one
  // writes no cache, resolves no tab and moves neither flag. A rejection always propagates.
  async function readKnowledgeSnapshot() {
    const generation = reads.begin();
    const systemId = get(selectedSystemId);
    const isCurrent = () => reads.isCurrent(generation) && get(selectedSystemId) === systemId;
    let snapshot;
    try {
      snapshot = (await services.getKnowledgeSnapshot?.(systemId)) || null;
    } catch (error) {
      if (isCurrent()) {
        knowledgeLoading = false;
        knowledgeError = !knowledgeSnapshot;
        publishKnowledge();
      }
      throw error;
    }
    if (!isCurrent()) return false;
    knowledgeLoading = false;
    knowledgeError = false;
    knowledgeSnapshot = snapshot;
    if (!knowledgeDefaultTabResolved) {
      knowledgeDefaultTab = defaultKnowledgeTab(knowledgeSnapshot?.definitionCount || 0);
      knowledgeDefaultTabResolved = true;
    }
    return true;
  }

  /**
   * Re-read the Knowledge snapshot.
   *
   * @param {{force?: boolean}} [options] `force` re-reads the seam; otherwise a cached snapshot is
   * simply re-published.
   */
  async function refreshKnowledge({ force = false } = {}) {
    if (!knowledgeActive) return false;
    if ((force || !knowledgeSnapshot) && !(await readKnowledgeSnapshot())) return false;
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
    reads.advance();
    if (!next) {
      clearCache();
      publishKnowledge();
      return false;
    }
    knowledgeLoading = true;
    knowledgeError = false;
    publishKnowledge();
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
    notifyKnowledgeResult(services, result);
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
          services,
          'FABRICATE.Admin.Manager.Knowledge.DeleteStackTitle',
          'Delete the whole stack?'
        ),
        content: `<p>${knowledgeText(
          services,
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

  /** Reset this character's learned knowledge for the selected system. */
  async function resetActorSystemKnowledge(actorId) {
    // Read before the non-modal confirm: a switch while it is open must not retarget the reset.
    const systemId = get(selectedSystemId);
    const confirmed = await confirmKnowledgeReset(
      services,
      'FABRICATE.Admin.Manager.Knowledge.ResetSystemTitle',
      'Reset this system?',
      'FABRICATE.Admin.Manager.Knowledge.ResetSystemContent',
      'Clear every recipe this character has learned in the selected crafting system.'
    );
    if (!confirmed) return { success: false, cancelled: true };
    return runKnowledgeMutation(() => services.resetActorKnowledge?.({ actorId, systemId }));
  }

  /** Reset this character's learned knowledge across every system. */
  async function resetActorAllKnowledge(actorId) {
    const confirmed = await confirmKnowledgeReset(
      services,
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
    reads.advance();
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
    resetForSystemChange,
    deactivate,
  };
}

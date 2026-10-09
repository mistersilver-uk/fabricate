/**
 * The orphan prune an overwriting import runs (issue 775): each persisted recipe of the system
 * absent from the payload is deleted when stamped by THIS pack, and otherwise kept and reported
 * (`unprovenanced`, `foreignProvenance`, or `activeRuns` while a begun run holds it). Absence is
 * judged against EVERY payload id, so a recipe whose overwrite threw is never pruned.
 */

/** A leaf delete: the importer persists the batch once and runs its own flag cleanup after. */
const PRUNE_DELETE_OPTIONS = {
  notify: false,
  emitChange: false,
  persist: false,
  cleanupFlags: false,
};

/**
 * Prune `system`'s orphaned recipes through `recipeManager`, sparing `heldRecipeIds`, and record
 * each candidate's disposition on the import `summary`.
 */
export async function pruneOrphanedRecipes(
  { recipeManager, heldRecipeIds },
  { system, recipesData, packSystemId, summary }
) {
  const payloadIds = new Set(
    recipesData.map((recipeData) => recipeData?.id).filter((id) => id != null)
  );
  const persistedRecipes = recipeManager.getRecipes?.({ craftingSystemId: system.id }) ?? [];
  const orphanCandidates = persistedRecipes.filter((recipe) => !payloadIds.has(recipe.id));
  const heldByRuns = new Set(heldRecipeIds);

  for (const orphan of orphanCandidates) {
    const reason = orphanDispositionReason(orphan, packSystemId, heldByRuns);
    const pruned = reason === 'provenanceMatched';
    if (pruned) {
      await recipeManager.deleteRecipe(orphan.id, { ...PRUNE_DELETE_OPTIONS });
      summary.recipes.pruned++;
    }
    summary.orphans.push({
      recipeId: orphan.id,
      recipeName: orphan.name || orphan.id,
      disposition: pruned ? 'pruned' : 'reported',
      reason,
    });
  }
}

/** Why an orphan is kept and reported, or `provenanceMatched` when this pack may prune it. */
function orphanDispositionReason(orphan, packSystemId, heldByRuns) {
  const provenanceSystemId = orphan.importSource?.systemId ?? null;
  if (provenanceSystemId == null) return 'unprovenanced';
  if (provenanceSystemId !== packSystemId) return 'foreignProvenance';
  return heldByRuns.has(String(orphan.id)) ? 'activeRuns' : 'provenanceMatched';
}

/** A system's resolved visibility mode, and whether a learned entry can become visible (issue 1289);
 *  import-free, so the recipe editor reads what `RecipeVisibilityService` delegates to (1773). */

export const VISIBILITY_MODES = Object.freeze(['global', 'restricted', 'item', 'knowledge']);

/** The flat mode (issue 511), else one derived from legacy `recipeVisibility`; legacy teaser wins. */
export function resolveVisibilityMode(system) {
  if (system?.recipeVisibility?.listMode === 'teaser') return 'teaser';

  const mode = system?.visibilityMode;
  if (VISIBILITY_MODES.includes(mode)) return mode;

  const listMode = system?.recipeVisibility?.listMode;
  if (listMode === 'player') return 'restricted';
  if (listMode === 'knowledge') {
    const knowledgeMode = system?.recipeVisibility?.knowledge?.mode || 'itemOrLearned';
    return knowledgeMode === 'item' ? 'item' : 'knowledge';
  }
  return 'global';
}

/** Whether a reveal path reads `learnedRecipes`, mirroring `evaluateRecipeAccess`'s reveal switch
 *  arm by arm (change both); alchemy's brew-discovery union reveals under every mode. */
export function isLearnedKnowledgeObservable(system) {
  if (system?.resolutionMode === 'alchemy') {
    if (system?.alchemy?.learnOnCraft === true) return true;
    const mode = resolveVisibilityMode(system);
    return mode !== 'restricted' && mode !== 'item';
  }
  return resolveVisibilityMode(system) === 'knowledge';
}

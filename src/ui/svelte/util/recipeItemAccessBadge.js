// Shared, dependency-free derivation of a recipe item's "access" badge — the single
// source of truth so the GM "How players see it" preview (RecipeItemEditor) and the
// player Inventory book detail (InventoryDetail, via InventoryListingBuilder) show an
// IDENTICAL badge under every mode/cap combination.
//
// Kept import-free so a mounted-component test harness can copy it as a raw module
// without pulling a transitive dependency graph (which would hang the mounted tests).

/**
 * @param {object} input
 * @param {'item'|'knowledge'} input.mode Visibility mode the book grants access under.
 * @param {object} [input.item] The definition's `caps.item` (`{ limitUses, maxUses }`).
 * @param {object} [input.learn] The definition's `caps.learn` (`{ limitLearning, learnsAllowed, learnScope, learningMode }`).
 * @param {(key: string, fallback: string, data?: {n?: number|string}) => string} t
 *   Translate seam — each caller localizes in its own idiom, so the SHAPE (which badge,
 *   which icon/tone) is shared while wording follows the caller's i18n.
 * @returns {{ label: string, icon: string, tone: 'warning'|'info'|'success' }}
 */
export function recipeItemAccessBadge({ mode, item = {}, learn = {} } = {}, t) {
  const N = 'FABRICATE.Admin.Manager.RecipeItem.Preview.';

  if (mode === 'item') {
    const limitUses = item?.limitUses === true;
    const maxUses = Number.isFinite(item?.maxUses) ? item.maxUses : 1;
    if (!limitUses) {
      return { label: t(`${N}RereadAnytime`, 'Reread anytime'), icon: 'fas fa-infinity', tone: 'info' };
    }
    return maxUses === 1
      ? { label: t(`${N}SingleUse`, 'Single use'), icon: 'fas fa-fire-flame-curved', tone: 'warning' }
      : { label: t(`${N}NUses`, '{n} uses', { n: maxUses }), icon: 'fas fa-fire-flame-curved', tone: 'warning' };
  }

  const limitLearning = learn?.limitLearning === true;
  if (!limitLearning) {
    return { label: t(`${N}LearnFreely`, 'Learn freely'), icon: 'fas fa-graduation-cap', tone: 'success' };
  }
  const learnsAllowed =
    Number.isFinite(learn?.learnsAllowed) && learn.learnsAllowed > 0 ? learn.learnsAllowed : 1;
  const learnScope = ['perInstance', 'total'].includes(learn?.learnScope)
    ? learn.learnScope
    : learn?.learningMode === 'party'
      ? 'total'
      : 'perInstance';
  return learnScope === 'total'
    ? { label: t(`${N}LearnUpToTotal`, 'Learn up to {n} total', { n: learnsAllowed }), icon: 'fas fa-graduation-cap', tone: 'warning' }
    : { label: t(`${N}LearnUpToPerCopy`, 'Learn up to {n} per copy', { n: learnsAllowed }), icon: 'fas fa-graduation-cap', tone: 'warning' };
}

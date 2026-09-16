// The ONE derivation of a recipe item's access badge, so the GM "How players see it" preview and
// the player Inventory book detail cannot differ under any mode/cap combination. `t` is a seam, not
// an import: the SHAPE is shared while each caller localizes in its own idiom. Import-free, so a
// mounted harness can copy it as a raw module rather than pulling a graph that would hang.
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

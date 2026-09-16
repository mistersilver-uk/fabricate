/**
 * Cumulative progressive stage thresholds (issue 651): the "reached at ≥N" number a player needs,
 * derived from the same inputs the award loop spends. NOT a running sum — that is correct only for
 * `awardMode: 'equal'`, and `exceed`, `partial` and a skipped invalid cost each break it — so this
 * takes `awardMode` plus the caller's real `costFor` and is pinned by an oracle test against
 * {@link ../utils/progressiveAward.js resolveProgressiveAward} itself. A stage with an invalid cost
 * has no threshold and returns `null`. Thresholds are minimum INTEGER budgets. Import-free.
 */
export function progressiveStageThresholds({ results, costFor, awardMode = 'equal' }) {
  const ordered = Array.isArray(results) ? results : [];
  const thresholds = [];
  // Sum of the VALID costs before the current stage.
  let spentBefore = 0;

  for (const result of ordered) {
    const cost = costFor(result);

    if (!Number.isFinite(cost) || cost < 1) {
      // Skipped by the loop: no budget reaches it, ever.
      thresholds.push(null);
      continue;
    }

    const spentThrough = spentBefore + cost;

    if (awardMode === 'exceed') {
      // Awarded while `remaining > cost`, so the budget must strictly exceed the cumulative cost
      // THROUGH this stage.
      thresholds.push(Math.floor(spentThrough) + 1);
    } else if (awardMode === 'partial') {
      // Awarded either in full (`N >= spentThrough`) or as the single tail result (`remaining > 0`,
      // i.e.
      thresholds.push(Math.floor(spentBefore) + 1);
    } else {
      // equal (default): awarded while `remaining >= cost`.
      thresholds.push(Math.ceil(spentThrough));
    }

    spentBefore = spentThrough;
  }

  return thresholds;
}

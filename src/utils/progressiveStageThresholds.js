/**
 * Cumulative progressive stage thresholds (issue 651) — the "reached at ≥N" number a
 * player needs to decide an order, derived from the SAME inputs the award loop spends.
 *
 * WHY A SHARED HELPER, AND WHY IT IS NOT A RUNNING SUM.
 *
 * The obvious implementation — a running sum of difficulties — is correct ONLY for
 * `awardMode: 'equal'`. {@link ../utils/progressiveAward.js resolveProgressiveAward}
 * diverges three ways, and each divergence makes a naive sum silently wrong:
 *
 *  - **`exceed`** gates on `remaining > cost` — STRICT. The threshold is one higher than
 *    the sum at every stage, and the error compounds down the list.
 *  - **`partial`** awards a tail result whenever `remaining > 0`, so the final reachable
 *    stage is reached BELOW its cumulative sum (a naive "≥14" badge on a stage the player
 *    actually gets at 9).
 *  - **`invalidCost: 'skip'`** (crafting AND salvage) `continue`s past a result whose cost
 *    is non-finite or `< 1`: it consumes NO budget and is NEVER awarded. A row showing a
 *    difficulty badge and advancing the running total is wrong twice.
 *
 * Presentation must not re-derive the award loop's arithmetic from the same concept in
 * different code — that is the source-of-truth mismatch this whole issue exists to end.
 * So this helper takes `awardMode` + `costFor` (the caller's real difficulty lookup) and
 * is pinned by an ORACLE TEST against `resolveProgressiveAward` itself: for every mode and
 * every budget, the last stage this helper claims is reached at ≥N must equal the last
 * stage the loop actually awards at N.
 *
 * DEFINEDNESS. A stage whose cost is invalid (`skip`ped by the loop) is NEVER awarded at
 * any budget, so it has no threshold: this returns `null` and the row must OMIT the badge
 * rather than show a wrong number.
 *
 * INTEGER BUDGETS. A threshold is the minimum INTEGER budget at which the loop awards the
 * stage — check values are roll totals. The `ceil`/`floor` forms below are correct for
 * fractional costs too (`_getDifficulty` does not truncate), where a strict `>` bound has
 * no minimum in the reals but does in the integers.
 *
 * This module is deliberately IMPORT-FREE, like `progressiveResultOrder.js`.
 *
 * @param {object} options
 * @param {Array<object>} options.results ordered results, in the order they will be spent
 * @param {(result: object) => number} options.costFor the CALLER'S difficulty lookup —
 *   must be the same one the engine feeds `resolveProgressiveAward`, or this agrees with
 *   the oracle while diverging from production
 * @param {'equal'|'exceed'|'partial'} [options.awardMode='equal']
 * @returns {Array<number|null>} per-result minimum integer budget, or null when the stage
 *   is unreachable at any budget (an invalid cost)
 */
export function progressiveStageThresholds({ results, costFor, awardMode = 'equal' }) {
  const ordered = Array.isArray(results) ? results : [];
  const thresholds = [];
  // Sum of the VALID costs before the current stage. A skipped stage consumes no budget,
  // so it must not advance this — that is divergence 3 above.
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
      // Awarded while `remaining > cost`, so the budget must strictly exceed the
      // cumulative cost THROUGH this stage.
      thresholds.push(Math.floor(spentThrough) + 1);
    } else if (awardMode === 'partial') {
      // Awarded either in full (`N >= spentThrough`) or as the single tail result
      // (`remaining > 0`, i.e. `N > spentBefore`). The union simplifies to
      // `N > spentBefore` — reachable BELOW its own cumulative sum.
      thresholds.push(Math.floor(spentBefore) + 1);
    } else {
      // equal (default): awarded while `remaining >= cost`.
      thresholds.push(Math.ceil(spentThrough));
    }

    spentBefore = spentThrough;
  }

  return thresholds;
}

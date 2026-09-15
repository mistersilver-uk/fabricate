/**
 * The shared progressive-award loop for crafting, salvage and gathering: spend a caller-normalized
 * numeric budget against an ordered result list under the three modes of the resolution-modes
 * requirement "Award Modes", and report why it stopped per "Award Loop Reporting". Only the loop
 * lives here; two caller divergences stay observable as options — `invalidCost` (`skip` vs `fail`)
 * and `zeroRemainingOnPartial` — while value seeding and the return wrapper stay in the callers.
 */
export function resolveProgressiveAward({
  results,
  initialRemaining,
  costFor,
  awardMode = 'equal',
  invalidCost = 'skip',
  zeroRemainingOnPartial = true,
}) {
  const ordered = Array.isArray(results) ? results : [];
  // One pass, so an invalid cost AFTER the loop's `break` is still classified.
  const costs = ordered.map((result) => costFor(result));
  const skippedResults = ordered.filter((_, index) => !isSpendableCost(costs[index]));
  const awarded = [];
  let partialResult = null;
  let haltedResult = null;
  let remaining = initialRemaining;

  for (const [index, result] of ordered.entries()) {
    const cost = costs[index];
    if (!isSpendableCost(cost)) {
      if (invalidCost === 'fail') {
        return {
          awarded,
          remaining,
          partialResult,
          haltedResult,
          skippedResults,
          invalidResultId: result?.id,
        };
      }
      continue;
    }

    if (awardMode === 'exceed') {
      if (remaining > cost) {
        awarded.push(result);
        remaining -= cost;
        continue;
      }
      haltedResult = result;
      break;
    }

    if (awardMode === 'partial') {
      if (remaining >= cost) {
        awarded.push(result);
        remaining -= cost;
        continue;
      }
      if (remaining > 0) {
        awarded.push(result);
        partialResult = result;
        if (zeroRemainingOnPartial) remaining = 0;
      } else {
        // The budget hit zero exactly (or started at/below it): nothing to award short, so this
        // stage halted the loop instead of becoming a partial tail.
        haltedResult = result;
      }
      break;
    }

    // equal (default)
    if (remaining >= cost) {
      awarded.push(result);
      remaining -= cost;
      continue;
    }
    haltedResult = result;
    break;
  }

  return { awarded, remaining, partialResult, haltedResult, skippedResults };
}

/** A cost the loop can actually spend against: finite and at least 1. */
function isSpendableCost(cost) {
  return Number.isFinite(cost) && cost >= 1;
}

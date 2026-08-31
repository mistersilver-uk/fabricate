/**
 * Shared progressive-award loop for crafting, salvage, and gathering resolution.
 *
 * Progressive resolution spends a numeric check `value` (the caller-supplied
 * `initialRemaining` budget) against an ordered list of results, each costing
 * its component's difficulty, under one of three award modes:
 *
 *  - `exceed`  — award a result only while the budget STRICTLY exceeds its cost
 *                (`remaining > cost`); stop at the first result it cannot exceed.
 *  - `partial` — award full results while `remaining >= cost`; on the first result
 *                the budget cannot fully cover, award ONE partial tail result iff
 *                `remaining > 0`, then stop.
 *  - `equal`   — award full results while `remaining >= cost`; stop at the first
 *                result the budget cannot cover (the default).
 *
 * This util owns ONLY the loop. Three behavioural divergences across the callers
 * are preserved here and stay observable through the options; the rest live in
 * the callers (see {@link ../systems/ResolutionModeService.js},
 * {@link ../systems/CraftingEngine.js} salvage, and
 * {@link ../systems/GatheringEngine.js} `resolveProgressiveAward`):
 *
 *  1. **Cost-validation** (`invalidCost`) — a result whose `costFor(result)` is
 *     non-finite or `< 1` is either SKIPPED (`'skip'`: salvage & crafting
 *     `continue`) or treated as a hard failure (`'fail'`: gathering returns
 *     `invalidResultId` so the caller can raise its misconfiguration). The util
 *     never throws and never builds a misconfiguration shape itself.
 *  2. **Partial-remaining** (`zeroRemainingOnPartial`) — after the `partial` tail
 *     award, crafting & gathering ZERO the returned `remaining` (`true`); salvage
 *     leaves it POSITIVE (`false`). This divergence is latent/unobservable today
 *     through salvage's public surface (its return shape never exposes `remaining`
 *     and its loop `break`s right after the partial award), so the salvage flag's
 *     only observable guard is `tests/progressive-award.test.js`. Issue #431 owns
 *     any reconciliation of this and the awarded-nothing failure-mode policy.
 *
 * Two further divergences stay ENTIRELY in the callers and are NOT options here:
 *
 *  3. **Status / return-shape** — each caller wraps `{ awarded, remaining }` in
 *     its own shape (`{status, resultGroups, checkResult}`, `[{...group, results}]`,
 *     or `{groups, meta}`).
 *  4. **Value seeding/normalization** — each caller computes `initialRemaining`
 *     ALREADY normalized: gathering runs its own `Number.isFinite` check (raising
 *     `MALFORMED_CHECK_RESULT` before ever calling this util) and clamps
 *     `Math.max(0, value)`; crafting & salvage pass `Number(value || 0)`
 *     (non-finite → 0, no negative clamp). The util is value-agnostic.
 *
 * STAGE CLASSIFICATION (issue 1286). The loop is the only place that knows WHY it
 * stopped, so it reports that rather than leaving callers to re-derive it. The
 * ordered list partitions into five buckets, and the three additive return fields
 * are what a consumer needs to name them:
 *
 *  - `full`      — in `awarded` and NOT `partialResult`.
 *  - `partial`   — `partialResult`, the `partial`-mode tail award. It IS A MEMBER
 *                  of `awarded` (`full = awarded \ {partialResult}`), because the
 *                  tail is awarded like any other entry; a consumer reading "full =
 *                  every member of awarded" would classify a partial-only component
 *                  as both awarded and partial.
 *  - `halted`    — `haltedResult`, the ONE stage that stopped the loop and was NOT
 *                  awarded. A partial tail and a halt are MUTUALLY EXCLUSIVE: the
 *                  `partial` branch awards the tail and only THEN breaks, so that
 *                  mode halts only when the budget hit zero (or started at/below it).
 *  - `unreached` — every stage after the halt; not reported, it is the remainder.
 *  - `skipped`   — `skippedResults`, every invalid cost in the WHOLE ordered list
 *                  rather than the prefix the loop visited before its `break`, so a
 *                  misconfigured stage sitting AFTER the halt is still `skipped` and
 *                  never mistaken for `unreached`. That is why the costs are resolved
 *                  in one pass up front: `costFor` is a pure difficulty lookup in
 *                  every caller and is still invoked exactly ONCE per result.
 *
 * These three fields are purely ADDITIVE — `awarded`, `remaining` and
 * `invalidResultId` are byte-for-byte what they were, and the existing callers
 * destructure only those. Under `invalidCost: 'fail'` the early return carries the
 * same fields: `haltedResult` stays `null` because an aborted loop is a
 * misconfiguration and not a budget halt, and `skippedResults` still reports the
 * whole list's invalid costs as a fact about the input.
 *
 * @template TResult
 * @param {object} options
 * @param {Array<TResult>} options.results ordered results to award against
 * @param {number} options.initialRemaining caller-normalized starting budget
 * @param {(result: TResult) => number} options.costFor difficulty lookup for a result
 * @param {'equal'|'exceed'|'partial'} [options.awardMode='equal'] award mode
 * @param {'skip'|'fail'} [options.invalidCost='skip'] policy for an invalid cost
 * @param {boolean} [options.zeroRemainingOnPartial=true] zero `remaining` after a
 *   `partial` tail award
 * @returns {{awarded: Array<TResult>, remaining: number, partialResult: TResult|null,
 *   haltedResult: TResult|null, skippedResults: Array<TResult>, invalidResultId?: string}}
 *   `awarded` in order; `remaining` is the leftover budget; `invalidResultId` is
 *   present (and the loop short-circuits) only when `invalidCost: 'fail'` hit an
 *   invalid cost — the caller raises its own misconfiguration from it. See the
 *   stage classification above for `partialResult`, `haltedResult` and
 *   `skippedResults`.
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
        // The budget hit zero exactly (or started at/below it): nothing to award
        // short, so this stage halted the loop instead of becoming a partial tail.
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

/**
 * A cost the loop can actually spend against: finite and at least 1. Anything
 * else is the `invalidCost` case — `skip`ped (and reported in `skippedResults`)
 * or a hard failure, depending on the caller's policy.
 *
 * @param {number} cost Resolved `costFor` value.
 * @returns {boolean} `true` when the loop may charge this cost.
 */
function isSpendableCost(cost) {
  return Number.isFinite(cost) && cost >= 1;
}

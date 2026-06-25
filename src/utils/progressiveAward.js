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
 * @template TResult
 * @param {object} options
 * @param {Array<TResult>} options.results ordered results to award against
 * @param {number} options.initialRemaining caller-normalized starting budget
 * @param {(result: TResult) => number} options.costFor difficulty lookup for a result
 * @param {'equal'|'exceed'|'partial'} [options.awardMode='equal'] award mode
 * @param {'skip'|'fail'} [options.invalidCost='skip'] policy for an invalid cost
 * @param {boolean} [options.zeroRemainingOnPartial=true] zero `remaining` after a
 *   `partial` tail award
 * @returns {{awarded: Array<TResult>, remaining: number, invalidResultId?: string}}
 *   `awarded` in order; `remaining` is the leftover budget; `invalidResultId` is
 *   present (and the loop short-circuits) only when `invalidCost: 'fail'` hit an
 *   invalid cost — the caller raises its own misconfiguration from it.
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
  const awarded = [];
  let remaining = initialRemaining;

  for (const result of ordered) {
    const cost = costFor(result);
    if (!Number.isFinite(cost) || cost < 1) {
      if (invalidCost === 'fail') {
        return { awarded, remaining, invalidResultId: result?.id };
      }
      continue;
    }

    if (awardMode === 'exceed') {
      if (remaining > cost) {
        awarded.push(result);
        remaining -= cost;
        continue;
      }
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
        if (zeroRemainingOnPartial) remaining = 0;
      }
      break;
    }

    // equal (default)
    if (remaining >= cost) {
      awarded.push(result);
      remaining -= cost;
      continue;
    }
    break;
  }

  return { awarded, remaining };
}

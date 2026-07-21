/**
 * Progressive result ordering (issue 651) — pure reconciliation of a player's stored
 * stage order against the GM's authored result list.
 *
 * Progressive resolution spends a check roll DOWN an ordered list of result stages, so
 * the order decides what the player actually gets. `resolveProgressiveAward` orders
 * nothing by contract — the caller owns order — so this module is where a player's
 * preference meets the authored list.
 *
 * This module is deliberately IMPORT-FREE. It is loaded raw by the mounted-component
 * test harness, and a transitive import would have to be copied into every harness
 * allowlist that reaches it — an omission there HANGS the mounted suites (reported as
 * `# cancelled`, never `# fail`) rather than failing loudly. Keep it a leaf.
 */

/**
 * Build the settings key a player's stored order lives under.
 *
 * Keys are namespaced by scope because recipe ids and component ids are drawn from
 * different id spaces and can collide. One key per recipe (not per step). The salvage
 * caller passes a composite `<systemId>:<componentId>` id (issue 766), because component
 * ids are not globally unique across systems; the store's write and the engine's capture
 * must pass the identical id or the captured order silently reads empty.
 *
 * @param {{ scope: 'recipe'|'salvage', id: string }} entry
 * @returns {string|null} `recipe:<recipeId>` / `salvage:<systemId>:<componentId>`, or null when unusable
 */
export function progressiveOrderKey({ scope, id } = {}) {
  if (scope !== 'recipe' && scope !== 'salvage') return null;
  if (typeof id !== 'string' || id.trim() === '') return null;
  return `${scope}:${id}`;
}

/**
 * Reconcile an authored result list against a player's preferred order of result ids.
 *
 * Contract (issue 651 D5) — every clause exists to prevent a specific silent failure:
 *
 * - **Never drops a result.** `out.length === results.length` ALWAYS. The award loop
 *   spends budget down the list, so dropping a result silently denies a player an award
 *   they were entitled to.
 * - **Tail-appends the remainder in authored order.** Chosen over in-place insertion so
 *   an unranked stage can NEVER displace a ranked one: a GM adding a stage cannot
 *   silently demote a player's ranked stage; the new stage is awarded only if budget
 *   remains.
 * - **An id-less result is never reorderable** and always retains authored order (it
 *   matches nothing and tail-appends). Safe, but stated because it is otherwise
 *   invisible.
 * - **Duplicate ids: first match wins.** The second copy tail-appends rather than
 *   vanishing or doubling.
 * - **Elements are `===`-identical to the inputs** (no cloning). Downstream `costFor`
 *   and the `{ ...result, quantity: 1 }` spread depend on it.
 * - **A null/empty order returns the input BY IDENTITY**, so an unwired caller behaves
 *   exactly as it did before.
 *
 * @param {Array<object>} results - the GM's authored result list
 * @param {Array<string>} orderedIds - the player's preferred result ids
 * @returns {Array<object>} the reconciled list
 */
export function applyPlayerResultOrder(results, orderedIds) {
  if (!Array.isArray(results)) return results;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return results;

  const remaining = [...results];
  const out = [];

  for (const id of orderedIds) {
    // A non-string entry can never be a result id. Guarding here (rather than trusting
    // the stored value) is what stops index-shaped junk like [0, 1] from matching a
    // result whose `id` is undefined.
    if (typeof id !== 'string') continue;
    const index = remaining.findIndex((result) => result?.id === id);
    if (index === -1) continue;
    out.push(remaining[index]);
    remaining.splice(index, 1);
  }

  // Whatever the order did not name keeps its authored sequence, behind everything it did.
  out.push(...remaining);
  return out;
}

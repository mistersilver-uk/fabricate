/**
 * Progressive result ordering (issue 651) — pure reconciliation of a player's stored stage order
 * against the GM's authored result list.
 */

/** Build the settings key a player's stored order lives under. */
export function progressiveOrderKey({ scope, id } = {}) {
  if (scope !== 'recipe' && scope !== 'salvage') return null;
  if (typeof id !== 'string' || id.trim() === '') return null;
  return `${scope}:${id}`;
}

/** Reconcile an authored result list against a player's preferred order of result ids. */
export function applyPlayerResultOrder(results, orderedIds) {
  if (!Array.isArray(results)) return results;
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return results;

  const remaining = [...results];
  const out = [];

  for (const id of orderedIds) {
    // A non-string entry can never be a result id.
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

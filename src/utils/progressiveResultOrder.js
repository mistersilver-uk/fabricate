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

/**
 * Whether a rendered stage order actually differs from the GM's authored one.
 *
 * Neither `allowPlayerResultReorder` nor "a stored order exists": the permission says a player
 * may arrange the list, and a stored order can name the authored sequence exactly (dragged away
 * and back, or re-authored into it). `applyPlayerResultOrder` returns its input by identity only
 * for a null/empty order, so the comparison is positional and by id.
 */
export function orderDiffersFromAuthored(ordered, authored) {
  return (
    ordered.length === authored.length &&
    ordered.some((stage, index) => stage?.id !== authored[index]?.id)
  );
}

/** One subject's stored order within an order map, or null when it has none. */
export function storedOrderFor({ scope, id, orders } = {}) {
  const key = progressiveOrderKey({ scope, id });
  return key ? (orders?.[key] ?? null) : null;
}

/**
 * One subject's stage list as the run will spend it, plus whether that order is the player's.
 *
 * A pinned list (`allowPlayerResultReorder: false`) is the GM's by construction, so it
 * short-circuits: reconciling it would be the same list back, and reporting it as the player's
 * would be a lie the permission itself refutes.
 *
 * @returns {{stages: Array<object>, orderIsPlayers: boolean}}
 */
export function playerStageOrder(subject, storedOrder) {
  const stages = Array.isArray(subject?.stages) ? subject.stages : [];
  if (stages.length === 0 || subject?.allowPlayerResultReorder === false) {
    return { stages, orderIsPlayers: false };
  }
  const ordered = applyPlayerResultOrder(stages, storedOrder);
  return { stages: ordered, orderIsPlayers: orderDiffersFromAuthored(ordered, stages) };
}

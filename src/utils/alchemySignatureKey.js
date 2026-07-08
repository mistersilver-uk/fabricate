/**
 * Canonical alchemy signature key for the tried-dead-end memory.
 *
 * A "bench" is a plain-component multiset: a `{ [componentId: string]: number }`
 * map of how many units of each component sit on the workbench (a concrete
 * submitted multiset). The key is the `componentId:qty|...` join of every entry
 * with a positive quantity, sorted by component id, so an identical multiset
 * always produces the identical key regardless of insertion order.
 *
 * This flat key is correct ONLY for the dead-end memory (a concrete submitted
 * multiset). It is NOT a faithful match key for a learned recipe's structured
 * signature (alternatives / tags / essences / multiple ingredient sets) — mode
 * detection compares a bench against the structured signature summary, never
 * this key.
 *
 * Extracted as the SINGLE shared helper used by the engine dead-end write, the
 * builder fizzle-key projection, and the store mode helper, to prevent drift.
 *
 * @param {Record<string, number>} multiset componentId -> unit count
 * @returns {string} canonical `componentId:qty|...` key ('' for an empty bench)
 */
export function canonicalSignatureKey(multiset) {
  if (!multiset || typeof multiset !== 'object') return '';
  const entries = [];
  for (const [componentId, qty] of Object.entries(multiset)) {
    const count = Number(qty);
    if (!componentId || !Number.isFinite(count) || count <= 0) continue;
    entries.push([componentId, Math.trunc(count)]);
  }
  entries.sort((left, right) => {
    if (left[0] < right[0]) return -1;
    if (left[0] > right[0]) return 1;
    return 0;
  });
  return entries.map(([componentId, count]) => `${componentId}:${count}`).join('|');
}

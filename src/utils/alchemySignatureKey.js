/** Canonical alchemy signature key for the tried-dead-end memory. */
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

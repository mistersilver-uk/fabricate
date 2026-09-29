/** Deterministic ordering and tallying shared by the ratchets and the tests that sort their output. */

/**
 * Tally observed keys.
 *
 * @returns {Map<string, number>} key to count, insertion-ordered.
 */
export function tallyByKey(items, keyOf) {
  const counts = new Map();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Order two strings by code point.
 *
 * @returns {number} negative, zero or positive, per the `Array#sort` contract
 */
export function byCodePoint(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

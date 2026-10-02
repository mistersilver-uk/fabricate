/** Deterministic ordering shared by the ratchets and the tests that sort their output. */

/**
 * Order two strings by code point.
 *
 * @returns {number} negative, zero or positive, per the `Array#sort` contract
 */
export function byCodePoint(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

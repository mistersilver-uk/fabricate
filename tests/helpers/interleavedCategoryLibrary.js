/**
 * Round-robin the categories in `plan` (`[category, count][]`) into one flat category order (issue
 * 801).
 *
 * @param {[string, number][]} plan category → how many rows it holds.
 * @returns {string[]} the category of each row, in interleaved order.
 */
export function buildInterleavedCategoryOrder(plan) {
  const buckets = plan.map(([category, count]) => Array.from({ length: count }, () => category));
  const order = [];
  let remaining = plan.reduce((sum, [, count]) => sum + count, 0);
  const cursor = buckets.map(() => 0);
  while (remaining > 0) {
    for (const [bucketIndex, bucket] of buckets.entries()) {
      if (cursor[bucketIndex] < bucket.length) {
        order.push(bucket[cursor[bucketIndex]]);
        cursor[bucketIndex] += 1;
        remaining -= 1;
      }
    }
  }
  return order;
}

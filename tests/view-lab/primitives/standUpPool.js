/** Bounds how many specimens are stood up at once so Chromium does not refuse their requests. */

/**
 * How many specimens load at once. Each fetches dozens of modules, and standing up the whole
 * catalogue together makes Chromium refuse hundreds with `net::ERR_INSUFFICIENT_RESOURCES`.
 */
export const STAND_UP_POOL_SIZE = 12;

/**
 * Run `task` over every item with at most `size` in flight, draining one shared queue.
 *
 * @template T
 * @param {T[]} items The work, taken in order.
 * @param {(item: T) => Promise<void>} task Settles one item.
 * @param {number} [size] The most tasks in flight.
 * @returns {Promise<void>} Resolves once every item has settled.
 */
export async function runBounded(items, task, size = STAND_UP_POOL_SIZE) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}

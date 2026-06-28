// Shared helpers for run-history retention-limit boundary tests
// (spec 005 §"Run-History Retention"). Used by both the crafting and salvage
// run-manager suites so the "insert N terminal runs" loop and the
// cap + most-recent-first assertions live in exactly one place.

export const RETENTION_LIMIT = 50;

/**
 * Drive `count` terminal runs through a manager's real terminal API.
 *
 * @param {number} count How many terminal runs to insert.
 * @param {(index: number) => Promise<string>} insertOne Inserts a single
 *   terminal run via the production API and resolves to its run id.
 * @returns {Promise<string[]>} Inserted run ids in insertion order
 *   (oldest first), so callers can assert truncation and ordering.
 */
export async function insertTerminalRuns(count, insertOne) {
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    // Sequential on purpose: each insert mutates the same actor flag container.
    // eslint-disable-next-line no-await-in-loop
    ids.push(await insertOne(i));
  }
  return ids;
}

/**
 * Assert a history array is capped at the retention limit, has discarded the
 * oldest entries when over the limit, and is ordered most-recent-first.
 *
 * @param {import('node:assert/strict')} assert The strict assert module.
 * @param {Array<{ id: string }>} history The persisted history (most-recent-first).
 * @param {string[]} insertedIds Run ids in insertion order (oldest first).
 * @param {number} [limit=RETENTION_LIMIT] The retention cap.
 */
export function assertCappedMostRecentFirst(assert, history, insertedIds, limit = RETENTION_LIMIT) {
  assert.equal(history.length, Math.min(insertedIds.length, limit));
  // Most-recent-first: the newest `limit` inserts survive, newest at index 0.
  const expected = insertedIds.slice(-limit).reverse();
  assert.deepEqual(
    history.map((run) => run.id),
    expected
  );
}

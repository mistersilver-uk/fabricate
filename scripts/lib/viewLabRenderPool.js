/**
 * The View Lab capture's bounded render pool, as pure functions. Cases render concurrently, so
 * nothing that decides an outcome may depend on which render finishes first: results come back in
 * selection order, and the distinct-evidence check runs over them afterwards, in that order.
 */

/** Above this, pages contend for the same cores and a capture gets slower rather than faster. */
export const MAX_RENDER_CONCURRENCY = 8;

/**
 * @param {string|undefined} raw `VIEW_LAB_CONCURRENCY`, as the environment supplies it.
 * @param {number} cores The machine's available parallelism.
 * @returns {number} How many cases may render at once.
 */
export function resolveRenderConcurrency(raw, cores) {
  const text = String(raw ?? '').trim();
  if (text === '') return Math.min(Math.max(1, cores), MAX_RENDER_CONCURRENCY);
  if (!/^\d+$/.test(text) || Number(text) < 1) {
    throw new Error(`VIEW_LAB_CONCURRENCY must be a positive whole number, got "${raw}"`);
  }
  return Math.min(Number(text), MAX_RENDER_CONCURRENCY);
}

/**
 * Run `worker` over every item with at most `concurrency` in flight.
 *
 * @template T, R
 * @param {T[]} items The work, in the order its results must keep.
 * @param {number} concurrency The bound.
 * @param {(item: T, index: number) => Promise<R>} worker Settles, rather than rejects, per item.
 * @returns {Promise<R[]>} One result per item, in input order.
 */
export async function mapInPool(items, concurrency, worker) {
  const results = Array.from({ length: items.length });
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, lane));
  return results;
}

/**
 * Fail every frame byte-identical to an earlier accepted frame of its `distinctEvidenceGroup`.
 *
 * @param {object[]} cases The selection, in order.
 * @param {Array<{buffer?: Buffer|null, error?: string}>} outcomes One per case, in the same order.
 * @returns {object[]} The outcomes, a duplicate replaced by an `{error}` naming its witness.
 */
export function rejectDuplicateEvidence(cases, outcomes) {
  const accepted = new Map();
  return outcomes.map((outcome, index) => {
    const group = cases[index].distinctEvidenceGroup;
    if (!group || outcome.error !== undefined) return outcome;
    const prior = accepted.get(group) ?? [];
    const duplicate = prior.find((entry) => entry.buffer.equals(outcome.buffer));
    if (duplicate) {
      return {
        error: `evidence frame is byte-identical to ${duplicate.id} in distinct group '${group}'`,
      };
    }
    accepted.set(group, [...prior, { id: cases[index].id, buffer: outcome.buffer }]);
    return outcome;
  });
}

/**
 * The seeded generator behind every scale fixture (issue 1071).
 *
 * There is exactly ONE seeded PRNG in this repository and it already lives in
 * `tests/view-lab/foundry/labRandom.js`. That module's job is to make a screenshot
 * reproducible, so it INSTALLS its generator over `Math.random`, `Date`, `crypto.randomUUID`
 * and `performance.now` and hands back a disposer. A benchmark harness needs the generator
 * and must NOT keep the installation: `performance.now` is replaced there by a fake
 * 16-ms-per-call tick, which would silently turn every wall-clock measurement this harness
 * records into a count of how many times it looked at the clock.
 *
 * So `createSeededRandom` installs, captures the generator, and immediately restores. The
 * returned closure is a live mulberry32 stream that no longer touches any global. Writing a
 * second copy of mulberry32 here would be the obvious alternative and is the wrong one twice
 * over — SonarCloud counts `tests/**` duplication exactly like `src/`, and two PRNGs that
 * drift produce two different "deterministic" corpora.
 *
 * `Math.random()` is never used: SonarCloud reports it as S2245, a MEDIUM vulnerability that
 * fails the quality gate, and a benchmark seeded from entropy is not a benchmark.
 */
import { installLabRandom } from '../../view-lab/foundry/labRandom.js';

/**
 * A seeded `Math.random`-shaped generator that patches nothing.
 *
 * @param {number} seed
 * @returns {() => number} Uniform in `[0, 1)`, reproducible from `seed` alone.
 */
export function createSeededRandom(seed) {
  const { random, restore } = installLabRandom({ seed });
  restore();
  return random;
}

/**
 * A seeded integer in `[min, max]` inclusive.
 *
 * @param {() => number} random
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function intBetween(random, min, max) {
  if (max <= min) return min;
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * Pick one element of `values`. Returns `null` for an empty list rather than `undefined`,
 * so a fixture field is explicitly absent instead of accidentally so.
 *
 * @template T
 * @param {() => number} random
 * @param {T[]} values
 * @returns {T|null}
 */
export function pickOne(random, values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values[Math.floor(random() * values.length)];
}

/**
 * Pick `count` DISTINCT elements of `values`, in ascending index order.
 *
 * Order is normalised rather than left as draw order because these picks end up in a
 * fixture checksum: two runs that drew the same set in a different order would otherwise
 * report generator drift that is not there.
 *
 * @template T
 * @param {() => number} random
 * @param {T[]} values
 * @param {number} count
 * @returns {T[]}
 */
export function pickDistinct(random, values, count) {
  const pool = Array.isArray(values) ? values : [];
  const wanted = Math.max(0, Math.min(count, pool.length));
  const chosen = new Set();
  // Bounded rejection sampling: `wanted <= pool.length` guarantees progress, and the
  // guard counter means a degenerate generator cannot spin forever.
  let guard = 0;
  while (chosen.size < wanted && guard < wanted * 64 + 64) {
    chosen.add(Math.floor(random() * pool.length));
    guard += 1;
  }
  // Fill deterministically if rejection sampling ran out of attempts.
  for (let index = 0; chosen.size < wanted; index++) chosen.add(index);
  return [...chosen].sort((left, right) => left - right).map((index) => pool[index]);
}

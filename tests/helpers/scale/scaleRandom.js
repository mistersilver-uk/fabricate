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
 * ## Why this is a partial Fisher-Yates and not rejection sampling
 *
 * The first version drew random indices into a `Set` until it held `count` of them, with an
 * attempt counter to stop a degenerate generator spinning, and a deterministic
 * `for (let index = 0; chosen.size < wanted; index++)` fill for when that counter ran out.
 * SonarCloud flagged the fill loop under S1994 — its stop condition tests `chosen.size` while
 * its incrementer moves `index` — and the flag was worth taking seriously for a generator whose
 * failure mode is producing the wrong scale.
 *
 * That loop was NOT wrong: `wanted <= pool.length` is clamped above, so adding indices
 * `0, 1, 2, …` necessarily reaches `wanted` distinct entries and the loop exits. But it was
 * wrong-shaped in two ways that matter here. Its termination argument was non-local, living in a
 * clamp eleven lines earlier with nothing inside the loop bounding `index` — so loosening that
 * clamp would have turned it into an infinite loop emitting `undefined` entries, which is exactly
 * the wrong-scale defect this harness exists to catch. And the fallback was unreachable in
 * practice (measured: zero hits in 200,000 draws at this fixture's shapes), so it was untested
 * code that would have silently changed the sample distribution if it ever fired.
 *
 * A partial Fisher-Yates has neither problem. It runs exactly `wanted` iterations, its stop
 * condition tests its own incrementer, distinctness is structural rather than achieved by
 * retrying, and there is no guard and no fallback branch to leave untested.
 *
 * @template T
 * @param {() => number} random
 * @param {T[]} values
 * @param {number} count Clamped into `[0, values.length]`.
 * @returns {T[]} Exactly `min(count, values.length)` distinct elements.
 */
export function pickDistinct(random, values, count) {
  const pool = Array.isArray(values) ? values : [];
  const wanted = Math.max(0, Math.min(count, pool.length));
  const indices = [...pool.keys()];
  for (let position = 0; position < wanted; position++) {
    // Swap one uniformly-drawn survivor from the unpicked tail into the picked prefix.
    const swap = position + Math.floor(random() * (pool.length - position));
    const held = indices[position];
    indices[position] = indices[swap];
    indices[swap] = held;
  }
  return indices
    .slice(0, wanted)
    .sort((left, right) => left - right)
    .map((index) => pool[index]);
}

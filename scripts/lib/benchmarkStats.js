/**
 * Sample statistics for the class-2 (machine-dependent) half of the benchmark harness
 * (issue 1071).
 *
 * ## Why the median RATIO with an IQR band, and never a mean of milliseconds
 *
 * A mean is dragged around by the one rep where the OS scheduled something else, and an
 * absolute millisecond count only means anything on the machine that produced it. A ratio of
 * medians is robust to both: it survives an outlier rep, and it survives being pasted into a
 * GitHub comment by a maintainer whose laptop is nothing like the one that measured it. The
 * IQR band is reported alongside because a ratio with no spread invites a reader to treat a
 * 4% difference as real when the run-to-run spread is 20%.
 *
 * Ratios are computed from the two medians rather than pairwise per rep. Pairwise would imply
 * rep `i` of run A and rep `i` of run B are matched observations, which they are not: they were
 * taken in different processes minutes apart. The band comes from the quartile bounds instead,
 * which makes no such claim.
 */

/**
 * A sorted copy of a NON-EMPTY sample set.
 *
 * Refuses an empty set rather than returning `NaN` downstream. A statistics function handed no
 * samples has nothing to report, and a `NaN` here flows into the run record and the human report
 * as `NaN ms`, which reads like a measurement rather than like the absence of one.
 *
 * @param {number[]} samples
 * @returns {number[]} A sorted copy; the caller's array is never mutated.
 */
function sorted(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('benchmark statistics need at least one sample; got none');
  }
  return [...samples].sort((left, right) => left - right);
}

/**
 * The linear-interpolated quantile of a sample set.
 *
 * @param {number[]} samples Must be non-empty.
 * @param {number} q In `[0, 1]`.
 * @returns {number}
 */
export function quantile(samples, q) {
  const values = sorted(samples);
  if (values.length === 1) return values[0];
  const position = (values.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (position - lower);
}

/**
 * @param {number[]} samples
 * @returns {number}
 */
export function median(samples) {
  return quantile(samples, 0.5);
}

/**
 * Summarise one case's samples.
 *
 * @param {number[]} samples Must be non-empty.
 * @returns {{reps: number, min: number, p25: number, median: number, p75: number, max: number}}
 */
export function summarise(samples) {
  const values = sorted(samples);
  return {
    reps: values.length,
    min: values[0],
    p25: quantile(values, 0.25),
    median: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    max: values.at(-1),
  };
}

/**
 * The candidate-over-baseline ratio, with the band the two interquartile ranges imply.
 *
 * `> 1` means the candidate is SLOWER. `bandLow`/`bandHigh` are the ratio of the candidate's
 * quartile bounds to the baseline's opposite bounds — the widest honest reading of the same
 * two samples — so a band straddling 1.0 says plainly that the runs did not separate.
 *
 * @param {number[]} baselineSamples
 * @param {number[]} candidateSamples
 * @returns {{ratio: number, bandLow: number, bandHigh: number, baseline: object,
 *   candidate: object, separated: boolean}}
 */
export function medianRatioWithBand(baselineSamples, candidateSamples) {
  const baseline = summarise(baselineSamples);
  const candidate = summarise(candidateSamples);
  const ratio = candidate.median / baseline.median;
  const bandLow = candidate.p25 / baseline.p75;
  const bandHigh = candidate.p75 / baseline.p25;
  return {
    ratio,
    bandLow,
    bandHigh,
    baseline,
    candidate,
    // The band clearing 1.0 in one direction is the only claim this data supports.
    separated: bandLow > 1 || bandHigh < 1,
  };
}

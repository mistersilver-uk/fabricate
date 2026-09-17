/**
 * Sample statistics for the class-2 (machine-dependent) half of the benchmark harness (issue 1071).
 */

/** A sorted copy of a non-empty sample set. */
function sorted(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('benchmark statistics need at least one sample; got none');
  }
  return [...samples].sort((left, right) => left - right);
}

/** The linear-interpolated quantile of a sample set. */
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

/** Summarise one case's samples. */
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

/** The candidate-over-baseline ratio, with the band the two interquartile ranges imply. */
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

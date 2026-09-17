/**
 * The Foundry perf run record: what a run writes down, and when two runs may be compared (issue
 * 1073).
 */

/** Where class-2 Foundry perf run records are written, relative to the repository root. */
export const PERF_RUN_DIR = ['.foundry-perf', 'runs'];

/** Where Chrome DevTools traces are written, relative to the repository root. */
export const PERF_TRACE_DIR = ['.foundry-perf', 'traces'];

/**
 * The Foundry-side fields two runs must agree on before their timings may be compared, on top of
 * whatever the host envelope already requires.
 */
export const FOUNDRY_COMPARABILITY_FIELDS = Object.freeze([
  'arm',
  'foundryVersion',
  'image',
  'gameSystem',
  'browserVersion',
  'fixtureProfile',
  'fixtureSeed',
]);

/** The host-envelope fields inherited from issue 1071's comparability rule. */
export const HOST_COMPARABILITY_FIELDS = Object.freeze(['nodeVersion', 'cpuModel', 'arch']);

/** Compose a complete run record. */
export function buildPerfRunRecord({ host, foundry, seed, reconciled, trace = null }) {
  return {
    schema: 'fabricate-foundry-perf/1',
    // Stated in the artefact itself, so a record that escapes into an issue comment carries its own
    // warning rather than relying on the reader having read the README.
    warning:
      'CLASS 2. Every duration and heap value here is machine-dependent and MUST NOT be asserted ' +
      'or quoted as an absolute. Compare two records from one machine and quote the ratio.',
    envelope: { host, foundry },
    seed,
    measurements: reconciled.reconciled,
    invariant: reconciled.invariant,
    timing: reconciled.timing,
    // Loud, by name. An implemented measurement that produced nothing is a hole in the run, not an
    // absence of a finding.
    missing: reconciled.missing,
    undeclared: reconciled.undeclared,
    trace,
  };
}

/** Decide whether two run records may be diffed. */
export function assertFoundryComparable(left, right) {
  const reasons = [];
  const compare = (scope, fields) => {
    for (const field of fields) {
      const leftValue = left?.envelope?.[scope]?.[field] ?? '<missing>';
      const rightValue = right?.envelope?.[scope]?.[field] ?? '<missing>';
      if (leftValue !== rightValue) {
        reasons.push(`${scope}.${field}: "${leftValue}" vs "${rightValue}"`);
      }
    }
  };
  compare('host', HOST_COMPARABILITY_FIELDS);
  compare('foundry', FOUNDRY_COMPARABILITY_FIELDS);
  return { comparable: reasons.length === 0, reasons };
}

/** The file name a run record is written under: sortable, and self-identifying. */
export function perfRunFilename(record) {
  const host = record?.envelope?.host ?? {};
  const foundry = record?.envelope?.foundry ?? {};
  const stamp = String(host.capturedAt ?? new Date(0).toISOString())
    .replaceAll(':', '-')
    .replace(/\.\d+Z$/, 'Z');
  const shortSha = String(host.commit ?? 'nocommit').slice(0, 7);
  const arm = String(foundry.arm ?? 'noarm');
  const profile = String(foundry.fixtureProfile ?? 'noprofile');
  return `${stamp}-${shortSha}-${arm}-${profile}.json`;
}

/**
 * Median of a sample. Returns `null` for an empty sample rather than `NaN`, so a missing
 * measurement stays visibly missing instead of becoming a number-shaped hole downstream.
 */
export function median(samples) {
  const sorted = [...(samples ?? [])].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/** Compare two comparable records, reporting ratios. */
export function compareTimings(baseline, candidate) {
  const ids = new Set([
    ...Object.keys(baseline?.timing ?? {}),
    ...Object.keys(candidate?.timing ?? {}),
  ]);
  const rows = [];
  for (const id of [...ids].sort((left, right) => left.localeCompare(right))) {
    const baselineMs = median(baseline?.timing?.[id]?.samplesMs);
    const candidateMs = median(candidate?.timing?.[id]?.samplesMs);
    const ratio =
      baselineMs !== null && candidateMs !== null && baselineMs > 0
        ? candidateMs / baselineMs
        : null;
    rows.push({ measurement: id, baselineMs, candidateMs, ratio });
  }
  return rows;
}

/** Compare the class-1 halves of two records. */
export function compareInvariants(baseline, candidate) {
  const differences = [];
  const ids = new Set([
    ...Object.keys(baseline?.invariant ?? {}),
    ...Object.keys(candidate?.invariant ?? {}),
  ]);
  for (const id of [...ids].sort((left, right) => left.localeCompare(right))) {
    const before = JSON.stringify(baseline?.invariant?.[id] ?? null);
    const after = JSON.stringify(candidate?.invariant?.[id] ?? null);
    if (before !== after) differences.push(`${id}: ${before} -> ${after}`);
  }
  return differences;
}

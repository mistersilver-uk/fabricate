/**
 * Reading, writing and DIFFING the committed class-1 baselines (issue 1071).
 *
 * These live in a library rather than in `scripts/benchmark-performance.mjs` because
 * `tests/benchmark-baseline-drift.test.js` imports them, and the repository's ESLint rules
 * forbid a `scripts/` entry point from exporting anything (`unicorn/no-exports-in-scripts`) —
 * a CLI that is also a module has two contracts and only one of them gets maintained.
 *
 * ## The three kinds of drift, reported separately
 *
 * They have three different fixes, so folding them into one "baseline changed" line would make
 * the common case unactionable:
 *
 * - A changed **fixture checksum** means the GENERATOR moved. Every count in the file moved with
 *   it, and the fix is a deliberate re-record with an explanation.
 * - A changed **count** means the CODE UNDER MEASUREMENT moved. This is the regression guard
 *   firing, and it is the case worth reading closely.
 * - An added or removed **case** means the REGISTRY moved, and the baseline simply needs
 *   regenerating.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where committed class-1 baselines live. Tracked, unlike `.benchmarks/`. */
export const BASELINE_DIR = join(REPO_ROOT, 'benchmarks', 'baselines');

/**
 * @param {string} profile
 * @returns {string}
 */
export function baselinePath(profile) {
  return join(BASELINE_DIR, `${profile}.json`);
}

/**
 * @param {string} profile
 * @returns {object|null} `null` when no baseline has been recorded yet.
 */
export function readBaseline(profile) {
  const path = baselinePath(profile);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * @param {string} profile
 * @param {object} payload
 * @returns {string} The path written.
 */
export function writeBaseline(profile, payload) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  const path = baselinePath(profile);
  writeFileSync(path, JSON.stringify(payload, null, 2) + '\n');
  return path;
}

/**
 * Drift in the fixture IDENTITY: the harness version, the seed, or a corpus checksum.
 *
 * @param {object} baseline
 * @param {object} measured
 * @returns {string[]}
 */
function diffFixtureIdentity(baseline, measured) {
  const drift = [];
  if (baseline.harnessVersion !== measured.harnessVersion) {
    drift.push(`harnessVersion ${baseline.harnessVersion} -> ${measured.harnessVersion}`);
  }
  if (baseline.seed !== measured.seed) {
    drift.push(`seed ${baseline.seed} -> ${measured.seed}`);
  }
  for (const [key, value] of Object.entries(measured.checksums)) {
    if (baseline.checksums?.[key] !== value) {
      drift.push(`fixture checksum ${key}: ${baseline.checksums?.[key]} -> ${value}`);
    }
  }
  return drift;
}

/**
 * Drift in one case's COUNTS — the regression guard firing.
 *
 * @param {string} id
 * @param {object} before
 * @param {object} after
 * @returns {string[]}
 */
function diffCounts(id, before, after) {
  const drift = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[key] !== after[key]) {
      drift.push(`${id}.${key}: ${before[key]} -> ${after[key]}`);
    }
  }
  return drift;
}

/**
 * Drift in the case REGISTRY and in each shared case's counts.
 *
 * @param {object} baselineCases
 * @param {object} measuredCases
 * @returns {string[]}
 */
function diffCases(baselineCases, measuredCases) {
  const drift = [];
  const baselineIds = new Set(Object.keys(baselineCases));
  const measuredIds = new Set(Object.keys(measuredCases));
  for (const id of baselineIds) {
    if (!measuredIds.has(id)) drift.push(`case removed: ${id}`);
  }
  for (const id of measuredIds) {
    if (baselineIds.has(id)) {
      drift.push(...diffCounts(id, baselineCases[id].counts ?? {}, measuredCases[id].counts ?? {}));
    } else {
      drift.push(`case added: ${id}`);
    }
  }
  return drift;
}

/**
 * Diff a freshly measured class-1 payload against its committed baseline.
 *
 * @param {object|null} baseline
 * @param {object} measured
 * @returns {string[]} Human-readable drift lines; empty means clean.
 */
export function diffAgainstBaseline(baseline, measured) {
  if (!baseline) return ['no committed baseline (run with --update-baselines)'];
  return [
    ...diffFixtureIdentity(baseline, measured),
    ...diffCases(baseline.cases ?? {}, measured.cases),
  ];
}

/**
 * The instruction a drift failure must carry, so nobody has to find `benchmarks/README.md`
 * before they can act on a red test.
 * @type {string}
 */
export const BASELINE_REFRESH_HINT =
  'If the change is intended, re-record in the SAME pull request with ' +
  '`npm run benchmark:performance -- --update-baselines` and say in the description what moved ' +
  'and why. #1070 requires baselines to be refreshed as part of each optimisation merge rather ' +
  'than left to drift.';

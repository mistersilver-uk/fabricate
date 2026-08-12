/**
 * The run-record envelope, and the refusal rule that keeps two run records from being
 * compared when they cannot meaningfully be compared (issue 1071).
 *
 * ## Why a compare tool must REFUSE rather than warn
 *
 * A wall-clock ratio between two machines is not a weak signal, it is a wrong one, and a
 * printed ratio gets pasted into an issue where nobody can see which machines produced it.
 * This repository has already paid for that mistake once: `scripts/lib/foundryRunBudget.js`
 * documents the Foundry `rc` walk budget being re-estimated three times because hosted-runner
 * timing did not match local. So `assertComparable` returns a refusal with the specific fields
 * that differ, and `benchmark:compare` exits non-zero on it rather than printing a delta and a
 * caveat nobody reads.
 *
 * Three fields decide comparability: `nodeVersion`, `cpuModel` and `arch`. They are the ones
 * that change instruction selection, JIT behaviour and cache geometry. Everything else in the
 * envelope is recorded for forensics — `commit`, `branch` and `dirty` say WHAT was measured;
 * `containerized` and `cpuCount` explain a noisy sample after the fact.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';

/** The envelope fields a comparison must agree on, or refuse. */
export const COMPARABILITY_FIELDS = Object.freeze(['nodeVersion', 'cpuModel', 'arch']);

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Whether this process is running inside a container.
 *
 * Recorded rather than acted on: a containerised run is usually CPU-throttled and its samples
 * are wider, which is worth knowing when a comparison looks noisy.
 *
 * @returns {boolean}
 */
function detectContainerized() {
  if (existsSync('/.dockerenv')) return true;
  return Boolean(process.env.KUBERNETES_SERVICE_HOST || process.env.container);
}

/**
 * Capture the full run envelope.
 *
 * @param {object} options
 * @param {string} options.repoRoot
 * @param {string} options.fixtureProfile
 * @param {number} options.fixtureSeed
 * @param {number} options.harnessVersion
 * @returns {object}
 */
export function captureEnvelope({ repoRoot, fixtureProfile, fixtureSeed, harnessVersion }) {
  const cpuList = cpus();
  return {
    commit: git(['rev-parse', 'HEAD'], repoRoot),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot),
    // A dirty tree is the single most common reason two runs of "the same commit" disagree,
    // so it is captured rather than inferred.
    dirty: (git(['status', '--porcelain'], repoRoot) ?? '') !== '',
    nodeVersion: process.versions.node,
    v8Version: process.versions.v8,
    os: `${platform()} ${release()}`,
    arch: arch(),
    cpuModel: cpuList[0]?.model?.trim() ?? 'unknown',
    cpuCount: cpuList.length,
    totalMemMB: Math.round(totalmem() / 1024 / 1024),
    containerized: detectContainerized(),
    fixtureProfile,
    fixtureSeed,
    harnessVersion,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Decide whether two run records may be diffed.
 *
 * @param {object} left
 * @param {object} right
 * @returns {{comparable: boolean, reasons: string[]}}
 */
export function assertComparable(left, right) {
  const reasons = [];
  for (const field of COMPARABILITY_FIELDS) {
    const leftValue = left?.[field] ?? '<missing>';
    const rightValue = right?.[field] ?? '<missing>';
    if (leftValue !== rightValue) {
      reasons.push(`${field}: "${leftValue}" vs "${rightValue}"`);
    }
  }
  return { comparable: reasons.length === 0, reasons };
}

/**
 * The file name a run record is written under: sortable, and self-identifying.
 *
 * @param {object} envelope
 * @returns {string}
 */
export function runRecordFilename(envelope) {
  const stamp = String(envelope.capturedAt)
    .replaceAll(':', '-')
    .replace(/\.\d+Z$/, 'Z');
  const shortSha = String(envelope.commit ?? 'nocommit').slice(0, 7);
  return `${stamp}-${shortSha}.json`;
}

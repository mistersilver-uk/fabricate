/**
 * The run-record envelope, and the refusal rule that keeps two run records from being compared when
 * they cannot meaningfully be compared (issue 1071).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';

import { resolveExecutable } from './resolveExecutable.js';

/** The envelope fields a comparison must agree on, or refuse. */
export const COMPARABILITY_FIELDS = Object.freeze(['nodeVersion', 'cpuModel', 'arch']);

/** The git executable, resolved once to an absolute path in an absolute `PATH` directory. */
const GIT_EXECUTABLE = resolveExecutable('git');

function git(args, cwd) {
  if (!GIT_EXECUTABLE) return null;
  try {
    return execFileSync(GIT_EXECUTABLE, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** Whether this process is running inside a container. */
function detectContainerized() {
  if (existsSync('/.dockerenv')) return true;
  return Boolean(process.env.KUBERNETES_SERVICE_HOST || process.env.container);
}

/** Capture the full run envelope. */
export function captureEnvelope({ repoRoot, fixtureProfile, fixtureSeed, harnessVersion }) {
  const cpuList = cpus();
  const status = git(['status', '--porcelain'], repoRoot);
  return {
    commit: git(['rev-parse', 'HEAD'], repoRoot),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot),
    // A dirty tree is the single most common reason two runs of "the same commit" disagree, so it
    // is captured rather than inferred.
    dirty: status === null ? null : status !== '',
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

/** Decide whether two run records may be diffed. */
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

/** The file name a run record is written under: sortable, and self-identifying. */
export function runRecordFilename(envelope) {
  const stamp = String(envelope.capturedAt)
    .replaceAll(':', '-')
    .replace(/\.\d+Z$/, 'Z');
  const shortSha = String(envelope.commit ?? 'nocommit').slice(0, 7);
  return `${stamp}-${shortSha}.json`;
}

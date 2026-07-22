/**
 * foundryRunIdentity.js
 *
 * Pure (playwright-free, no `main()` autorun) derivation of a Foundry smoke-test
 * container identity from the worktree root path. It answers a single question —
 * "what container name / hostname / compose project / host port does THIS worktree
 * use?" — deterministically, so the identity is stable WITHIN a worktree (preserving
 * the container-reuse cache and felddy's hostname-bound cached license) yet unique
 * ACROSS worktrees (removing the fixed-`fabricate-foundry-test` collision that forced
 * the driver's repeated `docker rm -f`).
 *
 * WHY a separate module (issue #827, mirroring `scripts/lib/screenshotCaptureMap.js`):
 * the harness scripts (`foundry-test*.mjs`) top-level-import playwright and/or autorun
 * `main()`, so importing them under `node:test` launches Chromium then `process.exit()`s
 * — killing the whole `node --test` run (the `# cancelled` catastrophe). Nothing here
 * imports playwright or runs on load, so the derivation is unit-testable with zero docker.
 *
 * Determinism, not randomness: a per-invocation-random identity would defeat the
 * deliberate container-reuse cache, force felddy license re-acceptance every run (the
 * license binds to the hostname), and accelerate Docker address-pool exhaustion. The
 * hash is `node:crypto` `sha256` — NOT `Math.random`, which SonarCloud flags as a
 * vulnerability (S2245).
 */

import { createHash } from 'node:crypto';

/** Hex characters of the sha256 digest used in the container name / hostname. */
const HASH_LENGTH = 12;
/** Base host port; the derived port lands in [PORT_BASE, PORT_BASE + PORT_SPAN). */
const PORT_BASE = 30_100;
const PORT_SPAN = 400;

/** Docker object-name charset: `[a-zA-Z0-9][a-zA-Z0-9_.-]*`. */
const DOCKER_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
/** RFC-1123 hostname label: `[a-zA-Z0-9-]`, must not start/end with `-`, <= 63. */
const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

/**
 * A stable lowercase-hex sha256 of the worktree root. Path separators are normalized
 * so a `win32` (backslash) and a POSIX (forward-slash) spelling of the same absolute
 * path hash identically; the raw path is otherwise preserved (no case-folding), so two
 * genuinely distinct roots never collide on a case-sensitive filesystem.
 * @param {string} root
 * @returns {string}
 */
function stableHash(root) {
  const normalized = root.replaceAll('\\', '/');
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Derive the deterministic-per-worktree Foundry smoke container identity.
 *
 * Because the name/hostname are built ONLY from the fixed literal prefixes plus the
 * lowercase-hex digest, the output is legal by construction — a hostile worktree name
 * (`/`, spaces, uppercase) cannot leak into an illegal docker id or hostname. The caller
 * owns the free-port fallback; this function returns the derived candidate port unchanged
 * so it stays pure and idempotent.
 *
 * @param {string} root Absolute worktree root path.
 * @returns {{ containerName: string, hostname: string, project: string, port: number }}
 */
export function deriveRunIdentity(root) {
  if (typeof root !== 'string' || root.length === 0) {
    throw new TypeError('deriveRunIdentity(root): root must be a non-empty string');
  }

  const hex = stableHash(root);
  const shortHash = hex.slice(0, HASH_LENGTH);

  // Docker Compose project names must be lowercase; the literal prefix + hex digest
  // already satisfy that, so `project` doubles as the `container_name`.
  const containerName = `fabricate-foundry-${shortHash}`;
  const hostname = `fabricate-${shortHash}`;
  const project = containerName;

  // Deterministic-per-worktree port in a bounded range. 8 hex chars = 32 bits, comfortably
  // larger than PORT_SPAN, so the modulo keeps a good spread across worktrees.
  const port = PORT_BASE + (Number.parseInt(hex.slice(0, 8), 16) % PORT_SPAN);

  return { containerName, hostname, project, port };
}

/** True when `name` is a legal docker object name. */
export function isLegalDockerName(name) {
  return typeof name === 'string' && DOCKER_NAME_RE.test(name);
}

/** True when `hostname` is a legal single RFC-1123 hostname label (<= 63 chars). */
export function isLegalHostname(hostname) {
  return typeof hostname === 'string' && hostname.length <= 63 && HOSTNAME_RE.test(hostname);
}

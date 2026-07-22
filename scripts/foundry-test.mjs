/**
 * foundry-test.mjs
 *
 * Orchestrates the full Foundry smoke-test pipeline: up → run → down.
 * Ensures `down` is always called even if `run` fails, so containers
 * are never left orphaned in CI.
 *
 * Usage: node scripts/foundry-test.mjs
 *
 * Exit codes:
 *   0 — smoke test passed
 *   1 — smoke test failed (down was still called)
 *   2 — up or down failed (infrastructure error)
 */

import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveRunIdentity,
  reconcileFoundryEndpoint,
  PORT_BASE,
  PORT_SPAN
} from './lib/foundryRunIdentity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * Whether a TCP port on 127.0.0.1 is bindable right now. Used for the free-port
 * fallback around the derived per-worktree port: the derived port is a mod-bounded
 * candidate, so distinct worktrees can occasionally collide (or a stale process can
 * hold it). up.mjs already recreates a cached container on a port-binding mismatch.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortFree(port) {
  return new Promise(resolve => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

/**
 * The derived candidate port, or the next free port scanning upward within the bounded
 * range (wrapping back to 30100). Falls back to the derived candidate if nothing is free
 * (up.mjs then surfaces the bind failure with full docker logs).
 * @param {number} candidate
 * @returns {Promise<number>}
 */
async function resolveHostPort(candidate) {
  for (let i = 0; i < PORT_SPAN; i += 1) {
    const port = PORT_BASE + ((candidate - PORT_BASE + i) % PORT_SPAN);
    if (await isPortFree(port)) return port;
  }
  return candidate;
}

/**
 * Derive this worktree's stable container identity and export it (with a free-port
 * fallback) so every child phase — up, run, down — agrees on the container name,
 * hostname, compose project, host port, AND the base URL. The run phase reads
 * FOUNDRY_URL SEPARATELY from FOUNDRY_HOST_PORT, so both must be set or Playwright
 * connects to the wrong port. Explicit overrides win (CI / manual pinning).
 */
async function exportRunIdentity() {
  const identity = deriveRunIdentity(ROOT);
  process.env.FOUNDRY_CONTAINER_NAME ||= identity.containerName;
  process.env.FOUNDRY_CONTAINER_HOSTNAME ||= identity.hostname;
  process.env.COMPOSE_PROJECT_NAME ||= identity.project;

  // Only scan for a free port when NOTHING is pinned — a pinned URL or host port is an
  // explicit choice the scan must not override (CI pins FOUNDRY_URL to :30100). The
  // reconcile then keeps the URL and the container host port in lockstep so they can
  // never diverge: an explicit URL's port wins, else an explicit host port derives the
  // URL, else both come from the scanned/derived fallback.
  let fallbackPort = identity.port;
  if (!process.env.FOUNDRY_URL && !process.env.FOUNDRY_HOST_PORT) {
    fallbackPort = await resolveHostPort(identity.port);
  }
  const { hostPort, url } = reconcileFoundryEndpoint({
    url: process.env.FOUNDRY_URL,
    hostPort: process.env.FOUNDRY_HOST_PORT,
    fallbackPort
  });
  process.env.FOUNDRY_HOST_PORT = hostPort;
  process.env.FOUNDRY_URL = url;
  process.stdout.write(
    `Worktree container identity: ${process.env.FOUNDRY_CONTAINER_NAME} ` +
    `(host ${process.env.FOUNDRY_URL})\n`
  );
}

/**
 * Run a node script and return its exit code.
 * @param {string} scriptPath
 * @param {string[]} [args]
 * @param {number} [timeoutMs] Optional wall-clock budget; SIGTERM on overrun.
 * @returns {number}
 */
function runScript(scriptPath, args = [], timeoutMs) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    timeout: timeoutMs,
    killSignal: 'SIGTERM'
  });
  if (result.error?.code === 'ETIMEDOUT') {
    process.stderr.write(`${scriptPath} timed out after ${timeoutMs}ms.\n`);
    return 124;
  }
  return result.status ?? 1;
}

async function main() {
  // Optional --profile=<full|rc|ci|screenshots> CLI arg flows through to the child run
  // script via FOUNDRY_SMOKE_PROFILE. Useful for cross-platform local CI emulation;
  // POSIX users could also set the env var directly. The scoped `screenshots` profile
  // (issue #826) additionally reads --target-labels=<csv> (the smoke labels of the
  // views a PR affects, from `ui-pr-screenshot-evidence.mjs targets`) and forwards it
  // as FOUNDRY_SCREENSHOT_TARGET_LABELS; empty means capture the full label set.
  for (const arg of process.argv.slice(2)) {
    const profile = /^--profile=(.+)$/.exec(arg);
    if (profile) process.env.FOUNDRY_SMOKE_PROFILE = profile[1];
    const targets = /^--target-labels=(.*)$/.exec(arg);
    if (targets) process.env.FOUNDRY_SCREENSHOT_TARGET_LABELS = targets[1];
  }

  // Pin the per-worktree container identity + host port/URL for every child phase.
  await exportRunIdentity();

  const up = join(__dirname, 'foundry-test-up.mjs');
  const run = join(__dirname, 'foundry-test-run.mjs');
  const down = join(__dirname, 'foundry-test-down.mjs');

  // Step 0: Build the module so the smoke always exercises CURRENT source.
  // foundry-setup-data.mjs copies dist/ into the Foundry data dir as the module, so a
  // missing dist/ fails to activate and — worse — a STALE dist/ silently tests old
  // code. Building here removes both failure modes. CI builds in its own dedicated
  // cached step and sets FOUNDRY_SKIP_BUILD=1 to avoid double-building.
  if (process.env.FOUNDRY_SKIP_BUILD !== '1') {
    process.stdout.write('=== foundry-test: BUILD ===\n');
    // `npm run build` is `node scripts/release.js --no-zip`. Invoke it through the
    // existing runScript helper (absolute process.execPath, no shell, no PATH lookup)
    // rather than spawning a PATH-resolved `npm`.
    const buildCode = runScript(join(__dirname, 'release.js'), ['--no-zip']);
    if (buildCode !== 0) {
      process.stderr.write('Build failed. Aborting.\n');
      process.exit(2);
    }
  }

  // Step 1: Start the environment
  process.stdout.write('=== foundry-test: UP ===\n');
  const upCode = runScript(up);
  if (upCode !== 0) {
    process.stderr.write('foundry-test-up failed. Aborting.\n');
    process.exit(2);
  }

  // Step 2: Run the smoke test (capture result, always proceed to down).
  // The run phase gets its own wall-clock budget so the 25-minute GitHub
  // Actions job timeout can never preempt Docker teardown + artifact upload.
  // Override with FOUNDRY_RUN_TIMEOUT_MS; defaults to 18 minutes. The default
  // sits comfortably above the observed rc run duration (~870-930s across all
  // phases) so ordinary hosted-runner variance no longer trips the watchdog on
  // an otherwise-passing smoke, while staying well under the job cap so
  // teardown + upload always run.
  process.stdout.write('=== foundry-test: RUN ===\n');
  const runTimeoutMs = Number(process.env.FOUNDRY_RUN_TIMEOUT_MS ?? 18 * 60_000);
  const runCode = runScript(run, [], runTimeoutMs);

  // Step 3: Tear down regardless of test result
  process.stdout.write('=== foundry-test: DOWN ===\n');
  const downCode = runScript(down);
  if (downCode !== 0) {
    process.stderr.write('foundry-test-down failed.\n');
    process.exit(2);
  }

  // Propagate test result
  if (runCode !== 0) {
    process.stderr.write('Smoke test failed. See test-results/summary.json\n');
    process.exit(1);
  }

  process.stdout.write('=== foundry-test: ALL PASSED ===\n');
}

main().catch(err => {
  process.stderr.write(`foundry-test fatal error: ${err.message}\n`);
  process.exit(2);
});

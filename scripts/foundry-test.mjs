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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * Run a node script and return its exit code.
 * @param {string} scriptPath
 * @param {string[]} [args]
 * @returns {number}
 */
function runScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });
  return result.status ?? 1;
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function resolveFoundryHostPort() {
  if (process.env.FOUNDRY_HOST_PORT) {
    return String(process.env.FOUNDRY_HOST_PORT);
  }

  const basePort = 30000;
  const maxOffset = 20;
  for (let offset = 0; offset <= maxOffset; offset++) {
    const port = basePort + offset;
    if (await canBindPort(port)) {
      return String(port);
    }
  }

  throw new Error(`No free Foundry host port found in range ${basePort}-${basePort + maxOffset}`);
}

async function main() {
  const up = join(__dirname, 'foundry-test-up.mjs');
  const run = join(__dirname, 'foundry-test-run.mjs');
  const down = join(__dirname, 'foundry-test-down.mjs');

  const hostPort = await resolveFoundryHostPort();
  process.env.FOUNDRY_HOST_PORT = hostPort;
  if (!process.env.FOUNDRY_URL) {
    process.env.FOUNDRY_URL = `http://localhost:${hostPort}`;
  }
  process.stdout.write(`Using Foundry host port ${hostPort}.\n`);

  // Step 1: Start the environment
  process.stdout.write('=== foundry-test: UP ===\n');
  const upCode = runScript(up);
  if (upCode !== 0) {
    process.stderr.write('foundry-test-up failed. Aborting.\n');
    process.exit(2);
  }

  // Step 2: Run the smoke test (capture result, always proceed to down)
  process.stdout.write('=== foundry-test: RUN ===\n');
  const runCode = runScript(run);

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

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
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

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
  // Optional --profile=<full|ci> CLI arg flows through to the child run script
  // via FOUNDRY_SMOKE_PROFILE. Useful for cross-platform local CI emulation;
  // POSIX users could also set the env var directly.
  for (const arg of process.argv.slice(2)) {
    const match = /^--profile=(.+)$/.exec(arg);
    if (match) process.env.FOUNDRY_SMOKE_PROFILE = match[1];
  }

  const up = join(__dirname, 'foundry-test-up.mjs');
  const run = join(__dirname, 'foundry-test-run.mjs');
  const down = join(__dirname, 'foundry-test-down.mjs');

  // Step 1: Start the environment
  process.stdout.write('=== foundry-test: UP ===\n');
  const upCode = runScript(up);
  if (upCode !== 0) {
    process.stderr.write('foundry-test-up failed. Aborting.\n');
    process.exit(2);
  }

  // Step 2: Run the smoke test (capture result, always proceed to down).
  // The run phase gets its own wall-clock budget so the 20-minute GitHub
  // Actions job timeout can never preempt Docker teardown + artifact upload.
  // Override with FOUNDRY_RUN_TIMEOUT_MS; defaults to 15 minutes.
  process.stdout.write('=== foundry-test: RUN ===\n');
  const runTimeoutMs = Number(process.env.FOUNDRY_RUN_TIMEOUT_MS ?? 15 * 60_000);
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

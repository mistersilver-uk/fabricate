/**
 * foundry-test-rc.mjs
 *
 * Orchestrates the release-candidate Foundry smoke test: up → focused rc run → down.
 * The in-browser run has its own timeout so the container can still be torn
 * down and artifacts can be uploaded before the GitHub Actions job deadline.
 */

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function runScript(scriptPath, args = [], timeoutMs = undefined) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, FOUNDRY_SMOKE_PROFILE: 'rc' },
    timeout: timeoutMs,
    killSignal: 'SIGTERM'
  });

  if (result.error?.code === 'ETIMEDOUT') {
    process.stderr.write(`${scriptPath} timed out after ${timeoutMs}ms.\n`);
    return 124;
  }

  if (result.error) {
    process.stderr.write(`${scriptPath} failed to start: ${result.error.message}\n`);
    return 2;
  }

  return result.status ?? 1;
}

async function main() {
  const up = join(__dirname, 'foundry-test-up.mjs');
  const run = join(__dirname, 'foundry-test-rc-run.mjs');
  const down = join(__dirname, 'foundry-test-down.mjs');

  const runTimeoutMs = Number(process.env.FOUNDRY_RUN_TIMEOUT_MS ?? 15 * 60_000);

  process.stdout.write('=== foundry-test-rc: UP ===\n');
  const upCode = runScript(up);
  if (upCode !== 0) {
    process.stderr.write('foundry-test-up failed. Aborting.\n');
    process.exit(2);
  }

  process.stdout.write('=== foundry-test-rc: RUN ===\n');
  const runCode = runScript(run, [], runTimeoutMs);

  process.stdout.write('=== foundry-test-rc: DOWN ===\n');
  const downCode = runScript(down);
  if (downCode !== 0) {
    process.stderr.write('foundry-test-down failed.\n');
    process.exit(2);
  }

  if (runCode !== 0) {
    process.stderr.write('RC smoke test failed. See test-results/summary.json\n');
    process.exit(runCode === 124 ? 1 : runCode);
  }

  process.stdout.write('=== foundry-test-rc: ALL PASSED ===\n');
}

main().catch(err => {
  process.stderr.write(`foundry-test-rc fatal error: ${err.message}\n`);
  process.exit(2);
});

/**
 * foundry-test-down.mjs
 *
 * Stops and removes the Foundry VTT Docker Compose test harness.
 * Volumes are preserved between runs to speed up re-runs.
 * Pass --clean to also remove the named volume (full reset).
 *
 * Usage:
 *   node scripts/foundry-test-down.mjs          # stop containers
 *   node scripts/foundry-test-down.mjs --clean  # stop containers + remove volume
 */

import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

async function main() {
  const clean = process.argv.includes('--clean');

  process.stdout.write('Stopping Foundry test harness...\n');

  const args = clean ? '--volumes' : '';
  execSync(`docker compose -f docker-compose.foundry.yml down ${args}`.trim(), {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });

  if (clean) {
    process.stdout.write('Volumes removed (clean reset).\n');
  }

  process.stdout.write('Foundry test harness stopped.\n');
}

main().catch(err => {
  process.stderr.write(`foundry-test-down failed: ${err.message}\n`);
  process.exit(1);
});

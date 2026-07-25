/**
 * foundry-test-down.mjs
 *
 * Stops the Foundry VTT Docker Compose test harness.
 * The container is preserved between normal runs so the extracted Foundry
 * application remains cached and the next run does not have to request a
 * release URL again. Pass --clean for a full reset.
 *
 * Usage:
 *   node scripts/foundry-test-down.mjs          # stop container, keep cache
 *   node scripts/foundry-test-down.mjs --clean  # remove container + volumes
 */

import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveRunIdentity } from './lib/foundryRunIdentity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Target the same per-worktree compose project the up phase created (issue #827). `down`
// is compose-project-scoped, so pinning COMPOSE_PROJECT_NAME + the container-name env
// (already set when invoked by the parent pipeline; derived here for a standalone
// `test:foundry:down`) tears down THIS worktree's container, never a sibling's.
const identity = deriveRunIdentity(ROOT);
process.env.FOUNDRY_CONTAINER_NAME ||= identity.containerName;
process.env.FOUNDRY_CONTAINER_HOSTNAME ||= identity.hostname;
process.env.COMPOSE_PROJECT_NAME ||= identity.project;

async function main() {
  const clean = process.argv.includes('--clean');

  process.stdout.write(clean
    ? 'Removing Foundry test harness and cached container...\n'
    : 'Stopping Foundry test harness and preserving cached container...\n');

  const command = clean
    ? 'docker compose -f docker-compose.foundry.yml down --volumes --remove-orphans'
    : 'docker compose -f docker-compose.foundry.yml stop';

  execSync(command, {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env
  });

  if (clean) {
    process.stdout.write('Container and volumes removed (clean reset).\n');
  }

  process.stdout.write('Foundry test harness stopped.\n');
}

main().catch(err => {
  process.stderr.write(`foundry-test-down failed: ${err.message}\n`);
  process.exit(1);
});

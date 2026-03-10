/**
 * foundry-setup-data.mjs
 *
 * Assembles the .foundry-e2e/data/ directory that is bind-mounted as Foundry's
 * /data volume. Copies the world fixture and creates symlinks for the module
 * and game systems. Symlinks use relative paths so they resolve correctly
 * both on the host and inside the container.
 *
 * Usage: node scripts/foundry-setup-data.mjs
 *
 * This script is called automatically by foundry-test-up.mjs before starting
 * the Docker container.
 */

import { mkdirSync, cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DATA_DIR = join(ROOT, '.foundry-e2e', 'data', 'Data');
const DIST_DIR = join(ROOT, 'dist');
const WORLDS_SRC = join(ROOT, '.foundry-e2e', 'worlds');
const SYSTEMS_SRC = join(ROOT, '.foundry-e2e', 'systems');

function main() {
  // Create the base directory structure Foundry expects
  for (const sub of ['modules', 'worlds', 'systems']) {
    mkdirSync(join(DATA_DIR, sub), { recursive: true });
  }

  // Copy built module into data/Data/modules/fabricate/
  const moduleDest = join(DATA_DIR, 'modules', 'fabricate');
  if (existsSync(DIST_DIR)) {
    // Remove stale copy and re-copy fresh build
    if (existsSync(moduleDest)) rmSync(moduleDest, { recursive: true });
    cpSync(DIST_DIR, moduleDest, { recursive: true });
    process.stdout.write('Copied module: dist/ → data/Data/modules/fabricate/\n');
  } else {
    process.stderr.write('Warning: dist/ not found. Run npm run build first.\n');
  }

  // Copy world fixture (writable — Foundry creates db files on launch)
  const worldDest = join(DATA_DIR, 'worlds', 'fabricate-smoke');
  const worldSrc = join(WORLDS_SRC, 'fabricate-smoke');
  if (existsSync(worldSrc)) {
    // Only copy world.json if dest doesn't exist (preserve Foundry-created db files)
    if (!existsSync(worldDest)) {
      cpSync(worldSrc, worldDest, { recursive: true });
      process.stdout.write('Copied world: fabricate-smoke\n');
    } else {
      // Always update world.json in case it changed
      cpSync(join(worldSrc, 'world.json'), join(worldDest, 'world.json'));
      process.stdout.write('Updated world.json for fabricate-smoke\n');
    }
  }

  // Copy each downloaded game system
  if (existsSync(SYSTEMS_SRC)) {
    for (const entry of readdirSync(SYSTEMS_SRC, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dest = join(DATA_DIR, 'systems', entry.name);
      if (!existsSync(dest)) {
        cpSync(join(SYSTEMS_SRC, entry.name), dest, { recursive: true });
        process.stdout.write(`Copied system: ${entry.name}\n`);
      } else {
        process.stdout.write(`System ${entry.name} already in data dir, skipping.\n`);
      }
    }
  }

  process.stdout.write('Data directory ready.\n');
}

main();

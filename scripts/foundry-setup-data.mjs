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

import { mkdirSync, cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DATA_DIR = join(ROOT, '.foundry-e2e', 'data', 'Data');
const DIST_DIR = join(ROOT, 'dist');
const WORLDS_SRC = join(ROOT, '.foundry-e2e', 'worlds');
const SYSTEMS_SRC = join(ROOT, '.foundry-e2e', 'systems');

/**
 * Read a package version out of a Foundry `system.json` / `module.json`.
 *
 * @param {string} manifestPath Absolute path to the manifest.
 * @returns {string|null} The declared version, or null when it cannot be read — an unreadable
 *   manifest is treated as "not what we want" so the copy is redone rather than trusted.
 */
function manifestVersion(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

function main() {
  // Create the base directory structure Foundry expects
  for (const sub of ['modules', 'worlds', 'systems']) {
    mkdirSync(join(DATA_DIR, sub), { recursive: true });
  }

  // Create the container cache directory so Docker doesn't create it as root.
  // The felddy/foundryvtt image runs as the host user (via `user:` in
  // docker-compose) and needs write access to both /data and /data/container_cache.
  const cacheDir = join(ROOT, '.foundry-e2e', 'cache');
  mkdirSync(cacheDir, { recursive: true });

  // Copy built module into data/Data/modules/fabricate/
  const moduleDest = join(DATA_DIR, 'modules', 'fabricate');
  if (existsSync(DIST_DIR)) {
    // Remove stale copy and re-copy fresh build
    if (existsSync(moduleDest)) rmSync(moduleDest, { recursive: true });
    cpSync(DIST_DIR, moduleDest, { recursive: true });
    process.stdout.write('Copied module: dist/ → data/Data/modules/fabricate/\n');
  } else {
    // Fail fast: without dist/ the module is never copied into the data dir, so
    // Foundry has no `fabricate` module to enable. Continuing here surfaces much
    // later in the run as a misleading "module could not be activated" error.
    // Make the real cause obvious and actionable at setup time instead.
    process.stderr.write('Error: dist/ not found — run `npm run build` before the Foundry smoke test.\n');
    process.exit(1);
  }

  // Copy CI smoke world fixture. The runtime dir is wiped and recopied on
  // every up so that smoke runs start pristine — no leftover settings db,
  // actors, items, or crafting systems from a prior run can contaminate
  // assertions. The user's other worlds at .foundry-e2e/data/Data/worlds/
  // are not touched; only `fabricate-smoke-ci/` is automation-owned.
  const worldDest = join(DATA_DIR, 'worlds', 'fabricate-smoke-ci');
  const worldSrc = join(WORLDS_SRC, 'fabricate-smoke-ci');
  if (existsSync(worldSrc)) {
    if (existsSync(worldDest)) {
      rmSync(worldDest, { recursive: true, force: true });
      process.stdout.write('Wiped previous smoke world: fabricate-smoke-ci\n');
    }
    cpSync(worldSrc, worldDest, { recursive: true });
    process.stdout.write('Copied smoke world: fabricate-smoke-ci\n');
  }

  // Copy each downloaded game system.
  //
  // Compared by VERSION, not by mere presence. Presence alone meant a system bump in
  // `foundry-fetch-systems.mjs` never reached the assembled data directory, so the container went
  // on running the old release while the world manifest declared the new one. That is not a
  // cosmetic mismatch: a dnd5e built for the previous core generation loads under the new one and
  // then fails data preparation on every actor ("Cannot read properties of undefined"), which
  // surfaces two phases later as an empty compendium rather than as a version problem.
  if (existsSync(SYSTEMS_SRC)) {
    for (const entry of readdirSync(SYSTEMS_SRC, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const source = join(SYSTEMS_SRC, entry.name);
      const dest = join(DATA_DIR, 'systems', entry.name);
      const wanted = manifestVersion(join(source, 'system.json'));
      const installed = existsSync(dest) ? manifestVersion(join(dest, 'system.json')) : null;
      if (installed !== null && installed === wanted) {
        process.stdout.write(`System ${entry.name}@${wanted ?? 'unknown'} already in data dir, skipping.\n`);
        continue;
      }
      if (installed !== null) {
        process.stdout.write(
          `System ${entry.name}@${installed ?? 'unknown'} in data dir differs from ${wanted ?? 'unknown'}; replacing.\n`
        );
        rmSync(dest, { recursive: true, force: true });
      }
      cpSync(source, dest, { recursive: true });
      process.stdout.write(`Copied system: ${entry.name}@${wanted ?? 'unknown'}\n`);
    }
  }

  process.stdout.write('Data directory ready.\n');
}

main();

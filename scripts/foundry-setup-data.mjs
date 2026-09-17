/**
 * Assembles the .foundry-e2e/data/ directory that is bind-mounted as Foundry's /data volume. Copies
 * the world fixture and creates symlinks for the module and game systems.
 */

import { mkdirSync, cpSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

import { deriveWorldManifest, resolveSmokeArmFromEnv } from './lib/foundrySmokeArms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DATA_DIR = join(ROOT, '.foundry-e2e', 'data', 'Data');
const DIST_DIR = join(ROOT, 'dist');
const WORLDS_SRC = join(ROOT, '.foundry-e2e', 'worlds');
const SYSTEMS_SRC = join(ROOT, '.foundry-e2e', 'systems');

/** Read a package version out of a Foundry `system.json` / `module.json`. */
function manifestVersion(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/** Stamp the copied world manifest for the arm being booted. */
function stampWorldManifestForArm(worldDest, arm) {
  const manifestPath = join(worldDest, 'world.json');
  if (!existsSync(manifestPath)) return;
  const base = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const derived = deriveWorldManifest(base, arm);
  writeFileSync(manifestPath, `${JSON.stringify(derived, null, 2)}\n`);
  process.stdout.write(
    `Stamped smoke world for arm ${arm.id}: coreVersion ${derived.coreVersion}, ` +
      `systemVersion ${derived.systemVersion}, compatibility ${derived.compatibility.minimum}/` +
      `${derived.compatibility.verified}\n`
  );
}

function main() {
  const arm = resolveSmokeArmFromEnv();

  // Create the base directory structure Foundry expects
  for (const sub of ['modules', 'worlds', 'systems']) {
    mkdirSync(join(DATA_DIR, sub), { recursive: true });
  }

  // Create the container cache directory so Docker doesn't create it as root.
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
    // Fail fast: without dist/ the module is never copied into the data dir, so Foundry has no
    // `fabricate` module to enable.
    process.stderr.write('Error: dist/ not found — run `npm run build` before the Foundry smoke test.\n');
    process.exit(1);
  }

  // Copy CI smoke world fixture.
  const worldDest = join(DATA_DIR, 'worlds', 'fabricate-smoke-ci');
  const worldSrc = join(WORLDS_SRC, 'fabricate-smoke-ci');
  if (existsSync(worldSrc)) {
    if (existsSync(worldDest)) {
      rmSync(worldDest, { recursive: true, force: true });
      process.stdout.write('Wiped previous smoke world: fabricate-smoke-ci\n');
    }
    cpSync(worldSrc, worldDest, { recursive: true });
    process.stdout.write('Copied smoke world: fabricate-smoke-ci\n');
    stampWorldManifestForArm(worldDest, arm);
  }

  // Copy each downloaded game system.
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

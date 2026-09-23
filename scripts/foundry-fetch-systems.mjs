/**
 * Downloads game systems required by the Foundry smoke-test world into .foundry-e2e/systems/. Skips
 * download if the system is already present.
 */

import {
  existsSync,
  mkdirSync,
  cpSync,
  createWriteStream,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

import { resolveSmokeArmFromEnv } from './lib/foundrySmokeArms.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SYSTEMS_DIR = join(ROOT, '.foundry-e2e', 'systems');
const SYSTEMS_CACHE_DIR = join(ROOT, '.foundry-e2e', 'systems-cache');

const ARM = resolveSmokeArmFromEnv();
const SYSTEMS = ARM.systems;

/** Where `unzip` lives on the platforms this runs on. Fixed paths, never `$PATH`. */
const UNZIP_PATHS = Object.freeze(['/usr/bin/unzip', '/bin/unzip', '/usr/local/bin/unzip']);

/** Resolve an extractor to an absolute path, refusing to fall back to `$PATH`. */
function requireExecutable(name, candidates, id) {
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;
  throw new Error(
    `cannot extract ${id}: no ${name} found at ${candidates.join(', ')}. ` +
      'Install it, or extract the release archive by hand into .foundry-e2e/systems/.'
  );
}

/** Read the version out of an installed system manifest. */
function readInstalledVersion(manifest) {
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/** Move a staged directory into its final place. */
function swapIntoPlace(from, to) {
  try {
    renameSync(from, to);
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    cpSync(from, to, { recursive: true });
  }
}

/** Retain a fetched release under `.foundry-e2e/systems-cache/<id>@<version>/`. */
function retainInCache(id, version, source) {
  // An unreadable manifest yields a null version; caching under "id@null" would be a copy nothing
  // can ever match, so treat it as not worth keeping.
  if (!version) return;
  const cached = join(SYSTEMS_CACHE_DIR, `${id}@${version}`);
  if (existsSync(join(cached, 'system.json'))) return;
  mkdirSync(SYSTEMS_CACHE_DIR, { recursive: true });
  rmSync(cached, { recursive: true, force: true });
  cpSync(source, cached, { recursive: true });
  process.stdout.write(`Cached ${id}@${version} for arm switches.\n`);
}

/** Install a previously-fetched release from the cache, if it is there. */
function installFromCache(id, version, dest) {
  const cached = join(SYSTEMS_CACHE_DIR, `${id}@${version}`);
  if (readInstalledVersion(join(cached, 'system.json')) !== version) return false;
  rmSync(dest, { recursive: true, force: true });
  cpSync(cached, dest, { recursive: true });
  process.stdout.write(`System ${id}@${version} restored from the local cache.\n`);
  return true;
}

async function fetchSystem({ id, version, url }) {
  const dest = join(SYSTEMS_DIR, id);
  const manifest = join(dest, 'system.json');

  // Presence alone is not enough: a version bump here must actually take effect on a machine (or a
  // restored CI cache) that already holds the previous release, and the world fixture pins an exact
  // `systemVersion` that Foundry refuses to launch against a mismatch.
  if (existsSync(manifest)) {
    const installed = readInstalledVersion(manifest);
    if (installed === version) {
      process.stdout.write(`System ${id}@${version} already present, skipping.\n`);
      retainInCache(id, version, dest);
      return;
    }
    process.stdout.write(
      `System ${id}@${installed ?? 'unknown'} is present but ${version} is pinned; replacing.\n`
    );
    // Keep the outgoing version so switching back to the other arm costs a copy, not a download.
    retainInCache(id, installed, dest);
  }

  if (installFromCache(id, version, dest)) return;

  process.stdout.write(`Downloading ${id}@${version}...\n`);

  // Stage into a sibling directory and swap in only once the manifest is on disk.
  const staging = `${dest}.incoming`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const tmpZip = join(SYSTEMS_DIR, `${id}.zip`);
  const stagedManifest = join(staging, 'system.json');

  try {
    // Download zip
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Failed to download ${id}: ${response.status} ${response.statusText}`);
    }
    const fileStream = createWriteStream(tmpZip);
    await pipeline(response.body, fileStream);

    // Extract into staging, stripping the top-level dir if present.
    if (process.platform === 'win32') {
      const bsdtar = join(process.env.SystemRoot ?? String.raw`C:\Windows`, 'System32', 'tar.exe');
      execFileSync(requireExecutable(bsdtar, [bsdtar], id), ['-xf', tmpZip, '-C', staging], {
        cwd: ROOT,
        stdio: 'inherit',
      });
    } else {
      execFileSync(
        requireExecutable('unzip', UNZIP_PATHS, id),
        ['-o', '-q', tmpZip, '-d', staging],
        {
          cwd: ROOT,
        }
      );
    }

    // Some zips nest inside a subdirectory; detect and flatten
    const nestedDir = join(staging, id);
    const nestedManifest = join(nestedDir, 'system.json');
    if (!existsSync(stagedManifest) && existsSync(nestedManifest)) {
      for (const entry of readdirSync(nestedDir)) {
        renameSync(join(nestedDir, entry), join(staging, entry));
      }
      rmSync(nestedDir, { recursive: true, force: true });
    }

    if (!existsSync(stagedManifest)) {
      throw new Error(`Downloaded ${id} but system.json not found at ${stagedManifest}`);
    }

    rmSync(dest, { recursive: true, force: true });
    swapIntoPlace(staging, dest);
  } finally {
    rmSync(staging, { recursive: true, force: true });
    rmSync(tmpZip, { force: true });
  }

  retainInCache(id, version, dest);
  process.stdout.write(`System ${id}@${version} installed to ${dest}\n`);
}

async function main() {
  mkdirSync(SYSTEMS_DIR, { recursive: true });
  const pinnedSystems = SYSTEMS.map((system) => `${system.id}@${system.version}`).join(', ');
  process.stdout.write(`Smoke arm ${ARM.id} (Foundry ${ARM.foundryVersion}): ${pinnedSystems}\n`);

  for (const system of SYSTEMS) {
    await fetchSystem(system);
  }

  process.stdout.write('All systems ready.\n');
}

main().catch((err) => {
  process.stderr.write(`foundry-fetch-systems failed: ${err.message}\n`);
  process.exit(1);
});

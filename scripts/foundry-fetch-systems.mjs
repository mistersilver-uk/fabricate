/**
 * foundry-fetch-systems.mjs
 *
 * Downloads game systems required by the Foundry smoke-test world into
 * .foundry-e2e/systems/. Skips download if the system is already present.
 *
 * Usage: node scripts/foundry-fetch-systems.mjs
 *
 * Each entry in SYSTEMS defines a system ID, version, and the GitHub
 * release URL for its zip archive. Add new systems here as needed.
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SYSTEMS_DIR = join(ROOT, '.foundry-e2e', 'systems');

// dnd5e 5.3.3 is the first release that declares `verified: "14"`; 5.2.5 declared `verified: "13"`,
// which Foundry 14 loads but flags as unverified — and an unverified system is one of the two
// things that can put a blocking modal in front of the smoke's world launch.
const SYSTEMS = [
  {
    id: 'dnd5e',
    version: '5.3.3',
    url: 'https://github.com/foundryvtt/dnd5e/releases/download/release-5.3.3/dnd5e-release-5.3.3.zip',
  },
];

/** Where `unzip` lives on the platforms this runs on. Fixed paths, never `$PATH`. */
const UNZIP_PATHS = Object.freeze(['/usr/bin/unzip', '/bin/unzip', '/usr/local/bin/unzip']);

/**
 * Resolve an extractor to an absolute path, refusing to fall back to `$PATH`.
 *
 * Two reasons, one security and one correctness. `$PATH` is attacker-influenced on a shared or CI
 * machine, so resolving a spawned binary through it is a real exposure (SonarCloud S4036). And on
 * Windows it is not even correct: an MSYS or Git-Bash shell puts GNU tar ahead of bsdtar, and GNU
 * tar reads the `C:\...` destination as a remote host spec and dies with "Cannot connect to C" —
 * which is the failure the absolute path exists to avoid in the first place.
 *
 * @param {string} name Human-readable tool name, for the error.
 * @param {readonly string[]} candidates Fixed absolute paths, in preference order.
 * @param {string} id The system being extracted, for the error.
 * @returns {string} The first candidate that exists.
 * @throws {Error} When none does — louder and more fixable than a mystery spawn failure.
 */
function requireExecutable(name, candidates, id) {
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return found;
  throw new Error(
    `cannot extract ${id}: no ${name} found at ${candidates.join(', ')}. ` +
      'Install it, or extract the release archive by hand into .foundry-e2e/systems/.'
  );
}

/**
 * Read the version out of an installed system manifest.
 *
 * @param {string} manifest Absolute path to a `system.json`.
 * @returns {string|null} The installed version, or null when it cannot be read — a truncated or
 *   half-extracted manifest is treated as absent so the next run re-downloads rather than trusting it.
 */
function readInstalledVersion(manifest) {
  try {
    return JSON.parse(readFileSync(manifest, 'utf8')).version ?? null;
  } catch {
    return null;
  }
}

/**
 * Move a staged directory into its final place.
 *
 * Rename first: on POSIX it is atomic and instant, which is what CI wants. On Windows a rename of
 * the freshly-extracted tree fails with `EPERM` — deterministically, not transiently; retrying does
 * not help, and a small directory in the same parent renames fine, so it is the tree itself that
 * cannot be moved. A recursive copy of a system release takes about a second and always works, so
 * that is the fallback rather than a hard failure.
 *
 * @param {string} from Staged directory.
 * @param {string} to Destination directory.
 */
function swapIntoPlace(from, to) {
  try {
    renameSync(from, to);
  } catch (error) {
    if (error.code !== 'EPERM') throw error;
    cpSync(from, to, { recursive: true });
  }
}

async function fetchSystem({ id, version, url }) {
  const dest = join(SYSTEMS_DIR, id);
  const manifest = join(dest, 'system.json');

  // Presence alone is not enough: a version bump here must actually take effect on a machine (or a
  // restored CI cache) that already holds the previous release, and the world fixture pins an exact
  // `systemVersion` that Foundry refuses to launch against a mismatch. Read the manifest and
  // re-download when it names a different version.
  if (existsSync(manifest)) {
    const installed = readInstalledVersion(manifest);
    if (installed === version) {
      process.stdout.write(`System ${id}@${version} already present, skipping.\n`);
      return;
    }
    process.stdout.write(
      `System ${id}@${installed ?? 'unknown'} is present but ${version} is pinned; re-downloading.\n`
    );
  }

  process.stdout.write(`Downloading ${id}@${version}...\n`);

  // Stage into a sibling directory and swap in only once the manifest is on disk. Deleting `dest`
  // up front instead would make a failed download or a failed extract destroy a working install —
  // which it did, once, on the machine this re-download path was written.
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

    // Extract into staging, stripping the top-level dir if present. Windows uses the bsdtar that
    // ships at System32\tar.exe (build 17063+) and reads zip archives transparently; everything
    // else keeps unzip, so the CI command line is unchanged.
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

  process.stdout.write(`System ${id}@${version} installed to ${dest}\n`);
}

async function main() {
  mkdirSync(SYSTEMS_DIR, { recursive: true });

  for (const system of SYSTEMS) {
    await fetchSystem(system);
  }

  process.stdout.write('All systems ready.\n');
}

main().catch((err) => {
  process.stderr.write(`foundry-fetch-systems failed: ${err.message}\n`);
  process.exit(1);
});

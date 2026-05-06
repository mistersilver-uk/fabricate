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

import { existsSync, mkdirSync, createWriteStream, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SYSTEMS_DIR = join(ROOT, '.foundry-e2e', 'systems');

const SYSTEMS = [
  {
    id: 'dnd5e',
    version: '5.2.5',
    url: 'https://github.com/foundryvtt/dnd5e/releases/download/release-5.2.5/dnd5e-release-5.2.5.zip',
  },
];

async function fetchSystem({ id, version, url }) {
  const dest = join(SYSTEMS_DIR, id);
  const manifest = join(dest, 'system.json');

  if (existsSync(manifest)) {
    process.stdout.write(`System ${id}@${version} already present, skipping.\n`);
    return;
  }

  process.stdout.write(`Downloading ${id}@${version}...\n`);
  mkdirSync(dest, { recursive: true });

  const tmpZip = join(SYSTEMS_DIR, `${id}.zip`);

  // Download zip
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to download ${id}: ${response.status} ${response.statusText}`);
  }
  const fileStream = createWriteStream(tmpZip);
  await pipeline(response.body, fileStream);

  // Extract — unzip into dest, stripping top-level dir if present.
  // Windows ships bsdtar at C:\Windows\System32\tar.exe (build 17063+) which
  // transparently reads zip archives. Ubuntu keeps the existing unzip path so
  // the CI command line is byte-identical.
  if (process.platform === 'win32') {
    execFileSync('tar', ['-xf', tmpZip, '-C', dest], { cwd: ROOT, stdio: 'inherit' });
  } else {
    execFileSync('unzip', ['-o', '-q', tmpZip, '-d', dest], { cwd: ROOT });
  }

  // Some zips nest inside a subdirectory; detect and flatten
  const nestedDir = join(dest, id);
  const nestedManifest = join(nestedDir, 'system.json');
  if (!existsSync(manifest) && existsSync(nestedManifest)) {
    for (const entry of readdirSync(nestedDir)) {
      renameSync(join(nestedDir, entry), join(dest, entry));
    }
    rmSync(nestedDir, { recursive: true, force: true });
  }

  // Clean up zip
  rmSync(tmpZip, { force: true });

  if (!existsSync(manifest)) {
    throw new Error(`Downloaded ${id} but system.json not found at ${manifest}`);
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

main().catch(err => {
  process.stderr.write(`foundry-fetch-systems failed: ${err.message}\n`);
  process.exit(1);
});

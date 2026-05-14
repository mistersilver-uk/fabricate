/**
 * setup-dev-module.mjs
 *
 * Creates (or repairs) the link from Foundry's modules directory to this
 * repository root, so a running Foundry install sees the project as the
 * `fabricate` module. Intended for local development only — CI uses a
 * different flow (scripts/foundry-setup-data.mjs).
 *
 * Usage:
 *   node scripts/setup-dev-module.mjs           # idempotent: create or no-op
 *   node scripts/setup-dev-module.mjs --force   # repoint a wrong-target link
 *
 * Env vars:
 *   FOUNDRY_DATA_PATH  Path to Foundry's Data directory. Overrides defaults.
 *
 * Platform defaults for Foundry's Data directory:
 *   Windows: %LOCALAPPDATA%\FoundryVTT\Data
 *   macOS:   ~/Library/Application Support/FoundryVTT/Data
 *   Linux:   ~/.local/share/FoundryVTT/Data
 *
 * Link type: directory junction on Windows (no admin / Developer Mode
 * needed), symlink on Linux and macOS.
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function resolveDataDir() {
  if (process.env.FOUNDRY_DATA_PATH) {
    return resolve(process.env.FOUNDRY_DATA_PATH);
  }
  const home = homedir();
  switch (platform()) {
    case 'win32':
      return join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'FoundryVTT', 'Data');
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'FoundryVTT', 'Data');
    default:
      return join(home, '.local', 'share', 'FoundryVTT', 'Data');
  }
}

function readModuleId() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'module.json'), 'utf8'));
  if (!manifest.id || typeof manifest.id !== 'string') {
    throw new Error('module.json is missing a string "id" field');
  }
  return manifest.id;
}

function normalize(p) {
  // Windows junctions occasionally surface a \\?\ device prefix; strip it
  // so the link-target comparison matches the user-facing path form.
  const stripped = p.startsWith('\\\\?\\') ? p.slice(4) : p;
  return resolve(stripped);
}

function pathsEqual(a, b) {
  const na = normalize(a);
  const nb = normalize(b);
  return platform() === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

function createLink(linkPath, target) {
  mkdirSync(dirname(linkPath), { recursive: true });
  const type = platform() === 'win32' ? 'junction' : 'dir';
  symlinkSync(target, linkPath, type);
}

function main() {
  const force = process.argv.slice(2).includes('--force');
  const moduleId = readModuleId();
  const dataDir = resolveDataDir();
  const linkPath = join(dataDir, 'modules', moduleId);
  const target = ROOT;

  process.stdout.write(`Module id:       ${moduleId}\n`);
  process.stdout.write(`Foundry Data:    ${dataDir}\n`);
  process.stdout.write(`Link path:       ${linkPath}\n`);
  process.stdout.write(`Repo root:       ${target}\n`);

  let stat;
  try {
    stat = lstatSync(linkPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  if (!stat) {
    createLink(linkPath, target);
    process.stdout.write(`Created link → ${normalize(realpathSync(linkPath))}\n`);
    return 0;
  }

  if (stat.isSymbolicLink()) {
    let current;
    try {
      current = readlinkSync(linkPath);
    } catch (err) {
      process.stderr.write(`Could not read existing link: ${err.message}\n`);
      return 1;
    }

    if (pathsEqual(current, target)) {
      process.stdout.write(`Already linked → ${normalize(current)}\n`);
      return 0;
    }

    if (!force) {
      process.stderr.write(
        `Link exists but points elsewhere:\n  current → ${normalize(current)}\n  wanted  → ${target}\n` +
          `Re-run with --force to repoint.\n`,
      );
      return 1;
    }

    unlinkSync(linkPath);
    createLink(linkPath, target);
    process.stdout.write(`Repointed link → ${normalize(realpathSync(linkPath))}\n`);
    return 0;
  }

  // A real directory or file lives at linkPath — refuse to clobber under any flag.
  process.stderr.write(
    `Refusing to clobber non-link path at:\n  ${linkPath}\n` +
      `Remove it manually (back up first if it holds anything you care about), then re-run.\n`,
  );
  return 1;
}

process.exit(main());

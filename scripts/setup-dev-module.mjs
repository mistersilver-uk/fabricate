/**
 * setup-dev-module.mjs
 *
 * Creates (or repairs) the link from Foundry's modules directory to this
 * repository, so a running Foundry install sees the project as the `fabricate`
 * module. Intended for local development only — CI uses a different flow
 * (scripts/foundry-setup-data.mjs).
 *
 * Two link targets are supported:
 *   - the repo ROOT (default), for a Foundry data dir that loads the source
 *     manifest directly; and
 *   - the built `dist/` output (`--dist`/`--dev`), matching the desktop "dev"
 *     workflow where every module junction points at a repo's `dist` folder.
 *     Run `npm run build` first so `dist/module.json` exists.
 *
 * Usage:
 *   node scripts/setup-dev-module.mjs                 # default dir → repo root
 *   node scripts/setup-dev-module.mjs --force         # repoint a wrong-target link
 *   node scripts/setup-dev-module.mjs --dist          # link → dist/ instead of root
 *   node scripts/setup-dev-module.mjs --dev --force   # FoundryVTT-dev data dir + dist
 *
 * Env vars:
 *   FOUNDRY_DATA_PATH  Foundry's user-data path. Accepts either the user-data
 *                      ROOT (what Foundry's `--dataPath` takes, e.g.
 *                      %LOCALAPPDATA%\FoundryVTT-dev) or its `Data`
 *                      subdirectory — both resolve to the same modules dir.
 *                      Overrides the platform default and `--dev`.
 *
 * Platform defaults for Foundry's user-data ROOT (a `Data` subdir is appended):
 *   Windows: %LOCALAPPDATA%\FoundryVTT      (--dev → %LOCALAPPDATA%\FoundryVTT-dev)
 *   macOS:   ~/Library/Application Support/FoundryVTT
 *   Linux:   ~/.local/share/FoundryVTT
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
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * Normalize any Foundry user-data path to its `Data/` directory. Accepts the
 * user-data ROOT (the value Foundry's `--dataPath` takes, which contains
 * `Data/`, `Config/`, `Logs/`) or the `Data` dir itself, so callers can pass
 * whichever they have on hand.
 */
function toDataDir(userPath) {
  const resolved = resolve(userPath);
  if (basename(resolved).toLowerCase() === 'data') return resolved;
  if (existsSync(join(resolved, 'Data'))) return join(resolved, 'Data');
  // Back-compat: assume the caller already pointed at the Data dir.
  return resolved;
}

function resolveDataDir({ dev }) {
  if (process.env.FOUNDRY_DATA_PATH) {
    return toDataDir(process.env.FOUNDRY_DATA_PATH);
  }
  const home = homedir();
  // The desktop "dev" launcher uses a sibling FoundryVTT-dev user-data dir.
  const winFolder = dev ? 'FoundryVTT-dev' : 'FoundryVTT';
  switch (platform()) {
    case 'win32':
      return join(process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), winFolder, 'Data');
    case 'darwin':
      return join(home, 'Library', 'Application Support', dev ? 'FoundryVTT-dev' : 'FoundryVTT', 'Data');
    default:
      return join(home, '.local', 'share', dev ? 'FoundryVTT-dev' : 'FoundryVTT', 'Data');
  }
}

function readModuleId() {
  // Always read the id from the source manifest, even when linking dist/.
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
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  // `--dev` selects the FoundryVTT-dev data dir AND implies a dist/ link, since
  // that data dir's modules are junctions to built output.
  const dev = args.includes('--dev');
  const useDist = dev || args.includes('--dist');

  const moduleId = readModuleId();
  const dataDir = resolveDataDir({ dev });
  const linkPath = join(dataDir, 'modules', moduleId);
  const target = useDist ? join(ROOT, 'dist') : ROOT;

  process.stdout.write(`Module id:       ${moduleId}\n`);
  process.stdout.write(`Foundry Data:    ${dataDir}\n`);
  process.stdout.write(`Link path:       ${linkPath}\n`);
  process.stdout.write(`Link target:     ${target}${useDist ? ' (dist)' : ''}\n`);

  // Linking dist/ is pointless until it has been built; fail early with a fix.
  if (useDist && !existsSync(join(target, 'module.json'))) {
    process.stderr.write(
      `No built module at:\n  ${target}\n` +
        `Run \`npm run build\` to generate dist/, then re-run this command.\n`,
    );
    return 1;
  }

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

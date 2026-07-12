/**
 * Local release build script for Fabricate.
 * Assembles a fully runnable FoundryVTT module inside dist/.
 *
 * Usage:
 *   node scripts/release.js              # build + zip
 *   node scripts/release.js --no-zip    # build without zip
 *   node scripts/release.js --validate-only  # validate existing dist/
 *   node scripts/release.js --version 1.2.3  # inject version into module.json, then build
 *   node scripts/release.js --dist-version 1.2.3  # inject version into dist/module.json only
 *
 * Future GitHub Actions note:
 *   This script is designed to be usable directly in a GitHub Actions workflow:
 *     - uses: actions/setup-node@v4
 *     - run: node scripts/release.js --no-zip
 *   The --no-zip flag avoids the zip dependency issue in CI; Actions can use
 *   upload-artifact or a dedicated zip step instead.
 *
 *   Semantic-release passes --version <tag> via release.config.js prepareCmd.
 *   The script updates module.json on disk before building so the dist/module.json
 *   contains the correct version string.
 *   S3 publishing passes --dist-version <tag> so the generated dist/ manifest
 *   gets the release version without touching source module.json.
 */

import { readFile, writeFile, mkdir, rm, cp, access, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ───────────────────────────────────────────────────────────────────────────
// Exported utility functions (also used by tests)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Rewrite a parsed module.json for placement in dist/.
 * - esmodules[]: strip leading 'dist/' prefix
 * - styles[]: keep unchanged
 * - languages[].path: keep unchanged
 * - packs[].path: normalize legacy '.db' suffixes to LevelDB directory paths
 * - All other fields: preserved
 *
 * @param {object} manifest - Parsed module.json object
 * @returns {object} New manifest object safe to write into dist/
 */
export function rewriteModuleJson(manifest) {
  const esmodules = (manifest.esmodules ?? []).map(p =>
    p.startsWith('dist/') ? p.slice('dist/'.length) : p
  );

  const packs = (manifest.packs ?? []).map(pack => ({
    ...pack,
    path: pack.path.endsWith('.db') ? pack.path.slice(0, -'.db'.length) : pack.path
  }));

  return {
    ...manifest,
    esmodules,
    styles: manifest.styles ?? [],
    languages: manifest.languages ?? [],
    packs
  };
}

/**
 * Return the list of relative file paths that must exist inside dist/
 * based on the (already-rewritten) manifest.
 *
 * @param {object} manifest - dist/-ready manifest (post rewriteModuleJson)
 * @returns {string[]}
 */
export function getRequiredFiles(manifest) {
  const files = ['module.json'];

  for (const p of manifest.esmodules ?? []) {
    files.push(p);
  }
  for (const p of manifest.styles ?? []) {
    files.push(p);
  }
  for (const lang of manifest.languages ?? []) {
    if (lang.path) files.push(lang.path);
  }
  for (const pack of manifest.packs ?? []) {
    if (pack.path) files.push(pack.path);
  }

  return files;
}

/**
 * Validate that dist/ contains all required files and a parseable module.json.
 *
 * @param {string} distDir - Absolute path to dist/
 * @param {object} srcManifest - Original (non-rewritten) manifest to derive requirements
 * @returns {Promise<{ valid: boolean, missing: string[], errors: string[] }>}
 */
export async function validateDist(distDir, srcManifest) {
  const missing = [];
  const errors = [];

  const distManifest = rewriteModuleJson(srcManifest);
  const required = getRequiredFiles(distManifest);

  for (const rel of required) {
    try {
      await access(join(distDir, rel));
    } catch {
      missing.push(rel);
    }
  }

  // Validate module.json is parseable
  try {
    const raw = await readFile(join(distDir, 'module.json'), 'utf8');
    JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // Already captured in missing above
    } else {
      errors.push(`module.json parse error: ${err.message}`);
    }
  }

  return {
    valid: missing.length === 0 && errors.length === 0,
    missing,
    errors
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Main script logic (runs only when invoked directly)
// ───────────────────────────────────────────────────────────────────────────

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(src, dest) {
  if (await fileExists(src)) {
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true });
    return true;
  }
  return false;
}

/**
 * Parse `--flag <value>` from an argv slice. Returns the value or null.
 *
 * @param {string[]} args
 * @param {string} flag
 * @returns {string|null}
 */
export function getFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return null;
}

/**
 * Resolve release-version flags. `--version` intentionally mutates source
 * module.json; `--dist-version` only changes generated release output.
 *
 * @param {string[]} args
 * @returns {{ sourceVersion: string|null, distVersion: string|null, releaseVersion: string|null }}
 */
export function parseReleaseVersionOptions(args) {
  const sourceVersion = getFlag(args, '--version');
  const distVersion = getFlag(args, '--dist-version');

  if (sourceVersion && distVersion) {
    throw new Error('--version and --dist-version are mutually exclusive');
  }

  return {
    sourceVersion,
    distVersion,
    releaseVersion: sourceVersion || distVersion
  };
}

async function main() {
  const args = argv.slice(2);
  const flags = new Set(args);
  const noZip = flags.has('--no-zip');
  const validateOnly = flags.has('--validate-only');
  // --analyze: opt-in bundle visualizer. Forwarded to the vite build subprocess
  // as ANALYZE=1 (cross-platform, no shell-specific env syntax); vite.config.js
  // only wires the visualizer plugin when ANALYZE=1 is set, so the default build
  // is byte-for-byte unaffected.
  const analyze = flags.has('--analyze');
  let versionOptions;
  try {
    versionOptions = parseReleaseVersionOptions(args);
  } catch (err) {
    console.error(err.message);
    exit(1);
  }
  const { sourceVersion, distVersion, releaseVersion } = versionOptions;

  const distDir = join(ROOT, 'dist');
  const manifestPath = join(ROOT, 'module.json');

  const manifestRaw = await readFile(manifestPath, 'utf8');
  let manifest = JSON.parse(manifestRaw);

  // --version: update module.json on disk before building
  if (sourceVersion) {
    console.log(`Injecting version ${sourceVersion} into module.json...`);
    manifest = { ...manifest, version: sourceVersion };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  } else if (distVersion) {
    console.log(`Injecting version ${distVersion} into dist/module.json only...`);
    manifest = { ...manifest, version: distVersion };
  }

  const { version } = manifest;

  if (validateOnly) {
    console.log('Validating existing dist/...');
    const result = await validateDist(distDir, manifest);
    if (result.valid) {
      console.log('dist/ is valid.');
    } else {
      if (result.missing.length > 0) {
        console.error('Missing files:');
        for (const f of result.missing) console.error(`  - ${f}`);
      }
      if (result.errors.length > 0) {
        console.error('Errors:');
        for (const e of result.errors) console.error(`  - ${e}`);
      }
      exit(1);
    }
    return;
  }

  // 1. Clean and recreate dist/
  console.log('Cleaning dist/...');
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  // 2. Run vite build
  console.log(`Running vite build${analyze ? ' (bundle analyzer enabled)' : ''}...`);
  // Opt the child vite build into the bundle analyzer via an inherited env var,
  // set on process.env (which execSync inherits) so the build command below is
  // left exactly as-is.
  if (analyze) {
    process.env.ANALYZE = '1';
  }
  execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

  // 3. Copy static assets
  console.log('Copying static assets...');

  await mkdir(join(distDir, 'styles'), { recursive: true });
  await cp(join(ROOT, 'styles', 'fabricate.css'), join(distDir, 'styles', 'fabricate.css'));

  await mkdir(join(distDir, 'lang'), { recursive: true });
  await cp(join(ROOT, 'lang', 'en.json'), join(distDir, 'lang', 'en.json'));

  await copyIfExists(join(ROOT, 'assets'), join(distDir, 'assets'));
  await copyIfExists(join(ROOT, 'LICENSE'), join(distDir, 'LICENSE'));
  await copyIfExists(join(ROOT, 'README.md'), join(distDir, 'README.md'));

  // 4. Generate dist/module.json
  console.log('Writing dist/module.json...');
  const distManifest = rewriteModuleJson(manifest);

  // Pin manifest and download URLs to the specific version tag
  if (releaseVersion) {
    const tag = `v${releaseVersion}`;
    const baseUrl = `https://github.com/mistersilver-uk/fabricate/releases/download/${tag}`;
    distManifest.manifest = `${baseUrl}/module.json`;
    distManifest.download = `${baseUrl}/fabricate-${tag}.zip`;
  }

  await writeFile(join(distDir, 'module.json'), JSON.stringify(distManifest, null, 2));

  // 5. Create release zip (unless --no-zip)
  if (!noZip) {
    const zipName = `fabricate-v${version}.zip`;
    console.log(`Creating ${zipName}...`);
    if (process.platform === 'win32') {
      execSync(`tar -a -c -f "${zipName}" --exclude="*.zip" --exclude="*.map" .`, {
        cwd: distDir,
        stdio: 'inherit',
      });
    } else {
      execSync(`zip -r "${zipName}" . --exclude "*.zip" --exclude "*.map"`, {
        cwd: distDir,
        stdio: 'inherit',
      });
    }
    console.log(`Created dist/${zipName}`);
  }

  // 6. Print validation summary
  console.log('\nValidating dist/...');
  const result = await validateDist(distDir, manifest);
  if (result.valid) {
    console.log('Build complete. dist/ is valid.');
  } else {
    console.error('Validation errors after build:');
    for (const f of result.missing) console.error(`  Missing: ${f}`);
    for (const e of result.errors) console.error(`  Error: ${e}`);
    exit(1);
  }
}

// Run main only when this file is invoked directly (not imported by tests)
const isMain = argv[1] && fileURLToPath(import.meta.url) === argv[1];
if (isMain) {
  main().catch(err => {
    console.error(err);
    exit(1);
  });
}

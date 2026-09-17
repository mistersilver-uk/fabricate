/**
 * Local release build script for Fabricate. Assembles a fully runnable FoundryVTT module inside
 * dist/.
 */

import { readFile, writeFile, mkdir, rm, cp, access, stat, readdir } from 'node:fs/promises';
import { basename, join, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';
import { verifyManagerChunkSplit } from './verify-manager-chunk-split.mjs';
import {
  ARCHIVE_GATE_SKIPPED_MESSAGE,
  archiveNameMismatchMessage,
  assertArchiveChunkCompleteness,
  isReleaseZipName,
  releaseZipName
} from './lib/releaseZipChunks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Exported utility functions (also used by tests)

/** Rewrite a parsed module.json for placement in dist/. */
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

/** Apply the release artefact's self-contained URLs to a dist/-ready manifest. */
export function applyReleaseUrls(manifest, releaseVersion) {
  const tag = `v${releaseVersion}`;
  const releasesBase = 'https://github.com/mistersilver-uk/fabricate/releases';
  manifest.manifest = `${releasesBase}/latest/download/module.json`;
  manifest.download = `${releasesBase}/download/${tag}/fabricate-${tag}.zip`;
  return manifest;
}

/**
 * Return the list of relative file paths that must exist inside dist/ based on the
 * (already-rewritten) manifest.
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

/** Validate that dist/ contains all required files and a parseable module.json. */
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

// Main script logic (runs only when invoked directly)

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
 * Prove the produced archive carries every module file its own entry script references, or say
 * plainly that the proof did not run (issue 1565).
 */
async function runArchiveChunkGate(distDir, builtManifest, version) {
  const zipPath = join(distDir, releaseZipName(version));
  if (!(await fileExists(zipPath))) {
    const present = (await readdir(distDir).catch(() => [])).filter(isReleaseZipName);
    if (present.length > 0) {
      console.error(archiveNameMismatchMessage(releaseZipName(version), present.sort()));
      exit(1);
    }
    console.log(`\n${ARCHIVE_GATE_SKIPPED_MESSAGE}`);
    return;
  }

  console.log('\nVerifying archive chunk completeness...');
  try {
    const proved = assertArchiveChunkCompleteness({ zipPath, manifest: builtManifest });
    console.log(
      // "reachable from", not "referenced from": the count is the TRANSITIVE closure, which
      // includes chunks the entry never names itself (measured on a real dist/, one chunk is
      // reachable only through another). "referenced from" would understate what was proved.
      `Archive chunk completeness OK: ${basename(zipPath)} carries all ` +
      `${proved.referenced.length} file(s) reachable from ${proved.entryNames.join(', ')}.`
    );
  } catch (err) {
    console.error(err.message);
    exit(1);
  }
}

/** Parse `--flag <value>` from an argv slice. Returns the value or null. */
export function getFlag(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) {
    return args[idx + 1];
  }
  return null;
}

/**
 * Resolve release-version flags. `--version` intentionally mutates source module.json;
 * `--dist-version` only changes generated release output.
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
  // --analyze: opt-in bundle visualizer.
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
    if (!result.valid) {
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
    console.log('dist/ is valid.');
    // The archive gate reads the manifest that SHIPPED in dist/ rather than re-deriving one from
    // the tracked source: the archive's own entry script is what has to be located inside it.
    // validateDist above has already proved this file exists and parses.
    const builtManifest = JSON.parse(await readFile(join(distDir, 'module.json'), 'utf8'));
    await runArchiveChunkGate(distDir, builtManifest, version);
    return;
  }

  // 1. Clean and recreate dist/
  console.log('Cleaning dist/...');
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  // 2. Run vite build
  console.log(`Running vite build${analyze ? ' (bundle analyzer enabled)' : ''}...`);
  // Opt the child vite build into the bundle analyzer via an inherited env var, set on process.env
  // (which execSync inherits) so the build command below is left exactly as-is.
  if (analyze) {
    process.env.ANALYZE = '1';
  }
  // Bake the version this script is shipping into the bundle (issue 1565), from the same `version`
  // binding written into dist/module.json below, so the baked and shipped versions cannot disagree.
  process.env.FABRICATE_BUILD_VERSION = version;
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

  // Bake the release artefact's self-contained URLs: a LATEST-release manifest (not version-pinned,
  // so no per-update rewrite prompt) and a version-pinned download. See applyReleaseUrls.
  if (releaseVersion) {
    applyReleaseUrls(distManifest, releaseVersion);
  }

  await writeFile(join(distDir, 'module.json'), JSON.stringify(distManifest, null, 2));

  // 5. Create release zip (unless --no-zip)
  if (!noZip) {
    const zipName = releaseZipName(version);
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

  // Issue #150: prove the GM-only manager subtree stayed out of the eager entry
  // and landed in a separate on-demand chunk. Reads the dist/ we just wrote.
  console.log('\nVerifying deferred manager chunk split...');
  const splitResult = verifyManagerChunkSplit(distDir);
  if (splitResult.ok) {
    console.log('Manager chunk split OK: dist/main.js is free of the manager subtree.');
  } else {
    console.error('Manager chunk split gate FAILED:');
    for (const e of splitResult.errors) console.error(`  - ${e}`);
    exit(1);
  }

  // Issue 1565: prove the archive — not dist/, which the two checks above cover — carries every
  // file its own entry script references.
  await runArchiveChunkGate(distDir, distManifest, version);
}

// Run main only when this file is invoked directly (not imported by tests)
const isMain = argv[1] && fileURLToPath(import.meta.url) === argv[1];
if (isMain) {
  main().catch(err => {
    console.error(err);
    exit(1);
  });
}

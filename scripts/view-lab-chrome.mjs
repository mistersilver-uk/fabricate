#!/usr/bin/env node
/**
 * View Lab window-chrome cache CLI: `harvest` / `verify` / `status` / `clean`.
 *
 * The chrome the View Lab draws is Foundry's, harvested into the gitignored `.foundry-chrome/`
 * from Foundry the maintainer already licensed: by default the release archive
 * `npm run test:foundry:up` caches under `.foundry-e2e/cache/`, or with `--from-dir` an unpacked
 * desktop installation. See `scripts/lib/foundryChromeCache.js` for the licensing posture and for
 * why only an archive harvest may write provenance; nothing this command writes is ever committed.
 *
 *   node scripts/view-lab-chrome.mjs harvest [--force] [--write-provenance]
 *   node scripts/view-lab-chrome.mjs harvest --from-dir "C:\\Program Files\\Foundry Virtual Tabletop"
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHROME_CACHE_DIRNAME,
  PROVENANCE_PATH,
  assertProvenanceWritable,
  buildProvenance,
  discoverArchive,
  harvestChrome,
  missingChromeMessage,
  readProvenance,
  resolveChromeCache,
  verifyChromeCache,
} from './lib/foundryChromeCache.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Flags that carry a value. `--from-dir` is separated out because a Windows installation path
 * contains spaces, so it has to be usable as `--from-dir "C:\Program Files\..."` — two argv
 * entries — as well as in the `--flag=value` form the other options use.
 */
const VALUE_FLAGS = new Set(['foundry-version', 'from-dir']);

function parseArgs(argv) {
  const args = {
    command: 'status',
    force: false,
    writeProvenance: false,
    version: undefined,
    fromDir: undefined,
  };
  let pendingFlag = null;
  for (const raw of argv) {
    if (pendingFlag) {
      args[pendingFlag] = raw;
      pendingFlag = null;
      continue;
    }
    if (!raw.startsWith('--')) {
      args.command = raw;
      continue;
    }
    const [flag, value] = raw.slice(2).split(/=(.*)/s);
    switch (flag) {
      case 'force': {
        args.force = true;
        break;
      }
      case 'write-provenance': {
        args.writeProvenance = true;
        break;
      }
      case 'foundry-version': {
        if (value === undefined) pendingFlag = 'version';
        else args.version = value;
        break;
      }
      case 'from-dir': {
        if (value === undefined) pendingFlag = 'fromDir';
        else args.fromDir = value;
        break;
      }
      default: {
        throw new Error(`unknown flag --${flag}`);
      }
    }
  }
  if (pendingFlag) throw new Error(`--${[...VALUE_FLAGS].join('/--')} needs a value`);
  return args;
}

function commandHarvest(args) {
  const cache = harvestChrome({
    repoRoot: ROOT,
    fromDir: args.fromDir,
    force: args.force,
    log: (m) => console.log(m),
  });
  if (args.writeProvenance) {
    // Throws for anything but a release-archive harvest, because CI verifies these digests against
    // its own archive harvest and an installation's bytes differ from the archive's.
    assertProvenanceWritable(cache);
    const provenance = buildProvenance(cache);
    const provenancePath = join(ROOT, PROVENANCE_PATH);
    mkdirSync(dirname(provenancePath), { recursive: true });
    writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
    console.log(`wrote ${PROVENANCE_PATH} for Foundry ${provenance.foundryVersion}`);
  }
  return 0;
}

function commandVerify(args) {
  const cache = resolveChromeCache(ROOT, args.version);
  if (!cache) {
    console.error(missingChromeMessage(ROOT));
    return 1;
  }
  const { ok, problems } = verifyChromeCache(cache);
  if (!ok) {
    console.error(`chrome cache ${cache.version} is not intact:`);
    for (const problem of problems) console.error(`  ${problem}`);
    console.error('Re-run: npm run viewlab:chrome:harvest -- --force');
    return 1;
  }
  const provenance = readProvenance(ROOT);
  if (provenance && provenance.foundryVersion !== cache.version) {
    console.warn(
      `note: harvested Foundry ${cache.version} but ${PROVENANCE_PATH} records ${provenance.foundryVersion}.\n` +
        'Re-run with --write-provenance and review the frame-builder drift test.'
    );
  }
  console.log(
    `chrome cache ${cache.version} verified: ${cache.manifest.assets.length} files intact`
  );
  return 0;
}

function commandStatus(args) {
  const archive = discoverArchive(ROOT);
  console.log(
    `release archive : ${archive ? `${archive.name} (${archive.version})` : 'not found'}`
  );
  const cache = resolveChromeCache(ROOT, args.version);
  if (!cache) {
    console.log(`harvested cache : none under ${CHROME_CACHE_DIRNAME}/`);
    return 0;
  }
  const { ok, problems } = verifyChromeCache(cache);
  console.log(
    `harvested cache : ${cache.version} (${cache.manifest.assets.length} files, ${ok ? 'intact' : `${problems.length} problems`})`
  );
  console.log(`harvested at    : ${cache.manifest.harvestedAt}`);
  const provenance = readProvenance(ROOT);
  console.log(
    `tracked record  : ${provenance ? `Foundry ${provenance.foundryVersion}` : 'absent'}`
  );
  return 0;
}

function commandClean() {
  const root = join(ROOT, CHROME_CACHE_DIRNAME);
  if (!existsSync(root)) {
    console.log('nothing to clean');
    return 0;
  }
  rmSync(root, { recursive: true, force: true });
  console.log(`removed ${CHROME_CACHE_DIRNAME}/`);
  return 0;
}

const COMMANDS = {
  harvest: commandHarvest,
  verify: commandVerify,
  status: commandStatus,
  clean: commandClean,
};

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = COMMANDS[args.command];
  if (!command) {
    console.error(
      `unknown command "${args.command}"; expected one of ${Object.keys(COMMANDS).join(', ')}`
    );
    return 1;
  }
  return command(args);
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

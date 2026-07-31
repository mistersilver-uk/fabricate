/**
 * Harvest Foundry's real window chrome out of the maintainer's own licensed installation
 * (issue: full-window View Lab).
 *
 * The View Lab renders whole Fabricate application windows. Everything outside
 * `.window-content` — the header, title, icon, header controls, resize handle, the `@layer`
 * cascade those sit in, and the Signika / Modesto / Font Awesome faces they paint with — is
 * Foundry's, not ours. Rather than hand-approximate it (which is what got the first attempt
 * closed), the lab reads the genuine article from the release archive that
 * `scripts/foundry-test-up.mjs` already caches under `.foundry-e2e/cache/`.
 *
 * LICENSING. Everything this module writes is proprietary to Foundry (and, for Font Awesome 6
 * Pro and Modesto Condensed, to third parties Foundry licenses from). It lands in the
 * gitignored `.foundry-chrome/` and is NEVER committed, published, or downloaded on the user's
 * behalf. `tests/view-lab-chrome-license.test.js` is the enforcement.
 *
 * The cache lives at the repository root rather than under `.foundry-e2e/`, so the smoke
 * harness's assemble and `--clean` teardown paths can never reach it.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';

import { listEntries, readEntries } from './zipRead.js';

export const CHROME_CACHE_DIRNAME = '.foundry-chrome';
export const PROVENANCE_PATH = 'tests/view-lab/chrome-provenance.json';
export const PROVENANCE_SCHEMA_VERSION = 1;

/** The two stylesheets Foundry's game view loads, in `Express.CORE_VIEW_STYLES` order. */
const ENTRY_STYLESHEETS = ['public/css/foundry2.css', 'public/fonts/fontawesome/css/all.min.css'];

/**
 * Non-stylesheet members the lab needs. `application.mjs` is the anti-drift source of truth for
 * the frame markup; `lang/en.json` carries the `APPLICATION.TOOLS.*` labels the header controls
 * are titled with.
 */
const EXTRA_MEMBERS = ['client/applications/api/application.mjs', 'public/lang/en.json'];

/**
 * Whole subtrees to harvest beyond the stylesheet closure.
 *
 * `public/icons/` is Foundry's core art — ~6300 files, ~40 MB compressed. It is here because item
 * thumbnails are load-bearing for a screenshot: the first View Lab attempt fulfilled every
 * unresolvable image with a 1x1 transparent PNG, which renders as blank squares AND collapses the
 * intrinsic dimensions of anything sized by its image. Serving the genuine art is what makes a
 * populated window look populated. `AGENTS.md` already requires fixture data to use real Foundry
 * or dnd5e raster icon paths rather than invented preview art; this is what makes that possible
 * without Foundry running.
 */
const EXTRA_TREES = ['public/icons/'];

const ARCHIVE_NAME_PATTERN = /^foundryvtt-(\d+\.\d+(?:\.\d+)?)\.zip$/;
const CSS_URL_PATTERN = /url\(\s*(["']?)([^"')]+)\1\s*\)/g;

/**
 * Chromium never falls back past woff2, so the parallel `.ttf`/`.woff`/`.eot` sets in a
 * `src:` list only cost disk — Font Awesome alone ships ~25 MB of them. Scoped to `fonts/`
 * paths on purpose: `.svg` is a font format in an `@font-face` list but an ordinary image
 * everywhere else, and an unscoped extension test silently drops Foundry's `icons/svg/d20-grey.svg`
 * and friends.
 */
const REDUNDANT_FONT_PATTERN = /(^|\/)fonts\/.*\.(ttf|eot|svg|otf|woff)$/i;

/**
 * Map an archive member name onto its path inside the cache. Foundry serves `public/` at the
 * web root, so stripping that prefix is what makes `foundry2.css`'s `url("../ui/parchment.jpg")`
 * resolve unchanged once the cache is mounted at a URL prefix.
 *
 * @param {string} memberName Archive-relative member name.
 * @returns {string} Cache-relative path.
 */
export function cachePathForMember(memberName) {
  return memberName.startsWith('public/') ? memberName.slice('public/'.length) : memberName;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Resolve a CSS `url()` reference against the stylesheet that contains it, staying inside the
 * archive's member namespace. Absolute, protocol-relative, and `data:`/`#` references are not
 * archive members and are skipped.
 *
 * @param {string} sheetMemberName Archive-relative name of the stylesheet.
 * @param {string} reference The raw `url()` payload.
 * @returns {string|null} Archive-relative member name, or null when it is not one.
 */
function resolveCssReference(sheetMemberName, reference) {
  const cleaned = reference.split('?', 1)[0].split('#', 1)[0].trim();
  if (!cleaned) return null;
  if (/^(data:|https?:|\/\/)/i.test(cleaned)) return null;
  if (cleaned.startsWith('/')) return posix.normalize(`public${cleaned}`);
  return posix.normalize(posix.join(posix.dirname(sheetMemberName), cleaned));
}

/**
 * Compute the transitive `url()` closure of the entry stylesheets. Deliberately computed rather
 * than hard-coded: a hand-written asset list rots silently the first time Foundry references a
 * new background or face, and the failure mode is a subtly wrong screenshot.
 *
 * @param {Map<string, Buffer>} sheets Inflated stylesheet bytes keyed by member name.
 * @returns {{assets: Set<string>, skipped: string[]}}
 */
export function computeStyleClosure(sheets) {
  const assets = new Set();
  const skipped = [];
  for (const [memberName, buffer] of sheets) {
    const text = buffer.toString('utf8');
    for (const match of text.matchAll(CSS_URL_PATTERN)) {
      const member = resolveCssReference(memberName, match[2]);
      if (!member) continue;
      if (REDUNDANT_FONT_PATTERN.test(member)) {
        skipped.push(member);
        continue;
      }
      assets.add(member);
    }
  }
  return {
    assets,
    skipped: [...new Set(skipped)].sort((left, right) => left.localeCompare(right)),
  };
}

/**
 * Find the newest cached Foundry release archive.
 *
 * @param {string} repoRoot Absolute repository root.
 * @returns {{path: string, version: string}|null}
 */
export function discoverArchive(repoRoot) {
  const cacheDir = join(repoRoot, '.foundry-e2e', 'cache');
  if (!existsSync(cacheDir)) return null;
  const candidates = readdirSync(cacheDir)
    .map((name) => ({ name, match: ARCHIVE_NAME_PATTERN.exec(name) }))
    .filter((entry) => entry.match)
    .map((entry) => ({
      path: join(cacheDir, entry.name),
      version: entry.match[1],
      name: entry.name,
    }));
  if (candidates.length === 0) return null;
  // Newest version wins; a maintainer holding two builds gets the one the smoke would run.
  candidates.sort((a, b) => compareVersions(b.version, a.version));
  return candidates[0];
}

function compareVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let i = 0; i < Math.max(leftParts.length, rightParts.length); i++) {
    const diff = (leftParts[i] ?? 0) - (rightParts[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Locate an already-harvested cache.
 *
 * @param {string} repoRoot Absolute repository root.
 * @param {string} [version] Pin a specific version; otherwise the newest harvested one.
 * @returns {{dir: string, version: string, manifest: object}|null}
 */
export function resolveChromeCache(repoRoot, version) {
  const root = join(repoRoot, CHROME_CACHE_DIRNAME);
  if (!existsSync(root)) return null;
  const versions = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => (version ? name === version : /^\d+\.\d+/.test(name)))
    // Newest first, so a maintainer holding two harvested builds gets the current one.
    .sort((left, right) => compareVersions(right, left));
  for (const candidate of versions) {
    const dir = join(root, candidate);
    const manifestPath = join(dir, 'harvest-manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      return { dir, version: candidate, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) };
    } catch {
      // A truncated manifest means an interrupted harvest; treat it as absent so the next
      // harvest rebuilds rather than half-trusting it.
    }
  }
  return null;
}

/**
 * Verify a harvested cache is complete and unmodified.
 *
 * @param {{dir: string, manifest: object}} cache A cache from {@link resolveChromeCache}.
 * @returns {{ok: boolean, problems: string[]}}
 */
export function verifyChromeCache(cache) {
  const problems = [];
  for (const asset of cache.manifest.assets ?? []) {
    const path = join(cache.dir, asset.path);
    if (!existsSync(path)) {
      problems.push(`missing: ${asset.path}`);
      continue;
    }
    const actual = sha256(readFileSync(path));
    if (actual !== asset.sha256) problems.push(`modified: ${asset.path}`);
  }
  return { ok: problems.length === 0, problems };
}

/**
 * The fail-closed message. The View Lab never downloads Foundry, never falls back to an
 * approximation, and never renders half-chrome — a frame drawn without the real cascade is
 * worse than no frame, because it looks authoritative.
 *
 * @param {string} repoRoot Absolute repository root.
 * @returns {string}
 */
export function missingChromeMessage(repoRoot) {
  const archive = discoverArchive(repoRoot);
  return [
    'Fabricate View Lab: no harvested Foundry window chrome found.',
    '',
    'The View Lab draws real Foundry V13 window chrome - foundry2.css, Signika,',
    'Modesto Condensed, Font Awesome 6 Pro - harvested from YOUR OWN licensed Foundry',
    'installation. Those files are proprietary. This repository never commits them,',
    'never publishes them, and never downloads them for you.',
    '',
    'Looked for, in order:',
    `  1. harvested cache    ${CHROME_CACHE_DIRNAME}/<version>/                    (missing)`,
    `  2. release archive    .foundry-e2e/cache/foundryvtt-*.zip        (${archive ? `found ${archive.version} - run the harvest` : 'missing'})`,
    '',
    'Do ONE of:',
    '  npm run test:foundry:up',
    '      # populates .foundry-e2e/cache/foundryvtt-<version>.zip, then re-run',
    '  npm run viewlab:chrome:harvest',
    '',
    'Detail: scripts/README.md, "View Lab window chrome".',
  ].join('\n');
}

/**
 * Harvest the chrome from a release archive.
 *
 * @param {object} options Harvest options.
 * @param {string} options.repoRoot Absolute repository root.
 * @param {string} [options.archivePath] Explicit archive; discovered when omitted.
 * @param {boolean} [options.force] Re-harvest even when the cache verifies.
 * @param {(message: string) => void} [options.log] Progress sink.
 * @returns {{dir: string, version: string, manifest: object, reused: boolean}}
 */
export function harvestChrome({ repoRoot, archivePath, force = false, log = () => {} }) {
  const archive = archivePath
    ? {
        path: archivePath,
        version: ARCHIVE_NAME_PATTERN.exec(archivePath.split(/[\\/]/).pop())?.[1] ?? 'unknown',
      }
    : discoverArchive(repoRoot);
  if (!archive) throw new Error(missingChromeMessage(repoRoot));

  const existing = resolveChromeCache(repoRoot, archive.version);
  if (existing && !force && verifyChromeCache(existing).ok) {
    log(`chrome cache already harvested: ${CHROME_CACHE_DIRNAME}/${existing.version}`);
    return { ...existing, reused: true };
  }

  log(`harvesting Foundry ${archive.version} chrome from ${archive.path}`);
  const archiveSha = sha256(readFileSync(archive.path));

  const memberNames = new Set(listEntries(archive.path).map((entry) => entry.name));
  for (const required of [...ENTRY_STYLESHEETS, ...EXTRA_MEMBERS]) {
    if (!memberNames.has(required)) {
      throw new Error(
        `Foundry ${archive.version} does not contain ${required}. ` +
          'The View Lab chrome harvest is pinned to the Foundry V13 layout; a newer major ' +
          'may have moved it. Update ENTRY_STYLESHEETS/EXTRA_MEMBERS and re-verify the frame builder.'
      );
    }
  }

  const sheets = readEntries(archive.path, (name) => ENTRY_STYLESHEETS.includes(name));
  const { assets: closure, skipped } = computeStyleClosure(sheets);
  for (const member of closure) {
    if (!memberNames.has(member)) {
      throw new Error(`stylesheet references ${member}, which is not in the archive`);
    }
  }

  const wanted = new Set([...ENTRY_STYLESHEETS, ...EXTRA_MEMBERS, ...closure]);
  const inTree = (name) => EXTRA_TREES.some((prefix) => name.startsWith(prefix));
  const payload = readEntries(archive.path, (name) => wanted.has(name) || inTree(name));

  const dir = join(repoRoot, CHROME_CACHE_DIRNAME, archive.version);
  rmSync(dir, { recursive: true, force: true });

  const assets = [];
  // Tree members are summarised rather than enumerated: `public/icons/` alone is ~6300 files, and
  // a per-file digest list would push the COMMITTABLE provenance record from a few KB into the
  // megabytes. The rolling digest still detects any change to the set or its contents.
  const treeDigests = new Map(
    EXTRA_TREES.map((prefix) => [prefix, { files: 0, bytes: 0, hash: createHash('sha256') }])
  );
  for (const [memberName, buffer] of [...payload].sort(([a], [b]) => a.localeCompare(b))) {
    const relative = cachePathForMember(memberName);
    const target = join(dir, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, buffer);

    const treePrefix = EXTRA_TREES.find((prefix) => memberName.startsWith(prefix));
    const digest = sha256(buffer);
    if (treePrefix && !wanted.has(memberName)) {
      const summary = treeDigests.get(treePrefix);
      summary.files += 1;
      summary.bytes += buffer.length;
      summary.hash.update(`${relative}:${digest}\n`);
      continue;
    }
    assets.push({ path: relative.replaceAll('\\', '/'), bytes: buffer.length, sha256: digest });
  }
  const trees = [...treeDigests]
    .filter(([, summary]) => summary.files > 0)
    .map(([prefix, summary]) => ({
      prefix: cachePathForMember(prefix),
      files: summary.files,
      bytes: summary.bytes,
      sha256: summary.hash.digest('hex'),
    }));

  const manifest = {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    foundryVersion: archive.version,
    harvestedAt: new Date().toISOString(),
    source: {
      kind: 'release-archive',
      path: archive.path,
      name: archive.path.split(/[\\/]/).pop(),
      sha256: archiveSha,
    },
    skippedRedundantFontFormats: skipped,
    assets,
    trees,
  };
  writeFileSync(join(dir, 'harvest-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const treeFiles = trees.reduce((total, tree) => total + tree.files, 0);
  log(
    `harvested ${assets.length} chrome files + ${treeFiles} art files into ` +
      `${CHROME_CACHE_DIRNAME}/${archive.version}`
  );
  return { dir, version: archive.version, manifest, reused: false };
}

/**
 * Build the committable provenance record: metadata only, no licensed bytes. `harvestedAt` is
 * deliberately null — a timestamp would churn a tracked file on every harvest.
 *
 * @param {{manifest: object}} cache A harvested cache.
 * @returns {object}
 */
export function buildProvenance(cache) {
  const { manifest } = cache;
  const applicationMjs = manifest.assets.find(
    (asset) => asset.path === 'client/applications/api/application.mjs'
  );
  return {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    foundryVersion: manifest.foundryVersion,
    harvestedAt: null,
    source: {
      kind: manifest.source.kind,
      name: manifest.source.name,
      sha256: manifest.source.sha256,
    },
    chromeMarkup: { applicationMjsSha256: applicationMjs?.sha256 ?? null },
    assets: manifest.assets.map((asset) => ({
      path: asset.path,
      bytes: asset.bytes,
      sha256: asset.sha256,
    })),
    // Summarised, not enumerated — see the harvest. One rolling digest per tree keeps the
    // committable record a few KB while still detecting any change to the art set.
    trees: (manifest.trees ?? []).map((tree) => ({
      prefix: tree.prefix,
      files: tree.files,
      bytes: tree.bytes,
      sha256: tree.sha256,
    })),
  };
}

/**
 * Read the tracked provenance record, if present.
 *
 * @param {string} repoRoot Absolute repository root.
 * @returns {object|null}
 */
export function readProvenance(repoRoot) {
  const path = resolve(repoRoot, PROVENANCE_PATH);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

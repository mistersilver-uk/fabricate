/**
 * Harvest Foundry's real window chrome out of the maintainer's own licensed Foundry
 * (issue: full-window View Lab).
 *
 * The View Lab renders whole Fabricate application windows. Everything outside
 * `.window-content` — the header, title, icon, header controls, resize handle, the `@layer`
 * cascade those sit in, and the Signika / Modesto / Font Awesome faces they paint with — is
 * Foundry's, not ours. Rather than hand-approximate it (which is what got the first attempt
 * closed), the lab reads the genuine article from the release archive that
 * `scripts/foundry-test-up.mjs` already caches under `.foundry-e2e/cache/`.
 *
 * TWO SOURCES, ONE OF THEM AUTHORITATIVE. The default is the release archive
 * `scripts/foundry-test-up.mjs` caches under `.foundry-e2e/cache/`, downloaded by the operator's own
 * credentials. `--from-dir` reads an unpacked desktop installation instead, which renders
 * identically and needs no Docker — but it may not WRITE provenance, because the two disagree byte
 * for byte: the Windows installer ships `application.mjs` with CRLF where the release archive uses
 * LF. Same code, different digest. A provenance record written from an install would pin a digest CI
 * can never reproduce and would fail the drift gate on every later PR. See
 * {@link assertProvenanceWritable}.
 *
 * LICENSING. Everything this module writes is proprietary to Foundry (and, for Font Awesome Pro
 * and Modesto Condensed, to third parties Foundry licenses from). It lands in the
 * gitignored `.foundry-chrome/` and is NEVER committed, published, or downloaded on the user's
 * behalf. `tests/view-lab-chrome-license.test.js` is the enforcement.
 *
 * The cache lives at the repository root rather than under `.foundry-e2e/`, so the smoke
 * harness's assemble and `--clean` teardown paths can never reach it.
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path';

import { FOUNDRY_CHROME_SPEC } from './foundryChromeSpec.js';
import { listEntries, readEntries } from './zipRead.js';

/** The Foundry major whose file layout the member lists below were written against. */
const FOUNDRY_LAYOUT_MAJOR = FOUNDRY_CHROME_SPEC.coreMajor;

export const CHROME_CACHE_DIRNAME = '.foundry-chrome';
export const PROVENANCE_PATH = 'tests/view-lab/chrome-provenance.json';
export const PROVENANCE_SCHEMA_VERSION = 1;

/** The two stylesheets Foundry's game view loads, in `Express.CORE_VIEW_STYLES` order. */
const ENTRY_STYLESHEETS = ['public/css/foundry2.css', 'public/fonts/fontawesome/css/all.min.css'];

/**
 * Non-stylesheet members the lab needs. `application.mjs` is the anti-drift source of truth for
 * the window frame markup and `dialog.mjs` for the `DialogV2` frame Fabricate's confirmations open
 * inside it; `lang/en.json` carries the `APPLICATION.TOOLS.*` labels the header controls are
 * titled with.
 *
 * `dialog.mjs` is here for the same reason `application.mjs` is: a dialog drawn from anywhere else
 * would be a facsimile of Foundry chrome, which is the one thing this harness must never publish.
 * Drawn from Foundry's own module, under the same never-commit rule and the same drift gate, it is
 * the genuine article.
 */
const EXTRA_MEMBERS = [
  'client/applications/api/application.mjs',
  'client/applications/api/dialog.mjs',
  'public/lang/en.json',
];

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
/**
 * Three explicit alternatives rather than an optional quote plus a backreference.
 *
 * The previous form, `url\(\s*(["']?)([^"')]+)\1\s*\)`, pairs an optional capture with a negated
 * class that already excludes both quote characters, which is what makes its backtracking
 * superlinear. The input here is a 429 KB stylesheet, so that is a real cost rather than a
 * theoretical one. These alternatives are linear and say the same thing more plainly.
 */
const CSS_URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^"')\s]*))\s*\)/g;

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
      // Exactly one alternative matches per `url()`: double-quoted, single-quoted, or bare.
      const member = resolveCssReference(memberName, match[1] ?? match[2] ?? match[3]);
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
 * A place chrome can be read from. Both implementations answer the same four questions, so
 * {@link harvestChrome} does not branch on where the bytes came from.
 *
 * @typedef {object} ChromeSource
 * @property {string} version The Foundry build, `<major>.<build>`.
 * @property {{kind: string, path: string, name: string, sha256: string|null}} descriptor
 *   Recorded verbatim as the manifest's `source`.
 * @property {(memberName: string) => boolean} has Whether a member exists.
 * @property {(prefix: string) => string[]} listTree Member names under a prefix.
 * @property {(wanted: Set<string>) => Map<string, Buffer>} readMany Read members, in one pass.
 */

/**
 * Read chrome out of a Foundry release archive. This is the authoritative source: it is what CI
 * harvests, so it is the only one whose digests may be recorded as provenance.
 *
 * @param {{path: string, version: string}} archive A discovered archive.
 * @returns {ChromeSource}
 */
function openArchiveSource(archive) {
  const names = new Set(listEntries(archive.path).map((entry) => entry.name));
  // Memoized and LAZY. Digesting the archive means reading ~150 MB, and a source is opened before
  // the "already harvested, nothing to do" check — so computing it eagerly would charge a second
  // and a whole file read to every no-op harvest. Only the manifest needs it.
  let archiveDigest;
  return {
    version: archive.version,
    descriptor: {
      kind: 'release-archive',
      path: archive.path,
      name: basename(archive.path),
      get sha256() {
        archiveDigest ??= sha256(readFileSync(archive.path));
        return archiveDigest;
      },
    },
    has: (memberName) => names.has(memberName),
    listTree: (prefix) => [...names].filter((name) => name.startsWith(prefix)),
    readMany: (wanted) => readEntries(archive.path, (name) => wanted.has(name)),
  };
}

/** Recursively list files under a directory, as archive-style forward-slashed relative names. */
function listFilesUnder(root, directory) {
  if (!existsSync(directory)) return [];
  const found = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) found.push(relative(root, absolute).split(sep).join('/'));
    }
  }
  return found;
}

/**
 * Read chrome out of an unpacked Foundry installation.
 *
 * Accepts either the application directory itself or an installation root containing
 * `resources/app`, because "where Foundry is installed" means the latter to most people and the
 * former to the harvest. The layout below that point mirrors the archive exactly, which is what lets
 * {@link cachePathForMember} and the whole `url()` closure work unchanged.
 *
 * @param {string} fromDir Path given to `--from-dir`.
 * @returns {ChromeSource}
 */
function openDirectorySource(fromDir) {
  const candidates = [resolve(fromDir), resolve(fromDir, 'resources', 'app')];
  const root = candidates.find((candidate) =>
    existsSync(join(candidate, 'public', 'css', 'foundry2.css'))
  );
  if (!root) {
    throw new Error(
      `--from-dir ${fromDir} does not look like a Foundry installation: no ` +
        'public/css/foundry2.css under it or under its resources/app. Point it at the directory ' +
        'holding Foundry\'s "public" and "client" trees (on Windows, ' +
        String.raw`"C:\Program Files\Foundry Virtual Tabletop\resources\app").`
    );
  }

  const manifestPath = join(root, 'package.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`${root} has no package.json, so its Foundry version cannot be determined`);
  }
  const release = JSON.parse(readFileSync(manifestPath, 'utf8')).release ?? {};
  if (typeof release.generation !== 'number' || typeof release.build !== 'number') {
    throw new TypeError(
      `${manifestPath} does not carry a release.generation/release.build pair, so its Foundry ` +
        'version cannot be determined'
    );
  }

  return {
    version: `${release.generation}.${release.build}`,
    descriptor: {
      kind: 'local-install',
      path: root,
      name: basename(root),
      // Deliberately null. There is no single artefact to digest, and pretending otherwise would
      // put a meaningless hash where a reviewer expects a verifiable one.
      sha256: null,
    },
    has: (memberName) => {
      const path = join(root, memberName);
      return existsSync(path) && statSync(path).isFile();
    },
    listTree: (prefix) => listFilesUnder(root, join(root, prefix)),
    readMany: (wanted) =>
      new Map([...wanted].map((memberName) => [memberName, readFileSync(join(root, memberName))])),
  };
}

/**
 * Refuse to record provenance for a source whose bytes CI cannot reproduce.
 *
 * `tests/view-lab/chrome-provenance.json` is a human attestation that someone read Foundry's
 * `application.mjs` and confirmed the frame builder still transcribes it, and the digests in it are
 * checked on the CI runner that draws. CI harvests the release archive. A desktop installation is
 * the same Foundry but not the same bytes — the Windows installer rewrites line endings — so
 * committing an install-derived record would red the drift gate forever, on every later PR, for a
 * reason nothing in the failure message would explain.
 *
 * @param {{manifest: {source: {kind: string}, foundryVersion: string}}} cache A harvested cache.
 * @throws {Error} When the cache was not harvested from a release archive.
 */
export function assertProvenanceWritable(cache) {
  const { kind } = cache.manifest.source;
  if (kind === 'release-archive') return;
  throw new Error(
    [
      `refusing to write ${PROVENANCE_PATH} from a ${kind} harvest.`,
      '',
      'Provenance digests are verified on the CI runner, which harvests the release archive.',
      "A desktop installation is the same Foundry but not the same bytes (Windows' installer",
      'rewrites line endings), so a record written from one pins digests CI can never reproduce',
      'and fails the frame-builder drift gate on every later pull request.',
      '',
      `Harvest from the archive instead, then re-run with --write-provenance:`,
      '  npm run test:foundry:up      # caches .foundry-e2e/cache/foundryvtt-<version>.zip',
      '  npm run viewlab:chrome:harvest -- --force --write-provenance',
      '',
      '--from-dir remains fine for rendering: the frames it draws are identical.',
    ].join('\n')
  );
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
    // Newest first, so a maintainer holding two harvested builds gets the current one. Written as
    // ascending-then-reverse rather than by swapping the comparator's arguments: a comparator
    // called with its parameters transposed is indistinguishable from a bug at a glance, and is
    // reported as one.
    .sort(compareVersions)
    .toReversed();
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
    'The View Lab draws real Foundry window chrome - foundry2.css, Signika, Modesto',
    'Condensed, Font Awesome Pro. Those files are proprietary to Foundry and its',
    'licensors. This repository never commits them, never publishes them, and never',
    'downloads them for you: every source below is Foundry you already licensed.',
    '',
    'Looked for, in order:',
    `  1. harvested cache    ${CHROME_CACHE_DIRNAME}/<version>/                    (missing)`,
    `  2. release archive    .foundry-e2e/cache/foundryvtt-*.zip        (${archive ? `found ${archive.version} - run the harvest` : 'missing'})`,
    '',
    'Do ONE of:',
    '  npm run test:foundry:up',
    '      # your credentials download the release archive into .foundry-e2e/cache/,',
    '      # then: npm run viewlab:chrome:harvest',
    '  npm run viewlab:chrome:harvest -- --from-dir "<your Foundry installation>"',
    '      # reads an unpacked desktop install instead - no Docker, no credentials.',
    '      # Renders identically, but cannot record provenance: an install and the',
    '      # release archive hold the same code with different line endings, so their',
    '      # digests differ and CI could never reproduce an install-derived record.',
    '',
    'Detail: scripts/README.md, "View Lab window chrome".',
  ].join('\n');
}

/**
 * Harvest the chrome from a release archive or an unpacked installation.
 *
 * @param {object} options Harvest options.
 * @param {string} options.repoRoot Absolute repository root.
 * @param {string} [options.archivePath] Explicit archive; discovered when omitted.
 * @param {string} [options.fromDir] An unpacked Foundry installation, instead of an archive.
 * @param {boolean} [options.force] Re-harvest even when the cache verifies.
 * @param {(message: string) => void} [options.log] Progress sink.
 * @returns {{dir: string, version: string, manifest: object, reused: boolean}}
 */
export function harvestChrome({ repoRoot, archivePath, fromDir, force = false, log = () => {} }) {
  let source;
  if (fromDir) {
    source = openDirectorySource(fromDir);
  } else {
    const archive = archivePath
      ? {
          path: archivePath,
          version: ARCHIVE_NAME_PATTERN.exec(basename(archivePath))?.[1] ?? 'unknown',
        }
      : discoverArchive(repoRoot);
    if (!archive) throw new Error(missingChromeMessage(repoRoot));
    source = openArchiveSource(archive);
  }

  const existing = resolveChromeCache(repoRoot, source.version);
  if (existing && !force && verifyChromeCache(existing).ok) {
    log(`chrome cache already harvested: ${CHROME_CACHE_DIRNAME}/${existing.version}`);
    return { ...existing, reused: true };
  }

  log(`harvesting Foundry ${source.version} chrome from ${source.descriptor.path}`);

  for (const required of [...ENTRY_STYLESHEETS, ...EXTRA_MEMBERS]) {
    if (!source.has(required)) {
      throw new Error(
        `Foundry ${source.version} does not contain ${required}. ` +
          `The View Lab chrome harvest is written against the Foundry ${FOUNDRY_LAYOUT_MAJOR} ` +
          'layout; a newer major may have moved it. Update ENTRY_STYLESHEETS/EXTRA_MEMBERS and ' +
          're-verify the frame builder.'
      );
    }
  }

  const sheets = source.readMany(new Set(ENTRY_STYLESHEETS));
  const { assets: referenced, skipped } = computeStyleClosure(sheets);
  // A `url()` target Foundry ships a rule for but no file for is RECORDED, not fatal. Foundry 14's
  // Font Awesome 7 does exactly this: `all.min.css` still declares the `fa-v4compatibility`
  // @font-face while the webfont itself is gone. A face is fetched only when a glyph needs it, and
  // the renderer already fails any capture whose page issues a >=400 (see
  // scripts/view-lab-screenshots.mjs) — so the harvest records what is missing and the renderer
  // enforces it where it can actually tell. Throwing here instead would make a stale @font-face in
  // a third-party stylesheet block every screenshot in the repository.
  const closure = new Set([...referenced].filter((member) => source.has(member)));
  const unresolvedReferences = [...referenced]
    .filter((member) => !source.has(member))
    .sort((left, right) => left.localeCompare(right));
  if (unresolvedReferences.length > 0) {
    log(
      `note: ${unresolvedReferences.length} stylesheet url() reference(s) have no file in this ` +
        `Foundry build and were skipped: ${unresolvedReferences.join(', ')}`
    );
  }

  const wanted = new Set([...ENTRY_STYLESHEETS, ...EXTRA_MEMBERS, ...closure]);
  const treeMembers = EXTRA_TREES.flatMap((prefix) => source.listTree(prefix));
  const payload = source.readMany(new Set([...wanted, ...treeMembers]));

  const dir = join(repoRoot, CHROME_CACHE_DIRNAME, source.version);
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
    foundryVersion: source.version,
    harvestedAt: new Date().toISOString(),
    source: source.descriptor,
    skippedRedundantFontFormats: skipped,
    unresolvedReferences,
    assets,
    trees,
  };
  writeFileSync(join(dir, 'harvest-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const treeFiles = trees.reduce((total, tree) => total + tree.files, 0);
  log(
    `harvested ${assets.length} chrome files + ${treeFiles} art files into ` +
      `${CHROME_CACHE_DIRNAME}/${source.version}`
  );
  return { dir, version: source.version, manifest, reused: false };
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
  const digestOf = (path) => manifest.assets.find((asset) => asset.path === path)?.sha256 ?? null;
  return {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    foundryVersion: manifest.foundryVersion,
    harvestedAt: null,
    source: {
      kind: manifest.source.kind,
      name: manifest.source.name,
      sha256: manifest.source.sha256,
    },
    // One digest per module the frame builders were transcribed from. Two halves of one artefact:
    // rendering a newer module's behaviour through markup transcribed from an older build gives
    // genuine CSS around a stale DOM, and the PNG cannot tell you which.
    chromeMarkup: {
      applicationMjsSha256: digestOf('client/applications/api/application.mjs'),
      dialogMjsSha256: digestOf('client/applications/api/dialog.mjs'),
    },
    // Stylesheet `url()` targets this Foundry build declares but does not ship. Committed rather
    // than left in the gitignored manifest so the harvest's tolerance is auditable in review: a
    // silently-skipped reference is indistinguishable from a genuinely missing asset otherwise.
    unresolvedReferences: [...(manifest.unresolvedReferences ?? [])],
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

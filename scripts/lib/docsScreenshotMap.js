/**
 * The documentation screenshot map: one reader, shared by everything that consumes it.
 *
 * `docs/_data/screenshots.json` records which View Lab cases feed the documentation site, the
 * alternative text each one publishes, and the digest of the source frame the committed image was
 * encoded from. Three consumers read that file — the generator (`scripts/docs-screenshots.mjs`)
 * and the two tests that gate it — and a second parser would be a second opinion about the same
 * bytes. Anything that reads or writes the map does it through here.
 *
 * WHY JSON RATHER THAN YAML
 * -------------------------
 * The obvious shape for a Jekyll data file is YAML, and it was rejected: this repository declares
 * no YAML parser and ships no runtime dependencies at all, so YAML would need Jekyll's Psych and a
 * new devDependency to agree about one file, and `AGENTS.md` requires a new dependency to justify
 * itself. Jekyll reads `_data/*.json` natively and `JSON.parse` is already here, so the problem
 * does not need managing; it does not exist.
 *
 * WHY THE ASSET PATH IS DERIVED AND NEVER STORED
 * ----------------------------------------------
 * A stored path is a second name for a frame, and two names drift. The case id is the only name:
 * `labAssetPath` turns it into the committed asset's path, the include template builds the same
 * path from the same id, and the reverse gate enumerates the directory. There is nowhere for a
 * mapping to go stale because there is only one mapping.
 *
 * WHY GENERATED FRAMES SIT IN THEIR OWN DIRECTORY
 * -----------------------------------------------
 * `docs/img/screenshots/` holds the hand-curated frames that predate this generator, and the one
 * that remains shares the `fabricate-` prefix with five View Lab case ids. Mixed into one directory, the only way to
 * tell a generated frame from a curated one is "is it in the map", which reduces the reverse gate
 * to restating the map to itself. A real subdirectory makes that direction an enumeration of what
 * is actually on disk, so it can fail.
 */
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

/** Where the map lives, relative to the repository root. */
export const DOCS_SCREENSHOT_MAP_PATH = 'docs/_data/screenshots.json';

/** Where generated frames live, relative to the repository root. */
export const LAB_SCREENSHOT_DIRECTORY = 'docs/img/screenshots/lab';

/** The extension every generated frame is published as. */
export const LAB_ASSET_EXTENSION = '.webp';

/** The include template that declares a documentation image slot. */
export const SCREENSHOT_INCLUDE = 'screenshot.html';

/** A digest as this map records it: the source PNG's SHA-256, lowercase hex. */
export const SOURCE_DIGEST_PATTERN = /^[\da-f]{64}$/;

/** Authored documentation source extensions — the files an include call can appear in. */
export const DOC_TEXT_EXTENSIONS = Object.freeze(['.md', '.markdown', '.html']);

/**
 * One screenshot include tag, captured whole.
 *
 * Two-stage on purpose: this finds the tag, {@link INCLUDE_CASE_PATTERN} reads its `case`
 * parameter out of the body. One combined pattern would have to guess how the other parameters are
 * spelled, and a caption carrying an unexpected character would silently stop matching — which
 * reads as "this page references no frame" rather than as a broken pattern.
 */
export const SCREENSHOT_INCLUDE_PATTERN = /\{%-?\s*include\s+screenshot\.html\b([\S\s]*?)-?%\}/g;

/** The `case` parameter of an include tag body. */
export const INCLUDE_CASE_PATTERN = /\bcase\s*=\s*(["'])([\w-]+)\1/;

/**
 * The committed asset path for a case id, relative to the repository root, POSIX-separated.
 *
 * @param {string} caseId View Lab case id.
 * @returns {string} Repository-relative asset path.
 */
export function labAssetPath(caseId) {
  return `${LAB_SCREENSHOT_DIRECTORY}/${caseId}${LAB_ASSET_EXTENSION}`;
}

/**
 * The documentation screenshot map, parsed.
 *
 * @param {string} root Repository root.
 * @returns {Promise<{provenance: object, screenshots: object[]}>} The parsed map.
 */
export async function readDocsScreenshotMap(root) {
  const parsed = JSON.parse(await readFile(join(root, DOCS_SCREENSHOT_MAP_PATH), 'utf8'));
  return {
    provenance: parsed.provenance ?? {},
    screenshots: Array.isArray(parsed.screenshots) ? parsed.screenshots : [],
  };
}

/**
 * The map as it is committed: two-space JSON with a trailing newline.
 *
 * Serialisation lives beside the parse so a rewrite round-trips byte-identically. A generator that
 * reformatted the file on every run would rewrite all fifty entries to say nothing, which is the
 * unreviewable diff this whole change exists to avoid.
 *
 * @param {{provenance: object, screenshots: object[]}} map The map to serialise.
 * @returns {string} File contents.
 */
export function serializeDocsScreenshotMap(map) {
  const body = { provenance: map.provenance, screenshots: map.screenshots };
  return `${JSON.stringify(body, undefined, 2)}\n`;
}

/**
 * The provenance the map must carry for the frames beside it to be identifiable.
 *
 * Byte-stability is real within one install and not across installs. `playwright` is declared as a
 * caret range, so a lockfile refresh moves the Chromium build and its text rasterisation; the
 * harvested Foundry chrome is pinned by its own provenance record and rotates with a Foundry
 * release. Either event rewrites every frame with no visual change to review, so the set records
 * what produced it and a test holds the record to the toolchain.
 *
 * The Playwright version is read from the lockfile rather than from `node_modules`, because the
 * lockfile is the committed resolution of that caret range and is what a clean install reproduces.
 * Reading the installed copy would make this answer depend on when someone last installed.
 *
 * @param {string} root Repository root.
 * @returns {Promise<{foundryVersion: string, chromeSha256: string, playwrightVersion: string}>}
 *   The expected provenance header.
 */
export async function expectedProvenance(root) {
  const chrome = JSON.parse(
    await readFile(join(root, 'tests/view-lab/chrome-provenance.json'), 'utf8')
  );
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const playwrightVersion = lock.packages?.['node_modules/playwright']?.version;
  if (!playwrightVersion) {
    throw new Error(
      'package-lock.json records no resolved version for "playwright", so the provenance of a' +
        ' generated frame cannot be established — do not fall back to a guess here.'
    );
  }
  return {
    foundryVersion: chrome.foundryVersion,
    chromeSha256: chrome.source.sha256,
    playwrightVersion,
  };
}

/**
 * Authored documentation source files, skipping the directories a caller declares non-authored.
 *
 * Shared rather than copied: both gates walk the same population, and two walks that disagree
 * about what counts as an authored page would let one of them miss a reference the other sees.
 * The ignored set stays with each caller, because the two gates own different image populations
 * and each should say out loud which directories it refuses to read.
 *
 * @param {string} directory Absolute directory to walk.
 * @param {Set<string>} ignoredDirectories Directory names to skip at any depth.
 * @returns {Promise<string[]>} Absolute file paths.
 */
export async function collectDocSourceFiles(directory, ignoredDirectories) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) continue;
      files.push(...(await collectDocSourceFiles(join(directory, entry.name), ignoredDirectories)));
    } else if (DOC_TEXT_EXTENSIONS.includes(extname(entry.name).toLowerCase())) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

/**
 * Every case id an authored documentation page declares a slot for.
 *
 * An include tag whose `case` parameter cannot be read is reported rather than dropped. Silently
 * skipping it would make an unreadable slot look like a page that declares none, and the orphan
 * gate would then pass on a page nobody can see a frame on.
 *
 * @param {string} docsDirectory Absolute docs directory.
 * @param {Set<string>} ignoredDirectories Directory names to skip at any depth.
 * @returns {Promise<{referenced: Map<string, string[]>, unreadable: string[]}>} References by case
 *   id to the pages declaring them, plus any tag whose case could not be read.
 */
export async function collectSlotReferences(docsDirectory, ignoredDirectories) {
  const referenced = new Map();
  const unreadable = [];
  for (const file of await collectDocSourceFiles(docsDirectory, ignoredDirectories)) {
    const source = await readFile(file, 'utf8');
    for (const tag of source.matchAll(SCREENSHOT_INCLUDE_PATTERN)) {
      const parameter = INCLUDE_CASE_PATTERN.exec(tag[1]);
      if (!parameter) {
        unreadable.push(`${file}: ${tag[0].trim()}`);
        continue;
      }
      const pages = referenced.get(parameter[2]) ?? [];
      pages.push(file);
      referenced.set(parameter[2], pages);
    }
  }
  return { referenced, unreadable };
}

/**
 * The generated frames actually on disk, as file names.
 *
 * Non-recursive and extension-filtered: the reverse gate is an enumeration of one flat directory,
 * and a nested directory appearing under it is a question for whoever put it there rather than
 * something to quietly walk into.
 *
 * @param {string} root Repository root.
 * @returns {Promise<string[]>} Sorted asset file names.
 */
export async function listLabAssets(root) {
  const entries = await readdir(join(root, LAB_SCREENSHOT_DIRECTORY));
  return entries
    .filter((entry) => extname(entry).toLowerCase() === LAB_ASSET_EXTENSION)
    .sort((left, right) => left.localeCompare(right, 'en'));
}

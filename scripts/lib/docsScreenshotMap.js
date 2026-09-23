/** The documentation screenshot map: one reader, shared by everything that consumes it. */
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

/** One screenshot include tag, captured whole. */
export const SCREENSHOT_INCLUDE_PATTERN = /\{%-?\s*include\s+screenshot\.html\b([\S\s]*?)-?%\}/g;

/** The `case` parameter of an include tag body. */
export const INCLUDE_CASE_PATTERN = /\bcase\s*=\s*(["'])([\w-]+)\1/;

/** The committed asset path for a case id, relative to the repository root, POSIX-separated. */
export function labAssetPath(caseId) {
  return `${LAB_SCREENSHOT_DIRECTORY}/${caseId}${LAB_ASSET_EXTENSION}`;
}

/** The documentation screenshot map, parsed. */
export async function readDocsScreenshotMap(root) {
  const parsed = JSON.parse(await readFile(join(root, DOCS_SCREENSHOT_MAP_PATH), 'utf8'));
  return {
    provenance: parsed.provenance ?? {},
    screenshots: Array.isArray(parsed.screenshots) ? parsed.screenshots : [],
  };
}

/** The map as it is committed: two-space JSON with a trailing newline. */
export function serializeDocsScreenshotMap(map) {
  const body = { provenance: map.provenance, screenshots: map.screenshots };
  return `${JSON.stringify(body, undefined, 2)}\n`;
}

/** The provenance the map must carry for the frames beside it to be identifiable. */
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

/** Authored documentation source files, skipping the directories a caller declares non-authored. */
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

/** Every case id an authored documentation page declares a slot for. */
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

/** The generated frames actually on disk, as file names. */
export async function listLabAssets(root) {
  const entries = await readdir(join(root, LAB_SCREENSHOT_DIRECTORY));
  return entries
    .filter((entry) => extname(entry).toLowerCase() === LAB_ASSET_EXTENSION)
    .sort((left, right) => left.localeCompare(right, 'en'));
}

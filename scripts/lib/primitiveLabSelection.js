/**
 * Which design-library units a PR's changed files reach (issue 2413): catalogue rows, fixtures,
 * component paths, manifest entries and `library.html` drawings, each hunk located by content, and
 * the lab's own machinery as one unit per catalogue section. Widening is a union, never a
 * replacement. Dependency-free, so the `select` job runs it with no packages installed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CATALOGUE_DIRECTORY,
  catalogueFiles,
  parseCatalogueRows,
} from './primitiveLabCatalogue.js';
import {
  COVERAGE_KEY,
  LIBRARY_PATH,
  addressKey,
  parseTargetKey,
  rowKey,
  scanLibraryRegions,
  unlocatedKey,
} from './primitiveLabUnits.js';
import { normalizePath, parsePatch, touchedHunkRegionKeys } from './viewLabCases.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const MANIFEST_PATH = 'scripts/lib/designSystemPrimitives.json';

const CATALOGUE_FILE_PATTERN = /^tests\/view-lab\/primitives\/catalogue\/([^/]+)\.json$/;
const FIXTURE_FILE_PATTERN = /^tests\/view-lab\/primitives\/fixtures\/([^/]+)\.svelte$/;

/**
 * The lab's page, harness and capture machinery, and the repository files they import; pinned by
 * the import walk in `tests/primitive-lab-import-graph.test.js`.
 */
const MACHINERY_PATTERNS = Object.freeze([
  /^tests\/view-lab\/primitives(?:\.html$|\/)/,
  /^tests\/view-lab\/(?:vite\.config|servedFile|watchIgnore|foundryFrame|foundryDialog)\.js$/,
  /^tests\/view-lab\/(?:labI18n|rollPromptAnswer|world\/labFlags|foundry\/[^/]+)\.js$/,
  /^tests\/view-lab\/chrome-provenance\.json$/,
  /^scripts\/primitive-lab-[^/]+\.mjs$/,
  /^scripts\/lib\/primitiveLab[^/]*\.js$/,
  /^scripts\/lib\/(?:foundryChromeCache|foundryChromeSpec|zipRead)\.js$/,
  /^scripts\/lib\/(?:resolveExecutable|viewLabRenderPool)\.js$/,
  /^tests\/helpers\/designLibrary[^/]*\.js$/,
]);

/** Signal tiers, highest first; a key reached by several signals keeps the first that reached it. */
const SIGNAL_TIERS = Object.freeze([
  ['library'],
  ['catalogue'],
  ['fixture'],
  ['component', 'manifest'],
  ['coverage'],
  ['unlocated'],
]);
const SIGNALS = SIGNAL_TIERS.flat();
const SIGNAL_RANK = Object.fromEntries(
  SIGNAL_TIERS.flatMap((tier, rank) => tier.map((signal) => [signal, rank]))
);

/** In JSON and in the library's markup, only a blank line cannot change a drawing. */
const isBlank = (text) => text.trim() === '';

/** Whether a path is the Primitive Lab's own machinery rather than a catalogued input. */
export function isLibraryMachineryPath(file) {
  const normalized = normalizePath(file);
  if (CATALOGUE_FILE_PATTERN.test(normalized) || FIXTURE_FILE_PATTERN.test(normalized)) {
    return false;
  }
  return MACHINERY_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * The checkout the selection reads, as the one collaborator a test replaces.
 *
 * @param {string} [root] Absolute repository root.
 * @returns {{readText: (file: string) => string|null, catalogueSections: () => string[]}} Text by
 *   repository path, or null when unreadable, and the catalogue's section names.
 */
export function repositorySource(root = REPO_ROOT) {
  return {
    readText(file) {
      try {
        return readFileSync(path.join(root, file), 'utf8');
      } catch {
        return null;
      }
    },
    catalogueSections() {
      try {
        return catalogueFiles(root).map((name) => name.replace(/\.json$/, ''));
      } catch {
        return [];
      }
    },
  };
}

const lineRegions = (lines, { open, close }, keyOf) => {
  const regions = [];
  let start = null;
  for (const [index, line] of lines.entries()) {
    if (open.test(line)) start = index + 1;
    else if (close.test(line) && start !== null) {
      regions.push({ key: keyOf(lines, start, index + 1, regions.length), start, end: index + 1 });
      start = null;
    }
  }
  return regions;
};

const ROW_BOUNDS = Object.freeze({ open: /^ {2}\{$/, close: /^ {2}\},?$/ });
const OBJECT_BOUNDS = Object.freeze({ open: /^ {4}\{$/, close: /^ {4}\},?$/ });
const ROW_FIELD_PATTERN = /^\s*"(spec|cap)":\s*("(?:[^"\\]|\\.)*"),?\s*$/;
const MANIFEST_PATH_PATTERN = /^ {6}"path":\s*("(?:[^"\\]|\\.)*"),?\s*$/;

/**
 * A catalogue file's row regions, `{key: index, start, end}`, each from its `  {` to its `  }`
 * line; the last row also owns the closing `]`, so removing the last row lands on a row.
 */
export function catalogueRowRegions(lines) {
  const regions = lineRegions(lines, ROW_BOUNDS, (_, __, ___, index) => index);
  const last = regions.at(-1);
  const bracket = last
    ? lines.findIndex((line, index) => index >= last.end && /^\]/.test(line))
    : -1;
  if (bracket !== -1) last.end = bracket + 1;
  return regions;
}

/** The manifest's object regions, each keyed by the `"path"` inside it, or `''` when it has none. */
export function manifestObjectRegions(lines) {
  return lineRegions(lines, OBJECT_BOUNDS, (all, start, end) => {
    const field = all
      .slice(start, end)
      .map((line) => MANIFEST_PATH_PATTERN.exec(line))
      .find(Boolean);
    return field ? JSON.parse(field[1]) : '';
  });
}

/** Every catalogue section with its rows, lines and regions, or null rows when it is unreadable. */
function readCatalogue(source) {
  const sections = source.catalogueSections().map((section) => {
    const text = source.readText(`${CATALOGUE_DIRECTORY}/${section}.json`);
    const rows = parseCatalogueRows(text);
    const lines = text?.split('\n') ?? [];
    const regions = rows ? catalogueRowRegions(lines) : null;
    return { section, rows, lines, regions: regions?.length === rows?.length ? regions : null };
  });
  return {
    bySection: new Map(sections.map((entry) => [entry.section, entry])),
    unreadable: sections.some((entry) => !entry.rows),
    rowKeysWhere: (predicate) =>
      sections.flatMap(({ section, rows }) =>
        (rows ?? []).flatMap((row, index) => (predicate(row) ? [rowKey(section, index)] : []))
      ),
  };
}

const isRowBound = (text) => ROW_BOUNDS.open.test(text) || ROW_BOUNDS.close.test(text);

/** A row with one more `spec` or `cap` line read into it, or the row unchanged when it is neither. */
function readRowField(row, marker, text) {
  const field = ROW_FIELD_PATTERN.exec(text);
  if (!field) return row;
  const next = row ?? { spec: null, cap: null, removed: false };
  next[field[1]] = JSON.parse(field[2]);
  next.removed ||= marker === '-';
  return next;
}

/** The addresses of the rows one hunk removes a `spec` or `cap` line from. */
function hunkRemovedAddresses(hunk) {
  const keys = [];
  let row = null;
  const flush = () => {
    if (row?.removed && row.spec !== null) keys.push(addressKey(row.spec, row.cap));
    row = null;
  };
  for (const { marker, text } of hunk) {
    if (marker === '+') continue;
    if (!isRowBound(text)) {
      row = readRowField(row, marker, text);
      continue;
    }
    flush();
    if (ROW_BOUNDS.open.test(text)) row = { spec: null, cap: null, removed: false };
  }
  flush();
  return keys;
}

/** The `(spec, cap)` addresses of rows whose `spec` or `cap` line a hunk removes. */
const removedAddresses = (hunks) => (hunks ?? []).flatMap(hunkRemovedAddresses);

/** Locate each hunk over `regions`, adding what it reaches and counting what it cannot place. */
function locateHunks(hunks, lines, regions, reach) {
  let unlocated = 0;
  for (const hunk of hunks) {
    const touched = touchedHunkRegionKeys([hunk], lines, regions, { isInert: isBlank });
    if (touched.unattributable) unlocated += 1;
    for (const key of touched.keys) reach(key);
  }
  return unlocated;
}

/** Whether a hunk takes away more units than it adds, which moves its entry's unit ordinals. */
function removesUnits(hunk) {
  const opened = (marker) =>
    hunk.filter(
      (line) => line.marker === marker && /<div\b[^>]*class="[^"]*\bunit\b/.test(line.text)
    ).length;
  return opened('-') > opened('+');
}

function selectLibraryDrawings(patch, source, select) {
  const text = source.readText(LIBRARY_PATH);
  const hunks = parsePatch(patch);
  if (text === null || !hunks) return select.widen();
  const lines = text.split('\n');
  const { entries, units } = scanLibraryRegions(text);
  const reachEntry = (key) => {
    const entry = entries.find((candidate) => candidate.key === key);
    select.add(key, 'library', { heading: entry.heading });
  };
  let unlocated = 0;
  for (const hunk of hunks) {
    const byUnit = touchedHunkRegionKeys([hunk], lines, units, { isInert: isBlank });
    const unit = byUnit.keys.size === 1 && !byUnit.unattributable && !removesUnits(hunk);
    if (unit) {
      const found = units.find((candidate) => byUnit.keys.has(candidate.key));
      const heading = entries[found.entry].heading;
      select.add(found.key, 'library', { heading, caption: found.caption ?? undefined });
      continue;
    }
    unlocated += locateHunks([hunk], lines, entries, reachEntry);
  }
  select.unlocated(LIBRARY_PATH, unlocated);
}

function selectCatalogueRows(file, section, patch, catalogue, select) {
  const hunks = parsePatch(patch);
  for (const key of removedAddresses(hunks)) select.add(key, 'catalogue');
  const entry = catalogue.bySection.get(section);
  if (!entry?.rows || !hunks) return select.widen();
  const reach = (index) => select.add(rowKey(section, index), 'catalogue');
  select.unlocated(file, locateHunks(hunks, entry.lines, entry.regions, reach));
}

function selectManifestPaths(patch, source, catalogue, select) {
  const text = source.readText(MANIFEST_PATH);
  const hunks = parsePatch(patch);
  if (text === null || !hunks || catalogue.unreadable) return select.widen();
  const lines = text.split('\n');
  const reach = (componentPath) => {
    if (!componentPath) return;
    for (const key of catalogue.rowKeysWhere((row) => row.path === componentPath)) {
      select.add(key, 'manifest');
    }
  };
  select.unlocated(MANIFEST_PATH, locateHunks(hunks, lines, manifestObjectRegions(lines), reach));
}

function selectFile(file, patch, { source, catalogue, select }) {
  for (const key of catalogue.rowKeysWhere((row) => row.path === file)) {
    select.add(key, 'component');
  }
  const catalogueMatch = CATALOGUE_FILE_PATTERN.exec(file);
  const fixtureMatch = FIXTURE_FILE_PATTERN.exec(file);
  if (file === LIBRARY_PATH) selectLibraryDrawings(patch, source, select);
  else if (catalogueMatch) selectCatalogueRows(file, catalogueMatch[1], patch, catalogue, select);
  else if (fixtureMatch) {
    if (catalogue.unreadable) select.widen();
    for (const key of catalogue.rowKeysWhere((row) => row.fixture === fixtureMatch[1])) {
      select.add(key, 'fixture');
    }
  } else if (file === MANIFEST_PATH) selectManifestPaths(patch, source, catalogue, select);
  else if (isLibraryMachineryPath(file)) select.widen();
}

/** The collector every signal adds to: each key keeps the highest signal that reached it. */
function createSelection() {
  const records = new Map();
  const add = (key, signal, labels = {}) => {
    const existing = records.get(key);
    if (existing && SIGNALS.indexOf(existing.signal) <= SIGNALS.indexOf(signal)) return;
    const defined = Object.entries(labels).filter(([, value]) => value !== undefined);
    records.set(key, { key, signal, ...Object.fromEntries(defined) });
  };
  return {
    records,
    add,
    widen: () => add(COVERAGE_KEY, 'coverage'),
    unlocated(file, count) {
      if (count === 0) return;
      add(COVERAGE_KEY, 'coverage');
      add(unlocatedKey(file, count), 'unlocated');
    },
  };
}

const KIND_ORDER = Object.freeze(['entry', 'unit', 'row', 'addr', 'coverage', 'unlocated']);

/** A record's sort tuple: its signal's rank, then document or catalogue order within it. */
function orderOf({ key, signal }) {
  const parsed = parseTargetKey(key) ?? { kind: 'unlocated' };
  const kind = parsed.kind === 'unit' ? 'entry' : parsed.kind;
  return [
    SIGNAL_RANK[signal],
    KIND_ORDER.indexOf(kind),
    parsed.section ?? '',
    parsed.entry ?? parsed.index ?? 0,
    parsed.unit ?? -1,
    key,
  ];
}

function compareTuples(left, right) {
  for (const [index, value] of left.entries()) {
    if (value < right[index]) return -1;
    if (value > right[index]) return 1;
  }
  return 0;
}

/**
 * Select the design-library units a changed-file set reaches.
 *
 * @param {string[]} files Changed paths, as the PR files API names them.
 * @param {{patches?: Record<string, string>, source?: object}} [options] Each path's patch, and the
 *   checkout to read (`repositorySource()` by default).
 * @returns {{key: string, signal: string, heading?: string, caption?: string}[]} Ordered by signal
 *   rank, then document or catalogue order, whatever order `files` arrived in.
 */
export function selectLibraryTargets(files = [], { patches, source = repositorySource() } = {}) {
  const patchByPath = new Map(
    Object.entries(patches ?? {}).map(([file, patch]) => [normalizePath(file), patch])
  );
  const context = { source, catalogue: readCatalogue(source), select: createSelection() };
  for (const file of new Set(files.map(normalizePath).filter(Boolean))) {
    selectFile(file, patchByPath.get(file), context);
  }
  return [...context.select.records.values()].sort((left, right) =>
    compareTuples(orderOf(left), orderOf(right))
  );
}

/**
 * The pure half of `npm run lab:capture` (issue 2413): target keys to capture requests, the frame
 * names, labels and notes, the lab's problems per frame, the deadline, and the local diff reader.
 * The browser half is `scripts/primitive-lab-capture.mjs`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  CATALOGUE_DIRECTORY,
  catalogueFiles,
  parseCatalogueRows,
} from './primitiveLabCatalogue.js';
import { COVERAGE_KEY, parseTargetKey, rowKey, scanLibraryRegions } from './primitiveLabUnits.js';

/** The script stops starting units past this, below the workflow step's 15-minute timeout. */
export const CAPTURE_DEADLINE_MS = 12 * 60_000;

/** The lab boots every row cold in CI, so it gets longer than `lab:check`'s 120 s. */
export const CAPTURE_READY_TIMEOUT_MS = 300_000;

/** A manifest-sourced string is cut to this many characters. */
export const TEXT_LIMIT = 200;

export const OUTPUT_DIRECTORY = 'ui-screenshot-artifact/library';

const clip = (text) => (text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT - 1)}…` : text);
const collapse = (text) =>
  String(text ?? '')
    .replaceAll(/\s+/g, ' ')
    .trim();

/**
 * Every catalogue section's rows, an unreadable section standing as no rows.
 *
 * @param {string} root Absolute repository root.
 * @returns {{section: string, rows: object[]}[]} In file-name order.
 */
export function readCatalogueSections(root) {
  const read = (file) => {
    try {
      return readFileSync(path.join(root, CATALOGUE_DIRECTORY, file), 'utf8');
    } catch {
      return null;
    }
  };
  return catalogueFiles(root).map((file) => ({
    section: file.replace(/\.json$/, ''),
    rows: parseCatalogueRows(read(file)) ?? [],
  }));
}

function rowRequest(key, sections, section, index) {
  const row = sections.find((entry) => entry.section === section)?.rows[index];
  if (!row) return { failure: { id: key, reason: 'the catalogue has no such row' } };
  return { request: { key, kind: 'address', spec: row.spec, cap: row.cap ?? null } };
}

function ordinalRequest(key, { entries, units }, entry, unit) {
  const drawn = entries[entry];
  const found = unit === null ? null : units.find((u) => u.entry === entry && u.index === unit);
  if (!drawn || (unit !== null && !found)) {
    return { failure: { id: key, reason: 'the library has no such entry or unit' } };
  }
  const caption = found?.caption ?? null;
  return { request: { key, kind: 'ordinal', entry, unit, heading: drawn.heading, caption } };
}

/**
 * Turn target keys into capture requests: rows and deleted-row addresses by `(spec, cap)`, entries
 * and units by ordinal with the heading and caption this checkout's library gives them, and
 * `coverage` as the first row of every catalogue section, each request keeping the key `coverage`.
 *
 * @param {string[]} keys Target keys, highest signal first.
 * @param {{sections: {section: string, rows: object[]}[], library: string|null}} checkout This
 *   checkout's catalogue and `library.html` source.
 * @returns {{requests: object[], failures: {id: string, reason: string}[], notes: object[]}}
 */
export function planRequests(keys, { sections, library }) {
  const regions = library === null ? { entries: [], units: [] } : scanLibraryRegions(library);
  const planned = { requests: [], failures: [], notes: [] };
  const take = ({ request, failure }) => {
    if (request) planned.requests.push(request);
    if (failure) planned.failures.push(failure);
  };
  for (const key of keys) {
    const parsed = parseTargetKey(key);
    switch (parsed?.kind) {
      case 'row': {
        take(rowRequest(key, sections, parsed.section, parsed.index));
        break;
      }
      case 'addr': {
        take({ request: { key, kind: 'address', spec: parsed.spec, cap: parsed.cap } });
        break;
      }
      case 'entry':
      case 'unit': {
        take(ordinalRequest(key, regions, parsed.entry, parsed.unit ?? null));
        break;
      }
      case 'coverage': {
        for (const { section, rows } of sections) {
          if (rows.length > 0) take(rowRequest(COVERAGE_KEY, sections, section, 0));
        }
        break;
      }
      case 'unlocated': {
        planned.notes.push({ key, ...parsed });
        break;
      }
      default: {
        planned.failures.push({ id: key, reason: 'not a library target key' });
      }
    }
  }
  return planned;
}

/** Lowercase words joined by hyphens, at most 60 characters. */
export function slugOf(text) {
  return collapse(text)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/**
 * @param {{element: {entry: number, unit: number|null}, heading: string, caption: string|null}}
 *   unit A resolved unit, with its decoded heading and caption.
 * @returns {string} Its file stem, `<entry>-<unit>-<slug>`, `spec` standing for a whole entry.
 */
export function frameId({ element, heading, caption }) {
  const entry = String(element.entry).padStart(2, '0');
  const unit = element.unit === null ? 'spec' : String(element.unit);
  const slug = slugOf([heading, caption].filter(Boolean).join(' ')) || 'unit';
  return `${entry}-${unit}-${slug}`;
}

/** `Library · <heading without angle brackets> · <caption>`, cut to the text limit. */
export function frameLabel({ heading, caption }) {
  const name = collapse(heading.replaceAll(/[<>]/g, ''));
  return clip(['Library', name, caption].filter(Boolean).map(collapse).join(' · '));
}

/** The catalogue rows standing in a unit: its entry's rows, narrowed to its caption for a unit. */
export function rowsInUnit(sections, { element, heading, caption }) {
  return sections.flatMap(({ section, rows }) =>
    rows.flatMap((row, index) => {
      const inEntry = collapse(row.spec) === heading;
      const inUnit = element.unit === null || (Boolean(row.cap) && collapse(row.cap) === caption);
      return inEntry && inUnit ? [{ key: rowKey(section, index), path: row.path }] : [];
    })
  );
}

/** "`library.html` (left) · Primitive Lab (right) · <n> row(s) of `<path>`", one count per path. */
export function frameNote(rows, problem = null) {
  const counts = new Map();
  for (const row of rows) counts.set(row.path, (counts.get(row.path) ?? 0) + 1);
  const ofPaths = [...counts].map(([file, count]) => `${count} row(s) of \`${file}\``);
  const parts = [
    '`library.html` (left) · Primitive Lab (right)',
    ofPaths.length > 0 ? ofPaths.join(', ') : 'no catalogue row',
  ];
  if (problem) parts.push(`Primitive Lab reported: ${clip(problem)}`);
  return parts.join(' · ');
}

/** The lab's `data-primitive-lab-error` value as its separate problems. */
export function labProblemsOf(errorText) {
  if (!errorText) return [];
  return String(errorText)
    .replace(/^\d+: /, '')
    .split(' | ')
    .map(collapse)
    .filter(Boolean);
}

/** Whether the page's report is a failed boot rather than a booted page with row problems. */
export function isBootFailure({ error, mounted }) {
  return mounted === 0 || (Boolean(error) && !/^\d+: /.test(error));
}

/** The first problem the lab names under a frame's entry heading, or null. */
export function problemFor(problems, heading) {
  return (
    problems.find(
      (problem) => problem.startsWith(`${heading} /`) || problem.startsWith(`${heading}:`)
    ) ?? null
  );
}

/** A deadline over an injectable clock. */
export function createDeadline(budgetMs = CAPTURE_DEADLINE_MS, now = Date.now) {
  const start = now();
  return { passed: () => now() - start >= budgetMs, elapsed: () => now() - start };
}

/**
 * The capture manifest, every string the publish step reads clipped to the text limit, each
 * failure keyed by the selected key it fails, once per reason.
 *
 * @param {object} parts `head`, `foundryVersion`, `frames`, `failures`, `overflow`, `notes`,
 *   `labProblems` and `timings`.
 * @returns {object} The manifest `manifest.json` holds.
 */
export function captureManifest({
  head = null,
  foundryVersion = null,
  frames = [],
  failures = [],
  overflow = [],
  notes = [],
  labProblems = [],
  timings = {},
}) {
  return {
    head,
    foundryVersion,
    frames,
    failures: [
      ...new Map(
        failures.map(({ id, reason }) => [
          JSON.stringify([id, reason]),
          { id, reason: clip(collapse(reason)) },
        ])
      ).values(),
    ],
    overflow,
    notes,
    labProblems: labProblems.map((problem) => clip(collapse(problem))),
    timings,
  };
}

/**
 * Split `git diff` output into the PR files API's shape: each file's name (its new name, or its old
 * one when removed) and its patch from the first hunk header, `''` when it has none.
 *
 * @param {string} text Unified diff output.
 * @returns {{filename: string, patch: string}[]} One entry per file.
 */
export function splitGitDiff(text) {
  const files = [];
  for (const block of String(text ?? '')
    .split(/^diff --git /m)
    .slice(1)) {
    const lines = block.split('\n');
    const header = lines.findIndex((line) => line.startsWith('@@'));
    const preamble = header === -1 ? lines : lines.slice(0, header);
    const named = (prefix) =>
      preamble.find((line) => line.startsWith(prefix))?.slice(prefix.length);
    const target = named('+++ b/') ?? named('rename to ') ?? named('--- a/');
    const filename = target ?? /^a\/(\S+) b\//.exec(lines[0])?.[1];
    if (!filename) continue;
    files.push({ filename, patch: header === -1 ? '' : lines.slice(header).join('\n') });
  }
  return files;
}

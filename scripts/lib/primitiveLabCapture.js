/**
 * `npm run lab:capture` (issue 2413) below its CLI: target keys to capture requests, the frame
 * names, labels and notes, the deadline, and the browser half that resolves, boots, clips and
 * captures each unit over the pages, clock and writers it is handed.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { SETTLE_MS, readLabReport, readSpecimenSizes } from './primitiveLabBrowser.js';
import {
  CATALOGUE_DIRECTORY,
  catalogueFiles,
  parseCatalogueRows,
} from './primitiveLabCatalogue.js';
import { ERROR_ATTRIBUTE, describeUnstableSizes } from './primitiveLabSmoke.js';
import {
  COVERAGE_KEY,
  capDistinctUnits,
  parseTargetKey,
  parseTargets,
  rowKey,
  scanLibraryRegions,
} from './primitiveLabUnits.js';

/** The script stops starting units past this, below the workflow step's 15-minute timeout. */
export const CAPTURE_DEADLINE_MS = 12 * 60_000;

/** The lab boots every row cold in CI, so it gets longer than `lab:check`'s 120 s. */
export const CAPTURE_READY_TIMEOUT_MS = 300_000;

/** A manifest-sourced string is cut to this many characters. */
export const TEXT_LIMIT = 200;

export const OUTPUT_DIRECTORY = 'ui-screenshot-artifact/library';

/** A unit is a few hundred CSS pixels wide, so the capture renders at this density to stay legible. */
export const CAPTURE_DEVICE_SCALE_FACTOR = 2;

/** The CSS width that shows a captured PNG one image pixel to a device pixel, read from its IHDR. */
export const panelWidth = (png, scale = CAPTURE_DEVICE_SCALE_FACTOR) =>
  png.readUInt32BE(16) / scale;

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
  const elapsed = () => now() - start;
  return {
    passed: () => elapsed() >= budgetMs,
    elapsed,
    remaining: () => Math.max(0, budgetMs - elapsed()),
  };
}

/** What a step that outlives the deadline rejects with; its message is the failure reason. */
class DeadlineError extends Error {
  constructor() {
    super('deadline');
    this.name = 'DeadlineError';
  }
}

/** `work`, or a `DeadlineError` once the deadline's remaining time runs out first. */
function bounded(work, deadline) {
  let timer;
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new DeadlineError()), deadline.remaining());
  });
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
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

/**
 * The CLI's arguments: `--base <ref>` to select from the three-dot diff against it, `--output
 * <dir>` for the frames and manifest, and every other argument a comma-separated target list.
 */
export function parseCaptureArgs(argv) {
  const options = { base: null, output: OUTPUT_DIRECTORY, keys: [] };
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const flag = { '--base': 'base', '--output': 'output' }[argv[index]];
    if (!flag) {
      rest.push(argv[index]);
      continue;
    }
    if (argv[index + 1] === undefined) throw new Error(`${argv[index]} needs a value`);
    options[flag] = argv[index + 1];
    index += 1;
  }
  return { ...options, keys: parseTargets(rest.join(',')) };
}

/** Non-zero when any key failed, or when units were requested and none was captured. */
export function exitCodeOf({ frames, failures }, requested) {
  return failures.length > 0 || (requested > 0 && frames.length === 0) ? 1 : 0;
}

/** A capture run's mutable record, which the manifest is written from. */
export function createCaptureState(fields = {}) {
  return {
    head: null,
    foundryVersion: null,
    sections: [],
    details: new Map(),
    frames: [],
    failures: [],
    overflow: [],
    notes: [],
    labProblems: [],
    timings: { bootMs: null, perUnitMs: {}, totalMs: null },
    ...fields,
  };
}

/** Write the manifest to a temporary file and rename it into place, so no reader sees half. */
export function createManifestWriter(directory) {
  const target = path.join(directory, 'manifest.json');
  return (state) => {
    writeFileSync(`${target}.tmp`, `${JSON.stringify(captureManifest(state), null, 2)}\n`);
    renameSync(`${target}.tmp`, target);
  };
}

/** Space kept around a unit's drawing, inside its entry, in CSS pixels. */
export const CLIP_PADDING_PX = 8;

/**
 * The clip that shows a unit with everything it draws beyond its own box: the union of its rects
 * and its descendants', padded, then clamped to its entry and the viewport, in whole pixels.
 *
 * @param {{rects: object[], bounds: object, viewport: {width: number, height: number}}} box The
 *   element's rect first, then its descendants', its entry's rect, and the viewport.
 */
export function clipUnion({ rects, bounds, viewport }, padding = CLIP_PADDING_PX) {
  const [own, ...descendants] = rects;
  const drawn = [own, ...descendants.filter((rect) => rect.width > 0 || rect.height > 0)];
  const left = Math.max(Math.min(...drawn.map((rect) => rect.x)) - padding, bounds.x, 0);
  const top = Math.max(Math.min(...drawn.map((rect) => rect.y)) - padding, bounds.y, 0);
  const right = Math.min(
    Math.max(...drawn.map((rect) => rect.x + rect.width)) + padding,
    bounds.x + bounds.width,
    viewport.width
  );
  const bottom = Math.min(
    Math.max(...drawn.map((rect) => rect.y + rect.height)) + padding,
    bounds.y + bounds.height,
    viewport.height
  );
  const [x, y] = [Math.floor(left), Math.floor(top)];
  return {
    x,
    y,
    width: Math.max(1, Math.ceil(right) - x),
    height: Math.max(1, Math.ceil(bottom) - y),
  };
}

/** In the page: scroll an entry or unit into view and measure it, its descendants and its entry. */
export function measureUnit({ entry, unit }, doc = document) {
  const spec = doc.querySelectorAll('div.spec')[entry];
  const element = unit === null ? spec : spec?.querySelectorAll('.unit')[unit];
  if (!element) return null;
  element.scrollIntoView({ block: 'center', inline: 'nearest' });
  const box = (node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  };
  return {
    rects: [element, ...element.querySelectorAll('*')].map(box),
    bounds: box(spec),
    viewport: { width: doc.defaultView.innerWidth, height: doc.defaultView.innerHeight },
  };
}

/** In the page: every element of every request resolved in `library.html`, or why it could not be. */
export function resolveRequests(requests, doc = document) {
  const normalize = (text) => (text ?? '').replaceAll(/\s+/g, ' ').trim();
  const decode = (raw) => {
    const template = doc.createElement('template');
    template.innerHTML = raw;
    return normalize(template.content.textContent);
  };
  const specs = [...doc.querySelectorAll('div.spec')];
  const headingOf = (spec) =>
    normalize(spec.querySelector(':scope > .spec-head > h4')?.textContent);
  const captionOf = (unit) => {
    const caption = unit.querySelector(':scope > .cap');
    return caption ? normalize(caption.textContent) : null;
  };
  const byHeading = new Map(specs.map((spec, index) => [headingOf(spec), index]));
  const resolveAddress = ({ spec, cap }) => {
    const entry = byHeading.get(normalize(spec));
    if (entry === undefined) return { error: `the library has no entry headed ${spec}` };
    const heading = headingOf(specs[entry]);
    if (!cap) return { element: { entry, unit: null }, heading, caption: null };
    const units = [...specs[entry].querySelectorAll('.unit')];
    const unit = units.findLastIndex((candidate) => captionOf(candidate) === normalize(cap));
    if (unit === -1) return { error: `${spec} has no unit captioned "${cap}"` };
    return { element: { entry, unit }, heading, caption: captionOf(units[unit]) };
  };
  const resolveOrdinal = ({ entry, unit, heading, caption }) => {
    const spec = specs[entry];
    const element = unit === null ? spec : spec?.querySelectorAll('.unit')[unit];
    if (!element) return { error: 'the rendered library has no such entry or unit' };
    const drawn = { heading: headingOf(spec), caption: unit === null ? null : captionOf(element) };
    const expected = {
      heading: decode(heading),
      caption: caption === null ? null : decode(caption),
    };
    if (drawn.heading !== expected.heading || drawn.caption !== expected.caption) {
      return { error: `drawn as ${JSON.stringify(drawn)}, scanned as ${JSON.stringify(expected)}` };
    }
    return { element: { entry, unit }, ...drawn };
  };
  return requests.map((request) =>
    request.kind === 'address' ? resolveAddress(request) : resolveOrdinal(request)
  );
}

/** In the page: the heading and caption drawn at an element's ordinals, or null when it has none. */
export function readLabels({ entry, unit }, doc = document) {
  const normalize = (text) => (text ?? '').replaceAll(/\s+/g, ' ').trim();
  const spec = doc.querySelectorAll('div.spec')[entry];
  const element = unit === null ? spec : spec?.querySelectorAll('.unit')[unit];
  if (!element) return null;
  const caption = unit === null ? null : element.querySelector(':scope > .cap');
  return {
    heading: normalize(spec.querySelector(':scope > .spec-head > h4')?.textContent),
    caption: caption ? normalize(caption.textContent) : null,
  };
}

const SCREENSHOT_OPTIONS = Object.freeze({ animations: 'disabled', caret: 'hide' });

async function fontsReady(page, deadline) {
  for (const frame of page.frames()) {
    const ready = frame.evaluate(() => document.fonts.ready.then(() => true));
    await bounded(ready, deadline).catch(() => false);
  }
}

/** One failure per selected key the unit carries, since publish reconciles by key. */
function failUnit(state, unit, reason) {
  for (const key of unit.keys) state.failures.push({ id: key, reason });
}

/** Fail every requested key no frame or failure accounts for yet, so none goes unreported. */
export function failUnaccounted(state, requests, reason) {
  const accounted = new Set([
    ...state.frames.flatMap((frame) => frame.targets),
    ...state.failures.map((failure) => failure.id),
  ]);
  for (const { key } of requests) {
    if (!accounted.has(key)) state.failures.push({ id: key, reason });
  }
}

/** Resolve every request in the reference page, keeping the resolved in request order. */
async function resolveInReference(reference, requests, state, deadline) {
  const results = await bounded(reference.evaluate(resolveRequests, requests), deadline);
  const resolved = [];
  for (const [index, result] of results.entries()) {
    if (result.error) state.failures.push({ id: requests[index].key, reason: result.error });
    else resolved.push({ key: requests[index].key, ...result });
  }
  return resolved;
}

/**
 * Boot the lab and settle it.
 *
 * @returns {Promise<string|null>} Why it did not boot, or null once it has.
 */
async function bootLab(lab, baseUrl, state, { deadline, now = Date.now }) {
  const started = now();
  let report;
  try {
    report = await bounded(readLabReport(lab, baseUrl, CAPTURE_READY_TIMEOUT_MS), deadline);
  } catch (error) {
    report = { error: String(error?.message ?? error), mounted: 0 };
  }
  state.timings.bootMs = now() - started;
  if (isBootFailure(report))
    return `the Primitive Lab did not boot: ${report.error ?? 'nothing mounted'}`;
  await fontsReady(lab, deadline);
  const atReady = await bounded(readSpecimenSizes(lab), deadline);
  await lab.waitForTimeout(SETTLE_MS);
  const unstable = describeUnstableSizes(atReady, await bounded(readSpecimenSizes(lab), deadline));
  if (unstable) state.labProblems.push(`sizes moved after ready: ${unstable}`);
  return null;
}

/** Photograph an element clipped to everything it draws. */
async function shoot(page, element, deadline) {
  const box = await bounded(page.evaluate(measureUnit, element), deadline);
  if (!box) throw new Error('the page has no such entry or unit');
  return bounded(page.screenshot({ ...SCREENSHOT_OPTIONS, clip: clipUnion(box) }), deadline);
}

async function captureUnit(unit, { reference, lab }, state, io) {
  const id = frameId(unit);
  const drawn = await bounded(lab.evaluate(readLabels, unit.element), io.deadline);
  if (drawn?.heading !== unit.heading || drawn?.caption !== unit.caption) {
    throw new Error(`the Primitive Lab draws ${JSON.stringify(drawn)} at this unit's ordinals`);
  }
  const left = await shoot(reference, unit.element, io.deadline);
  const right = await shoot(lab, unit.element, io.deadline);
  await bounded(io.writeFrame(id, left, right), io.deadline);
  const rows = rowsInUnit(state.sections, unit);
  state.details.set(id, { heading: unit.heading, rows });
  state.frames.push({
    id,
    label: frameLabel(unit),
    note: frameNote(rows),
    targets: unit.keys,
    rows: rows.map((row) => row.key),
  });
}

/** Capture each unit in turn, recording `deadline` for every unit the deadline leaves unstarted. */
async function captureUnits(units, pages, state, io) {
  for (const unit of units) {
    const id = frameId(unit);
    if (io.deadline.passed()) {
      failUnit(state, unit, 'deadline');
    } else {
      const started = io.now();
      try {
        await captureUnit(unit, pages, state, io);
      } catch (error) {
        failUnit(state, unit, String(error?.message ?? error));
      }
      state.timings.perUnitMs[id] = io.now() - started;
    }
    io.writeManifest(state);
  }
}

/** Re-read the lab's problems after the last capture and caption each frame they name. */
async function attributeLabProblems(lab, state, deadline) {
  const read = lab.evaluate((attribute) => document.body.getAttribute(attribute), ERROR_ATTRIBUTE);
  const problems = labProblemsOf(await bounded(read, deadline));
  state.labProblems.push(...problems);
  for (const frame of state.frames) {
    const { heading, rows } = state.details.get(frame.id);
    const problem = problemFor(problems, heading);
    if (problem) frame.note = frameNote(rows, problem);
  }
}

/**
 * Resolve the requests in the open reference page, cap them, boot the lab and capture each unit;
 * a failed boot fails every unit and writes no frame, and no requested key goes unaccounted.
 *
 * @param {object[]} requests `planRequests`' requests.
 * @param {{reference: object, lab: object}} pages The open reference page and the lab's page.
 * @param {object} state `createCaptureState()`'s record, filled in place.
 * @param {{baseUrl: string, deadline: object, now: () => number, writeManifest: (state: object)
 *   => void, writeFrame: (id: string, left: Buffer, right: Buffer) => Promise<void>}} io
 */
export async function captureLibrary(requests, pages, state, io) {
  try {
    await fontsReady(pages.reference, io.deadline);
    const resolved = await resolveInReference(pages.reference, requests, state, io.deadline);
    const { units, overflow } = capDistinctUnits(resolved);
    state.overflow = overflow.flatMap((unit) =>
      unit.keys.map((key) => ({ id: key, label: frameLabel(unit) }))
    );
    io.writeManifest(state);
    const bootFailure = await bootLab(pages.lab, io.baseUrl, state, io);
    if (bootFailure) {
      for (const unit of units) failUnit(state, unit, bootFailure);
      return;
    }
    await captureUnits(units, pages, state, io);
    await attributeLabProblems(pages.lab, state, io.deadline);
  } catch (error) {
    const reason =
      error instanceof DeadlineError
        ? error.message
        : `capture stopped: ${error?.message ?? error}`;
    failUnaccounted(state, requests, reason);
  }
}

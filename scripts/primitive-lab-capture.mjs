#!/usr/bin/env node
/**
 * `npm run lab:capture` (issue 2413): render each selected design-library unit as `library.html`
 * draws it beside the Primitive Lab's render of it, into `ui-screenshot-artifact/library/` with a
 * manifest. Takes comma-separated target keys, or `--base <ref>` to select them from the three-dot
 * diff against that ref. Binds port 0 only.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import {
  BROWSER_CONTEXT,
  LAUNCH_ARGS,
  NAVIGATION_TIMEOUT_MS,
  SETTLE_MS,
  collectPageFailures,
  readLabReport,
  readSpecimenSizes,
} from './lib/primitiveLabBrowser.js';
import {
  CAPTURE_DEVICE_SCALE_FACTOR,
  CAPTURE_READY_TIMEOUT_MS,
  OUTPUT_DIRECTORY,
  captureManifest,
  createDeadline,
  frameId,
  frameLabel,
  frameNote,
  isBootFailure,
  labProblemsOf,
  panelWidth,
  planRequests,
  problemFor,
  readCatalogueSections,
  rowsInUnit,
  splitGitDiff,
} from './lib/primitiveLabCapture.js';
import { ERROR_ATTRIBUTE, describeUnstableSizes, startLabServer } from './lib/primitiveLabSmoke.js';
import {
  COVERAGE_KEY,
  LIBRARY_PATH,
  capDistinctUnits,
  formatTargets,
  parseTargets,
} from './lib/primitiveLabUnits.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = join(ROOT, OUTPUT_DIRECTORY);

/** The library served raw by the lab server, so the reference is the same document, same-origin. */
const REFERENCE_PATH = '/@design-library/library.html';

const SCREENSHOT_OPTIONS = { animations: 'disabled', caret: 'hide' };

function readText(file) {
  try {
    return readFileSync(join(ROOT, file), 'utf8');
  } catch {
    return null;
  }
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
}

function currentHead() {
  try {
    return git(['rev-parse', '--short=8', 'HEAD']).trim();
  } catch {
    return null;
  }
}

/** The keys to capture: the arguments, `--base`'s selection, or coverage when given neither. */
async function selectedKeys(argv) {
  const at = argv.indexOf('--base');
  if (at === -1) {
    const keys = parseTargets(argv.join(','));
    return keys.length > 0 ? keys : [COVERAGE_KEY];
  }
  const changed = splitGitDiff(git(['diff', '--no-color', '-M', `${argv[at + 1]}...HEAD`]));
  // Loaded here alone, so the capture's static import graph stays the lab's own machinery.
  const { selectLibraryTargets } = await import('./lib/primitiveLabSelection.js');
  const records = selectLibraryTargets(
    changed.map((entry) => entry.filename),
    { patches: Object.fromEntries(changed.map((entry) => [entry.filename, entry.patch])) }
  );
  return records.map((record) => record.key);
}

/** Every element of every key resolved in the reference page, or why it could not be. */
function resolveRequests(requests) {
  const normalize = (text) => (text ?? '').replaceAll(/\s+/g, ' ').trim();
  const decode = (raw) => {
    const template = document.createElement('template');
    template.innerHTML = raw;
    return normalize(template.content.textContent);
  };
  const specs = [...document.querySelectorAll('div.spec')];
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

/** The heading and caption the lab page draws at an element's ordinals, or null when it has none. */
function readLabels({ entry, unit }) {
  const normalize = (text) => (text ?? '').replaceAll(/\s+/g, ' ').trim();
  const spec = document.querySelectorAll('div.spec')[entry];
  const element = unit === null ? spec : spec?.querySelectorAll('.unit')[unit];
  if (!element) return null;
  const caption = unit === null ? null : element.querySelector(':scope > .cap');
  return {
    heading: normalize(spec.querySelector(':scope > .spec-head > h4')?.textContent),
    caption: caption ? normalize(caption.textContent) : null,
  };
}

function locate(page, { entry, unit }) {
  const spec = page.locator('div.spec').nth(entry);
  return unit === null ? spec : spec.locator('.unit').nth(unit);
}

async function fontsReady(page) {
  for (const frame of page.frames()) {
    await frame.evaluate(() => document.fonts.ready.then(() => true)).catch(() => false);
  }
}

const COMPOSITE_STYLE =
  'body{margin:0;background:#fff;font:13px/1.3 sans-serif;color:#333}' +
  '.pair{display:inline-flex;gap:24px;padding:16px;align-items:flex-start}' +
  'figure{margin:0}figcaption{margin:0 0 8px}img{display:block;outline:1px dashed #bbb}';

/** Open the raw-mounted library as a page; the mount serves `.html` as a download, so retype it. */
async function openReference(page, url) {
  await page.route(url, async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers(), 'content-type': 'text/html; charset=utf-8' };
    await route.fulfill({ response, headers });
  });
  await page.goto(url, { waitUntil: 'load' });
}

/** Join the two panels side by side in a page of their own and photograph the pair. */
async function compose(page, left, right) {
  // eslint-disable-next-line unicorn/prefer-uint8array-base64 -- Node 22 has no Uint8Array#toBase64.
  const source = (png) => `data:image/png;base64,${png.toString('base64')}`;
  const panel = (caption, png) =>
    `<figure><figcaption>${caption}</figcaption>` +
    `<img alt="" width="${panelWidth(png)}" src="${source(png)}"></figure>`;
  await page.setContent(
    `<!doctype html><style>${COMPOSITE_STYLE}</style><div class="pair">` +
      `${panel('library.html', left)}${panel('Primitive Lab', right)}</div>`,
    { waitUntil: 'load' }
  );
  return page.locator('.pair').screenshot();
}

/** Collect each page's failures, a failed request included. */
function watchPage(page, label, sink) {
  const failures = collectPageFailures(page);
  page.on('requestfailed', (request) => {
    failures.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
  });
  sink.push(() => failures.map((failure) => `${label}: ${failure}`));
}

function writeManifest(state) {
  writeFileSync(
    join(OUTPUT, 'manifest.json'),
    `${JSON.stringify(captureManifest(state), null, 2)}\n`
  );
}

/** One failure per selected key the unit carries, since publish reconciles by key. */
function failUnit(state, unit, reason) {
  for (const key of unit.keys) state.failures.push({ id: key, reason });
}

/** Fail every requested key no frame or failure accounts for yet, so none goes unreported. */
function failUnaccounted(state, requests, reason) {
  const accounted = new Set([
    ...state.frames.flatMap((frame) => frame.targets),
    ...state.failures.map((failure) => failure.id),
  ]);
  for (const { key } of requests) {
    if (!accounted.has(key)) state.failures.push({ id: key, reason });
  }
}

/** Resolve every request in the reference page, keeping the resolved in request order. */
async function resolveInReference(reference, requests, state) {
  const results = await reference.evaluate(resolveRequests, requests);
  const resolved = [];
  for (const [index, result] of results.entries()) {
    if (result.error) state.failures.push({ id: requests[index].key, reason: result.error });
    else resolved.push({ key: requests[index].key, ...result });
  }
  return resolved;
}

/** Boot the lab and settle it; a failed boot fails every unit and writes no composite. */
async function bootLab(lab, baseUrl, state) {
  const started = Date.now();
  let report;
  try {
    report = await readLabReport(lab, baseUrl, CAPTURE_READY_TIMEOUT_MS);
  } catch (error) {
    report = { error: String(error?.message ?? error), mounted: 0 };
  }
  state.timings.bootMs = Date.now() - started;
  if (isBootFailure(report))
    return `the Primitive Lab did not boot: ${report.error ?? 'nothing mounted'}`;
  await fontsReady(lab);
  const atReady = await readSpecimenSizes(lab);
  await lab.waitForTimeout(SETTLE_MS);
  const unstable = describeUnstableSizes(atReady, await readSpecimenSizes(lab));
  if (unstable) state.labProblems.push(`sizes moved after ready: ${unstable}`);
  return null;
}

async function captureUnit(unit, { reference, lab, composer }, state) {
  const id = frameId(unit);
  const drawn = await lab.evaluate(readLabels, unit.element);
  if (drawn?.heading !== unit.heading || drawn?.caption !== unit.caption) {
    throw new Error(`the Primitive Lab draws ${JSON.stringify(drawn)} at this unit's ordinals`);
  }
  const left = await locate(reference, unit.element).screenshot(SCREENSHOT_OPTIONS);
  const right = await locate(lab, unit.element).screenshot(SCREENSHOT_OPTIONS);
  writeFileSync(join(OUTPUT, `${id}.png`), await compose(composer, left, right));
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

async function captureUnits(units, pages, state, deadline) {
  for (const unit of units) {
    const id = frameId(unit);
    if (deadline.passed()) {
      failUnit(state, unit, 'deadline');
      continue;
    }
    const started = Date.now();
    try {
      await captureUnit(unit, pages, state);
    } catch (error) {
      failUnit(state, unit, String(error?.message ?? error));
    }
    state.timings.perUnitMs[id] = Date.now() - started;
    writeManifest(state);
  }
}

/** Re-read the lab's problems after the last capture and caption each frame they name. */
async function attributeLabProblems(lab, state) {
  const problems = labProblemsOf(
    await lab.evaluate((attribute) => document.body.getAttribute(attribute), ERROR_ATTRIBUTE)
  );
  state.labProblems.push(...problems);
  for (const frame of state.frames) {
    const { heading, rows } = state.details.get(frame.id);
    const problem = problemFor(problems, heading);
    if (problem) frame.note = frameNote(rows, problem);
  }
}

async function captureInBrowser(requests, state, deadline) {
  const server = await startLabServer(ROOT);
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const watched = [];
  try {
    const context = await browser.newContext({
      ...BROWSER_CONTEXT,
      deviceScaleFactor: CAPTURE_DEVICE_SCALE_FACTOR,
    });
    context.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
    const pages = {
      reference: await context.newPage(),
      lab: await context.newPage(),
      composer: await context.newPage(),
    };
    watchPage(pages.reference, 'library.html', watched);
    watchPage(pages.lab, 'Primitive Lab', watched);
    for (const page of [pages.reference, pages.lab]) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
    }
    await openReference(pages.reference, `${server.baseUrl}${REFERENCE_PATH}`);
    await fontsReady(pages.reference);
    const { units, overflow } = capDistinctUnits(
      await resolveInReference(pages.reference, requests, state)
    );
    state.overflow = overflow.flatMap((unit) =>
      unit.keys.map((key) => ({ id: key, label: frameLabel(unit) }))
    );
    writeManifest(state);
    const bootFailure = await bootLab(pages.lab, server.baseUrl, state);
    if (bootFailure) {
      for (const unit of units) failUnit(state, unit, bootFailure);
      return;
    }
    await captureUnits(units, pages, state, deadline);
    await attributeLabProblems(pages.lab, state);
  } finally {
    state.labProblems.push(...watched.flatMap((read) => read()));
    await browser.close();
    await server.close();
  }
}

async function run(argv) {
  const deadline = createDeadline();
  rmSync(OUTPUT, { recursive: true, force: true });
  mkdirSync(OUTPUT, { recursive: true });
  const keys = await selectedKeys(argv);
  console.log(`library targets: ${formatTargets(keys) || '(none)'}`);
  const state = {
    head: currentHead(),
    sections: readCatalogueSections(ROOT),
    details: new Map(),
    frames: [],
    failures: [],
    labProblems: [],
    timings: { bootMs: null, perUnitMs: {}, totalMs: null },
  };
  const planned = planRequests(keys, { sections: state.sections, library: readText(LIBRARY_PATH) });
  state.failures.push(...planned.failures);
  state.notes = planned.notes;
  try {
    const cache = resolveChromeCache(ROOT);
    state.foundryVersion = cache?.version ?? null;
    if (!cache) {
      const reason = missingChromeMessage(ROOT).split('\n', 1)[0];
      for (const request of planned.requests) state.failures.push({ id: request.key, reason });
    } else if (planned.requests.length > 0) {
      await captureInBrowser(planned.requests, state, deadline).catch((error) =>
        failUnaccounted(state, planned.requests, `capture stopped: ${error?.message ?? error}`)
      );
    }
  } finally {
    state.timings.totalMs = deadline.elapsed();
    writeManifest(state);
  }
  const { failures, overflow } = captureManifest(state);
  console.log(
    `captured ${state.frames.length} unit(s) to ${OUTPUT_DIRECTORY}/ ` +
      `(${failures.length} failure(s), ${overflow.length} over the cap; ` +
      `boot ${state.timings.bootMs ?? '-'} ms, total ${state.timings.totalMs} ms)`
  );
  return planned.requests.length > 0 && state.frames.length === 0 ? 1 : 0;
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

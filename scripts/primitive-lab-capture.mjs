#!/usr/bin/env node
/**
 * `npm run lab:capture` (issue 2413): render each selected design-library unit as `library.html`
 * draws it beside the Primitive Lab's render of it, into `ui-screenshot-artifact/library/` (or
 * `--output <dir>`) with a manifest. Takes comma-separated target keys, or `--base <ref>` to select
 * them from the three-dot diff against that ref. Binds port 0 only.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import {
  BROWSER_CONTEXT,
  LAUNCH_ARGS,
  NAVIGATION_TIMEOUT_MS,
  collectPageFailures,
} from './lib/primitiveLabBrowser.js';
import {
  CAPTURE_DEVICE_SCALE_FACTOR,
  captureLibrary,
  captureManifest,
  createCaptureState,
  createDeadline,
  createManifestWriter,
  describeRun,
  exitCodeOf,
  failUnaccounted,
  panelWidth,
  parseCaptureArgs,
  planRequests,
  readCatalogueSections,
  splitGitDiff,
} from './lib/primitiveLabCapture.js';
import { startLabServer } from './lib/primitiveLabSmoke.js';
import { COVERAGE_KEY, LIBRARY_PATH, formatTargets } from './lib/primitiveLabUnits.js';
import { resolveExecutable } from './lib/resolveExecutable.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The library served raw by the lab server, so the reference is the same document, same-origin. */
const REFERENCE_PATH = '/@design-library/library.html';

function readText(file) {
  try {
    return readFileSync(join(ROOT, file), 'utf8');
  } catch {
    return null;
  }
}

function git(args) {
  const executable = resolveExecutable('git');
  if (!executable) throw new Error('could not find "git" in any absolute PATH directory');
  return execFileSync(executable, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
}

function currentHead() {
  try {
    return git(['rev-parse', '--short=8', 'HEAD']).trim();
  } catch {
    return null;
  }
}

/** The keys to capture: the arguments, `--base`'s selection, or coverage when given neither. */
async function selectedKeys({ base, keys }) {
  if (base === null) return keys.length > 0 ? keys : [COVERAGE_KEY];
  const changed = splitGitDiff(git(['diff', '--no-color', '-M', `${base}...HEAD`]));
  // Loaded here alone, so the capture's static import graph stays the lab's own machinery.
  const { selectLibraryTargets } = await import('./lib/primitiveLabSelection.js');
  const records = selectLibraryTargets(
    changed.map((entry) => entry.filename),
    { patches: Object.fromEntries(changed.map((entry) => [entry.filename, entry.patch])) }
  );
  return records.map((record) => record.key);
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

async function captureInBrowser(requests, state, io) {
  const server = await startLabServer(ROOT);
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  const watched = [];
  try {
    const context = await browser.newContext({
      ...BROWSER_CONTEXT,
      deviceScaleFactor: CAPTURE_DEVICE_SCALE_FACTOR,
    });
    context.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
    const [reference, lab, composer] = [
      await context.newPage(),
      await context.newPage(),
      await context.newPage(),
    ];
    watchPage(reference, 'library.html', watched);
    watchPage(lab, 'Primitive Lab', watched);
    for (const page of [reference, lab]) await page.emulateMedia({ reducedMotion: 'reduce' });
    await openReference(reference, `${server.baseUrl}${REFERENCE_PATH}`);
    const writeFrame = async (id, left, right) =>
      writeFileSync(join(io.output, `${id}.png`), await compose(composer, left, right));
    await captureLibrary(requests, { reference, lab }, state, {
      ...io,
      baseUrl: server.baseUrl,
      writeFrame,
    });
  } finally {
    state.labProblems.push(...watched.flatMap((read) => read()));
    await browser.close();
    await server.close();
  }
}

/** Remove a previous run's frames and manifest, and nothing else, since `--output` is any path. */
function clearOutput(output) {
  mkdirSync(output, { recursive: true });
  for (const name of readdirSync(output)) {
    if (/^[a-z0-9-]+\.png$|^manifest\.json(?:\.tmp)?$/.test(name)) rmSync(join(output, name));
  }
}

/** Capture through the harvested chrome, or fail every request for want of it. */
async function captureRequests(requests, state, io) {
  const cache = resolveChromeCache(ROOT);
  state.foundryVersion = cache?.version ?? null;
  if (!cache) {
    const reason = missingChromeMessage(ROOT).split('\n', 1)[0];
    for (const request of requests) state.failures.push({ id: request.key, reason });
    return;
  }
  await captureInBrowser(requests, state, io).catch((error) =>
    failUnaccounted(state, requests, `capture stopped: ${error?.message ?? error}`)
  );
}

async function run(argv) {
  const deadline = createDeadline();
  const options = parseCaptureArgs(argv);
  const output = resolve(ROOT, options.output);
  clearOutput(output);
  const keys = await selectedKeys(options);
  console.log(`library targets: ${formatTargets(keys) || '(none)'}`);
  const state = createCaptureState({ head: currentHead(), sections: readCatalogueSections(ROOT) });
  const planned = planRequests(keys, { sections: state.sections, library: readText(LIBRARY_PATH) });
  state.failures.push(...planned.failures);
  state.notes = planned.notes;
  const writeManifest = createManifestWriter(output);
  const io = { output, deadline, now: Date.now, writeManifest };
  try {
    if (planned.requests.length > 0) await captureRequests(planned.requests, state, io);
  } finally {
    state.timings.totalMs = deadline.elapsed();
    writeManifest(state);
  }
  const manifest = captureManifest(state);
  for (const line of describeRun(manifest, output)) console.log(line);
  return exitCodeOf(manifest, planned.requests.length);
}

try {
  process.exitCode = await run(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

#!/usr/bin/env node
/**
 * `npm run lab:parity` (issue 1487): load `library.html` over `file://` (the reference) and as the
 * Primitive Lab renders it, compare `PARITY_PROPERTIES` element by element under `<main>`, and
 * check each live specimen's iframe on its own. Maintainer-run: it needs a chrome harvest.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import {
  diffSnapshots,
  evaluateSpecimens,
  formatParityReport,
  PARITY_PROPERTIES,
} from './lib/primitiveLabParity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const LAB_PAGE_PATH = '/tests/view-lab/primitives.html';
const READY_ATTRIBUTE = 'data-primitive-lab-ready';

const REFERENCE_PATH = join(ROOT, 'openspec/specs/design-system/library.html');

/** One viewport for both loads, so a difference is never a viewport artefact. */
const VIEWPORT = { width: 1440, height: 1000 };

const NAVIGATION_TIMEOUT_MS = 60_000;
const READY_TIMEOUT_MS = 240_000;

/** Time to let web fonts and any transition finish settling once the page reports ready. */
const SETTLE_MS = 3000;

/** Opaque, because `eslint-plugin-import-x` crashes on Vite's exports map (see the View Lab CLI). */
const VITE_SPECIFIER = 'vite';

/**
 * Start the Primitive Lab's Vite server on port 0, never a parallel worktree's configured port.
 *
 * @returns {Promise<{baseUrl: string, close: () => Promise<void>}>} The server handle.
 */
async function startLabServer() {
  const { createServer } = await import(VITE_SPECIFIER);
  const server = await createServer({
    configFile: join(ROOT, 'tests/view-lab/vite.config.js'),
    server: { port: 0, strictPort: false },
  });
  await server.listen();
  const resolved = server.resolvedUrls?.local?.[0];
  if (!resolved) {
    await server.close();
    throw new Error('the lab server reported no local URL; `resolvedUrls` is empty after listen()');
  }
  return { baseUrl: resolved.replace(/\/$/, ''), close: () => server.close() };
}

/**
 * Walk `<main>` in the page, collecting a position-keyed style snapshot of every element except
 * a live specimen's `.unit`, which is skipped whole.
 *
 * @param {readonly string[]} properties Computed style property names to record.
 * @returns {{key: string, cls: string, style: Record<string, string>}[]} One entry per compared
 *   element, in document order.
 */
function collectStyleWalk(properties) {
  const main = globalThis.document.querySelector('main');
  if (!main) return [];

  const isLiveSpecimen = (element) =>
    element.tagName === 'IFRAME' ||
    element.hasAttribute?.('data-primitive-lab-specimen') ||
    element.closest?.('[data-primitive-lab-specimen]') != null ||
    element.classList?.contains('pl-live');

  const skipRoots = new Set();
  for (const element of main.querySelectorAll('iframe, [data-primitive-lab-specimen], .pl-live')) {
    skipRoots.add(element.closest('.unit') ?? element.parentElement ?? element);
  }

  const collected = [];
  const path = ['main'];
  const walk = (element) => {
    if (skipRoots.has(element) || isLiveSpecimen(element)) return;
    const computed = globalThis.getComputedStyle(element);
    const style = {};
    for (const property of properties) style[property] = computed[property];
    collected.push({
      key: path.join('>'),
      cls: String(element.className || '').slice(0, 60),
      style,
    });
    let index = 0;
    for (const child of element.children) {
      index += 1;
      path.push(`${child.tagName.toLowerCase()}:${index}`);
      walk(child);
      path.pop();
    }
  };
  walk(main);
  return collected;
}

/**
 * Load one page and collect its style walk.
 *
 * @param {import('playwright').Browser} browser The launched browser.
 * @param {string} url Page URL — a `file://` reference or the lab's own dev-server URL.
 * @param {boolean} waitForLabReady Wait for `data-primitive-lab-ready` before collecting.
 * @returns {Promise<{key: string, cls: string, style: Record<string, string>}[]>}
 */
async function snapshot(browser, url, waitForLabReady) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(url, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
  if (waitForLabReady) {
    await page.waitForFunction(
      (attribute) => globalThis.document.body.hasAttribute(attribute),
      READY_ATTRIBUTE,
      { timeout: READY_TIMEOUT_MS }
    );
    const failure = await page.evaluate(
      (attribute) => globalThis.document.body.getAttribute(attribute),
      'data-primitive-lab-error'
    );
    if (failure)
      throw new Error(`the lab reported an error before parity could be measured: ${failure}`);
  }
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.waitForTimeout(SETTLE_MS);
  const data = await page.evaluate(collectStyleWalk, PARITY_PROPERTIES);
  await page.close();
  return data;
}

/** The identity marker on each specimen `<iframe>` — same literal `mount.js` writes. */
const SPECIMEN_ATTRIBUTE = 'data-primitive-lab-specimen';

/**
 * Measure every specimen's iframe against the component's own root inside it — not the wrapper
 * `specimenMount.js` measures, so a wrong report cannot agree with itself.
 *
 * @param {import('playwright').Browser} browser The launched browser.
 * @param {string} baseUrl The lab server's own base URL.
 * @returns {Promise<object[]>} One measurement per specimen iframe, shaped for
 *   {@link evaluateSpecimens}.
 */
async function collectSpecimenMeasurements(browser, baseUrl) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(`${baseUrl}${LAB_PAGE_PATH}`, {
    waitUntil: 'load',
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await page.waitForFunction(
    (attribute) => globalThis.document.body.hasAttribute(attribute),
    READY_ATTRIBUTE,
    { timeout: READY_TIMEOUT_MS }
  );
  await page.evaluate(() => globalThis.document.fonts.ready);
  await page.waitForTimeout(SETTLE_MS);

  const iframeHandles = await page.$$(`iframe[${SPECIMEN_ATTRIBUTE}]`);
  const measurements = [];
  for (const iframeHandle of iframeHandles) {
    const path = (await iframeHandle.getAttribute(SPECIMEN_ATTRIBUTE)) ?? '(unknown path)';
    const outerBox = await iframeHandle.boundingBox();
    const frame = await iframeHandle.contentFrame();
    const inner = frame
      ? await frame.evaluate(() => {
          // A literal selector: this body runs in the specimen's realm, not this module's.
          const root = globalThis.document.querySelector('[data-primitive-lab-specimen]');
          const kid = root?.firstElementChild ?? null;
          const rect = kid?.getBoundingClientRect();
          return {
            mounted: Boolean(kid),
            width: rect ? rect.width : 0,
            height: rect ? rect.height : 0,
            backgroundColor: globalThis.getComputedStyle(globalThis.document.body).backgroundColor,
          };
        })
      : { mounted: false, width: 0, height: 0, backgroundColor: '' };
    measurements.push({
      path,
      mounted: inner.mounted,
      frameWidth: outerBox ? outerBox.width : 0,
      frameHeight: outerBox ? outerBox.height : 0,
      contentWidth: inner.width,
      contentHeight: inner.height,
      backgroundColor: inner.backgroundColor,
    });
  }

  await page.close();
  return measurements;
}

async function run() {
  const cache = resolveChromeCache(ROOT);
  if (!cache) throw new Error(missingChromeMessage(ROOT));

  const server = await startLabServer();
  const browser = await chromium.launch();
  try {
    const reference = await snapshot(browser, pathToFileURL(REFERENCE_PATH).href, false);
    const lab = await snapshot(browser, `${server.baseUrl}${LAB_PAGE_PATH}`, true);
    const specimenMeasurements = await collectSpecimenMeasurements(browser, server.baseUrl);

    const { compared, diffs, missing } = diffSnapshots({ reference, lab });
    const specimens = evaluateSpecimens(specimenMeasurements);
    const report = formatParityReport({
      referenceCount: reference.length,
      compared,
      missingCount: missing.length,
      diffs,
      specimens,
    });
    console.log(report);
    if (diffs.length > 0 || specimens.problems.length > 0) process.exitCode = 1;
  } finally {
    await browser.close();
    await server.close();
  }
}

try {
  await run();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

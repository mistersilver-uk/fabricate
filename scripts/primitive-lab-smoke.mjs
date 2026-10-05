#!/usr/bin/env node
/**
 * `npm run lab:check` (issue 1487): boot the View Lab's Vite app, open the Primitive Lab, and fail
 * unless every catalogued row mounted with no console error, page error, Fabricate warning or
 * failed request. Maintainer-run: it refuses without a chrome harvest, which CI does not have.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import {
  ERROR_ATTRIBUTE,
  LAB_PAGE_PATH,
  MOUNTED_ATTRIBUTE,
  MOUNT_ALL_QUERY,
  READY_ATTRIBUTE,
  SPECIMEN_ATTRIBUTE,
  SPECIMEN_SELECTOR,
  cataloguePaths,
  describeMountFailure,
  emptyCatalogueMessage,
} from './lib/primitiveLabSmoke.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The browser context `scripts/view-lab-screenshots.mjs` uses, so frames are comparable. */
const BROWSER_CONTEXT = {
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
};

const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--force-color-profile=srgb'];

/** Sized for a cold Vite optimiser building the whole module graph; a warm run takes seconds. */
const READY_TIMEOUT_MS = 120_000;
const NAVIGATION_TIMEOUT_MS = 150_000;

/** Opaque, because `eslint-plugin-import-x` crashes on Vite's exports map (see the View Lab CLI). */
const VITE_SPECIFIER = 'vite';

/**
 * Start the lab's Vite server on port 0 and report the URL it actually bound, so a parallel
 * worktree's server on the configured port can never answer.
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
    throw new Error(
      'the lab server reported no local URL, so there is nothing to open. `resolvedUrls` is ' +
        'populated by `listen()`; an empty one means the server bound nothing.'
    );
  }
  return { baseUrl: resolved.replace(/\/$/, ''), close: () => server.close() };
}

/**
 * Collect console errors, page errors, failed requests and `Fabricate |` warnings — each listener
 * sees what the others miss.
 *
 * @param {import('playwright').Page} page The page.
 * @returns {string[]} The live collector, appended to as the page runs.
 */
function collectPageFailures(page) {
  const failures = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      failures.push(`console: ${message.text()}`);
      return;
    }
    // A Fabricate warning here is a component rejecting a catalogue row's props: fatal.
    if (message.type() === 'warning' && message.text().includes('Fabricate |')) {
      failures.push(`warning: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${String(error?.message ?? error)}`);
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    failures.push(`${response.status()} ${response.request().resourceType()} ${response.url()}`);
  });
  return failures;
}

/**
 * Open the lab, wait for its ready or error attribute, and return what it says about itself.
 *
 * @param {import('playwright').Page} page The page.
 * @param {string} baseUrl The server's own reported URL.
 * @returns {Promise<{error: string|null, mounted: number, specimens: string[]}>} The page's report.
 */
async function readLabReport(page, baseUrl) {
  await page.goto(`${baseUrl}${LAB_PAGE_PATH}?${MOUNT_ALL_QUERY}`, {
    waitUntil: 'load',
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await page.waitForFunction(
    ([ready, failed]) => document.body.hasAttribute(ready) || document.body.hasAttribute(failed),
    [READY_ATTRIBUTE, ERROR_ATTRIBUTE],
    { timeout: READY_TIMEOUT_MS }
  );
  return page.evaluate(
    ([failed, mounted, specimen, selector]) => ({
      error: document.body.getAttribute(failed),
      mounted: Number(document.body.getAttribute(mounted)),
      specimens: [...document.querySelectorAll(selector)].map((element) =>
        element.getAttribute(specimen)
      ),
    }),
    [ERROR_ATTRIBUTE, MOUNTED_ATTRIBUTE, SPECIMEN_ATTRIBUTE, SPECIMEN_SELECTOR]
  );
}

async function run() {
  // Before the server: a 503'd chrome stylesheet neither throws nor logs in the page.
  const cache = resolveChromeCache(ROOT);
  if (!cache) throw new Error(missingChromeMessage(ROOT));
  const expected = cataloguePaths(ROOT);
  if (expected.length === 0) throw new Error(emptyCatalogueMessage(ROOT));
  console.log(`using harvested Foundry ${cache.version} chrome`);
  console.log(`expecting ${expected.length} catalogued specimens`);

  const server = await startLabServer();
  const browser = await chromium.launch({ args: LAUNCH_ARGS });
  try {
    const context = await browser.newContext(BROWSER_CONTEXT);
    context.setDefaultTimeout(NAVIGATION_TIMEOUT_MS);
    const page = await context.newPage();
    const failures = collectPageFailures(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const report = await readLabReport(page, server.baseUrl);
    if (report.error) throw new Error(`the lab refused to boot: ${report.error}`);

    const mismatch = describeMountFailure({
      expected,
      mounted: report.specimens,
      reported: report.mounted,
    });
    if (mismatch) throw new Error(`mounted set disagrees with the catalogue:\n  ${mismatch}`);
    if (failures.length > 0) {
      throw new Error(
        `the page reported ${failures.length} failure(s):\n  ${failures.join('\n  ')}`
      );
    }
    console.log(`OK  ${report.mounted} specimens mounted, no console, page or request failures`);
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

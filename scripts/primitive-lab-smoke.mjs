#!/usr/bin/env node
/**
 * Fabricate Primitive Lab smoke — `npm run lab:check`.
 *
 * Boots the View Lab's Vite app, opens `tests/view-lab/primitives.html` with every catalogued
 * specimen mounted, and proves each one mounted against the real Foundry cascade with no console
 * error, no page error, no Fabricate warning and no failed request.
 *
 * NOT A CI GATE. It requires a harvested Foundry chrome, which never leaves a maintainer's
 * machine, so CI cannot run it — the same standing as `npm run docs:screenshots` and
 * `npm run viewlab:chrome:baseline`. `scripts/README.md` records it as maintainer-run.
 *
 * WHY THE HARVEST IS CHECKED BEFORE ANYTHING BOOTS
 * ------------------------------------------------
 * `staticMount` in `tests/view-lab/vite.config.js` answers the whole `/@foundry-chrome/` prefix
 * with HTTP 503 and a text body when no harvest is present. That is a RESPONSE, not a connection
 * failure: a `<link rel="stylesheet">` that 503s does not throw, does not log, and increments
 * nothing. The page would mount every specimen, report them all, and this smoke would exit 0 over
 * a page with no `@layer reset`, no `box-sizing`, no Font Awesome, no `:root` tokens and none of
 * `.application`'s ten custom properties — which is precisely the "half-chrome is worse than no
 * chrome" ruling `scripts/lib/foundryChromeCache.js` already makes for the View Lab.
 *
 * WHY THE SERVER IS BOOTED ON PORT 0 RATHER THAN THE CONFIGURED PORT
 * ------------------------------------------------------------------
 * The shared config pins `port: 5273, strictPort: true`, and `scripts/view-lab-screenshots.mjs`
 * builds its URL from `server.config.server.port` — the CONFIGURED value. With `strictPort` a
 * second server on that port fails loudly, but this repository runs agent lanes in parallel
 * worktrees, and a lane that reads the configured port could be answered by ANOTHER worktree's
 * already-running server: a green run against a checkout it has never seen. Overriding to port 0
 * and reading `server.resolvedUrls` asks the server which port it actually got, so the answer
 * cannot be inherited.
 *
 * WHY READINESS IS AN ATTRIBUTE AND NEVER A TIMER
 * -----------------------------------------------
 * Fifty-seven lazy component chunks settle at wildly different times on a cold optimiser. A sleep
 * long enough to be safe is long enough to be useless, and a sleep short enough to be useful reads
 * a half-mounted page as a mount failure. `data-primitive-lab-ready` is ABSENT until the last
 * specimen settles, and `data-primitive-lab-error` is present when the boot itself failed, so the
 * wait is on the disjunction and the verdict is on which one arrived.
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

/**
 * Byte-identical to `scripts/view-lab-screenshots.mjs`, so a specimen seen here and a frame
 * published there are comparable without a mental correction.
 */
const BROWSER_CONTEXT = {
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
};

const LAUNCH_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--force-color-profile=srgb'];

/**
 * Generous, because this waits for FIFTY-SEVEN lazy chunks rather than one view, and on a cold
 * Vite optimiser the whole module graph is built before the first byte is served. A warm run
 * settles in seconds and never approaches this.
 */
const READY_TIMEOUT_MS = 120_000;
const NAVIGATION_TIMEOUT_MS = 150_000;

/**
 * Vite is loaded through an indirect specifier for the reason
 * `scripts/view-lab-screenshots.mjs` records at length: `eslint-plugin-import-x` builds an export
 * map for every RESOLVED specifier before any rule filtering and crashes outright on Vite's
 * exports map, which an `eslint-disable` cannot prevent because the crash precedes the rules.
 * Keeping the specifier opaque is what keeps this file inside `npm run lint`.
 */
const VITE_SPECIFIER = 'vite';

/**
 * Start the lab's Vite server on an ephemeral port and report the URL it actually bound.
 *
 * @returns {Promise<{baseUrl: string, close: () => Promise<void>}>} The server handle.
 */
async function startLabServer() {
  const { createServer } = await import(VITE_SPECIFIER);
  const server = await createServer({
    configFile: join(ROOT, 'tests/view-lab/vite.config.js'),
    // OVERRIDES, not a second config: everything else — the chrome mounts, the raw stylesheet
    // mount, the watch exclusions — has to stay exactly what the lab itself runs with.
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
 * Attach the four listeners that decide whether a mounted page is actually clean.
 *
 * All four, because each is blind to what the others see. `console` error misses an uncaught
 * exception's stack, `pageerror` misses a logged error, neither sees a request that 404s, and
 * none of the three sees a Fabricate WARNING — which is the channel every fixture-shaped defect
 * this project has recorded actually spoke on.
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
    // FABRICATE'S OWN WARNINGS ARE FATAL. Not Foundry's, not Vite's — Fabricate's, which are
    // prefixed `Fabricate |` by convention. No tolerated list: the primitive lab mounts
    // components against a minimal world rather than booting the module, so a Fabricate warning
    // here is a component complaining about the props a catalogue row gave it, which is exactly
    // what this page exists to surface.
    if (message.type() === 'warning' && message.text().includes('Fabricate |')) {
      failures.push(`warning: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    failures.push(`pageerror: ${String(error?.message ?? error)}`);
  });
  // A bare "Failed to load resource" names nothing. Record the status, the kind and the URL —
  // this is the listener that turns a missing harvest into a sentence instead of a blank specimen.
  page.on('response', (response) => {
    if (response.status() < 400) return;
    failures.push(`${response.status()} ${response.request().resourceType()} ${response.url()}`);
  });
  return failures;
}

/**
 * Open the lab and return what it says about itself.
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
  // Serialised into the PAGE. `eslint.config.js` block 6b grants this file browser globals for
  // exactly these bodies; the Node scope around them has no `document`.
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
  // BEFORE the server, before the browser, before anything the page could paper over.
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

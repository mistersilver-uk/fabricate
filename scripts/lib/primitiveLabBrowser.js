/**
 * The browser half `lab:check` and `lab:capture` share: the context, the launch flags, the page
 * failure collector and the reads of the lab's own report and specimen sizes (issue 2413).
 */
import {
  ERROR_ATTRIBUTE,
  LAB_PAGE_PATH,
  MOUNTED_ATTRIBUTE,
  MOUNT_ALL_QUERY,
  READY_ATTRIBUTE,
  SPECIMEN_ATTRIBUTE,
  SPECIMEN_SELECTOR,
} from './primitiveLabSmoke.js';

/** The browser context `scripts/view-lab-screenshots.mjs` uses, so frames are comparable. */
export const BROWSER_CONTEXT = {
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  locale: 'en-US',
  timezoneId: 'UTC',
};

export const LAUNCH_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--force-color-profile=srgb',
];

/** Sized for a cold Vite optimiser building the whole module graph; a warm run takes seconds. */
export const READY_TIMEOUT_MS = 120_000;
export const NAVIGATION_TIMEOUT_MS = 150_000;

/**
 * Collect console errors, page errors, failed requests and `Fabricate |` warnings — each listener
 * sees what the others miss.
 *
 * @param {import('playwright').Page} page The page.
 * @returns {string[]} The live collector, appended to as the page runs.
 */
export function collectPageFailures(page) {
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
 * @param {number} [readyTimeoutMs] How long to wait for ready or error.
 * @returns {Promise<{error: string|null, mounted: number, specimens: string[]}>} The page's report.
 */
export async function readLabReport(page, baseUrl, readyTimeoutMs = READY_TIMEOUT_MS) {
  await page.goto(`${baseUrl}${LAB_PAGE_PATH}?${MOUNT_ALL_QUERY}`, {
    waitUntil: 'load',
    timeout: NAVIGATION_TIMEOUT_MS,
  });
  await page.waitForFunction(
    ([ready, failed]) => document.body.hasAttribute(ready) || document.body.hasAttribute(failed),
    [READY_ATTRIBUTE, ERROR_ATTRIBUTE],
    { timeout: readyTimeoutMs }
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

/** How long after ready the sizes are read again; a corrective resize lands within a frame or two. */
export const SETTLE_MS = 750;

/** Every specimen iframe's rendered size, in document order. */
export function readSpecimenSizes(page) {
  return page.evaluate(
    ([specimen, selector]) =>
      [...document.querySelectorAll(selector)].map((element) => {
        const rect = element.getBoundingClientRect();
        return { specimen: element.getAttribute(specimen), width: rect.width, height: rect.height };
      }),
    [SPECIMEN_ATTRIBUTE, SPECIMEN_SELECTOR]
  );
}

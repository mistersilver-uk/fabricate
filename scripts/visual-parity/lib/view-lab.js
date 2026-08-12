/**
 * Booting the REAL APP for a parity pass, in one place.
 *
 * Both passes measure the shipped components rather than a fixture, so both need the same
 * thing: a Vite server over the View Lab, one page, and a wait that ends when the lab says it
 * is ready — or says it failed. This module is that boot, and it is here rather than in a spec
 * because "how this repository renders its own app for measurement" is repository machinery,
 * not prototype knowledge. A spec that had to restate it would be a second implementation of
 * the boot, free to drift from this one, which is the shape of defect the whole change this
 * module belongs to exists to remove.
 *
 * What a spec still owns is everything ABOUT the screen: which app, which lab world, and how
 * to drive it to a section. That is `afterOpen` and the spec's own `subject.navigate`.
 */
import { resolve } from 'node:path';

/**
 * The dev-server module, named through a constant rather than written inline.
 *
 * Not a preference: this repository's ESLint import resolver CRASHES on `vite`'s exports map
 * (`EslintPluginImportResolveError: node with invalid interface loaded as resolver`), whether
 * the import is static or a literal dynamic one, and a lint gate that cannot parse a file is a
 * lint gate that has stopped covering it. The module loaded is fixed and constant either way.
 */
const VITE_MODULE = 'vite';

/** The lab's entry document and its Vite config, relative to the repository root. */
export const VIEW_LAB_PAGE = 'tests/view-lab/index.html';
export const VIEW_LAB_VITE_CONFIG = 'tests/view-lab/vite.config.js';

/** The lab's own readiness contract: one of these two lands on `<body>` when it settles. */
const READY_FLAGS = () => {
  const { viewLabReady, viewLabError } = globalThis.document.body.dataset;
  return viewLabReady !== undefined || viewLabError !== undefined;
};

/**
 * Open the View Lab and hand back the page it rendered the app into.
 *
 * @param {object} browser Playwright browser.
 * @param {object} options Lab boot options.
 * @param {string} options.repoRoot Absolute repository root.
 * @param {string} options.app The lab's app id (its `?app=`).
 * @param {object} [options.query] Further lab query parameters, e.g. `system`, `case`, `w`, `h`.
 * @param {object} [options.viewport] Page viewport; the lab window sizes itself from `query`.
 * @param {number} [options.settleMs] Quiet time after readiness, for fonts and transitions.
 * @param {number} [options.attempts] Boot attempts; a cold server races Vite's optimiser.
 * @param {(page: object) => Promise<void>} [options.afterOpen] Spec-owned first navigation.
 * @returns {Promise<{page: object, dispose: () => Promise<void>}>} The live subject.
 */
export async function openViewLab(browser, options) {
  const {
    repoRoot,
    app,
    query = {},
    viewport = { width: 1920, height: 1200 },
    settleMs = 600,
    attempts = 4,
    afterOpen = null,
  } = options;

  const { createServer } = await import(VITE_MODULE);
  const server = await createServer({ configFile: resolve(repoRoot, VIEW_LAB_VITE_CONFIG) });
  await server.listen();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const dispose = async () => {
    await page.close();
    await server.close();
  };

  try {
    const search = new URLSearchParams({ app, ...query });
    const url = `http://127.0.0.1:${server.config.server.port}/${VIEW_LAB_PAGE}?${search}`;
    let booted = false;
    for (let attempt = 0; attempt < attempts && !booted; attempt += 1) {
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 60_000 });
        await page.waitForFunction(READY_FLAGS, null, { timeout: 90_000 });
        booted = true;
      } catch {
        // The first navigation on a cold server races Vite's dependency optimiser, which
        // reloads the page under it. Retry rather than reporting a parity failure for it.
      }
    }
    if (!booted) throw new Error('the View Lab did not boot');
    // A LAB THAT FAILED IS NOT A SUBJECT. Without this the run measures whatever partial DOM
    // the error left behind and reports the difference as the product's drift.
    const failure = await page.evaluate(
      () => globalThis.document.body.dataset.viewLabError ?? null
    );
    if (failure) throw new Error(`the View Lab reported an error: ${failure}`);
    await page.waitForTimeout(settleMs);
    if (afterOpen) await afterOpen(page);
    return { page, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

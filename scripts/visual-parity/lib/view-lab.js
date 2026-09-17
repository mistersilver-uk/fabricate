/** Booting the real app for a parity pass, in one place. */
import { resolve } from 'node:path';

/** The dev-server module, named through a constant rather than written inline. */
const VITE_MODULE = 'vite';

/** The lab's entry document and its Vite config, relative to the repository root. */
export const VIEW_LAB_PAGE = 'tests/view-lab/index.html';
export const VIEW_LAB_VITE_CONFIG = 'tests/view-lab/vite.config.js';

/** The lab's pinned port (`tests/view-lab/vite.config.js` sets `strictPort`). */
export const VIEW_LAB_PORT = 5273;

/** Whether something on this port is already serving the lab's entry document. */
async function labIsServing(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/${VIEW_LAB_PAGE}`);
    return response.ok && (await response.text()).includes('view-lab');
  } catch {
    return false;
  }
}

/** The lab's own readiness contract: one of these two lands on `<body>` when it settles. */
const READY_FLAGS = () => {
  const { viewLabReady, viewLabError } = globalThis.document.body.dataset;
  return viewLabReady !== undefined || viewLabError !== undefined;
};

/** Open the View Lab and hand back the page it rendered the app into. */
export async function openViewLab(browser, options) {
  const {
    repoRoot,
    app,
    query = {},
    viewport = { width: 1920, height: 1200 },
    settleMs = 600,
    attempts = 4,
    port = VIEW_LAB_PORT,
    afterOpen = null,
  } = options;

  // Attach to a lab that is already running rather than fighting it for the port.
  const running = await labIsServing(port);
  const { createServer } = running ? {} : await import(VITE_MODULE);
  const server = running
    ? null
    : await createServer({ configFile: resolve(repoRoot, VIEW_LAB_VITE_CONFIG) });
  if (server) await server.listen();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const dispose = async () => {
    await page.close();
    if (server) await server.close();
  };

  try {
    const search = new URLSearchParams({ app, ...query });
    const url = `http://127.0.0.1:${server?.config.server.port ?? port}/${VIEW_LAB_PAGE}?${search}`;
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

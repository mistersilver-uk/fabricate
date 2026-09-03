#!/usr/bin/env node
/**
 * Fabricate Primitive Lab parity oracle — `npm run lab:parity`.
 *
 * Loads `openspec/specs/design-system/library.html` twice — once as a bare `file://` document (the
 * REFERENCE: no Foundry stylesheet, no Fabricate stylesheet, nothing but the library's own kit) and
 * once as the Primitive Lab renders it (`tests/view-lab/primitives.html`, the LAB) — walks every
 * element under `<main>` on both, and compares 22 computed style properties element by element.
 * Every element the lab did NOT replace with a live specimen must paint IDENTICALLY to the
 * reference; a `.unit` that holds a live specimen is skipped whole on both sides, because that
 * subtree is supposed to differ.
 *
 * See `scripts/lib/primitiveLabParity.js` for the comparison itself and why it is keyed by
 * position rather than by any hand-authored id. This file owns only the browser, the two page
 * loads, the in-page collector, and the process exit code — `unicorn/no-exports-in-scripts`
 * forbids this shell from also being a module, the same split `primitive-lab-smoke.mjs` makes
 * beside `primitiveLabSmoke.js`.
 *
 * NOT A CI GATE, for the same reason `npm run lab:check` is not one: it requires a harvested
 * Foundry chrome, which never leaves a maintainer's machine. `scripts/README.md` records it as
 * maintainer-run alongside the other lab tooling.
 */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { chromium } from 'playwright';

import { missingChromeMessage, resolveChromeCache } from './lib/foundryChromeCache.js';
import { diffSnapshots, formatParityReport, PARITY_PROPERTIES } from './lib/primitiveLabParity.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const LAB_PAGE_PATH = '/tests/view-lab/primitives.html';
const READY_ATTRIBUTE = 'data-primitive-lab-ready';

const REFERENCE_PATH = join(ROOT, 'openspec/specs/design-system/library.html');

/** Byte-identical viewport to `primitive-lab-smoke.mjs`, so a diff here is not a viewport artefact. */
const VIEWPORT = { width: 1440, height: 1000 };

const NAVIGATION_TIMEOUT_MS = 60_000;
const READY_TIMEOUT_MS = 240_000;

/** Time to let web fonts and any transition finish settling once the page reports ready. */
const SETTLE_MS = 3000;

/**
 * Opaque module specifier — see `primitive-lab-smoke.mjs`'s own comment: `eslint-plugin-import-x`
 * crashes building an export map for Vite's `exports` field, and keeping the specifier out of
 * static analysis is what keeps this file lintable at all.
 */
const VITE_SPECIFIER = 'vite';

/**
 * Start the Primitive Lab's own Vite server on an ephemeral port.
 *
 * Port 0 rather than the config's pinned 5273, and for the same two reasons
 * `primitive-lab-smoke.mjs` gives: that port may be a maintainer's OWN dev server (never steal
 * it), and this repository runs agent lanes in parallel worktrees, where reading the configured
 * port could silently attach to another worktree's server.
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
 * Walk `<main>`, collecting a position-keyed style snapshot of every element — except a live
 * specimen's own subtree, which is skipped whole.
 *
 * SERIALISED INTO THE PAGE. `eslint.config.js` block 6b grants this file browser globals for
 * exactly this body; there is no `document` in the Node scope around it.
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

  // A `.unit` holding a live specimen is skipped WHOLE: its drawing is gone by design, and that
  // subtree is supposed to differ from the reference.
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

async function run() {
  const cache = resolveChromeCache(ROOT);
  if (!cache) throw new Error(missingChromeMessage(ROOT));

  const server = await startLabServer();
  const browser = await chromium.launch();
  try {
    const reference = await snapshot(browser, pathToFileURL(REFERENCE_PATH).href, false);
    const lab = await snapshot(browser, `${server.baseUrl}${LAB_PAGE_PATH}`, true);

    const { compared, diffs, missing } = diffSnapshots({ reference, lab });
    const report = formatParityReport({
      referenceCount: reference.length,
      compared,
      missingCount: missing.length,
      diffs,
    });
    console.log(report);
    if (diffs.length > 0) process.exitCode = 1;
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

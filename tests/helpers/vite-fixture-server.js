/**
 * The Vite dev server and Chromium instance a RENDERED fixture suite runs against.
 *
 * Two suites need the same four things and needed them identically: a Vite server rooted at the
 * repository with the real Svelte plugin, so a fixture page can import `.svelte` files from
 * `src/` and get them compiled exactly as the shipped bundle compiles them; `styles/fabricate.css`
 * served RAW, outside the CSS pipeline; NO file watcher; and a Chromium to open the page in. The
 * blocks were near-identical down to their comments, which is a SonarCloud new-code duplication
 * finding as well as two places to fix the next `ENOSPC`.
 *
 * WHAT VARIES IS TWO THINGS, and both are parameters here: the URL prefix the raw stylesheet is
 * mounted under, which each suite names after itself so a fixture page's `<link href>` says which
 * suite serves it, and any EXTRA plugin the fixture needs (`overlay-portal-host-position` stubs
 * Foundry's bundled artwork, because its subject falls back to a core icon path that no dev
 * server here can resolve).
 *
 * @see tests/components/player-select-conversion-rendered.test.js
 * @see tests/components/overlay-portal-host-position.test.js
 */
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const repoRoot = resolve(import.meta.dirname, '../..');

/**
 * Serve `styles/fabricate.css` RAW, outside Vite's CSS pipeline.
 *
 * The sheet is 20k+ lines with `url()` references and layered `@import`s; running it through
 * PostCSS would rewrite or inline them for no benefit to a measurement. The page wants the bytes.
 *
 * @param {string} prefix The URL prefix to mount under, e.g. `/@overlay-host-styles/`.
 * @returns {object} a Vite plugin.
 */
function rawStylesheetMount(prefix) {
  return {
    name: `raw-stylesheet${prefix.replace(/[^\w-]+/gu, '-').replace(/-+$/u, '')}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '';
        if (!url.startsWith(prefix)) return next();
        if (url.slice(prefix.length).split('?')[0] !== 'fabricate.css') {
          response.statusCode = 404;
          response.end('not found');
          return;
        }
        response.setHeader('Content-Type', 'text/css; charset=utf-8');
        createReadStream(join(repoRoot, 'styles', 'fabricate.css')).pipe(response);
      });
    },
  };
}

/**
 * A started-and-stopped Vite server plus Chromium, for a suite's `before`/`after`.
 *
 * @param {object} options
 * @param {string} options.styleMountPrefix The URL prefix `styles/fabricate.css` is served under.
 * @param {object[]} [options.extraPlugins] Further Vite plugins, applied before the Svelte one.
 * @returns {{start: () => Promise<void>, stop: () => Promise<void>, url: (path: string) => string,
 *   newPage: (options?: object) => Promise<import('playwright').Page>}}
 */
export function createViteFixtureServer({ styleMountPrefix, extraPlugins = [] }) {
  let server = null;
  let browser = null;
  let origin = '';

  return {
    async start() {
      server = await createServer({
        // `configFile: false` on purpose: the production `vite.config.js` installs the Foundry dev
        // proxy on `serve`, which these fixtures neither need nor should depend on.
        configFile: false,
        root: repoRoot,
        // NO FILE WATCHER, for the reason `tests/view-lab/vite.config.js` records at length: the
        // root is the whole repository, chokidar costs an inotify handle per file, and a developer
        // with harvested Foundry chrome or sibling lane worktrees exhausts the user-session limit
        // and dies with an `ENOSPC` naming a file the run never touches. Nothing is edited mid-run.
        server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
        logLevel: 'silent',
        plugins: [rawStylesheetMount(styleMountPrefix), ...extraPlugins, svelte()],
      });
      await server.listen();
      origin = `http://127.0.0.1:${server.httpServer.address().port}`;
      browser = await chromium.launch();
    },

    async stop() {
      await browser?.close();
      await server?.close();
      browser = null;
      server = null;
      origin = '';
    },

    /**
     * A repository-root-relative path as an absolute URL on this server.
     *
     * @param {string} path e.g. `/tests/fixtures/overlay-host/index.html?subject=select`.
     * @returns {string}
     */
    url(path) {
      return `${origin}${path}`;
    },

    /**
     * @param {object} [options] Forwarded to `browser.newPage`.
     * @returns {Promise<import('playwright').Page>}
     */
    newPage(options = {}) {
      return browser.newPage(options);
    },
  };
}

/**
 * A real pointer press on one element: `mousedown`, `mouseup`, then the click they produce.
 *
 * Through Playwright's own mouse rather than `locator.click()` so the three events are separable
 * in a failure message, and so the sequence is unmistakably the one a user's pointer generates
 * rather than a synthesised activation that skips `mousedown` entirely. A synthesised click
 * proves nothing about a panel dismissed on `mousedown`: the dismisser never runs, and every
 * wrapper shape passes. Shared by the player (issue 1511) and manager (issue 1510) select proofs.
 *
 * @param {import('playwright').Page} page
 * @param {string} selector
 * @returns {Promise<void>}
 */
export async function pressPointerOn(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} has no box to press on`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
  );
}

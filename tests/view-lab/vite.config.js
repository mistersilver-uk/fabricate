import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

import { missingChromeMessage, resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';

const repoRoot = resolve(import.meta.dirname, '../..');
const chromeCache = resolveChromeCache(repoRoot);
const dnd5eRoot = join(repoRoot, '.foundry-e2e', 'systems', 'dnd5e');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

function mimeTypeFor(path) {
  const dot = path.lastIndexOf('.');
  return (dot === -1 ? null : MIME_TYPES[path.slice(dot).toLowerCase()]) ?? 'application/octet-stream';
}

/**
 * Serve a gitignored directory tree at a URL prefix, structure preserved.
 *
 * Structure preservation is the whole point rather than an implementation detail: `foundry2.css`
 * carries ~21 relative `url()`s (`../ui/parchment.jpg`, `../fonts/signika/…`) and Font Awesome
 * carries its own `../webfonts/…`. Only a faithful directory mount resolves them. Serving these
 * raw also keeps Vite's CSS pipeline off a 429 KB third-party stylesheet.
 *
 * @param {string} prefix URL prefix, leading and trailing slash included.
 * @param {string|null} root Absolute directory to serve, or null to disable the mount.
 * @param {string} label Human name used in the 503 body when the mount is unavailable.
 */
function staticMount(prefix, root, label) {
  return {
    name: `view-lab-mount:${prefix}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = request.url ?? '';
        if (!url.startsWith(prefix)) return next();
        if (!root) {
          response.statusCode = 503;
          response.end(`${label} is not available; run: npm run viewlab:chrome:harvest`);
          return;
        }
        const relative = decodeURIComponent(url.slice(prefix.length).split('?')[0].split('#')[0]);
        const target = resolve(root, relative);
        // Containment check: `resolve` collapses `..`, so comparing the resolved prefix is what
        // actually stops traversal out of the mount.
        if (target !== root && !target.startsWith(root + sep)) {
          response.statusCode = 403;
          response.end('forbidden');
          return;
        }
        if (!existsSync(target) || !statSync(target).isFile()) {
          response.statusCode = 404;
          response.end('not found');
          return;
        }
        response.setHeader('Content-Type', mimeTypeFor(target));
        // Never cache: a re-harvest must be visible to the very next capture.
        response.setHeader('Cache-Control', 'no-store');
        createReadStream(target).pipe(response);
      });
    },
  };
}

/**
 * `src/main.js` imports `../styles/fabricate.css` so the production bundle carries it. The lab
 * already loads that stylesheet itself, RAW and at `layer(modules)`, to reproduce Foundry's
 * cascade — letting Vite inject a second, unlayered copy would put it above every layer and quietly
 * invert the precedence the lab exists to get right. Same intent as `stripGlobalCss` in the
 * production `vite.config.js`, applied for the opposite reason.
 */
function stripGlobalCssImport() {
  const NOOP_ID = '\0view-lab-global-css-noop';
  return {
    name: 'view-lab-strip-global-css',
    enforce: 'pre',
    resolveId(source) {
      if (source.includes('styles/fabricate.css')) return NOOP_ID;
      return null;
    },
    load(id) {
      return id === NOOP_ID ? '' : null;
    },
  };
}

/**
 * Answer, in the browser, whether the chrome was harvested — and if not, how to harvest it.
 *
 * `missingChromeMessage()` is the project's one statement of that answer. It reads the filesystem
 * (it reports whether a release archive is already cached, which changes the instructions), so it
 * cannot run in the page. Restating it there would make a second copy of an instruction whose whole
 * value is being right, and the View Lab has already measured what happens to duplicated prose.
 *
 * So the message is produced where it can be produced and served as data. The page still PROBES the
 * stylesheet rather than trusting this endpoint: a status that says "available" while the mount
 * 404s a file is a state the page must not boot in.
 */
function chromeStatusEndpoint() {
  return {
    name: 'view-lab-chrome-status',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url ?? '').split('?')[0] !== CHROME_STATUS_PATH) return next();
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.end(
          JSON.stringify({
            available: Boolean(chromeCache),
            version: chromeCache?.version ?? null,
            message: chromeCache ? null : missingChromeMessage(repoRoot),
          })
        );
      });
    },
  };
}

const CHROME_STATUS_PATH = '/@primitive-lab/chrome-status';

export default defineConfig({
  root: repoRoot,
  plugins: [
    stripGlobalCssImport(),
    chromeStatusEndpoint(),
    svelte(),
    staticMount('/@foundry-chrome/', chromeCache?.dir ?? null, 'Harvested Foundry window chrome'),
    staticMount('/@foundry-system/dnd5e/', existsSync(dnd5eRoot) ? dnd5eRoot : null, 'The dnd5e system tree'),
    // Production `styles/fabricate.css` and the layered cascade shim, both served raw so the
    // BROWSER resolves `@import ... layer(...)`. Vite's PostCSS import inliner would flatten
    // them and discard the layer annotations, which are what reproduce Foundry's cascade.
    staticMount('/@fabricate-styles/', join(repoRoot, 'styles'), 'The Fabricate stylesheet'),
    staticMount('/@view-lab/', resolve(import.meta.dirname), 'The View Lab cascade shim'),
    // `openspec/specs/design-system/library.html`, served RAW for the Primitive Lab to parse.
    //
    // Not read through its repository path, and not because of the filesystem: Vite applies its
    // HTML transform to any `.html` under the dev root, which injects the client script and
    // rewrites asset URLs. Neither breaks the parse today, but it would make the lab a reader of a
    // REWRITTEN copy of a spec artifact — so a change to that transform would look exactly like a
    // change to the library. Same reason the harvested chrome and the raw stylesheet are mounted
    // rather than imported.
    staticMount(
      '/@design-library/',
      join(repoRoot, 'openspec', 'specs', 'design-system'),
      'The design system library'
    ),
    // Foundry serves its core art at /icons/; Fabricate's default images reference it that way.
    staticMount('/icons/', chromeCache ? join(chromeCache.dir, 'icons') : null, 'Foundry core icons'),
  ],
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
    hmr: false,
    fs: { allow: [repoRoot, ...(chromeCache ? [chromeCache.dir] : []), ...(existsSync(dnd5eRoot) ? [dnd5eRoot] : [])] },
    // The served asset trees are READ-ONLY and enormous — a harvest is ~7,100 files of Foundry
    // core art alone, and the dnd5e tree is the same shape. Serving a directory puts it in the
    // watch graph, and watching it costs one inotify handle PER FILE. On a stock Linux box
    // `fs.inotify.max_user_watches` is 65,536 for the whole user session, so one harvest is
    // enough to exhaust it — and the failure does not name the cause: the suite dies with
    // `ENOSPC ... watch '<some>.webp'` from deep inside chokidar, on tests that have nothing to
    // do with art. Nothing here is ever edited mid-run, so watching it buys nothing at any price.
    watch: {
      ignored: [
        // Agent lane worktrees live INSIDE the repo, each a full checkout. The lab's root is
        // the repo, so without this it watches every lane's `src/` as well as its own — tens
        // of thousands of files that are never the ones under test — and dies with
        // `ENOSPC ... watch '<some lane>/src/…'`, naming a file in a checkout the run has
        // nothing to do with.
        '**/.worktrees/**',
        ...(chromeCache ? [join(chromeCache.dir, '**')] : []),
        ...(existsSync(dnd5eRoot) ? [join(dnd5eRoot, '**')] : []),
      ],
    },
  },
  // BOTH entries. The optimiser pre-bundles the dependency graph reachable from what is listed
  // here; a page whose entry is absent pays that cost on its first navigation instead, which is
  // measured in tens of seconds against a Playwright default of 30 and reads as a broken page
  // rather than as a cold cache.
  optimizeDeps: { entries: ['tests/view-lab/mount.js', 'tests/view-lab/primitives/mount.js'] },
});

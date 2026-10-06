import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

import { missingChromeMessage, resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';

import { worktreeWatchIgnores } from './watchIgnore.js';

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

/** `src/main.js` imports `../styles/fabricate.css` so the production bundle carries it. */
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

const CHROME_STATUS_PATH = '/@primitive-lab/chrome-status';

/**
 * Serve the harvest status and `missingChromeMessage()` as data, because that message reads the
 * filesystem and cannot run in the page. The Primitive Lab still probes the stylesheet itself.
 */
function chromeStatusEndpoint() {
  return {
    name: 'view-lab-chrome-status',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if ((request.url ?? '').split('?', 1)[0] !== CHROME_STATUS_PATH) return next();
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

export default defineConfig({
  root: repoRoot,
  plugins: [
    stripGlobalCssImport(),
    chromeStatusEndpoint(),
    svelte(),
    staticMount('/@foundry-chrome/', chromeCache?.dir ?? null, 'Harvested Foundry window chrome'),
    staticMount('/@foundry-system/dnd5e/', existsSync(dnd5eRoot) ? dnd5eRoot : null, 'The dnd5e system tree'),
    // Production `styles/fabricate.css` and the layered cascade shim, both served raw so the
    // BROWSER resolves `@import ... layer(...)`.
    staticMount('/@fabricate-styles/', join(repoRoot, 'styles'), 'The Fabricate stylesheet'),
    staticMount('/@view-lab/', resolve(import.meta.dirname), 'The View Lab cascade shim'),
    // The design library served raw for the Primitive Lab, never through Vite's HTML transform.
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
    // The served asset trees are READ-ONLY and enormous — a harvest is ~7,100 files of Foundry core
    // art alone, and the dnd5e tree is the same shape.
    watch: {
      ignored: [
        // Agent lane worktrees live INSIDE the primary repo, each a full checkout. Anchored at the
        // served root, so a lab served FROM a worktree still watches its own tree.
        ...worktreeWatchIgnores(repoRoot),
        ...(chromeCache ? [join(chromeCache.dir, '**')] : []),
        ...(existsSync(dnd5eRoot) ? [join(dnd5eRoot, '**')] : []),
      ],
    },
  },
  // Both pages' entries, so neither pays the optimiser's cold pre-bundle on first navigation.
  optimizeDeps: { entries: ['tests/view-lab/mount.js', 'tests/view-lab/primitives/mount.js'] },
});

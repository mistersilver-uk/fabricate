import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

import { resolveChromeCache } from '../../scripts/lib/foundryChromeCache.js';

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

export default defineConfig({
  root: repoRoot,
  plugins: [
    svelte(),
    staticMount('/@foundry-chrome/', chromeCache?.dir ?? null, 'Harvested Foundry window chrome'),
    staticMount('/@foundry-system/dnd5e/', existsSync(dnd5eRoot) ? dnd5eRoot : null, 'The dnd5e system tree'),
    // Production `styles/fabricate.css` and the layered cascade shim, both served raw so the
    // BROWSER resolves `@import ... layer(...)`. Vite's PostCSS import inliner would flatten
    // them and discard the layer annotations, which are what reproduce Foundry's cascade.
    staticMount('/@fabricate-styles/', join(repoRoot, 'styles'), 'The Fabricate stylesheet'),
    staticMount('/@view-lab/', resolve(import.meta.dirname), 'The View Lab cascade shim'),
  ],
  server: {
    host: '127.0.0.1',
    port: 5273,
    strictPort: true,
    hmr: false,
    fs: { allow: [repoRoot, ...(chromeCache ? [chromeCache.dir] : []), ...(existsSync(dnd5eRoot) ? [dnd5eRoot] : [])] },
  },
  optimizeDeps: { entries: ['tests/view-lab/mount.js'] },
});

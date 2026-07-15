import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const FOUNDRY_ORIGIN = 'http://localhost:30000';
const MODULE_PATH_PREFIX = '/modules/fabricate/';

// Static content types for repo assets served in dev (fonts + preview images).
// The fonts matter most: `styles/fabricate.css`'s `@font-face` rules resolve to
// `/assets/fonts/*.woff2`, and without this the dev proxy forwards them to Foundry
// (which has no such file), so every weight fails to download. Production copies
// `assets/` into `dist/assets/`, so this is a dev-server gap only.
const ASSET_CONTENT_TYPES = {
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif'
};

/**
 * Vite plugin that proxies Foundry VTT and rewrites Fabricate module paths
 * so Vite serves the repo-root entry and source files with HMR transforms.
 */
export function fabricateDevProxy() {
  return {
    name: 'fabricate-foundry-proxy',
    configureServer(server) {
      const root = server.config.root;
      // Pre-middleware: runs BEFORE Vite's internal middleware.
      // This is essential because Vite's SPA fallback would otherwise intercept
      // HTML requests looking for index.html (which doesn't exist) and 404.
      // Vite-owned paths (/@vite/, /src/, etc.) are passed through via next().
      server.middlewares.use((req, res, next) => {
        // Rewrite Fabricate module paths to project-root-relative paths. This also
        // maps `/modules/fabricate/assets/...` onto `/assets/...`, so the asset
        // branch below catches both the rewritten and the direct (`@font-face`
        // relative-url) forms.
        const rewrittenModuleUrl = rewriteFabricateModuleUrl(req.url);
        if (rewrittenModuleUrl) {
          req.url = rewrittenModuleUrl;
        }

        // Serve repo static assets (fonts, preview images) straight from disk.
        // Without this the `@font-face` `/assets/fonts/*.woff2` requests fall to
        // the catch-all and get proxied to Foundry, which 404s them. A path that is
        // NOT a repo asset (Foundry serves plenty under `/assets/` too) must fall
        // through to Foundry — the original catch-all — NOT to Vite's `next()`,
        // which would dead-end it in a 404.
        if (req.url?.startsWith('/assets/')) {
          if (serveRepoAsset(req, res, root)) return;
          return proxyToFoundry(req, res);
        }

        if (rewrittenModuleUrl) {
          return next();
        }

        // Let Vite handle its own assets (/@vite/, /@fs/, /src/, /node_modules/.vite/)
        if (
          req.url?.startsWith('/@') ||
          req.url?.startsWith('/src/') ||
          req.url?.startsWith('/node_modules/') ||
          req.url?.startsWith('/styles/')
        ) {
          return next();
        }

        // Catch-all: proxy to Foundry
        proxyToFoundry(req, res);
      });
    }
  };
}

/**
 * Map a Fabricate module request from Foundry's module namespace to a Vite
 * project-root path. In dev we serve the source entry (`/src/main.js`) directly
 * rather than the root `main.js` shim: the shim's `await import('./src/main.js')`
 * adds an extra async hop before the real module evaluates, widening the window in
 * which Foundry's `init` event can fire first (the cause of the manager's "still
 * loading" stall). Going straight to the source removes that hop.
 *
 * @param {string | undefined} requestUrl
 * @returns {string | null}
 */
export function rewriteFabricateModuleUrl(requestUrl) {
  if (!requestUrl) return null;

  const parsed = new URL(requestUrl, FOUNDRY_ORIGIN);
  if (!parsed.pathname.startsWith(MODULE_PATH_PREFIX)) return null;

  const relativePath = parsed.pathname.slice(MODULE_PATH_PREFIX.length);
  const suffix = `${parsed.search}${parsed.hash}`;

  if (relativePath === 'main.js' || relativePath === 'dist/main.js') {
    return `/src/main.js${suffix}`;
  }

  return `/${relativePath}${suffix}`;
}

/**
 * Serve a file under the repo's `assets/` directory in dev.
 *
 * Returns `true` when it wrote a response, `false` when the request is not a repo
 * asset (missing file, or a path that escapes `assets/`) — the caller then proxies
 * the request to Foundry, which owns every other `/assets/` path.
 *
 * Synchronous on purpose: the middleware must decide serve-or-proxy in a single
 * tick and hand a miss straight to `proxyToFoundry` (deferring that decision to a
 * promise let connect fall through to Vite's 404 before the proxy ran). A `statSync`
 * in a dev-only proxy is negligible.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 * @param {string} root Vite project root (the repo root).
 * @returns {boolean} whether a response was written.
 */
export function serveRepoAsset(req, res, root) {
  const pathname = new URL(req.url || '/', FOUNDRY_ORIGIN).pathname;
  const relative = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const filePath = join(root, relative);

  // Path-traversal guard: the resolved file must stay inside `assets/`.
  if (!filePath.startsWith(join(root, 'assets'))) {
    return false;
  }

  let info;
  try {
    info = statSync(filePath);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  const type = ASSET_CONTENT_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'content-length': info.size,
    // Fonts/images are content-hashed by filename in prod; in dev keep them
    // fresh so an edited asset is picked up on reload.
    'cache-control': 'no-cache'
  });
  createReadStream(filePath).pipe(res);
  return true;
}

function proxyToFoundry(clientReq, clientRes) {
  const url = new URL(clientReq.url || '/', FOUNDRY_ORIGIN);
  const isHTML = clientReq.headers.accept?.includes('text/html');

  const headers = { ...clientReq.headers, host: url.host };
  // Request uncompressed content for HTML so we can inject the Vite client
  if (isHTML) headers['accept-encoding'] = 'identity';

  const proxyReq = http.request(
    {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: clientReq.method,
      headers
    },
    (proxyRes) => {
      if (isHTML && proxyRes.headers['content-type']?.includes('text/html')) {
        // Buffer HTML response to inject Vite client script
        const chunks = [];
        proxyRes.on('data', (chunk) => chunks.push(chunk));
        proxyRes.on('end', () => {
          let body = Buffer.concat(chunks).toString('utf-8');
          body = body.replace(
            '</head>',
            '<script type="module" src="/@vite/client"></script>\n</head>'
          );

          // Strip CSP headers that would block the injected script
          const responseHeaders = { ...proxyRes.headers };
          delete responseHeaders['content-security-policy'];
          delete responseHeaders['content-security-policy-report-only'];
          delete responseHeaders['content-length']; // Length changed after injection
          responseHeaders['content-length'] = Buffer.byteLength(body);

          clientRes.writeHead(proxyRes.statusCode || 200, responseHeaders);
          clientRes.end(body);
        });
      } else {
        // Stream non-HTML responses directly
        clientRes.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
        proxyRes.pipe(clientRes);
      }
    }
  );

  proxyReq.on('error', (err) => {
    console.error(`[fabricate-proxy] Error proxying ${clientReq.url}:`, err.message);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'content-type': 'text/plain' });
    }
    clientRes.end(`Proxy error: ${err.message}\nIs Foundry running at ${FOUNDRY_ORIGIN}?`);
  });

  clientReq.pipe(proxyReq);
}

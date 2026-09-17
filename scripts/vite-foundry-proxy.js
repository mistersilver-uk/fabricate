import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';

const FOUNDRY_ORIGIN = 'http://localhost:30000';
const MODULE_PATH_PREFIX = '/modules/fabricate/';

// The premium companion, served from its own checkout so a change to its source reloads without a
// build.
const PREMIUM_PATH_PREFIX = '/modules/fabricate-premium/';
const PREMIUM_ENTRY = 'scripts/main.js';

/** Absolute path to premium's source directory, or null when it is not checked out. */
export function premiumSourceRoot() {
  const configured = process.env.FABRICATE_PREMIUM_PATH;
  const repoRoot = configured || join(process.cwd(), '..', 'fabricate-premium');
  const candidate = join(repoRoot, 'packages', 'fabricate-premium', 'src');
  try {
    return statSync(join(candidate, 'main.js')).isFile() ? candidate : null;
  } catch {
    return null;
  }
}

/** Map premium's manifest-declared esmodule onto its source entry under `/@fs/`. */
export function rewritePremiumModuleUrl(requestUrl, sourceRoot) {
  if (!requestUrl || !sourceRoot) return null;

  const parsed = new URL(requestUrl, FOUNDRY_ORIGIN);
  if (!parsed.pathname.startsWith(PREMIUM_PATH_PREFIX)) return null;

  const relativePath = parsed.pathname.slice(PREMIUM_PATH_PREFIX.length);
  if (relativePath !== PREMIUM_ENTRY) return null;

  const entry = join(sourceRoot, 'main.js').split(sep).join('/');
  return `/@fs/${entry}${parsed.search}${parsed.hash}`;
}

// Static content types for repo assets served in dev (fonts + preview images).
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
  '.gif': 'image/gif',
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
      const premiumRoot = premiumSourceRoot();
      if (premiumRoot) {
        // Vite's watcher covers the project root.
        server.watcher.add(premiumRoot);
        server.config.logger.info(`  ➜  premium:  serving ${premiumRoot} with HMR`);
      }
      // Pre-middleware: runs before Vite's internal middleware. This is essential because Vite's
      // spa fallback would otherwise intercept HTML requests looking for index.html (which doesn't
      // exist) and 404.
      server.middlewares.use((req, res, next) => {
        // Rewrite Fabricate module paths to project-root-relative paths.
        const premiumUrl = rewritePremiumModuleUrl(req.url, premiumRoot);
        if (premiumUrl) {
          req.url = premiumUrl;
          return next();
        }

        const rewrittenModuleUrl = rewriteFabricateModuleUrl(req.url);
        if (rewrittenModuleUrl) {
          req.url = rewrittenModuleUrl;
        }

        // Serve repo static assets (fonts, preview images) straight from disk. Without this the
        // `@font-face` `/assets/fonts/*.woff2` requests fall to the catch-all and get proxied to
        // Foundry, which 404s them.
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
    },
  };
}

/** Map a Fabricate module request from Foundry's module namespace to a Vite project-root path. */
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

/** Serve a file under the repo's `assets/` directory in dev. */
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
    'cache-control': 'no-cache',
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
      headers,
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

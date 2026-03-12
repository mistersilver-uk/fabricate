import http from 'node:http';

const FOUNDRY_ORIGIN = 'http://localhost:30000';
const MODULE_PATH_PREFIX = '/modules/fabricate/';

/**
 * Vite plugin that proxies Foundry VTT and rewrites Fabricate module paths
 * so Vite serves source files with HMR transforms.
 */
export function fabricateDevProxy() {
  return {
    name: 'fabricate-foundry-proxy',
    configureServer(server) {
      // Pre-middleware: runs BEFORE Vite's internal middleware.
      // This is essential because Vite's SPA fallback would otherwise intercept
      // HTML requests looking for index.html (which doesn't exist) and 404.
      // Vite-owned paths (/@vite/, /src/, etc.) are passed through via next().
      server.middlewares.use((req, res, next) => {
        // Rewrite Fabricate module paths to project-root-relative paths
        if (req.url?.startsWith(MODULE_PATH_PREFIX)) {
          const relative = req.url.slice(MODULE_PATH_PREFIX.length);

          if (relative.startsWith('dist/main.js')) {
            // Main entry: serve source instead of bundle
            req.url = '/src/main.js';
            return next();
          }

          // Other module files (styles/, lang/, etc.) — serve from project root
          req.url = '/' + relative;
          return next();
        }

        // Let Vite handle its own assets (/@vite/, /@fs/, /src/, /node_modules/.vite/)
        if (
          req.url?.startsWith('/@') ||
          req.url?.startsWith('/src/') ||
          req.url?.startsWith('/node_modules/')
        ) {
          return next();
        }

        // Catch-all: proxy to Foundry
        proxyToFoundry(req, res);
      });
    }
  };
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

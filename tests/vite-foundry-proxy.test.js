import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { rewriteFabricateModuleUrl, serveRepoAsset } from '../scripts/vite-foundry-proxy.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Minimal writable-stream stand-in for the pipe target: `serveRepoAsset` only
// needs `writeHead` + the stream sink, so record what it writes.
function makeResponse() {
  const res = {
    statusCode: null,
    headers: null,
    chunks: [],
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    on() {},
    once() {},
    emit() {},
    write(chunk) {
      this.chunks.push(chunk);
      return true;
    },
    end(chunk) {
      if (chunk) this.chunks.push(chunk);
      this.finished = true;
    }
  };
  return res;
}

test('rewriteFabricateModuleUrl maps the module entry to the source entry /src/main.js', () => {
  // Serve the source entry directly so dev startup skips the root-shim's async
  // import hop, which otherwise widens the window for a missed `init` hook.
  assert.equal(
    rewriteFabricateModuleUrl('/modules/fabricate/main.js'),
    '/src/main.js'
  );
});

test('rewriteFabricateModuleUrl rewrites legacy dist/main.js requests to /src/main.js', () => {
  assert.equal(
    rewriteFabricateModuleUrl('/modules/fabricate/dist/main.js?t=12345'),
    '/src/main.js?t=12345'
  );
});

test('rewriteFabricateModuleUrl preserves other module-root assets', () => {
  assert.equal(
    rewriteFabricateModuleUrl('/modules/fabricate/styles/fabricate.css'),
    '/styles/fabricate.css'
  );
});

test('rewriteFabricateModuleUrl ignores non-module requests', () => {
  assert.equal(rewriteFabricateModuleUrl('/join'), null);
});

test('serveRepoAsset serves a repo font with the woff2 content type', async () => {
  const res = makeResponse();
  const served = serveRepoAsset(
    { url: '/assets/fonts/spectral-latin-600-normal.woff2' },
    res,
    REPO_ROOT
  );
  assert.equal(served, true, 'an existing asset is served, not deferred');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['content-type'], 'font/woff2');
  assert.ok(Number(res.headers['content-length']) > 0, 'the font should have a non-zero length');
});

test('serveRepoAsset refuses a path that escapes the assets directory', async () => {
  const res = makeResponse();
  const served = serveRepoAsset({ url: '/assets/../package.json' }, res, REPO_ROOT);
  assert.equal(served, false, 'a traversal path is not served (the caller proxies it on)');
  assert.equal(res.statusCode, null, 'nothing is written for a rejected path');
});

test('serveRepoAsset returns false for a missing asset so the caller can proxy it', async () => {
  const res = makeResponse();
  // Foundry serves plenty of `/assets/` paths; a repo miss must NOT be served here,
  // so the middleware forwards it to Foundry instead of dead-ending in Vite.
  const served = serveRepoAsset({ url: '/assets/fonts/does-not-exist.woff2' }, res, REPO_ROOT);
  assert.equal(served, false);
  assert.equal(res.statusCode, null);
});

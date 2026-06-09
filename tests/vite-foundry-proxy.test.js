import test from 'node:test';
import assert from 'node:assert/strict';

import { rewriteFabricateModuleUrl } from '../scripts/vite-foundry-proxy.js';

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

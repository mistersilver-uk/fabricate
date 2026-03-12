import test from 'node:test';
import assert from 'node:assert/strict';

import { rewriteFabricateModuleUrl } from '../scripts/vite-foundry-proxy.js';

test('rewriteFabricateModuleUrl maps the root module entry to /main.js', () => {
  assert.equal(
    rewriteFabricateModuleUrl('/modules/fabricate/main.js'),
    '/main.js'
  );
});

test('rewriteFabricateModuleUrl rewrites legacy dist/main.js requests to /main.js', () => {
  assert.equal(
    rewriteFabricateModuleUrl('/modules/fabricate/dist/main.js?t=12345'),
    '/main.js?t=12345'
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

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { salvageCheckNeed, salvageDisplayDc } from '../src/ui/presenters/salvageCheckNeed.js';

test('display DC shares override and fallback arithmetic with the listing', () => {
  assert.equal(salvageDisplayDc({ mode: 'simple', config: { dc: 16 }, component: { salvage: { dcOverride: 21.8 } } }), 21);
  assert.equal(salvageDisplayDc({ mode: 'routed', routedType: 'relative', config: {} }), 15);
  assert.equal(salvageDisplayDc({ mode: 'routed', routedType: 'fixed', config: { dc: 16 } }), null);
});

test('prompt need distinguishes usable DC, no check, and no single target', () => {
  assert.deepEqual(salvageCheckNeed({ mode: 'simple', config: {}, checkUsable: false }), { kind: 'noCheck' });
  assert.deepEqual(salvageCheckNeed({ mode: 'simple', config: { dc: 18 }, checkUsable: true }), { kind: 'dc', dc: 18 });
  assert.deepEqual(salvageCheckNeed({ mode: 'routed', config: { type: 'relative', dc: 12 }, checkUsable: true }), { kind: 'dc', dc: 12 });
  assert.deepEqual(salvageCheckNeed({ mode: 'routed', config: { type: 'fixed', dc: 12 }, checkUsable: true }), { kind: 'noSingleTarget' });
  assert.deepEqual(salvageCheckNeed({ mode: 'progressive', config: {}, checkUsable: true }), { kind: 'noSingleTarget' });
});

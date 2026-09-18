import assert from 'node:assert/strict';
import test from 'node:test';

import { getDragEventData } from '../../src/ui/svelte/util/foundryDragData.js';
import { installFoundryBridgeEnv } from '../helpers/foundryBridgeEnv.js';

test('getDragEventData calls TextEditor.getDragEventData and returns result', () => {
  const event = { dataTransfer: { getData: () => '{"type":"Item"}' } };
  const env = installFoundryBridgeEnv({
    textEditor: { implementation: { getDragEventData: (e) => ({ type: 'Item', event: e }) } },
  });

  assert.deepEqual(getDragEventData(event), { type: 'Item', event });
  env.restore();
});

test('getDragEventData without TextEditor returns null', () => {
  const env = installFoundryBridgeEnv();

  assert.equal(getDragEventData({}), null);
  env.restore();
});

test('getDragEventData without TextEditor falls back to text/plain JSON', () => {
  const payload = { type: 'Item', uuid: 'Item.abc123' };
  const event = {
    dataTransfer: { getData: (type) => (type === 'text/plain' ? JSON.stringify(payload) : '') },
  };
  const env = installFoundryBridgeEnv();

  assert.deepEqual(getDragEventData(event), payload);
  env.restore();
});

test('getDragEventData without TextEditor returns null for invalid JSON in text/plain', () => {
  const event = {
    dataTransfer: { getData: (type) => (type === 'text/plain' ? 'not-valid-json' : '') },
  };
  const env = installFoundryBridgeEnv();

  assert.equal(getDragEventData(event), null);
  env.restore();
});

test('getDragEventData without TextEditor returns null when dataTransfer is absent', () => {
  const env = installFoundryBridgeEnv();

  assert.equal(getDragEventData({ dataTransfer: null }), null);
  env.restore();
});

test('getDragEventData without TextEditor returns null when text/plain is empty', () => {
  const env = installFoundryBridgeEnv();

  assert.equal(getDragEventData({ dataTransfer: { getData: () => '' } }), null);
  env.restore();
});

test('getDragEventData without TextEditor returns null when event is null', () => {
  const env = installFoundryBridgeEnv();

  assert.equal(getDragEventData(null), null);
  env.restore();
});

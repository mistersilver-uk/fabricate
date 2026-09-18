import assert from 'node:assert/strict';
import test from 'node:test';

import { localize } from '../../src/ui/svelte/util/foundryLocalize.js';
import { installFoundryBridgeEnv } from '../helpers/foundryBridgeEnv.js';

test('localize(key) calls game.i18n.localize and returns result', () => {
  const env = installFoundryBridgeEnv({
    labels: { localize: (key) => `localized:${key}`, format: () => 'bad' },
  });

  assert.equal(localize('MY.Key'), 'localized:MY.Key');
  env.restore();
});

test('localize(key, data) calls game.i18n.format and returns result', () => {
  const data = { name: 'foo' };
  const calls = [];
  const env = installFoundryBridgeEnv({
    labels: {
      localize: () => 'bad',
      format: (key, suppliedData) => {
        calls.push({ key, data: suppliedData });
        return `formatted:${key}:${suppliedData.name}`;
      },
    },
  });

  assert.equal(localize('MY.Key', data), 'formatted:MY.Key:foo');
  assert.deepEqual(calls, [{ key: 'MY.Key', data }]);
  env.restore();
});

test('localize without game.i18n returns key', () => {
  const env = installFoundryBridgeEnv();

  assert.equal(localize('MY.Key'), 'MY.Key');
  env.restore();
});

test('localize with data without game.i18n returns key', () => {
  const env = installFoundryBridgeEnv();

  assert.equal(localize('MY.Key', { name: 'foo' }), 'MY.Key');
  env.restore();
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { formatList, localize } from '../../src/ui/svelte/util/foundryLocalize.js';
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
  delete globalThis.game;

  assert.equal(localize('MY.Key'), 'MY.Key');
  env.restore();
});

test('localize with data without game.i18n returns key', () => {
  const env = installFoundryBridgeEnv();
  delete globalThis.game;

  assert.equal(localize('MY.Key', { name: 'foo' }), 'MY.Key');
  env.restore();
});

test('formatList passes caller options to game.i18n.getListFormatter', () => {
  const seen = [];
  const env = installFoundryBridgeEnv({
    labels: {
      getListFormatter: (options) => {
        seen.push(options);
        return { format: (values) => values.join('|') };
      },
    },
  });
  const options = { style: 'short', type: 'unit' };

  assert.equal(formatList(['a', 'b'], options), 'a|b');
  assert.equal(seen[0], options);
  env.restore();
});

test('formatList defaults to the long conjunction on game.i18n.getListFormatter', () => {
  const seen = [];
  const env = installFoundryBridgeEnv({
    labels: {
      getListFormatter: (options) => {
        seen.push(options);
        return { format: (values) => values.join('|') };
      },
    },
  });

  formatList(['a', 'b']);
  assert.deepEqual(seen, [{ style: 'long', type: 'conjunction' }]);
  env.restore();
});

test('formatList falls back to Intl.ListFormat as "a and b" without a formatter', () => {
  const env = installFoundryBridgeEnv({ labels: {} });

  assert.equal(formatList(['a', 'b']), 'a and b');
  env.restore();
});

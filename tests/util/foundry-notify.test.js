import assert from 'node:assert/strict';
import test from 'node:test';

import { notifyError, notifyInfo, notifyWarn } from '../../src/ui/svelte/util/foundryNotify.js';
import { installFoundryBridgeEnv } from '../helpers/foundryBridgeEnv.js';

const LEVELS = [
  ['info', notifyInfo],
  ['warn', notifyWarn],
  ['error', notifyError],
];

for (const [level, notify] of LEVELS) {
  test(`${notify.name} calls ui.notifications.${level}`, () => {
    const env = installFoundryBridgeEnv();

    notify(`hello ${level}`);

    assert.deepEqual(env.notifications[level], [`hello ${level}`]);
    env.restore();
  });

  test(`${notify.name} without ui.notifications does not throw`, () => {
    const env = installFoundryBridgeEnv();
    delete globalThis.ui;

    assert.doesNotThrow(() => notify('hello'));
    env.restore();
  });
}

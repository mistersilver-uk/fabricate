import assert from 'node:assert/strict';
import test from 'node:test';

import {
  prepareFoundryData,
  startPreparedFoundryContainer,
} from '../scripts/lib/foundryDataPreparation.js';

test('a running cached container is stopped before setup and restarted without removal', async () => {
  const events = [];
  const cachedContainer = {
    inspectStatus() {
      events.push('running');
      return 'running';
    },
    stop() {
      events.push('stopped');
    },
    remove() {
      events.push('removed');
    },
    restart() {
      events.push('cached restart');
    },
  };

  const cachedContainerStatus = await prepareFoundryData({
    cachedContainer,
    replaceBoundData() {
      events.push('setup');
    },
  });

  startPreparedFoundryContainer({
    cachedContainerStatus,
    cachedContainer,
    createContainer() {
      events.push('create');
    },
  });

  assert.equal(cachedContainerStatus, 'stopped');
  assert.deepEqual(events, ['running', 'stopped', 'setup', 'cached restart']);
});

test('a failed stop aborts before bound data setup', async () => {
  const stopFailure = new Error('docker stop failed');
  let setupCalled = false;

  await assert.rejects(
    prepareFoundryData({
      cachedContainer: {
        inspectStatus: () => 'running',
        stop() {
          throw stopFailure;
        },
      },
      replaceBoundData() {
        setupCalled = true;
      },
    }),
    stopFailure
  );

  assert.equal(setupCalled, false);
});

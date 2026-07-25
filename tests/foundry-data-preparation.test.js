import assert from 'node:assert/strict';
import test from 'node:test';

import {
  prepareFoundryData,
  startPreparedFoundryContainer,
} from '../scripts/lib/foundryDataPreparation.js';

test('a running cached container is stopped before setup and restarted without removal', async () => {
  const events = [];
  const statuses = ['running', 'exited'];
  const cachedContainer = {
    inspectStatus() {
      const status = statuses.shift();
      events.push(`inspect:${status}`);
      return status;
    },
    stop(status) {
      events.push(`stop:${status}`);
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

  assert.equal(cachedContainerStatus, 'exited');
  assert.deepEqual(events, [
    'inspect:running',
    'stop:running',
    'inspect:exited',
    'setup',
    'cached restart',
  ]);
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

test('an inspect failure aborts before bound data setup', async () => {
  const inspectFailure = new Error('docker inspect failed');
  let setupCalled = false;

  await assert.rejects(
    prepareFoundryData({
      cachedContainer: {
        inspectStatus() {
          throw inspectFailure;
        },
        stop() {
          assert.fail('a failed inspection must not attempt a stop');
        },
      },
      replaceBoundData() {
        setupCalled = true;
      },
    }),
    inspectFailure
  );

  assert.equal(setupCalled, false);
});

for (const status of ['paused', 'restarting']) {
  test(`a ${status} cached container is stopped and proved inactive before setup`, async () => {
    const events = [];
    const statuses = [status, 'exited'];

    const cachedContainerStatus = await prepareFoundryData({
      cachedContainer: {
        inspectStatus() {
          const inspectedStatus = statuses.shift();
          events.push(`inspect:${inspectedStatus}`);
          return inspectedStatus;
        },
        stop(inspectedStatus) {
          events.push(`stop:${inspectedStatus}`);
        },
      },
      replaceBoundData() {
        events.push('setup');
      },
    });

    assert.equal(cachedContainerStatus, 'exited');
    assert.deepEqual(events, [
      `inspect:${status}`,
      `stop:${status}`,
      'inspect:exited',
      'setup',
    ]);
  });
}

test('a post-stop inspection failure aborts before bound data setup', async () => {
  const verificationFailure = new Error('post-stop inspect failed');
  let inspectCount = 0;
  let setupCalled = false;

  await assert.rejects(
    prepareFoundryData({
      cachedContainer: {
        inspectStatus() {
          inspectCount += 1;
          if (inspectCount === 1) return 'running';
          throw verificationFailure;
        },
        stop() {},
      },
      replaceBoundData() {
        setupCalled = true;
      },
    }),
    verificationFailure
  );

  assert.equal(setupCalled, false);
});

test('an ambiguous post-stop state aborts before bound data setup', async () => {
  const statuses = ['running', 'restarting'];
  let setupCalled = false;

  await assert.rejects(
    prepareFoundryData({
      cachedContainer: {
        inspectStatus: () => statuses.shift(),
        stop() {},
      },
      replaceBoundData() {
        setupCalled = true;
      },
    }),
    /restarting/
  );

  assert.equal(setupCalled, false);
});

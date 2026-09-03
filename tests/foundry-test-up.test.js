import assert from 'node:assert/strict';
import test from 'node:test';

import {
  inspectCachedContainerStatus,
  runFoundryLauncher,
} from '../scripts/foundry-test-up.mjs';

test('launcher treats only a confirmed missing container as absent', () => {
  const absent = inspectCachedContainerStatus({
    containerName: 'fabricate-foundry-test',
    runInspect: () => ({
      status: 1,
      stdout: '',
      stderr: 'Error response from daemon: No such object: fabricate-foundry-test',
    }),
  });

  assert.equal(absent, null);

  assert.throws(
    () =>
      inspectCachedContainerStatus({
        containerName: 'fabricate-foundry-test',
        runInspect: () => ({
          status: 1,
          stdout: '',
          stderr: 'error during connect: Docker daemon is unavailable',
        }),
      }),
    /Docker daemon is unavailable/
  );
});

test('launcher composes bound-data replacement through prepareFoundryData', async () => {
  const sentinel = new Error('preparation composition reached');
  let preparation;
  const previousUsername = process.env.FOUNDRY_USERNAME;
  const previousPassword = process.env.FOUNDRY_PASSWORD;
  const previousImage = process.env.FOUNDRY_IMAGE;
  process.env.FOUNDRY_USERNAME = 'test-user';
  process.env.FOUNDRY_PASSWORD = 'test-password';
  process.env.FOUNDRY_IMAGE = 'test-image';

  try {
    await assert.rejects(
      runFoundryLauncher({
        prepareData(options) {
          preparation = options;
          throw sentinel;
        },
      }),
      sentinel
    );
  } finally {
    restoreEnvironment('FOUNDRY_USERNAME', previousUsername);
    restoreEnvironment('FOUNDRY_PASSWORD', previousPassword);
    restoreEnvironment('FOUNDRY_IMAGE', previousImage);
  }

  assert.equal(typeof preparation.cachedContainer.inspectStatus, 'function');
  assert.equal(typeof preparation.cachedContainer.stop, 'function');
  assert.equal(typeof preparation.replaceBoundData, 'function');
});

function restoreEnvironment(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

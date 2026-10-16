/** The linked-scene image the environment card and the centre header share (issue 1518). */
import assert from 'node:assert/strict';
import test from 'node:test';

import { watchSceneImage } from '../../src/ui/svelte/apps/gathering/linkedSceneImage.js';

test('watchSceneImage reports the resolved image and drops a cancelled lookup', async () => {
  const seen = [];
  const record = (image) => {
    seen.push(image);
  };
  const lookups = [];
  const resolveUuid = async (uuid) => {
    lookups.push(uuid);
    return { thumb: `${uuid}.webp` };
  };
  watchSceneImage('Scene.a', record, resolveUuid);
  const cancel = watchSceneImage('Scene.b', record, resolveUuid);
  cancel();
  watchSceneImage('', record, resolveUuid);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ['', '', '', 'Scene.a.webp']);
  assert.deepEqual(lookups, ['Scene.a', 'Scene.b'], 'no uuid, no lookup');
});

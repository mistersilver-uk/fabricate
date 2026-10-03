import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeSceneOption,
  sceneDocumentImage,
  watchSceneImage
} from '../src/ui/svelte/util/sceneImages.js';

test('watchSceneImage reports the resolved image and drops a cancelled lookup', async () => {
  const previous = globalThis.fromUuid;
  globalThis.fromUuid = async (uuid) => ({ thumb: `${uuid}.webp` });
  try {
    const seen = [];
    watchSceneImage('Scene.a', (image) => seen.push(image));
    const cancel = watchSceneImage('Scene.b', (image) => seen.push(image));
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepEqual(seen, ['', '', 'Scene.a.webp']);
    assert.equal(watchSceneImage('', (image) => seen.push(image)), undefined, 'no uuid, no lookup');
  } finally {
    globalThis.fromUuid = previous;
  }
});

test('normalizeSceneOption does not read deprecated Scene#background getter', () => {
  let deprecatedGetterTouched = false;
  const scene = {
    uuid: 'Scene.v14',
    name: 'V14 Scene',
    thumb: 'scene-thumb.webp',
    levels: [
      {
        background: { src: 'level-background.webp' }
      }
    ]
  };
  Object.defineProperty(scene, 'background', {
    get() {
      deprecatedGetterTouched = true;
      throw new Error('Scene#background should not be read');
    }
  });

  assert.deepEqual(normalizeSceneOption(scene), {
    uuid: 'Scene.v14',
    name: 'V14 Scene',
    img: 'level-background.webp',
    thumbnail: 'scene-thumb.webp'
  });
  assert.equal(deprecatedGetterTouched, false);
});

test('sceneDocumentImage supports legacy plain scene data without using getters', () => {
  const scene = {
    uuid: 'Scene.legacy',
    name: 'Legacy Scene',
    background: { src: 'legacy-background.webp' },
    img: 'legacy-img.webp',
    thumbnail: 'legacy-thumb.webp'
  };

  assert.equal(sceneDocumentImage(scene), 'legacy-background.webp');
});

test('sceneDocumentImage can read legacy image data from a safe source object', () => {
  let deprecatedGetterTouched = false;
  const scene = {
    uuid: 'Scene.source',
    name: 'Source Scene',
    toObject: () => ({
      background: { src: 'source-background.webp' }
    })
  };
  Object.defineProperty(scene, 'background', {
    get() {
      deprecatedGetterTouched = true;
      throw new Error('Scene#background should not be read');
    }
  });

  assert.equal(sceneDocumentImage(scene), 'source-background.webp');
  assert.equal(deprecatedGetterTouched, false);
});

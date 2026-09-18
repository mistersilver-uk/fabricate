/** Unit coverage for the region-behaviour identity helper. */

import test from 'node:test';
import assert from 'node:assert/strict';

import { identifyRegionBehaviorRef } from '../../src/canvas/regions/interactableRegionNodeAdapter.js';

function fakeBehavior({ sceneId = 's1', regionId = 'r1', behaviorId = 'b1' } = {}) {
  return {
    id: behaviorId,
    type: 'fabricate.interactable',
    parent: { id: regionId, parent: { id: sceneId } }
  };
}

test('identifyRegionBehaviorRef resolves scene + region + behaviour ids', () => {
  assert.deepEqual(identifyRegionBehaviorRef(fakeBehavior()), {
    sceneId: 's1', regionId: 'r1', behaviorId: 'b1'
  });
});

test('identifyRegionBehaviorRef returns null when any id is missing', () => {
  assert.equal(identifyRegionBehaviorRef({ id: 'b1', parent: { id: 'r1' } }), null);
  assert.equal(identifyRegionBehaviorRef({ parent: { id: 'r1', parent: { id: 's1' } } }), null);
  assert.equal(identifyRegionBehaviorRef({}), null);
});

test('identifyRegionBehaviorRef tolerates _id fallbacks and stringifies ids', () => {
  const ref = identifyRegionBehaviorRef({
    _id: 7,
    parent: { _id: 8, parent: { _id: 9 } }
  });
  assert.deepEqual(ref, { sceneId: '9', regionId: '8', behaviorId: '7' });
});

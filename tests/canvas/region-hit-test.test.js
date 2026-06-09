/**
 * Coverage for the V13 Scene Region point-in-region seam (Phase 6).
 *
 * `regionEnvironmentIdsAtPoint` collects the `flags.fabricate.environmentId` of
 * every flagged region whose document-level `testPoint({ x, y, elevation })`
 * returns true. The V13 RegionDocument API is faked; this asserts the collection
 * + flag-read + containment glue, including the deprecated placeable fallback.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { regionEnvironmentIdsAtPoint } from '../../src/canvas/regionHitTest.js';

function region({ envId, contains }) {
  return {
    flags: envId ? { fabricate: { environmentId: envId } } : {},
    // V13 document-level testPoint takes a single ElevatedPoint { x, y, elevation }.
    testPoint: (point) => contains(point)
  };
}

test('collects environment ids only from flagged regions that contain the point', () => {
  const scene = {
    regions: {
      contents: [
        region({ envId: 'env-in', contains: () => true }),
        region({ envId: 'env-out', contains: () => false }),
        region({ envId: null, contains: () => true }), // contains but unflagged
        region({ envId: 'env-also-in', contains: () => true })
      ]
    }
  };
  const ids = regionEnvironmentIdsAtPoint({ scene, point: { x: 10, y: 10 } });
  assert.deepEqual(ids.sort(), ['env-also-in', 'env-in']);
});

test('returns [] when the scene has no regions', () => {
  assert.deepEqual(regionEnvironmentIdsAtPoint({ scene: {}, point: { x: 0, y: 0 } }), []);
  assert.deepEqual(regionEnvironmentIdsAtPoint({ scene: null, point: { x: 0, y: 0 } }), []);
});

test('prefers the document testPoint, falls back to the deprecated placeable, tolerates a throwing/absent tester', () => {
  const seen = [];
  const scene = {
    regions: [
      // Preferred: document-level testPoint receiving the ElevatedPoint.
      { flags: { fabricate: { environmentId: 'env-doc' } }, testPoint: (p) => { seen.push(p); return true; } },
      // Deprecated fallback: only the placeable's testPoint exists, and it throws.
      { flags: { fabricate: { environmentId: 'env-throws' } }, object: { testPoint: () => { throw new Error('boom'); } } },
      // Deprecated fallback that hits: placeable testPoint(point) → true.
      { flags: { fabricate: { environmentId: 'env-placeable' } }, object: { testPoint: () => true } },
      { flags: { fabricate: { environmentId: 'env-no-test' } } } // no tester at all
    ]
  };
  const ids = regionEnvironmentIdsAtPoint({ scene, point: { x: 1, y: 2 } });
  assert.deepEqual(ids.sort(), ['env-doc', 'env-placeable'], 'document hit + placeable fallback hit; throwing/absent → no hit');
  assert.deepEqual(seen[0], { x: 1, y: 2, elevation: 0 }, 'the document testPoint receives an ElevatedPoint');
});

// --- interactableBehaviorsContainingToken (re-trigger) ----------------------

import { interactableBehaviorsContainingToken } from '../../src/canvas/regionHitTest.js';

function regionWithBehaviors({ contains, behaviors }) {
  return {
    // Document-level testPoint (ElevatedPoint); see region() above.
    testPoint: (point) => contains(point),
    behaviors
  };
}

const isInteractable = (b) => b?.type === 'fabricate.interactable';

test('interactableBehaviorsContainingToken returns the interactable behaviours of regions containing the token center', () => {
  const hitBeh = { type: 'fabricate.interactable', id: 'b1' };
  const otherBeh = { type: 'somethingElse', id: 'b2' };
  const scene = {
    regions: [
      regionWithBehaviors({ contains: () => true, behaviors: { contents: [hitBeh, otherBeh] } }),
      regionWithBehaviors({ contains: () => false, behaviors: { contents: [{ type: 'fabricate.interactable', id: 'b3' }] } })
    ]
  };
  const token = { object: { center: { x: 50, y: 50 } } };
  const matches = interactableBehaviorsContainingToken({ scene, token, isInteractableBehavior: isInteractable });
  assert.equal(matches.length, 1, 'only the containing region + interactable behaviour');
  assert.equal(matches[0].behavior.id, 'b1');
});

test('interactableBehaviorsContainingToken uses the token document top-left when no placeable center exists', () => {
  const hitBeh = { type: 'fabricate.interactable', id: 'b1' };
  const seen = [];
  const scene = {
    regions: [regionWithBehaviors({ contains: (p) => { seen.push(p); return true; }, behaviors: { contents: [hitBeh] } })]
  };
  const matches = interactableBehaviorsContainingToken({ scene, token: { x: 10, y: 20 }, isInteractableBehavior: isInteractable });
  assert.equal(matches.length, 1);
  assert.deepEqual(seen[0], { x: 10, y: 20, elevation: 0 }, 'the document testPoint receives an ElevatedPoint');
});

test('interactableBehaviorsContainingToken returns [] when the token point cannot be resolved', () => {
  const scene = { regions: [regionWithBehaviors({ contains: () => true, behaviors: { contents: [{ type: 'fabricate.interactable' }] } })] };
  assert.deepEqual(interactableBehaviorsContainingToken({ scene, token: {}, isInteractableBehavior: isInteractable }), []);
});

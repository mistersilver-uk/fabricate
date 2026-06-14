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

import {
  regionEnvironmentIdsAtPoint,
  sceneRegionUuidsContainingToken,
  tokenDocumentCenter,
  interactableBehaviorsContainingToken,
  selectRepromptTokenDoc
} from '../../src/canvas/regionHitTest.js';

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

// --- selectRepromptTokenDoc (issue 332) -------------------------------------

test('selectRepromptTokenDoc returns the first token doc whose actor matches', () => {
  const a = { actorId: 'actor-9' };
  const b = { actor: { id: 'actor-1' } };
  const c = { actorId: 'actor-1' };
  assert.equal(selectRepromptTokenDoc([a, b, c], 'actor-1'), b, 'matches via actor.id, picking the first match');
  assert.equal(selectRepromptTokenDoc([a, c], 'actor-9'), a, 'matches via actorId');
});

test('selectRepromptTokenDoc returns null when nothing matches or inputs are absent', () => {
  assert.equal(selectRepromptTokenDoc([{ actorId: 'actor-9' }], 'actor-1'), null, 'no matching actor ⇒ null');
  assert.equal(selectRepromptTokenDoc([], 'actor-1'), null, 'empty list ⇒ null');
  assert.equal(selectRepromptTokenDoc(null, 'actor-1'), null, 'non-array ⇒ null');
  assert.equal(selectRepromptTokenDoc([{ actorId: 'actor-1' }], null), null, 'no actor id ⇒ null');
  assert.equal(selectRepromptTokenDoc([{ actorId: 'actor-1' }], ''), null, 'empty actor id ⇒ null');
});

function uuidRegion({ uuid, contains }) {
  return { uuid, testPoint: (point) => contains(point) };
}

test('sceneRegionUuidsContainingToken returns the uuids of regions containing the token centre', () => {
  const scene = {
    regions: {
      contents: [
        uuidRegion({ uuid: 'Scene.s.Region.a', contains: () => true }),
        uuidRegion({ uuid: 'Scene.s.Region.b', contains: () => false }),
        uuidRegion({ uuid: '', contains: () => true }), // no uuid -> skipped
        uuidRegion({ uuid: 'Scene.s.Region.c', contains: () => true })
      ]
    }
  };
  const token = { object: { center: { x: 5, y: 5 } } };
  assert.deepEqual(
    [...sceneRegionUuidsContainingToken({ scene, token })].sort((a, b) => a.localeCompare(b)),
    ['Scene.s.Region.a', 'Scene.s.Region.c']
  );
});

test('sceneRegionUuidsContainingToken returns [] with no regions or no resolvable token point', () => {
  assert.deepEqual(sceneRegionUuidsContainingToken({ scene: {}, token: { x: 1, y: 1 } }), []);
  assert.deepEqual(
    sceneRegionUuidsContainingToken({ scene: { regions: [uuidRegion({ uuid: 'R', contains: () => true })] }, token: {} }),
    []
  );
});

test('tokenDocumentCenter computes the centre from the DOCUMENT position, beating a lagging placeable/getCenterPoint', () => {
  // Mid-move: the placeable centre AND getCenterPoint still report the OLD spot,
  // but the document x/y already holds the destination — the fresh document
  // computation must win (this is the off-by-one fix).
  const token = {
    x: 200, y: 200, width: 1, height: 1, parent: { grid: { size: 100 } },
    getCenterPoint: () => ({ x: 0, y: 0 }),
    object: { center: { x: 0, y: 0 } }
  };
  assert.deepEqual(tokenDocumentCenter(token), { x: 250, y: 250 });
});

test('tokenDocumentCenter honours the token footprint when sizing the centre', () => {
  const token = { x: 100, y: 100, width: 2, height: 2, parent: { grid: { size: 100 } } };
  assert.deepEqual(tokenDocumentCenter(token), { x: 200, y: 200 });
});

test('tokenDocumentCenter falls back to getCenterPoint, then the placeable centre, then top-left, then null', () => {
  // No grid size ⇒ cannot size the footprint ⇒ use getCenterPoint.
  assert.deepEqual(tokenDocumentCenter({ getCenterPoint: () => ({ x: 12, y: 8 }) }), { x: 12, y: 8 });
  // No grid, no getCenterPoint ⇒ placeable centre.
  assert.deepEqual(tokenDocumentCenter({ object: { center: { x: 7, y: 9 } } }), { x: 7, y: 9 });
  // No grid, no getCenterPoint, no placeable ⇒ document top-left.
  assert.deepEqual(tokenDocumentCenter({ x: 3, y: 4 }), { x: 3, y: 4 });
  assert.equal(tokenDocumentCenter({}), null);
});

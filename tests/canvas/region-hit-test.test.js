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
  regionContainsTokenDocument,
  selectRepromptTokenDoc
} from '../../src/canvas/regionHitTest.js';
import {
  rectRegion,
  rectRegionWithoutTestPoint,
  rectRegionThrowingTestPoint,
  tokenDoc,
  gridScene
} from '../helpers/regionContainmentFakes.js';

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

// --- regionContainsTokenDocument: the canvas-free signal rule (issue 999) ----
//
// A 100x100 rect anchored at (100,100) covers 100..200 on both axes. On a 100px
// grid a 1x1 token document at (60,60) has its TOP-LEFT outside that rect and its
// CENTRE (110,110) inside — the exact shape that made a GM who is not viewing the
// scene deny a player who is standing in the region.
const RECT = { x: 100, y: 100, w: 100, h: 100 };
const CENTRE_INSIDE = { x: 60, y: 60 };
const FAR_OUTSIDE = { x: 600, y: 600 };

/** A 1x1 token document parented to a grid-bearing scene (fixture fidelity). */
function containmentToken(position, options = {}) {
  return tokenDoc({ ...position, scene: gridScene(), ...options });
}

test('signal 1 (membership) alone admits, across every collection shape Foundry may hand back', () => {
  const shapes = [
    ['Set', (region) => new Set([region])],
    ['EmbeddedCollection-like { contents }', (region) => ({ contents: [region] })],
    ['array', (region) => [region]]
  ];
  for (const [label, build] of shapes) {
    const region = rectRegion(RECT);
    // Membership says inside; BOTH weaker signals say outside. Membership wins and
    // neither weaker signal is even consulted.
    const token = containmentToken(FAR_OUTSIDE, { regions: build(region), insideRegion: false });
    assert.equal(regionContainsTokenDocument(region, token), true, `${label} membership admits`);
    assert.equal(token.testInsideRegionCalls.length, 0, `${label}: signal 2 is not consulted`);
    assert.equal(region.testPointCalls.length, 0, `${label}: signal 3 is not consulted`);
  }
});

test('signal 1 tolerates a bare region-id membership entry (fixture-only tolerance)', () => {
  // Foundry always hands back RegionDocuments; this only keeps a hand-written
  // fixture from silently reading as "no membership".
  const region = rectRegion(RECT);
  const token = containmentToken(FAR_OUTSIDE, { regions: [region.id], insideRegion: false });
  assert.equal(regionContainsTokenDocument(region, token), true);
  assert.equal(region.testPointCalls.length, 0);
});

test('signal 2 (Foundry containment) alone admits, without consulting the centre-point test', () => {
  const region = rectRegion(RECT);
  const token = containmentToken(FAR_OUTSIDE, { regions: [], insideRegion: true });
  assert.equal(regionContainsTokenDocument(region, token), true);
  assert.equal(token.testInsideRegionCalls.length, 1, 'Foundry containment answered');
  assert.equal(region.testPointCalls.length, 0, 'the weaker geometric signal is not consulted');
});

test('signal 3 (centre point) alone admits when membership is empty and Foundry containment is absent', () => {
  const region = rectRegion(RECT);
  const token = containmentToken(CENTRE_INSIDE, { regions: [], insideRegion: 'absent' });
  assert.equal(regionContainsTokenDocument(region, token), true);
  assert.deepEqual(
    region.testPointCalls[0],
    { x: 110, y: 110, elevation: 0 },
    'the CENTRE is submitted, not the document top-left'
  );
});

test('membership naming a DIFFERENT region falls through, and signal 3 answers both ways', () => {
  const region = rectRegion(RECT);
  const elsewhere = rectRegion({ ...RECT, id: 'region-elsewhere', uuid: 'Scene.s.Region.elsewhere' });

  const inside = containmentToken(CENTRE_INSIDE, { regions: [elsewhere] });
  assert.equal(regionContainsTokenDocument(region, inside), true, 'centre inside ⇒ admitted');
  assert.equal(region.testPointCalls.length, 1, 'the foreign membership did not short-circuit');

  const outsideRegion = rectRegion(RECT);
  const outside = containmentToken(FAR_OUTSIDE, { regions: [elsewhere] });
  assert.equal(regionContainsTokenDocument(outsideRegion, outside), false, 'centre outside ⇒ denied');
});

test('signal 3 tests the token elevation against a banded region, in both directions', () => {
  const band = { ...RECT, elevationBand: { bottom: 10, top: 30 } };

  const inBand = rectRegion(band);
  const highToken = containmentToken(CENTRE_INSIDE, { elevation: 20 });
  assert.equal(regionContainsTokenDocument(inBand, highToken), true, 'an in-band token is admitted');
  assert.equal(inBand.testPointCalls[0].elevation, 20, 'the token elevation is submitted');

  const outOfBand = rectRegion(band);
  const groundToken = containmentToken(CENTRE_INSIDE, { elevation: 0 });
  assert.equal(regionContainsTokenDocument(outOfBand, groundToken), false, 'elevation 0 is out of band');
});

test('signal 3 always submits a FINITE elevation, normalizing an absent or non-finite one to 0', () => {
  // getCenterPoint() passes the document elevation through verbatim, so an absent
  // elevation would reach testPoint as `undefined` — which Foundry reads as a
  // silent false, i.e. a denial rather than an error.
  const absent = rectRegion(RECT);
  const noElevation = containmentToken(CENTRE_INSIDE);
  assert.equal(noElevation.getCenterPoint().elevation, undefined, 'the fixture really has none');
  assert.equal(regionContainsTokenDocument(absent, noElevation), true);
  assert.equal(absent.testPointCalls[0].elevation, 0, 'absent ⇒ 0');

  const notFinite = rectRegion(RECT);
  const nanToken = containmentToken(CENTRE_INSIDE, { elevation: Number.NaN });
  assert.equal(regionContainsTokenDocument(notFinite, nanToken), true);
  assert.equal(notFinite.testPointCalls[0].elevation, 0, 'non-finite ⇒ 0');
});

test('a region with no testPoint and a token with no testInsideRegion ADMITS (every signal indeterminate)', () => {
  const region = rectRegionWithoutTestPoint(RECT);
  const token = containmentToken(FAR_OUTSIDE, { regions: [], insideRegion: 'absent' });
  assert.equal(regionContainsTokenDocument(region, token), true, 'cannot locate ⇒ do not block');
  assert.equal(region.testPointCalls.length, 0);
});

test('a region with no testPoint still DENIES when Foundry containment answered outside', () => {
  // The "no testPoint" defensive case is NOT a blanket grant: it only makes the
  // geometric signal unanswerable.
  const region = rectRegionWithoutTestPoint(RECT);
  const token = containmentToken(FAR_OUTSIDE, { regions: [], insideRegion: false });
  assert.equal(regionContainsTokenDocument(region, token), false);
  assert.equal(token.testInsideRegionCalls.length, 1);
});

test('an unresolvable centre does not deny, and submits nothing', () => {
  const region = rectRegion(RECT);
  assert.equal(regionContainsTokenDocument(region, {}), true);
  assert.equal(region.testPointCalls.length, 0, 'no point is submitted when none can be built');
});

test('a THROWING testInsideRegion is indeterminate, not a denial', () => {
  const region = rectRegionWithoutTestPoint(RECT);
  const token = containmentToken(FAR_OUTSIDE, { regions: [], insideRegion: 'throws' });
  assert.equal(regionContainsTokenDocument(region, token), true, 'a throw means "could not determine"');
  assert.equal(token.testInsideRegionCalls.length, 1, 'and it really was consulted');
});

test('a THROWING testPoint is indeterminate, not a denial', () => {
  const region = rectRegionThrowingTestPoint(RECT);
  const token = containmentToken(FAR_OUTSIDE, { regions: [], insideRegion: 'absent' });
  assert.equal(regionContainsTokenDocument(region, token), true);
  assert.equal(region.testPointCalls.length, 1, 'and it really was consulted');
});

test('signal 2 is DEFINITIVE: an outside verdict denies and signal 3 never overrides it', () => {
  // Foundry's own predicate knows about the token footprint, the elevation band
  // and (on V14) scene levels; the centre-point test is a strictly worse
  // approximation of it, so it must never overturn it. Here the centre IS inside
  // the rect and the answer is still a denial.
  const region = rectRegion(RECT);
  const token = containmentToken(CENTRE_INSIDE, { regions: [], insideRegion: false });
  assert.equal(regionContainsTokenDocument(region, token), false);
  assert.equal(region.testPointCalls.length, 0, 'the weaker signal is never consulted');
});

// --- re-trigger elevation + the pinned scope-outs (issue 999, Phase 3) -------

/** A rect region carrying one interactable behaviour, for the re-trigger path. */
function rectRegionWithInteractable(options = {}) {
  const region = rectRegion(options);
  region.behaviors = { contents: [{ type: 'fabricate.interactable', id: 'b1' }] };
  return region;
}

test('interactableBehaviorsContainingToken submits the token DOCUMENT elevation for a placeable', () => {
  // The dominant caller (controlToken / "interact here") hands in a PLACEABLE,
  // which has no `elevation` of its own — only `document.elevation`.
  const region = rectRegionWithInteractable(RECT);
  const token = { center: { x: 150, y: 150 }, document: { elevation: 20 } };
  const matches = interactableBehaviorsContainingToken({
    scene: { regions: [region] },
    token,
    isInteractableBehavior: isInteractable
  });
  assert.equal(matches.length, 1);
  assert.equal(region.testPointCalls[0].elevation, 20, 'the placeable’s document elevation is used');
});

test('interactableBehaviorsContainingToken submits the elevation of a bare token document too', () => {
  const region = rectRegionWithInteractable(RECT);
  const matches = interactableBehaviorsContainingToken({
    scene: { regions: [region] },
    token: { x: 150, y: 150, elevation: 20 },
    isInteractableBehavior: isInteractable
  });
  assert.equal(matches.length, 1);
  assert.equal(region.testPointCalls[0].elevation, 20);
});

test('regionEnvironmentIdsAtPoint still submits elevation 0 (a drop point has no elevation)', () => {
  const region = rectRegion(RECT);
  const ids = regionEnvironmentIdsAtPoint({
    scene: { regions: [region] },
    point: { x: 150, y: 150, elevation: 20 }
  });
  // Guard first: both pinned functions skip a region BEFORE testPoint when it
  // lacks the uuid / env-id flag, which would make the pin below vacuous.
  assert.equal(region.testPointCalls.length, 1, 'the region really was tested');
  assert.equal(region.testPointCalls[0].elevation, 0, 'the caller elevation is deliberately ignored');
  assert.deepEqual(ids, ['env-1']);
});

test('sceneRegionUuidsContainingToken still submits elevation 0 (travel sensing is pinned)', () => {
  const region = rectRegion(RECT);
  const token = tokenDoc({ x: 100, y: 100, scene: gridScene(), elevation: 20 });
  const uuids = sceneRegionUuidsContainingToken({ scene: { regions: [region] }, token });
  assert.equal(region.testPointCalls.length, 1, 'the region really was tested');
  assert.equal(region.testPointCalls[0].elevation, 0, 'realm sensing is unchanged by issue 999');
  assert.deepEqual(uuids, [region.uuid]);
});

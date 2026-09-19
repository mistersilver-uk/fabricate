/**
 * `interactablePredicates` under a throwing `globalThis` trap, so every decision is proved to be
 * pure as well as correct.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_INTERACTABLE_IMG,
  canControlActor,
  dropPoint,
  eventToken,
  firstInteractableBehavior,
  gridSizeFrom,
  iconTextureFor,
  ownsToken,
  regionRectangleFor,
  sceneTokenDocs,
  screenCenterToScene,
  shouldPromptForEnter,
  tokenInsideRegion,
  viewCenterFrom,
} from '../../src/canvas/interactablePredicates.js';
import { underFoundryGlobalTrap } from '../helpers/foundryGlobalTrap.js';

function sealed(name, body) {
  test(name, () => underFoundryGlobalTrap('interactablePredicates', body));
}

function placed(tokens) {
  const scene = { id: 'scene-1', tokens: { contents: tokens } };
  const region = { id: 'region-1', parent: scene };
  return { behavior: { id: 'beh-1', parent: region }, region, scene };
}

function insideToken({ actorId = 'a1', inside = true } = {}) {
  return { actorId, actor: { id: actorId }, testInsideRegion: () => inside };
}

sealed('ownership prefers the document, then the actor, then the placeable control flag', () => {
  assert.equal(ownsToken(null, { isGM: true }), false, 'no token is never owned');
  assert.equal(ownsToken({ document: { isOwner: false } }, { isGM: true }), true, 'a GM owns all');
  assert.equal(ownsToken({ document: { isOwner: true } }, { isGM: false }), true);
  assert.equal(ownsToken({ document: { isOwner: false, actor: { isOwner: true } } }, {}), false);
  assert.equal(ownsToken({ document: { actor: { isOwner: true } } }, {}), true);
  assert.equal(ownsToken({ document: { actor: { isOwner: false } } }, {}), false);
  assert.equal(ownsToken({ controlled: true, document: {} }, {}), true);
  assert.equal(ownsToken({ controlled: false, document: {} }, {}), false);
  assert.equal(ownsToken({ document: {} }, {}), false);
});

sealed('the enter prompt admits the mover and a non-GM owner, and no one else', () => {
  const me = { id: 'u-1', isGM: false };
  const gm = { id: 'gm-1', isGM: true };
  const other = { id: 'u-2', isGM: false };
  const owned = { document: { isOwner: true } };
  const foreign = { document: { isOwner: false } };

  assert.equal(shouldPromptForEnter({ event: { user: me }, token: foreign, currentUser: me }), true);
  assert.equal(shouldPromptForEnter({ event: { user: gm }, token: foreign, currentUser: gm }), true);
  assert.equal(
    shouldPromptForEnter({ event: { user: other }, token: owned, currentUser: me }),
    true,
    'a non-GM owner is prompted however the token moved'
  );
  assert.equal(
    shouldPromptForEnter({ event: { user: other }, token: owned, currentUser: gm }),
    false,
    'the GM is not spammed by an autonomous player move'
  );
  assert.equal(
    shouldPromptForEnter({ event: { user: other }, token: foreign, currentUser: me }),
    false
  );
  assert.equal(shouldPromptForEnter(), false);
  assert.equal(
    shouldPromptForEnter({ event: {}, token: owned, currentUser: null }),
    true,
    'with no user resolved the owner branch still admits, as the manager always has'
  );
});

sealed('the event token is read from either shape', () => {
  assert.equal(eventToken({ data: { token: 'inner' }, token: 'outer' }), 'inner');
  assert.equal(eventToken({ token: 'outer' }), 'outer');
  assert.equal(eventToken({}), null);
  assert.equal(eventToken(), null);
});

sealed('the first interactable behaviour is found across every collection shape', () => {
  const wanted = { id: 'beh-2', type: 'fabricate.interactable' };
  const other = { id: 'beh-1', type: 'other' };
  assert.equal(firstInteractableBehavior({ behaviors: { contents: [other, wanted] } }), wanted);
  assert.equal(firstInteractableBehavior({ behaviors: new Map([['a', other], ['b', wanted]]) }), wanted);
  assert.equal(firstInteractableBehavior({ behaviors: [other, wanted] }), wanted);
  assert.equal(
    firstInteractableBehavior({ behaviors: [other] }),
    other,
    'with no match the first entry is taken'
  );
  assert.equal(firstInteractableBehavior({ behaviors: [] }), null);
  assert.equal(firstInteractableBehavior(null), null);
});

sealed('scene token documents tolerate the collection, iterable and array shapes', () => {
  const doc = { id: 'tok-1' };
  assert.deepEqual(sceneTokenDocs({ tokens: { contents: [doc] } }), [doc]);
  assert.deepEqual(sceneTokenDocs({ tokens: new Map([['a', doc]]) }), [doc]);
  assert.deepEqual(sceneTokenDocs({ tokens: [doc] }), [doc]);
  assert.deepEqual(sceneTokenDocs({}), []);
  assert.deepEqual(sceneTokenDocs(null), []);
});

sealed('containment admits an unlocatable actor and any token inside, and denies the rest', () => {
  const none = placed([insideToken({ actorId: 'someone-else', inside: false })]);
  assert.equal(tokenInsideRegion({ behavior: none.behavior, actorId: 'a1' }), true);

  const mixed = placed([insideToken({ inside: false }), insideToken({ inside: true })]);
  assert.equal(tokenInsideRegion({ behavior: mixed.behavior, actorId: 'a1' }), true);

  const outside = placed([insideToken({ inside: false })]);
  assert.equal(tokenInsideRegion({ behavior: outside.behavior, actorId: 'a1' }), false);

  const indeterminate = placed([{ actorId: 'a1' }]);
  assert.equal(
    tokenInsideRegion({ behavior: indeterminate.behavior, actorId: 'a1' }),
    true,
    'no signal answers ⇒ admit'
  );
  assert.equal(tokenInsideRegion({}), true);
});

sealed('the drop point coerces both coordinates', () => {
  assert.deepEqual(dropPoint({ x: '12', y: 34 }), { x: 12, y: 34 });
  assert.deepEqual(dropPoint({}), { x: 0, y: 0 });
  assert.deepEqual(dropPoint(), { x: 0, y: 0 });
});

sealed('actor control admits a GM and an OWNER permission, and tolerates a throw', () => {
  assert.equal(canControlActor({ actor: null, user: { isGM: true } }), false);
  assert.equal(canControlActor({ actor: { id: 'a1' }, user: { isGM: true } }), true);
  assert.equal(
    canControlActor({ actor: { testUserPermission: (_u, level) => level === 'OWNER' }, user: {} }),
    true
  );
  assert.equal(canControlActor({ actor: { testUserPermission: () => false }, user: {} }), false);
  assert.equal(
    canControlActor({
      actor: {
        testUserPermission: () => {
          throw new Error('permission lookup exploded');
        },
      },
      user: {},
    }),
    false
  );
  assert.equal(canControlActor({ actor: { testUserPermission: () => true } }), false);
  assert.equal(canControlActor(), false);
});

sealed('the region rectangle overlays the tile footprint and carries no anchor', () => {
  const rect = regionRectangleFor({
    tile: { x: 150, y: 250, width: 80, height: 60 },
    region: { shape: { x: 0, y: 0, width: 10, height: 10 } },
    gridSize: 100,
  });
  assert.deepEqual(rect, { x: 110, y: 220, width: 80, height: 60 });
  assert.deepEqual([...Object.keys(rect)].sort(), ['height', 'width', 'x', 'y']);

  assert.deepEqual(
    regionRectangleFor({ tile: null, region: { shape: { x: 5, y: 6, width: 7, height: 8 } }, gridSize: 100 }),
    { x: 5, y: 6, width: 7, height: 8 }
  );
  assert.deepEqual(regionRectangleFor({ tile: null, region: {}, gridSize: 70 }), {
    x: 0,
    y: 0,
    width: 70,
    height: 70,
  });
  assert.deepEqual(
    regionRectangleFor({ tile: { x: 100, y: 100 }, region: {}, gridSize: 70 }),
    { x: 65, y: 65, width: 70, height: 70 },
    'the non-zero grid fallback keeps V13 from refusing a zero dimension'
  );
});

sealed('the view centre prefers the stage answer, then the scene midpoint, then the origin', () => {
  assert.deepEqual(viewCenterFrom({ stageCenter: { x: 1, y: 2 }, dimensions: { width: 8, height: 8 } }), {
    x: 1,
    y: 2,
  });
  assert.deepEqual(viewCenterFrom({ stageCenter: null, dimensions: { width: 4000, height: 3000 } }), {
    x: 2000,
    y: 1500,
  });
  assert.deepEqual(viewCenterFrom({ dimensions: { width: '4000', height: 3000 } }), { x: 0, y: 0 });
  assert.deepEqual(viewCenterFrom({}), { x: 0, y: 0 });
  assert.deepEqual(viewCenterFrom(), { x: 0, y: 0 });
});

sealed('the screen centre is converted through the stage, with its receiver kept', () => {
  const submitted = [];
  class Point {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  }
  const stage = {
    toLocal(point) {
      submitted.push({ x: point.x, y: point.y, self: this });
      return { x: point.x * 2, y: point.y * 3 };
    },
  };

  assert.deepEqual(screenCenterToScene({ stage, PointClass: Point, width: 800, height: 600 }), {
    x: 800,
    y: 900,
  });
  assert.deepEqual({ x: submitted[0].x, y: submitted[0].y }, { x: 400, y: 300 });
  assert.equal(submitted[0].self, stage);

  assert.equal(screenCenterToScene({ stage, PointClass: null, width: 800, height: 600 }), null);
  assert.equal(screenCenterToScene({ stage: {}, PointClass: Point }), null);
  assert.equal(
    screenCenterToScene({ stage: { toLocal: () => ({ x: Number.NaN, y: 0 }) }, PointClass: Point }),
    null
  );
  assert.equal(
    screenCenterToScene({
      stage: {
        toLocal: () => {
          throw new Error('stage exploded');
        },
      },
      PointClass: Point,
    }),
    null
  );
  assert.equal(screenCenterToScene(), null);
});

sealed('a tool takes its linked component image, anything else its own, else the default', () => {
  const classification = { interactableType: 'tool', entry: { componentId: 'comp-axe', img: ' ' } };
  assert.equal(
    iconTextureFor({ classification, components: [{ id: 'comp-axe', img: ' icons/axe.webp ' }] }),
    'icons/axe.webp'
  );
  assert.equal(iconTextureFor({ classification, components: [] }), DEFAULT_INTERACTABLE_IMG);
  assert.equal(
    iconTextureFor({
      classification: { interactableType: 'gatheringTask', entry: { img: 'icons/task.webp' } },
      components: [{ id: 'comp-axe', img: 'icons/axe.webp' }],
    }),
    'icons/task.webp'
  );
  assert.equal(
    iconTextureFor({ classification: { interactableType: 'tool', entry: { img: 'icons/fb.webp' } } }),
    'icons/fb.webp',
    'a tool with no component image falls through to its own entry image'
  );
  assert.equal(iconTextureFor(), DEFAULT_INTERACTABLE_IMG);
});

sealed('the grid size takes the first present candidate, guarded to a positive number', () => {
  assert.equal(gridSizeFrom(70, 60, 55), 70);
  assert.equal(gridSizeFrom(undefined, 60, 55), 60);
  assert.equal(gridSizeFrom(undefined, null, 55), 55);
  assert.equal(gridSizeFrom(0, 60), 100, 'a present zero is refused rather than skipped');
  assert.equal(gridSizeFrom('wide'), 100);
  assert.equal(gridSizeFrom(-5), 100);
  assert.equal(gridSizeFrom(), 100);
  assert.equal(gridSizeFrom('70'), 70);
});

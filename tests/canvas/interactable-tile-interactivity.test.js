/**
 * Unit coverage for the interactable-tile pointer-interactivity enablement.
 *
 * The PURE decision (is-this-an-interactable-tile) is `isInteractableTile`,
 * covered in `interactable-tile-flags.test.js`. This suite proves the thin
 * PIXI/Foundry enablement edge runs ONLY for interactable tiles, sets the
 * expected pointer properties, ensures the MouseInteractionManager is activated,
 * is idempotent, and is no-throw against exotic/partial placeables — all with a
 * FAKE placeable (no live PIXI/Foundry runtime). Actual event delivery is a
 * live-Foundry (test:foundry) concern.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enableInteractableTilePointerEvents,
  enableInteractableTilesIn,
  detachDoubleClickPointerListener,
  registerPointerEvent
} from '../../src/canvas/interactableTileInteractivity.js';
import { InteractableManager } from '../../src/canvas/InteractableManager.js';

const INTERACTABLE_FLAGS = {
  isInteractable: true,
  interactableType: 'gatheringTask',
  sourceUuid: 'Fabricate.sys.gatheringTask.task1'
};

/**
 * Build a fake Tile placeable that records interaction-manager activation.
 *
 * @param {object} [opts]
 * @param {object|null} [opts.flags]  `flags.fabricate` block; null ⇒ plain tile.
 * @param {boolean} [opts.withManager=true] Whether a mouseInteractionManager exists upfront.
 * @returns {object}
 */
function fakePlaceable({ flags = INTERACTABLE_FLAGS, withManager = true } = {}) {
  const calls = { activateListeners: 0, createManager: 0, activate: 0 };
  // A minimal PIXI-emitter shape so the raw double-click listener can be bound;
  // `listeners[event]` records each attached handler so a test can fire it.
  const listeners = {};
  const placeable = {
    document: { flags: flags ? { fabricate: flags } : {}, width: 100, height: 100 },
    eventMode: 'passive',
    interactive: false,
    interactiveChildren: false,
    cursor: 'default',
    hitArea: null,
    mouseInteractionManager: withManager
      ? { activate() { calls.activate += 1; return this; } }
      : null,
    activateListeners() { calls.activateListeners += 1; },
    _createInteractionManager() {
      calls.createManager += 1;
      return { activate() { calls.activate += 1; return this; } };
    },
    on(event, handler) { (listeners[event] ??= []).push(handler); },
    off(event, handler) {
      const list = listeners[event];
      if (!list) return;
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    }
  };
  return { placeable, calls, listeners };
}

test('enables pointer interactivity on an interactable tile', () => {
  const { placeable, calls, listeners } = fakePlaceable();
  const ran = enableInteractableTilePointerEvents(placeable);

  assert.equal(ran, true);
  assert.equal(placeable.eventMode, 'static', 'sets PIXI v7 static event mode');
  assert.equal(placeable.interactive, true, 'sets the legacy interactive alias');
  assert.equal(placeable.interactiveChildren, true, 'allows children to receive events');
  assert.equal(placeable.cursor, 'pointer', 'sets a pointer cursor affordance');
  assert.equal(calls.activateListeners, 1, 'activates the placeable listeners');
  assert.equal(calls.activate, 1, 'activates the MouseInteractionManager');
  assert.equal(listeners.pointerdown?.length, 1, 'attaches a raw pointerdown listener');
});

test('does NOT enable a non-interactable (plain) tile', () => {
  const { placeable, calls } = fakePlaceable({ flags: null });
  const ran = enableInteractableTilePointerEvents(placeable);

  assert.equal(ran, false);
  assert.equal(placeable.eventMode, 'passive', 'pointer mode untouched');
  assert.equal(placeable.interactive, false);
  assert.equal(calls.activateListeners, 0);
  assert.equal(calls.activate, 0);
});

test('is idempotent — the mutation set + pointer listener run once per placeable', () => {
  const { placeable, calls, listeners } = fakePlaceable();
  enableInteractableTilePointerEvents(placeable);
  const second = enableInteractableTilePointerEvents(placeable);

  assert.equal(second, true, 'still reports the tile as interactable');
  assert.equal(calls.activateListeners, 1, 'listeners are not re-activated');
  assert.equal(calls.activate, 1, 'manager is not re-activated');
  assert.equal(listeners.pointerdown?.length, 1, 'the pointerdown listener is not re-bound');
});

test('creates the interaction manager when the placeable lacks one', () => {
  const { placeable, calls } = fakePlaceable({ withManager: false });
  // Drop activateListeners so we exercise the manual create+activate fallback.
  delete placeable.activateListeners;

  const ran = enableInteractableTilePointerEvents(placeable);

  assert.equal(ran, true);
  assert.equal(calls.createManager, 1, 'builds a manager when absent');
  assert.equal(calls.activate, 1, 'activates the freshly built manager');
});

test('is no-throw against a null / undefined / exotic placeable', () => {
  assert.equal(enableInteractableTilePointerEvents(null), false);
  assert.equal(enableInteractableTilePointerEvents(undefined), false);
  // Interactable tile but missing every enablement method ⇒ still no-throw, still true.
  const bare = { document: { flags: { fabricate: INTERACTABLE_FLAGS } } };
  assert.equal(enableInteractableTilePointerEvents(bare), true);
});

test('enableInteractableTilesIn sweeps a collection, enabling only interactable tiles', () => {
  const a = fakePlaceable();
  const b = fakePlaceable({ flags: null });
  const c = fakePlaceable();

  const count = enableInteractableTilesIn([a.placeable, b.placeable, c.placeable]);

  assert.equal(count, 2, 'only the two interactable tiles are enabled');
  assert.equal(a.placeable.eventMode, 'static');
  assert.equal(b.placeable.eventMode, 'passive');
  assert.equal(c.placeable.eventMode, 'static');
});

test('enableInteractableTilesIn tolerates null / a collection-shaped object', () => {
  assert.equal(enableInteractableTilesIn(null), 0);
  const a = fakePlaceable();
  // A non-iterable object exposing `.placeables` (live-collection shape).
  assert.equal(enableInteractableTilesIn({ placeables: [a.placeable] }), 1);
});

test('sets a PIXI.Rectangle hitArea covering the tile when one is needed', () => {
  const savedPixi = globalThis.PIXI;
  class FakeRectangle {
    constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
  }
  globalThis.PIXI = { Rectangle: FakeRectangle };
  try {
    const { placeable } = fakePlaceable();
    enableInteractableTilePointerEvents(placeable);
    assert.ok(placeable.hitArea instanceof FakeRectangle, 'a hit area is set');
    assert.deepEqual(
      { x: placeable.hitArea.x, y: placeable.hitArea.y, width: placeable.hitArea.width, height: placeable.hitArea.height },
      { x: 0, y: 0, width: 100, height: 100 },
      'covers the tile bounds'
    );
  } finally {
    if (savedPixi === undefined) delete globalThis.PIXI; else globalThis.PIXI = savedPixi;
  }
});

// --- pure double-click detector ----------------------------------------------

test('registerPointerEvent: two events within window + distance → "double"', () => {
  const state = {};
  assert.equal(registerPointerEvent(state, { time: 1000, x: 50, y: 50 }), 'single', 'first event is a single');
  assert.equal(registerPointerEvent(state, { time: 1200, x: 52, y: 51 }), 'double', 'a close, prompt second is a double');
});

test('registerPointerEvent: a second event outside the time window → "single"', () => {
  const state = {};
  assert.equal(registerPointerEvent(state, { time: 1000, x: 50, y: 50 }), 'single');
  assert.equal(registerPointerEvent(state, { time: 1600, x: 50, y: 50 }), 'single', '600ms apart is too slow');
});

test('registerPointerEvent: a second event too far away → "single"', () => {
  const state = {};
  assert.equal(registerPointerEvent(state, { time: 1000, x: 50, y: 50 }), 'single');
  assert.equal(registerPointerEvent(state, { time: 1100, x: 90, y: 90 }), 'single', '40px apart is too far');
});

test('registerPointerEvent: resets after a double so a third event is a fresh single', () => {
  const state = {};
  registerPointerEvent(state, { time: 1000, x: 50, y: 50 });
  assert.equal(registerPointerEvent(state, { time: 1100, x: 50, y: 50 }), 'double');
  // A prompt third event must NOT triple-count; the sequence restarts.
  assert.equal(registerPointerEvent(state, { time: 1150, x: 50, y: 50 }), 'single', 'no triple-count');
  assert.equal(registerPointerEvent(state, { time: 1200, x: 50, y: 50 }), 'double', 'the fourth completes a fresh double');
});

test('registerPointerEvent is no-throw / "single" with missing state or event', () => {
  assert.equal(registerPointerEvent(null, { time: 1, x: 0, y: 0 }), 'single');
  assert.equal(registerPointerEvent({}, null), 'single');
});

// --- the bound listener dispatches a double-click to the manager -------------

test('a double-click on the bound listener routes to InteractableManager._onDoubleClick(document)', () => {
  const { placeable, listeners } = fakePlaceable();
  enableInteractableTilePointerEvents(placeable);
  const handler = listeners.pointerdown[0];

  const dispatched = [];
  const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
  InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);
  try {
    // Two prompt, co-located pointerdowns ⇒ one double-click dispatch.
    handler({ timeStamp: 1000, global: { x: 50, y: 50 } });
    assert.equal(dispatched.length, 0, 'the first event does not dispatch');
    handler({ timeStamp: 1150, global: { x: 51, y: 50 } });
    assert.equal(dispatched.length, 1, 'the second (close+prompt) event dispatches a double-click');
    assert.equal(dispatched[0], placeable.document, 'the tile document is routed');
  } finally {
    InteractableManager.instance._onDoubleClick = realOnDoubleClick;
  }
});

test('detachDoubleClickPointerListener removes the bound listener (idempotent, no-throw)', () => {
  const { placeable, listeners } = fakePlaceable();
  enableInteractableTilePointerEvents(placeable);
  assert.equal(listeners.pointerdown.length, 1, 'listener bound');

  detachDoubleClickPointerListener(placeable);
  assert.equal(listeners.pointerdown.length, 0, 'listener removed on detach');

  // Idempotent + no-throw on a second detach and on null. (In production a
  // destroyed tile is replaced by a fresh placeable on redraw, so re-binding
  // happens on a NEW object, not a re-enable of this already-enabled one.)
  assert.doesNotThrow(() => detachDoubleClickPointerListener(placeable));
  assert.doesNotThrow(() => detachDoubleClickPointerListener(null));
});

test('does NOT bind a pointer listener on a non-interactable tile', () => {
  const { placeable, listeners } = fakePlaceable({ flags: null });
  enableInteractableTilePointerEvents(placeable);
  assert.equal(listeners.pointerdown, undefined, 'no listener on a plain tile');
});

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
  enableInteractableTilesIn
} from '../../src/canvas/interactableTileInteractivity.js';

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
  const placeable = {
    document: flags ? { flags: { fabricate: flags } } : { flags: {} },
    eventMode: 'passive',
    interactive: false,
    interactiveChildren: false,
    mouseInteractionManager: withManager
      ? { activate() { calls.activate += 1; return this; } }
      : null,
    activateListeners() { calls.activateListeners += 1; },
    _createInteractionManager() {
      calls.createManager += 1;
      return { activate() { calls.activate += 1; return this; } };
    }
  };
  return { placeable, calls };
}

test('enables pointer interactivity on an interactable tile', () => {
  const { placeable, calls } = fakePlaceable();
  const ran = enableInteractableTilePointerEvents(placeable);

  assert.equal(ran, true);
  assert.equal(placeable.eventMode, 'static', 'sets PIXI v7 static event mode');
  assert.equal(placeable.interactive, true, 'sets the legacy interactive alias');
  assert.equal(placeable.interactiveChildren, true, 'allows children to receive events');
  assert.equal(calls.activateListeners, 1, 'activates the placeable listeners');
  assert.equal(calls.activate, 1, 'activates the MouseInteractionManager');
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

test('is idempotent — the mutation set runs once per placeable', () => {
  const { placeable, calls } = fakePlaceable();
  enableInteractableTilePointerEvents(placeable);
  const second = enableInteractableTilePointerEvents(placeable);

  assert.equal(second, true, 'still reports the tile as interactable');
  assert.equal(calls.activateListeners, 1, 'listeners are not re-activated');
  assert.equal(calls.activate, 1, 'manager is not re-activated');
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

/**
 * Phase 1c retired the CANVAS-STAGE double-click pointer listener entirely.
 *
 * In the region-first model a player activates a Fabricate interactable by token
 * PRESENCE in a `fabricate.interactable` Scene Region (Foundry-native), NOT by
 * double-clicking a tile. `InteractableManager.register()` therefore no longer
 * binds `canvasReady` or installs a `canvas.stage` `pointerdown` listener; the
 * dead pure hit-test / detector modules are deleted in Phase 1d. This suite
 * asserts the listener is gone (no stage `.on`, no `canvasReady` hook) so a
 * regression that re-introduces the layer-fighting tile-click path fails loudly.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { InteractableManager } from '../../src/canvas/InteractableManager.js';

const GLOBAL_KEYS = ['foundry', 'CONFIG', 'Hooks', 'canvas', 'PIXI', 'Tile', 'MouseInteractionManager', 'game'];

const STAGE_FLAG = '_fabricateInteractableStageDoubleClickBound';

function snapshot() {
  const saved = {};
  for (const key of GLOBAL_KEYS) saved[key] = globalThis[key];
  return saved;
}
function restore(saved) {
  for (const key of GLOBAL_KEYS) {
    if (saved[key] === undefined) delete globalThis[key];
    else globalThis[key] = saved[key];
  }
}

function makeFakeStage() {
  const listeners = {};
  return {
    listeners,
    on(event, handler) { (listeners[event] ??= []).push(handler); },
    off(event, handler) {
      const list = listeners[event];
      if (!list) return;
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    }
  };
}

test('register() binds neither canvasReady nor a canvas.stage pointerdown listener', () => {
  const saved = snapshot();
  try {
    const boundHooks = [];
    globalThis.Hooks = { on: (name) => boundHooks.push(name) };
    const stage = makeFakeStage();
    globalThis.canvas = { stage, tiles: { placeables: [] } };
    globalThis.game = {};

    new InteractableManager().register();

    assert.equal(boundHooks.includes('canvasReady'), false, 'canvasReady is no longer bound');
    assert.equal(stage.listeners.pointerdown, undefined, 'no stage pointerdown listener is installed');
    assert.notEqual(stage[STAGE_FLAG], true, 'the stage idempotency flag is never set');
  } finally {
    restore(saved);
  }
});

test('register() is a no-op (no throw) regardless of canvas.stage availability', () => {
  const saved = snapshot();
  try {
    globalThis.Hooks = { on: () => {} };
    globalThis.game = {};
    delete globalThis.canvas;
    const manager = new InteractableManager();
    assert.doesNotThrow(() => manager.register());
  } finally {
    restore(saved);
  }
});

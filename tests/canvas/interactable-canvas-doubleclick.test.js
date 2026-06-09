/**
 * Unit coverage for the CANVAS-STAGE double-click pointer listener installed by
 * `InteractableManager.register()` (on the `canvasReady` hook).
 *
 * The pure hit-test is covered in `interactable-tile-hit-test.test.js` and the
 * pure double-click detector in `interactable-tile-interactivity.test.js`. This
 * suite proves the thin Foundry/PIXI edge: a `canvasReady` install attaches a
 * single `pointerdown` listener to `canvas.stage`; a simulated double pointerdown
 * over an interactable tile dispatches `_onDoubleClick(document)`; a miss does NOT
 * dispatch; the install is idempotent across repeated `canvasReady` (one listener)
 * and re-attaches cleanly on a fresh stage after a scene swap; the scene point is
 * derived via `stage.toLocal` with documented fallbacks; and the install is
 * no-throw when `canvas.stage` / `.on` is absent. Driven with FAKE globals (no
 * live Foundry / PIXI).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { InteractableManager } from '../../src/canvas/InteractableManager.js';

const GLOBAL_KEYS = ['foundry', 'CONFIG', 'Hooks', 'canvas', 'PIXI', 'Tile', 'MouseInteractionManager'];

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

/**
 * A fake PIXI stage that records attached `pointerdown` handlers so a test can
 * fire them. `toLocal` projects a stage-global point into scene space; by default
 * it is the identity so a global point IS the scene point.
 *
 * @param {(p: {x:number,y:number}) => {x:number,y:number}} [toLocal]
 */
function makeFakeStage(toLocal = (p) => ({ x: p.x, y: p.y })) {
  const listeners = {};
  return {
    listeners,
    toLocal,
    on(event, handler) { (listeners[event] ??= []).push(handler); },
    off(event, handler) {
      const list = listeners[event];
      if (!list) return;
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    }
  };
}

/**
 * A fake Hooks that records bound callbacks by hook name and can fire them. The
 * manager binds `canvasReady`; firing it runs the stage-listener install.
 */
function makeFakeHooks() {
  const handlers = {};
  return {
    handlers,
    on(name, fn) { (handlers[name] ??= []).push(fn); },
    fire(name, ...args) { (handlers[name] ?? []).forEach((fn) => fn(...args)); }
  };
}

function interactableTilePlaceable(id, { x, y, width, height } = { x: 100, y: 100, width: 100, height: 100 }) {
  return {
    document: {
      id,
      x, y, width, height,
      flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: 'Fabricate.sysA.tool.tool-1' } }
    }
  };
}

function plainTilePlaceable(id, bounds = { x: 0, y: 0, width: 100, height: 100 }) {
  return { document: { id, ...bounds, flags: {} } };
}

/**
 * Fire two prompt, co-located pointerdowns at the same global point through the
 * stage's bound `pointerdown` handler, simulating a double-click.
 */
function dispatchDoubleClick(stage, global) {
  const handler = stage.listeners.pointerdown[0];
  handler({ timeStamp: 1000, global });
  handler({ timeStamp: 1150, global: { x: global.x + 1, y: global.y } });
}

test('canvasReady installs a single stage pointerdown listener (idempotent across repeated canvasReady)', () => {
  const saved = snapshot();
  try {
    const hooks = makeFakeHooks();
    globalThis.Hooks = hooks;
    const stage = makeFakeStage();
    globalThis.canvas = { stage, tiles: { placeables: [] } };

    const manager = new InteractableManager();
    manager.register();

    hooks.fire('canvasReady');
    hooks.fire('canvasReady'); // repeated — must not add a second listener.

    assert.equal(stage.listeners.pointerdown?.length, 1, 'exactly one pointerdown listener on the stage');
    assert.equal(stage[STAGE_FLAG], true, 'the per-stage idempotency flag is set');
  } finally {
    restore(saved);
  }
});

test('tolerates canvas.app.stage when canvas.stage is absent', () => {
  const saved = snapshot();
  try {
    const hooks = makeFakeHooks();
    globalThis.Hooks = hooks;
    const stage = makeFakeStage();
    globalThis.canvas = { app: { stage }, tiles: { placeables: [] } };

    const manager = new InteractableManager();
    manager.register();
    hooks.fire('canvasReady');

    assert.equal(stage.listeners.pointerdown?.length, 1, 'the listener attaches to canvas.app.stage');
  } finally {
    restore(saved);
  }
});

test('a stage double-click over an interactable tile dispatches _onDoubleClick(document)', () => {
  const saved = snapshot();
  const dispatched = [];
  const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
  try {
    const hooks = makeFakeHooks();
    globalThis.Hooks = hooks;
    const stage = makeFakeStage();
    const tile = interactableTilePlaceable('tile-1', { x: 100, y: 100, width: 100, height: 100 });
    globalThis.canvas = { stage, tiles: { placeables: [tile] } };

    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    const manager = new InteractableManager();
    manager.register();
    hooks.fire('canvasReady');

    dispatchDoubleClick(stage, { x: 150, y: 150 });

    assert.equal(dispatched.length, 1, 'the double-click dispatched once');
    assert.equal(dispatched[0], tile.document, 'the hit tile document is routed');
  } finally {
    InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    restore(saved);
  }
});

test('the FIRST pointerdown alone does not dispatch (single, not double)', () => {
  const saved = snapshot();
  const dispatched = [];
  const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
  try {
    const hooks = makeFakeHooks();
    globalThis.Hooks = hooks;
    const stage = makeFakeStage();
    const tile = interactableTilePlaceable('tile-1');
    globalThis.canvas = { stage, tiles: { placeables: [tile] } };

    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    const manager = new InteractableManager();
    manager.register();
    hooks.fire('canvasReady');

    stage.listeners.pointerdown[0]({ timeStamp: 1000, global: { x: 150, y: 150 } });
    assert.equal(dispatched.length, 0, 'a single pointerdown does not dispatch');
  } finally {
    InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    restore(saved);
  }
});

test('a stage double-click that misses every interactable tile does NOT dispatch', () => {
  const saved = snapshot();
  const dispatched = [];
  const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
  try {
    const hooks = makeFakeHooks();
    globalThis.Hooks = hooks;
    const stage = makeFakeStage();
    // A plain (non-interactable) tile under the click + an interactable one elsewhere.
    globalThis.canvas = {
      stage,
      tiles: {
        placeables: [
          plainTilePlaceable('plain', { x: 100, y: 100, width: 100, height: 100 }),
          interactableTilePlaceable('node', { x: 500, y: 500, width: 100, height: 100 })
        ]
      }
    };

    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    const manager = new InteractableManager();
    manager.register();
    hooks.fire('canvasReady');

    dispatchDoubleClick(stage, { x: 150, y: 150 });

    assert.equal(dispatched.length, 0, 'no Fabricate dispatch on a miss (the listener is additive, suppresses nothing)');
  } finally {
    InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    restore(saved);
  }
});

test('derives the scene point via stage.toLocal (the stage local space is scene space)', () => {
  const saved = snapshot();
  const dispatched = [];
  const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
  try {
    const hooks = makeFakeHooks();
    globalThis.Hooks = hooks;
    // toLocal subtracts (10,10): a global (160,160) projects to scene (150,150).
    const stage = makeFakeStage((p) => ({ x: p.x - 10, y: p.y - 10 }));
    const tile = interactableTilePlaceable('tile-1', { x: 100, y: 100, width: 100, height: 100 });
    globalThis.canvas = { stage, tiles: { placeables: [tile] } };
    globalThis.PIXI = { Point: class { constructor(x, y) { this.x = x; this.y = y; } } };

    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    const manager = new InteractableManager();
    manager.register();
    hooks.fire('canvasReady');

    dispatchDoubleClick(stage, { x: 160, y: 160 });

    assert.equal(dispatched.length, 1, 'the projected scene point hit-tested the tile');
    assert.equal(dispatched[0], tile.document);
  } finally {
    InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    restore(saved);
  }
});

test('falls back to interactionData.origin when no toLocal/global projection is available', () => {
  const saved = snapshot();
  const dispatched = [];
  const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
  try {
    const hooks = makeFakeHooks();
    globalThis.Hooks = hooks;
    // A stage with NO toLocal so the projection branch is skipped.
    const stage = makeFakeStage();
    delete stage.toLocal;
    const tile = interactableTilePlaceable('tile-1', { x: 100, y: 100, width: 100, height: 100 });
    globalThis.canvas = { stage, tiles: { placeables: [tile] } };

    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    const manager = new InteractableManager();
    manager.register();
    hooks.fire('canvasReady');

    // No `global`; the origin fallback supplies the scene point. The detector keys
    // off event.x/y for timing, which we also provide.
    const handler = stage.listeners.pointerdown[0];
    handler({ timeStamp: 1000, x: 150, y: 150, interactionData: { origin: { x: 150, y: 150 } } });
    handler({ timeStamp: 1150, x: 151, y: 150, interactionData: { origin: { x: 151, y: 150 } } });

    assert.equal(dispatched.length, 1, 'the origin fallback resolved the scene point');
    assert.equal(dispatched[0], tile.document);
  } finally {
    InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    restore(saved);
  }
});

test('re-attaches a single listener on a FRESH stage after a scene swap', () => {
  const saved = snapshot();
  const dispatched = [];
  const realOnDoubleClick = InteractableManager.instance._onDoubleClick;
  try {
    const hooks = makeFakeHooks();
    globalThis.Hooks = hooks;
    const firstStage = makeFakeStage();
    const tile = interactableTilePlaceable('tile-1', { x: 100, y: 100, width: 100, height: 100 });
    globalThis.canvas = { stage: firstStage, tiles: { placeables: [tile] } };

    InteractableManager.instance._onDoubleClick = (doc) => dispatched.push(doc);

    const manager = new InteractableManager();
    manager.register();
    hooks.fire('canvasReady');
    assert.equal(firstStage.listeners.pointerdown.length, 1, 'one listener on the first stage');

    // Scene swap: a brand-new stage object replaces the old one.
    const secondStage = makeFakeStage();
    globalThis.canvas = { stage: secondStage, tiles: { placeables: [tile] } };
    hooks.fire('canvasReady');

    assert.equal(secondStage.listeners.pointerdown.length, 1, 'exactly one listener on the fresh stage');
    dispatchDoubleClick(secondStage, { x: 150, y: 150 });
    assert.equal(dispatched.length, 1, 'the fresh stage listener dispatches a double-click');
  } finally {
    InteractableManager.instance._onDoubleClick = realOnDoubleClick;
    restore(saved);
  }
});

test('register() + canvasReady tolerate an absent stage (no throw, no listener)', () => {
  const saved = snapshot();
  try {
    const hooks = makeFakeHooks();
    globalThis.Hooks = hooks;
    globalThis.canvas = { tiles: { placeables: [] } }; // no stage at all.

    const manager = new InteractableManager();
    manager.register();
    assert.doesNotThrow(() => hooks.fire('canvasReady'), 'a missing stage is tolerated');
  } finally {
    restore(saved);
  }
});

test('the install tolerates a stage without an `.on` method (no throw)', () => {
  const saved = snapshot();
  try {
    const hooks = makeFakeHooks();
    globalThis.Hooks = hooks;
    globalThis.canvas = { stage: { /* no on() */ }, tiles: { placeables: [] } };

    const manager = new InteractableManager();
    manager.register();
    assert.doesNotThrow(() => hooks.fire('canvasReady'), 'a stage without .on degrades to a no-op');
  } finally {
    restore(saved);
  }
});

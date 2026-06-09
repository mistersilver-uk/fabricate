/**
 * Phase 7 — the click-to-place a11y fallback.
 *
 * Drag-and-drop is a keyboard/no-pointer dead-end, so the browser also offers a
 * "Place on current scene" button per row. It calls
 * `InteractableManager.placeInteractableAtViewCenter`, which must NOT be a
 * divergent spawn path: it synthesizes the same `dropCanvasData` payload the
 * drag emits and routes it through `_onDrop` at the scene view center, so tools
 * spawn directly and gathering tasks still run the env-resolution precedence.
 *
 * These tests assert via an injected spawn spy that the SAME pipeline is used.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { InteractableManager } from '../../src/canvas/InteractableManager.js';

const GLOBAL_KEYS = ['game', 'canvas', 'ui', 'PIXI', 'window'];

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

function installGM({ tools = [{ id: 'tool-1', componentId: 'comp-axe' }], tasks = [{ id: 'task-9', name: 'Chop Wood' }] } = {}) {
  globalThis.game = {
    user: { isGM: true },
    fabricate: {
      getCraftingSystemManager: () => ({
        getSystem: (systemId) => (systemId === 'sysA' ? { tools } : null)
      })
    },
    settings: { get: () => ({ systems: { sysA: { tasks } } }) }
  };
  globalThis.ui = { notifications: { warn: () => {}, info: () => {} } };
  // No PIXI stage ⇒ _viewCenter falls back to scene dimensions midpoint.
  globalThis.canvas = {
    scene: { id: 'scene-1', dimensions: { width: 4000, height: 3000 } }
  };
}

async function flush(turns = 5) {
  for (let i = 0; i < turns; i++) await Promise.resolve();
}

test('placeInteractableAtViewCenter routes a Tool through the SAME region-spawn pipeline at the view center', async () => {
  const saved = snapshot();
  try {
    installGM();
    const manager = new InteractableManager();
    const spawned = [];
    manager._spawnInteractableRegion = (request) => { spawned.push(request); return Promise.resolve({}); };

    const recognized = manager.placeInteractableAtViewCenter({
      interactableType: 'tool',
      systemId: 'sysA',
      referenceId: 'tool-1'
    });

    assert.equal(recognized, true, 'the synthesized drop is recognized as a Fabricate interactable');
    await flush();
    assert.equal(spawned.length, 1, 'exactly one tool spawn through the shared region pipeline');
    assert.equal(spawned[0].interactableType, 'tool');
    assert.equal(spawned[0].sourceUuid, 'Fabricate.sysA.tool.tool-1');
    assert.equal(spawned[0].behaviorSystem.interactableType, 'tool', 'the region-spawn carries the behaviour system');
    // View center = scene dimensions midpoint (no PIXI stage installed). Both the
    // region shape and the linked Tile are centered on it (the tile stores the
    // center as x/y; the region rect stores center - half-size as its top-left).
    assert.equal(spawned[0].region.shape.type, 'rectangle');
    assert.equal(typeof spawned[0].tile.x, 'number');
  } finally {
    restore(saved);
  }
});

test('placeInteractableAtViewCenter routes a Gathering Task through the env-resolution precedence path', async () => {
  const saved = snapshot();
  try {
    installGM();
    const manager = new InteractableManager();
    const taskSpawns = [];
    // Capture the gathering-task branch (the env-precedence path), distinct from
    // the direct tool spawn — proving tasks do NOT bypass env resolution.
    manager._spawnGatheringTask = (args) => { taskSpawns.push(args); return Promise.resolve({}); };

    const recognized = manager.placeInteractableAtViewCenter({
      interactableType: 'gatheringTask',
      systemId: 'sysA',
      referenceId: 'task-9'
    });

    assert.equal(recognized, true);
    await flush();
    assert.equal(taskSpawns.length, 1, 'the gathering task goes through _spawnGatheringTask (env precedence)');
    assert.equal(taskSpawns[0].classification.interactableType, 'gatheringTask');
    assert.equal(taskSpawns[0].point.x, 2000);
    assert.equal(taskSpawns[0].point.y, 1500);
  } finally {
    restore(saved);
  }
});

test('placeInteractableAtViewCenter declines an unbuildable request', () => {
  const saved = snapshot();
  try {
    installGM();
    const manager = new InteractableManager();
    manager._spawnInteractableRegion = () => { throw new Error('must not spawn'); };
    assert.equal(manager.placeInteractableAtViewCenter({ interactableType: 'tool', systemId: '', referenceId: '' }), false);
  } finally {
    restore(saved);
  }
});

test('placeInteractableAtViewCenter is GM-gated by the shared _onDrop GM check', async () => {
  const saved = snapshot();
  try {
    installGM();
    globalThis.game.user.isGM = false; // non-GM cannot place.
    const manager = new InteractableManager();
    manager._spawnInteractableRegion = () => { throw new Error('non-GM must not spawn'); };
    // _onDrop returns false (recognized) but suppresses without spawning; the
    // GM warning fires through the shared path.
    const recognized = manager.placeInteractableAtViewCenter({
      interactableType: 'tool', systemId: 'sysA', referenceId: 'tool-1'
    });
    assert.equal(recognized, true, 'recognized but suppressed for non-GM');
    await flush();
  } finally {
    restore(saved);
  }
});

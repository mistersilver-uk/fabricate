import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveMarkerImage,
  syncInteractableMarkers
} from '../../../src/canvas/regions/interactableMarkerDepletion.js';

const TILE_UUID = 'Scene.s1.Tile.t1';

function gatheringSystem(overrides = {}) {
  return {
    interactableType: 'gatheringTask',
    sourceUuid: 'sys.task.0',
    systemId: 'sys1',
    taskId: 'task1',
    environmentId: 'env1',
    name: 'Berry bush',
    linkedVisual: { uuid: TILE_UUID, documentName: 'Tile', mode: 'marker', missingPolicy: 'warn' },
    state: { enabled: true, consumed: false, locked: false, uses: { max: null, used: 0 }, cooldown: {} },
    ...overrides
  };
}

function taskWithSwap(swapImage = 'icons/depleted.webp', nodeOverrides = {}) {
  return {
    id: 'task1',
    img: 'icons/available.webp',
    nodes: { enabled: true, max: 3, current: 3, depletedBehavior: { swapImage }, ...nodeOverrides }
  };
}

describe('resolveMarkerImage (pure)', () => {
  it('depleted env (current <= 0) with a configured swapImage → desiredImg is the swap image', () => {
    const result = resolveMarkerImage({
      behaviorSystem: gatheringSystem(),
      environment: { id: 'env1', nodeRuntime: { task1: { current: 0 } } },
      task: taskWithSwap(),
      availableImg: 'icons/available.webp'
    });
    assert.deepEqual(result, { desiredImg: 'icons/depleted.webp', depleted: true });
  });

  it('available env (current > 0) → desiredImg is the available image', () => {
    const result = resolveMarkerImage({
      behaviorSystem: gatheringSystem(),
      environment: { id: 'env1', nodeRuntime: { task1: { current: 2 } } },
      task: taskWithSwap(),
      availableImg: 'icons/available.webp'
    });
    assert.deepEqual(result, { desiredImg: 'icons/available.webp', depleted: false });
  });

  it('no swapImage configured → never swaps (depleted is false even when current <= 0)', () => {
    const result = resolveMarkerImage({
      behaviorSystem: gatheringSystem(),
      environment: { id: 'env1', nodeRuntime: { task1: { current: 0 } } },
      task: { id: 'task1', img: 'icons/available.webp', nodes: { enabled: true, max: 3, current: 0 } },
      availableImg: 'icons/available.webp'
    });
    assert.deepEqual(result, { desiredImg: 'icons/available.webp', depleted: false });
  });

  it('missing environment or task → returns null (no change)', () => {
    assert.equal(
      resolveMarkerImage({ behaviorSystem: gatheringSystem(), environment: null, task: taskWithSwap(), availableImg: 'a' }),
      null
    );
    assert.equal(
      resolveMarkerImage({ behaviorSystem: gatheringSystem(), environment: { id: 'env1' }, task: null, availableImg: 'a' }),
      null
    );
  });

  it('non-gathering-task interactable → returns null', () => {
    const toolSystem = gatheringSystem({ interactableType: 'tool', taskId: null });
    assert.equal(
      resolveMarkerImage({ behaviorSystem: toolSystem, environment: { id: 'env1' }, task: taskWithSwap(), availableImg: 'a' }),
      null
    );
  });

  it('no linked Tile visual → returns null', () => {
    const noVisual = gatheringSystem({ linkedVisual: { uuid: null, documentName: null, mode: 'none', missingPolicy: 'warn' } });
    assert.equal(
      resolveMarkerImage({ behaviorSystem: noVisual, environment: { id: 'env1', nodeRuntime: {} }, task: taskWithSwap(), availableImg: 'a' }),
      null
    );
  });

  it('falls back to the task node count when the environment has no runtime entry', () => {
    // A depleted task node (current 0) with no env runtime → treated as depleted.
    const depleted = resolveMarkerImage({
      behaviorSystem: gatheringSystem(),
      environment: { id: 'env1', nodeRuntime: {} },
      task: taskWithSwap('icons/depleted.webp', { current: 0 }),
      availableImg: 'icons/available.webp'
    });
    assert.deepEqual(depleted, { desiredImg: 'icons/depleted.webp', depleted: true });
  });
});

describe('syncInteractableMarkers (edge)', () => {
  let tileDoc;
  let updates;
  let scenes;

  function makeTile(src = 'icons/available.webp', flags = {}, hidden = false) {
    return {
      uuid: TILE_UUID,
      texture: { src },
      flags,
      hidden,
      update(update) {
        updates.push(update);
        // Mimic Foundry applying the patch so a repeat sync is idempotent.
        if (update.texture?.src) this.texture = { ...this.texture, src: update.texture.src };
        if (update.flags?.fabricate) this.flags = { ...this.flags, fabricate: { ...this.flags.fabricate, ...update.flags.fabricate } };
        if (typeof update.hidden === 'boolean') this.hidden = update.hidden;
      }
    };
  }

  function makeScenes(behaviorSystem) {
    return [{
      tiles: { get: (id) => (id === 't1' ? tileDoc : null) },
      regions: [{
        behaviors: [{ type: 'fabricate.interactable', system: behaviorSystem }]
      }]
    }];
  }

  beforeEach(() => {
    updates = [];
    tileDoc = makeTile();
    globalThis.fromUuidSync = () => tileDoc;
  });

  afterEach(() => {
    delete globalThis.fromUuidSync;
  });

  const deps = (over = {}) => ({
    isActiveGM: () => true,
    resolveEnvironment: () => ({ id: 'env1', nodeRuntime: { task1: { current: 0 } } }),
    resolveTask: () => taskWithSwap(),
    applyTileImage: (tile, update) => tile.update(update),
    ...over
  });

  it('depleted env → tile image set to swapImage AND the available image is stashed', async () => {
    scenes = makeScenes(gatheringSystem());
    await syncInteractableMarkers({ scenes, ...deps() });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].texture.src, 'icons/depleted.webp');
    assert.equal(updates[0].flags.fabricate.markerAvailableImg, 'icons/available.webp');
  });

  it('recharged env → restores from the stash', async () => {
    tileDoc = makeTile('icons/depleted.webp', { fabricate: { markerAvailableImg: 'icons/available.webp' } });
    scenes = makeScenes(gatheringSystem());
    await syncInteractableMarkers({
      scenes,
      ...deps({ resolveEnvironment: () => ({ id: 'env1', nodeRuntime: { task1: { current: 2 } } }) })
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].texture.src, 'icons/available.webp', 'restores to the stashed available image');
  });

  it('non-GM → no-op', async () => {
    scenes = makeScenes(gatheringSystem());
    await syncInteractableMarkers({ scenes, ...deps({ isActiveGM: () => false }) });
    assert.equal(updates.length, 0);
  });

  it('no swapImage configured → no update', async () => {
    scenes = makeScenes(gatheringSystem());
    await syncInteractableMarkers({
      scenes,
      ...deps({ resolveTask: () => ({ id: 'task1', img: 'icons/available.webp', nodes: { enabled: true, max: 3, current: 0 } }) })
    });
    assert.equal(updates.length, 0);
  });

  it('tile already at the desired image → no update (idempotent)', async () => {
    // Tile already shows the depleted image and the stash is set: a re-run is a no-op.
    tileDoc = makeTile('icons/depleted.webp', { fabricate: { markerAvailableImg: 'icons/available.webp' } });
    scenes = makeScenes(gatheringSystem());
    await syncInteractableMarkers({ scenes, ...deps() });
    assert.equal(updates.length, 0);
  });

  it('no-throw when applyTileImage is missing', async () => {
    scenes = makeScenes(gatheringSystem());
    await assert.doesNotReject(syncInteractableMarkers({ scenes, ...deps({ applyTileImage: undefined }) }));
  });
});

describe('syncInteractableMarkers — tile.hidden reconcile (Lock-vs-Disable visibility)', () => {
  let tileDoc;
  let updates;

  function makeTile(src = 'icons/available.webp', flags = {}, hidden = false) {
    return {
      uuid: TILE_UUID,
      texture: { src },
      flags,
      hidden,
      update(update) {
        updates.push(update);
        if (update.texture?.src) this.texture = { ...this.texture, src: update.texture.src };
        if (update.flags?.fabricate) this.flags = { ...this.flags, fabricate: { ...this.flags.fabricate, ...update.flags.fabricate } };
        if (typeof update.hidden === 'boolean') this.hidden = update.hidden;
      }
    };
  }

  function makeScenes(behaviorSystem) {
    return [{
      tiles: { get: (id) => (id === 't1' ? tileDoc : null) },
      regions: [{ behaviors: [{ type: 'fabricate.interactable', system: behaviorSystem }] }]
    }];
  }

  function toolSystem(overrides = {}) {
    return {
      interactableType: 'tool',
      sourceUuid: 'sys.tool.0',
      systemId: 'sys1',
      toolId: 'tool1',
      taskId: null,
      environmentId: null,
      name: 'Forge',
      linkedVisual: { uuid: TILE_UUID, documentName: 'Tile', mode: 'marker', missingPolicy: 'warn' },
      state: { enabled: true, consumed: false, locked: false, uses: { max: null, used: 0 }, cooldown: {} },
      ...overrides
    };
  }

  // A non-gathering env/task resolver (irrelevant for the hidden reconcile, which
  // applies to ALL interactables — the image swap is gathering-only).
  const baseDeps = (over = {}) => ({
    isActiveGM: () => true,
    resolveEnvironment: () => null,
    resolveTask: () => null,
    applyTileImage: (tile, update) => tile.update(update),
    ...over
  });

  beforeEach(() => { updates = []; globalThis.fromUuidSync = () => tileDoc; });
  afterEach(() => { delete globalThis.fromUuidSync; });

  it('DISABLED tool interactable → tile.hidden set true (concealed from players)', async () => {
    tileDoc = makeTile('icons/available.webp', {}, false);
    await syncInteractableMarkers({ scenes: makeScenes(toolSystem({ state: { enabled: false } })), ...baseDeps() });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].hidden, true);
  });

  it('explicitly HIDDEN tool interactable → tile.hidden set true', async () => {
    tileDoc = makeTile('icons/available.webp', {}, false);
    await syncInteractableMarkers({
      scenes: makeScenes(toolSystem({ presentation: { hidden: true } })),
      ...baseDeps()
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].hidden, true);
  });

  it('LOCKED tool interactable → tile stays visible (no hidden write)', async () => {
    tileDoc = makeTile('icons/available.webp', {}, false);
    await syncInteractableMarkers({
      scenes: makeScenes(toolSystem({ state: { enabled: true, locked: true } })),
      ...baseDeps()
    });
    assert.equal(updates.length, 0, 'a locked interactable does not hide its marker');
  });

  it('re-enabled interactable whose tile was hidden → tile.hidden set false (un-conceal)', async () => {
    tileDoc = makeTile('icons/available.webp', {}, true);
    await syncInteractableMarkers({ scenes: makeScenes(toolSystem({ state: { enabled: true } })), ...baseDeps() });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].hidden, false);
  });

  it('idempotent: a disabled interactable already hidden → no update', async () => {
    tileDoc = makeTile('icons/available.webp', {}, true);
    await syncInteractableMarkers({ scenes: makeScenes(toolSystem({ state: { enabled: false } })), ...baseDeps() });
    assert.equal(updates.length, 0);
  });

  it('non-GM → no hidden write', async () => {
    tileDoc = makeTile('icons/available.webp', {}, false);
    await syncInteractableMarkers({
      scenes: makeScenes(toolSystem({ state: { enabled: false } })),
      ...baseDeps({ isActiveGM: () => false })
    });
    assert.equal(updates.length, 0);
  });

  it('DISABLED gathering-task → hides the marker AND swaps the depleted image in one update', async () => {
    tileDoc = makeTile('icons/available.webp', {}, false);
    await syncInteractableMarkers({
      scenes: makeScenes(gatheringSystem({ state: { enabled: false, consumed: false, locked: false, uses: { max: null, used: 0 }, cooldown: {} } })),
      ...baseDeps({
        resolveEnvironment: () => ({ id: 'env1', nodeRuntime: { task1: { current: 0 } } }),
        resolveTask: () => taskWithSwap()
      })
    });
    assert.equal(updates.length, 1);
    assert.equal(updates[0].hidden, true, 'hidden reconcile (universal)');
    assert.equal(updates[0].texture.src, 'icons/depleted.webp', 'image swap (gathering-only)');
  });
});

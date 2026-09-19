/**
 * `interactableSpawner` under a throwing `globalThis` trap: environment precedence, the spawn
 * request, and the transaction-like Region plus linked Tile write, all through injected functions.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildRegionSpawnRequest,
  spawnGatheringTask,
  spawnInteractableRegion,
} from '../../src/canvas/interactableSpawner.js';
import { underFoundryGlobalTrap } from '../helpers/foundryGlobalTrap.js';
import {
  taskClassification as taskDrop,
  toolClassification as toolDrop,
} from '../helpers/interactableFixtures.js';

function sealed(name, body) {
  test(name, () => underFoundryGlobalTrap('interactableSpawner', body));
}

const FOREST = Object.freeze({ id: 'env-forest', name: 'Forest' });
const CAVE = Object.freeze({ id: 'env-cave', name: 'Cave' });

function collaborators(overrides = {}) {
  const calls = {
    regions: [],
    tiles: [],
    deleted: [],
    updates: [],
    infos: [],
    failures: 0,
    dialogs: [],
    hitTests: [],
    spawned: [],
    scenes: 0,
  };
  const scene = { id: 'scene-1', createEmbeddedDocuments: () => [] };
  const deps = {
    scene: () => {
      calls.scenes += 1;
      return scene;
    },
    createRegion: (target, data) => {
      calls.regions.push({ target, data });
      return [{ id: 'region-1', uuid: 'Scene.scene-1.Region.region-1', ...data }];
    },
    createTile: (target, data) => {
      calls.tiles.push({ target, data });
      return { id: 'tile-1', uuid: 'Scene.scene-1.Tile.tile-1', ...data };
    },
    deleteRegion: (regionDoc) => calls.deleted.push(regionDoc?.id ?? null),
    updateBehavior: (behavior, update) => calls.updates.push({ behavior, update }),
    gridSize: () => 100,
    iconTexture: () => 'icons/tools/axe.webp',
    buildRegionSpawnRequest: (args) => buildRegionSpawnRequest(args, deps),
    resolutionDeps: () => ({ getTask: () => ({ id: 'task-9', defaultEnvironmentId: null }) }),
    listEnvironments: () => [],
    regionEnvironmentIdsAtPoint: (args) => {
      calls.hitTests.push(args);
      return [];
    },
    promptDropEnvironment: (args) => {
      calls.dialogs.push(args);
      return null;
    },
    notifySpawnFailure: () => {
      calls.failures += 1;
    },
    notifyInfo: (message) => calls.infos.push(message),
    localize: (key) => key,
    formatMessage: (key) => key,
    spawnInteractableRegion: (request) => {
      calls.spawned.push(request);
      return { id: 'region-1' };
    },
    ...overrides,
  };
  return { deps, calls, scene };
}

/** A region document whose nested behaviour is the one the linked-visual ref is written onto. */
function regionWithBehavior(calls) {
  return (target, data) => {
    calls.regions.push({ target, data });
    const behavior = { id: 'beh-1', type: 'fabricate.interactable', update: () => {} };
    return [
      {
        id: 'region-1',
        uuid: 'Scene.scene-1.Region.region-1',
        ...data,
        behaviors: { contents: [behavior] },
        delete: () => {},
      },
    ];
  };
}

sealed('the spawn request carries the resolved texture and one grid square', () => {
  const { deps } = collaborators();

  const request = buildRegionSpawnRequest({ classification: toolDrop(), point: { x: 150, y: 250 } }, deps);

  assert.equal(request.tile.texture.src, 'icons/tools/axe.webp');
  assert.equal(request.tile.width, 100);
  assert.equal(request.tile.height, 100);
  assert.equal(request.tile.x, 150);
  assert.equal(request.tile.y, 250);
  assert.equal(request.behaviorSystem.interactableType, 'tool');
  assert.equal(request.behaviorSystem.sourceUuid, 'Fabricate.sysA.tool.tool-1');
  assert.equal(request.region.shape.type, 'rectangle');

  const regionOnly = buildRegionSpawnRequest(
    { classification: toolDrop(), point: { x: 1, y: 2 }, visualMode: 'none' },
    deps
  );
  assert.equal(regionOnly.tile, null);
  assert.equal(regionOnly.behaviorSystem.linkedVisual.mode, 'none');
  assert.equal(buildRegionSpawnRequest({ point: { x: 0, y: 0 } }, deps), null);
});

sealed('an environmentId only reaches a gathering task', () => {
  const { deps } = collaborators();
  const task = buildRegionSpawnRequest(
    { classification: taskDrop(), point: { x: 0, y: 0 }, environmentId: 'env-forest' },
    deps
  );
  assert.equal(task.behaviorSystem.environmentId, 'env-forest');

  const tool = buildRegionSpawnRequest(
    { classification: toolDrop(), point: { x: 0, y: 0 }, environmentId: 'env-forest' },
    deps
  );
  assert.equal(tool.behaviorSystem.environmentId, null);
});

sealed('an unambiguous region hit wins the environment and says so', async () => {
  const { deps, calls } = collaborators({
    listEnvironments: () => [FOREST, CAVE],
    regionEnvironmentIdsAtPoint: (args) => {
      calls.hitTests.push(args);
      return ['env-cave'];
    },
    promptDropEnvironment: () => {
      throw new Error('the dialog must not open on a single region hit');
    },
  });

  await spawnGatheringTask({ classification: taskDrop(), point: { x: 5, y: 6 } }, deps);

  assert.equal(calls.spawned.length, 1);
  assert.equal(calls.spawned[0].behaviorSystem.environmentId, 'env-cave');
  assert.deepEqual(calls.infos, ['FABRICATE.Canvas.Interactable.EnvironmentAutoResolved']);
  assert.deepEqual(calls.hitTests[0].point, { x: 5, y: 6 });
});

sealed('the task default wins with no region hit, and announces nothing', async () => {
  const { deps, calls } = collaborators({
    listEnvironments: () => [FOREST, CAVE],
    resolutionDeps: () => ({ getTask: () => ({ id: 'task-9', defaultEnvironmentId: 'env-forest' }) }),
    promptDropEnvironment: () => {
      throw new Error('the dialog must not open when the task default resolves');
    },
  });

  await spawnGatheringTask({ classification: taskDrop(), point: { x: 1, y: 2 } }, deps);

  assert.equal(calls.spawned[0].behaviorSystem.environmentId, 'env-forest');
  assert.deepEqual(calls.infos, []);
});

sealed('a forced dialog offers this system’s environments and its answer reaches the spawn', async () => {
  const { deps, calls } = collaborators({
    listEnvironments: () => [FOREST, CAVE],
    promptDropEnvironment: (args) => {
      calls.dialogs.push(args);
      return 'env-cave';
    },
  });

  await spawnGatheringTask(
    { classification: taskDrop(), point: { x: 1, y: 2 }, forceDialog: true },
    deps
  );

  assert.deepEqual(calls.dialogs[0].environments, [FOREST, CAVE]);
  assert.equal(calls.dialogs[0].localize('a.key', 'fallback'), 'a.key');
  assert.equal(calls.spawned[0].behaviorSystem.environmentId, 'env-cave');
});

sealed('a cancelled dialog aborts the spawn, and a stale default falls through to it', async () => {
  const { deps, calls } = collaborators({ listEnvironments: () => [FOREST] });

  const result = await spawnGatheringTask(
    { classification: taskDrop(), point: { x: 1, y: 2 }, forceDialog: true },
    deps
  );

  assert.equal(result, null);
  assert.equal(calls.spawned.length, 0);

  const stale = collaborators({
    listEnvironments: () => [FOREST],
    resolutionDeps: () => ({ getTask: () => ({ id: 'task-9', defaultEnvironmentId: 'env-gone' }) }),
  });
  assert.equal(
    await spawnGatheringTask({ classification: taskDrop(), point: { x: 1, y: 2 } }, stale.deps),
    null
  );
  assert.equal(stale.calls.dialogs.length, 1, 'an environment that no longer exists opens the dialog');
});

sealed('the scene is resolved per site, so a change while the dialog was open is honoured', async () => {
  const before = { id: 'scene-before', createEmbeddedDocuments: () => [] };
  const after = { id: 'scene-after', createEmbeddedDocuments: () => [] };
  const { deps, calls } = collaborators({
    listEnvironments: () => [FOREST],
    promptDropEnvironment: () => 'env-forest',
    scene: () => {
      calls.scenes += 1;
      return calls.scenes === 1 ? before : after;
    },
  });
  deps.createRegion = regionWithBehavior(calls);
  deps.spawnInteractableRegion = (request) => spawnInteractableRegion(request, deps);

  await spawnGatheringTask(
    { classification: taskDrop(), point: { x: 1, y: 2 }, forceDialog: true },
    deps
  );

  assert.equal(calls.hitTests[0].scene, before, 'the hit-test ran against the scene at drop time');
  assert.equal(calls.regions[0].target, after, 'the spawn ran against the scene after the dialog');
});

sealed('a spawn writes the Region, the linked Tile and the ref back', async () => {
  const { deps, calls, scene } = collaborators();
  deps.createRegion = regionWithBehavior(calls);

  const request = buildRegionSpawnRequest({ classification: toolDrop(), point: { x: 150, y: 250 } }, deps);
  const regionDoc = await spawnInteractableRegion(request, deps);

  assert.equal(regionDoc.id, 'region-1');
  assert.equal(calls.regions[0].target, scene);
  assert.deepEqual(calls.regions[0].data.shapes, [
    { type: 'rectangle', x: 100, y: 200, width: 100, height: 100 },
  ]);
  assert.equal(calls.regions[0].data.behaviors[0].type, 'fabricate.interactable');
  assert.equal(calls.regions[0].data.flags.fabricate.interactableRegion, true);

  assert.equal(calls.tiles[0].target, scene);
  assert.equal(calls.tiles[0].data.texture.src, 'icons/tools/axe.webp');
  assert.deepEqual(
    {
      x: calls.tiles[0].data.x,
      y: calls.tiles[0].data.y,
      width: calls.tiles[0].data.width,
      height: calls.tiles[0].data.height,
    },
    { x: 150, y: 250, width: 100, height: 100 }
  );
  assert.equal(calls.tiles[0].data.flags.fabricate.isInteractableVisual, true);
  assert.equal(
    calls.tiles[0].data.flags.fabricate.linkedRegionUuid,
    'Scene.scene-1.Region.region-1'
  );
  assert.equal(calls.tiles[0].data.flags.fabricate.linkedBehaviorId, 'beh-1');

  assert.equal(calls.updates.length, 1);
  assert.deepEqual(calls.updates[0].update, {
    system: { linkedVisual: { uuid: 'Scene.scene-1.Tile.tile-1', documentName: 'Tile' } },
  });
  assert.equal(calls.deleted.length, 0);
  assert.equal(calls.failures, 0);
});

sealed('a region-only spawn creates no Tile and writes no ref back', async () => {
  const { deps, calls } = collaborators();
  deps.createRegion = regionWithBehavior(calls);

  const regionDoc = await spawnInteractableRegion(
    buildRegionSpawnRequest(
      { classification: toolDrop(), point: { x: 150, y: 250 }, visualMode: 'none' },
      deps
    ),
    deps
  );

  assert.equal(regionDoc.id, 'region-1');
  assert.equal(calls.tiles.length, 0);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.failures, 0);
});

sealed('a failed Tile rolls the orphan Region back and reports the failure', async () => {
  const { deps, calls } = collaborators({
    createTile: () => {
      throw new Error('tile create failed');
    },
  });
  deps.createRegion = regionWithBehavior(calls);

  const result = await spawnInteractableRegion(
    buildRegionSpawnRequest({ classification: toolDrop(), point: { x: 0, y: 0 } }, deps),
    deps
  );

  assert.equal(result, null);
  assert.deepEqual(calls.deleted, ['region-1']);
  assert.equal(calls.failures, 1);
  assert.equal(calls.updates.length, 0);

  const stubborn = collaborators({
    createTile: () => null,
    deleteRegion: () => {
      throw new Error('delete exploded');
    },
  });
  stubborn.deps.createRegion = regionWithBehavior(stubborn.calls);
  assert.equal(
    await spawnInteractableRegion(
      buildRegionSpawnRequest({ classification: toolDrop(), point: { x: 0, y: 0 } }, stubborn.deps),
      stubborn.deps
    ),
    null,
    'a rollback that itself fails is tolerated'
  );
  assert.equal(stubborn.calls.failures, 1);
});

sealed('a failed Region aborts before any Tile is attempted', async () => {
  const { deps, calls } = collaborators({
    createRegion: () => {
      throw new Error('region create failed');
    },
  });

  const thrown = await spawnInteractableRegion(
    buildRegionSpawnRequest({ classification: toolDrop(), point: { x: 0, y: 0 } }, deps),
    deps
  );
  assert.equal(thrown, null);
  assert.equal(calls.tiles.length, 0);
  assert.equal(calls.failures, 1);

  const empty = collaborators({ createRegion: () => [] });
  assert.equal(
    await spawnInteractableRegion(
      buildRegionSpawnRequest({ classification: toolDrop(), point: { x: 0, y: 0 } }, empty.deps),
      empty.deps
    ),
    null,
    'an empty create result is a failure too'
  );
  assert.equal(empty.calls.failures, 1);
});

sealed('a null request and a scene that cannot create documents both no-op silently', async () => {
  const { deps, calls } = collaborators();
  assert.equal(await spawnInteractableRegion(null, deps), null);

  const bare = collaborators({ scene: () => ({ id: 'scene-1' }) });
  assert.equal(
    await spawnInteractableRegion(
      buildRegionSpawnRequest({ classification: toolDrop(), point: { x: 0, y: 0 } }, bare.deps),
      bare.deps
    ),
    null
  );
  assert.equal(calls.failures + bare.calls.failures, 0, 'neither case is a spawn failure');
});

sealed('a region whose behaviour cannot be identified rolls back rather than orphaning a Tile', async () => {
  const { deps, calls } = collaborators({
    createRegion: (target, data) => {
      calls.regions.push({ target, data });
      return [{ id: 'region-1', uuid: null, behaviors: { contents: [] } }];
    },
  });

  const result = await spawnInteractableRegion(
    buildRegionSpawnRequest({ classification: toolDrop(), point: { x: 0, y: 0 } }, deps),
    deps
  );

  assert.equal(result, null);
  assert.equal(calls.tiles.length, 0);
  assert.deepEqual(calls.deleted, ['region-1']);
  assert.equal(calls.failures, 1);
});

sealed('a failed ref write-back keeps the working interactable', async () => {
  const { deps, calls } = collaborators({
    updateBehavior: () => {
      throw new Error('update exploded');
    },
  });
  deps.createRegion = regionWithBehavior(calls);

  const regionDoc = await spawnInteractableRegion(
    buildRegionSpawnRequest({ classification: toolDrop(), point: { x: 0, y: 0 } }, deps),
    deps
  );

  assert.equal(regionDoc.id, 'region-1');
  assert.equal(calls.deleted.length, 0);
  assert.equal(calls.failures, 0);

  const untouchable = collaborators({ createTile: () => ({ id: 'tile-1', uuid: null }) });
  untouchable.deps.createRegion = regionWithBehavior(untouchable.calls);
  await spawnInteractableRegion(
    buildRegionSpawnRequest({ classification: toolDrop(), point: { x: 0, y: 0 } }, untouchable.deps),
    untouchable.deps
  );
  assert.equal(untouchable.calls.updates.length, 0, 'a tile with no uuid writes no ref back');
});

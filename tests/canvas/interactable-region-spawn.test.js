/**
 * Unit coverage for the PURE `buildRegionSpawnRequest` (region-first model).
 *
 * It shapes the data the manager needs to create (a) a Scene Region (a small
 * rectangle centered on the drop point), (b) the nested `fabricate.interactable`
 * behaviour `system` (via the injected builder — the real
 * `buildInteractableBehaviorSystem`), and (c) the linked Tile data. No Foundry
 * globals: the behaviour-system builder + texture + grid size are injected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildRegionSpawnRequest } from '../../src/canvas/interactableResolution.js';
import { buildInteractableBehaviorSystem } from '../../src/canvas/regions/interactableRegionFlags.js';

const builder = (spawn) => buildInteractableBehaviorSystem(spawn);

function toolClassification() {
  return {
    interactableType: 'tool',
    systemId: 'sysA',
    referenceId: 'tool-1',
    sourceUuid: 'Fabricate.sysA.tool.tool-1',
    entry: { id: 'tool-1', label: 'Forge Anvil' }
  };
}

function taskClassification() {
  return {
    interactableType: 'gatheringTask',
    systemId: 'sysA',
    referenceId: 'task-9',
    sourceUuid: 'Fabricate.sysA.gatheringTask.task-9',
    entry: { id: 'task-9', name: 'Chop Wood' }
  };
}

test('buildRegionSpawnRequest returns null for no classification', () => {
  assert.equal(buildRegionSpawnRequest({ classification: null, buildBehaviorSystem: builder }), null);
});

test('buildRegionSpawnRequest throws without a behaviour-system builder', () => {
  assert.throws(() => buildRegionSpawnRequest({ classification: toolClassification() }), /buildBehaviorSystem/);
});

test('buildRegionSpawnRequest (tool) shapes region geometry + behaviour system + linked tile data', () => {
  const request = buildRegionSpawnRequest({
    classification: toolClassification(),
    point: { x: 150, y: 250 },
    texture: 'icons/tools/axe.webp',
    width: 100,
    height: 100,
    gridSize: 100,
    buildBehaviorSystem: builder
  });

  assert.equal(request.interactableType, 'tool');
  assert.equal(request.sourceUuid, 'Fabricate.sysA.tool.tool-1');
  assert.equal(request.name, 'Forge Anvil');
  assert.equal(request.environmentId, null, 'tools carry no environment');

  // Region shape: a 1-grid-square rectangle whose TOP-LEFT is anchored at
  // `center - size/2`, so the rectangle is CENTERED on the drop point. (A Region
  // rectangle renders top-left at its stored x/y; a Tile renders centered on its
  // x/y — so the two store different x/y but their CENTERS both land on the drop.)
  assert.equal(request.region.shape.type, 'rectangle');
  assert.equal(request.region.shape.width, 100);
  assert.equal(request.region.shape.height, 100);
  // center (150,250) - half(50,50) = (100,200) — the rect's top-left.
  assert.equal(request.region.shape.x, 100);
  assert.equal(request.region.shape.y, 200);
  assert.equal(request.region.name, 'Forge Anvil');

  // Behaviour system: built by the injected builder; tool-shaped.
  assert.equal(request.behaviorSystem.interactableType, 'tool');
  assert.equal(request.behaviorSystem.toolId, 'tool-1');
  assert.equal(request.behaviorSystem.taskId, null);
  assert.equal(request.behaviorSystem.activation.trigger, 'regionEnter');

  // Linked tile: Foundry renders tiles CENTERED on x/y, so the stored x/y IS the
  // drop point (the tile's center). NOT `cx - w/2`.
  assert.deepEqual(request.tile.texture, { src: 'icons/tools/axe.webp' });
  assert.equal(request.tile.width, 100);
  assert.equal(request.tile.height, 100);
  assert.equal(request.tile.x, 150); // tile center == drop point x
  assert.equal(request.tile.y, 250); // tile center == drop point y

  // The tile's CENTER and the region's CENTER coincide on the drop point: the
  // region top-left + half-size == the tile's stored x/y.
  assert.equal(request.region.shape.x + request.region.shape.width / 2, request.tile.x);
  assert.equal(request.region.shape.y + request.region.shape.height / 2, request.tile.y);
});

test('buildRegionSpawnRequest (gatheringTask) carries environmentId into the behaviour system (environment-scoped node by default)', () => {
  const request = buildRegionSpawnRequest({
    classification: taskClassification(),
    point: { x: 0, y: 0 },
    environmentId: 'env-1',
    gridSize: 100,
    buildBehaviorSystem: builder
  });

  assert.equal(request.interactableType, 'gatheringTask');
  assert.equal(request.environmentId, 'env-1');
  assert.equal(request.name, 'Chop Wood');
  assert.equal(request.behaviorSystem.interactableType, 'gatheringTask');
  assert.equal(request.behaviorSystem.taskId, 'task-9');
  assert.equal(request.behaviorSystem.toolId, null);
  assert.equal(request.behaviorSystem.environmentId, 'env-1');
  // Default linked: no independent node is seeded on the behaviour.
  assert.equal(request.behaviorSystem.taskNodeLink, 'linked');
  assert.equal(request.behaviorSystem.node, null, 'no independent node is seeded by default');

  // The gathering-task tile center and region center both land on the drop point.
  assert.equal(request.tile.x, 0); // tile center == drop point x
  assert.equal(request.tile.y, 0); // tile center == drop point y
  assert.equal(request.region.shape.x + request.region.shape.width / 2, request.tile.x);
  assert.equal(request.region.shape.y + request.region.shape.height / 2, request.tile.y);
  assert.equal(request.region.shape.width, request.tile.width);
  assert.equal(request.region.shape.height, request.tile.height);
});

test('buildRegionSpawnRequest centers BOTH the tile and the region on an off-grid drop point', () => {
  // An off-grid drop must still center the marker AND the region on the cursor —
  // the region top-left is NOT independently grid-snapped, and the tile stores the
  // raw drop point as its center.
  const request = buildRegionSpawnRequest({
    classification: toolClassification(),
    point: { x: 137, y: 213 },
    width: 100,
    height: 100,
    gridSize: 100,
    buildBehaviorSystem: builder
  });
  // Tile center == raw drop point.
  assert.equal(request.tile.x, 137);
  assert.equal(request.tile.y, 213);
  // Region rect top-left == drop point - half size; its center == the drop point.
  assert.equal(request.region.shape.x, 87); // 137 - 50
  assert.equal(request.region.shape.y, 163); // 213 - 50
  assert.equal(request.region.shape.x + request.region.shape.width / 2, request.tile.x);
  assert.equal(request.region.shape.y + request.region.shape.height / 2, request.tile.y);
  assert.equal(request.region.shape.width, request.tile.width);
  assert.equal(request.region.shape.height, request.tile.height);
});

test('buildRegionSpawnRequest defaults the tile texture + dimensions', () => {
  const request = buildRegionSpawnRequest({
    classification: toolClassification(),
    point: { x: 0, y: 0 },
    buildBehaviorSystem: builder
  });
  assert.equal(request.tile.texture.src, 'icons/svg/item-bag.svg');
  assert.equal(request.tile.width, 100);
  assert.equal(request.tile.height, 100);
});

test('buildRegionSpawnRequest (visualMode none) → hidden + linkedVisual.mode none + tile null', () => {
  const request = buildRegionSpawnRequest({
    classification: toolClassification(),
    point: { x: 150, y: 250 },
    gridSize: 100,
    visualMode: 'none',
    buildBehaviorSystem: builder
  });

  // Region + behaviour are still built; only the marker is suppressed.
  assert.equal(request.interactableType, 'tool');
  assert.equal(request.behaviorSystem.interactableType, 'tool');
  assert.equal(request.region.shape.type, 'rectangle');

  // Region-only: hidden, no linked visual.
  assert.equal(request.behaviorSystem.presentation.hidden, true, 'hidden from players');
  assert.equal(request.behaviorSystem.linkedVisual.mode, 'none', 'mode is none (intentional, not missing)');
  assert.equal(request.behaviorSystem.linkedVisual.uuid, null);
  assert.equal(request.behaviorSystem.linkedVisual.documentName, null);

  // No Tile to create.
  assert.equal(request.tile, null, 'tile is null for the no-marker variant');
});

test('buildRegionSpawnRequest (visualMode none) for a gathering task keeps the env (environment-scoped node by default)', () => {
  const request = buildRegionSpawnRequest({
    classification: taskClassification(),
    point: { x: 0, y: 0 },
    environmentId: 'env-1',
    visualMode: 'none',
    gridSize: 100,
    buildBehaviorSystem: builder
  });
  assert.equal(request.tile, null);
  assert.equal(request.behaviorSystem.presentation.hidden, true);
  assert.equal(request.behaviorSystem.linkedVisual.mode, 'none');
  assert.equal(request.behaviorSystem.environmentId, 'env-1', 'env still resolved');
  assert.equal(request.behaviorSystem.taskNodeLink, 'linked');
  assert.equal(request.behaviorSystem.node, null, 'no independent node is seeded by default');
});

test('buildRegionSpawnRequest defaults to the with-marker path (mode marker, tile present)', () => {
  const request = buildRegionSpawnRequest({
    classification: toolClassification(),
    point: { x: 0, y: 0 },
    buildBehaviorSystem: builder
  });
  assert.equal(request.behaviorSystem.linkedVisual.mode, 'marker');
  assert.equal(request.behaviorSystem.presentation.hidden, false);
  assert.ok(request.tile, 'the default with-marker path still shapes the tile data');
});

test('buildRegionSpawnRequest honors a multi-square regionGrid', () => {
  const request = buildRegionSpawnRequest({
    classification: toolClassification(),
    point: { x: 200, y: 200 },
    gridSize: 100,
    regionGrid: 2,
    buildBehaviorSystem: builder
  });
  assert.equal(request.region.shape.width, 200);
  assert.equal(request.region.shape.height, 200);
  // center (200,200) - half(100,100) = (100,100), snapped.
  assert.equal(request.region.shape.x, 100);
  assert.equal(request.region.shape.y, 100);
});

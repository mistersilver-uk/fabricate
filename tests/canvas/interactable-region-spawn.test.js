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

  // Region: a 1-grid-square rectangle centered on (150,250), grid-snapped.
  assert.equal(request.region.shape.type, 'rectangle');
  assert.equal(request.region.shape.width, 100);
  assert.equal(request.region.shape.height, 100);
  // center (150,250) - half(50,50) = (100,200), snapped to the 100 grid.
  assert.equal(request.region.shape.x, 100);
  assert.equal(request.region.shape.y, 200);
  assert.equal(request.region.name, 'Forge Anvil');

  // Behaviour system: built by the injected builder; tool-shaped.
  assert.equal(request.behaviorSystem.interactableType, 'tool');
  assert.equal(request.behaviorSystem.toolId, 'tool-1');
  assert.equal(request.behaviorSystem.taskId, null);
  assert.equal(request.behaviorSystem.activation.trigger, 'regionEnter');

  // Linked tile: top-left-anchored so its center sits at the drop point.
  assert.deepEqual(request.tile.texture, { src: 'icons/tools/axe.webp' });
  assert.equal(request.tile.width, 100);
  assert.equal(request.tile.height, 100);
  assert.equal(request.tile.x, 100); // 150 - 50
  assert.equal(request.tile.y, 200); // 250 - 50
});

test('buildRegionSpawnRequest (gatheringTask) carries environmentId + node into the behaviour system', () => {
  const node = { enabled: true, max: 3, current: 3, respawn: { policy: 'manual' } };
  const request = buildRegionSpawnRequest({
    classification: taskClassification(),
    point: { x: 0, y: 0 },
    environmentId: 'env-1',
    node,
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
  assert.deepEqual(request.behaviorSystem.node, node, 'the node snapshot is threaded into the behaviour system');
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

test('buildRegionSpawnRequest (visualMode none) for a gathering task keeps the node + env', () => {
  const node = { enabled: true, max: 3, current: 3, respawn: { policy: 'manual' } };
  const request = buildRegionSpawnRequest({
    classification: taskClassification(),
    point: { x: 0, y: 0 },
    environmentId: 'env-1',
    node,
    visualMode: 'none',
    gridSize: 100,
    buildBehaviorSystem: builder
  });
  assert.equal(request.tile, null);
  assert.equal(request.behaviorSystem.presentation.hidden, true);
  assert.equal(request.behaviorSystem.linkedVisual.mode, 'none');
  assert.equal(request.behaviorSystem.environmentId, 'env-1', 'env still resolved');
  assert.deepEqual(request.behaviorSystem.node, node, 'node snapshot still threaded');
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

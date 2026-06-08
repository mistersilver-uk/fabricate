import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInteractableTileFlags,
  readInteractableTileFlags,
  isInteractableTile,
  interactableTypeOf,
  INTERACTABLE_TYPES
} from '../../src/canvas/interactableTileFlags.js';

test('exposes the supported interactable types', () => {
  assert.deepEqual([...INTERACTABLE_TYPES].sort(), ['gatheringTask', 'tool']);
});

test('builds a minimal tool flag block', () => {
  const { fabricate } = buildInteractableTileFlags({
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1'
  });
  assert.deepEqual(fabricate, {
    isInteractable: true,
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1'
  });
});

test('carries the hover-tooltip name for a tool tile when provided', () => {
  const { fabricate } = buildInteractableTileFlags({
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1',
    name: '  Forge Anvil  '
  });
  assert.equal(fabricate.name, 'Forge Anvil');
});

test('tool flags drop environmentId/node (tool has none)', () => {
  const { fabricate } = buildInteractableTileFlags({
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1',
    environmentId: 'env-1',
    node: { current: 3 }
  });
  assert.equal(fabricate.environmentId, undefined);
  assert.equal(fabricate.node, undefined);
});

test('gatheringTask flags carry environmentId + name when provided', () => {
  const { fabricate } = buildInteractableTileFlags({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    name: 'Iron Vein',
    environmentId: '  env-7  '
  });
  assert.equal(fabricate.environmentId, 'env-7');
  assert.equal(fabricate.name, 'Iron Vein');
});

test('gatheringTask round-trips node and nodeOriginal when present', () => {
  const node = { current: 2, max: 5, respawn: { mode: 'interval' } };
  const nodeOriginal = { img: 'rock.png' };
  const { fabricate } = buildInteractableTileFlags({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    node,
    nodeOriginal
  });
  assert.deepEqual(fabricate.node, node);
  assert.deepEqual(fabricate.nodeOriginal, nodeOriginal);
});

test('build rejects unknown type and empty sourceUuid', () => {
  assert.throws(() => buildInteractableTileFlags({ interactableType: 'nope', sourceUuid: 'x' }));
  assert.throws(() => buildInteractableTileFlags({ interactableType: 'tool', sourceUuid: '   ' }));
});

test('build/read round-trip for a gathering task tile', () => {
  const { fabricate } = buildInteractableTileFlags({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    name: 'Iron Vein',
    environmentId: 'env-1',
    node: { current: 4 }
  });
  const tile = { flags: { fabricate } };
  const read = readInteractableTileFlags(tile);
  assert.deepEqual(read, {
    isInteractable: true,
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    name: 'Iron Vein',
    environmentId: 'env-1',
    node: { current: 4 }
  });
});

test('readInteractableTileFlags rejects non-interactable tiles', () => {
  assert.equal(readInteractableTileFlags(null), null);
  assert.equal(readInteractableTileFlags({}), null);
  assert.equal(readInteractableTileFlags({ flags: {} }), null);
  assert.equal(readInteractableTileFlags({ flags: { fabricate: {} } }), null);
  // isInteractable not strictly true
  assert.equal(readInteractableTileFlags({ flags: { fabricate: { isInteractable: 'yes', interactableType: 'tool', sourceUuid: 'x' } } }), null);
  // unknown type
  assert.equal(readInteractableTileFlags({ flags: { fabricate: { isInteractable: true, interactableType: 'mystery', sourceUuid: 'x' } } }), null);
  // missing sourceUuid
  assert.equal(readInteractableTileFlags({ flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: '' } } }), null);
});

test('predicates classify tiles', () => {
  const tool = { flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: 'Fabricate.s.tool.a' } } };
  const task = { flags: { fabricate: { isInteractable: true, interactableType: 'gatheringTask', sourceUuid: 'Fabricate.s.gatheringTask.b' } } };
  const plain = { flags: {} };

  assert.equal(isInteractableTile(tool), true);
  assert.equal(isInteractableTile(task), true);
  assert.equal(isInteractableTile(plain), false);

  assert.equal(interactableTypeOf(tool), 'tool');
  assert.equal(interactableTypeOf(task), 'gatheringTask');
  assert.equal(interactableTypeOf(plain), null);
});

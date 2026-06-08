import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildInteractableFlags,
  readInteractableFlags,
  isInteractableToken,
  interactableTypeOf,
  INTERACTABLE_TYPES
} from '../../src/canvas/interactableTokenFlags.js';

test('exposes the supported interactable types', () => {
  assert.deepEqual([...INTERACTABLE_TYPES].sort(), ['gatheringTask', 'tool']);
});

test('builds a minimal tool flag block', () => {
  const { fabricate } = buildInteractableFlags({
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1'
  });
  assert.deepEqual(fabricate, {
    isInteractable: true,
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1'
  });
});

test('tool flags drop environmentId/node (tool has none)', () => {
  const { fabricate } = buildInteractableFlags({
    interactableType: 'tool',
    sourceUuid: 'Fabricate.sys.tool.t1',
    environmentId: 'env-1',
    node: { current: 3 }
  });
  assert.equal(fabricate.environmentId, undefined);
  assert.equal(fabricate.node, undefined);
});

test('gatheringTask flags carry environmentId when provided', () => {
  const { fabricate } = buildInteractableFlags({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    environmentId: '  env-7  '
  });
  assert.equal(fabricate.environmentId, 'env-7');
});

test('gatheringTask round-trips node and nodeOriginal when present', () => {
  const node = { current: 2, max: 5, respawn: { mode: 'interval' } };
  const nodeOriginal = { img: 'rock.png', name: 'Iron Vein' };
  const { fabricate } = buildInteractableFlags({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    node,
    nodeOriginal
  });
  assert.deepEqual(fabricate.node, node);
  assert.deepEqual(fabricate.nodeOriginal, nodeOriginal);
});

test('build rejects unknown type and empty sourceUuid', () => {
  assert.throws(() => buildInteractableFlags({ interactableType: 'nope', sourceUuid: 'x' }));
  assert.throws(() => buildInteractableFlags({ interactableType: 'tool', sourceUuid: '   ' }));
});

test('build/read round-trip for a gathering task token', () => {
  const { fabricate } = buildInteractableFlags({
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    environmentId: 'env-1',
    node: { current: 4 }
  });
  const token = { flags: { fabricate } };
  const read = readInteractableFlags(token);
  assert.deepEqual(read, {
    isInteractable: true,
    interactableType: 'gatheringTask',
    sourceUuid: 'Fabricate.sys.gatheringTask.task1',
    environmentId: 'env-1',
    node: { current: 4 }
  });
});

test('readInteractableFlags rejects non-interactable tokens', () => {
  assert.equal(readInteractableFlags(null), null);
  assert.equal(readInteractableFlags({}), null);
  assert.equal(readInteractableFlags({ flags: {} }), null);
  assert.equal(readInteractableFlags({ flags: { fabricate: {} } }), null);
  // isInteractable not strictly true
  assert.equal(readInteractableFlags({ flags: { fabricate: { isInteractable: 'yes', interactableType: 'tool', sourceUuid: 'x' } } }), null);
  // unknown type
  assert.equal(readInteractableFlags({ flags: { fabricate: { isInteractable: true, interactableType: 'mystery', sourceUuid: 'x' } } }), null);
  // missing sourceUuid
  assert.equal(readInteractableFlags({ flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: '' } } }), null);
});

test('predicates classify tokens', () => {
  const tool = { flags: { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: 'Fabricate.s.tool.a' } } };
  const task = { flags: { fabricate: { isInteractable: true, interactableType: 'gatheringTask', sourceUuid: 'Fabricate.s.gatheringTask.b' } } };
  const plain = { flags: {} };

  assert.equal(isInteractableToken(tool), true);
  assert.equal(isInteractableToken(task), true);
  assert.equal(isInteractableToken(plain), false);

  assert.equal(interactableTypeOf(tool), 'tool');
  assert.equal(interactableTypeOf(task), 'gatheringTask');
  assert.equal(interactableTypeOf(plain), null);
});

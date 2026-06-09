/**
 * Unit coverage for the behaviour-backed region node-state adapter.
 *
 * Mirrors `tile-node-state-adapter.test.js`: reads are local (off the live
 * behaviour `system.node`), writes emit a `{ system: { node } }` behaviour update
 * via the injected `emitWrite` seam + reflect onto the linked visual, the respawn
 * math is pure via injected seams, and `tileRef()` returns the widened
 * `{ sceneId, regionId, behaviorId }` payload. No live Foundry runtime.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createRegionNodeStateAdapter,
  readRegionBehaviorNode,
  identifyRegionBehaviorRef,
  buildInteractableNodeSnapshot
} from '../../src/canvas/regions/interactableRegionNodeAdapter.js';

function fakeBehavior({ node, sceneId = 's1', regionId = 'r1', behaviorId = 'b1', interactableType = 'gatheringTask' } = {}) {
  return {
    id: behaviorId,
    type: 'fabricate.interactable',
    parent: { id: regionId, parent: { id: sceneId } },
    system: { interactableType, node }
  };
}

const NODE = {
  enabled: true,
  max: 3,
  current: 2,
  depletionTiming: 'onStart',
  respawn: { policy: 'manual' }
};

// --- snapshot (relocated from the per-tile adapter) -------------------------

test('buildInteractableNodeSnapshot seeds a freshly-placed node full (current = max)', () => {
  const snapshot = buildInteractableNodeSnapshot({ nodes: { enabled: true, max: 5 } });
  assert.equal(snapshot.max, 5);
  assert.equal(snapshot.current, 5, 'a fresh node starts full');
});

test('buildInteractableNodeSnapshot preserves an explicit current count from the source', () => {
  const snapshot = buildInteractableNodeSnapshot({ nodes: { enabled: true, max: 5, current: 2 } });
  assert.equal(snapshot.current, 2);
});

test('buildInteractableNodeSnapshot returns null for a task with no node config (unlimited node)', () => {
  assert.equal(buildInteractableNodeSnapshot({ nodes: null }), null);
  assert.equal(buildInteractableNodeSnapshot({}), null);
  assert.equal(buildInteractableNodeSnapshot(null), null);
});

test('readRegionBehaviorNode normalizes the behaviour system node, null when absent', () => {
  assert.deepEqual(readRegionBehaviorNode(fakeBehavior({ node: NODE }))?.current, 2);
  assert.equal(readRegionBehaviorNode(fakeBehavior({ node: null })), null);
  assert.equal(readRegionBehaviorNode({}), null);
});

test('identifyRegionBehaviorRef resolves scene + region + behaviour ids', () => {
  assert.deepEqual(identifyRegionBehaviorRef(fakeBehavior()), {
    sceneId: 's1', regionId: 'r1', behaviorId: 'b1'
  });
  assert.equal(identifyRegionBehaviorRef({ id: 'b1', parent: { id: 'r1' } }), null);
});

test('read / respawnEta / hasNode mirror the tile adapter interface', () => {
  const adapter = createRegionNodeStateAdapter({
    behavior: fakeBehavior({ node: { ...NODE, current: 1, max: 5, respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 } } }),
    emitWrite: () => {},
    now: () => 0,
    secondsPerUnit: () => 3600
  });
  assert.equal(adapter.hasNode(), true);
  assert.equal(adapter.read().current, 1);
  assert.equal(adapter.isDepleted(), false);
  const eta = adapter.respawnEta();
  assert.equal(eta.nextWorldTime, 3600);
  assert.equal(eta.secondsUntil, 3600);
});

test('write emits a { system: { node } } update and reflects the depleted flag', () => {
  const writes = [];
  const reflects = [];
  const depletedNode = { ...NODE, current: 0 };
  const adapter = createRegionNodeStateAdapter({
    behavior: fakeBehavior({ node: NODE }),
    emitWrite: (update) => writes.push(update),
    applyLinkedVisual: (args) => reflects.push(args)
  });

  adapter.write(depletedNode);

  assert.deepEqual(writes, [{ system: { node: depletedNode } }]);
  assert.equal(reflects.length, 1);
  assert.equal(reflects[0].depleted, true, 'a depleted node reflects depleted=true');
  assert.equal(reflects[0].behaviorSystem.node.current, 0);
  assert.equal(reflects[0].behaviorSystem.interactableType, 'gatheringTask', 'reflect carries the behaviour system view');
});

test('write reflects depleted=false for a non-depleted node', () => {
  const reflects = [];
  const adapter = createRegionNodeStateAdapter({
    behavior: fakeBehavior({ node: NODE }),
    emitWrite: () => {},
    applyLinkedVisual: (args) => reflects.push(args)
  });
  adapter.write({ ...NODE, current: 2 });
  assert.equal(reflects[0].depleted, false);
});

test('tileRef returns the widened { sceneId, regionId, behaviorId } payload', () => {
  const adapter = createRegionNodeStateAdapter({
    behavior: fakeBehavior(),
    emitWrite: () => {}
  });
  assert.deepEqual(adapter.tileRef(), { sceneId: 's1', regionId: 'r1', behaviorId: 'b1' });
});

test('tileRef prefers the persisted ref over the live behaviour', () => {
  const adapter = createRegionNodeStateAdapter({
    behavior: fakeBehavior(),
    emitWrite: () => {},
    ref: { sceneId: 'sX', regionId: 'rX', behaviorId: 'bX' }
  });
  assert.deepEqual(adapter.tileRef(), { sceneId: 'sX', regionId: 'rX', behaviorId: 'bX' });
});

test('respawn computes + persists a step via the injected seams, no-op when deleted', () => {
  const writes = [];
  const respawnNode = {
    enabled: true,
    max: 5,
    current: 1,
    depletionTiming: 'onStart',
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const adapter = createRegionNodeStateAdapter({
    behavior: fakeBehavior({ node: respawnNode }),
    emitWrite: (u) => writes.push(u),
    now: () => 7200, // 2 hours elapsed → +2 guaranteed
    secondsPerUnit: () => 3600
  });
  const next = adapter.respawn();
  assert.equal(next.current, 3);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], { system: { node: next } });

  writes.length = 0;
  const deleted = createRegionNodeStateAdapter({
    behavior: fakeBehavior({ node: respawnNode }),
    emitWrite: (u) => writes.push(u),
    now: () => 7200,
    secondsPerUnit: () => 3600,
    isDeleted: () => true
  });
  assert.equal(deleted.respawn(), null);
  assert.equal(writes.length, 0, 'a deleted behaviour persists nothing');
});

test('write ignores a non-object node', () => {
  const writes = [];
  const adapter = createRegionNodeStateAdapter({
    behavior: fakeBehavior({ node: NODE }),
    emitWrite: (u) => writes.push(u)
  });
  adapter.write(null);
  assert.equal(writes.length, 0);
});

/**
 * Unit coverage for the per-tile gathering node-state adapter.
 *
 * Everything here is PURE (no live Foundry): the snapshot builder, the local
 * read off the tile flags, the depletion trigger, the calendar-aware respawn
 * math, and the respawn ETA. The WRITE step calls the injected `emitWrite` seam
 * (the GM socket edge) — the tests assert the emitted node, they do not require a
 * real socket.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildTileNodeSnapshot,
  readTileNode,
  createTileNodeStateAdapter
} from '../../src/canvas/tileNodeStateAdapter.js';

const HOURS = (unit) => (unit === 'hours' ? 3600 : 3600);

function tile(node) {
  return { id: 'tl-1', parent: { id: 'scene-1' }, flags: { fabricate: { node } } };
}

// --- snapshot ---------------------------------------------------------------

test('buildTileNodeSnapshot seeds a freshly-placed node full (current = max)', () => {
  const snapshot = buildTileNodeSnapshot({ nodes: { enabled: true, max: 5 } });
  assert.equal(snapshot.max, 5);
  assert.equal(snapshot.current, 5, 'a fresh node starts full');
});

test('buildTileNodeSnapshot preserves an explicit current count from the source', () => {
  const snapshot = buildTileNodeSnapshot({ nodes: { enabled: true, max: 5, current: 2 } });
  assert.equal(snapshot.current, 2);
});

test('buildTileNodeSnapshot returns null for a task with no node config (unlimited node)', () => {
  assert.equal(buildTileNodeSnapshot({ nodes: null }), null);
  assert.equal(buildTileNodeSnapshot({}), null);
  assert.equal(buildTileNodeSnapshot(null), null);
});

// --- local read -------------------------------------------------------------

test('readTileNode normalizes the node off the tile flags', () => {
  const node = readTileNode(tile({ enabled: true, max: 4, current: 1 }));
  assert.equal(node.max, 4);
  assert.equal(node.current, 1);
});

test('readTileNode returns null when there is no node snapshot', () => {
  assert.equal(readTileNode(tile(null)), null);
  assert.equal(readTileNode({ flags: {} }), null);
});

// --- depletion + ETA --------------------------------------------------------

test('isDepleted keys off current <= 0 (one shared definition)', () => {
  const depleted = createTileNodeStateAdapter({ tile: tile({ enabled: true, max: 3, current: 0 }), emitWrite: () => {} });
  const available = createTileNodeStateAdapter({ tile: tile({ enabled: true, max: 3, current: 1 }), emitWrite: () => {} });
  assert.equal(depleted.isDepleted(), true);
  assert.equal(available.isDepleted(), false);
});

test('respawnEta reports the next world time a depleted overTime node gains', () => {
  const node = {
    enabled: true, max: 3, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const adapter = createTileNodeStateAdapter({
    tile: tile(node),
    emitWrite: () => {},
    now: () => 1800, // half an hour in
    secondsPerUnit: HOURS
  });
  const eta = adapter.respawnEta();
  assert.equal(eta.nextWorldTime, 3600);
  assert.equal(eta.secondsUntil, 1800);
});

test('respawnEta is null for a manual node and for a full node', () => {
  const manual = createTileNodeStateAdapter({ tile: tile({ enabled: true, max: 3, current: 0, respawn: { policy: 'manual' } }), emitWrite: () => {}, secondsPerUnit: HOURS });
  assert.equal(manual.respawnEta(), null);
  const full = createTileNodeStateAdapter({
    tile: tile({ enabled: true, max: 3, current: 3, respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 } }),
    emitWrite: () => {}, secondsPerUnit: HOURS
  });
  assert.equal(full.respawnEta(), null);
});

// --- tileRef ----------------------------------------------------------------

test('tileRef resolves the scene + tile identity from the tile document', () => {
  const adapter = createTileNodeStateAdapter({ tile: tile({ enabled: true, max: 3, current: 1 }), emitWrite: () => {} });
  assert.deepEqual(adapter.tileRef(), { sceneId: 'scene-1', tileId: 'tl-1' });
});

test('tileRef prefers an explicitly supplied ref', () => {
  const adapter = createTileNodeStateAdapter({
    tile: tile({ enabled: true, max: 3, current: 1 }),
    emitWrite: () => {},
    tileRef: { sceneId: 's9', tileId: 't9' }
  });
  assert.deepEqual(adapter.tileRef(), { sceneId: 's9', tileId: 't9' });
});

// --- write via the injected (socket) seam -----------------------------------

test('write routes the node object through the injected emitWrite seam', () => {
  const emitted = [];
  const adapter = createTileNodeStateAdapter({ tile: tile({ enabled: true, max: 3, current: 2 }), emitWrite: (node) => emitted.push(node) });
  adapter.write({ enabled: true, max: 3, current: 1 });
  assert.equal(emitted.length, 1);
  assert.deepEqual(emitted[0], { enabled: true, max: 3, current: 1 });
});

// --- calendar-aware respawn (pure math, emit asserted) ----------------------

test('respawn computes guaranteed gain per elapsed interval and emits the new node', () => {
  const node = {
    enabled: true, max: 3, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const emitted = [];
  const adapter = createTileNodeStateAdapter({
    tile: tile(node),
    emitWrite: (n) => emitted.push(n),
    now: () => 7200, // 2 hours elapsed
    secondsPerUnit: HOURS
  });
  const next = adapter.respawn();
  assert.equal(next.current, 2, '+1 per elapsed hour, two hours = +2');
  assert.equal(next.respawn.lastEvaluatedWorldTime, 7200, 'anchor advanced');
  assert.equal(emitted.length, 1, 'the respawn write was emitted');
  assert.deepEqual(emitted[0], next);
});

test('respawn is calendar-aware: a custom day length scales the interval', () => {
  // A 10-hour day → days unit resolves to 36000 seconds via the calendar seam.
  const node = {
    enabled: true, max: 2, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'days', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const adapter = createTileNodeStateAdapter({
    tile: tile(node),
    emitWrite: () => {},
    now: () => 36000, // exactly one custom day
    secondsPerUnit: (unit) => (unit === 'days' ? 36000 : 3600)
  });
  const next = adapter.respawn();
  assert.equal(next.current, 1, 'one custom day elapsed → +1');
});

test('respawn no-ops (no emit) when no full interval has elapsed', () => {
  const node = {
    enabled: true, max: 3, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const emitted = [];
  const adapter = createTileNodeStateAdapter({
    tile: tile(node),
    emitWrite: (n) => emitted.push(n),
    now: () => 1800, // half an hour
    secondsPerUnit: HOURS
  });
  assert.equal(adapter.respawn(), null);
  assert.equal(emitted.length, 0);
});

test('respawn no-ops against a deleted tile (terminal delete has no node to respawn)', () => {
  const node = {
    enabled: true, max: 3, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const emitted = [];
  const adapter = createTileNodeStateAdapter({
    tile: tile(node),
    emitWrite: (n) => emitted.push(n),
    now: () => 7200,
    secondsPerUnit: HOURS,
    isDeleted: () => true
  });
  assert.equal(adapter.respawn(), null, 'respawn no-ops against a deleted tile');
  assert.equal(emitted.length, 0);
});

test('respawn on an unlimited node (no snapshot) is a no-op', () => {
  const adapter = createTileNodeStateAdapter({ tile: tile(null), emitWrite: () => { throw new Error('must not write'); }, secondsPerUnit: HOURS });
  assert.equal(adapter.hasNode(), false);
  assert.equal(adapter.respawn(), null);
  assert.equal(adapter.isDepleted(), false);
});

// --- depleted-behavior enacted on write -------------------------------------

test('write enacts the depleted-behavior visual when the written node is depleted', () => {
  const enacted = [];
  const node = { enabled: true, max: 3, current: 0, respawn: { policy: 'manual' }, depletedBehavior: { swapImage: 'icons/x.webp' } };
  const adapter = createTileNodeStateAdapter({
    tile: tile(node),
    emitWrite: () => {},
    applyDepletedBehavior: (args) => enacted.push(args)
  });
  adapter.write(node);
  assert.equal(enacted.length, 1);
  assert.equal(enacted[0].depleted, true, 'a current<=0 node is depleted');
  assert.deepEqual(enacted[0].behavior, { swapImage: 'icons/x.webp' });
  assert.ok(enacted[0].tile && enacted[0].tile.id === 'tl-1', 'the tile is threaded to the visual edge');
});

test('write enacts a revert (depleted:false) when the written node has stock', () => {
  const enacted = [];
  const node = { enabled: true, max: 3, current: 2, respawn: { policy: 'manual' }, depletedBehavior: { swapImage: 'icons/x.webp' } };
  const adapter = createTileNodeStateAdapter({
    tile: tile(node),
    emitWrite: () => {},
    applyDepletedBehavior: (args) => enacted.push(args)
  });
  adapter.write(node);
  assert.equal(enacted.length, 1);
  assert.equal(enacted[0].depleted, false, 'a node with stock is not depleted ⇒ revert path');
});

test('write does not enact depleted-behavior when none is wired (default seam)', () => {
  const emitted = [];
  const node = { enabled: true, max: 1, current: 0, respawn: { policy: 'manual' }, depletedBehavior: { swapImage: 'icons/x.webp' } };
  const adapter = createTileNodeStateAdapter({ tile: tile(node), emitWrite: (n) => emitted.push(n) });
  // No applyDepletedBehavior seam ⇒ the node still persists, just no visual edge.
  adapter.write(node);
  assert.equal(emitted.length, 1);
});

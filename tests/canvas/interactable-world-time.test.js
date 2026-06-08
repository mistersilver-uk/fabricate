/**
 * Unit coverage for the per-tile gathering-node world-time respawn pass.
 *
 * The pass walks placed gathering-task Interactable tiles, respawns each tile's
 * `flags.fabricate.node` one step for the elapsed world time, and writes changed
 * nodes through the injected tile-update edge. The pure respawn math is covered
 * in `tile-node-state-adapter.test.js`; this exercises the scene/tile walk, the
 * gathering-task filter, the unlimited-node skip, and the calendar seam.
 *
 * Active-GM gating is now a passable `isActiveGM` predicate INSIDE the pass (so
 * the "non-active-GM applies nothing" decision is unit-testable here, rather than
 * only at the main.js call site).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { respawnInteractableTiles } from '../../src/canvas/interactableWorldTime.js';

const HOURS = (unit) => (unit === 'hours' ? 3600 : 3600);

function tileDoc(id, flags) {
  return { id, flags };
}

function gatheringTaskTile(id, node) {
  return tileDoc(id, { fabricate: { isInteractable: true, interactableType: 'gatheringTask', sourceUuid: `Fabricate.sysA.gatheringTask.${id}`, node } });
}

function scene(id, tiles) {
  return { id, tiles };
}

test('respawns each placed gathering-task tile node and writes the change through the edge', async () => {
  const node = {
    enabled: true, max: 3, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const applied = [];
  const changed = await respawnInteractableTiles({
    worldTime: 7200, // 2 hours
    secondsPerUnit: HOURS,
    scenes: [scene('scene-1', [gatheringTaskTile('tl-1', node)])],
    applyUpdate: (a) => applied.push(a)
  });

  assert.deepEqual(changed, [{ sceneId: 'scene-1', tileId: 'tl-1' }]);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].sceneId, 'scene-1');
  assert.equal(applied[0].tileId, 'tl-1');
  assert.equal(applied[0].update.flags.fabricate.node.current, 2, '+1 per elapsed hour');
});

test('skips tool tiles and gathering-task tiles with no node snapshot (unlimited)', async () => {
  const applied = [];
  const toolTile = tileDoc('tool-1', { fabricate: { isInteractable: true, interactableType: 'tool', sourceUuid: 'Fabricate.sysA.tool.tool-1' } });
  const unlimited = gatheringTaskTile('tl-unlim', null);
  const changed = await respawnInteractableTiles({
    worldTime: 7200,
    secondsPerUnit: HOURS,
    scenes: [scene('scene-1', [toolTile, unlimited])],
    applyUpdate: (a) => applied.push(a)
  });
  assert.deepEqual(changed, []);
  assert.equal(applied.length, 0);
});

test('no-ops when no full interval has elapsed', async () => {
  const node = {
    enabled: true, max: 3, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const applied = [];
  const changed = await respawnInteractableTiles({
    worldTime: 1800, // half an hour
    secondsPerUnit: HOURS,
    scenes: [scene('scene-1', [gatheringTaskTile('tl-1', node)])],
    applyUpdate: (a) => applied.push(a)
  });
  assert.deepEqual(changed, []);
  assert.equal(applied.length, 0);
});

test('non-active-GM applies NOTHING (the gate is a passable predicate)', async () => {
  const node = {
    enabled: true, max: 3, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const applied = [];
  const changed = await respawnInteractableTiles({
    worldTime: 7200,
    secondsPerUnit: HOURS,
    isActiveGM: () => false, // not the active GM
    scenes: [scene('scene-1', [gatheringTaskTile('tl-1', node)])],
    applyUpdate: (a) => applied.push(a)
  });
  assert.deepEqual(changed, [], 'no tile writes when not the active GM');
  assert.equal(applied.length, 0);
});

test('active-GM predicate true → the pass runs (parity with the default)', async () => {
  const node = {
    enabled: true, max: 3, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const applied = [];
  const changed = await respawnInteractableTiles({
    worldTime: 7200,
    secondsPerUnit: HOURS,
    isActiveGM: () => true,
    scenes: [scene('scene-1', [gatheringTaskTile('tl-1', node)])],
    applyUpdate: (a) => applied.push(a)
  });
  assert.equal(changed.length, 1);
  assert.equal(applied.length, 1);
});

test('walks tiles across multiple scenes', async () => {
  const node = {
    enabled: true, max: 2, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
  const applied = [];
  const changed = await respawnInteractableTiles({
    worldTime: 3600,
    secondsPerUnit: HOURS,
    scenes: [
      scene('s1', [gatheringTaskTile('a', { ...node })]),
      scene('s2', [gatheringTaskTile('b', { ...node })])
    ],
    applyUpdate: (a) => applied.push(a)
  });
  assert.equal(changed.length, 2);
  assert.deepEqual(changed.map(c => c.sceneId).sort(), ['s1', 's2']);
  assert.equal(applied.length, 2);
});

// --- depleted-behavior + terminal-delete interplay --------------------------

test('respawn no-ops against a deleted/absent tile (terminal delete)', async () => {
  // A deleted tile is no longer present in the scene, so the world-time pass
  // simply never iterates it — nothing to respawn, mirroring delete being
  // terminal (no revert path).
  const applied = [];
  const changed = await respawnInteractableTiles({
    worldTime: 7200,
    secondsPerUnit: HOURS,
    scenes: [scene('scene-1', [])], // the deleted tile is gone
    applyUpdate: (a) => applied.push(a)
  });
  assert.deepEqual(changed, []);
  assert.equal(applied.length, 0);
});

test('respawn reverts the depleted visual when a node climbs back above 0', async () => {
  const node = {
    enabled: true, max: 3, current: 0,
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 },
    depletedBehavior: { swapImage: 'icons/depleted.webp' }
  };
  const applied = [];
  const reverts = [];
  await respawnInteractableTiles({
    worldTime: 3600, // +1 hour ⇒ current 0→1 (no longer depleted)
    secondsPerUnit: HOURS,
    scenes: [scene('scene-1', [gatheringTaskTile('tl-1', node)])],
    applyUpdate: (a) => applied.push(a),
    applyDepletedBehavior: (args) => reverts.push(args)
  });
  assert.equal(applied.length, 1, 'the respawned node is persisted');
  assert.equal(applied[0].update.flags.fabricate.node.current, 1);
  assert.equal(reverts.length, 1, 'the depleted-behavior edge fires for the changed tile');
  assert.equal(reverts[0].depleted, false, 'a node back above 0 reverts (not depleted)');
  assert.deepEqual(reverts[0].behavior, { swapImage: 'icons/depleted.webp' });
});

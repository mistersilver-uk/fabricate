/**
 * Unit coverage for the region-behaviour world-time respawn pass.
 *
 * Mirrors `interactable-world-time.test.js`: active-GM gated (else `[]`); iterates
 * scenes → regions → `fabricate.interactable` behaviours with a `system.node`;
 * respawns each one step; on change applies a `{ system: { node } }` update +
 * reverts the linked-visual depleted state. All edges are injected.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { respawnInteractableRegionBehaviors } from '../../src/canvas/regions/interactableRegionWorldTime.js';
import { buildLinkedVisualApply } from '../../src/canvas/interactableSocketBridge.js';

function overTimeNode({ current, max = 5 }) {
  return {
    enabled: true,
    max,
    current,
    depletionTiming: 'onStart',
    respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 }
  };
}

function behavior({ node, type = 'fabricate.interactable', interactableType = 'gatheringTask', id = 'b1' }) {
  return { id, type, system: { interactableType, node } };
}

function scenes(list) {
  return { contents: list };
}

function scene({ id = 's1', regions = [] }) {
  return { id, regions: { contents: regions } };
}

function region({ id = 'r1', behaviors = [] }) {
  return { id, behaviors: { contents: behaviors } };
}

const SECONDS_PER_UNIT = () => 3600;

test('non-active-GM applies nothing', async () => {
  const applied = [];
  const changed = await respawnInteractableRegionBehaviors({
    worldTime: 7200,
    secondsPerUnit: SECONDS_PER_UNIT,
    isActiveGM: () => false,
    scenes: scenes([scene({ regions: [region({ behaviors: [behavior({ node: overTimeNode({ current: 1 }) })] })] })]),
    applyBehaviorUpdate: (a) => applied.push(a),
    applyLinkedVisual: () => {}
  });
  assert.deepEqual(changed, []);
  assert.equal(applied.length, 0);
});

test('respawns each behaviour one step + reverts the linked visual', async () => {
  const applied = [];
  const reflected = [];
  const changed = await respawnInteractableRegionBehaviors({
    worldTime: 7200, // 2 hours → +2 guaranteed (1 → 3)
    secondsPerUnit: SECONDS_PER_UNIT,
    isActiveGM: () => true,
    scenes: scenes([
      scene({ id: 's1', regions: [region({ id: 'r1', behaviors: [behavior({ id: 'b1', node: overTimeNode({ current: 1 }) })] })] })
    ]),
    applyBehaviorUpdate: (a) => applied.push(a),
    applyLinkedVisual: (a) => reflected.push(a)
  });

  assert.deepEqual(changed, [{ sceneId: 's1', regionId: 'r1', behaviorId: 'b1' }]);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].sceneId, 's1');
  assert.equal(applied[0].update.system.node.current, 3);
  assert.equal(reflected.length, 1);
  assert.equal(reflected[0].depleted, false, 'a node respawned above 0 reverts its depleted marker');
  assert.equal(reflected[0].behaviorSystem.node.current, 3);
});

test('skips non-interactable behaviours, tool behaviours, and unlimited nodes', async () => {
  const applied = [];
  const changed = await respawnInteractableRegionBehaviors({
    worldTime: 7200,
    secondsPerUnit: SECONDS_PER_UNIT,
    isActiveGM: () => true,
    scenes: scenes([scene({ regions: [region({ behaviors: [
      behavior({ id: 'b-other', type: 'someOther', node: overTimeNode({ current: 1 }) }),
      behavior({ id: 'b-tool', interactableType: 'tool', node: overTimeNode({ current: 1 }) }),
      behavior({ id: 'b-unlimited', node: null }),
      // manual-policy node → respawnNodeOnce no-ops (no re-anchor either).
      behavior({ id: 'b-manual', node: { enabled: true, max: 5, current: 1, depletionTiming: 'onStart', respawn: { policy: 'manual' } } })
    ] })] })]),
    applyBehaviorUpdate: (a) => applied.push(a),
    applyLinkedVisual: () => {}
  });
  assert.deepEqual(changed, []);
  assert.equal(applied.length, 0);
});

test('region-only behaviour respawns its node with a clean no-op linked-visual reflection (no marker)', async () => {
  // A region-only interactable (`linkedVisual.mode:'none'`, uuid null) still owns
  // its node + respawns it; the REAL `buildLinkedVisualApply` resolves no marker
  // and emits nothing — no throw, no socket traffic. The interactable keeps working.
  const savedSocket = globalThis.game;
  const savedFromUuid = globalThis.fromUuidSync;
  const emits = [];
  globalThis.game = { socket: { emit: (channel, payload) => emits.push({ channel, payload }) }, user: {}, users: {} };
  globalThis.fromUuidSync = () => null;
  try {
    const regionOnlyBehavior = {
      id: 'b1',
      type: 'fabricate.interactable',
      system: {
        interactableType: 'gatheringTask',
        node: overTimeNode({ current: 1 }),
        linkedVisual: { uuid: null, documentName: null, mode: 'none', missingPolicy: 'warn' }
      }
    };
    const applied = [];
    const changed = await respawnInteractableRegionBehaviors({
      worldTime: 7200,
      secondsPerUnit: SECONDS_PER_UNIT,
      isActiveGM: () => true,
      scenes: scenes([scene({ id: 's1', regions: [region({ id: 'r1', behaviors: [regionOnlyBehavior] })] })]),
      applyBehaviorUpdate: (a) => applied.push(a),
      applyLinkedVisual: buildLinkedVisualApply()
    });
    assert.deepEqual(changed, [{ sceneId: 's1', regionId: 'r1', behaviorId: 'b1' }], 'the node still respawns');
    assert.equal(applied.length, 1, 'the node update is applied');
    assert.equal(emits.length, 0, 'NO visual update/delete is emitted for a region-only interactable');
  } finally {
    globalThis.game = savedSocket;
    globalThis.fromUuidSync = savedFromUuid;
  }
});

test('returns an empty list for a non-finite world time', async () => {
  const changed = await respawnInteractableRegionBehaviors({
    worldTime: Number.NaN,
    secondsPerUnit: SECONDS_PER_UNIT,
    isActiveGM: () => true,
    scenes: scenes([]),
    applyBehaviorUpdate: () => {},
    applyLinkedVisual: () => {}
  });
  assert.deepEqual(changed, []);
});

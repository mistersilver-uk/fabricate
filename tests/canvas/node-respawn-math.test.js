/**
 * Unit coverage for the pure resource-node respawn math (`nodeRespawnMath.js`)
 * plus a DRIFT GUARD asserting the per-token math and the per-environment
 * `GatheringRichStateService._respawnNode` produce identical node results for a
 * shared fixture (the env path now delegates to this math; this pins them
 * together so a future edit to either can't silently diverge).
 *
 * Seam contract: `rollChance(chance)` returns the RAW 1..100 roll (a hit is
 * `roll <= chance*100`); `rollExpression(expr)` returns the per-interval integer
 * gain. Both are deterministic fakes here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isNodeDepleted,
  respawnIntervalSeconds,
  respawnNodeOnce,
  nextRespawnEta
} from '../../src/systems/nodeRespawnMath.js';
import { GatheringRichStateService } from '../../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../../src/config/settings.js';

const HOUR = 3600;
const secondsPerHour = () => HOUR; // every unit resolves to one hour for the fakes

// --- isNodeDepleted --------------------------------------------------------

test('isNodeDepleted: current <= 0 (one shared definition)', () => {
  assert.equal(isNodeDepleted({ current: 0 }), true);
  assert.equal(isNodeDepleted({ current: -2 }), true);
  assert.equal(isNodeDepleted({ current: 1 }), false);
  assert.equal(isNodeDepleted(null), false);
  assert.equal(isNodeDepleted('nope'), false);
});

// --- respawnIntervalSeconds: legacy intervalSeconds fallback ---------------

test('respawnIntervalSeconds: unit+amount uses the calendar seam', () => {
  assert.equal(respawnIntervalSeconds({ intervalUnit: 'hours', intervalAmount: 2 }, secondsPerHour), 2 * HOUR);
});

test('respawnIntervalSeconds: legacy raw intervalSeconds fallback (no unit schema)', () => {
  assert.equal(respawnIntervalSeconds({ intervalSeconds: 5 * HOUR }, secondsPerHour), 5 * HOUR);
  assert.equal(respawnIntervalSeconds({}, secondsPerHour), 0);
  assert.equal(respawnIntervalSeconds(null, secondsPerHour), 0);
});

// --- respawnNodeOnce: chance mode (raw-roll seam) --------------------------

test('respawnNodeOnce chance: hit on roll <= chance*100, persists the RAW roll', () => {
  const node = { current: 0, max: 5, respawn: { policy: 'overTime', gainMode: 'chance', intervalUnit: 'hours', intervalAmount: 1, chance: 0.5, lastEvaluatedWorldTime: 0 } };
  // Two intervals; rolls 30 (hit) then 80 (miss) at chance 0.5 → threshold 50.
  const queue = [30, 80];
  const { changed, node: next } = respawnNodeOnce(node, {
    now: 2 * HOUR,
    secondsPerUnit: secondsPerHour,
    rollChance: () => queue.shift()
  });
  assert.equal(changed, true);
  assert.equal(next.current, 1, 'one hit → +1');
  assert.deepEqual(next.respawn.lastRoll.rolls, [30, 80], 'persists the raw rolls, not booleans');
  assert.equal(next.respawn.lastEvaluatedWorldTime, 2 * HOUR);
});

// --- respawnNodeOnce: expression mode + max-clamp early break --------------

test('respawnNodeOnce expression: sums per-interval rolls and clamps to max', () => {
  const node = { current: 0, max: 10, respawn: { policy: 'overTime', gainMode: 'expression', intervalUnit: 'hours', intervalAmount: 1, amountExpression: '1d4', lastEvaluatedWorldTime: 0 } };
  const queue = [3, 2];
  const { node: next } = respawnNodeOnce(node, {
    now: 2 * HOUR,
    secondsPerUnit: secondsPerHour,
    rollExpression: () => queue.shift()
  });
  assert.equal(next.current, 5, '3 + 2');
  assert.deepEqual(next.respawn.lastRoll.rolls, [3, 2]);
});

test('respawnNodeOnce expression: early-breaks once the pool is full (clamp)', () => {
  // room is 2, but the first roll (3) already overfills → clamp + stop, one roll.
  const node = { current: 3, max: 5, respawn: { policy: 'overTime', gainMode: 'expression', intervalUnit: 'hours', intervalAmount: 1, amountExpression: '1d4', lastEvaluatedWorldTime: 0 } };
  let calls = 0;
  const { node: next } = respawnNodeOnce(node, {
    now: 5 * HOUR,
    secondsPerUnit: secondsPerHour,
    rollExpression: () => { calls += 1; return 3; }
  });
  assert.equal(next.current, 5, 'clamped to max');
  assert.equal(calls, 1, 'only one roll taken before the clamp break');
  assert.equal(next.respawn.lastRoll.rolls.length, 1);
});

// --- respawnNodeOnce: re-anchor & room===0 branches ------------------------

test('respawnNodeOnce backwards/stalled time: re-anchors, never gains', () => {
  const node = { current: 2, max: 5, respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 10 * HOUR } };
  // now (5h) < last (10h): re-anchor to now, no gain.
  const back = respawnNodeOnce(node, { now: 5 * HOUR, secondsPerUnit: secondsPerHour });
  assert.equal(back.changed, true);
  assert.equal(back.node.current, 2, 'no gain on backwards time');
  assert.equal(back.node.respawn.lastEvaluatedWorldTime, 5 * HOUR);
  // now === last: nothing changes.
  const still = respawnNodeOnce({ ...node, respawn: { ...node.respawn, lastEvaluatedWorldTime: 5 * HOUR } }, { now: 5 * HOUR, secondsPerUnit: secondsPerHour });
  assert.equal(still.changed, false);
});

test('respawnNodeOnce room===0: advances the anchor without gaining (already full)', () => {
  const node = { current: 5, max: 5, respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 } };
  const { changed, node: next } = respawnNodeOnce(node, { now: 3 * HOUR, secondsPerUnit: secondsPerHour });
  assert.equal(changed, true);
  assert.equal(next.current, 5, 'no gain — already at max');
  assert.equal(next.respawn.lastEvaluatedWorldTime, 3 * HOUR, 'anchor still advances over the elapsed intervals');
});

// --- nextRespawnEta: legacy interval + manual --------------------------------

test('nextRespawnEta: legacy intervalSeconds node → next anchor strictly after now', () => {
  const node = { current: 0, max: 5, respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: HOUR, lastEvaluatedWorldTime: 0 } };
  const eta = nextRespawnEta(node, secondsPerHour, 90 * 60); // 1.5h in
  assert.ok(eta);
  assert.equal(eta.nextWorldTime, 2 * HOUR, 'next whole interval boundary after now');
  assert.equal(eta.secondsUntil, 30 * 60);
});

test('nextRespawnEta: manual policy / at-max → null (never auto-respawns)', () => {
  assert.equal(nextRespawnEta({ current: 0, max: 5, respawn: { policy: 'manual' } }, secondsPerHour, 0), null);
  assert.equal(nextRespawnEta({ current: 5, max: 5, respawn: { policy: 'overTime', intervalSeconds: HOUR } }, secondsPerHour, 0), null);
  assert.equal(nextRespawnEta(null, secondsPerHour, 0), null);
});

// --- DRIFT GUARD: math vs _respawnNode on a shared fixture ------------------

function driftService(rolls) {
  const config = { systems: { sys: { economy: { mode: 'nodes' }, tasks: [] } } };
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  let rollIdx = 0;
  return new GatheringRichStateService({
    getSetting: (k) => settings.get(k),
    setSetting: async (k, v) => { settings.set(k, v); return v; },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    environmentStore: { get: () => null, update: async () => null },
    nowWorldTime: () => 0,
    rollD100: () => rolls[rollIdx++],
    secondsPerUnit: () => HOUR,
    hooks: { callAll: () => {} }
  });
}

test('drift guard: _respawnNode (chance) matches respawnNodeOnce for a shared fixture', async () => {
  const fixture = () => ({ current: 0, max: 5, enabled: true, respawn: { policy: 'overTime', gainMode: 'chance', intervalUnit: 'hours', intervalAmount: 1, chance: 0.5, lastEvaluatedWorldTime: 0 } });
  const rolls = [30, 80, 10]; // 3 intervals: hit, miss, hit → +2
  const service = driftService([...rolls]);
  const envResult = await service._respawnNode(fixture(), { now: 3 * HOUR, environmentId: 'e', taskId: 't' });

  const queue = [...rolls];
  const mathResult = respawnNodeOnce(fixture(), {
    now: 3 * HOUR,
    secondsPerUnit: () => HOUR,
    rollChance: () => queue.shift()
  });

  assert.equal(envResult.changed, mathResult.changed);
  assert.equal(envResult.node.current, mathResult.node.current, 'identical current');
  assert.equal(envResult.node.current, 2);
  assert.deepEqual(envResult.node.respawn.lastRoll.rolls, mathResult.node.respawn.lastRoll.rolls, 'identical persisted rolls');
  assert.equal(envResult.node.respawn.lastEvaluatedWorldTime, mathResult.node.respawn.lastEvaluatedWorldTime);
});

test('drift guard: _respawnNode (guaranteed) matches respawnNodeOnce for a shared fixture', async () => {
  const fixture = () => ({ current: 1, max: 10, enabled: true, respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1, lastEvaluatedWorldTime: 0 } });
  const service = driftService([]);
  const envResult = await service._respawnNode(fixture(), { now: 4 * HOUR, environmentId: 'e', taskId: 't' });
  const mathResult = respawnNodeOnce(fixture(), { now: 4 * HOUR, secondsPerUnit: () => HOUR });
  assert.equal(envResult.node.current, mathResult.node.current);
  assert.equal(envResult.node.current, 5, '1 + 4 intervals');
  assert.equal(envResult.node.respawn.lastEvaluatedWorldTime, mathResult.node.respawn.lastEvaluatedWorldTime);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateNodeRespawnModes } from '../src/migration/migrateNodeRespawnModes.js';

function envWithTaskRespawn(respawn) {
  return { id: 'env-1', craftingSystemId: 'sys-a', tasks: [{ id: 't1', nodes: { enabled: true, max: 3, current: 1, respawn } }] };
}

test('maps every legacy policy to the new schema (library + inline + runtime)', () => {
  const config = {
    systems: {
      'sys-a': {
        tasks: [
          { id: 'lib-none', nodes: { max: 2, current: 2, respawn: { policy: 'none' } } },
          { id: 'lib-elapsed', nodes: { max: 2, current: 0, respawn: { policy: 'elapsedTime', intervalSeconds: 3600 } } },
          { id: 'lib-prob', nodes: { max: 2, current: 0, respawn: { policy: 'probability', intervalSeconds: 3600, chance: 0.5 } } },
          { id: 'lib-hybrid', nodes: { max: 2, current: 0, respawn: { policy: 'manualAndElapsedTime', intervalSeconds: 3600, chance: 0.25 } } },
          { id: 'lib-manual', nodes: { max: 2, current: 2, respawn: { policy: 'manual' } } }
        ]
      }
    }
  };
  const environments = [{
    id: 'env-1',
    tasks: [{ id: 't-inline', nodes: { max: 4, current: 1, respawn: { policy: 'elapsedTime', intervalSeconds: 7200 } } }],
    nodeRuntime: { 't-rt': { max: 5, current: 2, respawn: { policy: 'probability', intervalSeconds: 60, chance: 0.1 } } }
  }];

  const result = migrateNodeRespawnModes(config, environments);
  const libById = Object.fromEntries(result.gatheringConfig.systems['sys-a'].tasks.map(t => [t.id, t.nodes.respawn]));

  assert.deepEqual(libById['lib-none'], { policy: 'manual' });
  assert.deepEqual(libById['lib-elapsed'], { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: 3600 });
  assert.deepEqual(libById['lib-prob'], { policy: 'overTime', gainMode: 'chance', intervalSeconds: 3600, chance: 0.5 });
  assert.deepEqual(libById['lib-hybrid'], { policy: 'overTime', gainMode: 'chance', intervalSeconds: 3600, chance: 0.25 });
  assert.deepEqual(libById['lib-manual'], { policy: 'manual' });

  assert.deepEqual(result.environments[0].tasks[0].nodes.respawn, { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: 7200 });
  assert.deepEqual(result.environments[0].nodeRuntime['t-rt'].respawn, { policy: 'overTime', gainMode: 'chance', intervalSeconds: 60, chance: 0.1 });
});

test('is idempotent — re-running yields a deep-equal result', () => {
  const config = { systems: { 'sys-a': { tasks: [{ id: 'l', nodes: { max: 1, current: 0, respawn: { policy: 'probability', intervalSeconds: 3600, chance: 0.3 } } }] } } };
  const once = migrateNodeRespawnModes(config, []);
  const twice = migrateNodeRespawnModes(once.gatheringConfig, once.environments);
  assert.deepEqual(twice.gatheringConfig, once.gatheringConfig);
});

test('already-migrated records are returned by reference (no churn)', () => {
  const respawn = { policy: 'overTime', gainMode: 'chance', intervalSeconds: 3600, chance: 0.5 };
  const env = envWithTaskRespawn(respawn);
  const result = migrateNodeRespawnModes({}, [env]);
  assert.strictEqual(result.environments[0], env, 'unchanged environment kept by reference');
  assert.strictEqual(result.environments[0].tasks[0].nodes.respawn, respawn, 'unchanged respawn kept by reference');
});

test('preserves unrelated fields and runtime anchors when migrating', () => {
  const env = {
    id: 'env-1', name: 'Cave', craftingSystemId: 'sys-a',
    tasks: [{ id: 't1', name: 'Vein', nodes: { enabled: true, max: 3, current: 2, depletionTiming: 'onSuccess', respawn: { policy: 'probability', intervalSeconds: 3600, chance: 0.5, lastEvaluatedWorldTime: 1000, lastRoll: { worldTime: 1000, chance: 0.5, rolls: [10] } } } }]
  };
  const result = migrateNodeRespawnModes({}, [env]);
  const node = result.environments[0].tasks[0].nodes;
  assert.equal(result.environments[0].name, 'Cave');
  assert.equal(node.depletionTiming, 'onSuccess');
  assert.equal(node.respawn.policy, 'overTime');
  assert.equal(node.respawn.gainMode, 'chance');
  assert.equal(node.respawn.lastEvaluatedWorldTime, 1000, 'world-time anchor preserved');
  assert.deepEqual(node.respawn.lastRoll, { worldTime: 1000, chance: 0.5, rolls: [10] }, 'lastRoll preserved');
});

test('passes through tasks with no node config or no respawn block', () => {
  const env = { id: 'env-1', tasks: [{ id: 'no-nodes' }, { id: 'nodes-no-respawn', nodes: { max: 2, current: 2 } }] };
  const result = migrateNodeRespawnModes({}, [env]);
  assert.strictEqual(result.environments[0], env, 'environment with nothing to migrate kept by reference');
});

test('handles missing/empty inputs', () => {
  const result = migrateNodeRespawnModes();
  assert.deepEqual(result.environments, []);
  assert.deepEqual(result.gatheringConfig, {});
});

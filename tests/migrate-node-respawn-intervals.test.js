import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateNodeRespawnIntervals } from '../src/migration/migrateNodeRespawnIntervals.js';

test('converts legacy intervalSeconds to unit+amount across library, inline, and runtime', () => {
  const config = {
    systems: {
      'sys-a': {
        tasks: [
          // 2 days = 172800s → days/2.
          { id: 'lib-1', nodes: { max: 3, current: 0, respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: 172800 } } }
        ]
      }
    }
  };
  const environments = [
    {
      id: 'env-1',
      tasks: [{ id: 't-inline', nodes: { max: 4, current: 1, respawn: { policy: 'overTime', gainMode: 'chance', intervalSeconds: 3600, chance: 0.5 } } }],
      nodeRuntime: { 't-rt': { max: 5, current: 2, respawn: { policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: 604800 } } }
    }
  ];

  const result = migrateNodeRespawnIntervals(config, environments);

  const lib = result.gatheringConfig.systems['sys-a'].tasks[0].nodes.respawn;
  assert.equal(lib.intervalUnit, 'days');
  assert.equal(lib.intervalAmount, 2);
  assert.ok(!('intervalSeconds' in lib), 'legacy intervalSeconds is dropped');
  assert.equal(lib.gainMode, 'guaranteed'); // other fields preserved

  const inline = result.environments[0].tasks[0].nodes.respawn;
  assert.equal(inline.intervalUnit, 'hours');
  assert.equal(inline.intervalAmount, 1);
  assert.equal(inline.chance, 0.5);

  const runtime = result.environments[0].nodeRuntime['t-rt'].respawn;
  assert.equal(runtime.intervalUnit, 'weeks');
  assert.equal(runtime.intervalAmount, 1);
});

test('prefers the largest whole unit (whole minutes win over fractional hours)', () => {
  const config = { systems: { s: { tasks: [{ id: 't', nodes: { max: 1, current: 0, respawn: { policy: 'overTime', intervalSeconds: 5400 } } }] } } };
  const { gatheringConfig } = migrateNodeRespawnIntervals(config, []);
  const respawn = gatheringConfig.systems.s.tasks[0].nodes.respawn;
  // 5400s divides evenly into 90 minutes (but not whole hours), so minutes win.
  assert.equal(respawn.intervalUnit, 'minutes');
  assert.equal(respawn.intervalAmount, 90);
});

test('falls back to fractional hours when no whole unit divides evenly', () => {
  const config = { systems: { s: { tasks: [{ id: 't', nodes: { max: 1, current: 0, respawn: { policy: 'overTime', intervalSeconds: 90 } } }] } } };
  const { gatheringConfig } = migrateNodeRespawnIntervals(config, []);
  const respawn = gatheringConfig.systems.s.tasks[0].nodes.respawn;
  // 90s is not a whole minute/hour/day/week → fractional hours fallback.
  assert.equal(respawn.intervalUnit, 'hours');
  assert.equal(respawn.intervalAmount, 90 / 3600);
});

test('is idempotent — nodes already on the unit schema are returned by reference', () => {
  const respawn = { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'days', intervalAmount: 2 };
  const config = { systems: { s: { tasks: [{ id: 't', nodes: { max: 1, current: 0, respawn } }] } } };
  const out = migrateNodeRespawnIntervals(config, []);
  // Unchanged config object is returned by reference (no churn).
  assert.equal(out.gatheringConfig, config);
  assert.equal(out.gatheringConfig.systems.s.tasks[0].nodes.respawn, respawn);
});

test('leaves respawn blocks with no interval untouched (manual nodes)', () => {
  const config = { systems: { s: { tasks: [{ id: 't', nodes: { max: 1, current: 0, respawn: { policy: 'manual' } } }] } } };
  const out = migrateNodeRespawnIntervals(config, []);
  assert.equal(out.gatheringConfig, config);
});

test('worlds with no gathering config see zero churn', () => {
  const out = migrateNodeRespawnIntervals({}, []);
  assert.deepEqual(out, { gatheringConfig: {}, environments: [] });
});

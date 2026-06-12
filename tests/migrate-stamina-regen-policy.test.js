import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateStaminaRegenPolicy } from '../src/migration/migrateStaminaRegenPolicy.js';

function configWithRegen(regen) {
  return { systems: { 'sys-a': { economy: { stamina: { enabled: true, regen } } } } };
}

test('rewrites a legacy elapsedTime stamina-regen policy to overTime', () => {
  const config = configWithRegen({ policy: 'elapsedTime', unit: 'days', amount: '1 + @abilities.con.mod' });
  const { gatheringConfig } = migrateStaminaRegenPolicy(config);
  const regen = gatheringConfig.systems['sys-a'].economy.stamina.regen;
  assert.equal(regen.policy, 'overTime');
  // Unrelated regen fields and the sibling stamina/economy shape are preserved.
  assert.equal(regen.unit, 'days');
  assert.equal(regen.amount, '1 + @abilities.con.mod');
  assert.equal(gatheringConfig.systems['sys-a'].economy.stamina.enabled, true);
});

test('preserves sibling economy fields (max/start/nodes) while migrating', () => {
  const config = {
    systems: {
      'sys-a': {
        economy: {
          stamina: { enabled: true, max: '20', start: '12', regen: { policy: 'elapsedTime', unit: 'hours', amount: 5 } },
          nodes: { enabled: true }
        }
      }
    }
  };
  const stamina = migrateStaminaRegenPolicy(config).gatheringConfig.systems['sys-a'].economy.stamina;
  assert.equal(stamina.regen.policy, 'overTime');
  assert.equal(stamina.max, '20');
  assert.equal(stamina.start, '12');
  assert.equal(migrateStaminaRegenPolicy(config).gatheringConfig.systems['sys-a'].economy.nodes.enabled, true);
});

test('migrates every system independently', () => {
  const config = {
    systems: {
      'sys-a': { economy: { stamina: { regen: { policy: 'elapsedTime', unit: 'hours' } } } },
      'sys-b': { economy: { stamina: { regen: { policy: 'overTime', unit: 'days' } } } },
      'sys-c': { economy: { stamina: { regen: { policy: 'none' } } } }
    }
  };
  const { systems } = migrateStaminaRegenPolicy(config).gatheringConfig;
  assert.equal(systems['sys-a'].economy.stamina.regen.policy, 'overTime');
  assert.equal(systems['sys-b'].economy.stamina.regen.policy, 'overTime');
  assert.equal(systems['sys-c'].economy.stamina.regen.policy, 'none');
});

test('is idempotent — re-running yields a deep-equal result', () => {
  const config = configWithRegen({ policy: 'elapsedTime', unit: 'hours', amount: 5 });
  const once = migrateStaminaRegenPolicy(config);
  const twice = migrateStaminaRegenPolicy(once.gatheringConfig);
  assert.deepEqual(twice.gatheringConfig, once.gatheringConfig);
});

test('already-overTime config is returned by reference (no churn)', () => {
  const config = configWithRegen({ policy: 'overTime', unit: 'hours', amount: 5 });
  const result = migrateStaminaRegenPolicy(config);
  assert.strictEqual(result.gatheringConfig, config);
});

test('config with no regen policy / no stamina is returned by reference', () => {
  const noRegen = { systems: { 'sys-a': { economy: { stamina: { enabled: true } } } } };
  assert.strictEqual(migrateStaminaRegenPolicy(noRegen).gatheringConfig, noRegen);

  const noneRegen = configWithRegen({ policy: 'none' });
  assert.strictEqual(migrateStaminaRegenPolicy(noneRegen).gatheringConfig, noneRegen);

  const noEconomy = { systems: { 'sys-a': {} } };
  assert.strictEqual(migrateStaminaRegenPolicy(noEconomy).gatheringConfig, noEconomy);
});

test('handles missing/empty inputs', () => {
  assert.deepEqual(migrateStaminaRegenPolicy().gatheringConfig, {});
  assert.deepEqual(migrateStaminaRegenPolicy({}).gatheringConfig, {});
  const noSystems = { foo: 1 };
  assert.strictEqual(migrateStaminaRegenPolicy(noSystems).gatheringConfig, noSystems);
});

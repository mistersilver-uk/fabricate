/**
 * Tests for T-013: Startup Schema Migration Framework (MigrationRunner)
 *
 * Uses node:test + node:assert/strict.
 * MigrationRunner accepts getSetting/setSetting as constructor args for full testability.
 * No Foundry globals needed.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { MigrationRunner } from '../src/migration/MigrationRunner.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSettings(initial = {}) {
  const store = new Map(Object.entries({
    recipes: [],
    craftingSystems: [],
    gatheringConfig: {},
    migrationVersion: '0.0.0',
    ...initial
  }));
  const calls = { get: [], set: [] };

  function getSetting(key) {
    calls.get.push(key);
    return store.get(key) ?? null;
  }

  async function setSetting(key, value) {
    calls.set.push({ key, value });
    store.set(key, value);
    return value;
  }

  return { store, calls, getSetting, setSetting };
}

function makeRunner(overrides = {}) {
  const settings = makeSettings(overrides.initial ?? {});
  const runner = new MigrationRunner({
    getSetting: settings.getSetting,
    setSetting: settings.setSetting
  });
  return { runner, settings };
}

// ---------------------------------------------------------------------------
// Group 1: Registry and ordering
// ---------------------------------------------------------------------------

test('migrations run in version order: componentId migration applied from 0.0.0', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: [{ catalysts: [{ systemItemId: 'forge' }] }],
      craftingSystems: []
    }
  });

  await runner.run();

  const savedRecipes = settings.store.get('recipes');
  assert.equal(savedRecipes[0].catalysts[0].componentId, 'forge');
  assert.equal('systemItemId' in savedRecipes[0].catalysts[0], false);
});

test('only pending migrations run: skip all when migrationVersion is 0.1.0', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.1.0',
      recipes: [{ catalysts: [{ systemItemId: 'forge' }] }],
      craftingSystems: []
    }
  });

  await runner.run();

  // recipes/systems should NOT be touched (all migrations already applied)
  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('recipes'), 'recipes should not be persisted when no migrations are pending');
  assert.ok(!setKeys.includes('craftingSystems'), 'craftingSystems should not be persisted when no migrations are pending');
});

test('no migrations pending returns without persisting anything', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '99.0.0',
      recipes: [{ id: 'r1' }],
      craftingSystems: [{ id: 's1' }]
    }
  });

  await runner.run();

  assert.equal(settings.calls.set.length, 0);
});

// ---------------------------------------------------------------------------
// Group 2: Idempotency
// ---------------------------------------------------------------------------

test('running twice from 0.0.0 produces identical output', async () => {
  const initial = {
    migrationVersion: '0.0.0',
    recipes: [{ catalysts: [{ systemItemId: 'x' }] }],
    craftingSystems: []
  };

  const { runner: r1, settings: s1 } = makeRunner({ initial });
  await r1.run();
  const firstRecipes = JSON.stringify(s1.store.get('recipes'));

  // Second run - start from 0.0.0 again (simulate re-run without version gate)
  const { runner: r2, settings: s2 } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: JSON.parse(firstRecipes),
      craftingSystems: []
    }
  });
  await r2.run();
  const secondRecipes = JSON.stringify(s2.store.get('recipes'));

  assert.equal(firstRecipes, secondRecipes);
});

test('data already in target shape passes through unchanged', async () => {
  const alreadyMigrated = [{ catalysts: [{ componentId: 'forge', degradesOnUse: false }] }];
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: alreadyMigrated,
      craftingSystems: []
    }
  });

  await runner.run();

  // migrationVersion should be updated, but recipes setSetting should NOT be called
  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('recipes'), 'recipes should not be re-persisted when data is unchanged');
});

test('runner does not persist recipes/systems when data is identical after migration', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: [{ id: 'r1', catalysts: [{ componentId: 'c1' }] }],
      craftingSystems: [{ id: 's1', components: [] }]
    }
  });

  await runner.run();

  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('recipes'));
  assert.ok(!setKeys.includes('craftingSystems'));
  // but migrationVersion should be updated
  assert.ok(setKeys.includes('migrationVersion'));
});

// ---------------------------------------------------------------------------
// Group 3: Corrupt record handling
// ---------------------------------------------------------------------------

test('null in recipes array is handled gracefully, valid entries still migrated', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: [null, { catalysts: [{ systemItemId: 'iron' }] }],
      craftingSystems: []
    }
  });

  await runner.run();

  const recipes = settings.store.get('recipes');
  assert.ok(Array.isArray(recipes));
  // The non-null entry should be migrated
  const validEntry = recipes.find(r => r !== null && typeof r === 'object');
  assert.ok(validEntry, 'valid entry should remain');
  if (validEntry) {
    assert.equal(validEntry.catalysts[0].componentId, 'iron');
  }
});

test('non-object in recipes array is skipped without crashing', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: [42, { catalysts: [{ systemItemId: 'x' }] }],
      craftingSystems: []
    }
  });

  await assert.doesNotReject(() => runner.run());

  const recipes = settings.store.get('recipes');
  assert.ok(Array.isArray(recipes));
});

test('null/undefined recipes setting handled gracefully', async () => {
  const settings = makeSettings({ migrationVersion: '0.0.0', craftingSystems: [] });
  // Override getSetting to return null for recipes
  const originalGet = settings.getSetting;
  const patchedGet = (key) => {
    if (key === 'recipes') return null;
    return originalGet(key);
  };
  const runner = new MigrationRunner({ getSetting: patchedGet, setSetting: settings.setSetting });

  await assert.doesNotReject(() => runner.run());
});

// ---------------------------------------------------------------------------
// Group 4: Integration
// ---------------------------------------------------------------------------

test('full run from 0.0.0 applies componentId migration correctly', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: [
        {
          catalysts: [{ systemItemId: 'cat-a' }],
          resultGroups: [{ results: [{ systemItemId: 'result-a', quantity: 1 }] }],
          ingredientSets: [
            { ingredients: [{ match: { type: 'systemItem', systemItemId: 'ing-a' } }] }
          ]
        }
      ],
      craftingSystems: [{ managedItems: [{ id: 'comp-1' }] }]
    }
  });

  await runner.run();

  const recipes = settings.store.get('recipes');
  const systems = settings.store.get('craftingSystems');

  assert.equal(recipes[0].catalysts[0].componentId, 'cat-a');
  assert.equal('systemItemId' in recipes[0].catalysts[0], false);
  assert.equal(recipes[0].resultGroups[0].results[0].componentId, 'result-a');
  assert.equal(recipes[0].ingredientSets[0].ingredients[0].match.componentId, 'ing-a');
  assert.equal(recipes[0].ingredientSets[0].ingredients[0].match.type, 'component');
  assert.ok(Array.isArray(systems[0].components));
  assert.equal('managedItems' in systems[0], false);
});

test('full run from 0.1.0 skips componentId migration', async () => {
  const originalData = [{ catalysts: [{ systemItemId: 'legacy' }] }];
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.1.0',
      recipes: JSON.parse(JSON.stringify(originalData)),
      craftingSystems: []
    }
  });

  await runner.run();

  // Data should be untouched since migration was already applied
  const recipes = settings.store.get('recipes');
  // setSetting for recipes should not have been called
  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('recipes'));
});

test('migrationVersion setting is updated to the highest migration version after successful run', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: [],
      craftingSystems: []
    }
  });

  await runner.run();

  const versionCall = settings.calls.set.find(c => c.key === 'migrationVersion');
  assert.ok(versionCall, 'migrationVersion should be persisted');
  assert.equal(versionCall.value, '0.6.0');
});

// ---------------------------------------------------------------------------
// Group 5: Persistence
// ---------------------------------------------------------------------------

test('changed data triggers setSetting for recipes and systems', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: [{ catalysts: [{ systemItemId: 'item-x' }] }],
      craftingSystems: [{ managedItems: [{ id: 'comp-a' }] }]
    }
  });

  await runner.run();

  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(setKeys.includes('recipes'), 'recipes should be persisted when changed');
  assert.ok(setKeys.includes('craftingSystems'), 'craftingSystems should be persisted when changed');
});

test('unchanged data only triggers setSetting for migrationVersion', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: [{ id: 'r1', catalysts: [{ componentId: 'c1' }] }],
      craftingSystems: [{ id: 's1', components: [] }]
    }
  });

  await runner.run();

  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('recipes'), 'recipes should NOT be persisted when unchanged');
  assert.ok(!setKeys.includes('craftingSystems'), 'craftingSystems should NOT be persisted when unchanged');
  assert.ok(setKeys.includes('migrationVersion'), 'migrationVersion should always be updated after migrations run');
});

// ---------------------------------------------------------------------------
// Group 6: Migration 0.2.0 — clear stale top-level gathering regions
// ---------------------------------------------------------------------------

test('0.2.0 clears stale top-level gatheringConfig.vocabularies.regions', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.1.0',
      gatheringConfig: {
        conditions: { weather: 'rain', timeOfDay: 'dusk' },
        vocabularies: {
          regions: ['northreach'],
          biomes: ['forest', 'mountain']
        },
        systems: { 'sys-a': { tools: [{ id: 't1' }] } }
      }
    }
  });

  await runner.run();

  const saved = settings.store.get('gatheringConfig');
  assert.deepEqual(saved.vocabularies.regions, [], 'regions cleared');
  assert.deepEqual(saved.vocabularies.biomes, ['forest', 'mountain'], 'biomes preserved');
  assert.deepEqual(saved.conditions, { weather: 'rain', timeOfDay: 'dusk' }, 'conditions preserved');
  assert.deepEqual(saved.systems, { 'sys-a': { tools: [{ id: 't1' }] } }, 'systems preserved');

  const versionCall = settings.calls.set.find(c => c.key === 'migrationVersion');
  assert.equal(versionCall?.value, '0.6.0');
});

test('0.2.0 is a no-op when gatheringConfig.vocabularies.regions is already empty', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.1.0',
      gatheringConfig: {
        vocabularies: { regions: [], biomes: ['forest'] },
        systems: {}
      }
    }
  });

  await runner.run();

  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('gatheringConfig'),
    'gatheringConfig should NOT be persisted when regions already empty');
  assert.ok(setKeys.includes('migrationVersion'),
    'migrationVersion still advances to record the run');
});

test('0.2.0 is a no-op when gatheringConfig has no vocabularies key at all', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.1.0',
      gatheringConfig: { systems: { 'sys-a': {} } }
    }
  });

  await runner.run();

  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('gatheringConfig'),
    'no rewrite when there is nothing to clear');
});

test('0.1.0 backward-compat: gatheringConfig is preserved across the spread-merge refactor', async () => {
  const originalGathering = {
    conditions: { weather: 'clear', timeOfDay: 'day' },
    vocabularies: { regions: ['legacy-region'], biomes: ['forest'] },
    systems: { 'legacy-sys': { tools: [{ id: 'legacy-tool' }] } }
  };
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.0.0',
      recipes: [{ catalysts: [{ systemItemId: 'forge' }] }],
      craftingSystems: [{ managedItems: [{ id: 'comp-1' }] }],
      gatheringConfig: JSON.parse(JSON.stringify(originalGathering))
    }
  });

  await runner.run();

  // 0.1.0 ran (componentId rename) and 0.2.0 ran (regions cleared). The
  // gatheringConfig should retain its biomes, conditions, and systems —
  // only regions should change.
  const saved = settings.store.get('gatheringConfig');
  assert.deepEqual(saved.vocabularies.regions, [], 'regions cleared by 0.2.0');
  assert.deepEqual(saved.vocabularies.biomes, ['forest'], 'biomes preserved across both migrations');
  assert.deepEqual(saved.conditions, originalGathering.conditions, 'conditions preserved');
  assert.deepEqual(saved.systems, originalGathering.systems, 'systems preserved');

  // 0.1.0's recipe / system migrations also took effect.
  const recipes = settings.store.get('recipes');
  const systems = settings.store.get('craftingSystems');
  assert.equal(recipes[0].catalysts[0].componentId, 'forge');
  assert.equal('systemItemId' in recipes[0].catalysts[0], false);
  assert.ok(Array.isArray(systems[0].components));
  assert.equal('managedItems' in systems[0], false);
});

test('null gatheringConfig setting is handled gracefully', async () => {
  const settings = makeSettings({ migrationVersion: '0.1.0' });
  const originalGet = settings.getSetting;
  const patchedGet = (key) => (key === 'gatheringConfig' ? null : originalGet(key));
  const runner = new MigrationRunner({ getSetting: patchedGet, setSetting: settings.setSetting });

  await assert.doesNotReject(() => runner.run());
});

// ---------------------------------------------------------------------------
// Group: 0.3.0 — system-level gathering economy modes
// ---------------------------------------------------------------------------

test('0.3.0 strips env economyMode + task attemptLimit and preserves legacy mode on the system', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.2.0',
      gatheringConfig: { systems: { 'sys-1': { tasks: [] } } },
      gatheringEnvironments: [{
        id: 'env-1',
        craftingSystemId: 'sys-1',
        economyMode: 'nodes',
        tasks: [{ id: 't1', staminaCost: 2, attemptLimit: { scope: 'actor', max: 3 } }]
      }]
    }
  });

  await runner.run();

  const envs = settings.store.get('gatheringEnvironments');
  assert.equal('economyMode' in envs[0], false);
  assert.equal('attemptLimit' in envs[0].tasks[0], false);
  assert.equal(envs[0].tasks[0].staminaCost, 2); // unrelated fields preserved

  const config = settings.store.get('gatheringConfig');
  assert.equal(config.systems['sys-1'].economy.mode, 'nodes');

  assert.equal(settings.store.get('migrationVersion'), '0.6.0');
});

test('0.4.0 collapses legacy node respawn policies in library tasks and environments', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.3.0',
      gatheringConfig: { systems: { 'sys-1': { economy: { mode: 'nodes' }, tasks: [
        { id: 'lib-1', nodes: { max: 2, current: 0, respawn: { policy: 'elapsedTime', intervalSeconds: 3600 } } }
      ] } } },
      gatheringEnvironments: [{
        id: 'env-1', craftingSystemId: 'sys-1',
        tasks: [{ id: 't1', nodes: { max: 3, current: 1, respawn: { policy: 'probability', intervalSeconds: 7200, chance: 0.4 } } }],
        nodeRuntime: { 't1': { max: 3, current: 0, respawn: { policy: 'manualAndElapsedTime', intervalSeconds: 60, chance: 0.2 } } }
      }]
    }
  });

  await runner.run();

  // The full runner also applies 0.5.0, converting the legacy intervalSeconds to
  // the calendar-aware intervalUnit + intervalAmount schema.
  const config = settings.store.get('gatheringConfig');
  assert.deepEqual(config.systems['sys-1'].tasks[0].nodes.respawn, { policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'hours', intervalAmount: 1 });

  const envs = settings.store.get('gatheringEnvironments');
  assert.deepEqual(envs[0].tasks[0].nodes.respawn, { policy: 'overTime', gainMode: 'chance', chance: 0.4, intervalUnit: 'hours', intervalAmount: 2 });
  assert.deepEqual(envs[0].nodeRuntime['t1'].respawn, { policy: 'overTime', gainMode: 'chance', chance: 0.2, intervalUnit: 'minutes', intervalAmount: 1 });

  assert.equal(settings.store.get('migrationVersion'), '0.6.0');
});

test('0.3.0 maps legacy hybrid/time and is idempotent', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.2.0',
      gatheringConfig: { systems: { 'sys-h': {}, 'sys-t': {} } },
      gatheringEnvironments: [
        { id: 'e-h', craftingSystemId: 'sys-h', economyMode: 'hybrid', tasks: [] },
        { id: 'e-t', craftingSystemId: 'sys-t', economyMode: 'time', tasks: [] }
      ]
    }
  });

  await runner.run();
  const config = settings.store.get('gatheringConfig');
  assert.equal(config.systems['sys-h'].economy.mode, 'stamina'); // hybrid -> stamina
  // time -> none: economy is only seeded when a non-default mode must be kept.
  assert.equal(config.systems['sys-t'].economy?.mode ?? 'none', 'none');

  // Re-running over already-migrated data changes nothing further.
  const before = JSON.stringify(settings.store.get('gatheringEnvironments'));
  settings.store.set('migrationVersion', '0.2.0');
  await runner.run();
  assert.equal(JSON.stringify(settings.store.get('gatheringEnvironments')), before);
});

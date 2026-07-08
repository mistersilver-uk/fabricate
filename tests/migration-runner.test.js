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
import { FatalMigrationError, isFatalMigrationError } from '../src/migration/migrationErrors.js';

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
      recipes: [],
      craftingSystems: [{ managedItems: [{ id: 'comp-1' }] }]
    }
  });

  await runner.run();

  // 0.1.0 renames the system's managedItems -> components; this observable survives every
  // later migration (unlike recipe catalysts, which 0.6.0 converts and 1.7.0 strips).
  const savedSystems = settings.store.get('craftingSystems');
  assert.ok(Array.isArray(savedSystems[0].components));
  assert.equal('managedItems' in savedSystems[0], false);
});

test('only pending migrations run: skip all when migrationVersion is 0.1.0', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.1.0',
      recipes: [{ id: 'r1' }],
      craftingSystems: []
    }
  });

  await runner.run();

  // recipes/systems should NOT be touched (no pending migration mutates this data)
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
  const alreadyMigrated = [{ id: 'r1' }];
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
      recipes: [{ id: 'r1' }],
      craftingSystems: [{ id: 's1', components: [], visibilityMode: 'knowledge' }]
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
      recipes: [null, { id: 'keep', craftingSystemId: 'sys-1', catalysts: [{ systemItemId: 'iron' }] }],
      craftingSystems: [{ id: 'sys-1' }]
    }
  });

  await runner.run();

  const recipes = settings.store.get('recipes');
  const systems = settings.store.get('craftingSystems');
  assert.ok(Array.isArray(recipes));
  // The non-null entry should be migrated: 0.1.0 renames systemItemId -> componentId,
  // 0.6.0 converts the catalyst into a system Tool, 1.7.0 strips the residual array.
  const validEntry = recipes.find(r => r !== null && typeof r === 'object');
  assert.ok(validEntry, 'valid entry should remain');
  assert.equal('catalysts' in validEntry, false);
  assert.equal(systems[0].tools[0].componentId, 'iron');
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

  // recipe-level catalysts are converted (0.6.0) / stripped (1.7.0); the surviving 0.1.0
  // observables below confirm the componentId migration ran through the runner.
  assert.equal(recipes[0].resultGroups[0].results[0].componentId, 'result-a');
  assert.equal(recipes[0].ingredientSets[0].ingredients[0].match.componentId, 'ing-a');
  assert.equal(recipes[0].ingredientSets[0].ingredients[0].match.type, 'component');
  assert.ok(Array.isArray(systems[0].components));
  assert.equal('managedItems' in systems[0], false);
});

test('full run from 0.1.0 skips componentId migration', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.1.0',
      recipes: [],
      craftingSystems: [{ managedItems: [{ id: 'comp-1' }], visibilityMode: 'knowledge' }]
    }
  });

  await runner.run();

  // 0.1.0 is gated out, so its managedItems -> components rename does NOT run and the
  // system is left untouched (no later migration touches a managedItems-only system).
  const systems = settings.store.get('craftingSystems');
  assert.ok('managedItems' in systems[0], 'managedItems left untouched when 0.1.0 is gated');
  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('craftingSystems'));
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
  assert.equal(versionCall.value, '1.12.0');
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
      recipes: [{ id: 'r1' }],
      craftingSystems: [{ id: 's1', components: [], visibilityMode: 'knowledge' }]
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
  assert.equal(versionCall?.value, '1.12.0');
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

  // 0.1.0's system migration took effect (the recipe's catalysts are stripped by 1.7.0,
  // so the managedItems -> components rename is the surviving 0.1.0 observable).
  const systems = settings.store.get('craftingSystems');
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
  // 0.3.0 seeds economy.mode = 'nodes'; the full run then applies 0.8.0, which
  // rewrites that legacy mode into the two independent flags and drops `mode`.
  assert.equal('mode' in config.systems['sys-1'].economy, false);
  assert.equal(config.systems['sys-1'].economy.stamina.enabled, false);
  assert.equal(config.systems['sys-1'].economy.nodes.enabled, true);

  assert.equal(settings.store.get('migrationVersion'), '1.12.0');
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

  assert.equal(settings.store.get('migrationVersion'), '1.12.0');
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
  // 0.3.0 maps hybrid -> stamina mode; 0.8.0 then rewrites that to flags.
  assert.equal('mode' in config.systems['sys-h'].economy, false);
  assert.equal(config.systems['sys-h'].economy.stamina.enabled, true);
  assert.equal(config.systems['sys-h'].economy.nodes.enabled, false);
  // time -> none: economy is only seeded when a non-default mode must be kept,
  // so sys-t has no economy block at all (0.8.0 leaves the absent block alone).
  assert.equal(config.systems['sys-t'].economy?.stamina?.enabled ?? false, false);
  assert.equal(config.systems['sys-t'].economy?.nodes?.enabled ?? false, false);

  // Re-running over already-migrated data changes nothing further.
  const before = JSON.stringify(settings.store.get('gatheringEnvironments'));
  settings.store.set('migrationVersion', '0.2.0');
  await runner.run();
  assert.equal(JSON.stringify(settings.store.get('gatheringEnvironments')), before);
});

// ---------------------------------------------------------------------------
// Group: 0.8.0 — independent stamina + resource-node limitation toggles
// ---------------------------------------------------------------------------

test('0.8.0 rewrites legacy economy.mode into independent stamina/nodes flags', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.7.0',
      gatheringConfig: {
        systems: {
          'sys-stamina': { economy: { mode: 'stamina', stamina: { max: '40', regen: { policy: 'none' } } } },
          'sys-nodes': { economy: { mode: 'nodes' } },
          'sys-none': { economy: { mode: 'none' } }
        }
      }
    }
  });

  await runner.run();

  const systems = settings.store.get('gatheringConfig').systems;

  // stamina mode -> stamina.enabled true, nodes.enabled false, `mode` dropped.
  assert.equal('mode' in systems['sys-stamina'].economy, false);
  assert.equal(systems['sys-stamina'].economy.stamina.enabled, true);
  assert.equal(systems['sys-stamina'].economy.nodes.enabled, false);
  // Existing stamina config is preserved verbatim alongside the flag.
  assert.equal(systems['sys-stamina'].economy.stamina.max, '40');

  // nodes mode -> nodes.enabled true, stamina.enabled false.
  assert.equal('mode' in systems['sys-nodes'].economy, false);
  assert.equal(systems['sys-nodes'].economy.stamina.enabled, false);
  assert.equal(systems['sys-nodes'].economy.nodes.enabled, true);

  // none -> both false.
  assert.equal('mode' in systems['sys-none'].economy, false);
  assert.equal(systems['sys-none'].economy.stamina.enabled, false);
  assert.equal(systems['sys-none'].economy.nodes.enabled, false);

  assert.equal(settings.store.get('migrationVersion'), '1.12.0');
});

test('0.8.0 is idempotent and leaves already-migrated economies untouched', async () => {
  const alreadyMigrated = {
    systems: {
      'sys-1': { economy: { stamina: { enabled: true, max: '30' }, nodes: { enabled: false } } }
    }
  };
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.7.0',
      gatheringConfig: JSON.parse(JSON.stringify(alreadyMigrated))
    }
  });

  await runner.run();

  // No `mode` to rewrite ⇒ economy passes through unchanged; gatheringConfig
  // should not be re-persisted.
  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('gatheringConfig'), 'unchanged config should not be re-persisted');
  assert.deepEqual(settings.store.get('gatheringConfig'), alreadyMigrated);
});

test('0.3.0 -> 0.8.0 compose: env-level economyMode becomes the two flags', async () => {
  // 0.3.0 maps the legacy env-level economyMode into economy.mode; 0.8.0 then
  // rewrites that mode into the flags. The two economy migrations compose.
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '0.2.0',
      gatheringConfig: { systems: { 'sys-1': { tasks: [] } } },
      gatheringEnvironments: [{
        id: 'env-1', craftingSystemId: 'sys-1', economyMode: 'stamina', tasks: []
      }]
    }
  });

  await runner.run();

  const economy = settings.store.get('gatheringConfig').systems['sys-1'].economy;
  assert.equal('mode' in economy, false, '0.8.0 drops the mode 0.3.0 seeded');
  assert.equal(economy.stamina.enabled, true);
  assert.equal(economy.nodes.enabled, false);
  assert.equal(settings.store.get('migrationVersion'), '1.12.0');
});

// ---------------------------------------------------------------------------
// Group: 1.2.0 — unify stamina-regen policy name elapsedTime -> overTime
// ---------------------------------------------------------------------------

test('1.2.0 rewrites a legacy elapsedTime stamina-regen policy to overTime', async () => {
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '1.1.0',
      gatheringConfig: {
        systems: {
          'sys-1': { economy: { stamina: { enabled: true, max: '20', regen: { policy: 'elapsedTime', unit: 'days', amount: 5 } } } }
        }
      }
    }
  });

  await runner.run();

  const stamina = settings.store.get('gatheringConfig').systems['sys-1'].economy.stamina;
  assert.equal(stamina.regen.policy, 'overTime');
  // Unrelated regen + stamina fields preserved.
  assert.equal(stamina.regen.unit, 'days');
  assert.equal(stamina.regen.amount, 5);
  assert.equal(stamina.max, '20');
  assert.equal(settings.store.get('migrationVersion'), '1.12.0');
});

test('1.2.0 is idempotent and leaves already-overTime economies untouched (no re-persist)', async () => {
  const alreadyMigrated = {
    systems: {
      'sys-1': { economy: { stamina: { enabled: true, regen: { policy: 'overTime', unit: 'hours', amount: 3 } }, nodes: { enabled: false } } }
    }
  };
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '1.1.0',
      gatheringConfig: JSON.parse(JSON.stringify(alreadyMigrated))
    }
  });

  await runner.run();

  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('gatheringConfig'), 'unchanged config should not be re-persisted');
  assert.deepEqual(settings.store.get('gatheringConfig'), alreadyMigrated);
});

// ---------------------------------------------------------------------------
// Group: Fatal migration abort, rollback, and GM recovery guidance (#178)
// ---------------------------------------------------------------------------

/**
 * Capture console.error/console.warn output for the duration of `fn`.
 * Returns { error: string[], warn: string[] } of the formatted lines.
 */
async function captureConsole(fn) {
  const lines = { error: [], warn: [] };
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = (...args) => { lines.error.push(args.join(' ')); };
  console.warn = (...args) => { lines.warn.push(args.join(' ')); };
  try {
    await fn();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
  return lines;
}

/**
 * Build a runner with an injected migration registry so tests can supply a
 * fatal/non-fatal migration without touching the production MIGRATIONS array.
 */
function makeRunnerWithMigrations(migrations, overrides = {}) {
  const settings = makeSettings(overrides.initial ?? {});
  const runner = new MigrationRunner({
    getSetting: settings.getSetting,
    setSetting: settings.setSetting,
    moduleVersion: overrides.moduleVersion,
    promptRecovery: overrides.promptRecovery,
    migrations
  });
  return { runner, settings };
}

test('isFatalMigrationError recognises the fatal flag', () => {
  assert.equal(isFatalMigrationError(new FatalMigrationError('boom')), true);
  assert.equal(isFatalMigrationError(new Error('plain')), false);
  assert.equal(isFatalMigrationError(null), false);
  assert.equal(isFatalMigrationError(undefined), false);
  assert.equal(isFatalMigrationError({ fatal: true }), true);
});

test('FatalMigrationError carries documents and downgradeTo', () => {
  const docs = [{ type: 'recipe', id: 'r1', name: 'Sword', error: 'bad', fix: 'fix it' }];
  const err = new FatalMigrationError('unusable', { documents: docs, downgradeTo: '1.1.0' });
  assert.equal(err.name, 'FatalMigrationError');
  assert.equal(err.fatal, true);
  assert.deepEqual(err.documents, docs);
  assert.equal(err.downgradeTo, '1.1.0');
  // Non-array documents are coerced to [].
  const err2 = new FatalMigrationError('x', { documents: 'nope' });
  assert.deepEqual(err2.documents, []);
  assert.equal(err2.downgradeTo, null);
});

test('fatal abort persists no data and leaves migrationVersion unchanged', async () => {
  const fatal = {
    version: '2.0.0',
    label: 'Unusable-document migration',
    downgradeTo: '1.2.0',
    migrate() {
      throw new FatalMigrationError('Recipe missing required result group', {
        documents: [{ type: 'recipe', id: 'r1', name: 'Iron Sword', error: 'missing resultSelection', fix: 'Add a result selection or delete the recipe' }],
        downgradeTo: '1.2.0'
      });
    }
  };
  const { runner, settings } = makeRunnerWithMigrations([fatal], {
    initial: {
      migrationVersion: '1.2.0',
      recipes: [{ id: 'r1' }],
      craftingSystems: [{ id: 's1' }],
      gatheringConfig: { systems: {} },
      gatheringEnvironments: [{ id: 'env-1' }],
      gatheringParties: [{ id: 'p1' }]
    }
  });

  let summary;
  await captureConsole(async () => { summary = await runner.run(); });

  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(!setKeys.includes('recipes'), 'recipes must not be persisted on abort');
  assert.ok(!setKeys.includes('craftingSystems'), 'craftingSystems must not be persisted on abort');
  assert.ok(!setKeys.includes('gatheringConfig'), 'gatheringConfig must not be persisted on abort');
  assert.ok(!setKeys.includes('gatheringEnvironments'), 'gatheringEnvironments must not be persisted on abort');
  assert.ok(!setKeys.includes('gatheringParties'), 'gatheringParties must not be persisted on abort');
  assert.ok(!setKeys.includes('migrationVersion'), 'migrationVersion must not be bumped on abort');
  assert.equal(setKeys.length, 0, 'no settings writes at all on abort');

  assert.equal(summary.aborted, true);
  assert.equal(summary.ran, 0);
  assert.equal(summary.abortedMigration, 'Unusable-document migration');
  assert.equal(summary.downgradeTo, '1.2.0');
  assert.equal(summary.failures.length, 1);
});

test('migrationVersion is unchanged after a fatal abort', async () => {
  const fatal = {
    version: '2.0.0',
    label: 'Fatal',
    migrate() { throw new FatalMigrationError('unusable', { downgradeTo: '1.2.0' }); }
  };
  const { runner, settings } = makeRunnerWithMigrations([fatal], {
    initial: { migrationVersion: '1.2.0', recipes: [], craftingSystems: [] }
  });

  await captureConsole(() => runner.run());

  assert.equal(settings.getSetting('migrationVersion'), '1.2.0');
});

test('fatal abort persists no partially-mutated data even when a migration mutates in place', async () => {
  const originalRecipes = [{ id: 'r1', name: 'Original' }];
  const originalSystems = [{ id: 's1', name: 'System' }];
  // A second, successful migration runs first and returns a fresh payload; the
  // fatal migration then mutates THAT payload in place before throwing. The
  // runner must restore the pre-fatal checkpoint and persist nothing, so no
  // partially-migrated recipe/system data reaches the store.
  const succeed = {
    version: '2.0.0',
    label: 'Succeeds first (fresh payload)',
    migrate(data) {
      return {
        recipes: data.recipes.map(r => ({ ...r })),
        systems: data.systems.map(s => ({ ...s }))
      };
    }
  };
  const fatal = {
    version: '2.1.0',
    label: 'Mutate-then-throw',
    migrate(data) {
      // Mutate the live (post-success) payload in place BEFORE throwing.
      data.recipes.push({ id: 'r2', name: 'PartiallyMigrated' });
      data.recipes[0].name = 'Corrupted';
      data.systems[0].name = 'CorruptedSystem';
      throw new FatalMigrationError('blew up mid-transform', {
        documents: [{ type: 'recipe', id: 'r2', error: 'invalid', fix: 'remove it' }],
        downgradeTo: '1.2.0'
      });
    }
  };
  const { runner, settings } = makeRunnerWithMigrations([succeed, fatal], {
    initial: {
      migrationVersion: '1.2.0',
      recipes: JSON.parse(JSON.stringify(originalRecipes)),
      craftingSystems: JSON.parse(JSON.stringify(originalSystems))
    }
  });

  await captureConsole(() => runner.run());

  // Nothing was persisted: no setSetting writes occurred for any payload key,
  // so the corrupted/partial in-place mutation never reached a settings write.
  assert.equal(settings.calls.set.length, 0, 'no setting writes on abort');
});

test('a successful migration followed by a fatal one persists nothing and keeps version', async () => {
  const succeed = {
    version: '2.0.0',
    label: 'Succeeds and rewrites recipes',
    migrate(data) {
      return { recipes: data.recipes.map(r => ({ ...r, migrated: true })) };
    }
  };
  const fatal = {
    version: '2.1.0',
    label: 'Then fails fatally',
    migrate() {
      throw new FatalMigrationError('unusable after second step', {
        documents: [{ type: 'craftingSystem', id: 's1', error: 'bad', fix: 'fix' }],
        downgradeTo: '1.2.0'
      });
    }
  };
  const { runner, settings } = makeRunnerWithMigrations([succeed, fatal], {
    initial: {
      migrationVersion: '1.2.0',
      recipes: [{ id: 'r1' }],
      craftingSystems: [{ id: 's1' }]
    }
  });

  let summary;
  await captureConsole(async () => { summary = await runner.run(); });

  const setKeys = settings.calls.set.map(c => c.key);
  assert.equal(setKeys.length, 0, 'the earlier success is rolled back / not written');
  // The earlier successful transform is not visible in the store.
  assert.deepEqual(settings.store.get('recipes'), [{ id: 'r1' }]);
  assert.equal(settings.getSetting('migrationVersion'), '1.2.0');
  assert.equal(summary.aborted, true);
});

test('fatal abort emits GM recovery guidance: header, downgrade target, per-document remediation', async () => {
  const fatal = {
    version: '2.0.0',
    label: 'Unusable macro recipe',
    migrate() {
      throw new FatalMigrationError('Recipe macro output is malformed', {
        documents: [
          {
            type: 'recipe',
            id: 'recipe-42',
            name: 'Potion of Healing',
            error: 'macroOutcome provider has no return keys',
            fix: 'Update the recipe macro to return { components } or delete the recipe',
            macroHint: 'return { components: [{ componentId, quantity }] }'
          }
        ],
        downgradeTo: '1.2.0'
      });
    }
  };
  const { runner } = makeRunnerWithMigrations([fatal], {
    initial: { migrationVersion: '1.2.0', recipes: [], craftingSystems: [] }
  });

  const lines = await captureConsole(() => runner.run());
  const out = lines.error.join('\n');

  assert.ok(
    out.includes('Fabricate | Migration aborted. Existing data has been kept unchanged.'),
    'exact abort header present'
  );
  assert.ok(out.includes('1.2.0'), 'recommended downgrade target present');
  assert.ok(out.includes('downgrade'), 'downgrade recommendation phrased as guidance');
  assert.ok(out.includes('recipe'), 'document type present');
  assert.ok(out.includes('recipe-42'), 'document id present');
  assert.ok(out.includes('Potion of Healing'), 'document name present');
  assert.ok(out.includes('macroOutcome provider has no return keys'), 'exact error present');
  assert.ok(out.includes('Update the recipe macro'), 'required fix action present');
  assert.ok(out.includes('return { components:'), 'macro hint present');
});

test('promptRecovery seam is invoked with downgrade/documents/label on abort', async () => {
  const calls = [];
  const fatal = {
    version: '2.0.0',
    label: 'Fatal with prompt',
    migrate() {
      throw new FatalMigrationError('unusable', {
        documents: [{ type: 'recipe', id: 'r1', error: 'e', fix: 'f' }],
        downgradeTo: '1.2.0'
      });
    }
  };
  const { runner } = makeRunnerWithMigrations([fatal], {
    initial: { migrationVersion: '1.2.0', recipes: [], craftingSystems: [] },
    promptRecovery: (ctx) => { calls.push(ctx); }
  });

  await captureConsole(() => runner.run());

  assert.equal(calls.length, 1);
  assert.equal(calls[0].downgradeTo, '1.2.0');
  assert.equal(calls[0].label, 'Fatal with prompt');
  assert.equal(calls[0].documents.length, 1);
});

test('downgradeTo falls back to migration metadata then moduleVersion when error omits it', async () => {
  // Error has no downgradeTo; migration provides one.
  const fromMigration = {
    version: '2.0.0',
    label: 'Fatal, downgrade on migration',
    downgradeTo: '1.1.0',
    migrate() { throw new FatalMigrationError('unusable'); }
  };
  const r1 = makeRunnerWithMigrations([fromMigration], {
    initial: { migrationVersion: '1.0.0', recipes: [], craftingSystems: [] }
  });
  let s1;
  await captureConsole(async () => { s1 = await r1.runner.run(); });
  assert.equal(s1.downgradeTo, '1.1.0');

  // No downgradeTo anywhere except moduleVersion.
  const noDowngrade = {
    version: '2.0.0',
    label: 'Fatal, no downgrade',
    migrate() { throw new FatalMigrationError('unusable'); }
  };
  const r2 = makeRunnerWithMigrations([noDowngrade], {
    initial: { migrationVersion: '1.0.0', recipes: [], craftingSystems: [] },
    moduleVersion: '1.3.0'
  });
  let s2;
  await captureConsole(async () => { s2 = await r2.runner.run(); });
  assert.equal(s2.downgradeTo, '1.3.0');
});

test('non-fatal migration error still warns, continues, persists later results, and bumps version', async () => {
  const throwsNonFatal = {
    version: '2.0.0',
    label: 'Non-fatal flaky migration',
    migrate() { throw new Error('soft failure'); }
  };
  const succeeds = {
    version: '2.1.0',
    label: 'Succeeds after the soft failure',
    migrate(data) {
      return { recipes: data.recipes.map(r => ({ ...r, touched: true })) };
    }
  };
  const { runner, settings } = makeRunnerWithMigrations([throwsNonFatal, succeeds], {
    initial: {
      migrationVersion: '1.2.0',
      recipes: [{ id: 'r1' }],
      craftingSystems: []
    }
  });

  let summary;
  const lines = await captureConsole(async () => { summary = await runner.run(); });

  // Warned about the non-fatal failure with the exact spec phrasing.
  assert.ok(
    lines.warn.some(l => l.includes('Fabricate | Migration "Non-fatal flaky migration" failed: soft failure')),
    'non-fatal failure is warned, not aborted'
  );

  assert.equal(summary.aborted, false);
  assert.equal(summary.ran, 2);

  // The later migration's result is persisted and version is bumped.
  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(setKeys.includes('recipes'), 'later migration result persisted');
  assert.equal(settings.store.get('recipes')[0].touched, true);
  assert.equal(settings.getSetting('migrationVersion'), '2.1.0');
});

test('successful injected run reports aborted:false and preserves the summary shape', async () => {
  const succeeds = {
    version: '2.0.0',
    label: 'Plain success',
    migrate(data) { return { recipes: data.recipes.map(r => ({ ...r, ok: true })) }; }
  };
  const { runner } = makeRunnerWithMigrations([succeeds], {
    initial: { migrationVersion: '1.2.0', recipes: [{ id: 'r1' }], craftingSystems: [] }
  });

  const summary = await runner.run();
  assert.equal(summary.aborted, false);
  assert.equal(summary.ran, 1);
  assert.equal(summary.migratedCatalystCount, 0);
  assert.deepEqual(summary.unifiedRegionSystems, []);
});

test('1.6.0 recovery-warning payload is surfaced in the summary and never persisted', async () => {
  // Start at 1.5.0 so only the real 1.6.0 migration runs over persisted legacy data.
  const { runner, settings } = makeRunner({
    initial: {
      migrationVersion: '1.5.0',
      recipes: [
        {
          id: 'recipe-rt',
          name: 'Roll Table Recipe',
          craftingSystemId: 'sys-1',
          resultSelection: { provider: 'rollTableOutcome', rollTableUuid: 'RollTable.a' }
        }
      ],
      craftingSystems: [],
      gatheringConfig: {
        systems: {
          'sys-1': {
            tasks: [
              { id: 'task-1', name: 'Task 1', resolutionMode: 'routed', resultSelection: { provider: 'macroOutcome' } }
            ]
          }
        }
      }
    }
  });

  const summary = await runner.run();

  // Surfaced in the summary for the GM notice.
  assert.deepEqual(
    summary.removedResultSelectionProviders.droppedRollTableRecipes.map(r => r.recipeId),
    ['recipe-rt']
  );
  assert.equal(summary.removedResultSelectionProviders.strippedGatheringTasks.length, 1);
  assert.equal(summary.removedResultSelectionProviders.strippedGatheringTasks[0].taskId, 'task-1');

  // Stripped from every persisted setting payload (never written to disk).
  const persistedRecipes = settings.store.get('recipes');
  assert.equal(persistedRecipes[0].resultSelection.provider, 'check');
  assert.equal('rollTableUuid' in persistedRecipes[0].resultSelection, false);
  assert.equal('_removedResultSelectionProviders' in persistedRecipes, false);

  const persistedGathering = settings.store.get('gatheringConfig');
  assert.equal('_removedResultSelectionProviders' in persistedGathering, false);
  assert.equal('resultSelection' in persistedGathering.systems['sys-1'].tasks[0], false);

  // Confirm no persisted setting value carries the transient field.
  for (const { value } of settings.calls.set) {
    if (value && typeof value === 'object') {
      assert.equal('_removedResultSelectionProviders' in value, false);
    }
  }
});

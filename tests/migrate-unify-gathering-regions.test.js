import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateUnifyGatheringRegions } from '../src/migration/migrateUnifyGatheringRegions.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function baseData() {
  return {
    systems: [{ id: 'sys-a', name: 'Alpha' }],
    gatheringConfig: {
      systems: {
        'sys-a': {
          vocabularies: { regions: { values: [{ id: 'north', label: 'North' }] } },
          tasks: [{ id: 't1', name: 'Forage', region: 'north', biomes: ['forest'] }],
          events: [{ id: 'h1', name: 'Bears', regions: ['north'], biomes: ['forest'], dangerTags: ['hazardous'] }]
        }
      }
    },
    environments: [
      { id: 'env-a', craftingSystemId: 'sys-a', region: 'north', includedRegionIds: [] }
    ]
  };
}

function findRegion(system, id) {
  return (system.gatheringRegions || []).find(r => r.id === id) || null;
}

// ---------------------------------------------------------------------------
// Pure transform: core path
// ---------------------------------------------------------------------------

test('derives a GatheringRegion per vocabulary entry, keyed by crafting-system id', () => {
  const result = migrateUnifyGatheringRegions(baseData());
  const sys = result.systems[0];
  assert.equal(sys.gatheringRegions.length, 1);
  const region = findRegion(sys, 'north');
  assert.deepEqual(region, { id: 'north', craftingSystemId: 'sys-a', name: 'North', enabled: true });
});

test('a vocabulary entry with no explicit label uses the id as the name', () => {
  const data = baseData();
  data.gatheringConfig.systems['sys-a'].vocabularies.regions.values = ['eastreach'];
  const result = migrateUnifyGatheringRegions(data);
  const region = findRegion(result.systems[0], 'eastreach');
  assert.equal(region.name, 'eastreach');
});

test('maps environment.region onto includedRegionIds when a derived region exists', () => {
  const result = migrateUnifyGatheringRegions(baseData());
  assert.deepEqual(result.environments[0].includedRegionIds, ['north']);
  // The legacy region string is left in place (inert), not deleted.
  assert.equal(result.environments[0].region, 'north');
});

test('strips region/regions tags from gathering-config tasks and events', () => {
  const result = migrateUnifyGatheringRegions(baseData());
  const sysConfig = result.gatheringConfig.systems['sys-a'];
  assert.equal('region' in sysConfig.tasks[0], false);
  assert.equal('regions' in sysConfig.events[0], false);
  // Other composition fields are untouched.
  assert.deepEqual(sysConfig.tasks[0].biomes, ['forest']);
  assert.deepEqual(sysConfig.events[0].biomes, ['forest']);
});

test('clears the per-system region vocabulary after deriving', () => {
  const result = migrateUnifyGatheringRegions(baseData());
  assert.deepEqual(result.gatheringConfig.systems['sys-a'].vocabularies.regions, { values: [] });
  // Biome vocab is not touched (none seeded here, so still absent).
});

test('leaves gatheringRegionSettings.enabled unset (the system stays opt-in)', () => {
  const result = migrateUnifyGatheringRegions(baseData());
  // The migration never writes gatheringRegionSettings; normalization defaults enabled=false.
  assert.equal('gatheringRegionSettings' in result.systems[0], false);
});

test('surfaces the names of systems that had regions via the transient field', () => {
  const result = migrateUnifyGatheringRegions(baseData());
  assert.deepEqual(result._unifiedRegionSystems, ['Alpha']);
});

test('falls back to the system id when the system has no display name', () => {
  const data = baseData();
  delete data.systems[0].name;
  const result = migrateUnifyGatheringRegions(data);
  assert.deepEqual(result._unifiedRegionSystems, ['sys-a']);
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('running twice is a no-op (second run produces identical output)', () => {
  const first = migrateUnifyGatheringRegions(baseData());
  // Strip the transient field, then re-run over the already-migrated data.
  const firstClean = clone(first);
  delete firstClean._unifiedRegionSystems;
  const second = migrateUnifyGatheringRegions(clone(firstClean));
  const secondClean = clone(second);
  delete secondClean._unifiedRegionSystems;
  assert.deepEqual(secondClean, firstClean);
  // No GM notice fires the second time (no vocabulary left to unify).
  assert.equal('_unifiedRegionSystems' in second, false);
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

test('orphan environment.region with no derived region leaves includedRegionIds empty and region inert', () => {
  const data = baseData();
  data.environments.push({ id: 'env-orphan', craftingSystemId: 'sys-a', region: 'free-text-place', includedRegionIds: [] });
  const result = migrateUnifyGatheringRegions(data);
  const orphan = result.environments.find(e => e.id === 'env-orphan');
  assert.deepEqual(orphan.includedRegionIds, []);
  assert.equal(orphan.region, 'free-text-place');
});

test('distinct ids with duplicate labels produce distinct regions (dedupe by id)', () => {
  const data = baseData();
  data.gatheringConfig.systems['sys-a'].vocabularies.regions.values = [
    { id: 'north-a', label: 'North' },
    { id: 'north-b', label: 'North' }
  ];
  const result = migrateUnifyGatheringRegions(data);
  const ids = result.systems[0].gatheringRegions.map(r => r.id).sort();
  assert.deepEqual(ids, ['north-a', 'north-b']);
});

test('partially-migrated system: existing region survives, new vocab entry is appended, dedupe holds', () => {
  const data = baseData();
  data.systems[0].gatheringRegions = [{ id: 'north', craftingSystemId: 'sys-a', name: 'North (existing)', enabled: false }];
  data.gatheringConfig.systems['sys-a'].vocabularies.regions.values = [
    { id: 'north', label: 'North' }, // already present → id-dedupe, not re-added
    { id: 'south', label: 'South' }  // new → appended
  ];
  const result = migrateUnifyGatheringRegions(data);
  const regions = result.systems[0].gatheringRegions;
  assert.equal(regions.length, 2);
  // The pre-existing region is preserved verbatim (name + enabled untouched).
  assert.deepEqual(findRegion(result.systems[0], 'north'), { id: 'north', craftingSystemId: 'sys-a', name: 'North (existing)', enabled: false });
  assert.deepEqual(findRegion(result.systems[0], 'south'), { id: 'south', craftingSystemId: 'sys-a', name: 'South', enabled: true });
});

test('config system id with no matching crafting system is skipped (no region written, no notice)', () => {
  const data = {
    systems: [{ id: 'sys-a', name: 'Alpha' }],
    gatheringConfig: {
      systems: {
        'sys-ghost': { vocabularies: { regions: { values: [{ id: 'phantom', label: 'Phantom' }] } } }
      }
    },
    environments: []
  };
  const result = migrateUnifyGatheringRegions(data);
  // sys-a is untouched (no regions array materialized).
  assert.equal('gatheringRegions' in result.systems[0], false);
  // The ghost config still gets its vocab cleared (so a re-run is a no-op) but
  // produces no GM notice (nowhere to write the regions).
  assert.deepEqual(result.gatheringConfig.systems['sys-ghost'].vocabularies.regions, { values: [] });
  assert.equal('_unifiedRegionSystems' in result, false);
});

test('a system with no region vocabulary is left byte-for-byte unchanged', () => {
  const data = {
    systems: [{ id: 'sys-a', name: 'Alpha' }],
    gatheringConfig: { systems: { 'sys-a': { tasks: [{ id: 't1', biomes: ['forest'] }] } } },
    environments: []
  };
  const before = clone(data);
  const result = migrateUnifyGatheringRegions(data);
  // No vocabularies key was injected; the task (no region tag) is untouched.
  assert.equal('vocabularies' in result.gatheringConfig.systems['sys-a'], false);
  assert.deepEqual(result.gatheringConfig.systems['sys-a'].tasks[0], before.gatheringConfig.systems['sys-a'].tasks[0]);
  assert.equal('_unifiedRegionSystems' in result, false);
});

test('does not remap an environment that already has includedRegionIds', () => {
  const data = baseData();
  data.environments[0].includedRegionIds = ['somewhere-else'];
  const result = migrateUnifyGatheringRegions(data);
  assert.deepEqual(result.environments[0].includedRegionIds, ['somewhere-else']);
});

test('purity: the input objects are not mutated', () => {
  const data = baseData();
  const snapshot = clone(data);
  migrateUnifyGatheringRegions(data);
  assert.deepEqual(data, snapshot, 'inputs are deep-cloned, never mutated in place');
});

// ---------------------------------------------------------------------------
// Through the MigrationRunner: GM notice, transient stripping, version, re-import
// ---------------------------------------------------------------------------

function makeSettings(initial = {}) {
  const store = new Map(Object.entries({
    recipes: [],
    craftingSystems: [],
    gatheringConfig: {},
    gatheringEnvironments: [],
    migrationVersion: '0.0.0',
    ...initial
  }));
  const calls = { set: [] };
  const getSetting = key => store.get(key) ?? null;
  const setSetting = async (key, value) => { calls.set.push({ key, value }); store.set(key, value); return value; };
  return { store, calls, getSetting, setSetting };
}

test('runner: surfaces the GM-notice system names and never persists the transient field', async () => {
  const data = baseData();
  const settings = makeSettings({
    migrationVersion: '0.8.0', // the 0.9.0, 1.0.0, and 1.1.0 migrations are pending
    craftingSystems: clone(data.systems),
    gatheringConfig: clone(data.gatheringConfig),
    gatheringEnvironments: clone(data.environments)
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  const summary = await runner.run();

  assert.deepEqual(summary.unifiedRegionSystems, ['Alpha'], 'system names surfaced for the GM notice');
  assert.equal(settings.store.get('migrationVersion'), '1.3.0');

  // The transient field is never written into any persisted setting payload.
  for (const { value } of settings.calls.set) {
    const json = JSON.stringify(value);
    assert.equal(json.includes('_unifiedRegionSystems'), false);
  }

  // The data transform was actually persisted.
  const savedSystems = settings.store.get('craftingSystems');
  assert.equal(savedSystems[0].gatheringRealms[0].id, 'north');
  const savedEnvs = settings.store.get('gatheringEnvironments');
  assert.deepEqual(savedEnvs[0].includedRealmIds, ['north']);
  const savedConfig = settings.store.get('gatheringConfig');
  assert.deepEqual(savedConfig.systems['sys-a'].vocabularies.regions, { values: [] });
  assert.equal('region' in savedConfig.systems['sys-a'].tasks[0], false);
});

test('runner: re-importing pre-unification data upgrades on the next migration run', async () => {
  const data = baseData();
  // A legacy export imported AFTER the migration already ran once: migrationVersion
  // is reset to before 0.9.0 (imports do not re-run migrations inline), so the next
  // startup run re-applies the unification idempotently.
  const settings = makeSettings({
    migrationVersion: '0.8.0',
    craftingSystems: clone(data.systems),
    gatheringConfig: clone(data.gatheringConfig),
    gatheringEnvironments: clone(data.environments)
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  // First run upgrades.
  await runner.run();
  const afterFirst = clone(settings.store.get('craftingSystems'));
  assert.equal(afterFirst[0].gatheringRealms[0].id, 'north');

  // Simulate a fresh import of the SAME legacy export over the upgraded world, then
  // a version reset (the import path does not re-run migrations), then next startup.
  settings.store.set('craftingSystems', clone(data.systems));
  settings.store.set('gatheringConfig', clone(data.gatheringConfig));
  settings.store.set('gatheringEnvironments', clone(data.environments));
  settings.store.set('migrationVersion', '0.8.0');

  const summary = await runner.run();
  assert.deepEqual(summary.unifiedRegionSystems, ['Alpha'], 'the re-imported legacy data is upgraded again');
  const savedSystems = settings.store.get('craftingSystems');
  assert.equal(savedSystems[0].gatheringRealms[0].id, 'north');
  const savedEnvs = settings.store.get('gatheringEnvironments');
  assert.deepEqual(savedEnvs[0].includedRealmIds, ['north']);
});

test('runner: no GM notice and no gatheringConfig rewrite when there is no legacy region data', async () => {
  const settings = makeSettings({
    migrationVersion: '0.8.0',
    craftingSystems: [{ id: 'sys-a', name: 'Alpha' }],
    gatheringConfig: { systems: { 'sys-a': { tasks: [{ id: 't1', biomes: ['forest'] }] } } },
    gatheringEnvironments: []
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  const summary = await runner.run();

  assert.deepEqual(summary.unifiedRegionSystems, []);
  const setKeys = settings.calls.set.map(c => c.key);
  assert.equal(setKeys.includes('gatheringConfig'), false, 'no rewrite when nothing to unify');
  assert.equal(setKeys.includes('craftingSystems'), false, 'systems untouched when no regions derived');
  assert.equal(settings.store.get('migrationVersion'), '1.3.0');
});

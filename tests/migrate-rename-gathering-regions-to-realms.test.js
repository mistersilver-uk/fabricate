import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateRenameGatheringRegionsToRealms } from '../src/migration/migrateRenameGatheringRegionsToRealms.js';
import { MigrationRunner } from '../src/migration/MigrationRunner.js';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/** A pre-1.1.0 (region-schema) data bundle covering every renamed surface. */
function legacyData() {
  return {
    systems: [
      {
        id: 'sys-a',
        name: 'Alpha',
        gatheringRegions: [
          {
            id: 'north',
            name: 'North',
            // Foundry-bridge fields ride along untouched.
            sceneMappings: [{ id: 'sm1', sceneUuid: 'Scene.s1', sceneRegionUuid: 'Region.r1' }],
            // Modifier kind/operation/visibility VALUES are not renamed.
            modifiers: [{ id: 'm1', kind: 'eventChance', operation: 'add', visibility: 'gmOnly', value: 10 }]
          }
        ],
        gatheringRegionSettings: { enabled: true, revealMode: 'alwaysVisible', modifierVisibility: 'visible' }
      }
    ],
    environments: [
      {
        id: 'env-1',
        name: 'Forest',
        region: 'forest', // inert legacy free-text — must NOT change
        includedRegionIds: ['north'],
        excludedRegionIds: ['south'],
        includedBiomeIds: ['temperate'],
        excludedBiomeIds: ['arid']
      }
    ],
    gatheringParties: [
      {
        id: 'party-1',
        name: 'Heroes',
        currentRegionOverrides: {
          'sys-a': { mode: 'manual', regionIds: ['north'], updatedAt: 1, updatedByUserId: 'u1' }
        }
      }
    ]
  };
}

// ---------------------------------------------------------------------------
// Pure function: round-trip rename
// ---------------------------------------------------------------------------

test('renames the system region-library keys to realm', () => {
  const { systems } = migrateRenameGatheringRegionsToRealms(legacyData());
  const system = systems[0];
  assert.ok(Array.isArray(system.gatheringRealms), 'gatheringRegions -> gatheringRealms');
  assert.equal(system.gatheringRegions, undefined, 'legacy gatheringRegions key removed');
  assert.deepEqual(system.gatheringRealmSettings, {
    enabled: true, revealMode: 'alwaysVisible', modifierVisibility: 'visible'
  });
  assert.equal(system.gatheringRegionSettings, undefined, 'legacy gatheringRegionSettings removed');
});

test('renames environment location-availability id lists to realm', () => {
  const { environments } = migrateRenameGatheringRegionsToRealms(legacyData());
  const env = environments[0];
  assert.deepEqual(env.includedRealmIds, ['north']);
  assert.deepEqual(env.excludedRealmIds, ['south']);
  assert.equal(env.includedRegionIds, undefined);
  assert.equal(env.excludedRegionIds, undefined);
});

test('renames party current-region override maps and inner regionIds to realm', () => {
  const { gatheringParties } = migrateRenameGatheringRegionsToRealms(legacyData());
  const override = gatheringParties[0].currentRealmOverrides['sys-a'];
  assert.equal(gatheringParties[0].currentRegionOverrides, undefined);
  assert.deepEqual(override.realmIds, ['north']);
  assert.equal(override.regionIds, undefined);
  assert.equal(override.mode, 'manual');
});

// ---------------------------------------------------------------------------
// Keep-list: Foundry-bridge fields and modifier vocabulary stay
// ---------------------------------------------------------------------------

test('preserves the Foundry scene-bridge fields and modifier vocab', () => {
  const { systems } = migrateRenameGatheringRegionsToRealms(legacyData());
  const realm = systems[0].gatheringRealms[0];
  assert.deepEqual(realm.sceneMappings, [{ id: 'sm1', sceneUuid: 'Scene.s1', sceneRegionUuid: 'Region.r1' }]);
  assert.equal(realm.modifiers[0].kind, 'eventChance', 'modifier kind value unchanged');
  assert.equal(realm.modifiers[0].operation, 'add');
  assert.equal(realm.modifiers[0].visibility, 'gmOnly');
});

test('leaves the inert legacy environment.region free-text string', () => {
  const { environments } = migrateRenameGatheringRegionsToRealms(legacyData());
  assert.equal(environments[0].region, 'forest', 'inert legacy region string preserved');
});

// ---------------------------------------------------------------------------
// Idempotency and anomalous payloads
// ---------------------------------------------------------------------------

test('is idempotent: a second run makes no further change', () => {
  const once = migrateRenameGatheringRegionsToRealms(legacyData());
  const twice = migrateRenameGatheringRegionsToRealms(clone(once));
  assert.deepEqual(twice, once);
});

test('does not clobber an already-migrated key; leaves a stale legacy key inert', () => {
  const data = legacyData();
  // Anomalous: realm key already present alongside a stale region key.
  data.systems[0].gatheringRealms = [{ id: 'already' }];
  const { systems } = migrateRenameGatheringRegionsToRealms(data);
  assert.deepEqual(systems[0].gatheringRealms.map(r => r.id), ['already'], 'existing realms not clobbered');
  assert.ok(Array.isArray(systems[0].gatheringRegions), 'stale legacy key left inert (no data loss)');
});

test('migrates each key independently when old and new keys are mixed', () => {
  const data = legacyData();
  data.environments[0].includedRealmIds = ['already']; // already migrated
  // excludedRegionIds is still legacy and should migrate on its own.
  const { environments } = migrateRenameGatheringRegionsToRealms(data);
  assert.deepEqual(environments[0].includedRealmIds, ['already'], 'existing new key untouched');
  assert.deepEqual(environments[0].excludedRealmIds, ['south'], 'legacy excludedRegionIds migrated independently');
});

test('does not mutate its inputs (deep-clones)', () => {
  const input = legacyData();
  const snapshot = clone(input);
  migrateRenameGatheringRegionsToRealms(input);
  assert.deepEqual(input, snapshot, 'input bundle left unchanged');
});

// ---------------------------------------------------------------------------
// Through the runner (proves the new gatheringParties runner wiring)
// ---------------------------------------------------------------------------

function makeSettings(initial = {}) {
  const store = new Map(Object.entries({
    recipes: [],
    craftingSystems: [],
    gatheringConfig: {},
    gatheringEnvironments: [],
    gatheringParties: [],
    migrationVersion: '0.0.0',
    ...initial
  }));
  const calls = { set: [] };
  const getSetting = key => store.get(key) ?? null;
  const setSetting = async (key, value) => { calls.set.push({ key, value }); store.set(key, value); return value; };
  return { store, calls, getSetting, setSetting };
}

test('runs through MigrationRunner from 1.0.0, rewrites the data, and lands at the highest version', async () => {
  const data = legacyData();
  const settings = makeSettings({
    migrationVersion: '1.0.0', // only the 1.1.0 rename migration is pending
    craftingSystems: clone(data.systems),
    gatheringEnvironments: clone(data.environments),
    gatheringParties: clone(data.gatheringParties)
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  await runner.run();

  assert.equal(settings.store.get('migrationVersion'), '1.18.0', 'advances to the new highest version');

  const savedSystems = settings.store.get('craftingSystems');
  assert.ok(Array.isArray(savedSystems[0].gatheringRealms), 'systems persisted under gatheringRealms');
  assert.equal(savedSystems[0].gatheringRegions, undefined);

  const savedEnvs = settings.store.get('gatheringEnvironments');
  assert.deepEqual(savedEnvs[0].includedRealmIds, ['north']);

  // The party-override rewrite proves gatheringParties is wired through the runner.
  const savedParties = settings.store.get('gatheringParties');
  assert.deepEqual(savedParties[0].currentRealmOverrides['sys-a'].realmIds, ['north']);
  assert.equal(savedParties[0].currentRegionOverrides, undefined);
  const setKeys = settings.calls.set.map(c => c.key);
  assert.ok(setKeys.includes('gatheringParties'), 'party-override rename is persisted');
});

test('runner: gatheringParties is left untouched (no write) when it carries no legacy override keys', async () => {
  const settings = makeSettings({
    migrationVersion: '1.0.0',
    gatheringParties: [{ id: 'p1', name: 'Heroes', currentRealmOverrides: { 'sys-a': { mode: 'none', realmIds: [] } } }]
  });
  const runner = new MigrationRunner({ getSetting: settings.getSetting, setSetting: settings.setSetting });

  await runner.run();

  const setKeys = settings.calls.set.map(c => c.key);
  assert.equal(setKeys.includes('gatheringParties'), false, 'no rewrite when nothing to rename');
  assert.equal(settings.store.get('migrationVersion'), '1.18.0');
});

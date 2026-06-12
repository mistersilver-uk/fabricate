import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRealmStore, GatheringRealmValidationError } from '../src/systems/GatheringRealmStore.js';
import { normalizeGatheringRealmList, normalizeGatheringRealmSettings } from '../src/systems/gatheringRealms.js';

function makeSystemManager(initialSystems = []) {
  const systems = new Map(initialSystems.map(s => [s.id, normalizeSystem(s)]));
  const updates = [];
  return {
    updates,
    getSystem: id => systems.get(id) || null,
    getSystems: () => Array.from(systems.values()),
    updateSystem: async (systemId, patch) => {
      const current = systems.get(systemId);
      if (!current) throw new Error(`system not found: ${systemId}`);
      const merged = normalizeSystem({ ...current, ...patch, id: systemId });
      systems.set(systemId, merged);
      updates.push({ systemId, patch });
      return merged;
    }
  };
}

// Minimal mirror of CraftingSystemManager normalization for realms only.
let generatedRealmIdSeq = 0;
function normalizeSystem(system) {
  return {
    ...system,
    id: system.id,
    gatheringRealms: normalizeGatheringRealmList(system.gatheringRealms, {
      craftingSystemId: system.id,
      // Deterministic generated ids — no Math.random (weak-crypto hotspot).
      randomID: () => `gen-${generatedRealmIdSeq++}`
    }),
    gatheringRealmSettings: normalizeGatheringRealmSettings(system.gatheringRealmSettings)
  };
}

let counter = 0;
const randomID = () => `r-${++counter}`;

test('create persists a realm with craftingSystemId self-healed to the owner', async () => {
  const systemManager = makeSystemManager([{ id: 'system-a' }]);
  const store = new GatheringRealmStore({ systemManager, randomID });
  const realm = await store.create('system-a', { name: 'Verdant', craftingSystemId: 'foreign' });
  assert.equal(realm.craftingSystemId, 'system-a');
  assert.equal(store.listBySystem('system-a').length, 1);
});

test('update merges over the existing record, leaving untouched fields intact', async () => {
  const systemManager = makeSystemManager([{
    id: 'system-a',
    gatheringRealms: [{ id: 'r1', name: 'Old', description: 'keep me', secret: true, biomes: ['forest'] }]
  }]);
  const store = new GatheringRealmStore({ systemManager, randomID });
  const updated = await store.update('system-a', 'r1', { name: 'New', enabled: false });
  assert.equal(updated.name, 'New');
  assert.equal(updated.enabled, false);
  assert.equal(updated.description, 'keep me');
  assert.equal(updated.secret, true);
  assert.deepEqual(updated.biomes, ['forest']);
});

test('reorder reorders only the system realms and keeps the rest', async () => {
  const systemManager = makeSystemManager([{
    id: 'system-a',
    gatheringRealms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }, { id: 'r3', name: 'C' }]
  }]);
  const store = new GatheringRealmStore({ systemManager, randomID });
  const reordered = await store.reorder('system-a', ['r3', 'r1']);
  assert.deepEqual(reordered.map(r => r.id), ['r3', 'r1', 'r2']);
});

test('delete returns repair evidence from environment and party stores; never blocks', async () => {
  const systemManager = makeSystemManager([{
    id: 'system-a',
    gatheringRealms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }]
  }]);
  const store = new GatheringRealmStore({ systemManager, randomID });
  const environmentStore = {
    listBySystem: () => [
      { id: 'env1', name: 'Forest', craftingSystemId: 'system-a', includedRealmIds: ['r1'] },
      { id: 'env2', name: 'Cave', craftingSystemId: 'system-a', excludedRealmIds: ['r1'] }
    ]
  };
  const partyStore = {
    list: () => [{ id: 'p1', name: 'Heroes', currentRealmOverrides: { 'system-a': { mode: 'manual', realmIds: ['r1'] } } }]
  };
  const result = await store.delete('system-a', 'r1', { environmentStore, partyStore });
  assert.equal(result.deleted.id, 'r1');
  assert.equal(result.referencedBy.environments.length, 2);
  assert.equal(result.referencedBy.partyOverrides.length, 1);
  assert.equal(store.listBySystem('system-a').length, 1);
});

test('updateRealmSettings rejects unknown values at save boundary', async () => {
  const systemManager = makeSystemManager([{ id: 'system-a' }]);
  const store = new GatheringRealmStore({ systemManager, randomID });
  await assert.rejects(
    () => store.updateRealmSettings('system-a', { revealMode: 'bogus' }),
    GatheringRealmValidationError
  );
  const settings = await store.updateRealmSettings('system-a', { revealMode: 'alwaysVisible' });
  assert.equal(settings.revealMode, 'alwaysVisible');
});

test('updateRealmSettings round-trips the enabled flag (default false, then true, then back)', async () => {
  const systemManager = makeSystemManager([{ id: 'system-a' }]);
  const store = new GatheringRealmStore({ systemManager, randomID });

  // Default: a fresh system has the realm subsystem disabled.
  assert.equal(store.getRealmSettings('system-a').enabled, false);

  const enabled = await store.updateRealmSettings('system-a', { enabled: true });
  assert.equal(enabled.enabled, true);
  // Persisted and re-read identically.
  assert.equal(store.getRealmSettings('system-a').enabled, true);
  // Unrelated settings round-trip untouched by the enabled merge.
  assert.equal(enabled.revealMode, 'manual');
  assert.equal(enabled.modifierVisibility, 'visible');

  const disabled = await store.updateRealmSettings('system-a', { enabled: false });
  assert.equal(disabled.enabled, false);
  assert.equal(store.getRealmSettings('system-a').enabled, false);
});

test('updateRealmSettings rejects a non-boolean enabled at the save boundary', async () => {
  const systemManager = makeSystemManager([{ id: 'system-a' }]);
  const store = new GatheringRealmStore({ systemManager, randomID });
  await assert.rejects(
    () => store.updateRealmSettings('system-a', { enabled: 'yes' }),
    GatheringRealmValidationError
  );
});

test('realm settings (incl. enabled) survive an export/import round-trip through _normalizeSystem', async () => {
  const systemManager = makeSystemManager([{ id: 'system-a' }]);
  const store = new GatheringRealmStore({ systemManager, randomID });
  await store.updateRealmSettings('system-a', { enabled: true, revealMode: 'alwaysVisible', modifierVisibility: 'gmOnly' });

  // Simulate export: JSON clone of the normalized system. Simulate import: feed it
  // back through the system normalizer (mirrored here by normalizeSystem).
  const exported = JSON.parse(JSON.stringify(systemManager.getSystem('system-a')));
  const reimported = normalizeSystem({ ...exported, id: 'system-a' });

  assert.deepEqual(reimported.gatheringRealmSettings, {
    enabled: true,
    revealMode: 'alwaysVisible',
    modifierVisibility: 'gmOnly'
  });
});

test('create rejects an invalid modifier enum at the save boundary', async () => {
  const systemManager = makeSystemManager([{ id: 'system-a' }]);
  const store = new GatheringRealmStore({ systemManager, randomID });
  await assert.rejects(
    () => store.create('system-a', {
      name: 'Bad',
      modifiers: [{ id: 'm1', kind: 'bogus', operation: 'add', visibility: 'visible', value: 1 }]
    }),
    GatheringRealmValidationError
  );
});

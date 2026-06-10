import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRegionStore, GatheringRegionValidationError } from '../src/systems/GatheringRegionStore.js';
import { normalizeGatheringRegionList, normalizeGatheringRegionSettings } from '../src/systems/gatheringRegions.js';

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

// Minimal mirror of CraftingSystemManager normalization for regions only.
function normalizeSystem(system) {
  return {
    ...system,
    id: system.id,
    gatheringRegions: normalizeGatheringRegionList(system.gatheringRegions, {
      craftingSystemId: system.id,
      randomID: () => `gen-${Math.random().toString(36).slice(2, 8)}`
    }),
    gatheringRegionSettings: normalizeGatheringRegionSettings(system.gatheringRegionSettings)
  };
}

let counter = 0;
const randomID = () => `r-${++counter}`;

test('create persists a region with craftingSystemId self-healed to the owner', async () => {
  const systemManager = makeSystemManager([{ id: 'system-a' }]);
  const store = new GatheringRegionStore({ systemManager, randomID });
  const region = await store.create('system-a', { name: 'Verdant', craftingSystemId: 'foreign' });
  assert.equal(region.craftingSystemId, 'system-a');
  assert.equal(store.listBySystem('system-a').length, 1);
});

test('update merges over the existing record, leaving untouched fields intact', async () => {
  const systemManager = makeSystemManager([{
    id: 'system-a',
    gatheringRegions: [{ id: 'r1', name: 'Old', description: 'keep me', secret: true, biomes: ['forest'] }]
  }]);
  const store = new GatheringRegionStore({ systemManager, randomID });
  const updated = await store.update('system-a', 'r1', { name: 'New', enabled: false });
  assert.equal(updated.name, 'New');
  assert.equal(updated.enabled, false);
  assert.equal(updated.description, 'keep me');
  assert.equal(updated.secret, true);
  assert.deepEqual(updated.biomes, ['forest']);
});

test('reorder reorders only the system regions and keeps the rest', async () => {
  const systemManager = makeSystemManager([{
    id: 'system-a',
    gatheringRegions: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }, { id: 'r3', name: 'C' }]
  }]);
  const store = new GatheringRegionStore({ systemManager, randomID });
  const reordered = await store.reorder('system-a', ['r3', 'r1']);
  assert.deepEqual(reordered.map(r => r.id), ['r3', 'r1', 'r2']);
});

test('delete returns repair evidence from environment and party stores; never blocks', async () => {
  const systemManager = makeSystemManager([{
    id: 'system-a',
    gatheringRegions: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }]
  }]);
  const store = new GatheringRegionStore({ systemManager, randomID });
  const environmentStore = {
    listBySystem: () => [
      { id: 'env1', name: 'Forest', craftingSystemId: 'system-a', includedRegionIds: ['r1'] },
      { id: 'env2', name: 'Cave', craftingSystemId: 'system-a', excludedRegionIds: ['r1'] }
    ]
  };
  const partyStore = {
    list: () => [{ id: 'p1', name: 'Heroes', currentRegionOverrides: { 'system-a': { mode: 'manual', regionIds: ['r1'] } } }]
  };
  const result = await store.delete('system-a', 'r1', { environmentStore, partyStore });
  assert.equal(result.deleted.id, 'r1');
  assert.equal(result.referencedBy.environments.length, 2);
  assert.equal(result.referencedBy.partyOverrides.length, 1);
  assert.equal(store.listBySystem('system-a').length, 1);
});

test('updateRegionSettings rejects unknown values at save boundary', async () => {
  const systemManager = makeSystemManager([{ id: 'system-a' }]);
  const store = new GatheringRegionStore({ systemManager, randomID });
  await assert.rejects(
    () => store.updateRegionSettings('system-a', { revealMode: 'bogus' }),
    GatheringRegionValidationError
  );
  const settings = await store.updateRegionSettings('system-a', { revealMode: 'alwaysVisible' });
  assert.equal(settings.revealMode, 'alwaysVisible');
});

test('create rejects an invalid modifier enum at the save boundary', async () => {
  const systemManager = makeSystemManager([{ id: 'system-a' }]);
  const store = new GatheringRegionStore({ systemManager, randomID });
  await assert.rejects(
    () => store.create('system-a', {
      name: 'Bad',
      modifiers: [{ id: 'm1', kind: 'bogus', operation: 'add', visibility: 'visible', value: 1 }]
    }),
    GatheringRegionValidationError
  );
});

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GatheringRealmStore,
  GatheringRealmValidationError
} from '../src/systems/GatheringRealmStore.js';

/**
 * The realm store is WORLD scope since issue 1282: it persists the `travelConfig` setting
 * rather than writing realms onto a crafting system through `updateSystem`. Every method lost
 * its leading `systemId`, and `getRealmSettings()` no longer carries `enabled` — participation
 * is a crafting system's answer, not the world's.
 *
 * These drive the real store over an in-memory setting, so the normalizer it round-trips
 * through is exercised rather than stubbed.
 */
function makeStore(seed = null) {
  const settings = { travelConfig: seed };
  let counter = 0;
  const store = new GatheringRealmStore({
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => {
      settings[key] = value;
    },
    randomID: () => `r-${++counter}`
  });
  return { store, settings, persisted: () => settings.travelConfig };
}

test('create appends a realm to the world library, with no owning system', async () => {
  const { store } = makeStore();
  const realm = await store.create({ name: 'Verdant', craftingSystemId: 'foreign' });

  assert.equal(realm.name, 'Verdant');
  assert.equal(
    'craftingSystemId' in realm,
    false,
    'a world realm has no owner, and a supplied one must not survive'
  );
  assert.equal(store.list().length, 1);
});

test('update merges over the existing record, leaving untouched fields intact', async () => {
  const { store } = makeStore({
    realms: [{ id: 'r1', name: 'Old', description: 'keep me', secret: true, biomes: ['forest'] }]
  });
  const updated = await store.update('r1', { name: 'New', enabled: false });

  assert.equal(updated.name, 'New');
  assert.equal(updated.enabled, false);
  assert.equal(updated.description, 'keep me');
  assert.equal(updated.secret, true);
  assert.deepEqual(updated.biomes, ['forest']);
});

test('reorder moves the named realms and keeps the rest in place', async () => {
  const { store } = makeStore({
    realms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }, { id: 'r3', name: 'C' }]
  });
  const reordered = await store.reorder(['r3', 'r1']);
  assert.deepEqual(
    reordered.map((r) => r.id),
    ['r3', 'r1', 'r2']
  );
});

test('delete returns repair evidence from environment and party stores; never blocks', async () => {
  const { store } = makeStore({ realms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }] });
  // Environments from DIFFERENT crafting systems both cite the realm — which is the point of a
  // world library, and why the evidence is collected across the whole world rather than one
  // system's slice.
  const environmentStore = {
    list: () => [
      { id: 'env1', name: 'Forest', craftingSystemId: 'system-a', includedRealmIds: ['r1'] },
      { id: 'env2', name: 'Cave', craftingSystemId: 'system-b', excludedRealmIds: ['r1'] }
    ]
  };
  const partyStore = {
    list: () => [
      { id: 'p1', name: 'Heroes', currentRealmOverride: { mode: 'manual', realmIds: ['r1'] } }
    ]
  };

  const result = await store.delete('r1', { environmentStore, partyStore });
  assert.equal(result.deleted.id, 'r1');
  assert.equal(result.referencedBy.environments.length, 2);
  assert.deepEqual(
    result.referencedBy.environments.map((env) => env.craftingSystemId),
    ['system-a', 'system-b'],
    'the GM needs to see every system that cites the place they are deleting'
  );
  assert.equal(result.referencedBy.partyOverrides.length, 1);
  assert.equal(store.list().length, 1);
});

test('updateRealmSettings rejects unknown values at the save boundary', async () => {
  const { store } = makeStore();
  await assert.rejects(
    () => store.updateRealmSettings({ revealMode: 'bogus' }),
    GatheringRealmValidationError
  );
  const settings = await store.updateRealmSettings({ revealMode: 'alwaysVisible' });
  assert.equal(settings.revealMode, 'alwaysVisible');
});

test('realm settings are WORLD behaviour only — never a participation flag', async () => {
  // `enabled` deliberately has no home here. A store that answered it is how the admin store's
  // override predicate came to read the per-system gate through the wrong object.
  const { store } = makeStore();
  const settings = await store.updateRealmSettings({ modifierVisibility: 'gmOnly' });

  assert.deepEqual(Object.keys(settings).sort(), ['modifierVisibility', 'revealMode']);
  assert.equal(settings.modifierVisibility, 'gmOnly');
  assert.equal(settings.revealMode, 'manual', 'the untouched scalar round-trips');
});

test('the world config round-trips through a save and re-read', async () => {
  const { store, persisted } = makeStore();
  await store.updateRealmSettings({ revealMode: 'alwaysVisible', modifierVisibility: 'gmOnly' });
  await store.create({ id: 'r1', name: 'Verdant' });

  assert.equal(persisted().revealMode, 'alwaysVisible');
  assert.equal(persisted().modifierVisibility, 'gmOnly');
  assert.deepEqual(
    persisted().realms.map((r) => r.id),
    ['r1']
  );
  assert.equal(store.get().revealMode, 'alwaysVisible', 'and the cache agrees with the setting');
});

test('create rejects an invalid modifier enum at the save boundary', async () => {
  const { store } = makeStore();
  await assert.rejects(
    () =>
      store.create({
        name: 'Bad',
        modifiers: [{ id: 'm1', kind: 'bogus', operation: 'add', visibility: 'visible', value: 1 }]
      }),
    GatheringRealmValidationError
  );
});

test('setSceneRegionLink moves a region between realms in ONE write', async () => {
  // The caller used to await one update per realm in a loop, which against a setting-backed
  // store loses the earlier iterations. One method, one write.
  const { store, settings } = makeStore({
    realms: [
      { id: 'r1', name: 'A', sceneMappings: [{ sceneUuid: 'S', sceneRegionUuid: 'S.R1' }] },
      { id: 'r2', name: 'B' }
    ]
  });
  let writes = 0;
  const originalSet = store.setSetting;
  store.setSetting = async (key, value) => {
    writes += 1;
    return originalSet(key, value);
  };

  await store.setSceneRegionLink('S.R1', 'r2', { sceneUuid: 'S' });

  assert.equal(writes, 1, 'one write, not one per realm');
  const realms = store.list();
  assert.deepEqual(realms.find((r) => r.id === 'r1').sceneMappings, [], 'stripped from the old');
  assert.equal(realms.find((r) => r.id === 'r2').sceneMappings[0].sceneRegionUuid, 'S.R1');
  assert.equal(settings.travelConfig.realms.length, 2);
});

test('setSceneRegionLink with no realm unlinks the region entirely', async () => {
  const { store } = makeStore({
    realms: [{ id: 'r1', name: 'A', sceneMappings: [{ sceneUuid: 'S', sceneRegionUuid: 'S.R1' }] }]
  });
  await store.setSceneRegionLink('S.R1', '');
  assert.deepEqual(store.list()[0].sceneMappings, []);
});

test('the cache is published BEFORE the write, so overlapping edits cannot clobber', async () => {
  // Callers read-modify-write. Publish late and a second edit starting mid-flight reads the
  // pre-first-edit config. The per-system store this replaced was safe by construction.
  const settings = { travelConfig: { realms: [] } };
  const store = new GatheringRealmStore({
    getSetting: (key) => settings[key] ?? null,
    setSetting: (key, value) =>
      new Promise((resolve) => {
        setTimeout(() => {
          settings[key] = value;
          resolve(value);
        }, 20);
      }),
    randomID: () => 'gen'
  });

  const first = store.updateRealmSettings({ revealMode: 'alwaysVisible' });
  assert.equal(
    store.get().revealMode,
    'alwaysVisible',
    'the in-flight edit must already be visible to the next reader'
  );
  const second = store.updateRealmSettings({ modifierVisibility: 'gmOnly' });
  await Promise.all([first, second]);

  assert.equal(settings.travelConfig.revealMode, 'alwaysVisible', 'the first edit survived');
  assert.equal(settings.travelConfig.modifierVisibility, 'gmOnly');
});

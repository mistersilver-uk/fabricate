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
function makeStore(seed = null, { warn = () => {} } = {}) {
  const settings = { travelConfig: seed };
  let counter = 0;
  const store = new GatheringRealmStore({
    getSetting: (key) => settings[key] ?? null,
    setSetting: async (key, value) => {
      settings[key] = value;
    },
    randomID: () => `r-${++counter}`,
    warn
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

/**
 * The environments a realm delete has to repair (issue 1848). Two crafting systems cite the
 * same world realm, one by inclusion and one by exclusion, and each also cites a realm that
 * survives — so a cascade that dropped the whole list rather than the one id would show.
 */
function citingEnvironments() {
  return [
    {
      id: 'env1',
      name: 'Forest',
      craftingSystemId: 'system-a',
      includedRealmIds: ['r1', 'r2'],
      excludedRealmIds: []
    },
    {
      id: 'env2',
      name: 'Cave',
      craftingSystemId: 'system-b',
      includedRealmIds: [],
      excludedRealmIds: ['r1']
    },
    { id: 'env3', name: 'Plain', craftingSystemId: 'system-a', includedRealmIds: ['r2'] }
  ];
}

function makeEnvironmentStore({ save = null, update = null } = {}) {
  let environments = citingEnvironments();
  const store = {
    list: () => JSON.parse(JSON.stringify(environments))
  };
  if (save !== 'omit') {
    store.save = async (next) => {
      if (typeof save === 'function') return save(next);
      environments = JSON.parse(JSON.stringify(next));
      return environments;
    };
  }
  if (update !== 'omit') {
    const updates = [];
    store.update = async (id, patch) => {
      updates.push({ id, patch });
      environments = environments.map((env) => (env.id === id ? { ...env, ...patch } : env));
      return environments.find((env) => env.id === id) ?? null;
    };
    store.updates = updates;
  }
  return { store, current: () => environments };
}

test('delete returns repair evidence from environment and party stores; never blocks', async () => {
  // T3. A store that can only be READ is still a legal collaborator: the evidence is collected,
  // the realm goes, and nothing is repaired because there is no seam to repair it through.
  const { store } = makeStore({ realms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }] });
  // Environments from DIFFERENT crafting systems both cite the realm — which is the point of a
  // world library, and why the evidence is collected across the whole world rather than one
  // system's slice.
  const environmentStore = { list: () => citingEnvironments() };
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
  assert.equal(result.repaired.environments, 0, 'nothing to write through, so nothing repaired');
  assert.equal(store.list().length, 1, 'the delete never blocks on the repair it cannot do');
});

test('delete strips the realm from every citing environment in ONE list write', async () => {
  // T1. The defect this fixes: the realm left the library and the ids naming it stayed behind,
  // which made every subsequent environment save fail validation.
  const { store } = makeStore({ realms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }] });
  const saves = [];
  const environmentStore = makeEnvironmentStore({
    save: async (next) => {
      saves.push(next);
      return next;
    }
  });

  const result = await store.delete('r1', { environmentStore: environmentStore.store });

  assert.equal(saves.length, 1, 'environments persist as one world list, so one write');
  assert.deepEqual(
    saves[0].map((env) => [env.includedRealmIds, env.excludedRealmIds]),
    [[['r2'], []], [[], []], [['r2'], undefined]],
    'only the deleted id is dropped; a record that never cited it keeps its exact shape'
  );
  assert.equal(result.repaired.environments, 2, 'env3 cited no deleted realm and is not counted');
  assert.equal(store.list().length, 1);
});

test('delete falls back to one update per citing environment when the store offers no save', async () => {
  // T2. Not every collaborator exposes a list write; a per-record seam still repairs the world.
  const { store } = makeStore({ realms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }] });
  const environmentStore = makeEnvironmentStore({ save: 'omit' });

  const result = await store.delete('r1', { environmentStore: environmentStore.store });

  assert.deepEqual(
    environmentStore.store.updates.map((u) => u.id),
    ['env1', 'env2'],
    'only the environments that cited the deleted realm are rewritten'
  );
  assert.deepEqual(environmentStore.store.updates[0].patch, {
    includedRealmIds: ['r2'],
    excludedRealmIds: []
  });
  assert.equal(result.repaired.environments, 2);
  assert.equal(store.list().length, 1);
});

test('a rejected environment write is logged and the realm is deleted anyway', async () => {
  // T4. The GM confirmed a deletion. Failing to repair the references must not strand them with
  // a realm they asked to be rid of — the environment store prunes the rest on its next save.
  const warnings = [];
  const { store } = makeStore(
    { realms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }] },
    { warn: (...args) => warnings.push(args) }
  );
  const environmentStore = makeEnvironmentStore({
    save: async () => {
      throw new Error('some other environment is invalid');
    }
  });

  const result = await store.delete('r1', { environmentStore: environmentStore.store });

  assert.equal(result.deleted.id, 'r1');
  assert.equal(store.list().length, 1, 'the realm is gone regardless');
  assert.equal(result.repaired.environments, 0, 'nothing was written, so nothing is claimed');
  assert.equal(warnings.length, 1, 'the failure is reported rather than swallowed');
});

test('a partial per-environment fallback reports the environments actually written', async () => {
  // A fallback that fails on the second record has still repaired the first; the count says so.
  const warnings = [];
  const { store } = makeStore(
    { realms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }] },
    { warn: (...args) => warnings.push(args) }
  );
  const environmentStore = makeEnvironmentStore({ save: 'omit' });
  const realUpdate = environmentStore.store.update;
  environmentStore.store.update = async (id, patch) => {
    if (id === 'env2') throw new Error('env2 is invalid for an unrelated reason');
    return realUpdate(id, patch);
  };

  const result = await store.delete('r1', { environmentStore: environmentStore.store });

  assert.equal(store.list().length, 1, 'the realm is gone regardless');
  assert.equal(result.repaired.environments, 1, 'one environment was written before the failure');
  assert.equal(warnings.length, 1);
});

test('an unreadable environment list never blocks the delete', async () => {
  // Both the evidence read and the repair read sit behind the same promise: the GM asked for a
  // deletion, and a collaborator that cannot even list is no reason to refuse it.
  const warnings = [];
  const { store } = makeStore(
    { realms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }] },
    { warn: (...args) => warnings.push(args) }
  );
  const environmentStore = {
    list: () => {
      throw new Error('setting not registered');
    },
    save: async () => {
      throw new Error('never reached');
    }
  };

  const result = await store.delete('r1', { environmentStore });

  assert.equal(result.deleted.id, 'r1');
  assert.equal(store.list().length, 1, 'the realm is gone regardless');
  assert.deepEqual(result.referencedBy.environments, []);
  assert.equal(result.repaired.environments, 0);
  assert.equal(warnings.length, 2, 'both the evidence read and the repair read are reported');
});

test('the environment write happens while the realm is still in the library', async () => {
  // T5. Order is the whole point: the environment store validates realm ids against the world
  // library on every write, so a rewrite issued after the removal would be rejected by the very
  // deletion it exists to repair.
  const { store } = makeStore({ realms: [{ id: 'r1', name: 'A' }, { id: 'r2', name: 'B' }] });
  let realmsDuringWrite = null;
  const environmentStore = {
    list: () => citingEnvironments(),
    save: async (next) => {
      realmsDuringWrite = store.list().map((realm) => realm.id);
      return next;
    }
  };

  await store.delete('r1', { environmentStore });

  assert.deepEqual(realmsDuringWrite, ['r1', 'r2'], 'the realm being deleted is still resolvable');
  assert.deepEqual(
    store.list().map((realm) => realm.id),
    ['r2'],
    'and it is gone once the repair has landed'
  );
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

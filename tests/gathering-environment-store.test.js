import test from 'node:test';
import assert from 'node:assert/strict';

import { SETTING_KEYS } from '../src/config/settings.js';
import { GatheringEnvironmentStore } from '../src/systems/GatheringEnvironmentStore.js';

function makeMemoryStore({
  saved = [],
  gatheringConfig = {},
  systems = [
    { id: 'system-a', features: { gathering: true }, components: [{ id: 'component-gem', difficulty: 1 }] },
    { id: 'system-disabled', features: { gathering: false } }
  ],
  ids = ['env-new', 'task-new', 'env-copy', 'task-copy-1', 'task-copy-2'],
  runCleanup = null
} = {}) {
  const settings = new Map([
    [SETTING_KEYS.GATHERING_ENVIRONMENTS, saved],
    [SETTING_KEYS.GATHERING_CONFIG, gatheringConfig]
  ]);
  const writes = [];
  const nextIds = [...ids];
  const store = new GatheringEnvironmentStore({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
      writes.push({ key, value });
      return value;
    },
    getSystems: () => systems,
    randomID: () => {
      const next = nextIds.shift();
      if (!next) throw new Error('test ID queue exhausted');
      return next;
    },
    runCleanup
  });

  return { store, settings, writes };
}

function routedTask(overrides = {}) {
  return {
    id: 'task-a',
    name: 'Gather Iron',
    description: 'Mine a useful vein.',
    img: 'icons/svg/item-bag.svg',
    enabled: true,
    resolutionMode: 'routed',
    resultSelection: {
      provider: 'macroOutcome',
      macroUuid: 'Macro.outcome'
    },
    resultGroups: [
      {
        id: 'group-iron',
        name: 'Iron',
        results: [
          { id: 'result-iron', componentId: 'component-iron', quantity: 1 }
        ]
      }
    ],
    ...overrides
  };
}

function progressiveTask(overrides = {}) {
  return {
    id: 'task-progress',
    name: 'Pan Silt',
    description: '',
    img: 'icons/svg/item-bag.svg',
    enabled: true,
    resolutionMode: 'progressive',
    check: {
      provider: 'dnd5e',
      formula: '@skills.sur.mod',
      threshold: '12'
    },
    progressive: {
      awardMode: 'partial'
    },
    resultGroups: [
      {
        id: 'group-gems',
        name: 'Gems',
        results: [
          { id: 'result-gem', componentId: 'component-gem', quantity: 1, difficulty: 1 }
        ]
      }
    ],
    ...overrides
  };
}

function environment(overrides = {}) {
  return {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Old Mine',
    description: 'An abandoned mine.',
    enabled: true,
    selectionMode: 'targeted',
    sceneUuid: 'Scene.stale',
    // Tasks come from the system library (matched in); an environment is a valid
    // task source via its enabled/forced library-task ids.
    enabledTaskIds: ['lib-task'],
    ...overrides
  };
}

test('create, update, list, reorder, and delete operate by crafting system', async () => {
  const { store, settings } = makeMemoryStore({
    saved: [
      environment({ id: 'env-1', name: 'One' }),
      environment({ id: 'env-2', name: 'Two' }),
      environment({ id: 'env-other', craftingSystemId: 'system-disabled', name: 'Other' })
    ]
  });
  store.load();

  const created = await store.create(environment({ id: undefined, name: 'Three' }));
  assert.equal(created.id, 'env-new');

  const updated = await store.update('env-1', { name: 'One Updated' });
  assert.equal(updated.name, 'One Updated');

  await store.reorder('system-a', ['env-new', 'env-1', 'env-2']);
  assert.deepEqual(store.listBySystem('system-a').map(env => env.id), ['env-new', 'env-1', 'env-2']);

  await store.delete('env-2');
  assert.deepEqual(store.listBySystem('system-a').map(env => env.id), ['env-new', 'env-1']);
  assert.deepEqual(settings.get(SETTING_KEYS.GATHERING_ENVIRONMENTS).map(env => env.id), ['env-new', 'env-1', 'env-other']);
});

test('targeted environments may compose gathering task-library records by enabledTaskIds', async () => {
  const { store } = makeMemoryStore();
  store.load();

  const created = await store.create(environment({
    id: 'env-library',
    tasks: [],
    enabledTaskIds: ['task-library-a', 'task-library-b']
  }));
  assert.deepEqual(created.enabledTaskIds, ['task-library-a', 'task-library-b']);
});

test('validation permits composition-only environments backed by matching library tasks or forced task ids', async () => {
  const { store } = makeMemoryStore({
    gatheringConfig: {
      systems: {
        'system-a': {
          tasks: [
            { id: 'task-cave', name: 'Mine Ore', enabled: true, biomes: ['cave'], dropRows: [] },
            { id: 'task-disabled', name: 'Disabled', enabled: false, biomes: ['cave'], dropRows: [] },
            { id: 'task-desert', name: 'Dig Sand', enabled: true, biomes: ['desert'], dropRows: [] }
          ]
        }
      }
    }
  });
  store.load();

  const automatic = await store.create(environment({
    id: 'env-automatic-library',
    enabledTaskIds: [],
    compositionMode: 'automatic',
    biomes: ['cave']
  }));
  assert.deepEqual(automatic.enabledTaskIds, []);

  const manualForced = await store.create(environment({
    id: 'env-manual-forced',
    enabledTaskIds: [],
    compositionMode: 'manual',
    forcedTaskIds: ['task-desert']
  }));
  assert.deepEqual(manualForced.forcedTaskIds, ['task-desert']);

  const unmatched = store.validate(environment({
    id: 'env-unmatched-library',
    enabledTaskIds: [],
    compositionMode: 'automatic',
    biomes: ['swamp']
  }));
  assert.equal(unmatched.valid, false);
  assert.match(unmatched.errors.join('\n'), /targeted selection requires at least one task/);
});

test('drop-rate adjustments normalize to non-zero integer deltas and validate raw ranges', async () => {
  const { store } = makeMemoryStore();
  store.load();

  const created = await store.create(environment({
    id: 'env-adjustments',
    enabledTaskIds: ['task-library-a'],
    taskDropRateAdjustments: {
      ' task-library-a ': {
        ' drop-a ': 15,
        'drop-zero': 0
      },
      'task-empty': {
        'drop-empty': 0
      }
    },
    taskDropRateAdjustmentsEnabled: {
      ' task-library-a ': false,
      'task-library-default': true
    },
    eventDropRateAdjustments: {
      ' event-a ': -20,
      'event-zero': 0
    },
    eventDropRateAdjustmentsEnabled: {
      ' event-a ': false,
      'event-default': true
    }
  }));

  assert.deepEqual(created.taskDropRateAdjustments, {
    'task-library-a': { 'drop-a': 15 }
  });
  assert.deepEqual(created.taskDropRateAdjustmentsEnabled, {
    'task-library-a': false
  });
  assert.deepEqual(created.eventDropRateAdjustments, {
    'event-a': -20
  });
  assert.deepEqual(created.eventDropRateAdjustmentsEnabled, {
    'event-a': false
  });

  const invalid = store.validate(environment({
    id: 'env-invalid-adjustments',
    taskDropRateAdjustments: { 'task-library-a': { 'drop-a': 101 } },
    taskDropRateAdjustmentsEnabled: { 'task-library-a': 'false' },
    eventDropRateAdjustments: { 'event-a': -101 },
    eventDropRateAdjustmentsEnabled: { 'event-a': 'false' }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /taskDropRateAdjustments\.task-library-a\.drop-a must be an integer from -100 to 100/);
  assert.match(invalid.errors.join('\n'), /taskDropRateAdjustmentsEnabled\.task-library-a must be a boolean/);
  assert.match(invalid.errors.join('\n'), /eventDropRateAdjustments\.event-a must be an integer from -100 to 100/);
  assert.match(invalid.errors.join('\n'), /eventDropRateAdjustmentsEnabled\.event-a must be a boolean/);
});

test('save rejects an invalid selection mode without writing settings', async () => {
  const { store, writes } = makeMemoryStore();

  await assert.rejects(
    () => store.save([environment({ selectionMode: 'nonsense' })]),
    /selectionMode/
  );
  assert.equal(writes.length, 0);
});

test('duplicate deep-clones with a fresh environment id and reset node pools', async () => {
  const source = environment({
    id: 'env-source',
    nodeRuntime: { 'lib-task': { enabled: true, max: 3, current: 1, depletionTiming: 'onStart', respawn: { policy: 'manual' } } }
  });
  const { store } = makeMemoryStore({ saved: [source], ids: ['env-copy'] });
  store.load();

  const copy = await store.duplicate('env-source', { name: 'Old Mine Copy' });
  assert.equal(copy.id, 'env-copy');
  assert.equal(copy.name, 'Old Mine Copy');
  assert.deepEqual(copy.nodeRuntime, {}, 'a duplicate starts with full pools');

  // The source's runtime pool is untouched.
  assert.equal(store.get('env-source').nodeRuntime['lib-task'].current, 1);
});

test('delete environment invokes the environment cleanup hook', async () => {
  const calls = [];
  const runCleanup = {
    removeRunsForSystem: async systemId => calls.push(['system', systemId]),
    removeRunsForEnvironment: async environmentId => calls.push(['environment', environmentId])
  };
  const { store } = makeMemoryStore({
    saved: [environment({ id: 'env-cleanup' })],
    runCleanup
  });
  store.load();

  await store.delete('env-cleanup');
  assert.deepEqual(calls, [['environment', 'env-cleanup']]);
});

test('delete environment defers cleanup until remaining records validate and persist', async () => {
  const calls = [];
  const { store, writes } = makeMemoryStore({
    saved: [
      environment({ id: 'env-delete-me' }),
      environment({ id: 'env-invalid-remaining', craftingSystemId: 'missing-system' })
    ],
    runCleanup: {
      removeRunsForEnvironment: async environmentId => calls.push(environmentId)
    }
  });
  store.load();

  await assert.rejects(
    () => store.delete('env-delete-me'),
    /unresolved craftingSystemId/
  );

  assert.deepEqual(calls, []);
  assert.equal(writes.length, 0);
  assert.ok(store.get('env-delete-me'));
});

test('cleanup by crafting system removes owned environments and invokes system cleanup', async () => {
  const calls = [];
  const { store } = makeMemoryStore({
    saved: [
      environment({ id: 'env-a', craftingSystemId: 'system-a' }),
      environment({ id: 'env-b', craftingSystemId: 'system-disabled' })
    ],
    runCleanup: {
      removeRunsForSystem: async systemId => calls.push(systemId)
    }
  });
  store.load();

  await store.cleanupByCraftingSystem('system-a');
  assert.deepEqual(store.list().map(env => env.id), ['env-b']);
  assert.deepEqual(calls, ['system-a']);
});

test('cleanup by crafting system defers run cleanup until remaining records validate and persist', async () => {
  const calls = [];
  const { store, writes } = makeMemoryStore({
    saved: [
      environment({ id: 'env-owned', craftingSystemId: 'system-a' }),
      environment({ id: 'env-invalid-remaining', craftingSystemId: 'missing-system' })
    ],
    runCleanup: {
      removeRunsForSystem: async systemId => calls.push(systemId)
    }
  });
  store.load();

  await assert.rejects(
    () => store.cleanupByCraftingSystem('system-a'),
    /unresolved craftingSystemId/
  );

  assert.deepEqual(calls, []);
  assert.equal(writes.length, 0);
  assert.deepEqual(store.list().map(env => env.id), ['env-owned', 'env-invalid-remaining']);
});

test('disabled gathering feature preserves records but explicit visible query excludes them', () => {
  const { store } = makeMemoryStore({
    saved: [
      environment({ id: 'env-enabled', craftingSystemId: 'system-a' }),
      environment({ id: 'env-disabled', craftingSystemId: 'system-disabled' })
    ]
  });
  store.load();

  assert.deepEqual(store.listBySystem('system-disabled').map(env => env.id), ['env-disabled']);
  assert.deepEqual(
    store.listBySystem('system-disabled', { includeDisabledFeature: false }).map(env => env.id),
    []
  );
});

test('stale sceneUuid is preserved without scene resolution', async () => {
  const { store, settings } = makeMemoryStore({
    saved: [environment({ id: 'env-scene', sceneUuid: 'Scene.no-longer-exists' })]
  });

  const loaded = store.load();
  assert.equal(loaded[0].sceneUuid, 'Scene.no-longer-exists');

  await store.save();
  assert.equal(settings.get(SETTING_KEYS.GATHERING_ENVIRONMENTS)[0].sceneUuid, 'Scene.no-longer-exists');
});

test('preserves a per-environment nodeRuntime map through update and resets it on duplicate', () => {
  const { store } = makeMemoryStore({
    saved: [environment({ id: 'env-nodes', name: 'Mines' })],
    ids: ['env-copy', 'task-copy-1']
  });
  store.load();

  // Default environments have an empty nodeRuntime.
  assert.deepEqual(store.get('env-nodes').nodeRuntime, {});

  // A runtime pool survives update with its current preserved (not reset to max).
  return store.update('env-nodes', {
    nodeRuntime: { 'lib-1': { enabled: true, max: 4, current: 1, depletionTiming: 'onStart', respawn: { policy: 'manual' } } }
  }).then(async (updated) => {
    assert.equal(updated.nodeRuntime['lib-1'].current, 1);
    assert.equal(updated.nodeRuntime['lib-1'].max, 4);

    const copy = await store.duplicate('env-nodes', { name: 'Mines Copy' });
    assert.deepEqual(copy.nodeRuntime, {}, 'a duplicate starts with full pools');
  });
});

test('normalizes the four location availability id lists; legacy region/biomes preserved', async () => {
  const { store } = makeMemoryStore({ ids: ['env-loc', 'task-loc'] });
  store.load();
  const created = await store.create(environment({
    id: undefined,
    name: 'Located',
    region: 'forest',
    biomes: ['Forest', 'forest'],
    includedRegionIds: ['r1', 'r1', ''],
    excludedRegionIds: ['r2'],
    includedBiomeIds: ['Temperate', 'temperate'],
    excludedBiomeIds: ['Arid']
  }));
  assert.deepEqual(created.includedRegionIds, ['r1']);
  assert.deepEqual(created.excludedRegionIds, ['r2']);
  assert.deepEqual(created.includedBiomeIds, ['temperate']);
  assert.deepEqual(created.excludedBiomeIds, ['arid']);
  // Legacy display metadata untouched.
  assert.equal(created.region, 'forest');
  assert.deepEqual(created.biomes, ['forest']);
});

test('save-time validation rejects an includedRegionId not present on the owning system', async () => {
  const { store } = makeMemoryStore({
    systems: [
      { id: 'system-a', features: { gathering: true }, components: [{ id: 'component-gem', difficulty: 1 }], gatheringRegions: [{ id: 'known' }] },
      { id: 'system-disabled', features: { gathering: false } }
    ],
    ids: ['env-bad', 'task-bad']
  });
  store.load();
  await assert.rejects(
    () => store.create(environment({ id: undefined, name: 'Bad', includedRegionIds: ['unknown'] })),
    /unknown region/
  );
  // A known region id passes.
  const ok = await store.create(environment({ id: undefined, name: 'Good', includedRegionIds: ['known'] }));
  assert.deepEqual(ok.includedRegionIds, ['known']);
});

test('load never throws on a stale includedRegionId (validation is save-time only)', () => {
  const { store } = makeMemoryStore({
    saved: [environment({ id: 'env-stale', includedRegionIds: ['gone'] })],
    systems: [
      { id: 'system-a', features: { gathering: true }, components: [], gatheringRegions: [{ id: 'known' }] },
      { id: 'system-disabled', features: { gathering: false } }
    ]
  });
  // load() normalizes without validating; no throw, stale id preserved.
  const loaded = store.load();
  assert.deepEqual(loaded.find(e => e.id === 'env-stale').includedRegionIds, ['gone']);
});

// ---------------------------------------------------------------------------
// Legacy-acceptance fallback on read (imports bypass the 1.0.0 startup migration)
// ---------------------------------------------------------------------------

test('_normalizeEnvironment accepts legacy hazard-schema keys and values on read', () => {
  const { store } = makeMemoryStore();
  const normalized = store._normalizeEnvironment({
    id: 'env-legacy',
    craftingSystemId: 'system-a',
    enabledHazardIds: ['h1'],
    disabledHazardIds: ['h2'],
    forcedHazardIds: ['h3'],
    hazardOrder: ['h1', 'h3'],
    hazardSelectionMode: 'highestRankedDrop',
    hazardPolicy: 'failureWithHazard',
    hazardDropRateAdjustments: { h1: 20 },
    hazardDropRateAdjustmentsEnabled: { h1: false }
  });
  assert.deepEqual(normalized.enabledEventIds, ['h1']);
  assert.deepEqual(normalized.disabledEventIds, ['h2']);
  assert.deepEqual(normalized.forcedEventIds, ['h3']);
  assert.deepEqual(normalized.eventOrder, ['h1', 'h3']);
  assert.equal(normalized.eventSelectionMode, 'highestRankedDrop');
  assert.equal(normalized.eventPolicy, 'failureWithEvent', 'legacy policy value coerced');
  assert.deepEqual(normalized.eventDropRateAdjustments, { h1: 20 });
  assert.deepEqual(normalized.eventDropRateAdjustmentsEnabled, { h1: false });
});

test('_normalizeEnvironment defaults an unknown event policy to successWithEvent', () => {
  const { store } = makeMemoryStore();
  const normalized = store._normalizeEnvironment({ craftingSystemId: 'system-a', hazardPolicy: 'nonsense' });
  assert.equal(normalized.eventPolicy, 'successWithEvent');
});

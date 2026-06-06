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
    catalysts: [],
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
    catalysts: [],
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
    tasks: [routedTask()],
    ...overrides
  };
}

test('load normalizes records and save writes canonical setting data only', async () => {
  const raw = [
    {
      id: 'env-a',
      craftingSystemId: 'system-a',
      name: ' Old Mine ',
      enabled: true,
      selectionMode: 'targeted',
      sceneUuid: 'Scene.stale',
      tasks: [
        {
          id: 'task-a',
          name: 'Gather Iron',
          resolutionMode: 'routed',
          ingredientSet: { invalid: true },
          IngredientSet: { invalid: true },
          catalysts: [{ componentId: 'catalyst-a', systemItemId: 'legacy-catalyst' }],
          resultSelection: {
            provider: 'rollTableOutcome',
            rollTableUuid: 'RollTable.iron',
            ingredientSetId: 'legacy-route'
          },
          resultGroups: [
            {
              id: 'group-iron',
              name: 'Iron',
              results: [
                { id: 'result-iron', systemItemId: 'component-iron', quantity: 2 }
              ]
            }
          ]
        }
      ],
      uiState: { dirty: true }
    }
  ];
  const { store, writes } = makeMemoryStore({ saved: raw });

  const loaded = store.load();
  assert.equal(loaded[0].name, 'Old Mine');
  assert.equal(loaded[0].sceneUuid, 'Scene.stale');
  assert.equal(loaded[0].tasks[0].resultGroups[0].results[0].componentId, 'component-iron');
  assert.equal('difficulty' in loaded[0].tasks[0].resultGroups[0].results[0], false);

  await store.save();
  const saved = writes.at(-1).value;
  assert.equal(writes.at(-1).key, SETTING_KEYS.GATHERING_ENVIRONMENTS);
  assert.equal(saved[0].sceneUuid, 'Scene.stale');
  assert.equal(saved[0].tasks[0].resultGroups[0].results[0].componentId, 'component-iron');
  assert.equal('systemItemId' in saved[0].tasks[0].resultGroups[0].results[0], false);
  assert.equal('difficulty' in saved[0].tasks[0].resultGroups[0].results[0], false);
  assert.equal('ingredientSet' in saved[0].tasks[0], false);
  assert.equal('IngredientSet' in saved[0].tasks[0], false);
  assert.equal('uiState' in saved[0], false);
});

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

test('validation covers selection modes, providers, progressive requirements, groups, time, and missing systems', () => {
  const { store } = makeMemoryStore();
  store.load();

  const invalid = [
    environment({ craftingSystemId: 'missing-system' }),
    environment({ selectionMode: 'targeted', compositionMode: 'manual', tasks: [] }),
    environment({ selectionMode: 'blind', compositionMode: 'manual', tasks: [] }),
    environment({ selectionMode: 'other' }),
    environment({
      tasks: [routedTask({ resultSelection: { provider: 'macroOutcome' } })]
    }),
    environment({
      tasks: [routedTask({ resultSelection: { provider: 'rollTableOutcome' } })]
    }),
    environment({
      tasks: [routedTask({ resultSelection: { provider: 'ingredientSet' } })]
    }),
    environment({
      tasks: [routedTask({
        resultGroups: [
          { id: 'a', name: 'Iron', results: [{ id: 'ra', componentId: 'a', quantity: 1 }] },
          { id: 'b', name: ' iron ', results: [{ id: 'rb', componentId: 'b', quantity: 1 }] }
        ]
      })]
    }),
    environment({
      tasks: [routedTask({
        resultGroups: [{ id: 'failure', name: 'Fail', results: [{ id: 'r', componentId: 'a', quantity: 1 }] }]
      })]
    }),
    environment({
      tasks: [progressiveTask({ check: null })]
    }),
    environment({
      tasks: [progressiveTask({ progressive: null })]
    }),
    environment({
      tasks: [progressiveTask({
        resultGroups: [
          { id: 'one', name: 'One', results: [{ id: 'r1', componentId: 'a', quantity: 1, difficulty: 1 }] },
          { id: 'two', name: 'Two', results: [{ id: 'r2', componentId: 'b', quantity: 1, difficulty: 1 }] }
        ]
      })]
    }),
    environment({
      tasks: [progressiveTask({
        resultGroups: [{ id: 'empty', name: 'Empty', results: [] }]
      })]
    }),
    environment({
      tasks: [progressiveTask({
        resultGroups: [{ id: 'hard', name: 'Hard', results: [{ id: 'r', componentId: 'a', quantity: 1, difficulty: 0 }] }]
      })]
    }),
    environment({
      tasks: [progressiveTask({
        progressive: { awardMode: 'bogus' }
      })]
    }),
    environment({
      tasks: [progressiveTask({
        resultGroups: [{ id: 'missing', name: 'Missing', results: [{ id: 'r', componentId: 'missing-component', quantity: 1 }] }]
      })]
    }),
    environment({
      tasks: [progressiveTask({
        resultGroups: [{ id: 'missing-inline', name: 'Missing Inline', results: [{ id: 'r', componentId: 'missing-component', quantity: 1, difficulty: 1 }] }]
      })]
    }),
    environment({
      tasks: [progressiveTask({
        resultGroups: [{ id: 'no-difficulty', name: 'No Difficulty', results: [{ id: 'r', componentId: 'component-no-difficulty', quantity: 1 }] }]
      })]
    }),
    environment({
      tasks: [progressiveTask({
        resultGroups: [{ id: 'no-source', name: 'No Source', results: [{ id: 'r', quantity: 1 }] }]
      })]
    }),
    environment({
      tasks: [progressiveTask({ check: { provider: 'macro' } })]
    }),
    environment({
      tasks: [progressiveTask({ check: { provider: 'dnd5e', threshold: '12' } })]
    }),
    environment({
      tasks: [progressiveTask({ visibility: { provider: 'pf2e', formula: '1' } })]
    }),
    environment({
      tasks: [routedTask({ timeRequirement: { minutes: 0, hours: 0 } })]
    }),
    environment({
      tasks: [routedTask({ IngredientSet: {}, ingredientSet: {} })]
    })
  ];

  for (const candidate of invalid) {
    const result = store.validate(candidate);
    assert.equal(result.valid, false, `expected invalid: ${JSON.stringify(candidate)}`);
    assert.ok(result.errors.length > 0);
  }

  assert.equal(store.validate(environment({ tasks: [routedTask()] })).valid, true);
  assert.equal(store.validate(environment({ tasks: [progressiveTask()] })).valid, true);
  assert.equal(store.validate(environment({ selectionMode: 'blind', tasks: [routedTask({ id: 'a' }), routedTask({ id: 'b' })] })).valid, true);
  assert.equal(store.validate(environment({ compositionMode: 'automatic', tasks: [] })).valid, false);
  assert.equal(store.validate(environment({ compositionMode: 'manual', tasks: [], forcedTaskIds: ['task-library-a'] })).valid, true);
});

test('targeted environments may compose gathering task-library records by enabledTaskIds', async () => {
  const { store } = makeMemoryStore();
  store.load();

  const created = await store.create(environment({
    id: 'env-library',
    tasks: [],
    enabledTaskIds: ['task-library-a', 'task-library-b']
  }));

  assert.deepEqual(created.tasks, []);
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
    tasks: [],
    compositionMode: 'automatic',
    biomes: ['cave']
  }));
  assert.deepEqual(automatic.tasks, []);
  assert.deepEqual(automatic.enabledTaskIds, []);

  const manualForced = await store.create(environment({
    id: 'env-manual-forced',
    tasks: [],
    compositionMode: 'manual',
    forcedTaskIds: ['task-desert']
  }));
  assert.deepEqual(manualForced.tasks, []);
  assert.deepEqual(manualForced.forcedTaskIds, ['task-desert']);

  const unmatched = store.validate(environment({
    id: 'env-unmatched-library',
    tasks: [],
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
    hazardDropRateAdjustments: {
      ' hazard-a ': -20,
      'hazard-zero': 0
    },
    hazardDropRateAdjustmentsEnabled: {
      ' hazard-a ': false,
      'hazard-default': true
    }
  }));

  assert.deepEqual(created.taskDropRateAdjustments, {
    'task-library-a': { 'drop-a': 15 }
  });
  assert.deepEqual(created.taskDropRateAdjustmentsEnabled, {
    'task-library-a': false
  });
  assert.deepEqual(created.hazardDropRateAdjustments, {
    'hazard-a': -20
  });
  assert.deepEqual(created.hazardDropRateAdjustmentsEnabled, {
    'hazard-a': false
  });

  const invalid = store.validate(environment({
    id: 'env-invalid-adjustments',
    taskDropRateAdjustments: { 'task-library-a': { 'drop-a': 101 } },
    taskDropRateAdjustmentsEnabled: { 'task-library-a': 'false' },
    hazardDropRateAdjustments: { 'hazard-a': -101 },
    hazardDropRateAdjustmentsEnabled: { 'hazard-a': 'false' }
  }));
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join('\n'), /taskDropRateAdjustments\.task-library-a\.drop-a must be an integer from -100 to 100/);
  assert.match(invalid.errors.join('\n'), /taskDropRateAdjustmentsEnabled\.task-library-a must be a boolean/);
  assert.match(invalid.errors.join('\n'), /hazardDropRateAdjustments\.hazard-a must be an integer from -100 to 100/);
  assert.match(invalid.errors.join('\n'), /hazardDropRateAdjustmentsEnabled\.hazard-a must be a boolean/);
});

test('rich gathering metadata and task economy fields normalize and validate additively', async () => {
  const { store } = makeMemoryStore();
  store.load();

  const richEnvironment = environment({
    img: 'icons/environment/forest.webp',
    region: 'Elderglen Valley',
    biome: 'Forest',
    risk: 'hazardous',
    conditions: {
      timeOfDay: 'Dawn',
      weather: 'Light rain'
    },
    tasks: [routedTask({
      nodes: {
        current: 2,
        max: 4,
        depletionTiming: 'onSuccess',
        respawn: { policy: 'overTime', gainMode: 'chance', intervalSeconds: 86400, chance: 0.5 }
      },
      staminaCost: 3,
      staminaCostModifiers: [{ modifierId: 'strength', operator: '-', min: 0, max: 2 }],
      riskOverride: 'unsafe',
      reveal: { enabled: true, scope: 'actor', triggers: ['success'] }
    })]
  });

  const result = store.validate(richEnvironment);
  assert.equal(result.valid, true, result.errors.join('; '));

  await store.save([richEnvironment]);
  const saved = store.list()[0];
  assert.equal(saved.region, 'Elderglen Valley');
  assert.equal(saved.biome, 'Forest');
  assert.equal(saved.risk, 'hazardous');
  // The legacy per-environment economyMode field is removed; mode is per system.
  assert.equal('economyMode' in saved, false);
  assert.deepEqual(saved.conditions, { timeOfDay: 'Dawn', weather: 'Light rain', visibility: '', notes: '' });
  assert.equal(saved.tasks[0].nodes.current, 2);
  assert.equal(saved.tasks[0].nodes.max, 4);
  assert.equal(saved.tasks[0].staminaCost, 3);
  assert.equal('attemptLimit' in saved.tasks[0], false);
  assert.equal(saved.tasks[0].staminaCostModifiers[0].modifierId, 'strength');
  assert.equal(saved.tasks[0].staminaCostModifiers[0].operator, '-');
});

test('validation rejects malformed over-time respawn configs', async () => {
  const { store } = makeMemoryStore();
  store.load();
  const withRespawn = respawn => store.validate(environment({
    tasks: [routedTask({ nodes: { current: 0, max: 4, depletionTiming: 'onStart', respawn } })]
  }));

  // overTime needs a positive interval.
  assert.match(
    withRespawn({ policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: 0 }).errors.join('\n'),
    /respawn\.intervalSeconds must be positive for over-time respawn/
  );
  // (An invalid gainMode/policy is sanitized by normalizeRespawn before validation
  //  reaches it, so those enum branches are defensive-only and not exercised here;
  //  normalizeRespawn defaulting is covered in gathering-node-config.test.js.)
  // chance gain mode requires a 0..1 chance.
  assert.match(
    withRespawn({ policy: 'overTime', gainMode: 'chance', intervalSeconds: 3600, chance: 1.5 }).errors.join('\n'),
    /respawn\.chance must be between 0 and 1/
  );
  // expression gain mode requires a non-empty amount expression.
  assert.match(
    withRespawn({ policy: 'overTime', gainMode: 'expression', intervalSeconds: 3600, amountExpression: '   ' }).errors.join('\n'),
    /respawn\.amountExpression is required for expression gain/
  );
  // manual respawn has no interval/gain requirements.
  assert.equal(withRespawn({ policy: 'manual' }).valid, true);
});

test('validation permits disabled draft placeholder tasks but blocks enabled missing outcome providers', async () => {
  const { store } = makeMemoryStore();
  store.load();

  const draft = environment({
    id: 'env-draft',
    enabled: false,
    tasks: [
      routedTask({
        enabled: false,
        resultSelection: { provider: 'macroOutcome', macroUuid: '' }
      })
    ]
  });

  const created = await store.create(draft);

  assert.equal(created.id, 'env-draft');
  assert.equal(created.tasks[0].enabled, false);
  assert.deepEqual(created.tasks[0].resultSelection, {
    provider: 'macroOutcome',
    macroUuid: null,
    rollTableUuid: null
  });

  const configured = store.validate(environment({
    id: 'env-configured',
    tasks: [
      routedTask({
        enabled: true,
        resultSelection: { provider: 'macroOutcome', macroUuid: '' }
      })
    ]
  }));
  assert.equal(configured.valid, false);
  assert.match(configured.errors.join('\n'), /macroOutcome provider requires macroUuid/);
});

test('validation rejects malformed failureOutcome on disabled tasks', () => {
  const { store } = makeMemoryStore();
  store.load();

  const result = store.validate(environment({
    id: 'env-disabled-failure',
    tasks: [
      routedTask({
        enabled: false,
        resultSelection: { provider: 'macroOutcome', macroUuid: '' },
        failureOutcome: { mode: 'macro', macroUuid: '' }
      })
    ]
  }));

  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /failureOutcome macro mode requires macroUuid/);
  assert.doesNotMatch(result.errors.join('\n'), /macroOutcome provider requires macroUuid/);
});

test('validation rejects malformed task catalysts at the save boundary', () => {
  const { store } = makeMemoryStore();
  store.load();

  const blankComponent = store.validate(environment({
    tasks: [routedTask({
      catalysts: [{
        componentId: '',
        degradesOnUse: false,
        destroyWhenExhausted: false,
        maxUses: null
      }]
    })]
  }));
  assert.equal(blankComponent.valid, false);
  assert.match(blankComponent.errors.join('\n'), /catalyst 1 requires componentId/);

  for (const maxUses of [0, -1, 1.5, 'bogus']) {
    const result = store.validate(environment({
      tasks: [routedTask({
        catalysts: [{
          componentId: 'component-gem',
          degradesOnUse: true,
          destroyWhenExhausted: true,
          maxUses
        }]
      })]
    }));
    assert.equal(result.valid, false, `expected maxUses ${maxUses} to be invalid`);
    assert.match(result.errors.join('\n'), /maxUses must be a positive integer/);
  }

  assert.equal(store.validate(environment({
    tasks: [routedTask({
      catalysts: [{
        componentId: 'component-gem',
        degradesOnUse: true,
        destroyWhenExhausted: true,
        maxUses: null
      }]
    })]
  })).valid, true);

  assert.equal(store.validate(environment({
    tasks: [routedTask({
      catalysts: [{
        componentId: 'component-gem',
        degradesOnUse: false,
        destroyWhenExhausted: false,
        maxUses: null
      }]
    })]
  })).valid, true);
});

test('progressive difficulty must come from the referenced system component', () => {
  const { store } = makeMemoryStore({
    systems: [
      {
        id: 'system-a',
        features: { gathering: true },
        components: [
          { id: 'component-gem', difficulty: 2 },
          { id: 'component-no-difficulty' }
        ]
      }
    ]
  });
  store.load();

  assert.equal(store.validate(environment({
    tasks: [progressiveTask({
      resultGroups: [{ id: 'component', name: 'Component', results: [{ id: 'r', componentId: 'component-gem', quantity: 1 }] }]
    })]
  })).valid, true);

  assert.equal(store.validate(environment({
    tasks: [progressiveTask({
      resultGroups: [{ id: 'inline', name: 'Inline', results: [{ id: 'r', componentId: 'missing-component', quantity: 1, difficulty: 1 }] }]
    })]
  })).valid, false);
});

test('save rejects invalid raw selection and resolution modes without writing settings', async () => {
  const { store, writes } = makeMemoryStore();

  await assert.rejects(
    () => store.save([environment({ selectionMode: 'nonsense' })]),
    /selectionMode/
  );
  assert.equal(writes.length, 0);

  await assert.rejects(
    () => store.save([environment({ tasks: [routedTask({ resolutionMode: 'nonsense' })] })]),
    /resolutionMode/
  );
  assert.equal(writes.length, 0);
});

test('duplicate deep-clones with fresh environment and task IDs and mutation isolation', async () => {
  const source = environment({
    id: 'env-source',
    tasks: [
      routedTask({ id: 'task-source-a' }),
      progressiveTask({ id: 'task-source-b' })
    ]
  });
  const { store } = makeMemoryStore({ saved: [source], ids: ['env-copy', 'task-copy-a', 'task-copy-b'] });
  store.load();

  const copy = await store.duplicate('env-source', { name: 'Old Mine Copy' });
  assert.equal(copy.id, 'env-copy');
  assert.equal(copy.name, 'Old Mine Copy');
  assert.deepEqual(copy.tasks.map(task => task.id), ['task-copy-a', 'task-copy-b']);

  copy.tasks[0].resultGroups[0].results[0].quantity = 99;
  const original = store.get('env-source');
  assert.equal(original.tasks[0].resultGroups[0].results[0].quantity, 1);
});

test('delete environment and task invoke only matching cleanup hooks', async () => {
  const calls = [];
  const runCleanup = {
    removeRunsForSystem: async systemId => calls.push(['system', systemId]),
    removeRunsForEnvironment: async environmentId => calls.push(['environment', environmentId]),
    removeRunsForTask: async taskId => calls.push(['task', taskId])
  };
  const { store } = makeMemoryStore({
    saved: [environment({
      id: 'env-cleanup',
      tasks: [
        routedTask({ id: 'task-cleanup' }),
        routedTask({ id: 'task-remaining' })
      ]
    })],
    runCleanup
  });
  store.load();

  await store.deleteTask('env-cleanup', 'task-cleanup');
  assert.deepEqual(calls, [['task', 'task-cleanup']]);

  await store.delete('env-cleanup');
  assert.deepEqual(calls, [['task', 'task-cleanup'], ['environment', 'env-cleanup']]);
});

test('update cleans runs for persisted tasks removed by a valid environment save', async () => {
  const calls = [];
  const { store, writes } = makeMemoryStore({
    saved: [environment({
      id: 'env-update-cleanup',
      tasks: [
        routedTask({ id: 'task-removed' }),
        routedTask({ id: 'task-kept' })
      ]
    })],
    runCleanup: {
      removeRunsForTask: async (taskId, options) => calls.push([taskId, options])
    }
  });
  store.load();

  const updated = await store.update('env-update-cleanup', {
    tasks: [routedTask({ id: 'task-kept' })]
  });

  assert.deepEqual(updated.tasks.map(task => task.id), ['task-kept']);
  assert.deepEqual(calls, [['task-removed', { environmentId: 'env-update-cleanup' }]]);
  assert.deepEqual(writes.at(-1).value[0].tasks.map(task => task.id), ['task-kept']);
});

test('update does not clean removed task runs when validation rejects the save', async () => {
  const calls = [];
  const { store, writes } = makeMemoryStore({
    saved: [environment({
      id: 'env-update-invalid',
      tasks: [routedTask({ id: 'only-task' })]
    })],
    runCleanup: {
      removeRunsForTask: async taskId => calls.push(taskId)
    }
  });
  store.load();

  await assert.rejects(
    () => store.update('env-update-invalid', { tasks: [] }),
    /targeted selection requires at least one task/
  );

  assert.deepEqual(calls, []);
  assert.equal(writes.length, 0);
  assert.deepEqual(store.get('env-update-invalid').tasks.map(task => task.id), ['only-task']);
});

test('deleteTask refuses unsafe invalid result without cleanup, writes, or cache loss', async () => {
  const calls = [];
  const { store, writes } = makeMemoryStore({
    saved: [environment({
      id: 'env-single-task',
      tasks: [routedTask({ id: 'only-task' })]
    })],
    runCleanup: {
      removeRunsForTask: async taskId => calls.push(taskId)
    }
  });
  store.load();

  await assert.rejects(
    () => store.deleteTask('env-single-task', 'only-task'),
    /targeted selection requires at least one task/
  );

  assert.deepEqual(calls, []);
  assert.equal(writes.length, 0);
  assert.deepEqual(store.get('env-single-task').tasks.map(task => task.id), ['only-task']);
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

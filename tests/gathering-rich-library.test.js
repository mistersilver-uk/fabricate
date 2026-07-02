import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringEngine } from '../src/systems/GatheringEngine.js';
import { GatheringEnvironmentStore } from '../src/systems/GatheringEnvironmentStore.js';
import { GatheringRunManager } from '../src/systems/GatheringRunManager.js';
import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';

const actor = { id: 'actor-1', uuid: 'Actor.actor-1', name: 'Gatherer', items: [] };
const viewer = { id: 'user-1', isGM: false };
const system = { id: 'system-a', name: 'Wildcraft', enabled: true, features: { gathering: true }, components: [{ id: 'herb' }] };

function makeRichState({ config = {}, rolls = [100] } = {}) {
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  const writes = [];
  const rollQueue = [...rolls];
  const rollCalls = [];
  const hooks = [];
  const service = new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => {
      settings.set(key, value);
      writes.push({ key, value });
      return value;
    },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    rollD100: () => {
      rollCalls.push(true);
      return rollQueue.shift() ?? 1;
    },
    hooks: {
      callAll: (name, payload) => hooks.push({ name, payload })
    }
  });
  // Expose the settings to makeEngine so it can register an environment's
  // (formerly env-authored) tasks as library tasks — env-authored tasks were
  // removed; every task now lives in the system library and is matched in.
  service._testSettings = settings;
  return { service, settings, writes, hooks, rollCalls };
}

function environment(overrides = {}) {
  return {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Rainwood',
    enabled: true,
    selectionMode: 'targeted',
    region: 'north',
    biomes: ['forest'],
    dangerTags: ['hazardous'],
    tasks: [],
    ...overrides
  };
}

function makeEngine({ richState, env = environment(), environmentStore = null, paused = false, calls = {}, runManager = null, actingActor = actor } = {}) {
  calls.created = [];
  calls.terminal = [];
  // Library-task shim: move any environment-authored tasks into the system
  // library config (empty region/biome → matches every environment) so they
  // compose in as library tasks. Library tasks are d100 drop-row resolution.
  const settings = richState?._testSettings;
  if (settings && !environmentStore && Array.isArray(env.tasks) && env.tasks.length > 0) {
    const libTasks = env.tasks;
    const cfg = settings.get(SETTING_KEYS.GATHERING_CONFIG) || {};
    cfg.systems = cfg.systems || {};
    cfg.systems['system-a'] = { ...(cfg.systems['system-a'] || {}), tasks: libTasks };
    settings.set(SETTING_KEYS.GATHERING_CONFIG, cfg);
    env = { ...env, tasks: [] };
  }
  return new GatheringEngine({
    environmentStore: environmentStore ?? {
      list: () => [env],
      get: () => env
    },
    getSystems: () => [system],
    richState,
    getSelectableActors: () => [actingActor],
    isActorSelectable: () => true,
    isGamePaused: () => paused,
    evaluator: {
      evaluateVisibility: async () => ({ visible: true })
    },
    sceneAccess: {
      canAttempt: () => ({ allowed: true })
    },
    resultCreator: {
      plan: async ({ resultGroups }) => resultGroups.flatMap(group => group.results).map(result => ({
        actorUuid: actingActor.uuid,
        itemUuid: result.itemUuid || `Component.${result.componentId}`,
        quantity: result.quantity
      })),
      create: async (payload) => {
        calls.created.push(payload);
        return payload.resultGroups.flatMap(group => group.results).map(result => ({
          actorUuid: actingActor.uuid,
          itemUuid: result.itemUuid || `Component.${result.componentId}`,
          quantity: result.quantity
        }));
      }
    },
    failureFeedback: {
      apply: async () => null
    },
    runManager: runManager ?? {
      getActiveRuns: () => [],
      getRunHistory: () => [],
      findActiveRunForTask: () => null,
      createTerminalRun: async (selectedActor, runData, status, payload) => {
        calls.terminal.push({ selectedActor, runData, status, payload });
        return { id: 'run-d100', status, ...runData, ...payload };
      }
    },
    localize: key => key
  });
}

function makeEnvironmentStore() {
  return new GatheringEnvironmentStore({
    getSetting: key => key === SETTING_KEYS.GATHERING_ENVIRONMENTS ? [] : null,
    setSetting: async (_key, value) => value,
    getSystems: () => [system],
    randomID: () => 'generated-id'
  });
}

function makeFlagActor(overrides = {}) {
  let flags = {};
  return {
    id: 'actor-flagged',
    uuid: 'Actor.actor-flagged',
    name: 'Flagged Gatherer',
    items: [],
    getFlag: (namespace, key) => flags[`${namespace}.${key}`],
    setFlag: async (namespace, key, value) => {
      flags = { ...flags, [`${namespace}.${key}`]: value };
      return value;
    },
    ...overrides
  };
}

test('global gathering conditions seed defaults and preserve customized vocabularies', async () => {
  const { service, writes, hooks } = makeRichState({
    config: {
      vocabularies: {
        weather: ['clear', 'ashfall'],
        timeOfDay: ['day', 'witching-hour'],
        biomes: ['mycelium'],
        danger: ['safe', 'cursed']
      },
      conditions: { weather: 'ashfall', timeOfDay: 'witching-hour' }
    }
  });

  assert.deepEqual(service.getConditions(), {
    weather: 'ashfall',
    timeOfDay: 'witching-hour',
    vocabularies: {
      biomes: ['mycelium'],
      danger: ['safe', 'cursed'],
      weather: ['clear', 'ashfall'],
      timeOfDay: ['day', 'witching-hour']
    }
  });

  await service.setConditions({ weather: 'clear', timeOfDay: 'day' });
  assert.equal(writes.at(-1).key, SETTING_KEYS.GATHERING_CONFIG);
  assert.deepEqual(writes.at(-1).value.conditions, { weather: 'clear', timeOfDay: 'day' });
  assert.equal(hooks.at(-1).name, 'fabricate.gathering.conditionsUpdated');
  await assert.rejects(() => service.setWeather('hail'), /Unknown gathering weather tag/);
});

test('rich gathering service normalizes default biome strings with readable labels and metadata', () => {
  const { service } = makeRichState({
    config: {
      systems: {
        'system-a': {}
      }
    }
  });

  assert.deepEqual(service._config().systems['system-a'].vocabularies.biomes.values, [
    { id: 'forest', label: 'Forest', icon: 'fas fa-tree', colorToken: 'sage', customColor: '' },
    { id: 'grassland', label: 'Grassland', icon: 'fas fa-wheat-awn', colorToken: 'butter', customColor: '' },
    { id: 'mountain', label: 'Mountain', icon: 'fas fa-mountain', colorToken: 'mist', customColor: '' },
    { id: 'cave', label: 'Cave', icon: 'fas fa-dungeon', colorToken: 'lavender', customColor: '' },
    { id: 'coastal', label: 'Coastal', icon: 'fas fa-water', colorToken: 'aqua', customColor: '' },
    { id: 'swamp', label: 'Swamp', icon: 'fas fa-frog', colorToken: 'mauve', customColor: '' },
    { id: 'desert', label: 'Desert', icon: 'fas fa-sun', colorToken: 'peach', customColor: '' },
    { id: 'urban', label: 'Urban', icon: 'fas fa-city', colorToken: 'mist', customColor: '' },
    { id: 'ruins', label: 'Ruins', icon: 'fas fa-archway', colorToken: 'rose', customColor: '' },
    { id: 'wasteland', label: 'Wasteland', icon: 'fas fa-skull', colorToken: 'mauve', customColor: '' }
  ]);
});

test('rich gathering service preserves explicit biome record labels icons and colours', () => {
  const { service } = makeRichState({
    config: {
      systems: {
        'system-a': {
          vocabularies: {
            biomes: {
              values: [
                { id: 'forest', label: 'Old Wood', icon: 'fas fa-leaf', colorToken: 'rose', customColor: '#aabbcc' }
              ]
            }
          }
        }
      }
    }
  });

  assert.deepEqual(service._config().systems['system-a'].vocabularies.biomes.values, [
    { id: 'forest', label: 'Old Wood', icon: 'fas fa-leaf', colorToken: 'rose', customColor: '#AABBCC' }
  ]);
});

test('task and event libraries match environments by tags and global conditions', async () => {
  const { service } = makeRichState({
    config: {
      conditions: { weather: 'rain', timeOfDay: 'night' },
      systems: {
        'system-a': {
          tasks: [
            {
              id: 'task-forest-rain',
              name: 'Forage Rain Herbs',
              region: 'north',
              biomes: ['forest'],
              weather: ['rain'],
              timeOfDay: ['night'],
              dropRows: [{ id: 'drop-herb', componentId: 'herb', quantity: 1, dropRate: 60 }]
            },
            {
              id: 'task-desert',
              name: 'Comb Dunes',
              biomes: ['desert'],
              dropRows: [{ id: 'drop-sand', componentId: 'sand', quantity: 1, dropRate: 60 }]
            }
          ],
          events: [
            { id: 'event-thorns', name: 'Thorns', dangerTags: ['hazardous'], weather: ['rain'], dropRate: 25 },
            { id: 'event-sun', name: 'Sunstroke', dangerTags: ['deadly'], weather: ['clear'], dropRate: 25 }
          ]
        }
      }
    }
  });

  const composed = service.composeEnvironment(environment(), system);

  assert.deepEqual(composed.conditions, { weather: 'rain', timeOfDay: 'night' });
  assert.deepEqual(composed.tasks.map(task => task.id), ['task-forest-rain']);
  assert.equal(composed.tasks[0].resolutionMode, 'd100');
  assert.deepEqual(composed.events.map(event => event.id), ['event-thorns']);
});

test('composeEnvironment carries the system eventVisibility rule onto composed.rules', () => {
  const { service } = makeRichState({
    config: {
      systems: {
        'system-a': {
          rules: { eventVisibility: 'dangerLevelOnly' },
          tasks: [{ id: 'task-a', name: 'Forage', dropRows: [{ id: 'drop-a', componentId: 'herb', quantity: 1, dropRate: 50 }] }]
        }
      }
    }
  });

  const composed = service.composeEnvironment(environment(), system);
  assert.equal(composed.rules.eventVisibility, 'dangerLevelOnly',
    'the GM-configured event visibility tier reaches the engine via composed.rules');
});

test('composeEnvironment defaults eventVisibility to encounterChance when the system rule is absent', () => {
  const { service } = makeRichState({
    config: {
      systems: {
        'system-a': {
          rules: { rewardSelectionMode: 'allDrops' },
          tasks: [{ id: 'task-a', name: 'Forage', dropRows: [{ id: 'drop-a', componentId: 'herb', quantity: 1, dropRate: 50 }] }]
        }
      }
    }
  });

  const composed = service.composeEnvironment(environment(), system);
  assert.equal(composed.rules.eventVisibility, 'encounterChance',
    'an absent rule falls back to the restrictive default');
});

test('disabled per-system weather and time matching ignores task and event condition tags', async () => {
  const { service } = makeRichState({
    config: {
      conditions: { weather: 'clear', timeOfDay: 'day' },
      systems: {
        'system-a': {
          conditions: {
            weather: { enabled: false, current: 'clear', values: ['clear', 'rain'] },
            timeOfDay: { enabled: false, current: 'day', values: ['day', 'night'] }
          },
          tasks: [{
            id: 'task-rain-night',
            name: 'Rain Night Forage',
            weather: ['rain'],
            timeOfDay: ['night'],
            dropRows: [{ id: 'drop-herb', componentId: 'herb', quantity: 1, dropRate: 60 }]
          }],
          events: [{
            id: 'event-rain-night',
            name: 'Rain Night Event',
            dangerTags: ['hazardous'],
            weather: ['rain'],
            timeOfDay: ['night'],
            dropRate: 25
          }]
        }
      }
    }
  });

  const composed = service.composeEnvironment(environment(), system);

  assert.deepEqual(composed.conditions, { weather: 'clear', timeOfDay: 'day' });
  assert.deepEqual(composed.tasks.map(task => task.id), ['task-rain-night']);
  assert.deepEqual(composed.events.map(event => event.id), ['event-rain-night']);
});

test('environment task and event toggles preserve mixed-case library IDs', async () => {
  const store = makeEnvironmentStore();
  const saved = await store.create(environment({
    enabledTaskIds: ['Task-Mixed'],
    disabledEventIds: ['Event-Mixed']
  }));
  assert.deepEqual(saved.enabledTaskIds, ['Task-Mixed']);
  assert.deepEqual(saved.disabledEventIds, ['Event-Mixed']);

  const { service } = makeRichState({
    config: {
      systems: {
        'system-a': {
          tasks: [
            { id: 'Task-Mixed', name: 'Enabled Mixed', dropRows: [{ id: 'drop-a', componentId: 'herb', quantity: 1, dropRate: 100 }] },
            { id: 'task-other', name: 'Other', dropRows: [{ id: 'drop-b', componentId: 'herb', quantity: 1, dropRate: 100 }] }
          ],
          events: [
            { id: 'Event-Mixed', name: 'Disabled Mixed', dangerTags: ['hazardous'], dropRate: 100 },
            { id: 'event-other', name: 'Other Event', dangerTags: ['hazardous'], dropRate: 100 }
          ]
        }
      }
    }
  });
  const composed = service.composeEnvironment(saved, system);

  // Automatic mode ignores the enabled allow-list, so every matching library task
  // composes; the disabled list still excludes Event-Mixed (mixed-case preserved).
  assert.deepEqual(composed.tasks.map(task => task.id), ['Task-Mixed', 'task-other']);
  assert.deepEqual(composed.events.map(event => event.id), ['event-other']);
});

test('environment dangerLevel migrates from dangerTags, preserves explicit values, and validates', async () => {
  const store = makeEnvironmentStore();

  const migrated = await store.create(environment({ dangerTags: ['safe', 'deadly'], enabledTaskIds: ['lib-task'] }));
  assert.equal(migrated.dangerLevel, 'deadly');

  const explicit = await store.create(environment({ id: 'env-explicit', dangerLevel: 'dangerous', dangerTags: [], enabledTaskIds: ['lib-task'] }));
  assert.equal(explicit.dangerLevel, 'dangerous');

  const defaulted = await store.create(environment({ id: 'env-default', dangerTags: [], risk: undefined, enabledTaskIds: ['lib-task'] }));
  assert.equal(defaulted.dangerLevel, 'safe');

  const invalid = store.validate(environment({ dangerLevel: 'cataclysmic', enabledTaskIds: ['lib-task'] }));
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some(error => error.includes('dangerLevel')));
});

test('environment blindSelection keeps weights and drops legacy strategy/uuid fields', async () => {
  const store = makeEnvironmentStore();

  const weighted = await store.create(environment({
    blindSelection: { weights: { t1: 3, t2: 1 } },
    enabledTaskIds: ['lib-task']
  }));
  assert.deepEqual(weighted.blindSelection, { weights: { t1: 3, t2: 1 } });

  const migrated = await store.create(environment({
    id: 'env-bs-legacy',
    blindSelection: { strategy: 'rollTable', rollTableUuid: 'RollTable.x', macroUuid: 'Macro.y', weights: { keep: 2 } },
    enabledTaskIds: ['lib-task']
  }));
  assert.deepEqual(migrated.blindSelection, { weights: { keep: 2 } });
  assert.equal(migrated.blindSelection.strategy, undefined);

  const empty = await store.create(environment({ id: 'env-bs-empty', blindSelection: { strategy: 'macro' }, enabledTaskIds: ['lib-task'] }));
  assert.equal(empty.blindSelection, undefined);
});

test('environment reveal override is discarded — system-level reveal governs', async () => {
  const store = makeEnvironmentStore();

  const withOverride = await store.create(environment({ reveal: { policy: 'onAttempt', scope: 'party' }, enabledTaskIds: ['lib-task'] }));
  assert.equal(withOverride.reveal, undefined);

  const garbage = await store.create(environment({ id: 'env-reveal-bad', reveal: { policy: 'bogus', scope: 'nope' }, enabledTaskIds: ['lib-task'] }));
  assert.equal(garbage.reveal, undefined);
});

test('player listing exposes current conditions as context without weather/time filters', async () => {
  const { service } = makeRichState({
    config: {
      conditions: { weather: 'fog', timeOfDay: 'dawn' },
      systems: {
        'system-a': {
          tasks: [{
            id: 'task-fog',
            name: 'Gather Fog Fern',
            weather: ['fog'],
            timeOfDay: ['dawn'],
            dropRows: [{ id: 'drop-fern', componentId: 'herb', quantity: 1, dropRate: 100 }]
          }]
        }
      }
    }
  });
  const engine = makeEngine({ richState: service });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.environments[0].conditions.weather, 'fog');
  assert.equal(listing.environments[0].conditions.timeOfDay, 'dawn');
  assert.equal(listing.environments[0].tasks[0].rich.conditions.weather, 'fog');
  assert.equal('weatherFilters' in listing, false);
  assert.equal('timeOfDayFilters' in listing, false);
});

test('blind player listing redacts matched event identity and drop rates', async () => {
  const { service } = makeRichState({
    config: {
      systems: {
        'system-a': {
          tasks: [{
            id: 'task-secret',
            name: 'Secret Forage',
            dropRows: [{ id: 'drop-secret', componentId: 'herb', quantity: 1, dropRate: 100 }]
          }],
          events: [{ id: 'event-secret-snake', name: 'Secret Snakebite', dangerTags: ['hazardous'], dropRate: 75 }]
        }
      }
    }
  });
  const engine = makeEngine({
    richState: service,
    env: environment({ selectionMode: 'blind' })
  });

  const listing = await engine.listForActor({ viewer, actor });
  const blindTask = listing.environments[0].tasks[0];
  const serialized = JSON.stringify(blindTask.rich);

  assert.deepEqual(blindTask.rich.events, [{ matched: true }]);
  assert.equal(serialized.includes('event-secret-snake'), false);
  assert.equal(serialized.includes('Secret Snakebite'), false);
  assert.equal(serialized.includes('75'), false);
});

test('blind player d100 terminal history redacts rich item and event evidence', async () => {
  const { service } = makeRichState({
    rolls: [100, 100],
    config: {
      systems: {
        'system-a': {
          tasks: [{
            id: 'task-secret-d100',
            name: 'Secret D100 Forage',
            dropRows: [{ id: 'drop-secret-herb', componentId: 'herb', quantity: 1, dropRate: 100 }]
          }],
          events: [{ id: 'event-secret-thorns', name: 'Secret Thorns', dangerTags: ['hazardous'], dropRate: 100 }]
        }
      }
    }
  });
  const calls = {};
  const engine = makeEngine({
    richState: service,
    env: environment({ selectionMode: 'blind' }),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a' });
  const serializedRun = JSON.stringify(calls.terminal[0]);

  assert.equal(result.accepted, true);
  assert.equal(result.taskId, null);
  assert.equal(serializedRun.includes('drop-secret-herb'), false);
  assert.equal(serializedRun.includes('event-secret-thorns'), false);
  assert.equal(serializedRun.includes('Secret Thorns'), false);
  assert.deepEqual(calls.terminal[0].payload.economyEvidence.events, [{ matched: true }]);
});

test('paused gathering rejects before d100 rolls, history, item awards, or rich commits', async () => {
  const { service, rollCalls } = makeRichState({
    config: {
      systems: {
        'system-a': {
          tasks: [{
            id: 'task-paused',
            name: 'Paused Forage',
            dropRows: [{ id: 'drop-herb', componentId: 'herb', quantity: 1, dropRate: 100 }]
          }]
        }
      }
    }
  });
  const commitCalls = [];
  service.commitAcceptedAttempt = async (payload) => {
    commitCalls.push(payload);
    return {};
  };
  const calls = {};
  const engine = makeEngine({ richState: service, paused: true, calls });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-paused' });

  assert.equal(result.accepted, false);
  assert.deepEqual(result.blockedReasons.map(reason => reason.code), ['GAME_PAUSED']);
  assert.deepEqual(calls.terminal, []);
  assert.deepEqual(calls.created, []);
  assert.deepEqual(rollCalls, []);
  assert.deepEqual(commitCalls, []);
});

test('paused gathering stays listable but marks tasks non-attemptable', async () => {
  const { service } = makeRichState({
    config: {
      systems: {
        'system-a': {
          tasks: [{
            id: 'task-paused-listing',
            name: 'Paused Listing Forage',
            dropRows: [{ id: 'drop-herb', componentId: 'herb', quantity: 1, dropRate: 100 }]
          }]
        }
      }
    }
  });
  const engine = makeEngine({ richState: service, paused: true });

  const listing = await engine.listForActor({ viewer, actor });

  assert.equal(listing.environments.length, 1);
  assert.equal(listing.attemptable, false);
  assert.deepEqual(listing.blockedReasons.map(reason => reason.code), ['GAME_PAUSED']);
  assert.deepEqual(listing.environments[0].tasks[0].blockedReasons.map(reason => reason.code), ['GAME_PAUSED']);
});

test('d100 resolution supports all-drops items and failure-with-event policy', async () => {
  const { service } = makeRichState({
    rolls: [95, 25, 95],
    config: {
      systems: {
        'system-a': {
          rules: {
            rewardSelectionMode: 'allDrops',
            eventSelectionMode: 'allDrops',
            eventPolicy: 'failureWithEvent'
          },
          tasks: [{
            id: 'task-d100',
            name: 'Forage',
            dropRows: [
              { id: 'drop-common', componentId: 'herb', quantity: 2, dropRate: 10 },
              { id: 'drop-rare', itemUuid: 'Item.rare', quantity: 1, dropRate: 80 }
            ]
          }],
          events: [{ id: 'event-snake', name: 'Snakebite', dangerTags: ['hazardous'], dropRate: 10 }]
        }
      }
    }
  });
  const calls = {};
  const engine = makeEngine({
    richState: service,
    env: environment(),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-d100' });

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'failed');
  assert.equal(calls.terminal.length, 1);
  assert.equal(calls.created.length, 0);
  assert.deepEqual(calls.terminal[0].payload.checkResult.events.map(row => row.id), ['event-snake']);
  assert.deepEqual(calls.terminal[0].payload.checkResult.items.map(row => row.id), ['drop-common', 'drop-rare']);
});

test('d100 resolution applies system gathering rules over legacy task and environment fields', async () => {
  const { service } = makeRichState({
    rolls: [100, 100, 100, 100, 100],
    config: {
      systems: {
        'system-a': {
          rules: {
            rewardSelectionMode: 'limitedDrops',
            rewardLimit: 2,
            eventSelectionMode: 'limitedDrops',
            eventLimit: 1,
            eventPolicy: 'successWithEvent'
          },
          tasks: [{
            id: 'task-limited',
            name: 'Limited Forage',
            itemSelectionMode: 'allDrops',
            dropRows: [
              { id: 'drop-first', componentId: 'herb', quantity: 1, dropRate: 100 },
              { id: 'drop-second', componentId: 'herb', quantity: 1, dropRate: 100 },
              { id: 'drop-third', componentId: 'herb', quantity: 1, dropRate: 100 }
            ]
          }],
          events: [
            { id: 'event-first', name: 'First', dangerTags: ['hazardous'], dropRate: 100 },
            { id: 'event-second', name: 'Second', dangerTags: ['hazardous'], dropRate: 100 }
          ]
        }
      }
    }
  });
  const calls = {};
  const engine = makeEngine({
    richState: service,
    env: environment({ eventSelectionMode: 'allDrops', eventPolicy: 'failureWithEvent' }),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-limited' });

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'succeeded');
  assert.deepEqual(calls.terminal[0].payload.checkResult.items.map(row => row.id), ['drop-first', 'drop-second']);
  assert.deepEqual(calls.terminal[0].payload.checkResult.events.map(row => row.id), ['event-first']);
});

test('d100 resolution preserves legacy selection fields when system rules are missing', async () => {
  const { service } = makeRichState({
    rolls: [100, 100, 100],
    config: {
      systems: {
        'system-a': {
          tasks: [{
            id: 'task-legacy-selection',
            name: 'Legacy Forage',
            itemSelectionMode: 'allDrops',
            dropRows: [
              { id: 'drop-first', componentId: 'herb', quantity: 1, dropRate: 100 },
              { id: 'drop-second', componentId: 'herb', quantity: 1, dropRate: 100 }
            ]
          }],
          events: [{ id: 'event-first', name: 'First', dangerTags: ['hazardous'], dropRate: 100 }]
        }
      }
    }
  });
  const calls = {};
  const engine = makeEngine({
    richState: service,
    env: environment({ eventSelectionMode: 'allDrops', eventPolicy: 'failureWithEvent' }),
    calls
  });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-legacy-selection' });

  assert.equal(result.accepted, true);
  assert.equal(result.state, 'failed');
  assert.deepEqual(calls.terminal[0].payload.checkResult.items.map(row => row.id), ['drop-first', 'drop-second']);
  assert.deepEqual(calls.terminal[0].payload.checkResult.events.map(row => row.id), ['event-first']);
  assert.equal(calls.created.length, 0);
});

test('d100 resolution applies numeric task and event modifier providers', async () => {
  const { service } = makeRichState({ rolls: [90, 90] });
  const result = await service.resolveD100Attempt({
    task: {
      id: 'task-modified',
      itemSelectionMode: 'allDrops',
      gatheringModifier: { provider: 'static', formula: '1' },
      dropRows: [{ id: 'drop-modified', componentId: 'herb', quantity: 1, dropRate: 10 }]
    },
    environment: {
      rules: { rewardSelectionMode: 'allDrops', eventSelectionMode: 'allDrops' },
      events: [{ id: 'event-modified', name: 'Thorns', dropRate: 10, eventModifier: { provider: 'static', value: 1 } }]
    }
  });

  assert.equal(result.status, 'succeeded');
  assert.deepEqual(result.items.map(row => [row.id, row.effectiveRoll, row.modifier]), [['drop-modified', 91, 1]]);
  assert.deepEqual(result.events.map(row => [row.id, row.effectiveRoll, row.modifier]), [['event-modified', 91, 1]]);
});

test('drop resolution applies matching weather and time modifiers and ignores non-matches', async () => {
  const { service } = makeRichState({ rolls: [100, 100] });
  const result = await service.resolveD100Attempt({
    task: {
      id: 'task-conditions',
      dropRows: [
        {
          id: 'drop-bonus',
          componentId: 'herb',
          quantity: 1,
          dropRate: 80,
          conditionModifiers: {
            weather: [
              { id: 'rain-bonus', conditionId: 'rain', value: 25 },
              { id: 'clear-ignored', conditionId: 'clear', value: -50 }
            ],
            timeOfDay: [{ id: 'night-penalty', conditionId: 'night', value: -10 }]
          }
        },
        {
          id: 'drop-clamped',
          componentId: 'herb',
          quantity: 1,
          dropRate: 95,
          conditionModifiers: {
            weather: [{ id: 'rain-bonus', conditionId: 'rain', value: 25 }],
            timeOfDay: []
          }
        }
      ]
    },
    environment: {
      conditions: { weather: 'rain', timeOfDay: 'night' },
      rules: { rewardSelectionMode: 'allDrops' }
    }
  });

  assert.deepEqual(result.items.map(row => [row.id, row.conditionModifier, row.finalDropRate]), [
    ['drop-bonus', 15, 95],
    ['drop-clamped', 25, 100]
  ]);
});

test('drop resolution clamps negative condition modifiers at zero drop chance', async () => {
  const { service } = makeRichState({ rolls: [100] });
  const result = await service.resolveD100Attempt({
    task: {
      id: 'task-zero',
      dropRows: [{
        id: 'drop-zero',
        componentId: 'herb',
        quantity: 1,
        dropRate: 5,
        conditionModifiers: {
          weather: [{ id: 'rain-penalty', conditionId: 'rain', value: -20 }]
        }
      }]
    },
    environment: {
      conditions: { weather: 'rain', timeOfDay: 'day' },
      rules: { rewardSelectionMode: 'allDrops' }
    }
  });

  assert.deepEqual(result.items, []);
});

test('gathering start validation accepts zero drop chance rows', async () => {
  const { service } = makeRichState({
    rolls: [100],
    config: {
      systems: {
        'system-a': {
          tasks: [{
            id: 'task-zero-chance',
            name: 'Zero Chance Forage',
            dropRows: [{ id: 'drop-zero', componentId: 'herb', quantity: 1, dropRate: 0 }]
          }]
        }
      }
    }
  });
  const calls = {};
  const engine = makeEngine({ richState: service, calls });

  const result = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-zero-chance' });

  assert.equal(result.accepted, true);
  assert.deepEqual(calls.terminal[0].payload.checkResult.items, []);
});

test('timed d100 runs complete from their start-time library snapshot after conditions and rules change', async () => {
  const { service, settings } = makeRichState({
    rolls: [100, 100, 100, 100],
    config: {
      conditions: { weather: 'rain', timeOfDay: 'night' },
      systems: {
        'system-a': {
          rules: {
            rewardSelectionMode: 'limitedDrops',
            rewardLimit: 1,
            eventSelectionMode: 'limitedDrops',
            eventLimit: 1,
            eventPolicy: 'successWithEvent'
          },
          tasks: [{
            id: 'task-timed-rain',
            name: 'Timed Rain Forage',
            weather: ['rain'],
            timeOfDay: ['night'],
            timeRequirement: { minutes: 1 },
            dropRows: [
              { id: 'drop-rain-herb', componentId: 'herb', quantity: 1, dropRate: 100 },
              { id: 'drop-rain-flower', componentId: 'herb', quantity: 1, dropRate: 100 }
            ]
          }],
          events: [
            {
              id: 'event-rain-thorns',
              name: 'Rain Thorns',
              dangerTags: ['hazardous'],
              weather: ['rain'],
              timeOfDay: ['night'],
              dropRate: 100
            },
            {
              id: 'event-rain-mud',
              name: 'Rain Mud',
              dangerTags: ['hazardous'],
              weather: ['rain'],
              timeOfDay: ['night'],
              dropRate: 100
            }
          ]
        }
      }
    }
  });
  const calls = {};
  let activeRun = null;
  const runManager = {
    getActiveRuns: () => activeRun ? [activeRun] : [],
    getRunHistory: () => [],
    findActiveRunForTask: () => null,
    createWaitingRun: async (selectedActor, runData, timeRequirement) => {
      activeRun = {
        id: 'run-waiting-d100',
        status: 'waitingTime',
        actorUuid: selectedActor.uuid,
        userId: viewer.id,
        startedAtWorldTime: 1,
        updatedAtWorldTime: 1,
        timeGate: timeRequirement,
        ...runData
      };
      return activeRun;
    },
    getMaturedWaitingRuns: () => activeRun ? [{ actor, run: activeRun }] : [],
    completeRun: async (_selectedActor, run, status, payload, options) => {
      const completed = {
        ...run,
        status,
        ...options.terminalRunData,
        ...payload,
        completedAtWorldTime: 10
      };
      activeRun = null;
      calls.completed = completed;
      return completed;
    }
  };
  const engine = makeEngine({ richState: service, calls, runManager });

  const start = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-timed-rain' });
  const activeListing = await engine.listForActor({ viewer, actor });
  settings.set(SETTING_KEYS.GATHERING_CONFIG, {
    conditions: { weather: 'clear', timeOfDay: 'day' },
    systems: {
      'system-a': {
        rules: {
          rewardSelectionMode: 'allDrops',
          eventSelectionMode: 'allDrops',
          eventPolicy: 'failureWithEvent'
        },
        tasks: [],
        events: []
      }
    }
  });
  const processed = await engine.processWorldTime(10);

  assert.equal(start.accepted, true);
  assert.equal(start.state, 'waitingTime');
  assert.equal(JSON.stringify(activeListing.activeRuns[0].economyEvidence).includes('runtimeSnapshot'), false);
  assert.equal(processed.completed.length, 1);
  assert.equal(calls.completed.status, 'succeeded');
  assert.deepEqual(calls.created[0].resultGroups[0].results.map(row => row.id), ['drop-rain-herb']);
  assert.deepEqual(calls.completed.checkResult.events.map(row => row.id), ['event-rain-thorns']);
  assert.equal(JSON.stringify(start.run.economyEvidence).includes('runtimeSnapshot'), false);
});

test('timed d100 legacy runs snapshot legacy event behavior before rules are authored', async () => {
  const { service, settings } = makeRichState({
    rolls: [100, 100, 100],
    config: {
      systems: {
        'system-a': {
          tasks: [{
            id: 'task-timed-legacy',
            name: 'Timed Legacy Forage',
            itemSelectionMode: 'allDrops',
            timeRequirement: { minutes: 1 },
            dropRows: [{ id: 'drop-legacy-herb', componentId: 'herb', quantity: 1, dropRate: 100 }]
          }],
          events: [
            { id: 'event-legacy-thorns', name: 'Thorns', dangerTags: ['hazardous'], dropRate: 100 },
            { id: 'event-legacy-mud', name: 'Mud', dangerTags: ['hazardous'], dropRate: 100 }
          ]
        }
      }
    }
  });
  const calls = {};
  let activeRun = null;
  const runManager = {
    getActiveRuns: () => activeRun ? [activeRun] : [],
    getRunHistory: () => [],
    findActiveRunForTask: () => null,
    createWaitingRun: async (selectedActor, runData, timeRequirement) => {
      activeRun = {
        id: 'run-waiting-legacy',
        status: 'waitingTime',
        actorUuid: selectedActor.uuid,
        userId: viewer.id,
        startedAtWorldTime: 1,
        updatedAtWorldTime: 1,
        timeGate: timeRequirement,
        ...runData
      };
      return activeRun;
    },
    getMaturedWaitingRuns: () => activeRun ? [{ actor, run: activeRun }] : [],
    completeRun: async (_selectedActor, run, status, payload, options) => {
      const completed = {
        ...run,
        status,
        ...options.terminalRunData,
        ...payload,
        completedAtWorldTime: 10
      };
      activeRun = null;
      calls.completed = completed;
      return completed;
    }
  };
  const engine = makeEngine({
    richState: service,
    env: environment({ eventSelectionMode: 'allDrops', eventPolicy: 'successWithEvent' }),
    calls,
    runManager
  });

  const start = await engine.startAttempt({ viewer, actor, environmentId: 'env-a', taskId: 'task-timed-legacy' });
  settings.set(SETTING_KEYS.GATHERING_CONFIG, {
    systems: {
      'system-a': {
        rules: {
          rewardSelectionMode: 'highestRankedDrop',
          eventSelectionMode: 'highestRankedDrop',
          eventPolicy: 'failureWithEvent'
        },
        tasks: [],
        events: []
      }
    }
  });
  const processed = await engine.processWorldTime(10);

  assert.equal(start.accepted, true);
  assert.equal(processed.completed.length, 1);
  assert.equal(calls.completed.status, 'succeeded');
  assert.deepEqual(calls.completed.checkResult.events.map(row => row.id), ['event-legacy-thorns', 'event-legacy-mud']);
});

test('timed d100 missing-reference cancellation does not expose or persist runtime snapshots', async () => {
  const flaggedActor = makeFlagActor();
  const { service } = makeRichState({
    config: {
      conditions: { weather: 'rain', timeOfDay: 'night' },
      systems: {
        'system-a': {
          tasks: [{
            id: 'task-cancel-rain',
            name: 'Cancel Rain Forage',
            weather: ['rain'],
            timeOfDay: ['night'],
            timeRequirement: { minutes: 1 },
            dropRows: [{ id: 'drop-rain-herb', componentId: 'herb', quantity: 1, dropRate: 100 }]
          }]
        }
      }
    }
  });
  let currentEnvironment = environment();
  const runManager = new GatheringRunManager({
    randomID: () => 'run-cancel-d100',
    nowWorldTime: () => 0,
    getUserId: () => viewer.id,
    getActors: () => [flaggedActor]
  });
  const engine = makeEngine({
    richState: service,
    actingActor: flaggedActor,
    runManager,
    environmentStore: {
      list: () => currentEnvironment ? [currentEnvironment] : [],
      get: id => currentEnvironment?.id === id ? currentEnvironment : null
    }
  });

  const start = await engine.startAttempt({ viewer, actor: flaggedActor, environmentId: 'env-a', taskId: 'task-cancel-rain' });
  currentEnvironment = null;
  const processed = await engine.processWorldTime(999);
  const history = runManager.getRunHistory(flaggedActor);

  assert.equal(start.accepted, true);
  assert.equal(processed.cancelled.length, 1);
  assert.equal(JSON.stringify(processed.cancelled[0].run).includes('runtimeSnapshot'), false);
  assert.equal(JSON.stringify(history[0].economyEvidence).includes('runtimeSnapshot'), false);
});

test('composeEnvironment exposes library tools through a non-enumerable __libraryTools Map', () => {
  // Tools are now system-owned: the library is sourced from the normalized
  // crafting system's `tools` (the second composeEnvironment arg), not the
  // gathering config.
  const { service } = makeRichState();
  const systemWithTools = {
    ...system,
    tools: [
      { id: 'tool-axe', componentId: 'herb', label: 'Iron Pickaxe', breakage: { mode: 'limitedUses', maxUses: 10 } },
      { id: 'tool-saw', componentId: 'herb', breakage: { mode: 'breakageChance', breakageChance: 25 } }
    ]
  };
  const composed = service.composeEnvironment(environment(), systemWithTools);
  assert.ok(composed.__libraryTools instanceof Map);
  assert.equal(composed.__libraryTools.size, 2);
  assert.equal(composed.__libraryTools.get('tool-axe').label, 'Iron Pickaxe');
  assert.equal(composed.__libraryTools.get('tool-saw').breakage.mode, 'breakageChance');
  const descriptor = Object.getOwnPropertyDescriptor(composed, '__libraryTools');
  assert.equal(descriptor.enumerable, false);
});

test('composeEnvironment skips library tools without an id', () => {
  const { service } = makeRichState();
  const systemWithTools = { ...system, tools: [{ id: '', componentId: 'herb' }] };
  const composed = service.composeEnvironment(environment(), systemWithTools);
  assert.ok(composed.__libraryTools instanceof Map);
  assert.equal(composed.__libraryTools.size, 0);
});

test('normalizeLibraryTask defaults a missing toolIds field to []', () => {
  const { service } = makeRichState({
    config: {
      systems: {
        'system-a': {
          tasks: [{ id: 'task-no-tools', name: 'Pluck Mushrooms' }]
        }
      }
    }
  });
  const composed = service.composeEnvironment(environment(), system);
  const task = composed.tasks.find(t => t.id === 'task-no-tools');
  assert.ok(task, 'expected library task to be composed');
  assert.deepEqual(task.toolIds, []);
});

test('normalizeLibraryTask coerces toolIds entries to trimmed strings and drops empties', () => {
  const { service } = makeRichState({
    config: {
      systems: {
        'system-a': {
          tasks: [{ id: 'task-with-tools', toolIds: ['  tool-axe  ', '', null, 7, 'tool-saw'] }]
        }
      }
    }
  });
  const composed = service.composeEnvironment(environment(), system);
  const task = composed.tasks.find(t => t.id === 'task-with-tools');
  assert.ok(task, 'expected library task to be composed');
  assert.deepEqual(task.toolIds, ['tool-axe', '7', 'tool-saw']);
});

// ---------------------------------------------------------------------------
// Interactive d100: confirm-roll prompt + Dice So Nice animation (pooled Nd100).
// The d100 path does NOT use a Foundry `Roll` DC — it rolls a percentile per drop
// row/event via the `rollD100` seam. Interactive mode confirms the attempt,
// collects an optional flat situational bonus, and (when a Foundry `Roll` exists)
// pre-rolls a single `Nd100` pool so DSN animates all throws and the faces feed
// the resolution in order.
// ---------------------------------------------------------------------------

function stubDialog(response) {
  const original = globalThis.foundry;
  globalThis.foundry = {
    applications: { api: { DialogV2: { wait: async () => response } } }
  };
  return () => {
    if (original === undefined) delete globalThis.foundry;
    else globalThis.foundry = original;
  };
}

/**
 * Stub `globalThis.Roll` as a fake `Nd100` pool: `evaluate()` exposes the supplied
 * faces at `dice[0].results[].result`, and `toMessage` records into `spy`.
 */
function stubPoolRoll(faces, spy) {
  const original = globalThis.Roll;
  globalThis.Roll = class {
    constructor(formula) { this.formula = formula; }
    async evaluate() {
      this.dice = [{ results: faces.map((face) => ({ result: face })) }];
      return this;
    }
    async toMessage(messageData, options) {
      spy.push({ messageData, options, formula: this.formula });
      return {};
    }
  };
  return () => {
    if (original === undefined) delete globalThis.Roll;
    else globalThis.Roll = original;
  };
}

function d100ForageConfig(dropRate = 100) {
  return {
    systems: {
      'system-a': {
        tasks: [{
          id: 'task-d100',
          name: 'Gather Meadow Herbs',
          dropRows: [{ id: 'drop-herb', componentId: 'herb', quantity: 1, dropRate }]
        }]
      }
    }
  };
}

test('interactive d100 cancel: dismissing the roll dialog aborts with zero mutation', async () => {
  const { service, rollCalls } = makeRichState({ rolls: [50], config: d100ForageConfig(100) });
  const calls = {};
  const engine = makeEngine({ richState: service, calls });
  const restoreDialog = stubDialog({ confirmed: false });
  try {
    const result = await engine.startAttempt({
      viewer,
      actor,
      environmentId: 'env-a',
      taskId: 'task-d100',
      interactive: true
    });

    assert.equal(result.accepted, false, 'a cancelled attempt is not accepted');
    assert.equal(result.cancelled, true, 'the cancelled flag is surfaced for a silent no-op');
    assert.deepEqual(result.blockedReasons, [], 'no blocked reasons — a cancel is not a rejection');
    assert.deepEqual(calls.terminal, [], 'no terminal run written');
    assert.deepEqual(calls.created, [], 'no results created');
    assert.deepEqual(rollCalls, [], 'no d100 rolled — the cancel returns before resolution');
  } finally {
    restoreDialog();
  }
});

test('interactive d100 confirm: pre-rolls an Nd100 pool, uses its faces, and posts to chat (DSN)', async () => {
  const { service, rollCalls } = makeRichState({ rolls: [1], config: d100ForageConfig(100) });
  const calls = {};
  const engine = makeEngine({ richState: service, calls });
  const restoreDialog = stubDialog({ confirmed: true, bonus: '0' });
  const toMessageSpy = [];
  const restoreRoll = stubPoolRoll([50], toMessageSpy);
  try {
    const result = await engine.startAttempt({
      viewer,
      actor,
      environmentId: 'env-a',
      taskId: 'task-d100',
      interactive: true
    });

    assert.equal(result.accepted, true, 'confirmed attempt proceeds');
    assert.equal(result.state, 'succeeded');
    assert.equal(calls.created.length, 1, 'the always-dropping row awarded its item from the pooled face');
    assert.deepEqual(rollCalls, [], 'the pooled Nd100 faces were used, NOT the rollD100 seam');
    assert.equal(toMessageSpy.length, 1, 'the pooled roll was posted to chat (DSN trigger)');
    assert.equal(toMessageSpy[0].formula, '1d100', 'one throw for the single enabled drop row');
    assert.equal(toMessageSpy[0].options.create, true);
  } finally {
    restoreRoll();
    restoreDialog();
  }
});

test('interactive d100 situational bonus shifts a borderline drop outcome', async () => {
  const calls = {};
  // dropRate 45 → threshold 56. A pooled face of 50 misses without a bonus, but a
  // +10 situational modifier lifts the effective roll to 60 and clears the row.
  const withBonus = makeRichState({ rolls: [1], config: d100ForageConfig(45) });
  const engineBonus = makeEngine({ richState: withBonus.service, calls });
  const restoreDialogBonus = stubDialog({ confirmed: true, bonus: '10' });
  const restoreRollBonus = stubPoolRoll([50], []);
  try {
    const result = await engineBonus.startAttempt({
      viewer,
      actor,
      environmentId: 'env-a',
      taskId: 'task-d100',
      interactive: true
    });
    assert.equal(result.accepted, true);
    assert.equal(calls.created.length, 1, '+10 bonus clears the 56 threshold with a 50 face → item awarded');
  } finally {
    restoreRollBonus();
    restoreDialogBonus();
  }

  // Control: the same face with no bonus misses the threshold — no item awarded.
  const noBonusCalls = {};
  const noBonus = makeRichState({ rolls: [1], config: d100ForageConfig(45) });
  const engineNoBonus = makeEngine({ richState: noBonus.service, calls: noBonusCalls });
  const restoreDialogNo = stubDialog({ confirmed: true, bonus: '0' });
  const restoreRollNo = stubPoolRoll([50], []);
  try {
    const result = await engineNoBonus.startAttempt({
      viewer,
      actor,
      environmentId: 'env-a',
      taskId: 'task-d100',
      interactive: true
    });
    assert.equal(result.accepted, true);
    assert.deepEqual(noBonusCalls.created, [], 'without a bonus a 50 face misses the 56 threshold');
  } finally {
    restoreRollNo();
    restoreDialogNo();
  }
});

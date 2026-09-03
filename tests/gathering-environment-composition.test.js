import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';

const system = { id: 'system-a', name: 'Wildcraft' };

function makeService(systemConfig = {}) {
  const config = { systems: { 'system-a': systemConfig } };
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  const service = new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    rollD100: () => 1
  });
  return service;
}

function makeRollingService(systemConfig = {}, rollD100 = () => 1) {
  const config = { systems: { 'system-a': systemConfig } };
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, config]]);
  return new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    rollD100
  });
}

function environment(overrides = {}) {
  return {
    id: 'env-a',
    craftingSystemId: 'system-a',
    name: 'Mines',
    enabled: true,
    selectionMode: 'targeted',
    region: '',
    biomes: ['cave'],
    dangerLevel: 'hazardous',
    tasks: [],
    ...overrides
  };
}

const libraryTasks = [
  { id: 't1', name: 'Pick Ore', biomes: ['cave'], dropRows: [{ id: 'd1', componentId: 'ore', quantity: 1, dropRate: 100 }] },
  { id: 't2', name: 'Pan Gems', biomes: ['cave'], dropRows: [{ id: 'd2', componentId: 'gem', quantity: 1, dropRate: 100 }] },
  { id: 't3', name: 'Cut Coal', biomes: ['cave'], dropRows: [{ id: 'd3', componentId: 'coal', quantity: 1, dropRate: 100 }] },
  { id: 'tDesert', name: 'Dig Sand', biomes: ['desert'], dropRows: [{ id: 'd4', componentId: 'sand', quantity: 1, dropRate: 100 }] }
];

test('weather/time-of-day mismatch does not stop a task from being composed (runtime gate, not match)', () => {
  // The weather-only task matches by biome but requires stormy weather; the
  // environment currently has clear weather. Composition still includes it —
  // the runtime engine surfaces the conditions gate via CONDITIONS_BLOCKED.
  const service = makeService({
    tasks: [{ id: 'storm-pick', name: 'Storm Pick', biomes: ['cave'], weather: ['storm'], dropRows: [{ id: 'd', componentId: 'ore', quantity: 1, dropRate: 100 }] }]
  });
  const composed = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    conditions: { weather: 'clear', timeOfDay: 'day' }
  }), system);
  assert.deepEqual(composed.tasks.map(task => task.id), ['storm-pick']);
});

test('automatic mode includes every matching enabled task and hides non-matching ones', () => {
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({ compositionMode: 'automatic' }), system);
  assert.deepEqual(composed.tasks.map(task => task.id).sort(), ['t1', 't2', 't3']);
});

test('automatic mode excludes records listed in disabledTaskIds', () => {
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({ compositionMode: 'automatic', disabledTaskIds: ['t2'] }), system);
  assert.deepEqual(composed.tasks.map(task => task.id).sort(), ['t1', 't3']);
});

test('manual mode composes exactly the explicitly enabled tasks', () => {
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({ compositionMode: 'manual', enabledTaskIds: ['t1', 't3'] }), system);
  assert.deepEqual(composed.tasks.map(task => task.id).sort(), ['t1', 't3']);
});

test('manual mode composes an explicitly-included task whether or not it matches', () => {
  // Manual mode has no match filter (issue #1315): the GM's picked list IS the composition, so
  // `tDesert` composes into a cave environment because it was picked, not because it fits.
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({ compositionMode: 'manual', enabledTaskIds: ['t1', 'tDesert'] }), system);
  assert.deepEqual(composed.tasks.map(task => task.id), ['t1', 'tDesert']);
});

test('automatic mode ignores a stale enabled allow-list and includes all matching records', () => {
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({ compositionMode: 'automatic', enabledTaskIds: ['t2'] }), system);
  assert.deepEqual(composed.tasks.map(task => task.id).sort(), ['t1', 't2', 't3']);
});

test('taskOrder applies a deterministic order, with unlisted records following in library order', () => {
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({ compositionMode: 'automatic', taskOrder: ['t3', 't1'] }), system);
  assert.deepEqual(composed.tasks.map(task => task.id), ['t3', 't1', 't2']);
});

test('events compose by danger matching and respect the shared composition mode', () => {
  const service = makeService({
    events: [
      { id: 'h1', name: 'Cave-in', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 50 },
      { id: 'h2', name: 'Gas Pocket', biomes: ['cave'], dangerTags: ['deadly'], dropRate: 50 }
    ]
  });
  const composedAuto = service.composeEnvironment(environment({ compositionMode: 'automatic' }), system);
  assert.deepEqual(composedAuto.events.map(event => event.id), ['h1']);

  const composedManual = service.composeEnvironment(environment({ compositionMode: 'manual', enabledEventIds: ['h1'] }), system);
  assert.deepEqual(composedManual.events.map(event => event.id), ['h1']);

  const composedManualEmpty = service.composeEnvironment(environment({ compositionMode: 'manual' }), system);
  assert.deepEqual(composedManualEmpty.events.map(event => event.id), []);
});

test('manual mode ignores the forced list, which belongs to automatic mode', () => {
  const service = makeService({ tasks: libraryTasks });
  // A manual environment has no filter for a force to override (issue #1315), so `forcedTaskIds`
  // is inert here — `tDesert` composes only if the GM adds it to the picked list.
  const composed = service.composeEnvironment(environment({
    compositionMode: 'manual',
    enabledTaskIds: ['t1'],
    forcedTaskIds: ['tDesert']
  }), system);
  assert.deepEqual(composed.tasks.map(task => task.id), ['t1']);
});

test('automatic mode honours the forced allow-list', () => {
  // The rule flip's own proof (issue #1315). Automatic composition is "everything matching, minus
  // the excluded, PLUS the forced": a force is how a GM overrides the match filter, and this is
  // the mode that has one.
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    forcedTaskIds: ['tDesert']
  }), system);
  assert.deepEqual(composed.tasks.map(task => task.id).sort(), ['t1', 't2', 't3', 'tDesert']);
});

test('automatic mode lets an exclusion beat a force on the same record', () => {
  // The two overrides can collide, and exclude wins. Asserted here rather than left to branch
  // order in the predicate, because "which of my two lists decides" is a GM-facing answer.
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    forcedTaskIds: ['tDesert'],
    disabledTaskIds: ['tDesert']
  }), system);
  assert.deepEqual(composed.tasks.map(task => task.id).sort(), ['t1', 't2', 't3']);
});

test('a force cannot revive a task disabled in the library', () => {
  // The library-enabled gate precedes both modes, so neither override can reach past it.
  const service = makeService({
    tasks: [{ id: 'tOff', name: 'Retired', enabled: false, biomes: ['desert'], dropRows: [] }]
  });
  const composed = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    forcedTaskIds: ['tOff']
  }), system);
  assert.deepEqual(composed.tasks.map(task => task.id), []);
});

test('manual task disabledTaskIds are ignored, because manual mode has no exclusion', () => {
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({
    compositionMode: 'manual',
    enabledTaskIds: ['t1', 'tDesert'],
    disabledTaskIds: ['tDesert']
  }), system);
  assert.deepEqual(composed.tasks.map(task => task.id), ['t1', 'tDesert']);
});

test('manual event composition is the enabled list alone: forced and disabled are both inert', () => {
  const service = makeService({
    events: [
      { id: 'hCave', name: 'Cave-in', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 50 },
      { id: 'hDesert', name: 'Sandstorm', biomes: ['desert'], dangerTags: ['hazardous'], dropRate: 50 }
    ]
  });
  const composed = service.composeEnvironment(environment({
    compositionMode: 'manual',
    enabledEventIds: ['hCave'],
    forcedEventIds: ['hDesert'],
    disabledEventIds: ['hCave', 'hDesert']
  }), system);
  assert.deepEqual(composed.events.map(event => event.id), ['hCave']);
});

test('eventOrder sorts matching and force-added events together', () => {
  // In AUTOMATIC mode, where both populations exist: three events compose by matching and a
  // fourth by force, and `eventOrder` ranks them as one list rather than two.
  const service = makeService({
    events: [
      { id: 'hCave', name: 'Cave-in', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 50 },
      { id: 'hStorm', name: 'Storm Surge', biomes: ['cave'], dangerTags: ['hazardous'], weather: ['storm'], dropRate: 50 },
      { id: 'hGas', name: 'Gas Pocket', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 50 },
      { id: 'hDesert', name: 'Sandstorm', biomes: ['desert'], dangerTags: ['hazardous'], dropRate: 50 }
    ]
  });
  const composed = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    forcedEventIds: ['hDesert'],
    eventOrder: ['hDesert', 'hStorm', 'hGas', 'hCave']
  }), system);
  assert.deepEqual(composed.events.map(event => event.id), ['hDesert', 'hStorm', 'hGas', 'hCave']);
});

test('automatic mode excludes events listed in disabledEventIds', () => {
  const service = makeService({
    events: [
      { id: 'hCave', name: 'Cave-in', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 50 },
      { id: 'hGas', name: 'Gas Pocket', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 50 }
    ]
  });
  const composed = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    disabledEventIds: ['hGas']
  }), system);
  assert.deepEqual(composed.events.map(event => event.id), ['hCave']);
});

test('the environment danger level acts as a ceiling for eligible events', () => {
  const service = makeService({
    events: [
      { id: 'h1', name: 'Cave-in', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 50 },
      { id: 'h2', name: 'Gas Pocket', biomes: ['cave'], dangerTags: ['deadly'], dropRate: 50 }
    ]
  });

  const deadly = service.composeEnvironment(environment({ compositionMode: 'automatic', dangerLevel: 'deadly' }), system);
  assert.deepEqual(deadly.events.map(event => event.id).sort(), ['h1', 'h2']);

  const safe = service.composeEnvironment(environment({ compositionMode: 'automatic', dangerLevel: 'safe' }), system);
  assert.deepEqual(safe.events.map(event => event.id), []);
});

test('environment drop-rate adjustments apply to composed task rows and events without mutating library records', () => {
  const sourceTask = { id: 'tAdjust', name: 'Pick Ore', biomes: ['cave'], dropRows: [{ id: 'dAdjust', componentId: 'ore', quantity: 1, dropRate: 40 }] };
  const sourceEvent = { id: 'hAdjust', name: 'Cave-in', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 40 };
  const service = makeService({ tasks: [sourceTask], events: [sourceEvent] });

  const composed = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    taskDropRateAdjustments: { tAdjust: { dAdjust: 20 } },
    eventDropRateAdjustments: { hAdjust: -15 }
  }), system);

  assert.equal(composed.tasks[0].dropRows[0].dropRate, 60);
  assert.equal(composed.tasks[0].dropRows[0].baseDropRate, 40);
  assert.equal(composed.tasks[0].dropRows[0].environmentDropRateAdjustment, 20);
  assert.equal(composed.events[0].dropRate, 25);
  assert.equal(composed.events[0].baseDropRate, 40);
  assert.equal(composed.events[0].environmentDropRateAdjustment, -15);
  assert.equal(sourceTask.dropRows[0].dropRate, 40);
  assert.equal(sourceEvent.dropRate, 40);
});

test('disabled task drop-rate adjustments remain stored but do not apply to composed task rows', () => {
  const sourceTask = { id: 'tDisabledAdjust', name: 'Pick Ore', biomes: ['cave'], dropRows: [{ id: 'dDisabledAdjust', componentId: 'ore', quantity: 1, dropRate: 40 }] };
  const service = makeService({ tasks: [sourceTask] });

  const composed = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    taskDropRateAdjustments: { tDisabledAdjust: { dDisabledAdjust: 20 } },
    taskDropRateAdjustmentsEnabled: { tDisabledAdjust: false }
  }), system);

  assert.equal(composed.tasks[0].dropRows[0].dropRate, 40);
  assert.equal(composed.tasks[0].dropRows[0].baseDropRate, 40);
  assert.equal(composed.tasks[0].dropRows[0].environmentDropRateAdjustment, 0);
  assert.equal(sourceTask.dropRows[0].dropRate, 40);
});

test('disabled event drop-rate adjustments remain stored but do not apply to composed events', () => {
  const sourceEvent = { id: 'hDisabledAdjust', name: 'Cave-in', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 40 };
  const service = makeService({ events: [sourceEvent] });

  const composed = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    eventDropRateAdjustments: { hDisabledAdjust: 20 },
    eventDropRateAdjustmentsEnabled: { hDisabledAdjust: false }
  }), system);

  assert.equal(composed.events[0].dropRate, 40);
  assert.equal(composed.events[0].baseDropRate, 40);
  assert.equal(composed.events[0].environmentDropRateAdjustment, 0);
  assert.equal(sourceEvent.dropRate, 40);
});

test('environment drop-rate adjustments affect d100 task and event roll thresholds', async () => {
  const service = makeRollingService({
    tasks: [{ id: 'tRoll', name: 'Pick Ore', biomes: ['cave'], dropRows: [{ id: 'dRoll', componentId: 'ore', quantity: 1, dropRate: 40 }] }],
    events: [{ id: 'hRoll', name: 'Cave-in', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 40 }]
  }, () => 50);

  const unadjusted = service.composeEnvironment(environment({ compositionMode: 'automatic' }), system);
  const unadjustedResult = await service.resolveD100Attempt({
    task: unadjusted.tasks[0],
    environment: unadjusted
  });
  assert.deepEqual(unadjustedResult.items, []);
  assert.deepEqual(unadjustedResult.events, []);

  const adjusted = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    taskDropRateAdjustments: { tRoll: { dRoll: 20 } },
    eventDropRateAdjustments: { hRoll: 20 }
  }), system);
  const adjustedResult = await service.resolveD100Attempt({
    task: adjusted.tasks[0],
    environment: adjusted
  });

  assert.deepEqual(adjustedResult.items.map(item => item.id), ['dRoll']);
  assert.deepEqual(adjustedResult.events.map(event => event.id), ['hRoll']);
});

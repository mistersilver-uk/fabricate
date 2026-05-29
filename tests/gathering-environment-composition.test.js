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

test('manual mode includes only explicitly enabled matching tasks', () => {
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({ compositionMode: 'manual', enabledTaskIds: ['t1', 't3'] }), system);
  assert.deepEqual(composed.tasks.map(task => task.id).sort(), ['t1', 't3']);
});

test('manual mode never makes a non-matching explicitly-included task available', () => {
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({ compositionMode: 'manual', enabledTaskIds: ['t1', 'tDesert'] }), system);
  assert.deepEqual(composed.tasks.map(task => task.id), ['t1']);
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

test('hazards compose by danger matching and respect the shared composition mode', () => {
  const service = makeService({
    hazards: [
      { id: 'h1', name: 'Cave-in', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 50 },
      { id: 'h2', name: 'Gas Pocket', biomes: ['cave'], dangerTags: ['deadly'], dropRate: 50 }
    ]
  });
  const composedAuto = service.composeEnvironment(environment({ compositionMode: 'automatic' }), system);
  assert.deepEqual(composedAuto.hazards.map(hazard => hazard.id), ['h1']);

  const composedManual = service.composeEnvironment(environment({ compositionMode: 'manual', enabledHazardIds: ['h1'] }), system);
  assert.deepEqual(composedManual.hazards.map(hazard => hazard.id), ['h1']);

  const composedManualEmpty = service.composeEnvironment(environment({ compositionMode: 'manual' }), system);
  assert.deepEqual(composedManualEmpty.hazards.map(hazard => hazard.id), []);
});

test('manual mode force-adds a non-matching task into the composed environment', () => {
  const service = makeService({ tasks: libraryTasks });
  // tDesert does not match a cave environment, but the GM force-added it.
  const composed = service.composeEnvironment(environment({
    compositionMode: 'manual',
    enabledTaskIds: ['t1'],
    forcedTaskIds: ['tDesert']
  }), system);
  assert.deepEqual(composed.tasks.map(task => task.id).sort(), ['t1', 'tDesert']);
});

test('automatic mode ignores the forced allow-list', () => {
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({
    compositionMode: 'automatic',
    forcedTaskIds: ['tDesert']
  }), system);
  // Auto-mode composition is "all matching available unless excluded"; forces are ignored.
  assert.deepEqual(composed.tasks.map(task => task.id).sort(), ['t1', 't2', 't3']);
});

test('excluding a forced record drops it from the manual-mode composition', () => {
  const service = makeService({ tasks: libraryTasks });
  const composed = service.composeEnvironment(environment({
    compositionMode: 'manual',
    enabledTaskIds: ['t1'],
    forcedTaskIds: ['tDesert'],
    disabledTaskIds: ['tDesert']
  }), system);
  assert.deepEqual(composed.tasks.map(task => task.id), ['t1']);
});

test('the environment danger level acts as a ceiling for eligible hazards', () => {
  const service = makeService({
    hazards: [
      { id: 'h1', name: 'Cave-in', biomes: ['cave'], dangerTags: ['hazardous'], dropRate: 50 },
      { id: 'h2', name: 'Gas Pocket', biomes: ['cave'], dangerTags: ['deadly'], dropRate: 50 }
    ]
  });

  const deadly = service.composeEnvironment(environment({ compositionMode: 'automatic', dangerLevel: 'deadly' }), system);
  assert.deepEqual(deadly.hazards.map(hazard => hazard.id).sort(), ['h1', 'h2']);

  const safe = service.composeEnvironment(environment({ compositionMode: 'automatic', dangerLevel: 'safe' }), system);
  assert.deepEqual(safe.hazards.map(hazard => hazard.id), []);
});

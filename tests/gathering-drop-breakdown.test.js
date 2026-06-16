import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';

function makeService({ evaluateExpression } = {}) {
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, {}]]);
  return new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    getUserId: () => 'user-1',
    hooks: { callAll: () => {} },
    evaluateExpression
  });
}

function environmentWithLibrary(modifiers = []) {
  const environment = {
    conditions: { weather: 'rain', timeOfDay: 'night' },
    biomes: ['forest'],
    rules: {}
  };
  Object.defineProperty(environment, '__libraryCharacterModifiers', {
    value: new Map(modifiers.map(entry => [String(entry.id), entry])),
    enumerable: false
  });
  return environment;
}

test('previewDropBreakdown separates weather/time/biome + character contributions and clamps to a final chance', async () => {
  const service = makeService({ evaluateExpression: async () => 5 });
  const environment = environmentWithLibrary([
    { id: 'mod-dex', label: 'Dexterity', icon: 'fa-user', expression: '@abilities.dex.mod' }
  ]);
  const task = {
    resolutionMode: 'd100',
    dropRows: [{
      id: 'd1', name: 'Iron', componentId: 'iron', quantity: 2, dropRate: 40,
      conditionModifiers: {
        weather: [{ conditionId: 'rain', value: 10 }],
        timeOfDay: [{ conditionId: 'night', value: -5 }],
        biome: [{ conditionId: 'forest', value: 3 }]
      },
      characterModifiers: [{ id: 'ref-1', modifierId: 'mod-dex', operator: '+' }]
    }]
  };

  const result = await service.previewDropBreakdown({ environment, task, actor: {}, viewer: {}, system: {} });

  assert.equal(result.drops.length, 1);
  const drop = result.drops[0];
  assert.equal(Math.round(drop.baseChance * 100), 40);
  // 40 + 10 (rain) - 5 (night) + 3 (forest) + 5 (dex) = 53
  assert.equal(Math.round(drop.finalChance * 100), 53);
  assert.equal(drop.modifiers.weather.value, 10);
  assert.equal(drop.modifiers.timeOfDay.value, -5);
  assert.equal(drop.modifiers.biome.value, 3);
  assert.equal(drop.modifiers.character.length, 1);
  assert.equal(drop.modifiers.character[0].contribution, 5);
  assert.equal(drop.modifiers.character[0].label, 'Dexterity');
  // Aggregate success chance is derived from the FINAL chance, not the base.
  assert.equal(Math.round(result.successChance * 100), 53);
});

test('previewDropBreakdown aggregate success chance is 100% when a drop reaches 100% after modifiers', async () => {
  const service = makeService();
  const environment = environmentWithLibrary();
  const task = {
    resolutionMode: 'd100',
    dropRows: [
      { id: 'd1', name: 'Raw Ore', dropRate: 90, conditionModifiers: { weather: [], timeOfDay: [], biome: [{ conditionId: 'forest', value: 10 }] } },
      { id: 'd2', name: 'Iron Ingot', dropRate: 45, conditionModifiers: { weather: [], timeOfDay: [], biome: [] } }
    ]
  };
  const result = await service.previewDropBreakdown({ environment, task, actor: {}, viewer: {}, system: {} });
  // d1 = 90 + 10 (forest biome) = 100% -> at least one find is guaranteed.
  assert.equal(Math.round(result.drops[0].finalChance * 100), 100);
  assert.equal(Math.round(result.successChance * 100), 100);
});

test('taskSuccessChance applies condition modifiers to the eager (no-actor) success chance', async () => {
  const service = makeService();
  const environment = environmentWithLibrary();
  const task = {
    resolutionMode: 'd100',
    dropRows: [
      { id: 'd1', name: 'Raw Ore', dropRate: 90, conditionModifiers: { weather: [], timeOfDay: [], biome: [{ conditionId: 'forest', value: 10 }] } }
    ]
  };
  // 90 + 10 (forest) clamps to 100% -> success chance 100%.
  assert.equal(Math.round(service.taskSuccessChance(task, environment) * 100), 100);
  assert.equal(service.taskSuccessChance({ resolutionMode: 'routed', dropRows: [{ dropRate: 50 }] }, environment), null);
});

test('previewDropBreakdown clamps the final chance to [0,100] and omits unresolved character modifiers', async () => {
  const service = makeService({ evaluateExpression: async () => { throw new Error('no actor'); } });
  const environment = environmentWithLibrary([
    { id: 'mod-bad', label: 'Broken', expression: '@nope' }
  ]);
  const task = {
    resolutionMode: 'd100',
    dropRows: [{
      id: 'd1', name: 'Gem', componentId: 'gem', quantity: 1, dropRate: 95,
      conditionModifiers: { weather: [{ conditionId: 'rain', value: 40 }], timeOfDay: [], biome: [] },
      characterModifiers: [{ id: 'ref-1', modifierId: 'mod-bad', operator: '+' }]
    }]
  };

  const result = await service.previewDropBreakdown({ environment, task, actor: {}, viewer: {}, system: {} });
  const drop = result.drops[0];
  assert.equal(Math.round(drop.finalChance * 100), 100, '95 + 40 clamps to 100%');
  assert.equal(drop.modifiers.character.length, 0, 'an unresolved character modifier is omitted');
});

test('previewDropBreakdown returns no drops for a non-d100 task', async () => {
  const service = makeService();
  const environment = environmentWithLibrary();
  const result = await service.previewDropBreakdown({
    environment,
    task: { resolutionMode: 'routed', dropRows: [{ id: 'd1', dropRate: 50 }] }
  });
  assert.deepEqual(result.drops, []);
});

test('issue 299: previewDropBreakdown final chance matches resolveD100Attempt for a multiplicative row', async () => {
  const settings = new Map([[SETTING_KEYS.GATHERING_CONFIG, {}]]);
  const service = new GatheringRichStateService({
    getSetting: key => settings.get(key),
    setSetting: async (key, value) => { settings.set(key, value); return value; },
    settingKey: SETTING_KEYS.GATHERING_CONFIG,
    getUserId: () => 'user-1',
    rollD100: () => 100,
    hooks: { callAll: () => {} },
    evaluateExpression: async () => 10
  });
  const library = [{ id: 'mod', label: 'Mod', icon: 'fa-user', expression: '@mod' }];
  const environment = {
    conditions: { weather: 'rain', timeOfDay: 'night' },
    biomes: ['forest'],
    // Global system mode is multiplicative; every modifier applies as a factor.
    rules: { rewardSelectionMode: 'allDrops', rewardLimit: 99, dropModifierMode: 'multiplicative' }
  };
  Object.defineProperty(environment, '__libraryCharacterModifiers', {
    value: new Map(library.map(entry => [String(entry.id), entry])),
    enumerable: false
  });
  const task = {
    id: 't',
    resolutionMode: 'd100',
    dropRows: [{
      id: 'd1', name: 'Iron', componentId: 'iron', quantity: 1, dropRate: 25,
      characterModifiers: [{ id: 'r', modifierId: 'mod', operator: '-' }]
    }]
  };

  const preview = await service.previewDropBreakdown({ environment, task, actor: {}, viewer: {}, system: {} });
  const resolved = await service.resolveD100Attempt({ task, environment, actor: { uuid: 'Actor.x' } });

  // 25 * 0.9 = 22.5 -> Math.round => 23
  assert.equal(Math.round(preview.drops[0].finalChance * 100), 23);
  assert.equal(resolved.items[0].finalDropRate, 23);
  assert.equal(
    Math.round(preview.drops[0].finalChance * 100),
    resolved.items[0].finalDropRate,
    'preview and resolution agree on the multiplicative final rate'
  );
});

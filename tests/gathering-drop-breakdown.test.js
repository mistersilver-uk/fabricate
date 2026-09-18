import test from 'node:test';
import assert from 'node:assert/strict';

import { GatheringRichStateService } from '../src/systems/GatheringRichStateService.js';
import { SETTING_KEYS } from '../src/config/settings.js';
import {
  GatheringDocumentActor,
  compendiumSourceItem,
  gatheringFixture,
  runRealGatheringAttempt,
} from './helpers/real-gathering-attempt.js';

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

/**
 * The RECORDED breakdown (issue 1648, TP14-B). Everything above is the live preview — odds computed
 * from current configuration.
 */

const ORE_SOURCE_UUID = 'Compendium.fixture.materials.Item.iron-ore';
const ORE_SOURCE = compendiumSourceItem({
  uuid: ORE_SOURCE_UUID,
  name: 'Iron Ore',
  img: 'icons/commodities/ore/ore-iron-grey.webp',
});
const RECORDED_SOURCES = { [ORE_SOURCE_UUID]: ORE_SOURCE };
const RECORDED_COMPONENTS = [
  { id: 'ore', name: 'Iron Ore', img: ORE_SOURCE.img, registeredItemUuid: ORE_SOURCE_UUID, difficulty: 1 },
  { id: 'gem', name: 'Gem', img: 'icons/commodities/gems/gem-rough-navette-blue.webp', difficulty: 1 },
];

const recordedFixture = (dropRows) => gatheringFixture({ components: RECORDED_COMPONENTS, dropRows });
const historyEntries = (attempt) => attempt.project({ projectionViewer: { isGM: true } }).gatheringYield.entries;

test('the evaluated rows, the selected subset and their row/source linkage survive into the record', async () => {
  const attempt = await runRealGatheringAttempt({
    ...recordedFixture([
      { id: 'row-ore', componentId: 'ore', quantity: 2, dropRate: 90, enabled: true },
      { id: 'row-gem', componentId: 'gem', quantity: 1, dropRate: 10, enabled: true },
    ]),
    sources: RECORDED_SOURCES,
    rolls: [50],
  });

  assert.equal(attempt.error, null);
  const recorded = attempt.record.checkResult;
  // EVERY evaluated row is recorded and linked, including the one that missed — a row
  // that only appears when it drops cannot show a player what they did not find.
  assert.deepEqual(
    recorded.itemRows.map((row) => [row.resultRowId, row.dropped]),
    [['row-ore:0', true], ['row-gem:1', false]]
  );
  assert.deepEqual(recorded.items.map((row) => row.resultRowId), ['row-ore:0']);

  // The actual ref names the SOURCE it was created from, distinct from the owned
  // destination document, and carries the link back to the row that selected it.
  assert.deepEqual(attempt.record.createdResults, [
    {
      actorUuid: attempt.actor.uuid,
      itemUuid: `${attempt.actor.uuid}.Item.item-0`,
      name: 'Iron Ore',
      img: ORE_SOURCE.img,
      quantity: 2,
      componentId: 'ore',
      resultRowId: 'row-ore:0',
      sourceItemUuid: ORE_SOURCE_UUID,
    },
  ]);

  assert.deepEqual(
    historyEntries(attempt).map((entry) => [entry.id, entry.cleared, entry.rawRoll, entry.threshold, entry.qty]),
    [
      ['row-ore:0', true, 50, 11, 2],
      ['row-gem:1', false, 50, 91, 0],
    ]
  );
});

test('a row that was never evaluated carries NO outcome rather than a defaulted one', async () => {
  const attempt = await runRealGatheringAttempt({
    ...recordedFixture([
      { id: 'row-ore', componentId: 'ore', quantity: 2, dropRate: 90, enabled: true },
      { id: 'row-off', componentId: 'gem', quantity: 9, dropRate: 100, enabled: false },
    ]),
    sources: RECORDED_SOURCES,
    rolls: [50],
  });

  // A disabled row is never rolled, so it must be absent — not present with a
  // manufactured `cleared: false` / `qty: 0`, which would read as a recorded miss.
  assert.deepEqual(attempt.record.checkResult.itemRows.map((row) => row.resultRowId), ['row-ore:0']);
  assert.deepEqual(historyEntries(attempt).map((entry) => entry.id), ['row-ore:0']);
  assert.equal(JSON.stringify(attempt.record).includes('row-off'), false);
});

test('a recorded quantity is the ACKNOWLEDGED delta, never the authored row quantity', async () => {
  const actor = new GatheringDocumentActor();
  const create = actor.createEmbeddedDocuments.bind(actor);
  // A document layer that accepts the create but stores less than was asked for. Until
  // the two disagree, "the receipt" and "the authored default" produce the same number.
  actor.createEmbeddedDocuments = async (type, data) =>
    create(type, data.map((entry) => ({ ...entry, system: { ...entry.system, quantity: 1 } })));

  const attempt = await runRealGatheringAttempt({
    ...recordedFixture([{ id: 'row-ore', componentId: 'ore', quantity: 3, dropRate: 90, enabled: true }]),
    actor,
    sources: RECORDED_SOURCES,
    rolls: [50],
  });

  assert.equal(attempt.error.code, 'HISTORY_EFFECT_UNCERTAIN');
  assert.equal(attempt.record.historySettlement.awards, 'uncertain');
  assert.deepEqual(attempt.record.createdResults.map((entry) => entry.quantity), [1]);
  assert.deepEqual(historyEntries(attempt).map((entry) => entry.qty), [1]);
  // The authored 3 is still on the evaluated row, and is still not an award.
  assert.equal(attempt.record.checkResult.itemRows[0].quantity, 3);
});

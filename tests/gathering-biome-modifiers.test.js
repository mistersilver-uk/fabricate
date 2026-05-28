import test from 'node:test';
import assert from 'node:assert/strict';

import { makeRichState } from './helpers/gathering.js';

// Compose an environment whose biomes drive biome-modifier matching, with a
// chosen aggregation mode. composeEnvironment pulls conditions from system
// defaults; we override rules so each test can pick the aggregation strategy.
function composedEnvironment(service, { biomes = [], aggregation = 'strongestOfEach', hazards = [] } = {}) {
  const composed = service.composeEnvironment({
    id: 'env',
    craftingSystemId: 'system-a',
    biomes,
    tasks: []
  }, { id: 'system-a' });
  composed.rules = {
    rewardSelectionMode: 'allDrops',
    hazardSelectionMode: 'allDrops',
    rewardLimit: 99,
    hazardLimit: 99,
    hazardPolicy: 'successWithHazard',
    biomeModifierAggregation: aggregation
  };
  if (hazards.length > 0) composed.hazards = hazards;
  return composed;
}

function configFor() {
  return { systems: { 'system-a': { rules: {}, characterModifiers: [], hazards: [] } } };
}

const WORKED_EXAMPLE_BIOME_MODIFIERS = {
  biome: [
    { id: 'bm-grassland', conditionId: 'grassland', value: 10 },
    { id: 'bm-forest', conditionId: 'forest', value: 15 },
    { id: 'bm-cave', conditionId: 'cave', value: -7 }
  ]
};

async function resolveWorkedExample(aggregation) {
  const { service } = makeRichState({ config: configFor(), rolls: [100] });
  const environment = composedEnvironment(service, {
    biomes: ['grassland', 'forest', 'cave'],
    aggregation
  });
  const result = await service.resolveD100Attempt({
    task: {
      id: 't',
      dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 25, conditionModifiers: WORKED_EXAMPLE_BIOME_MODIFIERS }]
    },
    environment,
    actor: { uuid: 'Actor.x' }
  });
  return result.items[0];
}

test('strongestOfEach aggregates the largest boost and largest penalty', async () => {
  const drop = await resolveWorkedExample('strongestOfEach');
  assert.equal(drop.conditionModifier, 8); // +15 (forest) + -7 (cave)
  assert.equal(drop.finalDropRate, 33);
});

test('cumulative sums every matching biome modifier', async () => {
  const drop = await resolveWorkedExample('cumulative');
  assert.equal(drop.conditionModifier, 18); // 10 + 15 - 7
  assert.equal(drop.finalDropRate, 43);
});

test('dominant applies only the single largest-magnitude modifier', async () => {
  const drop = await resolveWorkedExample('dominant');
  assert.equal(drop.conditionModifier, 15); // forest +15 is the largest magnitude
  assert.equal(drop.finalDropRate, 40);
});

test('biome modifiers only match biomes present in the gathering environment', async () => {
  const { service } = makeRichState({ config: configFor(), rolls: [100] });
  const environment = composedEnvironment(service, { biomes: ['grassland'], aggregation: 'cumulative' });
  const result = await service.resolveD100Attempt({
    task: {
      id: 't',
      dropRows: [{ id: 'd1', componentId: 'herb', quantity: 1, dropRate: 25, conditionModifiers: WORKED_EXAMPLE_BIOME_MODIFIERS }]
    },
    environment,
    actor: { uuid: 'Actor.x' }
  });
  // Only grassland (+10) is an active biome; forest and cave are ignored.
  assert.equal(result.items[0].conditionModifier, 10);
  assert.equal(result.items[0].finalDropRate, 35);
});

test('hazard trigger rate is adjusted by its biome modifiers at runtime', async () => {
  const { service } = makeRichState({ config: configFor(), rolls: [100, 100] });
  const environment = composedEnvironment(service, {
    biomes: ['cave'],
    aggregation: 'strongestOfEach',
    hazards: [{
      id: 'h1',
      name: 'Cave-in',
      dropRate: 25,
      conditionModifiers: { biome: [{ id: 'hb-cave', conditionId: 'cave', value: 15 }] }
    }]
  });
  const result = await service.resolveD100Attempt({
    task: { id: 't', dropRows: [] },
    environment,
    actor: { uuid: 'Actor.x' }
  });
  assert.equal(result.hazards.length, 1);
  assert.equal(result.hazards[0].conditionModifier, 15);
  assert.equal(result.hazards[0].finalDropRate, 40);
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { migrateGatheringConfig } from '../src/migration/migrateGatheringConfig.js';

test('migrateGatheringConfig clears top-level vocabularies.regions when non-empty', () => {
  const input = {
    conditions: { weather: 'rain', timeOfDay: 'dusk' },
    vocabularies: {
      regions: ['northreach', 'eastreach'],
      biomes: ['forest', 'grassland'],
      weather: ['clear', 'rain'],
      timeOfDay: ['dawn', 'dusk']
    },
    systems: { 'my-system': { tools: [{ id: 't1' }] } }
  };

  const result = migrateGatheringConfig(input);

  assert.deepEqual(result.vocabularies.regions, []);
  assert.deepEqual(result.vocabularies.biomes, ['forest', 'grassland'],
    'biomes preserved');
  assert.deepEqual(result.vocabularies.weather, ['clear', 'rain'],
    'weather preserved');
  assert.deepEqual(result.vocabularies.timeOfDay, ['dawn', 'dusk'],
    'timeOfDay preserved');
  assert.deepEqual(result.conditions, { weather: 'rain', timeOfDay: 'dusk' },
    'conditions preserved');
  assert.deepEqual(result.systems, { 'my-system': { tools: [{ id: 't1' }] } },
    'systems preserved');
});

test('migrateGatheringConfig is idempotent when regions already empty', () => {
  const input = {
    vocabularies: { regions: [], biomes: ['forest'] },
    systems: {}
  };

  const result = migrateGatheringConfig(input);

  assert.deepEqual(result, input, 'output JSON-equivalent to input');
  assert.notStrictEqual(result, input, 'returns a clone, not the same object');
});

test('migrateGatheringConfig leaves config alone when vocabularies missing', () => {
  const input = { conditions: { weather: 'clear' }, systems: {} };
  const result = migrateGatheringConfig(input);

  assert.deepEqual(result, input);
  assert.equal('vocabularies' in result, false,
    'no vocabularies key is injected when not present in input');
});

test('migrateGatheringConfig handles non-object inputs by passing them through', () => {
  assert.equal(migrateGatheringConfig(null), null);
  assert.equal(migrateGatheringConfig(undefined), undefined);
  assert.equal(migrateGatheringConfig('not-an-object'), 'not-an-object');
  assert.equal(migrateGatheringConfig(42), 42);
  const arr = [1, 2, 3];
  assert.equal(migrateGatheringConfig(arr), arr, 'arrays pass through unchanged');
});

test('migrateGatheringConfig does not touch per-system vocabularies', () => {
  const input = {
    vocabularies: { regions: ['northreach'] },
    systems: {
      'sys-a': {
        vocabularies: { regions: { values: ['system-scoped-region'] } },
        tools: []
      }
    }
  };

  const result = migrateGatheringConfig(input);

  assert.deepEqual(result.vocabularies.regions, []);
  assert.deepEqual(result.systems['sys-a'].vocabularies.regions.values, ['system-scoped-region'],
    'per-system regions are scoped and intentionally preserved');
});

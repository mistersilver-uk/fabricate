import test from 'node:test';
import assert from 'node:assert/strict';

import { environmentHasLocationRules, evaluateLocationAvailability } from '../src/systems/gatheringLocation.js';

function context(regions) {
  return { resolved: regions.length > 0, regions };
}

const unresolved = { resolved: false, regions: [] };

test('ungated environment (no rule fields) is always available, not location-gated', () => {
  const env = { name: 'Legacy', region: 'forest', biomes: ['forest'] };
  assert.equal(environmentHasLocationRules(env), false);
  const result = evaluateLocationAvailability(env, unresolved);
  assert.equal(result.available, true);
  assert.equal(result.gated, false);
});

test('empty-after-normalization arrays are ungated, identical to absent fields', () => {
  const env = { includedRegionIds: [], excludedRegionIds: [], includedBiomeIds: [], excludedBiomeIds: [] };
  assert.equal(environmentHasLocationRules(env), false);
  const result = evaluateLocationAvailability(env, unresolved);
  assert.equal(result.gated, false);
  assert.equal(result.available, true);
});

test('inclusion-gated environment is blocked with NO_CURRENT_REGION when unresolved', () => {
  const env = { includedRegionIds: ['r1'] };
  const result = evaluateLocationAvailability(env, unresolved);
  assert.equal(result.available, false);
  assert.deepEqual(result.reasons, ['NO_CURRENT_REGION']);
});

test('exclusion-only environment is available when unresolved (global-except)', () => {
  const env = { excludedRegionIds: ['r1'] };
  const result = evaluateLocationAvailability(env, unresolved);
  assert.equal(result.available, true);
  assert.equal(result.gated, true);
});

test('region inclusion matches when a current region id is included', () => {
  const env = { includedRegionIds: ['r1'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r1' }]));
  assert.equal(result.available, true);
  assert.deepEqual(result.matchedRegionIds, ['r1']);
});

test('inclusion-gated environment blocked (LOCATION_BLOCKED) when no current region matches', () => {
  const env = { includedRegionIds: ['r1'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r2' }]));
  assert.equal(result.available, false);
  assert.deepEqual(result.reasons, ['LOCATION_BLOCKED']);
});

test('biome inclusion matches when any current region has an included biome', () => {
  const env = { includedBiomeIds: ['forest'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r1', biomes: ['forest'] }]));
  assert.equal(result.available, true);
});

test('region exclusion wins over inclusion in mixed current regions', () => {
  // r1 includes the env, r2 explicitly excludes it. Exclusion wins.
  const env = { includedRegionIds: ['r1'], excludedRegionIds: ['r2'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r1' }, { id: 'r2' }]));
  assert.equal(result.available, false);
  assert.deepEqual(result.reasons, ['LOCATION_BLOCKED']);
  assert.deepEqual(result.excludedRegionIds, ['r2']);
});

test('biome exclusion on any current region wins over inclusion matched by another', () => {
  const env = { includedRegionIds: ['r1'], excludedBiomeIds: ['volcanic'] };
  const result = evaluateLocationAvailability(env, context([
    { id: 'r1', biomes: ['forest'] },
    { id: 'r2', biomes: ['volcanic'] }
  ]));
  assert.equal(result.available, false);
  assert.deepEqual(result.reasons, ['LOCATION_BLOCKED']);
  assert.deepEqual(result.excludedRegionIds, ['r2']);
});

test('exclusion-only environment is available in a non-excluded current region', () => {
  const env = { excludedRegionIds: ['r2'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r1' }]));
  assert.equal(result.available, true);
});

test('exclusion-only environment is blocked in an excluded current region', () => {
  const env = { excludedRegionIds: ['r1'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r1' }]));
  assert.equal(result.available, false);
  assert.deepEqual(result.excludedRegionIds, ['r1']);
});

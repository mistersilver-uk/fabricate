import test from 'node:test';
import assert from 'node:assert/strict';

import { environmentHasLocationRules, evaluateLocationAvailability } from '../src/systems/gatheringLocation.js';

function context(realms) {
  return { resolved: realms.length > 0, realms };
}

const unresolved = { resolved: false, realms: [] };

test('ungated environment (no rule fields) is always available, not location-gated', () => {
  const env = { name: 'Legacy', region: 'forest', biomes: ['forest'] };
  assert.equal(environmentHasLocationRules(env), false);
  const result = evaluateLocationAvailability(env, unresolved);
  assert.equal(result.available, true);
  assert.equal(result.gated, false);
});

test('empty-after-normalization arrays are ungated, identical to absent fields', () => {
  const env = { includedRealmIds: [], excludedRealmIds: [], includedBiomeIds: [], excludedBiomeIds: [] };
  assert.equal(environmentHasLocationRules(env), false);
  const result = evaluateLocationAvailability(env, unresolved);
  assert.equal(result.gated, false);
  assert.equal(result.available, true);
});

test('inclusion-gated environment is blocked with NO_CURRENT_REALM when unresolved', () => {
  const env = { includedRealmIds: ['r1'] };
  const result = evaluateLocationAvailability(env, unresolved);
  assert.equal(result.available, false);
  assert.deepEqual(result.reasons, ['NO_CURRENT_REALM']);
});

test('exclusion-only environment is available when unresolved (global-except)', () => {
  const env = { excludedRealmIds: ['r1'] };
  const result = evaluateLocationAvailability(env, unresolved);
  assert.equal(result.available, true);
  assert.equal(result.gated, true);
});

test('realm inclusion matches when a current realm id is included', () => {
  const env = { includedRealmIds: ['r1'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r1' }]));
  assert.equal(result.available, true);
  assert.deepEqual(result.matchedRealmIds, ['r1']);
});

test('inclusion-gated environment blocked (LOCATION_BLOCKED) when no current realm matches', () => {
  const env = { includedRealmIds: ['r1'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r2' }]));
  assert.equal(result.available, false);
  assert.deepEqual(result.reasons, ['LOCATION_BLOCKED']);
});

test('biome inclusion matches when any current realm has an included biome', () => {
  const env = { includedBiomeIds: ['forest'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r1', biomes: ['forest'] }]));
  assert.equal(result.available, true);
});

test('realm exclusion wins over inclusion in mixed current realms', () => {
  // r1 includes the env, r2 explicitly excludes it. Exclusion wins.
  const env = { includedRealmIds: ['r1'], excludedRealmIds: ['r2'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r1' }, { id: 'r2' }]));
  assert.equal(result.available, false);
  assert.deepEqual(result.reasons, ['LOCATION_BLOCKED']);
  assert.deepEqual(result.excludedRealmIds, ['r2']);
});

test('biome exclusion on any current realm wins over inclusion matched by another', () => {
  const env = { includedRealmIds: ['r1'], excludedBiomeIds: ['volcanic'] };
  const result = evaluateLocationAvailability(env, context([
    { id: 'r1', biomes: ['forest'] },
    { id: 'r2', biomes: ['volcanic'] }
  ]));
  assert.equal(result.available, false);
  assert.deepEqual(result.reasons, ['LOCATION_BLOCKED']);
  assert.deepEqual(result.excludedRealmIds, ['r2']);
});

test('exclusion-only environment is available in a non-excluded current realm', () => {
  const env = { excludedRealmIds: ['r2'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r1' }]));
  assert.equal(result.available, true);
});

test('exclusion-only environment is blocked in an excluded current realm', () => {
  const env = { excludedRealmIds: ['r1'] };
  const result = evaluateLocationAvailability(env, context([{ id: 'r1' }]));
  assert.equal(result.available, false);
  assert.deepEqual(result.excludedRealmIds, ['r1']);
});

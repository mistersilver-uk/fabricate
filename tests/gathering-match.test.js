import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateEnvironmentMatch } from '../src/systems/gatheringMatch.js';

const environment = {
  region: 'north',
  biomes: ['forest', 'cave'],
  dangerTags: ['hazardous']
};
const conditions = { weather: 'clear', timeOfDay: 'day' };

test('empty record constraints match any environment and report "any" evidence', () => {
  const { matches, evidence } = evaluateEnvironmentMatch({}, environment, conditions, { includeDanger: true });
  assert.equal(matches, true);
  // Region is no longer a composition axis — there is no region evidence dimension.
  assert.equal('region' in evidence, false);
  assert.equal(evidence.biome.state, 'any');
  assert.equal(evidence.weather.state, 'any');
  assert.equal(evidence.time.state, 'any');
  assert.equal(evidence.danger.state, 'any');
});

test('overlapping biome tags report a match (region is ignored for composition)', () => {
  // The record still carries a legacy `regions` tag and a NON-matching region;
  // composition must ignore region entirely and match purely on biome/danger.
  const record = { regions: ['south'], biomes: ['cave'], weather: ['clear'], timeOfDay: ['day'], dangerTags: ['hazardous'] };
  const { matches, evidence } = evaluateEnvironmentMatch(record, environment, conditions, { includeDanger: true });
  assert.equal(matches, true);
  assert.equal('region' in evidence, false);
  assert.equal(evidence.biome.state, 'match');
  assert.equal(evidence.weather.state, 'match');
  assert.equal(evidence.time.state, 'match');
  assert.equal(evidence.danger.state, 'match');
});

test('a non-overlapping biome blocks the match and is flagged as mismatch', () => {
  const record = { biomes: ['desert'] };
  const { matches, evidence } = evaluateEnvironmentMatch(record, environment, conditions, { includeDanger: false });
  assert.equal(matches, false);
  assert.equal(evidence.biome.state, 'mismatch');
  assert.deepEqual(evidence.biome.recordValues, ['desert']);
});

test('weather/time constraints are ignored when the dimension is disabled', () => {
  const record = { weather: ['storm'], timeOfDay: ['night'] };
  const conditionSettings = { weather: { enabled: false }, timeOfDay: { enabled: false } };
  const { matches, evidence } = evaluateEnvironmentMatch(record, environment, conditions, { includeDanger: false, conditionSettings });
  assert.equal(matches, true);
  assert.equal(evidence.weather.state, 'any');
  assert.equal(evidence.weather.applicable, false);
  assert.equal(evidence.time.applicable, false);
});

test('danger is only applied when includeDanger is set (hazards)', () => {
  const record = { dangerTags: ['deadly'] };
  const taskView = evaluateEnvironmentMatch(record, environment, conditions, { includeDanger: false });
  assert.equal(taskView.matches, true);
  assert.equal(taskView.evidence.danger.applicable, false);

  const hazardView = evaluateEnvironmentMatch(record, environment, conditions, { includeDanger: true });
  assert.equal(hazardView.matches, false);
  assert.equal(hazardView.evidence.danger.state, 'mismatch');
});

test('danger is a severity ceiling: hazards at or below the environment level match', () => {
  const env = { dangerLevel: 'dangerous' };
  const below = evaluateEnvironmentMatch({ dangerTags: ['hazardous'] }, env, conditions, { includeDanger: true });
  assert.equal(below.evidence.danger.state, 'match');
  const equal = evaluateEnvironmentMatch({ dangerTags: ['dangerous'] }, env, conditions, { includeDanger: true });
  assert.equal(equal.evidence.danger.state, 'match');
  const above = evaluateEnvironmentMatch({ dangerTags: ['deadly'] }, env, conditions, { includeDanger: true });
  assert.equal(above.evidence.danger.state, 'mismatch');
  assert.equal(above.matches, false);
  const none = evaluateEnvironmentMatch({ dangerTags: [] }, env, conditions, { includeDanger: true });
  assert.equal(none.evidence.danger.state, 'any');
});

test('a hazard is ranked by its highest danger tag against the ceiling', () => {
  const env = { dangerLevel: 'dangerous' };
  const mixed = evaluateEnvironmentMatch({ dangerTags: ['safe', 'deadly'] }, env, conditions, { includeDanger: true });
  assert.equal(mixed.evidence.danger.state, 'mismatch');
  assert.deepEqual(mixed.evidence.danger.envValues, ['dangerous']);
});

test('weather/time mismatches keep matches true but flip conditionsMet to false', () => {
  const record = { weather: ['storm'] };
  const { matches, conditionsMet, evidence } = evaluateEnvironmentMatch(record, environment, conditions, { includeDanger: false });
  // Weather is a runtime gate, not a match criterion.
  assert.equal(matches, true);
  assert.equal(conditionsMet, false);
  assert.equal(evidence.weather.state, 'mismatch');
});

test('biome/danger mismatch still drives matches false', () => {
  const record = { biomes: ['desert'] };
  const { matches, conditionsMet } = evaluateEnvironmentMatch(record, environment, conditions, { includeDanger: false });
  assert.equal(matches, false);
  // Conditions can still be met even when matching fails.
  assert.equal(conditionsMet, true);
});

test('a record whose ONLY constraint was a (now-stripped) region matches any environment', () => {
  // A formerly region-narrowed record with an empty biome list now composes
  // anywhere its biome ("any") and danger allow — the broaden direction.
  const record = { regions: ['north'], biomes: [] };
  const otherEnv = { biomes: ['desert'], dangerTags: ['safe'] };
  const here = evaluateEnvironmentMatch(record, environment, conditions, { includeDanger: false });
  const elsewhere = evaluateEnvironmentMatch(record, otherEnv, conditions, { includeDanger: false });
  assert.equal(here.matches, true);
  assert.equal(elsewhere.matches, true);
  assert.equal(here.evidence.biome.state, 'any');
});

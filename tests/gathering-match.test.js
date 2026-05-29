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
  assert.equal(evidence.region.state, 'any');
  assert.equal(evidence.biome.state, 'any');
  assert.equal(evidence.weather.state, 'any');
  assert.equal(evidence.time.state, 'any');
  assert.equal(evidence.danger.state, 'any');
});

test('overlapping biome and region tags report a match', () => {
  const record = { regions: ['north'], biomes: ['cave'], weather: ['clear'], timeOfDay: ['day'], dangerTags: ['hazardous'] };
  const { matches, evidence } = evaluateEnvironmentMatch(record, environment, conditions, { includeDanger: true });
  assert.equal(matches, true);
  assert.equal(evidence.region.state, 'match');
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

test('weather constraint that does not include the current condition is a mismatch', () => {
  const record = { weather: ['storm'] };
  const { matches, evidence } = evaluateEnvironmentMatch(record, environment, conditions, { includeDanger: false });
  assert.equal(matches, false);
  assert.equal(evidence.weather.state, 'mismatch');
});

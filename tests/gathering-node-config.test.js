import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRespawn, VALID_RESPAWN_POLICIES, VALID_RESPAWN_GAIN_MODES } from '../src/systems/gatheringNodeConfig.js';

test('the respawn schema exposes exactly two policies and three gain modes', () => {
  assert.deepEqual([...VALID_RESPAWN_POLICIES].sort(), ['manual', 'overTime']);
  assert.deepEqual([...VALID_RESPAWN_GAIN_MODES].sort(), ['chance', 'expression', 'guaranteed']);
});

test('normalizeRespawn defaults a missing/invalid block to manual', () => {
  assert.deepEqual(normalizeRespawn(null), { policy: 'manual' });
  assert.deepEqual(normalizeRespawn(undefined), { policy: 'manual' });
  assert.deepEqual(normalizeRespawn('nope'), { policy: 'manual' });
});

test('normalizeRespawn coerces an unknown/legacy policy to manual', () => {
  // Legacy values are mapped by the 0.4.0 migration; at read time they coerce.
  for (const policy of ['none', 'elapsedTime', 'probability', 'manualAndElapsedTime', 'whatever']) {
    assert.equal(normalizeRespawn({ policy }).policy, 'manual', `${policy} → manual`);
  }
});

test('normalizeRespawn defaults an unknown gain mode to guaranteed', () => {
  assert.equal(normalizeRespawn({ policy: 'overTime', gainMode: 'bogus' }).gainMode, 'guaranteed');
  assert.equal(normalizeRespawn({ policy: 'overTime' }).gainMode, 'guaranteed');
  assert.equal(normalizeRespawn({ policy: 'overTime', gainMode: 'chance' }).gainMode, 'chance');
});

test('normalizeRespawn trims the amount expression and coerces numeric fields', () => {
  const out = normalizeRespawn({ policy: 'overTime', gainMode: 'expression', amountExpression: '  1d4  ', intervalSeconds: '3600', chance: '0.5' });
  assert.equal(out.amountExpression, '1d4');
  assert.equal(out.intervalSeconds, 3600);
  assert.equal(out.chance, 0.5);
  // A non-string expression normalizes to an empty string.
  assert.equal(normalizeRespawn({ policy: 'overTime', gainMode: 'expression', amountExpression: 5 }).amountExpression, '');
});

test('normalizeRespawn preserves world-time anchors and lastRoll', () => {
  const out = normalizeRespawn({ policy: 'overTime', gainMode: 'chance', intervalSeconds: 60, chance: 0.3, lastEvaluatedWorldTime: 1000, nextEvaluationWorldTime: 1060, lastRoll: { worldTime: 1000, chance: 0.3, rolls: [10] } });
  assert.equal(out.lastEvaluatedWorldTime, 1000);
  assert.equal(out.nextEvaluationWorldTime, 1060);
  assert.deepEqual(out.lastRoll, { worldTime: 1000, chance: 0.3, rolls: [10] });
});

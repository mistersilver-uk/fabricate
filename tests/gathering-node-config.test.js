import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeRespawn, VALID_RESPAWN_POLICIES, VALID_RESPAWN_GAIN_MODES, VALID_RESPAWN_UNITS } from '../src/systems/gatheringNodeConfig.js';

test('the respawn schema exposes exactly two policies and three gain modes', () => {
  assert.deepEqual([...VALID_RESPAWN_POLICIES].sort(), ['manual', 'overTime']);
  assert.deepEqual([...VALID_RESPAWN_GAIN_MODES].sort(), ['chance', 'expression', 'guaranteed']);
});

test('normalizeRespawn defaults a missing/invalid block to manual', () => {
  assert.deepEqual(normalizeRespawn(null), { policy: 'manual' });
  assert.deepEqual(normalizeRespawn(undefined), { policy: 'manual' });
  assert.deepEqual(normalizeRespawn('nope'), { policy: 'manual' });
});

test('normalizeRespawn maps legacy respawn policies to the manual|overTime schema at read time', () => {
  // Resilience to un-migrated worlds: legacy auto-respawn policies become overTime
  // (so respawn still fires) rather than silently coercing to manual.
  assert.deepEqual(
    { policy: normalizeRespawn({ policy: 'elapsedTime' }).policy, gainMode: normalizeRespawn({ policy: 'elapsedTime' }).gainMode },
    { policy: 'overTime', gainMode: 'guaranteed' }
  );
  assert.equal(normalizeRespawn({ policy: 'probability' }).policy, 'overTime');
  assert.equal(normalizeRespawn({ policy: 'probability' }).gainMode, 'chance');
  assert.equal(normalizeRespawn({ policy: 'manualAndElapsedTime' }).policy, 'overTime');
  // `none` and truly unknown values still mean "no automatic respawn".
  assert.equal(normalizeRespawn({ policy: 'none' }).policy, 'manual');
  assert.equal(normalizeRespawn({ policy: 'whatever' }).policy, 'manual');
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

test('the respawn schema exposes the four calendar-aware interval units', () => {
  assert.deepEqual([...VALID_RESPAWN_UNITS].sort(), ['days', 'hours', 'minutes', 'weeks']);
});

test('normalizeRespawn keeps the unit+amount interval schema and drops legacy seconds', () => {
  const out = normalizeRespawn({ policy: 'overTime', gainMode: 'guaranteed', intervalUnit: 'days', intervalAmount: '2', intervalSeconds: 999 });
  assert.equal(out.intervalUnit, 'days');
  assert.equal(out.intervalAmount, 2);
  assert.ok(!('intervalSeconds' in out), 'legacy seconds is dropped once a unit is present');
});

test('normalizeRespawn defaults an unknown interval unit to hours', () => {
  const out = normalizeRespawn({ policy: 'overTime', intervalUnit: 'fortnights', intervalAmount: 3 });
  assert.equal(out.intervalUnit, 'hours');
  assert.equal(out.intervalAmount, 3);
});

test('normalizeRespawn preserves a legacy raw intervalSeconds when no unit is present', () => {
  const out = normalizeRespawn({ policy: 'overTime', gainMode: 'guaranteed', intervalSeconds: 3600 });
  assert.equal(out.intervalSeconds, 3600);
  assert.ok(!('intervalUnit' in out), 'no unit is fabricated for a legacy node');
});

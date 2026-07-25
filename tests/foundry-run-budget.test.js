import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveSmokeProfile,
  defaultRunTimeoutMs,
  FINALIZATION_GRACE_MS,
  EXPECTED_WALK_MS_BY_PROFILE,
} from '../scripts/lib/foundryRunBudget.js';

test('resolveSmokeProfile defaults to full when unset (nullish)', () => {
  assert.equal(resolveSmokeProfile(undefined), 'full');
  assert.equal(resolveSmokeProfile(null), 'full');
});

test('resolveSmokeProfile preserves empty string (nullish-only, matches child)', () => {
  // The child (`scripts/foundry-test-run.mjs`) uses `?? 'full'`, so an empty string
  // stays empty rather than defaulting to full. The helper must match exactly.
  assert.equal(resolveSmokeProfile(''), '');
});

test('resolveSmokeProfile aliases ci to rc', () => {
  assert.equal(resolveSmokeProfile('ci'), 'rc');
  assert.equal(resolveSmokeProfile('CI'), 'rc');
});

test('resolveSmokeProfile lowercases', () => {
  assert.equal(resolveSmokeProfile('FULL'), 'full');
  assert.equal(resolveSmokeProfile('Screenshots'), 'screenshots');
  assert.equal(resolveSmokeProfile('RC'), 'rc');
});

test('defaultRunTimeoutMs(rc) is 18 minutes (no CI regression)', () => {
  assert.equal(defaultRunTimeoutMs('rc'), 18 * 60_000);
});

test('defaultRunTimeoutMs(full) clears the proven 1_500_000 ms workaround', () => {
  assert.ok(defaultRunTimeoutMs('full') >= 1_500_000);
});

test('defaultRunTimeoutMs(screenshots) also clears the long-walk workaround', () => {
  assert.ok(defaultRunTimeoutMs('screenshots') >= 1_500_000);
});

test('defaultRunTimeoutMs(full) exceeds defaultRunTimeoutMs(rc)', () => {
  assert.ok(defaultRunTimeoutMs('full') > defaultRunTimeoutMs('rc'));
});

test('defaultRunTimeoutMs falls back to the full budget for an unknown profile', () => {
  const fullBudget = defaultRunTimeoutMs('full');
  assert.equal(defaultRunTimeoutMs('bogus'), fullBudget);
  assert.equal(defaultRunTimeoutMs(''), fullBudget);
});

test('the budget is composed as expected walk + finalization grace', () => {
  assert.equal(defaultRunTimeoutMs('rc'), EXPECTED_WALK_MS_BY_PROFILE.rc + FINALIZATION_GRACE_MS);
});

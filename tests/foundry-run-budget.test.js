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

// The `rc` budget must clear a MEASURED walk, not an estimate. Beta run #144 walked
// 1344.3s on a hosted runner and was SIGTERM-killed after printing "Smoke test PASSED."
// (issue #987). Asserting against the measurement rather than the constant is what makes
// this test fail if someone lowers the walk figure back toward the old 14-minute guess.
const MEASURED_RC_WALK_MS = 1_344_300;

test('defaultRunTimeoutMs(rc) clears the measured 1344.3s CI walk plus finalization', () => {
  assert.ok(
    defaultRunTimeoutMs('rc') >= MEASURED_RC_WALK_MS + FINALIZATION_GRACE_MS,
    'the rc budget must cover the measured walk AND the finalization grace, or a passing run is killed mid-teardown'
  );
});

test('defaultRunTimeoutMs(rc) is 28 minutes', () => {
  assert.equal(defaultRunTimeoutMs('rc'), 28 * 60_000);
});

test('defaultRunTimeoutMs(full) clears the proven 1_500_000 ms workaround', () => {
  assert.ok(defaultRunTimeoutMs('full') >= 1_500_000);
});

test('defaultRunTimeoutMs(screenshots) also clears the long-walk workaround', () => {
  assert.ok(defaultRunTimeoutMs('screenshots') >= 1_500_000);
});

test('defaultRunTimeoutMs(full) exceeds defaultRunTimeoutMs(rc)', () => {
  // The long walk is the rc walk PLUS phases D0 and F, so it can never be shorter.
  // `full`/`screenshots` remain unmeasured (issue #973) — this ordering is the only
  // claim made about them, and it is an inference from what the profiles do.
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

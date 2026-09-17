/**
 * Pure (playwright-free, no autorun) derivation of the smoke run's wall-clock budget from the smoke
 * profile.
 */

/**
 * Normalize the raw `FOUNDRY_SMOKE_PROFILE` value exactly as the child smoke run
 * (`scripts/foundry-test-run.mjs`) does: nullish-default to `'full'`, lowercase, and alias the
 * deprecated `'ci'` to `'rc'`.
 */
export function resolveSmokeProfile(raw) {
  const normalized = String(raw ?? 'full').toLowerCase();
  return normalized === 'ci' ? 'rc' : normalized;
}

/** Wall-time the post-verdict `finally` block needs after "Smoke test passed." */
export const FINALIZATION_GRACE_MS = 4 * 60_000;

/** Expected walk-only duration per profile (excludes finalization grace). */
export const EXPECTED_WALK_MS_BY_PROFILE = {
  full: 32 * 60_000,
  screenshots: 32 * 60_000,
  rc: 24 * 60_000,
  // `perf` (issue #1073) is unmeasured and deliberately the most generous entry in the table.
  perf: 60 * 60_000,
};

/**
 * Default run-timeout budget for a profile: expected walk + finalization grace. An unknown profile
 * (including the empty-string case) falls back to the `full` budget, the safe upper bound.
 */
export function defaultRunTimeoutMs(profile) {
  const walkMs = EXPECTED_WALK_MS_BY_PROFILE[profile] ?? EXPECTED_WALK_MS_BY_PROFILE.full;
  return walkMs + FINALIZATION_GRACE_MS;
}

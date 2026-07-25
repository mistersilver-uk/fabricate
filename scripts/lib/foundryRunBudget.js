/**
 * foundryRunBudget.js
 *
 * Pure (playwright-free, no autorun) derivation of the smoke run's wall-clock
 * budget from the smoke profile. `scripts/foundry-test.mjs` gives the in-browser
 * run its own `spawnSync` timeout; that single budget spans the entire walk PLUS
 * the post-verdict finalization in `scripts/foundry-test-run.mjs` (full-only Phase F
 * cleanup, `browser.close()`, timing tables, and the `summary.json` write). A flat
 * default tuned to the `rc` walk SIGTERM-kills a legitimately-passing `full` walk
 * mid-finalization, so `summary.json` is never written and a green run reports red
 * (issue #817).
 *
 * The default is therefore composed as `expectedWalkMs(profile) + finalizationGrace`
 * so the `summary.json` write is always inside the budget. An explicit
 * `FOUNDRY_RUN_TIMEOUT_MS` (e.g. CI's pin) still wins.
 *
 * WHY a separate module: the derivation is shared by the parent wrapper, the child
 * run, and the unit tests, and living here keeps it out of a place that would trip
 * the Sonar `scripts/**` duplication gate.
 */

/**
 * Normalize the raw `FOUNDRY_SMOKE_PROFILE` value EXACTLY as the child smoke run
 * (`scripts/foundry-test-run.mjs`) does: nullish-default to `'full'`, lowercase, and
 * alias the deprecated `'ci'` to `'rc'`. Deliberately nullish-only — an empty string
 * stays empty (not `'full'`) so the parent and child can never drift on what an unset
 * vs. empty profile means.
 * @param {string | undefined | null} raw
 * @returns {string}
 */
export function resolveSmokeProfile(raw) {
  const normalized = String(raw ?? 'full').toLowerCase();
  return normalized === 'ci' ? 'rc' : normalized;
}

/**
 * Wall-time the post-verdict `finally` block needs after "Smoke test PASSED." —
 * full-only Phase F document deletion + `browser.close()` + timing-table and
 * `summary.json` writes — separated from the walk budget so it is never eaten by
 * walk-duration variance.
 */
export const FINALIZATION_GRACE_MS = 4 * 60_000;

/**
 * Expected walk-only duration per profile (excludes finalization grace). `rc` matches
 * the observed ~870-930s CI walk with margin; `full`/`screenshots` share the long walk.
 */
export const EXPECTED_WALK_MS_BY_PROFILE = {
  full: 22 * 60_000,
  screenshots: 22 * 60_000,
  rc: 14 * 60_000,
};

/**
 * Default run-timeout budget for a profile: expected walk + finalization grace. An
 * unknown profile (including the empty-string case) falls back to the `full` budget,
 * the safe upper bound. Yields `rc` = 18 min (unchanged from the old flat default, so
 * no CI regression) and `full`/`screenshots` ≈ 26 min (≥ the proven 1_500_000 ms
 * workaround), so the full walk no longer needs a manual override.
 * @param {string} profile
 * @returns {number}
 */
export function defaultRunTimeoutMs(profile) {
  const walkMs = EXPECTED_WALK_MS_BY_PROFILE[profile] ?? EXPECTED_WALK_MS_BY_PROFILE.full;
  return walkMs + FINALIZATION_GRACE_MS;
}

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
 * Expected walk-only duration per profile (excludes finalization grace).
 *
 * `rc` is MEASURED, not estimated: beta run #144 walked 1344.3s on a hosted runner
 * (issue #987) and was SIGTERM-killed after printing "Smoke test PASSED." — the
 * previous 14-minute figure, and the "~870-930s observed" comment that justified it,
 * were both overtaken by what the walk now costs. 24 minutes carries ~1.6 minutes over
 * that measurement.
 *
 * `full`/`screenshots` are still UNMEASURED (issue #973 owns that). They are set above
 * `rc` by inference rather than guesswork: the long walk is the `rc` walk PLUS phases
 * D0 and F, so it cannot be shorter than a measured `rc`. #973 separately records a
 * `full` walk SIGTERM-killed at the 26-minute budget, which is consistent with a walk
 * beyond the old 22-minute figure.
 */
export const EXPECTED_WALK_MS_BY_PROFILE = {
  full: 32 * 60_000,
  screenshots: 32 * 60_000,
  rc: 24 * 60_000,
  // `perf` (issue #1073) is UNMEASURED and deliberately the most generous entry in the table. It is
  // not a walk of the smoke's phases at all: it seeds a synthetic corpus of up to 10,000 recipes
  // into a live world, RELOADS to measure startup against it, then drives the GM manager, the player
  // app and a second joined client. The corpus sizes it exists to characterise are the ones the
  // whole performance programme calls slow, so the budget cannot be derived from any measured walk —
  // and unlike `rc`, a `perf` overrun costs an opt-in manual run rather than a required check.
  //
  // Two facts bound the guess from below. Issue #1070 measured 10,000 synthetic recipes serializing
  // to 22.3 MB, and its alchemy note records that the PRE-FIX behaviour at N=5,000 extrapolates to
  // hours — which is why `alchemy-signatures` is capped at 2,000 and proved with counters. Anything
  // beyond this budget is a hang or a pathology worth interrupting, not a long run.
  perf: 60 * 60_000,
};

/**
 * Default run-timeout budget for a profile: expected walk + finalization grace. An
 * unknown profile (including the empty-string case) falls back to the `full` budget,
 * the safe upper bound. Yields `rc` = 28 min and `full`/`screenshots` = 36 min, so
 * neither walk needs a manual override — `.github/workflows/foundry-integration.yml`
 * pinned `FOUNDRY_RUN_TIMEOUT_MS` while this default was too low, and that pin is gone
 * (issue #987). Keep it that way: a second place to record the budget is a second place
 * to be wrong, and the env override below remains for a genuine one-off.
 * @param {string} profile
 * @returns {number}
 */
export function defaultRunTimeoutMs(profile) {
  const walkMs = EXPECTED_WALK_MS_BY_PROFILE[profile] ?? EXPECTED_WALK_MS_BY_PROFILE.full;
  return walkMs + FINALIZATION_GRACE_MS;
}

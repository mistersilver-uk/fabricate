# Faster FVTT Smoke Test

## Summary

The FVTT smoke test is the only gate that proves Fabricate boots inside a real Foundry world, that crafting works end-to-end, and that the Gathering app behaves correctly. It currently takes ~6–8 min in the `ci` profile (release-candidate pipeline) and ~10–15 min in the `full` profile (local screenshot regeneration). The 20-minute CI timeout exists because earlier hangs (e.g. the 13-minute Phase D0 hang noted at `scripts/foundry-test-run.mjs:602`) have already crowded the budget.

This change keeps the release-candidate smoke as a high-fidelity real-Foundry gate but stops using it as a broad screenshot-regeneration suite. It introduces a dedicated `rc` profile, pins an explicit RC screenshot budget, adds phase-timing instrumentation so future tuning is data-driven, replaces the longest fixed waits with deterministic readiness checks, and adds GitHub Actions caches for the Foundry binary, Playwright Chromium, and the dnd5e system. Combined, these changes target ~2–4 minutes off cold RC runs and ~1–2 minutes off warm runs with no loss of fidelity on the happy paths the smoke test is meant to prove.

## Goals

- **Phase-timing instrumentation.** `summary.json` records per-phase durations; a concise timing table prints to stdout at the end of every run.
- **Clean artifacts per run.** `test-results/` is wiped at the top of each run so the uploaded artifact contains only current-run screenshots, console log, and summary.
- **Dedicated `rc` profile.** A new release-candidate profile runs only the load-bearing happy paths: real Foundry startup, world join, Fabricate ready, fixture creation, crafting (Brew Healing Potion), one successful gathering task, and console-error health. `ci` becomes an alias for `rc`; `full` is unchanged.
- **Explicit RC screenshot budget.** Exactly 6 screenshots prove the RC happy paths, plus an on-failure screenshot. Everything else is gated behind `full`.
- **No-fidelity-loss wait audit.** The longest fixed `waitForTimeout` calls become deterministic `waitForSelector` / `waitForFunction` waits.
- **CSS-hide notifications.** Foundry notifications are hidden via injected CSS at world-load, removing the per-screenshot 300 ms `dismissFoundryNotifications` sleep and the redundant inter-screenshot dismiss calls in Phase D2.
- **CI caches.** `actions/cache@v4` caches the Foundry binary archive, Playwright Chromium, and the dnd5e system across runs.
- **Skip work RC doesn't need.** Phase F cleanup and the gathering feature-gate negative test only run in `full`.

## Non-Goals

- Pre-baked Foundry data image (future follow-up — tracked as Tier 2.1 in the design appendix). Would land in a second change once this one is green for three consecutive RC runs.
- Playwright `projects` parallelization across browser contexts (Tier 3, deferred — high refactor cost, only justified if 2.1 isn't enough).
- Switching visual regression to `toHaveScreenshot()` pixel-diffs (Tier 4.2, deferred to a follow-up).
- Dropping any behavioral assertion. Every claim the smoke test makes about the module today must still be made — only the dead time around those claims shrinks.
- Per-test browser-context creation changes. Phase D3 / E2 stay in `full` only, as they do today.

## Out of Scope

- Tier 1.4 (cache `dist/`) was considered but not included: the smoke test already takes a built `dist/` as input, and CI runs `npm run build` before smoke; rebuilding when source hasn't changed is uncommon enough that the cache overhead isn't worth the added workflow complexity.
- The `dist/` build itself, unit tests, semantic-release, and the docs Jekyll site are untouched.
- The felddy/foundryvtt:13 image, the docker-compose file, and the world fixture (`fabricate-smoke-ci`) are untouched.

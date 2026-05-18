# Tasks

## Foundational

- [ ] Add `phaseTimings` array and `timedPhase(name, fn)` helper to `scripts/foundry-test-run.mjs`; wrap each top-level phase block; persist into `summary.json`; print stdout timing table at end of `main()`.
- [ ] Add boot-phase stopwatch entries in `scripts/foundry-test-up.mjs` (image-check, dnd5e fetch, setup-data, compose-up, health-poll); print at end.
- [ ] At the top of `main()` in `scripts/foundry-test-run.mjs`, `rm -rf` `test-results/` before `mkdir`.
- [ ] Introduce `rc` profile in `scripts/foundry-test-run.mjs`: derive `SMOKE_PROFILE` from `FOUNDRY_SMOKE_PROFILE`, treat `ci` as alias for `rc`, default remains `full`. Add `RUN_FULL_ONLY_BEHAVIORS` and `RUN_FULL_ONLY_GATHERING_STATES` booleans derived from the profile.
- [ ] Add `RC_SCREENSHOT_BUDGET` Set; gate `screenshot(page, label)` to no-op for labels outside the budget when `SMOKE_PROFILE === 'rc'`.
- [ ] Update `.github/workflows/foundry-integration.yml:30` `FOUNDRY_SMOKE_PROFILE` from `ci` to `rc`.
- [ ] Update `docs/contributing.md` § Smoke profiles (lines 124–144) with the three-row table (`rc`, `ci`, `full`) and a note about the rc screenshot budget + timing table.

## Wait audit + notification hide

- [ ] Inject `#notifications, .notification { display: none !important; }` via `page.addStyleTag` at world-load entry (just before the first `screenshot(page, 'world-loaded')`).
- [ ] Remove `await page.waitForTimeout(300)` at `scripts/foundry-test-run.mjs:906` inside `dismissFoundryNotifications`.
- [ ] Remove the six `dismissFoundryNotifications` calls between the `gm-environments-*` screenshots (`scripts/foundry-test-run.mjs:2829–2851`).
- [ ] Replace fixed waits per the Wait Audit table in `design.md` (lines 1502, 1518, 2743, 2754, 3088, 3195, 1758, 1770, 3241, 3251, 1272, 1321, 774, 2285, 2301, 2347, 2383, 2411, 2454, 2706).

## Tier 2 gating

- [ ] Wrap Phase F cleanup block in `if (RUN_FULL_ONLY_BEHAVIORS) { ... }` else mark its steps `skipped: true`.
- [ ] Wrap the gathering feature-gate negative test (`scripts/foundry-test-run.mjs:2274–2302`) in `if (RUN_FULL_ONLY_BEHAVIORS) { ... }` else mark `gathering-feature-gate-negative` as `skipped: true`.
- [x] Gate the D2 sub-paths beyond the single success (failure feedback, timed-active, narrow-active-history, timed-complete, blocked states) on `RUN_FULL_ONLY_GATHERING_STATES`. *(Was the load-bearing miss: the flag was declared but never wired into Phase D2; the missing gating let RC over-run a hosted runner's 20-minute budget.)*

## Teardown safety

- [x] Give the run-phase `spawnSync` in `scripts/foundry-test.mjs` an internal wall-clock budget (`FOUNDRY_RUN_TIMEOUT_MS`, default 15 minutes) so the 20-minute GitHub Actions job timeout can never preempt Docker teardown + artifact upload. On overrun the orchestrator returns exit 124 from the run phase, still calls `down`, and then propagates the failure.

## CI caches

- [ ] Add `actions/cache@v4` for `.foundry-e2e/cache/` keyed on `hashFiles('docker-compose.foundry.yml')` in `.github/workflows/foundry-integration.yml` before the smoke-test step.
- [ ] Add `actions/cache@v4` for `~/.cache/ms-playwright` keyed on `hashFiles('package-lock.json')`; gate the existing `Install Playwright Chromium` step on `steps.cache-playwright.outputs.cache-hit != 'true'`.
- [ ] Add `actions/cache@v4` for `.foundry-e2e/systems/` keyed on `hashFiles('scripts/foundry-fetch-systems.mjs')`.

## Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] (User to run) `npm run test:foundry -- --profile=rc` locally on a warm cache; record the timing table from stdout and the new phase durations from `summary.json`.
- [ ] (User to run) `npm run test:foundry` (full) to confirm visual screenshot regeneration still works.
- [ ] (User to run) Manually trigger `.github/workflows/foundry-integration.yml` to confirm cache plumbing hits on the second run.

# Design: Faster FVTT Smoke Test

## Profile Model

Today `FOUNDRY_SMOKE_PROFILE` accepts `full` (default, all phases) and `ci` (skip Phases D0, D, D3, E2). The flag is overloaded: `ci` means both "fast" and "what CI runs."

This change introduces three named profiles in `scripts/foundry-test-run.mjs`:

| Profile | Phases | When |
| --- | --- | --- |
| `rc` | A → B → C → D2 (one success path) → E → console-error check | RC pipeline (`.github/workflows/foundry-integration.yml`) |
| `full` | A → B → C → D0 → D → D2 (all paths) → D3 → E → E2 → F | Local, screenshot regeneration |
| `ci` | alias for `rc` | Back-compat for one release |

Profile gates already exist as `RUN_SCREENSHOT_PHASES`. Add two more booleans driven by the profile:

- `RUN_FULL_ONLY_BEHAVIORS` — gates Phase F cleanup and the gathering feature-gate negative test (lines 2274–2302). `true` only in `full`.
- `RUN_FULL_ONLY_GATHERING_STATES` — gates the D2 paths beyond the single happy success (failure feedback, timed-active, narrow-active-history, timed-complete). `true` only in `full`.

`rc` keeps Phase D2's one success path (Verdant Meadow → Gather Meadow Herbs → assert `.gathering-feedback-panel.success`) because that's the load-bearing gathering happy-path assertion the RC needs to make. The other D2 sub-paths (failure outcome, timed gathering, narrow window, blocked states) are visual / edge-case coverage that belong in `full`.

## Phase-Timing Instrumentation

Add a stopwatch helper in `scripts/foundry-test-run.mjs`:

```js
const phaseTimings = [];
async function timedPhase(name, fn) {
  const startedAt = new Date().toISOString();
  const t0 = performance.now();
  try {
    return await fn();
  } finally {
    phaseTimings.push({ phase: name, startedAt, durationMs: Math.round(performance.now() - t0) });
  }
}
```

Wrap each top-level phase block (`Step 1` through `Phase F`) with `timedPhase('phase-X', async () => { ... })`. Add `phaseTimings` to `summary.json`.

Print a final stdout table:

```
Phase timings
─────────────────────────────────────────
  navigate-and-launch   13.2s
  module-ready           2.8s
  phase-B               18.4s
  phase-C               41.7s
  phase-D2-success       9.6s
  phase-E               12.1s
  TOTAL                 97.8s
```

Mirror the same pattern in `scripts/foundry-test-up.mjs` for boot-phase timings (image-check, dnd5e fetch, setup-data, compose-up, health-poll). The script already prints status — extend to also write a `boot-timings.json` next to `summary.json`, or append to `summary.json` when both files are present.

## Artifact Cleanup

At the top of `main()` in `foundry-test-run.mjs`, before the `mkdir(RESULTS_DIR, { recursive: true })` call, recursively remove any existing files in `test-results/` (then re-create the directory). Use `node:fs/promises`'s `rm(RESULTS_DIR, { recursive: true, force: true })`.

This is safe: every consumer of `test-results/` (CI artifact upload, local triage) wants only current-run output. The directory's contents are pure output, never authored.

## Screenshot Budget

Wrap `screenshot(page, label)` so it becomes a no-op in `rc` for any label not in the budget set:

```js
const RC_SCREENSHOT_BUDGET = new Set([
  'world-loaded',
  'crafting-app-opened',
  'post-craft',
  'alara-post-craft-inventory',
  'gathering-targeted-ready',
  'gathering-immediate-success'
  // 'screenshot-failure' is taken by the failure handler directly, not via screenshot()
]);

async function screenshot(page, label) {
  if (SMOKE_PROFILE === 'rc' && !RC_SCREENSHOT_BUDGET.has(label)) return;
  screenshotCounter++;
  // ... existing capture logic
}
```

Behavioral assertions around screenshots (the `assertNoScreenshotOverlays` and DOM/document-state checks that already precede every screenshot) stay regardless of profile — only the PNG capture is gated.

`full` is unchanged.

## Notification Hiding

In the world-loaded entry path (just before the first `screenshot(page, 'world-loaded')`), inject a `<style>` block once:

```js
await page.addStyleTag({
  content: `
    #notifications, body > .notification, .notification { display: none !important; }
  `
});
```

Then in `dismissFoundryNotifications`:

- Keep the DOM-removal loop (defensive, harmless once the CSS hides them).
- Remove `await page.waitForTimeout(300)` at line 906.

In Phase D2 (`scripts/foundry-test-run.mjs` lines 2829–2851), remove the six per-screenshot `dismissFoundryNotifications` calls between the `gm-environments-*` screenshots — those calls only existed because notifications could overlay screenshots, which the CSS rule now prevents. If a notification leaks through despite the CSS (e.g. injected by a future Foundry update), `assertNoScreenshotOverlays` still catches it.

## Wait Audit (Top-20)

These are the longest hard-coded `waitForTimeout` calls in `scripts/foundry-test-run.mjs`, ranked by duration × profile-frequency. Replace each with a deterministic wait:

| Line | Today | Replace with |
| --- | --- | --- |
| 1502 | `waitForTimeout(2_000)` after `worlds` tab click | `page.waitForSelector('[data-package-id="fabricate-smoke-ci"]', { state: 'visible' })` |
| 1518 | `waitForTimeout(10_000)` on `ERR_CONNECTION_REFUSED` retry | Keep — guards a real container-restart race; lower to `2_000` and add a `waitForResponse` for `/api/status` |
| 2743 | `waitForTimeout(2_000)` before Recipe Manager screenshot | `waitForSelector('.fabricate-recipe-manager .recipe-manager-body', { state: 'visible' })` (full only) |
| 2754 | `waitForTimeout(2_000)` per Recipe Manager tab | `waitForSelector` on the tab's pane (full only) |
| 3088 | `waitForTimeout(2_000)` after `game.time.advance(120)` | `waitForFunction(() => !game.actors.get(id)?.getFlag('fabricate', 'gatheringRuns')?.active?.some(r => r.status === 'waitingTime'))` |
| 3195 | `waitForTimeout(2_000)` before Crafting App screenshot | `waitForSelector('.fabricate-crafting-app, .fabricate-actor-crafting', { state: 'visible' })` |
| 1758 | `waitForTimeout(1_000)` after items-sidebar click | `waitForSelector('button[data-fabricate-action="craft"]', { state: 'visible' })` |
| 1770 | `waitForTimeout(1_500)` per actor-sheet open | Behavior moves to `full` only via the screenshot budget (1770's screenshot is `actor-sheet-*`, not in the RC budget); when `full`, replace with `waitForSelector('.actor.sheet, .actor-sheet-v2', { state: 'visible' })` |
| 3241 | `waitForTimeout(1_000)` before `post-craft` screenshot | `waitForFunction(() => game.actors.get(alaraId).items.contents.some(i => i.name === 'Healing Potion'))` |
| 3251 | `waitForTimeout(1_500)` for craft-result render | `waitForFunction` on the same inventory predicate |
| 1272 | `waitForTimeout(1_000)` in dialog handling | `waitForSelector` on the dialog close transition |
| 1321 | `waitForTimeout(1_000)` in dialog handling | Same as 1272 |
| 774 | `waitForTimeout(750)` after join-form click | `waitForURL(/\/(join|game)/)` with timeout |
| 2347, 2383, 2411, 2454, 2706 | `waitForTimeout(750)` per manager-v2 nav click (5 sites) | `waitForSelector('.fabricate-manager-v2 .manager-v2-content [data-pane="<expected>"]', { state: 'visible' })` (full only, but worth fixing for `full` profile time) |
| 2285, 2301 | `waitForTimeout(750)` after sidebar tab click | `waitForSelector` on the items-sidebar content |
| 906 | `waitForTimeout(300)` in `dismissFoundryNotifications` | Removed — replaced by CSS hide |

The remaining ~50 small (250 ms / 500 ms) waits are deliberately deferred to a follow-up change; the top-20 deliver the majority of the savings and keep this change reviewable.

## CI Caches

In `.github/workflows/foundry-integration.yml`, add three cache steps before the corresponding install/build/fetch step:

```yaml
- name: Cache Foundry binary
  if: env.SKIP_SMOKE != 'true'
  uses: actions/cache@v4
  with:
    path: .foundry-e2e/cache
    key: foundry-binary-v13-${{ hashFiles('docker-compose.foundry.yml') }}

- name: Cache Playwright Chromium
  if: env.SKIP_SMOKE != 'true'
  id: cache-playwright
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ hashFiles('package-lock.json') }}

- name: Install Playwright Chromium
  if: env.SKIP_SMOKE != 'true' && steps.cache-playwright.outputs.cache-hit != 'true'
  run: npm run test:foundry:install

- name: Cache dnd5e system
  if: env.SKIP_SMOKE != 'true'
  uses: actions/cache@v4
  with:
    path: .foundry-e2e/systems
    key: dnd5e-${{ hashFiles('scripts/foundry-fetch-systems.mjs') }}
```

The Foundry-binary cache key intentionally hashes `docker-compose.foundry.yml` (which pins the felddy image tag) so a Foundry version bump invalidates the cache automatically. Same for dnd5e — bumping the fetch script's pinned version invalidates the cache.

## Gating Full-Only Behaviors

In `scripts/foundry-test-run.mjs`:

- Wrap Phase F (cleanup, around line 3353) in `if (RUN_FULL_ONLY_BEHAVIORS) { ... } else { skip + record 'cleanup' as skipped }`.
- Wrap the gathering feature-gate negative test (lines 2274–2302) in the same `if (RUN_FULL_ONLY_BEHAVIORS)` guard.

Skipped steps still push a `{ step, passed: true, skipped: true }` entry to `summary.json` so the CI report shows them as intentionally skipped, not missing.

## Docs Update

`docs/contributing.md` § Smoke profiles (lines 124–144) updates the table to three rows:

| Profile | When | Phases | Total |
| --- | --- | --- | --- |
| `rc` (default for CI) | Release-candidate CI | A → B → C → D2 (one success) → E | ~3–5 min |
| `ci` | Alias for `rc` (deprecated, removed after one release) | same as `rc` | same |
| `full` | Local, screenshot regen | A → B → C → D0 → D → D2 (all) → D3 → E → E2 → F | ~10–15 min |

The narrative paragraphs below the table note the rc screenshot budget and the per-run timing table.

## Rollback

Each subtask is isolated:

- F1 (timing): purely additive; revert by removing the helper + the timing entries from `summary.json`.
- F2 (cleanup): one-line revert.
- F3+F4 (profile + budget): revert the `rc` profile handling and the `screenshot()` budget gate; default behavior returns to today's `full`.
- 1.x (caches): remove the cache steps from the workflow.
- 1.5 (CSS hide): remove the `addStyleTag` call; restore the `waitForTimeout(300)` in `dismissFoundryNotifications` and the six Phase D2 dismiss calls.
- 1.6 (wait audit): each replacement is independent; any single one can be reverted without affecting the others.
- 2.2 / 2.4 (gating): unwrap the `if (RUN_FULL_ONLY_BEHAVIORS)` guards.

No data-model, no public API, no migration. Pure test-infrastructure change.

## Risks

- **CSS hide masking a real notification regression.** Mitigation: `assertNoScreenshotOverlays` still inspects the DOM for unexpected overlays; if a notification leaks through the CSS, we catch it. Future console-error capture also catches errors regardless of UI visibility.
- **Wait-replacement flakiness.** Each replaced wait now depends on a real DOM signal. If Foundry's UI doesn't reach the expected state, we'll hit the wait timeout (defaults to 30 s in Playwright) and fail loudly rather than silently passing on a fixed sleep. This is the right failure mode — but means we may discover latent flakiness in the test. Mitigation: every replacement uses a generous timeout (15–30 s), and `withDeadline()` already exists for the cases that need explicit guards.
- **`rc` aliasing.** Existing scripts / CI configs that explicitly check for `FOUNDRY_SMOKE_PROFILE === 'ci'` need updating. There's only one such reference (the CI workflow itself), so the blast radius is contained.
- **Cache key collisions.** The Foundry-binary cache key uses the compose file hash, which would invalidate on any compose change. Mitigation: this is conservative — false invalidations cost one download (~30–90 s) but never serve a stale binary.

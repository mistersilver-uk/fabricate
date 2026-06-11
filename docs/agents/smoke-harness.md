# Foundry Smoke Harness

The smoke harness boots a real Foundry VTT instance in Docker and walks the Crafting System Manager UI and the unified Fabricate shell end-to-end with Playwright. It catches regressions that the JS-level unit suite can't — actual layout, DOM events, real Foundry APIs.

## Entrypoints

- `npm run test:foundry` — full pipeline: `up` → `run` → `down`. ~7–8 minutes including docker boot.
- `npm run test:foundry:up` — start Foundry container, leave it running. Useful when iterating on the harness itself.
- `npm run test:foundry:run` — Playwright steps against an already-running Foundry.
- `npm run test:foundry:down` — stop the cached container, preserve the image.
- `npm run test:foundry:ci` — faster CI profile (subset of phases) used in PR CI.
- `npm run test:foundry:rc` — release-candidate profile.

Scripts live in `scripts/foundry-test-*.mjs`. The main harness is `scripts/foundry-test-run.mjs` (~2700 lines).

## Phases

The run walks several phases in order. If an earlier phase fails, later phases are skipped:

- **boot-and-join** — health-poll the container, log in as Gamemaster.
- **Phase B** — create test actors and items, screenshot sheets.
- **Phase C** — create a crafting system + sample recipes.
- **Phase D0** — open the Crafting System Manager, exercise its surfaces, screenshot (the `screenshot-manager` step). **This is where most drift shows up** when manager markup changes. After the default-selection capture it also re-themes the real manager via the `data-fabricate-theme` attribute (exactly as the theme setting's `applyFabricateTheme` onChange does) and captures `manager-theme-<themeId>` for every Fabricate theme, then restores the default. These are real, Foundry-rendered themed captures — theme fidelity is not validated via hand-authored mocks.
- **Phase E** — API-driven crafting flow, then open the unified Fabricate shell (`#fabricate-app`) from the Craft Item and Gathering sidebar buttons and assert the four-tab left nav (`fabricate-app-shell` screenshot). The shared actor-selection top bar mounts with the shell; the phase waits for it to flip `[data-actor-bar-state]` from `loading` to `ready` (its selectable-actor list and gathering conditions loaded) before capturing, so frames show the populated bar rather than its loading placeholder.
- **Phase F** — cleanup.

The player-facing Crafting and Gathering app phases (former D2/D3/E2) and the standalone Recipe Editor were removed when those surfaces were retired; both sidebar buttons now open the single empty-shell window.

Phase-by-phase timing and pass/fail land in `test-results/summary.json` after each run.

## Artifacts

After any run (success or failure):

- `test-results/summary.json` — structured `{ passed, steps[], errors[], consoleErrors[], phaseTimings[] }`. Truth.
- `test-results/console.log` — browser console transcript for the whole run.
- `test-results/screenshot-*.png` — per-step screenshots; `screenshot-failure.png` captures the last DOM state if a step throws.

When debugging a smoke failure, read `summary.json` first: the failing step's `error` field plus the surrounding successful steps usually point straight at the broken selector.

## Interpreting `passed: false`

`summary.json.passed` is false if **either** a phase step fails **or** `consoleErrors[]` is non-empty. These are very different signals:

- A failed **step** (an entry in `steps[]` with an `error`) is a real regression — a broken selector, a thrown assertion, a surface that didn't render.
- A non-empty **`consoleErrors[]`** can be benign. The fixture world routinely emits browser `404 (Not Found)` loads for missing tiles, portraits, or sounds, and any such console error flips `passed` to false even when every step passed.

So before treating a run as broken — or discarding its captured screenshots — confirm whether `steps[]` contains an actual failing step. A `passed: false` driven purely by `404` console noise with zero failed steps means the walk succeeded and the `screenshot-*.png` artifacts are valid evidence. (Example seen in practice: all phases B–F passed and `fabricate-app-shell` captured correctly, but `passed: false` came solely from 12 generic `404` console errors.)

## Known drift pattern: Phase D0 selectors

`exerciseManagerEnvironmentPointerTargets` (~line 905 in `foundry-test-run.mjs`) and the env-edit checks (~line 2490) pin many selectors by class, child index (`.nth(N)`), and visible button text. When the manager UI evolves, these go stale silently — the harness only fails when the next smoke run hits the broken locator.

Hit list seen historically:

- `.manager-environment-row .manager-icon-button .nth(3)` / `.nth(4)` — expected move-up / move-down buttons that were dropped when reordering moved to drag-and-drop.
- `.manager-environment-edit-view.is-placeholder` and `.manager-environment-placeholder-card` — gone since the real composition editor replaced the placeholder.
- "Return to environments" button text — renamed to "Back to environments" and rewired through `confirmRouteExit`.
- `.manager-environment-details-band` — CSS rule survived in `styles/fabricate.css`, but the Svelte usage was removed; the harness kept waiting on it.
- `.manager-travel-party-row` / `.manager-travel-member-row` — the **singular** classes from the retired `GatheringTravelView`. The live Travel tab renders `GatheringPartiesTab` (`.manager-travel-parties-row`, **plural**) and `PartyExpandedBody` (`.manager-party-member-row`); the harness `waitFor` timed out until the selectors were repointed. A whole component can be replaced and its old classes only survive in the harness.

**Workflow rule:** Whenever editing manager UI markup (env browser row, env-edit view, CompositionList, header actions, Travel tabs, etc.), grep `scripts/foundry-test-run.mjs` for the changed classes / text BEFORE declaring the change done. Prefer running `npm run test:foundry` locally at least once on UI-touching PRs. If the harness asserts on something the new markup no longer has, update the harness in the same PR.

**CI blind spot:** PR CI runs a reduced profile (`test:foundry:ci`) that skips full-only steps (e.g. the Travel screenshot). A selector that only the **full** profile exercises rots invisibly until someone runs `npm run test:foundry` locally. Don't assume green PR CI means the full smoke walk passes.

## Running it locally (gotchas)

- Needs Docker Desktop running and `.env.foundry` with `FOUNDRY_USERNAME` / `FOUNDRY_PASSWORD` (the `up` script loads it; CI sets the vars directly). The container is cached between runs, so re-runs boot in ~5s.
- The `run` phase **wipes `test-results/`** at startup. Do **not** redirect run logs into `test-results/` (e.g. `... | Tee-Object test-results/x.log`) — on Windows the open log file can't be unlinked and the run dies with `EBUSY`. Background-task stdout is captured elsewhere; tee to a path outside `test-results/` if you need a copy.

# Tasks

## Planning And Intake

- [x] Read issue `#179` with GitHub CLI.
- [x] Collect UX screenshot-state checklist.
- [x] Collect QA smoke coverage matrix.
- [x] Collect domain acceptance criteria.
- [x] Create this OpenSpec closeout change.

## Domain Acceptance Criteria

- [x] Gathering opens from Items Directory only when a system enables `features.gathering`, and it remains a dedicated app.
- [x] Targeted screenshots show real task labels and keep blocked rows visible but disabled.
- [x] Non-GM blind screenshots show one generic `Gather` action and do not leak task names, images, task ids, catalysts, check diagnostics, result details, or resolution metadata.
- [x] Scene/token gate screenshots show a scene-linked environment remains listed with a localized blocked reason and disabled start button.
- [x] Timed active-run screenshots show `Active Gathering`, waiting status, environment name, and available-at timing.
- [x] History screenshots show targeted result/catalyst counts while blind or missing-environment rows remain generic.
- [x] Catalyst blocker screenshots prove the selected gathering actor is checked and blocked attempts do not degrade catalysts.
- [x] Failure feedback screenshots prove no result creation and no duplicate generic warning.
- [x] Timed completion screenshots prove active run removal and history prepend after world-time advancement.
- [x] No Harvesting app, runtime, setting, run manager, store, or player surface is introduced.

## Foundry Smoke Coverage

- [x] Add deterministic gathering fixture data for targeted, scene-blocked, catalyst-blocked, timed, and blind player states.
- [x] Assert Items Directory exposes the feature-gated `Gathering` action.
- [x] Assert the `Gathering` action opens the dedicated player app.
- [x] Capture player targeted ready screenshot.
- [x] Capture player scene/token blocked screenshot.
- [x] Capture player catalyst blocked screenshot.
- [x] Capture immediate success feedback/history screenshot.
- [x] Capture timed active-run screenshot.
- [x] Capture timed completion/history screenshot.
- [x] Capture blind redaction screenshot as a non-GM user.
- [x] Capture narrow player gathering layout screenshot.
- [x] Preserve existing GM Environments validation/authoring/results screenshots.
Deferred backlog candidate: add separate GM Environments empty/create screenshots if a future issue needs first-use tutorial evidence; not required for the signed-off closeout because the current suite covers GM list, validation, authoring, result/catalyst rows, narrow layout, and player runtime behavior.

## Screenshot Artifacts

- [x] Run `npm run test:foundry`.
- [x] Record generated gathering screenshot paths here.
- [x] Record any runtime/harness blockers here.

Passing run on 2026-04-29:

- `test-results/screenshot-13-recipe-manager-environments.png`
- `test-results/screenshot-14-gm-environments-normal-validation.png`
- `test-results/screenshot-15-gm-environments-normal-authoring.png`
- `test-results/screenshot-16-gm-environments-normal-results.png`
- `test-results/screenshot-17-gm-environments-narrow-authoring.png`
- `test-results/screenshot-18-gm-environments-narrow-results.png`
- `test-results/screenshot-22-items-sidebar-gathering-enabled.png`
- `test-results/screenshot-23-gathering-targeted-ready.png`
- `test-results/screenshot-24-gathering-scene-blocked.png`
- `test-results/screenshot-25-gathering-catalyst-blocked.png`
- `test-results/screenshot-26-gathering-immediate-success.png`
- `test-results/screenshot-27-gathering-failure-feedback.png`
- `test-results/screenshot-28-gathering-timed-active.png`
- `test-results/screenshot-29-gathering-narrow-active-history.png`
- `test-results/screenshot-30-gathering-timed-complete.png`
- `test-results/screenshot-32-gathering-blind-redacted.png`
- `test-results/screenshot-33-gathering-player-narrow.png`
- `test-results/screenshot-38-gathering-no-selectable-actors.png`

Resolved blockers:

- Progressive gathering fixtures require managed component `difficulty >= 1`; smoke setup now assigns deterministic component difficulty.
- Foundry ApplicationV2 cleanup must not close the core sidebar; cleanup now targets non-sidebar app windows.
- GM Gathering app opening needed a DOM/API fallback because Foundry window layers can swallow a Playwright click.
- Fixture image paths were changed to known core icon paths to avoid false 404 noise.
- Narrow Gathering screenshots keep the browser viewport at Foundry's minimum while shrinking only the app window.
- Gathering app list keys now include index-scoped fallbacks so duplicate runtime reason/run ids do not produce Svelte duplicate-key errors.
- Recipe Manager screenshots now dismiss/assert against notification overlays before capture.
- GM Environments list rows now reserve stable row height and show primary environment names above secondary metadata.
- Timed gathering completion now explicitly deletes active run keys before replacing Foundry flags so Foundry-style merge updates do not leave stale active runs.

## Feedback Sign-Off Ledger

- [x] `QA-01: Remove hidden smoke false positives`
  Source: fabricate_quality_engineer
  Decision: accepted
  Write set: `scripts/foundry-test-run.mjs`, gathering runtime/helper code if needed
  Acceptance: fresh `npm run test:foundry` has no `each_key_duplicate`, no actor permission error, no Fabricate-origin compatibility warnings, and no ignored Svelte page errors.
  UX sign-off: not required
  QA sign-off: signed off
  Domain sign-off: signed off

- [x] `QA-02: Make gathering screenshots prove their labels`
  Source: fabricate_quality_engineer
  Decision: accepted
  Write set: `scripts/foundry-test-run.mjs`
  Acceptance: every gathering screenshot recorded below visibly matches its label and has no unrelated modal, dialog, notification, or player-configuration overlay.
  UX sign-off: signed off
  QA sign-off: signed off
  Domain sign-off: signed off

- [x] `QA-03: Add runtime outcome assertions`
  Source: fabricate_quality_engineer
  Decision: accepted
  Write set: `scripts/foundry-test-run.mjs`
  Acceptance: smoke fails if blocked task buttons are enabled, failure creates results, blocked catalysts degrade, timed runs remain active after completion, or completed timed history is not first.
  UX sign-off: not required
  QA sign-off: signed off
  Domain sign-off: signed off

- [x] `QA-04: Require the real Items Directory launch path`
  Source: fabricate_quality_engineer
  Decision: accepted
  Write set: `scripts/foundry-test-run.mjs`
  Acceptance: breaking the Items Directory button click fails the smoke; no app API fallback is used to pass the launch assertion.
  UX sign-off: not required
  QA sign-off: signed off
  Domain sign-off: signed off

- [x] `QA-05: Cover gathering feature-gating negative path`
  Source: fabricate_quality_engineer
  Decision: accepted
  Write set: `scripts/foundry-test-run.mjs`
  Acceptance: smoke asserts the `Gathering` action is absent before any system has `features.gathering === true`.
  UX sign-off: not required
  QA sign-off: signed off
  Domain sign-off: signed off

- [x] `QA-06: Strengthen blind redaction assertions`
  Source: fabricate_quality_engineer
  Decision: accepted
  Write set: `scripts/foundry-test-run.mjs`
  Acceptance: non-GM blind screenshot/assertions fail on task name, task description, task image, result group names, component result names, catalyst details, check/resolution metadata, task ids, or diagnostics.
  UX sign-off: signed off
  QA sign-off: signed off
  Domain sign-off: signed off

- [x] `UX-01: Fix Environments editor footer overlap`
  Source: fabricate_ux_designer
  Decision: accepted
  Write set: `styles/fabricate.css`, possibly `src/ui/svelte/apps/EnvironmentsTab.svelte`
  Acceptance: normal and narrow GM Environments screenshots show no field, validation message, result row, or catalyst control hidden behind the footer; focused validation targets scroll fully above the footer; save actions remain reachable.
  UX sign-off: signed off
  QA sign-off: signed off
  Domain sign-off: not required

- [x] `UX-02: Add resilient environment row labels and metadata`
  Source: fabricate_ux_designer
  Decision: accepted
  Write set: `src/ui/svelte/apps/environments/EnvironmentList.svelte`, `styles/fabricate.css`, component tests
  Acceptance: every environment row has a visible primary label including unnamed drafts; long names truncate or wrap cleanly; task count alone is never the only visible row text.
  UX sign-off: signed off
  QA sign-off: signed off
  Domain sign-off: signed off

- [x] `UX-03: Improve Gathering app contrast and blocked readability`
  Source: fabricate_ux_designer
  Decision: accepted
  Write set: `styles/fabricate.css`
  Acceptance: player Gathering card text and blocked reasons are readable over bright and dark canvas backgrounds; blocked and ready rows remain distinct without reducing all content opacity.
  UX sign-off: signed off
  QA sign-off: signed off
  Domain sign-off: signed off

- [x] `UX-04: Clarify disabled Gathering task actions`
  Source: fabricate_ux_designer
  Decision: accepted
  Write set: `src/ui/svelte/apps/GatheringAppRoot.svelte`, `styles/fabricate.css`, `lang/en.json`, tests
  Acceptance: blocked rows cannot be mistaken for clickable actions; blocked action text does not repeat/wrap the task name; row title remains the task-name source.
  UX sign-off: signed off
  QA sign-off: signed off
  Domain sign-off: signed off

- [x] `UX-05: Make no-selectable-actors state actionable and player-safe`
  Source: fabricate_ux_designer
  Decision: accepted
  Write set: `src/ui/svelte/apps/GatheringAppRoot.svelte`, `src/ui/svelte/stores/gatheringStore.js`, `lang/en.json`, tests
  Acceptance: no-selectable-actors state explains ownership/permission next step; no raw actor UUID/id appears in normal player-facing feedback or notifications.
  UX sign-off: signed off
  QA sign-off: signed off
  Domain sign-off: signed off

## Implementation Tasks From Feedback

- [x] Implement accepted feedback tasks after UX, QA, and domain sign-off.
- [x] For each product fix, run focused tests and get UX/QA/domain review before moving to the next fix.
- [x] Address defects discovered by validation.

## Verification

- [x] `node --check scripts/foundry-test-run.mjs`
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:foundry`

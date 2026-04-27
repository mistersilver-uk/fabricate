# Design

## Lifecycle Boundary

The persistence contract remains the source of truth:

- `craftingRuns.active` contains only non-terminal `inProgress` and `waitingTime` runs.
- `craftingRuns.history` contains only terminal `succeeded`, `failed`, and `cancelled` runs.

Implementation should harden both writer and reader paths:

- Writer path: successful completion of the last recipe step must set the run to `succeeded`, set `currentStepIndex` to `null`, set `finishedAt`, remove the run from `active`, and prepend it to `history`.
- Reader path: actor app preparation must not leave terminal statuses in the active list even if persisted data is stale or malformed.
- Repair/presentation path: a terminal or internally completed entry discovered in an active source must be canonicalized into history when persistence can be safely repaired. If repair is not available in the current call path, the actor app must display that entry as terminal history for that refresh rather than dropping it.
- If a run in `active` has all executable steps succeeded but still has status `inProgress`, the UI must not treat it as cancellable/restartable/continuable. Prefer repairing or deriving terminal presentation in the run manager/store rather than only hiding buttons in `RunSummary`.

The last bullet is intentionally a guardrail for the reported symptom: a one-step run can have produced all outputs and show `1/1` complete, yet still be classified as `inProgress` by the app. That state is internally inconsistent and should be corrected before action presentation.

## Action Seams

UI rendering is not the only enforcement point. Any path that resolves or acts on active crafting runs must reject terminal and internally completed records before performing side effects.

The implementation should harden these seams:

- `CraftingRunManager.getActiveRun()`
- `CraftingRunManager.findActiveRunForRecipe()`
- `CraftingRunManager.cancelRun()`
- store `cancelRun()`
- store `restartRun()`
- crafting engine resume by `craft(..., { runId })`
- any still-reachable legacy `CraftingApp` action path

Expected behavior for a stale active run whose executable steps are all succeeded:

- active lookup either repairs the run into history and returns no active run, or returns a value that action seams refuse as non-active
- cancel/restart/resume calls do not write a new terminal cancellation, do not start a fresh craft as part of restart, and do not duplicate produced results
- the next actor app refresh shows the run in history, either from persisted repair or normalized history display

Known current implementation risks that must be closed by this change:

- `CraftingRunManager` active lookups currently read directly from `container.active`.
- `CraftingEngine.craft(..., { runId })` currently trusts an active lookup before resuming.
- Svelte store cancel/restart actions currently resolve active runs before mutating them.
- Svelte run display currently derives several actions from status or row placement.
- `RecipeCard.svelte` currently treats `activeRunId` as enough to expose active-run affordances.
- Svelte run details currently have a placeholder in the Crafting tab and a null handler in the Alchemy tab.

These are not optional cleanup items; they are the implementation surfaces required to satisfy the delta.

## Svelte Store and Display Model

`craftingStore.js` should provide a normalized run display model with an explicit terminal/action contract:

- `isTerminal`
- `isActive`
- `canContinue`
- `canCancel`
- `canRestart`
- `scope`

`RunSummary.svelte` should render actions from those booleans rather than inferring terminal behavior from list placement alone.

Recipe cards and any other actor crafting app surface must consume the same normalized action state. A terminal or internally completed run must never become a recipe card `activeRunId`, continue target, or restart target.

Expected behavior:

- Active non-terminal `inProgress` crafting run: may show continue when ready, run details, restart, and cancel as allowed.
- Active `waitingTime` crafting run: may show details and cancel; continue only when ready; restart is hidden while the run is waiting on elapsed world time.
- Terminal crafting run: shows in recent history with details only.
- Terminal crafting run that appears in an active source due to stale/malformed data: must not render in the In Progress column, must not set recipe-card active-run affordances, and must be moved to or displayed as history after refresh/normalization.
- Salvage rows continue to use salvage-specific actions and must not gain crafting restart behavior.

## Run Details

Add a real Svelte-compatible run-details path rather than keeping the placeholder in `CraftingTab.svelte`.

Acceptable implementation shapes:

- Add a store action such as `showRunDetails(runId, scope)` that resolves active/history runs, formats details, and calls the Foundry dialog bridge.
- Or add a Svelte component/dialog helper fed by store-provided run details data.

A pure formatter with injected lookup/dialog dependencies is preferred because it gives tests a stable seam for recipe name, step state, check data, consumed ingredients, catalysts, created results, and alchemy redaction before Foundry dialog rendering.

The details view must work for both `scope: "active"` and `scope: "history"` and must use localized labels, escaped/resolved names, and formatted Foundry world-time values instead of raw timestamp dumps where formatting helpers are available. It must include, when present and visible to the viewer:

- recipe name
- run status
- current step label for non-terminal runs
- started and finished world-time values
- per-step status
- time-gate readiness/remaining time
- check reason/outcome/value
- failure reason
- consumed ingredients
- used catalysts
- created results

The details action must be wired from both crafting and alchemy tab `RunSummary` instances when those tabs show crafting/alchemy run records. Alchemy details must preserve the canonical secrecy contract: no-signature attempts or attempts whose recipe remains hidden to the viewer use a generic "Alchemy attempt" label and must not reveal hidden recipe names, ingredients, results, or routing details to non-GM users. A visible details button must not be rendered with a null handler unless it is disabled with a localized title/aria-label explaining why details are unavailable.

At narrow Foundry app widths, the run summary must remain usable: active/history columns should stack, row text must not overlap action buttons, and details/cancel/continue controls must remain reachable by pointer and keyboard.

## Localization

New user-facing labels, warnings, and dialog strings belong in `lang/`. Existing localized `FABRICATE.RunSummary.*` keys should be reused where they match.

## Testing Strategy

Focused automated coverage should include:

- `CraftingRunManager.completeStepSuccess()` on a one-step recipe moves the run to history and clears active runs.
- Store/view preparation repairs terminal runs encountered in active sources or produces a normalized history entry when persistence repair is unavailable.
- A terminal-status run present only under `active` with empty persisted history produces zero active rows and one terminal history/details row after repair/normalization.
- A terminal or internally completed active-source run is surfaced in history after repair/normalization rather than disappearing from both columns.
- `getActiveRun`, `findActiveRunForRecipe`, `cancelRun`, store `cancelRun`, store `restartRun`, and engine resume by `craft(..., { runId })` reject internally completed active-source records.
- A run with all executable steps succeeded but run status still `inProgress` is not presented with cancel/restart/continue actions and does not populate recipe-card `activeRunId`.
- A `waitingTime` run does not render restart in `RunSummary` or other actor crafting app surfaces.
- `RunSummary.svelte` renders history rows with details only.
- `RunSummary.svelte` does not render active controls for terminal display models.
- `RunSummary.svelte` is rendered or compiled with a null/missing details handler and proves the details button is disabled/absent with accessible state instead of enabled and inert.
- Crafting and Alchemy tab component wiring is rendered or compiled deeply enough to prove visible details buttons call a real handler.
- Recipe card coverage proves continue/restart actions are driven by normalized non-terminal run state rather than the mere presence of an `activeRunId`.
- Narrow-width component or screenshot coverage proves run-summary columns stack and action buttons remain reachable without text overlap.
- `waitingTime` rows do not render restart while they are waiting on elapsed world time.
- Crafting and alchemy tab details buttons call a real details handler.
- Alchemy run details do not leak hidden recipe metadata to non-GM users and handle no-signature attempts generically.
- Run details rendering includes created result names/quantities when available.
- Terminal transition coverage preserves newest-first history ordering and the 50-entry history cap.
- New localization keys used by run-details or disabled-button UI are covered by localization tests or existing locale-key validation.

Run `npm test` and `npm run build` for implementation. Use `npm run test:foundry` only if manual/runtime Foundry dialog behavior cannot be validated through the existing Svelte/unit harness.

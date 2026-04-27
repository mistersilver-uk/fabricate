# Fix Terminal Crafting Run Summary

## Summary

Ensure completed crafting runs are treated as terminal history in the Actor Crafting App and cannot be cancelled, continued, or restarted as active runs. Replace the Svelte run-details placeholder/no-op behavior with a real run details path for active and historical crafting runs.

## Investigation

No matching GitHub issue was found from the available issue search, so this change is not issue-numbered.

Relevant current behavior:

- `CraftingRunManager.completeStepSuccess()` already intends to move a one-step successful run from `craftingRuns.active` to `craftingRuns.history` through `completeRun()`.
- `openspec/specs/data-models/spec.md` already states that active crafting runs contain only `inProgress` or `waitingTime`, while terminal runs belong in history.
- The Svelte actor app renders `RunSummary.svelte` from store-provided `activeRuns` and `runHistory` lists. Anything in the active list gets active-run actions, including restart and cancel where allowed.
- `src/ui/svelte/apps/CraftingTab.svelte` currently handles run details with a placeholder dialog that only echoes `Run {id} ({scope})`.
- `src/ui/svelte/apps/AlchemyTab.svelte` passes `onShowRunDetails={null}`, so the visible run-details button has no handler in that tab.
- The legacy `CraftingApp._onShowRunDetails()` path has a fuller details implementation, but the Svelte app does not reuse an equivalent store/service action.

## Motivation

Players can see a completed one-step craft as still in progress after all results are produced. That makes the run look cancellable/restartable even though the irreversible craft has already happened. The UI also advertises run details but does not provide meaningful details from the active/history run data.

This breaks trust in the actor crafting app because the run state, available actions, and persisted lifecycle disagree.

## Goals

- Treat terminal crafting runs as history in all actor crafting app views.
- Never expose continue, cancel, or restart actions for terminal crafting runs.
- Guard against malformed or propagation-delayed run containers where terminal entries still appear under `active`.
- Provide a functional run-details action in the Svelte actor app for both active and historical crafting runs.
- Keep alchemy run details behavior consistent with normal crafting run details when alchemy runs are shown through `RunSummary`.
- Block stale callbacks or direct action calls from resuming, cancelling, or restarting internally completed runs.
- Add regression coverage for one-step successful runs, terminal active-list sanitization, action seams, action visibility, and run-details dispatch/rendering.

## Non-Goals

- Changing crafting resolution, ingredient consumption, result creation, or macro execution semantics.
- Changing salvage or gathering run behavior except where shared run-summary components must avoid regressions.
- Reintroducing Handlebars templates or moving Svelte UI back to the legacy `CraftingApp` template path.
- Adding npm dependencies.

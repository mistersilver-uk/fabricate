# UI Integration Delta

## MODIFIED Requirements

### Requirement: Actor crafting app run summary terminal actions

The Actor Crafting App run summary MUST present run lifecycle state consistently with crafting-run persistence.

1. The In Progress column MUST show only non-terminal crafting runs that can still progress or wait.
2. The Recent History column MUST show terminal crafting runs, including successful one-step runs.
3. Terminal crafting runs MUST NOT show continue, cancel, or restart actions.
4. Terminal crafting runs MAY show a run-details action.
5. If active-source data contains a terminal or internally completed run due to stale or malformed actor flags, the UI MUST NOT render that entry in the In Progress column.
6. If active-source data contains a terminal or internally completed run due to stale or malformed actor flags, the UI MUST surface that entry as terminal history after repair/normalization rather than dropping it from both columns.
7. Continue action visibility MUST be controlled by an explicit run display flag and MUST be false for terminal runs.
8. Continue action visibility MUST be false for internally completed runs even when their stale run-level status is `inProgress`.
9. Restart action visibility MUST be controlled by an explicit run display flag and MUST be false for terminal runs.
10. Restart action visibility MUST be false while a run is in `waitingTime`.
11. Cancel action visibility MUST be controlled by an explicit run display flag and MUST be false for terminal runs.
12. Recipe cards MUST NOT expose continue or restart affordances from a terminal or internally completed active-source record.
13. Stale UI callbacks for continue, cancel, or restart MUST re-check the current run action flags before mutating run state or starting/resuming a craft.
14. At narrow Foundry app widths, run-summary active/history columns MUST stack or otherwise avoid text/action overlap while preserving pointer and keyboard access to available actions.
15. Automated UI coverage MUST include a terminal-status run supplied from active-source data with empty history and assert zero In Progress rows plus one Recent History details row after repair/normalization.
16. Automated UI coverage MUST include an `inProgress` run whose executable steps are all `succeeded` and assert that RunSummary and RecipeCard expose no continue, cancel, or restart affordance for that run.
17. Automated UI coverage MUST include a `waitingTime` run and assert restart is not visible while the run is waiting on elapsed world time.

### Requirement: Actor crafting app run details

The Actor Crafting App run-details action MUST provide meaningful details for visible crafting run rows.

1. Clicking a visible run-details action for an active crafting run MUST open a details view for that active run.
2. Clicking a visible run-details action for a historical crafting run MUST open a details view for that historical run.
3. The details view MUST include recipe name, run status, step statuses, created results, consumed ingredients, used catalysts, check details when present, failure reason when present, and time-gate state when present and visible to the viewer.
4. The Svelte Crafting tab MUST NOT use placeholder content that only echoes the run ID and scope.
5. The Svelte Alchemy tab MUST NOT render an enabled details button with a null details handler.
6. If details are temporarily unavailable for a displayed row, the button MUST be disabled and communicate that state with a localized title and accessible label/reason instead of silently doing nothing.
7. Alchemy no-signature attempts MUST use a generic alchemy-attempt label in details instead of a recipe name.
8. Alchemy details for non-GM viewers MUST NOT reveal hidden recipe names, hidden ingredients, hidden result details, routing internals, or other metadata that the canonical alchemy feedback rules keep secret.
9. Automated UI coverage MUST render or compile the Svelte run-summary/tab wiring deeply enough to catch an enabled details button with no handler.
10. Run details SHOULD display resolved item names, quantities, and actor/source names where available, and SHOULD format Foundry world-time values through the app's existing time-formatting conventions rather than exposing raw numeric values.
11. Automated run-details coverage MUST include Crafting tab history details, Alchemy tab details, and non-GM alchemy redaction for no-signature or hidden-recipe attempts.

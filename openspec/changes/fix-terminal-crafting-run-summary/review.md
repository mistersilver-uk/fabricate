# Delta Spec Review

## Result

The delta spec was reviewed by domain, UX, and quality agents and iterated until no blocking spec feedback remained.

## Review Passes

- Domain review: initial blockers resolved; final blocking-only pass returned `PASS`.
- UX review: initial blockers resolved; final blocking-only pass returned `PASS`.
- Quality review: initial blockers resolved; final spec-only blocking pass returned `PASS`.

## Blocking Feedback Resolved

- Terminal active-source records must not disappear; they must be repaired into history or shown as terminal history for the refresh.
- Internally completed runs are detected by executable step success, not by optional result metadata.
- Alchemy details must preserve secrecy and handle no-signature attempts generically.
- Manager, store, engine, legacy app, RunSummary, and RecipeCard action seams are explicitly in scope.
- `canContinue`, `canCancel`, and `canRestart` are explicit action flags and false for terminal or internally completed runs.
- `waitingTime` runs do not show restart.
- Svelte Crafting and Alchemy tab run-details wiring must be real, not placeholder/null.
- UI tests must render or compile real Svelte wiring deeply enough to catch inert details buttons.
- RecipeCard active-run affordances require normalized non-terminal run state.
- Narrow run-summary layout, disabled details affordances, localization, history ordering, and history cap coverage are included.

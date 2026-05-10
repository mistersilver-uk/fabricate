# Manager V2 Gathering Task Editor

## Why

Gathering tasks can be browsed in Manager V2, but editing their reusable drop rules still requires lower-level data changes or the legacy environment workflow. GMs need a focused task editor that keeps reusable task identity, availability, and reward drop rows together.

## What Changes

- Add a Manager V2 gathering task edit route for reusable task definitions.
- Add editable task identity, enabled state, single-select weather and time availability, and searchable paginated drop rules.
- Extend reusable drop rows with `dropRate`, `quantity`, and per-weather/per-time condition modifiers.
- Apply matching condition modifiers during drop resolution and clamp final drop chance to `0..100`.
- Keep Gathering Rules in Gathering Settings and show an editor notice when current rules may prevent multiple matching rows for the same component from awarding.

## Scope Notes

- The existing gathering hazards placeholder keeps its current route/tab id (`encounters`) and display intent. This change does not rename that route state.
- User-facing copy uses drop chance, drop rules, and drop resolution language. Internal runtime names remain where renaming would create unrelated churn.

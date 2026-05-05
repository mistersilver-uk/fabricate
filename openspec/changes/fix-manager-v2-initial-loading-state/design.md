# Design

## Product Rule

Manager V2 must distinguish unknown system data from confirmed empty system data. The "No crafting systems yet" empty state is shown only after `adminStore.refresh()` completes successfully and the refreshed system list is empty.

## Store State

`adminStore.viewState` owns the refresh lifecycle because it already owns the Manager V2 display contract. The state shape adds:

- `loading`: `true` while a refresh is in flight.
- `loaded`: `true` after at least one successful refresh has populated the view model.
- `error`: localized or display-safe text from the most recent refresh failure, otherwise `null`.

The initial store state uses `loading: true`, `loaded: false`, and `error: null` so the UI treats the boot state as unknown instead of empty. A successful refresh clears `error`, sets `loaded: true`, and sets `loading: false`. A failed refresh records `error` and sets `loading: false` while preserving the current view data where practical.

## UI Behavior

The systems library empty-state branch is ordered:

1. Show loading when `loading === true` and `loaded !== true`.
2. Show refresh error when `error` is present.
3. Show "No crafting systems yet" only when `loaded === true` and `systems.length === 0`.
4. Show search-empty or rows as before.

This keeps established post-load behavior unchanged while preventing the startup flash.

## Test Seams

Store tests assert state transitions directly through the public `viewState` store. Mounted Svelte tests use the existing fake store seam and set `loading`, `loaded`, and `error` values to verify visible copy without adding Foundry runtime dependencies.

## Durable Spec Ownership

This loading-state rule is UI contract behavior for Manager V2. The canonical long-term owner is `openspec/specs/ui-integration/spec.md`; this active design records the rule for the scoped fix.

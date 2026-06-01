# Design

## Data shape

`environment.blindSelection` collapses from `{ strategy, macroUuid, rollTableUuid, weights }` to `{ weights }` only. Normalization returns `null` when there are no weight entries so empty objects don't litter the persisted JSON.

`environment.reveal` is dropped entirely. The normalize pass no longer reads it; stored values are silently discarded on the next load.

The vestigial per-task `task.blindSelection` field is also removed — no consumer depended on it.

## Engine

`GatheringEngine._pickBlindTask` collapses to a single weighted-random call against `blindSelection?.weights`, with `pool[0]` as a defensive last-resort fallback when the weighted pick produces nothing (e.g. every weight is zero). The `rollTable` / `macro` resolver helpers (`_resolveBlindSelection`, `_matchResolvedBlindTask`) and the `blindSelectionResolver` constructor parameter all go.

`_resolveRevealPolicy` reads reveal config from `environment.rules` (the system Gathering Rules attached to the environment at runtime) only. The `environment.reveal` override read is removed.

## UI

The "Blind behaviour" card in `EnvironmentOverviewTab.svelte` is deleted in full — strategy picker, Roll table UUID input, Macro UUID input, Reveal policy select, Reveal scope select. The Targeted / Blind selection-mode toggle stays, as does the per-task Weight column on the Tasks tab (which writes through `blindSelection.weights`).

## Migration

Migration is silent and zero-friction:
- A stored environment with `blindSelection.strategy: 'firstAvailable'` (etc.) has those fields dropped on the next normalize. Its `weights` map (if any) survives.
- A stored environment with `reveal: { policy, scope }` has the override discarded on the next normalize. The system Gathering Rules now govern reveal.
- On-disk JSON updates the next time the GM saves the environment.

No data is lost that materially affected gathering behaviour:
- Environments previously using `firstAvailable` get weighted random with their existing weights (defaulting to `1` when missing — uniform).
- Environments previously using `rollTable` / `macro` get weighted random; the Foundry resolver chain wasn't being used in practice.
- Environments previously overriding reveal fall back to the system default, which is the desired single source of truth.

## Out of scope

- `task.reveal` (per-task field, distinct from the env override) — unchanged.
- The Targeted / Blind selection-mode toggle — unchanged.
- The per-task Weight column on the Tasks tab — unchanged.
- System Gathering Rules `revealPolicy` / `revealScope` — unchanged.

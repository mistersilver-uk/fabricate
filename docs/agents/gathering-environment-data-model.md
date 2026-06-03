# Gathering Environment Data Model

Gathering environment objects carry **two parallel sets** of task/hazard fields. Knowing which one to read for which question saves a lot of stale-zero confusion.

## Modern (canonical for new envs)

Library references — the environment composes content from `gatheringConfig.systems[].tasks` / `.hazards` by id:

- `environment.enabledTaskIds[]` — task ids included automatically
- `environment.disabledTaskIds[]` — task ids the GM explicitly excluded
- `environment.forcedTaskIds[]` — task ids force-added in manual mode
- `environment.enabledHazardIds[]` / `disabledHazardIds[]` / `forcedHazardIds[]` — same shape for hazards

The actual composed-task set is `enabled ∪ forced − disabled`, then filtered by environment matching rules (biome / region / danger / library-enabled).

**Canonical GM-admin composition counts** for the row table and inspector live at `$viewState.environmentTaskCounts[envId]` (shape: `{ availableTaskCount, availableHazardCount }`), computed inside `adminStore.js` via `_buildEnvironmentCompositionViewModel(environment)?.counts` (`src/ui/svelte/stores/adminStore.js:2692`). `availableTaskCount` counts only records whose `runtimeState === 'available'` — i.e. composed **and** with current conditions met (`adminStore.js:2145`, `:2239`). It is the authoritative GM-runtime "ready right now" count for the manager surface; it is **not** what a player blind-reveal `(x/y)` suffix divides by.

### Player listing counts are a separate, engine-owned surface

The player-facing environment listing is produced by `GatheringEngine.listForActor` / `_buildEnvironmentListing` (`src/systems/GatheringEngine.js:486`, `:776`), not by the admin store. Each player environment listing carries its own count and policy fields via `_playerListingFields` (`GatheringEngine.js:888`):

- `composedTaskCount` — the size of the **total composed task pool** for the environment (`normalizeList(environment.tasks).length`; `0` when the listing is locked). This is the **blind-reveal denominator** — the `y` in a `(x/y)` "tasks discovered" suffix. It is a pool size, distinct from the admin `availableTaskCount` (which subtracts condition-blocked records).
- `discoveredTaskCount` — the `x`: how many tasks this actor has revealed at the effective reveal scope (`GatheringRichStateService.countRevealedTasks`). It is `0` when the listing is locked or when the effective `revealPolicy === 'never'`.
- `revealPolicy` — the **effective system-level** policy (`never` | `onSuccess` | `onAttempt`), resolved by `GatheringEngine._resolveRevealPolicy` (`GatheringEngine.js:2043`) from the composed system Gathering Rules. Reveal is system-level only; environments do **not** override it.
- `locked` — `true` for a disabled environment, surfaced as a locked identity-only listing to all viewers (players and GMs alike).
- `biomeTags` — resolved biome display metadata (`{ id, label, icon, colorToken, customColor }`) from `GatheringRichStateService.resolveBiomeTags`, so player biome chips render identically to the GM editor.

**Disabled environments are surfaced as locked identity-only listings to all viewers** (players and GMs alike) in the player listing (`_lockedEnvironmentListing`, `GatheringEngine.js:854`): `locked: true`, `attemptable: false`, an `ENVIRONMENT_DISABLED` blocked reason, and identity fields only — no `tasks`, weights, or composition internals leak. They were previously filtered out entirely for non-GMs and (earlier still) shown as the full listing to GMs.

Use the admin `environmentTaskCounts` only for GM manager surfaces. Use the engine listing fields (`composedTaskCount` / `discoveredTaskCount`) for anything a player sees.

## Legacy (still normalized, almost always empty)

`environment.tasks[]` — full task records embedded directly on the environment. Normalized via `_normalizeTask` in `src/systems/GatheringEnvironmentStore.js` (~line 318). Each embedded task carries `catalysts[]`, `tools[]`, `dropRows[]`, `resultGroups[]`.

In modern environments this array is empty — the embedded-task UX moved out to the standalone `gathering-task-edit` route, and new environments only reference library tasks by id. The schema slot survives for back-compat with older worlds.

**Do not read counts off `environment.tasks.length`** for the row table, inspector, or readiness checks. The browser-row inspector previously did this and showed 0 for everything; the fix was to switch to `$viewState.environmentTaskCounts`.

## Catalysts vs required tools

"Catalysts" is a **task-level** concept (a component consumed during gathering). Environments do not surface catalysts — they surface **required tools**, aggregated from the unique `task.toolIds` across the composed task set.

UI strings that say "Catalysts" at the environment scope are a sign of stale code copying from the task editor. The correct env-scope label is "Required tools".

## Quick reference

| Question | Read from |
| --- | --- |
| GM manager: how many tasks are available *right now* (composed + conditions met)? | `$viewState.environmentTaskCounts[id]?.availableTaskCount` |
| GM manager: how many hazards? | `$viewState.environmentTaskCounts[id]?.availableHazardCount` |
| Player listing: total composed task pool (blind-reveal denominator `y`) | `listing.composedTaskCount` (from `GatheringEngine.listForActor`) |
| Player listing: tasks this actor has discovered (`x`) | `listing.discoveredTaskCount` |
| Player listing: effective reveal policy (system-level) | `listing.revealPolicy` |
| Player listing: is this a locked (disabled) teaser? | `listing.locked` |
| Which task ids? | `enabled ∪ forced − disabled` from the env object |
| Which tools are required? | Look up composed task ids in `gatheringTaskDefinitions`, union the `toolIds` |
| What catalysts does the env require? | None — catalysts are per-task. Ask "what tools" instead. |
| Embedded task records | `environment.tasks[]` (legacy; almost always empty) |

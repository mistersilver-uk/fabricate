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

The player-facing environment listing is produced by `GatheringEngine.listForActor` / `_buildEnvironmentListing` (`src/systems/GatheringEngine.js:535`, `:825`), not by the admin store. Each player environment listing carries its own count and policy fields via `_playerListingFields` (`GatheringEngine.js:1017`):

- `composedTaskCount` — the size of the **total composed task pool** for the environment (`normalizeList(environment.tasks).length`; `0` when the listing is locked). This is the **blind-reveal denominator** — the `y` in a `(x/y)` "tasks discovered" suffix. It is a pool size, distinct from the admin `availableTaskCount` (which subtracts condition-blocked records).
- `discoveredTaskCount` — the `x`: how many tasks this actor has revealed at the effective reveal scope (`GatheringRichStateService.countRevealedTasks`, which now delegates to `listRevealedTaskIds`). It is `0` when the listing is locked or when the effective `revealPolicy === 'never'`.
- `revealPolicy` — the **effective system-level** policy (`never` | `onSuccess` | `onAttempt`), resolved by `GatheringEngine._resolveRevealPolicy` (`GatheringEngine.js:2275`) from the composed system Gathering Rules. Reveal is system-level only; environments do **not** override it.
- `locked` — `true` for a disabled environment, surfaced as a locked identity-only listing to all viewers (players and GMs alike).
- `biomeTags` — resolved biome display metadata (`{ id, label, icon, colorToken, customColor }`) from `GatheringRichStateService.resolveBiomeTags`, so player biome chips render identically to the GM editor.

Beyond the shared `_playerListingFields`, `_buildEnvironmentListing` also surfaces two task-shaped fields per environment:

- `tasks[]` — the visible task models. A **targeted** environment lists every visible task transparently; a **non-GM viewer of a blind** environment gets a single opaque `blindGather` entry (the collapsed task list); a **GM viewer of a blind** environment gets the full transparent list. Each transparent task model carries a `successChance` (see below); the opaque blind entry never does.
- `discoveredTasks[]` — for a **non-GM viewer of a blind** environment only, the transparent, individually-attemptable models for the tasks this actor has already revealed (the player "Discovered Tasks" list), each tagged `discovered: true`. It is `[]` for targeted environments, GM viewers, locked environments, and `never`-policy environments. Built by `GatheringEngine._discoveredTaskModels` (`GatheringEngine.js:942`) only from the already-computed visible tasks intersected with the revealed-id set (via `_listRevealedTaskIds`), so an unrevealed or never-visible task can never leak into it. Its length tracks `discoveredTaskCount` but may legitimately diverge if a revealed task later becomes invisible/disabled.

Per-task `successChance` (on transparent task models) is a 0–1 fraction from `GatheringEngine._taskSuccessChance`: a **static drop-rate approximation** `1 − ∏(1 − dropRate_i/100)` over enabled d100 drop rows. It is `null` for non-d100 tasks and when there are no enabled drop rows. It is a **find-chance** ("chance at least one drop rolls"), **not** whole-attempt success — it ignores actor/condition/character modifiers, attempt limits, node depletion, stamina, required tools, and the d100 success threshold.

**Disabled environments are surfaced as locked identity-only listings to all viewers** (players and GMs alike) in the player listing (`_lockedEnvironmentListing`, `GatheringEngine.js:982`): `locked: true`, `attemptable: false`, an `ENVIRONMENT_DISABLED` blocked reason, empty `tasks` and `discoveredTasks`, and identity fields only — no `tasks`, weights, or composition internals leak. They were previously filtered out entirely for non-GMs and (earlier still) shown as the full listing to GMs.

Use the admin `environmentTaskCounts` only for GM manager surfaces. Use the engine listing fields (`composedTaskCount` / `discoveredTaskCount`) for anything a player sees.

## Legacy (still normalized, almost always empty)

`environment.tasks[]` — full task records embedded directly on the environment. Normalized via `_normalizeTask` in `src/systems/GatheringEnvironmentStore.js` (~line 318). Each embedded task carries `toolIds[]`, `dropRows[]`, `resultGroups[]`. (Older drafts referenced a `catalysts[]` field on tasks; the gathering-side catalyst concept was **dead/vestigial** — never authored, only read, always empty — and is fully removed. There is no `task.catalysts`.)

In modern environments this array is empty — the embedded-task UX moved out to the standalone `gathering-task-edit` route, and new environments only reference library tasks by id. The schema slot survives for back-compat with older worlds.

**Do not read counts off `environment.tasks.length`** for the row table, inspector, or readiness checks. The browser-row inspector previously did this and showed 0 for everything; the fix was to switch to `$viewState.environmentTaskCounts`.

## Required tools (system-owned)

Tools are the unified, required-but-reusable, breakable prerequisite primitive (they replaced the retired Catalyst concept). A gathering task references them by id via `task.toolIds`. The environment surfaces **required tools**, aggregated from the unique `task.toolIds` across the composed task set.

**Tools are SYSTEM-OWNED.** The single canonical library is `system.tools` (the `craftingSystems` setting, populated by `CraftingSystemManager._normalizeSystem`). It is **not** a gathering-scoped store. `GatheringRichStateService.composeEnvironment` sources the library from `system.tools` and exposes it to the engine as the non-enumerable `__libraryTools` Map on the composed environment; `GatheringEngine._resolveTaskTools` resolves each `task.toolIds` entry against that Map. A `toolId` that no longer resolves, or that resolves to a disabled tool, blocks the attempt with `TOOL_BLOCKED`.

Migrations: **0.6.0** converts recipe-side catalysts into library Tools on `system.tools`; **0.7.0** (`migrateToolsToSystem.js`) reconciles any UI-authored `gatheringConfig.systems[id].tools` onto the matching `system.tools` (dedupe by id, the system tool wins) and clears the gathering-config copy. After 0.7.0, `system.tools` is the sole library — do not read or write a `gatheringConfig.systems[id].tools` array.

There is **no** gathering-side catalyst concept. UI strings that say "Catalysts" at the environment scope are stale; the correct env-scope label is "Required tools".

## Canvas placement: Gathering-Task tiles

A Gathering Task can be placed on the canvas as an **Interactable Tile** (`TileDocument`, not an actor-backed token; no token, no sheet). A GM drags a task entry from the Interactable browser onto the canvas to spawn a flagged tile (`tile.flags.fabricate`); a player double-clicks it to open the gathering app scoped to that task. Tiles have no nameplate → a canvas hover label shows the name.

**Per-tile node state** lives at `tile.flags.fabricate.node` — a drop-time snapshot of the task's node CONFIG (config + runtime), **independent of** `environment.nodeRuntime[taskId]`. It is depleted when `node.current <= 0`, with calendar-aware world-time respawn, and is threaded into start-attempt/listing as a `nodeStateOverride` that takes precedence over the environment node for that task (scoped so it never leaks into another listed task). Tool requirements are NOT snapshotted — they resolve from `task.toolIds` against `system.tools` at attempt time. All node-state writes (deplete, respawn, depleted-behavior apply/revert, terminal delete) route through the active GM over the `module.fabricate` socket (`INTERACTABLE_NODE_UPDATE` / `INTERACTABLE_NODE_DELETE`); only `game.users.activeGM` applies `tile.update`/`tile.delete`.

**Depleted visual layer.** A task node may configure `depletedBehavior { swapImage?, deleteToken? }`. On a tile, only **swap-image** (texture swap; original captured in `flags.fabricate.nodeOriginal`, reverted on respawn) and the terminal **delete** (`deleteToken`, no revert — the respawn pass no-ops against a deleted/absent tile) change appearance. **`postfixName` is NOT supported for tiles** (no nameplate) and is ignored. `deleteToken` is mutually exclusive with `swapImage`.

**`defaultEnvironmentId`** is a **new optional** task field (`string | null`), a **placement hint only**. It does NOT participate in environment composition (tasks are still composed many-to-many via `enabledTaskIds`/`forcedTaskIds`). It is normalized in `adminStore._normalizeGatheringTask` and preserved by `GatheringEnvironmentStore`.

**Drop-time environment resolution precedence** (`src/canvas/environmentResolution.js`):

1. **Tagged Scene Region** containing the drop point (`region.flags.fabricate.environmentId`); one unambiguous existing hit auto-resolves (a `ui.notifications.info` names it), multiple hits are ambiguous and fall through.
2. **Task `defaultEnvironmentId`** (a stale id falls through).
3. **GM dialog** (cancel aborts the spawn — no tile created).

Holding **Alt** during the drop **always forces the GM dialog**, bypassing tiers 1 and 2.

Distinguish two environment-id uses: a Scene Region `flags.fabricate.environmentId` is a **drop-time placement** hint (which environment a dropped tile belongs to), whereas `environment.sceneUuid` is the **runtime gathering gate** that ties a composed environment to a scene during attempt validation. They are unrelated.

## Quick reference

| Question | Read from |
| --- | --- |
| GM manager: how many tasks are available *right now* (composed + conditions met)? | `$viewState.environmentTaskCounts[id]?.availableTaskCount` |
| GM manager: how many hazards? | `$viewState.environmentTaskCounts[id]?.availableHazardCount` |
| Player listing: total composed task pool (blind-reveal denominator `y`) | `listing.composedTaskCount` (from `GatheringEngine.listForActor`) |
| Player listing: tasks this actor has discovered (`x`) | `listing.discoveredTaskCount` |
| Player listing: the discovered blind-task rows (non-GM blind only) | `listing.discoveredTasks[]` (`[]` for targeted, GM, locked, or `never`-policy) |
| Player listing: a task's find-chance bar value | `task.successChance` (0–1 d100 drop approximation; `null` when N/A; not attempt-success) |
| Player listing: effective reveal policy (system-level) | `listing.revealPolicy` |
| Player listing: is this a locked (disabled) teaser? | `listing.locked` |
| Which task ids? | `enabled ∪ forced − disabled` from the env object |
| Which tools are required? | Look up composed task ids, union the `toolIds`, resolve against `system.tools` (the `__libraryTools` Map at runtime) |
| Where do Tools live? | `system.tools` (system-owned, `craftingSystems` setting). NOT `gatheringConfig.systems[id].tools` (0.7.0 reconciled those onto the system). |
| What catalysts does the env require? | None — the Catalyst concept is retired; required prerequisites are Tools. |
| Per-tile node / depleted behavior for a placed task? | `tile.flags.fabricate.node` (independent of `environment.nodeRuntime`); `depletedBehavior` swap-image/delete only (no `postfixName` on tiles) |
| Which env does a dropped task tile belong to? | Precedence: tagged Scene Region (`flags.fabricate.environmentId`) → task `defaultEnvironmentId` → GM dialog; Alt forces the dialog |
| Embedded task records | `environment.tasks[]` (legacy; almost always empty) |

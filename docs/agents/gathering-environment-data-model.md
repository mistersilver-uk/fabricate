# Gathering Environment Data Model

Gathering environment objects carry **two parallel sets** of task/event fields. Knowing which one to read for which question saves a lot of stale-zero confusion.

## Modern (canonical for new envs)

Library references — the environment composes content from `gatheringConfig.systems[].tasks` / `.events` by id:

- `environment.enabledTaskIds[]` — task ids included automatically
- `environment.disabledTaskIds[]` — task ids the GM explicitly excluded
- `environment.forcedTaskIds[]` — task ids force-added in manual mode
- `environment.enabledEventIds[]` / `disabledEventIds[]` / `forcedEventIds[]` — same shape for events

The actual composed-task set is `enabled ∪ forced − disabled`, then filtered by environment matching rules (biome / region / danger / library-enabled).

**Canonical GM-admin composition counts** for the row table and inspector live at `$viewState.environmentTaskCounts[envId]` (shape: `{ availableTaskCount, availableEventCount }`), computed inside `adminStore.js` via `_buildEnvironmentCompositionViewModel(environment)?.counts` (`src/ui/svelte/stores/adminStore.js:2692`). `availableTaskCount` counts only records whose `runtimeState === 'available'` — i.e. composed **and** with current conditions met (`adminStore.js:2145`, `:2239`). It is the authoritative GM-runtime "ready right now" count for the manager surface; it is **not** what a player blind-reveal `(x/y)` suffix divides by.

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

## Canvas placement: Gathering-Task region interactables

A Gathering Task can be placed on the canvas as a **region-first interactable**: a **Scene Region** carrying a custom **`fabricate.interactable` Region Behaviour** (the authoritative state owner), plus an optional **linked visual** marker (Tile by default; optionally a Drawing or an existing GM Token; or *region-only* with no marker). There are **no synthetic actors or tokens**. A GM drags a task entry from the Interactable browser onto the canvas (or uses "Place on current scene" / "Region only"). **Tile double-click is retired** — players activate by **walking a controlled token into the region**: a non-blocking on-canvas prompt appears on the controlling player's client, and clicking *Interact* routes an activation request to the active GM, who validates and grants it, opening the gathering app scoped to (and auto-selecting) that `(environmentId, taskId)` on the player's client. A `controlToken` re-trigger + the *Fabricate: interact here* keybinding cover tokens already inside on scene load.

**No per-interactable node state.** A gathering-task interactable is a **pure (environment, task) shortcut**. The behaviour has **no `node` field** and snapshots nothing at placement: it carries only `(environmentId, taskId)`. Activation reads and decrements `environment.nodeRuntime[taskId]` — the **single source of truth** — exactly as a manual gather of that task would, with no `nodeStateOverride` and no precedence layer. Two interactables pointing at the same `(environment, task)` draw down the **same** shared environment node. The earlier per-region node *pool* / snapshot / `nodeStateOverride` and the per-behaviour world-time respawn pass (`interactableRegionWorldTime.js`) were **removed**; depletion and respawn are owned entirely by the environment node runtime. (Note the marker *image swap* below is NOT a return of the per-region pool — it reads the shared `environment.nodeRuntime[taskId]`, not a per-marker count.) The behaviour-state writes that DO route through the active GM over the `module.fabricate` socket are the GM config panel's behaviour edits (`INTERACTABLE_BEHAVIOR_UPDATE` for `{ system: { state … } }`) and linked-visual writes (`INTERACTABLE_VISUAL_UPDATE` / `INTERACTABLE_VISUAL_DELETE`, e.g. relink reverse-flags, marker hidden/image reconcile); only `game.users.activeGM` applies `behavior.update` / the visual `update`/`delete`. There is no node-state write path.

**Marker reflects state (no per-marker pool).** The linked visual owns no authoritative state, but a **Tile** marker reflects the shared environment node + behaviour state (`interactableMarkerDepletion.js`, active-GM reconcile on the `gatheringEnvironments` change and `canvasReady`):

- **Image swap (gathering tasks):** when `environment.nodeRuntime[taskId].current <= 0` AND the task configures `nodes.depletedBehavior.swapImage`, every linked Tile marker for that `(environment, task)` swaps to the depleted image; on recharge (respawn above 0) it flips back. The available image is stashed at `flags.fabricate.markerAvailableImg` on the first swap and restored on recharge. Only Tile markers with a configured `swapImage` swap — there is no Drawing hide/label or Token mutation, and there is no delete.
- **Visibility (all interactables, tool + gatheringTask):** the marker Tile's `hidden` reflects `resolveMarkerHidden` — `true` when the interactable is DISABLED (`state.enabled === false`) or explicitly HIDDEN (`presentation.hidden === true`), so only the GM sees it; otherwise visible. A **LOCKED** interactable stays visible (Lock ≠ Disable): the prompt fires and Interact is denied with "This is locked." (`shouldPromptOnEnter`/`validateActivationRequest`).

A linked existing **Token** is always the GM's own document and is never mutated or deleted. A **missing** linked visual is a clean no-op (the interactable still works region-only), governed by `linkedVisual.missingPolicy`.

**`defaultEnvironmentId`** is an **optional** task field (`string | null`), a **placement hint only**. It does NOT participate in environment composition (tasks are still composed many-to-many via `enabledTaskIds`/`forcedTaskIds`). It is normalized in `adminStore._normalizeGatheringTask` and preserved by `GatheringEnvironmentStore`.

**Placement-time environment resolution precedence** (`src/canvas/environmentResolution.js`):

1. **Tagged Scene Region** containing the drop point (`region.flags.fabricate.environmentId`); one unambiguous existing hit auto-resolves (a `ui.notifications.info` names it), multiple hits are ambiguous and fall through.
2. **Task `defaultEnvironmentId`** (a stale id falls through).
3. **GM dialog** (cancel aborts the placement — nothing is created).

Holding **Alt** during the drop **always forces the GM dialog**, bypassing tiers 1 and 2.

Distinguish two environment-id uses: a Scene Region `flags.fabricate.environmentId` is a **placement** hint (which environment a placed interactable belongs to), whereas `environment.sceneUuid` is the **runtime gathering gate** that ties a composed environment to a scene during attempt validation. They are unrelated. (The `environmentId` resolved at placement is stamped onto the behaviour's `system.environmentId`.)

## Quick reference

| Question | Read from |
| --- | --- |
| GM manager: how many tasks are available *right now* (composed + conditions met)? | `$viewState.environmentTaskCounts[id]?.availableTaskCount` |
| GM manager: how many events? | `$viewState.environmentTaskCounts[id]?.availableEventCount` |
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
| Per-region node pool for a placed task? | **None.** No `system.node` field; depletion/respawn read the shared `environment.nodeRuntime[taskId]`. The marker *reflects* that node: a Tile marker swaps to `task.nodes.depletedBehavior.swapImage` when the env node is depleted and flips back on recharge (`interactableMarkerDepletion.js`); no Drawing/Token swap, no delete |
| Marker visibility for a placed interactable? | Tile marker `hidden = true` when DISABLED (`state.enabled === false`) or HIDDEN (`presentation.hidden === true`); LOCKED stays visible (Lock ≠ Disable — prompt fires, Interact denied). `resolveMarkerHidden` in `interactableRegionActivation.js` |
| Which env does a placed task interactable belong to? | Precedence: tagged Scene Region (`flags.fabricate.environmentId`) → task `defaultEnvironmentId` → GM dialog; Alt forces the dialog. Resolved id is stamped onto the behaviour's `system.environmentId` |
| Embedded task records | `environment.tasks[]` (legacy; almost always empty) |

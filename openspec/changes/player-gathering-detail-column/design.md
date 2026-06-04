# Design — Player Gathering App Detail (Center) Column

## Engine: revealed-task list helper

`src/systems/GatheringRichStateService.js`

- **`listRevealedTaskIds({ actor, environmentId, scope = 'actor' })` → `string[]`.** Add immediately
  after `countRevealedTasks` (`:708-736`). Identical read path — `readState(actor).reveals`, the
  `revealKey` sentinel-prefix trick (`:718-728`) — but returns `Array.from(taskIds)` instead of the
  count. Returns `[]` on missing/inaccessible state; never throws. The `party` scope collapses onto
  the `actor:` key exactly as `revealKey` (`:1662-1666`) and `countRevealedTasks` already do.
- **`countRevealedTasks` refactor.** Delegate: `return this.listRevealedTaskIds({ ... }).length;` so
  the count and the list share one implementation (the existing `countRevealedTasks` behavior and
  its test stay green).

## Engine: success chance + discovered tasks

`src/systems/GatheringEngine.js`

- **`_taskSuccessChance(task)` → `number|null`** (a 0–1 fraction). Returns `null` unless
  `task.resolutionMode === 'd100'`. Reads `normalizeList(task.dropRows)` (the normalized property is
  `dropRows`; `itemDrops` is collapsed at store level, `GatheringEnvironmentStore.js:339`), filters
  `r => r?.enabled !== false`. With no enabled rows → `null`. Otherwise
  `1 − ∏(1 − clamp(Number(dropRate), 0, 100) / 100)`. This is a static approximation — it ignores
  actor/condition/character modifiers, attempt limits, node depletion, stamina, catalysts, and the
  d100 success threshold. It means "chance at least one drop rolls", not whole-attempt success.
- **`_listRevealedTaskIds({ actor, environmentId, scope })`** — a private null-safe wrapper mirroring
  `_countRevealedTasks` (`:940-947`): `return normalizeList(this.richState?.listRevealedTaskIds?.(…))`
  guarded by a typeof check; returns `[]` if the service or method is absent.
- **`_taskModel(… , forceVisible = false)`** (`:1165`). New optional key. When `true`, skip the
  `opaqueBlind` early-return (`:1170-1187`) and fall through to the full transparent model branch
  (`:1189-1208`). All callers use the object form, so the added key is safe. Add
  `successChance: this._taskSuccessChance(task)` to the transparent branch only — never to the
  opaque `blindGather` branch (it must not leak aggregate drop info).
- **`_taskBlockedReasons(… , transparent = false)`** (`:1014-1093`). New optional key. When `true`,
  bypass **only** the `_isOpaqueBlindTask`-driven data redaction (`:1022/:1038/:1051/:1079`) so a
  revealed task's row can show real `requiredWeather`/`requiredTimeOfDay`/tool data. No other
  behavior changes.
- **`_buildEnvironmentListing`** (`:811-883`). Refactor the task loop (`:832-852`) to stash
  `{ task, visibility, blockedReasons }` per visible task. Then:
  - **Targeted env:** `tasks: taskModels`, `discoveredTasks: []`.
  - **Blind env, GM viewer:** models are already transparent — `tasks: taskModels`,
    `discoveredTasks: []` (no double-surfacing).
  - **Blind env, non-GM:** collapse `tasks` to the single opaque entry
    (`tasks: taskModels[0] ? [taskModels[0]] : []`). Compute `discoveredTasks`:
    - `{ policy, scope } = this._resolveRevealPolicy(environment)` (as used at `:926`); if
      `policy === 'never'` → `[]`.
    - else `revealedIds = new Set(this._listRevealedTaskIds({ actor, environmentId: environment.id,
      scope }))`; for each stashed visible task whose `task.id ∈ revealedIds`, build a model via
      `_taskModel({ …, forceVisible: true })` with blocked reasons recomputed via
      `_taskBlockedReasons({ …, transparent: true })`, plus `discovered: true`.

The public API (`game.fabricate.listGatheringForActor`, `main.js:816`) returns the listing
unchanged in shape — new fields propagate automatically.

## API / service wiring

`src/ui/SvelteFabricateApp.svelte.js`

- `_buildServices()` (`:55-61`): add
  `startGatheringAttempt: (opts = {}) => game?.fabricate?.startGatheringAttempt?.(opts) ?? null`.
  The service exists (`main.js:833` → `engine.startAttempt({ environmentId, taskId })`; blind gather
  omits `taskId`). `services` is already passed to `GatheringView`.

## New / changed UI — `src/ui/svelte/apps/gathering/`

### `GatheringView.svelte` (edit)
- Import `GatheringDetail`; derive `selectedEnvironment = environments.find(e => e.id === selectedId)
  ?? null`. Replace the inert center `<section>` with
  `<section class="gathering-view-column gathering-view-column-center" data-gathering-detail>
   <GatheringDetail environment={selectedEnvironment} {services} onAttempted={load} /></section>`
  (drop `aria-hidden`). Right column unchanged.

### `GatheringDetail.svelte` (new)
Props `{ environment, services, onAttempted }`. Derives `isBlind`, `revealPolicy`, `tasks`,
`discoveredTasks`, `blindAction` (the `action: 'blindGather'` entry), `showDiscoveredSection =
isBlind && revealPolicy !== 'never'`.

- **No env:** reuse the `.gathering-view-state` empty pattern (`GatheringView.svelte:114-132`),
  `data-gathering-detail-state="empty"`, copy `…Detail.SelectHint`.
- **Env selected:** a scrollable column (`flex-direction:column; min-height:0; overflow-y:auto;
  gap/padding via --fab-space-*`) wrapped in `<section aria-labelledby>` with an `<h2>` title:
  - **Info pips** `<ul data-gathering-pips>`: one pip per present biome/region/danger. Biome pip
    reuses the `biomeChipStyle`/`--fab-chip-color`/`color-mix` pattern
    (`EnvironmentCard.svelte:58-62,316-336`) from `environment.biomeTags`; region/danger pips use base
    tokens + an icon; each pip has an `aria-label` (`…Detail.Pips.*`).
  - **Description** `<p>` (omitted when empty). **Mode hint:** `…Detail.BlindHint` or
    `…Detail.TargetedHint` by `selectionMode` (`data-gathering-mode-hint`).
  - **Blind:** "Attempt gathering" button `data-gathering-blind-attempt` (disabled when no
    attemptable blind action) → `attempt({ environmentId, taskId: null })`. When
    `showDiscoveredSection`: `<section data-gathering-discovered>` with heading
    `…Detail.DiscoveredHeading` ({x}=`discoveredTaskCount`, {y}=`composedTaskCount`) + paginated
    `GatheringTaskRow` list over `discoveredTasks`; empty → `…Detail.NothingDiscovered`.
  - **Targeted:** prominent paginated `GatheringTaskRow` list over `tasks`, no discovered heading.
- **Pagination:** reuse `src/ui/svelte/components/Pagination.svelte` (`GatheringEnvironmentList.svelte:
  87-96`): local `pageIndex`/`pageSize` `$state`, options `[6,9,12]`, slice. Repeat its
  `:global(.manager-pagination*)` re-theme block — acceptable duplication (no shared partial exists).
- **Attempt handler** (shared, `busy` `$state` guard): `await services.startGatheringAttempt({
  environmentId, taskId }); await onAttempted?.()`. `busy` disables buttons during the round-trip.

### `GatheringTaskRow.svelte` (new)
Props `{ task, environmentId, onAttempt, busy }`. Container
`role="listitem" data-task-id data-attemptable data-blocked class:is-blocked`.
- **Image** (rounded, `object-fit:cover`): when blocked, lock overlay reusing
  `.gathering-env-card-lock-overlay` + image desaturation (`EnvironmentCard.svelte:255-273`).
- **Copy:** name (ellipsis + `title`), description (2-line clamp like
  `EnvironmentCard.svelte:343-352`), then blocked info `<ul data-gathering-blocked>` via a
  `blockedLabel(reason)` helper mapping code→i18n key (`CONDITIONS_BLOCKED` → required time/weather
  from `reason.data`; `TOOL_BLOCKED` → missing tools; else `reason.message` or `…Detail.Blocked`).
- **Success bar:** `<SuccessChanceBar value={task.successChance} />` (renders nothing when null).
- **Attempt button** `data-gathering-attempt` (disabled when `!attemptable || busy`) →
  `onAttempt({ environmentId, taskId: id })`; stays visible-but-greyed when blocked.

### `SuccessChanceBar.svelte` (new)
Prop `value` (0–1 fraction). `{#if value != null}` only. `pct = round(clamp(value,0,1)*100)`.
`role="meter"` with track+fill (`width:${pct}%`), `{pct}%` label, aria-label `…Detail.SuccessChance`.
Fill `var(--fab-success)`, track `var(--fab-surface-raised)`.

All new components use scoped `<style>` with base `--fab-*` tokens only — no `.manager-*` classes and
no `--fab-mv2-*` tokens (those are `.fabricate-manager`-scoped). Player app is `.fabricate-app`-scoped.

## i18n — `lang/en.json`

Add a `Detail` object under `FABRICATE.App.Gathering` (sibling of `Environments`, `:17-31`):
`SelectHint`, `BlindHint`, `TargetedHint`, `BlindAttempt` ("Attempt gathering"), `Attempt`,
`DiscoveredHeading` ("Discovered Tasks ({x}/{y})"), `NothingDiscovered`, `SuccessChance`
("Success chance: {x}%"), `SuccessChanceLabel`, `RequiresTimeOfDay`, `RequiresWeather`,
`MissingTools`, `Blocked`, and `Pips.{Biome,Region,Danger}`. Use `localize(key, data)`
(`foundryBridge.js`) with `{x}`/`{y}`/`{value}`/`{values}`/`{tools}` placeholders, passing the data
object as `EnvironmentCard.svelte:48-53` does.

## Tests

- `tests/gathering-engine-listing.test.js`: successChance ≈0.75 for two 50% d100 rows; `null` for
  non-d100; ignores disabled rows; `null` with no enabled rows. Blind non-GM + `revealPolicy:
  'onAttempt'` + stubbed `listRevealedTaskIds(['task-b'])` → `tasks=[blindGather]`,
  `discoveredTasks=[task-b]`, no id/successChance leak on the blind entry,
  `discoveredTasks.length === discoveredTaskCount`. Blind + `'never'` → `discoveredTasks=[]`. Blind
  GM → real `tasks`, `discoveredTasks=[]`. No unrevealed-task leak.
- `tests/gathering-rich-library.test.js` (or where `countRevealedTasks` is covered):
  `listRevealedTaskIds` matches the distinct id set per scope (incl. `party→actor`), and
  `countRevealedTasks === listRevealedTaskIds(...).length`.
- `tests/components/gathering-detail-mounted.test.js` (new; mirror the mounted scaffold, add
  `startGatheringAttempt` to `makeServices`): empty hint with no selection; targeted env rows with
  `[data-task-id]`, enabled/blocked attempt buttons, `[data-gathering-success-value]`, blocked info;
  blind env `[data-gathering-blind-attempt]` + `[data-gathering-discovered]` "(x/y)" + discovered
  rows; clicking `[data-gathering-attempt]` calls `startGatheringAttempt({environmentId, taskId})`
  then re-calls `listGatheringForActor`; blind attempt omits `taskId`.

## Smoke harness — `scripts/foundry-test-run.mjs`

The gathering tab fetches asynchronously and the center now has content. The gathering screenshot
step must `waitFor` a stable selector (`[data-gathering-detail]`, and `[data-gathering-detail-state]`
off `"empty"` once a card is selected) before capturing, or it grabs the loading state (see
`player-gathering-environments-column/design.md:190-192`). Add the new stable hooks to the harness
selector list: `[data-gathering-detail]`, `[data-gathering-blind-attempt]`, `[data-gathering-attempt]`,
`[data-task-id]`.

## Risks / edge cases

- **Success chance is a drop-only static approximation** — it can read high while the attempt is
  still blocked or fails a skill check. Acceptable per the confirmed decision; kept labeled "Success
  chance".
- **Engine returns a 0–1 fraction**; `SuccessChanceBar` multiplies by 100. Engine tests assert
  fractions, component tests assert percents.
- **`discoveredTasks.length` vs `discoveredTaskCount`** may legitimately diverge if a revealed task
  later becomes invisible/disabled — render gracefully; assert equality only for the stable fixture.
- **No unrevealed-task leak:** `discoveredTasks` is built only from already-computed visible tasks
  intersected with the revealed-id set — never from a fresh visibility pass that could surface hidden
  tasks (assert in tests).

## Docs to update (docs loop)
- JSDoc on the changed engine/RichState methods (`listRevealedTaskIds`, `_taskSuccessChance`,
  `_buildEnvironmentListing` field list, `_taskModel`/`_taskBlockedReasons` new params).
- `docs/gathering-environments.md` / `docs/agents/gathering-environment-data-model.md` if they
  enumerate player-listing fields — add `successChance` and `discoveredTasks`.

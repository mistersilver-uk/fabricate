# Fabricate - Domain Model History

## Gathering Implementation Checkpoints

Issue `#179` backend timed-lifecycle and GM-tab foundation checkpoint: `GatheringEngine.startAttempt` validates the selected environment/task
path before execution.
Non-timed tasks resolve routed/progressive terminal outcomes after pause, reference, system,
enabled-state, ownership, scene/token, visibility, duplicate-run, tool-availability, and selected-task-configuration
guards pass; invalid `failureOutcome` configuration aborts as task misconfiguration before resolver calls or terminal side
effects.
Immediate terminal attempts first plan gathered-result refs for success and tool usage/breakage refs for both success and
failure, then write newest-first terminal gathering history with those planned refs before committing item creation,
tool usage/breakage, or failure feedback.
If terminal history persistence fails, no result, tool, or failure-feedback commit
occurs.
Successful immediate attempts then create gathered results on the selected actor and apply terminal tool usage/breakage
against that actor only.
Failed immediate attempts create no gathered results but still apply terminal tool usage/breakage and
failure feedback after terminal history persistence succeeds.
Timed tasks run the same guards, then create exactly one
awaited `waitingTime` run through `GatheringRunManager.createWaitingRun` without result, tool, or terminal history side
effects.

`GatheringEngine.processWorldTime(worldTime)` now processes matured `waitingTime` runs returned by
`GatheringRunManager.getMaturedWaitingRuns()`.
On successful or failed timed completion it re-resolves the task, plans
terminal result/tool/check refs, calls `completeRun`, and commits result, tool, or failure-feedback side effects
only after terminal history is written; `completeRun` returning `null` or throwing blocks those side effects and reports an
error.
If the run's actor, system, environment, or task reference disappears before resume, the engine cancels the run into
terminal history instead of silently deleting it.
Deliberate environment-store cleanup for deleted systems, environments,
or tasks remains destructive record cleanup and does not create cancellation history.
If GM edits make the task
misconfigured before resume, the engine clears the active run without terminal player history, results, tool usage, or
failure feedback, which removes duplicate-run blocking and requires a fresh manual start after repair.
Non-GM blind
blocked, cancellation, and terminal responses keep task identity, tool details, result details, provider diagnostics,
and check internals redacted; persisted blind terminal history uses the generic `taskId: "blind"` marker and redacted
payloads.

Bootstrap now constructs the gathering environment store, run manager, evaluator, and engine internally during module
initialization after crafting systems load. `game.fabricate` exposes the persistence/support seams needed by UI callers
(`getGatheringEnvironmentStore()`, `getGatheringRunManager()`, and `getGatheringGateAndCheckEvaluator()`) plus the narrow
viewer-enforcing runtime methods `listGatheringForActor(options)` and `startGatheringAttempt(options)`.
These runtime
methods replace any caller-supplied `viewer` with the current Foundry user before delegating, so public API callers cannot
spoof GM visibility.
The raw `GatheringEngine` instance is not exposed as a public `game.fabricate` getter or property.
Ready and `updateWorldTime` dispatch to a guarded world-time processor that calls the module-private
`GatheringEngine.processWorldTime(worldTime)` without coupling gathering failures to crafting or salvage processing.
The GM admin now has a gated `Environments` editor.
It lists environments for the selected
gathering-enabled system, exposes a cloned selected draft, resets draft state on system changes, and falls back to a valid
tab when `features.gathering` is disabled or the selected system cannot show environments.
The selected draft can edit
environment name, description, enabled state, selection mode, and scene UUID; dirty state exists for that draft, and
save/cancel affordances are visible.
New environment creation persists a disabled draft shell with one disabled placeholder
task for validation compatibility; that shell is not a configured player-visible gathering path until configured and
enabled by the GM.
Duplicate, delete, and reorder use environment-store methods; delete requires confirmation and cleans
referenced gathering runs through the store.
The selected draft supports task-list CRUD (add, select, duplicate, delete,
and reorder), base task fields (`name`, `description`, `img`, `enabled`, `resolutionMode`), selected-task result-group
authoring (add, rename, delete, reorder), component-based result authoring (add, edit `componentId`/`quantity`, delete,
reorder), and selected-task tool-reference authoring (add/remove `toolIds` referencing system-owned library Tools; inline
Tool authoring on tasks is not supported), and selected-task visibility-gate authoring (enable/clear plus a
formula-only `formula` + `threshold` pair, no provider/macro).
Incomplete visibility input remains local to the Environments tab until
both `formula` and `threshold` are present; clearing calls the store only when a committed visibility gate exists.
Store-owned
task/result/tool/visibility/result-selection/progressive/check callbacks are wired from the root into
the tab, and the component delegates mutations to the admin store.
Base task, result, tool, visibility,
result-selection, progressive, and check edits preserve nested task configuration outside edited collections and persist
only through the environment-store validation boundary.
Routed gathering carries **no** per-task result-selection authoring
(as of 1.6.0); routed tasks resolve through the system-level `gatheringCraftingCheck.routed.rollFormula`.
Progressive authoring edits
`awardMode` values `equal`, `partial`, and `exceed` plus a formula-only `check` (`formula` + optional `threshold`, no provider/macro); the check threshold
is optional and is not the same rule as a required visibility-gate threshold.
Time-requirement authoring clears
`timeRequirement` for immediate tasks or edits minutes, hours, days, months, and years for timed tasks.
Failure-outcome
authoring clears to default failure feedback or edits text and macro custom outcomes; switching the failure-outcome
`mode` (`text`/`macro`) clears stale fields from the prior selection.
Disabled draft tasks may save without progressive check targets, but a present malformed
`failureOutcome` is still rejected as task misconfiguration, not as a player failure outcome.
Save failures expose
`environmentValidationState` with localized summary text, field-addressable errors, a first-invalid target used for focus,
and an attempt counter; these failures keep the selected draft dirty and leave persisted environment data unchanged.
Result-group validation maps duplicate/reserved-name failures to group-name fields, while collection-level missing group or
missing result failures map to focusable result-group/result anchors.
Stale scene UUID and macro UUID references remain
visible in the editor and preserve the saved UUID until the GM changes the field.
New draft placeholder result groups
receive immediate IDs so they can be edited before save/reload.
Managed item options are prepared by the admin store/root
and passed into the tab; the tab does not perform Foundry lookups.
Progressive difficulty is displayed from the selected
managed component difficulty and is not persisted on individual result rows.
A Tool's `breakage.maxUses` is validation- and
runtime-relevant only for the `limitedUses` breakage mode.
Dirty environment drafts now require discard confirmation before
GM navigation, selected-system changes, environment replacement by select/new/duplicate, gathering feature disable, and
app close.
Declining the prompt preserves the dirty draft and blocks the attempted transition; accepting intentionally
discards the draft or proceeds with the replacement or close.
Concurrent navigation attempts share a single in-flight
discard confirmation.
Persisted environment delete uses its destructive delete confirmation directly, including when the
selected persisted draft is dirty, and does not stack a separate dirty-discard prompt; unsaved new drafts still use discard
confirmation because there is no persisted environment record to delete.

Player gathering app entry/store foundation checkpoint: Fabricate now registers a dedicated `SvelteGatheringApp` through
`appFactory` and opens it from a feature-gated Items Directory `Gathering` action when at least one normalized crafting
system has `features.gathering === true`; it does not route through the crafting app shell. `createGatheringStore` is a UI
state boundary over injected services.
It selects and persists `lastGatheringActor`, clears invalid remembered actor state
when the actor no longer resolves or is no longer selectable, refreshes runtime listings through
`game.fabricate.listGatheringForActor({ actor })`, and starts attempts through
`game.fabricate.startGatheringAttempt({ actor, environmentId, taskId })`.
Actor options come from permission/resolution
checks, not actor-type exclusions.
The player list keeps otherwise visible blocked scene/token entries visible with
localized reasons, and runtime listings include UI-safe active timed runs plus recent history for the selected actor even
when browsing is empty or blocked.
Non-GM blind rows and missing-environment run rows stay opaque/generic; targeted rows
can show useful labels, status, time-gate data, and terminal metadata. `createGatheringStore` carries those `activeRuns`,
`history`, and `lastResult` feedback values as UI state while the runtime remains the domain source of truth.
Immediate
terminal failures rely on the runtime/configured failure feedback path, with default failure feedback localized through
`FABRICATE.Gathering.FailureDefault`, so the store intentionally avoids emitting a duplicate generic failed-attempt
warning.
Responsive behavior for the GM environments editor and player gathering app now keys off each app/container's
inline size with CSS container queries rather than browser viewport width, so narrow Foundry ApplicationV2 windows can
stack editor panes and player active/history rows without changing gathering runtime semantics or validation behavior.
Runtime integration coverage now includes scene-linked gathering, hook-driven timed completion, and the harvesting
boundary regression guard.
Validation/accessibility polish is implemented; live Foundry validation remains conditional
for future runtime-specific or screenshot-required work.

Player gathering detail-column checkpoint: the player app's center column now renders the selected environment's detail
panel, and the player listing carries two additional per-task/per-environment concepts. **`successChance`** is a per-task
`0`–`1` fraction (or `null`) used to render the success-chance bar.
It is a deliberate drop-only static approximation —
`1 − ∏(1 − dropRate_i/100)` over the task's enabled drop rows, defined only for `resolutionMode === 'd100'` (and `null`
for progressive/routed modes or when no drop rows are enabled).
It means "chance at least one drop row rolls" (the chance
the attempt finds something), NOT whole-attempt success: it ignores the d100 threshold, condition/character modifiers, the
attempt/node/stamina/tool gates, and event policy, so the bar can read high while the attempt is still blocked or
fails its check.
It is never attached to the opaque `blindGather` entry, so it leaks no aggregate drop information.
**`discoveredTasks`** is the transparent, individually-attemptable set of revealed-task models shown on a non-GM viewer's
`blind`-environment listing: each carries `discovered: true` and the same real task identity, blocked reasons, and
`successChance` as a targeted row.
The non-GM blind `tasks` array stays collapsed to a single opaque `blindGather` action,
so the discovered rows live only in `discoveredTasks`.
The distinction between _discovered_ and _visible/attemptable_ on
the player surface matters here: `discoveredTaskCount` counts every task revealed at the effective reveal scope, whereas
`discoveredTasks` is built only from the intersection of those reveals with the entry's currently-visible tasks (never a
fresh visibility pass, so no unrevealed task can leak).
The two may legitimately diverge — `discoveredTasks.length` can be
smaller than `discoveredTaskCount` when a revealed task is currently invisible or disabled. `discoveredTasks` is always
empty for targeted environments, locked entries, GM viewers (who already get the full transparent `tasks`), and when the
effective `revealPolicy === 'never'`.

## Remaining Drift to Track

- Issue `#2`: the gathering domain is spec-complete and backend listing/attemptability, immediate terminal resolution, timed waiting-run creation, timed world-time completion/resume, bootstrap/ready/updateWorldTime hook wiring, narrow global accessors, a gated GM `Environments` editor, save-blocking validation/accessibility presentation, dedicated player gathering app registration, player gathering store foundation with active/history/terminal feedback state, the feature-gated Items Directory `Gathering` action, container-query responsive polish for GM/player gathering surfaces, scene-linked runtime integration coverage, hook-driven timed completion coverage, and harvesting boundary regression coverage exist.
  Live Foundry validation remains conditional for future runtime-specific or screenshot-required work.
- Issue `#111`: RESOLVED by removal.
  The deprecated built-in/macro crafting-check "source" mechanisms (`checkSource` including `"builtIn"`, the root `macroUuid`/`successMacroUuid`/`failureMacroUuid` fields, the `builtIn` config, and the `CraftingCheckAdapter`/`Dnd5eCraftingCheckAdapter`/`CraftingCheckAdapterRegistry` layer) have been deleted.
  A crafting/salvage/gathering check is now usable iff its resolution-mode sub-object carries an authored roll formula (`simple.rollFormula`/`routed.rollFormula`/`progressive.rollFormula`); `craftingCheck.enabled` remains only as the on/off toggle for the OPTIONAL simple-mode check, and `craftingCheck.simple.macroUuid` survives as the UI-authored dynamic-DC macro (a distinct feature that only computes the DC).
- Issue `#119`: discovery-mode rename remains partial in runtime (`teaserConfig`, `Recipe.teaser`,
  `FragmentDiscoveryHook` still exist).
- Issue `#257` (location-aware gathering geography): **Phase 1 shipped** — `GatheringRealm`/`GatheringParty`/`GatheringRealmSettings`
  records (renamed from the Gathering Region vocabulary to avoid the Foundry Scene Region collision), per-system realms (moved to world scope by #1282) + `gatheringParties` world setting, the composite one-enabled-party-per-actor invariant, actor
  `discoveredGatheringRealms` flags with GM reveal/hide, the `GatheringLocationService` current-realm resolver
  (`manualOverride`/live `travelActor` sensing/`unresolved`), environment location availability evaluation in listing + start guard,
  redaction-safe disclosure/travel guidance, the `game.fabricate.gathering` API surface, system import/export realm ride-along,
  and the GM navigation (permanent World > Parties for global party management and gated per-system overrides; World > Travel for realm authoring and Map Region Links).
  **Phase 3 Scene Region automation SHIPPED** (PR #291): World > Travel > Map Region Links authors `sceneMappings`, and live `travelActor` token sensing
  (`senseSceneRegions` over `TokenDocument#regions` with a position hit-test fallback) resolves the current realm at runtime.
  **Not yet shipped (later phases):** `onPartyTokenEntry` reveal automation (still enum-only, no hook), realm modifier _application_ (Phase 4,
  `GatheringRealmModifier` records normalize/validate but do not yet adjust runtime), player travel view, and player-facing/full discovery controls.
- Issue `#286` (unify gathering regions) **SUPERSEDES the prior `#257` model** in these ways (shipped): (1) `GatheringRealm`
  is the SOLE gathering-geography concept — geography only.
  Geography is **no longer a composition axis**; composition matches by biome + danger only
  (`evaluateEnvironmentMatch` dropped the geography axis and `evidence.region`).
  Note this is an intentional behavior change: a task/event
  previously narrowed by a region tag but with empty `biomes` now matches "any biome" and may appear in MORE environments. (2) The whole
  realm/travel/availability subsystem is **default-off** behind the per-system `gatheringRealmSettings.enabled` toggle
  (`isGatheringRealmsEnabled` is the single gate source of truth across engine/resolver/API/Manager). (3) The legacy **region vocabulary
  is removed** (the `regions` vocabulary dimension, the task/event `region` match tag, and the inert `environment.region` single string),
  and all legacy region UI (vocabulary panel, task/event region pickers, task/event/environments-browser region filters + chips, player
  geography pip) is removed. (4) Environments declare membership in **multiple** realms via `includedRealmIds`
  (a toggle-gated multi-select in the env editor). (5) Realm authoring (name/description/img/secret/biomes; delete-with-confirm) moved
  fully into the Travel route. (6) An idempotent startup migration derives `GatheringRealm` records from the legacy per-system region
  vocabulary and maps `environment.region` → `includedRealmIds` (orphan free-text strings left inert), clears the per-system region vocab,
  strips task/event region tags, leaves `enabled` unset (→ false), and fires a one-time GM notice; pre-unification exports upgrade on the
  next migration run after import.
  The subsequent `1.1.0` Gathering Region → Gathering Realm key-rename migration runs after this and
  rewrites the persisted `gatheringRegions`/`gatheringRegionSettings`/`includedRegionIds`/`currentRegionOverrides` keys to their realm equivalents.

- Issue `#1091` (canonical summary projections): the browse-status vocabulary and its precedence rule now live in the import-free leaf `src/ui/presenters/craftingBrowseStatus.js`, with `CraftingListingBuilder` re-exporting the vocabulary and delegating the rule.
  Two follow-ups remain open.
  (1) The private copy the move was meant to retire is still in place: `craftingStore.svelte.js` keeps `RECIPE_STATUS_AVAILABLE = 'available'`, and its comment still names `ui/presenters/CraftingListingBuilder.js` as the owner.
  The stated reason for the copy (“keeps the store free of the builder import so its unit-test compiler need not resolve that module graph”) no longer holds, because the leaf imports nothing — stale-but-resolvable, not false.
  (2) The two surfaces the contract was written for do not exist yet, so `projectRecipeSummary` and `projectComponentSummary` have no production caller: the canonical shape binds surfaces still to be built (#1075 player listing, #1081 GM browsers), which is the point of writing it first, but it also means the contract is unvalidated against a real consumer until those land.
  **Updated after #1081 shipped:** one of the two named surfaces has now landed and did NOT become that caller.
  The GM browsers page-scoped their own row and card projections (`adminRecipeRowProjection.js`, `adminComponentRowProjection.js`) and made the five recorded sort keys cheap there, so the manifest gained no field and still has zero production callers.
  The gap in the recipe manifest is therefore no longer an amendment that #1081 is expected to bring back; it is an amendment now owed to #1075 alone, and one that must adopt the derivations #1081 shipped rather than author second ones.

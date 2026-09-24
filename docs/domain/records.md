# Aggregates and Records

## Crafting System

Its `id` must match `/^[A-Za-z0-9_-]+$/` (no dots or spaces) because it is used as a per-Item durable-flag map key segment in `flags.fabricate.roles[systemId].componentId`; `CraftingSystemManager` rejects an unsafe id at creation/import and never rewrites it.

Canonical mapping: `CraftingSystemManager.systems`, normalized system object

Spec reference: openspec/specs/overview/spec.md, openspec/specs/data-models/spec.md

## Module Setting

It is not part of any crafting system's persisted data model.

Canonical mapping: `src/config/settings.js`, `SETTING_KEYS`, `game.settings.register`

Spec reference: openspec/specs/overview/spec.md

## Recipe

Canonical mapping: `Recipe`, `RecipeManager`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Recipe Category

Every recipe normalizes to at least the reserved `general` bucket, so there is no true "uncategorized" state; a custom token is free text surfaced verbatim while only `general` is localized.
Projected onto the player `RecipeListingModel` as `category` (raw filter-match token) and `categoryLabel` (display string), where it drives a per-row badge and a single-level filter dropdown with a deliberate badge-vs-filter asymmetry: the badge is suppressed for `general` (no redundant "General" chip) but `general` stays a selectable filter option, pinned LAST as the catch-all.

Canonical mapping: `Recipe.category`, `normalizeRecipeCategory`/`getRecipeCategoryLabel` in `src/utils/recipeCategories.js`, `CraftingListingBuilder` `category`/`categoryLabel` projection

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-crafting-app/spec.md, openspec/specs/ui-system-studio/spec.md

## General Recipe Category

It is effective even when no custom categories exist and is not stored as a deletable custom category entry.

Canonical mapping: `general`, `src/utils/recipeCategories.js`, recipe/admin editor category helpers

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-system-studio/spec.md, openspec/specs/ui-entity-editors/spec.md

## Component Category

A SIBLING of, and independent from, Recipe Category: the two vocabularies are never merged, aliased, or cross-populated, so a component category is never offered as a recipe category and vice versa.
Every component normalizes to at least the reserved `general` bucket, so there is no "uncategorized" state; a custom token is free text surfaced verbatim while only `general` is localized.
Distinct from Item Tags, which are many-valued and do a different job — tags are edited in the component editor and, for a multi-row selection, in the browser's bulk edit panel, and are not rendered as browser row chips.

Canonical mapping: `Component.category`, `CraftingSystem.componentCategories`, `normalizeComponentCategory`/`getComponentCategoryLabel` in `src/utils/componentCategories.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-entity-editors/spec.md, openspec/specs/ui-system-studio/spec.md

## General Component Category

It is effective even when no custom component categories exist and is not stored as a deletable custom entry in `componentCategories`.
Every existing component acquires it by normalization, with no migration.

Canonical mapping: `general`, `src/utils/componentCategories.js`, component editor + browser category helpers

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-entity-editors/spec.md, openspec/specs/ui-system-studio/spec.md

## Component

**TWO of those are WORLD-SCOPED SECTIONS rather than the system's own answer** — the category since `1.30.0` and the essence quantities since `1.32.0` (issue 1371, maintainer ruling M31): each is authored once on the world record and resolved by every system that has rules for the component unless that system OVERRIDES it, in which case the in-system value below is what resolves.
Salvage, complications and difficulty stay the system's alone, because two systems SHOULD disagree about them and none of them has a world referent to disagree about.
Recipes, Tools, salvage definitions, and gathering results reference components by Fabricate component identity, not by raw Foundry Item identity.
A component's `componentId` was historically both a within-system identity and the cross-system reference target Tools pointed at; issue 561 gave Tools their own identity, relieving `componentId` of the reference role.
Issue 570 then made `CraftingSystemExporter.prepareForImport(…, 'copy')` regenerate every component id and remap every within-payload component reference, closing the copy-import id-collision residual.
Component ids remain per-system-unique only (independently-authored systems and worlds that copy-imported before issue 570 can still share ids), so `componentId`'s within-system identity role and the `roles[systemId]` scoping stay load-bearing.
When import sees a broken recorded compendium/source UUID, the component uses the live dropped Item UUID as its primary source and keeps the broken UUID in `aliasItemUuids`.

Canonical mapping: `_normalizeComponent()` in `CraftingSystemManager`, `normalizeComponent` in `src/systems/normalize/components.js`, `system.components`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Component Tag

The distinction the name exists to protect: the tag VOCABULARY is authored on the crafting system (`CraftingSystem.itemTags`) and the VALUES are authored on the managed component DEFINITION (`Component.tags`) — never on the Foundry item a character holds.
Fabricate has five readers of `flags.fabricate.tags` and NO writer, so "what tags does this held item carry?" is answered by the UNION of the tags of the component the item resolves to and any item-level tag flag left by a third party or a hand-edited world.
Every seam with system-component context takes that union; the model-only fallbacks that have none (`Ingredient.matches`, and the legacy bare `ingredient.tag` branch) read the flag alone and are reached only when no matcher is injected.
Issue 1075 is the cautionary case: the browse row's material tally read the item flag alone, which is empty in every real world, so every tag ingredient reported unsatisfied and a row said "missing materials" beside an inspector saying "Available" — a premise checked against a fixture that stamped the flag, rather than against the code that writes the data.
Gated by the system's `enableTags` feature.
Distinct from **Recipe Category** and **Component Category**, which are single-valued grouping labels rather than a matching axis.

Canonical mapping: `Component.tags` and `CraftingSystem.itemTags`; `tagsHandler.matchesItem` in `src/models/match/matchTypes.js`; `RecipeManager._matchesTagIngredient`; `tagsOf` in `src/systems/inventorySnapshot.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/destructive-changes-and-migrations/spec.md

## Step

`Recipe.getExecutionSteps()` returns the ordered steps (synthesizing one implicit step for a single-step recipe); the **first execution step** (entry, `[0]`) is where the player listing reads required materials and craftability, and the **terminal (final) execution step** is where it reads the recipe's product (PRODUCES).
**Only the TERMINAL step must produce.**
Every non-`failure` result group on the terminal step must hold at least one result; a result group on an earlier step MAY be empty, so an intermediate step can cost time, materials and a check while awarding nothing (issue 1907).
An empty intermediate group is AUTHORED DATA, never residue — the same standing the reserved `role: 'failure'` group has — so no strip, cascade or normalizer may prune it.
`progressive` is the exception in both directions: `ResolutionModeService`'s `stepRequiresOrderedResults` still applies to EVERY progressive step, because a progressive stage IS what it awards.
The **product step** is what every PRODUCT read resolves against (`CraftingListingBuilder._productStep`): terminal once a recipe runs more than one step, its only step otherwise, shared by the listing's PRODUCES row and the `routedByCheck` tier table so the two cannot disagree.
`RecipeListingModel.stepCount` is how a body asks that, counting AUTHORED steps regardless of `features.multiStepRecipes`.

Canonical mapping: `recipe.steps[]`, `Recipe.getExecutionSteps()`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/ui-crafting-app/spec.md, openspec/specs/ui-entity-editors/spec.md

## Pre-Craft Duration Preview

An implicit recipe projects its positive recipe-level time requirement; a fully revealed `simple` multi-step recipe projects each timed step and a field-wise aggregate over `minutes`, `hours`, `days`, `months`, and `years` without calendar conversion.
The preview is absent for instant, non-positive, time-feature-disabled, and Discovery-Mode-teaser cases.
It is neither persisted recipe/run data nor the in-progress run time gate/countdown.

Canonical mapping: `RecipeListingModel.duration`, `RecipeListingModel.steps[].duration`, `CraftingListingBuilder`

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/data-models/spec.md

## Gathering Environment

It contains one or more Environment Tasks.

Canonical mapping: Registered world setting `fabricate.gatheringEnvironments`; normalized and validated by `GatheringEnvironmentStore`; listed for players through viewer-enforcing `game.fabricate.listGatheringForActor()` backed by an internally constructed `GatheringEngine`; backend immediate resolution, timed waiting-run creation, timed world-time completion/resume, bootstrap wiring, and global accessor facade implemented; GM admin editor supports environment fields, Environment Task list CRUD/base fields, selected Environment Task result-group/tool-reference (`toolIds`)/visibility-gate authoring (routed tasks carry no per-task result-selection provider as of 1.6.0; they resolve via the system-level `gatheringCraftingCheck.routed.rollFormula`), progressive check/award-mode authoring, selected Environment Task time-requirement authoring, and selected Environment Task failure-outcome authoring through store-owned draft callbacks; save failures expose structured validation state and keep the dirty draft unpersisted; stale scene/macro references remain visible and preserved until changed; new environment shells remain disabled placeholders until configured and enabled; dirty draft discard confirmation protects navigation, replacement, and close; dedicated player app shell, app registration, Items Directory entry, active/history rows, terminal feedback surfaces, container-query responsive polish for narrow ApplicationV2 windows, scene-linked runtime integration coverage, hook-driven timed completion coverage, and harvesting boundary regression coverage implemented; live Foundry validation remains conditional for future runtime-specific or screenshot-required work

Spec reference: openspec/specs/overview/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Gathering Rules

These rules are authoritative once authored; existing worlds without a `rules` object may still read legacy per-task item selection, per-environment event selection, and per-environment event policy fields for compatibility.

Canonical mapping: `gatheringConfig.systems[systemId].rules`; normalized by admin store and `GatheringRichStateService`; edited from Manager V2 Gathering Settings; runtime d100 resolution uses `highestRankedDrop`, `allDrops`, or `limitedDrops` for rewards and events, plus `successWithEvent` or `failureWithEvent` for event outcome

Spec reference: openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-system-studio/spec.md

## Gathering Task

Gathering Tasks live in the selected system's task library, can match multiple environments by biome (with weather/time of day as runtime gates) and environment allow/deny lists, and are distinct from legacy Environment Task records embedded in an environment.
Geography is NOT a composition axis (geography is the first-class `GatheringRealm`); the legacy task `region`/`regions` tag (inert-legacy tag name kept verbatim) is stripped by migration and ignored on read.
Task-level availability gates decide whether the task can be attempted; drop rows define component or Item rewards, quantity, base drop chance, and per-drop time/weather modifiers.
Persisted/imported drop rows must resolve to an owning-system component or a Foundry Item UUID.

Canonical mapping: `gatheringConfig.systems[systemId].tasks`; normalized by `adminStore`; browsed and edited from Manager V2 Gathering Tasks; duplicated by `duplicateGatheringLibraryTask()` with fresh task/drop-row ids; import/seed/admin save boundaries reject stale reward targets

Spec reference: openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-system-studio/spec.md, openspec/specs/ui-gathering-app/spec.md

## Environment Task

D100 reward and event row selection is owned by Gathering Rules rather than each Environment Task once system rules are authored.
Result-group authoring currently edits group order/name and component-result `componentId`/`quantity`; tool authoring references existing system-owned library Tools by id (`toolIds`); visibility-gate authoring is formula-only (`formula` + `threshold`, no provider/macro); routed tasks carry **no** per-task result-selection provider (as of 1.6.0) and resolve via the system-level `gatheringCraftingCheck.routed.rollFormula`, so there is no routed result-selection authoring on the task; progressive authoring currently edits `awardMode` and a formula-only `check` (`formula` + optional `threshold`, no provider/macro); time-requirement authoring clears `timeRequirement` for immediate tasks or edits duration units for timed tasks; failure-outcome authoring clears to default feedback or edits text/macro outcomes.
Progressive gathering thresholds come from referenced component difficulty, not inline result difficulty.

Canonical mapping: Normalized and validated by `GatheringEnvironmentStore`; selected Environment Task visibility gate edits use store-owned draft mutation only after both `formula` and `threshold` are present; incomplete visibility input is local UI state, not persisted model state; disabled draft shells skip routed/progressive completeness but still validate any present `failureOutcome`; validation errors are field-addressable and include result-group/result collection anchors; the check `threshold` is optional and distinct from the required visibility-gate threshold; failure-mode switching clears stale mode fields (routed gathering has no per-task result-selection provider to switch as of 1.6.0); listed with visibility and attemptability through viewer-enforcing global methods; scene/token, duplicate-run, tool, and other attemptability blockers keep otherwise visible entries listable with localized reasons; non-GM blind listings expose a generic action instead of real task identity; Environment Tasks without `timeRequirement` resolve routed/progressive terminal outcomes immediately, while Environment Tasks with `timeRequirement` create a guarded `waitingTime` run and are completed by the module-private `GatheringEngine.processWorldTime(worldTime)` dispatcher when mature

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Crafting Run

Canonical mapping: `CraftingRunManager`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Phantom-Run `resolved`

It is true for a legitimate wait (`routeGatedExecution`'s collapsed-chain gate outcome and its own time-gate wait), for a completed step (set once `commitCraft` returns), and when a pipeline function already discarded or cancelled the run itself, such as `_startTimedStep`'s `abort`.
It stays false for a zero-mutation refusal and for the settled-failure returns (`resolveCheckFailure`, `resolveModeValidationFailure`, `runResolutionPreflight`).
A false value there is not always observable: `runResolutionPreflight`'s refusal calls `completeStepFailure` after `_beginNativeStage` has already written a truthy `historySettlement` onto the run's in-progress step, so `_discardPhantomRun`'s own guard (no step carries a `historySettlement`) already withholds the discard regardless of `resolved`.

Canonical mapping: `CraftingEngine._discardPhantomRun`; `CraftingEngine._openCraftContext`; `craftPipeline.js` (`routeGatedExecution`, `_startTimedStep`'s `abort`, `commitCraft`, `resolveCheckFailure`, `resolveModeValidationFailure`, `runResolutionPreflight`)

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/data-models/spec.md

## Salvage Phantom Run

`ctx.salvageRunCreatedThisCall` starts `false` (set by `resolveSalvageRunRecord`) and flips `true` only when `openSalvageRun`'s `createRun` branch supplies the run, never when `resolveSalvageRunRecord` reused an active one.
It is read inline, not threaded through a return shape, at the two zero-mutation aborts `runSalvageCheck` can return before any settlement bracket opens — the misconfigured-check abort and the interactive-cancel abort — each of which discards the run and answers `salvageRun: null` when this call created it, and leaves the SAME run untouched, with no `discardRun` call at all, when it did not: a run reused from a prior call is never destroyed by a check this call happens to fail.
There is no `craft()`-style `finally` sweep behind it: `salvage()`'s driver carries no equivalent of `_discardPhantomRun`, so the two `runSalvageCheck` branches ARE the sweep, each re-testing the flag for itself rather than deferring to one shared cleanup step reached on every exit path.

Canonical mapping: `salvagePipeline.js` (`resolveSalvageRunRecord`'s `ctx.salvageRunCreatedThisCall = false`, `openSalvageRun`'s `= true` on `createRun`, `runSalvageCheck`'s misconfigured and cancelled aborts)

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Prepared Consumption (START snapshot)

FINISH can use it after source items are deleted, and legacy cancellation can reverse actual spending rather than refunding a planned amount.
Version-1 timed stages instead persist selection intent and defer editable-material and currency spending until execution.

Canonical mapping: `CraftingRunManager.markStepPrepared`; `CraftingEngine._startTimedStep` / `reverseRunConsumption`; `CraftingRunStepState.preparedConsumption`

Spec reference: openspec/specs/data-models/spec.md

## Salvage Run

It also carries the **Player Result Order** captured at start (`resultOrder`, a list of result ids) plus the `userId` of the user who started it — see **Result Order Asymmetry**.
The capture is **live as of issue 675**: the player Inventory tab's salvage panel is the UI caller `CraftingEngine.salvage` never had, and its store writes the `salvage:<systemId>:<componentId>` order the run captures — so `resultOrder` now carries a real order on a real player run rather than `null` on every one.
That surface IS the "future player salvage app" this mechanism was built for, and capturing at start is what stopped it inheriting the resume-race defect.

Canonical mapping: `SalvageRunManager`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Salvage Target Actor

It exists because an **inventory row and a salvage are scoped to different things**: a row AGGREGATES one component across every owned actor (`sources[]`, and a `quantity` summed over all of them), while `CraftingEngine.salvage` is **single-actor** — it resolves one actor uuid and its `findComponentItems`/`totalAvailable` availability check sums that ONE actor's stacks.
So **a row's aggregated quantity is not a salvageability predicate**: a row reading 5 across three actors can still fail the engine's check if the target actor holds fewer than `ingredientQuantity`.
This is latent rather than live only because `ingredientQuantity` is effectively always `1` (it defaults to `1`, no UI authors it, and only unit tests set it higher — so a true multi-actor split cannot occur today), which is why there is deliberately **no engine-side pooling and no shortfall-blocked UI state**.
Anything that makes `ingredientQuantity` authorable re-opens this gap and must resolve it explicitly rather than by widening the row's quantity read.
As of issue 766 a card can aggregate participations across crafting systems, so `salvage.targetActorId` and the salvageable owned quantity are computed **per participation** — over the participation's OWN contributing documents, not the card's cross-system union — and the store salvages the **selected** participation's `(systemId, componentId, targetActorId)`, never the primary.

Canonical mapping: `salvage.targetActorId` in `InventoryListingBuilder`; `CraftingEngine.salvage`/`CraftingEngine.findComponentItems`; `game.fabricate.salvageComponent` (`actorId`)

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/data-models/spec.md

## Inventory Card / System Participation

`InventoryListingBuilder` **aggregates then collapses**: participations whose **contributing-document identity sets intersect** join one card, and the card's `totalQuantity`/`sources` are the **union** of contributing documents **deduped by `item.uuid` alone** (never a compendium/duplicate-source union — those are shared across distinct documents and would undercount) and summed per source actor.
The card carries a `systems[]` participation array the inspector's **system selector** (a native `<select>` drop-down, so it scales past two or three systems) scopes the whole body to; display name/img come from the salvageable-biased **primary** participation; `broken` is a **singular** physical property of the document(s).
Same-component aggregation across stacks/actors is preserved; essence rows and Books & Scrolls rows are NOT collapsed.

Canonical mapping: `InventoryListingBuilder._collapseParticipationsToCards`/`_buildSystemParticipations`; `documentIdentity`; `InventorySystemSelector.svelte`; `inventoryStore.selectedParticipation`

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/data-models/spec.md

## Gathering Run

Runtime listing projects UI-safe active/history rows for the selected actor, including empty or blocked browsing states: non-GM blind and missing-environment rows stay generic, while targeted rows can expose useful labels and terminal metadata.

Canonical mapping: `GatheringRunManager`; persisted at `Actor.flags.fabricate.gatheringRuns`; projected by `GatheringEngine.listForActor()` as `activeRuns` and recent `history`

Spec reference: openspec/specs/overview/spec.md, openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Run Journal

Its derived, UI-safe projection supports lifecycle-permitted crafting and versioned gathering actions, preserves secret identity redaction without removing otherwise permitted owner actions, and retains a live active-run badge.
Creation stays in the activity flows.
Finished is its history browser; per-user dismissal hides an entry without deleting actor history.
The Run Journal UI is distinct from the persisted Execution Journal and private Run Authority Ledger.

Canonical mapping: `RunJournalBuilder` (`src/ui/presenters/RunJournalBuilder.js`); `RunModel` / `StepModel` / `JournalListing`; `journalStore.svelte.js`; `src/ui/svelte/apps/journal/`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-journal-app/spec.md, openspec/specs/recipes-and-steps/spec.md

## Companion Operation Record

Its stable Foundry-generated id owns one immutable accepted plan, decision and effect evidence, outcome and archive visibility, so retries can observe completion without a separate deduplication flag.
It is distinct from the per-run Execution Journal and the private Run Authority Ledger.

Canonical mapping: `companionOperationRecord.js`; persisted on a fixed-id page by `companionOperationStore.js`

Spec reference: openspec/specs/companion-api/spec.md, openspec/specs/data-models/spec.md

## derivedStatus

Terminal status wins; otherwise persisted pause wins over readiness and freezes countdown/progress.
An unpaused active gate is ready when `availableAt <= worldTime`, otherwise waiting; no armed gate is in progress.
Readiness uses world time rather than an asynchronously updated native waiting status.
A ready status does not itself authorize execution: versioned action capabilities also check authority, ownership, inputs and recovery.

Canonical mapping: `RunJournalBuilder`; `RunModel.derivedStatus`; `journalRunStatus.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-journal-app/spec.md

## Manual-Advance Asymmetry

Redaction does not remove the crafting owner's otherwise permitted actions.
Version-1 crafting and gathering instead default to manual completion and share the eligible world-time preference contract; `manualAdvance` remains a compatibility signal rather than their authorization predicate.

Canonical mapping: `RunModel.manualAdvance` / `actions`; `resolveAdvanceSources` (`src/systems/advanceCraftingSources.js`); `Fabricate.advanceCraftingRun`; `journalRunCommands.js`

Spec reference: openspec/specs/recipes-and-steps/spec.md, openspec/specs/data-models/spec.md, openspec/specs/ui-journal-app/spec.md

## Result Order Permission

It lives on the aggregate whose results are ordered — `Recipe.allowPlayerResultReorder` and `Component.salvage.allowPlayerResultReorder`, both default `true` — and is **exported** as authoring data (via `Recipe.toJSON()`'s allowlist and the salvage definition).
It is NOT the player's chosen order; see **Player Result Order**.
There is exactly ONE owner: the former system-level `craftingCheck.progressive.allowPlayerReorder` was retired from all three progressive check blocks by the 1.17.0 migration precisely so no second copy with unstated precedence survives.
An absent key reads `true`, which is why nothing seeds it.
Gathering has no reorder feature (no ordered result-stage surface exists), so its copy was removed without replacement.
The salvage half gained its **first UI consumer** in issue 675 (the player Inventory tab's salvage panel): before it, the permission was modelled, authorable, captured and read at award time with no surface that let a player exercise it, so a GM setting it had no observable effect.

Canonical mapping: `Recipe.allowPlayerResultReorder`; `CraftingSystemManager._normalizeSalvage`, `normalizeSalvage` in `src/systems/normalize/salvage.js`; `ToggleCard.svelte` on the recipe Results tab + the salvage editor; `InventorySalvagePanel.svelte` (the first consumer)

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/data-models/spec.md, openspec/specs/ui-entity-editors/spec.md, openspec/specs/ui-crafting-app/spec.md

## Player Result Order

Stored as **result ids** (not indices, so it survives GM edits) under namespaced keys (`recipe:<recipeId>` / `salvage:<systemId>:<componentId>` — namespaced because recipe and component ids are drawn from different id spaces and can collide; both `recipe:` and `salvage:` keys are written as of issue 675, whose salvage panel is the first writer of the latter) in the `PROGRESSIVE_RESULT_ORDER` setting, which is **`scope: 'user'`** — per user **within a world**, not per account globally, and a replicated document write rather than localStorage.
It is a **standing preference** applying to every craft of that recipe until changed, NOT a per-attempt gesture.
It is **never exported**: both halves ride on state `import-export` §Authoring-versus-runtime boundary already excludes (a salvage run's captured order is "active timed runs"; the settings map is user-scoped runtime state), so the split between this and **Result Order Permission** lands exactly on the spec's existing authoring/runtime boundary with no new rule invented.
Reconciliation against the authored list is one shared pure rule: never drops a result, tail-appends the unranked in authored order (so an unranked stage can never displace a ranked one), never reorders an id-less result, and first-match-wins on duplicate ids.

Canonical mapping: `progressiveResultOrder.js` (`progressiveOrderKey`/`applyPlayerResultOrder`); `SETTING_KEYS.PROGRESSIVE_RESULT_ORDER`; `craftingStore.svelte.js`; `inventoryStore.svelte.js` (the `salvage:` writer, which must FLUSH its debounced write before a salvage run starts, or the run captures a stale order); `ProgressiveStageList.svelte`

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/import-export/spec.md, openspec/specs/ui-crafting-app/spec.md

## Result Order Asymmetry

The difference is load-bearing, not an oversight: a salvage resume is driven by the synced `updateWorldTime` hook, which fires on **every** client with no ownership filter, so whichever client wins the race executes it — capturing at start makes the executing user irrelevant and that defect class **structurally unreachable** rather than merely documented.
Consequences worth stating: a salvage with **no run record** uses the authored order with **no settings fallback** (adding one would reintroduce the executing-user read), and salvage gates the **permission** at _read_ time, so a GM toggling it off mid-run takes effect on that run.

Canonical mapping: `ResolutionModeService._resolveProgressiveResultGroups` (live read) vs `CraftingEngine._resolveSalvageResultGroups` + `SalvageRun.resultOrder` (captured read); `SalvageRunManager.createRun`

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/recipes-and-steps/spec.md

## Gathering Realm

A Realm is geography, NOT an environment container: it owns no tasks/events/drops.
It carries `enabled`, `secret`, a `biomes` list (terrain/ecology traits drawn from the system biome vocabulary), and `sort`.
`secret` realms affect runtime availability but appear to undiscovered players as placeholders.
**Realm vs Foundry Region:** a Gathering Realm is the Fabricate concept; a Foundry "Region" (`RegionDocument` / Region Behaviour) is a distinct Scene object that maps **many-to-one** onto a Realm through `sceneMappings[].sceneRegionUuid`.
Removing that collision is why the Fabricate concept was renamed from **Gathering Region** to **Gathering Realm** (the Foundry-bridge `sceneRegionUuid`/`sceneUuid` field names are kept verbatim).
**SHIPPED:** normalization, validation, CRUD, import/export ride-along as the world travel slice (merging destination-wins by id, with reveal mode and modifier visibility seeded only into an unconfigured world), and full realm authoring at World > Travel > Realms (name, description, image, enabled, secret, biomes; create/delete with referenced-by confirm).
Deleting a realm never blocks: it is stripped from the realm membership of every environment that cited it first, and a realm id an environment ALREADY carried that the library has since lost is PRUNED on the next environment save rather than rejected (#1848), so one deleted realm cannot make every environment in the world unsaveable.
Realm-aware travel is gated by `gatheringRealmSettings.enabled` (default false); World Party CRUD is not.
`sceneMappings` are authored through World > Travel > **Map Region Links** and are **applied at runtime** by live token-derived sensing (Phase 3, SHIPPED); `modifiers` (Phase 4 realm modifiers) normalize/validate and round-trip but are **not yet applied at runtime**, as is `sort`/ordering authoring.

Canonical mapping: `GatheringRealm`; `normalizeGatheringRealm`/`validateGatheringRealmList`/`normalizeTravelConfig` in `src/systems/gatheringRealms.js`; persisted as `TravelConfig.realms[]` in the `fabricate.travelConfig` world setting; CRUD via `GatheringRealmStore`; authored at World > Travel > Realms by `GatheringRealmsTab.svelte`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/import-export/spec.md, openspec/specs/ui-world-scope/spec.md, openspec/specs/ui-gathering-app/spec.md

## Gathering Party

A party drives current-realm resolution for the actors associated with it.
It carries `enabled` (default `false`), `memberActorUuids`, `travelActorUuid`, and per-system `currentRealmOverrides[systemId]`.
Parties are **excluded from crafting-system import/export** (they reference world-local actors).
A newly created party defaults to disabled; enabling does **not** require a travel actor, because a party without one resolves to no current realm and so leaves its members exactly where an actor in no party stands.
**Composite uniqueness invariant:** an actor may be associated with at most one _enabled_ party in total — as a member, as the travel actor, or both (when both, the same party) — so a selected actor's current realm is unambiguous; membership in disabled parties does not count.

Canonical mapping: `GatheringParty`; world setting `fabricate.gatheringParties`; `GatheringPartyStore` (owns the composite invariant, `findEnabledPartyForActor`, stamped override set/clear)

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-world-scope/spec.md, openspec/specs/ui-gathering-app/spec.md

## Travel Actor

It is an **Actor UUID** (`travelActorUuid`), NOT a placed Token UUID or prototype-token reference; live realm presence sensing (Phase 3, SHIPPED) resolves the travel actor's placed token(s).
A party has at most one travel actor and is not required to have one in order to be enabled; one travel actor may represent at most one enabled party.
The travel actor may also appear in its own party's `memberActorUuids` (allowed, not a duplicate).

Canonical mapping: `GatheringParty.travelActorUuid`; assigned at World > Parties; uniqueness enforced by `GatheringPartyStore`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Gathering Realm Settings

The two scalars this record used to carry — `revealMode` (`manual` | `onPartyTokenEntry` | `alwaysVisible`, default `manual`), which controls player discovery of secret realm identities, and `modifierVisibility` (`visible` | `gmOnly`, default `visible`) — moved WITH the realm library to the world **Travel Configuration** in the 1.27.0 migration, which adopts them from the first ENABLED system and falls back to the first system that carried them at all; there, unknown values still coerce to defaults on read and are still rejected at save/import boundaries.
**SHIPPED:** the record, defaults, read/write normalization, and the `enabled` gate (`isGatheringRealmsEnabled(system)` is the single source of truth every gate point — engine, resolver, public API, Manager nav/editor — reads); `revealMode` is consumed by disclosure logic.
`onPartyTokenEntry` automation (Phase 3) and modifier-visibility application (Phase 4) are not yet shipped.

Canonical mapping: `GatheringRealmSettings`; `normalizeGatheringRealmSettings`/`validateGatheringRealmSettings`/`isGatheringRealmsEnabled` in `src/systems/gatheringRealms.js`; persisted on `CraftingSystem.gatheringRealmSettings` as `{ enabled }`; the two scalars persisted in `TravelConfig` via `normalizeTravelConfig`/`validateTravelConfig`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Current Realm Resolution

Canonical source tokens are `manualOverride`, `travelActor`, and `unresolved` (player-facing labels `GM override`, `Travel actor`, `No current realm`).
**SHIPPED resolution order:** a GM manual override wins (its realm ids are authoritative, INCLUDING an explicitly-included _disabled_ realm as a GM diagnostic/preview; _missing_ realm ids become `staleRealmIds` and do not resolve); otherwise resolution falls through to live token-derived Scene-Region sensing (`senseSceneRegions` over the travel actor's tokens matched against `sceneMappings[].sceneRegionUuid`, `source: 'travelActor'`); a party with no sensed match resolves to `unresolved`.
The `travelActor` source is a live, shipped resolution branch (Phase 3), and the Travel UI renders the live `Travel actor` source label.

Canonical mapping: `GatheringLocationService.resolveCurrentRealms`/`resolveForActor`/`buildCurrentRealmContext` in `src/systems/GatheringLocationService.js`; constructor-injected into `GatheringEngine`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Listing-Level Realm Context

Shape `{ enabled, realms, systemId }`, using the **store contract keys** (`enabled`/`realms`, deliberately NOT the helper's `realmsEnabled`/`currentRealms`) so the View passes it straight to `setRealmContext` with no remapping.
The active system is derived from the listing's environments by the **system-singularity rule**: it is enabled only when exactly ONE realm-enabled gathering system is present; zero → chip hidden, more than one → ambiguous (a single chip cannot honestly represent two systems' overrides/reveal modes), so it falls back to selection-driven behavior with `enabled: false`.
Disambiguation keys on system identity, not realm-equality.
Realms are resolved through the same `_currentRealmSummary`/`buildRealmDisclosure` path as the per-environment chip, so redaction stays byte-for-byte identical (no secret undiscovered realm leaks via the new field).

Canonical mapping: `GatheringEngine._listingRealmContext()`, `listForActor()` `realmContext`, `_emptyListing` well-formed `realmContext`; consumed by `GatheringView.svelte`/`ActorSelectTopBar.svelte`

Spec reference: openspec/specs/ui-gathering-app/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Environment Location Availability

**Exclusions win** (any current realm in an excluded realm/biome blocks the environment); inclusions match when any current realm id/biome is included; exclusion-only rules are "globally available except in excluded current realms/biomes"; empty-after-normalization or absent fields leave the environment **ungated** (legacy behavior preserved).
When inclusion-gated and no current realm resolves, the environment is blocked with `NO_CURRENT_REALM`; a matched-but-excluded or no-match-while-resolved case is `LOCATION_BLOCKED`.
The engine re-evaluates this in the **start-attempt guard**, not just listing, so stale listing state cannot start an invalid attempt.
The whole evaluation is gated by `gatheringRealmSettings.enabled`: when the subsystem is off (the default), `_locationBlockedReasons` early-returns the ungated shape and every environment is available.
The legacy single `region` free-text string is **inert** (not matching, not editor-surfaced; migrated to `includedRealmIds`); the legacy `biomes` list stays a composition match dimension.
Neither is a `GatheringRealm.id`.

Canonical mapping: `GatheringEnvironment.{included,excluded}{Realm,Biome}Ids`; `environmentHasLocationRules`/`evaluateLocationAvailability` in `src/systems/gatheringLocation.js`; engine listing + start guard via `_locationBlockedReasons`; realm-id save-boundary validation in `GatheringEnvironmentStore`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Out-of-Reach (Locked) Environment

It has exactly two engine causes: a **disabled** environment (`ENVIRONMENT_DISABLED`) and a **location-gated** environment the party is not in (out-of-realm or scene-gated: `NO_CURRENT_REALM` / `LOCATION_BLOCKED`); both are `attemptable: false`, identity-only, and task-redacted for all viewers.
This is the internal **"out of reach"** vocabulary (the player-facing toggle is labeled **"Hide unavailable"**), and the set is deliberately **narrower than the everyday sense of "unavailable"**: an in-realm, selectable environment whose individual tasks are merely blocked (stamina, tool, node, weather, time, duplicate-run) is **not** locked (`locked === false`) — it stays visible so the player can open it and read the blocked reasons.
Blind (masked) is orthogonal: a blind-but-reachable environment is `locked === false`; a blind-and-locked one is out of reach.
The player-side, client-persisted "hide unavailable" toggle hides exactly the `locked === true` listings and never the merely task-blocked ones.

Canonical mapping: `locked` on `_playerListingFields`/`_lockedEnvironmentListing` in `src/ui/presenters/GatheringListingBuilder.js`; `GATHERING_HIDE_UNAVAILABLE` client setting; `GatheringEnvironmentList.svelte`

Spec reference: openspec/specs/ui-gathering-app/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Realm Disclosure / Travel Guidance

A `GatheringRealmDisclosure` (`{ id, label/labelKey, discovered, secret, placeholder }`) NEVER leaks a secret undiscovered realm's id or name to a non-GM viewer (it returns `id: null` and an undiscovered placeholder key).
Travel guidance for a blocked environment resolves to one of `noCurrentRealm` (ask the GM to set the party's current realm), `excluded`, or `travel`, with known destinations disclosed safely and secret/undiscovered destinations summarized as a count.
The viewer-facing location summary returns raw `realmIds`/`staleRealmIds` only to GMs.

Canonical mapping: `buildRealmDisclosure`/`buildTravelGuidance`/`buildLocationSummaryForViewer` in `src/systems/gatheringLocation.js`; exposed via `game.fabricate.gathering.getLocationForActor`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-gathering-app/spec.md

## Discovered Gathering Realms

Logical shape `{ [systemId]: { [realmId]: { discoveredAt, source, partyId?, sceneUuid?, sceneRegionUuid? } } }`, where `source` is one of `manual` | `partyToken` | `import` | `api` (the `sceneUuid`/`sceneRegionUuid` entry members are Foundry-bridge fields and are kept verbatim).
Discovery follows the character across party changes.
**SHIPPED:** the flag helpers and GM reveal/hide mutators (writes validate the realm belongs to the referenced system); reads never throw on stale `partyId`, and reads accept the legacy `discoveredGatheringRegions` flag as a fallback while every write persists only `discoveredGatheringRealms`.
Player-facing discovery controls and `partyToken` auto-discovery are later-phase follow-ups.

Canonical mapping: `discoveredGatheringRealms`; `revealGatheringRealm`/`hideGatheringRealm`/`getDiscoveredRealmIdsForSystem` in `src/systems/gatheringRealmDiscovery.js`; `src/config/flags.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Full Authoring Import/Export

The **export schema** is a versioned envelope carrying an integer `schemaVersion` (currently `6`, distinct from the provenance-only `fabricateVersion`) plus a `runtimeStateIncluded` marker, and it bundles the `system` object, its recipes, this system's gathering environments, and the per-system `gatheringConfig` slice (rules, conditions, vocabularies, economy, reusable tasks/events, character modifiers).
The **authoring-versus-runtime boundary** exports authoring data (records a GM edits) and strips runtime/world state — per-environment `nodeRuntime`, the current-condition selection (top-level `conditions.{weather,timeOfDay}` and each per-system `conditions.<kind>.current`, resetting only `current` to defaults while preserving `enabled`/`values`), gathering parties, per-character stamina/blind discovery, gathering history, and active runs — keeping `runtimeStateIncluded: false` honest.
Import upcasts older payloads through an idempotent migration, is GM-gated (fail fast before any world-scope write), and classifies every cross-reference as **internal** (rebound within the payload — env→task/event id linkage, drop-row/tool `componentId`, recipe `recipeItemId`, essence `sourceComponentId`; a broken one is reported as a data-integrity warning) or **external** (world documents — component `originItemUuid`, environment `sceneUuid`, realm `sceneMappings[].sceneUuid`/`sceneRegionUuid`, drop-row `itemUuid`, macro UUIDs — preserved verbatim and reported when absent, never nulled).
Each classified cross-reference is an **unresolved-reference** entry (`{ kind, ownerType, ownerId, ownerName, referenceValue, disposition }`) whose **disposition** is `remapped` (external resolved to a new value), `retained` (external resolved unchanged), or `reported` (needs GM attention), surfaced in a post-import GM report grouped by kind.
Recipes carry durable **import provenance** (`Recipe.importSource`, re-stamped on every import with the source pack's identity — the payload's `system.id` in keep-mode, else the created system id — and absent/`null` on hand-authored recipes): under `overwriteExisting` a reinstall auto-prunes ONLY provenance-matched recipes the new payload dropped, and never auto-removes unprovenanced (GM-authored or pre-provenance legacy) or foreign-pack recipes — those are kept and reported.
Every orphan candidate is surfaced in the summary's `orphans[]` with a `disposition` (`pruned` for the auto-removed, `reported` for the kept) plus a `recipes.pruned` count; the prune folds into the single batched `recipes` write (a prune-only reinstall still writes once) followed by ONE bulk actor-flag cleanup pass, and copy-mode never enters the prune path (a fresh system id has no persisted recipes to overwrite).
A GM edit to an imported recipe RETAINS its provenance (an edit is still the pack's recipe), so it IS auto-pruned if the pack later drops it; the escape hatch is to author a fresh (unprovenanced) recipe.
Copy-mode rebinds record-container ids (system and environment; realm ids are NOT rebound since issue 1282, because realms are world scope and a copy that minted fresh ones would duplicate the world's geography rather than recognise it) but PRESERVES task/event/character-modifier ids so environment→library linkages survive.
Since schema `6` the envelope also carries the three **world-scope entity slices** (`componentScope`, `essenceScope`, `toolScope`), FILTERED BY MEMBERSHIP to the exported system, derived by the payload upcast from the bundle's own system through the same `1.30.0` migration the world side applies; the upcast DERIVES and never STRIPS, because the in-system arrays stay authoritative.
Copy mode no longer regenerates every component id: it BINDS an incoming component to the destination world entity its source references name and mints only when nothing matches, which is what stops a re-import creating a second world record for an item the destination already holds.

Canonical mapping: `buildExportPayload`/`assembleGatheringAuthoringBundle`/`assembleScopedEntityBundle` (`CraftingSystemExporter.js`, `authoringExport.js`); `migrateExportPayload.js`; `resolveImportReferences`/`rebindCopyComponentIds` (`importReferenceResolver.js`); `CompendiumImporter.importFromPackData`; `worldScopeImportMerge.js`; `buildImportReportContent` (`importReportContent.js`)

Spec reference: openspec/specs/import-export/spec.md, openspec/specs/data-models/spec.md

## Component Bulk Edit

Its **selection set** is the set of selected component ids, scoped to the selected crafting system, cleared by a crafting-system switch, and never holding an id that no longer resolves to a component.
Its **staged draft** is the not-yet-written change the GM is assembling: a single-valued category overwrite, per-tag add/remove/leave, a whole-map essence replacement, and a progressive DC.
A **staged axis** is one the draft will actually write; category and tags carry a natural empty sentinel so their staging is derivable, while essences and difficulty do not (an empty map and a zero are both meaningful values) and therefore carry an explicit staged flag — so "clear this on every selected component" is never mistaken for "leave it alone".
**Apply** writes every staged axis to every selected component through the set-apply write in ONE persist, re-normalizing each written component under the owning system exactly as a single-component write does, then clears the selection and the staged draft.
Salvage is never a bulk axis.
Its selection model, its selection toolbar and its panel chrome are SHARED primitives rather than Component Studio code (issue 1010): **Recipe Bulk Edit** renders the same toolbar, panel shell, section headings, staged single-valued select and Apply action, so the two operations differ only in the axes each stages.
Distinct from a single-component edit, which is authored in the component editor against that component's own draft.
**AND DISTINCT FROM THE WORLD COMPONENT CATALOGUE'S OWN BULK PANEL, which is a DIFFERENT OPERATION OVER DIFFERENT RECORDS and is deliberately not this term** (issue 1371).
This one stages IN-SYSTEM component fields inside ONE selected crafting system; that one stages a MEMBERSHIP DIRECTION (`Add to` / `Remove from`) against a chosen set of systems, a **World Defaults** category, world tags and — as of maintainer ruling M25, re-pointed by M31 at revision 18 — ESSENCE VALUES written into each selected component's WORLD `essences` section (`updateWorldDefaultSection`, merging per record over its world map), which every crafting system that inherits the section follows at once and an overriding one ignores, over **World Component** records, and offers an armed bulk DELETE of the world records themselves.
Both panels draw their groups on ONE shared staging inset with a row kind (M23–M25), so they share their anatomy as well as their chrome; what they still do not share is the write each row stages.
They share the bulk selection model and the panel chrome and nothing else: neither the axes, nor the records written, nor the scope the selection is cleared by.
The distinction is recorded rather than named, because a second `… Bulk Edit` noun over a different record set is precisely the kind of overload this glossary exists to catch, and the shipped screens supply no authored label for it.

Canonical mapping: `applyBulkEditToComponents` in `CraftingSystemManager`; `src/ui/model/componentBulkEditModel.js` over the shared `src/utils/bulkSelectionModel.js`; `bulkSelectedComponentIds` in `createComponentBrowserState()`; `BulkSelectionToolbar.svelte`/`ComponentBulkEditPanel.svelte` over the shared `BulkEditPanelShell.svelte`/`BulkEditSection.svelte`/`BulkEditSelect.svelte` chrome

Spec reference: openspec/specs/ui-entity-editors/spec.md, openspec/specs/ui-visual-style/spec.md, openspec/specs/data-models/spec.md

## Recipe Bulk Edit

The Recipe Studio sibling of **Component Bulk Edit**: it shares that operation's selection set, selection toolbar and panel chrome, and differs only in the axes it stages.
Its **staged draft** is a single-valued category overwrite, a status intention (leave unchanged / enable / disable), a lock intention (leave unchanged / lock / unlock), a **Recipe Check Tier**, and recipe-book membership.
The book axis is a SEARCH-AND-PICK control, not the tri-state run the Component Studio's tag axis uses: a trigger opens a searchable list of the system's AUTHORED recipe items, each stating its kind and how many of the selected recipes it holds; picking one opens a card offering Add and Remove, each labelled with the number of recipes it would actually affect and each unavailable when that number is zero; and each staged item joins a list stating its operation, its affected count and its own control to leave that item unchanged.
The divergence from the Component Studio is deliberate and confined to this axis — a chip per item stops being readable at the eight-plus recipe items a real system carries — and both panels render the same shared chrome.
Staging accumulates across items rather than being limited to the one on screen.
The check tier is the ONE axis carrying an explicit staged flag.
The other four each own a natural sentinel, while the tier axis's empty value is already spoken for as `Default DC`, so the PRESENCE of the key in the emitted edit is the only thing left that can separate "clear every selected recipe to the default DC" from "leave every selected recipe's tier alone".
**Apply** writes every staged axis to every selected recipe through the set-apply write, in at most ONE `recipes` write and at most ONE `craftingSystems` write.
Those are two different world settings, because recipe-book membership lives on the system while the recipe fields do not, so the pair is not a redundant save to collapse into one.
Every recipe field is written through `updateRecipe`, so normalization, persistence validation and the activation gate stay exactly where a single-recipe write leaves them.
A refused enable is a PARTIAL success: that recipe stays off while its other staged axes still land, and the post-apply report is the authority on how many were refused (see **Recipe Activation Gate**).
Applying then clears the selection and the staged draft.
Distinct from a single-recipe edit, which is authored in the recipe editor against that recipe's own draft, and from the Contents tab, which authors ONE book's membership.

Canonical mapping: `applyBulkEditToRecipes` in `CraftingSystemManager`; `src/ui/model/recipeBulkEditModel.js` over the shared `src/utils/bulkSelectionModel.js`; `bulkSelectedRecipeIds` in `createRecipeBrowserState()`; `adminStore.applyRecipeBulkEdit`; `BulkSelectionToolbar.svelte`/`RecipeBulkEditPanel.svelte` over the shared `BulkEditPanelShell.svelte`/`BulkEditSection.svelte`/`BulkEditSelect.svelte` chrome, with the book axis on the shared `SearchablePopover.svelte`

Spec reference: openspec/specs/ui-system-studio/spec.md

## Manager Navigation Surface / Provider Seam

On THIS seam a surface is always a Manager route: Core renders one today, `downtime`, and the registry holds at most one provider per surface without enumerating the ids it accepts.
The mount context's `surface` field is a THIRD sense and names the host WINDOW (`'manager'` / `'player'`), never the surface itself, which is `surfaceId`; the overload is kept deliberately, because the context ships at `schemaVersion: 1` and renaming the field would cost a breaking bump for a documentation problem.
A **provider** declares its own tabs — any ids, at least one, in its own order — and Core validates their shape, never their membership.
A tab may carry route chrome (`title`, `subtitle`, `breadcrumb`, `actionsLabel`) and header `actions`; Core falls back to its own string for any field a tab omits.
Core supplies the read-only four-tab **preview** (`tracking`, `activities`, `factions`, `settings`) as one implementation of that same interface — its ids are Core CONTENT, not the contract — and neither the preview nor the registry creates, reads, or writes downtime records, settings, flags, actor data, rewards, world-time state, party roles, assignments, mirrors, or references.
A provider mounts into the supplied target with a frozen context (`surface`, `surfaceId`, `route`, `tabId`, `craftingSystemId` or `null`, `isGM`, `revision`, `requestRemount`) and owns its own localization, authorization, domain data, persistence, and resources.
Core retains the Manager shell, GM gate, World rail, route/focus state, target, fallback, and teardown; a mount fault returns the whole surface — panel and rail alike — to the Core preview.
Core publishes observational `fabricate.manager.*` hooks for registration, route mount/unmount, and tab change; a listener changes nothing.
This seam neither extends nor uses the **Gathering Party** aggregate: `GatheringParty`, `fabricate.gatheringParties`, party CRUD/membership/travel-actor validation, and realm resolution remain the separate, sole Fabricate party boundary.
**Provider mode and core-fallback are this seam's two mutually exclusive presentation modes**, the arms of one `{#if}` with no shared path: core-fallback is Core's own read-only preview holding the surface — it keeps Core's `12px 20px 24px` inset, panel scroller, tab strip, and collapsible rail — and provider mode is a registered companion holding it, where Core renders no tab strip (a provider's tabs surface only as rail sub-items) and the panel is a **bare box**, full height with no padding, background, scroller, or containment of its own, the same contract the player seam below carries unconditionally.
In provider mode the Downtime rail group is **locked expanded**: mode-scoped (route AND provider mode together, never the route alone) and **display-only** — it derives what the rail displays and never writes the GM's stored `managerRailCollapsed` client preference, because a collapsed rail hides the submenu outright and with no tab strip that would leave zero reachable tab switchers.
That lock is also the accessible-name seam's own foundation: the panel region's `aria-labelledby` target is a rail sub-item label that exists only while the group is expanded.

Canonical mapping: `game.fabricate.api.managerExtensions.registerWorldNavProvider`; `src/ui/managerExtensions.js`; `WorldDowntimeExtensionHost.svelte`; `WORLD_DOWNTIME_PREVIEW_PROVIDER`; `CORE_DOWNTIME_PREVIEW_TAB_IDS`; `MANAGER_HOOKS`

Spec reference: openspec/specs/ui-extension-points/spec.md

## Player Navigation Surface / Provider Seam

It is general and keyed by surface id rather than a downtime feature; Downtime is its first consumer.
A **surface** here is a named group of player navigation tabs, and its id IS the registering provider's own `id` — Core has no player route of its own to name a surface independently, so `surfaceId` and `providerId` are always equal, in the mount context and in every hook payload (both are carried anyway, so the payload shape matches the Manager seam's).
The `surface` / `surfaceId` distinction is the one recorded in the row above.
A **provider** is `{ apiVersion: 1, id, tabs, mount }` and declares its own tabs — any ids, at least one, in its own order; Core validates tab SHAPE only (`id`, `label`, `icon`, optional `accessibleName` and `tooltip`), reads no other field, and recognises NO route chrome and NO header actions, because the player window has no route header, breadcrumb trail or header-action group.
Provider and tab ids match a bounded lowercase alphanumeric-and-hyphen charset, because the composed **route key** `ext:<surfaceId>:<tabId>` is rendered into an HTML `id`, an IDREF token list, a `data-` attribute value and a query parameter — charset validation, never id enumeration, and the key is what makes a collision with a Core tab id structurally impossible.
A provider mounts into the supplied target with a frozen context (`surface`, `surfaceId`, `tabId`, `actorId` or `null`, `isGM`, `revision`, `requestRemount`) carrying no Core store, document or component, and owns its own content, localization, authorization, domain data, persistence and resources.
Core retains the player window shell, nav rail, active-tab state, target and teardown, applies NO visibility or permission gate to a provider tab, and renders NO premium signal in that window in any state.
A mount fault is contained and LEGIBLE: the faulted surface's rail entries stay, the active tab does not move, Core renders its own diagnostic naming the provider, the registration survives, and focus returns to the rail button.
Containment is at the PROVIDER's granularity, keyed on the `(surfaceId, provider)` pair rather than on the tab that threw — so every other tab of that provider renders the diagnostic too.
A record clears on exactly TWO paths: a snapshot carrying a DIFFERENT provider object for the surface (which is why a companion recovering from a fault registers a fresh object rather than the one that threw), or a close-and-reopen of the window, which discards the shell the record lives on — the route the error state itself offers the user.
Re-registering the identical object is neither, and bringing an already-open window to the front is not a reopen.
Core publishes observational `fabricate.player.*` hooks for registration, surface mount/unmount and tab change; a listener changes nothing.
The seam creates, reads and writes no record, setting, flag, actor data or world state of its own.

Canonical mapping: `game.fabricate.api.playerExtensions.registerPlayerNavProvider`; `src/ui/playerExtensions.js`; `src/ui/extensionRegistry.js`; `src/ui/playerNavModel.js`; `PlayerExtensionHost.svelte`; `FabricateAppRoot.svelte`; `PLAYER_HOOKS`

Spec reference: openspec/specs/ui-extension-points/spec.md

## Rail Marker Family

Four marks share the family.
`.manager-nav-count` is the RECORD-COUNT vehicle: a bare mono tabular numeral with no fill or border, e.g. "Gathering 69".
`.manager-nav-issue-badge` is the ISSUE-SUMMARY vehicle: a filled warning pill that names its unit in its `aria-label`, e.g. "1 issue", and the one mark of the four that deliberately survives a collapsed rail, because it is a parent group's only remaining signal once its labels and children are hidden.
`.manager-nav-dirty-marker` is a 6px filled dot meaning unsaved changes, distinguished from the issue pill by SHAPE as well as colour (issue 1096).
The `PREMIUM` chip is a distinct gold-keyed identity mark drawn by `.manager-nav-premium`, a VEHICLE OF ITS OWN since issue 1515 — it used to ride the count vehicle's box to inherit the collapsed-rail hide, which now names each trailing marker itself, so a tier gate is no longer drawn through the record-count vehicle — prominent while Core's preview holds a surface and MUTED, not removed, while a provider holds it — except while a nonzero Downtime rollup shows, which takes that row's single trailing track for as long as it shows, the one carve-out the chip rule admits.
That vehicle is cited by SELECTOR here and never by a line into the sheet: the chip's own box sits among the rail chrome it neighbours while its tone sits with the other markers, so no single range holds it and any number would go stale the next time either moves.
The comment above `.manager-nav-count` in `styles/fabricate.css`, "A rail count badge is a BARE NUMERAL, not a badge (issue 643)", is a STYLING correction — the record-count vehicle must draw as bare text, never a filled chip — and NOT a vocabulary ban: its own opening clause reads "count badge", using badge as the umbrella the styling note narrows rather than rejects.
A companion's tab badge (issue 1302) renders through the ISSUE-SUMMARY vehicle, CORRECTED at issue 1515: this family's discriminator between vehicle one and vehicle two is that the second carries a count AND names its unit in its `aria-label`, which a companion's badge does, and the Downtime parent's rollup is the SUM of exactly those badges, so a sum and its addends cannot be different marks.
The `Soon` word on a disabled planned-view row is NOT a member of this family at all and no longer borrows one: it is neither a record count, nor an issue summary, nor an unsaved marker, nor a tier gate, so it draws through `.manager-nav-planned` and claims no membership.
The Downtime rail parent's rollup renders through that same vehicle, and for the reason every issue-summary mark is amber: **the mark is amber because it asks for attention, not because it reports a fault** — the rollup states how many tabs have something to say, not that anything is wrong.

Canonical mapping: `.manager-nav-count`; `.manager-nav-issue-badge`; `.manager-nav-dirty-marker`; `.manager-nav-premium` (the `PREMIUM` chip, its own vehicle since issue 1515); NOT a member: `.manager-nav-planned`; `src/ui/svelte/apps/manager/checks/checksNav.js`; `styles/fabricate.css`

Spec reference: openspec/specs/ui-manager-shell/spec.md

## World Component / World Essence / World Tool

Named for what it is, rather than the unsearchable generic "world record".
**PERSISTED, READ AND WRITTEN** as of `1.30.0` (issue 1358 modelled it; issue 1359 gave it a home; the epic 1357 world-scope migration of issue 1363 fills it): each roster is a real world setting — `fabricate.componentScope.entities` and its essence and tool siblings — registered, loaded on every client at boot, one half of a live **Valid Id Basis**, and now populated by the migration.
**COMPONENTS AND TOOLS group by resolved SOURCE ITEM** - one entity per item across every system, taking display identity from the OLDEST contributing system as a UNIT, UNIONING the three source-link fields across the group, and re-keying every other member to the elected id.
**ESSENCES DO NOT**: at `1.30.0` they group by trimmed `id`, that pass re-keys none of them, and its re-key map carries no essence leg.
**`1.34.0` (issue 1654) THEN MERGES THEM BY BEHAVIOUR**: world essences whose canonicalised `(name, macro, effectSource)` triples are equal become one, every reference the re-key invalidates in the SETTINGS CORPUS is rewritten, the old-to-new pairs ride in the pass's OWN `fabricate.worldEssenceMergeMap` rather than a leg on the `1.30.0` map, and every retired id is TOMBSTONED there so none is ever reissued.
Not literally EVERY reference: an ambiguous per-item `flags.fabricate.fabricate.essences` override key is deliberately left alone, and a world Item, a compendium Item and an unlinked synthetic token actor are never reached at all — which the tombstone does not repair but makes SAFE, since a key matching no live definition contributes nothing while a reissued id would contribute the WRONG essence.
So a world essence id is OPAQUE and may be RETIRED — never a stable semantic slug, which is the premise `1.30.0` was written on and which was false.
Two unlinked definitions of the same NAME are never merged FOR COMPONENTS AND TOOLS, which have a source item that COULD have proved identity and did not; an essence has no source item at all, so `1.34.0` does merge two same-name essences whose behaviour matches.
**The schema is now stated for anything the migration wrote**: a world component and a world tool carry `name`, `img`, `description` and the source link; a world essence carries `name`, `icon`, `colorToken` and `description` and no source link.
The IDENTITY FLOOR is unchanged and still tolerates a hand-edited roster: a non-object or id-less entry is dropped, ids are trimmed and de-duplicated first-wins, every other authored field is preserved VERBATIM.
A crafting system's own `components` / `essenceDefinitions` / `tools` nevertheless stay LIVE AND AUTHORITATIVE while `## CraftingSystem` requirement 36 holds — see **World Identity Snapshot** — and the roster being READ is not authority over them.
It is the first layer of `## Scoped Entity Definitions`; the second is its **World Defaults** and the third is a **System Membership Record**.
The three shipped world-scope lifts (`CurrencyConfig`, `TravelConfig`, `CharacterLibraries`) moved their SUBSTANCE wholly, because two systems cannot meaningfully disagree about a coin ladder; here they SHOULD disagree, so only identity moves.

Canonical mapping: `src/systems/scopedDefinitions.js`; `componentScope.js` / `essenceScope.js` / `toolScope.js`; `normalizeWorldEntities` / `createScopedDefinitionStore` (`src/systems/scopedDefinitionStore.js`); `src/systems/worldScopeStores.js`; `SETTING_KEYS.COMPONENT_SCOPE` / `ESSENCE_SCOPE` / `TOOL_SCOPE`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/overview/spec.md

## World Defaults

The migration ELECTS each default from the OLDEST contributing system — the same donor that wins identity — across SEVEN sections: component `category` and `essences` (the latter since `1.32.0`, issue 1371, and the one section whose membership switches are decided by EQUALITY with the elected map rather than written off, so a system already carrying the donor's values is created inheriting them), essence `effectSource` and `macro`, and tool `breakage`, `onBreak` and the seeded `repairRequirements`.
TWO are excluded for two DIFFERENT reasons: component `tags` because the merge is ADDITIVE with no inherit switch, so a world list is granted to every member system at once whoever the donor is; and the tool-breakage authority because its problem is unknowable PROVENANCE rather than an ambiguous donor.
FIVE constraints can decline an individual SECTION, and a declined section simply gets none and is reported.
FOUR are addressability rules — a `general` category, a non-world-addressable `effectSource` or `onBreak` target, and a `repairRequirements` recipe naming a component some group system is not a member of.
The FIRST, which the migration applies before all of them, is that EVERY LIVE MEMBER of the group must have AUTHORED the section, and it binds the THREE sections a membership record cannot express an EMPTY override for: component `category`, tool `breakage` and tool `onBreak`.
Without it a member that authored nothing carries an ABSENT section, which under an `inherit: false` switch resolves to the WORLD value — so the donor's category, breakage mode or on-break action would silently become that member's behaviour, and the "nothing resolves through any of it at migration time" claim below would be false.
`effectSource` and `macro` need no such precondition because they are NEW section names colliding with nothing on the in-system record, so `{}` and `null` are storable overrides and the membership builder writes both UNCONDITIONALLY; `breakage` and `onBreak` are spelled IDENTICALLY to the in-system `Tool` keys and the **Read Union** spreads resolved sections LAST, so an override of `{}` would erase a live in-system block instead.
Nothing resolves through any of it at migration time, because every membership record is created fully OVERRIDING; a world default matters only for a system added later or an override a GM clears later.
Editing one world value changes behaviour in every inheriting system at once, so a world-defaults editor states the **inherit count** before the change lands.
Every field is ABSENCE-PRESERVING — an unauthored component category in particular must never normalize to the reserved `general` bucket, because that would reset every inheriting system on the first resolve.
A world default carries NO `enabled` flag; disabling world-wide is N membership edits, never a fourth layer.

Canonical mapping: `normalizeWorldDefaults` / `countInheritingSystems` (`src/systems/scopedDefinitions.js`)

Spec reference: openspec/specs/data-models/spec.md

## World Vocabulary

**NOT a fourth layer of `## Scoped Entity Definitions`**: it holds VALUES the scoped entities and the in-system vocabularies draw FROM, never entities, sections or membership, which is why it is modelled here.
An entry is `{id, name}`; `id` is the TRIMMED, LOWERCASED name, derived rather than a `randomID()`, because there is no rename affordance at world scope and an entry's identity IS its name.
De-duplication is on `id`, FIRST-WINS — this DIVERGES from the system-scope rule, where `normalizeCustomComponentCategories` de-duplicates on the case-PRESERVING value so `Reagent` and `reagent` stay two distinct system categories (the root cause of issue 1397); the world rule is the one the shared icon maps and the reference counter already assume.
Issue 1397 is fixed at the DISPLAY layer: the three system row builders de-duplicate on that same normalized key, first spelling wins in stored order, the one row carries a pointer-only `title` naming every spelling, and deleting it removes them all and reassigns their records by one cascade; storage stays case-preserving, component tags never diverged because `normalizeTag` already lower-cases, and reconciling storage is issue 1411's.
Each category vocabulary's reserved `general` bucket is implicit per system, never persisted and refused on add through the two shipped guards; component tags have no reserved bucket.
**KEY ABSENCE IS PRESERVED PER KIND**, which departs from both `CharacterLibrariesStore` and `ScopedDefinitionStore` (both mark every sub-key seeded on any write): `isSeeded(kind)` answers from raw key presence on the persisted payload, `false` and never a throw for an unrecognised kind, so "never authored" and "authored and then emptied" stay distinguishable across a reload.
**Each entry's reference count is COUNTED, never derived from a name** — `buildVocabularyUsage`, the same counter the system-scope Tags & Categories screen uses, run over every crafting system's recipes and components world-wide.
The count is ASYMMETRIC per kind, deliberately: a world component default's `category` is EXCLUDED (a migrated world elects it from a system that already carries it, so counting both would double-count every migrated component), while a world default's `tags` are INCLUDED (the migration deliberately left them unauthored, so an authored world tag is a world-scope grant no membership record mirrors).
The COUNT and the one-click delete GATE are different numbers: an entry deletes in one click only when its reference count is 0 **and** its deletion rewrites nothing anywhere in the world — a conjunction strictly narrower than either alone, computed once by the projection as `silentlyDeletable` and read by every rendering of the affordance (the row's usage chip, the delete control's tone, the gate itself) so none can disagree.
**Deleting an entry CASCADES, gated and ordered**: it clears itself from every world component DEFAULT that carries it (a category is CLEARED, never reassigned to `general`; a tag is dropped from the default's `tags`), that defaults write is issued FIRST and AWAITED, and the vocabulary write itself is issued ONLY once the first succeeds — an abandoned first leg changes nothing, and a `mutedTags` entry naming the deleted tag is left in place, inert.
Nothing else cascades: a crafting system's own `componentCategories`, `categories` and `itemTags` arrays, and its own components and recipes, are untouched.
**AUTHORABLE BUT NOT YET CONSUMED**: until the consumer sweep repoints `componentCategoryOptions` and its siblings to read it, a world vocabulary entry is authored and offered by nothing — the screen states no icon control and no rename affordance for the same reason, because no consumer decides where either would live yet.

Canonical mapping: `src/systems/worldVocabulary.js` (`normalizeWorldVocabularyEntries`, `worldVocabularyEntryId`, `planWorldCategoryClear`, `planWorldTagStrip`); `src/systems/WorldVocabularyStore.js` (`createWorldVocabularyStore`); `createWorldVocabularyActions` (`src/ui/svelte/stores/worldScopeActions.js`); `projectWorldVocabulary` / `WORLD_VOCABULARY_KINDS` (`src/ui/svelte/stores/worldScopeProjection.js`); `SETTING_KEYS.WORLD_VOCABULARY`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-world-scope/spec.md

## System Membership Record

Its ABSENCE means the entity does not exist in that system — a REFUSAL at use, never a prune.
**That rule is LIVE as of issue 1359, and it is what forces TWO unions rather than one.**
A **Read Union** is MEMBERSHIP-FILTERED, so an entity with no record here is absent from that system's list; a **Valid Id Basis** is deliberately NOT, so a reference to that same entity survives normalization and is refused at use.
One function serving both would convert the refusal into a silent, persisted deletion on the first normalize.
The relation is **membership**, deliberately not "rules" (`gatheringConfig.systems[<id>].rules` is already **System Gathering Rules**, and the shipped `Rules & Resources` route owns "Rules" at world scope) and deliberately not "catalogue" (retired as a domain noun at issue 1117).
`Component Rules` / `Essence Rules` / `Tool Rules` / `Component catalogue` are SCREEN TITLES from the prototype and are not domain nouns.
`enabled` is opt-in per entity and STRUCTURALLY absent on a component.
**ADDING AND REMOVING ONE ARE COMPOSED VERBS AS OF ISSUE 1371, and each is TWO writes** — this record plus the crafting system's own in-system record — because the **Read Union**'s row set is the in-system array's, so a membership record written alone names an entity no reader can see and a membership record deleted alone leaves an in-system record the union pushes through unchanged.
Both are published UNDER the family's existing `addToSystem` / `removeFromSystem` keys rather than beside them, because every membership control in the product reaches the family through those two; a THIRD composed verb, `bulkEditRules(systemId, componentIds, edit)`, joined them at maintainer ruling M25 so the world catalogue's bulk panel can write essence values into a system's in-system records through the same published path.
The ADD path rolls back the record IT wrote when the in-system seed is refused for a duplicate source reference, and leaves a record the GM authored earlier alone.
The REMOVE path's in-system half is the SANCTIONED DELETE CASCADE for components — every recipe in that system naming the id is rewritten, the ones left without a usable ingredient set or result are disabled, and its essence, salvage and alchemy references are reconciled — so `Remove from this system` and `Delete this system's component` leave the same system behind and the world entity is the whole of the difference; a system manager that cannot run the cascade REFUSES the whole removal rather than writing half of it.
**THE REMOVE PATH'S COMPENSATION IS ITS ORDER, NOT A ROLLBACK** (revision 11): the in-system delete runs first and the membership record second, because a row gone with the record left is INERT (the union draws nothing, and the next add reuses the record) while a record gone with the row left is the ghost — and no rollback could be written, since the family publishes no verb that restores a membership record with its overrides intact and the two failure windows are indistinguishable from the store.
The verb answers whether anything CHANGED rather than whether it succeeded, so a failure that removed the row still republishes, and it reports rather than throws so a bulk run continues.
**That is not the same PRUNE this row refuses above**: absence-is-a-refusal governs NORMALIZATION, where a surviving reference must never be silently deleted, while the cascade is a GM's own armed write, where the rewrite is the point.

Canonical mapping: `normalizeMemberships` / `resolveScopedDefinition` (`src/systems/scopedDefinitions.js`); `unionScopedDefinitions` (`src/systems/scopedDefinitionStore.js`) versus `CraftingSystemManager._scopeEntityBasis`

Spec reference: openspec/specs/data-models/spec.md

## World Entity Index

It is the collaborator that makes **match-or-mint** possible (issue 1364, epic 1357): an incoming entity whose SOURCE-REFERENCE SET intersects an index entry's BINDS to that entry's id, and only an unmatched or UNLINKED one mints.
Named for what it is — an index of **World Component** / **World Essence** / **World Tool** records keyed for lookup — rather than "destination corpus", which would suggest a second corpus rather than a read of the shipped one.
It is INJECTED AND REQUIRED, never defaulted: a copy-mode call without one THROWS, because falling back to minting a fresh id for every entity is exactly the duplication this epic exists to end and a silent default would reintroduce it at the one call site nobody re-reads.
The set it matches on is the MIGRATION's six-spelling one — `originItemUuid`, `registeredItemUuid`, `sourceUuid`, `sourceItemUuid`, and `aliasItemUuids` OR, only in its absence, `fallbackItemIds` — computed over the IN-SYSTEM record and never over the derived world-entity slice, because the slice has already canonicalised the legacy spellings and matching there would silently narrow the rule.
An incoming set intersecting MORE THAN ONE index entry binds to the LARGEST intersection with a first-wins tie-break and REPORTS the ambiguity; it never merges the destination's entities and never mints.
The converse — TWO incoming records intersecting ONE index entry — is resolved by the **ID-claim ladder**, which makes the binding INJECTIVE: an index entry is claimed by at most one record per import, a record whose best candidate is taken falls to the next unclaimed one and mints only when none remains, and the contested id is reported against both owners.
Both routes into it are ordinary — two records sharing a `registeredItemUuid`, or two records sharing nothing with each other that both intersect an index entry the `1.30.0` union WIDENED — and without the ladder the second record silently disappears from the system, because a duplicate definition id is last-wins in every index builder.
It changes ONE id class: tools and essences keep their ids verbatim under copy mode and their collisions are reported rather than repaired.

Canonical mapping: `prepareForImport` (`src/systems/CraftingSystemExporter.js`); `rebindCopyComponentIds` (`src/systems/importReferenceResolver.js`); `sourceReferencesOf` / `toolSourceReferences` (`src/systems/worldScopeEntityGrouping.js`)

Spec reference: openspec/specs/import-export/spec.md, openspec/specs/data-models/spec.md

## Read Union

Replacing the record instead would drop `essences`, `salvage`, `difficulty` and `complications` from every component the union returns, because after `1.30.0` the two share an id by construction.
It exists because a migration runs on the ACTIVE GM alone, so every player and assistant GM spends at least one session reading a setting that has not been written, and before the migration the in-system array IS the corpus.
**It is BOUNDED by `## CraftingSystem` requirement 36 and is never a permanent read-alias** — the `1.22.0` and `1.23.0` relocations refused one, and the name says "union" rather than "fallback" because both halves contribute rather than one standing in for the other.
**Where the world half carries a membership model, the union is MEMBERSHIP-FILTERED and returns RESOLVED values** — which the three entity unions do and the character-library union, having no membership model, does not.
Unfiltered, an entity union would give every system every world entity and delete the **System Membership Record**; over raw world entities, it would hand back **World Defaults** in place of a system's own overrides and bypass **Section Inheritance**.
**It is the exact counterpart of a Valid Id Basis and must never be the same function** — that basis is deliberately NOT membership-filtered, because an absent membership record is a refusal and never a prune, so a world entity a system is not a member of is ABSENT from its read union and PRESENT in its basis.
Memoization keys on the two OBJECTS a union is derived from — the world corpus and the system's live array — and never on a system id, which would alias a deleted-and-recreated system, alias across manager instances, and alias two copy-imported systems that deliberately share ids; the world half needs no revision counter because the corpus is replaced wholesale, so a replicated write invalidates by identity.
The three entity unions have PRODUCTION CONSUMERS as of issue 1370: every non-UI reader enters through the **Scoped Entity Read Seam**, and the character-library union of issue 1308 is the other shipped instance.
**WHILE `## CraftingSystem` REQUIREMENT 36 HOLDS, WORLD-WINS IS INVERTED FOR THE THREE ENTITY UNIONS** - the union answers every KEY the in-system record carries, the in-system ROW ORDER, and the in-system ROW SET, and the world layer supplies only the keys that record does not carry; a lifted identity field the record does not carry is DELETED from the merged row, because absence is a value.
That inversion is BOUNDED and retires with requirement 36, not with the read repointing.

Canonical mapping: `unionScopedDefinitions` (`src/systems/scopedDefinitionStore.js`); `CraftingSystemManager.resolveScopedComponents` / `resolveScopedEssences` / `resolveScopedTools`; `getScopedDefinitionUnion` (`src/utils/definitionIndex.js`); `resolveModifierLibrary` / `resolveCharacterPrerequisiteLibrary` (`src/systems/characterLibraries.js`)

Spec reference: openspec/specs/data-models/spec.md

## Scoped Entity Read Seam

Three functions over the three corpora, plus the crafting-system manager's four read accessors for the readers that hold a manager rather than a system record; both spellings share ONE body, because several repointed readers are pure leaves that cannot take a manager without the import cycle `matchTypes.js` forbids.
It is **FOUNDRY-FREE**, reading the world corpus through a lazy, fully optional-chained global probe wrapped in `try`/`catch` - the same shape `effectiveToolBreakageAuthority` uses, and for the same reason: importing the settings module into a domain leaf drags the UI theme into its closure.
A store that throws degrades to "no world half" and never takes a craft down.
**AN UNKNOWN WORLD HALF ANSWERS THE IN-SYSTEM ARRAY ITSELF** - the same object, not a copy and not a rebuild - when the store is absent, unloaded, throwing, empty, or the record carries no id: `null` means UNKNOWN and UNKNOWN prunes nothing, a rebuild against a null corpus drops id-less rows and de-duplicates, and object identity is what keeps the definition index and the recipe manager's signature guard warm.
**READING IS NOT AUTHORITY AND IS NOT A SHED**: the arrays are unchanged, and `## CraftingSystem` requirement 36 still decides.
**THE GM MANAGER READS THROUGH A SECOND, NAMED DOOR RATHER THAN THROUGH THIS ONE** (issue 1371 r19–r20): its surfaces are not repointed at the seam, because the authoring accessor must go on answering the persisted record — a merged row offered for editing is a row no writer can save back — so every GM read of a component's ESSENCES overlays this seam's answer onto that one field through ONE shared accessor, and the row projection, the essence library's usage count and roster, the world catalogue's reference figure, the essence delete confirmation's impact and the override rule all consume it.
Two surfaces over one conceptual value reading different fields is the defect that states away, and it was found twice before it was.
Deliberately NOT repointed: `src/ui/**` outside `src/ui/presenters/`, every migration reader, the import and export paths, the manager's authoring surface and `getItems`, the pre-persist alchemy validator, the durable-identity restamp, and every destructive prune basis.

Canonical mapping: `resolvedComponentsFor` / `resolvedEssencesFor` / `resolvedToolsFor` (`src/systems/scopedEntityReads.js`); `CraftingSystemManager.getComponentsForSystem` / `getEssenceDefinitions` / `getEssenceDefinition` / `getToolsForSystem`

Spec reference: openspec/specs/data-models/spec.md

## World Identity Snapshot

**EACH EDITOR'S WRITTEN SET IS ITS OWN AND IS NARROWER THAN THE LIFTED SET**, so "has a writer" is never read as "every field is written": the ESSENCE entry authors `name`, `icon`, `colorToken` and `description`; the TOOL entry authors the display `name` alone, because the description a Tool has is its linked Item's; and the COMPONENT entry authors `name`, `img` and `description` for a record with NO source item ONLY — for a LINKED record those three are drawn READ-ONLY from the linked Item under maintainer ruling M7, so the field is buffered and no control on the screen can move it.
It is equal to the in-system copy at migration time BY CONSTRUCTION — the migration writes the merged identity back onto every in-system record — and it goes stale on the first identity edit on either side.
Dual-write is not available: the identity-writer set cannot be enumerated, since `save()` flushes every in-memory mutation including ones made in place by code paths that never called it.
So the mechanism is RE-DERIVATION AT READ TIME, inside the **Read Union**, on every read - never a one-shot boot pass, which cannot hold because the component metadata refresh bound to the item-update hook rewrites `name`, `img` and `description` in place at any point in a session.
A pure detector, EMPTY on the migration's own output, reports the divergence once per session to the ACTIVE GM as a DISCLOSURE; it repairs nothing, and it is blind to BEHAVIOUR drift by design.
**It is NOT the per-tool DISPLAY snapshot the Tool row describes** — that one is PER-SYSTEM, is copied from the tool's own source Item, and feeds a display precedence; this one is WORLD-SCOPE, is copied from the IN-SYSTEM RECORD, feeds no precedence, and is refreshed by nothing.
It is also not **dormant**, which names the retained local override of **Section Inheritance**.

Canonical mapping: `reportWorldIdentityDrift` (`src/systems/worldIdentityDrift.js`); `migrateWorldScopeEntities` (`src/migration/migrateWorldScopeEntities.js`)

Spec reference: openspec/specs/data-models/spec.md

## Equivalent World Essence Merge / Survivor / Retired Id / Tombstone / Merge Refusal / Declined / Orphaned / Merge Map

Two world essences are EQUIVALENT when their canonicalised `(name, macro, effectSource)` triples are equal — `name` trimmed and case-folded, `macro` trimmed with `''` reading as `null`, `effectSource` the three-field block in fixed key order with each value trimmed-or-`null` so `{}`, an absent block and an all-`null` block compare EQUAL.
The key compares the effect-source REFERENCE and never the resolved Item's Active Effects, which live on a document a startup migration cannot read; `enabled` is DELIBERATELY NOT in the key, because no world default carries it and every member keeps its own, so per-system resolved behaviour is unchanged BY CONSTRUCTION.
For the modal essence — no macro, no effect source — the key is therefore THE NAME AND NOTHING ELSE, which is the designed outcome and not a degenerate one.
The **SURVIVOR** is the one world essence a group keeps, ELECTED and RE-DERIVED rather than read off array order: the name-slug the catalogue would mint for the group's case-folded name ranks FIRST, then oldest stored corpus position, and `essenceScope.entities` array position is the FINAL tie-break only, for an essence with no surviving in-system member.
A **RETIRED** id is a loser's; its world entity row is DELETED with its `name`, `icon`, `colorToken` and `description`, while every in-system `essenceDefinitions` row KEEPS its own — so `reportWorldIdentityDrift` will newly report a presentation divergence, and that report is ACCURATE rather than an error.
A **TOMBSTONE** is the `retired` leg recording what each retired id carried; it is NEVER cleared, is published to the shell as the key set `worldScope.essence.retiredIds`, and is what `mintEssenceId` consults as its third argument — it is the reason a reference this pass knowingly left on a retired key can only ever contribute NOTHING and never the WRONG essence.
A **MERGE REFUSAL** drops a WHOLE equivalence group — no merge, no retirement, no map entry — on one of four named reasons (`unresolvedEffectSourceComponent`, `nonDisjointMap`, `outputIdCollision`, `membershipKeyCollision`), and IT IS A THIRD SENSE OF A BADLY OVERLOADED WORD: it is not the normalization rule that absence-is-a-refusal, and not `1.30.0`'s refusal of a `(system, entityType)` PAIR.
**DECLINED** is not refusal: it is a candidate whose live membership records do not all RESOLVE the same `(macro, effectSource)`, reported with the `sections` they disagreed on, and it is a disagreement only the GM can settle.
**ORPHANED** is a world essence with ZERO live membership records — tested explicitly, because unanimity over an empty member list is VACUOUSLY TRUE and would otherwise make it match every same-name essence in the world; it is never a candidate, is left exactly as it is, and reaches the console enumeration alone and no toast.
The **MERGE MAP** is `fabricate.worldEssenceMergeMap`, a setting OF ITS OWN rather than a leg on the `1.30.0` re-key map, with two NESTED and therefore namespace-disjoint legs — `systems` (the per-system old-to-new pairs, TRANSIENT, cleared once the migration has completed) and `retired` (the tombstone, PERMANENT).
A world essence id is consequently OPAQUE AND MAY BE RETIRED: no reader may treat it as a stable slug or derive anything from its spelling, which is the premise `1.30.0` was written on and which was false.

Canonical mapping: `buildWorldEssenceEquivalence` / `ESSENCE_MERGE_REFUSAL_REASONS` (`src/migration/worldEssenceEquivalence.js`); `mergeEquivalentWorldEssences` (`src/migration/mergeEquivalentWorldEssences.js`); `worldEssenceMergeLegs` / `mayClearWorldEssenceMergeMap` / `buildWorldEssenceMergeRemapNotice` (`src/systems/remapWorldScopeIdentityFlags.js`); `buildWorldEssenceMergeNotice` / `describeWorldEssenceMerge` (`src/systems/worldScopeEntityNotice.js`); `mintEssenceId` / `retiredEssenceIds` (`essenceScoped.js`, `worldScopeProjection.js`); `SETTING_KEYS.WORLD_ESSENCE_MERGE_MAP`

Spec reference: openspec/specs/destructive-changes-and-migrations/spec.md, openspec/specs/overview/spec.md, openspec/specs/data-models/spec.md

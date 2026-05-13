---
layout: default
title: Gathering Environments
nav_order: 8
---

# Gathering Environments

Gathering environments let a GM define places where actors can gather materials from a crafting system's component library. They are managed from the **Environments** tab in the Crafting Admin panel.

{: .gm }
> Only GMs can create and edit gathering environments.

## Enable Gathering

Gathering is opt-in per crafting system. Open the system in the Crafting Admin panel and enable the `gathering` feature. When this feature is enabled, the **Environments** tab appears for that system.

When at least one crafting system has gathering enabled, players also see a dedicated **Gathering** action in the Items Directory header. This action opens the player Gathering app; it is separate from the Crafting app route and does not reuse the crafting actor-selection store. Fabricate resyncs the header action when crafting systems change and when the Items Directory rerenders, so disabling gathering on every system removes the action.

## Environment Fields

Each environment belongs to one crafting system and stores:

| Field | Description |
|:------|:------------|
| **Name** | GM-facing environment name |
| **Description** | Optional notes shown by the authoring UI |
| **Enabled** | Disabled environments are ignored by normal player listing |
| **Selection Mode** | `targeted` for multiple visible tasks, or `blind` for exactly one opaque task |
| **Region** | Optional single region tag used to match Gathering Tasks and hazards |
| **Biomes** | Optional biome tags used to match Gathering Tasks and hazards |
| **Danger Tags** | Optional danger tags used to match reusable hazards |
| **Scene UUID** | Optional scene gate for environments tied to a specific scene |

Scene UUIDs are kept as authored text. If a saved scene reference no longer resolves, the Environments tab keeps the UUID visible and preserves it on save until the GM clears or replaces it. Players remain blocked by an unresolved scene gate until the reference is repaired.

Deleting an environment also cleans active and historical gathering runs that reference it.

The Scene UUID field has an assisted selector populated from the current world scene list plus a manual UUID input. Selecting a scene writes its UUID; typing directly remains supported for pasted or external references. If the saved UUID is no longer in the scene list, the editor shows the unresolved value as a preserved option until the GM changes it.

## Global Conditions And Tags

Gathering weather and time of day are global gathering conditions, not environment browse filters. GMs can set current weather and current time of day in the Manager V2 gathering library/settings panel or through the public API:

```js
game.fabricate.gathering.getConditions();
game.fabricate.gathering.setWeather("rain");
game.fabricate.gathering.setTimeOfDay("night");
game.fabricate.gathering.setConditions({ weather: "fog", timeOfDay: "dawn" });
```

Mutation methods require a GM user, validate values against the configured weather and time-of-day vocabularies, persist the gathering config setting, dispatch `fabricate.gathering.conditionsUpdated`, and refresh gathering listings. Player-facing code may call `getConditions()` but cannot mutate conditions.

When gathering is enabled and no custom values exist, Fabricate seeds default vocabularies for biomes, danger, weather, and time of day. Regions are intentionally empty by default because campaign geography is world-specific. Empty task or hazard match tags mean "matches any" for that dimension.

## Gathering Rules

Manager V2 stores d100 gathering rules per selected crafting system under `gatheringConfig.systems[systemId].rules`. These settings are edited from the Gathering Settings tab and are authoritative for every d100 gathering environment in that system once authored.

| Rule | Values |
|:-----|:-------|
| **Rewards** | `highestRankedDrop`, `allDrops`, or `limitedDrops` |
| **Reward limit** | Positive integer used when Rewards is `limitedDrops` |
| **Hazards** | `highestRankedDrop`, `allDrops`, or `limitedDrops` |
| **Hazard limit** | Positive integer used when Hazards is `limitedDrops` |
| **Hazard outcome** | `successWithHazard` or `failureWithHazard` |

Legacy per-task item selection, per-environment hazard selection, and per-environment hazard policy fields may still be read when an existing system has no `rules` object. Manager V2 no longer exposes those fields as authoring controls.

## Gathering Task And Hazard Libraries

Manager V2 exposes the selected crafting system's Gathering Tasks from the Gathering **Tasks** tab. The task browser supports search, status/region/biome/availability filters, pagination, row selection, enabled toggles, duplicate/delete actions, and a right-side inspector with availability, matching-environment count, and drop summaries. The row **Edit** action opens a one-page Gathering Task editor for identity, availability, drop rules, unresolved drop rows, and selected-drop modifier tuning.

Environment authoring still composes Gathering Tasks and reusable hazards by matching environment region, biome, danger, and the current global weather and time-of-day state. GMs can toggle matched task and hazard records on or off per environment. Reusable hazard authoring is not part of this slice.

Gathering Task records support:

| Field | Description |
|:------|:------------|
| **Name, description, image, enabled** | GM-authored task identity and availability |
| **Region, biomes, weather, time of day** | Optional match tags; empty means any |
| **Drop rows** | Ordered d100 item/component rows with quantity, `dropRate` from 0 to 100, and optional per-drop time/weather modifiers. Authored order is the rank used by system Gathering Rules. |
| **Stamina and modifiers** | Optional stamina cost and gathering roll modifier provider |

Reusable hazard records support:

| Field | Description |
|:------|:------------|
| **Name, description, image, enabled** | GM-authored hazard identity and availability |
| **Danger, region, biomes, weather, time of day** | Optional match tags; empty means any |
| **Drop rate** | d100 hazard trigger rate from 1 to 100 |
| **Modifier** | Optional hazard roll modifier provider |

Disabled Gathering Tasks and hazards never match for player gathering.

## D100 Resolution

Gathering Tasks use gathering-native d100 rows. Task-level weather and time-of-day availability gates decide whether the task can be attempted. For each enabled item row, Fabricate computes `finalDropRate = clamp(dropRate + matching drop-level time/weather modifiers, 0, 100)`, rolls `d100 + gatheringModifier`, and drops the row when the effective roll is at least `101 - finalDropRate`. Gathering modifiers affect the d100 roll, not the final drop chance. Matched enabled hazards roll independently with `d100 + hazardModifier` and their authored hazard drop-rate threshold.

Drop-level modifiers do not make an unavailable task available. They only adjust individual row chance after the task already matches. Multiple rows can reference the same component with different quantities and chances; each row rolls independently before the selected system's Gathering Rules choose awarded rows.

The selected crafting system's Gathering Rules choose reward and hazard rows after rolling. `highestRankedDrop` selects the first successful row by authored order, `allDrops` selects every successful row, and `limitedDrops` selects the first `N` successful rows by authored order. `successWithHazard` records selected hazards while the gathering still succeeds. `failureWithHazard` records selected hazards and makes the attempt fail, so no selected rewards are awarded. If no hazards are enabled or matched, the environment is mechanically safe even when danger tags are present.

## Task Authoring

An environment contains one or more Environment Tasks. The current GM editor supports selected Environment Task authoring for:

| Area | Supported fields |
|:-----|:-----------------|
| Task basics | `name`, `description`, `img`, `enabled`, `resolutionMode` |
| Visibility gate | Enable or clear task visibility; configure `macro`, `dnd5e`, or `pf2e` providers |
| Routed result selection | Configure `macroOutcome.macroUuid` or `rollTableOutcome.rollTableUuid` |
| Progressive checks | Configure `awardMode` plus `macro`, `dnd5e`, or `pf2e` check providers |
| Time requirement | Leave clear for immediate tasks, or enter a duration in minutes, hours, days, months, or years |
| Failure outcome | Leave clear for Fabricate's default failure feedback, or configure custom text or macro handling |
| Result groups | Add, rename, delete, and reorder groups |
| Results | Add, edit, delete, and reorder component results with `componentId` and `quantity` |
| Catalysts | Add and delete catalyst rows; edit `componentId`, `degradesOnUse`, `destroyWhenExhausted`, and `maxUses` |
| Tools | Add and delete tool rows; edit `componentId`, the optional tool requirement, the breakage mechanic (limited uses, % chance, or dice expression), and the on-break action (destroy, mark broken, or replace) |

Progressive task result difficulty comes from the selected managed component's `difficulty`; result rows do not store their own difficulty value.

New environments are created as disabled draft shells with one disabled placeholder task. The placeholder can be saved while disabled, even when routed or progressive provider targets are still blank. Once a task is enabled, save validation requires complete provider configuration for the chosen resolution mode.

Saved Script Macro UUIDs remain visible when the macro is no longer present in the current world macro list. The editor shows the unresolved UUID as the selected value, warns that it is missing, and preserves it until the GM changes the field.

Task images can be typed directly or selected with Foundry's image file picker when that picker is available. Cancelling or failing the picker leaves the current manual path unchanged.

## Visibility Gates

A visibility gate controls whether a gathering task is visible to a specific actor before an attempt starts. The GM editor supports the same provider families used by the runtime evaluator:

| Provider | Fields | Notes |
|:---------|:-------|:------|
| `macro` | `macroUuid` | Selects from available Foundry Script Macros. |
| `dnd5e` | `formula`, `threshold` | Stores a system formula and required threshold. |
| `pf2e` | `formula`, `threshold` | Stores a system formula and required threshold. |

The editor keeps incomplete provider input local until the provider's required fields are present. For example, choosing `dnd5e` without both `formula` and `threshold` does not mutate the stored task draft yet. Clearing visibility removes the stored gate only when the task already has committed visibility.

## Routed Result Selection

Routed gathering tasks use `resultSelection` to choose which result group is awarded.

| Provider | Fields | Notes |
|:---------|:-------|:------|
| `macroOutcome` | `macroUuid` | Selects from available Foundry Script Macros. The macro outcome routes by normalized match to a result group name. |
| `rollTableOutcome` | `rollTableUuid` | Stores a RollTable UUID entered as text. The drawn result name routes by normalized match to a result group name. |

Switching providers keeps only the fields for the selected provider, so stale macro UUIDs are not retained when switching to a roll table and stale roll table UUIDs are not retained when switching back to a macro.

The roll table field has both an assisted selector populated from the current world RollTable list and a manual UUID input. If a saved RollTable UUID no longer appears in the current list, the editor shows a missing-reference warning and preserves the value until the GM clears or replaces it.

## Progressive Checks

Progressive gathering tasks require a progressive award mode and a check provider.

| Field | Description |
|:------|:------------|
| `progressive.awardMode` | One of `equal`, `partial`, or `exceed` |
| `check.provider` | One of `macro`, `dnd5e`, or `pf2e` |
| `check.macroUuid` | Required for `macro` checks; selected from available Foundry Script Macros |
| `check.formula` | Required for `dnd5e` and `pf2e` checks |
| `check.threshold` | Optional for `dnd5e` and `pf2e` checks |

Switching check providers keeps only the fields for the selected provider. Formula and threshold values are not retained on macro checks, and macro UUIDs are not retained on system-formula checks.

## Time Requirements

Gathering tasks are immediate by default. To keep a task immediate, clear its `timeRequirement`.

To make a task take time, enter a positive duration across any of these fields:

| Field | Description |
|:------|:------------|
| `timeRequirement.minutes` | Minutes to wait |
| `timeRequirement.hours` | Hours to wait |
| `timeRequirement.days` | Days to wait |
| `timeRequirement.months` | Months to wait |
| `timeRequirement.years` | Years to wait |

Save validation rejects negative, non-numeric, or all-zero time requirements. Clearing the time requirement removes the stored object and makes the task immediate again.

## Failure Outcomes

If a task has no `failureOutcome`, Fabricate uses its default localized failure feedback message. GMs can configure a custom failure outcome when a task should explain failure differently or run table-specific automation.

| Mode | Fields | Notes |
|:-----|:-------|:------|
| `text` | `text` | Shows custom failure text. |
| `macro` | `macroUuid` | Runs the selected Foundry Script Macro for the failure outcome. |

Switching failure outcome modes keeps only the selected mode's fields. Text is not retained on macro outcomes, and macro UUIDs are not retained on text outcomes. Clearing the failure outcome removes the stored object and returns the task to the default localized failure message.

The player Gathering store does not add a second generic warning for terminal failed attempts. Failed attempts rely on the runtime/configured failure feedback above, including custom failure text or macro handling when configured.

## Player Gathering App

The player app opens from the Items Directory **Gathering** action and uses its own `lastGatheringActor` client preference. Actor selection starts from the remembered actor when it still resolves and is selectable, otherwise Fabricate clears the stale preference and falls back to the user's character or the first selectable actor. Selectability is based on GM access or owner permission; the store does not exclude actors by actor type.

The app lists gathering options through `game.fabricate.listGatheringForActor({ actor })` and starts attempts through `game.fabricate.startGatheringAttempt({ actor, environmentId, taskId })`. Those public runtime methods enforce the current Foundry user as the viewer before delegating to the internal gathering engine.

Visible environments and tasks remain listed even when they are blocked by attemptability gates. Scene-linked entries stay visible when the selected actor is not on the linked scene or has no active token there, and the app shows the localized blocked reason returned by the runtime. Active timed runs, last-attempt feedback, and recent terminal history remain visible for the selected actor even when browsing is empty or blocked.

Targeted task rows can show task labels, task descriptions, active-run timing, terminal status, result counts, catalyst counts, and check-derived history metadata returned by the runtime. For non-GM users, blind rows and missing-environment history remain redacted: the app uses a generic localized label and does not expose task IDs, result details, catalyst details, diagnostics, or check internals. GMs can inspect real blind task names through GM-facing surfaces.

Current player-app scope covers actor selection, visible/blocked listing, blind task labels, runtime-backed starts, last-attempt feedback, active timed runs, recent terminal history, blind redaction, and one-column active/history layout when the app container narrows. Runtime integration coverage includes scene-linked gathering through the production environment store, run manager, evaluator, and a scene adapter, plus hook-driven timed completion and a regression guard confirming harvesting has no standalone runtime/app/store/settings path.

## Catalyst Rows

Gathering catalysts use the same component identifiers and degradation fields as crafting catalysts:

| Field | Description |
|:------|:------------|
| `componentId` | Required component from the current crafting system's managed item list |
| `degradesOnUse` | Tracks usage on terminal gathering attempts when enabled |
| `destroyWhenExhausted` | Destroys the owned catalyst item when it reaches its usage limit |
| `maxUses` | Optional positive integer usage limit; blank means unlimited |

Save validation rejects catalyst rows without a `componentId`. `maxUses` is nullable and is validated as a positive integer only when `degradesOnUse` is enabled.

## Tools

Gathering tasks may declare one or more required tools, separate from catalysts. All listed tools must be present in the actor's inventory and pass their requirement before the attempt may start.

| Field | Description |
|:------|:------------|
| `componentId` | Required component from the current crafting system's managed item list |
| `requirement` | Optional Foundry expression (per provider) or macro UUID; must evaluate truthy for the actor to use the tool |
| `breakage.mode` | One of `limitedUses`, `breakageChance`, or `diceExpression` |
| `breakage.maxUses` | `limitedUses`: positive integer or blank (unlimited); tracked on the item via `flags.fabricate.toolUsage.timesUsed` |
| `breakage.breakageChance` | `breakageChance`: integer percent in `0..100` |
| `breakage.formula` + `breakage.threshold` | `diceExpression`: Foundry roll formula and numeric threshold (broken when result < threshold) |
| `onBreak.mode` | One of `destroy`, `flagBroken`, or `replaceWith` |
| `onBreak.replacementComponentId` | `replaceWith`: a different managed component spawned on the actor when the tool breaks |

The system-level Gathering Rules setting **Tool breakage outcome** controls what happens when any tool breaks: `failureOnBreak` (default) overrides the attempt to `failed` and clears drops; `successDespiteBreak` preserves the success state. Either way, the on-break action always commits.

See the [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}) how-to for a worked example.

## Save Validation

The Environments tab is save-blocking. When environment or task validation fails, Fabricate does not write the setting, does not discard the draft, and keeps the draft marked dirty so the GM can repair the same in-progress edits.

Validation errors are presented in two places:

- A validation summary at the top of the draft editor lists every save-blocking issue.
- Field-addressable errors are also shown inline beside the matching input or collection.

When a failed save produces a field-addressable error, the editor automatically jumps to and focuses the first invalid target. Summary entries with a target are clickable and jump back to the corresponding field.

Some validation errors point at collections rather than a single input. Result-group errors can target the result groups collection, a specific result group name, or a specific group's results collection. Result row component errors target the affected result row.

Disabled tasks skip routed and progressive completeness checks, which allows disabled placeholder tasks to be saved while a GM is still authoring them. Enabled runnable tasks must include real provider targets:

- Routed `macroOutcome` tasks require `macroUuid`.
- Routed `rollTableOutcome` tasks require `rollTableUuid`.
- Progressive tasks require `progressive.awardMode`, a check provider, and provider-specific check fields.
- Progressive `dnd5e` and `pf2e` checks require `formula`; `threshold` is optional.
- Progressive `macro` checks require `macroUuid`.

If a disabled or enabled task includes `failureOutcome`, that failure outcome is still validated.

## Unsaved Draft Confirmation

When a GM has unsaved environment draft changes, Fabricate asks for discard confirmation before actions that would replace, reload, or abandon that draft:

- leaving the **Environments** tab
- switching crafting systems
- selecting another environment
- creating a new environment draft
- duplicating a persisted environment into a replacement draft
- disabling the current crafting system's `gathering` feature
- closing or destroying the Crafting Admin app

Choosing **Keep Editing** cancels the requested action and leaves the current draft and dirty state intact. Choosing **Discard Changes** lets the requested action continue; navigation reloads the persisted draft or selected target, new-draft creation replaces the current draft, disabling gathering hides the Environments tab, and app close proceeds with store destruction.

Persisted environment deletion has a separate delete confirmation. It does not ask for the dirty-draft discard confirmation first. Unsaved new drafts have no persisted id to delete, so deleting one still uses the discard confirmation and then returns to the nearest persisted environment when accepted.

Concurrent callers share one in-flight discard confirmation. If multiple navigation or close paths ask while the dialog is already open, they await the same GM decision instead of opening duplicate dialogs.

## Maintainer Notes

The Environments tab currently delegates draft changes to the admin store and saves through the gathering environment store validation boundary. Store-owned callbacks preserve unrelated nested task configuration when editing task results, catalysts, visibility, routed result selection, progressive award mode, checks, time requirements, or failure outcomes. Failed save attempts leave `environmentDraftDirty` set and populate a validation state with summary text, field paths, selectors, and a first-invalid target for the component to focus. The tab does not perform Foundry lookups; managed component, Script Macro, scene, and RollTable options are prepared by the admin store/root and passed into the component, and Foundry FilePicker access stays at the application service edge.

The player Gathering app is a dedicated `SvelteGatheringApp` registered through the app factory, not a branch of `SvelteCraftingApp`. Its store receives Foundry/runtime access through injected services so listing, start, feedback, active-run, and history behavior can be tested without Foundry globals. The Items Directory button helper is idempotent and removes stale duplicate Gathering buttons while syncing the feature-gated action.

Responsive gathering layouts are keyed to Foundry app/container width rather than the browser viewport. The GM admin shell makes `.admin-main` the `fabricate-admin-main` inline-size container for stacked Environments panes, overflow-safe advanced controls, wrapped validation messages, and reachable sticky save actions. The player Gathering app makes `.fabricate-gathering-app` the `fabricate-gathering-app` inline-size container for one-column active/history rows, wrapped task labels, and aligned task icon tracks.

Delete confirmation content escapes GM-authored environment names before rendering dialog HTML.

Live Foundry screenshot/runtime validation remains conditional for future runtime-specific or screenshot-required work; the #179 closeout relies on automated unit/component/integration coverage for the current validation, accessibility, responsive, scene-linked, and hook-driven timed-completion behavior.

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
| **Selection Mode** | `targeted` for visible task rows, or `blind` for one generic opaque action resolved from one or more hidden tasks |
| **Region** | Optional single region tag used to match Gathering Tasks and hazards |
| **Biomes** | Optional biome tags used to match Gathering Tasks and hazards |
| **Danger Level** | Optional single danger ceiling used to match reusable hazards |
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
| **Blind candidate gate** | `attemptableOnly` (default) or `allMatching` — see Blind Mode |
| **Blind reveal** | `never` (default), `onSuccess`, or `onAttempt` — reveal default for blind tasks |
| **Reveal scope** | `actor`, `user`, `party`, or `global` — who learns a revealed task |

Legacy per-task item selection, per-environment hazard selection, and per-environment hazard policy fields may still be read when an existing system has no `rules` object. Manager V2 no longer exposes those fields as authoring controls.

## Blind Mode

A `blind` environment hides its tasks from players and presents a single generic gather action. On each attempt the runtime resolves one concrete task for the actor:

1. **Candidate pool** — start from the environment's visible, enabled tasks. The system **Blind candidate gate** then decides eligibility: `attemptableOnly` (default) drops tasks the character cannot currently attempt (missing tools/catalysts, depleted nodes, exhausted attempts, failed gates) so the generic gather never resolves to a task that would immediately fail; `allMatching` keeps every matching task. If the gated pool is empty, the player gets an opaque "nothing you can gather here" response.
2. **Selection** — a weighted random draw over the gated pool, using per-task **Weight** values set on the Tasks tab rows (default `1`; `0` excludes a task). There are no other strategies and no per-environment configuration — blind selection is always weighted random.
3. **Reveal** — after the attempt resolves, the task may be revealed to the player so it can be recognised later. The **Blind reveal** policy (`never`/`onSuccess`/`onAttempt`) and **Reveal scope** are set at the system level only — environments cannot override them. `never` keeps the task hidden; `onSuccess` reveals only after a successful gather; `onAttempt` reveals after success or failure.

The per-task **Weight** column only appears while the environment is in `blind` mode.

## Composition

Every environment has a **composition mode** (Overview → Composition mode card) that decides which reusable library tasks and hazards apply:

- **Automatic** — every matching, library-enabled record is available unless you explicitly exclude it. Stale `enabled*Ids` / `forced*Ids` lists left over from a previous manual pass are ignored, so automatic always means "all matching available unless excluded".
- **Manual** — only records you explicitly **include** apply. On both the Tasks and Hazards tabs, manual mode shows **Included in this environment** and **Available to add** only. Available to add lists matching records first, then non-matching and library-disabled records; matching rows use **Add**, non-matching enabled rows use **Force add**, and library-disabled rows show an "enable in library first" note. Removing an included manual record clears its include/force state and returns it to Available to add according to normal candidate, non-matching, or library-disabled state; it does not create a local Excluded state.

Automatic composition can be fully library-backed. An automatic environment does not need a legacy inline placeholder Environment Task when matching library Gathering Tasks provide the gatherable records.

In automatic mode, Excluded and Non-matching are separate sections. Non-matching is read-only — informational only — because automatic mode ignores the force list. Switching from manual to automatic does not silently make force-added non-matching records available, and automatic mode still honors records explicitly excluded through `disabledTaskIds` / `disabledHazardIds`.

**Weather and time-of-day are runtime gates, not matching criteria.** A task or hazard whose required `weather` / `timeOfDay` values are not currently satisfied still matches the environment (region/biome/danger) and stays in the **Included** section, but it carries a **Conditions blocked** pill and a hint listing the required values ("Available when: storm, dawn"). At runtime the gathering app shows the task as visible but not attemptable with a `Conditions blocked` reason, and a blocked hazard is skipped during the d100 hazard selection. Flipping the current gathering conditions to one of the required values flips the row back to Available.

## Gathering Tools Library

Manager V2 exposes a per-system **Tools** page under Gathering. Tools are reusable gathering tools that Gathering Tasks can require by `toolIds`. The page is a draft-and-save surface: edits are held in memory until the GM clicks **Save changes**, navigation away from a dirty draft prompts before discarding, and a concurrent-edit dialog appears if the live tool list changed while the GM was editing.

Each library tool record carries:

| Field | Description |
|:------|:------------|
| **Component** | Required managed component the tool refers to |
| **Display label** | Optional; falls back to the component name |
| **Tool requirement** | Optional Foundry expression evaluated against the actor's roll data; see [Breakable Gathering Tools]({% link how-to/breakable-gathering-tools.md %}) for examples |
| **Breakage mechanic** | One of `Limited uses` (counter on the item flag), `Breakage chance` (flat percent), or `Dice expression` (formula vs threshold) |
| **On-break action** | One of `Destroy item`, `Mark as broken`, or `Replace with item` (replacement component must differ from the primary) |

Tool authoring rejects entries with no component, with `replaceWith` and the same replacement as primary component, with out-of-range breakage chance, or with empty dice formulas. The Save button is disabled until every tool is valid; hovering it reveals the first failing reason.

Library tools persist under `gatheringConfig.systems[systemId].tools[]`. Legacy worlds without a `tools` array load as `[]`. Cross-system sharing is not supported. If a task references a missing or disabled library tool, the runtime blocks the attempt with `TOOL_BLOCKED` before actor inventory checks.

## Gathering Task And Hazard Libraries

Manager V2 exposes the selected crafting system's Gathering Tasks from the Gathering **Tasks** tab. The task browser supports search, status/region/biome/availability filters, pagination, row selection, enabled toggles, duplicate/delete actions, and a right-side inspector with availability, matching-environment count, and drop summaries. The row **Edit** action opens a one-page Gathering Task editor for identity, availability, drop rules, unresolved drop rows, and selected-drop modifier tuning.

Environment authoring composes Gathering Tasks and reusable hazards by matching environment region, biome, and danger only. Weather and time of day stay visible as current runtime condition context; they do not decide whether a task or hazard belongs to the environment. GMs can toggle matched task and hazard records on or off per environment. Reusable hazard authoring is not part of this slice.

Gathering Task records support:

| Field | Description |
|:------|:------------|
| **Name, description, image, enabled** | GM-authored task identity and availability |
| **Region, biomes** | Optional environment match tags; empty means any |
| **Weather, time of day** | Optional runtime availability gates; empty means any |
| **Drop rows** | Ordered d100 item/component rows with quantity, `dropRate` from 0 to 100, and optional per-drop time/weather modifiers. Authored order is the rank used by system Gathering Rules. |
| **Stamina and modifiers** | Optional stamina cost and gathering roll modifier provider |
| **Required tools** | Optional references to the selected system's Gathering Tools library. All referenced tools are required. |

Reusable hazard records support:

| Field | Description |
|:------|:------------|
| **Name, description, image, enabled** | GM-authored hazard identity and availability |
| **Danger, region, biomes** | Optional environment match tags; empty means any. Environment danger uses the single `dangerLevel` ceiling; legacy `dangerTags` / `risk` values are fallback inputs for older data. |
| **Weather, time of day** | Optional runtime availability gates; empty means any |
| **Drop rate** | d100 hazard trigger rate from 1 to 100 |
| **Modifier** | Optional hazard roll modifier provider |

Disabled Gathering Tasks and hazards never match for player gathering.

## D100 Resolution

Gathering Tasks use gathering-native d100 rows. Task-level weather and time-of-day availability gates decide whether the task can be attempted. For each enabled item row, Fabricate computes `finalDropRate = clamp(dropRate + environment adjustment + matching drop-level time/weather modifiers, 0, 100)`, rolls `d100 + gatheringModifier`, and drops the row when the effective roll is at least `101 - finalDropRate`. Gathering modifiers affect the d100 roll, not the final drop chance. Matched enabled hazards that pass runtime condition gates roll independently with `d100 + hazardModifier` and their environment-adjusted hazard drop-rate threshold.

Environment-local task and hazard drop-rate adjustments can be preserved while disabled by their apply toggles. Disabled adjustment toggles leave the saved values on the environment but compose them as zero at runtime.

Drop-level modifiers do not make an unavailable task available. They only adjust individual row chance after the task already matches. Multiple rows can reference the same component with different quantities and chances; each row rolls independently before the selected system's Gathering Rules choose awarded rows.

Saved, imported, or seeded drop rows must point at a real reward target. A `componentId` must exist in the selected crafting system's component library, and an `itemUuid` must resolve to a Foundry Item. Fabricate rejects stale component ids, unresolved item UUIDs, and rows with neither target before writing the gathering task.

The selected crafting system's Gathering Rules choose reward and hazard rows after rolling. `highestRankedDrop` selects the first successful row by authored order, `allDrops` selects every successful row, and `limitedDrops` selects the first `N` successful rows by authored order. `successWithHazard` records selected hazards while the gathering still succeeds. `failureWithHazard` records selected hazards and makes the attempt fail, so no selected rewards are awarded. If no hazards are enabled or matched, the environment is mechanically safe even when a danger level is present.

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

New environments are created as disabled draft shells. Library-backed automatic environments can be configured without an inline placeholder task; legacy inline task drafts may still use disabled placeholder tasks while a GM is authoring them. Disabled placeholders can be saved while disabled, even when routed or progressive provider targets are still blank. Once a task is enabled, save validation requires complete provider configuration for the chosen resolution mode.

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

The player gathering experience opens from the Items Directory **Gathering** action and is presented as the **Gathering** tab of the unified Fabricate window.

### Actor Selection Bar

A shared **actor-selection bar** sits above all of the window's tabs. Its left side is a character portrait with a caret that opens a searchable popover listing the actors you can gather as; type to filter the list by name, then pick a character to select it. The bar persists your choice in the `lastGatheringActor` client preference and reuses it the next time the window opens.

The bar lists your selectable **player characters** — the actors a system designates as player characters (the current dnd5e/pf2e implementation is the `character` actor type), owned actors for players and all of them for GMs. This is a selection-list restriction only: it does **not** change which actors are authorized to gather. An owned non-player-character actor (such as an `npc`) can still be listed and attempted through the API, but it does not appear in the bar. If your remembered character is missing from the list, the bar falls back to the first available player character and remembers that instead.

The bar's right side carries gathering context: on the **Gathering** tab it shows the current **weather** and **time of day** (each an icon and label) and the selected environment's **region**, or a neutral placeholder when no environment is selected. On other tabs the right side is empty.

The window lists gathering options through `game.fabricate.listGatheringForActor({ actor })` and starts attempts through `game.fabricate.startGatheringAttempt({ actor, environmentId, taskId })`. Those public runtime methods enforce the current Foundry user as the viewer before delegating to the internal gathering engine.

### Environments Column

The player app's left column lists environments as cards. **Available** environments (enabled, with at least one visible task) sort first and are selectable; **locked** environments sort after them and are shown only as non-interactive teasers. A locked card is a disabled environment surfaced to non-GM players: it carries the environment identity (name, image, biome chips) and a visible lock indicator, but no tasks, weights, or composition internals leak through it.

Blind environments show a mask **blind** chip. When the system's effective reveal policy is not `never`, a blind card also shows a `(discovered/total)` discovered count: the numerator is the distinct tasks the selected actor has revealed at the system's reveal scope, and the denominator is the full composed task pool the actor could discover. Locked and `never`-policy cards show no discovered count. Biome chips on a card resolve to the same labels, icons, and colours used in the GM Environments editor.

Visible environments and tasks remain listed even when they are blocked by attemptability gates. Scene-linked entries stay visible when the selected actor is not on the linked scene or has no active token there, and the app shows the localized blocked reason returned by the runtime. Active timed runs, last-attempt feedback, and recent terminal history remain visible for the selected actor even when browsing is empty or blocked.

Targeted task rows can show task labels, task descriptions, active-run timing, terminal status, result counts, catalyst counts, and check-derived history metadata returned by the runtime. For non-GM users, blind rows and missing-environment history remain redacted: the app uses a generic localized label and does not expose task IDs, result details, catalyst details, diagnostics, or check internals. GMs can inspect real blind task names through GM-facing surfaces.

### Detail Column

Selecting an environment fills the center **detail** column. It opens with an environment header — the name, a short description, and info pips for any present biome, region, and danger level — plus a mode hint describing how that environment is gathered.

How the rest of the column reads depends on the selection mode:

- **Targeted environments** show a list of task rows. Each row carries the task name, description, a **success-chance bar**, and an **Attempt** button. A task that is currently blocked stays visible but greyed, with its blocking reasons (such as required time of day, required weather, or missing tools) shown inline and its Attempt button disabled.
- **Blind environments** show a single **Attempt gathering** button that resolves one hidden task at random. When the system's reveal policy is not `never`, a **Discovered Tasks (x/y)** section lists the tasks this actor has already revealed as their own transparent rows — each with its own success-chance bar and Attempt button — where `x` is the discovered count and `y` is the full composed task pool. Before anything has been revealed the section reads as nothing discovered yet.

The success-chance bar reflects the listing's per-task `successChance` field: a static d100 drop-rate approximation (the chance at least one item drops), not a whole-attempt success probability, so it can read high while an attempt is still blocked or fails a skill check. Tasks that are not d100 (or have no enabled drop rows) carry no bar. The transparent blind rows come from the listing's `discoveredTasks` field; the opaque blind action never exposes per-task success chances.

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

Gathering tasks may declare one or more required tools by referencing the selected system's Gathering Tools library, separate from catalysts. All referenced tools must resolve to enabled library entries, and all resolved tools must be present in the actor's inventory and pass their requirement before the attempt may start.

| Field | Description |
|:------|:------------|
| `toolIds` | Required tool references stored on the task; each id points at `gatheringConfig.systems[systemId].tools[]` |
| `componentId` | Required component from the current crafting system's managed item list on the library tool |
| `requirement` | Optional Foundry expression (per provider) or macro UUID; must evaluate truthy for the actor to use the tool |
| `breakage.mode` | One of `limitedUses`, `breakageChance`, or `diceExpression` |
| `breakage.maxUses` | `limitedUses`: positive integer or blank (unlimited); tracked on the item via `flags.fabricate.toolUsage.timesUsed` |
| `breakage.breakageChance` | `breakageChance`: integer percent in `0..100` |
| `breakage.formula` + `breakage.threshold` | `diceExpression`: Foundry roll formula and numeric threshold (broken when result < threshold) |
| `onBreak.mode` | One of `destroy`, `flagBroken`, or `replaceWith` |
| `onBreak.replacementComponentId` | `replaceWith`: a different managed component spawned on the actor when the tool breaks |

The system-level Gathering Rules setting **Tool breakage outcome** controls what happens when any tool breaks: `failureOnBreak` (default) overrides the attempt to `failed` and clears drops; `successDespiteBreak` preserves the success state. Either way, the on-break action always commits.

Missing or disabled library references block with `TOOL_BLOCKED`, as do missing actor-owned tools, owned tools with `flags.fabricate.toolBroken === true`, and failed tool requirements.

A tool (like a catalyst or ingredient) is recognised whether the actor owns the tool component's source world item directly or owns a copy dragged or duplicated from it. Fabricate matches the owned item's live UUID, its compendium-source UUID, and its world-duplicate source UUID against the tool's component, so dropping a copy of the source item onto the actor still satisfies the requirement.

In the player app, a tool whose component is missing from inventory shows as **Missing**. A tool the actor holds but cannot use shows as **Broken** — this covers both an owned tool already flagged `flags.fabricate.toolBroken === true` and an owned `Replace with...` broken-variant component for that tool. The **Broken** state is display-only; the attempt stays blocked with `TOOL_BLOCKED` either way, and holding a working copy of the tool alongside a broken one still reads as available.

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

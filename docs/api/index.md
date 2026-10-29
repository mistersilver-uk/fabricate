---
layout: default
title: API Reference
nav_order: 17
has_children: true
---

# API Reference

Fabricate exposes its API through two Foundry globals:

- **`game.fabricate`**.
  The main Fabricate instance with service accessors and a quick `craft()` helper.
- **`globalThis.fabricate`** (alias: `fabricate`).
  Convenience functions for macros.
- **`game.fabricate.api`**.
  Constructor references for all public classes, plus public constants (`HOOKS` — the published hook names — and `companion`, the versioned [companion contract](#companion-contract)).
- **`game.fabricate.api.ui`**.
  The [published UI components](#published-ui-components) a companion renders into an element it owns.

All APIs except the two extension-registration seams are available after the `fabricate.ready` hook fires.
`api.ui` exists once Fabricate's own `init` listener has run (read it in `setup` or later, never in your own `init`), and its `mount` throws until the `fabricate.ready` hook has fired:

```javascript
Hooks.on('fabricate.ready', () => {
  const recipeManager = game.fabricate.getRecipeManager();
  // API is now safe to use
});
```

{: .warning }
> Do not call Fabricate APIs before the `fabricate.ready` hook.
> The module initialises during Foundry's `ready` hook, and services are not available until initialisation completes.
> A companion's extension registrations are the exceptions, and there are two of them.
> Register each during the companion's `init` callback, as described in [Manager Navigation Extension](#manager-navigation-extension) and [Player Navigation Extension](#player-navigation-extension).
> `api.ui` exists once Fabricate's own `init` listener has run, but its `mount` throws until `fabricate.ready` fires; a companion's own Foundry `ready` callback runs while Fabricate is still initialising, so mount from `fabricate.ready` or later.

---

## Quick Reference

### Services And Runtime Methods

```javascript
game.fabricate.getRecipeManager()          // Recipe CRUD and queries
game.fabricate.getCraftingEngine()          // Execute crafting
game.fabricate.getCraftingSystemManager()   // System and component CRUD
game.fabricate.getCraftingRunManager()      // Multi-step run management
game.fabricate.listCraftingForActor({ rememberedActorId, componentSourceActorIds, presentTools }) // Player-visible crafting listing (summary phase)
game.fabricate.hydrateCraftingRecipe({ recipeId, actorId, componentSourceActorIds, presentTools }) // Exact detail model for one recipe (detail phase)
game.fabricate.craftRecipe({ actorId, recipeId, ingredientSetId, componentSourceActorIds, interactive, presentTools }) // Craft the selected recipe
game.fabricate.salvageComponent({ actorId, systemId, componentId, interactive }) // Salvage one owned component
game.fabricate.salvageComponents({ actorId, targets, interactive, onProgress }) // Salvage many owned components in one run
game.fabricate.destroyComponents({ actorId, targets, onProgress }) // Permanently destroy many owned components in one run
game.fabricate.getGatheringEnvironmentStore() // Gathering environment persistence
game.fabricate.getGatheringRunManager()     // Gathering run persistence
game.fabricate.getGatheringGateAndCheckEvaluator() // Gathering gate/check evaluation
game.fabricate.getGatheringRichStateService() // Gathering rich-state internals
game.fabricate.listGatheringForActor({ actor, presentTools }) // Player-visible gathering listing
game.fabricate.startGatheringAttempt({ actor, environmentId, taskId, presentTools }) // Start gathering
game.fabricate.getGatheringDropBreakdown({ environmentId, taskId }) // Task drop preview data
game.fabricate.listAlchemyForActor({ actorId, craftingSystemId }) // Leak-safe player alchemy listing
game.fabricate.submitAlchemyAttempt({ actorId, craftingSystemId, submittedComponentIds, presentTools }) // Brew an alchemy attempt
game.fabricate.getSelectedAlchemySystemId() // Persisted last-selected alchemy system id
game.fabricate.setSelectedAlchemySystemId(id) // Persist the last-selected alchemy system id
game.fabricate.listSelectableActors()       // Player-character actors for the actor-selection bar
game.fabricate.listCuratedIcons()           // Fabricate's curated Font Awesome icon vocabulary
game.fabricate.findCuratedIcon(name)        // Resolve one icon name (or alias) against that vocabulary
game.fabricate.getSelectedGatheringActorId() // Persisted remembered gathering actor id
game.fabricate.setSelectedGatheringActorId(id) // Persist the remembered gathering actor id
game.fabricate.getHideUnavailableEnvironments() // Player "hide unavailable environments" toggle (per client/device)
game.fabricate.setHideUnavailableEnvironments(value) // Persist that toggle (per client/device)
game.fabricate.getGatheringConditions()     // Global current gathering weather/time and vocabularies
game.fabricate.setGatheringWeather(weatherTag) // GM-only gathering weather update
game.fabricate.setGatheringTimeOfDay(timeOfDayTag) // GM-only gathering time update
game.fabricate.setGatheringConditions({ weather, timeOfDay }) // GM-only global conditions update
game.fabricate.getGatheringPartyStore()      // Fabricate-managed gathering parties (world-level)
game.fabricate.getGatheringRealmStore()      // Per-system gathering realm CRUD and settings (was getGatheringRegionStore — deprecated alias kept)
game.fabricate.getGatheringLocationService() // Party current-realm resolution
game.fabricate.getGatheringLocationForActor({ actor, systemId }) // Redaction-safe current-realm summary
game.fabricate.setGatheringPartyRealmOverride({ partyId, systemId, realmIds }) // GM-only realm override (was setGatheringPartyRegionOverride)
game.fabricate.clearGatheringPartyRealmOverride({ partyId, systemId }) // GM-only override clear
game.fabricate.revealGatheringRealmForActor({ actor, systemId, realmId }) // GM-only discovery reveal
game.fabricate.hideGatheringRealmForActor({ actor, systemId, realmId }) // GM-only discovery hide
game.fabricate.getGatheringEconomy({ systemId }) // Gathering economy block
game.fabricate.setGatheringEconomy({ systemId, economy }) // GM-only economy update
game.fabricate.getRecipeVisibilityService() // Visibility and knowledge
game.fabricate.resetActorKnowledge({ actorId, systemId, freeLearnBudget }) // GM-only reset of one actor's learned recipes (one system, or all systems when systemId is null)
game.fabricate.grantRecipeKnowledge({ actorId, recipeId, grantedBy }) // GM-only recipe-knowledge grant, no owned book required (companion contract)
game.fabricate.checkAffordability({ actorId, unitId, amount }) // GM-only world-scoped affordability answer (companion contract)
game.fabricate.getCurrencyConfigStore()     // World currency configuration store (null before ready)
game.fabricate.getActorPropertyCoinSpender() // Coin spender for the actorProperty strategy (null before ready)
game.fabricate.getActorInventoryCoinSpender() // Coin spender for the actorInventory strategy (null before ready)
game.fabricate.getResolutionModeService()   // Mode validation and resolution
```

### Global Macro Helpers

```javascript
fabricate.createSimpleRecipe(name, ingredients, result)
fabricate.craft(actor, recipeId, options)
fabricate.listRecipes(filters)
fabricate.deleteRecipe(recipeId)
fabricate.getAvailableRecipes(actorOrActors)
fabricate.openRecipeManager()
fabricate.listCraftingSystems()
```

`fabricate.openRecipeManager()` returns a promise that resolves once the manager's code has loaded and the window has been asked to open.
It carries no GM gate itself, so calling it as a non-GM user still resolves the promise, but the manager shows the user a GM-only notification instead of opening.
If the browser is running a stale, cached copy of Fabricate and the manager's code cannot be loaded, it notifies the user with a message telling them to reload, and the returned promise still rejects with the original error so a macro's `await` sees the failure.

### Class Constructors

```javascript
const {
  Recipe, Ingredient, IngredientGroup,
  RecipeManager, CraftingEngine,
  getFabricateAppClass,
  loadCraftingSystemManagerAppClass, getCraftingSystemManagerAppClass,
  CraftingSystemManager,
  CraftingRunManager, SalvageRunManager,
  GatheringEnvironmentStore, GatheringRunManager,
  GatheringRealmStore, GatheringPartyStore,
  GatheringLocationService,
  GatheringGateAndCheckEvaluator, GatheringEngine,
  RecipeVisibilityService, ResolutionModeService,
  SignatureValidator,
  CompendiumImporter, CraftingSystemExporter
} = game.fabricate.api;
```

The GM crafting-system-manager app is loaded from a separate on-demand chunk so
non-GM players never download it.
Open it programmatically through the async accessor, which loads (and registers)
the class the first time it is called, then caches it:

```javascript
const AppClass = await game.fabricate.api.loadCraftingSystemManagerAppClass();
AppClass.show();
```

The synchronous `getCraftingSystemManagerAppClass()` still exists for
backward compatibility, but it now throws until the manager has been opened at
least once (i.e. until `loadCraftingSystemManagerAppClass()`, the header button,
or `fabricate.openRecipeManager()` has loaded the chunk).
Prefer the async accessor.

Called directly like this, `loadCraftingSystemManagerAppClass()` does not notify the user on a failed load.
It is a raw accessor, so a caller that awaits it is responsible for reporting the failure to its own user.
`fabricate.openRecipeManager()` is the wrapped equivalent that does notify.

### Crafting Runtime Facade

Use these public `game.fabricate` methods when macros or integrations need to browse or craft for the current user.
They back the player Crafting tab and inject the current Foundry user as the viewer before delegating to runtime internals.
Browsing and crafting are split into two phases (issue 1075) so the browse cost tracks the page rather than the whole recipe corpus.

```javascript
Hooks.once('fabricate.ready', async () => {
  const listing = game.fabricate.listCraftingForActor();
  const row = listing.summaries[0];
  if (!row) return;

  // Exact per-recipe model, fetched only for the row the player opened.
  const detail = game.fabricate.hydrateCraftingRecipe({ recipeId: row.id });
  if (!detail) return; // Gone, disabled, blocked, or no longer visible.

  const outcome = await game.fabricate.craftRecipe({ recipeId: row.id });
  console.log(outcome.success ? 'Crafted' : `Failed: ${outcome.message}`);
});
```

- `listCraftingForActor({ rememberedActorId, componentSourceActorIds, presentTools })` is the **summary phase**.
  It returns cheap, redaction-safe summary rows for every recipe the viewer may see, projected without running exact craftability against the whole corpus.
  `rememberedActorId` and `componentSourceActorIds` default to the persisted crafting selections when omitted.
  Each row's material verdict (its `browseStatus`) and the listing's own `counts.available` are **optimistic** — an upper bound read from an indexed availability snapshot, not exact evaluation.
  A recipe whose ingredient sets contend for the same held stacks can read available in the list and still refuse once hydrated or crafted.
  A row reporting unavailable is definitive; the optimism only ever runs in the makeable direction.
  A recipe whose required Tools are not held — or supplied by `presentTools`, the Active Canvas Tool's payload — never reads available.
- `hydrateCraftingRecipe({ recipeId, actorId, componentSourceActorIds, presentTools })` is the **detail phase**.
  It returns the exact rich model — per-set craftability, ingredient assignment, check resolution, outcome tiers, steps and progressive stages — for the one recipe the player has opened.
  `recipeId` arrives from a client and is not trusted: the recipe's visibility, its `enabled` flag, and its crafting system's blocked state are all re-evaluated from scratch rather than taken from the summary pass.
  The call returns `null`, never throws, when the recipe does not exist, is disabled, sits in a blocked crafting system, or the viewer may not see it.
  An id is not a permission.
  `presentTools` is optional and defaults to `null`.
  It has the shape `{ systemId, componentIds, toolIds }`, and the player app supplies it from the active canvas Tool station so the station's Tool counts as present for recipes in that station's crafting system only.
  Pass `null` or omit it when there is no station.
- `craftRecipe({ actorId, recipeId, ingredientSetId, ingredientEssenceAllocation, componentSourceActorIds, interactive, presentTools })` executes the attempt, delegating to the same pipeline documented in [CraftingEngine]({% link api/crafting-engine.md %}).
  `presentTools` is the same optional station payload described for `hydrateCraftingRecipe`, and a borrowed station Tool is never worn down or used up.
  It applies to this call only: the active GM checks it against each command the craft sends and never stores it on the run, so a later step needs the station again.
  Exact craft-time validation is always authoritative, independent of what either listing phase reported.

### Gathering Runtime Facade

Use the public `game.fabricate` methods when macros or integrations need to list or start gathering for the current user.
The raw gathering engine is not exposed as a service accessor.
These facade methods inject the current Foundry user as the viewer before delegating to runtime internals.

```javascript
Hooks.once('fabricate.ready', async () => {
  const actor = game.user.character;
  const listing = await game.fabricate.listGatheringForActor({ actor });

  const environment = listing.environments[0];
  const task = environment?.tasks?.[0];
  if (environment && task?.attemptable) {
    await game.fabricate.startGatheringAttempt({
      actor,
      environmentId: environment.id,
      taskId: task.id
    });
  }
});
```

`listGatheringForActor` returns the current browsing state plus `activeRuns` and recent `history` for the selected actor.
Those run lists are retained even when no environment/task rows are currently browseable because the actor is blocked, the environment list is empty, or visibility gates hide all tasks.
For non-GM blind or missing-environment rows, the runtime redacts task IDs, result details, tool details, diagnostics, and check internals.

When `rememberedActorId` is omitted from `listGatheringForActor` options, it defaults to the persisted last-gathering selection (`getSelectedGatheringActorId()`), so a fresh listing honors the remembered actor.
Passing an explicit `rememberedActorId` always overrides that default.
This includes an explicit `null`, which forces no remembered actor.

`listGatheringForActor` and `startGatheringAttempt` also accept `presentTools`, the optional station payload described for `hydrateCraftingRecipe`.
A Tool the station supplies counts as present for the attempt's start and, when the attempt is ready, for the execute the same call sends; a timed attempt needs the station again when it is resolved from the Journal.

### Alchemy Runtime Facade

Use these public `game.fabricate` methods when macros or integrations need to list or brew alchemy for the current user.
They back the player Alchemy Workbench and inject the current Foundry user as the viewer before delegating to runtime internals.

```javascript
Hooks.once('fabricate.ready', async () => {
  const actorId = game.user.character?.id;
  const craftingSystemId = game.fabricate.getSelectedAlchemySystemId(); // '' when unset

  // Leak-safe listing: learned recipes, owned components, and the COUNT of
  // undiscovered recipes only. Undiscovered names, signatures, and results are
  // never returned.
  const listing = game.fabricate.listAlchemyForActor({ actorId, craftingSystemId });

  // Brew a combination: one component id per placed unit (a stack of N appears N times).
  const submittedComponentIds = listing.recipes[0]?.concrete
    ? Object.entries(listing.recipes[0].concrete).flatMap(([id, qty]) => Array(qty).fill(id))
    : [];
  if (submittedComponentIds.length > 0) {
    await game.fabricate.submitAlchemyAttempt({
      actorId,
      craftingSystemId,
      submittedComponentIds,
      interactive: true
    });
  }
});
```

- `listAlchemyForActor({ actorId, craftingSystemId, componentSourceActorIds })` returns the leak-safe alchemy listing model for the resolved crafting actor, scoped to the chosen alchemy (crafting) system.
  It is owner-scoped through the same gate as crafting, so a non-owner viewer receives a denied, empty listing rather than another user's inventory or fizzle memory.
  A GM sees every enabled recipe as known.
  `actorId` and `componentSourceActorIds` default to the persisted crafting selections when omitted.
- `submitAlchemyAttempt({ actorId, craftingSystemId, submittedComponentIds, componentSourceActorIds, interactive, presentTools })` brews the submitted components as an attempt for the resolved actor.
  It is owner-scoped like `listAlchemyForActor` and delegates to the authoritative engine, which matches the submission against all enabled recipes in the system, known and undiscovered alike.
  On a match the recipe is discovered when Learn on Craft is on, and every submitted unit is spent when the brew starts, drawn only from the submitted items.
  A matched brew that can resolve now resolves in this call through `executePublicBrew`, as `craftRecipe` does through `executePublicCraft`; a time-gated brew starts and returns the run for later completion in the Journal.
  If the execute is cancelled or refused after the start, the reply still carries the started run's `runId`; its units are already spent, and the run can be finished or cancelled from the Journal.
  A match the submitted units cannot fund is refused with nothing consumed.
  The system's alchemy check mode decides the result: `none` always produces the success set, a `simple` check produces the success set on a pass and the reserved failure set on a fail, and a `tiered` check routes to the result set for the rolled outcome tier.
  A failed `simple` check still counts as a match, so it discovers the recipe, and its spent units are kept, or returned when Consume on Fail is off.
  It produces the failure set when one is authored with results and the failure-result policy permits; otherwise nothing is produced.
  The reply carries `disposition: 'failed'`, with `createdResultUuids` listing any awarded items.
  Otherwise the attempt fizzles with no check and no roll, consuming the components only when the system's Consume on Fail setting is on.
  `interactive` prompts a roll on a matched brew in `simple` or `tiered` check mode, and defaults to `false` for macros and automation, so it never triggers a roll on the fizzle path.
  `presentTools` is the optional station payload described for `hydrateCraftingRecipe`, so a matched recipe's Tool supplied by the station counts as present for the brew's start and its same-call execute, as for `craftRecipe`; a time-gated brew needs the station again when it is resolved from the Journal, because a crafting Journal command carries the station.
- `getSelectedAlchemySystemId()` reads the persisted last-selected alchemy system from the `fabricate.lastAlchemySystem` client setting, returning `''` when unset.
- `setSelectedAlchemySystemId(id)` persists the selection to that same client setting.

The `fabricate.lastAlchemySystem` setting is `scope: 'client'`, so the choice is remembered per client/device, not per user account.

### Salvage Runtime Facade

`salvageComponent({ actorId, systemId, componentId, interactive })` salvages one owned component.
It backs the player Inventory tab's Salvage panel and is the supported entry point for macros and integrations.

```javascript
Hooks.once('fabricate.ready', async () => {
  const actorId = game.user.character?.id;
  const systemId = game.fabricate.listCraftingSystems()[0]?.id;

  const outcome = await game.fabricate.salvageComponent({
    actorId,
    systemId,
    componentId: 'my-component-id'
  });

  if (outcome.cancelled) return;            // The player dismissed the roll prompt.
  if (!outcome.success) {
    console.log(`Salvage failed: ${outcome.message}`);
  } else if (outcome.results === null) {
    console.log(`Salvage started: ${outcome.message}`); // Time-gated run.
  } else {
    console.log(`Recovered: ${outcome.results.map((item) => item.name).join(', ')}`);
  }
});
```

**It takes an `actorId`, never an `actorUuid`.**
The facade resolves that id through the same ownership gate as `craftRecipe`, and that gate is the only ownership check on the salvage path.
`CraftingEngine.salvage` performs none of its own: it resolves the UUID it is handed and mutates that actor's items directly.
Passing a uuid straight to the engine therefore bypasses the gate, and a stale or foreign uuid throws at the server rather than returning a message.
`actorId` defaults to the persisted last-crafting selection, and an unresolved actor returns `{ success: false, results: null, message: 'No crafting actor selected' }`.

`interactive` prompts the player to roll (with Advantage / Normal / Disadvantage where the formula allows it, a situational-bonus field, and a roll-mode picker) and posts the roll to chat so Dice So Nice animates it.
It defaults to `false`, so macros and automation stay silent.
The player Inventory tab passes `true`.

The returned object has **four** shapes, and `cancelled` is distinct from a failure:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Outcome | Shape | Meaning |
|:--------|:------|:--------|
| Cancelled | `{ success: false, cancelled: true, results: null }` | The player dismissed the roll prompt. Nothing was consumed, no tool broke, and any run created by the call was discarded. Do not report this as an error. |
| Started | `{ success: true, results: null, message }` | The component has a time requirement, so a run started and awarded nothing yet. It settles as world time advances. |
| Awarded | `{ success: true, results: [...], salvageRun }` | The salvage resolved and created the result items. |
| Failed | `{ success: false, message }` | An ordinary failure: actor, system or component not found, salvage disabled, validation failed, or the mode requires a roll formula the GM has not authored. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The engine returns these rather than throwing, so ordinary failures need no `try`/`catch`.

Do not thread a result order into this call.
For a progressive salvage, the engine captures the player's standing order (`salvage:<systemId>:<componentId>` in `fabricate.progressiveResultOrder`) onto the run record when the run starts, and reads it back at award time.
A caller that wants a different order writes that setting first and lets the capture happen.

### Bulk Salvage & Destroy Runtime Facade

`salvageComponents({ actorId, targets, interactive, onProgress })` salvages many owned components in one gesture, and `destroyComponents({ actorId, targets, onProgress })` permanently destroys many owned components (whole stacks) in one gesture.
Both back the player Inventory tab's bulk panel and are the supported entry points for macros and integrations that need to act on several components at once.

```javascript
Hooks.once('fabricate.ready', async () => {
  const actorId = game.user.character?.id;
  const systemId = game.fabricate.listCraftingSystems()[0]?.id;
  const targets = [
    { systemId, componentId: 'iron-ore' },
    { systemId, componentId: 'oak-branch' }
  ];

  const outcome = await game.fabricate.salvageComponents({ actorId, targets });
  if (outcome.cancelled) {
    console.log('The batch roll prompt was dismissed; nothing ran.');
  } else {
    for (const item of outcome.items) {
      console.log(`${item.name}: ${item.outcome}`);
    }
  }
});
```

**Neither facade takes an actor UUID, at any nesting level.**
Each entry in `targets` may carry its own `actorId`, falling back to the call's own `actorId` when omitted, and either way that id is resolved through the same ownership gate `salvageComponent` uses.
A target whose actor cannot be resolved is never retargeted onto a different actor and never thrown as an exception.
It becomes a row in the returned `items[]` carrying `outcome: 'notPermitted'`, and every other target in the same call still runs.

`targets` is `Array<{ actorId?: string, systemId: string, componentId: string }>`, in the order the caller wants them run.
A single call accepts at most 25 targets.
A target beyond that limit is refused before anything runs, reported as `outcome: 'skipped'` with `skipReason: 'bulkLimit'`.

`interactive` defaults to `true` for `salvageComponents`, unlike `salvageComponent`'s default of `false`, because this facade exists for a player gesture rather than automation.
It opens at most ONE roll prompt for the whole batch, setting a single situational bonus, roll mode, and advantage choice that is applied to every roll in the run.
Every target still rolls its own check against its own crafting system.
If the player dismisses that prompt, the call returns `{ cancelled: true, items: [], counts: {...}, posted: false }` immediately.
Nothing was queued, consumed, or rolled.
`destroyComponents` opens no prompt at all.
The caller owns the confirmation, and this facade executes against the snapshot the confirmation named.

`onProgress`, when supplied, is called `(completed, total)` after each target resolves.
`total` counts only the targets the gate accepted, so a run containing a `notPermitted` row finishes below the caller's own `targets.length`.
A listener that throws is caught and logged, and it never breaks the run.

#### salvageComponents Outcomes

`salvageComponents` returns `{ cancelled, items, counts, posted }`.
Each row of `items` carries `{ actorId, actorName, systemId, componentId, name, img, outcome, skipReason, rollValue, tierStep, message, results, consumed, tools }`, in the caller's own target order.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Outcome | Meaning |
|:--------|:--------|
| `succeeded` | The check succeeded, or none was required. Usually this creates result items, but a `routed`/`progressive` success tier authored with no results succeeds and awards nothing, so read `results.length` rather than the outcome alone to know what arrived. |
| `failed` | The check failed outright: a rolled failure tier, or a total that matches no authored range. Not enough units and a required tool unavailable are the pre-check failure reasons. A success tier that awarded nothing is `succeeded`, never `failed`. |
| `waiting` | The component has a time requirement, so a run started and awarded nothing yet. |
| `misconfigured` | The mode requires a roll formula the GM has not authored. |
| `skipped` | Refused before the engine was called; see `skipReason` below. |
| `notPermitted` | The target named no actor this call could resolve. |
| `error` | The engine call threw; `message` carries the error text. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

A `skipped` row also carries a `skipReason`: `unknownSystem`, `featureDisabled` (the system's Salvage feature is off), `unknownComponent`, `salvageDisabled` (the component itself is not salvageable), `duplicate` (the same actor, system, and component appeared twice in `targets`), or `bulkLimit`.

`counts` tallies every outcome above, plus `total`.
`posted` is `true` only when at least one attempted (non-`skipped`) component's crafting system has its **Chat output** feature on, regardless of whether that component's own row succeeded.
When none does, no aggregate chat card is posted at all, never an empty one.
A subject that qualifies is folded into the ONE aggregated result card together with every other qualifying subject from the same run, never one card per component.

#### destroyComponents Outcomes

`destroyComponents` returns `{ items, unitsDeleted, documentsDeleted }`.
Each row of `items` carries `{ actorId, actorName, systemId, componentId, name, img, outcome, skipReason, requested, unitsDeleted, documentsDeleted, staleIds, items, vetoed }`.
`outcome` is `succeeded` (at least one unit was deleted), `failed` (units were found but none could be deleted), `skipped` (`skipReason` of `unknownSystem`, `unknownComponent`, or `depleted`), or `notPermitted` (the target named no resolvable actor).

Destroy removes the component's WHOLE stack on the target actor, with no quantity control.
It is deliberately not gated on the system's Salvage feature or the component's own salvage setup, since deleting an owned item is something a player could already do from the Foundry sheet.
It posts no chat card, because a result card reports what an activity produced, and destroying produces nothing.

### System-Owned Check Evidence

System-owned check results can also contain `data.preRolls`.
Each entry records a separately evaluated modifier as `{ source, label, expression, total, destination }` in evaluation order.
The main `total` and `diceGroups` continue to describe only the authored check roll.
Fabricate omits `data.preRolls` when no separately evaluated modifier completed, including cancelled, unrolled, and secret executions.
Under the active roll-total-over-target evaluation, a dice-bearing Tool bonus joins the formula as a number and adds no entry.
An entitled roll handoff carries serialized pre-rolls with its main serialized roll and reconstructs them for the recipient after GM execution, without rerolling.
If that handoff cannot reconstruct its rolls, it refuses the chat post without rolling back the executed check.
If Fabricate cannot serialize a dice-bearing Tool bonus's roll, the check does not run, rather than applying a bonus whose roll was lost.
A bundled post uses its chosen roll mode, or the posting client's current default when no mode was chosen.

### Actor Selection

These methods back the unified Fabricate window's actor-selection bar and persist the remembered gathering actor:

```javascript
Hooks.once('fabricate.ready', () => {
  // Player-safe display data for the actor-selection bar.
  const actors = game.fabricate.listSelectableActors();
  // -> [{ id, uuid, name, img }, …]

  const current = game.fabricate.getSelectedGatheringActorId(); // '' when unset
  game.fabricate.setSelectedGatheringActorId(actors[0]?.id ?? '');
});
```

- `listSelectableActors()` returns the current user's selectable **player characters** (the GM-configured actor types that count as player characters, always including `'character'`), owned actors for players, all for GMs.
  Each record is redaction-safe display data containing only `{ id, uuid, name, img }`.
  No other actor internals are exposed.
  This selection list is narrower than gathering attempt authorization.
  An owned non-player-character actor stays attempt-authorized through `listGatheringForActor` / `startGatheringAttempt` but does not appear in the bar.
- `getSelectedGatheringActorId()` reads the persisted remembered selection from the `fabricate.lastGatheringActor` client setting, returning `''` when unset.
- `setSelectedGatheringActorId(id)` persists the remembered selection to that same client setting.

### Hide Unavailable Environments Toggle

These methods back the player-side **Hide unavailable** toggle in the Gathering app's Environments column.
The toggle is a view-only presentation preference.
It hides only listings the engine reports as `locked === true` (disabled environments, plus location-gated environments the party is not in).
It never changes saved data, the engine listing, or GM configuration.

```javascript
Hooks.once('fabricate.ready', async () => {
  const hidden = game.fabricate.getHideUnavailableEnvironments(); // false by default
  await game.fabricate.setHideUnavailableEnvironments(true);
});
```

- `getHideUnavailableEnvironments()` reads the `fabricate.gatheringHideUnavailableEnvironments` client setting, returning `false` when unset.
- `setHideUnavailableEnvironments(value)` persists the boolean preference to that same setting.

The setting is `scope: 'client'`, so it persists in the browser's `localStorage`.
The choice is remembered per client/device, not per user account.
The same account opening Fabricate on a second device or browser starts from the default (off).

### Gathering Economy Block

`getGatheringEconomy({ systemId })` returns the normalized per-system limitation block, and `setGatheringEconomy({ systemId, economy })` (GM-only) persists it.
The block carries **two independent boolean flags**.
There is no single `mode` field:

```javascript
Hooks.once('fabricate.ready', async () => {
  const systemId = game.fabricate.listCraftingSystems()[0]?.id;

  // Normalized shape — stamina and resource-node limitations toggle independently.
  const economy = game.fabricate.getGatheringEconomy({ systemId });
  // -> {
  //      stamina: { enabled: false, max: '', start: '', regen: { policy, unit, amount, lastRoll } },
  //      nodes:   { enabled: false }
  //    }

  // Anti-dogpiling: turn BOTH limits on. One accepted attempt then both depletes
  // the node pool and spends stamina; neither flag on means no limit.
  await game.fabricate.setGatheringEconomy({
    systemId,
    economy: { stamina: { enabled: true }, nodes: { enabled: true } }
  });
});
```

The flags map onto the rich-state service accessors `staminaEnabled(systemId)` and `nodesEnabled(systemId)` (the single read used by enforcement, world-time regen/respawn drivers, and every UI surface).
The derived `economyMode(systemId)` accessor is retained for back-compat and now returns `'both' | 'stamina' | 'nodes' | 'none'` (the `'both'` value is new in `0.8.0`).
Worlds upgraded from before `0.8.0` have their legacy `economy.mode` enum migrated into these flags automatically (see [Gathering Limitations]({% link gathering/settings.md %}#gathering-limitations)).

### Realms, Parties, And Location

Location-aware gathering adds stores for world-level realms and parties, a current-realm resolver, and GM discovery controls.
A **Gathering Realm** is the Fabricate geography concept (renamed from *Gathering Region* to avoid the collision with Foundry's own Scene `RegionDocument`).
A realm maps many-to-one onto Foundry Scene Regions through its scene mappings.
Realms, their reveal mode and their modifier visibility are **world** data shared by every crafting system, and realm discovery is world-wide: a character who has found a place has found it, whichever system they were serving at the time.
What is per crafting system is participation — the `gatheringRealmSettings.enabled` flag (default off, the **Enable Travel & Realms** toggle in that system's Settings tab).
Every method below still takes a `systemId`, which acts purely as that gate: while the flag is off, `getGatheringLocationForActor`, the override setters, and the discovery reveal/hide methods are inert (return `null` / `false` / no-op).
Each method also has a shorter alias on the `game.fabricate.gathering` facade (`getPartyStore`, `getRealmStore`, `getLocationService`, `getLocationForActor`, `setPartyRealmOverride`, `clearPartyRealmOverride`, `revealRealmForActor`, `hideRealmForActor`).
The pre-rename `*Region*` method and alias names are retained as deprecated delegates that warn once and forward, so existing macros keep working:

```javascript
Hooks.once('fabricate.ready', async () => {
  const systemId = game.fabricate.listCraftingSystems()[0]?.id;

  const partyStore = game.fabricate.getGatheringPartyStore();  // party CRUD, members, travel actor
  const realmStore = game.fabricate.getGatheringRealmStore();  // world realm CRUD + settings
  const locations = game.fabricate.getGatheringLocationService(); // current-realm resolution

  // GM-only writes.
  await game.fabricate.setGatheringPartyRealmOverride({ partyId, systemId, realmIds: [realmId] });
  await game.fabricate.clearGatheringPartyRealmOverride({ partyId, systemId });
  await game.fabricate.revealGatheringRealmForActor({ actor, systemId, realmId });
  await game.fabricate.hideGatheringRealmForActor({ actor, systemId, realmId });

  // Player-callable, redaction-safe read: secret undiscovered realm ids/names
  // are never disclosed to non-GM callers.
  const summary = game.fabricate.getGatheringLocationForActor({ actor, systemId });
});
```

See [Gathering Realms & Travel]({% link world/travel/index.md %}) for the full feature guide, including the GM Travel route, environment location rules, and the disclosure policy.

### Icon Vocabulary

Fabricate curates ONE icon vocabulary and draws every icon field in the module from it — essence icons, category icons, and the biome icons players see on gathering environment cards.
`listCuratedIcons()` publishes that same vocabulary so a companion module can offer its GMs the icons Fabricate already offers, instead of hand-curating a second list that drifts from this one.
`findCuratedIcon(name)` resolves one name against it, which is what you want when a GM has already saved an icon and you need to know whether it is still offered.

```javascript
Hooks.once('fabricate.ready', () => {
  const icons = game.fabricate.listCuratedIcons();
  // -> [{ iconCode: 'abacus', label: 'Abacus', aliases: [] }, …]

  // `iconCode` is bare, so a render composes the weight itself.
  const [first] = icons;
  const className = `fas fa-${first.iconCode}`;

  // A GM's saved icon may use any of the glyph's names, so resolve rather than scan.
  const saved = game.fabricate.findCuratedIcon('cog');
  // -> { iconCode: 'gear', label: 'Gear', aliases: ['cog'] }
  const stillOffered = saved !== null;

  // Searching: the aliases are the other names a GM might type for the same picture.
  const matches = icons.filter(({ iconCode, label, aliases }) =>
    [iconCode, label, ...aliases].some((name) => name.toLowerCase().includes('cog'))
  );
});
```

- There is one row per GLYPH, not one per name, and one weight.
  Several names routinely share one drawing, so the vocabulary offers one of them and records the rest as `aliases`.
  Nothing is refused by that: every other name still resolves, through `findCuratedIcon` or through the `aliases` on the row.
- Both methods build their records fresh on every call, down to the `aliases` array, so you may keep, sort, filter or mutate what you are handed.
  Nothing you do to it reaches Fabricate's own pickers.
- The list is in the vocabulary's own order, which is alphabetical by `iconCode`.
- `findCuratedIcon(name)` answers `null` for a name the vocabulary does not offer — a typo, a name Foundry cannot draw, or a real icon the curation leaves out.
  It does not distinguish those cases, because a caller can do nothing different about them.
- Both methods throw `Fabricate not initialized` before Fabricate is ready, which is how this API refuses a premature call.
  Call them from `fabricate.ready`, or wrap them and degrade to an empty result, as a composition edge should.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Type | Meaning |
| --- | --- | --- |
| `iconCode` | `string` | The bare name the vocabulary offers and you should persist, such as `mortar-pestle`. No `fa-` prefix and no weight. |
| `label` | `string` | An English display name, not localized. On Foundry 14 it is Font Awesome's own display name, such as `Mortar Pestle`. On every other generation it is derived from `iconCode` by capitalizing each hyphen-separated word, with a word of two letters or fewer in capitals, and it is Font Awesome's display name again where the measurement came back empty. |
| `aliases` | `string[]` | Every other name the same glyph answers to, such as `['cog']` on `gear`. Often empty. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**Do not validate a saved icon by scanning `iconCode` alone.**
`icons.some(({ iconCode }) => iconCode === name)` looks right and is wrong: a GM who saved `fas fa-cog` chose a glyph this vocabulary offers as `gear`, so that scan reports a perfectly good icon as unknown.
Use `findCuratedIcon(name)`, which resolves aliases and answers from the catalogue rather than from a guess.

**What is not published, and why.**
The unfiltered catalogue stays internal, because no Fabricate picker renders it and publishing it would invite a companion to offer icons Fabricate's own screens will not.
It holds 1420 entries, narrowed from Foundry's 3768 classic glyphs to the names Font Awesome also publishes for free, against the curated set's 750.
Fabricate's internal exclusion predicate stays internal too: it answers whether a name matches an exclusion, not whether Foundry can draw it, so it reports a typo as unexcluded.
That is the mistake `findCuratedIcon` exists not to make.

**Generation awareness, provenance, and what still drifts.**
`listCuratedIcons()` and `findCuratedIcon()` answer with the same generation-aware vocabulary Fabricate's own icon pickers offer on this client, not a set pinned to whichever Foundry release the catalogue was last generated against.
On Foundry 14 that vocabulary is the committed catalogue described above, measured from the Font Awesome bundle Foundry 14.365.0 actually ships (Pro 7.2.0) rather than from Font Awesome's published metadata, so a name in this list is a name a Foundry 14 client can render.
On every other generation, including Foundry 13, Fabricate measures the running client's own loaded Font Awesome stylesheet instead, so a name it offers is a name that client can actually render, and it falls back to the Foundry 14 catalogue only when that measurement comes back empty, such as before the stylesheet has finished loading.
The Free-only filter applies either way, so a name a measured generation offers is still narrowed to Font Awesome's free release.
The committed catalogue itself is an artifact because CI has no Foundry install to read, and `scripts/generate-icon-catalogue.mjs` regenerates it from a given install, with `--check` reporting whether the bundle has moved without writing.
What that does not do is re-check itself.
Nothing runs the generator when Foundry bumps its bundled Font Awesome, so the committed snapshot ages: names added in a newer bundle are absent from the Foundry 14 vocabulary until someone regenerates it, and Font Awesome does retire and re-alias names between majors, which can turn an icon a GM chose into an alias of a different glyph.
If you render a name from this list and get a blank glyph, that is the check to make.

## Companion Contract

`game.fabricate.api.companion` is Fabricate's named, versioned contract for outbound **behavioural** consumption — the capabilities a companion module needs to settle a downtime activity against an actor, or against a whole party.
It is the behavioural sibling of the two navigation seams below, which are outbound **UI contribution** rather than consumption, and of the [published UI components](#published-ui-components) seam, by which a companion renders Fabricate's own primitives into an element it owns.

The enumerable `game.fabricate.api.COMPANION` alias remains available for compatibility, but reading it warns once per client page session and points here for migration.

```javascript
const contract = game.fabricate?.api?.companion;
if (!contract) return;                    // Fabricate has not loaded yet — retry, do not degrade.
if (contract.schemaVersion !== 1) return; // A version this companion does not understand.
```

The frozen descriptor retains the original `schemaVersion`, `members`, `outcomes` and `callSites` fields, with additive `features` for advertised capabilities.
It is assigned when Fabricate's own `init` listener runs, before any service exists.
`outcomes` and `callSites` are both published so you can read a **symbol** rather than write a bare string; `callSites` matters most, because `callSite` is the one required input with no default, and `invalidCallSite` is the whole of a typo's punishment.

{: .warning }
> **Read the version in `setup` or `ready`, never in your own `init`.**
> Foundry dispatches `init` listeners in module-script execution order, ordered by the `library` manifest flag and then world module-collection order; `relationships.requires` does not influence that order, and Fabricate declares no `library` flag.
> A companion sorting before Fabricate therefore reads `undefined` at its own `init`.
> Treat an absent `game.fabricate` as *Fabricate has not loaded yet* — never as *this Fabricate has no contract*, and never as a trigger for a degraded path.

### The Members

Every member is declared at exactly one promise tier, and nothing outside this set is contract however reachable it is.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Member | Promise | Read from | What it answers |
|:-------|:--------|:----------|:----------------|
| `schemaVersion` | `stable` | the `companion` descriptor | The contract version, as a number. Readable before any service exists. |
| `grantRecipeKnowledge` | `stable` | `game.fabricate` | `({ actorId, recipeId, grantedBy })` teaches one actor one recipe with no owned book required. GM-gated, idempotent, and it refuses where a learned entry would be invisible to the player. |
| `checkAffordability` | `stable` | `game.fabricate` | `({ actorId, unitId, amount })` answers whether an actor can afford a cost against the **world** coin ladder. GM-gated, ladder-aware, single-unit, and **this member** writes nothing — `creditCurrency` below is the one that does. |
| `getCurrencyConfigStore` | `handle` | `game.fabricate` | The world currency configuration store Fabricate itself uses, or `null` before readiness. Read it as `getCurrencyConfigStore()?.get?.() ?? null`, because `.get()` on the `null` throws. |
| `getActorPropertyCoinSpender` | `handle` | `game.fabricate` | The coin spender for the `actorProperty` strategy, or `null` before readiness. |
| `getActorInventoryCoinSpender` | `handle` | `game.fabricate` | The coin spender for the `actorInventory` strategy, or `null` before readiness. |
| `getCraftingEngine` | `handle` | `game.fabricate` | The live crafting engine, or `null` before readiness. |
| `getCraftingEngine().findComponentItems` | `handle` | the crafting engine | `(actor, component, system)` finds an actor's existing stacks of a component, so an award can **stack** rather than duplicate. See its carve-outs below. |
| `rollActorCheck` | `stable` | `game.fabricate` | `({ actorId, callSite, formula, dc, compare, label, interactive, rollDecision, evaluation })` rolls one **Standalone Check Roll** for one actor, graded against a `dc` or ungraded. It answers the total, dice groups, resolved formula and runner-produced evaluation metadata on a rolled outcome. GM-gated, call-site-gated, and a dismissed prompt is a refusal rather than a rolled failure. |
| `resolveBulkCheckDecision` | `stable` | `game.fabricate` | `({ callSite, formulas })` settles **one** roll decision — situational bonus, roll mode, Advantage — for N rolls the caller will make. It rolls nothing, takes no `actorId`, and answers which of the caller's formulas the decision covers. |
| `awardComponents` | `stable` | `game.fabricate` | `({ actorId, callSite, systemId, awards })` places components on an actor's sheet, stacking onto what they already hold rather than duplicating it. GM-gated, call-site-gated, **not idempotent**, and it answers one `placements` entry per requested award so partial success is legible. |
| `creditCurrency` | `stable` | `game.fabricate` | `({ actorId, callSite, unitId, amount })` credits one denomination of the **world** coin ladder to an actor. GM-gated, call-site-gated, **not idempotent**, whole amounts only, and `credited` is `null` wherever Fabricate cannot prove what landed. |
| `readPooledHoldings` | `stable` | `game.fabricate` | `({ actorUuids, costs })` answers what a **set** of characters holds between them — a component, a currency amount, a required tool — naming each cost by name and answering its pooled `available`, a derived `sufficient` and the ids that name resolved to. GM-gated, addressed by **actor UUID**, writes nothing, and it is exact at read time rather than a reservation. |
| `consumePooledHoldings` | `stable` | `game.fabricate` | `({ actorUuids, callSite, costs })` takes costs from that same pool and answers a **ledger** naming which documents on which actors paid. GM-gated, call-site-gated, **not idempotent**, all-or-nothing, and a failure part-way through restores every component exactly — same `_id`, same flags, same effects — before refusing. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### What Each Promise Tier Guarantees

A `stable` member guarantees its **name, its arguments, and its result shape**.
It never throws: it refuses in the same shape it succeeds in, carrying a stable `outcome` token beside a `message` that is **always a localization key**.
Where a lower layer produces free text — a broken coin ladder, a macro's own error — that text rides in `messageData.detail` so `message` stays localizable.

A `handle` member guarantees only the **accessor's name**, and that it answers the object Fabricate itself uses or `null` before readiness.
It guarantees **nothing about that object's method surface** beyond a declared carve-out.
`CraftingEngine` has hundreds of methods and no reviewer can promise them all, so the honest promise is the handle rather than the surface.

`getCraftingEngine().findComponentItems` is the one carve-out, and it is stated in full because a companion that guards only against a null actor still crashes.
It takes **documents, not ids**; its third argument is a crafting-system **object**, not an id; and it **throws on a null actor and on a null component**, with only the system argument tolerant.

### Calling A `stable` Member

Every `stable` behavioural member **that reads or acts on one specific actor** takes an **`actorId`**, never an actor uuid, and resolves it through Fabricate's own ownership gate.
`resolveBulkCheckDecision` is the one that does not: it reads no actor, rolls nothing and writes nothing, so it takes none — an ownership gate on an argument a member never reads would advertise a check that is not there.
The two **pooled holdings** members are the other exception, and they take an `actorUuids` **list** instead: they answer about a set rather than one actor, and the one of them that deletes needs an address an unlinked token cannot share with its prototype.
That reasoning is in *Reading And Taking Pooled Holdings* below, and it is a stated departure rather than an inconsistency.
Every `stable` behavioural member is **GM-gated**, and every one refuses rather than throws before the module is ready.
The gate order is **GM → actor → readiness**, in that order, because the readiness check throws and must run after the refusals that may not.
A member's own request validation — including the `callSite` and election gates the two check-roll members add — runs **after** the readiness refusal.
Two consequences follow, and they are stated here rather than left to be discovered: a GM holding a **stale `actorId`** answers `noActor` before any call-site check, and a pre-`ready` call answers `notReady` before `invalidCallSite`.
That ordering is deliberate: under it a stale id answers `noActor` on **every** client, where an election-first order would report the same defect two different ways depending on which screen the GM was looking at.
Uniformity beats the marginal precision.

```javascript
const result = await game.fabricate.grantRecipeKnowledge({
  actorId: actor.id,
  recipeId,
  grantedBy: 'Downtime: Research'   // optional; refused, never truncated, max 64 characters
});
if (!result.success) return ui.notifications.warn(game.i18n.format(result.message, result.messageData ?? {}));
const alreadyKnew = result.outcome === game.fabricate.api.companion.outcomes.alreadyKnown;
```

An already-known recipe answers `success: true` with the `alreadyKnown` outcome and performs **no write**, because an automation tick may legitimately re-run.
Branch on the **outcome** to tell *granted now* from *already knew*, never on the boolean.

`checkAffordability` answers `{ success, affordable, outcome, message }`.
`success: false` means the question could not be **answered** — an unknown unit, a non-positive amount, an empty or invalid ladder, an unreachable spender — and `affordable` is then `null` rather than a confident `false`.
A shortfall is `success: true` with `affordable: false`, which is what keeps *tell the player they are short* apart from *tell the GM their ladder is broken*.

### Rolling A Standalone Check Roll

`rollActorCheck` and `resolveBulkCheckDecision` publish Fabricate's check-roll **mechanics** to a companion that owns no crafting system.
The concept has a name, and the name has two axes that must not be collapsed.

**"Standalone" is a claim about the crafting-system axis**: the roll stands outside any `CraftingSystem`.
**It is not a claim about the game-system axis**, where Fabricate is agnostic on every path including this one — a Standalone Check Roll is exactly as game-system agnostic as every other Fabricate check.

So this is **not "a Fabricate check"**.
A Fabricate check is taken on a subject inside a crafting system and carries that system's modifier catalogue, combination rule, tool bonuses, authored triggers, tier stepping and failure-result policy.
A Standalone Check Roll is `@`-placeholder resolution against the actor's roll data, the retired-placeholder shim, the Advantage/Disadvantage rewrite, the situational-bonus input with its formula-validity net, the roll mode and the chat post, and the pass/fail or raw-total answer — **without the system-derived terms**, because there is no system and no subject to derive them from.
If you want a system's modifiers applied, route a real craft or salvage instead.

{: .warning }
> **This does not give a manual-fulfilment GM their physical-dice prompt back.**
> Fabricate's check path evaluates with `allowInteractive: false` **unconditionally**, and this member inherits that, so **Foundry's own `RollResolver` stays suppressed**.
> What the member opens is a *different* dialog: Fabricate's own roll prompt, which confirms the roll, offers Advantage and a situational bonus, and — crucially — **reports its own dismissal**, so you can abort with zero mutation.
> Foundry's dice resolver cannot do that: closing it fulfils the roll with a random face indistinguishable from a typed one.

```javascript
const { callSites, outcomes } = game.fabricate.api.companion;

const result = await game.fabricate.rollActorCheck({
  actorId: actor.id,
  callSite: callSites.gmAction, // or callSites.broadcast; REQUIRED, and there is no default
  formula: '1d20 + @prof',
  dc: 15,                       // omit for an ungraded roll that just answers the total
  compare: 'meet',              // 'meet' (default) or 'exceed'
  label: 'Downtime: Research',  // optional; defaults to a localized activity noun
  interactive: true             // default false — no dialog, no chat post
});
if (result.outcome === outcomes.cancelled) return;  // the GM dismissed the prompt: do nothing
if (!result.success) return ui.notifications.warn(game.i18n.format(result.message, result.messageData ?? {}));
if (result.passed) applyReward(result.total);
```

`total` is **always the raw roll total**, and it is `null` for every refusal — `engineUnavailable` and `noFormula` included.
A legitimate rolled `0` answers `0`, never `null`, so you can always tell a real zero from a refusal.
`passed` is `true`, `false`, or `null` for an ungraded roll, which is not graded and therefore has no pass.
`diceGroups` is a list, so its absence is `[]` rather than `null`.

`evaluation` is optional.
When it is absent or `undefined`, Fabricate uses the shared Check Evaluation defaults.
When supplied, it must be a plain data record with only recognized keys at every nested level.
`null` is a supplied value and refuses `evaluationInvalid`.
Unlike `dc`, `label` and `rollDecision`, it does not mean absent.
A nested key whose value is `undefined` counts as omitted, so its default applies.
Fabricate validates every supplied field before applying defaults, without coercing invalid types or replacing invalid values.

Read `game.fabricate.api.companion.features.checkEvaluation` before sending an evaluation.
This additive `features` field leaves `schemaVersion` at `1`.
Its shape is `{ version, modes, additionalDice }`: each `modes` row is `{ product, direction, targetSources, interactive }`, and an evaluation is executable when one row matches its `product` and `direction`, lists its `target.source` in `targetSources`, and has `interactive: true` when the roll is interactive.
`version` names this descriptor's shape, not its rows.
Activating a mode appends a row without changing it, so match rows rather than comparing versions.
At version 1 the descriptor publishes five rows: `{ product: 'sum', direction: 'over', targetSources: ['fixed'], interactive: true }`, `{ product: 'sum', direction: 'over', targetSources: ['attribute'], interactive: true }`, `{ product: 'sum', direction: 'under', targetSources: ['fixed', 'attribute'], interactive: true }`, `{ product: 'count', direction: 'over', targetSources: ['fixed', 'attribute'], interactive: true }`, and `{ product: 'count', direction: 'under', targetSources: ['fixed', 'attribute'], interactive: true }`.
`additionalDice` is `true`, so a count evaluation whose pool has additional dice enabled may buy them through this member too, as described below.
On the fixed sum-over row the evaluation only selects the mode, `target.expression` and the pool settings are validated but never change the roll, and Fabricate still grades `formula` against `dc` through `compare`, so a request without a finite `dc` rolls ungraded.
On an attribute row Fabricate ignores `dc` entirely and resolves the target from `target.expression` against the actor's roll data instead, using the same lookup Foundry's own `Roll.replaceFormulaData` uses, plus the row's `baseAdjustment`.
An unresolved or non-numeric target refuses the outcome `targetUnresolved` before any roll, and an invalid multiplier refuses `evaluationInvalid`.
A sum-under request against a fixed target with no finite `dc` also refuses `evaluationInvalid` rather than rolling ungraded.
On a count row Fabricate ignores both `formula` and `dc` and grades the rolled dice pool's net successes against `evaluation.pool.required` alone.
An unresolved or non-numeric `pool.base` or `pool.threshold` refuses the outcome `poolUnresolved` before any roll, and any other invalid pool setting (`die`, `explode`, `cancel`, or the settled pool itself) refuses `evaluationInvalid` before Fabricate constructs a Roll.
A pool that resolves to zero or fewer dice answers `checkFailed` with no Roll constructed at all.
An interactive count request opens Fabricate's roll prompt, which shows the dice pool and the successes needed rather than a formula or DC, and a situational bonus there adds dice or moves the threshold, as the pool's `modifierDestination` says.
A forwarded `rollDecision` applies its bonus the same way without opening the prompt.
Advantage and Disadvantage move the pool by the default rule's one die: an interactive count request that forwards `advantage: 'advantage'` adds a die, `'disadvantage'` removes one, and the pool floor and `zeroPoolFails` apply after that adjustment.
A count evaluation whose pool has additional dice enabled may buy them through a top-level `additionalDice` request key: a non-negative integer, honoured only on a **non-interactive** request and only from `callSite: 'gmAction'`.
A non-zero `additionalDice` on a `broadcast` request refuses `additionalDiceRefused` with reason `broadcastCallSite` before any read, and a `broadcast` interactive request shows the prompt's additional-dice control as unavailable for that same reason.
A non-zero `additionalDice` on an **interactive** request refuses `invalidRollDecision` instead: there the player buys through Fabricate's own roll prompt, or you forward a pre-resolved `rollDecision.additionalDice`, validated the same way and the only additional-dice key a forwarded decision carries.
A non-zero `additionalDice` on any evaluation other than an enabled count refuses `notOffered`.

A refused purchase, or a refused spend, answers the outcome `additionalDiceRefused`: a `success: false` refusal with no executed fields, answered before any main roll.
Its `messageData` is `{ label, reason, actor, resource, n, limit, available }`, with `reason` one of the closed `ADDITIONAL_DICE_REFUSALS` list, and `message` is already that reason's own sentence for the resource name you authored and the source you chose.
An executed answer additionally carries `boughtDice`, the integer dice bought for that roll, `0` when none were bought.
A main roll that still fails after a successful spend, for example once Foundry's own dice-explosion limit is hit, answers `evaluationInvalid` with `messageData.boughtDice`, because the spend already stands and nothing is refunded.

A malformed evaluation returns `evaluationInvalid`.
A valid evaluation whose mode is absent from the advertised rows returns `evaluationUnsupported`.
Both outcomes are stable refusals before Fabricate prompts or rolls.

Only `checkPassed`, `checkFailed` and `rolled` results carry executed evaluation metadata from the runner: `product`, `direction`, `comparison`, `target`, `margin`, `successes`, `cancelled` and `boughtDice` (`0` when none were bought).
Every refusal omits those fields, including evaluation refusals, with one exception: a post-spend `evaluationInvalid` still carries `boughtDice` alone, because that spend already happened and stands.
`additionalDiceRefused` is answered before any spend and carries no executed fields at all.

A graded answer against a resolved target, meaning an attribute row or any sum-under row, reports through `FABRICATE.Check.Roll.PassedTarget` or `FailedTarget` instead of the plain `Passed`/`Failed` keys, with `messageData` `{ label, total, target }` taken from the roll's own executed target, never from the request `dc`.
Only the fixed sum-over row keeps `Passed`/`Failed` with `{ label, total, dc }`.
A graded count row reports through `FABRICATE.Check.Roll.PassedCount`/`FailedCount` instead, with `messageData` `{ label, total, required }`, where `total` is the net successes the pool rolled.
A zero pool reports through `FailedCount`'s sibling `FailedZeroPool` with `messageData` `{ label }` alone, since neither a total nor a required count means anything with no dice rolled.
An attribute target Fabricate could not read as a number answers the outcome `targetUnresolved`.
Its message key is `FABRICATE.Check.Roll.TargetUnresolved`, whose English text is "{label} check could not read a number for its target from this character."
A count's `pool.base` or `pool.threshold` Fabricate could not read as a number answers the outcome `poolUnresolved`.
Its message key is `FABRICATE.Check.Roll.PoolUnresolved`, whose English text is "{label} check could not read a number for its dice pool from this character."

**`callSite` is required and has no default.**
Nothing in the request or the environment distinguishes your deliberate click from a synced `updateWorldTime` tick, so Fabricate refuses `invalidCallSite` rather than guessing.
Declare `broadcast` from any handler that fires on every connected client, and Fabricate refuses `notElected` on every client but the elected GM's.
Declaring `gmAction` from a synced hook **bypasses that gate entirely** and puts the single-executor obligation back on you.
The two accepted values are published as `game.fabricate.api.companion.callSites`, so read `callSites.broadcast` rather than retyping the literal: a mistyped string is refused as `invalidCallSite` and nothing else tells you it was a typo.

`resolveBulkCheckDecision` is for the case where you will roll for several characters at once and want to ask the GM **once**:

```javascript
const { callSites, outcomes } = game.fabricate.api.companion;

const decision = await game.fabricate.resolveBulkCheckDecision({
  callSite: callSites.gmAction,
  formulas: characters.map((character) => character.downtimeFormula)
});
if (decision.outcome === outcomes.cancelled) return;
for (const index of decision.covered) {
  await game.fabricate.rollActorCheck({
    actorId: characters[index].id,
    callSite: callSites.gmAction,
    formula: characters[index].downtimeFormula,
    dc: 15,
    interactive: true,
    rollDecision: decision.decision   // requires interactive: true, or it is REFUSED
  });
}
```

`covered` is the array of **indices into your own `formulas` array**, not the formulas themselves, because two characters may share a formula and you have to map the answer back onto your own subjects.
A formula the retirement shim empties — `@craftingmod`, or anything built on it that cannot be rewritten — is **not usable**: it never appears in `covered`, it never denies Advantage to the rest of the batch, and `rollActorCheck` refuses it as `noFormula` rather than silently passing a graded check with the DC ignored.
A batch in which nothing can roll answers `nothingToDecide` with `success: true` and opens no dialog.

A `rollDecision` supplied with `interactive: false` is **refused** as `invalidRollDecision`, not silently discarded: the evaluator only consults one on its interactive path, so your bonus, Advantage and roll mode would otherwise all vanish with no error while the base formula rolled.

There is no separate `rollMode` argument to `rollActorCheck`: the roll uses the client's own default unless the `rollDecision` you forward carries one, and `decision.decision.rollMode` (when present) overrides that default the same way `bonus` and `advantage` do.
Its accepted values are `publicroll`, `gmroll`, `blindroll`, and `selfroll`, and `resolveBulkCheckDecision`'s own picker never hands you anything outside that list, so forwarding its answer unmodified cannot produce an invalid one.

### Placing A Reward

`awardComponents` and `creditCurrency` are the two members that **write value** onto a character.
Everything in this section follows from that, and none of it applies to the members above.

```javascript
const { callSites, outcomes } = game.fabricate.api.companion;

const award = await game.fabricate.awardComponents({
  actorId: actor.id,
  callSite: callSites.gmAction,             // REQUIRED, exactly as on the check-roll members
  systemId,                                 // one crafting system per call, never per entry
  awards: [{ componentId, quantity: 3 }]    // at most 64 entries; the keys are exactly these two
});
for (const placement of award.placements) { // one entry per requested award, in YOUR order
  if (placement.outcome !== outcomes.awarded) log(placement.componentId, placement.message);
}

const credit = await game.fabricate.creditCurrency({
  actorId: actor.id,
  callSite: callSites.gmAction,
  unitId: 'gp',
  amount: 50                                // a positive whole number, or a string naming one
});
```

**Neither member is idempotent, and you own not double-awarding.**
Awarding 3 hides twice is legitimately 6 hides, and crediting 50 gp twice is legitimately 100 gp, so there is no state Fabricate can read that tells a duplicate award from a second intended one.
`grantRecipeKnowledge` is idempotent only because the learned map is its own key, and nothing equivalent exists here.
Fabricate will not add an award id it dedupes on: a per-actor ledger of caller-supplied ids is a persisted shape with unbounded growth and no restore semantics, and a partial guarantee is more dangerous than a published non-guarantee.
**Record your claim in front of the irreversible act rather than guarding inside it** — write "this activity has been settled" first, then award.

**Retry only the outcomes Fabricate declares to have mutated nothing.**
`success` is not the axis, and neither is a zero amount.

| Member | Safe to retry |
|:-------|:--------------|
| `awardComponents` | `gmOnly`, `noActor`, `notReady`, `invalidCallSite`, `notElected`, `invalidAwards`, `systemNotFound`, `awardFailed` |
| `creditCurrency` | `gmOnly`, `noActor`, `notReady`, `invalidCallSite`, `notElected`, `invalidAmount`, `ladderEmpty`, `ladderInvalid`, `unitNotFound`, `creditNotConfigured` |

Anything else may have moved value, and retrying it double-awards.
That includes `partiallyAwarded`, and it includes **`creditFailed`** — which is the trap, because the obvious "retry on `success: false`" policy then double-credits exactly when a GM's currency macro is broken and the GM cannot see it happening.
`awardFailed` is inside its set because that member runs no code Fabricate does not own, so every one of its failures is an observed non-write; `creditFailed` is outside it because under two of the three currency spend strategies the mechanism is a GM's macro or a game system's own adapter.

**Both members address WORLD actors, so an unlinked token cannot be awarded.**
An unlinked token's synthetic actor carries its **base actor's id**, so passing that id addresses the world prototype: you get `success: true`, and the items or coin land on a sheet the player never opens.
This is not a lookup Fabricate declines to make — every unlinked token created from one base actor shares that id, so an `actorId` could not tell two of them apart even in principle.
The remedies are: **link the token, or do not use these members for it.**
Foundry's own handle for a synthetic actor is `fromUuid("Scene.<id>.Token.<id>.Actor.<baseActorId>")`; Fabricate's actor-targeted members take an `actorId` by convention, and that convention is what this limit is.

**`awardComponents` answers per entry, and `awarded` is a total it computed itself.**
`placements` holds one `{ index, componentId, requested, placed, stacked, outcome, message }` per requested award, in your order and with `placements[i].index === i`, so you can map the answer back onto your own array without having kept it.
It is `[]` for a refusal taken before anything was attempted, and **fully populated** when everything was attempted and nothing landed — that pair is how you tell those two apart.
`awarded` is the sum of `placements[].placed`, it is `null` for a pre-attempt refusal, and it is `0` for `awardFailed`.
`stacked` tells "added 3 to an existing stack" from "created a new item", which is the fact `findComponentItems` was published to let you record.
A failing entry does not stop the entries after it: an award is a give, so the loop accumulates rather than aborting.

**A `multiUnitUnsupported` entry has two possible causes, and only one of them is a limit.**
Fabricate writes your quantity into the item payload and then reads back what it wrote, and when the stored value is not the requested one it refuses a multi-unit request rather than creating a single item and reporting N.
If the game system's item schema genuinely carries no quantity field, that is a real capability limit and single-unit awards are the honest workaround.
If instead the GM's configured stack-quantity path is **wrong**, **do not loop single awards**: that leaves N loose documents that will never stack, which is the duplicate-versus-stack failure these members exist to prevent.
Point the GM at Fabricate's own stack-quantity path advisory, which diagnoses exactly that misconfiguration.

**`credited` is three-valued, and `0` never means "the credit failed".**
It is the amount for `credited`; `0` for `creditNotConfigured` and for every refusal taken before any mechanism ran; and `null` for both `creditFailed` and `creditUnavailable`.
So `0` means *Fabricate can prove nothing moved* and `null` means *Fabricate cannot say*, exactly as `affordable: null` already works on `checkAffordability`, with `outcome` carrying the rest.
`awardComponents`' `awarded` is `null` rather than `0` for that same refusal class, and the two are consistent rather than in disagreement: `awarded` is a sum over `placements[]`, so an empty attempt record makes the sum vacuous rather than zero, while `credited` has no companion structure to be vacuous over.

{: .warning }
> **In a `macro` currency world, a credit runs the GM's `increment` macro.**
> That macro has until now run only on a player-cancelled craft, so a credit hands it `recipe: null` and `craftingSystem: null`, and an `increment` macro that reads `context.recipe.name` without checking throws on every credit.
> Tell the GM to branch on `context.caller`: the **pair** `(macro key, caller)` now separates **eight** occasions, not four — `canAfford` with `"craft"` is the craft-time gate, `canAfford` with `"award"` is `checkAffordability`, `decrement` with `"craft"` is the craft-time spend, `decrement` with `"consume"` is the pooled holdings debit (see *Reading And Taking Pooled Holdings* below), `balance` with `"consume"` is the pooled holdings read (below), `increment` with `"craft"` is the cancel refund, `increment` with `"consume"` is the pooled debit's own intra-call give-back (below), and `increment` with `"award"` is `creditCurrency`.
> **That last cell is not unique**: a pooled consume that has to unwind a currency cost it already settled gives it back THROUGH `creditCurrency`'s own mechanism, so a GM's `increment` macro sees `"award"` for that unwind exactly as it does for a credit a companion asked for outright, and it does not need to tell the two apart — both are Fabricate returning coin it is entitled to return.
> A world with no `increment` macro configured is a normal state rather than a broken one, and answers `creditNotConfigured` — the GM's to fix, and never reported as the spender declining.
> `balance` is optional in the same way; a `macro` world with neither `increment` nor `balance` authored keeps every craft-time behaviour unchanged and simply cannot refund a cancel or answer a pooled read.

### Reading And Taking Pooled Holdings

`readPooledHoldings` and `consumePooledHoldings` answer about a **set** of characters rather than one.
A downtime stage's requirements name a component, a required tool and an amount of coin, and the question a companion actually has is whether the **party** can cover them between them — then, if it can, to take them.
Every read Fabricate published before this pair was single-actor and single-axis, so a companion could only compose that answer by summing several of them, and a sum a caller composes is a sum Fabricate can promise nothing about.

**Both members address their actors by UUID, and that is a departure with a reason.**
Every other actor-targeted member takes an `actorId`, and that convention cannot address an unlinked token: the synthetic actor's `id` *is* its base actor's id, so a token-scoped id silently resolves to the world prototype.
For a member that **gives**, the consequence is that value lands on a sheet the player never opens — bad, but recoverable.
For a member that **deletes**, the same ambiguity would destroy items on the prototype every other token is derived from while the token that should have paid keeps its own.
So the pair takes `actorUuids`, and `fromUuid("Scene.<id>.Token.<id>.Actor.<baseActorId>")` addresses the token's own actor exactly.

**Names or ids go in on the read; only ids go in on the consume.**
The read takes human-written names on all three axes — `"Iron Ingot"`, `"gp"`, `"Smith's Tools"` — and answers the canonical `systemId`, `componentId` and `unitId` those names resolved to.
It takes those ids too, in the same `name` field: an exact id wins outright and anything else falls through to the folded name tier, on every axis.
So a companion that reads once, caches what came back and later refreshes it can hand the ids straight back rather than returning to the authored name it already replaced — and a rename between the two calls cannot redirect it.
The consume takes those resolved ids and refuses to guess from a name, because Fabricate's owned-item name matcher is case-sensitive and deprecated (issue 540) and no `stable` promise that authorises a **delete** is going to be built on top of it.

**A name Fabricate printed is a name Fabricate accepts.**
A coin resolves by its id, its abbreviation or its label.
An exact `id` match wins outright, so a caller that already holds Fabricate's internal unit ids behaves exactly as it did; otherwise every name folds into **one** case-insensitive tier in which abbreviation and label rank level.
Ranking them would settle a genuine collision by a coin flip that looks authoritative, and `currencyUnitDisplayName` renders whichever of the two is present — so a caller holding a string Fabricate printed cannot know which field it came from.

**`ambiguous` is reported and never resolved silently, on every axis.**
A component name that matches in two crafting systems, or a coin name that answers to two units, sets `ambiguous: true` on that reading and resolves to the first in order.
You are about to consume by the id the read handed back, so a quietly chosen system is a quietly chosen set of documents and a quietly chosen coin is a quietly chosen debit.

```javascript
const { callSites, outcomes } = game.fabricate.api.companion;
const actorUuids = party.map((character) => character.uuid);  // at most 32

const read = await game.fabricate.readPooledHoldings({
  actorUuids,
  costs: [                                   // at most 32; the keys are EXACTLY these three
    { type: 'component', name: 'Iron Ingot',    quantity: 4 },
    { type: 'currency',  name: 'gp',            quantity: 2 },
    { type: 'tool',      name: "Smith's Tools", quantity: 1 }
  ]
});
if (!read.success) return ui.notifications.warn(game.i18n.format(read.message, read.messageData ?? {}));
if (read.readings.some((reading) => reading.ambiguous)) return askTheGmWhichOneTheyMeant(read.readings);
if (read.readings.some((reading) => reading.sufficient !== true)) return reportShortfall(read.readings);

const take = await game.fabricate.consumePooledHoldings({
  actorUuids,
  callSite: callSites.gmAction,               // REQUIRED, exactly as on the award members
  costs: [                                    // resolved IDS, from the read above
    { type: 'component', systemId: read.readings[0].systemId,
      componentId: read.readings[0].componentId, quantity: 4 },
    { type: 'currency',  unitId: read.readings[1].unitId, amount: 2 }
  ]
});
if (take.outcome !== outcomes.consumed) return reportRefusal(take);
```

**The read's cost key set is closed to exactly `{ type, name, quantity }`.**
An entry carrying a fourth key — a `systemId` you already know, say — refuses the **whole call** as `invalidCosts` rather than that one cost.
A tool cost carries a `quantity` it cannot spend, because one uniform entry shape is what lets you build a stage's cost list without branching on the axis.

**The consume names its number `quantity` on a component cost and `amount` on a currency cost.**
That is the shipped spelling on each axis — `awardComponents` takes a `quantity` and `creditCurrency` takes an `amount` — and the pooled consume follows both rather than inventing a third.
The read has no such split because it asks the same question of all three axes.

**The read is exact at read time and is NOT a reservation.**
Nothing stops an item being sold, dropped or consumed between the two calls, and nothing here takes a lease.
A caller that must not overdraw calls the consume and reads **its** refusal, rather than treating a `sufficient` it read a moment ago as a promise.

**`null` means Fabricate cannot see, and `0` means it can prove there is none.**
A component nobody in the party is carrying reads a confident `available: 0`.
A currency cost in a world whose coin ladder is empty or invalid — or a `macro` world that has published no `balance` macro, or a party with one actor whose purse could not be read — reads `available: null` with the reading's own `balanceNotConfigured` outcome.
`sufficient` is `null` wherever `available` is, so *the pool is short* and *the pool could not be read* never collapse into the same confident `false`.
`balanceNotConfigured` is a **reading-level** outcome and blocks nothing: the other costs in the same request are still answered.

A **tool** reading is the one exception to all of that.
It answers a `state` of `present`, `damaged` or `missing` and no `available` at all, and its `sufficient` is `state === 'present'` and nothing else.
A `damaged` tool is physically there and still answers `false`, because Fabricate's own start-attempt tool gate refuses one and a gate built on the state token alone would admit it.

#### What The Consume Guarantees

**Components are taken first and coin last, and the order is not arbitrary.**
A deleted component has an exact inverse: Fabricate snapshots `item.toObject()` before the delete and re-creates with `{ keepId: true, keepEmbeddedIds: true }`, so the `_id` — and therefore the UUID — survives, active effects keep their own ids, and flags and system data return verbatim.
Currency is the leg whose inverse may be absent or lossy: under `macro` the `increment` macro is explicitly optional, under pf2e a give-back creates treasure Items, and under `actorProperty` it lands in the unit's own denomination rather than the base unit that was debited.
So the recoverable leg goes first, and **a currency cost is refused up front** — `creditNotConfigured`, having written nothing — in a world that has published no way to give coin back at all.

Three costs of that restore are accepted rather than hidden.
A restore fires `createItem` per document, because `noHook` gates only the pre-hook, so Fabricate's own fragment-discovery and recipe-learning hooks can chatter on an undo.
The restored document is also a **new JS object**, so a third-party module holding an `Item` reference across the take holds a stale one even though the UUID still resolves.
`_stats.modifiedTime` and `lastModifiedBy` are refreshed, but `createdTime` is **not** preserved: Foundry tags a creation's own `createdTime` with that write's own timestamp regardless of what the payload supplies, and a `keepId` restore is a creation, so the restored item reads as freshly created rather than carrying its original age.
And on an **unlinked token actor**, the restore promotes an inherited item to a delta-managed one: an unmodified item on the token was inherited from the base actor before the take, the delete writes a tombstone, and the `keepId` re-create lands as a managed record on the token's own delta instead.
The uuid, `_id`, effect ids, flags and system data are all identical, so nothing your integration can observe changes — but the item no longer tracks later edits to the base actor, and only core's own `EmbeddedCollectionDelta#restoreDocuments` re-links it, which is not a route this API exposes.

**A shortfall anywhere refuses everywhere.**
One cost the pool cannot cover refuses the whole call as `insufficient` before anything is written, with every ledger row reporting `attempted: false`.
A partly-paid downtime cost is worse than an unpaid one.

**The ledger is the machine-readable truth, and `Consume.Failed` does not promise more than it can keep.**
`ledger` holds one row per cost in **your** order with `ledger[i].index === i`, and each row's `takes` name which document on which actor paid how much.
`consumed` is summed from the rows, which are summed from their own takes, so no two published figures can disagree.
Read it as a four-way discrimination, because `success` alone cannot carry it:

**A take's `quantity` is not in the unit you asked in, and two fields on the take say so.**
A currency cost is settled per payer in the world's **terminal base unit**, because expressing each payer's slice in a higher denomination would over-charge the pool by up to `baseValue - 1` per payer.
So a row echoing `requested: 250` in gold sits beside takes counted in copper, and printing one next to the other prints nonsense.

- `take.unitId` names the unit `take.quantity` is counted in — `null` on a **component** take, which is a count of things and has no unit.
- `take.share` is that same figure decomposed down your world's own ladder into whole coins: `15003` base units reads `[{unitId: 'gp', unitLabel: 'gp', amount: 150}, {unitId: 'cp', unitLabel: 'cp', amount: 3}]`. `[]` on a component take.

Both arms answer both fields, so you can draw a take without first asking what kind of cost produced it.
Use `share` for anything a person reads and `quantity` for anything you do arithmetic on; they are the same number, and the decomposition sums back to it exactly.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| What the answer says | What actually happened |
|:---------------------|:-----------------------|
| `consumed === null`, `ledger` is `[]` | The request itself was refused before any cost was priced. Nothing was written. |
| `consumed === 0` and every row `attempted: false` | The pool was priced and the call refused. Nothing was written. |
| `consumed === 0` and some row `attempted: true` | Writes were issued and every one of them was given back. |
| `consumed > 0` beside `consumeFailed` | Writes were issued and the give-back did **not** fully complete. That much is still gone, and the `takes` name from whom. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The last row is the one to defend against, and it is why the failure message says a give-back was *attempted* rather than that everything was put back.
A row whose whole component bucket failed before the give-back reports its **full planned allocation** rather than the part that was written, which over-states on the safe side: a GM deciding whether to make a player whole again is better served by a number that cannot be too small.

**Retry only when the answer says nothing was written.**
That is the first two rows of the table above, and `success` is not the axis.
By outcome, the zero-mutation set is `gmOnly`, `noActor`, `notReady`, `invalidCallSite`, `notElected`, `invalidActorUuids`, `invalidCosts`, `insufficient` and `creditNotConfigured`.
`consumeFailed` is **not** in it — some `consumeFailed` answers wrote nothing and some did not, and only the ledger says which.

**The consume is not idempotent, and you own not double-consuming.**
Taking three hides twice is legitimately six hides gone, and nothing readable distinguishes a duplicated call from a second, intended one — exactly `awardComponents`' position, for exactly its reason.
The `callSite` election removes the steady-state multi-client duplication class; it is not a lease.
Record your claim in front of the irreversible act rather than guarding inside it.

**Both members fail closed on an actor set that does not fully resolve, and the two refusals split on what resolved.**
`noActor` means **not one** of the supplied UUIDs addressed an actor — the same word every other actor-targeted member answers.
`invalidActorUuids` covers the request itself: an absent, empty or over-bound list, a non-string entry, or a list where **some** resolved and some did not.
It also covers a list naming the **same actor twice**, which is easier to do than it sounds: a linked token's actor is its base actor, so `Actor.x` and `Scene.s.Token.t.Actor.x` are two addresses for one document.
Build the set from a party plus the acting character and you can send that pair without noticing.
Distinctness is judged by document identity rather than by id, because an unlinked token's actor shares its base actor's id and is a genuinely different pool.

An address inside a compendium is refused, not read: a compendium actor is a template, and neither member will read from or take from one.
Silently dropping one would compute a pool over fewer actors than you believe, and the consume would then draw from a different set than the read reported, so the resolved set is echoed back on `actorUuids` for you to check.

**Both lists are bounded at 32.**
Not 64, as `awardComponents`' `awards` is, because the work here is the **product** of the two: every cost is scanned across every actor, and the consume then issues one batched write per actor that paid.
Widening a published bound is free under the compatibility promise and narrowing one is a `schemaVersion` bump, so the cheap direction is the one left available.

{: .warning }
> **A currency row's `requested` and `consumed` are in different denominations, and that is deliberate.**
> `requested` echoes **your own** unit faithfully, because the contract promises you can map an answer back onto the request you wrote.
> The takes are in the ladder's **terminal base unit**, because that is the only denomination in which a debit split across several payers is exact.
> So on a `gp → sp → cp` ladder a 2 gp cost reads `requested: 2` beside `consumed: 200`.
> Converting the takes back was rejected because a payer's share becomes fractional — a three-way split of one gold piece does not sum back to one in floating point — and collapsing them into a single whole-cost take was rejected because it discards the per-actor attribution the ledger exists to provide.
> The **read** does not have this seam: its `available` is converted back into your own unit and floored, because a pool holding three and a half gold pieces cannot pay four.

{: .warning }
> **An unreadable pool refuses the consume at CALL level, and no row explains why.**
> `balanceNotConfigured`, `ladderEmpty` and `ladderInvalid` are declared by the **read** and have no token in the consume's key table.
> A read can report one unreadable cost and answer every other; a take that cannot see what a party is carrying must not take from them at all.
> So a consume in that world answers `consumeFailed` at call level with every row reporting `notAttempted`, and nothing written.
> If you need to know *why*, call the read: it answers `balanceNotConfigured` on the currency reading itself and names the cause in its own message.

**A consume can emit issue-540 name-tier telemetry, and so can the read.**
Both resolve an actor's owned stacks through the published `findComponentItems`, which falls back to a case-**sensitive** exact-name match whenever no owned item resolved to the component by durable identity, and reports every such hit through the deprecation telemetry issue 540 exists to measure.
That is correct here — this pair must match exactly what salvage and bulk destroy match, or a gate would predict a write it does not perform.
What the **read** avoids is the *other* hop: resolving your cost's `name` to a crafting-system **definition** goes through the definition index's own silent primitive, so a companion polling holdings every stage does not register as reliance on the name fallback.
The item-side hits are deduped per session on `(systemId, definition, item name)`, so polling cannot inflate them either.

### The Outcome Vocabulary

`companion.outcomes` is **open by declaration and closed by enumeration**: it is complete for this `schemaVersion`, a member may emit a **new** outcome without a version bump, and renaming or removing one is a bump.
Branch on `success` first and treat an unrecognised `outcome` as a generic refusal — an exhaustive `switch` is a caller bug, not a contract breach.

### The Compatibility Promise

While `schemaVersion` is unchanged, every member keeps its name, keeps accepting the arguments documented here, and keeps answering in the documented shape.
A member may gain an optional argument or an additional result field; it may not lose one, change the meaning of one, or begin throwing where it returned a result.
A **new** member may be added without a version change, because adding one cannot break a companion that does not call it.
Removing a member, renaming one, or narrowing what one accepts is a `schemaVersion` bump, announced in the release notes, with the previous member retained as a deprecated delegate for at least one minor release.
Nothing outside the declared set is contract, however reachable it is.

{: .warning }
> **Elect a single executor before acting on an answer.**
> A companion invoking any member from a handler that fires on **every connected client** — a synced hook such as `updateWorldTime`, or a socket broadcast — must check `game.users.activeGM?.id === game.user?.id` first.
> Reading is harmless; acting on the read from N clients is not, and `grantRecipeKnowledge` under N clients is N writes.
>
> **For the five members that take a `callSite` — `rollActorCheck`, `resolveBulkCheckDecision`, `awardComponents`, `creditCurrency` and `consumePooledHoldings` — Fabricate discharges this for you, but only if you tell it the truth.**
> Declare `callSite: 'broadcast'` and Fabricate refuses `notElected` on every unelected client.
> Declare `callSite: 'gmAction'` from a synced hook and the gate never runs, because the declaration is the only signal Fabricate has and nothing in the environment can check it.
> The harm the two check-roll members guard against is sharper than a duplicated message: N clients roll N **different totals** and hand them to N copies of your module.
> For the two award members the harm inverts and gets worse: N clients place N copies of the **same** value onto a player's sheet, with no `alreadyKnown` no-op to absorb the repeat and nothing for a GM to do but find and reverse it by hand.
> For `consumePooledHoldings` it is worse again, because N clients **delete** N times the components and take N times the coin, across a whole party at once.

## Subscribing To Gathering Hooks

Fabricate publishes Foundry hooks when a gathering attempt resolves, so other modules can react to gathering outcomes (successes, failures, and triggered encounters) without depending on Fabricate internals.
Publication is always on — no setting gates it, and it is harmless when nobody subscribes.
The hook names are also exposed on `game.fabricate.api.HOOKS.gathering` so you do not have to hard-code the strings.

| Hook | Fires |
|:-----|:------|
| `fabricate.gathering.attemptCompleted` | Once for every terminal attempt (success **or** failure, immediate **or** matured timed run), after all side effects are committed. |
| `fabricate.gathering.eventTriggered` | Once per encounter/event the attempt triggered. |

The `attemptCompleted` payload is a cloned, JSON-serializable object:

| Field | Description |
|:------|:------------|
| `schemaVersion` | Payload contract version (currently `1`). |
| `status` | `'succeeded'` or `'failed'`. |
| `initiatedBy` | `'immediate'` for direct attempts, `'timed'` for matured timed runs. |
| `worldTime` | Foundry world time at completion. |
| `userId`, `viewerId` | Initiating user and viewing user ids. |
| `actorId`, `actorUuid`, `actorName` | The gathering actor. |
| `craftingSystemId`, `craftingSystemName` | The owning crafting system. |
| `environmentId`, `environmentName` | The gathering environment. |
| `taskId`, `taskName` | The resolved task. |
| `runId`, `runStatus` | The persisted gathering run. |
| `riskLevel`, `conditions` | Risk and the weather/time-of-day snapshot (`null` for non-rich tasks). |
| `gatheredItems` | `[{ actorUuid, itemUuid, componentId, quantity }]` created on success. `componentId` is `null` when the resolution does not expose it. |
| `usedTools` | `[{ componentId, actorUuid, itemUuid, quantity, broken }]` consumed by the attempt (breakage internals are not exposed). |
| `events` | The triggered encounters (also emitted individually as `eventTriggered`). |
| `checkResult` | The normalized resolution detail. |

**Where it fires.** The hook fires on the client that resolved the attempt.
Immediate attempts fire on the acting user's client; matured timed runs fire once, on the primary GM client (so the `updateWorldTime` broadcast does not duplicate them across clients).

For a **blind** task viewed by a non-GM, the payload is redacted to match what that client may see: `taskId`/`taskName`, `gatheredItems`, `usedTools`, `events`, and `checkResult` are omitted, and no `eventTriggered` hook fires.
A subscriber that throws is caught and logged — it never breaks the gathering flow.

```javascript
Hooks.once('fabricate.ready', () => {
  const { ATTEMPT_COMPLETED, EVENT_TRIGGERED } = game.fabricate.api.HOOKS.gathering;

  Hooks.on(ATTEMPT_COMPLETED, (result) => {
    if (result.status !== 'succeeded') return;
    console.log(`${result.actorName} gathered`, result.gatheredItems, `in ${result.environmentName}`);
  });

  Hooks.on(EVENT_TRIGGERED, ({ actorUuid, event }) => {
    console.log(`Encounter for ${actorUuid}:`, event.name);
  });
});
```

## Manager Navigation Extension

Companion modules can take over a Fabricate GM Manager navigation **surface** through the API-v1 manager extension seam.
Today Fabricate renders one such surface, `downtime`, whose default content is Core's read-only preview.
A registered provider replaces that preview's tabs, panel content, route chrome, and header actions.

> **The `downtime` surface may not be present.**
> While the premium Downtime Studio is unreleased, Fabricate's `World > Downtime` route is gated behind the world setting `fabricate.experimentalFeatures`, which is **off by default**.
> Registration is unaffected and never fails because of it — but with the setting off your provider is never mounted, so if your panel does not appear, check that setting before you debug your module.
> See [When the surface is absent](#when-the-surface-is-absent).

Declare Fabricate as a required module dependency in the companion manifest.
Attempt registration once from the companion's `init` callback.
If the API is unavailable there, arm one existing Foundry `ready` fallback.
Do not patch the Manager DOM or use Foundry render hooks.

```json
{
  "relationships": {
    "requires": [{ "id": "fabricate", "type": "module" }]
  }
}
```

`relationships.requires` governs dependency availability and activation.
It does not establish ordinary-module script priority.
The one-shot `ready` fallback is therefore part of the load contract.
Do not replace it with an order assumption or a render-hook or DOM-patching integration.

Arm that fallback from inside your `init` callback, exactly as the example below does, and never at your module's ESM top level.
The placement is load-bearing for the same script-ordering reason on both seams, and [Player Navigation Extension](#player-navigation-extension) sets that reason out in full.

### Worked Example

```javascript
let unregisterDowntime = null;
let readyFallbackArmed = false;

// The provider declares its OWN tabs. These ids are the companion's, not Fabricate's:
// any non-empty ids, at least one of them, rendered in this array's order.
const TABS = [
  { id: 'board', icon: 'fas fa-chart-simple', key: 'Board' },
  { id: 'projects', icon: 'fas fa-hammer', key: 'Projects' },
  { id: 'factions', icon: 'fas fa-flag', key: 'Factions' },
  { id: 'rumours', icon: 'fas fa-comments', key: 'Rumours' },
  { id: 'rules', icon: 'fas fa-sliders', key: 'Rules' },
];

function tryRegisterDowntime() {
  if (unregisterDowntime) return true;
  const register = game.fabricate?.api?.managerExtensions?.registerWorldNavProvider;
  if (typeof register !== 'function') return false;

  unregisterDowntime = register({
    apiVersion: 1,
    id: 'downtime',
    // A default header action for any tab that declares none of its own.
    actions: [
      { id: 'guide', label: game.i18n.localize('MY_MODULE.Guide'), icon: 'fas fa-book',
        href: 'https://example.com/downtime-guide' }
    ],
    tabs: TABS.map(({ id, icon, key }) => ({
      id,
      icon,
      // Required, and already localized by the companion.
      label: game.i18n.localize(`MY_MODULE.Downtime.${key}.Label`),
      accessibleName: game.i18n.localize(`MY_MODULE.Downtime.${key}.Accessible`),
      tooltip: game.i18n.localize(`MY_MODULE.Downtime.${key}.Tooltip`),
      // Optional route chrome. Fabricate keeps its own string for anything omitted.
      title: game.i18n.localize(`MY_MODULE.Downtime.${key}.Title`),
      subtitle: game.i18n.localize(`MY_MODULE.Downtime.${key}.Subtitle`),
      breadcrumb: game.i18n.localize(`MY_MODULE.Downtime.${key}.Crumb`),
      actionsLabel: game.i18n.localize(`MY_MODULE.Downtime.${key}.Actions`),
      // Optional per-tab header actions, overriding the provider-level list above.
      actions: id === 'projects'
        ? [{
            id: 'new-project',
            label: game.i18n.localize('MY_MODULE.NewProject'),
            icon: 'fas fa-plus',
            primary: true,
            disabled: !game.user.isGM,
            onSelect: (context) => openProjectDialog(context.craftingSystemId)
          }]
        : undefined,
    })),
    mount({ target, tabId, context }) {
      const view = mountCompanionDowntime({ target, tabId, context });
      // Re-render this surface whenever the companion's own data changes.
      const stop = myDowntimeStore.subscribe(() => context.requestRemount());
      return () => { stop(); view.destroy(); };
    },
  });
  return true;
}

Hooks.once('init', () => {
  if (tryRegisterDowntime() || readyFallbackArmed) return;
  readyFallbackArmed = true;
  Hooks.once('ready', tryRegisterDowntime);
});
```

### Provider Contract

`registerWorldNavProvider(provider)` returns an idempotent unregister function.
Call it when disabling the companion; doing so restores Fabricate's own preview for that surface.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Required | Meaning |
|:------|:---------|:--------|
| `apiVersion` | yes | Must be exactly `1`. |
| `id` | yes | The surface id this provider claims. Any non-empty string; Fabricate's Manager renders `downtime`. One provider per surface id — registering a second for the same surface throws. |
| `tabs` | yes | One or more tabs, rendered in array order. |
| `actions` | no | Default header actions for any tab that declares none of its own. |
| `mount` | yes | Synchronous mount callback. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Each entry in `tabs`:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Required | Meaning |
|:------|:---------|:--------|
| `id` | yes | Non-empty, unique within the tab set. Fabricate never checks it against a list of its own. |
| `label` | yes | Localized visible tab label. It is the rail sub-item's visible text, and the accessible name of the panel region below it. |
| `accessibleName` | yes | Localized accessible name of the rail sub-item, and of Fabricate's own preview tab button. It REPLACES the visible label as that control's accessible name, so it must contain the label's text. |
| `tooltip` | yes | Localized tab tooltip. Over your screens it is the rail sub-item's native tooltip, so it is pointer-visible rather than keyboard-visible; on Fabricate's own preview strip it is a keyboard-visible `role="tooltip"`. |
| `icon` | yes | Font Awesome class string. |
| `title` | no | Localized page title (the `H1`) while this tab is active. |
| `subtitle` | no | Localized page subtitle while this tab is active. |
| `breadcrumb` | no | Localized leaf breadcrumb crumb while this tab is active. |
| `actionsLabel` | no | Localized accessible name of the header-action group. |
| `actions` | no | Header actions for this tab, replacing the provider-level list. |
| `badge` | no | `{ count, accessibleName }` rendered on the tab's rail sub-item. See [Tab Badges](#tab-badges). |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**A tab's key set is closed.**
Fabricate refuses a key it does not name above, with a deterministic message, exactly as [Runtime Route Chrome](#runtime-route-chrome) refuses an unknown key.
This is stricter than earlier releases, which silently ignored an unrecognized tab field.

Each action is `{ id, label, icon?, tooltip?, primary?, tone?, disabled? }` plus **exactly one** of:

- `href` — an absolute `http(s)` URL.
  Fabricate renders an anchor with `target="_blank"` and `rel="noopener noreferrer"`.
  Any other scheme is rejected at registration.
- `onSelect(context)` — a click handler.
  Fabricate renders a button and calls the handler with the mount context plus `actionId`.
  A throwing handler is caught and logged.

All strings a provider supplies are used verbatim: **localize them yourself**.
Fabricate localizes only its own fallback copy.

`tone` selects the action's button treatment: `primary`, `ghost`, `danger`, or `neutral`, the default, which is the plain Manager button with no added styling.
Every header action renders at the page header's 38px control height and carries `fabricate-button is-size-38`, so a companion's actions match Core's own.
It also carries `fab-manager-button`, deprecated at issue 2540: Fabricate styles nothing by it, and it is removed after at least one minor release, announced in the release notes.
`primary: true` is the older, still-supported spelling of `tone: 'primary'`.
An action that declares both `primary` and `tone` is refused at registration.

### Tab Badges

A tab may declare a `badge` — a small mark on its rail sub-item saying something is waiting there, e.g. "3 claims to review":

```javascript
tabs: TABS.map(({ id, icon, key }) => ({
  id,
  icon,
  label: game.i18n.localize(`MY_MODULE.Downtime.${key}.Label`),
  accessibleName: game.i18n.localize(`MY_MODULE.Downtime.${key}.Accessible`),
  tooltip: game.i18n.localize(`MY_MODULE.Downtime.${key}.Tooltip`),
  badge: pendingCountFor(id) > 0
    ? { count: pendingCountFor(id), accessibleName: `${pendingCountFor(id)} pending` }
    : undefined,
})),
```

`badge` is `{ count, accessibleName }`.
Both fields are required whenever `badge` is present, and no other key is accepted.
`count` is a non-negative integer; `count: 0` renders the numeral `0` rather than nothing, so a companion that wants to state "nothing pending" explicitly can.
`accessibleName` is **final display text, rendered verbatim**, exactly as a tab's own `label` is: localize it yourself, and never pass a lang key expecting Fabricate to resolve it.

**Change a badge at runtime, with no mount and no remount, through the registry itself:**

```javascript
game.fabricate.api.managerExtensions.setWorldNavTabBadge('downtime', 'board', {
  count: 3,
  accessibleName: '3 claims to review',
});

// Clear the runtime layer and fall back to the tab's own registered badge (or none).
game.fabricate.api.managerExtensions.setWorldNavTabBadge('downtime', 'board', null);
```

`setWorldNavTabBadge(surfaceId, tabId, badge)` returns `true` when a provider currently holds `surfaceId` and declares `tabId`, and `false` otherwise, storing nothing.
A malformed `badge` throws a `TypeError` and changes nothing — validation runs first, before Fabricate checks whether anything is listening, so a companion feature-detecting the seam gets the same answer regardless of install order.

**Resolution is three layers deep, in one fixed order:** the runtime badge set through `setWorldNavTabBadge`, then the tab's own registered `badge`, then no badge at all.
`null` clears the runtime layer and falls back to the registered badge.
An explicit `{ count: 0, accessibleName }` is a stated zero and does **not** fall back, the same rule an empty `actions` array follows for [Runtime Route Chrome](#runtime-route-chrome).

**A badge is scoped to the registration, not to a mount — this is the opposite lifetime from runtime route chrome.**
Route chrome is cleared the moment a mount ends; a badge's whole job is to be true while your companion is **not** mounted, so it survives mount, unmount, tab change, route change and window state.
It is dropped only when your provider itself leaves the registry, so unregistering and re-registering starts a tab back at its own registered `badge`, with no stale runtime value left over.

**The badge is announced as a description, never as a name.**
Fabricate renders it with `role="img"` and your `accessibleName`, points the rail sub-item's `aria-describedby` at it, and leaves the sub-item's own accessible name as the tab's `accessibleName`.
When no badge is set — including right after a runtime badge is cleared with `null` — the sub-item carries no `aria-describedby` at all, so nothing is left pointing at a description that is not there.

Core also **sums** the resolved badge counts of every tab the rail renders onto the Downtime parent row, as a single summary mark, while that group is collapsed or the rail is collapsed.
That rollup is Core's arithmetic over your numbers, it replaces the rail's muted `PREMIUM` chip for as long as it shows, and for most GMs — whose Downtime disclosure is closed on every fresh Manager open — it is the only place your count is ever seen.

### The Mount Context

`mount({ target, tabId, context })` must be synchronous and return either one cleanup function or nothing.
`tabId` is always one of the provider's own tab ids.
`context` is a frozen object carrying no Fabricate store, document, or component:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Meaning |
|:------|:--------|
| `schemaVersion` | Context contract version, currently `1`. |
| `surface` | The Fabricate application hosting the provider; currently always `'manager'`. |
| `surfaceId` | The surface id this provider was registered under. |
| `route` | The Manager route rendering the provider, e.g. `'world-downtime'`. |
| `tabId` | The active tab id, identical to `mount`'s own `tabId` argument. |
| `craftingSystemId` | The Manager's selected crafting system id, or `null`. The route is reachable with no system selected, so handle `null`. |
| `isGM` | Whether the current Foundry user holds the GM role. This is presentation information, not authorization — gate your own writes. |
| `revision` | Increments on every `requestRemount()` call. |
| `requestRemount()` | Ask Fabricate to re-render this surface. It runs the current cleanup, clears the target, and calls `mount` again with a fresh context. |
| `setRouteChrome(chrome)` | Restate this mount's route chrome at any time, with no remount. See [Runtime Route Chrome](#runtime-route-chrome). |
| `onRouteReselect(handler)` | Register a handler for the GM re-activating the rail sub-item this mount is already showing. See [Runtime Route Chrome](#runtime-route-chrome). |
| `onBeforeNavigate(handler)` | Register a veto over the navigations that would end this mount. See [Guarding Unsaved Work](#guarding-unsaved-work). |
| `navigateToTab(tabId)` | Take the GM to another of **your own** registered tabs. See [Navigating To Your Own Tabs](#navigating-to-your-own-tabs). |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

A new context object is created — never mutated — whenever one of its values changes, which also remounts the active tab.
`setRouteChrome`, `onRouteReselect`, `onBeforeNavigate` and `navigateToTab` are the exceptions: they are functions carried on that same frozen context, and calling them never changes the context's own identity, so none of them triggers the remount a new context would.

### Runtime Route Chrome

A tab's `title`, `subtitle`, `breadcrumb`, `actionsLabel` and `actions` are read once, at registration.
That is enough for a companion whose tab is a single screen.
It is not enough for a tab that is a list drilling into an editor.
The editor needs its own title, its own artwork, an "Unsaved" chip, and Back, Delete and Save actions in the same header, without losing the mounted editor state underneath.

`context.setRouteChrome(chrome)` restates this mount's chrome at any time, with no remount.
It accepts the same fields a tab may register, plus `icon` and `image` for a header medallion, and `status` for a chip:

```javascript
mount({ target, tabId, context }) {
  const view = mountCompanionDowntime({ target, tabId, context });

  view.onOpenProject((project) => {
    context.setRouteChrome({
      title: project.name,
      subtitle: game.i18n.localize('MY_MODULE.Downtime.Projects.EditingSubtitle'),
      status: view.isDirty()
        ? { label: game.i18n.localize('MY_MODULE.Unsaved') }
        : undefined,
      actions: [
        { id: 'back', label: game.i18n.localize('MY_MODULE.Back'), icon: 'fas fa-arrow-left',
          tone: 'ghost', onSelect: () => view.closeProject() },
        { id: 'delete', label: game.i18n.localize('MY_MODULE.Delete'), icon: 'fas fa-trash',
          tone: 'danger', onSelect: () => view.deleteProject(project.id) },
        { id: 'save', label: game.i18n.localize('MY_MODULE.Save'), icon: 'fas fa-check',
          tone: 'primary', onSelect: () => view.saveProject() },
      ],
    });
  });

  // Back to the list: drop the runtime layer and let the tab's own registered
  // chrome show through again.
  view.onCloseProject(() => context.setRouteChrome(null));

  const stop = myDowntimeStore.subscribe(() => context.requestRemount());
  return () => { stop(); view.destroy(); };
},
```

Resolution runs three layers deep, in one fixed order: the live mount's runtime chrome, then the active tab's registered chrome, then Fabricate's own string.
A companion that never calls `setRouteChrome` reads exactly as it did before this channel existed.
An omitted field falls through to the next layer down.
It does not clear that field.

**A call replaces, it never merges.**
Each call states the whole chrome, so an omitted field falls back to the layer below and there is no partial update.
Pass `null` (or `{}`) to drop the runtime layer entirely and restore the tab's own registered chrome, as the worked example does on close.

**`actions` resolves with `??`, not `||`.**
An empty array means "this screen has no actions" and stays empty rather than falling through to the tab's own list.
A truthiness check would erase exactly the distinction an editor's Back, Delete and Save need from its list screen's actions.

**Unknown keys are refused, not ignored.**
A registered tab silently ignores a field it does not read, but a runtime update throws a `TypeError` on any key outside the documented set, including a misspelling such as `subtitel`.
Nothing applies until validation passes, so a refused update leaves the header showing whatever it already showed.

**Artwork is opt-in and off by default.**
`icon` and `image` have no registration-time counterpart, so the route's header carries no medallion until a companion sets one.
`icon` is a Font Awesome class string and `image` is an image path.
The two are mutually exclusive, and declaring both throws.

**`status` renders Fabricate's own unsaved-style chip.**
It is `{ label, tone?, tooltip? }`.
`tone` defaults to `warning`, Fabricate's own staged-changes tone, and also accepts `info`, `positive`, `active`, `neutral`, `danger`, `negative` and `disabled`.

**Localization stays your responsibility.**
As at registration, Fabricate renders every string a runtime update carries exactly as supplied.

**A stale mount cannot repaint the screen.**
`setRouteChrome` returns `false`, and changes nothing, once its mount has ended: a tab switch, an unregister, or the GM leaving the route all end it.
A companion holding a context from a late-resolving promise or a stray listener cannot dress a screen the GM has since moved on from.

**Updating chrome never remounts.**
This is the property the whole channel exists to preserve.
The mount context's identity, which is what a remount is keyed on, never changes when `setRouteChrome` is called, so your editor's own state, scroll position and focus are untouched.

`context.onRouteReselect(handler)` registers a handler for the GM clicking the rail sub-item of the tab your mount already shows.
Before this channel existed, that click did nothing, because Fabricate had no lower level to navigate to.
Now it is offered to your mount, so a list-then-editor companion can treat it as "pop back to the list":

```javascript
mount({ target, tabId, context }) {
  const view = mountCompanionDowntime({ target, tabId, context });
  const stop = context.onRouteReselect(() => view.closeProject());
  return () => { stop(); view.destroy(); };
},
```

The call returns an idempotent unsubscribe function, and Fabricate also drops the handler itself when the mount ends, so an unstopped subscription is not a leak.
A throwing handler is caught and logged, and never breaks the rail click for anyone else.

`onRouteReselect` is deliberately **not** routed through Fabricate's own route-exit confirmation.
No Manager route is being exited by this click, so there is nothing for that confirmation to guard.
Whether your companion's own unsaved editor state should block the pop is your question to answer inside the handler.

### Guarding Unsaved Work

Fabricate's own editors refuse to be navigated away from with unsaved changes: leaving the recipe editor with a dirty draft raises a discard prompt, and so does closing the Manager window.
A companion could not do the same.
It could prompt on the controls it owns — its own Back action, and the rail re-activation `onRouteReselect` hands it — but it had no say at all when the GM switched to another tab, left the route, or closed the window.
The panel was disposed and whatever was in it went with it.

`context.onBeforeNavigate(handler)` registers your mount's veto over exactly those three navigations:

```javascript
mount({ target, tabId, context }) {
  const view = mountCompanionDowntime({ target, tabId, context });

  const stop = context.onBeforeNavigate(async ({ reason }) => {
    if (!view.isDirty()) return true;
    // `reason` is 'tab', 'route' or 'close'. Keeping a draft for the session is only an
    // answer for the first two — on 'close' the session is what is ending.
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('MY_MODULE.Downtime.Discard.Title') },
      content: `<p>${game.i18n.localize('MY_MODULE.Downtime.Discard.Content')}</p>`,
    });
    if (confirmed) view.discardDraft();
    return confirmed;
  });

  return () => { stop(); view.destroy(); };
},
```

**Return `false` to keep the GM where they are.**
Anything else allows the navigation, including returning nothing at all.
That asymmetry is deliberate: a handler you wrote to *watch* navigations cannot trap the GM by forgetting a `return`.
The handler may be synchronous or `async`, and Fabricate awaits a promise, because the answer normally comes from a dialog.

**Three navigations are covered, and they are named.**

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| `reason` | What the GM did |
|:---------|:----------------|
| `'tab'` | Activated the rail sub-item of a **different** tab of your provider. |
| `'route'` | Left the Downtime route entirely — another rail item, another Manager screen. |
| `'close'` | Closed the Manager window. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The event carries `reason` and nothing else.
Your own `tabId` is already on the context you closed over, and the destination is withheld on purpose: Fabricate normalizes a route *after* your guard has answered, so a decision made from a destination would be a decision made from a value that can still change.

**Several things are deliberately not covered, and your own fallback still has to hold for them.**
A browser reload and a Foundry logout never reach this seam at all.
Neither does a **remount** — whether you asked for one with `requestRemount()` or a context value such as the selected crafting system changed — because a remount is not the GM leaving your screen, and you see it as a fresh `mount` either way.
Neither does re-entering the route or the tab you are already on: those navigate nowhere, and re-activating the tab on screen stays `onRouteReselect`'s, where any prompt about your unsaved work belongs inside your handler.

**A forced close is never guarded.**
Foundry's own lifecycle teardown closes the Manager with `force`, in contexts where no dialog can be serviced, and so does Fabricate's smoke harness.
A guard that ran there would hang the window on a question nothing can answer, so `force` skips it exactly as it already skips Fabricate's own dirty-draft guards.

**A throwing guard allows the navigation.**
It is caught and logged, and the GM goes where they were going.
The opposite ruling would let one bug in your module leave a GM on a route they cannot leave and in a window they cannot close, recoverable only by reloading Foundry — and it would do it silently.
Allowing degrades to exactly the behaviour you had before this seam existed, so nothing is destroyed that was not already at risk.

**A second navigation during a pending answer shares that answer.**
If the GM clicks the rail and then the window's close button while your dialog is still open, your handler is *not* called again.
Both navigations resolve from the one decision the GM makes, and each then continues on its own.
So you never have to defend against your own dialog being opened twice.

**A companion that never calls `onBeforeNavigate` is unaffected.**
No prompt, no added await, no changed timing: Fabricate takes the same code path it took before this channel existed.

**Your guard dies with your mount.**
The call returns an idempotent unsubscribe, and Fabricate drops the handler itself when the mount ends, so an unstopped subscription is not a leak.
A context you kept from an ended mount registers nothing.

### Navigating To Your Own Tabs

A companion can draw a control that names another of its screens — "change this in Settings" on the card where the GM feels the setting's effect — and, until this call existed, could not reach it.
The active tab is Fabricate's own state and nothing published a way into it, so such a control was either absent or dead.

`context.navigateToTab(tabId)` takes the GM to another of the tabs **your provider registered**:

```javascript
autoAdvanceCard.onEditSettings(() => {
  // The same navigation the GM's own click on your Settings rail sub-item performs.
  context.navigateToTab('settings');
});
```

**It is your rail sub-item's own click.**
Asking for the tab already on screen re-activates it through `onRouteReselect` rather than remounting; any other tab is offered to your own `onBeforeNavigate` guard with `reason: 'tab'`, so unsaved work can still stop it; and an allowed move expands the rail group and activates the view exactly as a click does.
Your programmatic request and the GM's click are one navigation, not two that agree today.

**It returns `true` when the request was honoured and `false` when it was refused**, and a promise of either whenever your guard answers asynchronously — a veto may be a dialog, and a synchronous `true` would be a claim about a question still on screen.
A re-activation counts as honoured: nothing moved because nothing had to.

**You can reach your own tabs and nothing else.**
Another provider's surface, a Fabricate route, and an id your provider never declared are all refused.
Membership is resolved from what you have **registered**, not from what Fabricate happens to be rendering, so an id you have just unregistered is refused rather than resolving against Fabricate's own fallback tabs.

**A well-formed id you did not register returns `false`; a malformed one throws.**
Your tab set is a runtime fact — you may re-register with a different one, and a conditional tab may not exist yet — so asking for an id that is not currently yours is a question rather than a coding error.
A non-string or empty id never is: it raises a `TypeError` and changes nothing, exactly as a malformed `setRouteChrome` update does.
A call from a context whose mount has ended returns `false` and moves nobody.

**Do not call it from inside your own `onBeforeNavigate` handler.**
"Veto this move, and send the GM to Settings instead" is the tempting shape, and it returns `false` from there: the request is not the question your guard is being asked, so Fabricate refuses it rather than nesting one navigation inside the answer to another.
Redirect *after* you have answered — from the continuation of your own dialog, say — because a redirect is a consequence of the decision rather than part of making it.
The same refusal covers the window in which a promise your guard returned is still pending.

**Two things that are not refusals.**
Your context is already live for the duration of `mount()` itself, so a call from inside `mount` re-enters Fabricate's routing mid-mount; redirect from your first data callback instead.
And asking for the tab already on screen runs your `onRouteReselect` handler **synchronously**, before the call returns — so if that handler tears down what you are standing in, it has already done so by your next line.

### The Panel's Layout Contract

Everything in this subsection describes **provider mode only**.
Fabricate's own read-only preview keeps its inset, its scroller, its tab strip and its collapsible rail; none of it changes.

**The panel is a bare box.**
The element handed to `mount` is a `div` at the full height of the Manager's content pane, with no padding, background, scroller or containment of its own.
The companion supplies its own inset.
Fabricate's `12px 20px 24px` inset is **gone** as of this contract: a companion that shipped against it must add the equivalent padding to its own root.

**Your tabs are rail items, and Fabricate renders no tab strip.**
A provider's tabs appear once, as sub-items of the Manager rail's Downtime group, and the panel below them is a named `region` rather than a tab panel.
The region takes the tab's **visible `label`** as its name — it is labelled by the sub-item's label element, not by the sub-item itself, so a landmark is named after the screen rather than after the action that opens it.
The sub-item itself carries `accessibleName` as its `aria-label` and `tooltip` as its native tooltip; see the field table above for where each one lands.
The rail is locked expanded while a provider holds this route, so those sub-items are always reachable; the rail's collapse control renders disabled and explains itself, and the GM's stored collapse preference is left untouched and restored on leaving the route.
Entering the route scrolls the active sub-item into view, so the current screen's rail item is visible without hunting for it.

**Overflow.**
Core's panel scroller keeps working for any companion whose content overflows its root **visibly** — including one that takes the full height.
It stops rescuing a companion the moment that companion absorbs its own content: by giving its root a non-`visible` overflow, or by letting a definite-height flex or grid root shrink its children, which squashes them rather than scrolling them.
Height alone does not remove the fallback.
A companion that intends to own its layout should own its scroller explicitly rather than infer one from its height.

**The block size is definite at every Manager width, and the inline size is not guaranteed.**
`height: 100%` on your own root resolves against a real height at every window size, because this route opts out of the shared narrow-width stack that turns the Manager body content-sized.
The inline size makes no such promise: Fabricate enforces no minimum Manager window size and makes no no-horizontal-overflow guarantee for this panel — explicitly unlike the player seam, which is guaranteed at the player window's enforced 1024x640 floor.
Measured across an ordinary width ladder the target's inline size runs from about 1178px down to about 378px.
Responsive behaviour inside the target is yours; if you want container queries, declare `container-type` on your own root.

**`position: fixed` positions against the Manager, not the viewport.**
The Manager root carries `container-type: inline-size`, which implies layout containment and makes it the containing block for fixed-position descendants.
Anchor your popovers to your own root instead of assuming viewport coordinates.

**`isolation: isolate` caps z-index escape.**
The Manager root creates a stacking context, so an element inside your panel at the maximum z-index still loses to a `body`-level element at `z-index: 100`.
Content that must paint above anything outside the Manager has to be portalled outside the Manager element, which is what Fabricate's own popovers and pickers do.

**Theme tokens are inherited, not stamped.**
Foundry stamps the theme attribute on the document element and on Fabricate roots that exist when it runs; the Manager mounts lazily and carries no attribute of its own, inheriting purely by cascade.
Read the `--fab-*` custom properties live and your surface re-skins with no remount; snapshot their values into JavaScript at mount and it will not.
Content you render *outside* the Manager subtree, such as your own dialogs, inherits the document's tokens rather than the Manager's.

**Keyboard.**
Once you own the scrolling, the panel is no longer the nearest scrollable ancestor, so any scroll container you create must be reachable and operable from the keyboard.

### When The Surface Is Absent

A Manager surface Fabricate does not render is not an error, and it is not something your module can detect at registration time.

Today this has one cause: the `downtime` surface is gated behind `fabricate.experimentalFeatures`, a **world** setting that is off by default, because the premium Downtime Studio it hosts has not been released yet.
The gate is temporary and goes away when the Studio ships.

**What still happens, exactly as it would with the gate open.**

- `registerWorldNavProvider(provider)` validates and stores your provider, returns your unregister function, and throws nothing.
  A GM's world setting is not something a module registering at `ready` could know, so it is never treated as your fault: Fabricate logs no error, raises no warning, and shows no notification.
- `fabricate.manager.navProviderRegistered` fires with your surface id and tab ids.
- The Manager title bar's `PREMIUM` badge lights, because it reports that a companion module is registered rather than that any particular route is on screen.

**What you observe instead is an absence.**

- `mount({ target, tabId, context })` is never called, so you receive no context, no target, and no cleanup call.
- None of `fabricate.manager.surfaceMounted`, `fabricate.manager.surfaceUnmounted` or `fabricate.manager.surfaceTabChanged` fire for the surface.
- The Manager rail shows no `Downtime` entry, and the route cannot be reached.

**A gate that closes under a live mount does not touch your mount.**
The setting is a world setting, so a GM can turn it off while your panel is on screen.
When that happens the rail entry disappears, but your panel stays exactly where it is: your mount is not torn down, your cleanup does not run, your guard is not called, and your unsaved work is untouched.
Fabricate will not discard a GM's in-progress edit because a setting changed.

The GM leaves that panel whenever they next navigate, and that is the ordinary guarded exit described above — your `onBeforeNavigate` guard is called with `reason: 'route'`, a `false` keeps them there, and an allowed exit runs your cleanup once with the target still connected.
Once they have left, the route is gated behind them and they cannot come back to it.

**`requestRemount()` does not bring back a surface the gate has removed.**
Calling it from a context you retained across the gate closing is safe and does nothing; there is no host to re-render.

Nothing here applies to the player window, which hosts no Downtime surface and is not affected by this setting.

### Lifecycle And Failure

Fabricate calls the returned cleanup exactly once before switching tabs, replacing or unregistering the provider, leaving the route, or closing the Manager, and always while the target is still connected.
A mount or cleanup error is caught, logged, and contained: partial content is cleared and Fabricate's own preview takes the whole surface back — panel, tab strip, and rail entries alike — until the next registration.
When a provider registers, unregisters, or re-registers with a different tab set, an active tab id the new set no longer declares falls back to that set's first tab, so the route never renders an empty panel.
When such a change removes the node that held focus, Fabricate moves focus to whichever element names the active screen in the mode now live — your panel region in provider mode, its own tab button in the preview — rather than dropping it to the document body.
It does that only when focus was inside the route's panel, so ordinary rail navigation is left alone; move focus yourself from your own mount if you want it somewhere more specific.
The companion owns all authorization, localization, domain data, persistence, and resources it creates; Fabricate supplies only the target and Manager shell.

### Manager Hooks

Fabricate publishes observational hooks around these events, exposed on `game.fabricate.api.HOOKS.manager` so you do not have to hard-code the strings.
They are notifications only: a listener's return value is ignored and nothing a listener does changes what the Manager renders.
To *change* the Manager, register a provider.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Hook | Fires | Payload |
|:-----|:------|:--------|
| `fabricate.manager.navProviderRegistered` | A provider takes a surface | `{ schemaVersion, surfaceId, tabIds }` |
| `fabricate.manager.navProviderUnregistered` | A provider releases a surface | `{ schemaVersion, surfaceId, tabIds }` |
| `fabricate.manager.surfaceMounted` | The Manager route hosting a surface renders | `{ schemaVersion, surfaceId, route, tabId, providerId, coreFallback }` |
| `fabricate.manager.surfaceUnmounted` | That route is torn down | `{ schemaVersion, surfaceId, route, tabId, providerId, coreFallback }` |
| `fabricate.manager.surfaceTabChanged` | The active tab changes | `{ schemaVersion, surfaceId, route, tabId, previousTabId, providerId, coreFallback }` |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

```javascript
Hooks.on(game.fabricate.api.HOOKS.manager.SURFACE_TAB_CHANGED, ({ surfaceId, tabId }) => {
  console.log(`Fabricate manager surface ${surfaceId} moved to ${tabId}`);
});
```

## Player Navigation Extension

Companion modules can add their own top-level tabs to Fabricate's **player** window through the API-v1 player extension seam.
The seam is general and keyed by surface id; it is not a downtime feature, and Downtime is only its first consumer.

The two seams differ in what they do, and the difference is structural rather than cosmetic.
A **Manager** provider *replaces* one Core route's content.
A **player** provider *adds* N tabs to the player window's navigation rail, alongside Crafting, Alchemy, Gathering, Journal and Inventory.
Fabricate renders every registered player surface, with one temporary exception: the `downtime` surface, which is gated behind the same world setting as the Manager's Downtime route.
No surface id is privileged into being rendered, and Fabricate never checks an id against a list of ids it will accept.

> **The `downtime` surface may not be present here either.**
> While the premium Downtime Studio is unreleased, a companion's `downtime` tabs are shown in the player window only when the world setting `fabricate.experimentalFeatures` is on, which it is **not** by default.
> Registration is unaffected and never fails because of it.
> See [When the player surface is absent](#when-the-player-surface-is-absent).

A player surface id **is** the registering provider's own `id`.
Fabricate's player window has no route of its own to name a surface independently, so `surfaceId` and `providerId` are always equal — in the mount context and in every hook payload.
Both are carried anyway, so a player payload is shape-identical to a Manager one and a listener can read either seam's events with one handler.

Declare Fabricate as a required module dependency in the companion manifest, exactly as for the Manager seam.

```json
{
  "relationships": {
    "requires": [{ "id": "fabricate", "type": "module" }]
  }
}
```

### The Load Contract, And Why The Fallback Is Armed Inside `init`

Attempt registration once from the companion's own `init` callback.
If the API is not there yet, arm **one** idempotent `Hooks.once('ready', …)` fallback — and arm it **from inside `init`**, never at the module's ESM top level.

That placement is load-bearing and the reason is Foundry's script ordering.
Module `esmodules` are sorted by priority, and **library-flagged modules evaluate before ordinary ones**.
A library-flagged companion therefore evaluates before Fabricate does, so a `Hooks.once('ready', …)` armed at its ESM top level is registered *ahead* of Fabricate's own `ready` listener and fires before the API exists — defeating the one scenario the fallback is there for.
Arming it from inside `init` puts it after Fabricate's, because by then every module's `init` has been dispatched in priority order.

`relationships.requires` governs dependency availability and activation.
It does not establish ordinary-module script priority.
The one-shot `ready` fallback is therefore part of the load contract for both seams.
Do not replace it with an order assumption, a render hook, or DOM patching.

### Worked Example

```javascript
let unregisterPlayerDowntime = null;
let playerReadyFallbackArmed = false;

// The provider declares its OWN tabs. These ids are the companion's, not Fabricate's, and they
// can never collide with a Core tab id: Fabricate addresses a provider tab by a namespaced
// route key composed from the surface id and the tab id.
const PLAYER_TABS = [
  { id: 'board', icon: 'fas fa-chart-simple', key: 'Board' },
  { id: 'projects', icon: 'fas fa-list-check', key: 'Projects' },
  { id: 'ledger', icon: 'fas fa-scroll', key: 'Ledger' },
];

function tryRegisterPlayerDowntime() {
  if (unregisterPlayerDowntime) return true;
  const register = game.fabricate?.api?.playerExtensions?.registerPlayerNavProvider;
  if (typeof register !== 'function') return false;

  unregisterPlayerDowntime = register({
    apiVersion: 1,
    id: 'downtime',
    tabs: PLAYER_TABS.map(({ id, icon, key }) => ({
      id,
      // The WHOLE Font Awesome class list, rendered verbatim.
      icon,
      // Final display text, already localized by the companion.
      label: game.i18n.localize(`MY_MODULE.Downtime.${key}.Label`),
      // Optional. It REPLACES the button's accessible name, so it must contain the visible label.
      accessibleName: game.i18n.localize(`MY_MODULE.Downtime.${key}.Accessible`),
      // Optional. Exposed through `aria-describedby`.
      tooltip: game.i18n.localize(`MY_MODULE.Downtime.${key}.Tooltip`),
    })),
    mount({ target, tabId, context }) {
      const view = mountCompanionPlayerDowntime({ target, tabId, actorId: context.actorId });
      // Re-render this surface whenever the companion's own data changes.
      const stop = myDowntimeStore.subscribe(() => context.requestRemount());
      return () => { stop(); view.destroy(); };
    },
  });
  return true;
}

Hooks.once('init', () => {
  if (tryRegisterPlayerDowntime() || playerReadyFallbackArmed) return;
  playerReadyFallbackArmed = true;
  // Armed HERE, inside `init` — not at this file's top level. See the load contract above.
  Hooks.once('ready', tryRegisterPlayerDowntime);
});
```

### Provider Contract

`registerPlayerNavProvider(provider)` returns an idempotent unregister function.
Call it when disabling the companion; its tabs leave the rail, and Fabricate renders no placeholder in their place.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Required | Meaning |
|:------|:---------|:--------|
| `apiVersion` | yes | Must be exactly `1`. |
| `id` | yes | The surface id this provider claims, and the surface id Fabricate keys on. Lowercase letters, digits and hyphens, 1–64 characters, starting with a letter or digit. One provider per surface id — registering a second for the same surface throws. |
| `tabs` | yes | One or more tabs, rendered in array order after Fabricate's own five. |
| `mount` | yes | Synchronous mount callback. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The player seam recognises **no** route chrome and **no** header actions.
The player window has no route header, breadcrumb trail or header-action group, so `title`, `subtitle`, `breadcrumb`, `actionsLabel` and `actions` are not validated and not read.
Fabricate reads only the documented tab fields below: any other field on a tab is ignored, including a `count` — a nav count badge is Core's own and is not offered to a provider.

Each entry in `tabs`:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Required | Meaning |
|:------|:---------|:--------|
| `id` | yes | Unique within the tab set, and the same charset as the provider `id`. Fabricate never checks it against a list of its own, and it can never collide with a Core tab id. |
| `label` | yes | Final visible tab label, rendered verbatim. Localize it yourself: Fabricate localizes only its own five labels. |
| `icon` | yes | The full Font Awesome class list, for example `fas fa-scroll`, rendered verbatim. Fabricate prefixes the family only for its own tabs, so do not omit it. |
| `accessibleName` | no | Accessible name for the rail button. It REPLACES the visible label as the accessible name, so it must contain the label's text. |
| `tooltip` | no | Description exposed through `aria-describedby`. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The visible rail label truncates with an ellipsis inside its fixed-width button; the untruncated wording is what `accessibleName` and `tooltip` are for.

### The Player Mount Context

`mount({ target, tabId, context })` must be synchronous and return either one cleanup function or nothing.
`tabId` is always the provider's own **bare** tab id, never the composed route key.

That composed key is `ext:<surfaceId>:<tabId>`, and Fabricate addresses every provider tab by it rather than by the bare tab id.
That is what makes a collision with a Core tab id structurally impossible without Fabricate learning a single provider id.
The route key is what the window's active-tab state, the rail button's selection attribute, and the window's tab query all carry, so it is also the value you pass to open one of your own tabs yourself:

```javascript
// The worked example's provider id is 'downtime' and one of its tab ids is 'projects'.
game.fabricate.api.getFabricateAppClass().show('ext:downtime:projects');
```

The window falls back to its Crafting tab when the key names a tab no registered provider currently offers, so register before you call it.

`context` is a frozen object carrying no Fabricate store, document, or component:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Meaning |
|:------|:--------|
| `schemaVersion` | Context contract version, currently `1`. |
| `surface` | The Fabricate application hosting the provider; always `'player'`. |
| `surfaceId` | The surface id this provider was registered under, which is the provider's own `id`. |
| `tabId` | The active bare tab id, identical to `mount`'s own `tabId` argument. |
| `actorId` | The player window's shared Actor selection, or `null` when nothing is selected. A change of actor produces a new context and therefore a remount. |
| `isGM` | Whether the current Foundry user holds a GM role. This is presentation information, not authorization — it is also true for assistant GMs, and this window has no role gate at all, so gate your own writes. |
| `revision` | Increments on every `requestRemount()` call. |
| `requestRemount()` | Ask Fabricate to re-render this surface. It runs the current cleanup, clears the target, and calls `mount` again with a fresh context. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

A new context object is created — never mutated — whenever one of its values changes, which also remounts the active tab.
The converse holds too, and you can rely on it: while none of the values above changes, the context keeps its identity and your surface is **not** remounted.
So opening the window, another companion registering or unregistering, and any other republication that leaves your surface's values alone all leave your mounted content in place, with its scroll position, focus, and in-flight state intact.

### The Panel's Layout Contract

The element handed to `mount` is a bare `div` inside the player window's content area, and it declares exactly `height: 100%; min-height: 0` and nothing else.
Each omission is deliberate, and a companion can rely on all three:

- **No scroller.** The player window's content area already scrolls, and a second scroller inside it produces a nested double scroll.
- **No CSS container.** `container-type` implies `contain: layout`, which would make the target a containing block for fixed-position descendants and silently mis-position a companion's popovers.
  A fixed-position element inside the target positions against the viewport.
- **No padding or background.** The companion owns its own inset and surface.

Give your own root `height: 100%; min-height: 0` too.
Skip it and your root resolves against `auto` and falls back to content height rather than filling the panel, and nothing reports it.
If you want container queries, declare `container-type` on your own root — its inline size is the target's, so you measure the same box without Fabricate imposing containment on companions that do not want it.

### When The Player Surface Is Absent

A player surface Fabricate does not render is not an error, and it is not something your module can detect at registration time.

Today this has one cause, and it is the same one as on the Manager side: the `downtime` surface is gated behind `fabricate.experimentalFeatures`, a **world** setting that is off by default, because the premium Downtime Studio it hosts has not been released yet.
The gate is temporary and goes away when the Studio ships.
It names that one surface id: register any other id and your tabs render on registration alone, whatever the setting says.

**What still happens, exactly as it would with the gate open.**

- `registerPlayerNavProvider(provider)` validates and stores your provider, returns your unregister function, and throws nothing.
  A GM's world setting is not something a module registering at `ready` could know, so it is never treated as your fault: Fabricate logs no error, raises no warning, and shows no notification.
- `fabricate.player.navProviderRegistered` fires with your surface id and tab ids.
- The Manager title bar's `PREMIUM` badge lights, because it reports that a companion module is registered at all — a player-window-only surface lights it too.

**What you observe instead is an absence.**

- `mount({ target, tabId, context })` is never called, so you receive no context, no target, and no cleanup call.
- None of `fabricate.player.surfaceMounted`, `fabricate.player.surfaceUnmounted` or `fabricate.player.surfaceTabChanged` fire for the surface.
- Your tabs are absent from the player window's rail, and no route key addressing them can be selected.
  The player window shows nothing in their place: it carries no premium signal in any state, so a gated surface and an uninstalled companion look identical.

**When a change to the setting takes effect.**

The gate is read whenever Fabricate derives its surface snapshot — when the player window opens, and on every registration, unregistration or re-registration.
It is not pushed into an already-open window.
A player standing on your tab when a GM turns the setting off keeps the screen they are on until the window is reopened or a registration re-derives the rail, which is deliberate: evicting them would run your cleanup and discard whatever they had in progress because a world setting moved.
Until then that window's rail may still show your tabs, but selecting one is refused — the tab a player is already on stays put, and a move back to it is declined rather than rendering an empty panel.
Turning the setting **on** needs no re-registration from you — the registration Fabricate has been holding renders at the next snapshot.

### Lifecycle And Failure

Fabricate calls the returned cleanup exactly once, while the target is still connected, and before whatever ended the mount removes it.
That holds on every path that ends a mount: a tab change within your own surface, a tab change away to a Core tab, a tab change to a different companion's surface, your provider unregistering while one of its tabs is live, and the window closing.
It holds for a selection Fabricate makes on the user's behalf as well, such as the fallback described below.
Fabricate reaches the disposal from outside your mounted subtree and before the state change that removes it, and the disposal is idempotent, so a second caller reaching it does not run your cleanup twice.
On window close the player application disposes first, then unmounts its Svelte root, and only then does `ApplicationV2` remove the window element.

A mount or cleanup error is caught, logged, and contained, and the containment is deliberately **legible** rather than silent:

- partial content is cleared;
- the faulted surface's rail entries **stay**, and the active tab does not move;
- Fabricate renders its own error state in the panel, naming the provider that failed;
- the registration survives — the provider is set aside, never unregistered — so a later mount may succeed without the companion re-registering, on the conditions spelled out below;
- focus is recovered onto the surface's rail button rather than dropping to the document body.

The fault is recorded against the whole **surface**, not against the tab that threw.
It is keyed on the `(surfaceId, provider)` pair, so once one of your tabs fails to mount, selecting any other tab of the same provider shows the same error state and Fabricate does not attempt another mount for it.
That is deliberate containment rather than a per-tab retry: Fabricate cannot distinguish a tab-specific failure from a broken provider, and retrying the siblings of a provider that has already thrown would just repeat the fault.
Two things clear it, and neither of them is a retry Fabricate performs on its own.

The first is a new snapshot carrying a **different provider object** for the surface, which is what "a later snapshot may mount" means above.
Unregistering and re-registering is such a snapshot only when the second registration passes a different object: a companion that re-registers the same module-level singleton hands Fabricate a provider that is still `===` the recorded one, so the fault and its error state survive.
Register a freshly built provider object when you want the surface retried.

The second is the user closing and reopening the player window.
The record of which providers have faulted belongs to that window and is discarded when the window is torn down, so the next open mounts your provider again even though it is the same object.
That is the retry Fabricate's own error state offers the user, and it is why a fault caused by a transient condition does not strand the surface until the world reloads.
Bringing an already-open window back to the front is not a reopen and clears nothing.

When a provider registers, unregisters, or re-registers with a different tab set, an active route key the new set no longer offers falls back to Fabricate's default Crafting tab, so the window never renders an empty panel.

The companion owns all authorization, localization, domain data, persistence, and resources it creates; Fabricate supplies only the target and the window shell.
Note that the player window applies **no per-user** visibility or permission gate to a provider tab: unlike the Manager, it has no GM gate, so two players never see different rails.
The one gate that exists is world-scoped and temporary, and it is described below.

### Player Hooks

Fabricate publishes observational hooks around these events, exposed on `game.fabricate.api.HOOKS.player` so you do not have to hard-code the strings.
They are notifications only: a listener's return value is ignored and nothing a listener does changes what the player window renders.

`surfaceId` and `providerId` are always equal in these payloads, for the reason given above.
There is no `coreFallback` field: Fabricate renders no content in a provider's place on this surface, so a tab exists only while its provider does.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Hook | Fires | Payload |
|:-----|:------|:--------|
| `fabricate.player.navProviderRegistered` | A provider claims a player surface | `{ schemaVersion, surfaceId, tabIds }` |
| `fabricate.player.navProviderUnregistered` | A provider releases a surface | `{ schemaVersion, surfaceId, tabIds }` |
| `fabricate.player.surfaceMounted` | The player window mounts a surface | `{ schemaVersion, surface, surfaceId, tabId, providerId }` |
| `fabricate.player.surfaceUnmounted` | That surface is torn down | `{ schemaVersion, surface, surfaceId, tabId, providerId }` |
| `fabricate.player.surfaceTabChanged` | The active tab of a mounted surface changes | `{ schemaVersion, surface, surfaceId, tabId, previousTabId, providerId }` |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

```javascript
Hooks.on(game.fabricate.api.HOOKS.player.SURFACE_TAB_CHANGED, ({ surfaceId, tabId }) => {
  console.log(`Fabricate player surface ${surfaceId} moved to ${tabId}`);
});
```

## Published UI Components

`game.fabricate.api.ui` lets a companion draw a Fabricate primitive into an element the companion owns, so it renders Fabricate's own component instead of keeping a copy.
It is the other direction from the two navigation seams: they put a companion's content into Fabricate's windows, and this puts Fabricate's components into the companion's.
[Issue #2426](https://github.com/mistersilver-uk/fabricate/issues/2426) published the seam and its first data-only leaf primitive, and [issue #2448](https://github.com/mistersilver-uk/fabricate/issues/2448) published more data-only leaves; [issue #2451](https://github.com/mistersilver-uk/fabricate/issues/2451) publishes content and fault handling through the seam; [issue #2452](https://github.com/mistersilver-uk/fabricate/issues/2452) publishes callbacks, the first control and ARIA attributes on a control; [issue #2453](https://github.com/mistersilver-uk/fabricate/issues/2453) publishes bound values; [issue #2454](https://github.com/mistersilver-uk/fabricate/issues/2454) publishes the overlay host and `Select`, its first overlay; [issue #2455](https://github.com/mistersilver-uk/fabricate/issues/2455) publishes `StageBars`, lazy components and `mountMany`; [issue #2601](https://github.com/mistersilver-uk/fabricate/issues/2601) publishes `Field`, `Well`, `Callout`, `IconButton`, `EditorTabs` and `RadioCardGroup`; [issue #2644](https://github.com/mistersilver-uk/fabricate/issues/2644) publishes `SegmentedControl`; [issue #2646](https://github.com/mistersilver-uk/fabricate/issues/2646) publishes `Pagination`; [issue #2647](https://github.com/mistersilver-uk/fabricate/issues/2647) publishes `IconPicker`; [issue #2652](https://github.com/mistersilver-uk/fabricate/issues/2652) publishes `ActionMenu`; [issue #2656](https://github.com/mistersilver-uk/fabricate/issues/2656) publishes `Modal`; [issue #2456](https://github.com/mistersilver-uk/fabricate/issues/2456) publishes the standalone style root and widens `Button`, `IconButton`, `StatusToggle`, `InspectorCard` and `Well` to `any`; [issue #2679](https://github.com/mistersilver-uk/fabricate/issues/2679) widens `Field`, `SearchField`, `Stepper`, `SegmentedControl`, `RadioCardGroup`, `EditorTabs` and `Pagination`; [issue #2680](https://github.com/mistersilver-uk/fabricate/issues/2680) widens the four overlay components, `Select`, `IconPicker`, `ActionMenu` and `Modal`, so no published component's root is `fabricate`, which completes the widening that is part of phase 2, [issue #2427](https://github.com/mistersilver-uk/fabricate/issues/2427).

{: .warning }
> Do not destructure it as `const { ui } = game.fabricate.api`, because that shadows Foundry's own `ui` global.
> Use `const fabUi = game.fabricate.api.ui` instead.

Feature-detect it at the point of use, and never hold an `api` reference taken at `init`, because Fabricate rebuilds `game.fabricate.api` at `ready`:

```javascript
const fabUi = game.fabricate?.api?.ui;
if (fabUi?.schemaVersion !== 1) return; // Absent, or a shape this companion does not know.
if (!fabUi.components.includes(name)) return; // Not published by this Fabricate version.

const handle = fabUi.mount(name, { target: element, props }); // `props` as `describe(name)` lists.
handle.update(nextProps); // Replaces every prop but an omitted value prop; it never merges.
handle.destroy(); // Required on every path that ends the mount.
```

A worked mount, in an ApplicationV2 of your own, names a `Meter` and keeps its handle:

```javascript
#meter = null;

_onRender(context, options) {
  super._onRender(context, options);
  const fabUi = game.fabricate?.api?.ui;
  if (fabUi?.schemaVersion !== 1 || !fabUi.components.includes('Meter')) return;
  const target = this.element.querySelector('[data-hp-meter]'); // An empty element you own.
  this.#meter?.destroy(); // A re-render replaced the old target.
  this.#meter = fabUi.mount('Meter', {
    target,
    props: { label: 'Hit points', value: 14, max: 20, valueText: '14 of 20 hit points' },
  });
}

async _preClose(options) {
  this.#meter?.destroy();
  await super._preClose(options);
}
```

Draw the visible reading yourself, because `Meter` draws no figure.
A later change goes through `this.#meter.update({ ... })` with every prop again.

The published components, in publication order:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Component | Version | Root | Props | Rest |
| --- | --- | --- | --- | --- |
| `TierTrack` | 1 | `any` | `tiers` (required), `currentIndex`, `direction`, `layout`, `ariaLabel` (required), `currentLabel` (required), `reachedLabel` (required), `aheadLabel` (required), `hint` | yes |
| `Avatar` | 1 | `any` | `art`, `name` (required), `alt`, `size`, `shape`, `tint` | no |
| `Medallion` | 1 | `any` | `art`, `icon`, `size` (required), `alt`, `tint`, `glyph`, `variant`, `tone`, `ink` | no |
| `FillBar` | 1 | `any` | `value`, `tone`, `color`, `density` | yes |
| `Meter` | 1 | `any` | `value`, `max`, `segments`, `valueText`, `label` (required) | yes |
| `BandedBar` | 1 | `any` | `rows` (required), `direction`, `density` | yes |
| `StatBox` | 1 | `any` | `value` (required), `label` (required), `icon`, `tone` | yes |
| `InfoStrip` | 1 | `any` | `label` (required), `facts` (required), `badge` | yes |
| `Kicker` | 1 | `any` | `as`, `tone`, `children` (text, required) | yes |
| `Chip` | 1 | `any` | `tone`, `density`, `children` (text, required) | yes |
| `Rail` | 1 | `any` | `label`, `children` (slot) | yes |
| `InspectorCard` | 1 | `any` | `children` (slot) | yes |
| `EmptyState` | 1 | `any` | `icon`, `title`, `hint`, `filtered`, `children` (slot) | yes |
| `Notice` | 1 | `any` | `tone`, `title` (required), `detail`, `icon`, `action`, `onAction` (callback), `dismissable`, `dismissLabel` (required when `dismissable`), `onDismiss` (callback, required when `dismissable`) | yes |
| `Button` | 1 | `any` | `role`, `fullWidth`, `disabled`, `children` (text, required), `onclick` (callback, required), `aria-expanded` (aria), `aria-describedby` (aria) | yes |
| `StatusToggle` | 1 | `any` | `on` (required), `ariaLabel` (required), `onclick` (callback, required), `aria-labelledby` (aria), `aria-describedby` (aria) | yes |
| `Stepper` | 1 | `any` | `value` (required), `min`, `max`, `step`, `ariaLabel` (required), `decrementLabel` (required), `incrementLabel` (required), `onChange` (callback, required) | no |
| `SearchField` | 1 | `any` | `value` (value), `onValueChange` (callback), `placeholder`, `ariaLabel` (required) | yes |
| `Select` | 1 | `any` | `options` (required), `value`, `onChange` (callback, required), `ariaLabel` (required), `placeholder`, `size` | no |
| `StageBars` | 1 | `any` | `stages` (required), `currentIndex`, `numbered`, `ariaLabel` (required) | yes |
| `Field` | 1 | `any` | `as` (required), `children` (slot) | yes |
| `Well` | 1 | `any` | `label`, `children` (slot) | yes |
| `Callout` | 1 | `any` | `tone`, `title`, `text`, `icon`, `items`, `actions` (slot) | yes |
| `IconButton` | 1 | `any` | `icon` (required), `ariaLabel` (required), `role`, `size`, `disabled`, `onclick` (callback, required), `aria-expanded` (aria) | yes |
| `EditorTabs` | 1 | `any` | `tabs` (required), `activeTab`, `onSelect` (callback, required), `ariaLabel` (required), `idStem` (required), `activePanelOnly` | yes |
| `RadioCardGroup` | 1 | `any` | `options` (required), `value`, `onChange` (callback, required), `legend` (required), `layout`, `columns`, `disabled`, `disabledOptions` | yes |
| `SegmentedControl` | 1 | `any` | `options` (required), `value`, `onChange` (callback, required), `ariaLabel` (required), `fill`, `density` | yes |
| `Pagination` | 1 | `any` | `totalCount` (required), `pageSize` (required), `pageIndex`, `pageSizeOptions` (required), `onPageChange` (callback, required), `onPageSizeChange` (callback, required), `persistent`, `ariaLabel` (required), `navLabel` (required), `previousLabel` (required), `nextLabel` (required), `perPageLabel` (required), `rangeTemplate` (required), `pageTemplate` (required), `density` | no |
| `IconPicker` | 1 | `any` | `value`, `onChange` (callback, required), `ariaLabel` (required), `listLabel` (required), `searchLabel` (required), `searchPlaceholder`, `noMatchesText` (required) | no |
| `ActionMenu` | 1 | `any` | `items` (required), `ariaLabel` (required), `align`, `onSelect` (callback, required) | no |
| `Modal` | 1 | `any` | `open`, `title` (required), `subtitle`, `closeLabel` (required), `closeOnOutsideClick`, `onClose` (callback, required), `body` (slot), `footer` (slot) | no |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Each row lists the component's published props, noting a prop's kind when it is not plain data, marking a required one and naming the prop while which one is required, and says `yes` in Rest when it takes `data-*` attributes.
An `aria` prop is an ARIA attribute Fabricate writes on the component's control.
Root names the Fabricate ancestor the component's `target` needs, and `any` needs none.
Fabricate draws `Button`, `IconButton`, `StatusToggle`, `InspectorCard`, `Well`, `Field`, `SearchField`, `Stepper`, `Select`, `SegmentedControl`, `RadioCardGroup`, `EditorTabs`, `Pagination`, `IconPicker`, `ActionMenu` and `Modal` under a [standalone style root](#standalone-style-root) in a target that has no Fabricate root, and refuses them there when `target`'s root node is a shadow root.
See [Ownership and theme](#ownership-and-theme).
Each component's section states the shape of every prop it publishes; a member or value a section does not state is private.
A rest `data-*` attribute lands on the component's root, where Foundry reads it too: `data-tooltip` shows Foundry's tooltip, and `data-action` is dispatched by the window's own click handling, which reserves `close`, `tab` and `toggleControls`.
On `Button`, `StatusToggle` and `IconButton` the rest keys land on the control itself, so `data-keyboard-focus`, `data-action`, `data-cursor`, every `data-tooltip` name, and the two names Fabricate's own stylesheet reads off its own buttons, `data-validation-focused` and `data-essence-sort-direction`, are refused there.
`IconButton`'s button carries Foundry's tooltip, so it refuses `data-locked` as well.
Each component's tone set is its own and the sets are not interchangeable: `InfoStrip`'s badge says `positive` where `FillBar` and `Medallion` say `success`.
Colour is never the only carrier of a state: wherever you pass a `tone`, `tint`, `ink`, `fill` or `color`, say the same thing in text beside the component.
A collection of the wrong type, such as `rows: null`, is a contained fault reported under the component's name; it is not a refusal.

### TierTrack

`TierTrack` states where a record stands on an ordered set of named tiers.
`tiers` lists each tier as `{ id?, name, figure?, notes?, valence? }` in drawn order: `name` and `figure` are final display text, `notes` is a list of strings drawn in the `column` layout only, and `valence` is `positive` (the default), `negative` or `neutral` and colours only a reached tier.
`currentIndex` is the tier the record sits at, and `-1` reaches nothing.
`direction` is `ascending` or `descending` (highest first).
`layout` is `row` (badges) or `column` (a ladder).
`ariaLabel` names the list.
`currentLabel` marks the current tier.
`reachedLabel` and `aheadLabel` are the hidden state text on every other tier.
All four labels are required and already localized.
`hint` is an optional sentence beneath the track.
The current tier keeps its valence colour and is marked by a location-dot glyph in `row` and by the visible `currentLabel` in `column`.

### Avatar

`Avatar` draws an actor's portrait as a fixed-size tile: the artwork, or the initials of the name.
`art` is an image path, and a falsy one draws the initials of `name`; a path that fails to load draws the browser's broken image, never the initials.
That path is as Foundry stores it on a document (`actor.img`, `item.img`): relative to the Foundry root, or an absolute URL.
Pass it unchanged; do not prefix it with `/` or run it through `foundry.utils.getRoute`.
`name` is required and is the only source of the initials.
`alt` is read only when `art` is set, and `''` marks the image decorative.
`size` is `26` or `32`, the portrait ladder, and defaults to `32`.
`shape` is `round` or `square`.
`tint` is one of `sage`, `mist`, `lavender`, `rose`, `peach`, `butter`, `aqua`, `mauve`, `ember`, `verdant`, `azure`, `bone` and `slate`.
`name` is never announced and the initials are hidden from assistive technology, so a tile without art carries no name: always draw the name as text beside it, and pass `alt: ''` when you set `art`.
The tile is inline: give its `target` `display: flex`, so the tile is a flex item as every Fabricate site draws it.

### Medallion

`Medallion` draws a record's identity tile: the artwork, or a glyph.
`art` is an image path, and a falsy one draws `icon`, whose default is `fas fa-scroll`.
That path is as Foundry stores it on a document (`actor.img`, `item.img`): relative to the Foundry root, or an absolute URL.
Pass it unchanged; do not prefix it with `/` or run it through `foundry.utils.getRoute`.
`icon` takes Font Awesome classes from the sheet the running Foundry ships (6 Pro on Foundry 13, 7 Pro on Foundry 14); a class absent from that build draws an empty box.
`size` is required and is `22`, `26`, `30` or `38`, the art ladder.
`glyph` is the ladder's glyph size for that rung: `10`, `11`, `12` or `15`.
`alt` is as for `Avatar`.
`tint` is one of `Avatar`'s tint keys, and it recolours the glyph alone.
`variant` is `''` or `glyph-chip`.
`tone` is `''`, `success`, `danger` or `accent`, and it outranks `tint`.
`ink` is `''`, `success`, `danger` or `neutral`, it outranks `tint`, and it outranks `tone` on the glyph.
A `tone` of `accent` paints the edge, ground and glyph in `--fab-accent-border`, `--fab-accent-soft` and `--fab-accent-text`, and an `ink` of `neutral` inks the glyph alone in `--fab-text-secondary`.
A `variant` of `glyph-chip` draws no edge, so a `tone` shows its ground and glyph alone.
A `tone` or `ink` outside its set draws as `''`, byte-identical to unset.
The glyph is hidden from assistive technology, so a tile without art carries no name: always draw the name as text beside it, and pass `alt: ''` when you set `art`.
The tile is inline: give its `target` `display: flex`, so the tile is a flex item as every Fabricate site draws it.

### FillBar

`FillBar` draws a rounded track with a fill as wide as its value.
`value` is 0–100 and is clamped.
`tone` is `success`, `warning`, `danger`, `info`, `accent` or `neutral`, and defaults to `success`.
`color` is a `var(--fab-…)` colour token reference, and it overrides `tone`.
`density` is `default` or `compact`.
It is decorative: it has no role and no name and reaches no assistive technology, so state the reading as text beside it.
A value that must be announced is a `Meter`.
It draws one fill; a fill in segments is a `Meter`.

### Meter

`Meter` states a value against a maximum to assistive technology, over a `FillBar` track.
`value` is read against `max`.
`max` defaults to 100, and a `max` of zero or less reads full.
`segments` is an array of `{ value?, tone?, color? }`, drawn in order as segments of the one fill; `tone` and `color` are each as `FillBar`'s, and an empty array draws `success`.
Each entry but the last spans its `value`, a finite number of zero or more on the scale of `max`, and stops where the fill ends.
Any other `value` reads 0, a numeric string and `Infinity` included, and a `null` entry reads as `{}`.
The last entry spans the rest of the fill, and its `value` is not read.
An entry that spans 1e-9 or less on the scale of `max` is not drawn, so the segments drawn make up the fill.
That bound is absolute, so a `max` of 1e-9 or less reads every entry as nothing.
A list that draws one segment or none draws one fill: in that segment's paint, or in the first entry's paint when none spans anything, at a reading of 0 or at a `max` of zero or less, which reads full.
The segments run left to right in every writing direction and abut with no gap, and only the fill's two ends are rounded, so two neighbours of one paint read as one segment.
No segment takes a minimum width, so one narrower than a pixel or than the fill's rounded end may not be seen.
The segments are colour and width alone, are not announced, and neighbouring tones can sit under 3:1 against each other, so always state each segment as text beside the meter and in `valueText`; the bar alone never carries the split.
A `segments` that is not an array (`null`, an object, a string or a number) is a fault: Fabricate logs it, empties `target` and the handle goes inert, as [for any published component that faults](#mounting-updating-and-destroying).
Drawing a second or later entry and reading an entry's `value` are additive, and the entry stays at `version` 1.
A Fabricate that predates segments draws the whole fill in the first entry's paint and refuses nothing, and `describe` cannot tell you which one is running, so the text beside the meter carries the segments on either.
`valueText` is the reading, announced in place of the bare number.
Pass `valueText` whenever `max` is not 100 or the unit matters, because without it only the bare `value` is announced.
`label` is required and is the meter's name, drawn visually hidden.
It draws no figure, so the visible reading is yours to draw.

### BandedBar

`BandedBar` draws percentages as bars whose whole fill takes one hue from a fixed ramp.
`rows` is required and is `{ id?, name, percent, fill? }[]`.
`name` is required in every row, `percent` is a whole number 0–100 printed as `<percent>%`, and every `id` is unique.
One row is a meter named by its `name`, which is also its visible caption; several rows are a histogram; an empty `rows` draws nothing.
`fill` is a `FillBar` tone, or a chance-ramp key, from certain to impossible: `guaranteed`, `common`, `uncommon`, `rare`, `very-rare`, `legendary` and `none` (the zero-chance step).
Absent, the row takes the ramp's hue at its `percent` when `direction` is `ascending`, and the risk scale's when it is `descending`.
`direction` is `ascending` or `descending`.
`density` is `default` or `compact`; at `compact` a single row draws the histogram's band row.
In a histogram the bars are hidden from assistive technology and each row is read as its name and its percentage; the list carries no name, so head it with your own text.

### StatBox

`StatBox` draws one figure over a micro-label in a bordered box.
`value` is required and is the formatted figure.
`label` is required.
`icon` is optional Font Awesome classes for a glyph.
`tone` is `default`, `info` or `danger`.
The glyph is hidden from assistive technology and the tone is colour alone, so `label` must say what the figure is and what a `danger` or `info` tone means.

### InfoStrip

`InfoStrip` draws a read-only strip of current values under a kicker.
`label` is required and is the kicker, which names the group.
`facts` is required and is `{ icon?, label?, value }[]`: `icon` is Font Awesome classes for a decorative glyph hidden from assistive technology, `label` and `value` are final display text, and a fact whose meaning rests on its glyph needs a `label`.
A fact takes no other member: `props`, which the component would spread onto the fact as attributes, is dropped from a copy of every fact on `mount` and on `update` and is never written.
A `data-action`, a `class`, a `title` or an `aria-label` there reaches no element, and your own object is unchanged.
Put a hook or a tooltip on your own `target` element, and carry each fact's meaning in its `label` and `value` text.
`badge` is `{ label, tone }` or `null`, with `tone` one of `positive`, `warning`, `danger`, `info`, `neutral` and `accent`.

### Kicker

`Kicker` draws the small upper-case label that heads a block, the component the design system calls a kicker.
`children` is required and is the label, final display text; the component draws it in upper case.
`as` is `p`, `span` or `h3`, and defaults to `p`.
An `update` that changes `as` replaces the kicker's root element; the mount, its handle and its claim on `target` are unchanged.
`tone` is `default` or `accent`.
Its text is its whole name, announced as written, so pass sentence case and never an upper-case literal.
`h3` makes it a level-3 heading, so pass it only where the kicker heads the content beneath it.
It takes no `id`: to name a control or group with it, put the `id` on `target` and point `aria-labelledby` there.
`accent` is colour alone and says nothing.
It clears the 4.5:1 small-text floor on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and not on `--fab-bg-3` or a light fill over `--fab-bg-2`, so draw it on those four grounds.
Drawn as `span` it is an inline mark: give its `target` `display: flex`, so the mark is a flex item as every Fabricate site draws it and `target` is exactly as tall as the mark.
Rest `data-*` is for your own hooks.
Do not pass `data-action`: the window dispatches a click on it (`close` closes the window), which makes a pointer-only control of an element with no role and no focus.
For a tooltip pass `data-tooltip-text`, not `data-tooltip`, which Foundry localises and otherwise reads as HTML; it opens on pointer hover only, so it never says what the label does not.

### Chip

`Chip` draws a short, fully rounded badge that states a count, a state or a category.
`children` is required and is the chip's label, final display text.
`tone` is `positive`, `warning`, `danger`, `info`, `neutral` or `accent`; absent, the chip is drawn in the default ink.
This is `InfoStrip`'s badge set.
`neutral` is the recessive tone and clears 4.5:1 on `--fab-bg-0`, `--fab-bg-1` and `--fab-surface` only.
`density` is `default` or `list`; this is the chip's own set, not `FillBar`'s.
At `list` the label is one line and is never wrapped or clipped, so a label wider than `target` overflows the chip: keep a `list` label short.
At `default` a long label wraps inside the chip.
It is a statement, never a control: it has no role, takes no focus, and its label is read as inline text.
`tone` is colour alone, so the label says the state.
A label changed through `update` is not announced; a live region is yours to provide.
Every other tone, emphasis and density the component draws is private.
The chip is an inline mark: give its `target` `display: flex`, so the mark is a flex item as every Fabricate site draws it and `target` is exactly as tall as the mark.
Rest `data-*` is for your own hooks.
`data-chip-*` names are the chip's own.
Do not pass `data-action`: the window dispatches a click on it (`close` closes the window), which makes a pointer-only control of an element with no role and no focus.
For a tooltip pass `data-tooltip-text`, not `data-tooltip`, which Foundry localises and otherwise reads as HTML; it opens on pointer hover only, so it never says what the label does not.

### Rail

`Rail` draws one section of an inspector column: an optional kicker over your own content.
`label` is optional final display text, drawn as the section's kicker in upper case.
With it the section is a `group` named by it; without it, an unnamed `<section>`, never a landmark.
Pass sentence case.
`children` is a content slot whose element is a `<div>`; the rail draws the content slot's children in a column it spaces, the first a little further below the label.
A child that draws nothing still takes its gap, so remove or hide an empty one.
The rail draws no box, fill or padding.
It is lazy, so `mount('Rail', …)` throws `"Rail" is not loaded` until `load(['Rail'])` has resolved, as [Mounting, updating and destroying](#mounting-updating-and-destroying) describes.
The label takes `Kicker`'s ink, size, weight and tracking, so the same four grounds apply; it inherits `target`'s face and line height, which a `Kicker` states for itself.
It is not a heading.
The rail never moves its content slot while it is requested.
Rest `data-*` is for your own hooks.
Name them for your module, as `data-<module-id>-…`; a name Fabricate writes is private.
Do not pass `data-action`: the window dispatches a click on it (`close` closes the window), which makes a pointer-only control of an element that takes no focus.
For a tooltip pass `data-tooltip-text`, not `data-tooltip`, which Foundry localises and otherwise reads as HTML; it opens on pointer hover only, so it never says what the rail's label and content do not.

### InspectorCard

`InspectorCard` draws the bordered card shell, the design system's card, around your own content.
`children` is a content slot whose element is a `<div>`; the card draws the content slot's children in a column it spaces, inside its own padding, so add neither.
Its fill is `--fab-bg-2` and it states no ink or type, so your content is on that ground and inherits from `target`: a `Kicker` and a `Rail` label clear 4.5:1 there, and a `neutral` `Chip` does not.
It is drawn the same in the Manager, the player window, a Fabricate dialog and, under the [standalone style root](#standalone-style-root), a companion's own window or dialog.
It is an unnamed `<section>` with no role and takes no heading of its own; head its content yourself, for example with a `Kicker`, as `h3` where it heads the whole card.
Never nest a card in a card: the design system has two container levels, and the second is the published [`Well`](#well), which you mount in the card's content slot.
The card's padding, gap, corner and border figures are private, and so is how Fabricate redraws a card inside its own Checks rail and inspectors.
The card never moves its content slot while it is requested.
Rest `data-*` is for your own hooks.
Name them for your module, as `data-<module-id>-…`; a name Fabricate writes is private.
Do not pass `data-action`: the window dispatches a click on it (`close` closes the window), which makes a pointer-only control of an element that takes no focus.
For a tooltip pass `data-tooltip-text`, not `data-tooltip`, which Foundry localises and otherwise reads as HTML; it opens on pointer hover only, so it never says what the content does not.

### EmptyState

`EmptyState` draws the design system's empty state: a dashed panel that says what is absent and holds the way out.
`title` is optional final display text, the short statement of what is absent, drawn as a level-3 heading.
Pass it only where a level-3 heading fits your outline: under a heading for the region the panel sits in, and not inside a card or rail you have yourself headed at level 3.
Where no level-3 heading fits, draw your own heading above the panel and pass `hint` alone.
`hint` is optional final display text, the sentence beneath the title.
Pass a title, a hint or both; with neither the panel is an empty box.
`icon` is optional Font Awesome classes for a glyph tile above the title, hidden from assistive technology; absent, no tile is drawn.
`filtered` is `true` or `false`: `true` draws the plain panel, in the muted ink, with no tile or title, for filters that match nothing, which is not an absence of content, so pass `hint` alone with it.
The hint is plain text, so a search term in it takes no emphasis.
`children` is a content slot whose element is a `<div>`; the panel draws the content slot's children under the hint, centred, in the column it spaces.
It is the way out of the dead end, a control or a link; what is drawn there is your own, and a control you draw there is named by you.
Content there inherits the panel's quiet ink and centred alignment, not `target`'s, so state the ink of any text you draw there.
It has no role and no name and is not a live region: when a list empties in answer to an action, the announcement is yours.
It draws no fill, so it sits on `target`'s ground.
The title inks `--fab-text`, which clears the 4.5:1 small-text floor on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface`, `--fab-bg-2`, `--fab-surface-soft` over `--fab-bg-2` and `--fab-bg-3` in every palette.
The hint inks `--fab-text-muted` on every variant, which clears the 4.5:1 small-text floor on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface`, `--fab-bg-2` and `--fab-surface-soft` over `--fab-bg-2` in every palette.
The title states its own serif face, and the hint inherits `target`'s.
The panel's own figures are private.
The panel never moves its content slot while it is requested.
Rest `data-*` is for your own hooks.
Name them for your module, as `data-<module-id>-…`; a name Fabricate writes is private.
Do not pass `data-action`: the window dispatches a click on it (`close` closes the window), which makes a pointer-only control of an element that takes no focus.
On a component that holds a content slot it also catches every click on what you draw there, since the window takes the nearest `data-action` above the click.
For a tooltip pass `data-tooltip-text`, not `data-tooltip` or `data-tooltip-html`, which Foundry reads as HTML; it opens on pointer hover only, so it never says what the panel's text and content do not.
`data-tooltip-class` and `data-tooltip-direction` on it apply to every tooltip inside its content slot.

### Notice

`Notice` draws the design system's notice: what just happened or is wrong right now, which goes away.
It is not a standing statement: a rule that is always true is not a notice.
It is not a Foundry notification: it is drawn in your element, and `ui.notifications` knows nothing of it.
`title` is required and is the sentence that names what happened, final display text.
`detail` is optional final display text, a second line that says what to do next.
`tone` is `danger`, `warning`, `info` or `success`, and defaults to `danger`.
It repaints the edge, the fill, the glyph and the title; the glyph is hidden from assistive technology and `danger` and `warning` share one, so the title says the state.
`icon` is optional Font Awesome classes for the leading glyph, which is hidden from assistive technology; absent, the tone's own glyph is drawn.
`action` is optional and is `{ label }`, drawing one button after the text; `label` is the button's whole accessible name, final display text.
An `action` with no non-blank string `label`, or with no function to call (`onAction`, or its own `onClick` in a Fabricate caller), draws no button.
Pass no other member: one this line does not state is private, and a function in it throws `"action" must not hold a function`.
`onAction` is an optional callback, called with no argument each time the action button is pressed.
The label is one line, never wrapped or clipped: where the notice is too narrow to hold it beside the text the button drops beneath, and a label wider than `target` overflows the notice, so keep it short.
The button is drawn the same at every tone and takes no tone of its own, so a destructive action says so in `label`.
`danger` reports what is wrong and stops the reader's work; a notice that offers a retry or a resume passes `warning`.
The button has no disabled and no busy state at version 1, and `onAction` is called on every press, a held Enter key included.
Ignore a press you are still handling and, where the wait is perceptible, say so with an `update` to `label`.
Where several notices are shown at once, each `label` says what its action acts on, because the label is the button's whole name and nothing describes it.
It is a live region, `role="status"` with `aria-live="polite"`: a change to its text is announced, and most screen readers also announce one mounted with its text, though some do not, so a notice the reader must not miss also says it in `title`.
An `update` that changes none of its text announces nothing.
Mount it when the thing happens and destroy it when it no longer holds, never as standing text.
Every mount is a new announcement, so when your content is drawn again with nothing new to report (a navigation provider's `mount` called again, a DialogV2 or Handlebars re-render), keep the notice through `update` where its `target` survives and do not mount an unchanged one again.
It moves no focus, and takes none except on its action button and its dismiss control; where the act that caused it also moves focus, move focus first and mount the notice after, because a focus change cancels polite speech.
Several may be shown at once, stacked; Fabricate arbitrates nothing between them, and a notice that interrupts is not published at version 1.
Foundry announces nothing of its own, so nothing else speaks for a notice, and one in a minimised window or behind a modal dialog is not announced.
Fabricate removes no notice on a timer, so if you do, give a notice that carries an action no time limit.
The button's label is part of the live region: an `update` that changes it is announced, by some screen readers together with the whole notice, so change it only to report a change of state.
An `update` that keeps `action` and `onAction` keeps the same button, so focus stays on it.
An `update` that omits `action` or `onAction`, and `destroy`, remove a button that may hold focus, so where it does, move focus first, as [Ownership and theme](#ownership-and-theme) states.
The action button is the first `button` inside `target` and the dismiss control the last, so `target.querySelector('button')` reaches the action and the last of `target.querySelectorAll('button')` the dismissal.
Reach them by that order and not by a `data-notice-*` name, which is the notice's own and private.
In a host that replaces its content on render (DialogV2, a Handlebars part) the action button is a new element after every render: note in `_preRender` whether focus was inside `target` and, after mounting again in `_onRender`, focus the action button.
The keyboard ring is the accent, 2px outside each button and inside the notice's own padding, and clears 3:1 against the notice's fill on the four grounds the label clears.
`dismissable` is optional, `true` or `false`, and draws a dismiss control after the action.
`dismissLabel` is required while `dismissable` is truthy; it names the control and says what is dismissed, and is never white space alone.
`onDismiss` is required while `dismissable` is truthy, and is called with no argument, once, when the control is pressed by pointer, Enter or Space, while it still holds focus.
Escape dismisses nothing.
The control's face is the xmark glyph alone; no tooltip shows its name.
Dismissal is final for the mount.
In `onDismiss`, move focus to the destination [Ownership and theme](#ownership-and-theme) orders, starting at the next control, since the press leads nowhere, and then call `destroy`.
Where no sensible next control exists, focus `target`'s container or the control that opened the notice.
Removing the focused dismiss button drops focus to `body`, where Foundry's Escape closes every open window, so move focus to a control before `onDismiss` returns.
An `update` after dismissal is validated, returns `true` and draws nothing.
Until `destroy`, `target` still holds the mount, so a `mount` into it throws `target already holds a published component`.
A notice is shown again only by a new `mount`, which is a new announcement.
An `update` that clears `dismissable` removes a control that may hold focus, so move focus first.
The title clears the 4.5:1 small-text floor at every tone on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and not on `--fab-bg-3`.
The detail is the muted ink over the tone's fill, and clears that floor in every palette only at `danger`, on `--fab-bg-0`, `--fab-bg-1` and `--fab-surface`.
At `warning`, `info` and `success` the detail falls short of it on `--fab-bg-1`, a Fabricate window's own ground, in up to four of the seven palettes, the default among them; at every tone it falls short on `--fab-bg-2`, so inside an `InspectorCard`, and on `--fab-bg-3`.
So say in `title` whatever the reader must not miss.
The action button's label clears the 4.5:1 small-text floor at every tone, at rest and under the pointer, on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and not on `--fab-bg-3` or on a tinted fill over any of them, so never mount a notice with an action inside a tinted panel of your own.
Its tile is under 3:1 against the notice's fill in every palette, so the label alone marks it as a control: pass a verb phrase.
The dismiss glyph clears 3:1 against its tile at every tone, at rest and under the pointer, on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and not on `--fab-bg-3`.
It inherits `target`'s face, and outside the Manager its button takes Foundry's own button face.
The notice's own figures are private, and so are its `accent` tone and what it draws for a tone outside its set.
Rest `data-*` is for your own hooks.
Name them for your module, as `data-<module-id>-…`; a name Fabricate writes is private.
`data-notice-*` names are the notice's own: a value you pass under one overwrites what the notice writes.
Do not pass `data-action`: the window dispatches every click inside the notice to it (`close` closes the window), each press of its action button among them.
For a tooltip pass `data-tooltip-text`, not `data-tooltip` or `data-tooltip-html`, which Foundry reads as HTML; it opens on pointer hover only, so it never says what the title, the detail and the action's label do not.
It stays open while the pointer is over the action button.

A worked action follows: the bar that holds a stage after a failed check, drawn on its card's own ground and never inside a tinted panel.
It assumes a `target` that outlives your re-renders, as a navigation provider's does; in a DialogV2 or a Handlebars part follow the `_preRender` and `_onRender` line above.

```javascript
// After `load(['Notice'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates the callback refuses `action` and `onAction`: draw your own bar there.
if (fabUi?.describe?.('Notice')?.props.onAction?.kind !== 'callback') return;

const held = { tone: 'warning', title: 'This stage is held by the failed check.' };
let allowing = false;

function onAction() {
  if (allowing) return; // A second press, or a held Enter key, while the write is under way.
  allowing = true;
  notice.update({ ...held, action: { label: 'Allowing another attempt…' }, onAction });
  // Your own world write; where it fails, set `allowing` back and `update` the first label again.
  allowAnotherAttempt();
}

const notice = fabUi.mount('Notice', {
  target,
  props: { ...held, action: { label: 'Allow another attempt' }, onAction },
});

// Later, when the hold has cleared and you have drawn the roll control it gives way to:
// Move focus only where the button holds it: the write that clears the hold reaches every client.
if (target.contains(target.ownerDocument.activeElement)) rollControl.focus();
notice.destroy(); // Fabricate moves no focus.
```

A worked dismissal follows: a notice the reader may close, which hands focus to your own next control.

```javascript
// After `load(['Notice'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates the dismissal refuses these props: draw no dismiss control there.
const dismissing = fabUi.describe('Notice').props.onDismiss?.kind === 'callback';

const saved = fabUi.mount('Notice', {
  target,
  props: {
    tone: 'success',
    title: 'The recipe is saved.',
    ...(dismissing && {
      dismissable: true,
      dismissLabel: 'Dismiss the saved-recipe notice',
      onDismiss() {
        nextControl.focus(); // The press leads nowhere, so focus moves on before the notice goes.
        saved.destroy();
      },
    }),
  },
});
```

### Button

`Button` draws the design system's button: a labelled native `<button>` that is pressed to do one thing.
`children` is required and is the label, final display text, and the button's whole accessible name.
The button hugs its label on one line while it has the room.
Where it is narrower than the label, the label wraps at its spaces inside the button, is never clipped or ellipsised, and the button does not grow taller, so a label that wraps onto more lines than the button holds spills past its top and bottom edges: pass a short verb phrase and give the button the room for one line.
A label of white space alone draws a button with no name, so never pass one.
The button draws no glyph: a leading glyph is not published at version 1, and a glyph-only button is [`IconButton`](#iconbutton).
`onclick` is a required callback, called with no argument each time the button is pressed, each repeat of a held Enter key included.
The key is spelt `onclick`, all lower case, unlike `Notice`'s `onAction`.
`role` is `neutral`, `primary`, `ghost`, `dashed`, `danger` or `warning`, and defaults to `neutral`.
It is the button's visual role and sets no ARIA role: the button is a native `<button>` whatever `role` says.
Each value names a verb, never a colour: `neutral` is the secondary verb; `primary` the leading verb of its cluster, at most one in a cluster; `ghost` the quiet verb that changes no record, never its cluster's leading verb; `dashed` the verb that adds to the list it closes; `danger` the destructive verb; and `warning` the caution verb, which proceeds against a flagged rule or breaks a reference that can be re-made exactly, and destroys nothing.
A verb that both destroys and cautions is `danger`.
A `dashed` label starts with its verb, as "Add tier", because no plus glyph is drawn.
A visual role is drawn and never announced: it reaches no assistive technology, so the label says the verb.
Confirm a destructive press yourself, in a dialog of Foundry's, before anything is written; Fabricate's arm-then-confirm state is private.
`fullWidth` is `true` or `false`.
Give `target` `display: flex`, as for an inline mark: the button then hugs its label, and `true` spans `target`.
In a block `target` a `dashed` button hugs its label too, as every native button does, so only `fullWidth: true` spans `target`.
`disabled` is `true` or `false`.
`true` draws the button as unavailable whatever the visual role, takes the button out of the tab order and stops every press, so `onclick` is not called.
It is for a verb that cannot apply and whose reason the surrounding text already gives: a keyboard or screen-reader user tabs past a disabled button, and it opens no tooltip, so nothing at the button can say why.
A verb the user is refused for a reason stays enabled, and its press answers with the reason, in a `Notice` or a notification of your own.
The unavailable label is not held to the contrast floor.
Never pass `true` while the button holds focus, an `update` made inside `onclick` included, so a press that starts work leaves the button enabled.
Fabricate coerces neither `fullWidth` nor `disabled` to a boolean, so only `true` and `false` are in the contract: the string `'false'` spans `target` and disables the button.
The button has no busy state at version 1.
While a press is being handled leave the button enabled, ignore every further press, a held Enter key's repeats among them, and where the wait is perceptible pass `children` that say so.
A change to a focused button's label is not reliably announced, so announce the outcome yourself, with a `Notice` or a live region of your own.
When the work ends pass the first label again, or move focus and then remove the button.
It is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), a companion's own window or dialog.
It inherits `target`'s face; its size, weight and ink are its own.
Align your own content to the button by centring, never by restating its height.
Your own window or dialog carries no Fabricate root, so the button is drawn there under the standalone style root, and a dialog you open still draws Foundry's own buttons.
It is never a form's submit button: to submit a `<form>` of your own from a press, call that form's `requestSubmit()` in `onclick`.
Two buttons side by side are two mounts in two targets, which you lay out as a wrapping row `--fab-space-2` apart.
A `target` is never Foundry's `.form-footer`, which resizes a button that is its child.
The button is the only focusable element Fabricate draws in `target`, inside the standalone style root in a target with no Fabricate root, so `target.querySelector('button')` reaches it.
An `update` keeps the same button, so focus stays on it; `destroy` removes it, so where it holds focus, move focus first, as [Ownership and theme](#ownership-and-theme) states.
In a host that replaces its content on render the button is a new element after every render, as `Notice`'s is.
The keyboard ring is the accent, 2px wide and 2px clear of the button, so it reaches 4px beyond the button on every side.
Leave that much inside any edge of your own that clips, a scrolling container's among them, and inset a `fullWidth` button's `target` by as much.
The ring clears 3:1 against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and not against `--fab-bg-3`.
The label of an enabled button clears the 4.5:1 small-text floor at rest in every visual role, on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and under the pointer in every visual role but `primary`, which falls short of it there in the `foundry-native` palette.
`ghost` and `dashed` draw no fill, so their label is the muted ink on your target's own ground and clears that floor by the least.
On `--fab-bg-3` every visual role but `primary` falls short of it in at least one palette, and on a tinted fill over any ground `ghost`, `dashed` and `danger` do.
Mount a button on one of those four grounds, never on `--fab-bg-3` and never inside a tinted panel of your own.
`neutral`, `ghost`, `dashed` and `danger` draw an edge under 3:1 against the ground in every palette, so the label alone marks the button as a control: pass a verb phrase.
What the button draws for a `role` value outside its set is private.
So are its height, corner, padding, type size and weight; each visual role's colours and edge beyond what this section states, among them the success family that `primary` is drawn in; and how Fabricate redraws a button inside its own toolbars, rows and inspectors.
`aria-expanded` is `true` or `false`, and is an `aria` prop: Fabricate writes it on the button.
It is for a button whose press shows and hides a region you draw: pass `false` while the region is hidden and `true` while it is shown, in the same `onclick` that shows or hides it, and omit the prop on a button that does no such thing.
Hide the region from assistive technology too, with `hidden` and not by height alone, because a region hidden by height alone is still read, and pass `true` only while the region is shown.
The label is the same in both states, because the attribute says which holds.
Draw the region directly after the button in reading order, so the person who hears "expanded" reaches it with the next move.
Focus stays on the button when the region opens or closes, and before you hide a region that holds focus, move focus to the button, because that focus otherwise falls to the page and the next Escape runs Foundry's dismiss keybinding, which asks Foundry's windows to close.
In Foundry 13 and 14 Foundry reads the attribute nowhere and gives the region no keyboard handling.
While the button holds focus Escape reaches no Foundry keybinding, though a dialog still closes on it, as [Ownership and theme](#ownership-and-theme) states; in Foundry 13 and 14, with focus in the region on an element of yours that Foundry does not count as taking keys (a link, a button outside a form, a `tabindex` container), Escape runs Foundry's dismiss, which, when no drag, menu, context menu or Tour is open, asks every Foundry window to close.
The button draws no chevron and opens nothing itself.
`aria-describedby` is an `aria` prop: Fabricate writes it on the button.
It is the id of one element of your own, or several ids separated by spaces, holding a hint that is visible text beside the button and that adds to the label without repeating it.
Each id must exist in the tree that holds `target` while the button is shown, and the element it names, which may sit beside `target` and need not be inside it, must not be `hidden`, which would still be read to a screen-reader user though a sighted user never sees it; an id that does not exist is skipped and the others are still read.
The hint is then read to a screen-reader user who tabs to the button, and the button's name is still its label alone.
The reason a `disabled` button is unavailable does not go in its hint, because a keyboard user never reaches a disabled button: keep the button enabled and answer the press with the reason, or state the reason in the surrounding text.
Rest `data-*` is for your own hooks.
Name them for your module, as `data-<module-id>-…`; a name Fabricate writes is private.
They land on the button itself, so `data-keyboard-focus`, `data-action`, `data-cursor`, every `data-tooltip` name, and the two names Fabricate's own stylesheet reads off its own buttons, `data-validation-focused` and `data-essence-sort-direction`, are refused with `"<key>" is reserved on Button`.
That includes `data-tooltip-text`, which the sections above advise for a component whose rest lands on a root that is no control: a button opens no tooltip.
The button keeps its own cursor too, so put a hint in the label or in text beside the button, where a keyboard user reads it as well.
Tie a hint in text beside the button to it with `aria-describedby`.
Give the hint element a stable `id` of your own, for example `<p id="acme-notes-hint">`, and pass `'aria-describedby': 'acme-notes-hint'` beside `children`, in the props you give `mount` and each `update`.

A worked way out follows: an empty panel that holds the one verb that fills it.
The panel sits in a target of yours, and the button is judged from the panel's mount, so it is drawn under a standalone style root where that target has no Fabricate root and under none inside a Fabricate window.

```javascript
// After `load(['EmptyState', 'Button'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates `Button` describes none: draw your own way out there.
if (!fabUi?.describe?.('Button')) return;

const panel = fabUi.mount('EmptyState', {
  target, // Any element of yours.
  props: { title: 'No projects yet', hint: 'Create one to start tracking.', children: true },
});
const wayOut = target.ownerDocument.createElement('div');
wayOut.style.display = 'flex'; // The button hugs its label, and the panel centres it.
panel.slot('children').append(wayOut); // Append first: the button's root is judged from here.
fabUi.mount('Button', {
  target: wayOut,
  props: { role: 'primary', children: 'New project', onclick: () => openProjectForm() },
});

panel.destroy(); // Ends the button, then the panel.
```

A disclosure follows: a button that shows and hides a region of your own, and says which through `aria-expanded`.

```javascript
// After `load(['Button'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates the prop refuses it: draw your own control there.
if (fabUi?.describe?.('Button')?.props['aria-expanded']?.kind !== 'aria') return;

// A region you drew beside `target`, in the same Fabricate window.
const region = target.ownerDocument.getElementById('acme-project-notes');
region.hidden = true;
let open = false;
const props = () => ({
  children: 'Project notes', // The same label in both states.
  'aria-expanded': open,
  onclick: () => {
    open = !open;
    region.hidden = !open; // Hidden from assistive technology too.
    disclosure.update(props()); // The same props, and the new `aria-expanded`.
  },
});
const disclosure = fabUi.mount('Button', { target, props: props() });
```

### StatusToggle

`StatusToggle` draws the design system's switch as its button host: a native `<button>` holding a track and a knob, for a setting that is on or off and takes effect when it is pressed.
It exposes the state with `aria-pressed` and states no `role`, so it is a toggle button to assistive technology, and it draws no text of its own.
A choice between two named things is not a switch: draw your own control for it.
`on` is `true` or `false`, and is required: `true` draws the knob at the far end of an accent track, and `false` at the near end of a quiet one.
Fabricate coerces nothing, so only `true` and `false` are in the contract.
The button changes nothing itself: a press reports through `onclick`, and the switch shows the new state when your `update` passes it, which may be after the press returns.
The switch shows no pending state, so if your change takes time, say so in text of your own, and treat a press that arrives before your `update` as another press from the state you last passed.
To refuse the change, pass `on` unchanged and say why in text of your own, so the switch never shows a state you do not hold.
`onclick` is a required callback, called with no argument each time the switch is pressed, each repeat of a held Enter key included.
`ariaLabel` is the switch's name and is required whether or not you pass `aria-labelledby`.
It is final display text, the same in both states, because `aria-pressed` says which holds.
`ariaLabel` names the setting so that "pressed" means the setting is in effect: "Group by category", "Hidden tasks".
It never states a position, so no "on", "off", "show" or "hide" at its start or end, and never a negation such as "Do not group" (which reads "do not group, pressed").
Draw the setting's name as visible text beside the switch, from one string that you also pass as `ariaLabel`, and pass both again in any `update` that changes the text, so the spoken name always contains the words the user sees; the label does not press the switch unless you wire it to `onclick`.
A name of white space alone leaves the switch with no name, so never pass one.
`aria-labelledby` is an `aria` prop: Fabricate writes it on the button.
It is the id of your element that holds the visible name and nothing else, or several such ids separated by spaces, in the tree that holds `target`.
The element may sit beside `target`; it need not be inside it.
When at least one id names an element, that element's text is the switch's name and `ariaLabel` is not read.
When none does, the switch is named by `ariaLabel`, so a mistyped id never leaves it nameless.
`aria-describedby` is an `aria` prop: Fabricate writes it on the button.
It is the id of one element of your own, or several ids separated by spaces, holding a sentence that is visible text beside the switch and that says what the setting does without repeating its name.
Each id must exist in the tree that holds `target` while the switch is shown, and the element it names, which may sit beside `target` and need not be inside it, must not be `hidden`; an id that does not exist is skipped and the others are still read.
The switch has no unavailable state at version 1.
Keep the switch of a setting the user cannot change right now enabled.
Answer its press with the reason, in a `Notice` or a notification of your own, and pass `on` unchanged; do not draw a setting that can never change here as a switch.
Say that a setting is unavailable in the visible text `aria-describedby` points at too, so it is heard when the switch takes focus, not only after a press.
The switch's track is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), a companion's own window or dialog.
Foundry gives a button a minimum height of 2em of its own font size, so in a Foundry window the switch's button is 24px tall at an inherited font size of 12px or less and 2em tall above that; where Foundry resizes buttons by container it follows that rule instead (2rem inside a `.standard-form` or a dialog's button row, 2.5rem for a direct child of a form footer), and the 22px track is centred in the button; give `target` `display: flex` and `align-items: center`, and centre your own label against the switch.
The button is the only focusable element Fabricate draws in `target`, inside the standalone style root in a target with no Fabricate root, so `target.querySelector('button')` reaches it.
An `update` keeps the same button, so focus stays on it while its state changes; `destroy` removes it, so where it holds focus, move focus first, as [Ownership and theme](#ownership-and-theme) states.
The keyboard ring is the accent, 2px wide and 2px clear of the button, so it reaches 4px beyond it on every side; leave that much inside any edge of your own that clips.
The switch states whether it is on to assistive technology with `aria-pressed`; how it looks does not carry the state on its own.
Under forced colours the switch draws in system colours and keeps its state visible.
Give a switch you mount inside a `.tabs` element no `data-group`, because Foundry's `changeTab` writes `aria-pressed` and toggles `active` on every button inside a `.tabs` element of that window whose own `data-group` names the tab group it changes.
Its track and knob sizes, its button's width, its 78px cap, its colours beyond what this section states, and what it draws for an `on` value other than `true` or `false` are private.
Rest `data-*` is for your own hooks; name them for your module, as `data-<module-id>-…`.
They land on the button itself, so `data-keyboard-focus`, `data-action`, `data-cursor`, every `data-tooltip` name, and the two names Fabricate's own stylesheet reads off its own buttons, `data-validation-focused` and `data-essence-sort-direction`, are refused with `"<key>" is reserved on StatusToggle`.
The switch therefore opens no tooltip and keeps its own cursor, so the pointer is shown its name only as your label beside it, and what the setting does goes in text beside it, tied to it with `aria-describedby`.

A worked switch follows: a setting of your own, named by the label you draw beside it.

```javascript
// After `load(['StatusToggle'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates the switch describes none: draw your own control there.
if (fabUi?.describe?.('StatusToggle')?.props['aria-labelledby']?.kind !== 'aria') return;

// Your label beside `target`, in the same Fabricate window: <span id="acme-group-label">Group by category</span>.
const name = target.ownerDocument.getElementById('acme-group-label').textContent;
target.style.display = 'flex';
target.style.alignItems = 'center';
let grouped = acmeSettings.groupByCategory;
const props = () => ({
  on: grouped,
  ariaLabel: name, // The same text the label draws.
  'aria-labelledby': 'acme-group-label',
  onclick: () => {
    grouped = !grouped;
    acmeSettings.groupByCategory = grouped; // Your own state first.
    toggle.update(props()); // Every prop again, with the new `on`.
  },
});
const toggle = fabUi.mount('StatusToggle', { target, props: props() });
```

### Stepper

`Stepper` draws the design system's stepper: a native `<input type="number">` between a decrement and an increment `<button>`, for a number the user types or steps.
The input is the control, so the number is always typeable.
`value` is required and is the finite number the stepper holds.
A `value` that is not a finite number is outside the contract, and what is drawn for it is private.
`ariaLabel` is required and is the input's name, final display text naming the quantity, as "Days to credit".
`decrementLabel` and `incrementLabel` are required and name the two buttons from the same words: "Decrease days to credit", "Increase days to credit".
The buttons' faces are a minus and a plus glyph alone, and no tooltip shows either name.
Draw the quantity's name as visible text beside the stepper, and make `ariaLabel` contain those words.
A name of white space alone leaves the control with no name, so never pass one.
To return focus to a stepper, focus its input, `target.querySelector('input')`.
`min` and `max` are optional finite numbers, the inclusive bounds; an absent one leaves that side open.
`step` is an optional positive number, `1` when absent, which each button press adds or removes exactly; the Up and Down arrow keys and the wheel over the focused input move the input to the next point of the grid `min + k·step`, counted from the browser's step base when `min` is absent, so a number off that grid is reported as such.
Outside this, what is drawn for `min`, `max` or `step` is private.
The arrow keys and the wheel step to the next point on the grid from `min`, which is not always `value ± step`, so check what you are given.
`onChange` is a required callback, called with one argument, a number, each time an edit leaves the input holding a number that differs from `value`: a button press, an arrow key, a turn of the wheel over the focused input, or a keystroke; and again when the input loses focus holding such a number, so if you refused the earlier call you are told again.
Losing focus includes the input leaving the document as its window closes or a Foundry 14 window detaches, so do not assume the window is open when `onChange` runs; a mount you have destroyed reports nothing.
The argument is the number edited, clamped to `min` and `max` and not rounded to `step`, so if you hold whole numbers, round it and pass your own value back.
Pass an accepted value back in the same `onChange` handler, before any `await`; a later `update` draws after the field has shown the held value.
An edit that clamps to `value`, leaves the input empty or leaves it holding no number is not reported.
`onChange` is spelt in camel case, unlike `Button`'s and `StatusToggle`'s `onclick`.
The input changes itself first: what the user types or steps shows at once, and a button press shows the new number when your `update` passes it.
To refuse a number, pass `value` unchanged.
The input shows what was typed until it loses focus, and Fabricate then replaces it with `value`, so say why in a live region of your own.
Fabricate announces nothing when it restores a refused value; explain a refusal in your own live region.
At `min` the decrement button, and at `max` the increment button, is natively disabled and dimmed, which takes it out of the tab order.
Before an `update` that brings `value` to a bound, if the button toward that bound holds focus, move focus to the input, `target.querySelector('input')`, in the same handler.
The stepper has no unavailable state at version 1 beyond its bounds.
Do not draw a quantity the user cannot change right now as a stepper: destroy it, moving focus first if one of its parts holds it, and show the number as text of your own.
Answer a refused edit in text of your own, in a live region.
The input takes the keys a number field takes, Up and Down among them; the buttons are pressed by pointer, Enter or Space and never submit.
The stepper does not catch Escape: the input holds Foundry's keybindings off, so Escape in it closes a window only where [Ownership and theme](#ownership-and-theme) says so.
In a `<form>`, Enter in the input submits it as implicit submission does, with or without a submit button where the input is the form's only text field, and each step fires a bubbling `change` that a form with `submitOnChange` submits on, so mount the stepper in no `<form>`, Foundry's or your own.
`Stepper` takes no rest props, so a `data-*` prop is refused with `"<key>" is not a prop of Stepper`.
`Stepper` is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window that holds `target` in no `<form>`; a DialogV2's content is always a `<form>`, so do not mount the stepper in one, as the sentence on Enter above states; give `target` `display: flex` and align your own label to the stepper by centring.
The input and the two buttons are the only focusable elements inside `target`.
An `update` keeps all three, so focus stays where it is; `destroy` removes them, so where one holds focus, move focus first, as [Ownership and theme](#ownership-and-theme) states.
The keyboard ring is the accent, 2px wide, drawn at the focused input's or button's own edge and inside the stepper's own outer edge, so leave no room for it, provided nothing of your own clips inside the stepper's box.
Its sizes, glyphs, colours, and what it draws for a `value`, `min`, `max` or `step` outside its contract or for `min` above `max` are private.

A worked stepper follows: a number of days to credit, which you hold in whole days and refuse below one.

```javascript
// After `load(['Stepper'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates the stepper describes none: draw your own number field there.
if (fabUi?.describe?.('Stepper')?.props.onChange?.kind !== 'callback') return;

// Your label beside `target`, in the same Fabricate window: <span>Days to credit</span>,
// and a live region of your own for a refusal: <p id="acme-credit-note" aria-live="polite"></p>.
const note = target.ownerDocument.getElementById('acme-credit-note');
target.style.display = 'flex';
target.style.alignItems = 'center';
const MOST_DAYS = 30;
let days = acmeCredit.days;
const props = () => ({
  value: days,
  max: MOST_DAYS,
  ariaLabel: 'Days to credit', // The words your label draws.
  decrementLabel: 'Decrease days to credit',
  incrementLabel: 'Increase days to credit',
  onChange: (next) => {
    const whole = Math.round(next); // The argument is not rounded to the step.
    if (whole < 1) {
      // Pass nothing new: the input shows the typed number until it loses focus, then `days`.
      // Fabricate announces nothing as it restores `days`, so your live region says why.
      note.textContent = 'Credit at least one day.';
      return;
    }
    note.textContent = '';
    const input = target.querySelector('input');
    const focused = target.ownerDocument.activeElement;
    // The increment button disables at the bound, so move focus off it first.
    if (whole === MOST_DAYS && focused !== input && target.contains(focused)) input.focus();
    days = whole;
    acmeCredit.days = days; // Your own state first.
    // Every prop again, with the new `value`, in this handler and before any `await`:
    // a later `update` draws after the field has shown the held value.
    stepper.update(props());
  },
});
const stepper = fabUi.mount('Stepper', { target, props: props() });
```

### SearchField

`SearchField` draws the design system's search field: a native `<input type="search">` inside a `<label>` root that also draws a decorative glyph, for a query that narrows a list already on screen and commits nothing.
The input is the only focusable element inside `target`, so to return focus to the field, focus `target.querySelector('input')`.
`value` is the query, a string, and is `''` when absent.
A `value` that is not a string is outside the contract, and what is drawn for it is private.
It is a `value` prop: the field changes it itself as the user types, and an `update` that omits it keeps the current query, so you need not pass the query back on every `update`.
`onValueChange` is called with two strings, `(next, previous)`, each time an edit of the user's changes the query: a keystroke, a paste or a cut, and a clear the browser makes from the field's cancel button or on Escape, which reports `''`.
Whether the browser draws a cancel button or clears on Escape is the browser's: Chromium, and so Foundry's desktop app, does both.
It is not called by `mount`, `update`, Enter or the field losing focus.
To refuse or transform a query, pass the query you keep back through `update` before the call returns, and the field shows it before the user's `input` event has finished dispatching; the replaced query moves the caret to the end and ends any IME composition in progress.
`placeholder` is optional final display text shown while the field is empty, and is not the field's name.
`ariaLabel` is required and is the input's name, final display text naming what is searched, as "Search recipes".
The field draws no caption, so draw the same words as visible text beside it, and never pass a name of white space alone, which leaves the control with no name.
The field has no `name`, so it adds nothing to a form's data, and a form with `submitOnChange` still submits on the bubbling `change` the input fires when it loses focus after an edit.

- Enter in the input, outside IME composition, cancels the implicit submission of the `<form>` the input is in, so the field never submits a form, and reports nothing.
- In a DialogV2 that wants Enter to confirm, handle Enter in your own listener above `target`, because the field cancels the form's implicit submission.
- It stops the propagation of no key: every key reaches your listener above `target`, the input holds Foundry's keybindings off, and Escape closes a window only where [Ownership and theme](#ownership-and-theme) says so.
- In a DialogV2, Escape closes the dialog, because the dialog listens for it on its own element; whether the query is cleared first is not stated; stop it in your own `keydown` if you must keep the dialog open.

Rest `data-*` props land on the `<label>` root, never on the input, so no rest name is reserved.
`SearchField` is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window or dialog, as the default 38px shell at radius 9; it fills the width of `target`, so give `target` `display: flex`.
The keyboard mark is the design system's text-field variant for a field whose wrapper draws the box: while the input holds focus the shell's 1px border takes the accent and the input draws no ring of its own, so leave no room for one.
An `update` keeps the input, so focus and the caret stay where they are unless the query is replaced; `destroy` removes it, so where it holds focus, move focus first, as [Ownership and theme](#ownership-and-theme) states.
Its sizes beyond its height and corner, its glyph and colours beyond what this section states, and what it draws for a `value` that is not a string are private.
`label`, `ariaLabelledBy`, `density`, `icon`, `onChange` and `inputProps` are not published at version 1, so a `class` or any of those is refused as a rest prop.

A worked search field follows: a filter over your own list of recipes, which you hold trimmed.

```javascript
// After `load(['SearchField'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates the value prop describes no search field: draw your own there.
if (fabUi?.describe?.('SearchField')?.props.value?.kind !== 'value') return;

// Your text above `target`, in the same Fabricate window: <span>Search recipes</span>.
target.style.display = 'flex';
const props = () => ({
  ariaLabel: 'Search recipes', // The words your text draws.
  placeholder: 'Name or tag',
  onValueChange: (next) => {
    const kept = next.trimStart(); // Your own rule for the query.
    if (kept !== next) search.update({ ...props(), value: kept }); // Before any `await`.
    acmeRecipes.filter(kept); // Your own list narrows; the field commits nothing.
  },
});
const search = fabUi.mount('SearchField', { target, props: props() });
// Later, to clear the query from your own reset control:
search.update({ ...props(), value: '' }); // Draws `''` without calling `onValueChange`.
const query = search.value('value'); // The query the field holds now.
```

### Select

`Select` draws the design system's select: a `<button>` trigger with `role="combobox"` that opens a list of options in an overlay, for one choice from a short, known set that commits as it is made.
The trigger is the only focusable element inside `target`, so to return focus to the select, focus `target.querySelector('button')`.
`options` is required and lists the choices in drawn order, each `{ value, label }`: `value` is a string or a number, unique as a string, and `label` is required final display text, the option's whole accessible name and what the trigger shows while it is chosen.
Two values that are the same string, such as `1` and `'1'`, are outside the contract, because the list cannot draw two rows that share one.
Opening the list then ends the mount as a fault, which empties `target` and reports to `onFault`, as [Mounting, updating and destroying](#mounting-updating-and-destroying) states.
A member other than `value` and `label` is private, and an empty `options`, which `mount` and `update` both accept, opens a list that draws nothing and says nothing, so do not offer an empty select.
`value` is the chosen option's `value`, matched by `===`, so `25` and `'25'` differ; absent, `null`, or matching no option, the trigger shows `placeholder`.
A `value` that is neither a string, a number nor `null` is outside the contract, and what is drawn for it is private.
`onChange` is a required callback, called with one argument, the chosen option's `value` exactly as `options` passed it, so a number stays a number, each time the user chooses an option by pointer or by Enter, the option already chosen included.
It is not called by `mount`, `update`, opening or closing the list, Escape or an outside press.
The select changes nothing itself: the trigger shows the new choice when your `update` passes it as `value`, so to refuse a choice, pass `value` unchanged.
`ariaLabel` is required and names the trigger and its list, final display text naming the choice, as "Rows per page".
The select draws no caption, so draw the same words as visible text beside it, and never pass a name of white space alone, which leaves the control with no name.
`placeholder` is optional final display text the trigger shows while no option is chosen, and is not the select's name.
`size` is `form`, `inline` or `toolbar`, and defaults to `form`: the 38px trigger on `--fab-surface-soft`, the 30px trigger on `--fab-bg-2` for a row, and the 34px trigger on `--fab-bg-1` for a toolbar, each with its own list width.

- A press on the trigger opens the list and a second press closes it; Enter and Space press the trigger as they press any button, except that Enter while an option is active chooses it and Space inside a run of typed characters is typed.
- While the list is closed, ArrowDown and Home open it at its first option, ArrowUp and End at its last, Alt with ArrowDown opens it with no option active, and a printable character opens it at the next option whose label starts with what has been typed.
- While it is open, ArrowUp, ArrowDown, Home, End and a printable character move the active option, which the trigger names with `aria-activedescendant`, and Enter chooses it; focus stays on the trigger throughout, and the chosen option carries a tick and a fill.
- Escape and a press outside the list close it without choosing; a choice closes it and returns focus to the trigger.
- The trigger stops the propagation of every key but Tab, with or without Shift, pressed while it holds focus, so your listener above `target` hears Tab and no other key from it, and while the trigger holds focus Foundry's Escape keybinding closes no window, an open ApplicationV1 `Dialog` included, because that dialog listens for Escape on the document, which the key never reaches.
- In a DialogV2, Escape on the trigger does not close the dialog; handle Escape in your own listener on the trigger or move focus first.
- Tab and Shift+Tab close an open list without calling `onChange` and move focus as the browser does, and your listener above `target` hears the Tab.
- The list also closes without choosing, moving no focus, once focus moves to an element outside the trigger and the list; focus leaving the browser window, or moving between the main window and a detached one, closes nothing (issue 2598).
- A press on the trigger does not bubble out of it as a `click`, and a press inside the open list does not bubble out of the list, so your `click` listener above `target` or on the `overlayHost` hears neither.

The list is the component's overlay, so `describe('Select').overlays` is `true`, and it is drawn in the host [Overlays](#overlays) picks when it opens.
Pass an `overlayHost` inside the same Fabricate window, or none, because the list's hidden live region is clipped only under a `.fabricate` ancestor; in your own window or dialog pass none, and the list opens on the standalone layer.
The list opens against the trigger, and its placement inside the host is private.
`Select` takes no rest props, so a `data-*` prop is refused with `"<key>" is not a prop of Select`.
Its trigger's height, corner, type size, weight and fill are drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window or dialog, and its typeface and line height are inherited under the Manager and are Foundry's own button face elsewhere, as for every select of Fabricate's own; its open list is drawn the same on the standalone layer as in the player window.
The keyboard mark is the trigger's own: while it holds focus by keyboard its 1px border takes `--fab-accent-border` and no ring is drawn, so leave no room for one.
An `update` keeps the trigger, so focus stays on it, and an `update` while the list is open redraws the list in place; `destroy` removes the trigger and closes the list, so where the trigger holds focus, move focus first, as [Ownership and theme](#ownership-and-theme) states.
Foundry 14 gives you no signal when it moves a Fabricate window to or from a detached window, and a select needs none: each list opened after the move is placed and heard in the window that then holds the trigger, as [Overlays](#overlays) states.
Its sizes beyond each rung's height and corner, its tick, chevron and colours beyond what this section states, what it draws for a member of `options` other than `value` and `label` or for a `value` outside its contract, and the list's placement and width are private.
`label`, `hint`, `error`, `ariaLabelledBy`, `ariaDescribedBy`, `id`, `name`, `showTick`, `minWidth`, `maxWidth`, `triggerProps`, `triggerTitle`, `readonly`, `disabled`, `invalid`, `mono` and `icon` are not published at version 1, so a `class` or any of those is refused with `"<key>" is not a prop of Select`.

A worked select follows: a page size for your own list of recipes, which you hold as a number.

```javascript
// After `load(['Select'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates the select describes none: draw your own control there.
if (fabUi?.describe?.('Select')?.overlays !== true) return;

// Your text beside `target`, in the same Fabricate window: <span>Rows per page</span>.
target.style.display = 'flex';
let pageSize = acmeRecipes.pageSize;
const props = () => ({
  options: [
    { value: 10, label: 'Ten rows' },
    { value: 25, label: 'Twenty-five rows' },
  ],
  value: pageSize,
  ariaLabel: 'Rows per page', // The words your text draws.
  size: 'inline',
  onChange: (next) => {
    pageSize = next; // A number, as `options` passed it.
    acmeRecipes.setPageSize(pageSize); // Your own state first.
    select.update(props()); // Every prop again, with the new `value`.
  },
});
// Omit `overlayHost` to draw the list in the Fabricate window around `target`.
const select = fabUi.mount('Select', { target, props: props() });
```

### StageBars

`StageBars` draws how far a staged process has come: one bar per stage, side by side, in a `group`, each bar a `progressbar` with its own value; it draws no control.
`stages` is required and lists the stages in drawn order, each `{ name?, label?, valueText?, value }`: `value` is the stage's fill, 0–100 and clamped, `name` is final display text drawn as the stage's caption while `numbered`, and `label` is final display text that names the stage's bar.
A bar is named by its stage's `label`, else its `name`, else, in a list of one stage only, by the group's own name.
So in a list of two or more stages each stage requires a `label` or a `name`: a stage with neither has no accessible name, which Fabricate does not refuse.
`valueText` is final display text the bar announces as its reading in place of its percentage, as "40%, stage 3 of 4", so state the percentage in it too.
A stage whose `valueText` is absent, `''` or not a string announces its percentage.
Pass a non-blank string, because one of only spaces is written as it stands rather than replaced by the percentage.
Naming `valueText` is additive, and the entry stays at `version` 1.
A Fabricate that predates it ignores it and announces the percentage, and `describe` cannot tell you which one is running.
A member other than `name`, `label`, `valueText` and `value` is private, `id` among them, and an empty `stages` draws the named group with no bar.
`currentIndex` is the index of the stage being worked, and defaults to `0`: its bar carries `aria-current="step"` and takes the accent until it fills, a filled bar takes the success tone, and every other bar the neutral one.
`numbered` is `true` or `false`, and defaults to `true`: while it is `true` each bar draws a caption beneath it, hidden from assistive technology, holding its position counted from `1` and then its `name`; a stage with no `name` draws its position alone.
A caption is drawn on one line and cut off with an ellipsis where it is wider than its bar, so keep each name short.
Each caption carries its stage's `name` as its native tooltip (`title`), so a name the ellipsis cuts is shown whole under the pointer.
A caption with no `name` carries none.
`ariaLabel` is required and names the group, final display text, as "Forging progress".
It also names the one bar of a one-stage list whose stage has no label or name.
Rest `data-*` attributes land on the group root.
`StageBars` needs no Fabricate ancestor, so its root is `any`, and it draws the same under any ancestor.
It is not a live region: an `update` redraws the bars in place and announces nothing.
Its track height and corner, its gaps, its caption's face, size and ink, each tone's colours, and what it draws for a `currentIndex` outside the list are private.
`ariaLabelledBy` is not published at version 1, so it is refused with `"ariaLabelledBy" is not a data attribute`.

A worked stage group follows: the stages of your own forging project, each named by its own title and read with its position.

```javascript
// After `load(['StageBars'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
if (!fabUi?.components.includes('StageBars')) return;

// Your heading above `target`: <h3>Forging progress</h3>.
const props = () => ({
  ariaLabel: 'Forging progress', // The words your heading draws.
  currentIndex: acmeForge.stage,
  stages: acmeForge.stages.map((stage, index, all) => ({
    name: stage.title,
    value: stage.percent,
    // Your own words; they replace the percentage, so they state it too.
    valueText: `${Math.floor(stage.percent)}%, stage ${index + 1} of ${all.length}`,
  })),
});
const bars = fabUi.mount('StageBars', { target, props: props() });
// After your own stage advances, pass every prop again.
bars.update(props());
```

### Field

`Field` draws the design system's field: the column that stacks a caption over the control it heads, for one labelled entry of a form you draw.
It draws no control, no caption and no text of its own: draw your caption and your control in its content slot.
`as` is required and is `div`, the one host published at version 1; what it draws for any other value is private.
A `div` field names no control, so give your caption an `id` and point the control's `aria-labelledby` at it.
`children` is a content slot whose element is a `<div>`; the field draws the content slot's children in a column it spaces, in the order you append them: the caption first, the control beneath it.
The column states `--fab-text` ink at 12.5px and weight 500, which your content inherits, and a text input or textarea there inherits its face from it.
The caption is a child of the content slot's element, never of the column, so Fabricate's sheet draws it in the column's type, never as a kicker.
Fabricate's own fields caption in the kicker type, so to match them mount a published `Kicker` with `as` `span` into your caption `<span id>` and give that span `display: flex`, which keeps the `id` on your element and the span exactly as tall as the kicker, as [Kicker](#kicker) states.
A text-like `<input>`, one whose `type` is `text`, `url`, `email`, `tel` or `password` or is absent, and a `<textarea>` you draw in the slot take the field's chrome: the width of the column, a 1px `--fab-border` edge on a `--fab-bg-1` fill and `--fab-text` ink, a 38px input at radius 9, and a textarea at least 92px tall that resizes vertically.
A `<small>` there takes the muted ink, for a hint beneath the control.
Give the hint an `id` and add it to the control's `aria-describedby`, so the hint is read with the control.
A published control you draw there is drawn as it is in Fabricate's own fields, and what the chrome draws on any other `<input>` is private.
The keyboard ring of a text-like input or a textarea in the slot is the accent, 1px wide and inset 1px, so it is drawn over the control's own edge and you leave no room for it.
It clears 3:1 against the control's `--fab-bg-1` fill in every palette, and against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2` beyond its edge, and not against `--fab-bg-3`, where two palettes fall short, so draw the field on those four grounds.
Rest `data-*` attributes land on the column root.
`Field`'s column and chrome come from Fabricate's module sheet, and it is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window or dialog.
Fabricate draws nothing focusable in the field: an `update` keeps the column and its content slot, so focus stays on a control you drew there; `destroy` removes them, so where that control holds focus, move focus first, as [Ownership and theme](#ownership-and-theme) states.
The field never moves its content slot while it is requested.
Its gap, its type figures beyond the column's, the chrome's figures and colours beyond what this section states, and how Fabricate redraws a field and its control in its own rows, cards and rails are private.
The `label` and `fieldset` hosts of `as`, and a caption of its own, are not published at version 1.
A `class`, `label` or `caption` is refused because a rest key must be a `data-*` attribute.

A worked field follows: a caption, a text input and a hint of your own, for the name of a recipe you hold.

```javascript
// After `load(['Field', 'Kicker'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
if (!fabUi?.components.includes('Field')) return;

const field = fabUi.mount('Field', { target, props: { as: 'div', children: true } });
const slot = field.slot('children');
const caption = document.createElement('span');
caption.id = 'acme-recipe-name-caption'; // Unique in the document.
caption.style.display = 'flex';
const hint = document.createElement('small');
hint.id = 'acme-recipe-name-hint';
hint.textContent = 'Shown on the recipe card.';
const input = document.createElement('input');
input.type = 'text';
input.setAttribute('aria-labelledby', caption.id);
input.setAttribute('aria-describedby', hint.id);
input.value = acmeRecipe.name;
slot.append(caption, input, hint);
// The caption in the kicker type, named by the id on your own span.
fabUi.mount('Kicker', {
  target: caption,
  props: { as: 'span', children: 'Recipe name' },
});
// `field.destroy()` also destroys the kicker mounted in its content slot.
```

### Well

`Well` draws the design system's well, the container level below a card, for a group of related content inside a card's content slot.
It draws no control and no text of its own but its label.
`label` is optional final display text, drawn as the well's kicker in upper case above your content.
With it the well is a `group` named by it, so a screen reader may read the label twice, as the group's name and as the kicker's text; without it, an unnamed `<div>` with no role.
Pass sentence case.
`children` is a content slot whose element is a `<div>`; the well draws the content slot's children in normal flow below its kicker, with no gap of its own, inside its own padding, so add no padding.
Fill the slot with one element of your own that lays out and spaces your content, as [Mounting, updating and destroying](#mounting-updating-and-destroying) states.
Children you append to the slot directly, not inside that one element, lay out in ordinary block and inline flow: inline ones share a line and block ones keep their own margins.
The label is drawn by a `Kicker` as `p`, so [Kicker](#kicker)'s type and grounds apply; it is not a heading.
Its fill is `--fab-bg-1` inside a 1px `--fab-border` edge, or `--fab-bg-2` inside a Fabricate dialog.
A Fabricate dialog is the dialog Fabricate draws itself in its own window, or the `Modal` you mount, whose body is itself `--fab-bg-1`; a Foundry DialogV2 is not one.
It states no ink or type, so your content inherits the Fabricate window's ink from `target`, and a `Kicker` clears 4.5:1 on either fill.
Never nest a well in a well: the design system has two container levels, the card and the well.
Fabricate does not refuse a well nested in a well; this section only says not to.
Rest `data-*` attributes land on the well's root.
Do not pass `data-action`: the window dispatches a click on it (`close` closes the window), which makes a pointer-only control of an element that takes no focus.
`Well` is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), a companion's own window or dialog, but for its fill inside a Fabricate dialog.
The well never moves its content slot while it is requested, and an `update` that adds or drops `label` keeps the slot in place.
Fabricate draws nothing focusable in the well: an `update` keeps the well and its content slot, so focus stays on a control you drew there; `destroy` removes them, so where that control holds focus, move focus first, as [Ownership and theme](#ownership-and-theme) states.
Its padding and corner figures, the space below its label, and how Fabricate draws a well in its own option groups and roll prompt are private.
A `class` is refused because a rest key must be a `data-*` attribute.

A worked well follows: a labelled group of the reagents you hold for a batch, in a card mounted in a target of yours, for example in an extension target or a window of your own.

```javascript
// After `load(['InspectorCard', 'Well'])` has resolved and `fabricate.ready` has fired.
// `target` is any element of yours, in a Fabricate window or in a window of your own.
const fabUi = game.fabricate?.api?.ui;
if (!fabUi?.components.includes('Well')) return;

const card = fabUi.mount('InspectorCard', { target, props: { children: true } });
const wellTarget = document.createElement('div');
card.slot('children').append(wellTarget); // The well's place, inside the card.
const well = fabUi.mount('Well', {
  target: wellTarget,
  props: { label: 'Chosen reagents', children: true },
});
// One element of your own lays out and spaces what the well holds.
const content = document.createElement('div');
content.style.display = 'flex';
content.style.flexDirection = 'column';
content.style.gap = '8px';
for (const reagent of acmeBatch.reagents) {
  const line = document.createElement('p');
  line.style.margin = '0'; // Foundry's own paragraph margin would add to the gap.
  line.textContent = reagent.name;
  content.append(line);
}
well.slot('children').append(content);
// `card.destroy()` also destroys the well mounted in its content slot.
```

### Callout

`Callout` draws the design system's callout: a standing statement, a rule or fact that is always true and stays put, beside a leading glyph in a rounded strip.
It is never a live region and announces nothing, on mount or on `update`: a note the reader must hear when it appears is a [`Notice`](#notice).
`tone` is `neutral`, `info`, `accent`, `warning`, `success` or `danger`, and defaults to `neutral`; a tone outside that set draws `neutral`, so a tone added later is additive.
`info` is a standing note about live state, `warning` a hazard the reader can still avoid, `danger` a standing consequence and `success` a standing confirmation; `accent` is colour alone and says nothing.
It repaints the edge, the fill, the glyph and the title, and the body keeps its muted ink at every tone.
Colour is never the only carrier and the glyph is hidden from assistive technology, so say the state in words in your title, text or items; the glyph each tone draws by default is private and two tones may share one, so the glyph never tells tones apart.
`title` is optional final display text, a short line drawn above the text.
It is not a heading.
`text` is optional final display text, the note's sentence.
`icon` is optional Font Awesome classes for the leading glyph, hidden from assistive technology; absent, the tone's own glyph is drawn.
`items` is optional and is an array of `{ icon, lead, text }` points drawn under the body as a list: `lead` and `text` are final display text, the lead inked `--fab-text` before the text, and `icon` is Font Awesome classes for the point's glyph, hidden from assistive technology and inked as the leading glyph.
Every member of an item is optional and draws nothing when absent or empty, an item that is not an object is skipped, and a value that is not an array draws no list.
Pass no other member: one this line does not state is private, and a function in it throws `"items" must not hold a function`.
The lead and the text are drawn one space apart, so punctuate the lead where the run would be ambiguous, as `Moonpetal:` before `one held, two needed`.
An item with no `icon` releases the glyph column, so its text starts left of its glyph-led siblings', so give every item of a list an `icon`, or none.
`actions` is a content slot whose element is a `<span>`, drawn inside the strip after the body, so a note and the control that answers it are one object.
Its host is a row that spaces the content slot's children by `gap`, centres them on one line and never shrinks; unlike a `Notice`'s action it never drops beneath the body, so the body narrows to make room and a long label squeezes it: keep what you draw there short.
Fill it with phrasing content, a `<span>` for a mount target, for example of a published [`Button`](#button); content there inherits the strip's muted ink and type.
A published `Button`'s focus ring clears 3:1 against every tone's fill on the four grounds named below.
Give that button the `neutral`, `primary`, `warning` or `danger` role, never `ghost` or `dashed`, whose transparent face draws the label in the muted ink, which falls short on a tinted fill as the body does.
It draws a `<p>` with no role unless it draws a `title`, an item or the `actions` slot, and then a `<div>` with `role="note"`, because a paragraph cannot hold them.
With none of `title`, `text` and `items` the strip is a bare glyph that says nothing, so never mount a callout without one of them; with `actions` alone it is a note holding just your control.
An `update` that moves it between the two replaces its root element; the mount, its handle and its claim on `target` are unchanged, and while `actions` is requested the root stays the `<div>`, so no `update` moves the slot.
Its ink and fill are its own, so its root is `any` and it needs no Fabricate ancestor: the body inks `--fab-text-muted` on the tone's translucent fill over `target`'s ground, and the title inks `--fab-text` at `neutral` and the tone's own text ink otherwise; it inherits `target`'s face.
The title, an item's lead and the glyphs clear their floors, 4.5:1 for text and 3:1 for a glyph, at every tone in every palette on `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and the title does not on `--fab-bg-3`, so draw a callout on those four grounds.
On a light ground, such as Foundry's light application theme or a light-themed chat card, the translucent fills barely tint it and none of its text clears 4.5:1, so in a window of your own paint `--fab-bg-1` on `target`.
The body, its text, each item's text and text you draw in `actions`, which inherits the same ink, is the muted ink over the tone's fill: it clears 4.5:1 in every palette at `neutral` on those four grounds, at `danger` on `--fab-bg-0`, `--fab-bg-1` and `--fab-surface`, and at `success` on `--fab-bg-0`.
In the default palette alone it falls short on `--fab-bg-1`, a Fabricate window's own ground, and on `--fab-surface`, at `info` (4.20:1), `accent` (4.08:1), `warning` (4.14:1) and `success` (4.27:1), and on `--fab-bg-0` at `info` (4.49:1), `accent` (4.36:1) and `warning` (4.42:1).
At every tone but `neutral` it falls short on `--fab-bg-2`, so inside an [`InspectorCard`](#inspectorcard), in up to six of the seven palettes, the default among them; so say in `title` whatever the reader must not miss.
Rest `data-*` attributes land on the root.
Name them for your module, as `data-<module-id>-…`; `data-callout-*` names are the note's own and private, so pass none: a value under one the note writes overwrites it.
Do not pass `data-action`: the window dispatches a click on it (`close` closes the window), which makes a pointer-only control of an element that takes no focus.
Fabricate draws nothing focusable in the note: an `update` that keeps `actions` keeps its slot, so focus stays on a control you drew there; one that omits `actions`, and `destroy`, remove that control, so where it holds focus, move focus first, as [Ownership and theme](#ownership-and-theme) states.
Its padding, corner, edge, gap and type figures, the glyph each tone draws by default, and how Fabricate lays a callout out in its own entries and cards are private.
A `class` is refused because a rest key must be a `data-*` attribute.

A worked note follows: the reagents a batch still lacks, with the control that answers it in the strip, mounted in a target of yours, for example in an extension target or a window of your own.

```javascript
// After `load(['Callout', 'Button'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
if (!fabUi?.components.includes('Callout') || !fabUi.components.includes('Button')) return;

const note = fabUi.mount('Callout', {
  target,
  props: {
    tone: 'warning',
    title: 'Two reagents run short',
    items: [
      { icon: 'fas fa-leaf', lead: 'Moonpetal:', text: 'one held, two needed' },
      { icon: 'fas fa-fire', lead: 'Ember salt:', text: 'none held' },
    ],
    actions: true,
  },
});
// A `<span>` mount target in the actions slot, a flex box so it is exactly as tall as the button.
const buttonTarget = document.createElement('span');
buttonTarget.style.display = 'flex';
note.slot('actions').append(buttonTarget);
fabUi.mount('Button', {
  target: buttonTarget,
  props: { role: 'neutral', children: 'Open the shopping list', onclick: () => acmeShop.open() },
});
// `note.destroy()` also destroys the button mounted in its actions slot.
```

### IconButton

`IconButton` draws the design system's icon button: a native `<button type="button">` whose face is a glyph alone, for a verb its glyph says where a label does not fit, as a row's remove control.
A verb that needs its word to be understood is a published [`Button`](#button).
`icon` is required and is the Font Awesome classes of the glyph, as `fas fa-trash`, drawn as an `<i>` hidden from assistive technology; it is the button's whole face.
`ariaLabel` is required and is the button's name, final display text naming the verb and what it acts on, as "Remove Iron ingot".
It is the button's whole accessible name and its tooltip, so a sighted user who cannot read the glyph is shown the words a screen reader speaks.
A name of white space alone leaves the button with no name and an empty tooltip, so never pass one.
`role` is `neutral`, `primary`, `ghost`, `danger` or `ghost-danger`, and defaults to `neutral`; a role outside that set draws `neutral`.
It is the button's visual role and sets no ARIA role: the button is a native `<button>` whatever `role` says.
Each value names a verb, never a colour: `neutral` is the secondary verb; `primary` the leading verb of its cluster; `ghost` the quiet verb, drawn with no edge or fill at rest, for a control repeated on every row of a list; `danger` the destructive verb; and `ghost-danger` the destructive verb repeated on every row, as a row's delete.
A visual role is drawn and never announced, so a destructive role needs the verb in `ariaLabel`: "Delete Iron ingot", never "Iron ingot".
Confirm a destructive press yourself, in a dialog of Foundry's, before anything is written.
`size` is `''`, `'24'` or `'26'`, a string, and defaults to `''`: `''` draws the default rung, and `'24'` and `'26'` a square of that many pixels at every role; what it draws for any other value is private.
`disabled` is `true` or `false`.
`true` draws the button as unavailable, takes it out of the tab order and stops every press, so `onclick` is not called.
Fabricate coerces no `disabled` to a boolean, so only `true` and `false` are in the contract.
Never pass `true` while the button holds focus, as [Ownership and theme](#ownership-and-theme) states.
`onclick` is a required callback, called with no argument each time the button is pressed, each repeat of a held Enter key included.
`aria-expanded` is `true` or `false`, and is an `aria` prop: Fabricate writes it on the button.
It is for a button whose press shows and hides a region you draw, as the [`Button`](#button) section states; the name is the same in both states, and you omit the prop on a button that does no such thing.
Its glyph may follow the state: pass the other `icon` in the same `update`, as `fas fa-chevron-up` while the region is shown.
The tooltip is `ariaLabel`, plain text that is never read as HTML.
Fabricate writes it as `data-tooltip-text` on the button in every mount, and Foundry's own hover listener shows it after a delay while the pointer rests on the button.
Under keyboard focus, and only under `:focus-visible`, Fabricate opens the same tooltip itself through `game.tooltip`, which it reads when the focus arrives, and closes it on blur, a press, Escape, `destroy` and an `update` that changes `ariaLabel` or passes `disabled: true`; it closes only its own tooltip, and Escape still reaches a `keydown` listener of yours above `target`.
While either tooltip is open, the one hover shows or the one keyboard focus opens, Foundry sets `aria-describedby` to `tooltip` on the button and removes it when the tooltip closes, so a screen reader may read the name a second time as its description.
You cannot suppress that second reading at version 1, so keep `ariaLabel` a short verb phrase.
Rest `data-*` is for your own hooks.
Name them for your module, as `data-<module-id>-…`; a name Fabricate writes is private.
They land on the button itself, so `data-keyboard-focus`, `data-action`, `data-cursor`, every `data-tooltip` name, and the two names Fabricate's own stylesheet reads off its own buttons, `data-validation-focused` and `data-essence-sort-direction`, are refused with `"<key>" is reserved on IconButton`.
That includes `data-tooltip-text`, so the tooltip says only what `ariaLabel` says.
`data-locked` is refused the same way, because Foundry pins a copy of any tooltip it opens on an element carrying `data-locked`, and the closes this section states never reach that copy.
Its face and ring come from Fabricate's module sheet, and it is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), a companion's own window or dialog.
Give `target` `display: flex` and align your own content to the button by centring.
The button is the only focusable element Fabricate draws in `target`, inside the standalone style root in a target with no Fabricate root, so `target.querySelector('button')` reaches it.
An `update` keeps the same button, so focus stays on it; `destroy` removes it, so where it holds focus, move focus first, as [Ownership and theme](#ownership-and-theme) states.
The keyboard ring is the accent, 2px wide and 2px clear of the button, so it reaches 4px beyond the button on every side; leave that much inside any edge of your own that clips.
The ring clears 3:1 against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2` in every palette, and falls short against `--fab-bg-3` in two, so mount the button on one of those four grounds.
Its default rung's side, its corner and glyph size, each role's colours and edge beyond what this section states, the delay before Foundry shows its hover tooltip, and how Fabricate redraws an icon button in its own rows, pager and inspectors are private.
A `class`, a `tooltip` of its own and content beside the glyph are refused, because a rest key must be a `data-*` attribute.

A worked row control follows: the remove control at the end of a row you draw inside a Fabricate window, for example in an extension target.

```javascript
// After `load(['IconButton'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates `IconButton` describes none: draw your own control there.
if (!fabUi?.describe?.('IconButton')) return;

const remove = fabUi.mount('IconButton', {
  target, // Inside a Fabricate window, at the end of your row.
  props: {
    icon: 'fas fa-trash',
    ariaLabel: `Delete ${reagent.name}`, // The verb and its object: the role is never announced.
    role: 'ghost-danger',
    size: '26',
    onclick: () => acmeReagents.confirmDelete(reagent.id), // Confirm in a dialog of Foundry's.
    'data-acme-reagent': reagent.id,
  },
});

// `remove.destroy()` when the row goes away, moving focus first if the button holds it.
```

### EditorTabs

`EditorTabs` draws the design system's tab strip (`<TabBar>` in the library): a `role="tablist"` row of native `<button type="button">` tabs, one for each item of `tabs`, for moving between panels you draw.
It draws no panel, and no mark, padlock or description on a tab.
`tabs` is required and is an array of `{ id, label, icon }` items, one tab each, drawn in that order.
Each `id` is required and is an id-safe token of letters, digits, `-` and `_`, unique in the strip, as `inputs`; Fabricate builds ids from it and checks nothing about it.
Each `label` is required and is final display text, the tab's whole visible text and its accessible name; a label of white space alone leaves the tab with no name, so never pass one.
Each `icon` is optional Font Awesome classes for a glyph drawn before the label, hidden from assistive technology.
An item's other members are private and Fabricate draws nothing from them; a function in one is refused.
`activeTab` is the `id` of the selected tab and defaults to `''`: that tab is drawn selected, carries `aria-selected="true"` and is the strip's one tab stop, with `tabindex="0"` where every other tab has `-1`; when it names no item no tab is selected and the first tab is the tab stop.
`onSelect` is a required callback, called with one argument, the `id` of the tab a press or a key reaches, the selected tab's included.
The strip holds no selection: it draws a tab selected only once an `update` passes that `id` as `activeTab`, so make that `update` from inside `onSelect`, before any `await`.
Until that `update`, focus rests on a tab drawn unselected with `tabindex="-1"` while the previous tab stays the tab stop; if you decline a selection, move focus back to the tab stop.
`ariaLabel` is required and is the strip's name, final display text, as "Reagent sections".
`idStem` is required and is the stem of every id the strip writes: a tab's `id` is `<idStem>-tab-<id>`, and its `aria-controls` names `<idStem>-panel-<id>`.
Fabricate builds ids from it, so make it unique in the document with your module id, as `acme-reagents`.
Draw each panel outside `target`, after it in document order so `Tab` moves from the tab into the panel, with `id="<idStem>-panel-<id>"`, `role="tabpanel"` and `aria-labelledby="<idStem>-tab-<id>"`, and give it `tabindex="0"` when it holds no focusable element.
`activePanelOnly` is `true` or `false` and defaults to `false`: `true` writes `aria-controls` on the selected tab alone, for a strip whose panels you draw one at a time; with `false` every tab writes it, so every panel it names exists in the document, or a screen reader may report the relationship as broken.
The strip is horizontal and selects as focus moves: `ArrowRight` and `ArrowLeft` move focus to the next and the previous tab, wrapping at either end, `Home` to the first and `End` to the last, and then call `onSelect` with the `id` of the tab focus reached.
Those four keys have their default prevented and still bubble to a `keydown` listener of yours above `target`; the strip handles no other key, so `ArrowUp` and `ArrowDown` move nothing, and `Enter` and `Space` press the focused tab as a native button does.
A key pressed with `Alt`, `Ctrl` or `Meta` held is left to the platform, so `Alt+ArrowLeft` still goes back where the browser binds it.
A press, by pointer, `Enter` or `Space`, focuses its tab and then calls `onSelect`.
Focus moves only among the strip's tabs, on a press and on those four keys, and never out of `target`.
To return focus to the strip, focus `target.querySelector('[role="tab"][tabindex="0"]')`, the strip's one tab stop: the selected tab, or the first tab when `activeTab` names none.
An `update` keeps every tab whose `id` it keeps, so focus stays on it; one that drops the focused tab's item, and `destroy`, remove that tab, so where it holds focus, move focus first, as [Ownership and theme](#ownership-and-theme) states.
The strip adds no listener of its own to the document and stops the propagation of no key, so wherever the pointer rests, Escape reaches your `keydown` listeners on its path, the document's among them.
Rest `data-*` is for your own hooks, and lands on the tablist, never on a tab.
Name them for your module, as `data-<module-id>-…`; a name Fabricate writes is private.
Its row, its tabs and their ring come from Fabricate's module sheet, and it is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window or dialog.
The row wraps onto a further row when `target` is narrower than its tabs.
An empty `tabs` draws the named tablist with no tab, so pass at least one item where the strip must be reachable.
The keyboard ring is the accent, 2px wide and 2px clear of the tab, so it reaches 4px beyond the tab on every side; leave that much inside any edge of your own that clips.
The ring clears 3:1 against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2` in every palette, and falls short against `--fab-bg-3` in two, so mount the strip on one of those four grounds.
Its padding, rule, type and colour figures beyond what this section states, and how Fabricate draws a tab strip in its own editors, are private.
`badges`, `annotated`, `danger`, a `class` and Fabricate's own hook and id-stem props are refused, because a rest key must be a `data-*` attribute, so a tab never draws a mark, a padlock, a description or a name of its own.

A worked strip follows: two sections of a reagent sheet you draw inside a Fabricate window, for example in an extension target, with one panel shown at a time.

```javascript
// After `load(['EditorTabs'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates `EditorTabs` describes none: draw your own strip there.
if (!fabUi?.describe?.('EditorTabs')) return;

const sections = [
  { id: 'inputs', label: 'Inputs', icon: 'fas fa-flask' },
  { id: 'outputs', label: 'Outputs', icon: 'fas fa-box-open' },
];
let shown = 'inputs';
const props = () => ({
  tabs: sections,
  activeTab: shown,
  ariaLabel: 'Reagent sections',
  // Your panels, after `target`: id="acme-reagents-panel-<id>", role="tabpanel",
  // aria-labelledby="acme-reagents-tab-<id>", and tabindex="0" where one holds no control.
  idStem: 'acme-reagents',
  activePanelOnly: true,
  onSelect: (id) => {
    shown = id;
    strip.update(props()); // Before any `await`, so the tab is drawn selected at once.
    acmeReagents.showPanel(id);
  },
});
const strip = fabUi.mount('EditorTabs', { target, props: props() });

// `strip.destroy()` when the sheet goes away, moving focus first if a tab holds it.
```

### RadioCardGroup

`RadioCardGroup` draws the design system's option cards (`<OptionCards>` in the library): a named `<fieldset>` of cards, one for each item of `options`, each holding a native `<input type="radio">`, for one choice among a few options.
`options` is required and is an array of `{ value, label, description, icon }` items, one card each, drawn in that order.
Each `value` is required and is a non-empty string, unique in the group; a list with a duplicate is unsupported and how it draws is private.
Each `label` is required and is final display text, the radio's whole name; a label of white space alone leaves the radio with no name, so never pass one.
Each `description` is optional final display text drawn beneath the label, which describes the radio.
Each `icon` is optional Font Awesome classes for a glyph drawn in a chip, hidden from assistive technology.
An item's other members are private and Fabricate draws nothing from them; a function in one is refused.
`value` is the chosen option's `value` and defaults to `''`: that option's card is drawn chosen and its radio checked, and a `value` that names no option leaves no card chosen.
`onChange` is a required callback, called with one argument, the chosen option's `value`, a string, when a press or a key checks a radio; it is never called for a disabled option or a disabled group, and a press on the chosen card calls nothing, because a checked radio fires no `change`.
When `onChange` returns, or throws, Fabricate checks the radio of the mount's `value` again, so to accept a choice make the `update` that passes it from inside `onChange`, before any `await`, and the new card is drawn chosen; a choice you decline leaves the previous card chosen.
`legend` is required and is the fieldset's name, final display text drawn visually hidden; a legend of white space alone leaves the fieldset with no name, so never pass one.
`layout` is `'row'` or `'stacked'` and defaults to `'row'`: the chip beside a card's text, or above it.
`columns` is `1`, `2` or `3` and defaults to `2`, the cards' tracks per row; any other value is private.
`disabled` is `true` or `false` and defaults to `false`: `true` disables every radio natively.
`disabledOptions` is an array of `{ value, reason }` items, each disabling the option it names, and `reason` is required non-empty final display text drawn beneath the option's description inside its card, never dimmed, and added to the radio's `aria-describedby`.
An item that names no option is ignored, and where a value is named twice the first non-empty reason wins.
Each control is a native radio, so the group consumes no key itself: the platform's radio group moves focus to the next or the previous enabled radio on the arrow keys, wrapping at either end and skipping a disabled one, and checks it, and `Space` checks the focused radio.
Each such check fires `change`, which calls `onChange`, and every key still bubbles to a `keydown` listener of yours above `target`.
Focus moves only among one group's radios, by the platform's own handling, and never out of `target`.
To return focus to the group, focus `target.querySelector('input[type="radio"]:checked')`, or the first enabled radio when no option is chosen.
After a key, a declined choice leaves focus on the radio the key reached, drawn unchecked, so move focus to `target.querySelector('input[type="radio"]:checked')` after you decline one.
In a host that replaces its content on render (a DialogV2, a Handlebars part, or a `submitOnChange` sheet that renders again after the update a choice causes) the radios are new elements after every render: note in `_preRender` whether focus was inside `target` and, after mounting again in `_onRender`, focus `target.querySelector('input[type="radio"]:checked')`, or the first enabled radio when none is checked.
An `update` that sets `disabled`, or names the focused radio's option in `disabledOptions`, disables the radio holding focus, and the platform moves focus to the document body, where Foundry's keybindings hear Escape and the arrow keys, so move focus first.
Each choice fires a bubbling `change`, so a form with `submitOnChange` submits on every choice.
The radios carry a private `name`, unique to the mount, so the chosen value appears under that name in a form's data, except while the group is disabled, and a document sheet's schema discards the key: read the choice from `onChange`, never from the form.
The group consumes no key, so where the platform applies implicit submission to a focused radio, Enter submits the `<form>` it is in; mount it in no form whose submit you do not want.
Rest `data-*` attributes land on the fieldset, never on a card or a radio.
Its cards, chips and radios come from Fabricate's module sheet, rooted at `.fabricate-option-cards`, and it is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window or dialog.
It reflows to fewer tracks only under a Fabricate host that names `fabricate-option-host`, a name you give no element, so under the standalone style root it never reflows and you choose `columns` for the width of `target`; when and how it reflows is private.
An empty `options` draws the named fieldset with no card and no radio, so nothing inside `target` takes focus; pass at least one option where the group must be reachable.
The radio's keyboard ring is the accent, 2px wide and 2px clear, drawn on the card's own ground.
The ring clears 3:1 against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, and against a chosen card's `--fab-surface-soft` over `--fab-bg-2`, in every palette, and falls short against `--fab-bg-3` in two, so mount the group on one of those four grounds.
`groupName`, `cardId`, `hint`, `legendVisible`, `optionDataAttr`, `optionBody` and a `class` are refused, because a rest key must be a `data-*` attribute, so the group never draws a hint, a visible legend or content of your own in a card.

A worked group follows: a breakage choice on a tool sheet you draw inside a Fabricate window, for example in an extension target.

```javascript
// After `load(['RadioCardGroup'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates `RadioCardGroup` describes none: draw your own choice there.
if (!fabUi?.describe?.('RadioCardGroup')) return;

let chosen = 'breakable';
const props = () => ({
  legend: 'When the tool breaks',
  options: [
    { value: 'breakable', label: 'Breakable', icon: 'fas fa-hammer' },
    { value: 'immune', label: 'Immune', description: 'It never breaks.', icon: 'fas fa-lock' },
    { value: 'limited', label: 'Limited uses', icon: 'fas fa-hourglass-half' },
  ],
  value: chosen,
  disabledOptions: [{ value: 'limited', reason: 'Coming soon' }],
  onChange: (value) => {
    chosen = value;
    group.update(props()); // Before any `await`, so the card is drawn chosen at once.
    acmeTools.saveBreakage(value);
  },
});
const group = fabUi.mount('RadioCardGroup', { target, props: props() });

// `group.destroy()` when the sheet goes away, moving focus first if a radio holds it.
```

### SegmentedControl

`SegmentedControl` draws the design system's segmented control (`<Segmented>` in the library): a `role="radiogroup"` track of native radios, each behind a label segment, one for each item of `options`, drawn in that order.
`options` is required and is an array of `{ value, label, icon, disabled }` items.
`value` is required, a string or a number, unique in the control; a list with a duplicate is unsupported and how it draws is private.
`label` is required and is final display text, the segment's whole visible text and its radio's accessible name; a label of white space alone leaves the radio with no name, so never pass one.
`icon` is optional Font Awesome classes for a glyph drawn before the label, hidden from assistive technology.
`disabled: true` disables that option's radio natively, so the arrow keys skip it and it never calls `onChange`.
An item's other members are private, so pass none; a function in one is refused.
`value` is the `value` of the selected option and defaults to `''`.
It is compared with `===`, so `'10'` selects no option whose `value` is `10`, and a `value` that names no option leaves no segment selected.
`onChange` is a required callback, called with one argument, the `value` of the option a press or a key reaches; a press on the selected segment calls nothing, because a checked radio fires no `change`.
The control holds no selection: it draws a segment selected only once an `update` passes that option's `value`, so make that `update` from inside `onChange`, before any `await`.
The platform checks the reached radio first; when `onChange` returns, Fabricate sets the check back on the radio of `value`, inside that same `change`, so a declined change leaves the previous radio checked.
Focus stays on the reached radio, drawn unchecked, so after you decline a change move focus to `target.querySelector('input[type="radio"]:checked')`.
`ariaLabel` is required and is the radiogroup's name, final display text.
`fill` is `true` or `false` and defaults to `false`: `true` stretches the track across `target` and gives every segment an equal share.
`density` is `'default'` or `'inline'` and defaults to `'default'`; any other value is private.
The radios share one name Fabricate makes unique to the mount, so two controls never uncheck each other.
Fabricate handles and stops no key: the platform moves focus and the check to the next or previous enabled radio on the arrow keys, wrapping, and Space checks the focused radio, each check calling `onChange`.
Focus moves only among one control's radios and never out of `target`.
To return focus to the control, focus `target.querySelector('input[type="radio"]:checked')`, or the first enabled radio when no option is selected.
A pointer press on a segment bubbles two `click`s, the label's and the one it forwards to the radio, and an arrow key may bubble one from the radio it reaches; count choices from `onChange`, never from `click`.
An `update` keeps every radio whose option it keeps, so focus stays on it; one that drops the focused radio's option, and `destroy`, take focus from it, and one that disables it moves focus to `<body>`, where Foundry's keybindings hear Escape and the arrow keys, so move focus first.
In a host that replaces its content on render (DialogV2, a Handlebars part, a `submitOnChange` sheet that re-renders after the update a change causes) the radios are new elements after every render: note in `_preRender` whether focus was inside `target` and, after mounting again in `_onRender`, focus the checked radio, or the first enabled one.
Each change fires a bubbling `change`, so a form with `submitOnChange` submits on every change and reads its data inside that `change`, after Fabricate has set the check from `value`.
The radios carry a private `name` that a document sheet's schema discards, and a form carries the value as a string: Foundry's `FormDataExtended` carries the checked radio's value even while that radio is disabled, as long as another radio of the control is enabled, and a native `FormData` omits a disabled radio; read the choice from `onChange`, never from the form.
Where the browser's implicit submission covers a focused radio, Enter submits the form through its first submit button, which in `DialogV2.confirm` is Yes, so mount the control in no form whose submit you do not want.
Rest `data-*` attributes land on the radiogroup, never on a segment or a radio.
It is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window or dialog.
An empty `options` draws the named radiogroup with no segment and no radio, so nothing inside `target` takes focus; pass at least one option where the control must be reachable.
The keyboard ring is the accent, 2px wide and 2px clear of the segment, so it reaches 4px beyond the segment and 1px beyond the track's outer edge; leave room for it inside any edge of your own that clips.
The ring clears 3:1 against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, against the track's fill over each, and against the selected segment's fill over the track's, in every palette, and falls short against `--fab-bg-3` in two, so mount the control on one of those four grounds.
`groupName`, `iconOnly`, `tone`, `shape`, `optionDataAttr` and a `class` are refused, because a rest key must be a `data-*` attribute, so the control never draws a tone, a pill, an icon-only run or a hook of yours on a segment.

A worked control follows: an ingredient filter on a panel you draw inside a Fabricate window, for example in an extension target.

```javascript
// After `load(['SegmentedControl'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates `SegmentedControl` describes none: draw your own control there.
if (!fabUi?.describe?.('SegmentedControl')) return;

let filter = 'all';
const props = () => ({
  ariaLabel: 'Ingredient filter',
  options: [
    { value: 'all', label: 'All' },
    { value: 'owned', label: 'Owned', icon: 'fas fa-check' },
    { value: 'missing', label: 'Missing', icon: 'fas fa-xmark' },
  ],
  value: filter,
  onChange: (value) => {
    filter = value;
    control.update(props()); // Before any `await`, so the segment is drawn selected at once.
    acmeIngredients.applyFilter(value);
  },
});
const control = fabUi.mount('SegmentedControl', { target, props: props() });

// `control.destroy()` when the panel goes away, moving focus first if a radio holds it.
```

### Pagination

`Pagination` draws the design system's pager (`<Pagination>` in the library): a named region holding a range summary, a named navigation of two arrow buttons around a page-position label, and a page-size control, for a list you draw a page at a time.
It holds no page: it draws the window `totalCount`, `pageSize` and `pageIndex` describe, and you draw the rows.
`totalCount` is required and is the number of records in the whole list, a whole number of 0 or more.
`pageSize` is required and is the number of records on a page, a whole number of 1 or more.
`pageIndex` is the zero-based index of the page shown and defaults to `0`.
The page count is `totalCount` divided by `pageSize`, rounded up, and never less than 1, and you keep `pageIndex` below it.
`pageSizeOptions` is required and is an array of whole numbers of 1 or more, the sizes offered.
The page-size control offers the sorted union of `pageSizeOptions` and `pageSize`, each once, and is not drawn, caption included, while that union holds fewer than two sizes, so `[]` draws none.
Each size's segment and radio are named by its numeral, the number in digits with no grouping.
`onPageChange` is a required callback, called with one argument, the zero-based index of the page an arrow press reaches.
The Previous arrow is disabled on the first page and the Next arrow on the last, and a disabled arrow calls nothing.
The pager draws a page only once an `update` passes its index as `pageIndex`, so a second press before that `update` reports the same index again, and a call you decline leaves the page drawn as it was.
`onPageSizeChange` is a required callback, called with one argument, the size, a number, of the segment a press or a key reaches; a press on the selected size calls nothing.
The page-size control is a `SegmentedControl`, so make the `update` that passes the new `pageSize`, and the `pageIndex` you keep for that size, from inside `onPageSizeChange`, before any `await`.
A size you decline leaves the previous size's radio checked, and focus on the radio the key reached, drawn unchecked.
`persistent` is `true` or `false` and defaults to `false`.
With `true` the pager is always drawn, and an arrow that leads nowhere is disabled.
With `false` the pager is drawn only while `totalCount` is greater than the smallest of `pageSize` and `pageSizeOptions`, and its navigation only while there is more than one page; otherwise it draws nothing, so `target` is empty under a Fabricate root and holds only the empty standalone style root elsewhere, and nothing inside it takes focus.
While focus is inside the pager it stays drawn, and it is removed once focus leaves it.
`density` is `'default'` or `'compact'` and defaults to `'default'`; any other value is private.
`'default'` draws the bar on its own `--fab-bg-1` fill.
`'compact'` draws one transparent row whose page-position label is visually hidden and stays in the accessibility tree, and whose page-size control takes `SegmentedControl`'s `inline` rung.
`ariaLabel` and `navLabel` are required and are the region's name and the navigation's name, each final display text.
Two pagers on one screen take distinct names, because a screen-reader user moves between landmarks by name.
`previousLabel` and `nextLabel` are required and are the arrows' names, final display text.
Each arrow's name is also its tooltip, shown on hover and under keyboard focus as the `IconButton` section states, the focus Fabricate moves included.
`perPageLabel` is required and is the page-size caption, final display text drawn visibly before the control, which names its radiogroup.
A name or caption of white space alone leaves its element with no name, so never pass one.
`rangeTemplate` is required and is the summary's template, final display text in which Fabricate replaces `{first}`, `{last}` and `{total}` with the first and last record shown and `totalCount`, as "{first}–{last} of {total} reagents"; with no record shown, `{first}` and `{last}` are both `0`.
`pageTemplate` is required and is the page-position template, in which Fabricate replaces `{page}` with the one-based page shown and `{total}` with the page count, as "Page {page} of {total}".
Fabricate fills each placeholder of either template with the number in digits, leaves any other `{name}` as written and changes nothing else, so you choose each template's wording, its plural form included, from the `totalCount` you pass.
Each arrow is a native `<button type="button">`, so `Enter` and `Space` press it, and the page-size radios take the keys `SegmentedControl`'s section states; Fabricate stops no key, and cancels only a held Enter's repeats on the arrow or page-size radio it moved focus to, as the next paragraph states.
Focus moves only as the page-size control's section states, except that when an `update` disables or removes the arrow holding focus, and focus has not moved elsewhere meanwhile, Fabricate moves focus to the other arrow while it is enabled, and otherwise to the checked page-size radio while one is drawn.
So a keyboard user who presses Next onto the last page rests on Previous.
On the arrow or page-size radio it moved focus to, Fabricate cancels the repeats of an Enter still held from that press until that key is released or Enter is pressed again, so a held Enter stops on the end page rather than walking back.
With neither to move to, Fabricate takes focus off the arrow, so focus is on the document body, where Foundry's keybindings hear Escape, and a pager that only focus kept drawn is removed; when you make that `update`, move focus first.
To return focus to the pager, focus `target.querySelector('button:not(:disabled), input[type="radio"]:checked')`: the first enabled arrow, else the checked size.
An arrow press bubbles one `click`, and the page-size control's clicks are as its section states, so count page turns from `onPageChange`, never from `click`.
An arrow submits no `<form>`.
A size choice fires a bubbling `change` as `SegmentedControl`'s section states, so a form with `submitOnChange` submits on it; read the size from `onPageSizeChange`, never from the form.
It takes no rest keys, so a `data-*` key is refused, and so are `showPageSize`, `multiPageOnly`, `edge` and a `class`.
Its bar, arrows and ring come from Fabricate's module sheet, rooted at `.fabricate-pagination`, and it is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window or dialog.
The arrows' keyboard ring is the accent, 2px wide and 2px clear of the arrow, so it reaches 4px beyond the arrow, and the page-size control's ring reaches as `SegmentedControl`'s section states.
The ring clears 3:1 against the default bar's `--fab-bg-1` and, under `'compact'`, against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2`, in every palette, and falls short against `--fab-bg-3` in two, so mount a compact pager on one of those four grounds and leave room for the ring inside any edge of your own that clips.

A worked pager follows: a reagent list you draw a page at a time on a panel inside a Fabricate window, for example in an extension target.

```javascript
// After `load(['Pagination'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates `Pagination` describes none: draw your own pager there.
if (!fabUi?.describe?.('Pagination')) return;

let pageIndex = 0;
let pageSize = 25;
const props = () => ({
  totalCount: acmeReagents.count(),
  pageSize,
  pageIndex,
  pageSizeOptions: [10, 25, 50],
  ariaLabel: 'Reagent pages',
  navLabel: 'Reagent page navigation',
  previousLabel: 'Previous reagents page',
  nextLabel: 'Next reagents page',
  perPageLabel: 'Per page',
  rangeTemplate:
    acmeReagents.count() === 1
      ? '{first}–{last} of {total} reagent'
      : '{first}–{last} of {total} reagents',
  pageTemplate: 'Page {page} of {total}',
  onPageChange: (index) => {
    pageIndex = index;
    pager.update(props()); // Before any `await`, so the summary and arrows move at once.
    acmeReagents.showPage(pageIndex, pageSize);
  },
  onPageSizeChange: async (size) => {
    pageSize = size;
    pageIndex = 0;
    pager.update(props()); // Before any `await`, so the chosen size stays checked.
    await acmeReagents.showPage(pageIndex, pageSize);
  },
});
const pager = fabUi.mount('Pagination', { target, props: props() });

// `pager.destroy()` when the panel goes away, moving focus first if the pager holds it.
```

### IconPicker

`IconPicker` draws Fabricate's icon picker: a `<button>` trigger showing a glyph, its name and a caret, which opens a list of Fabricate's icon vocabulary with a query field, in an overlay, for one glyph that commits as it is chosen.
The trigger fills the width of `target`, so size `target` yourself.
The trigger is the only focusable element inside `target`, so to return focus to the picker, focus `target.querySelector('button')`.
The list offers the vocabulary `game.fabricate.listCuratedIcons()` answers on the same client, described under [Icon Vocabulary](#icon-vocabulary), one solid-weight row per glyph, in that vocabulary's order while the query is empty.
Each row is named by its glyph's `label`, as `game.fabricate.listCuratedIcons()` answers it on the same client, which is English and is not localized.
The trigger shows that same name beside the glyph.
`value` is the chosen glyph's Font Awesome class string, a weight token then `fa-<name>`, as `'fas fa-gear'`, and its `iconCode` or any of its `aliases` selects its row.
With an empty query, the row for `value` is pinned first and marked selected.
With `value` absent, `''`, or carrying no `fa-<name>` token, the trigger draws a default glyph, which is private.
A `value` whose `<name>` the vocabulary lists under no name or alias is drawn on the trigger as written and, with an empty query, pinned as a row of its own, named by an English label Fabricate makes from `<name>`, which is not localized.
`onChange` is a required callback, called with one argument, the chosen row's class string, each time the user chooses a row by pointer or by Enter, the selected row included: `fas fa-<iconCode>` for a row the vocabulary lists, and for a row of its own the `value`'s weight token and `fa-<name>`.
It is not called by `mount`, `update`, opening or closing the list, a query, Escape or an outside press.
The picker changes nothing itself: the trigger shows the new glyph when your `update` passes it as `value`, so to refuse a choice, pass `value` unchanged.
`ariaLabel` is required and names the trigger, final display text naming the choice, as "Reagent icon", and it is also the trigger's native tooltip.
The trigger's name is `ariaLabel` alone, so the glyph name it shows is not announced; when the choice must be heard, state it in `ariaLabel`, as "Reagent icon: Flask".
`listLabel` is required and names the list and its dialog.
`searchLabel` is required and names the query field.
`searchPlaceholder` is optional hint text the empty field shows while it does not hold focus, which is not its name; the list opens with the field focused, so it is hidden until focus leaves the field, and absent, the field shows none.
`noMatchesText` is required and is the line the list draws in place of its rows when a query matches no glyph.
Never pass a name of white space alone, which leaves its element with no name.

- A press on the trigger, by pointer, Enter or Space, opens the list, and a second press closes it.
- When the list opens, focus moves into its query field, outside `target`.
- Typing narrows the rows to the glyphs the query matches, and an empty query lists them all; which glyphs a query matches and their order are private.
- ArrowDown and ArrowUp move the active row, which the field names with `aria-activedescendant`, and Home and End do so only from the caret's edge; Enter chooses the active row, and with no active row does nothing.
- A choice closes the list and returns focus to the trigger.
- Escape in the query field closes the list without choosing and returns focus to the trigger before the key reaches Foundry, so Foundry's dismiss keybinding closes no window; an open ApplicationV1 `Dialog` still closes, as Interactive components states.
- A press outside the open list closes it without choosing anything, and focus goes where the press puts it: to the element you pressed when it, or an element around it, takes focus, and otherwise to the page.
  With focus on the page, the next Escape reaches Foundry, which asks every open window to close.
- Tab in the query field closes the list without calling `onChange`, moves focus to the trigger and leaves the browser to move it on from there, so focus lands where it would if the list were drawn just after the trigger; Shift+Tab there closes the list and returns focus to the trigger (issue 2676).
- The list also closes without choosing, moving no focus, once focus moves to an element outside the trigger and the list; focus leaving the browser window, or moving between the main window and a detached one, closes nothing (issue 2598).
- The trigger stops the propagation of every key but Tab, with or without Shift, pressed while it holds focus, and of its own `click`, and the open list stops every `click` inside it, so your listener above `target` or on the `overlayHost` hears Tab and no other key; while the trigger holds focus Escape closes no window, an open ApplicationV1 `Dialog` included.
- In a DialogV2, Escape on the trigger does not close the dialog; handle Escape in your own listener on the trigger or move focus first.
- Every key pressed in the query field, Escape included, may reach your listener on the `overlayHost` or above it.
- The no-match line is a polite live region, so it is announced when a query empties the list; the picker announces nothing else.

The list is the component's overlay, so `describe('IconPicker').overlays` is `true`, and it is drawn in the host [Overlays](#overlays) picks when it opens.
Pass an `overlayHost` inside the same Fabricate window, or none, because the list's rows, ring and hidden live region are drawn only under a `.fabricate` ancestor, and in no `<form>`, because Enter in the query field with no active row can submit a form it sits in; in your own window or dialog pass none, and the list opens on the standalone layer.
The list opens against the trigger, and its placement inside the host is private.
`IconPicker` takes no rest props, so a `data-*` prop is refused with `"<key>" is not a prop of IconPicker`.
Its trigger, rows and marks come from Fabricate's module sheet, rooted at `.fabricate-icon-picker` and `.fabricate-icon-picker-popover`, and it is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window or dialog, its open list on the standalone layer there.
The trigger's keyboard ring is the window's accent ring, 2px wide and 2px clear of the trigger, and the query field shows focus by turning its own 1px border to the accent, drawn inside its box, with no ring.
The ring clears 3:1 against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2` in every palette, so mount the picker on one of those grounds and leave room for the ring inside any edge of your own that clips.
An `update` keeps the trigger, so focus stays on it, and an `update` while the list is open redraws the selection in place; `destroy` removes the trigger and closes the list, so where the trigger or the query field holds focus, move focus to an element of your own first.
A list opened after Foundry 14 moves the window is placed and heard in the window that then holds the trigger, its focus and measures included, as [Overlays](#overlays) states.
Its trigger, row, tile and type figures, its colours beyond what this section states, the default glyph, the list's placement, width and height, which glyphs a query matches and their order, and its `essence-icon-picker-*` and `data-popover-*` hooks are private.
`disabled`, `iconOnly` and `bounds` are not published at version 1, and `triggerClass`, `triggerStyle`, `onTriggerContextMenu` and `onTriggerKeydown` never are, so each is refused, as is a `class`.

A worked picker follows: a reagent's icon on a panel inside a Fabricate window, for example in an extension target.

```javascript
// After `load(['IconPicker'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates the picker describes none: draw your own control there.
if (fabUi?.describe?.('IconPicker')?.overlays !== true) return;

let icon = reagent.icon;
// The glyph's name from a class string such as `fas fa-cog`, resolved through its aliases.
const labelOf = (value) =>
  game.fabricate.findCuratedIcon(/\bfa-([a-z0-9-]+)$/.exec(value ?? '')?.[1] ?? '')?.label;
const props = () => ({
  value: icon,
  // The choice is heard only through the trigger's name.
  ariaLabel: `${game.i18n.localize('ACME.ReagentIcon')}: ${labelOf(icon) ?? icon ?? ''}`,
  listLabel: game.i18n.localize('ACME.ReagentIcons'),
  searchLabel: game.i18n.localize('ACME.SearchReagentIcons'),
  searchPlaceholder: game.i18n.localize('ACME.SearchIcons'),
  noMatchesText: game.i18n.localize('ACME.NoReagentIconMatches'),
  onChange: async (next) => {
    icon = next;
    picker.update(props()); // Before any `await`, so the trigger shows the new glyph at once.
    await reagent.update({ icon });
  },
});
// Omit `overlayHost` to draw the list in the Fabricate window around `target`.
const picker = fabUi.mount('IconPicker', { target, props: props() });

// `picker.destroy()` when the panel goes away, moving focus first if the picker holds it.
```

### ActionMenu

`ActionMenu` draws Fabricate's overflow menu (`<Menu>` in the design-system library): an icon-only trigger button showing Fabricate's overflow glyph, which opens a menu of commands, in an overlay, each of which `onSelect` reports as it is chosen.
The trigger is the only focusable element inside `target`, so to return focus to the `ActionMenu`, focus its trigger, `target.querySelector('button')`.
`items` is required and is an array of the menu's commands, in order, each `{ id, label, icon, disabled, danger }`, of which `id` and `label` are required.
`id` is a string unique within `items`, which `onSelect` reports.
`label` is the item's final display text and its accessible name, and it names the command, not the record, because the trigger identifies the record.
A label too long for the menu is cut with an ellipsis, and its whole text stays its name.
`icon` is a Font Awesome class string drawn before the label and hidden from assistive technology, and an item without one keeps the glyph's column empty.
`disabled: true` draws the item dimmed as a natively disabled button, which the arrow keys skip and a press does not choose.
`danger: true` draws the item in the danger family's text ink, which clears 4.5:1 on the menu's ground and on a hovered or focused item in every palette.
In `foundry-native` that ink is the window's ordinary text ink, so let the item's label, not its colour, state what it does, and give a danger item an `icon`.
Fabricate drops an item's `data` and never writes it, and any other member is private.
With `items` empty, or every item disabled, a press opens a menu with no item to choose, focus rests on the menu itself, and Escape, Tab or a press outside it closes it; with no command to offer, leave the menu unmounted.
`ariaLabel` is required and is final display text naming the trigger and the menu, as "Reagent actions for Flask", and it is also the trigger's tooltip, shown as the [`IconButton`](#iconbutton) section states.
Never pass a name of white space alone, which leaves the trigger and the menu with no name.
`align` is `'end'` or `'start'` and defaults to `'end'`, and any other value is private.
With `'end'` the menu lines up with the trigger's end edge, for a trigger at a row's end, and with `'start'` with its start edge, for one at a list's start; either way it is kept inside its host's left and right edges where the host is wide enough to hold it.
`onSelect` is a required callback, called with one argument, the chosen item's `id`, each time the user chooses an enabled item by pointer, Enter or Space.
It is not called by `mount`, `update`, opening or closing the menu, the arrow keys, Escape, Tab, a press outside the menu, or the repeats of an Enter held on the trigger.
A menu marks no item selected or current, and each choice of an enabled item calls it, the item chosen last time included.
Fabricate calls `onSelect` only with the `id` of an item the menu draws when it is chosen.
Run a command only for an `id` you match by name, with no closing `else`, so no item, the last one included, runs a command meant for another `id`.

- A press on the trigger, by pointer, Enter or Space, opens the menu and moves focus to its first enabled item, outside `target`.
  After a pointer press, the focus Fabricate moves into the menu shows the mark it shows after a key: the item takes its raised fill and a 1px accent ring drawn inside its edge, and a menu with no item to choose takes the window's accent ring, 2px wide and 2px clear of it.
- ArrowDown on the trigger does the same, and ArrowUp opens the menu onto its last enabled item.
- An Enter held on the trigger opens the menu once, and an Enter held on an item chooses it once; the repeats of either choose and open nothing, and a fresh Enter on an item chooses it.
- A second press on the trigger closes the menu without choosing and moves no focus, so focus goes where the pointer press puts it, which in Chromium, Foundry's desktop client, is the trigger.
- In the menu, ArrowDown and ArrowUp move focus to the next and the previous enabled item, wrapping at either end, and Home and End move it to the first and the last.
- A choice calls `onSelect`, closes the menu, and then returns focus to the trigger, so focus that `onSelect` moves before it returns goes back to the trigger; to move focus in response, move it from a later task, as from a `setTimeout`.
- Escape in the menu closes it without choosing and returns focus to the trigger before the key reaches Foundry, so Foundry's dismiss keybinding closes no window; whether an open ApplicationV1 `Dialog`, which listens for Escape itself, also closes is private.
- Tab and Shift+Tab in the menu close it without choosing and return focus to the trigger, departing from the APG menu button pattern, in which Tab closes the menu and moves on, as Tab in an `IconPicker`'s query field does; the published behaviour is kept so your Tab handling does not change (issue 2700).
- A press on a disabled item or between the items chooses nothing and leaves the menu open, and the arrow keys still move among the enabled items.
- A press outside the menu closes it without choosing, and focus goes where the press puts it: to the element you pressed when it, or an element around it, takes focus, and otherwise to the page.
  With focus on the page, the next Escape reaches Foundry, which asks every open window to close.
- The trigger announces the menu with `aria-haspopup="menu"` and its open state with `aria-expanded`, and the menu is a `role="menu"` of `role="menuitem"` items named by `ariaLabel`, with no selection state.
- The trigger stops the propagation of ArrowDown and ArrowUp and of its own `click`, so your listener above `target` hears none of them, and every other key on the trigger bubbles as it does from any button.
  The open menu stops every `click` inside it, so your listener on the `overlayHost` or above it hears none, and every key pressed in the menu, Escape included, may reach that listener.

The menu is the component's overlay, so `describe('ActionMenu').overlays` is `true`, and it is drawn in the host [Overlays](#overlays) picks when it opens.
Pass an `overlayHost` inside the same Fabricate window, or none, because the menu's items, their focus mark and the theme are drawn as this section states only under a `.fabricate` ancestor; in your own window or dialog pass none, and the menu opens on the standalone layer.
The menu opens below the trigger, or above it where the host has room above and none below, and its placement inside the host is otherwise private.
`ActionMenu` takes no rest props, so a `data-*` prop is refused with `"<key>" is not a prop of ActionMenu`.
Its trigger, items and marks come from Fabricate's module sheet, rooted at `.fabricate-action-menu` and `.fabricate-action-menu-panel`, and it is drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window or dialog, its open menu on the standalone layer there.
The trigger's keyboard ring is the window's accent ring, 2px wide and 2px clear of the trigger, and an item under keyboard focus takes a raised fill and a 1px accent ring drawn inside its edge.
With no item to choose, the menu itself takes the window's accent ring, 2px wide and 2px clear of its edge.
The trigger's ring clears 3:1 against `--fab-bg-0`, `--fab-bg-1`, `--fab-surface` and `--fab-bg-2` in every palette, so mount the menu on one of those grounds and leave room for the ring inside any edge of your own that clips.
The item's ring clears 3:1 against its raised fill over the menu's ground, and against that ground, in every palette.
An `update` keeps the trigger, so focus stays on it, and an `update` while the menu is open redraws its items in place, focus staying on the item that holds it while that item is still drawn and enabled; `destroy` removes the trigger and closes the menu, so where the trigger or an item holds focus, move focus to an element of your own first.
A menu opened after Foundry 14 moves the window is placed and heard in the window that then holds the trigger, its focus and arrow keys included, as [Overlays](#overlays) states.
Its glyph, its trigger, menu, item and type figures, its colours beyond what this section states, the menu's placement and width, an item's `tone`, and its `manager-action-menu-*` classes and `data-action-menu-*` hooks are private.
`disabled`, `heading`, `panelLabel`, `triggerIcon`, `triggerTitle` and `open` are not published at version 1, and `triggerClass`, `menuClass`, `triggerProps` and `trigger` never are, so each is refused, as is a `class`.

A worked menu follows: a reagent row's commands on a panel inside a Fabricate window, for example in an extension target.

```javascript
// After `load(['ActionMenu'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates the menu describes none: draw your own control there.
if (fabUi?.describe?.('ActionMenu')?.overlays !== true) return;

const menu = fabUi.mount('ActionMenu', {
  target,
  props: {
    items: [
      { id: 'duplicate', label: game.i18n.localize('ACME.Duplicate'), icon: 'fas fa-copy' },
      { id: 'delete', label: game.i18n.localize('ACME.Delete'), icon: 'fas fa-trash', danger: true },
    ],
    // The trigger names the record; each item names only its command.
    ariaLabel: game.i18n.format('ACME.ReagentActions', { name: reagent.name }),
    onSelect: (id) => {
      // Each command by its own id, and no closing `else`; each from a later task, so the focus
      // Fabricate returns to the trigger does not overwrite focus the command moves.
      if (id === 'duplicate') setTimeout(() => duplicateReagent(reagent), 0);
      else if (id === 'delete') setTimeout(() => confirmDeleteReagent(reagent), 0);
    },
  },
});

// `menu.destroy()` when the panel goes away, moving focus first if the menu holds it.
```

### Modal

`Modal` draws Fabricate's dialog (`<Modal>` in the design-system library): a panel drawn over the window, in an overlay, with a header band holding your title, an optional subtitle and a close control, then your body and footer in their content slots.
It is for one step the user finishes or dismisses before going on.
It draws nothing focusable inside `target`, so return focus to an element of your own, the control that opened the dialog.
`open` is `true` to draw the dialog and `false` or absent to draw none, and you open and close it only through `update`.
While it is closed, `target` is empty under a Fabricate root and holds only the empty standalone style root elsewhere, and while it is open, `target` holds one empty element of Fabricate's, inside that root where it is written, which is private.
An `update` replaces every prop, so pass the dialog's other props with `open` on each one, `title`, `closeLabel` and `onClose` among them.
An `update` that closes the dialog detaches the slot elements with their contents intact, and one that opens it attaches the same elements again, so the content-slot rules on detaching apply on every close and open, and your components, effects and listeners in them keep running.
A component with an overlay that you mount in a slot closes its open panel when such an `update` detaches the slot, as [Overlays](#overlays) states, so when you open the dialog again its trigger has `aria-expanded` `"false"`.
`title` is required and is final display text, drawn as the dialog's level-3 heading, and it is the dialog's accessible name.
`subtitle` is optional final display text drawn under the title in a quieter, smaller ink than the title, and it is neither part of the name nor announced as the dialog's description.
`closeLabel` is required and names the close control, as "Close", and it is also that control's tooltip, shown as the [`IconButton`](#iconbutton) section states.
Never pass a name of white space alone, which leaves its element with no name.
`body` is a content slot whose element is a `<div>`, and the dialog draws its top-level children, as the slot element draws no box, below the header in a padded column it spaces by `gap`.
`footer` is a content slot whose element is a `<div>`, and the dialog draws its top-level children in a row aligned to the end of a footer band, spaced by `gap`, of which you make at most one primary.
An omitted slot draws no body or no footer band, so a dialog with neither draws its header alone.
The dialog's height is capped, so scroll tall content inside one element of your own in the body, which you give `min-height: 0` and `overflow: auto`, and `tabindex="0"` when it holds no control, so the keyboard can scroll it.
Give your dialog at least one control of your own, so focus has somewhere to go when it opens; a dialog that only informs puts its acknowledging button in the footer.
`closeOnOutsideClick` is `true` or `false` and defaults to `true`.
With `true`, a pointer press anywhere in the document outside the dialog and outside every panel that counts as inside it, as the lines below state, calls `onClose` as its `mousedown` fires, whichever button it is, and so does Escape pressed while focus is outside both.
In a DialogV2, with `true` and the opener still holding focus inside it, Escape calls `onClose` and also reaches the DialogV2's own Escape listener, so both close; pass `closeOnOutsideClick: false`, stop Escape in your own listener, or move focus into the dialog first.
A press on the control that opened the dialog is an outside press too, and its own `click` follows `onClose`, so if your opener opens the dialog on every press, pass `false`, or ignore a `click` whose press began while the dialog was open.
A panel counts as inside the dialog from when it opens until it closes, wherever it is drawn, when a control inside the dialog opened it or a panel that counts as inside it did, as the panel of a component with an overlay that you mount in a slot: a [`Select`](#select)'s list, an [`IconPicker`](#iconpicker)'s list and query field and an [`ActionMenu`](#actionmenu)'s menu.
A press in such a panel does not call `onClose`, and the panel takes it as its own section states, so a click on an option chooses it as it does outside a dialog.
Escape pressed while focus is in such a panel is left to that panel: the dialog neither calls `onClose` nor stops it, and the panel closes and returns focus to its trigger in the dialog, so Foundry's dismiss keybinding closes no window; whether an open ApplicationV1 `Dialog`, which listens for Escape itself, also closes is private.
A `Modal` you mount in a slot counts as inside the dialog too, so a press or an Escape in its dialog calls only that dialog's `onClose`, and a panel opened from inside that `Modal` counts as inside both, so a press there calls neither and an Escape there closes the panel alone (issue 2678).
An `overlayHost` you pass inside the slot draws your panel inside the dialog, which clips what overflows it.
With `false`, neither a press nor an Escape outside the dialog calls `onClose`.
`onClose` is a required callback, called with no argument, when the user asks to close the dialog: a press on the close control by pointer, Enter or Space, Escape in the dialog, and, as `closeOnOutsideClick` states, a press or an Escape outside it.
An Escape held down calls it again on each repeat.
It is not called by `mount`, `update`, `destroy` or a press inside the dialog.
Fabricate does not close the dialog itself: it stays open until your `update` closes it or you call `destroy`, so to keep it open, as before a step that would lose work, do nothing; only while `target` is disconnected is the dialog not drawn, as [Overlays](#overlays) states.
If you close the dialog while focus is on it or inside it, or in the panel of a component with an overlay that you mount in a slot, first move focus to an element of your own, as the opener, because removing the focused control, or detaching a slot that holds the panel's trigger, leaves focus on the page.

- Fabricate moves no focus: when the dialog opens, focus stays where it was, so move it into your own content from a later task, as from a `setTimeout`, once the dialog is drawn.
- Tab moves focus as the browser does from any element but the dialog itself, so it can leave the dialog, except that Tab in the query field of an `IconPicker` you mount in a slot moves on from that picker's trigger, as its section states, and that an open ApplicationV1 `Dialog` in the main window takes a Tab pressed anywhere outside that `Dialog`, in this dialog too, and moves focus to its own button.
- Nothing covers the window behind the dialog, which still takes pointer and keyboard input.
- The dialog is a `role="dialog"` named by `title` and is not announced as modal, because Tab can move focus out of it and the window behind it still takes input; move focus into the dialog when it opens and back to its opener when it closes.
- An Enter held on the control that opened the dialog presses whatever then holds focus on each repeat, so move focus into the dialog onto an element that does not act on Enter, or ignore a `keydown` whose `repeat` is `true`.
- A pointer press on the dialog's surface, outside every control, moves focus to the dialog itself, which holds Foundry's keybindings off and draws no focus ring, so Escape then calls `onClose` as Escape in the dialog does, and Tab or Shift+Tab then moves focus to its first or its last control, unless an open ApplicationV1 `Dialog` takes the Tab, as above.
- Escape pressed while focus is in the dialog calls `onClose`, prevents its default and stops at the dialog, so a field you draw in a slot does not clear on it, Foundry's dismiss keybinding closes no window and an open ApplicationV1 `Dialog` does not close.
- Escape pressed on an element inside the dialog whose `aria-expanded` is `"true"` when the key goes down, or inside one, is left to that element: the dialog neither calls `onClose` nor stops it, so your own expanded control stops the Escape it handles, or the key reaches Foundry's dismiss keybinding wherever the element then focused does not take keyboard input.
- An element of yours in a slot that stops Escape itself keeps the dialog from calling `onClose`, and so does a published component mounted there that stops Escape, as a `Select`'s or an `IconPicker`'s trigger does, so Escape on such a trigger whose list is closed calls no `onClose` and the dialog stays open (issue 2677).
  Fabricate's own dialogs differ: there the dialog hears an Escape on a closed `Select` or `IconPicker` trigger before the trigger does, and closes.
- Escape reaches your own `keydown` listeners inside the dialog's slots before it stops.
- Escape with focus on the page, or on an element that Foundry does not treat as taking keyboard input and that is outside both the dialog and every panel that counts as inside it, reaches Foundry's dismiss keybinding, which, unless it first cancels a canvas drag or closes Foundry's main menu, a context menu or a tour, asks every open window to close, and when none closes releases the controlled objects or opens the main menu; with `closeOnOutsideClick` `true` it also calls `onClose`.
- Escape on the close control leaves the tooltip it shows under keyboard focus open until focus leaves the control or the dialog closes.
- Every other key and every press inside the dialog bubbles to its host and the host's ancestors, never through the `Modal`'s own `target`.

The dialog is the component's overlay, so `describe('Modal').overlays` is `true`, and it is drawn in the host [Overlays](#overlays) picks when it opens.
Pass an `overlayHost` inside the same Fabricate window, or none, because the close control, its ring and the theme are drawn as this section states only under a `.fabricate` ancestor, and in no `<form>`, `<label>`, `<a>` or `<button>` and under no element that carries `data-action`, because a press or a key in the dialog bubbles to the host's ancestors and a text field or an untyped button you draw in a slot would act on them; in your own window or dialog pass none, and the dialog opens on the standalone layer.
The dialog is centred in the nearest element above it that makes itself the containing block of fixed content, as the Manager's root does and a Foundry window or its content can, and clipped where that element clips its overflow; otherwise it is centred in the viewport of the browser window that holds its host, so it may extend past the Fabricate window's edges.
It sits above the host's other content that sets no higher `z-index`, and under any Foundry window stacked above the window that holds it; in the standalone layer it sits above every Foundry window.
Its width, height and placement are otherwise private.
`Modal` takes no rest props, so a `data-*` prop is refused with `"<key>" is not a prop of Modal`.
Its close control and its ring, and the theme its inks resolve from, come from Fabricate's module sheet, and its frame, header band and close control are drawn the same in the Manager, the player window and, under the [standalone style root](#standalone-style-root), your own window or dialog, its dialog on the standalone layer there.
A `target` in its `body` or `footer` slot sits inside the dialog on that layer, so a component you mount there is under a Fabricate root and is drawn with no standalone style root of its own.
The close control's keyboard ring is the window's accent ring, 2px wide and 2px clear of the control, and it clears 3:1 against the header band in every palette.
The title and the subtitle clear 4.5:1 against the header band in every palette, and the close glyph clears 3:1 against it in every palette.
An `update` while the dialog is open redraws its header in place and keeps its slot elements, so focus stays on a control you drew there; `destroy` removes the dialog, so where the dialog or a control in it holds focus, move focus to an element of your own first.
A dialog opened after Foundry 14 moves the window is placed and heard in the window that then holds `target`, as [Overlays](#overlays) states.
A dialog left open across a move hears no outside press or outside Escape in the new window and still hears those of the window it left; in the new window it judges an expanded control from its attribute as it then stands, not as the key went down.
Its frame, band, type and spacing figures, its colours beyond what this section states, its width, height and placement, the element it keeps in `target`, and its `manager-modal-*` classes and `data-manager-modal*` hooks are private.
`trapFocus`, `initialFocus`, `onSubmit`, `footerLayout` and `width` are not published at version 1, and `dialogProps` never is, so each is refused, as is a `class`.

A worked dialog follows: renaming a reagent from a button of yours on a panel inside a Fabricate window, for example in an extension target.

```javascript
// After `load(['Modal'])` has resolved and `fabricate.ready` has fired.
const fabUi = game.fabricate?.api?.ui;
// A Fabricate that predates the dialog describes none: draw your own dialog there.
if (fabUi?.describe?.('Modal')?.overlays !== true) return;

// `opener` is a button of yours in the same Fabricate window, outside `target`.
let isOpen = false;
let openAtPress = false;
const props = () => ({
  open: isOpen,
  title: game.i18n.localize('ACME.RenameReagent'),
  closeLabel: game.i18n.localize('ACME.Close'),
  body: true,
  footer: true,
  onClose: () => close(),
});
const dialog = fabUi.mount('Modal', { target, props: props() });

const field = document.createElement('input');
field.type = 'text';
field.value = reagent.name;
field.setAttribute('aria-label', game.i18n.localize('ACME.ReagentName'));
dialog.slot('body').append(field);
const save = document.createElement('button');
save.type = 'button';
save.textContent = game.i18n.localize('ACME.Save');
dialog.slot('footer').append(save);

function show() {
  isOpen = true;
  dialog.update(props());
  // From a later task, once the dialog is drawn, onto the field, which does not act on Enter.
  setTimeout(() => field.focus(), 0);
}

function close() {
  // Before the update removes the focused control, so focus is not left on the page.
  opener.focus();
  isOpen = false;
  dialog.update(props());
}

// A press on the opener while the dialog is open closes it as its `mousedown` fires, and its
// `click` must not open it again.
opener.addEventListener('pointerdown', () => {
  openAtPress = isOpen;
});
opener.addEventListener('keydown', () => {
  openAtPress = false;
});
opener.addEventListener('click', () => {
  const pressedOpen = openAtPress;
  openAtPress = false;
  if (!pressedOpen && !isOpen) show();
});
// An Enter held onto Save presses it once, not on each repeat; it matters only if you focus Save.
save.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.repeat) event.preventDefault();
});
save.addEventListener('click', async () => {
  close();
  await reagent.update({ name: field.value });
});

// `dialog.destroy()` when the panel goes away, moving focus to the opener first if the dialog holds it.
```

### The descriptor

`api.ui` is a frozen `{ schemaVersion: 1, components, describe, mount, load, mountMany }`.
`components` lists the published names in publication order, and a new name is appended, never interleaved.
`describe(name)` returns a frozen `{ version, props, rest, root, overlays }`, where each prop is `{ kind, required, requiredWhen? }`, `rest` says whether the component takes `data-*` attributes, `root` is the Fabricate ancestor its `target` needs (it does not say whether Fabricate draws the component under the standalone style root) and `overlays` says whether it opens an overlay, described under [Overlays](#overlays); it returns `null` for a name that is not published.
A prop's `kind` is `data`, `text`, `slot`, `callback`, `aria` or `value`.
`requiredWhen` is present only where a prop is required while another is truthy, and names that other prop; `required` is then `false`.
A `data` prop takes plain data, and the component receives a copy.
A `text` prop takes a string, which Fabricate draws as plain text inside the component and never reads as HTML; the element Fabricate wraps it in is private.
A `text` prop that is `undefined`, absent or `''` is omitted, so the component's own fallback applies; a required one refuses `''`.
A `slot` prop is a content slot, a place where the component draws your own content.
It takes `true` to request the content slot and `false`, `undefined` or absence to omit it, and it is never required.
A `callback` prop takes a function, and `undefined` or absence omits it, so the component's own default applies.
A required `callback` prop refuses absence and `undefined` with `<name> requires a non-empty "<key>"`, and one whose `requiredWhen` names a prop that is truthy refuses them with `<name> requires a non-empty "<key>" when "<other>" is truthy`; either refuses any value that is not a function, `''` included, with `"<key>" must be a function`.
The component holds one stable stand-in for your function for the life of the mount, so an `update` that passes another function re-renders nothing and the next call reaches the newest function.
Fabricate calls your function with the arguments the component's section states, or, for a value prop's `on<Key>Change`, `(next, previous)`, in that order, and with nothing else: each is a plain copy, and no event, DOM node or Fabricate object is passed.
The call is synchronous, inside the user's event, after the component has finished its own state change; a published callback is never called while Fabricate renders or runs an effect.
It runs under Fabricate's `untrack`, which covers Fabricate's runtime only, so if you are called back inside an effect of your own, untrack your own reads.
Your function may call `update` or `destroy` on its own handle, or `mount`, before it returns; an `update` made there is drawn on Fabricate's next flush, except that a value it changes is drawn before the call returns.
After `destroy`, a fault, or an `update` that omits the prop, Fabricate does not call the function again; a required prop cannot be omitted, so an `update` that omits it throws and the earlier function still answers.
Detect a callback prop with `describe(name).props[key]?.kind === 'callback'`, because a Fabricate that predates it refuses the prop.
An `aria` prop is an ARIA attribute Fabricate writes, under the prop's own name, on the control the component's section names; the component declares no prop of that name.
It takes a string, a number or a boolean and writes it as the attribute's value, so `false` writes `"false"`; `undefined` or absence writes no attribute; anything else throws `"<key>" must be a string, number or boolean`.
An `aria` prop is never required.
An `update` that changes the prop's value writes it on the same element, and one that omits the prop removes the attribute.
Fabricate writes the attribute only when the value differs from the one it last wrote, so it puts back nothing other code removed or replaced.
Fabricate checks no value against the attribute's own set: the component's section states the accepted values, and any other is private.
Detect an `aria` prop with `describe(name).props[key]?.kind === 'aria'`, because a Fabricate that predates it refuses the prop.
A camel-case prop is one the component interprets, and a hyphenated `aria-*` prop is an attribute Fabricate writes under that name; a control's name is carried by the prop its section names, and by the text that an `aria-labelledby` prop its section names points at.
A `value` prop is a value the component binds and may change itself, such as the text of a search field.
It takes a string, a number, a boolean or `null`, and anything else throws `"<key>" must be a string, number, boolean or null`; `undefined` or absence means you pass none, so the mount starts at the component's own initial value, which its section states.
A `value` prop is never required.
Each `value` prop brings an optional callback prop named `on`, the prop's name with its first letter upper-cased, then `Change`: `query` brings `onQueryChange`.
`describe` lists the value prop as `{ kind: 'value', required: false }` and directly after it that callback as `{ kind: 'callback', required: false }`.
Fabricate calls it with `(next, previous)` only when the component changes the value itself, once per change, and never when the two are the same by `Object.is`; `mount` and `update` never call it.
A component that clears a value to `undefined` changes it to its initial value, so `next` is never `undefined`.
Inside the call, `handle.value(key)` already answers `next`.
A throw from it is reported as any callback's is, under [Mounting, updating and destroying](#mounting-updating-and-destroying).
Inside that call, an `update` with the same value changes nothing, and one with another value is drawn before the call returns and wins, with no second call, so you can reject, revert or transform what the user typed; one made later shows on the next flush, so the user briefly sees their own text first.
A replaced value moves a text input's caret to the end and ends any IME composition in progress.
`handle.value(key)` reads a value prop's current value, and answers `undefined` for any other prop and after `destroy` or a fault; `null` is a legal value.
Detect both before you rely on them, because a Fabricate that predates a value prop refuses it:

```javascript
const bound = fabUi.describe(name)?.props[key]?.kind === 'value';
const readable = typeof handle.value === 'function'; // `handle` is what `fabUi.mount(...)` returned.
```

An ARIA attribute is published only as an `aria` prop a component's section names.
A state the component shows (`aria-pressed`, `aria-checked`, `aria-selected`, `aria-current`, `aria-disabled`), `aria-hidden`, a live-region attribute (`aria-live`, `aria-atomic`, `aria-relevant`) and a reference that re-parents content (`aria-owns`, `aria-activedescendant`, `aria-flowto`) are never published as one.
A name source (`aria-label`, `aria-labelledby`) and any other `aria-*` name, `aria-controls`, `aria-haspopup` and `aria-busy` among them, are not published at version 1 unless a component's section names the prop (`StatusToggle`'s section names `aria-labelledby`); publishing one later is additive.
`mount(name, options)` draws a component and `load(names)` loads its code first; both are described under [Mounting, updating and destroying](#mounting-updating-and-destroying).
`mountMany(name, items)` draws one component into several targets, as [Mounting several at once](#mounting-several-at-once) describes.
`typeof fabUi.load === 'function'` also says that `mount` honours `onFault`.
Treat an unknown name, member, prop kind or root as absent, and never assume the list is closed: adding a component, an optional prop, a descriptor member, a handle method or a prop kind, or widening a component's root, is additive, and so is adding a value to a prop's accepted values where the prop's section states that a value outside its accepted values draws as unset, as `Medallion`'s `tone` and `ink` do: a Fabricate that predates the value draws the unset render and refuses nothing.
Where a section says nothing of a value outside a prop's accepted values, or calls what is drawn for it private, pass only the values that section lists.
Narrowing a component's root is a breaking change.
The rest names a component reserves are fixed for its `version`, and reserving another is a narrowing; `describe` does not state them, so read them from the component's section.
A breaking change to one component bumps that component's `version`, keeps the old shape as a deprecated delegate for at least one minor release, and is announced in the release notes; `schemaVersion` changes only with the seam's own shape.

### Mounting, updating and destroying

`mount(name, { target, props = {}, onFault, overlayHost })` is synchronous and returns with the DOM in place; effects and the component's scoped stylesheet apply on Fabricate's next microtask flush.
It renders on Fabricate's own Svelte runtime, so a companion's own Svelte version does not have to match it; Fabricate's premium companion builds against Svelte 5.56 or later.
It returns a frozen `{ update(props), destroy(), slot(key), value(key) }`.
Fabricate draws the component's elements inside `target` and attaches no shadow root of its own, so they share `target`'s root node and an id reference resolves across the mount in either direction; the one exception is an open overlay's panel, which is drawn in its host.

- `target` must be an element (checked by `nodeType`, so an element in a Foundry 14 detached window is accepted), must be empty, and must not hold a live mount.
  A component whose root is not `any` also needs that Fabricate ancestor above `target`: otherwise `mount` throws `<name> needs a Fabricate window ancestor` or `<name> needs a Fabricate manager ancestor`, before it claims the target.
  A Fabricate root is a `.fabricate` ancestor that is not a standalone style root.
  A component Fabricate draws under the standalone style root throws `<name> cannot be drawn in a shadow root`, also before it claims the target, where `target` has no Fabricate root and its root node is a shadow root.
- `props` must be a plain object of the component's published props, holding only data: primitives, plain objects and arrays, with a function only as a callback prop's value and no cycle.
  A function anywhere else, at any depth, throws `"<key>" must not hold a function`, naming the prop that holds it.
  A `callback` prop holds a function, and anything else there throws `"<key>" must be a function`.
  A `text` prop holds a string, and anything else there throws `"<key>" must be a string`.
  A `slot` prop holds `true` or `false`, and anything else there throws `"<key>" is a slot and takes true or false`.
  A component whose `rest` is `true` also takes `data-*` attributes holding a string, number or boolean, and any other rest key throws `"<key>" is not a data attribute`.
  Where a component's section says its rest lands on a control, `data-keyboard-focus`, `data-action`, `data-cursor`, `data-tooltip`, every name that starts `data-tooltip-`, and the two names Fabricate's own stylesheet reads off its buttons, `data-validation-focused` and `data-essence-sort-direction`, throw `"<key>" is reserved on <name>`.
  Where it also says that control carries Foundry's tooltip, `data-locked` throws the same.
  An `aria` prop holds a string, a number or a boolean, and anything else there throws `"<key>" must be a string, number or boolean`.
  A `value` prop holds a string, a number, a boolean or `null`, and anything else there throws `"<key>" must be a string, number, boolean or null`.
- `onFault` is optional, and is described with faults below.
- `overlayHost` is optional, and is described under [Overlays](#overlays).
  When it is passed, on any component, it must be an element of `target`'s own document (checked by `nodeType`), or `mount` throws `overlayHost must be an element in the target's document`, after the root check and before it claims the target.
- Props are copied when you pass them, so mutating your object afterwards changes nothing.
- `update(props)` replaces the props, so an omitted prop falls back to the component's default, and nothing remounts; an omitted or `undefined` value prop keeps its current value instead.
  It is atomic: when it throws, the previous props stay rendered.
  It returns `true` once accepted and `false` after `destroy` or a fault.
- `destroy()` is idempotent, never throws, releases the target, and closes every overlay the mount holds open.
  Call it from your own cleanup, from an ApplicationV2 `_preClose` or `_onClose` (or before `super.close`), and on any re-render that replaces the target or its ancestors (in `_preRender`, or in `_onRender` before mounting again), because DialogV2 and Handlebars `_replaceHTML` replace their content on render; `destroy` works whether or not `target` is still in the document.
  It is safe after a fault, and still expected there.
  A mount that is never destroyed leaks for the life of the page, and keeps its slot elements, their content and every nested mount with it.
- `slot(key)` returns the content slot's element, the same one for the life of the mount once it has been requested.
  It returns `null` for an unknown key, for a content slot never requested, and after `destroy` or a fault.
  The element is a `<div>`, or a `<span>` where the component draws the content slot inside phrasing content; each component's section says which.
  It is created by `target.ownerDocument` and carries `display: contents` and no other attribute, so its children lay out as the component's own would.
  The element Fabricate holds it in is private.
- `value(key)` returns a value prop's current value, and `undefined` for any other prop and after `destroy` or a fault.

`mount` and `update` throw a `TypeError` whose message starts with `Fabricate | published components:` for a malformed request, and `mount` throws a plain `Error` ending `not registered` if Fabricate's runtime has not loaded.
A `mount` before the `fabricate.ready` hook has fired throws `mount before ready`, a `mount` of a lazy component before `load` has resolved for it throws `"<name>" is not loaded`, and a required prop that is absent, or `''` where it is not a callback prop, throws `<name> requires a non-empty "<key>"`; `''` on a callback prop throws `"<key>" must be a function`.
A prop whose `requiredWhen` names a truthy prop is refused the same way while that prop is truthy, with `<name> requires a non-empty "<key>" when "<other>" is truthy`; with several, the first prop `describe` lists is named.
The full list of fixed messages is in the `ui-extension-points` specification's Published UI Components section.

Fill a content slot by mounting a component of your own into its element, or by appending an element you own.
In a `<span>` content slot what you append is phrasing content, a `<span>` for a mount target.
Style and attribute your own elements and never the slot element: a class, role, `tabindex` or ARIA attribute on it is unsupported.
A child of a content slot that draws nothing still takes the host's gap.
A host spaces a content slot's children by `gap`, except where its section states it draws them in normal flow, as [`Well`](#well) does; you then fill that slot with one element of your own that lays out its content.
Focusable content you draw in a content slot is yours to mark `data-keyboard-focus="true"`.
A `<button>` you draw there states `type="button"`: an untyped button submits the `<form>` it is in, and in Foundry that closes a DialogV2 and saves a document sheet.
Put `data-action` on nothing you draw there: the window dispatches a click on any `data-action` inside it, `close`, `tab` and `toggleControls` in every window and each button's name in a DialogV2.
Fabricate attaches the slot element wherever the component draws that content slot, and detaches it with its contents intact while it does not; a detached element is disconnected, and your components, effects, listeners and bound values inside it keep running, though a component with an overlay mounted in it closes its open panel, as [Overlays](#overlays) states.
Each detach and attach is a DOM removal and insertion, so the browser resets what it resets on those: an `<iframe>` reloads, playing media pauses, focus and scroll positions inside the slot element are lost, CSS animations restart, and a custom element receives `disconnectedCallback` and `connectedCallback`.
That happens when the content slot is omitted and requested again, when an `update` makes the component replace the element holding it, and when a Foundry 14 window is detached or re-attached, which also moves the content to another document.

A published component may itself be mounted in a slot element, and one `destroy` then ends both:

```javascript
// After `load(['InspectorCard', 'Kicker'])` has resolved and `fabricate.ready` has fired.
const card = fabUi.mount('InspectorCard', { target, props: { children: true } });
const nested = [
  ['Kicker', { children: 'Renown' }],
  ['Meter', { label: 'Renown', value: 3, max: 5, valueText: '3 of 5 renown' }],
].map(([name, props]) => {
  const element = target.ownerDocument.createElement('div');
  card.slot('children').append(element); // Append first: a root other than `any` is judged from here.
  return fabUi.mount(name, { target: element, props });
});

card.destroy(); // Ends the kicker and the meter, then the card.
```

`destroy` first destroys every live published mount inside its slot elements, then detaches each slot element with its remaining children untouched.
The nested handles are dead from then on: `update` answers `false` and `destroy` does nothing, so drop them with the card's handle, in `onFault` as well.
Fabricate never empties a slot element and never calls into your runtime, so content you drew there with your own runtime is yours to tear down, before `destroy`.
On every path that ends such a mount, unmount what you drew in its content slot with your own runtime, then call `destroy` on the outermost handle, which ends every published mount nested in its slot elements.
A navigation provider does both in the cleanup its `mount` returned, which Fabricate calls while the target is still connected and before `requestRemount` clears it.
A host that replaces its content on every render (DialogV2, a Handlebars part) does both on each re-render and mounts again in `_onRender`.

If the component faults while rendering, updating or in an effect, Fabricate logs `Fabricate | Published component render failed:` with the name and the error, empties `target`, and the handle goes inert.
The report, and `update` answering `false`, arrive after a microtask, never inside the `mount` or `update` call that caused the fault.
Any fallback copy is yours to draw.
A teardown that throws while Fabricate unmounts is reported the same way, a microtask later.
After such a teardown the target may still hold a node of Fabricate's, so empty it before mounting there again.
A cleanup that throws while Fabricate tears a faulted component down is reported as that mount's fault, once, with the cleanup's error.
A fault ends nested published mounts, detaches slot elements and closes open overlays as `destroy` does; a nested mount is destroyed, not faulted, so its own `onFault` is not called.
Keep your own reference to content you drew in a content slot and tear it down from `onFault`, because `handle.slot` answers `null` from then on.

Pass `onFault(error)` to `mount` to be told of that fault.
It is called once, in a microtask after Fabricate has torn its own content down, and never inside `mount`, `update` or `destroy`.
By then the claim is released and `target` is empty, so you may mount into it from `onFault`.
Do not mount the same input again unconditionally: a fault that repeats calls `onFault` again in a later microtask of the same task, so the page cannot paint in between.
A throw from `onFault` is reported as a render failure under the component's name and goes no further; a Promise it returns is ignored.
Without `onFault`, a fault is discovered only when `update` answers `false`.

```javascript
const handle = fabUi.mount('Kicker', {
  target,
  props: { children: 'Standing' },
  onFault: () => {
    target.textContent = 'Standing'; // Your own fallback, drawn into the emptied target.
  },
});
```

What a callback prop's function returns is ignored.
A throw, or the rejection of a Promise it returns, is logged as `Fabricate | Published component callback failed:` with the name, the prop and the error, and goes no further: the mount stays live, it is not a fault, and `onFault` is not called.
A refusal that an `update` throws inside your function is reported the same way unless you catch it.

`load(names)` takes an array of published names and returns a Promise.
A value that is not an array is read as one name.
It never throws synchronously, and is callable as soon as `api.ui` is readable, before `fabricate.ready`.
`api.ui` is readable from `setup` onward; in your own `init` it may not be bound yet.
It resolves `undefined` once every named component's code is loaded: at once, on the next microtask, for a component Fabricate loads with its own entry script, and once its code is fetched for a lazy one.
It rejects with a `TypeError` ending `"<name>" is not published` for a name that is not published, before it fetches anything, and with the browser's own error when a lazy component's code cannot be fetched.
It does not wait for `fabricate.ready`, so `mount` still throws `mount before ready` until that hook has fired.
`TierTrack` and the seven components of issue #2448 never need it; `Kicker`, `Chip`, `Rail`, `InspectorCard`, `EmptyState`, `Notice`, `Button`, `StatusToggle`, `Stepper`, `SearchField`, `Select`, `StageBars`, `Field`, `Well`, `Callout`, `IconButton`, `EditorTabs`, `RadioCardGroup`, `SegmentedControl`, `Pagination`, `IconPicker`, `ActionMenu` and `Modal` were published with `load`, so call it for each before mounting.
`Rail` is lazy: Fabricate's entry script does not carry its code, `load` fetches it, and until `load(['Rail'])` has resolved, `mount('Rail', …)` throws `"Rail" is not loaded` and draws nothing.
A `load` you do not await still starts the fetch, but `mount` refuses the component until it has resolved, and a rejection nothing handles is an unhandled rejection.
A lazy component's code is fetched once per page session: calls made together share the one fetch, and a fetch that failed is not retried, so every later `load` naming it rejects with the same error and `mount` keeps refusing it until the user reloads.
Fabricate draws no pending state and no error state for a load, so draw your own until `load` settles and, when it rejects, your own error state, announced through your own live region.
When the fetch failed because the browser runs a stale copy of Fabricate, Fabricate also shows its reload notice, shared with the Manager's so one shows at a time, and at most once per page session.
A failure before Foundry has created its notifications, which a `load` made in `setup` can meet, shows that notice when Foundry's `ready` hook fires.
Once loaded, a lazy component mounts, draws and behaves exactly as it would if Fabricate loaded it with its entry script.
Call `load` once, keep the promise, and mount only after it has resolved and Fabricate is ready:

```javascript
let published = null;

Hooks.once('setup', () => {
  const fabUi = game.fabricate?.api?.ui;
  // Absent on a Fabricate that predates `load`, where `mount` also ignores `onFault`.
  // Settled to a boolean here: a name this Fabricate does not publish must not reject in a render.
  published = fabUi?.load?.(['Kicker', 'Chip']).then(() => true, () => false) ?? null;
});

// In your ApplicationV2, once `fabricate.ready` has fired:
async _onRender(context, options) {
  await super._onRender(context, options);
  if (!(await published)) return;
  // Mount here, destroying any earlier handle first.
}
```

An ApplicationV2 `_onRender` may await the promise, but handle its rejection where you keep it: Foundry awaits `_onRender`, so a rejection there fails the render and skips the `render` hooks.
A navigation provider's `mount` callback may not, because it returns synchronously, so content drawn there mounts its published components when the kept promise settles.

### Mounting several at once

`mountMany(name, items)` draws one component into several targets in one call, such as a `Meter` in each row of a list.
`items` is an array, and each item is what you would pass `mount` as its options, `{ target, props, onFault, overlayHost }`.
Each item has its own `onFault` and `overlayHost`, and nothing is shared across the call.
It returns a frozen array of handles, one for each item and in the same order, and each handle is the one `mount` would have returned.
An empty array returns a frozen empty array.
Detect it with `typeof fabUi.mountMany === 'function'`.

```javascript
#meters = [];

// In your ApplicationV2, once `fabricate.ready` has fired. `Meter` never needs `load`.
// `#party` is your own list.
_onRender(context, options) {
  super._onRender(context, options);
  const fabUi = game.fabricate?.api?.ui;
  if (typeof fabUi?.mountMany !== 'function') return;
  for (const handle of this.#meters) handle.destroy(); // A re-render replaced the old targets.
  this.#meters = fabUi.mountMany(
    'Meter',
    this.#party.map((member) => ({
      target: this.element.querySelector(`[data-hp-meter="${member.id}"]`), // Empty, and yours.
      props: {
        label: `${member.name}'s hit points`,
        value: member.hp,
        max: member.maxHp,
        valueText: `${member.hp} of ${member.maxHp} hit points`,
      },
    }))
  );
}

async _preClose(options) {
  for (const handle of this.#meters) handle.destroy(); // Each handle is destroyed on its own.
  await super._preClose(options);
}
```

`mountMany` checks the whole call before it draws anything, so a refused call draws nothing and you correct it and call again.
The first problem it finds is the one it throws, with the message `mount` would give.
It checks the name first, as `mount` does, so it throws `not registered`, `mount before ready`, `"<name>" is not published`, or, for a lazy component before `load` has resolved for it, `"<name>" is not loaded`.
It then throws `items must be an array` for anything that is not an array, a single item included, because it never reads one item as a list of one.
It reads the length of `items` once and follows no iterator, so an item added while the call is checked is not drawn.
It then checks each item in order exactly as `mount` checks its options, apart from the stale-mount case below.
An item that is not an object, or a hole in the array, has no `target`, so it throws `target must be an element`.
Two items that name the same `target` throw `target already holds a published component`.
The check ends no earlier mount.
A mount whose content you cleared without destroying it is ended only when its target's item is drawn.
If that mount left a node in the target, `mountMany` throws `target must be empty`, where `mount` would end that mount first and draw.
Destroy that mount's handle or empty the target before you call.
A target you mean to place inside the content slot of another item of the same call is not inside it yet.
A component that needs a Fabricate ancestor refuses that target, so mount the outer items first and the nested ones in a later call.
A stale mount can also have a content slot that holds a later item's target, when an earlier item's draw ends that stale mount.
The later item is still drawn, into the detached slot, where separate `mount` calls would refuse it for a component that needs a Fabricate ancestor.
A component Fabricate draws under the standalone style root is drawn there with no standalone style root, where separate `mount` calls would write one.
Mount nested targets in a later call.
Once the call has been checked, a fault while one item renders is that item's own.
Its handle is inert, only its own `onFault` is called, and the other mounts are drawn and stay live.
There is no call that destroys them all.
Destroying one handle leaves the others live, so destroy each handle on every path that ends its mount.

### Overlays

A component whose `describe(name).overlays` is `true` opens an overlay: a panel it draws outside `target` while it is open, such as a list, a menu or a dialog.
`Select` is the first, and its section states what its list draws.
`IconPicker` is the second: its list and its query field are the overlay, and its section states what they draw.
`ActionMenu` is the third: its menu is the overlay, and its section states what it draws.
`Modal` is the fourth: its dialog is the overlay, and its section states what it draws.
`mount` ignores an option it does not know, so `overlays === true` is also your signal that `overlayHost` is honoured.
Each time an overlay opens, Fabricate picks where to draw it, from `target`'s own document at that moment:

1. the `overlayHost` element you passed, while it is connected and in `target`'s document;
2. else the nearest Fabricate window root above `target` (`.fabricate-manager`, `.fabricate-app`), or a Fabricate standalone layer;
3. else a standalone layer Fabricate keeps on `target.ownerDocument.body` while any overlay in that document is open on it, themed from the nearest ancestor of `target` inside its `<html>` that carries `data-fabricate-theme`, else from Fabricate's own document, copied when the layer is made.

Give `overlayHost` a `position` other than `static` with a size, because it is the panel's containing block and the origin its coordinates are measured from; it need not be connected when you mount.
A `Modal` dialog is `position: fixed`, so its host's `position` does not make the host its containing block, as its section states.
A component's section may narrow where `overlayHost` sits, and `Select`'s, `IconPicker`'s, `ActionMenu`'s and `Modal`'s do: keep it inside the same Fabricate window as `target`, and pass none where `target` has no Fabricate root.
The standalone layer Fabricate keeps for your panels spans the viewport of its window, the box they are measured against, and takes no pointer, so a panel on it is placed where it was measured and the page around the panel still takes input.
Unless the panel's own section says it stops it, a press or a key in a panel on the standalone layer bubbles to the page's body and document and never through your window, target or any element of yours, so a listener of yours there hears none of it; Escape pressed in it reaches Foundry's dismiss keybinding, which closes no window where the panel's section says so, as for an `IconPicker` list or an `ActionMenu` menu.
The panel is drawn inside a `display: contents` element Fabricate mounts on its own runtime, so the panel's own handlers run in whichever document holds it, a Foundry 14 detached window included.
Where its host is the standalone layer, that element states `pointer-events: auto` and a Fabricate window's typeface and size, `var(--font-body, var(--font-primary, sans-serif))` and `var(--font-size-14)`.
That element, the panel and everything in it are private: select none of it.
The standalone layer, its class and its `data-fabricate-theme` copy are private too.
A standalone style root is a different element, is never an overlay host, and holds no panel.
The panel is not clipped by `target`'s overflow, because it is drawn in its host; place `overlayHost` where it is not clipped.
An overlay listens for outside presses, Escape and scrolls on the document that holds it, and an open `Select`, `IconPicker` or `ActionMenu` watches that document for its `target` leaving it; it listens for resizes, and a `Modal` dialog for its record of each Escape, on that document's window.
An overlay whose document has no window stays closed.
An overlay opened from a published mount nested in another mount's content slot, or from inside another overlay's panel, takes the host chain of that mount or panel.
`destroy` and a fault close every open overlay and remove its panel, its element and a standalone layer nothing else uses.
The panel of a component with an overlay, a [`Select`](#select), an [`IconPicker`](#iconpicker) or an [`ActionMenu`](#actionmenu), also closes when its `target` is disconnected while your mount is live, as when an `update` of the component whose content slot holds your mount detaches the slot.
Its panel and its element are removed, focus is not moved, so focus left in the panel goes to the page, and the component calls no callback.
A `target` that is removed and inserted again within one run of script keeps its panel open.
A panel stays watched in the document it opened in, so after a Foundry 14 move a detach in the new window does not close it.
A `target` inside a shadow root closes its panel when that root's host leaves the document, and not when the removal happens inside the shadow root.
A `Modal` dialog closes the same way while its `target` is disconnected, as when an `update` of another `Modal` whose content slot holds it detaches the slot: the dialog is removed and calls no callback, and because its `open` still stands it is drawn again once `target` is attached, watched in the document it opened in as a panel is (issue 2678).
On Foundry 14 Fabricate does not follow a mount from one window to another, so destroy it and mount again in `_onDetach` and `_onAttach`; that `destroy` closes any open overlay.
Foundry moves an application rendered with `renderChild` into its parent's detached window without calling its `_onDetach`, and an overlay opened after any move is placed and heard in the new window.

```javascript
// A positioned element of your own window; a Fabricate that predates overlays ignores it.
const overlayHost = this.element.querySelector('.my-module-overlay-host');
const handle = fabUi.mount(name, { target, props, overlayHost });
```

### Ownership and theme

You own the placement of `target`: size it as a block-level container, write nothing inside it while it is mounted except inside a slot element, and style only the target's own box.
A published component inherits from `target` every inherited text property its own rules do not state, so set none on `target`.
`.fab-*` and `manager-*` classes and `svelte-*` hashes are private and may change in any release: select none of them, and write no `manager-*` class on an element you own, `target` included.
Never write `fabricate`, `fabricate-app` or `fabricate-manager` on an element you own.
A `data-*` name Fabricate writes is private as its classes are: pass only rest names that carry your own module id, because Fabricate styles some of its own elements by a `data-*` hook.
Pass final display text: a string you supply is rendered verbatim and never treated as a localization key.
Localise it first with your own `game.i18n`; Fabricate adds no default copy or accessible name but the glyph names an `IconPicker` draws, as its section states.
A published component is not a live region unless its section says it is.
Every component states a root, the Fabricate ancestor its `target` needs.
A component whose root is `any` resolves its tokens from `:root[data-fabricate-theme]` and its own stylesheet, so it needs no Fabricate ancestor.
The exception is a component Fabricate draws under the [standalone style root](#standalone-style-root), whose tokens resolve from that element's `data-fabricate-theme`.
A `fabricate` component needs a Fabricate root, a `.fabricate` ancestor that is not a standalone style root, which Fabricate's window frames carry (the player window, the Manager and the interactable windows), so both extension targets have it.
A `manager` component needs a `.fabricate-manager` ancestor, the Manager's root inside its frame.
Every component published at version 1 states `any`, so `fabricate` and `manager` are values `describe` may return for a later component, and no mount you make today is refused for a missing Fabricate ancestor.
`mount` decides it by class, with `target.closest`, at `mount` only, and judges a target inside a slot element that is not attached from the mount that owns that element.
Your own window, a chat message and another module's sheet carry no Fabricate root, so they host `any` components only, and the sixteen components the [standalone style root](#standalone-style-root) section names are drawn there under one, `Stepper` only where `target` is in no `<form>`.
Mount a component after `target` is attached to its final document.
In an ApplicationV2, mount in `_onRender`, never in `_renderHTML`.
A mount into an attached target in its final document is styled, including in a Foundry 14 detached window.
A later move between windows is not carried to a mount, and a theme change made after a window detached does not reach that window (issue 2432).
A companion that owns the ApplicationV2 re-mounts in `_onDetach` and `_onAttach`; content inside a Fabricate window has no such signal.
Mount at the composite level, on stable keyed elements, and reuse a mount through `update` rather than mounting per row.

A published component draws a control only where its section says so, and each control is a native element: a `<button type="button">`, an `<input>`, a `<select>` or a `<textarea>`.

- A control never submits a `<form>` it is mounted in, except that a text-like `<input>` submits it on Enter as implicit submission does (through the form's first submit button, or alone where it is the form's only text field) and fires a bubbling `change` that a form with `submitOnChange` submits on, and a `RadioCardGroup` or `SegmentedControl` radio, or a `Pagination` page-size radio, fires a bubbling `change` on each choice that such a form submits on too; in Foundry a submit closes a DialogV2 and saves an editable document sheet.
  That exception reaches a radio and a number input too where the form has a submit button: Enter there submits the form, as on a text-like input.
- A `reset` of the `<form>` a control is in changes what it shows and reports nothing, and an `update` that passes the same value does not redraw it, so reset no form a published control is in, or destroy the control and mount it again (read from Svelte 5.56 source, not run).
- A `<button>` carries `data-keyboard-focus="true"` on itself, so Foundry runs none of its keybindings while it holds focus; an `<input>`, a `<select>` and a `<textarea>` hold them off without it.
  Where a component's rest lands on the control itself, `data-keyboard-focus` is refused, so you cannot replace it.
- A button is pressed by pointer, Enter or Space, as the platform presses a native button, and handles no other key itself unless its section names the key, as the `EditorTabs` section does: a `keydown` listener of yours above `target` still receives every key, except from a `Select` or `IconPicker` trigger, which stops each key but Tab, with or without Shift, and an `ActionMenu` trigger, which stops ArrowDown and ArrowUp, as each section states, and Foundry's keybindings stay held off as the bullet above states.
  A key pressed in an open `Modal` dialog bubbles to the dialog's host and its ancestors, never through the `Modal`'s own `target`, and Escape there stops at the dialog, as its section states.
  A pointer press acts on release, as a `click`, never on pointer down, so a pointer that leaves the control before release cancels it.
  Enter presses on key down and again on each repeat while held, except on the `Pagination` arrow or page-size radio, or the `ActionMenu` trigger or item, Fabricate has moved focus to, as each section states, and Space on release.
  In an ApplicationV1 `Dialog` Enter presses no control: that dialog takes Enter anywhere inside it and submits its default button, so a control there is pressed by pointer or Space.
- A control consumes only the keys the platform gives its native element, and its section names any other.
  Tab moves focus as the browser does, except in an open `ActionMenu` menu, where it closes the menu and returns focus to the trigger, a published behaviour kept so your Tab handling does not change, and in an open `IconPicker` list's query field, where it closes the list and moves focus on from, or back to, the trigger, as each section states, and Escape still closes a DialogV2 while a control holds focus, because a DialogV2 listens for Escape on its own element, except while a `Select` or `IconPicker` trigger holds focus, because it stops Escape, as each section states.
  In any other window Escape closes nothing while a control holds focus, because closing a window on Escape is one of the keybindings held off; an open ApplicationV1 `Dialog` still closes, because it listens for Escape on the document, unless the key is pressed in an open `Modal` dialog, which stops it at the dialog unless an expanded control there keeps it, and asks you to close that `Modal`, as its section states.
  An open ApplicationV1 `Dialog` in the main window takes a Tab pressed anywhere outside that `Dialog` and moves focus to its own button.
- A control draws its own mark for keyboard focus where the component's `root` is `any` and Fabricate does not draw it under the standalone style root; otherwise it shows the Fabricate window's accent ring, 2px wide, at the offset the component's section states, except an `ActionMenu` item, whose 1px accent ring is drawn inside its edge, and a `SearchField`, whose shell's 1px border takes the accent while its input draws no ring, as each section states.
  A text-like input or textarea you draw in a `Field`'s content slot shows the field's 1px accent ring, inset 1px, as that section states.
  Where a component's rest lands on the control itself, `data-validation-focused` and `data-essence-sort-direction` are refused: they are names Fabricate's own stylesheet reads off its own buttons, whose effect is private, and the first, under a Fabricate root, draws the keyboard ring on a control that does not hold focus.
- A control's accessible name is text you pass through a prop its section names, or your own visible text that an `aria` prop its section names points at, and Fabricate supplies none, except an `IconPicker` row, which its section names by its glyph's `label`.
  Where a prop carries the name, `aria-label` is refused, and so is `aria-labelledby` unless the component's section names it as an `aria` prop.
  A section names `aria-labelledby` only for a control that draws no text of its own and is named through `aria-label` by a required `data` prop holding the same text, so the control is never without a name: an id list that names no element leaves the name from that prop.
- Fabricate moves no focus, except that focus moves among the tabs of one `EditorTabs` strip on a press and on the keys its section names, and the platform moves it among the radios of one `RadioCardGroup` or one `SegmentedControl` on the arrow keys, and when an `update` disables or removes the `Pagination` arrow that holds focus, Fabricate moves it to that pager's other arrow or its checked page-size radio, as its section states, each never out of `target`.
  An `IconPicker` is the exception to `target`: Fabricate moves focus from its trigger into its open list's query field, outside `target`, and back to the trigger when a choice, Escape or Tab in the query field closes the list, from which the browser moves a forward Tab on, as its section states.
  An `ActionMenu` is another exception to `target`: Fabricate moves focus from its trigger into its open menu, among the menu's items on the keys its section names, and back to the trigger when a choice, Escape or Tab closes it, as its section states.
  An `update` or `destroy` that removes a focused control leaves focus on the document body, where Foundry's keybindings apply, except where this bullet's first sentence has Fabricate move it off a `Pagination` arrow, so move focus to an element of your own before you call either.
  The destination is, in order: the control the press leads to; the next control in your own content, then the previous one; and where none exists, the heading or container of the region `target` sits in, which you give `tabindex="-1"`.
  Where the destination is drawn by the same change, draw it first, focus it, and then remove the control.
- To return focus to a published control, after a dialog its press opened has closed, focus the focusable element inside `target` that the component's section names; nothing else inside `target` is yours to select.
- A press bubbles from the control as a `click`, except a press on a `Select`, `IconPicker` or `ActionMenu` trigger, which stops at the trigger, and a press inside an open `Select` or `IconPicker` list or `ActionMenu` menu, which stops there.
  An element of yours above `target` that listens for `click` receives every other press too.
  A press inside an open `Modal` dialog bubbles to the dialog's host and its ancestors, never through the `Modal`'s own `target`.
  Keep `target` out of any element of your own that carries `data-action`, and pass no `data-action` through rest to a component that draws a control: the window dispatches the nearest `data-action` above the press, and `close` closes it, as a DialogV2 button's own action name submits it.
  Where a component's rest lands on the control itself, `data-action` is refused: the press would dispatch it, `close` closing the window and, in Foundry 14, `detach` moving it to its own browser window.
  Keep `target` out of a `<label>`, an `<a>` and a `<button>` of your own.
- A control is unavailable only through a prop its section names.
  A natively `disabled` control leaves the tab order and cannot take focus, so never disable the control that holds focus, except a `Pagination` arrow, which its section lets an `update` disable: ignore the press instead, and where the control must then become unavailable, first move focus to the destination the "Fabricate moves no focus" bullet orders.
  Disabling the control that holds focus drops focus to the document body, where Foundry's keybindings apply, as removing it does, except where `Pagination`'s section states that Fabricate moves it.
  In a document sheet the user cannot edit, Foundry disables every form control inside the sheet's `<form>` on each render, a published control already mounted there among them, and the control looks as it did, apart from a switch's pointer cursor, which becomes `not-allowed`, so mount a control there from the sheet's render hook or after `super._onRender`, once that pass has run.
- A control that shows a state (pressed, checked, selected, current) takes it from a `data` prop and exposes it in the accessibility tree as well as in colour.
  A press reports through the callback, and the control shows the new state when your `update` passes it; its section says where a native control changes itself first.
  The attribute that exposes the state is the component's own, so `aria-pressed`, `aria-checked`, `aria-selected` and `aria-current` are refused as props.
  `aria-expanded` is an `aria` prop because it reports a region the control does not draw, which the component shows nowhere.
- A control takes an ARIA attribute from you only through an `aria` prop its section names; every other `aria-*` name is refused.
- An `aria` prop that takes an id (`aria-describedby`, `aria-labelledby`) names an element you own, in the same tree as `target`, outside `target` or inside one of its content slots.
  The element it names holds text you also draw visibly; Fabricate does not check this.
  Fabricate resolves and checks nothing: an id that is absent, or that two elements in that tree share, names or describes nothing, and keeping it unique is yours.
  In a Foundry 14 detached window Foundry moves the window's element whole to the other document, so a described element inside that element goes with it and anything you appended to `body` stays behind.
- In Foundry 13 and 14 the tooltip sets `aria-describedby` to `tooltip` on the element it is shown for and removes the attribute when it closes.
  A tooltip on an ancestor leaves the control alone, so this reaches a published control only when you show one on it yourself, with `game.tooltip.activate` or a Tour step that selects it, or on `IconButton`, whose own tooltip opens on its button under the pointer and keyboard focus alike, as its section states.
  Restore the prop once the tooltip has closed, which you can see when `game.tooltip.element` is no longer your control or after calling `game.tooltip.deactivate()` yourself: call `update` without the prop, `await` anything once that `update` has returned (`await Promise.resolve()` is enough), and call `update` with it again.
  Without the `await` between them Fabricate may draw the two as the second alone, which writes nothing, and a restore you make while the tooltip is still open is removed with it.
- A control shows nothing under the pointer that it does not also show under keyboard focus.
  Where a component's rest lands on the control itself, `data-cursor` is refused: at the next pointer release anywhere in the document Foundry copies its value into the control's inline `cursor` and deletes the attribute.
- A control's only motion is its own state change: a fade, and on `StatusToggle` the knob's travel along its track.
  Under `prefers-reduced-motion: reduce` Fabricate removes that motion inside a Fabricate window and under a standalone style root; elsewhere the fade is the host's own.
- A control opens no tooltip of its own at version 1, Fabricate's or Foundry's: no prop names one, and the HTML `title` attribute is refused as a rest key.
  The one exception is `IconButton`, which shows its name as its tooltip under the pointer and keyboard focus alike, as its section states, and so do the `ActionMenu` trigger and the `Modal` close control, each of which is an `IconButton`.
  A `data-tooltip-text` you pass through rest lands on the component's root: its tooltip stays open while the pointer is over the control and opens on pointer hover only, so it says nothing the control's name does not.
  Where a component's rest lands on the control itself, `data-tooltip` and every name that starts `data-tooltip-` are refused, so the control shows the pointer nothing it does not show keyboard focus.
  A tooltip attribute on `target` itself is yours, and is held to the same rule.
  A control whose face is a glyph alone is published only with a prop for its name that is `required`, or `requiredWhen` the prop that draws the control, and its section says whether the pointer is shown that name.

### Standalone style root

`Button`, `IconButton`, `StatusToggle`, `InspectorCard`, `Well`, `Field`, `SearchField`, `Stepper`, `Select`, `SegmentedControl`, `RadioCardGroup`, `EditorTabs`, `Pagination`, `IconPicker`, `ActionMenu` and `Modal` state the root `any` and are drawn in your own window, dialog or sheet, where `target` has no Fabricate root; `Stepper` only in a window that holds `target` in no `<form>`, as [Stepper](#stepper) states.
The panel `Select`, `IconPicker`, `ActionMenu` or `Modal` opens there, with no `overlayHost`, is drawn on the standalone layer, as [Overlays](#overlays) states, and that layer counts as a Fabricate root.
A Fabricate root is a `.fabricate` ancestor of `target` that is not a standalone style root.
Your own window carries none, so at `mount` Fabricate writes one `<div>` in `target` with `display: contents`, and draws the component inside it.
That element is the standalone style root.
It is judged at `mount` and `mountMany` only, as the Fabricate root is.
Under a Fabricate root Fabricate writes none, so a mount inside the Manager or the player window draws exactly as before.
A `target` in a content slot of a mount that sits under a Fabricate root, or inside a standalone style root, is under a root, so no second one is written there.

The standalone style root is private, as are its classes and its `data-fabricate-theme` copy.
Select none of it.
It carries no `role`, no `aria-*` and no `tabindex`, and the `data-*` attributes you pass as rest never land on it.
It is never an overlay host.
`destroy` and a fault remove it, so `target` is left as it was.
If a re-render of yours already took it away with the old content, there is nothing to remove.
If you call `target.replaceChildren()`, you supersede the mount's claim on `target`, as you do for any mount.

What it gives you and what it leaves to you:

- It states the Fabricate window's ink and its dark colour scheme, so your `Button` and `StatusToggle` read as they do in a Fabricate window.
  The typeface still comes from `target`, so set `font-family`, `font-size` and `line-height` there.
- It paints no ground, so you supply one.
  Paint `--fab-bg-1` on `target`, or nest the component in an `InspectorCard` or a `Well`, as for [`Callout`](#callout).
  On Foundry's light theme whatever a component draws on `target`'s ground rather than on a fill of its own otherwise falls short of its contrast floor: every `Button` and `IconButton` role but `primary`, the `ActionMenu` trigger among them, the switch's off face, `Field`'s ink and the caption and hint you draw in its slot, `SearchField`'s and `Stepper`'s ink on their translucent shells, the `form` `Select` trigger's and the `IconPicker` trigger's ink on theirs, `SegmentedControl`'s labels at `density` `'default'`, `EditorTabs`' tabs and a compact `Pagination`'s summary, page-size caption and arrows.
  `RadioCardGroup`'s cards, a default `Pagination` bar, the `inline` and `toolbar` `Select` triggers, and the list, menu or dialog an overlay opens paint their own ground.
  `--fab-bg-1` on `target` resolves from the document's theme, which agrees with the standalone style root's except in a detached window.
- Your own content in a content slot of such a mount takes the Fabricate window's ink, dark colour scheme, palette tokens, focus ring and reduced-motion rule, as it does in a Fabricate window.
  Fabricate's heading normalisation does not reach it, so a heading there takes Foundry's own face and ink.
- A component whose root is `fabricate` or `manager`, mounted in a content slot of such a mount with no Fabricate root above, throws `<name> needs a Fabricate window ancestor` or `<name> needs a Fabricate manager ancestor`.
  A standalone style root is no Fabricate root.
- A component drawn under a standalone style root throws `<name> cannot be drawn in a shadow root` where `target` has no Fabricate root and its root node is a shadow root.
  Fabricate's module sheet reaches a document's head and no shadow root.
  A detached `target` that is no shadow root's is drawn, under a standalone style root written at `mount`.
- In a Foundry 14 detached window the module sheet is present, so a mount made there is drawn in the theme Fabricate reads from its own document element at `mount`.
  A later theme change reaches a standalone style root in Fabricate's own document and none in a detached window (issue 2432).
- A normal declaration in an unlayered sheet of the host's outranks the module sheet that draws the component, at any specificity.
  The exception is `transition` under reduced motion, which the module sheet states `!important`.
  Your own module sheet, one its manifest gives no `layer`, loads in `layer(modules)` beside Fabricate's, where specificity and then order decide.
- A document sheet disables every control in its form when the document is not editable, so mount after `super._onRender`.
- A component is drawn under the standalone style root only where its admission test holds.
  That test mounts it in a bare ApplicationV2 `.window-content` and compares every element it draws with the same props in the player window, at rest, under keyboard focus, under the pointer and under reduced motion.
  For `Select`, `IconPicker`, `ActionMenu` and `Modal` it compares the open list, menu or dialog too, on the standalone layer against the player window's.
  A panel on the layer draws in a Fabricate window's typeface and at Foundry's application size, as a panel in the player window does, and not in the size Foundry's `<body>` states.
  Its line height is inherited from the page body, as in a Foundry window, and its ink is Fabricate's.
  The test page sets one typeface on its body so both arms compare like with like.
  It runs over Fabricate's core-min fixture and, where the harvest exists, Foundry 14.365's core sheet.
  The harvested arm draws under no Foundry theme class.
  Core's container rules (`.standard-form`, `.form-group`, `.form-fields`, `.form-footer`, `.dialog-buttons`) reach such a control or text input in a dialog or form sheet wherever they select a descendant or set a custom property the component does not state, as `.standard-form button` sets `--button-size`, and a DialogV2's content is always a `.standard-form`; the test does not measure them.
  Core's `fieldset`, `legend`, radio and `textarea` rules are measured only where the harvest exists.
  An ApplicationV1 window is not a supported target, and Foundry 13 is unmeasured.
  Chromium draws a search field's cancel button and a number field's spin buttons itself, in the dark colour scheme, and computes no author style for them, so the test does not read them.
  A Font Awesome glyph's box follows the Font Awesome the running build ships, which the test does not measure.

A worked mount follows: a save control in an ApplicationV2 of your own, which carries no Fabricate root.

```javascript
// After `load(['Button'])` has resolved and `fabricate.ready` has fired.
#save = null;

_onRender(context, options) {
  super._onRender(context, options); // A document sheet disables its controls here, so mount after it.
  const fabUi = game.fabricate?.api?.ui;
  // A Fabricate that predates the standalone style root describes `Button` as `fabricate`.
  if (fabUi?.describe?.('Button')?.root !== 'any') return;
  const target = this.element.querySelector('[data-acme-save]'); // An empty element you own, on a `--fab-bg-1` ground.
  this.#save?.destroy(); // A re-render replaced the old target.
  this.#save = fabUi.mount('Button', {
    target,
    props: { role: 'primary', children: 'Save notes', onclick: () => acmeNotes.save() },
  });
}

async _preClose(options) {
  this.#save?.destroy();
  await super._preClose(options);
}
```

## Data Persistence

Fabricate stores data in Foundry's settings and flags:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Location | Key | Contents |
|:---------|:----|:---------|
| World setting | `fabricate.craftingSystems` | All crafting system configurations, including each system's Travel & Realms participation flag |
| World setting | `fabricate.travelConfig` | The world realm library, its reveal mode, and its modifier visibility (including each realm's Foundry Scene Region links) |
| World setting | `fabricate.gatheringParties` | Fabricate-managed gathering parties (members, travel actor, current-realm override) |
| World setting | `fabricate.recipes` | All recipes |
| World setting | `fabricate.gatheringEnvironments` | Gathering environment and task configurations |
| World setting | `fabricate.gatheringConfig` | Gathering library, rules, condition vocabularies, and per-system gathering configuration |
| World setting | `fabricate.migrationVersion` | Last completed Fabricate data migration version |
| World setting | `fabricate.theme` | Active product UI theme (`Fabricate` by default, with other presets `Mythwright`, `Ironblood Forge`, `Hearth & Herb`, `Starglass Arcana`, and the fixed Foundry-inspired `Foundry Native` palette) |
| World setting | `fabricate.experimentalFeatures` | Reveals in-development Fabricate surfaces: the unimplemented recipe Graph placeholder in the crafting manager, the GM Manager's `World > Downtime` route, a companion's `downtime` tabs in the player window, and the GM Manager's Premium crafting-icons advert on the world Component catalogue and Component Rules screens. Disabled by default. |
| World setting | `fabricate.premiumIconsAdDismissed` | Whether a GM has dismissed the GM Manager's Premium crafting-icons advert for this world (`Boolean`, default `false`). Written `true` only by the advert's dismiss control. Nothing else writes or clears it. |
| Client setting | `fabricate.lastCraftingActor` | Last selected crafting actor UUID |
| Client setting | `fabricate.lastGatheringActor` | Last selected gathering actor ID |
| Client setting | `fabricate.lastComponentSources` | Last selected source actor UUIDs |
| Client setting | `fabricate.lastManagedCraftingSystem` | Last viewed system in GM admin |
| Client setting | `fabricate.lastAlchemySystem` | Last selected alchemy system (discipline) for the Alchemy Workbench tab |
| Client setting | `fabricate.favouriteRecipes` | Favourite recipe IDs for the current client |
| User setting | `fabricate.progressiveResultOrder` | Player progressive result-stage order, keyed `recipe:<recipeId>` / `salvage:<systemId>:<componentId>` to a list of result ids (Object, default `{}`). Registered with `scope: 'user'`, which is per user **within one world**. The same player in a second world reads the default. Writing it is an asynchronous, replicated document write that can reject, not a synchronous `localStorage` write, so a caller must `await` it. |
| Client setting | `fabricate.gatheringHideUnavailableEnvironments` | Player "hide unavailable (locked) environments" toggle for the Gathering app Environments column (Boolean, default `false`, per client/device) |
| Actor flag | `fabricate.craftingRuns.active` | In-progress crafting runs |
| Actor flag | `fabricate.craftingRuns.history` | Completed crafting runs |
| Actor flag | `fabricate.gatheringRuns.active` | In-progress gathering runs |
| Actor flag | `fabricate.gatheringRuns.history` | Completed gathering runs |
| Actor flag | `fabricate.learnedRecipes` | Learned recipe records |
| Actor flag | `fabricate.discoveredGatheringRealms` | Gathering realm discovery entries for the actor, keyed by realm (the legacy `fabricate.discoveredGatheringRegions` flag is read as a fallback and removed on the next reveal or hide) |
| Item flag | `fabricate.toolUsage` | `{ timesUsed }` for `limitedUses` tool tracking (falls back to legacy `fabricate.catalystItemUsage` when absent) |
| Item flag | `fabricate.toolBroken` | `true` when a tool's `flagBroken` on-break action has fired |
| Item flag | `fabricate.recipeItemUsage` | `{ timesUsed, inert? }` for recipe item tracking. `inert` records that the copy exhausted while its book was set to become inert rather than be destroyed, and nothing in Fabricate clears it once set |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

## Hooks

| Hook | When | Payload |
|:-----|:-----|:--------|
| `fabricate.ready` | After module initialisation and guarded startup world-time processing complete | None |
| `fabricate.gathering.attemptCompleted` | Once per terminal gathering attempt (success/failure, immediate/timed), after side effects commit | See [Subscribing To Gathering Hooks](#subscribing-to-gathering-hooks) |
| `fabricate.gathering.eventTriggered` | Once per encounter an attempt triggers | See [Subscribing To Gathering Hooks](#subscribing-to-gathering-hooks) |
| `fabricate.manager.navProviderRegistered` | A companion provider takes a GM Manager navigation surface | See [Manager Hooks](#manager-hooks) |
| `fabricate.manager.navProviderUnregistered` | A companion provider releases a surface | See [Manager Hooks](#manager-hooks) |
| `fabricate.manager.surfaceMounted` | The Manager route hosting an extension surface renders | See [Manager Hooks](#manager-hooks) |
| `fabricate.manager.surfaceUnmounted` | That route is torn down | See [Manager Hooks](#manager-hooks) |
| `fabricate.manager.surfaceTabChanged` | The active tab of a hosted surface changes | See [Manager Hooks](#manager-hooks) |
| `fabricate.player.navProviderRegistered` | A companion provider claims a player-window navigation surface | See [Player Hooks](#player-hooks) |
| `fabricate.player.navProviderUnregistered` | A companion provider releases a player surface | See [Player Hooks](#player-hooks) |
| `fabricate.player.surfaceMounted` | The player window mounts an extension surface | See [Player Hooks](#player-hooks) |
| `fabricate.player.surfaceUnmounted` | That surface is torn down | See [Player Hooks](#player-hooks) |
| `fabricate.player.surfaceTabChanged` | The active tab of a mounted player surface changes | See [Player Hooks](#player-hooks) |

Startup world-time processing awaits crafting, salvage, and gathering settlement before `fabricate.ready` fires.
Later Foundry `updateWorldTime` events dispatch the same processors without blocking the hook.
Individual processor failures are caught and logged so one subsystem does not prevent the others from running.

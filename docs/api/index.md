---
layout: default
title: API Reference
nav_order: 9
has_children: true
---

# API Reference

Fabricate exposes its API through two Foundry globals:

- **`game.fabricate`**.
  The main Fabricate instance with service accessors and a quick `craft()` helper.
- **`globalThis.fabricate`** (alias: `fabricate`).
  Convenience functions for macros.
- **`game.fabricate.api`**.
  Constructor references for all public classes, plus public constants (`HOOKS` — the published hook names — and `COMPANION`, the versioned [companion contract](#companion-contract)).

All APIs except the two extension-registration seams are available after the `fabricate.ready` hook fires:

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

---

## Quick Reference

### Services And Runtime Methods

```javascript
game.fabricate.getRecipeManager()          // Recipe CRUD and queries
game.fabricate.getCraftingEngine()          // Execute crafting
game.fabricate.getCraftingSystemManager()   // System and component CRUD
game.fabricate.getCraftingRunManager()      // Multi-step run management
game.fabricate.listCraftingForActor({ rememberedActorId, componentSourceActorIds }) // Player-visible crafting listing (summary phase)
game.fabricate.hydrateCraftingRecipe({ recipeId, actorId, componentSourceActorIds }) // Exact detail model for one recipe (detail phase)
game.fabricate.craftRecipe({ actorId, recipeId, ingredientSetId, componentSourceActorIds, interactive }) // Craft the selected recipe
game.fabricate.salvageComponent({ actorId, systemId, componentId, interactive }) // Salvage one owned component
game.fabricate.salvageComponents({ actorId, targets, interactive, onProgress }) // Salvage many owned components in one run
game.fabricate.destroyComponents({ actorId, targets, onProgress }) // Permanently destroy many owned components in one run
game.fabricate.getGatheringEnvironmentStore() // Gathering environment persistence
game.fabricate.getGatheringRunManager()     // Gathering run persistence
game.fabricate.getGatheringGateAndCheckEvaluator() // Gathering gate/check evaluation
game.fabricate.getGatheringRichStateService() // Gathering rich-state internals
game.fabricate.getItemPilesIntegration()     // Item Piles integration facade
game.fabricate.listGatheringForActor({ actor }) // Player-visible gathering listing
game.fabricate.startGatheringAttempt({ actor, environmentId, taskId }) // Start gathering
game.fabricate.getGatheringDropBreakdown({ environmentId, taskId }) // Task drop preview data
game.fabricate.listAlchemyForActor({ actorId, craftingSystemId }) // Leak-safe player alchemy listing
game.fabricate.submitAlchemyAttempt({ actorId, craftingSystemId, submittedComponentIds }) // Brew an alchemy attempt
game.fabricate.getSelectedAlchemySystemId() // Persisted last-selected alchemy system id
game.fabricate.setSelectedAlchemySystemId(id) // Persist the last-selected alchemy system id
game.fabricate.listSelectableActors()       // Player-character actors for the actor-selection bar
game.fabricate.listCuratedIcons()           // Fabricate's curated Font Awesome icon vocabulary
game.fabricate.findCuratedIcon(name)        // Resolve one icon name (or alias) against that vocabulary
game.fabricate.getSelectedGatheringActorId() // Persisted remembered gathering actor id
game.fabricate.setSelectedGatheringActorId(id) // Persist the remembered gathering actor id
game.fabricate.getHideUnavailableEnvironments() // Player "hide unavailable environments" toggle (per client/device)
game.fabricate.setHideUnavailableEnvironments(value) // Persist that toggle (per client/device)
game.fabricate.getGatheringConditions()     // Current gathering weather/time and vocabularies
game.fabricate.setGatheringWeather(weatherTag) // GM-only gathering weather update
game.fabricate.setGatheringTimeOfDay(timeOfDayTag) // GM-only gathering time update
game.fabricate.setGatheringConditions({ weather, timeOfDay }) // GM-only conditions update
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
  SignatureValidator, ItemPilesIntegration,
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

- `listCraftingForActor({ rememberedActorId, componentSourceActorIds })` is the **summary phase**.
  It returns cheap, redaction-safe summary rows for every recipe the viewer may see, projected without running exact craftability against the whole corpus.
  `rememberedActorId` and `componentSourceActorIds` default to the persisted crafting selections when omitted.
  Each row's material verdict (its `browseStatus`) and the listing's own `counts.available` are **optimistic** — an upper bound read from an indexed availability snapshot, not exact evaluation.
  A recipe whose ingredient sets contend for the same held stacks can read available in the list and still refuse once hydrated or crafted.
  A row reporting unavailable is definitive; the optimism only ever runs in the makeable direction.
- `hydrateCraftingRecipe({ recipeId, actorId, componentSourceActorIds })` is the **detail phase**.
  It returns the exact rich model — per-set craftability, ingredient assignment, check resolution, outcome tiers, steps and progressive stages — for the one recipe the player has opened.
  `recipeId` arrives from a client and is not trusted: the recipe's visibility, its `enabled` flag, and its crafting system's blocked state are all re-evaluated from scratch rather than taken from the summary pass.
  The call returns `null`, never throws, when the recipe does not exist, is disabled, sits in a blocked crafting system, or the viewer may not see it.
  An id is not a permission.
- `craftRecipe({ actorId, recipeId, ingredientSetId, ingredientEssenceAllocation, componentSourceActorIds, interactive })` executes the attempt, delegating to the same pipeline documented in [CraftingEngine]({% link api/crafting-engine.md %}).
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
- `submitAlchemyAttempt({ actorId, craftingSystemId, submittedComponentIds, componentSourceActorIds, interactive })` brews the submitted components as an attempt for the resolved actor.
  It is owner-scoped like `listAlchemyForActor` and delegates to the authoritative engine, which matches the submission against all enabled recipes in the system, known and undiscovered alike.
  On a match the recipe is discovered and the ingredients are consumed.
  The system's alchemy check mode decides the result: `none` always produces the success set, a `simple` check produces the success set on a pass and the reserved failure set on a fail, and a `tiered` check routes to the result set for the rolled outcome tier.
  A failed `simple` check still counts as a match, so it consumes, produces the failure set, and discovers the recipe.
  Otherwise the attempt fizzles with no check and no roll, consuming the components only when the system's Consume on Fail setting is on.
  `interactive` prompts a roll on a matched brew in `simple` or `tiered` check mode, and defaults to `false` for macros and automation, so it never triggers a roll on the fizzle path.
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
For a progressive salvage, the engine captures the player's standing order (`salvage:<componentId>` in `fabricate.progressiveResultOrder`) onto the run record when the run starts, and reads it back at award time.
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
Worlds upgraded from before `0.8.0` have their legacy `economy.mode` enum migrated into these flags automatically (see [Gathering Limitations]({% link gathering-environments.md %}#gathering-limitations)).

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

See [Gathering Realms & Travel]({% link gathering-realms.md %}) for the full feature guide, including the GM Travel route, environment location rules, and the disclosure policy.

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
| `label` | `string` | Font Awesome's own display name, such as `Mortar Pestle`. Not localized. |
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

`game.fabricate.api.COMPANION` is Fabricate's named, versioned contract for outbound **behavioural** consumption — the capabilities a companion module needs to settle a downtime activity against an actor, or against a whole party.
It is the behavioural sibling of the two navigation seams below, which are outbound **UI contribution** rather than consumption.

```javascript
const contract = game.fabricate?.api?.COMPANION;
if (!contract) return;                    // Fabricate has not loaded yet — retry, do not degrade.
if (contract.schemaVersion !== 1) return; // A version this companion does not understand.
```

The descriptor is frozen data with exactly four fields — `schemaVersion`, `members`, `outcomes`, and `callSites` — and it is assigned when Fabricate's own `init` listener runs, before any service exists.
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
| `schemaVersion` | `stable` | the `COMPANION` descriptor | The contract version, as a number. Readable before any service exists. |
| `grantRecipeKnowledge` | `stable` | `game.fabricate` | `({ actorId, recipeId, grantedBy })` teaches one actor one recipe with no owned book required. GM-gated, idempotent, and it refuses where a learned entry would be invisible to the player. |
| `checkAffordability` | `stable` | `game.fabricate` | `({ actorId, unitId, amount })` answers whether an actor can afford a cost against the **world** coin ladder. GM-gated, ladder-aware, single-unit, and **this member** writes nothing — `creditCurrency` below is the one that does. |
| `getCurrencyConfigStore` | `handle` | `game.fabricate` | The world currency configuration store Fabricate itself uses, or `null` before readiness. Read it as `getCurrencyConfigStore()?.get?.() ?? null`, because `.get()` on the `null` throws. |
| `getActorPropertyCoinSpender` | `handle` | `game.fabricate` | The coin spender for the `actorProperty` strategy, or `null` before readiness. |
| `getActorInventoryCoinSpender` | `handle` | `game.fabricate` | The coin spender for the `actorInventory` strategy, or `null` before readiness. |
| `getCraftingEngine` | `handle` | `game.fabricate` | The live crafting engine, or `null` before readiness. |
| `getCraftingEngine().findComponentItems` | `handle` | the crafting engine | `(actor, component, system)` finds an actor's existing stacks of a component, so an award can **stack** rather than duplicate. See its carve-outs below. |
| `rollActorCheck` | `stable` | `game.fabricate` | `({ actorId, callSite, formula, dc, compare, label, interactive, rollDecision })` rolls one **Standalone Check Roll** for one actor, graded against a `dc` or ungraded, and answers the total, the dice groups and the resolved formula. GM-gated, call-site-gated, and a dismissed prompt is a refusal rather than a rolled failure. |
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
const alreadyKnew = result.outcome === game.fabricate.api.COMPANION.outcomes.alreadyKnown;
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
const { callSites, outcomes } = game.fabricate.api.COMPANION;

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

**`callSite` is required and has no default.**
Nothing in the request or the environment distinguishes your deliberate click from a synced `updateWorldTime` tick, so Fabricate refuses `invalidCallSite` rather than guessing.
Declare `broadcast` from any handler that fires on every connected client, and Fabricate refuses `notElected` on every client but the elected GM's.
Declaring `gmAction` from a synced hook **bypasses that gate entirely** and puts the single-executor obligation back on you.
The two accepted values are published as `game.fabricate.api.COMPANION.callSites`, so read `callSites.broadcast` rather than retyping the literal: a mistyped string is refused as `invalidCallSite` and nothing else tells you it was a typo.

`resolveBulkCheckDecision` is for the case where you will roll for several characters at once and want to ask the GM **once**:

```javascript
const { callSites, outcomes } = game.fabricate.api.COMPANION;

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
const { callSites, outcomes } = game.fabricate.api.COMPANION;

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
const { callSites, outcomes } = game.fabricate.api.COMPANION;
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

`COMPANION.outcomes` is **open by declaration and closed by enumeration**: it is complete for this `schemaVersion`, a member may emit a **new** outcome without a version bump, and renaming or removing one is a bump.
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
| World setting | `fabricate.experimentalFeatures` | Reveals in-development Fabricate surfaces — the unimplemented recipe Graph placeholder in the crafting manager, the GM Manager's `World > Downtime` route, and a companion's `downtime` tabs in the player window — disabled by default |
| Client setting | `fabricate.lastCraftingActor` | Last selected crafting actor UUID |
| Client setting | `fabricate.lastGatheringActor` | Last selected gathering actor ID |
| Client setting | `fabricate.lastComponentSources` | Last selected source actor UUIDs |
| Client setting | `fabricate.lastManagedCraftingSystem` | Last viewed system in GM admin |
| Client setting | `fabricate.lastAlchemySystem` | Last selected alchemy system (discipline) for the Alchemy Workbench tab |
| Client setting | `fabricate.favouriteRecipes` | Favourite recipe IDs for the current client |
| User setting | `fabricate.progressiveResultOrder` | Player progressive result-stage order, keyed `recipe:<recipeId>` / `salvage:<componentId>` to a list of result ids (Object, default `{}`). Registered with `scope: 'user'`, which is per user **within one world**. The same player in a second world reads the default. Writing it is an asynchronous, replicated document write that can reject, not a synchronous `localStorage` write, so a caller must `await` it. |
| Client setting | `fabricate.gatheringHideUnavailableEnvironments` | Player "hide unavailable (locked) environments" toggle for the Gathering app Environments column (Boolean, default `false`, per client/device) |
| Actor flag | `fabricate.craftingRuns.active` | In-progress crafting runs |
| Actor flag | `fabricate.craftingRuns.history` | Completed crafting runs |
| Actor flag | `fabricate.gatheringRuns.active` | In-progress gathering runs |
| Actor flag | `fabricate.gatheringRuns.history` | Completed gathering runs |
| Actor flag | `fabricate.learnedRecipes` | Learned recipe records |
| Actor flag | `fabricate.discoveredGatheringRealms` | Per-system gathering realm discovery entries for the actor (legacy `fabricate.discoveredGatheringRegions` flag read as a fallback) |
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

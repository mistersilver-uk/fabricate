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
  Constructor references for all public classes, plus public constants (`HOOKS` — the published hook names).

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

Location-aware gathering adds stores for per-system realms and world-level parties, a current-realm resolver, and GM discovery controls.
A **Gathering Realm** is the Fabricate geography concept (renamed from *Gathering Region* to avoid the collision with Foundry's own Scene `RegionDocument`).
A realm maps many-to-one onto Foundry Scene Regions through its scene mappings.
The whole subsystem is gated per crafting system by the `gatheringRealmSettings.enabled` flag (default off, the **Enable Travel & Realms** toggle in gathering Settings).
While it is disabled, `getGatheringLocationForActor`, the override setters, and the discovery reveal/hide methods are inert (return `null` / `false` / no-op).
Each method also has a shorter alias on the `game.fabricate.gathering` facade (`getPartyStore`, `getRealmStore`, `getLocationService`, `getLocationForActor`, `setPartyRealmOverride`, `clearPartyRealmOverride`, `revealRealmForActor`, `hideRealmForActor`).
The pre-rename `*Region*` method and alias names are retained as deprecated delegates that warn once and forward, so existing macros keep working:

```javascript
Hooks.once('fabricate.ready', async () => {
  const systemId = game.fabricate.listCraftingSystems()[0]?.id;

  const partyStore = game.fabricate.getGatheringPartyStore();  // party CRUD, members, travel actor
  const realmStore = game.fabricate.getGatheringRealmStore();  // per-system realm CRUD + settings
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

Fabricate curates ONE Font Awesome vocabulary and draws every icon field in the module from it — essence icons, category icons, and the biome icons players see on gathering environment cards.
`listCuratedIcons()` publishes that same vocabulary so a companion module can offer its GMs the icons Fabricate already offers, instead of hand-curating a second list that drifts from this one.

```javascript
Hooks.once('fabricate.ready', () => {
  const icons = game.fabricate.listCuratedIcons();
  // -> [{ iconCode: 'anchor', label: 'Anchor', hasRegular: false }, …]

  // `iconCode` is bare, so a render composes the weight itself. `fas` exists for every
  // entry; `far` exists only where `hasRegular` says so.
  const [first] = icons;
  const solidClass = `fas fa-${first.iconCode}`;
  const regularClass = first.hasRegular ? `far fa-${first.iconCode}` : null;

  // Validating a stored icon is a membership test against this same list.
  const isOffered = icons.some(({ iconCode }) => iconCode === 'mortar-pestle');
});
```

- The records are built fresh on every call, so you may keep, sort, filter or mutate them.
  Nothing you do to them reaches Fabricate's own pickers.
- `hasRegular` reports whether Font Awesome ships the `far` (regular) weight for that code as well as `fas` (solid).
  It does not say which weight a stored icon uses.
- The list is in the vocabulary's own order, which is alphabetical by `iconCode`.
- The method throws `Fabricate not initialized` before Fabricate is ready, as every `game.fabricate.list…` method does.
  Call it from `fabricate.ready`, or wrap it and degrade to an empty list, as a composition edge should.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Type | Meaning |
| --- | --- | --- |
| `iconCode` | `string` | The bare Font Awesome code, such as `mortar-pestle`. No `fa-` prefix and no weight. |
| `label` | `string` | Font Awesome's own display name, such as `Mortar Pestle`. Not localized. |
| `hasRegular` | `boolean` | Whether the `far` weight exists for this code. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

**What is not published, and why.**
The unfiltered classic catalogue — 1402 entries — stays internal, because no Fabricate picker renders it and publishing it would invite a companion to offer icons Fabricate's own screens will not.
The module's internal curation predicate stays internal too: it answers "does any exclusion pattern match this string", which returns `true` for a typo, a Pro-only code, or any string Font Awesome never shipped, so it is the wrong tool for validating a stored icon.
A membership test against the published list, as above, is the right one.

**Provenance.**
The vocabulary is derived from Font Awesome Free 6.7.2 classic metadata with brands excluded.
Every entry was verified to resolve in the Font Awesome build Foundry bundles at the time it was published, but that is a fact about that Foundry release rather than a guarantee: Foundry ships its own Font Awesome and nothing re-checks the set when Foundry upgrades it.
If you render an icon code from this list and get a blank glyph, that is the check to make.

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

<!-- markdownlint-enable markdownlint-sentences-per-line -->

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

<!-- markdownlint-enable markdownlint-sentences-per-line -->

A new context object is created — never mutated — whenever one of its values changes, which also remounts the active tab.
`setRouteChrome`, `onRouteReselect` and `onBeforeNavigate` are the exceptions: they are functions carried on that same frozen context, and calling them never changes the context's own identity, so none of them triggers the remount a new context would.

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
Fabricate renders every registered player surface, so no surface id is privileged and Core never checks an id against a list of its own.

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
Note that the player window applies **no** visibility or permission gate to a provider tab: unlike the Manager, it has no GM gate, so every user who can open the window sees every registered provider's tabs.

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
| World setting | `fabricate.craftingSystems` | All crafting system configurations, including each system's gathering realms and realm settings |
| World setting | `fabricate.gatheringParties` | Fabricate-managed gathering parties (members, travel actor, per-system current-realm overrides) |
| World setting | `fabricate.recipes` | All recipes |
| World setting | `fabricate.gatheringEnvironments` | Gathering environment and task configurations |
| World setting | `fabricate.gatheringConfig` | Gathering library, rules, condition vocabularies, and per-system gathering configuration |
| World setting | `fabricate.migrationVersion` | Last completed Fabricate data migration version |
| World setting | `fabricate.theme` | Active product UI theme (`Fabricate` by default, with other presets `Mythwright`, `Ironblood Forge`, `Hearth & Herb`, `Starglass Arcana`, and the fixed Foundry-inspired `Foundry Native` palette) |
| World setting | `fabricate.experimentalFeatures` | Reveals in-development Fabricate surfaces, currently the unimplemented recipe Graph placeholder in the crafting manager, disabled by default |
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

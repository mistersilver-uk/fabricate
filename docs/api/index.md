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

All APIs are available after the `fabricate.ready` hook fires:

```javascript
Hooks.on('fabricate.ready', () => {
  const recipeManager = game.fabricate.getRecipeManager();
  // API is now safe to use
});
```

{: .warning }
> Do not call Fabricate APIs before the `fabricate.ready` hook.
> The module initialises during Foundry's `ready` hook, and services are not available until initialisation completes.

---

## Quick Reference

### Services And Runtime Methods

```javascript
game.fabricate.getRecipeManager()          // Recipe CRUD and queries
game.fabricate.getCraftingEngine()          // Execute crafting
game.fabricate.getCraftingSystemManager()   // System and component CRUD
game.fabricate.getCraftingRunManager()      // Multi-step run management
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
  getFabricateAppClass, getCraftingSystemManagerAppClass,
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

- `listSelectableActors()` returns the current user's selectable **player characters** (`actor.type === 'character'`), owned actors for players, all for GMs.
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

## Data Persistence

Fabricate stores data in Foundry's settings and flags:

| Location | Key | Contents |
|:---------|:----|:---------|
| World setting | `fabricate.craftingSystems` | All crafting system configurations, including each system's gathering realms and realm settings |
| World setting | `fabricate.gatheringParties` | Fabricate-managed gathering parties (members, travel actor, per-system current-realm overrides) |
| World setting | `fabricate.recipes` | All recipes |
| World setting | `fabricate.gatheringEnvironments` | Gathering environment and task configurations |
| World setting | `fabricate.gatheringConfig` | Gathering library, rules, condition vocabularies, and per-system gathering configuration |
| World setting | `fabricate.migrationVersion` | Last completed Fabricate data migration version |
| World setting | `fabricate.theme` | Active product UI theme (`Fabricate` by default, with other presets `Mythwright`, `Ironblood Forge`, `Hearth & Herb`, `Starglass Arcana`, and the fixed Foundry-inspired `Foundry Native` palette) |
| World setting | `fabricate.experimentalFeatures` | Reserved future experimental feature switch, disabled by default |
| Client setting | `fabricate.lastCraftingActor` | Last selected crafting actor UUID |
| Client setting | `fabricate.lastGatheringActor` | Last selected gathering actor ID |
| Client setting | `fabricate.lastComponentSources` | Last selected source actor UUIDs |
| Client setting | `fabricate.lastManagedCraftingSystem` | Last viewed system in GM admin |
| Client setting | `fabricate.lastAlchemySystem` | Last selected alchemy system (discipline) for the Alchemy Workbench tab |
| Client setting | `fabricate.favouriteRecipes` | Favourite recipe IDs for the current client |
| Client setting | `fabricate.recentlyCrafted` | Recently crafted recipe entries for the current client |
| Client setting | `fabricate.progressiveResultOrder` | Per-recipe player reorder preferences for progressive mode results (Object, default `{}`) |
| Client setting | `fabricate.gatheringHideUnavailableEnvironments` | Player "hide unavailable (locked) environments" toggle for the Gathering app Environments column (Boolean, default `false`, per client/device) |
| Actor flag | `fabricate.craftingRuns.active` | In-progress crafting runs |
| Actor flag | `fabricate.craftingRuns.history` | Completed crafting runs |
| Actor flag | `fabricate.gatheringRuns.active` | In-progress gathering runs |
| Actor flag | `fabricate.gatheringRuns.history` | Completed gathering runs |
| Actor flag | `fabricate.learnedRecipes` | Learned recipe records |
| Actor flag | `fabricate.discoveredGatheringRealms` | Per-system gathering realm discovery entries for the actor (legacy `fabricate.discoveredGatheringRegions` flag read as a fallback) |
| Item flag | `fabricate.toolUsage` | `{ timesUsed }` for `limitedUses` tool tracking (falls back to legacy `fabricate.catalystItemUsage` when absent) |
| Item flag | `fabricate.toolBroken` | `true` when a tool's `flagBroken` on-break action has fired |
| Item flag | `fabricate.recipeItemUsage` | `{ timesUsed }` for recipe item tracking |

## Hooks

| Hook | When | Payload |
|:-----|:-----|:--------|
| `fabricate.ready` | After module initialisation and guarded startup world-time processing complete | None |
| `fabricate.gathering.attemptCompleted` | Once per terminal gathering attempt (success/failure, immediate/timed), after side effects commit | See [Subscribing To Gathering Hooks](#subscribing-to-gathering-hooks) |
| `fabricate.gathering.eventTriggered` | Once per encounter an attempt triggers | See [Subscribing To Gathering Hooks](#subscribing-to-gathering-hooks) |

Startup world-time processing awaits crafting, salvage, and gathering settlement before `fabricate.ready` fires.
Later Foundry `updateWorldTime` events dispatch the same processors without blocking the hook.
Individual processor failures are caught and logged so one subsystem does not prevent the others from running.

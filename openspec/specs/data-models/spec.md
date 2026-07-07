# Specification 002: Data Models

## Purpose

Define Fabricate data models, persistence contracts, and macro contracts.
All stored entities are JSON-serializable and safe to persist via `game.settings` and flags.
All settings keys in this specification use the literal `fabricate.*` namespace.

Behavioural semantics are defined in:

- `004-resolution-modes.md`
- `005-recipes-and-steps.md`
- `006-recipe-visibility.md`
- `007-destructive-changes-and-migrations.md`
- `009-gathering-and-harvesting.md`

## CraftingSystem

```js
CraftingSystem = {
  id: string,
  name: string,
  description?: string,

  // System-level invariant for all recipes in this crafting system.
  // Mode semantics and validation are defined in 004.
  resolutionMode: "simple" | "routedByIngredients" | "routedByCheck" | "progressive" | "alchemy",

  // Tool-breakage authority for the whole system.
  // "toolSpecific" (default): each Tool's own breakage.mode decides whether it
  // breaks; a check NEVER breaks tools under this authority (force-break gated off,
  // though a trigger's forced outcome still applies).
  // "checkDriven": the active check's checkBreakage triggers decide whether ALL
  // required tools break; each Tool's own mode is ignored except "immune".
  // Normalized on read (no versioned migration): unknown/missing -> "toolSpecific".
  toolBreakage: {
    authority: "toolSpecific" | "checkDriven", // default "toolSpecific"
  },

  features: {
    recipeCategories: true, // compatibility alias; always enabled
    itemTags: true, // compatibility alias; always enabled
    essences: boolean,
    propertyMacros: boolean,
    effectTransfer: boolean,
    multiStepRecipes: boolean,
    gathering: boolean, // default false
    salvage: boolean, // default false
  },

  categories: string[], // custom recipe categories only; reserved "general" is implicit
  itemTags: string[],

  // Present only when features.essences is true.
  essences?: Record<string, EssenceDefinition>,

  components: Component[],
  recipeItemDefinitions: RecipeItemDefinition[],

  // Present only when features.salvage is true.
  salvageResolutionMode: "simple" | "routed" | "progressive",

  salvageCraftingCheck: {
    enabled: boolean,                  // on/off toggle for optional simple salvage checks
    consumption: {
      consumeComponentOnFail: boolean,  // default true
      breakToolsOnFail: boolean,        // default false; governs Tool usage/breakage on a failed salvage (see note below)
    },
    outcomes?: string[],               // routed mode
    // Salvage reuses the crafting check sub-object shapes (so the GM Checks-tab
    // editors are shared); the active one is selected by salvageResolutionMode. The
    // simple/routed default DC is the sub-object's `dc`; a per-component override
    // lives on Component.salvage.dcOverride. Salvage has no recipes, so the simple
    // `tiers`/`dcMode`/`macroUuid` and routed `tiers` are persisted but not authored.
    simple: SimpleCheck,               // { rollFormula, dc, thresholdMode, dcMode, tiers, macroUuid, checkBreakage }
    routed: RoutedCheck,               // { type, rollFormula, dc, thresholdMode, tiers, relativeOutcomes, fixedOutcomes, checkBreakage }
    progressive: {
      awardMode: "partial" | "equal" | "exceed",
      allowPlayerReorder: boolean,
      rollFormula: string,             // default ""; total drives progressive awarding
      checkBreakage: CheckBreakage,    // unified per-check trigger list (force award-all/none and/or break tools)
    },
  },

  // Present only when features.gathering is true. System-level gathering check
  // (gathering resolution modes d100/progressive/routed). d100 is the fixed d100
  // roll and needs no editable config, so only progressive and routed are authored.
  // A per-task DC override lives on the gathering task (task.dcOverride).
  gatheringCraftingCheck: {
    enabled: boolean,                  // default false
    progressive: {
      awardMode: "partial" | "equal" | "exceed",
      allowPlayerReorder: boolean,
      rollFormula: string,
      checkBreakage: CheckBreakage,
    },
    routed: RoutedCheck,
  },

  craftingCheck: {
    // `enabled` is ONLY the on/off toggle for optional checks (simple/alchemy
    // crafting). A check is "usable" iff its resolution mode has an authored roll
    // formula (simple.rollFormula / routed.rollFormula / progressive.rollFormula);
    // `enabled` is not a proxy for "the check works". The deprecated check sources
    // (root macroUuid, successMacroUuid, failureMacroUuid, checkSource, builtIn
    // adapter) were removed in 1.8.0. (simple.macroUuid is a different feature — the
    // dynamic-DC macro — and is retained.)
    enabled: boolean,

    consumption: {
      consumeIngredientsOnFail: boolean, // default true
      breakToolsOnFail: boolean,         // default false; governs Tool usage/breakage on a failed craft (see note below)
    },

    // Routed mode (the check provider may return one of these, optional)
    outcomes?: string[],

    // Per-resolution-mode check sub-objects authored in the GM Checks tab; the
    // active one is selected by resolutionMode. (Shapes: SimpleCheck / RoutedCheck /
    // CheckBreakage defined below.)
    // Slot ownership: `simple` is the SHARED optional pass/fail crafting-check slot
    // — it backs the `simple`, `alchemy`, AND `routedByIngredients` modes' check (it
    // is NOT a 1:1 slot<->mode identity; do not read it as "the simple-mode check").
    // `routed` backs ONLY `routedByCheck`'s tier-routing check. `progressive` backs
    // `progressive`. (The 1.10.0 migration moved routedByIngredients' pass/fail config
    // from `routed` to `simple`; see the migration requirement below.)
    simple: SimpleCheck,
    routed: RoutedCheck,
    progressive: {
      awardMode: "partial" | "equal" | "exceed",
      allowPlayerReorder: boolean, // default false
      rollFormula: string,         // default ""; total drives progressive awarding
      checkBreakage: CheckBreakage,
    },
  },

  // Shared check sub-object shapes, reused by craftingCheck / salvageCraftingCheck /
  // gatheringCraftingCheck so the GM Checks-tab editors are common across activities.
  //   SimpleCheck = {
  //     rollFormula: string,                       // default ""
  //     dc: number,                                // default 15; the default DC
  //     thresholdMode: "meet" | "exceed",          // default "meet"
  //     dcMode: "static" | "dynamic",              // default "static" (crafting only)
  //     tiers: { id, name, dc }[],                 // recipe-DC overrides (crafting only)
  //     macroUuid: string | null,                  // dynamic-DC macro (crafting only)
  //     checkBreakage: CheckBreakage,              // unified per-check trigger list
  //   }
  //   RoutedCheck = {
  //     type: "relative" | "fixed",                // default "relative"
  //     rollFormula: string, dc: number, thresholdMode: "meet" | "exceed",
  //     tiers: { id, name, dc }[],                 // recipe-DC overrides (crafting only)
  //     relativeOutcomes: { id, name, success, breakTools, dc }[],
  //     fixedOutcomes: { id, name, success, breakTools, start, end }[],
  //     checkBreakage: CheckBreakage,              // unified per-check trigger list
  //   }
  //   // (The progressive check sub-object likewise carries a checkBreakage block.)
  //
  //   // Unified per-check trigger list (issue 419 recombine). Each trigger pairs an
  //   // expressive dice-matching condition with two effects: force an outcome and/or
  //   // break tools. It is the single mechanism that subsumes the former per-die
  //   // `DiceCrit` table and the separate tool-breakage trigger list.
  //   CheckBreakage = {
  //     triggers: CheckBreakageTrigger[],          // empty list = inert; ORed for breakage
  //   }
  //   CheckBreakageTrigger = {
  //     id: string,
  //     condition: CheckBreakageCondition,
  //     outcome: "success" | "failure" | "none",   // default "none"; forces pass/fail
  //                                                // (award-all/award-none on progressive).
  //                                                // Pinned to "none" for an outcomeTier
  //                                                // condition (the routed tier is resolved
  //                                                // AFTER the forced outcome — circular).
  //     breakTools: boolean,                       // default false; breaks every required
  //                                                // tool. Authored + applied ONLY under
  //                                                // checkDriven authority.
  //   }
  //     // Legacy migration (on read, no versioned migration): an old `DiceCrit`
  //     // { die, raw, success, breakTools } becomes a `diceGroup`/"total"/"==" trigger
  //     // (groupId = first matching evaluated-term index for that plain die) with
  //     // outcome = success ? "success" : "failure" and breakTools carried through;
  //     // crits on modified pools (keep/drop/explode/reroll) are crit-ineligible and
  //     // dropped. A routed outcome's `breakTools` remains the only `data.breakTools`
  //     // source (the routed per-tier legacy bridge), honoured by the shared evaluator
  //     // as an implicit always-on trigger under checkDriven only.
  //   CheckBreakageCondition =
  //     | { type: "rollTotal",        operator: "==" | "<=" | ">=" | "<" | ">", value: number }   // raw roll total (data.total)
  //     | { type: "progressiveValue", operator: "==" | "<=" | ">=" | "<" | ">", value: number }   // awarding value (absent on non-progressive -> never matches)
  //     | { type: "outcomeTier",      tierIds?: string[], outcomeKeys?: string[] }                // resolved tier id / outcome key in the set
  //     | { type: "diceGroup",        groupId: number,                                            // index into the evaluated roll.dice term order
  //         aggregate: "total" | "anyDie" | "allDice" | "lowestDie" | "highestDie",
  //         operator: "==" | "<=" | ">=" | "<" | ">", value: number }
  //     // `groupId` is the evaluated-term index (NOT re-parsed from the formula), so
  //     // duplicate `NdS` groups (1d20 + 1d20) are disambiguated 0/1. Per-die aggregates
  //     // read the active-only raw faces; with no per-die data they fail open (no break).

  recipeVisibility: {
    listMode: "global" | "player" | "knowledge",  // default "global"

    // Required only when listMode === "knowledge"; ignored in "global" and "player" modes.
    knowledge?: {
      mode: "item" | "learned" | "itemOrLearned",

      item?: {
        limitUses: boolean,
        maxUses?: number,
        destroyWhenExhausted?: boolean,
      },

      learn?: {
        consumeOnLearn: boolean, // default true
        dragDropEnabled: boolean, // default true; controls actor-drop auto-learn behaviour
        limitRecipes: boolean,       // default false; enables the per-recipe-item learn cap
        maxRecipes?: number,         // finite integer > 0; meaningful only when limitRecipes is true
        destroyWhenSpent?: boolean,  // default false; destroy the recipe item once its learn budget is spent
      },
    },
  },

  // Present only when resolutionMode === "alchemy".
  alchemy?: {
    learnOnCraft: boolean, // default false
    consumeOnFail: boolean, // default true
    showAttemptHistoryToPlayers: boolean, // default true
  },

  requirements: {
    time: {
      enabled: boolean, // default false
    },

    currency: {
      enabled: boolean,
      spendStrategy: "actorProperty" | "actorInventory" | "macro", // default "actorProperty"
      providerId: string,                     // default ""; selected preconfigured provider (actorInventory)
      macros: { canAfford: string, increment: string, decrement: string }, // default all ""; currency macro UUIDs (macro)
      units: CurrencyUnit[],
    },
  },

  // Present only when features.gathering is true. Per-system gathering geography.
  // NOTE: a Gathering Realm is the Fabricate geography concept; it is distinct from a
  // Foundry Scene Region (RegionDocument / Region Behaviour), which a realm maps to
  // many-to-one through sceneMappings[].sceneRegionUuid.
  gatheringRealms?: GatheringRealm[],          // default []; was gatheringRegions
  gatheringRealmSettings?: GatheringRealmSettings, // defaults: enabled false, revealMode "manual", modifierVisibility "visible"
}
```

### Requirements

1. Every crafting system has a reserved effective recipe category named `general` (`General` in UI copy).
It is always enabled and cannot be removed.
2. `CraftingSystem.categories` stores only additional user-defined recipe categories.
The reserved `general` category must not be persisted in that array.
3. `Recipe.category` defaults to `general`.
4. Recipe categories are always enabled.
Legacy persisted `features.recipeCategories`, `features.categories`, and `enableCategories` values are compatibility inputs only; normalization must emit enabled category aliases.
5. Item tags are always enabled.
Legacy persisted `features.itemTags` and `enableTags` values are compatibility inputs only; normalization must emit enabled item-tag aliases.
6. `categories` and `itemTags` should be normalized to unique, trimmed strings.
7. `resolutionMode` must be one of `"simple"`, `"routedByIngredients"`, `"routedByCheck"`, `"progressive"`, or `"alchemy"`.
8. If `resolutionMode === "alchemy"`:
   - `features.multiStepRecipes` must be `false`.
   - `alchemy` config must be present; missing values use defaults (`learnOnCraft: false`, `consumeOnFail: true`, `showAttemptHistoryToPlayers: true`).
9. If `features.gathering` is false, gathering environments and gathering tasks for that system are inert and hidden from normal UI flows.
9a.
The per-system gathering economy block (`gatheringConfig.systems[systemId].economy`, defined in `gathering-and-harvesting`) carries a normalized `resolutionMode: "d100" | "progressive" | "routed"` (default `"d100"`).
An absent, invalid, or wrong-shape value (including a stray `"simple"`) normalizes to `"d100"` on both the read and persist paths.
It is GM configuration and is not part of the player gathering listing payload.
10. `recipeItemDefinitions` are distinct from `components`; a recipe item definition must not be treated as a crafting ingredient/result component unless it is also intentionally imported as a component.
11. `RecipeItemDefinition.id` values must be unique within a crafting system.
12. `RecipeItemDefinition.sourceItemUuid` values should be unique within a crafting system so one system recipe item can be reused across multiple recipes.
13. **`consumption.breakToolsOnFail` governs Tool usage/breakage on a failed craft or salvage.** It is present on both `craftingCheck.consumption` and `salvageCraftingCheck.consumption`.
It defaults to `false` (tools are not broken on failure unless enabled).
It was renamed from the legacy catalyst-era key `consumeCatalystsOnFail` (retained by name only to defer a persisted-key migration) by the 1.7.0 migration, which rewrites persisted worlds to the new key.
Normalization reads `breakToolsOnFail` then falls back to the legacy `consumeCatalystsOnFail`, so a pre-migration import/export still loads correctly.
14. When `features.gathering` is true, a crafting system may own a `gatheringRealms` library (default `[]`) and `gatheringRealmSettings`. `gatheringRealmSettings.enabled` (default `false`) gates the whole realm/travel/availability subsystem; the records and behavior are inert until a GM opts in.
A **Gathering Realm** is the Fabricate gathering-geography concept (renamed from **Gathering Region** to remove the collision with Foundry's own first-class **Region** — `RegionDocument` / Region Behaviour).
Realm is geography only and is NOT a composition axis — composition matches by biome + danger only, and the legacy region vocabulary has been removed.
The legacy `GatheringEnvironment.region` string is **inert**: it is preserved on read for back-compat but is not a composition input and is not editor-surfaced; realm membership is expressed through `includedRealmIds` (multiple `GatheringRealm` ids).
A startup migration derives `GatheringRealm` records from the legacy per-system region vocabulary and maps `environment.region` → `includedRealmIds` (orphan free-text region strings are left inert).
Realm records are scoped to the owning system, must not be shared by reference across systems, and ride along with crafting-system import/export (a pre-unification export is upgraded idempotently on the next migration run after import).
A Realm maps to Foundry Scene Regions many-to-one through `sceneMappings[].sceneRegionUuid`; those Foundry-bridge fields keep their `sceneRegionUuid`/`sceneUuid` names.
Record shapes and behavior are defined in `gathering-and-harvesting` (*Location-Aware Gathering*).
Fabricate-managed **Gathering Parties** are NOT part of the crafting system — they are world-level records (see *World Settings* below) and are excluded from system import/export.
Beyond the `system` object and its realms, per-system gathering environments (the `gatheringEnvironments` world setting) and the per-system `gatheringConfig` slice (rules, conditions, vocabularies, economy, reusable tasks, reusable events, character modifiers) ride along with crafting-system import/export; the runtime-versus-authoring boundary, migration, reference reporting, and copy-mode rebinding rules are defined in `import-export` (Specification 010).
The `gatheringParties` exclusion above still holds.
15. `requirements.currency.units[]` defines Fabricate's built-in currency unit profile for currency requirements (salvage currency requirements today; recipe steps no longer carry a currency requirement).
16. Currency unit profiles must be acyclic.
Each connected conversion branch must resolve to exactly one terminal base unit.
17. Legacy `requirements.currency.provider === "system"` configs with `systemAdapter === "dnd5e" | "pf2e"` normalize to the matching seeded currency unit profile when no explicit units exist.
18. Built-in currency provider selection (legacy `provider`/`systemAdapter`) and the legacy single currency macro UUID field are legacy inputs only; normalized currency requirements do not emit them. (The new `providerId` and `macros` fields below are distinct first-class fields, not the legacy inputs.)
19. `requirements.currency.spendStrategy` selects how currency is read and spent.
It is one of **three peer top-level strategies** — `"actorProperty"` (default), `"actorInventory"`, or `"macro"`; any other value normalizes to `"actorProperty"`.
A legacy nested config (`"actorInventory"` with the retired `inventoryMode === "macro"`) maps forward to the peer `"macro"` strategy on normalization; `inventoryMode` is never re-emitted.
The GM selects the strategy directly in both dnd5e and pf2e worlds (it is no longer derived solely from preset seeding).
Each strategy is realized by a symmetric coin spender behind a common `{ check(actor, requirement, ctx), spend(actor, requirement, ctx) }` interface (the `actorProperty`/`actorInventory` spenders also retain `readCoins` as the affordability primitive their `check` wraps); a consumer resolves the spender by `spendStrategy` and drives both the up-front affordability check and the deduction uniformly. (These spenders are reusable infrastructure; the step-level integration that previously drove them has been removed, and component-level currency spending is a deferred follow-up.)
    - `"actorProperty"` (the generic `ActorPropertyCoinSpender`) reads each unit's balance from its `actorPath` and spends through a single batched `actor.update(...)`, making its own change across configured sub-units.
This is the dnd5e and general behavior.
    - `"actorInventory"` uses a preconfigured provider.
The generic `ActorInventoryCoinSpender` delegates the system-specific coin I/O to a per-system coin adapter resolved by `game.system.id`.
Providers are registered in a pure, Foundry-free registry (`getCurrencyProvidersForFoundrySystem`, `getDefaultProviderId`, `resolveProvider`); the only registered provider is the pf2e inventory adapter (an internal `systemId → adapter` map, not a third-party plugin registry), which reads coins from the pf2e inventory aggregate (`actor.inventory.coins`) and spends through `actor.inventory.removeCoins(...)`, letting pf2e make its own change and report insufficient funds; Fabricate does not run its own change-making on this path. `providerId` is stored and selectable but the runtime still resolves the adapter by `game.system.id` (one provider per system today).
Systems with no registered provider (e.g. dnd5e) surface an empty-provider callout steering the GM to the `"macro"` strategy.
When no adapter is registered for the active system, the spend fails loudly with a clear message rather than silently succeeding.
    - `"macro"` drives currency through GM-supplied macros.
Because the macro receives the actor and does whatever it needs, macro spending is **not inventory-specific** and is a peer top-level strategy rather than a sub-mode of `"actorInventory"`. `MacroCoinSpender` runs the `canAfford` macro for the affordability check and the `decrement` macro for the deduction, passing each a context `{ actor, cost: [{ abbreviation, amount }], units: [{ id, abbreviation, label }], requirement, recipe, craftingSystem }`.
A macro return of `true`, or an object with a truthy `success`/`canAfford`, passes; `false`/`null`/a thrown error (or a falsy `success`/`canAfford`) fails and surfaces the macro's `message` to the player, aborting the craft before ingredient consumption.
The `increment` macro is configured and validated but reserved for a future refund flow — it is never invoked.
The macro strategy is GM-only config with no separate feature flag (matching the property macros).
    - The pf2e currency preset seeds units with `denomination` set, selects the `"actorInventory"` spend strategy, and sets the system's default `providerId`; the legacy pf2e system-adapter config normalizes to the same strategy (and the legacy dnd5e adapter normalizes to `"actorProperty"`).
20. `providerId` is a trimmed string (default `""`) and `macros` is an object of trimmed `canAfford`/`increment`/`decrement` UUID strings (each default `""`).
Both are always persisted and normalized, but `providerId` is only meaningful under `"actorInventory"` and `macros` only under `"macro"`; each remains inert (but preserved) under the other strategies so flipping the strategy never loses a configured provider or macro set.
Absent fields back-compat default to `""`/empty macros with no migration.
The retired `inventoryMode` field is never emitted.
21. **Tool-breakage authority** (`toolBreakage.authority`) is a per-system switch, normalized on read (no versioned migration): unknown or missing normalizes to `"toolSpecific"`, mirroring the inline `resolutionMode`/`salvageResolutionMode` defaulters.
A system with no persisted `toolBreakage` reads as `{ authority: "toolSpecific" }`.
The governing rule: authority decides WHETHER a tool breaks; `checkBreakage` triggers decide WHEN, under `checkDriven`; the Tool's `onBreak` decides what happens; an `immune` Tool never breaks under either authority.
22. Authority is strictly either-or (issue 419 recombine): a check can break tools ONLY under `"checkDriven"`.
Under `"toolSpecific"` authority, each Tool's own `breakage.mode` decides whether it breaks, and a check NEVER breaks tools — the shared `evaluateCheckBreakage` decision (including the routed per-tier `data.breakTools` legacy bridge) is not consulted.
A trigger's forced `outcome` (success/failure/award) still applies under both authorities; only its `breakTools` effect is gated to `checkDriven`.
23. Under `"checkDriven"` authority, the active check's `checkBreakage` triggers decide whether **all required tools** break for the attempt; each Tool's own `breakage.mode` is **not** evaluated, except `immune`, which is always honoured (filtered out of the force-break set and recorded as skipped-immune evidence).
The decision is made by a single shared evaluator (`evaluateCheckBreakage`) that crafting, salvage, and gathering all route through, so the decision cannot drift between surfaces.
The evaluator additionally reads the routed per-tier `data.breakTools` as an implicit always-on trigger (the only remaining legacy bridge), so a routed tier's `breakTools` needs no separate persistence, and only an engine-evaluated roll-formula check result can force-break (`engineEvaluated === true`); any other result never force-breaks.
A configured trigger force-breaks only when it both opts in (`breakTools === true`) AND its condition matches.
24. `checkBreakage` triggers always target **all required tools** for the attempt (never a single check-selected tool in v1).
The `rollTotal` condition targets the raw roll total (`data.total`); `progressiveValue` targets the awarding `value` and is meaningful only on progressive checks (absent → never matches); these are distinct sources because a forced-outcome trigger can overwrite `value` while `data.total` keeps the raw roll.
The `diceGroup` `groupId` is the index into the evaluated `roll.dice` term order (not re-parsed from the formula string), so duplicate `NdS` groups are disambiguated deterministically; per-die aggregates read active-only raw faces and fail open (no break) when no per-die data is available.
The `outcomeTier` condition matches when the resolved tier/outcome is in `tierIds[]` or `outcomeKeys[]`; both are honoured by the engine and the normalizer, but the editor UI authors only `tierIds[]` in v1 (`outcomeKeys[]` is an engine-level capability with no editor surface) — **acknowledged limit (issue 419)**.
25. **`consumeCatalystsOnFail` interaction on the failure path** (issue 419): breakage on a FAILED attempt runs only when `consumption.consumeCatalystsOnFail === true` — identical to how the legacy `breakTools` force-break is gated today.
A matched `checkDriven` trigger on a failed attempt therefore breaks tools only when `consumeCatalystsOnFail === true`.
On the SUCCESS path breakage always applies (no such gate exists there).

26. **Crafting-check slot ownership.** `craftingCheck.simple` is the shared optional pass/fail crafting-check slot: it backs the `simple`, `alchemy`, AND `routedByIngredients` modes' check (it is not a 1:1 slot↔mode identity — do not read it as "the simple-mode check").
`craftingCheck.routed` backs ONLY `routedByCheck`'s tier-routing check.
`craftingCheck.progressive` backs `progressive`.
The runtime reads the slot matching the mode (`CraftingEngine._runCraftingCheck` / `_resolveCraftingCheckBreakage`, `RunJournalBuilder._checkConfigForMode`, `CraftingListingBuilder._buildCheck`), and the GM Checks editor binds `routedByIngredients` to the `SimpleCraftingCheckEditor` (`craftingCheck.simple`), reserving the tier `CraftingCheckEditor` for `routedByCheck`.
27. **Crafting-check slot migration.** The 1.10.0 startup migration (`migrateMoveRoutedByIngredientsCheck`) moves a `routedByIngredients` system's pass/fail fields (`rollFormula`, `dc`, `thresholdMode`, `tiers`, `checkBreakage`) from `craftingCheck.routed` to `craftingCheck.simple` when the simple slot is unauthored (tier ids preserved so recipe `checkTierId` references survive; the routed slot's formula is cleared), operating on the raw persisted shape; it is guarded (never clobbers an authored simple slot) and idempotent.
The symmetric `CraftingSystemManager.updateSystem` slot movement runs when a system's mode crosses the `routedByIngredients` boundary (into RI: `routed → simple`; out of RI into `routedByCheck`: `simple → routed`), guarded to fill only an unauthored destination each direction.
Caveat: a `dcMode: 'dynamic'` simple check moved into `routedByCheck` loses its dynamic DC (the routed slot has no `dcMode`), and the resulting static `routed.dc` should be re-authored by the GM.

**Disambiguation:** `checkBreakage` (per-check, decides WHEN tools break under `checkDriven`) is distinct from the gathering realm rule `toolBreakagePolicy` (`failureOnBreak | successDespiteBreak`, defined in `gathering-and-harvesting`, which governs what a broken tool does to the gather outcome).
The two are unrelated and independently applied.

### System Validation Report

The **system-validation report** is a derived, computed view over a crafting
system and its entities — recipes, gathering environments (with their tasks and
events), components (salvage), and the system's own fields.
It is NOT persisted: there is no new field on `CraftingSystem`.
It is recomputed on demand from the live system, recipes, environments, and
components, so it always reflects the current configuration and auto-clears when a
gap is fixed.

The report has the shape:

```text
SystemValidationReport = {
  issues: SystemValidationIssue[],
  counts: { critical, warning, info, blockers },  // integer counts
  blocksSystem: boolean,                           // true iff any issue blocks: 'system'
}

SystemValidationIssue = {
  kind: 'recipe' | 'environment' | 'task' | 'event' | 'salvage' | 'system',
  entityId: string | null,        // the offending entity, or null for system-wide
  entityName: string,             // display label for the entity
  severity: 'critical' | 'warning' | 'info',
  blocks: 'enable' | 'visibility' | 'system' | undefined,
  code: string,                   // stable machine code; the UI maps it to copy
  message: string,                // default human-readable message
  nav: { view: string, tab?: string },  // deep-link target for the GM overview
}
```

Requirements:

1. The report composes the existing per-entity readiness evaluators (recipe,
   environment, salvage, ingredient-signature) and re-tags each composed issue
   with its `kind`, `entityId`, and `nav`.
2. The report adds NEW system-level checks keyed on the system's own fields.
   Most are `blocks: 'system'` (a progressive system with no progressive check or
   no component with a difficulty of 1 or more; multi-step recipes left on in
   alchemy mode; an alchemy ingredient-signature collision).
   The routed crafting-check formula check is keyed ONLY off the system MODE plus
   `craftingCheck.routed.rollFormula`: a `routedByCheck` system with no formula
   emits a `routedCheckNoFormula` issue that is `severity: 'critical', blocks:
   'system'` **unconditionally** — every recipe in the mode routes by the check, so
   the gap is a whole-system blocker independent of any recipe, computed with NO
   recipe scan.
   A `routedByIngredients` system never emits `routedCheckNoFormula` (its check is
   optional).
   These blockers are distinct from the per-recipe routed-authoring warnings, which
   stay `severity: 'warning'` with no `blocks`.
   Routed SALVAGE adds the parallel `salvageRoutedNoFormula` and
   `salvageRoutedNoTiers` checks, keyed off `salvageCraftingCheck.routed.rollFormula`
   and its active-type outcome tiers.
   Because salvage is a per-component opt-in rather than a whole-system selection,
   these carry no `blocks` field: each is `severity: 'warning'` while no component
   declares salvage result groups and escalates to `severity: 'critical'` (still no
   `blocks`) once one does, so a misconfigured optional feature never hides the system.
3. `blocks` carries the visibility contract consumed by `recipe-visibility`:
   `'system'` hides the whole system for non-GM users; `'visibility'` hides one
   entity; `'enable'` marks an entity that cannot be enabled until its gap is
   fixed.
4. The report computation is pure — no Foundry runtime globals, store reads, or
   I/O — so it is unit-testable and reusable from both the synchronous visibility
   hot-path and the GM overview view.

## CurrencyUnit

### Purpose

Define one actor-backed currency denomination and its optional sub-unit breakdown.

```ts
type CurrencyUnit = {
  id: string,           // stable internal reference used by CurrencyRequirement.unit
  label: string,
  abbreviation: string,
  icon: string,
  actorPath: string,    // Foundry actor data path containing the numeric balance (actorProperty strategy)
  denomination?: string, // pf2e coin denomination (pp|gp|sp|cp); used by the actorInventory strategy
  contains: Array<{
    unitId: string,     // another CurrencyUnit.id
    amount: number,     // positive integer count contained in one parent unit
  }>,
}
```

### Requirements

1. `id` is stable after creation and is the value stored by salvage currency requirements.
2. `label`, `abbreviation`, `icon`, `actorPath`, `denomination`, and `contains[]` are GM-editable.
3. A unit must not contain itself directly or indirectly, and a single unit's decomposition must reach each descendant by exactly one path.
A sub-unit `S` is eligible for parent `P` only when the set of units reachable from `P` (inclusive, through `contains[]`) and the set reachable from `S` are disjoint; this subsumes self-containment, an already-direct child, a cycle back to `P`, and the descendant/diamond cases where `P` would gain two conversion paths to the same node.
A profile where any unit reaches the same descendant by more than one distinct path is a validation error (conflicting conversion paths).
A unit legitimately shared as a child of two different parents (e.g. `gp -> sp` and `ep -> sp`) is allowed, because each parent's reachable set is computed over its own subtree.
4. `contains[].amount` must be a positive integer; a non-integer or non-positive amount is a profile validation error.
5. A sub-unit reference must point at another configured currency unit.
6. `actorPath` vs `denomination` vs `abbreviation` validation is conditional on the owning `requirements.currency.spendStrategy`:
   - Under `"actorProperty"`, every unit must define an `actorPath`; `denomination` is ignored.
   - Under `"actorInventory"`, every unit must map to a pf2e denomination — `denomination` (defaulting to the unit `id`) must be one of `pp`, `gp`, `sp`, or `cp`; `actorPath` is not required.
   - Under `"macro"`, every unit must define a non-empty `abbreviation` (macros match a unit by abbreviation); `denomination`/`actorPath` are not required.
Additionally, the config-level `canAfford` and `decrement` macros must be set (the `increment` macro is optional).

### Recipe Visibility Requirements

1. `listMode` must be one of `"global"`, `"player"`, or `"knowledge"`.
Invalid or missing values default to `"global"`.
2. The `knowledge` sub-object is only meaningful when `listMode === "knowledge"`.
3. When `listMode === "global"`, all enabled recipes are visible to all users without restriction or knowledge filtering.
4. `knowledge.learn.dragDropEnabled` controls automatic learning from actor item drops when knowledge learning is enabled; default is `true`.
5. If `knowledge.learn.dragDropEnabled` is `false`, automatic actor-drop learning is disabled and manual learn UI affordances must be used.
6. `knowledge.learn.limitRecipes` enables the per-recipe-item learn cap; default is `false`.
`knowledge.learn.maxRecipes` is normalized to a finite integer `> 0` and is retained only when `limitRecipes === true`, mirroring how `knowledge.item.maxUses` is retained only when `knowledge.item.limitUses === true`.
A `limitRecipes === true` system with a missing or invalid `maxRecipes` is treated as uncapped at runtime (fails closed to the unlimited learn path), not as a zero budget.
7. `knowledge.learn.destroyWhenSpent` removes the recipe item once its learn budget is spent; default is `false`.
It is deliberately distinct from the item craft-charge flag `knowledge.item.destroyWhenExhausted` and must not be normalized to a shared name.

## EssenceDefinition

### Purpose

Define one essence type used by components and recipe requirements.

### Properties

```js
EssenceDefinition = {
  id: string,
  name: string,
  icon: string,
  description?: string,
  sourceComponentId?: string | null,
  sourceItemUuid?: string | null, // compatibility alias; may contain a legacy component id
  associatedSystemItemId?: string | null, // compatibility alias for sourceComponentId
}
```

### Requirements

1. `sourceComponentId` is the canonical in-system managed component reference for an essence source.
2. `associatedSystemItemId` is a compatibility alias for `sourceComponentId`.
3. Legacy `sourceItemUuid` values that match a managed component id are treated as source component ids during normalization and display.
4. If an essence source component cannot be resolved, stored source evidence is retained so GM UI can show a stale-but-readable source state.

## RecipeItemDefinition

### Purpose

Define one curated knowledge item available for recipe visibility and learning flows.

### Properties

```js
RecipeItemDefinition = {
  id: string,
  name: string,
  img: string,
  description?: string,
  sourceItemUuid: string,
}
```

### Requirements

1. `sourceItemUuid` points to the canonical world or compendium item template used for recipe-item matching.
2. New recipe item definitions are created from dropped or selected Foundry items; manual UUID entry is not part of the canonical UI flow.
3. If the source template later becomes unresolved, the stored `sourceItemUuid` is retained and the definition becomes stale-but-readable.
4. Multiple recipes may reference the same recipe item definition.
This is the canonical way to model shared formulas, books, schematics, or recipe scrolls.

## Component

### Purpose

Represent one curated item entry available to recipes and salvage operations.

### Properties

```js
  Component = {
    id: string,
    name: string,
    img: string,
    description?: string,
    sourceItemUuid: string | null,
    tags: string[],
  essences: { [essenceId: string]: number },
  difficulty?: number, // only used in progressive mode

  salvage?: {
    enabled: boolean,              // default false
    ingredientQuantity: number,    // default 1
    toolIds: string[],             // references to per-system library Tools
    resultGroups: ResultGroup[],
    dcOverride: number | null,     // default null; per-component salvage check DC override (replaces salvageCraftingCheck.simple/routed.dc at salvage time)
    outcomeRouting?: { [outcome: string]: string },  // routed only
    timeRequirement?: TimeRequirement,
    currencyRequirement?: CurrencyRequirement,
  },
}
```

### Requirements

1. `difficulty` is only used in progressive mode.
2. If set, `difficulty` must be an integer >= 1.
3. Each essence key must exist in `CraftingSystem.essences` when essences are enabled.
4. `salvage` is only valid when `CraftingSystem.features.salvage` is true.
5. When `salvage.enabled` is true, `salvage.resultGroups` must contain at least one result group.
6. Runtime essence matching, craftability checks, discovered-recipe craftability, crafting-check contexts, and effect-transfer contexts must count `Component.essences` for actor items that match the component by source reference or name.
Explicit `fabricate.essences` item flags remain a compatibility override for that item.
7. `salvage.outcomeRouting` is only meaningful when `salvageResolutionMode` is `"routed"`.
In routed salvage mode it keys on the salvage check's outcome-tier NAMES (`salvageCraftingCheck.routed.{relativeOutcomes,fixedOutcomes}` for the active `type`) — the same source the per-component routing editor offers and the runtime routes by — NOT the legacy flat `salvageCraftingCheck.outcomes` list.
Every SUCCESS tier must route to an existing result group; failure tiers may stay unrouted (the runtime yields nothing for an unrouted outcome), and a route pointing at a deleted group is invalid.
When the salvage check defines no outcome tiers, routing is impossible and the component must NOT be faulted — the gap surfaces once as the system-level `salvageRoutedNoTiers` issue instead of a per-component error.
8. `salvage.ingredientQuantity` must be a positive integer.
9. If a linked source item updates its name, image, or description, managed components that match the item's live UUID, canonical source UUID, or fallback source references must refresh their stored `name`, `img`, and display-safe plain-text `description` from the linked item.
10. When importing or replacing a component source from a Foundry Item, Fabricate must verify a recorded canonical source UUID from `_stats.compendiumSource` or `flags.core.sourceId` before storing it as the component's primary source reference.
11. If the recorded canonical source UUID no longer resolves but the live dropped Item UUID does resolve, Fabricate must store the live dropped Item UUID as the component's primary `sourceUuid` and `sourceItemUuid`, and preserve the broken canonical source UUID in `fallbackItemIds`.
12. The broken-source fallback applies to single item import, folder import, compendium pack import, and replace-source.

## Recipe

### Purpose

Represent a complete recipe with inputs, outputs, and visibility settings.

### Properties

```js
Recipe = {
  id: string,
  name: string,
  description: string,
  craftingSystemId: string,
  enabled: boolean,
  category: string,

  // Multi-step mode
  steps?: Step[],

  // Single-step mode
  ingredientSets?: IngredientSet[],
  resultGroups?: ResultGroup[],

  transferEffects: boolean,
  toolIds: string[], // references library Tools that apply to all ingredient sets across all steps in this recipe

  // Routed/alchemy result-group selection
  resultSelection?: {
    provider: "ingredientSet" | "check",
  },

  // Optional minimum success tier for a fixed-type routed check: the id of a fixed
  // success outcome tier. When set, a craft whose rolled tier ranks below it (fixed
  // tiers rank by `start`) fails outright. Null/unset = no override (outcome = the
  // rolled tier). Meaningful only for routedByCheck with a fixed-type check; ignored
  // otherwise. Semantics in 004.
  minSuccessOutcomeId?: string | null,

  visibility?: {
    restricted: boolean,
    allowedUserIds?: string[],  // Required when restricted is true. Empty array = hidden from all non-GM users.
  },

  // Canonical recipe-item definition reference inside the owning crafting system
  recipeItemId?: string,

  locked: boolean,

  metadata: {
    created: number,
    modified: number,
    author: string,
    version: string,
  },
}
```

### Requirements

1. A *craftable* Recipe must include at least one ingredient set and at least one result group, either at recipe level (single-step mode) or within steps (multistep mode).
   This is a *completeness* requirement: it gates crafting and craftable-visibility, not persistence.
   `Recipe.validate()` enforces completeness and is the craftability contract; the crafting engine gates on it, so an incomplete recipe is never craftable.
   `Recipe.validateStructure()` omits completeness (it waives the missing-ingredient-set / missing-result-group / missing-result errors) and is the persistence contract.
2. An authoring *incomplete shell* — a recipe with valid identity (a name; default name "Unnamed Recipe" and default image apply when omitted) that is structurally consistent but missing its ingredient sets and/or result groups — MAY be persisted via the GM authoring path (create-then-edit and identity-only saves).
   Persistence gates only on structural validity (`validateStructure()`), never on completeness; structural-integrity errors (duplicate result-group/result IDs, invalid results, invalid step time/currency values, variable result-mapping and outcome-routing integrity) still block persistence.
   Reserved/duplicate `ResultGroup.name` is a *completeness* rule (enforced only by the full `Recipe.validate()` / at activation, and only for the `alchemy` `resultSelection.provider`), NOT a structural/persistence blocker: `validateStructure()` waives it (`Recipe._validateRoutedResultSelection` returns early when `requireComplete` is false), so a routed-mode recipe carrying a stray leftover `resultSelection.provider` is never blocked on a name error.
   `routedByCheck` `ResultGroup.name` integrity is enforced at the service level (`ResolutionModeService._validateRoutedGroupNames`, a per-mode reference-integrity check that always applies), independent of this persistence gate.
   Incompleteness is *derived* from the recipe's structure (no stored flag): an implicit recipe is incomplete when it has no ingredient sets or no result groups; an explicit multi-step recipe is incomplete when any step is missing an ingredient set or result group.
3. Resolution-mode constraints are defined in `004-resolution-modes.md`.
4. `resultSelection.provider` is required when `CraftingSystem.resolutionMode` is `alchemy` (the only mode that routes via a per-recipe provider).
   The routed crafting modes derive their routing basis from the system mode and carry no `resultSelection`: `routedByIngredients` routes by `IngredientSet.resultGroupId` and `routedByCheck` routes by `ResultGroup.name`/`checkOutcomeIds` against the system routed check.
5. `resultSelection.provider` value constraints for alchemy (the provider enum is `ingredientSet | check`):
   - `ingredientSet`: each `IngredientSet` must resolve deterministically to exactly one `ResultGroup` (via `IngredientSet.resultGroupId`, or implicitly when only one result group exists).
   - `check`: the system crafting-check outcome routes to the `ResultGroup` of the same name.
6. `ResultGroup.name` values must be unique per recipe under trim-normalized, case-insensitive comparison.
7. `ResultGroup.name` values may not be reserved routing keywords under trim-normalized, case-insensitive comparison:
   - failure keywords: `fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`, `hazard`, `danger`, `complication`, `trap`, `oops`
8. If `transferEffects` is true and essences are enabled, transfer behaviour follows `005-recipes-and-steps.md`.
9. If `visibility.restricted` is true, `visibility.allowedUserIds` must be present as an array.
An empty array is valid and means no non-GM user may see the recipe.
10. If knowledge mode includes item matching or learning, `recipeItemId` should be configured for player craftability.
11. If `recipeItemId` is configured and the referenced `RecipeItemDefinition` does not exist, validation must warn.
12. If `recipeItemId` is configured and the referenced `RecipeItemDefinition.sourceItemUuid` is stale or no longer resolves, validation must warn.
13. `minSuccessOutcomeId` is an optional reference to a fixed-type routed check's success outcome tier id (semantics in `004`); it defaults to `null`.
It is meaningful only when `CraftingSystem.resolutionMode === "routedByCheck"` and the routed check `type` is `fixed`, and is ignored for relative-type checks and non-routed modes.
An absent or `undefined` value round-trips to `null` through `Recipe.fromJSON` with no migration.

### Validation Guidance

Shape validation (invalid):

- `visibility.restricted` is `true` but `allowedUserIds` is missing, `null`, or not an array.

Valid-but-hidden configuration:

- `visibility.restricted` is `true` and `allowedUserIds` is `[]`.
The recipe is hidden from all non-GM users.
GM can still view and manage the recipe.

## Recipe Item Identity

### Purpose

Define matching between a recipe's system-managed recipe item definition and owned inventory items.

### Canonical Link

- `Recipe.recipeItemId` stores the reference to a `CraftingSystem.recipeItemDefinitions[].id` entry.
- `RecipeItemDefinition.sourceItemUuid` stores the canonical template reference to the recipe item.
- The template may point to a world item or a compendium item.

### Match Rule

A candidate owned item matches when either condition is true:

1. `ownedItem.uuid === recipeItemDefinition.sourceItemUuid`
2. `ownedItem._stats.compendiumSource === recipeItemDefinition.sourceItemUuid`
3. `ownedItem.flags.core.sourceId === recipeItemDefinition.sourceItemUuid` (legacy fallback)

Foundry v12+ uses `_stats.compendiumSource`; Foundry v11 and earlier used `flags.core.sourceId`.
Runtime implementations should call the shared source UUID resolver defined in `006-recipe-visibility.md`.

### Match Context Contract

Defines the information necessary to make a determination about whether an owned inventory item matches, and therefore represents, a recipe in an actor's inventory.
This structure need not explicitly appear in implementation.

```js
RecipeItemMatchContext = {
  recipeItemId: string,
  recipeItemSourceUuid: string,
  candidateItemUuid: string,
  candidateSourceId: string | null,
  isMatch: boolean,
}
```

## Step

### Purpose

Represent one step in a multistep recipe.

### Properties

```js
Step = {
  id: string,
  name: string,
  description?: string,

  ingredientSets: IngredientSet[],
  resultGroups: ResultGroup[],
  toolIds: string[], // references library Tools that apply to all ingredient sets in this step

  timeRequirement?: {
    minutes?: number,
    hours?: number,
    days?: number,
    months?: number,
    years?: number,
  },
}
```

### Requirements

1. `timeRequirement` is a duration declaration, not an absolute timestamp.
2. If present, at least one of `minutes`, `hours`, `days`, `months`, `years` must be a positive number.
3. Runtime execution normalises duration fields to a world-time target timestamp for gate evaluation.

## IngredientSet

### Purpose

Represent one ingredient bundle with optional per-set Tool prerequisites.

### Properties

```js
IngredientSet = {
  id: string,
  name: string,
  ingredientGroups: IngredientGroup[],
  essences: { [essenceId: string]: number },
  toolIds: string[], // references library Tools required for this ingredient set

  // Routed/alchemy: used when resultSelection.provider === "ingredientSet"
  resultGroupId?: string,
}
```

### Requirements

1. `ingredientGroups` must contain at least one `IngredientGroup`, unless `essences` contains one or more positive requirements.
2. Ingredient-set evaluation is always OR-across-sets at recipe/step level.
3. AND-across-ingredient-sets is not supported.
4. `toolIds` normalizes to `[]` when absent; each id coerces to a trimmed string and empties are dropped.
The applicable Tool set for an ingredient set is the union of recipe-level, step-level, and ingredient-set-level `toolIds`, resolved against the per-system Tools library; ids that miss the library are logged and dropped.

## IngredientGroup

### Purpose

Represent one required ingredient slot where at least one option must be satisfied.

### Properties

```js
IngredientGroup = {
  id: string,
  name?: string,
  options: Ingredient[], // OR options; one option satisfies the group
}
```

### Requirements

1. `options` must contain at least one `Ingredient`.
2. A group is satisfied when any one option is satisfied.
3. All groups in an `IngredientSet` must be satisfied.
4. OR-group semantics are always enabled and are not controlled by a feature toggle.

## Ingredient

### Purpose

Represent one consumable ingredient requirement.

### Properties

```js
Ingredient = {
  quantity: number,
  extractEffects: boolean,

  match: {
    type: "component" | "tags" | "currency",

    // type = "component"
    componentId?: string,

    // type = "tags"
    tags?: string[],
    tagMatch?: "any" | "all", // default "any"

    // type = "currency"
    unit?: string,    // a configured requirements.currency.units[].id
    amount?: number,  // positive cost in that unit
  },
}
```

### Requirements

1. `quantity` must be positive.
2. `match.type` is required.
3. If `match.type === "component"`, `match.componentId` is required.
4. If `match.type === "tags"`, `match.tags` must contain one or more tag IDs.
5. Tag IDs in `match.tags` must exist in `CraftingSystem.itemTags`.
6. Tag placeholder ingredients are valid in all resolution modes, including `simple`.
7. A `match.type === "currency"` option is a currency ALTERNATIVE for its ingredient group: `unit` is a configured `requirements.currency.units[].id` and `amount` is a positive cost.
A currency option matches no inventory item and contributes no alchemy signature.

### Currency-Alternative Spend (Craft-Time)

When the crafting system has `requirements.currency.enabled === true`, a currency option can satisfy its ingredient group by spending the crafting actor's currency at craft time:

1. Selection is **items-first, currency-fallback** per group.
Every non-currency option is tried first; the first item-satisfiable option wins even if a currency option is authored earlier (items strictly beat currency).
Only if no item option satisfies does the resolver choose the first AFFORDABLE currency option in author order among the group's currency options.
2. Affordability is evaluated against the crafting actor through the same currency profile/spend strategy the system configures (`actorProperty` / `actorInventory` / `macro`).
The craftability display and the engine execution resolve currency against the **same** actor, so what a player sees agrees with what the craft spends.
With no crafting actor the currency option is treated as unaffordable (shown missing); it never throws.
3. The engine computes the chosen item plan and currency spends **once** for a craft, then runs an all-affordable gate over the chosen spends — aggregated across units that share a base ladder — **before** any item or currency mutation.
On a shortfall the craft aborts with an `Insufficient currency` message and zero mutation, and never falls back to an unselected item plan.
4. Currency is deducted after item consumption on success (and on a failure path only when the failure policy consumes ingredients).
Deduction makes change across the configured denomination ladder; a deduction failure is logged, not refunded.
5. When `requirements.currency.enabled === false`, a currency option can never satisfy its group (it is shown missing), regardless of the actor's balance.

## Alchemy Signature Uniqueness (Validation Contract)

### Purpose

Define the save/import invariant that guarantees deterministic ingredient-signature resolution in alchemy mode.

### Contract

1. Applies only when `CraftingSystem.resolutionMode === "alchemy"`.
2. Scope is all recipes in the crafting system.
3. Signature overlap is based on satisfiable ingredient assignments, not just textual equality.
4. Matching expansion must include:
   - direct component matches (`match.type === "component"`)
   - tag matches (`match.type === "tags"`) expanded against current system components/tags.
5. Ingredient groups may resolve to the same component ID when inventory quantity is sufficient to satisfy the aggregate quantity across those groups.
6. Any overlapping satisfiable signatures between ingredient sets in the same system are invalid.
7. Save is blocked for any collision in the system, including when editing an unrelated recipe.
8. Import behavior is partial:
   - non-conflicting recipes are imported,
   - conflicting recipes are rejected,
   - one aggregated conflict report is returned at completion.

## Tool

### Purpose

Represent one reusable, potentially-breakable prerequisite entry in a crafting system's
per-system Tools library.
A Tool is the single shared **required-but-not-always-consumed**
primitive spanning **both** crafting (recipe / step / ingredient-set / salvage `toolIds`)
**and** gathering (`task.toolIds`).
It replaces the retired Catalyst concept.
Tools may
break across attempts and may require an actor-side expression to be truthy before they can
be used.
Inline per-recipe / per-task tool authoring is not the canonical model — references
are always by id into the per-system library.

### Properties

```js
Tool = {
  componentId: string,
  requirement: null | {
    formula: string,
  },
  breakage: {
    mode: "limitedUses" | "breakageChance" | "diceExpression" | "immune",
    maxUses?: number | null,         // limitedUses; null means unlimited
    breakageChance?: number,         // breakageChance; integer 0..100
    formula?: string,                // diceExpression
    threshold?: number,              // diceExpression; broken when result < threshold
    // "immune" carries no additional fields; the tool never breaks under EITHER
    // breakage authority and is still recorded as used (no toolUsage flag, which is
    // limitedUses-only). Under checkDriven authority it is the per-tool opt-out.
  },
  onBreak: {
    mode: "destroy" | "flagBroken" | "replaceWith",
    replacementComponentId?: string  // replaceWith; must !== componentId
  }
}
```

### Requirements

1. `componentId` is required.
2. Tools are **SYSTEM-OWNED**: the single canonical library lives on the crafting-system object as `system.tools` (persisted in the `craftingSystems` setting, populated by `CraftingSystemManager._normalizeSystem`).
Every consumer reads this one source — the recipe/step/ingredient-set/salvage tool gate (`RecipeManager`, `CraftingEngine`), the canvas interactable browser and item-drop resolution, and gathering.
Gathering composition (`GatheringRichStateService.composeEnvironment`) sources `task.toolIds` lookups from `system.tools` (exposed on the composed environment as the non-enumerable `__libraryTools` map); it does **not** read a gathering-scoped tools copy.
The 0.6.0 Catalyst→Tool migration writes migrated crafting Tools onto `system.tools`; the 0.7.0 migration reconciles any UI-authored `gatheringConfig.systems[id].tools` onto `system.tools` (dedupe by id, the system tool wins) and clears the gathering-config copy, so `system.tools` is the sole library going forward.
3. A referenced Tool is always required: it must be present and pass its optional `requirement` before crafting or a gathering attempt may proceed.
A reference whose id no longer resolves in its library, or that resolves to a disabled tool, blocks the attempt with `TOOL_BLOCKED`.
4. `requirement` is optional and formula-only.
When present, it requires a non-empty `formula` — a Foundry roll expression evaluated against the actor's roll data.
The actor satisfies the requirement when the result is truthy (a non-zero number or a `true` boolean).
There is no provider discriminator and no macro support on this surface.
5. Exactly one `breakage.mode` is configured per tool:
   - `limitedUses`: `maxUses` is null or a positive integer.
Tool usage is tracked on the owned item via `flags.fabricate.toolUsage = { timesUsed }`.
The tool breaks once `timesUsed >= maxUses` (after the per-attempt increment).
   - `breakageChance`: `breakageChance` is an integer in `0..100`.
The tool breaks when `Math.random() * 100 < breakageChance` (so `0` never breaks and `100` always breaks).
   - `diceExpression`: `formula` is a non-empty Foundry roll formula evaluated against the actor's roll data; `threshold` is a finite number.
The tool breaks when the numeric result is `< threshold`.
   - `immune`: carries no breakage fields and never breaks under either authority.
It is still recorded as used (no `toolUsage` flag is written, because that flag is `limitedUses`-only), and under `checkDriven` authority it is filtered out of the force-break set.
`onBreak` stays configurable but is inert while immune.
6. Exactly one `onBreak.mode` is configured per tool. `replaceWith` requires `replacementComponentId !== componentId`.
7. `flags.fabricate.toolBroken === true` on an owned item disqualifies it from satisfying a tool's presence gate until the flag is cleared.
8. A **virtual-present** Tool injected by a canvas Tool station (keyed by `componentId`, system-scoped via `presentTools = { systemId, componentIds }`) satisfies a Tool prerequisite without the actor owning the item and is excluded from usage and breakage.
The match fires only when the evaluated recipe/task's own crafting system equals the active tool's `systemId`.

### Validation Matrix

| Field                                  | Valid values                                       | Invalid values            |
|----------------------------------------|----------------------------------------------------|---------------------------|
| `componentId`                          | non-empty string                                   | empty or missing          |
| `requirement.formula`                  | non-empty string                                   | empty                     |
| `breakage.limitedUses.maxUses`         | null or positive integer                           | `0`, negative, fractional |
| `breakage.breakageChance.breakageChance` | integer `0..100`                                 | non-integer, out of range |
| `breakage.diceExpression.formula`      | non-empty string                                   | empty                     |
| `breakage.diceExpression.threshold`    | finite number                                      | non-finite                |
| `breakage.immune`                      | no breakage fields required or permitted           | —                         |
| `onBreak.replaceWith.replacementComponentId` | non-empty, must differ from `componentId`    | empty, equal to `componentId` |

## Gathering Drop Reference

### Purpose

Represent one reward row target on a d100 gathering task.
The row shape remains a component reference or a direct Foundry Item UUID so existing task data can keep using either reward source.

### Properties

```js
GatheringDropReference = {
  componentId?: string,
  itemUuid?: string,
  quantity: number,
  dropRate: number,
}
```

### Requirements

1. `quantity` must be positive.
2. `dropRate` must be an integer from `0` to `100`.
3. A persisted, imported, or seeded row must have at least one resolvable reward target path:
   - `componentId` resolves to a component in the owning crafting system.
   - `itemUuid` resolves through Foundry UUID lookup to an Item document.
4. Rows with neither target, stale component ids, or unresolved item UUIDs are invalid at import/save/seed boundaries.

## ResultGroup

### Purpose

Group one or more results.

### Properties

```js
ResultGroup = {
  id: string,
  name: string,
  results: Result[],
}
```

## Result

### Purpose

Represent one produced item.

### Properties

```js
Result = {
  id: string,
  componentId: string,
  quantity: number,
  propertyMacroUuid: string | null,
}
```

### Requirements

1. `componentId` is required.
2. `quantity` must be positive.
3. `propertyMacroUuid` is only valid when `features.propertyMacros` is true.

## CraftingRun

### Purpose

Represent one actor-scoped crafting execution instance, including resumable in-progress state and final outcome metadata for history.

### Properties

```js
CraftingRun = {
  id: string,
  actorUuid: string,
  userId: string, // initiating user

  craftingSystemId: string,
  recipeId: string,

  status: "inProgress" | "waitingTime" | "succeeded" | "failed" | "cancelled",

  startedAt: number,
  updatedAt: number,
  finishedAt?: number,

  currentStepIndex: number | null,
  steps: CraftingRunStepState[],

  componentSourceActorUuids: string[],
}
```

### Requirements

1. `id` must be unique within `Actor.flags.fabricate.craftingRuns.active` and within the actor's history entries.
2. `currentStepIndex` must be `null` for terminal statuses (`succeeded`, `failed`, `cancelled`).
3. `status` must be `waitingTime` when progression is blocked only by elapsed time.
4. `finishedAt` is required for terminal statuses and must be absent for non-terminal statuses.

## CraftingRunStepState

### Purpose

Represent current and historical execution state for one recipe step within a crafting run.

### Properties

```js
CraftingRunStepState = {
  stepId: string,
  stepName: string,
  index: number,

  status: "pending" | "inProgress" | "waitingTime" | "succeeded" | "failed",

  startedAt?: number,
  updatedAt: number,
  completedAt?: number,

  // Time gate tracking (for step.timeRequirement)
  timeGate?: {
    requiredSeconds: number,
    availableAt: number, // timestamp when step can complete
    initiatedAt: number, // timestamp when step began
  },

  selectedIngredientSetId?: string,

  lastCheckResult?: {
    success: boolean,
    reason: string,   // user-friendly text returned by the macro explaining the result
    outcome?: string, // routedByCheck mode / alchemy check provider
    value?: number,   // progressive mode
    data?: object,
  },

  consumedIngredients?: Array<{
    actorUuid: string,
    itemUuid: string,
    quantity: number,
  }>,
  usedTools?: Array<{
    actorUuid: string,
    itemUuid: string,
    quantity: number,
  }>,
  createdResults?: Array<{
    actorUuid: string,
    itemUuid: string,
    quantity: number,
  }>,

  failureReason?: string,
}
```

### Requirements

1. `index` must be contiguous and zero-based within a `CraftingRun.steps` array.
2. `timeGate` is only valid when the corresponding recipe step has `timeRequirement`.
3. `timeGate.availableAt` must be `> initiatedAt` when both are present.
4. `completedAt` is required when `status` is `succeeded`, or `failed`.
5. `lastCheckResult.outcome` is only valid in `routedByCheck` mode (and in alchemy when the provider is `check`); `lastCheckResult.value` is only valid in progressive mode.
6. `failureReason` is required when `status` is `failed`.

## Actor Flags

### Crafting Runs Flag

```js
Actor.flags.fabricate.craftingRuns = {
  active: {
    [runId: string]: CraftingRun,
  },
  history: CraftingRun[],
}
```

Requirements:

1. `active` contains only non-terminal runs (`inProgress` or `waitingTime`).
2. `history` contains only terminal runs (`succeeded`, `failed`, `cancelled`).
3. When a run reaches a terminal status, it must be removed from `active` and prepended to `history`.
4. History should be newest-first and capped by a configured or default limit.
5. Deleting a recipe or crafting system should clean-up its associated crafting runs, both historical and in-progress.

### Gathering Runs Flag

```js
Actor.flags.fabricate.gatheringRuns = {
  active: {
    [runId: string]: object,
  },
  history: object[],
}
```

Requirements:

1. `active` contains only non-terminal gathering runs (`inProgress` or `waitingTime`).
2. `history` contains only terminal gathering runs (`succeeded`, `failed`, `cancelled`).
3. When a gathering run reaches a terminal status, it must be removed from `active` and prepended to `history`.
4. Within one actor's `gatheringRuns.active`, at most one active run may exist for a given `taskId`.
5. Detailed `GatheringRun` shape and lifecycle semantics are defined in `009-gathering-and-harvesting.md`.

### Learned Recipes Flag

```js
Actor.flags.fabricate.learnedRecipes = {
  [recipeId: string]: {
    learnedAt: number,
    sourceItemUuid: string,
  },
}
```

Requirements:

1. `recipeId` must reference a valid recipe.
2. `learnedAt` must be a valid timestamp.
3. `sourceItemUuid` should reference the matched owned recipe item used to learn.

### Discovered Gathering Realms Flag

```js
Actor.flags.fabricate.discoveredGatheringRealms = {        // was discoveredGatheringRegions
  [systemId: string]: {
    [realmId: string]: {                                   // was regionId
      discoveredAt: number,
      source: "manual" | "partyToken" | "import" | "api",
      partyId?: string,
      sceneUuid?: string,        // Foundry bridge — NOT renamed
      sceneRegionUuid?: string,  // Foundry bridge — NOT renamed
    },
  },
}
```

Requirements:

1. The flag is actor-scoped and world-local so realm knowledge follows the character across party changes.
2. `systemId` must refer to the crafting system that owns the realm; `realmId` must refer to a `GatheringRealm` in that system.
Discovery writes validate this before persisting.
3. `discoveredAt` must be a timestamp and `source` must be one of the listed values.
4. Reads never throw on a stale `partyId`; missing or stale realm ids must not disclose secret realm names to non-GM users.
5. Because this is an actor flag (not a world setting), it is **not** rewritten by the `1.1.0` migration runner.
Reads accept the legacy `discoveredGatheringRegions` flag as a fallback and every write persists only the new `discoveredGatheringRealms` key, upgrading each actor lazily.
6. Discovery semantics are defined in `gathering-and-harvesting` (*Actor Realm Discovery*).

## Run Journal Projection

### Purpose

Define the unified, UI-safe projection the player-facing Journal screen reads (see `003-ui-integration.md` *Journal App*).
It is a **derived, computed view**, not a persisted entity: there is no new actor flag or `CraftingSystem` field, mirroring the System Validation Report's derived-view contract.
`RunJournalBuilder` recomputes it on demand from the selected actor's three native run sources — `craftingRuns` (see *CraftingRun* / *CraftingRunStepState*), `salvageRuns`, and `gatheringRuns` — projecting each native run into a single superset `RunModel`.
Crafting runs populate the step fields; gathering and salvage carry no steps.
Like the gathering listing it never returns raw Foundry documents: every model is built from cloned primitives, so the Journal monitors and (crafting only) advances *existing* runs without creating them.

### JournalListing

```js
JournalListing = {
  selectedActorId: string | null,
  actor: object | null,                 // UI-safe actor option (image, name, id)
  worldTime: number,                    // current world time used for readiness derivation
  activeRuns: RunModel[],               // projected non-terminal runs
  history: RunModel[],                  // projected terminal runs
  counts: { active: number, history: number },
}
```

### RunModel

```js
RunModel = {
  id: string,
  runType: "crafting" | "salvage" | "gathering",
  status: string,                        // the native persisted status, passed through verbatim
  derivedStatus: "waiting" | "ready" | "inProgress" | "succeeded" | "failed" | "cancelled",
  craftingSystemId: string | null,
  craftingSystemName: string,
  names: { title: string, subtitle: string },
  redacted: boolean,
  img: string,
  stepIndex: number | null,
  stepCount: number,
  multiStep: boolean,                    // crafting only: the recipe has more than one step (false for single-step and non-crafting)
  isFinalStep: boolean,                  // crafting only: the run is on its last step (single-step, or the last step of a multi-step recipe)
  stepLabel: string,                     // "" for single-step, gathering/salvage, and redacted crafting runs
  steps: StepModel[],                    // [] for gathering/salvage and for redacted crafting runs
  currentStep: StepModel | null,
  timeGate: object | null,               // per-runType source (see Requirements)
  startedAt: number | null,
  updatedAt: number | null,
  finishedAt: number | null,
  structureLabel: string,                // localized single-step vs multi-step label (crafting only)
  resolutionModeLabel: string,           // localized player-facing mode label (crafting only)
  recipeId: string | null,               // null for non-crafting and redacted runs
  taskId: string | null,                 // gathering/salvage task reference
  flavor: string,
  failureReason: string | null,
  createdResults: Array<{ componentId, itemUuid, quantity, name, img }>,
  createdResultCount: number,
  manualAdvance: boolean,                // true only for non-redacted crafting (the Trigger Next Step gate)
}
```

### StepModel

```js
StepModel = {
  stepId: string | null,
  stepName: string,
  index: number,
  status: "pending" | "inProgress" | "waitingTime" | "succeeded" | "failed",
  timeGate: object | null,
  detail: {
    requiredSeconds: number | null,
    primaryToolName: string | null,
    toolNames: string[],
    checkLabel: string | null,           // rollFormula + resolved DC; no skill name (none is stored)
    failureText: string | null,
  },
  lastCheckResult: {
    success: boolean,
    outcome: string | null,
    value: number | null,
    reason: string | null,
  } | null,
}
```

### Requirements

1. **`derivedStatus` is computed, never the persisted status.**
   A terminal `status` (`succeeded`, `failed`, `cancelled`) passes through to `derivedStatus` unchanged.
   For a non-terminal run, readiness is derived from the active readiness gate's `availableAt`: `ready` when `availableAt <= worldTime`, otherwise `waiting`.
   A non-terminal run with no armed gate is `inProgress`.
   The persisted `status` (e.g. a `waitingTime` that `processWorldTime` flips to `inProgress` asynchronously off the same world-time hook) is NEVER consulted for the active-run derivation — only the gate's `availableAt` against `worldTime` — so the readiness read is race-free.
2. **Per-runType `timeGate` source.**
   For a crafting run, `timeGate` and the readiness derivation come from the ACTIVE step's gate (the step at `currentStepIndex`).
   For gathering and salvage runs, they come from the RUN-level `timeGate`.
   Gathering re-maps its native `*WorldTime` fields (`startedAtWorldTime` / `updatedAtWorldTime` / `completedAtWorldTime`) onto the common `startedAt` / `updatedAt` / `finishedAt`; salvage already uses the crafting `startedAt` / `updatedAt` / `finishedAt` names.
3. **Viewer redaction (`redacted`).**
   A crafting or alchemy run whose recipe the viewer cannot see — a recipe that no longer resolves, or an undiscovered alchemy / knowledge-gated crafting recipe for a non-GM viewer — is redacted: `redacted: true`, `names.title` becomes the generic localized label (`FABRICATE.App.Journal.Redacted.Title`), `recipeId` is `null`, `steps` / `createdResults` / `failureReason` / `stepLabel` are blanked, `manualAdvance` is `false` (a hidden-identity run offers no Trigger Next Step), and `img` falls back to the default run image.
   A GM viewer and globally-visible recipes are never redacted; with no recipe-visibility service available no redaction occurs.
   This mirrors the gathering blind-run redaction (the gathering listing builder), so the Journal never leaks a hidden crafting/alchemy recipe identity to a non-GM viewer.
   Gathering and salvage runs are not redacted by this projection (`redacted: false`); gathering's own blind-task redaction is applied upstream by its listing builder.
4. **Step projection is crafting-only.**
   `steps`, `currentStep`, `structureLabel`, `resolutionModeLabel`, `multiStep`, `isFinalStep`, and each step's `detail.checkLabel` are populated for crafting runs only; gathering and salvage project `steps: []`, `currentStep: null`, empty structure/mode labels, and `multiStep: false` / `isFinalStep: false`.
   A redacted crafting run also projects `steps: []`.
   `multiStep` is `recipe.steps.length > 1`; `isFinalStep` is `stepCount <= 1 || currentStepIndex >= stepCount - 1` (true on a single-step recipe or the last step of a multi-step recipe, and — harmlessly, since a terminal run drives no action — on any terminal run whose `currentStepIndex` is null).
   `stepLabel` is a localized "Step X of Y" string only for a non-redacted multi-step crafting run; it is `""` for a single-step recipe (the structure label already conveys the single-step shape) and for a redacted run (so a hidden multi-step recipe never leaks its step count or active step name).
5. **`manualAdvance` is the Trigger Next Step gate.**
   It is `true` only for non-redacted crafting runs (a redacted crafting run sets it `false`); the player-facing advance contract is defined in `005-recipes-and-steps.md` (*Run Progression — Player-Initiated Advance*).
6. **`resolutionModeLabel` uses the player-facing label map.**
   It resolves through the localized mode-label map defined in `004-resolution-modes.md` (*Player-Facing Mode Labels*) and never emits the raw `resolutionMode` token.
7. **`counts.active` feeds the nav badge.**
   It is the count of active (non-terminal) runs the Journal navigation surfaces as its active-run count badge.

## Item Flags

### Recipe Item Usage Flag

Tracks how many time an owned item granting knowledge of a recipe has been used to craft.

```js
Item.flags.fabricate.recipeItemUsage = {
  timesUsed: number,
}
```

Requirements:

1. `timesUsed` must be a non-negative integer.
2. Usage is tracked per owned item instance.
3. Maximum uses is configured in `CraftingSystem.recipeVisibility.knowledge.item.maxUses`.
4. When `timesUsed >= maxUses`, the item is exhausted.
5. If `destroyWhenExhausted` is true, the item is destroyed when exhausted.

### Recipe Item Learning Flag

Tracks how many recipes have been learned from an owned recipe item under the learn cap (issue 511).
It mirrors the Recipe Item Usage Flag: a distinct counter for the learn-cap mechanic, held on the same physical item document.

```js
Item.flags.fabricate.recipeItemLearning = {
  learnedCount: number,
}
```

Requirements:

1. `learnedCount` must be a non-negative integer.
2. The count is tracked per owned item **document** instance, so a stacked `qty > 1` document shares one count.
3. It accumulates across every actor that holds the document and is **not** reset on transfer or ownership change.
4. The learn cap is configured in `CraftingSystem.recipeVisibility.knowledge.learn.maxRecipes` (enabled by `limitRecipes`).
5. When `learnedCount >= maxRecipes`, the learn budget is spent and no further recipe may be learned from the item.
6. If `knowledge.learn.destroyWhenSpent` is true, the recipe item is destroyed when its budget is spent.
7. This counter is independent of `recipeItemUsage.timesUsed` (craft-charges); the two are never conflated.

### Tool Item Usage Flag

Tracks how many times an owned tool item has been used.
Written only by the `limitedUses` breakage mode.

```js
Item.flags.fabricate.toolUsage = {
  timesUsed: number,
}
```

Requirements:

1. `timesUsed` must be a non-negative integer.
2. Usage is tracked per owned item instance.
3. The `breakageChance` and `diceExpression` breakage modes do not write this flag.
4. **Legacy catalyst-usage fallback.** When `flags.fabricate.toolUsage` is absent, the runtime MUST fall back to reading the legacy `flags.fabricate.catalystItemUsage = { timesUsed }` flag so in-flight per-item usage counters survive the 0.6.0 Catalyst→Tool migration without an item-flag rewrite.
This fallback is meaningful **only** for migrated `limitedUses` tools (mapped from `degradesOnUse: true`); presence-only tools (`breakageChance: 0`, mapped from `degradesOnUse: false`) never read or write usage.
The first post-migration `applyUsage` on a `limitedUses` tool writes `toolUsage` (authoritative thereafter); the legacy `catalystItemUsage` flag is never back-filled or cleared — once `toolUsage` exists it wins and the fallback path is not re-entered.
The legacy `catalystUses` bare-number flag is read and coerced to the `{ timesUsed }` shape under the same fallback.

### Tool Broken Flag

Set by the `flagBroken` on-break action to mark an item as unusable as a tool until a GM clears the flag.

```js
Item.flags.fabricate.toolBroken = true
```

Requirements:

1. When set to `true`, the item does not satisfy a crafting or gathering tool presence gate.
2. The flag is not cleared by Fabricate; the GM clears it via the Foundry item flag editor (or future repair flow).
3. The `flagBroken` action also appends a localized leading-space `(broken)` suffix (the literal `" (broken)"`) to the owned item's display name.
The suffix is applied idempotently — never double-appended, and never appended to an item that was already `toolBroken`-flagged before the action fired.
The suffix is display-only and is not auto-cleared by Fabricate; the flag (not the name) remains the authoritative presence-gate disqualifier (data-models req 7, gathering req 2).
A managed component matched purely by name (no `sourceUuid`/fallback ids) stops matching its component once renamed, so a GM clearing the flag must also restore the original name to regain `damaged`-tier recognition.

## Canvas Interactables

### Purpose

Bring crafting/gathering onto the Foundry VTT canvas as **Interactables** — drag-and-drop placements for Tool stations and Gathering-Task resource nodes.
A Fabricate Canvas Interactable is **region-first**: it is a **Scene Region** carrying a custom **`fabricate.interactable` Region Behaviour** (a `RegionBehaviorType`) that OWNS the authoritative state.
A **linked visual** (Tile by default; optionally a Drawing or an existing GM-placed Token) is **presentation-only**. **No synthetic actor or proxy token is ever created.** A GM drags a Tool / Gathering-Task entry from the GM-only scene-control Interactable browser (or drags a tool-linked Item) onto the canvas; a Region + behaviour + linked Tile is spawned (or a **region-only** interactable with no visible marker).
Spawning is **GM-only**.
Activation is **token presence**: a controlled token entering the region offers the controlling player a non-blocking interact prompt (see `gathering-and-harvesting` and `ui-integration` for the activation pipeline).

### Interactable Region Behaviour (`fabricate.interactable`)

The behaviour is registered via the module manifest (`documentTypes.RegionBehavior.interactable` + `"socket": true`) + `CONFIG.RegionBehavior.dataModels`.
The behaviour subscribes to its region events through a schema `events` field (`_createEventsField`).
All authoritative per-interactable state lives in the behaviour `system`:

```js
behavior.system = {
  interactableType: "tool" | "gatheringTask",   // initial "tool" (unconfigured sentinel)
  sourceUuid: string,                 // the Fabricate Tool / Gathering Task source identity; initial "Fabricate.unconfigured.tool" (non-resolvable sentinel)
  systemId: string,                   // initial "unconfigured" (sentinel)
  toolId: string|null,                // tool interactables
  taskId: string|null,                // gatheringTask interactables
  environmentId: string|null,         // resolved at drop (gatheringTask only)
  taskNodeLink: "linked" | "unlinked", // gatheringTask resource-node link (default "linked")
  node: object|null,                  // independent node pool when taskNodeLink === "unlinked" (issue 302); else null
  name: string,
  presentation: { promptText: string|null, hidden: boolean },
  linkedVisual: {
    uuid: string|null,
    documentName: "Tile" | "Drawing" | "Token" | null,
    mode: "marker" | "none",          // "none" = region-only (no visible marker)
    missingPolicy: "ignore" | "warn" | "recreate"
  },
  // `taskNodeLink` selects whether a gatheringTask shares the task's node or owns
  // its own — much like an FVTT token↔actor link:
  //   "linked" (default) — env nodeRuntime[taskId] owns counts/depletion/respawn (depletion
  //                        and respawn follow the gathering task); `node` is null.
  //   "unlinked"         — the behaviour owns its OWN independent pool, stored verbatim in `node`
  //                        (normalized node shape; independent lifecycle). issue 302.
  // A `tool` is always linked with a null node.
  state: {
    enabled: boolean, consumed: boolean, locked: boolean,
    uses: { max: number|null, used: number },
    cooldown: { seconds: number|null, lastUsedWorldTime: number|null }
  },
  activation: { trigger: "regionEnter", audience: "players" | "all" }
}
```

Built/read via `src/canvas/regions/interactableRegionFlags.js`; the class + CONFIG registration live in `src/canvas/regions/FabricateInteractableRegionBehavior.js`.

Requirements:

1. `interactableType`, `sourceUuid`, and `systemId` are **required** (`blank:false`) but now carry **`initial`s** — `interactableType: "tool"`, `sourceUuid: "Fabricate.unconfigured.tool"`, `systemId: "unconfigured"` (the unconfigured sentinels) — so the DataModel always instantiates **valid** even when the native "+ Add Behavior" path supplies an empty `system` (no `DataModelValidationError`).
A behaviour still carrying the sentinels (or missing the type-appropriate `toolId`/`taskId`) is **UNCONFIGURED** (`isUnconfiguredInteractable`, the single authority) and is **inert until configured** (concealed from players, never grants activation; see requirement 5). `toolId`/`taskId` and `environmentId` are scoped by `interactableType`.
A **Tool** interactable opens the **Crafting** tab and injects a session-scoped `activeCanvasTool` (virtual-present) on activation (the Crafting tab is currently a placeholder, so the active-tool chip is the visible effect).
A **gathering-task** interactable opens the gathering app scoped to that environment + task, **auto-selecting both**.
Its resource-node link is gated by `taskNodeLink`: by default (`linked`) it reads/decrements the **environment's `nodeRuntime[taskId]`** exactly like opening gathering directly (depletion and respawn follow the gathering task; the `node` field is null); when `taskNodeLink === "unlinked"` (issue 302) it reads/decrements its OWN independent pool stored in `node` (independent lifecycle — capacity, current, depletion timing, respawn policy).
The read normalizes through `normalizeNodeConfig`; a link that claims `unlinked` but whose `node` does not normalize **downgrades** to `linked`.
Only a `gatheringTask` may carry an independent node.
2. Spawning is **GM-only**.
3. Deleting the linked visual does NOT destroy the interactable; recovery is governed by `linkedVisual.missingPolicy`. **Region-only** (`mode: "none"`) is supported — the interactable works with no visible marker.
4. **Visibility is split from eligibility (Lock vs Disable).** A **DISABLED** (`state.enabled === false`) OR explicitly **HIDDEN** (`presentation.hidden === true`) interactable is **concealed from players**: the on-enter prompt does NOT fire (pure rule `shouldPromptOnEnter`) and the linked Tile marker is hidden from players (`tile.hidden = true`, GM-only; pure rule `resolveMarkerHidden`).
A **LOCKED** (`state.locked === true`) interactable is **visible**: the marker stays shown and the prompt fires, but pressing Interact is **denied** with `FABRICATE.Canvas.Interactable.Denied.Locked` ("This is locked."). `evaluateActivationEligibility` still gates the actual activation (precedence DISABLED → LOCKED → CONSUMED → USES_EXHAUSTED → COOLDOWN, denied at Interact time with the specific reason).
These pure rules live in `src/canvas/regions/interactableRegionActivation.js`.
5. **Creation MAY be sourceless; the result is born UNCONFIGURED + inert (issue 342).** A `fabricate.interactable` behaviour MAY be created **without a resolvable source** — e.g. via Foundry's native Region → Behaviors "+ Add Behavior → Fabricate Interactable".
The three identity fields carry **`initial`s** (`interactableType: "tool"`, and the `sourceUuid` / `systemId` **unconfigured sentinels** `"Fabricate.unconfigured.tool"` / `"unconfigured"`), so the DataModel always instantiates **valid** (no `DataModelValidationError`, no cascading sheet crash).
The native add is therefore **allowed through** (this reverses #334's cancellation): the `preCreateRegionBehavior` edge defensively stamps the sentinel onto any empty identity field and shows the GM an **info** notice pointing at the Interactable config panel.
Such a behaviour is **UNCONFIGURED** (`isUnconfiguredInteractable`: sentinel/empty `sourceUuid` or `systemId`, or a missing type-appropriate id) and is **concealed/inert** — the on-enter prompt does NOT fire (`shouldPromptOnEnter` ⇒ `isConcealed`), its marker is hidden from players (`resolveMarkerHidden`), and activation is **denied, never thrown** (`validateActivationRequest` returns `UNCONFIGURED` → `FABRICATE.Canvas.Interactable.Denied.Unconfigured`).
A GM configures its identity (type → crafting system → tool/task → environment) from the rich config panel via the pure `planConfigureSource`, which writes the canonical `sourceUuid` (`buildInteractableSourceUuid`) through the existing GM-routed `updateBehavior` seam and never persists a partial identity; once configured it activates exactly like a drag/drop-placed interactable.
A freshly-created interactable behaviour **never inherits another interactable's linked visual**: an inherited `linkedVisual.uuid` (Foundry region-duplication) is neutralised at creation so two interactables never share one marker (the #334 neutralisation is retained).
The pure decisions live in `src/canvas/regions/interactableCreationGuard.js` / `interactableRegionFlags.js` / `interactableConfigActions.js`; the `preCreateRegionBehavior` Foundry edge in `src/main.js` is a thin, no-throw adapter that allows creation, stamps the sentinel, and notifies the GM.
Fabricate's own drag/drop placement paths are unchanged — they pre-build a complete `system` and never go through the unconfigured path.

### Linked Visual reverse flags (holds no state; reflects env depletion + concealment)

The linked visual (Tile / Drawing / Token) carries only a reverse pointer back at its owning Region + Behaviour; it holds NO authoritative interactable state of its own (no node pool, no eligibility):

```js
visual.flags.fabricate = {
  isInteractableVisual: true,
  linkedRegionUuid: string,
  linkedBehaviorId: string,
  // Stashed on the FIRST env-node depletion image swap so the available state can
  // be restored to the GM's actual marker texture on recharge (Tile markers only).
  markerAvailableImg?: string
}
```

Built/read via `buildLinkedVisualFlags` / `readLinkedVisualRef` in `src/canvas/regions/interactableRegionFlags.js`; created/relinked/recreated via `src/canvas/linkedVisuals/linkedInteractableVisual.js`.
Marker reflection (image swap + concealment) is reconciled by `src/canvas/regions/interactableMarkerDepletion.js`.

Requirements:

1. The default marker is a **Tile**; a **Drawing** (labelled zone) and an **existing GM-placed Token** are also supported.
The reverse flag makes a Tile/Token HUD "Configure Fabricate Interactable" entry resolve.
2. The linked visual **never OWNS interactable state** — the authoritative node state lives on the behaviour (`system.node`) or the environment, never on the marker.
It nevertheless **reflects two GM-controlled facts** about its owning behaviour (SHIPPED):
   - **Node depletion image swap (Tile markers only).** When the active node for a gathering task is depleted (`current <= 0`) AND the task/node configures a `depletedBehavior.swapImage`, the linked Tile marker swaps its texture to that image; when the node recharges (respawns above `0`) it flips back to the available image.
The available image is stashed at `flags.fabricate.markerAvailableImg` on the first swap and restored on recharge.
The depleted state is read from the **SHARED** `environment.nodeRuntime[taskId]` for a task-linked interactable, or from the behaviour's OWN `system.node.current` (+ `system.node.depletedBehavior.swapImage`) for an unlinked one (issue 302).
The decision (`resolveMarkerImage`) is pure; the sync (`syncInteractableMarkers`) is **active-GM-gated, no-throw, and idempotent**, reacting to the `gatheringEnvironments` setting change (gather decrement + world-time respawn) and `canvasReady`.
Every other client sees the change through normal Foundry document sync.
   - **Concealment (all interactables).** When the interactable is DISABLED (`state.enabled === false`) OR explicitly HIDDEN (`presentation.hidden === true`), the linked Tile marker is hidden from players (`tile.hidden = true`, GM-only), reconciled in the same active-GM pass (`resolveMarkerHidden`).
A LOCKED interactable's marker stays visible.
3. A missing linked visual resolves cleanly to null — the interactable still functions (the central advantage of the region-first model).

### Gathering-Task Node State — linked to the task by default, optionally unlinked/independent (issue 302)

A gathering-task interactable is either **linked** to the gathering task or **unlinked** (independent), selected by the `taskNodeLink` discriminator on the behaviour `system` — much like an FVTT token↔actor link.
By default (`linked`) it is a **pure `(environment, task)` shortcut**: node counts, depletion, and respawn follow the gathering task, owned entirely by the environment's `nodeRuntime[taskId]` (see `gathering-and-harvesting` → Gathering Resource Nodes) and `system.node` is null.
When `taskNodeLink === "unlinked"` the behaviour owns its OWN independent node pool stored verbatim in `system.node` — an independent lifecycle (capacity, current count, depletion timing, respawn policy, including the non-regenerating mode).
The active node's depleted state is reflected onto the linked Tile marker as an image swap (requirement 4 below).

Requirements:

1. **The task-node link is `linked` by default and may be `unlinked`.** A task-linked interactable (`taskNodeLink: "linked"`, `node: null`) opens the gathering app scoped to its `environmentId` + `taskId` (auto-selecting both) and reads/decrements the SAME `environment.nodeRuntime[taskId]` as opening gathering directly — depletion and respawn follow the task, and it does not alter environment node availability beyond a normal gathering attempt.
An unlinked node (`taskNodeLink: "unlinked"`) reads/decrements its OWN `system.node` pool: depleting it never touches the environment node, and vice-versa.
The link is resolved by `GatheringRichStateService._resolveNodeSource`, which returns the environment branch whenever there is no interactable ref, the behaviour is task-linked, or the behaviour/node cannot be resolved.
Only a `gatheringTask` may carry an independent node; a link claiming `unlinked` whose `node` does not normalize **downgrades** to `linked`.
The link is switchable post-placement and non-destructive — re-linking clears `system.node`, and re-seeding an independent pool reuses any node still carried on the behaviour.
2. Tool requirements resolve from `task.toolIds` against the system-owned Tools library (`system.tools`) at attempt time (so library edits to a Tool propagate to placed interactables).
3. **Independent-node lifecycle + world-time respawn.** An unlinked node persists its `current`/respawn timers on `system.node` through the active-GM behaviour-update edge (players cannot write a behaviour they do not own).
On each world-time advance the primary GM scans scene region behaviours for unlinked-node gathering tasks and advances each `overTime` pool through the same calendar-aware respawn arithmetic the environment pass uses (`nonRegenerating`/`manual` never gain), writing the changed `system.node` back.
The timed/waiting-run maturity decrement lands on the SAME pool the attempt gated against: the **environment** node for a task-linked interactable, or the independent pool re-resolved from the run's persisted `interactableRef` (with an environment-branch fallback if the behaviour is gone).
4. **Node-driven marker image swap (SHIPPED).** The `depletedBehavior.swapImage` (task-level when linked, or `system.node.depletedBehavior.swapImage` when unlinked) drives the linked **Tile** marker: when the active node is depleted (`current <= 0`) the Tile marker swaps to `swapImage`; on recharge it flips back (available image stashed/restored via `flags.fabricate.markerAvailableImg`).
This is reconciled by an idempotent, active-GM, no-throw sync (`syncInteractableMarkers` in `interactableMarkerDepletion.js`) reacting to the `gatheringEnvironments` setting change and `canvasReady`.
There is no migration — a behaviour with no `taskNodeLink` reads as linked with a null node, identical to a task-linked interactable.

### Session-Scoped Active Canvas Tool (`activeCanvasTool`)

Activating a Tool interactable injects a **virtual-present** tool into the crafting/gathering availability checks instead of minting a synthetic `Item`.

Requirements:

1. The virtual-present payload is system-scoped: `presentTools = { systemId, componentIds }`.
A virtual-present match fires only when the evaluated task/recipe's own crafting system id equals the active tool's `systemId`, so a station tool from system A cannot satisfy a system-B prerequisite sharing the same `componentId` string.
2. A virtual-present tool is treated as satisfied **without the actor owning the item** and is **excluded from breakage and usage** (it is the station's tool, not the actor's).
3. `activeCanvasTool` is session-scoped on the `SvelteFabricateApp` instance (set in `show(tab, { activeCanvasTool })`, cleared on close), system-scoped per the rule above, and never written to any persisted run record.
With no active tool the payload is null (inert).
4. UI placement: when an active tool is set it is surfaced as a status chip in the tab header bar's right-side context cluster (alongside gathering's weather/time/region), implemented in `ActorSelectTopBar`.
The Crafting and planned Alchemy tabs should place the chip in their own header right bar once those headers exist.

### Drop-Time Environment Resolution Precedence

When a Gathering-Task Interactable is dropped, its `environmentId` is resolved by this precedence chain (pure decision in `src/canvas/environmentResolution.js`):

1. **Tagged Scene Region** — the drop point falls inside a Foundry Scene Region flagged `flags.fabricate.environmentId`.
One unambiguous existing hit auto-resolves (a `ui.notifications.info` names the resolved environment); multiple hits are ambiguous and fall through to the dialog.
2. **Task `defaultEnvironmentId`** — the task's new optional placement-hint field (a single existing id; a stale id falls through).
3. **GM dialog** — neither auto-source resolved (or the region was ambiguous).
Cancel **aborts the spawn** (no region is created).

Holding **Alt** during the drop always **forces the GM dialog**, bypassing tiers 1 and 2.

Note the two distinct uses of an environment id at different lifecycle stages: a **Scene Region `flags.fabricate.environmentId`** is a *drop-time placement* hint used only to resolve which environment a dropped interactable belongs to, whereas `environment.sceneUuid` is the *runtime gathering gate* that ties a composed environment to a scene during attempt validation.
They are unrelated mechanisms.

## Macro Contracts

### Crafting Check Macro Contract (Removed in 1.8.0)

The crafting-check macro / built-in adapter path has been removed.
A crafting check is now usable IFF its resolution mode has an authored roll formula (`craftingCheck.simple|routed|progressive.rollFormula`); the engine rolls that formula and evaluates the outcome itself.
There is no macro-return contract — when a required check (progressive, or `routedByCheck` mode) has no authored roll formula the attempt fails loudly with zero mutation (the required-check guard), and an optional check (simple, alchemy, or `routedByIngredients`) with no formula is a no-op.
The `routedByIngredients` optional pass/fail check reads `craftingCheck.simple.rollFormula` (the same shared slot as `simple`/`alchemy`), not `craftingCheck.routed`.

`routedByCheck` mode keys on the engine-evaluated outcome tier NAME produced by rolling `craftingCheck.routed.rollFormula`.
The same outcome-name normalization the provider routing applies (engine-evaluated, not a macro return):

1. `outcome` is interpreted using trim-normalized, case-insensitive comparison.
2. Preferred reserved keyword:
   - `fail` (failed craft outcome)
3. Accepted failure aliases (same normalization rules):
   - fail-family: `fail`, `failed`, `failure`, `f`
   - miss-family compatibility aliases: `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`
   - hazard-family compatibility aliases: `hazard`, `danger`, `complication`, `trap`, `oops`
4. If the normalized `outcome` matches a reserved failure keyword, it does not route to a result group and is treated as failure.
5. Otherwise, `outcome` must equal a `ResultGroup.name` for the active recipe under the same normalization rules (explicit `checkOutcomeIds` tier assignment wins first; see `004-resolution-modes.md`).
6. If a non-reserved `outcome` does not match any `ResultGroup.name`, classify as crafting-system misconfiguration error.

### Property Macro Contract

Input context must include:

- `recipe`
- `craftingSystem`
- `craftingActor`
- `ingredientPool`
- `resolvedIngredients`
- `resolvedTools`
- `resolvedEssences`
- `essenceSources`
- `checkResult`
- `result`
- `step`

Return shape:

```js
{ [propertyPath: string]: any }
```

Returned values are merged into created item data before document creation.

### Success Macro Contract (Removed in 1.8.0)

The step-level success macro has been removed.
Crafting outcomes are resolved entirely by the engine (check formula, resolution mode, and consumption policy); there is no GM-authored success-side macro hook.

### Failure Macro Contract (Removed in 1.8.0)

The step-level failure macro has been removed.
A step failure is handled entirely by the engine's failure-consumption policy; there is no GM-authored failure-side macro hook.

## Behavioural Ownership

- Resolution mode semantics and mode validation: `004-resolution-modes.md`
- Recipe and step execution semantics: `005-recipes-and-steps.md`
- Recipe visibility and learning semantics: `006-recipe-visibility.md`
- Destructive changes and clean-up semantics: `007-destructive-changes-and-migrations.md`

## Canonical-Write and Legacy-Read Compatibility Policy

### Policy Statement

- Canonical field names are the authoritative contract for all new model and migration design.
- Read paths (constructors, normalization) MAY accept legacy aliases for backward compatibility during migration windows.
- Legacy aliases in write output (`toJSON`) are transitional and scheduled for removal once migration coverage is confirmed.
- Runtime writers MAY temporarily dual-emit documented transitional aliases during compatibility windows.
- No new legacy aliases may be introduced unless explicitly added to this policy section with a removal plan.

### Canonical Fields

The following canonical field names must be used in all new writes:

| Model | Canonical Field | Description |
|-------|----------------|-------------|
| Tool | `componentId` | Managed item reference |
| Ingredient | `match.type = "component"` | Match type for component-based ingredients |
| Ingredient | `match.componentId` | Component reference inside match object |
| Result | `componentId` | Produced item component reference |
| CraftingSystem | `components` | Array of managed item entries |
| CraftingSystem | `recipeItemDefinitions` | Array of managed recipe-item entries |
| IngredientSet | `ingredientGroups` | Array of ingredient group objects |
| Recipe | `resultGroups` | Array of result group objects |
| Recipe | `recipeItemId` | Recipe item definition reference |
| EssenceDefinition | `sourceComponentId` | Managed component source reference |
| EssenceDefinition | `sourceItemUuid` | Resolved or legacy template item evidence for effect transfer |
| Component | `sourceItemUuid` | Template item reference |
| RecipeItemDefinition | `sourceItemUuid` | Template item reference |
| CraftingSystem | `itemTags` | Array of tag strings |
| Item flag | `toolUsage.timesUsed` | Tool usage tracking (legacy `catalystItemUsage.timesUsed` read as fallback) |
| Item flag | `recipeItemUsage.timesUsed` | Recipe-item craft-charge tracking (`knowledge.item` cap) |
| Item flag | `recipeItemLearning.learnedCount` | Recipe-item learn-cap tracking (`knowledge.learn` cap), per document instance |

### Legacy Read Aliases

The following legacy aliases are accepted by constructors and normalization functions and are normalized to their canonical counterparts on read:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Legacy Alias | Canonical Form | Context | Normalization |
|-------------|---------------|---------|---------------|
| `systemItemId` | `componentId` | Tool, Ingredient, Result | Constructor reads `systemItemId` as fallback; normalized to `componentId` |
| `match.type = "systemItem"` | `match.type = "component"` | Ingredient.match | Constructor and migration rewrite type to `"component"` |
| `match.systemItemId` | `match.componentId` | Ingredient.match | Constructor reads as fallback for `componentId` |
| `managedItems` | `components` | CraftingSystem | Normalization and migration rename to `components` |
| `ingredients` (flat array) | `ingredientGroups` | IngredientSet | Constructor wraps each ingredient into a single-option group |
| `results` (flat array) | `resultGroups` | Recipe | Constructor wraps into a single result group |
| `associatedSystemItemId` | `sourceComponentId` | EssenceDefinition | Normalization reads as fallback for the managed source component reference |
| `associatedSystemItemId` | `sourceItemUuid` | Component | Constructor reads as fallback for `sourceItemUuid` |
| `tags` | `itemTags` | CraftingSystem | Normalization reads `tags` as fallback for `itemTags` |
| `catalystItemUsage` / `catalystUses` (bare number) | `toolUsage.timesUsed` | Item flag | Runtime reads `toolUsage` first; when absent, falls back to `catalystItemUsage` (and the bare-number `catalystUses`, coerced to `{ timesUsed }`) so migrated `limitedUses` tools preserve in-flight usage. Legacy flag is never back-filled or cleared. |
| `sourceUuid` | `sourceItemUuid` | Component | Normalization reads as fallback |
| `linkedRecipeItemUuid` | `recipeItemId` | Recipe | Migration/import paths synthesize or resolve a `RecipeItemDefinition` by `sourceItemUuid` within the recipe's crafting system |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Transitional Write Aliases (Scheduled for Removal)

The following aliases are currently emitted in `toJSON()` / normalization output alongside their canonical counterparts.
These are transitional and will be removed in a future version once all dependent UI code paths have been updated:

- `systemItemId` (emitted alongside `componentId` in Tool, Ingredient, Result)
- `ingredients` (emitted alongside `ingredientGroups` in IngredientSet)
- `results` (emitted alongside `resultGroups` in Recipe)
- `associatedSystemItemId` (emitted alongside `sourceComponentId` in EssenceDefinition and alongside `sourceItemUuid` in Component)
- `tags` (emitted alongside `itemTags` in CraftingSystem normalization)
- `sourceUuid` (emitted alongside `sourceItemUuid` in Component normalization)
- UI convenience aliases (`enableTags`, `enableEssences`, `enableCategories`, `enableMultiStepRecipes`, `advancedOptionsEnabled`)

These transitional aliases exist solely for UI code paths that have not yet been updated.
They do not represent the canonical data contract and must not be relied upon by new code.

### Retired Aliases (Fully Removed)

The following aliases **must not be emitted by new code** and must be stripped on import/export for backward compatibility with data written by older versions:

| Retired Alias | Removed In | Notes |
|--------------|-----------|-------|
| `enableTiers` | #105 | Tiered crafting mode was removed; this field was hardcoded to `false` and never functionally active. |
| `tiers` | #105 | Tiered crafting mode was removed; this field was hardcoded to `[]` and never functionally active. |

### Testing Requirements

Tests must include:

- Backward-compatible read tests: constructing models from legacy-only data (e.g., `systemItemId` without `componentId`) must produce correct canonical state.
- Canonical-write assertions: `toJSON()` output must include all canonical fields with correct values.
- Migration idempotency: running the `migrateComponentId` migration on already-migrated data must produce identical output.
- Round-trip integrity: `Model.fromJSON(model.toJSON())` must preserve all canonical fields.

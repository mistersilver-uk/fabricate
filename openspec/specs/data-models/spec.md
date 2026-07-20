# Data Models

## Purpose

Define Fabricate data models, persistence contracts, and macro contracts.
All stored entities are JSON-serializable and safe to persist via `game.settings` and flags.
All settings keys in this specification use the literal `fabricate.*` namespace.

Behavioural semantics are defined in:

- `resolution-modes/spec.md`
- `recipes-and-steps/spec.md`
- `recipe-visibility/spec.md`
- `destructive-changes-and-migrations/spec.md`
- `gathering-and-harvesting/spec.md`

## CraftingSystem

```js
CraftingSystem = {
  id: string,
  name: string,
  description?: string,

  // System-level invariant for all recipes in this crafting system.
  // Mode semantics and validation are defined in resolution-modes/spec.md.
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
    craftingChecks: boolean, // default false
    outcomeRouting: boolean, // default false
    effectTransfer: boolean,
    multiStepRecipes: boolean,
    gathering: boolean, // default false
    salvage: boolean, // default true (absent key defaults on for backward compatibility; an explicit false is honoured)
    chatOutput: boolean, // default true; gates the crafting, salvage, and gathering result chat cards
    itemPiles: boolean, // default false; the Item Piles integration toggle referenced by integrations/spec.md
  },

  categories: string[], // custom recipe categories only; reserved "general" is implicit
  componentCategories?: string[], // default []; custom COMPONENT categories only; reserved "general" is implicit; independent of `categories`
  categoryIcons?: Record<string, string>, // default {}; optional per-recipe-category Font Awesome icon, keyed by lowercased category name (may include "general")
  componentCategoryIcons?: Record<string, string>, // default {}; the same, for component categories
  itemTags: string[],

  // Emitted unconditionally by normalization (empty array when features.essences is off).
  essenceDefinitions: EssenceDefinition[],

  components: Component[],
  recipeItemDefinitions: RecipeItemDefinition[],

  // System-owned character-prerequisite library (issue 544). Reusable pass/fail
  // conditions the GM authors in System Settings and attaches, by id, to a book/
  // scroll's caps.learn to gate WHO may learn its recipes against the acting
  // actor's roll data. Normalized wholesale (settings replace, not deep-merge) by
  // normalizeCharacterPrerequisiteList, so a removed entry does not resurrect.
  // Shape defined under ## CharacterPrerequisite below.
  characterPrerequisites: CharacterPrerequisite[], // default []

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

    // Legacy discriminator with a SINGLE valid value, `passFail`. The former
    // `tiered` / `namedOutcomes` values referenced the removed tiered concept and were
    // dead — normalization collapses any legacy value to `passFail`. No runtime reads
    // this field; crafting resolution is driven by the recipe/step resolution mode.
    mode: "passFail",              // default "passFail"

    consumption: {
      consumeIngredientsOnFail: boolean, // default true
      breakToolsOnFail: boolean,         // default false; governs Tool usage/breakage on a failed craft (see note below)
    },

    // Legacy free outcome-name list; normalized to trimmed, lowercased, unique
    // strings, defaulting to ["fail", "pass"] when absent. No runtime reads it
    // (the removed macro/provider check source was its only consumer); routed
    // outcome tiers live on routed.relativeOutcomes / routed.fixedOutcomes.
    outcomes?: string[],           // default ["fail", "pass"]

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

  // Canonical, flat recipe-visibility strategy (issue 511, PR-B). One enum that
  // supersedes the compound recipeVisibility.listMode + knowledge.mode pair and is
  // the single knob gating the whole Crafting authoring surface and the player book
  // affordances. Seeded from the legacy recipeVisibility block by the 1.12.0
  // migration; when absent the runtime derives the same fallback. Switching it is
  // non-destructive (migrates no recipes).
  //   global     — every recipe visible to all players
  //   restricted — per-recipe/character grants (the legacy "player" list mode)
  //   item       — craft only while holding the linked book; use cap applies, no Learn
  //   knowledge  — learn the recipe from the book; learn cap applies
  visibilityMode: "global" | "restricted" | "item" | "knowledge", // default "knowledge"

  // LEGACY recipe-visibility strategy, superseded by visibilityMode above. It is no
  // longer UI-authored (the crafting Settings page writes visibilityMode); it is
  // retained on read as the derivation source when visibilityMode is absent, and its
  // residual knowledge.learn.dragDropEnabled is still normalized.
  recipeVisibility: {
    listMode: "global" | "player" | "knowledge",  // default "global"

    // Recipe visibility STRATEGY only. Required only when listMode === "knowledge";
    // ignored in "global" and "player" modes. The recipe-item use/learn caps are no
    // longer here — each recipe item owns them (RecipeItemDefinition.caps); see below.
    knowledge?: {
      mode: "item" | "learned" | "itemOrLearned",

      learn?: {
        dragDropEnabled: boolean, // default true; controls actor-drop auto-learn behaviour
      },
    },
  },

  // Present only when resolutionMode === "alchemy".
  alchemy?: {
    checkMode: "none" | "simple" | "tiered", // default "none" (issue 554)
    learnOnCraft: boolean, // default false
    consumeOnFail: boolean, // default true
    showAttemptHistoryToPlayers: boolean, // default true
  },

  requirements: {
    time: {
      enabled: boolean, // default true
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
6. `categories`, `componentCategories`, and `itemTags` should be normalized to unique, trimmed strings.
6a.
Every crafting system has a reserved effective component category named `general` (`General` in UI copy).
It is always enabled, cannot be removed, and must not be persisted in `CraftingSystem.componentCategories`.
6b.
`CraftingSystem.componentCategories` stores only additional user-defined component categories.
It is a sibling of, and independent from, `CraftingSystem.categories` (recipe categories): the two vocabularies must not be merged, aliased, or cross-populated.
A component category is never offered as a recipe category and vice versa.
6c.
`CraftingSystem.categories` and `CraftingSystem.componentCategories` may each carry an optional per-category icon in a parallel name-keyed map (`categoryIcons` / `componentCategoryIcons`), keyed by the lowercased category name so the string vocabulary arrays stay backwards-compatible.
The reserved `general` bucket may carry a default icon under the `general` key but is still never persisted in the string arrays.
Each icon map is normalized to the categories that currently exist (plus `general`), so an icon for a category that no longer exists is dropped; the settings write replaces the whole map.
6d.
Deleting a referenced recipe or component category reassigns the affected records' `category` to `general` rather than leaving the value lingering.
Deleting a referenced item tag strips it from the `tags` of every component carrying it.
7. `resolutionMode` must be one of `"simple"`, `"routedByIngredients"`, `"routedByCheck"`, `"progressive"`, or `"alchemy"`.
8. If `resolutionMode === "alchemy"`:
   - `features.multiStepRecipes` must be `false`.
   - `alchemy` config must be present; missing values use defaults (`checkMode: "none"`, `learnOnCraft: false`, `consumeOnFail: true`, `showAttemptHistoryToPlayers: true`).
   - `alchemy.checkMode` selects the check slot: `none` → no check; `simple` → the mandatory `craftingCheck.simple` pass/fail check; `tiered` → the mandatory `craftingCheck.routed` check.
An invalid value normalizes to `none`.
9. If `features.gathering` is false, gathering environments and gathering tasks for that system are inert and hidden from normal UI flows.
9a.
The per-system gathering economy block (`gatheringConfig.systems[systemId].economy`, defined in `gathering-and-harvesting`) carries a normalized `resolutionMode: "d100" | "progressive" | "routed"` (default `"d100"`).
An absent, invalid, or wrong-shape value (including a stray `"simple"`) normalizes to `"d100"` on both the read and persist paths.
It is GM configuration and is not part of the player gathering listing payload.
10. `recipeItemDefinitions` are distinct from `components`; a recipe item definition must not be treated as a crafting ingredient/result component unless it is also intentionally imported as a component.
11. `RecipeItemDefinition.id` values must be unique within a crafting system.
12. `RecipeItemDefinition.originItemUuid` values should be unique within a crafting system so one system recipe item can be reused across multiple recipes.
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
Fabricate-managed **Gathering Parties** are NOT part of the crafting system — they are world-level records (world setting `fabricate.gatheringParties`; see the Gathering Party requirements in `gathering-and-harvesting`) and are excluded from system import/export.
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
28. **`CraftingSystem.id` is a durable-flag-key segment.** A system's `id` must match `/^[A-Za-z0-9_-]+$/` (letters, digits, `_`, or `-`; no dots or spaces), because it is used as a per-Item durable-flag map key segment in `flags.fabricate.roles[systemId].componentId`.
A dot would be nested by `expandObject` on write and silently missed by the `roles[systemId]` reader, degrading matching to the raw-reference path.
`CraftingSystemManager` therefore rejects an unsafe id LOUDLY at the creation/import entry point and NEVER rewrites an id (recipes, tools, and gathering config reference the system by id); `foundry.utils.randomID()` always satisfies the pattern.
A pre-existing world already carrying an unsafe (e.g. dotted) id is not thrown at match time: its components resolve only by raw source references, the per-system `roles` identity tier is inert for it, and it warns once — such a system should be recreated or re-imported with a valid id.

29. **`craftingCheck.mode` has a single valid value, `passFail`.** It is a legacy discriminator that predates the resolution-mode model.
Normalization emits `mode: "passFail"` unconditionally, defaulting to `passFail` and collapsing any other value — including the removed `tiered` and `namedOutcomes` tokens — to `passFail`.
No runtime consumes `craftingCheck.mode`: crafting resolution is driven entirely by the recipe/step `resolutionMode` and the matching `craftingCheck.simple` / `routed` / `progressive` sub-object (see requirement 26 and `resolution-modes`), not by this field.
The former `tiered` / `namedOutcomes` branch — which defaulted `outcomes` to `["low", "high"]` — was dead code and has been removed.
This is distinct from `CraftingSystem.alchemy.checkMode` (`none` | `simple` | `tiered`, requirement 8), whose `tiered` value IS a live check-slot selector and is unaffected.
`craftingCheck.outcomes` is a legacy free-text outcome-name list normalized to trimmed, lowercased, unique strings and defaulting to `["fail", "pass"]` when absent; it too has no runtime consumer (routed outcome tiers live on `routed.relativeOutcomes` / `routed.fixedOutcomes`).

30. **Built-in check contract — the authored roll formula IS the built-in check.** Fabricate's supported "built-in" check lets a GM author a plain dice expression (`craftingCheck.simple` / `routed` / `progressive.rollFormula`) that the engine rolls and evaluates natively, with no macro and no game-system adapter — the low-complexity path for GMs who do not need dnd5e/pf2e-specific stat integration (the "built-in check source" desired in the domain audit).
A check is **usable** IFF its resolution mode carries an authored `rollFormula` (see the *Crafting Check Macro Contract* section); `enabled` is only the optional-check on/off toggle and is never a proxy for "the check works".
The historical `checkSource` discriminator (with its `"builtIn"` value) and the `builtIn: { ability, skill, dc, advantage }` game-system adapter sub-object are **NOT** part of the model: that adapter, together with the macro-as-check-source fields (`macroUuid`, `successMacroUuid`, `failureMacroUuid`), was removed in the 1.8.0 migration (`migrateRemoveLegacyCheckSources`).
Normalization never emits `checkSource` or `builtIn`, and any persisted values are stripped on migration.
The distinct `craftingCheck.simple.macroUuid` (the optional dynamic-DC macro) is a separate, retained feature and is not a check source.

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
`abbreviation` is **optional** and defaults to the empty string when unauthored.
It is **never** defaulted to, or persisted as, the unit `id`.
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
The `"macro"` requirement is unchanged by the abbreviation default: an empty `abbreviation` (the new default for an unauthored unit) still produces the missing-abbreviation validation error under `"macro"`.
7. When a stored `abbreviation` strictly equals the unit `id` **and** the id has the generated-id shape (`/^[A-Za-z0-9]{10,}$/`, matching `foundry.utils.randomID()` or the crypto fallback), normalization treats the abbreviation as unauthored and resets it to the empty string (legacy self-heal).
Short or non-alphanumeric semantic ids are **deliberately left un-healed** even when `abbreviation === id`: they fail the generated-id shape guard, so a hand-authored abbreviation that intentionally equals a semantic id (e.g. the seeded preset coin keys `cp`/`sp`/`ep`/`gp`/`pp`, the only such ids in practice) is preserved.
The self-heal only ever fires on the accidental, machine-generated bake.

### Recipe Visibility Requirements

0. `visibilityMode` is the **canonical** recipe-visibility strategy and must be one of `"global"`, `"restricted"`, `"item"`, or `"knowledge"`; unknown, missing, or invalid values normalize to `"knowledge"`.
It supersedes the legacy `recipeVisibility.listMode` + `knowledge.mode` pair (which requirements 1–8 below describe) and gates the whole Crafting authoring surface (nav group, Settings effect panel, Books & Scrolls, limited-use, learning limits) plus the player book affordances.
The `1.12.0` migration seeds it from the legacy block (`global`→`global`, `player`→`restricted`, `knowledge`+`item`→`item`, `knowledge`+`learned`/`itemOrLearned`→`knowledge`, `teaser`→`global` with `teaserConfig` preserved, absent/invalid→`knowledge`).
A stored value is normalized on read to one of the four (unknown/absent→`knowledge`); the visibility runtime instead derives from the legacy pair only for a raw/un-normalized system that carries no `visibilityMode` (`player`→`restricted`, `knowledge`+`item`→`item`, `knowledge`+learning→`knowledge`, else `global`).
Switching `visibilityMode` migrates no recipes and needs no confirmation.
The legacy `recipeVisibility` block is retained on read as the derivation source and for its residual `knowledge.learn.dragDropEnabled`.
1. `listMode` (legacy) must be one of `"global"`, `"player"`, or `"knowledge"`.
Invalid or missing values default to `"global"`.
2. The `knowledge` sub-object is only meaningful when `listMode === "knowledge"`.
3. When `listMode === "global"`, all enabled recipes are visible to all users without restriction or knowledge filtering.
4. `knowledge.learn.dragDropEnabled` controls automatic learning from actor item drops when knowledge learning is enabled; default is `true`.
5. If `knowledge.learn.dragDropEnabled` is `false`, automatic actor-drop learning is disabled and manual learn UI affordances must be used.
6. The per-recipe-item use and learn caps are NOT on `recipeVisibility.knowledge`.
They live on each recipe item definition (`RecipeItemDefinition.caps`, see that model), so two recipe items in one system may carry different caps.
`caps.learn.limitRecipes` enables that item's learn cap; `caps.learn.maxRecipes` is normalized to a finite integer `> 0` and is retained only when `limitRecipes === true`, mirroring how `caps.item.maxUses` is retained only when `caps.item.limitUses === true`.
A `limitRecipes === true` item with a missing or invalid `maxRecipes` is normalized so that `learnsAllowed` (and its legacy `maxRecipes` mirror) seeds to `1` — the value the UI stepper displays — because a limit of "0/undefined" is meaningless and would wrongly read as uncapped downstream, hiding the learn-all CTA (issue 544).
The observable behaviour for stored, normalized systems is a 1-learn budget; the surviving runtime uncapped fallback (`RecipeVisibilityService._getLearnCapForRecipe`) is a defensive dead path reachable only from raw, un-normalized test fixtures.
7. `caps.learn.destroyWhenSpent` removes the recipe item once its learn budget is spent; default is `false`.
It is deliberately distinct from the item craft-charge flag `caps.item.destroyWhenExhausted` and must not be normalized to a shared name.
8. The `1.11.0` migration seeds every existing recipe item's `caps` from the system's old `knowledge.item` / `knowledge.learn` values and strips those fields from `recipeVisibility.knowledge`, so existing worlds keep their behaviour while new recipe items default uncapped.

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

  // Union of source references, mirroring Component (issue 555). Match on the union;
  // recipe items spawn no output, so there is no "spawn from" field. Existing
  // definitions carry only originItemUuid and are never recomputed.
  registeredItemUuid: string | null, // the registered live document uuid
  originItemUuid: string,            // the canonical compendium/source uuid (identity-of-record: the durable flag)
  aliasItemUuids: string[],          // default []; broken-canonical-source fallbacks

  // Canonical recipe↔book membership (issue 511, PR-B). Many-to-many: a recipe may
  // belong to several books, and a book may contain several recipes. This inverts the
  // former scalar recipe.recipeItemId reverse ref (removed by the 1.13.0 migration).
  // Authored on the Books & Scrolls item Contents tab.
  recipeIds: string[],               // default []

  // Per-recipe-item use/learn caps (issue 511). Each recipe item owns its own caps
  // rather than sharing one system-wide config, so a one-recipe scroll and a
  // three-recipe tome in the same system can differ. Absent caps normalize to
  // uncapped (the default for a new recipe item). The PR-B redesign renamed several
  // cap fields; the NEW names are canonical for new writes, and each legacy name is
  // kept persisted and in sync so an un-migrated raw cap still loads.
  caps: {
    item: {
      limitUses: boolean,            // default false; enables the craft-charge cap
      maxUses?: number,              // times the item grants crafting access
      whenSpent?: "destroyed" | "inert", // canonical; what happens when uses run out —
                                     // "destroyed" removes the item, "inert" keeps it but
                                     // stops granting craftability. Derives from / mirrors
                                     // the legacy destroyWhenExhausted boolean.
      destroyWhenExhausted?: boolean, // legacy mirror of whenSpent === "destroyed"
    },
    learn: {
      consumeOnLearn: boolean,       // default true; consume on drag-drop auto-learn
      limitLearning: boolean,        // canonical; enables the learn cap (legacy: limitRecipes)
      learnsAllowed?: number,        // canonical; finite integer > 0 (legacy: maxRecipes)
      learnScope?: "perInstance" | "total", // canonical; "perInstance" (default) counts per
                                     // physical item document, "total" draws all actors from
                                     // one shared world pool keyed system::defId
                                     // (legacy mirror: learningMode "party" ⇔ "total")
      prerequisiteIds: string[],     // default []; recipeIds a reader must ALL already have learned
                                     // first (AND — "Required Knowledge"; prior-knowledge gate). Folds
                                     // a legacy single `prerequisite` string on normalize (issue 544).
                                     // Only enforced when limitLearning is true.
      characterPrerequisiteIds: string[], // default []; ids into CraftingSystem.characterPrerequisites
                                     // that a reader must ALL pass (AND) to learn this book's recipes,
                                     // evaluated against actor roll data (issue 544). A per-book
                                     // actor-stat gate, distinct from `prerequisiteIds` (prior knowledge).
                                     // Only enforced when limitLearning is true.
      destroyWhenSpent?: boolean,    // default false; destroy the item once its learn budget is spent
      // Legacy mirrors kept in sync with the canonical fields above:
      limitRecipes?: boolean,        // legacy mirror of limitLearning
      maxRecipes?: number,           // legacy mirror of learnsAllowed
      learningMode?: "once" | "ntimes" | "party", // legacy mirror derived from learnScope/learnsAllowed
    },
  },
}
```

### Requirements

1. `originItemUuid` points to the canonical world or compendium item template used for recipe-item matching.
2. New recipe item definitions are created from dropped or selected Foundry items; manual UUID entry is not part of the canonical UI flow.
3. If the source template later becomes unresolved, the stored `originItemUuid` is retained and the definition becomes stale-but-readable.
A recipe item records the same union of source references a component does — `registeredItemUuid` (the registered live document), `originItemUuid` (the canonical compendium/source uuid), and `aliasItemUuids` (issue 555) — so a compendium-imported book resolves owned copies dragged from either the compendium item or the imported world item.
The durable `flags.fabricate.roles[systemId].recipeItemDefinitionId` on the source Item is the identity-of-record; `originItemUuid` is a best-effort source pointer, is never recomputed for an existing definition, and `registeredItemUuid` defaults to it when absent.
See **Recipe Item Identity → Registration Source Identity** for the clone-gate and stamping rules.
4. `recipeIds[]` is the **canonical** recipe↔book membership (issue 511, PR-B): it is many-to-many, so a book may contain several recipes and a recipe may belong to several books.
This is the canonical way to model shared formulas, books, schematics, or recipe scrolls.
The scalar reverse ref `recipe.recipeItemId` (and the legacy `recipe.linkedRecipeItemUuid` book alias) is removed by the `1.13.0` migration, which inverts it onto `recipeIds`; membership is authored book-side on the Contents tab, and the runtime falls back to the legacy reverse ref only for a fully un-migrated system (no book carries `recipeIds` yet).
5. `caps` holds this recipe item's own use and learn caps.
The use cap (`caps.item.limitUses` / `maxUses` / `whenSpent`) governs how many times holding the item grants crafting access; the learn cap (`caps.learn.limitLearning` / `learnsAllowed` / `learnScope` / `destroyWhenSpent`) governs how many of the item's linked recipes may be learned from it.
The PR-B redesign renamed the cap fields; the new names are canonical and each legacy name (`destroyWhenExhausted`, `limitRecipes`, `maxRecipes`, `learningMode`) is persisted and kept in sync so an un-migrated raw cap still loads.
`caps.learn.destroyWhenSpent` is deliberately distinct from `caps.item.whenSpent === "destroyed"` (`destroyWhenExhausted`) and must not be normalized to a shared name.
6. `caps.learn.learnScope` selects the learn-cap counter scope: `"perInstance"` (default) counts against each physical item document (`recipeItemLearning.learnedCount`), while `"total"` draws every actor's learns from one GM-authoritative shared world pool keyed `system::defId`.
6a. `caps.learn.prerequisiteIds` and `caps.learn.characterPrerequisiteIds` (issue 544) are each a deduped, trimmed, non-empty string list (default `[]`), normalized with the same shape in `CraftingSystemManager._normalizeRecipeItemCaps`.
`prerequisiteIds` (**Required Knowledge**) is a list of recipeIds the reader must ALL already have learned; it folds a legacy single `caps.learn.prerequisite` string on normalize (back-compat, no stored data to migrate) and the singular is no longer emitted.
`characterPrerequisiteIds` references into `CraftingSystem.characterPrerequisites[].id`: a per-book **character-prerequisite learning gate** where a reader must pass **ALL** referenced prerequisites (AND semantics) against the acting actor's roll data.
The two gates are distinct — `prerequisiteIds` gates on prior recipe knowledge, `characterPrerequisiteIds` gates on actor stats/flags — but both are only enforced when `caps.learn.limitLearning` is `true` (Limited learning off ⇒ learn freely, neither gate applies).
An id that no longer resolves is skipped at runtime (fail-open for character prerequisites), so deleting a prerequisite removes its gate rather than bricking the book.
7. The `1.11.0` migration seeds `caps` on every existing recipe item from the system's former `recipeVisibility.knowledge.item` / `.learn` values, then strips those fields from the system config.
Recipe items created after the migration default to uncapped.

## CharacterPrerequisite

### Purpose

Define one system-owned, reusable pass/fail condition (issue 544) evaluated against the acting actor's prepared roll data.
The GM authors a library of them on the System Settings page; a book/scroll references a subset by id from `RecipeItemDefinition.caps.learn.characterPrerequisiteIds` to gate who may learn its recipes (behaviour in `recipe-visibility`).

### Properties

```js
CharacterPrerequisite = {
  id: string,     // stable reference stored by caps.learn.characterPrerequisiteIds
  name: string,   // GM label; defaults to "Prerequisite"
  icon: string,   // Font Awesome glyph; defaults to "fa-solid fa-user-shield"
  path: string,   // dotted key into actor.getRollData(), stored WITHOUT a leading @ (e.g. "skills.cra.rank")
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "isTrue" | "isFalse" | "exists", // default "gte"
  value: * | null, // comparand; forced to null for the valueless operators (isTrue/isFalse/exists)
}
```

### Requirements

1. `characterPrerequisites` normalizes wholesale from the incoming array (`normalizeCharacterPrerequisiteList`); settings replace rather than deep-merge, so a removed entry does not resurrect.
An entry with no assignable `id` is dropped.
2. `op` is one of the nine word tokens above; an unknown or missing token normalizes to `"gte"`.
The three **valueless** operators — `isTrue`, `isFalse`, `exists` — force `value` to `null` and hide the editor's value field; the six numeric operators keep a comparand (an empty-string value normalizes to `null`).
3. `path` is stored WITHOUT a leading `@` (the `@` is a display/authoring affordance only); a leading `@` on input is stripped on normalization.
It is resolved at runtime as a dotted traversal of `actor.getRollData()`, which Foundry has already flattened (`skills.cra.rank` in pf2e, `skills.arc.value` in dnd5e).
4. Evaluation is pure and Foundry-free (`evaluatePrerequisite` / `evaluatePrerequisites`).
An unknown or missing `path` degrades to `0` (numeric operators) or `false` (boolean/existence operators) and logs a single `console.warn`; it never throws.
`evaluatePrerequisites` applies **AND** semantics and returns `{ passed, failures }`, where each failure carries a `prerequisitePreview` string (`@path op value`, or `@path op` for valueless) for player messaging.
5. `op` is a deliberate **word-token** vocabulary that parallels the symbolic `CheckBreakageCondition` operators (`==` / `<=` / `>=` / `<` / `>`, defined under **CraftingSystem**).
The two are the same comparison intent on different surfaces (a stat gate versus a dice-matching trigger) and are intentionally not unified.

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
    originItemUuid: string | null,
    category: string, // default "general"; single-valued grouping axis drawn from CraftingSystem.componentCategories
    tags: string[],
  essences: { [essenceId: string]: number },
  difficulty?: number, // only used in progressive mode

  salvage?: {
    enabled: boolean,              // default false
    // GM-authored Result Order Permission for progressive salvage (issue 651). An absent
    // key reads true, and the default is stated on BOTH _normalizeSalvage return paths.
    allowPlayerResultReorder: boolean, // default true
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
3. Each essence key must exist among the ids in `CraftingSystem.essenceDefinitions` when essences are enabled.
4. `salvage` is only valid when `CraftingSystem.features.salvage` is true.
5. When `salvage.enabled` is true, `salvage.resultGroups` must contain at least one result group, with a mode-conditioned upper bound.
In `simple` salvage mode a component's salvage has exactly one success result group (`role !== 'failure'`) plus at most one reserved `role: 'failure'` group, the failure group tolerated only when `salvageCraftingCheck.simple.rollFormula` is authored; no additional groups are permitted.
`salvage.enabled` is clamped to `false` in `simple` mode when there is no success group (a failure-only config cannot be enabled).
Routed mode keeps "one or more"; progressive keeps "exactly one".
This bound is enforced at the `_normalizeSalvage` normalizer — the single chokepoint every writer passes (GM save, import, copy-mode, migration) — not by any UI control, via a success-first retain-one clamp whose post-clamp `resultGroups[0]` is the first success group (the group the engine awards via `slice(0, 1)`, with no role filter).
The reserved-failure tolerance is a data-model / validation allowance only: salvage Simple awards `slice(0, 1)` and never routes to a failure group.
6. Runtime essence matching, craftability checks, discovered-recipe craftability, crafting-check contexts, and effect-transfer contexts must count `Component.essences` for actor items that match the component by source reference or name.
Explicit `fabricate.essences` item flags remain a compatibility override for that item.
The source-reference half of that match is governed by the shared **Component Item Matching** resolver defined below (its identity tier, then the raw-reference fall-through).
The separate name fallback some callers apply after the resolver returns null is not part of this matcher and is unchanged here.
That fallback is case-insensitive in `RecipeManager.ingredientMatchesItem`, `RecipeManager.toolMatchesItem`, and `essenceResolver.findMatchingComponent`, and case-sensitive in `CraftingEngine._findComponentItems`.
Closing that name path is deferred to issue 557.
7. `salvage.outcomeRouting` is only meaningful when `salvageResolutionMode` is `"routed"`.
In routed salvage mode it keys on the salvage check's outcome-tier NAMES (`salvageCraftingCheck.routed.{relativeOutcomes,fixedOutcomes}` for the active `type`) — the same source the per-component routing editor offers and the runtime routes by — NOT the legacy flat `salvageCraftingCheck.outcomes` list.
Every SUCCESS tier must route to an existing result group; failure tiers may stay unrouted (the runtime yields nothing for an unrouted outcome), and a route pointing at a deleted group is invalid.
When the salvage check defines no outcome tiers, routing is impossible and the component must NOT be faulted — the gap surfaces once as the system-level `salvageRoutedNoTiers` issue instead of a per-component error.
8. `salvage.ingredientQuantity` must be a positive integer.
9. If a linked source item updates its name, image, or description, managed components that match the item's live UUID, canonical source UUID, or fallback source references must refresh their stored `name`, `img`, and display-safe plain-text `description` from the linked item.
10. When importing or replacing a component source from a Foundry Item, Fabricate must verify a recorded canonical source UUID from `_stats.compendiumSource` or `flags.core.sourceId` before storing it as the component's primary source reference.
11. If the recorded canonical source UUID no longer resolves but the live dropped Item UUID does resolve, Fabricate must store the live dropped Item UUID as the component's primary `registeredItemUuid` and `originItemUuid`, and preserve the broken canonical source UUID in `aliasItemUuids`.
12. The broken-source fallback applies to single item import, folder import, compendium pack import, and replace-source.
13. `Component.category` defaults to `general`.
Every component normalizes to at least the reserved `general` bucket; there is no "uncategorized" state.
A custom token is free text surfaced verbatim; only `general` is localized.
14. `Component.salvage.enabled` is GM-authorable and defaults to `false`.
It gates salvage at runtime.
A component whose salvage config is invalidated by a system resolution-mode change is auto-disabled and must be re-enablable from the GM component editor.
No migration seeds this field; an existing component with authored salvage results but no explicit `enabled` value reads as disabled.
15. Requirement 5 is enforced by normalization, in both directions.
Component normalization must clamp `salvage.enabled` to `false` whenever the normalized `salvage.resultGroups` is empty, and — in `simple` mode — whenever no success group survives the clamp.
In `simple` mode the clamp additionally drops surplus groups: it keeps the first success group at `resultGroups[0]`, keeps at most one reserved `role: 'failure'` group (only when `salvageCraftingCheck.simple.rollFormula` is authored), and re-orders a failure-first input so the success group lands at index 0.
The clamp applies to every writer that passes through normalization — GM edits, import, copy-mode, and migration — and only ever turns `enabled` off, never on.
Enforcement must not rest on a UI control's disabled state: a GM surface that merely refuses to *enable* a zero-group component does not prevent a component from *becoming* zero-group while enabled.

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
  // GM-authored Result Order Permission: may a player reorder this recipe's progressive
  // result stages? An absent key reads true, so no migration seeds it.
  allowPlayerResultReorder: boolean, // default true
  category: string,

  // Multi-step mode
  steps?: Step[],

  // Single-step mode
  ingredientSets?: IngredientSet[],
  resultGroups?: ResultGroup[],

  transferEffects: boolean,
  toolIds: string[], // references library Tools that apply to all ingredient sets across all steps in this recipe

  // RETIRED result-group selection. `resultSelection.provider` is no longer a live
  // routing basis for any mode: alchemy now routes on the system-level
  // `CraftingSystem.alchemy.checkMode` (issue 554), and the routed crafting modes
  // derive their basis from the system mode. The 1.14.0 migration strips this from
  // every alchemy recipe; it survives only as an un-migrated read fallback.
  resultSelection?: {
    provider: "ingredientSet" | "check",
  },

  // Optional minimum success tier for a fixed-type routed check: the id of a fixed
  // success outcome tier. When set, a craft whose rolled tier ranks below it (fixed
  // tiers rank by `start`) fails outright. Null/unset = no override (outcome = the
  // rolled tier). Meaningful only for routedByCheck with a fixed-type check; ignored
  // otherwise. Semantics in resolution-modes/spec.md.
  minSuccessOutcomeId?: string | null,

  // Per-recipe access grants for the `restricted` visibility mode (issue 511, PR-B).
  // Which specific player-characters and players may see/read this recipe. Each is a
  // deduped list of non-empty id strings. Read-forward: when both lists are empty, the
  // player grants are seeded once from the legacy visibility.allowedUserIds.
  access: {
    characterIds: string[], // Actor ids of granted player-characters (visible to a viewer who controls the actor)
    playerIds: string[],    // User ids of granted players (visible to that user directly)
  },

  // LEGACY player-list visibility. Superseded by `access` above (read-forward source
  // for its player grants). Retained on read as the un-migrated restricted-mode fallback.
  visibility?: {
    restricted: boolean,
    allowedUserIds?: string[],  // Required when restricted is true. Empty array = hidden from all non-GM users.
  },

  // LEGACY scalar recipe→book reverse ref. Membership was inverted to the many-to-many
  // RecipeItemDefinition.recipeIds[] (issue 511, PR-B); the 1.13.0 migration removes
  // this field. It survives only as an un-migrated read fallback. (recipe.linkedRecipeItemUuid
  // — not shown here — is a separate legacy alias the same migration strips only when it
  // resolved a book, preserving a standalone alchemy formula-item link.)
  recipeItemId?: string,

  locked: boolean,

  metadata: {
    created: number,
    modified: number,
    author: string,
    version: string,
  },

  // Durable settings-payload provenance stamped by import (NOT a Foundry flag).
  // Identifies the source pack (the payload's system.id when present, else the created
  // system id) so a later reinstall can prune recipes the pack dropped without touching
  // GM-authored recipes. Normalized to object-or-null by the Recipe constructor (a
  // malformed value normalizes to null), emitted by toJSON(), null for hand-authored
  // recipes, re-stamped on every import, and retained across GM edits.
  importSource: { systemId: string, importedAt: number } | null,
}
```

### Requirements

1. A *craftable* Recipe must include at least one ingredient set and at least one result group, either at recipe level (single-step mode) or within steps (multistep mode).
   This is a *completeness* requirement: it gates crafting and craftable-visibility, not persistence.
   `Recipe.validate()` enforces completeness and is the craftability contract; the crafting engine gates on it, so an incomplete recipe is never craftable.
   `Recipe.validateStructure()` omits completeness (it waives the missing-ingredient-set / missing-result-group / missing-result errors) and is the persistence contract.
2. An authoring *incomplete shell* — a recipe with valid identity (a name; default name "Unnamed Recipe" and default image apply when omitted) that is structurally consistent but missing its ingredient sets and/or result groups — MAY be persisted via the GM authoring path (create-then-edit and identity-only saves).
   Persistence gates only on structural validity (`validateStructure()`), never on completeness; structural-integrity errors (duplicate result-group/result IDs, invalid results, invalid step time/currency values, variable result-mapping and outcome-routing integrity) still block persistence.
   Reserved/duplicate `ResultGroup.name` is a reference-integrity rule enforced at the service level for the routed modes and alchemy `tiered` check mode (see the next paragraph), NOT a structural/persistence blocker: `validateStructure()` waives the name checks, so an authoring incomplete shell — or a recipe carrying a stray leftover `resultSelection` — is never blocked on a name error.
   Issue 554 retired the per-recipe `resultSelection.provider`, so `Recipe._validateRoutedResultSelection` no longer governs alchemy name-uniqueness.
   `routedByCheck` `ResultGroup.name` integrity is enforced at the service level (`ResolutionModeService._validateRoutedGroupNames`, a per-mode reference-integrity check that always applies), independent of this persistence gate.
   Incompleteness is *derived* from the recipe's structure (no stored flag): an implicit recipe is incomplete when it has no ingredient sets or no result groups; an explicit multi-step recipe is incomplete when any step is missing an ingredient set or result group.
3. Resolution-mode constraints are defined in `resolution-modes/spec.md`.
4. `resultSelection.provider` is RETIRED for alchemy (issue 554): alchemy routes on the SYSTEM-level `CraftingSystem.alchemy.checkMode` (`none` | `simple` | `tiered`), not a per-recipe provider.
   The 1.14.0 migration strips `resultSelection` from every alchemy recipe.
   No live mode reads `resultSelection`: `routedByIngredients` routes by `IngredientSet.resultGroupId` and `routedByCheck` routes by `ResultGroup.name`/`checkOutcomeIds` against the system routed check, and alchemy routes per its `checkMode`.
5. Result-group selection with a reserved `role: 'failure'` group applies to plain `simple` resolution mode (success group on a passed check, reserved failure group on a fail when authored) as well as alchemy.
Alchemy result-group selection is per `CraftingSystem.alchemy.checkMode`:
   - `none`: one ingredient set + one result group; a matched brew always produces that group (no check).
   - `simple`: the success result group on a passed `craftingCheck.simple`, and the reserved `role: 'failure'` result group on a fail (produced only when non-empty).
   - `tiered`: identical to `routedByCheck` — each success outcome tier routes to its assigned `ResultGroup` via `checkOutcomeIds`; a failed routed check fizzles.
6. `ResultGroup.name` values must be unique per recipe under trim-normalized, case-insensitive comparison.
7. `ResultGroup.name` values may not be reserved routing keywords under trim-normalized, case-insensitive comparison:
   - failure keywords: `fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`, `hazard`, `danger`, `complication`, `trap`, `oops`
8. If `transferEffects` is true and essences are enabled, transfer behaviour follows `recipes-and-steps/spec.md`.
9. `access` is the canonical per-recipe grant for `restricted` visibility mode (issue 511, PR-B): `access.characterIds` grants named player-characters and `access.playerIds` grants named players.
Each normalizes to a deduped list of non-empty id strings (non-string entries are dropped).
When both lists are empty, the player grants are read-forward once from the legacy `visibility.allowedUserIds`, so a pre-`access` recipe keeps showing to the same players after the runtime switches to reading `access`.
An `access` grant with both lists empty means no non-GM user may see the recipe (the GM always can).
9a.
The legacy `visibility` block is retained on read as the `access` read-forward source and the un-migrated fallback: if `visibility.restricted` is true, `visibility.allowedUserIds` must be present as an array; an empty array is valid and means no non-GM user may see the recipe.
10. If `visibilityMode` is `item` or `knowledge`, the recipe should be a member of at least one recipe item definition (`RecipeItemDefinition.recipeIds`, the canonical membership since issue 511 PR-B) for player craftability.
The legacy scalar `recipeItemId` requirements below still hold for un-migrated systems that resolve membership through the reverse-ref fallback.
11. If a legacy `recipeItemId` is configured and the referenced `RecipeItemDefinition` does not exist, validation must warn.
12. If a legacy `recipeItemId` is configured and the referenced `RecipeItemDefinition.originItemUuid` is stale or no longer resolves, validation must warn.
13. `minSuccessOutcomeId` is an optional reference to a fixed-type routed check's success outcome tier id (semantics in `resolution-modes/spec.md`); it defaults to `null`.
It is meaningful only when `CraftingSystem.resolutionMode === "routedByCheck"` and the routed check `type` is `fixed`, and is ignored for relative-type checks and non-routed modes.
An absent or `undefined` value round-trips to `null` through `Recipe.fromJSON` with no migration.
14. `importSource` is durable settings-payload provenance stamped by the compendium importer (NOT a Foundry flag): `{ systemId, importedAt } | null`, identifying the source pack.
The `Recipe` constructor normalizes it to object-or-`null` — a non-object, or an object missing a non-empty string `systemId`, normalizes to `null` — and `toJSON()` emits it.
A recipe created through the GM authoring path is never stamped, so it round-trips as `null`; this structural absence is the never-prune guard (import never auto-removes an unprovenanced recipe).
It survives export/import (the importer re-stamps it) and is retained across GM edits (an edit that omits `importSource` inherits the stored value through the `{ ...recipe.toJSON(), ...updates }` merge in `updateRecipe`).

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

- `RecipeItemDefinition.recipeIds[]` stores the canonical recipe↔book membership (issue 511, PR-B, many-to-many): each definition lists the recipe ids it contains, so a recipe may belong to several books.
- The legacy scalar `Recipe.recipeItemId` (removed by the `1.13.0` migration) stored a single reference to a `CraftingSystem.recipeItemDefinitions[].id` entry; it survives only as an un-migrated read fallback.
- `RecipeItemDefinition.originItemUuid` stores the canonical template reference to the recipe item.
- The template may point to a world item or a compendium item.

### Match Rule

A candidate owned item is matched through the shared, system-scoped four-tier matcher defined in the recipe-visibility spec (**Recipe Item Matching**): the durable identity tier first (tier 1) — the per-system `flags.fabricate.roles[systemId].recipeItemDefinitionId` leaf, then the legacy scalar `flags.fabricate.recipeItemDefinitionId` — then membership in the definition's union of source references (`registeredItemUuid` + `originItemUuid` + `aliasItemUuids`) by the candidate's own uuid (tier 2), compendium source (tier 3), or transitive `_stats.duplicateSource` (tier 4).
The durable identity tier is list-aware (a claim naming nothing in the candidate set falls through); among the source-reference tiers the first that yields a match wins, with no fall-through.
Foundry v12+ uses `_stats.compendiumSource`; Foundry v11 and earlier used `flags.core.sourceId`.
Runtime implementations call the shared source UUID resolver and the shared matcher; they must not re-implement it.

### Component Item Matching

A candidate owned item is resolved to the single component it IS through one shared, list-aware, system-scoped resolver, `resolveComponentForItem(item, components, systemId)`, evaluated against one crafting system's component set.
The resolver is expressed as tiers with fall-through, parallel to the recipe-item matcher `matchRecipeItemDefinition`.
Identity tier: when the item's `roles[systemId].componentId`, or failing that its legacy scalar `componentId`, names a component in the set, that component is the identity and it matches exclusively; every other component in the set fails closed.
Fall-through: when no claimed id names a component in the set, the resolver falls through to the union of raw source references (`uuid`, `_stats.compendiumSource` / `flags.core.sourceId`, and the transitive `_stats.duplicateSource`), exactly as before.
The raw-reference fall-through is load-bearing for multi-system worlds, stale flags, and un-stamped pre-#555 worlds.
The invariant is that within a single system's component set at most one component bears a given id; component ids are NOT globally unique, because independently-authored systems can coincidentally share an id and every world that copy-imported BEFORE issue 570 retains its origin's ids (copy-import itself no longer preserves origin ids — see the residual note below).
The resolver is the single component matcher used across crafting ingredient and collection matching, recipe tool matching, essence resolution, the inventory used-by listing, owned-item repair, gathering award-stacking, alchemy signature matching, and canvas Item→Tool drop resolution.
This closes the transitive-`_stats.duplicateSource` false positive on the source-reference path while preserving a system's recognition of its own component in multi-system worlds.
Residual, CLOSED by issue 570: copy-mode import now regenerates every component id and atomically remaps every within-payload component reference (recipe ingredient and result refs including the `systemItemId` alias, the recursive `alternatives[]` refs, and the flat `ingredients`/`results` aliases; the retained `tool.componentId` alias in both the system and gathering-library tool slices; `onBreak.replacementComponentId`; `essence.sourceComponentId`; salvage result refs; gathering drop-row `componentId`; and legacy `catalysts[]`), so two systems copy-imported from the same origin no longer share a component id.
Issue 561 removed the blocker by giving Tools their own identity — a Tool no longer borrows `componentId` for cross-system matching — and issue 570 flipped regeneration on in `prepareForImport('copy')`.
The per-system `roles` map and the resolver's `systemId` scoping remain load-bearing, because component ids stay per-system-unique only: independently-authored systems, and worlds that copy-imported BEFORE issue 570, can still share ids.

### Registration Source Identity

At registration (both recipe items and components), a definition's `originItemUuid` is a best-effort source POINTER; the durable flag is the identity-OF-RECORD.
Every kind's durable identity-of-record is a per-system leaf under `flags.fabricate.roles[systemId]`: a component's is `componentId`, a first-class tool's is `toolId`, and a recipe item's is `recipeItemDefinitionId`.
`flags.fabricate.roles` is the unified, final per-system role map and the single home for all three durable identities; issue 556 populates `componentId`, issue 561 populates `toolId` (stamped by `addToolFromUuid` and the `autoStampToolSources` one-shot restamp), and issue 567 populates `recipeItemDefinitionId` (stamped by `addRecipeItemFromUuid` and the repurposed `autoStampRecipeItemSources` restamp), each an additive sibling key.
A legacy scalar `flags.fabricate.componentId` (components) or `flags.fabricate.recipeItemDefinitionId` (recipe items) is still honored at match time as a claimed id — a transitional read-only fallback tier — until the one-shot restamp backfills the map; tools never had a legacy scalar.
Registration stamps only the owning system's `roles[system.id]` leaf for the kind, and clears only that per-system leaf on re-point or repair, never the whole `roles` flag nor the whole `roles[systemId]` object (which would destroy the sibling leaves).
A CRAFTED OUTPUT item carries the durable component identity of its result component: crafting stamps `flags.fabricate.roles[craftingSystemId].componentId` on the output item at creation, so a freshly crafted product resolves to its OWN component through the identity tier and never through the transitive `_stats.duplicateSource` it inherits from a source item duplicated off a sibling component (a result with no managed component, or a system id that is not a durable-flag-key segment, is left unstamped and degrades to raw-reference resolution).

- A source's identity references are its own uuid plus its `_stats.compendiumSource`, **only when the source is not a clone**.
A CLONE (a world source Item carrying `_stats.duplicateSource` at registration — a sidebar-Duplicate) keys purely on its own uuid: its inherited `compendiumSource` is excluded from both the canonical uuid and the find-existing references.
So a registered duplicate becomes a NEW definition or component instead of overwriting the original.
- This clone-gate is a REGISTRATION and source-repair rule only.
It must never reach the runtime matcher: an actor-owned drag copy also carries `_stats.duplicateSource`, but its `compendiumSource` is legitimate provenance there (tier 3).
- Registration stamps the durable flag (overwriting any marker inherited from a duplicated original), strips a clone's stale `_stats.duplicateSource`, and clears a clone's stale `_stats.compendiumSource`.
- Existing stored `originItemUuid` values are never recomputed.
A recipe item records the same union of source references a component does (`registeredItemUuid` = the registered live document, `originItemUuid` = the canonical compendium/source uuid, `aliasItemUuids` = broken-source fallbacks), so a compendium-imported book resolves owned copies dragged from EITHER the compendium item or the imported world item.

Flow-1 double-import (the same pack item imported into the world twice and both registered) still dedups to ONE definition: the second registration is a non-clone whose `compendiumSource` still matches, so find-existing dedups.
It is cleanly distinguishable from the duplicate case by the absence of `_stats.duplicateSource`.

### Repair and Auto-Stamp

- A primary-GM-gated (`game.users.activeGM?.id === game.user?.id`), idempotent, one-shot `ready`-body pass — keyed by the `RECIPE_ITEM_FLAG_STAMP_VERSION` world setting (target `2`) — backfills the per-system `roles[system.id].recipeItemDefinitionId` leaf on every registered definition's writable source Item, per owning system (a source registered in two systems lands both leaves), for world items and unlocked-pack items (locked packs skipped), and strips a clone's stale `_stats`.
The target was bumped `1 → 2` (issue 567): a world already stamped at v1, which wrote the retired scalar, re-runs once to backfill the map; the legacy scalar is left in place as the transitional fallback tier.
A separate one-shot, primary-GM-gated, `ready`-body restamp — keyed by the `COMPONENT_FLAG_STAMP_VERSION` world setting — backfills `roles[system.id].componentId` for every registered component's writable source Item; it mirrors the recipe-item auto-stamp and is likewise NOT a `MigrationRunner` entry.
This removes the confirmed regression whereby a real registered book and an unregistered duplicate of it are byte-for-byte identical on the matcher's inputs (tier-4 only).
It is NOT a `MigrationRunner` entry: that runner reads and writes only settings-data payloads and has no Item handle, so it cannot write Item flags.
- A GM **Repair item data** maintenance action reconciles both kinds across world items, writable packs, and actor-owned items.
World/pack SOURCE items use the same clone-gated identity (a clone is matched by its own uuid only, never its inherited `compendiumSource`, fixing the self-corruption whereby a clone would be stamped with the original's id).
Actor-owned copies use the ordinary runtime matchers — the four-tier recipe-item matcher, or the list-aware, system-scoped component resolver (no clone-gate).
Components, tools, AND recipe items are reconciled PER SYSTEM: the repair resolves each item against one system's definition set with that system's id, and writes or clears ONLY that system's `roles[systemId]` leaf for the kind (`componentId` / `toolId` / `recipeItemDefinitionId`), so a non-owning system's null-owner pass finds its own leaf unset and no-ops — it can never clear another system's identity regardless of `getSystems()` order.
For recipe items, an unflagged owned copy matched only via tier 4 may be re-pointed by an exact (case/whitespace-normalized) name match, unique WITHIN the system being reconciled, to a different definition — the duplicated-scroll-mislabelled-as-book case — recorded in a reversible audit log; a name matching two or more definitions within that system is skipped as ambiguous.
Because recipe-item repair is now per-system (issue 567), name uniqueness is scoped to the system, so a source registered in two systems is reconciled independently in each.
A flagged owned copy is authoritative and left untouched, and repair never triggers a learn.
- A cross-system shared source (two systems each owning a definition with the same `originItemUuid`) keeps a durable per-system claim in EACH system: registration, repair, and the restamp each write only that system's `roles[systemId].recipeItemDefinitionId` leaf, so both systems' owned copies resolve to the correct definition and neither clobbers the other.
This is the same per-system model as components and tools; the earlier recipe-item "last writer wins" single-scalar limitation is retired (issue 567).
The legacy scalar `flags.fabricate.recipeItemDefinitionId` remains a transitional read-only fallback tier for pre-upgrade owned copies until they are re-dragged or repaired.

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
  // LEGACY read-only compatibility field (superseded by essence ingredient options).
  // The 1.17.0 migration rewrites each positive entry into a single-option essence
  // group; constructors keep reading it for one release, nothing new writes it.
  essences: { [essenceId: string]: number },
  toolIds: string[], // references library Tools required for this ingredient set

  // routedByIngredients: routes the satisfied ingredient set to this result group
  resultGroupId?: string,
}
```

### Requirements

1. `ingredientGroups` must contain at least one `IngredientGroup` (essence options included), unless the legacy `essences` map contains one or more positive requirements (back-compat read for one release).
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

    // type = "essence"
    essenceId?: string, // a configured CraftingSystem.essences key
    amount?: number,    // positive essence quantity (shared field name with currency)
  },
}
```

`match.type` is one of `"component" | "tags" | "currency" | "essence"`.

### Requirements

1. `quantity` must be positive.
2. `match.type` is required.
3. If `match.type === "component"`, `match.componentId` is required.
4. If `match.type === "tags"`, `match.tags` must contain one or more tag IDs.
5. Tag IDs in `match.tags` must exist in `CraftingSystem.itemTags`.
6. Tag placeholder ingredients are valid in all resolution modes, including `simple`.
7. A `match.type === "currency"` option is a currency ALTERNATIVE for its ingredient group: `unit` is a configured `requirements.currency.units[].id` and `amount` is a positive cost.
A currency option matches no inventory item and contributes no alchemy signature.
8. A `match.type === "essence"` option is an essence ALTERNATIVE for its ingredient group: `essenceId` is a configured `CraftingSystem.essences` key and `amount` is a positive essence quantity.
It is satisfied by consuming items whose accumulated `essenceId` essence meets `amount`, and it expands to every component carrying that essence.
An essence option matches no single inventory item (satisfaction is amount-accumulative across items and routes through the consumption planner).

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
6. A currency requirement or cost is displayed by resolving the unit `id` to a human label through the chain `abbreviation` (when authored) → `label`, so a well-formed requirement never surfaces the raw unit `id`.
The sole exception is a degenerate orphaned reference — a `requirement.unit` id no longer present in the system's resolved currency config — which `formatCurrencyRequirement` renders verbatim as a last-resort fallback (a stale id being preferable to a blank cost).
This applies to the player crafting-app currency option cost row (`RecipeManager` resolves the recipe's currency units through `normalizeCurrencyUnit` so the abbreviation self-heal applies, then formats the row through `formatCurrencyRequirement`).

### Essence-Alternative Consumption (Craft-Time)

An essence option satisfies its ingredient group by consuming essence-carrying items until its `amount` is met, symmetric with component/tag alternatives:

1. The per-item essence contribution is read through an injected bound `resolveItemEssences(item) => essenceMap` collaborator, keeping the pure model Foundry-free.
The default resolver is **flag-only** (`fabricate.essences` item flag), so the no-probe `canBeCraftedWith`/display path stays byte-for-byte the legacy behaviour; callers (`RecipeManager`, `CraftingEngine`, the per-slot selector) bind a **component-aware** resolver that also credits component-defined essences — an intentional capability increase over the old flag-only per-set gate.
2. Consumption reads the shared `remaining` map and commits through `_commitItemPlan` (keyed by `uuid || id`), so an item already claimed by a component/tag group in the same set is not recounted toward the essence group (anti-double-consume).
3. Consumption is **unit-granular**: an indivisible item may over-consume past `amount` (e.g. one item worth 3 essence to meet `amount: 2`), acceptable and symmetric with tag/component options.
4. Accounting is per-unit occurrence in alchemy (the submitted multiset) and `system.quantity`-summed in standard craft, mirroring the existing documented divergence between the two matchers.

## Alchemy Signature Uniqueness (Validation Contract)

### Purpose

Define the save/import invariant that guarantees deterministic ingredient-signature resolution in alchemy mode.

### Contract

1. Applies only when `CraftingSystem.resolutionMode === "alchemy"`.
2. Scope is the **enabled** recipes in the crafting system.
`SignatureValidator.validateSystem` scans only enabled recipes — the exact complement of the runtime matcher's `if (!recipe.enabled) continue;` skip — so the scanned set equals the matchable set.
The invariant is *"the set of **enabled** recipes is collision-free"*: the `blocks:'system'` gate, the save-block, and the disable-reconciliation all funnel through `validateSystem`, and disabling all participants of a conflict genuinely clears it (re-enabling a disabled collider is re-caught at that mutation).
3. Signature overlap is based on satisfiable ingredient assignments, not just textual equality.
4. Matching expansion must include:
   - direct component matches (`match.type === "component"`)
   - tag matches (`match.type === "tags"`) expanded against current system components/tags
   - essence matches (`match.type === "essence"`) expanded to components carrying the essence, counted by AMOUNT (not occurrence) with `computeGroupOptions` capacity `min(amount, ids.size)`.
5. Ingredient groups may resolve to the same component ID when inventory quantity is sufficient to satisfy the aggregate quantity across those groups.
6. Any overlapping satisfiable signatures between ingredient sets in the same system are invalid.
7. Save is blocked for any collision among enabled recipes in the system, including when editing an unrelated recipe.
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
  componentId: string | null,      // OPTIONAL managed-component link; null for an item-sourced tool
  // Own source references (issue 561; renamed in issue 560), identical field shape to a component.
  registeredItemUuid: string | null, // the registered live source document uuid
  originItemUuid: string | null,     // the canonical/compendium source uuid
  aliasItemUuids: string[],          // additional source references for matching
  // Registration/migration-time DISPLAY SNAPSHOT (name + img ONLY, never `label`).
  name: string | null,
  img: string | null,
  label: string,                   // pre-existing, user-authored display override (distinct from the snapshot)
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

1. A Tool must carry EITHER a `componentId` (a managed-component link) OR its own source references (`registeredItemUuid` / `originItemUuid`); a Tool with NEITHER is invalid.
A first-class tool registered from an Item uuid carries its own source references plus a `name` + `img` display snapshot and `componentId: null`; a whetstone that is also a component, or a tool migrated from a legacy componentId-tool, keeps `componentId` populated (for `onBreak.replaceWith` resolution and the UI's linked-component display) but `componentId` is no longer the matching basis.
A component-linked tool that carries no own source references derives them and its `name` + `img` snapshot from its linked component on every `_normalizeSystem` load (`deriveToolSourceFromComponents`), not only at migration time — so a tool authored by dropping a managed component, a copy-imported tool, and a post-migration authored tool all match owned items by source reference, continuous with the `1.15.0` migration and idempotent (an item-sourced or already-derived tool is left untouched, and the derivation never overwrites the tool's own snapshot or `label`).
The `name` + `img` display snapshot is captured at registration/migration time and is NOT auto-refreshed when the GM renames the source Item — parity with recipe-item definitions, not the component `updateItem` refresh path — because durable identity, not the snapshot, is the matching basis.
The pre-existing user-authored `label` is a DISTINCT field and is NEVER written by snapshot capture, migration, or any refresh.
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
Canvas virtual-presence stays keyed by `componentId`: an item-sourced tool (`componentId: null`) does NOT participate in canvas virtual-presence in this change (re-keying virtual-presence onto `toolId` is tracked separately).
9. An owned item is selected for tool **usage OR breakage** — both, not breakage alone — only when it matches the tool by **durable-identity matching** against the tool's OWN identity.
Durable-identity matching means: (a) the durable per-system tool-identity flag `flags.fabricate.roles[systemId].toolId`, OR (b) the item's own `uuid` or compendium source (`_stats.compendiumSource` / `flags.core.sourceId`) intersecting the tool's source references.
Tools have no legacy scalar identity tier.
An item is NEVER selected for usage or destruction by a transitive `_stats.duplicateSource` reference or by name alone, either of which still satisfies the non-destructive **presence** gate (the wide shared tool matcher).
An item that satisfies presence only via a transitive duplicate-source reference or by name is spared from usage/breakage and recorded as a skipped tool.
When an actor owns both a durable-identity match and a presence-only match for the same tool, the durable-identity item is the one used or broken.
Because destroying the wrong item is irreversible, this is the shipped behaviour ("is"): a world-template copy lacking both a compendium source and a durable flag is spared until repaired, rather than risking an irreversible wrong-item destroy.
A locked-compendium copy carries its own compendium source, matches durable identity (b), and still breaks.
10. A Tool's durable identity is `flags.fabricate.roles[systemId].toolId`, stamped on its source Item at direct registration (`addToolFromUuid`) and by the one-shot `ready`-body restamp (`autoStampToolSources`, keyed by `TOOL_FLAG_STAMP_VERSION`), an additive SIBLING of `roles[systemId].componentId`.
A whetstone that is both a component and a tool carries both leaves in one `roles[systemId]` object, and neither registration clobbers the other: deregistering or re-pointing a tool clears ONLY the `roles[systemId].toolId` leaf.
A bulk-imported tool (via `createSystem`) matches by raw source references until a manual "Repair item data" stamps its owned copies, identical to imported components.
11. Tool **presence** matching resolves the owned item against the system Tools library by the tool's own source references (durable `roles[systemId].toolId` first, then source-ref intersection including the transitive `_stats.duplicateSource`, then the tool's snapshot-name fallback), not through a managed component.
Tool **usage/breakage** selection matches by durable-identity against the tool's OWN identity per requirement 9.

### Validation Matrix

| Field                                  | Valid values                                       | Invalid values            |
|----------------------------------------|----------------------------------------------------|---------------------------|
| `componentId`                          | optional when source references are present        | absent AND no source references |
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
  // Reserved role discriminator (issue 554). `'failure'` marks the reserved failure
  // result group, valid on plain `simple` recipes and on alchemy `simple` checkMode;
  // absent/other = a success group. Still forbidden on None/Tiered groups. The
  // reserved failure group is undeletable in the editor and defaults to empty.
  // Preserved verbatim by normalization so a settings-only mode flip round-trips it.
  role?: "failure",
  // Ids of the routed-check outcome tiers that produce this group (routedByCheck +
  // alchemy tiered). Empty for non-tiered groups.
  checkOutcomeIds?: string[],
  results: Result[],
}
```

`ResultGroup.name` reserved/duplicate integrity now applies at the service layer for the routed modes AND alchemy `tiered` only (`ResolutionModeService._validateRoutedGroupNames`); with `resultSelection.provider` retired, the model no longer validates alchemy names via `Recipe._validateRoutedResultSelection`, and `Recipe._deriveComplex` never governs alchemy authoring (the editor forces a single ingredient set).

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

  // Authored ingredient requirements snapshot, captured at run creation (`_buildStepStates`).
  // Component-backed ingredients of the step's primary (first) ingredient set only; tag /
  // essence requirements carry no component id and are omitted. Persisting the stable ids
  // keeps a history entry's requirements intact after the recipe is later edited or deleted.
  // Absent on pre-snapshot historical records. Name/img resolve at projection time from the
  // still-live crafting system's components.
  requirements?: Array<{
    componentId: string,
    quantity: number,
  }>,

  lastCheckResult?: {
    success: boolean,
    reason: string,   // user-friendly text returned by the macro explaining the result
    outcome?: string, // routedByCheck mode / alchemy tiered check mode
    value?: number,   // progressive mode
    data?: object,
  },

  consumedIngredients?: Array<{
    actorUuid: string,
    itemUuid: string,
    quantity: number,
    name?: string | null, // captured at consume time; absent on pre-capture historical records
    img?: string | null,  // captured at consume time; absent on pre-capture historical records
    componentId?: string | null, // captured on the timed-step FINISH path (and legacy refs); a projection name/img fallback
  }>,
  // Flattened tool-breakage evidence written by `_applyToolBreakage`. Each entry
  // is one tool's usage/breakage record; `componentId` and `broken` are load-bearing
  // consumer-side (the salvage chat card filters `broken === true` and resolves
  // `componentId`, and the Run Journal reads them).
  usedTools?: Array<{
    actorUuid: string | null,
    itemUuid: string | null,
    quantity: number,
    componentId: string | null,
    broken: boolean,
    // checkDriven-only evidence:
    authority?: string,
    reason?: string,
    triggerId?: string,
    checkId?: string,
    // skip/marker fields:
    virtual?: boolean,     // no owned item resolved
    spared?: boolean,      // matched but not broken
    skippedImmune?: boolean,
  }>,
  createdResults?: Array<{
    actorUuid: string,
    itemUuid: string,
    quantity: number,
    name?: string | null, // captured at award time; absent on pre-capture historical records
    img?: string | null,  // captured at award time; absent on pre-capture historical records
  }>,

  failureReason?: string,
}
```

### Requirements

1. `index` must be contiguous and zero-based within a `CraftingRun.steps` array.
2. `timeGate` is only valid when the corresponding recipe step has `timeRequirement`.
3. `timeGate.availableAt` must be `> initiatedAt` when both are present.
4. `completedAt` is required when `status` is `succeeded`, or `failed`.
5. `lastCheckResult.outcome` is only valid in `routedByCheck` mode (and in alchemy when `checkMode` is `tiered`); `lastCheckResult.value` is only valid in progressive mode.
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
6. Run-flag writes must be document-coherent.
A terminal run, once persisted to `history`, must not be dropped by a subsequent persist whose in-memory view predates it.
A write must reconcile against the currently-persisted document — union `history` by run `id` (newest-first, capped) and apply `active` add/remove against the fresh document — rather than overwriting from a stale in-memory cache.
This holds across concurrent writers, sessions/clients, and the primary-GM world-time resume path.
The identical guarantee applies to the salvage runs flag (`flags.fabricate.salvageRuns`), which shares this persistence mechanism.

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
5. Detailed `GatheringRun` shape and lifecycle semantics are defined in `gathering-and-harvesting/spec.md`.
6. Run-flag writes must be document-coherent.
A terminal run, once persisted to `history`, must not be dropped by a subsequent persist whose in-memory view predates it.
A write must reconcile against the currently-persisted document — union `history` by run `id` (newest-first, capped) and apply `active` add/remove against the fresh document — rather than overwriting from a stale in-memory cache.
This holds across concurrent writers, sessions/clients, and the primary-GM world-time resume path.

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

### Alchemy Dead-Ends Flag

A sibling actor flag to `learnedRecipes`, holding the per-character workbench tried-dead-end memory.

```js
Actor.flags.fabricate.alchemyDeadEnds = {
  [craftingSystemId: string]: string[],   // canonical `componentId:qty|...` signature keys
}
```

Requirements:

1. Each array is append-only and deduped — the canonical key of a submitted multiset is added once per (actor x system).
2. A key is written only when the matched system's `alchemy.showAttemptHistoryToPlayers === true`, on a fizzled (no-match) brew.
3. The signature key is the sorted `componentId:qty|...` join of the submitted plain-component multiset (the single shared canonical-key helper).
4. Stored and read via `getFabricateFlag` / `setFabricateFlag`; the effective persisted path is doubly nested under `flags.fabricate.fabricate.alchemyDeadEnds` (the flag helpers prefix `fabricate.`), so it is never read via a raw `actor.flags.fabricate.alchemyDeadEnds` path.
5. It affects only the client workbench status model (flipping `untried` -> `no-reaction`) and grants no recipe visibility (a fizzle matches no enabled recipe).

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

Define the unified, UI-safe projection the player-facing Journal screen reads (see `ui-integration/spec.md` *Journal App*).
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
    formula: string | null,          // resolved (else authored) roll formula from lastCheckResult.data
    total: number | null,            // rolled total (data.total, else the bare value)
    dc: number | null,               // resolved DC when the check has a static one
  } | null,
  // The step's authored required ingredients (persisted snapshot) and the items it
  // actually consumed, each a UI-safe result row. `[]` when absent or for a redacted run.
  requirements: Array<{ componentId, itemUuid, quantity, name, img }>,
  consumedIngredients: Array<{ componentId, itemUuid, quantity, name, img }>,
}
```

### Requirements

1. **`derivedStatus` is computed, never the persisted status.**
   A terminal `status` (`succeeded`, `failed`, `cancelled`) passes through to `derivedStatus` unchanged.
   For a non-terminal run, readiness is derived from the active readiness gate's `availableAt`: `ready` when `availableAt <= worldTime`, otherwise `waiting`.
   A non-terminal run with no armed gate is `inProgress`.
   The persisted `status` (e.g. a `waitingTime` that `processWorldTime` flips to `inProgress` asynchronously off the same world-time hook) is NEVER consulted for the active-run derivation — only the gate's `availableAt` against `worldTime` — so the readiness read is race-free.
   The `processWorldTime` write side (the salvage/crafting timed resume and its `_persist`/`setFlag` broadcast write) is **primary-GM-gated** (`game.users.activeGM?.id === game.user?.id`) so it fires exactly once even though `updateWorldTime` is a synced hook on every client — mirroring the gathering matured-run publication gate; a resume deferred while no GM is connected is caught up by the primary GM's startup `processWorldTime` pass.
2. **Per-runType `timeGate` source.**
   For a crafting run, `timeGate` and the readiness derivation come from the ACTIVE step's gate (the step at `currentStepIndex`).
   For gathering and salvage runs, they come from the RUN-level `timeGate`.
   Gathering re-maps its native `*WorldTime` fields (`startedAtWorldTime` / `updatedAtWorldTime` / `completedAtWorldTime`) onto the common `startedAt` / `updatedAt` / `finishedAt`; salvage already uses the crafting `startedAt` / `updatedAt` / `finishedAt` names.
3. **Viewer redaction (`redacted`).**
   For a non-GM viewer, a crafting or alchemy run whose recipe the viewer cannot see — a recipe that no longer resolves, or an undiscovered alchemy / knowledge-gated crafting recipe — is redacted: `redacted: true`, `names.title` becomes the generic localized label (`FABRICATE.App.Journal.Redacted.Title`), `recipeId` is `null`, `steps` / `createdResults` / `failureReason` / `stepLabel` are blanked, `manualAdvance` is `false` (a hidden-identity run offers no Trigger Next Step), and `img` falls back to the default run image.
   The GM bypass precedes the missing-recipe guard: a GM viewer is never redacted, even for a run whose recipe no longer resolves, so the GM still sees the run's persisted step snapshots (requirements, roll, consumed items) rather than a redacted empty card.
   Globally-visible recipes are likewise never redacted; with no recipe-visibility service available no redaction occurs.
   This mirrors the gathering blind-run redaction (the gathering listing builder), so the Journal never leaks a hidden crafting/alchemy recipe identity to a non-GM viewer.
   Gathering and salvage runs are not redacted by this projection (`redacted: false`); gathering's own blind-task redaction is applied upstream by its listing builder.
4. **Step projection is crafting-only.**
   `steps`, `currentStep`, `structureLabel`, `resolutionModeLabel`, `multiStep`, `isFinalStep`, each step's `detail.checkLabel`, and each step's `requirements` / `consumedIngredients` are populated for crafting runs only; gathering and salvage project `steps: []`, `currentStep: null`, empty structure/mode labels, and `multiStep: false` / `isFinalStep: false`.
   A step's `requirements` come from its persisted snapshot and `consumedIngredients` from the persisted consumed refs; both resolve name/img via the same shared result mapper (consume-time capture, then the item-uuid and component-id fallbacks), so a deleted consumed item still labels from its captured or component name.
   A redacted crafting run also projects `steps: []` (its requirements / consumed items never leak).
   `multiStep` is `recipe.steps.length > 1`; `isFinalStep` is `stepCount <= 1 || currentStepIndex >= stepCount - 1` (true on a single-step recipe or the last step of a multi-step recipe, and — harmlessly, since a terminal run drives no action — on any terminal run whose `currentStepIndex` is null).
   `stepLabel` is a localized "Step X of Y" string only for a non-redacted multi-step crafting run; it is `""` for a single-step recipe (the structure label already conveys the single-step shape) and for a redacted run (so a hidden multi-step recipe never leaks its step count or active step name).
5. **`manualAdvance` is the Trigger Next Step gate.**
   It is `true` only for non-redacted crafting runs (a redacted crafting run sets it `false`); the player-facing advance contract is defined in `recipes-and-steps/spec.md` (*Run Progression — Player-Initiated Advance*).
6. **`resolutionModeLabel` uses the player-facing label map.**
   It resolves through the localized mode-label map defined in `resolution-modes/spec.md` (*Player-Facing Mode Labels*) and never emits the raw `resolutionMode` token.
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
3. Maximum uses is configured per recipe item in `RecipeItemDefinition.caps.item.maxUses` (enabled by `caps.item.limitUses`), resolved from the recipe's linked definition.
4. When `timesUsed >= maxUses`, the item is exhausted.
5. If `caps.item.destroyWhenExhausted` is true, the item is destroyed when exhausted.

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
2. This document-instance counter backs the `caps.learn.learnScope === "perInstance"` (default) scope; the count is tracked per owned item **document** instance, so a stacked `qty > 1` document shares one count.
3. It accumulates across every actor that holds the document and is **not** reset on transfer or ownership change.
4. The learn cap is configured per recipe item in `RecipeItemDefinition.caps.learn.learnsAllowed` (enabled by `caps.learn.limitLearning`; legacy mirrors `maxRecipes`/`limitRecipes`), resolved from the recipe's member book definition.
5. When `learnedCount >= learnsAllowed`, the learn budget is spent and no further recipe may be learned from the item.
6. If `caps.learn.destroyWhenSpent` is true, the recipe item is destroyed when its budget is spent.
7. This counter is independent of `recipeItemUsage.timesUsed` (craft-charges); the two are never conflated.
8. When `caps.learn.learnScope === "total"`, the learn budget is NOT this per-document counter but a single GM-authoritative shared world pool keyed `system::defId` (the recipe-item party learn pool); every actor's learns draw from that one budget.

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
A managed component matched purely by name (no `registeredItemUuid`/alias ids) stops matching its component once renamed, so a GM clearing the flag must also restore the original name to regain `damaged`-tier recognition.

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
A **Tool** interactable opens the unified window on the **Crafting** tab and injects the activated tool as a session-scoped `activeCanvasTool` (virtual-present) on activation.
The Crafting tab is a shipped player surface (recipe browsing, detail, shopping list, craft execution, run summary), and the injected tool participates in tool-availability checks (`presentTools` derived from `_activeCanvasTool` in `src/ui/SvelteFabricateApp.svelte.js`).
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

### Region-level ownership & provenance-aware deletion (issue 533)

A `fabricate.interactable` region reaches Fabricate through two different lifecycles that MUST be distinguished at delete time.
A **CREATED** region is spawned by a drag/drop or click-to-place placement and exists ONLY to be the interactable, so Fabricate owns the whole Region.
A **PROMOTED** region is a region the user already drew for another purpose (lighting/darkness, conditions, a third-party module) that a GM points Fabricate at via the Manage panel's "Promote region to interactable"; Fabricate owns only the one behaviour it attached, and the Region plus every other (foreign) behaviour on it are the user's data.

```js
region.flags.fabricate = {
  interactableRegion: true   // stamped ONLY on a region Fabricate CREATED
}
```

Requirements:

1. **Ownership is stamped at create.** When Fabricate CREATES a region (`_spawnInteractableRegion`) it stamps `flags.fabricate.interactableRegion = true` (`buildInteractableRegionFlags`).
Promotion attaches a behaviour to the user's existing region and MUST NOT stamp this flag.
2. **Deletion removes only what Fabricate added.** Deleting an interactable (from the config panel or the Manage panel) routes through the pure decision `decideInteractableDeletion` (region flag + behaviour list + target behaviour → a plan) and the thin edge `executeInteractableDeletion` (`src/canvas/regions/interactableDeletion.js`).
A region that is **Fabricate-created AND carries no foreign behaviours** is deleted wholesale (`region.delete()`).
Otherwise — a **promoted** foreign region, OR a region also carrying non-Fabricate behaviours — only Fabricate's `fabricate.interactable` behaviour(s) are removed (`region.deleteEmbeddedDocuments('RegionBehavior', …)`), leaving the Region and every foreign behaviour intact; a now-stale ownership stamp on a kept region is cleared (`unsetFlag`).
The confirm copy states which will happen (whole region vs only the Fabricate interactable).
3. **Safe legacy default.** A region created before this flag existed carries no ownership stamp, so its provenance is unknown; unknown provenance is treated as **promoted (do-not-destroy)** — the conservative choice that can never destroy user data.
The cost is that a legacy Fabricate-created region may be left behind as an empty Region after its interactable is removed; that is a harmless leftover the GM can delete by hand, never data loss.

### Uninstall-safe world cleanup (issue 535)

`fabricate.interactable` is a **module-defined RegionBehavior sub-type** (declared in `module.json`'s `documentTypes.RegionBehavior.interactable`, auto-namespaced, registered at runtime on `CONFIG.RegionBehavior`).
When Fabricate is **disabled or uninstalled** Foundry can no longer construct the sub-type, so every such behaviour becomes an unregistered-sub-type document that logs `"fabricate.interactable" is not a valid type` on every load of its scene, with no core UI to remove it (foundryvtt#11234).
On Foundry **< 14.360** the invalid behaviour cascade-invalidates its parent Region and the whole Scene; on **≥ 14.360** it is quarantined (raw source preserved) and only logged.
This is documented core behaviour for module sub-types — Foundry does NOT remove them on disable — not a Fabricate registration bug.

Requirements:

1. **GM-invocable cleanup.** Fabricate MUST expose a GM-invocable, uninstall-safe cleanup — `game.fabricate.cleanupInteractables()` — that a GM runs BEFORE disabling/uninstalling.
It is a plain API method (no rendered UI control), runnable from a macro/console, GM-gated, no-throw, and confirmed via `DialogV2` with a summary (behaviours + markers + scenes).
2. **Removes only what Fabricate owns.** The cleanup removes EXACTLY: every `fabricate.interactable` behaviour (`isInteractableRegionBehavior`, via `region.deleteEmbeddedDocuments('RegionBehavior', …)`), Fabricate's own **Tile/Drawing** markers (`isInteractableVisual` reverse flag, via `scene.deleteEmbeddedDocuments`), and clears the region-ownership stamp (`flags.fabricate.interactableRegion`).
The pure decision `decideWorldInteractableCleanup` (scenes → id-keyed removal set + summary) and the thin edge `executeWorldInteractableCleanup` live in `src/canvas/regions/interactableCleanup.js`.
3. **Never deletes user data — with one documented asymmetry.** The cleanup NEVER deletes a parent Region (even a Fabricate-created one — an empty leftover region is a harmless artefact, unlike single-interactable deletion which may delete a created region wholesale), NEVER removes a foreign behaviour, and NEVER deletes a **Token** marker.
A Token marker is an existing GM-owned token the GM relinked, so cleanup only CLEARS its reverse flag (`buildClearLinkedVisualFlags`) and leaves the token intact.
The **asymmetry**: Tile/Drawing markers carrying the reverse flag ARE deleted — and because `relinkVisual` stamps the reverse flag onto ANY selected Tile/Drawing/Token, a Tile/Drawing the GM DREW THEMSELVES and then relinked as a marker is deleted too (only Tokens are exempted from deletion).
This matches issue #535's explicit "delete tiles/drawings" scope; the GM must **unlink** such a hand-drawn marker (config panel "Remove") before cleanup/uninstall to keep it, and the docs state this caveat.
Selection is fail-closed: a document without a well-formed reverse flag (`readLinkedVisualRef` → non-empty `linkedRegionUuid` + `linkedBehaviorId`) is never selected.
Legacy/unflagged provenance is handled conservatively (behaviour removed, region kept), and an empty world is a no-op.

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

### Item → Tool Drop Resolution

When a GM drops a real Foundry Item onto the canvas, the dropped Item is resolved to a Tool through the list-aware, system-scoped component resolver (**Component Item Matching**) above, against the system's component set: the item is resolved once to the single component it IS, and the drop spawns the Tool whose `componentId` equals that resolved id.
An Item whose durable identity names a different component is NOT resolved to a Tool via an inherited, transitive `_stats.duplicateSource`.

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

The crafting-check macro / built-in game-system adapter path has been removed.
The GM-authored roll formula is now Fabricate's built-in check: a plain dice expression the engine rolls and evaluates natively, giving GMs a low-complexity check without writing a macro or relying on a dnd5e/pf2e stat adapter (see requirement 30 in *Data Models*).
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
5. Otherwise, `outcome` must equal a `ResultGroup.name` for the active recipe under the same normalization rules (explicit `checkOutcomeIds` tier assignment wins first; see `resolution-modes/spec.md`).
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

- Resolution mode semantics and mode validation: `resolution-modes/spec.md`
- Recipe and step execution semantics: `recipes-and-steps/spec.md`
- Recipe visibility and learning semantics: `recipe-visibility/spec.md`
- Destructive changes and clean-up semantics: `destructive-changes-and-migrations/spec.md`

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
| CraftingSystem | `essenceDefinitions` | Array of essence definitions, emitted unconditionally by normalization (empty when `features.essences` is off); supersedes the derived `essences` id-string alias |
| CraftingSystem | `visibilityMode` | Canonical flat recipe-visibility strategy (`global`/`restricted`/`item`/`knowledge`); supersedes legacy `recipeVisibility.listMode` + `knowledge.mode` |
| IngredientSet | `ingredientGroups` | Array of ingredient group objects |
| Recipe | `resultGroups` | Array of result group objects |
| Recipe | `access` | Per-recipe restricted-mode grants (`{ characterIds, playerIds }`); read-forward from legacy `visibility.allowedUserIds` |
| ~~Recipe~~ `recipeItemId` | *(legacy)* | Removed by the 1.13.0 migration; membership inverted to `RecipeItemDefinition.recipeIds` |
| EssenceDefinition | `sourceComponentId` | Managed component source reference |
| EssenceDefinition | `sourceItemUuid` | Resolved or legacy template item evidence for effect transfer |
| Component | `originItemUuid` | Template item reference (registered-entry source ref; renamed from `sourceItemUuid` in issue 560) |
| RecipeItemDefinition | `originItemUuid` | Template item reference (registered-entry source ref; renamed from `sourceItemUuid` in issue 560) |
| RecipeItemDefinition | `recipeIds` | Canonical recipe↔book membership (many-to-many); inverts the removed `Recipe.recipeItemId` |
| RecipeItemDefinition | `caps` | Per-recipe-item use/learn caps (`caps.item`, `caps.learn`); canonical cap fields `whenSpent`, `limitLearning`, `learnsAllowed`, `learnScope` (legacy mirrors `destroyWhenExhausted`, `limitRecipes`, `maxRecipes`, `learningMode`) |
| CraftingSystem | `itemTags` | Array of tag strings |
| Item flag | `toolUsage.timesUsed` | Tool usage tracking (legacy `catalystItemUsage.timesUsed` read as fallback) |
| Item flag | `recipeItemUsage.timesUsed` | Recipe-item craft-charge tracking (`RecipeItemDefinition.caps.item` cap) |
| Item flag | `recipeItemLearning.learnedCount` | Recipe-item learn-cap tracking (`RecipeItemDefinition.caps.learn` cap), per document instance |

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
| `associatedSystemItemId` | `originItemUuid` | Component | Constructor reads as fallback for `originItemUuid` |
| `tags` | `itemTags` | CraftingSystem | Normalization reads `tags` as fallback for `itemTags` |
| `catalystItemUsage` / `catalystUses` (bare number) | `toolUsage.timesUsed` | Item flag | Runtime reads `toolUsage` first; when absent, falls back to `catalystItemUsage` (and the bare-number `catalystUses`, coerced to `{ timesUsed }`) so migrated `limitedUses` tools preserve in-flight usage. Legacy flag is never back-filled or cleared. |
| `sourceUuid` / `sourceItemUuid` / `fallbackItemIds` (pre-`1.16.0`) | `registeredItemUuid` / `originItemUuid` / `aliasItemUuids` | Component, RecipeItemDefinition, Tool | Issue 560 rename: normalization reads the old names new-name-first, old-name-tolerant, and emits the new names |
| `linkedRecipeItemUuid` | `recipeItemId` | Recipe | Migration/import paths synthesize or resolve a `RecipeItemDefinition` by `originItemUuid` within the recipe's crafting system |
| `IngredientSet.essences` (map) | essence ingredient options (`match.type === "essence"`) | IngredientSet | The 1.17.0 migration rewrites each positive `essences[essenceId]` entry into a single-option essence group; constructors keep reading the map for one release |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Transitional Write Aliases (Scheduled for Removal)

The following aliases are currently emitted in `toJSON()` / normalization output alongside their canonical counterparts.
These are transitional and will be removed in a future version once all dependent UI code paths have been updated:

- `systemItemId` (emitted alongside `componentId` in Tool, Ingredient, Result)
- `essences` (emitted by `IngredientSet.toJSON` as `essences: this.essences`, `{}` post-migration; superseded by essence ingredient options — one-release window)
- `essences` (CraftingSystem: derived id-string array equal to `essenceDefinitions.map(def => def.id)`, emitted alongside canonical `essenceDefinitions`; stripped on export by `stripTransitionalAliases` and re-derived after component deletion — not a Record, never feature-gated)
- `ingredients` (emitted alongside `ingredientGroups` in IngredientSet)
- `results` (emitted alongside `resultGroups` in Recipe)
- `associatedSystemItemId` (emitted alongside `sourceComponentId` in EssenceDefinition and alongside `originItemUuid` in Component)
- `tags` (emitted alongside `itemTags` in CraftingSystem normalization)
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

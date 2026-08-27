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
  // required tools break; each Tool's own mode is ignored and each Tool's
  // separate checkBreakable flag decides whether it participates.
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
    refundOnPlayerCancel: boolean, // default true (absent key defaults on; an explicit false is honoured); when a player cancels an in-progress craft, ON restores the consumed ingredients + refunds the spent currency, OFF forfeits them
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
  membershipResolvesByRecipeIds?: boolean, // default absent (falsy = legacy basis). Monotonic per-system marker (issue 1010/1011) recording that recipe↔book membership resolves through RecipeItemDefinition.recipeIds rather than the legacy recipe.recipeItemId scalar. Set by the first write to any definition's recipeIds, backfilled on load as a monotone OR over the persisted value, and NEVER cleared — see recipe-visibility/spec.md and ui-integration/spec.md.

  // NO `characterPrerequisites` KEY, and no `modifiers` key (issue 1308). Both libraries
  // moved to the `characterLibraries` WORLD setting, so `_normalizeSystem` emits neither
  // and its allowlist rebuild sheds any surviving legacy copy on the next save. See
  // ## CharacterLibraries, ## CharacterPrerequisite and ## ModifierLibrary below; unlike
  // currency and travel, NO participation flag stays behind on the crafting system.

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
    // lives on Component.salvage.dcOverride. Salvage has no recipes, so salvage DC
    // RESOLUTION reads no `tiers`, `dcMode` or `macroUuid` on either slot (the routed
    // slot gained its own `dcMode`/`macroUuid` in issue 1096): `_resolveSalvageDc` is
    // arithmetic over the per-component override and the slot's own `dc`. That is a
    // statement about DC resolution ALONE and not a licence to drop the fields:
    // `simple.tiers` is the preset source for the per-component salvage DC control and
    // `simple.dcMode` selects that control's system-default label, in EVERY resolution
    // mode including routed — see the Dynamic DC Macro Contract. No salvage editor
    // renders a tier table (the Checks tab mounts the simple editor with its DC-source
    // half hidden and the routed editor with tiers hidden), so neither slot's `tiers`
    // is authored there.
    simple: SimpleCheck,               // { rollFormula, dc, thresholdMode, dcMode, tiers, macroUuid, checkBreakage }
    routed: RoutedCheck,               // { type, rollFormula, dc, thresholdMode, dcMode, macroUuid, tiers, relativeOutcomes, fixedOutcomes, checkBreakage }
    progressive: {
      awardMode: "partial" | "equal" | "exceed",
      rollFormula: string,             // default ""; total drives progressive awarding
      checkBreakage: CheckBreakage,    // unified per-check trigger list (force award-all/none and/or break tools)
    },

    // The SELECTION TRIPLE over the WORLD modifier library (issues 1095, 1117, 1308), the SAME
    // three keys `craftingCheck` carries below and emitted by the SAME shared derivation
    // (`CraftingSystemManager._normalizeCheckModifierSelection`). It is spelled out on
    // every activity rather than left implicit: the library is shared, the SELECTION is
    // not, and a reader who found it on one block and not on another would reasonably
    // conclude this activity inherits crafting's rule. See `craftingCheck` for the full
    // semantics of each key.
    defaultModifierPolicy?: "addAll" | "highest" | "bySubject" | "playerPicks",  // default "addAll"
    defaultModifierIds?: string[],  // default []
    maxModifierPicks?: number,      // positive integer; default: key absent = unlimited
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

    // The SELECTION TRIPLE over the WORLD modifier library (issues 1095, 1117, 1308), the SAME
    // three keys `craftingCheck` carries below and emitted by the SAME shared derivation
    // (`CraftingSystemManager._normalizeCheckModifierSelection`). It is spelled out on
    // every activity rather than left implicit: the library is shared, the SELECTION is
    // not, and a reader who found it on one block and not on another would reasonably
    // conclude this activity inherits crafting's rule. See `craftingCheck` for the full
    // semantics of each key.
    defaultModifierPolicy?: "addAll" | "highest" | "bySubject" | "playerPicks",  // default "addAll"
    defaultModifierIds?: string[],  // default []
    maxModifierPicks?: number,      // positive integer; default: key absent = unlimited
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

    // Per-resolution-mode check sub-objects authored in the GM Checks studio; the
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

    // THE SELECTION TRIPLE, and only it (issues 1095, 1117, 1308). The LIBRARY moved UP to
    // `CraftingSystem.modifiers` in `1.22.0` — because salvage and gathering select over the
    // same entries, so it can belong to no one activity — and then OUT of the crafting system
    // altogether in `1.28.0`, to the `characterLibraries` world setting (## ModifierLibrary).
    // Each relocation DELETES the key it moved from, this level's `checkModifiers` included.
    // The SELECTION stayed here through both moves: the library is shared, the selection is
    // not. The identical triple appears on
    // `salvageCraftingCheck` and `gatheringCraftingCheck`, emitted by ONE shared
    // derivation so the three whitelist rebuilds cannot drift.
    //
    // The COMBINATION RULE, owned by the SYSTEM alone (issue 1055). It states BOTH how
    // the eligible values reduce to one number AND who selects them:
    //   addAll      — sum this activity's own default set. Nobody selects.
    //   highest     — max(...) of this activity's own default set. Nobody selects.
    //   bySubject   — the record being resolved selects, at authoring time: the recipe on
    //                 crafting, the component on salvage, the gathering task on gathering.
    //                 Rendered "By recipe" / "By component" / "By gathering task".
    //   playerPicks — the PLAYER selects, at roll time.
    // `bySubject` is a first-class rule, NOT a delegation of authority: a subject chooses
    // WHICH modifiers apply, never HOW they combine. Both selecting rules SUM what was
    // picked and are bounded by `maxModifierPicks` below. An unrecognized value falls
    // back to "addAll"; a subject never overrides this field. The pre-1095 `byRecipe` is a
    // legacy READ alias for `bySubject` and is never re-emitted. `playerPicks` resolves
    // deterministically to the best legal selection whenever the roll-time prompt is not
    // offered (resolution-modes/spec.md), and is available on all three activities.
    defaultModifierPolicy?: "addAll" | "highest" | "bySubject" | "playerPicks",  // default "addAll"
    defaultModifierIds?: string[],  // default []; catalogue entries applied by default
    // The cap on how many modifiers a SELECTING rule (`bySubject`, `playerPicks`) may
    // pick; meaningless under `addAll`/`highest`, and stored regardless of the current
    // rule so flipping between the two selecting rules does not destroy it.
    // PRESERVES ABSENCE — only a positive integer is attached, so `null`, `0`, `2.5` and
    // junk all normalize to the SAME shape, key absent. Absence means UNLIMITED
    // (`Infinity`), resolved at `resolveMaxModifierPicks` (`checkModifierResolver.js`)
    // and never defaulted at this shape: a check never asked the question must not
    // silently acquire a bound that truncates subject picks already on disk. See
    // resolution-modes/spec.md §Check Source and the `1.20.0` migration below.
    maxModifierPicks?: number,  // positive integer; default: key absent = unlimited
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
  //     dcMode: "static" | "dynamic",              // default "static" (crafting only)
  //     macroUuid: string | null,                  // dynamic-DC macro (crafting only)
  //     tiers: { id, name, dc }[],                 // recipe-DC overrides (crafting only)
  //     relativeOutcomes: { id, name, success, breakTools, dc }[],
  //     fixedOutcomes: { id, name, success, breakTools, start, end }[],
  //     checkBreakage: CheckBreakage,              // unified per-check trigger list
  //   }
  //   // (The progressive check sub-object likewise carries a checkBreakage block.)
  //
  //   // Unified per-check trigger list (issue 419 recombine). Each trigger pairs an
  //   // expressive dice-matching condition with three effects: force an outcome,
  //   // step the routed outcome tier, and/or break tools. It is the single mechanism
  //   // that subsumes the former per-die `DiceCrit` table, the separate tool-breakage
  //   // trigger list, and the retired routed `natStepping` boolean.
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
  //     tierStep: TierStep,                        // issue 975; ALWAYS present, defaulting
  //                                                // to the inert record. Routed-only in
  //                                                // effect (simple/progressive have no
  //                                                // tiers) but persisted uniformly, and
  //                                                // NOT pinned for an outcomeTier
  //                                                // condition — a step reads the rolled
  //                                                // tier, so it is not circular.
  //     breakTools: boolean,                       // default false; breaks every required
  //                                                // tool. Authored + applied ONLY under
  //                                                // checkDriven authority.
  //   }
  //   // The third trigger effect (issue 975): move the ROLLED outcome tier to the
  //   // FINAL tier. Flat rather than a discriminated union, so switching mode in the
  //   // editor never destroys the other mode's operand — the retention precedent
  //   // `_normalizeRoutedOutcome` sets by keeping both `dc` and `start`/`end` across a
  //   // `type` switch.
  //   TierStep = {
  //     mode: "none" | "target" | "up" | "down",   // default "none" (inert); an unknown
  //                                                // value collapses to "none"
  //     steps: number,                             // default 1; clamped to an integer >= 1.
  //                                                // A MAGNITUDE, never a comparand —
  //                                                // `condition.value` owns that word.
  //     tierId: string | null,                     // default null; `target` operand.
  //                                                // Preserved VERBATIM but UNVALIDATED at
  //                                                // normalize time (the normalizer cannot
  //                                                // see the outcome lists) and no-ops at
  //                                                // runtime, the graceful treatment
  //                                                // `minOutcomeId` already documents.
  //   }
  //     // Legacy migration (on read, no versioned migration): an old `DiceCrit`
  //     // { die, raw, success, breakTools } becomes a `diceGroup`/"total"/"==" trigger
  //     // (groupId = first matching evaluated-term index for that plain die) with
  //     // outcome = success ? "success" : "failure" and breakTools carried through;
  //     // crits on modified pools (keep/drop/explode/reroll) are crit-ineligible and
  //     // dropped. A routed outcome's `breakTools` remains the only `data.breakTools`
  //     // source (the routed per-tier legacy bridge), honoured by the shared evaluator
  //     // as an implicit always-on trigger under checkDriven only.
  //     // Also on read (issue 975): a routed check's legacy `natStepping: true` becomes
  //     // the trigger PAIR that reproduced it — `natstep-up` (allDice == 20, tierStep
  //     // up 1) and `natstep-down` (allDice == 1, tierStep down 1) — both conditioned on
  //     // the FIRST d20 group in the formula. Emitted only when the boolean is true, the
  //     // check is not `fixed` (a fixed check's flag was already inert, so this is a
  //     // conversion-TIME snapshot; the converted triggers are type-agnostic thereafter
  //     // and a later relative→fixed switch carries the step across by design), and the
  //     // formula carries a d20 group. A duplicate-d20 formula (`1d20 + 1d20`) targets
  //     // the first group only — the caveat the crit conversion already carries — and
  //     // the crit conversion's plain-die filter is deliberately NOT applied, because
  //     // `2d20kh1` was the design target of the old kept-face rule. The ids are STABLE
  //     // LITERALS rather than randomID(), since this conversion has no source id and a
  //     // trigger id reaches chat and captured result data. `outcome` and `breakTools`
  //     // are written EXPLICITLY so the legacy break-only test cannot mistake a
  //     // synthesised trigger for a pre-recombine one and break tools on a natural 20.
  //     // The `allDice` aggregate fails open (no match) when no per-die faces exist, so
  //     // a headless or stubbed roll cannot fire these triggers; against the old
  //     // one-kept-face rule this WIDENS the match on an un-kept multi-die d20 pool (a
  //     // plain `2d20` now fires when every active die shows 20), which the condition
  //     // DSL cannot express otherwise. Ordering is [...crits, ...natStep, ...authored],
  //     // the key is stripped from the output, and the conversion is idempotent.
  //     // Gathering converts identically — no gathering check has ever persisted the
  //     // field, but a hand-edited or imported stray key converts on the same pass that
  //     // strips it, which is intended now that stepping is not activity-scoped.
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

    // PARTICIPATION ONLY. The coin ladder, the spend strategy, the selected provider and
    // the GM macro set are WORLD scope (see CurrencyConfig below): a world runs exactly
    // ONE Foundry game system, so there is exactly one way actors store coins and two
    // crafting systems cannot meaningfully disagree about how to read the same actor's
    // purse. This block says only whether THIS system charges the world's currency.
    currency: {
      enabled: boolean, // default false
    },
  },

  // Present only when features.gathering is true. Per-system gathering geography.
  // NOTE: a Gathering Realm is the Fabricate geography concept; it is distinct from a
  // Foundry Scene Region (RegionDocument / Region Behaviour), which a realm maps to
  // many-to-one through sceneMappings[].sceneRegionUuid.
  gatheringRealmSettings?: GatheringRealmSettings, // { enabled } only; default false. The realm library, reveal mode and modifier visibility are world scope — see TravelConfig
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
14. When `features.gathering` is true, a crafting system may carry `gatheringRealmSettings`, which holds the participation flag `enabled` (default `false`) and nothing else.
    A system does NOT own a realm library: realms, the reveal mode and the modifier visibility are world scope (see _TravelConfig_).
    `enabled` decides consumption only — whether the party's current location gates this system's environments, what its UI shows, and whether its environments offer the realm controls — so the world's realms stay authorable and resolvable whether or not any system has opted in.
    The normalizer is an allowlist rebuild that does not emit `gatheringRealms`, `gatheringRegions` or `gatheringRegionSettings`, so the first system save after the `1.27.0` migration is what removes a stale per-system copy.
    That omission is destructive by design and is why the migration must run before any system save.
    A **Gathering Realm** is the Fabricate gathering-geography concept (renamed from **Gathering Region** to remove the collision with Foundry's own first-class **Region** — `RegionDocument` / Region Behaviour).
    Realm is geography only and is NOT a composition axis — composition matches by biome + danger only, and the legacy region vocabulary has been removed.
    The legacy `GatheringEnvironment.region` string is **inert**: it is preserved on read for back-compat but is not a composition input and is not editor-surfaced; realm membership is expressed through `includedRealmIds` (multiple `GatheringRealm` ids).
    A startup migration derives `GatheringRealm` records from the legacy per-system region vocabulary and maps `environment.region` → `includedRealmIds` (orphan free-text region strings are left inert).
    Realm records are scoped to the owning system, must not be shared by reference across systems, and ride along with crafting-system import/export (a pre-unification export is upgraded idempotently on the next migration run after import).
    A Realm maps to Foundry Scene Regions many-to-one through `sceneMappings[].sceneRegionUuid`; those Foundry-bridge fields keep their `sceneRegionUuid`/`sceneUuid` names.
    Record shapes and behavior are defined in `gathering-and-harvesting` (_Location-Aware Gathering_).
    Fabricate-managed **Gathering Parties** are NOT part of the crafting system — they are world-level records (world setting `fabricate.gatheringParties`; see the Gathering Party requirements in `gathering-and-harvesting`) and are excluded from system import/export.
    Beyond the `system` object and its realms, per-system gathering environments (the `gatheringEnvironments` world setting) and the per-system `gatheringConfig` slice (rules, conditions, vocabularies, economy, reusable tasks, reusable events, character modifiers) ride along with crafting-system import/export; the runtime-versus-authoring boundary, migration, reference reporting, and copy-mode rebinding rules are defined in `import-export` (Specification 010).
    The `gatheringParties` exclusion above still holds.
15. `CurrencyConfig.units[]` — the WORLD currency configuration (see the CurrencyConfig section) — defines Fabricate's built-in currency unit profile for currency requirements (salvage currency requirements today; recipe steps no longer carry a currency requirement).
    A crafting system owns no `units[]` of its own; it contributes only `requirements.currency.enabled`, and the runtime composes the two at one chokepoint (`getCurrencyRequirementConfig`), taking `enabled` from the system and everything else from the world config.
16. Currency unit profiles must be acyclic.
    Each connected conversion branch must resolve to exactly one terminal base unit.
17. Legacy `provider === "system"` configs with `systemAdapter === "dnd5e" | "pf2e"` normalize to the matching seeded currency unit profile when no explicit units exist.
    The resolution belongs to `normalizeWorldCurrencyConfig` rather than to the crafting-system normalizer, because a legacy block can now only reach normalization through the world config — carried up by the `1.26.0` migration or by the export upcast.
18. Built-in currency provider selection (legacy `provider`/`systemAdapter`) and the legacy single currency macro UUID field are legacy inputs only; the normalized world currency config does not emit them. (The `providerId` and `macros` fields below are distinct first-class fields, not the legacy inputs.)
19. `CurrencyConfig.spendStrategy` selects how currency is read and spent, once per world.
    It is one of **three peer top-level strategies** — `"actorProperty"` (default), `"actorInventory"`, or `"macro"`; any other value normalizes to `"actorProperty"`.
    A legacy nested config (`"actorInventory"` with the retired `inventoryMode === "macro"`) maps forward to the peer `"macro"` strategy on normalization; `inventoryMode` is never re-emitted.
    The GM selects the strategy directly in both dnd5e and pf2e worlds (it is no longer derived solely from preset seeding).
    Each strategy is realized by a symmetric coin spender behind a common `{ check(actor, requirement, ctx), spend(actor, requirement, ctx) }` interface (the `actorProperty`/`actorInventory` spenders also retain `readCoins` as the affordability primitive their `check` wraps); a consumer resolves the spender by `spendStrategy` and drives both the up-front affordability check and the deduction uniformly. (These spenders are reusable infrastructure; the step-level integration that previously drove them has been removed, and component-level currency spending is a deferred follow-up.) - `"actorProperty"` (the generic `ActorPropertyCoinSpender`) reads each unit's balance from its `actorPath` and spends through a single batched `actor.update(...)`, making its own change across configured sub-units.
    This is the dnd5e and general behavior. - `"actorInventory"` uses a preconfigured provider.
    The generic `ActorInventoryCoinSpender` delegates the system-specific coin I/O to a per-system coin adapter resolved by `game.system.id`.
    Providers are registered in a pure, Foundry-free registry (`getCurrencyProvidersForFoundrySystem`, `getDefaultProviderId`, `resolveProvider`); the only registered provider is the pf2e inventory adapter (an internal `systemId → adapter` map, not a third-party plugin registry), which reads coins from the pf2e inventory aggregate (`actor.inventory.coins`) and spends through `actor.inventory.removeCoins(...)`, letting pf2e make its own change and report insufficient funds; Fabricate does not run its own change-making on this path. `providerId` is stored and selectable but the runtime still resolves the adapter by `game.system.id` (one provider per system today).
    Systems with no registered provider (e.g. dnd5e) surface an empty-provider callout steering the GM to the `"macro"` strategy.
    When no adapter is registered for the active system, the spend fails loudly with a clear message rather than silently succeeding. - `"macro"` drives currency through GM-supplied macros.
    Because the macro receives the actor and does whatever it needs, macro spending is **not inventory-specific** and is a peer top-level strategy rather than a sub-mode of `"actorInventory"`. `MacroCoinSpender` runs the `canAfford` macro for the affordability check and the `decrement` macro for the deduction, passing each a context `{ actor, cost: [{ abbreviation, amount }], units: [{ id, abbreviation, label }], requirement, recipe, craftingSystem, caller }`.
    `caller` is `"craft"`, `"award"` or `"consume"` and says WHO is asking: `"craft"` on every recipe-keyed check, spend and refund; `"award"` on the world-scoped affordability check AND on the world-scoped currency credit (see the _CurrencyConfig_ section); and `"consume"` on the pooled holdings pair (see `companion-api`).
    On every non-`"craft"` occasion `recipe` and `craftingSystem` are `null`.
    The token is positive on EVERY arm rather than inferred from those nulls, because a macro can test a token, while a null recipe is indistinguishable from an occasion the macro has never heard of.
    ONE token covers the pooled READ and the pooled DEBIT rather than two, because they are the halves of a single companion act and a macro branching on `caller` wants one branch for both; what separates them is the macro KEY, so a macro can still tell "you are being asked" from "you are being told" without a fourth token.
    It is named `"consume"` and not `"cost"` because `"craft"` and `"award"` name the ACT rather than the thing being paid.
    The discriminator is therefore the PAIR `(macro key, caller)` rather than either half alone, and the occasions it separates are: `canAfford` with `"craft"`, the craft-time affordability gate; `canAfford` with `"award"`, the published affordability check; `decrement` with `"craft"`, the craft-time spend; `decrement` with `"consume"`, the pooled holdings debit; `balance` with `"consume"`, the pooled holdings read; `increment` with `"craft"`, the player-cancel refund; `increment` with `"consume"`, the pooled debit's own intra-call give-back; and `increment` with `"award"`, the published currency credit.
    **That last cell is the one pair that is not unique**, and it is declared rather than left to be discovered: a pooled consume that has to unwind a currency cost it already settled gives it back THROUGH the published credit, so a GM's `increment` macro sees `"award"` for that unwind exactly as it does for a credit a companion asked for outright.
    A macro that needs to tell them apart cannot do it from the context, and does not need to: both are Fabricate returning coin it is entitled to return, and the `increment` macro's job is the same in each.
    Because `recipe` and `craftingSystem` are `null` on every `"award"` and `"consume"` occasion, a macro that dereferences `context.recipe` without first testing `caller` throws on every one of them.
    A macro return of `true`, or an object with a truthy `success`/`canAfford`, passes; `false`/`null`/a thrown error (or a falsy `success`/`canAfford`) fails and surfaces the macro's `message` to the player.
    Under `caller: "craft"` a failure aborts the craft before ingredient consumption.
    Under `caller: "award"` a macro that THREW answers a refusal DISTINGUISHABLE from a genuine shortfall: `MacroCoinSpender` marks its catch branch `thrown: true`, and the affordability check reports that the question could not be answered rather than that the actor cannot pay.
    A spender carries TWO markers rather than one, and `caller: "award"` now covers two occasions rather than one, so the write-truth rule below is about both: `thrown: true` says the mechanism delivered no answer, and `wroteNothing: true` says Fabricate can PROVE nothing was written.
    Both markers are additive, and the craft paths — which read only `valid` and `message` — are unaffected by either.
    A spender's `refund` reports what it OBSERVED.
    An `actor.update` that Foundry DISCARDED — because the configured `actorPath` is not in the actor's data model — is reported as _nothing was written_, never as success; an `actorPath` holding a value that is not a number is reported the same way, and is detected before any write is attempted; an inventory adapter that threw part-way is reported as _unknown_, not as a decline; and a macro that could not be found or run is reported as _nothing was written_, distinctly from a macro that ran and threw.
    The `wroteNothing` marker is what carries that last distinction, and a reader of both members tests it FIRST.
    Three of the four unrunnable spellings additionally carry `thrown: true` — the two that throw today, plus a non-`script` macro, whose command is chat text compiled as JavaScript and so throws for any body that is not also valid JS — solely so that the shipped affordability answer for each of them does not move; the blank-command spelling carries `wroteNothing` alone, for the same reason in the other direction.
    **This MOVES a shipped answer, and that is declared rather than discovered:** a player cancelling a craft in an `actorProperty` world whose `actorPath` is mis-typed now receives a PARTIAL refund rather than a reported full one, with a console error, because a discarded write was never a refund.
    The `increment` macro performs THREE occasions, not one.
    The first is the player-cancel refund: when a player cancels an in-progress craft and the system's `features.refundOnPlayerCancel` policy is on, `MacroCoinSpender` runs the `increment` macro to return the spent currency (the inverse of `decrement`).
    The second is the world-scoped currency credit published to a companion module, which reaches this same macro with `caller: "award"`.
    The third is a pooled holdings consume giving coin back — either the currency leg's own intra-call restore, at `caller: "consume"`, or the member's outer unwind, which routes through the published credit and therefore arrives at `caller: "award"`.
    It remains optional — a macro-mode system with no `increment` macro simply cannot refund a cancel, and the reversal reports that failure rather than aborting.
    The published credit answers such a world with _the world cannot express this credit_, never with _the spender declined_, because `increment` is optional and a missing one is therefore a documented-normal world state rather than a broken one.
    **A pooled holdings consume goes further and refuses to take currency from that world at all**, up front and before the pool is read, answering `creditNotConfigured` having written nothing: taking coin a world has published no way to return is the one failure a member that deletes may not risk, and the refusal reads world configuration alone so it never needs a reading to decide.
    That argument is `increment`'s and `balance`'s alone among the four keys: profile validation REQUIRES `canAfford` and `decrement`, so a `macro` world missing either fails validation and answers `ladderInvalid` before a spender exists at all.
    The `balance` key ASKS rather than acts, and is therefore interpreted differently from every other key: a returned NUMBER is the answer — `0` meaning provably none — and anything else means _cannot see_, where the shared spend interpretation would read a bare `250` as a refusal.
    It is optional on `increment`'s precedent, and a world that never authors it loses the pooled read and keeps every craft-time behaviour unchanged.
    Adding the key needed no migration: normalization iterates the declared key list and runs on every read, so `macros.balance: ""` backfills in every existing world for free.
    Under the credit a THROWN `increment` macro answers that whether anything was credited is UNKNOWN, never a decline; an `increment` uuid that names nothing RUNNABLE answers _the world cannot credit_, exactly as a missing one does.
    "Nothing runnable" is defined POSITIVELY and gated before anything is run, rather than discovered from a syntax error, because `Macro#command` is a string field on EVERY macro type: a uuid that resolves to nothing, a document with no string command, a macro whose type is not `script`, and a blank command are all the same fact.
    The macro strategy is GM-only config with no separate feature flag (matching the property macros). - The pf2e currency preset seeds units with `denomination` set, selects the `"actorInventory"` spend strategy, and sets the active Foundry system's default `providerId` on the world config; the legacy pf2e system-adapter config normalizes to the same strategy (and the legacy dnd5e adapter normalizes to `"actorProperty"`).
20. `CurrencyConfig.providerId` is a trimmed string (default `""`) and `CurrencyConfig.macros` is an object of trimmed `canAfford`/`increment`/`decrement`/`balance` UUID strings (each default `""`).
    Both are always persisted and normalized, but `providerId` is only meaningful under `"actorInventory"` and `macros` only under `"macro"`; each remains inert (but preserved) under the other strategies so flipping the strategy never loses a configured provider or macro set.
    Absent fields back-compat default to `""`/empty macros with no migration.
    The retired `inventoryMode` field is never emitted.
21. **Tool-breakage authority** (`toolBreakage.authority`) is a per-system switch, normalized on read (no versioned migration): unknown or missing normalizes to `"toolSpecific"`, mirroring the inline `resolutionMode`/`salvageResolutionMode` defaulters.
    A system with no persisted `toolBreakage` reads as `{ authority: "toolSpecific" }`.
    The governing rule is that authority decides WHETHER a Tool breaks, `checkBreakage` triggers decide WHEN under `checkDriven`, and the Tool's `onBreak` decides what happens.
    `checkBreakable: false` opts a Tool out of check-driven breakage without replacing or erasing its retained tool-specific mode.
22. Authority is strictly either-or (issue 419 recombine): a check can break tools ONLY under `"checkDriven"`.
    Under `"toolSpecific"` authority, each Tool's own `breakage.mode` decides whether it breaks, and a check NEVER breaks tools — the shared `evaluateCheckBreakage` decision (including the routed per-tier `data.breakTools` legacy bridge) is not consulted.
    A trigger's forced `outcome` (success/failure/award) still applies under both authorities; only its `breakTools` effect is gated to `checkDriven`.
23. Under `"checkDriven"` authority, the active check's `checkBreakage` triggers decide whether **all required tools** break for the attempt; each Tool's own `breakage.mode` is **not** evaluated, its tool-specific usage state (including retained `limitedUses.timesUsed` counters) is not mutated, and Tools with `checkBreakable: false` are filtered out of the force-break set as immune evidence.
    The decision is made by a single shared evaluator (`evaluateCheckBreakage`) that crafting, salvage, and gathering all route through, so the decision cannot drift between surfaces.
    The evaluator additionally reads the routed per-tier `data.breakTools` as an implicit always-on trigger (the only remaining legacy bridge), so a routed tier's `breakTools` needs no separate persistence, and only an engine-evaluated roll-formula check result can force-break (`engineEvaluated === true`); any other result never force-breaks.
    A configured trigger force-breaks only when it both opts in (`breakTools === true`) AND its condition matches.
24. `checkBreakage` triggers always target **all required tools** for the attempt (never a single check-selected tool in v1).
    The `rollTotal` condition targets the raw roll total (`data.total`); `progressiveValue` targets the awarding `value` and is meaningful only on progressive checks (absent → never matches); these are distinct sources because a forced-outcome trigger can overwrite `value` while `data.total` keeps the raw roll.
    The `diceGroup` `groupId` is the index into the evaluated `roll.dice` term order (not re-parsed from the formula string), so duplicate `NdS` groups are disambiguated deterministically; per-die aggregates read active-only raw faces and fail open (no break) when no per-die data is available.
    The `outcomeTier` condition matches when the resolved tier/outcome is in `tierIds[]` or `outcomeKeys[]`; both are honoured by the engine and the normalizer, but the editor UI authors only `tierIds[]` in v1 (`outcomeKeys[]` is an engine-level capability with no editor surface) — **acknowledged limit (issue 419)**.
    An `outcomeTier` condition is evaluated at **three** seams by the one shared evaluator, each seeing progressively more of the result: it is IGNORED at the forcing seam (the routed tier is resolved after forcing, so matching on it would be circular, which is why the normalizer pins such a trigger's `outcome` to `"none"`), it IS evaluated in the tier-step pass against the **rolled** tier, and it IS evaluated for breakage at the engine seam against the **final** tier.
    So an `outcomeTier` trigger can drive a step even though it can never force an outcome (issue 975), and `tierStep` is deliberately NOT pinned the way `outcome` is.
    **Acknowledged limit (issue 975):** the two later seams read different tiers — stepping reads the rolled tier and breakage reads the final one — so a single trigger carrying an `outcomeTier` condition, a `tierStep` and `breakTools: true` may step without breaking, because the step moved the tier out from under its own breakage condition.
    There is no second breakage pass; the asymmetry is pinned by a characterization test rather than "fixed".
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
    **`craftingCheck.checkModifiers` no longer exists at this level either** (issues 1095, 1117, 1308): the library is the world `characterLibraries.modifiers`, and `_normalizeCraftingCheck` — an allowlist rebuild — does not emit the old key at all, which is why the before-any-load ordering of the `1.22.0`, `1.23.0` and `1.28.0` migrations is load-bearing rather than incidental.

30. **Built-in check contract — the authored roll formula IS the built-in check.** Fabricate's supported "built-in" check lets a GM author a plain dice expression (`craftingCheck.simple` / `routed` / `progressive.rollFormula`) that the engine rolls and evaluates natively, with no macro and no game-system adapter — the low-complexity path for GMs who do not need dnd5e/pf2e-specific stat integration (the "built-in check source" desired in the domain audit).
    A check is **usable** IFF its resolution mode carries an authored `rollFormula` that SURVIVES the retired-placeholder shim (see the _Crafting Check Macro Contract_ section); `enabled` is only the optional-check on/off toggle and is never a proxy for "the check works".
    The post-shim reading is the whole rule and not a refinement of it (issue 1094): a stored `@craftingmod` IS authored and is NOT usable, because `stripRetiredModifierPlaceholder` reduces it to `''`, and so is any formula whose placement of that placeholder the shim refuses (`1d20 * @craftingmod`, `max(@craftingmod, 2)`, `(2 + @craftingmod + 4) * 3`).
    `resolveActiveCraftingCheckFormula` and `resolveSalvageCheck` apply the shim BEFORE their emptiness test, `checksReadiness` derives `hasRollFormula` from the same post-shim value, and `CraftingEngine._runCraftingCheck` gates every runner on `checkUsable` rather than on a raw `rollFormula` — so readiness, the inert-cause projection, the recipe editor and the engine cannot disagree about whether a check works.
    Check-modifier CONTRIBUTION is independent of the formula's text: the resolved contribution is APPENDED as flavoured `[Modifiers]` terms — one `+ N` term carrying the flat sum, plus one `+ (…)` dice term per rolling entry — so a usable formula always carries it and no placeholder is authored, spent or forgotten.
    The historical `checkSource` discriminator (with its `"builtIn"` value) and the `builtIn: { ability, skill, dc, advantage }` game-system adapter sub-object are **NOT** part of the model: that adapter, together with the macro-as-check-source fields (`macroUuid`, `successMacroUuid`, `failureMacroUuid`), was removed in the 1.8.0 migration (`migrateRemoveLegacyCheckSources`).
    Normalization never emits `checkSource` or `builtIn`, and any persisted values are stripped on migration.
    The distinct `craftingCheck.simple.macroUuid` (the optional dynamic-DC macro) is a separate, retained feature and is not a check source.

31. **Tier stepping is the third trigger effect (issue 975).**
    A trigger's `tierStep` moves the routed check's **rolled** tier to its **final** tier, on every routed check (crafting, salvage AND gathering) in both the `relative` and `fixed` tier types; it is inert on `simple` and `progressive` checks, which have no tiers, and it is not gated on the tool-breakage authority.
    The effect is applied after any forced reroute and before the fixed-only `minOutcomeId` gate, so the gate judges the final tier.
    Composition over the matching triggers: relative steps sum as signed integers (`Σ up.steps − Σ down.steps`); a `target` is eligible only when its `tierId` names a tier in the array in play and the eligible target naming the LOWEST-ranked tier wins; the winning target sets the base index and the net offset applies from there; and the result clamps to the extremes of the array in play rather than no-opping.
    **Stepping is disposition-preserving:** under a forced outcome the array in play is the ranked SUBSET of tiers sharing the forced disposition, so `data.success` and the final tier's own `success` can never disagree; with no forced outcome it is the whole ranked list and both `success` and `breakTools` follow the final tier.
    A `null` matched tier steps nothing, `target` included.
    Tier order is derived in exactly ONE place (`rankedRoutedOutcomes` in `src/systems/checkRoll.js`), consumed by the forced reroute, the `minOutcomeId` gate and the step pass alike: ascending by `dc` (relative) or `start` (fixed), non-finite ranks dropped, and the FIRST authored tier kept among equal ranks; callers locate a tier in it by ID, never by object identity.
    The `minOutcomeId` gate uses that ranking only to LOCATE the required tier and still compares threshold VALUES, because `_normalizeRoutedOutcome` stores duplicate and overlapping ranges without complaint (`rangeOverlap` is a `critical` READINESS issue, never an ENFORCEMENT — readiness reports it, the normalizer still persists it and the roll path still runs), so two fixed tiers sharing a `start` compare equal and the craft passes.
    Full semantics — including the acknowledged rolled-tier/final-tier asymmetry and the relationship to `clampToNearest` — are in `resolution-modes` § Routed Tier Stepping.

32. **The persisted `tierStep` effect and the runtime `data.tierStepApplied` evidence are different shapes and deliberately different names**, exactly as `natStepping` and `data.natStep` were.
    The persisted effect is the authored REQUEST, `{ mode: "none"|"target"|"up"|"down", steps: number, tierId: string|null }`, one per trigger.
    The runtime evidence is the resolved NET result, `{ mode: "target"|"up"|"down", steps: number, fromOutcomeId: string|null, toOutcomeId: string|null, stepClamped: boolean, triggerIds: string[] }`, at most one per check result.
    Its `mode` is `"target"` whenever a target trigger won, whatever the index delta ("you were placed on Masterwork" has no direction).
    Its `steps` is the **realized** magnitude (`|toIndex − fromIndex|`), not the requested one: an `up 3` that moved one tier reports `1` with `stepClamped: true`, keeping the field consistent with `fromOutcomeId`/`toOutcomeId`, which already describe the realized move — and the chat card renders that count straight to the player.
    `triggerIds` credits the winning target plus every matched relative trigger; a losing or ineligible target contributed nothing to the move and is not credited.
    Evidence is present ONLY on a real tier change, so a fully clamped move and a cancelling `up 1` + `down 1` emit nothing and a relative mode can never report `steps: 0`.
    Gathering emits it from the shared runner but threads it to no chat surface.
    Separately, `data.blockedOutcomeId` (additive alongside `data.minTierFailed`, on a minimum-success-tier failure only) is the tier the recipe minimum BLOCKED — post-step and pre-gate.
    It is named for what the gate did to it rather than "rolled", because issue 975 mints **rolled tier** as a term of art for the PRE-step tier; the former `data.rolledOutcomeId` name would overload that word in the same change that defines it.

33. **World modifier library.** The ONE named modifier library is a WORLD record since issue 1308 and is defined in full under ## ModifierLibrary; `CraftingSystem` carries no `modifiers` key at all, and this requirement states only what the crafting system's own checks do with it.
    It is referenced by all three activity checks AND by every gathering drop row, event and stamina cost, and it is authored on exactly ONE surface (System settings › Modifiers, relocating to a World route in the follow-up change).
    It replaces `craftingCheck.checkModifiers` (moved up and deleted by `1.22.0`), `CraftingSystem.checkModifiers` and `gatheringConfig.systems[systemId].characterModifiers` (merged and deleted by `1.23.0`), and `CraftingSystem.modifiers` itself (lifted to world scope and deleted by `1.28.0`).
    An entry with an empty expression is kept, not dropped, because the authoring surface can create one.
    Each of `craftingCheck`, `salvageCraftingCheck` and `gatheringCraftingCheck` carries its own `{ defaultModifierPolicy, defaultModifierIds, maxModifierPicks? }` selection over it, normalized by ONE shared derivation (`CraftingSystemManager._normalizeCheckModifierSelection`) so the three cannot drift.
    **A default id naming nothing in the library is dropped ONLY when the Valid Id Basis for the modifier library is known-complete**, preserving order and de-duplication; when it is not, every id passes through untouched.
    That condition is not a caveat but the requirement's operative half since the library left the crafting system: the basis is now derived from a world setting a client may not have migrated, and a pass that read it as an empty library would prune every authored default on the next save (see ### Valid Id Basis and ## CharacterLibraries).
    `min` / `max` clamp that entry's CONTRIBUTION, so a bound means the same thing under every combination rule: the resolved value for a flat expression, and the ROLLED result for a rolling one, the latter expressed in the formula as `min(max((1d8), -1), 6)`.
    Both are absence-preserving in the same way `maxModifierPicks` is: only a FINITE number is attached, and `null` / `''` / `[]` are guarded explicitly before coercion because `Number()` reads all three as `0` and `0` is a real bound.
    An authored `min > max` is preserved verbatim rather than reordered, raises the BLOCKING `modifierBoundsInverted` readiness issue, and makes that entry contribute exactly 0 until it is repaired.
    A bound that is finite but NOT expressible as a dice-grammar `Constant` — `1e21`, `1e-7` — is the SECOND blocking bounds fault, `modifierBoundsUnsafe` (also `critical`), and contains that entry to 0 in the same way; it is a separate issue id rather than a second cause on the first, because the repairs differ and `1e21` is not an inversion.
    The expressibility test is the same `isDecimalSafeTermValue` the term emit asks, so the clamp and the emit cannot disagree about which numbers a formula can carry.

34. **Subject-level modifier picks.** Under the `bySubject` combination rule the pick lives on the record being resolved: `Recipe.craftingModifier.modifierIds`, `Component.salvage.checkModifierIds`, `GatheringTask.checkModifierIds`.
    All three name entries in the WORLD modifier library (issue 1308), so the pick outlives any one crafting system's authoring and a system copied between worlds keeps resolving whatever ids the destination library carries.
    None of the three is pruned against the library at all: `normalizeCheckModifierIds` filters SHAPE and not catalogue membership, so a subject pick is never a Valid Id Basis consumer and the move changed nothing about it.
    All three preserve an AUTHORED EMPTY array as a real pick of zero, distinct from absent, keyed on `Array.isArray` at entry so a malformed member cannot flip an authored empty set back to inherit.
    All three are truncated to `maxModifierPicks` at the resolver rather than only at the picker, so lowering the cap never leaves a record rolling more modifiers than the system permits and never destroys its stored picks.
    **The id COERCION is one rule for all three subjects** (`normalizeCheckModifierIds`, `src/utils/checkModifierPicks.js`): ids are TRIMMED, non-string members are dropped rather than coerced, duplicates are dropped and authored order is preserved.
    Trimming is part of the shape rather than a nicety, and its absence was a live divergence: a per-subject filter that rejected a whitespace-only id but kept `' med '` untrimmed made one authored id resolve against the catalogue on salvage and gathering and be dropped as unknown on crafting.
    **`GatheringTask` is rebuilt by THREE whitelist normalizers, not two, and all three must emit `checkModifierIds`.**
    Two are the mirrored LIBRARY rebuilds — `normalizeLibraryTask` (`GatheringRichStateService.js`) and `_normalizeGatheringTask` (`adminStore.js`) — and either one omitting the key loses the field on save, silently and in one direction only.
    The third is the ENGINE-FACING rebuild `_libraryTaskToRuntimeTask` (`GatheringRichStateService.js`), which projects a library task into the runtime task `GatheringEngine` resolves against, and its failure mode is DIFFERENT and strictly harder to see: the pick persists correctly, both library normalizers are correct, and the pick is simply never read at roll time, so `bySubject` silently resolves the activity's default set for every task.
    A world satisfying the two-rebuild reading exactly can therefore still have `bySubject` wholly broken on gathering.

35. **Failure-result policy.** `failureResultPolicy` (`'never' | 'perRecord' | 'always'`) is present on ALL THREE activity checks — `craftingCheck`, `salvageCraftingCheck` and `gatheringCraftingCheck` — and answers exactly one question: may a FAILED check produce a result at all.
    It is the ORTHOGONAL axis to failure CONSUMPTION (`recipes-and-steps` §Failure Consumption Policy), which answers what a failed attempt costs; gathering carries the produce axis and no consume axis.
    It **SELECTS an authored failure output and never fabricates one**, so `always` on a record authoring none produces nothing — which is why `perRecord` and `always` share ONE runtime predicate and differ as declarations of intent rather than as a second branch.
    All three normalizers emit it through ONE shared derivation (`_normalizeFailureResultPolicy`); because each is a whitelist rebuild, omitting it from any one drops it from that activity on the next save.
    A newly-created system defaults to `perRecord`, and an absent or unrecognized value normalizes to `perRecord` on read (the `toolBreakage.authority` precedent, requirement 21).
    An UPGRADED world never reaches that default: the `1.25.0` migration seeds `never` onto every check block already on disk (`destructive-changes-and-migrations`), so no existing world changes behaviour.

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

## CurrencyConfig

### Purpose

Define the WORLD currency configuration: the one coin ladder a world has, how coins are read and spent, the selected provider, and the GM macro set.

Currency is world scope rather than per crafting system because a world runs exactly ONE Foundry game system, so there is exactly one way actors store coins.
Two crafting systems cannot meaningfully disagree about how to read the same actor's purse, yet the per-system model invited a GM to configure the ladder repeatedly and let two systems disagree.
What a crafting system still owns is a single boolean — `requirements.currency.enabled`, whether it PARTICIPATES — which is deliberately NOT duplicated here, because a world-level flag and a system-level flag could then disagree.

It is persisted as the `fabricate.currencyConfig` world setting (`scope: "world"`, `config: false`, `type: Object`, default `{}`); `CurrencyConfigStore` is the persistence shell and `normalizeWorldCurrencyConfig` is the normalizer.

```ts
type CurrencyConfig = {
  spendStrategy: "actorProperty" | "actorInventory" | "macro"; // default "actorProperty"
  providerId: string; // default ""; meaningful only under actorInventory, always persisted
  macros: { canAfford: string; increment: string; decrement: string; balance: string }; // default all ""; meaningful only under macro
  units: CurrencyUnit[]; // default []
};
```

### Requirements

1. The config carries **no** `enabled` key.
   Participation is a per-crafting-system decision (`requirements.currency.enabled`), and keeping the flag out of this shape is what stops the two scopes from ever contradicting each other.
2. `spendStrategy`, `providerId`, `macros`, and the `units[]` profile rules are unchanged in substance by the move to world scope — only their owner changed.
   `CraftingSystem` requirements 15-20 define them and the `CurrencyUnit` section defines a unit; this section does not restate them.
3. Normalization is total and non-throwing.
   `normalizeWorldCurrencyConfig` always emits all four keys, drops an unusable unit entry (a non-object, or one resolving to an empty id) rather than repairing it while normalizing every usable entry to the canonical `CurrencyUnit` shape, maps a legacy `provider === "system"` + `systemAdapter` block forward to the matching seeded profile and spend strategy (requirement 17), and never re-emits the legacy `provider`, `systemAdapter`, or `inventoryMode` inputs.
   It is `normalizeCurrencyConfig` minus `enabled`, so the world shape and the legacy per-system shape cannot drift apart.
4. **Persistence is NOT gated on profile validity, and that is deliberate.**
   A GM authors a ladder incrementally, so the profile is transiently invalid the moment they add the first of two units or clear an `actorPath` to retype it; refusing those writes would make the editor unusable.
   The store normalizes on read AND on write and always saves, exactly as the per-system editor did before the move.
5. `validate()` (`validateCurrencyProfile`) is offered so a surface can SHOW the GM what is still wrong; it never gates a write.
   Validity is resolved where it matters — at craft time, in `resolveCurrencyContext`, which surfaces a clear error and refuses to spend rather than spending against a broken ladder.
6. The one structural refusal the store makes is a sub-unit edit that would self-reference or create a cycle, because that corrupts the graph every reader walks rather than merely leaving the ladder incomplete.
   Deleting a unit additionally strips every `contains[]` entry pointing at it, so a deletion never leaves a dangling edge for a reader to defend against.
7. **Unit `id`s are stable and are never rewritten**, because recipe currency options (`Ingredient.match.unit`) and salvage currency requirements (`CurrencyRequirement.unit`) store unit ids rather than labels, so a dropped or re-keyed unit orphans every reference to it.
   Every reconciliation of two ladders is therefore keyed by `id` and is reference-preserving: the `1.26.0` migration UNIONS units by id across every crafting system (the first system wins an id collision), and import merges an incoming ladder by id with the DESTINATION definition winning (see `import-export`).
8. Exactly one runtime chokepoint composes the two scopes.
   `getCurrencyRequirementConfig` takes `enabled` from the crafting system and `units` / `spendStrategy` / `providerId` / `macros` from this config, reaching each through a seam (`getCraftingSystemManager`, `getCurrencyConfig`) with a `game.fabricate` global fallback.
   No RECIPE-KEYED affordance, spend, or refund path reads the configuration any other way, which is why relocating it changed no engine logic.
   The paths that are not recipe-keyed are the two published world-scoped members of requirements 10 to 14, the affordability check and the currency credit — and one of those two WRITES.
   Both read the world half alone through the same `getCurrencyConfig` seam and compose nothing.
9. The config is world data and is therefore NOT part of the `CraftingSystem` record, but unlike `gatheringParties` it DOES ride along with crafting-system import/export, as its own envelope slice.
   The difference is that an exported recipe's currency cost names a unit id that is unusable unless the unit arrives with it, whereas no exported record references a party.
10. The published affordability check (`game.fabricate.checkAffordability`) and the published currency credit (`game.fabricate.creditCurrency`), both members of the companion contract — see `companion-api` — answer against the WORLD configuration ALONE and consult no crafting system's `requirements.currency.enabled` toggle.
    They are structurally unable to: neither resolves a crafting system and neither holds a system-manager seam.
    That is the correct scope because the questions they answer have no recipe — a downtime activity settled by a companion belongs to no crafting system, so there is no toggle whose answer could apply to it.
11. A caller supplies one `{ unitId, amount }` to either member and performs no aggregation of its own.
    The CHECK is LADDER-AWARE in a sense the credit is not: it compares the actor's total base value across the whole connected branch, so 10 sp affords a 1 gp cost on a ten-silver-per-gold ladder.
    The CREDIT writes ONE denomination — the requested unit's own `actorPath`, set to its current value plus the amount — and makes no change across the branch, so the branch-summing rule above is the check's alone.
12. Both resolve the unit and validate the amount BEFORE invoking any spender, and through ONE shared resolution, so the check and the credit cannot disagree about what a unit is.
    An unresolvable `unitId`, a non-positive or non-finite `amount`, an empty ladder and an invalid profile each answer `success: false` with a distinct outcome, and NEVER `affordable: true`.
    The ordering is load-bearing rather than defensive: the only unknown-unit guard on the craft path lives inside the aggregation step a single-unit question skips, and skipping it prices the cost at a base value of zero, which every purse satisfies — so an unknown unit id, and an amount of zero, would each read as AFFORDABLE.
    A refusal answers `affordable: null` rather than `false`, so "this actor is short" and "this question could not be answered" cannot collapse into the same confident no.
    The credit additionally requires a positive SAFE-INTEGER amount, refusing anything else rather than truncating it, because a truncated amount is a different amount and because `current + amount` stops being exact beyond that range; the check is deliberately NOT narrowed to match, since narrowing what a published member accepts is a `schemaVersion` bump.
13. The CHECK performs no write, and it is GM-gated at the facade, so it introduces no player-reachable trigger for GM-authored macro code with caller-chosen arguments.
    That first conjunct is what licensed a world-scoped surface reaching GM-authored macro code with caller-chosen arguments at all, and it is NOT true of the credit.
14. The CREDIT performs exactly one write per call, and it reaches a GM macro — `increment` — that has never before been reachable from a companion.
    Its safety therefore rests on TWO gates rather than one: the GM gate at the facade, and the call-site and election gate that requires a caller declaring a `broadcast` call site to be this client's elected executor.
15. A THIRD pair of world-scoped paths reads and spends against a SET of actors: the pooled balance read and the pooled debit behind the companion contract's pooled holdings members.
    They answer against the WORLD configuration alone on requirement 10's reasoning, and neither consults a crafting system's `requirements.currency.enabled` toggle.
    The pooled read is the only currency path that fires a GM's `balance` macro, and it fires it once per actor, SERIALLY: firing N of a world's own automation concurrently is a behaviour a GM cannot reason about, and the set is a party, so N is small.
16. **A pooled balance COMPOSES BY ADDITION, and that is a property of the readers rather than an assumption.**
    Every coin spender's balance read answers the actor's whole ladder branch expressed in ONE terminal base unit — 1 gp and 10 sp are the same 100 copper to all of them — so N actors' answers are N numbers in one denomination and their sum is the pool.
    No pooled path re-derives a conversion rate.
    **A pool containing ONE unreadable actor is UNREADABLE, not partial.**
    The pooled `available` is `null` the moment any actor answers _cannot see_, because a sum over a subset is a number about a different group than the caller asked about — and it is always too SMALL, so a gate built on it would refuse parties that can pay while looking authoritative.
    Per-actor readings are still reported individually so a caller can say which actor and why.
    An EMPTY actor set reads `0` rather than `null`: nothing was unreadable, and the pool provably holds nothing; refusing an empty set belongs to the calling member, not to this path.
17. **Every per-actor spend in a pooled debit is denominated in the TERMINAL BASE UNIT, and that is a correctness requirement rather than a style.**
    The recipe-shaped aggregation expresses a requirement back in a representative unit by rounding UP, which exists so a SINGLE payer is never under-charged; applied per actor across N payers the same rounding over-charges the POOL by up to `baseValue - 1` for every payer, so on a `gp → sp → cp` ladder four characters splitting one cost could be charged nearly 4 gp more than it.
    In the base unit that ceiling is the identity, so the pool pays exactly what was asked, and the spend path breaks higher denominations to satisfy a base-unit requirement, so paying in copper costs an actor holding only gold nothing extra.
    A pooled debit's amount must be a positive SAFE-INTEGER count whose product with the unit's base value is also a safe integer, on the CREDIT's rule rather than the check's: admitting a fraction would let the debit take an amount the published credit cannot express, so a companion could remove money it could not put back through the API.
    A pooled debit is all-or-nothing — the pool is tested against the total before anything is written — and a failure part-way gives back every payment that settled, in the SAME base-unit amount it was taken, which restores an actor's TOTAL exactly even though their coin MIX may differ.
    A give-back that itself FAILED is recorded and does NOT become a zero-mutation claim, and that exclusion is the whole reason the debit refuses up front in a world that cannot give coin back.
    The pooled READ, unlike the debit, converts its answer BACK into the caller's own unit and FLOORS it, because a pool holding three and a half gold pieces cannot pay four, and because deriving a sufficiency from two different denominations would err PERMISSIVE.

## TravelConfig

### Purpose

Define the WORLD travel configuration: the one realm library a world has, how realms are revealed to players, and whether realm modifiers are disclosed.

Travel is world scope rather than per crafting system because realms are geography.
Northreach Vale is the same valley whether a character is there to gather herbs or to quarry stone, yet the per-system model made a GM running two systems author it twice, link the same Foundry Scene Region to both copies, and reveal it to a character twice — and let the two copies then disagree.
The engine conceded as much: its listing realm context gave up entirely and reported no realm whenever more than one realm-enabled system existed, because it could not say which system's answer was the real one.
What a crafting system still owns is a single boolean — `gatheringRealmSettings.enabled`, whether it PARTICIPATES — which is deliberately NOT duplicated here, because a world-level flag and a system-level flag could then disagree.

It is persisted as the `fabricate.travelConfig` world setting (`scope: "world"`, `config: false`, `type: Object`, default `{}`); `GatheringRealmStore` is the persistence shell and `normalizeTravelConfig` is the normalizer.

```ts
type TravelConfig = {
  revealMode: "manual" | "onPartyTokenEntry" | "alwaysVisible"; // default "manual"
  modifierVisibility: "visible" | "gmOnly";                     // default "visible"
  realms: GatheringRealm[];                                     // default []
};
```

### Requirements

1. The config carries **no** `enabled` key.
   Participation is a per-crafting-system decision (`gatheringRealmSettings.enabled`), and keeping the flag out of this shape is what stops the two scopes from ever contradicting each other.
   A reader that takes participation from here is reading the wrong object.
2. `revealMode`, `modifierVisibility` and the `GatheringRealm` record are unchanged in substance by the move to world scope — only their owner changed, and `craftingSystemId` is dropped because a world realm has no owner.
   `gathering-and-harvesting` defines their semantics; this section does not restate them.
3. Normalization is total and non-throwing, always emitting all three keys.
4. **Realm `id`s are stable and are never rewritten**, because environments (`includedRealmIds` / `excludedRealmIds`), party overrides (`currentRealmOverride.realmIds`) and the actor discovery flag all store realm ids, so a dropped or re-keyed realm orphans every reference to it.
   Every reconciliation of two libraries is therefore keyed by `id` and is reference-preserving: the `1.27.0` migration UNIONS realms by id across every crafting system (the first system wins an id collision, and the discarded copy is REPORTED rather than re-keyed), and import merges an incoming library by id with the DESTINATION definition winning (see `import-export`).
   Realm ids are `randomID()`, so reporting EVERY collision is informative here; the `1.28.0` character-library migration refines that to CONTENT-DIFFERING collisions only, because its preset ids are stable semantic slugs that collide by design (## CharacterLibraries requirement 8).
5. The store publishes its cache BEFORE awaiting the write.
   Callers read-modify-write, so a second edit starting while the first write is in flight would otherwise read the pre-first-edit config and clobber it.
   The per-system store this replaced was safe by construction because the system manager writes its map before its own await, so publishing late here would be a regression rather than a new limitation.
   The cost is a cache briefly ahead of the setting if the write rejects, which the next load recovers; a lost update is not recoverable at all.
6. Pointing a Foundry Scene Region at a realm is a SINGLE write (`setSceneRegionLink`), because a region maps to at most one realm and so the move must both detach and attach.
   A read-modify-write loop over the realm list would lose every iteration but the last.
7. The config is world data and is therefore NOT part of the `CraftingSystem` record, but unlike `gatheringParties` it DOES ride along with crafting-system import/export, as its own envelope slice.
   The difference is that an exported environment's realm gating names a realm id that is unusable unless the realm arrives with it, whereas no exported record references a party.

## CharacterLibraries

### Purpose

Define the WORLD character libraries: the character-prerequisite library and the modifier library, which issue 1308 lifted off every crafting system.

Both are world scope because both resolve against the acting CHARACTER rather than against any one crafting system.
"Smith's Tools proficiency at least 1" is a fact about a character and `@abilities.med.mod` is a number read off a character sheet; neither becomes a different rule because the GM switched from the blacksmithing system to the alchemy system, yet the per-system model made a world running three systems maintain three copies of each and let the copies drift apart.

**Unlike `CurrencyConfig` and `TravelConfig`, NOTHING stays on the crafting system.**
There is no `enabled` key here and no participation flag there, because an unreferenced entry already costs nothing, so there is no meaningful "off" state to model.
A reader looking for a per-system half of this concept is looking for something that does not exist.

It is persisted as the `fabricate.characterLibraries` world setting (`scope: "world"`, `config: false`, `type: Object`, default `{}`); `CharacterLibrariesStore` is the persistence shell, `normalizeCharacterPrerequisiteList` and `normalizeModifierLibrary` are the two normalizers, and `src/systems/characterLibraries.js` is the shared read-side resolver.

```ts
type CharacterLibraries = {
  characterPrerequisites: CharacterPrerequisite[]; // default []
  modifiers: ModifierLibraryEntry[]; // default []
};
```

### Requirements

1. **This is ONE setting key carrying TWO independent libraries, and that is a persistence decision rather than a modelling one.**
   The two share no key, no reference, no invariant and no reader: nothing in the corpus reads both.
   The key is shared only so that a fourth near-identical persistence shell is not written beside `CurrencyConfigStore` and `GatheringRealmStore`.
   Splitting it into two keys later would therefore be a pure persistence change with no domain consequence, and every rule below that says "per library" is what keeps that true.
2. **Every operation over this setting is PER LIBRARY, never over the object as a whole.**
   Normalization, the world migration's union, the export slice and the import merge each treat `characterPrerequisites` and `modifiers` separately.
   A single object-level destination-wins merge on import would let a destination world that has prerequisites but no modifiers win the whole slice and silently discard every incoming modifier, which is the concrete harm requirement 1's independence exists to prevent.
3. **The shared key WIDENS the lost-update window across both libraries, and the cost is accepted knowingly.**
   A write to either library rewrites the whole setting, so two GMs editing DIFFERENT libraries can clobber each other where two keys would not.
   The store therefore publishes its cache BEFORE awaiting the write, exactly as `CurrencyConfigStore` does and for the same read-modify-write reason, and with more at stake: a stale read taken during a modifier keystroke writes back a stale `characterPrerequisites` beside it, losing an edit in a list the GM was not even touching.
4. **The store exposes RAW KEY PRESENCE as `isSeeded()`, captured from the raw read before normalizing, and that predicate is what makes a destructive prune decidable.**
   `game.settings.get` on a world setting that has never been written returns the registered default, so an unmigrated world reads `{}`, normalizes to two empty arrays and reports itself loaded — byte-identical, at this store's API, to a GM who deliberately emptied both libraries.
   `{}` means never written, so the Valid Id Basis is UNKNOWN and nothing may be pruned; `{ characterPrerequisites: [], modifiers: [] }` means the GM emptied it, so the basis is real, empty and prunable.
   A write seeds the setting from that point on, so a GM's deliberate deletion starts pruning immediately rather than waiting for a reload.
5. `load()` is GUARDED and never throws, unlike `CurrencyConfigStore.load()`.
   A throw would propagate through `CraftingSystemManager._normalizeSystem` into `hydrate` and out of `initialize()`, which is the issue-970 failure mode where the manager never initializes at all.
   An unreadable setting degrades to an UNKNOWN basis; it never takes the module down.
6. **Persistence is NOT gated on validity**, exactly as `CurrencyConfig` requirement 4 states and for the same reason: a GM authors a library incrementally, so an entry is transiently incomplete between being added and being filled in, and refusing those writes would make the editor unusable.
7. **Entry `id`s are stable and are never rewritten**, because books and scrolls (`caps.learn.characterPrerequisiteIds`), tool requirement gates (`Tool.prerequisites.ids`), the three activity checks' `defaultModifierIds`, every subject pick, and every gathering drop row, event and stamina cost all store ids.
   Every reconciliation of two libraries is therefore keyed by `id` and reference-preserving, per library: the `1.28.0` migration UNIONS entries by id across every crafting system (the first system wins an id collision, and the discarded copy is REPORTED rather than re-keyed), and import merges an incoming library by id with the DESTINATION definition winning (see `import-export`).
8. **Collision reporting is narrowed to CONTENT-DIFFERING collisions, which is a refinement on the `1.27.0` rule rather than a copy of it.**
   Realm ids are `randomID()`, so a travel collision is already rare enough that reporting all of them is informative; preset ids on BOTH of these libraries are stable semantic slugs (`smithsTools`, `proficientArcana`, `expertCrafter`; `strength`, `perception`, `survival`) and presets are editable once seeded, so a GM who seeded presets into two systems collides on every seeded entry.
   Sameness is judged on the NORMALIZED entry, so a difference in key order or in an absent-versus-undefined bound is not mistaken for a disagreement, and the one collision that changed a rule is not buried under dozens that changed nothing.
9. **The runtime READ is the UNION of the world library and the crafting system's own surviving legacy copy, world first on an id collision** (`resolveModifierLibrary` / `resolveCharacterPrerequisiteLibrary`).
   Before the `1.28.0` migration lifts them, the legacy in-system entries ARE the live corpus, and migrations run on the ACTIVE GM only, so every player and every assistant GM spends at least one session reading a world setting that has not been written yet; without the union their tools, books and checks would resolve nothing at all in that window.
   This is deliberately NOT the silent read-alias the `1.22.0` and `1.23.0` relocations refused: an alias hides a relocation by making the old location keep working forever, whereas this is bounded by the migration, which strips the legacy copy the first time an active GM loads the world.
10. The libraries are world data and are therefore NOT part of the `CraftingSystem` record, but they DO ride along with crafting-system import/export as their own envelope slice, on the terms `CurrencyConfig` requirement 9 and `TravelConfig` requirement 7 state.
    An exported book's learning gate, an exported tool's requirement gate and an exported check's `defaultModifierIds` all name entries by `id` and are unusable in the destination world unless those entries arrive with them.
11. **Both libraries are read DURING crafting-system normalization, which currency and travel are not, and that difference is load-bearing at three sites.**
    `CraftingSystemManager` derives its Valid Id Basis from this store on every `_normalizeSystem` and on every `upsertTool`, so the store must be constructed and loaded BEFORE the manager at startup, a copy-mode import must merge this slice BEFORE the system is created, and that merge must go through (or invalidate) the store rather than writing the setting behind its cache.
    Copying the currency and travel placements — both constructed or persisted late, because nothing reads them during normalization — would prune every incoming reference against a basis that cannot yet see it.

## ModifierLibrary

### Purpose

Define the ONE named modifier library: the ordered list of reusable actor-driven expressions that every activity's check selects over and that every gathering drop row, event and stamina cost references.

It lives in the `characterLibraries` world setting as `modifiers[]` (see ## CharacterLibraries).
It has moved THREE times, and each move deleted the key it left: out of `craftingCheck.checkModifiers` in `1.22.0`, because salvage and gathering select over the same entries so it can belong to no one activity; into a merge with the gathering character-modifier library (`gatheringConfig.systems[systemId].characterModifiers`) in `1.23.0`, because a named actor-driven expression is ONE concept and authoring it twice let a GM define "Medicine" as two unrelated records that could disagree; and out of `CraftingSystem.modifiers` to world scope in `1.28.0`, because an expression evaluated against a character is not a fact about a crafting system.

### Properties

```js
ModifierLibraryEntry = {
  id: string,               // stable reference; trimmed, unique within the library
  label: string,            // GM label; '' when unauthored
  expression: string,       // roll-data fragment evaluated against the acting character
  isRollExpression: boolean,// DERIVED from the expression, never read from input
  icon?: string,            // attached only when authored
  min?: number,             // attached only when authored; absence means unbounded
  max?: number,             // attached only when authored; absence means unbounded
}
```

### Requirements

1. **ABSENT IS NOT AN EMPTY LIBRARY**, and this inverts the rule that stood while the library lived on the crafting system.
   The pre-1308 shape read an absent `modifiers` key as an empty library, so every activity's contribution was nothing and no term was appended; that reading is exactly the Valid Id Basis anti-pattern, and once the library moved to a world setting whose unwritten form reads back as the registered default it would have made every unmigrated client prune every authored default id.
   An unwritten setting is therefore UNKNOWN rather than empty (## CharacterLibraries requirement 4): reading still resolves the union with any surviving legacy in-system copy, and pruning is skipped entirely.
   A library the GM has WRITTEN and emptied is a real empty library, and it does contribute nothing.
2. `normalizeModifierLibrary` is total and non-throwing: ids are trimmed and de-duplicated, an entry with no assignable id or a non-object entry is dropped rather than repaired, a bad expression coerces to `''`, and `isRollExpression` is DERIVED on every normalize so a persisted or imported flag can never contradict the expression beside it.
   It lives in `src/systems/modifierLibrary.js` rather than on `CraftingSystemManager` because since issue 1308 it has THREE callers that must agree byte for byte — the world store, the `1.28.0` migration and the export-payload upcast — and a second implementation of a normalizer is how a persisted shape and its migration drift apart.
3. **THE SHAPE IS A SUPERSET**, and each field is honoured by whichever consumer needs it: `min` / `max` clamp the resolved value of a CHECK modifier, while a gathering drop-row reference carries its OWN `min` / `max` that clamp its contribution independently.
4. `icon`, `min` and `max` are ABSENCE-PRESERVING: each is attached only when authored, so `null`, `undefined`, `''` and junk all normalize to the same shape with the key absent, and absence means unbounded.
   `0` is a real bound and survives, which is why the guard is `Number.isFinite` on an explicitly-guarded value rather than truthiness.
   The bounds are asked of the shared resolver rather than re-derived, so the persisted shape and the clamp the engine applies cannot disagree about what an unbounded form is.
5. An authored `min > max` is PRESERVED VERBATIM rather than repaired: it is the blocking `modifierBoundsInverted` readiness issue that the GM must fix, and silently swapping the pair would roll a number nobody authored.
   A finite bound no dice-grammar `Constant` can express (`1e21`, `1e-7`) is the second blocking bounds fault, `modifierBoundsUnsafe`, and contains the entry to 0 in the same way.
6. **AN ENTRY WITH NO EXPRESSION IS KEPT.** The library has an "Add modifier" button, and an entry that vanished on save the moment it was created would make that button appear broken.
   It is still a runtime misconfiguration wherever it is referenced.
7. **A ROLL-SHAPED expression is legal for BOTH consumers** (issue 1118): a gathering drop row evaluates the expression and applies the result as a percentage-point delta, and a check appends the DICE to its roll formula so the authored variance survives to the roll and shows on the card.
   `isRollExpression` is therefore a DISPLAY classification and never a gate; the blocking `modifierRollExpression` readiness issue is RETIRED.

## CurrencyUnit

### Purpose

Define one actor-backed currency denomination and its optional sub-unit breakdown.

```ts
type CurrencyUnit = {
  id: string; // stable internal reference used by CurrencyRequirement.unit and Ingredient.match.unit
  label: string;
  abbreviation: string;
  icon: string;
  actorPath: string; // Foundry actor data path containing the numeric balance (actorProperty strategy)
  denomination?: string; // pf2e coin denomination (pp|gp|sp|cp); used by the actorInventory strategy
  contains: Array<{
    unitId: string; // another CurrencyUnit.id
    amount: number; // positive integer count contained in one parent unit
  }>;
};
```

### Requirements

1. `id` is stable after creation and is the value stored by salvage currency requirements and recipe currency options.
   A unit lives in the world `CurrencyConfig.units[]`, not on a crafting system.
2. `label`, `abbreviation`, `icon`, `actorPath`, `denomination`, and `contains[]` are GM-editable.
   `abbreviation` is **optional** and defaults to the empty string when unauthored.
   It is **never** defaulted to, or persisted as, the unit `id`.
3. A unit must not contain itself directly or indirectly, and a single unit's decomposition must reach each descendant by exactly one path.
   A sub-unit `S` is eligible for parent `P` only when the set of units reachable from `P` (inclusive, through `contains[]`) and the set reachable from `S` are disjoint; this subsumes self-containment, an already-direct child, a cycle back to `P`, and the descendant/diamond cases where `P` would gain two conversion paths to the same node.
   A profile where any unit reaches the same descendant by more than one distinct path is a validation error (conflicting conversion paths).
   A unit legitimately shared as a child of two different parents (e.g. `gp -> sp` and `ep -> sp`) is allowed, because each parent's reachable set is computed over its own subtree.
4. `contains[].amount` must be a positive integer; a non-integer or non-positive amount is a profile validation error.
5. A sub-unit reference must point at another configured currency unit.
6. `actorPath` vs `denomination` vs `abbreviation` validation is conditional on the owning `CurrencyConfig.spendStrategy`:
   - Under `"actorProperty"`, every unit must define an `actorPath`; `denomination` is ignored.
   - Under `"actorInventory"`, every unit must map to a pf2e denomination — `denomination` (defaulting to the unit `id`) must be one of `pp`, `gp`, `sp`, or `cp`; `actorPath` is not required.
   - Under `"macro"`, every unit must define a non-empty `abbreviation` (macros match a unit by abbreviation); `denomination`/`actorPath` are not required.
     Additionally, the config-level `canAfford` and `decrement` macros must be set; the `increment` and `balance` macros are both OPTIONAL, and a world missing either is a documented-normal state rather than a broken one.
     What each absence costs is stated positively, because "optional" alone tells a GM nothing: with no `increment` macro the world cannot refund a cancelled craft, the published currency credit answers _the world cannot express this credit_, and the pooled holdings consume refuses a currency cost up front rather than taking coin it could not give back; with no `balance` macro the world can still spend coin but cannot report it, so every pooled currency reading answers _cannot see_ and nothing else in the request is affected.
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
  colorToken?: string | null, // a `--fab-tag-*` palette key, or null for the accent default
  description?: string,
  enabled: boolean, // default true; gates essence-carried BEHAVIOUR, never essence arithmetic
  propertyMacroUuid?: string | null, // a script Macro run against every result this essence contributes to
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
5. `colorToken` is the GM-authored per-essence colour: a nullable key from the shared `--fab-tag-*` token palette (`sage`, `mist`, `lavender`, `rose`, `peach`, `butter`, `aqua`, `mauve`), stored as the bare token.
   It has **no** `customColor` sibling — the palette is the whole vocabulary, because a free hex cannot be guaranteed legible against all seven themes.
   Normalization emits it in **both** branches of essence-definition normalization (the object branch and the legacy id-string branch), so a definition never reaches a surface with the field absent.
   A `null` or unrecognized token renders as the theme accent, which is what every essence renders as today, so no migration is required.
6. `enabled` defaults to **true** and is emitted in **both** branches of essence-definition normalization, as `colorToken` is.
   The object branch reads `entry.enabled !== false`; the legacy id-string branch emits `true`.
   No migration is required and adding one would be wrong: essence-definition normalization is a whitelist rebuild that has never emitted the key, so no stored definition carries one and an absent key already reads as enabled.
   The same holds across export, import, copy-import and the export-payload migration, none of which can write a spurious `false`.
7. `enabled` gates essence-carried **behaviour**, never essence **arithmetic**.
   A disabled essence still matches, accumulates and is consumed exactly as before, because a mid-session toggle must not change what an already-held item is worth.
   It carries nothing onto a crafted result: neither its property macro nor its active-effect transfer runs.
   A disabled essence is soft-disabled and fully reversible — nothing is deleted, and every stored reference is preserved and still rendered.
8. A disabled essence MUST NOT be removed from the valid-essence-id set threaded into component normalization, and MUST NOT be filtered out of the component-essence or recipe-essence option sets.
   Three separate whitelist rebuilds are driven by those sets — component essence-quantity normalization, the component editor's update projection, and the component bulk edit's staged essence map — and each would silently destroy authored quantities for a disabled essence.
   Only the ADD-NEW offer list withholds a disabled essence; a disabled essence that already carries a positive quantity, or is already referenced, is rendered with a disabled marker and stays editable and clearable.
9. `propertyMacroUuid` is the GM-authored per-essence property macro.
   It shares its name and its meaning with `Result.propertyMacroUuid` — a macro that rewrites crafted item data before creation — and runs under the same `features.propertyMacros` gate, additionally gated on `features.essences`.
   Normalization applies a document-UUID **shape** check and stores `null` for anything else; it deliberately does not require a `Macro.` prefix, because legacy four-segment compendium uuids still resolve and a stricter test would reject a usable macro.
   The editor's drop handler and the essence editor's validation surface refuse a macro whose own type is not `script` at authoring time.
   That check is repeated at craft time as a backstop, because `command` is a required string on a `chat` macro too and `type` defaults to `chat`, so an imported system or a hand-edited world setting can carry a `propertyMacroUuid` that never passed through the drop handler at all.
   At craft time an unresolvable uuid, or one that resolves to a Macro whose own type is not `script`, is logged and skipped silently.
10. Both new fields survive export, import and copy-import unchanged, and the import reference resolver collects `propertyMacroUuid` as a macro reference owned by the essence.

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
      characterPrerequisiteIds: string[], // default []; ids into the WORLD characterLibraries.characterPrerequisites
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
   The scalar reverse ref `recipe.recipeItemId` (and the legacy `recipe.linkedRecipeItemUuid` book alias) is removed by the `1.13.0` migration, which inverts it onto `recipeIds`; membership is authored book-side on the Contents tab, and the runtime falls back to the legacy reverse ref only while the system's monotonic `membershipResolvesByRecipeIds` marker is unset (issue 1010).
5. `caps` holds this recipe item's own use and learn caps.
   The use cap (`caps.item.limitUses` / `maxUses` / `whenSpent`) governs how many times holding the item grants crafting access; the learn cap (`caps.learn.limitLearning` / `learnsAllowed` / `learnScope` / `destroyWhenSpent`) governs how many of the item's linked recipes may be learned from it.
   The PR-B redesign renamed the cap fields; the new names are canonical and each legacy name (`destroyWhenExhausted`, `limitRecipes`, `maxRecipes`, `learningMode`) is persisted and kept in sync so an un-migrated raw cap still loads.
   `caps.learn.destroyWhenSpent` is deliberately distinct from `caps.item.whenSpent === "destroyed"` (`destroyWhenExhausted`) and must not be normalized to a shared name.
6. `caps.learn.learnScope` selects the learn-cap counter scope: `"perInstance"` (default) counts against each physical item document (`recipeItemLearning.learnedCount`), while `"total"` draws every actor's learns from one GM-authoritative shared world pool keyed `system::defId`.
   6a. `caps.learn.prerequisiteIds` and `caps.learn.characterPrerequisiteIds` (issue 544) are each a deduped, trimmed, non-empty string list (default `[]`), normalized with the same shape in `CraftingSystemManager._normalizeRecipeItemCaps`.
   `prerequisiteIds` (**Required Knowledge**) is a list of recipeIds the reader must ALL already have learned; it folds a legacy single `caps.learn.prerequisite` string on normalize (back-compat, no stored data to migrate) and the singular is no longer emitted.
   `characterPrerequisiteIds` references into the world `characterLibraries.characterPrerequisites[].id` (issue 1308): a per-book **character-prerequisite learning gate** where a reader must pass **ALL** referenced prerequisites (AND semantics) against the acting actor's roll data.
   The two gates are distinct — `prerequisiteIds` gates on prior recipe knowledge, `characterPrerequisiteIds` gates on actor stats/flags — but both are only enforced when `caps.learn.limitLearning` is `true` (Limited learning off ⇒ learn freely, neither gate applies).
   An id that no longer resolves is skipped at runtime (fail-open for character prerequisites), so deleting a prerequisite removes its gate rather than bricking the book.
7. The `1.11.0` migration seeds `caps` on every existing recipe item from the system's former `recipeVisibility.knowledge.item` / `.learn` values, then strips those fields from the system config.
   Recipe items created after the migration default to uncapped.

## CharacterPrerequisite

### Purpose

Define one WORLD-scoped, reusable pass/fail condition (issue 544, moved to world scope by issue 1308) evaluated against the acting actor's prepared roll data.
The library lives in the `characterLibraries` world setting as `characterPrerequisites[]` (see ## CharacterLibraries); a crafting system carries no copy of it and no participation flag over it.
The GM authors it on the System Settings page THIS change, which is the one surface in the Manager where a world record is edited on a page framed as settings for the selected crafting system; the interim honesty package (a scope chip on the card header, hints reading "shared by every crafting system", and a delete confirmation naming the cross-system reach) is what makes that state honest, and the follow-up change relocates the editor to its own World route.
A book/scroll references a subset by id from `RecipeItemDefinition.caps.learn.characterPrerequisiteIds` to gate who may learn its recipes (behaviour in `recipe-visibility`); a Tool references a subset from `Tool.prerequisites.ids` to gate who may wield it (behaviour under ## Tool).

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
   Since issue 1308 the ONE array being normalized is the world library's, and the same normalizer is shared by the world store, the `1.28.0` migration and the export-payload upcast so the three cannot drift.
2. `op` is one of the nine word tokens above; an unknown or missing token normalizes to `"gte"`.
   The three **valueless** operators — `isTrue`, `isFalse`, `exists` — force `value` to `null` and hide the editor's value field; the six numeric operators keep a comparand (an empty-string value normalizes to `null`).
3. `path` is stored WITHOUT a leading `@` (the `@` is a display/authoring affordance only); a leading `@` on input is stripped on normalization.
   It is resolved at runtime as a dotted traversal of `actor.getRollData()`, which Foundry has already flattened (`skills.cra.rank` in pf2e, `skills.arc.value` in dnd5e).
4. Evaluation is pure and Foundry-free (`evaluatePrerequisite` / `evaluatePrerequisites`).
   An unknown or missing `path` degrades to `0` (numeric operators) or `false` (boolean/existence operators) and logs a single `console.warn`; it never throws.
   `evaluatePrerequisites` applies **AND** semantics and returns `{ passed, failures }`, where each failure carries a `prerequisitePreview` string (`@path op value`, or `@path op` for valueless) for player messaging.
5. **AN UNRESOLVABLE ID HAS TWO OPPOSITE POLARITIES, one per gate, and neither is a bug.**
   The LEARNING gate fails OPEN: a `caps.learn.characterPrerequisiteIds` entry that resolves to no definition is SKIPPED, so a book with one broken reference still gates on the rest and stays learnable.
   The TOOL gate fails CLOSED: `toolCheckBonus` passes only when `resolved.length > 0 && unresolvedIds.length === 0`, so a single unresolvable id makes the tool fail its gate — and under `gateMode: "usability"` that makes the tool unusable, which blocks every craft, salvage and gathering attempt that requires it.
   The asymmetry is deliberate in each direction — knowledge that cannot be checked is granted, a tool whose gate cannot be checked is withheld — but it is what makes an id-losing prune far more destructive on the tool side than on the learning side, and it is the reason ## Tool requirement 6's prune is now conditional on a known-complete Valid Id Basis.
6. `op` is a deliberate **word-token** vocabulary that parallels the symbolic `CheckBreakageCondition` operators (`==` / `<=` / `>=` / `<` / `>`, defined under **CraftingSystem**).
   The two are the same comparison intent on different surfaces (a stat gate versus a dice-matching trigger) and are intentionally not unified.
   The word-token table has a THIRD consumer since issue 1286: a component complication's `rollCondition` gate.
   All three read ONE table through the exported `compareNumbersByOperatorId(actual, op, expected)`, so a retuned operator cannot mean two things on two surfaces.
   A complication's gate offers the **six numeric operators only** (`eq`, `neq`, `gt`, `gte`, `lt`, `lte` — the entries whose `valueless` is `false`), filtered by the shared valueless predicate rather than hand-listed: a dice total is always a number with no boolean or existence reading, and an `exists` offered against a roll total would be a complication that always fires.
   `compareNumbersByOperatorId` returns `false` for the three valueless ids and for any unknown id, so the gate fails closed on a comparator it does not know.
   The symbolic `CheckBreakageCondition` set stays separate for the reason above and for one more: `evaluateCheckBreakageCondition` is a pure synchronous predicate the authoring-side odds preview consumes, and a complication's condition rolls a live formula, so admitting one as a condition type would make an odds histogram roll dice while charting it.
   The symbolic set also has no not-equals, so `neq` would have no spelling there.

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

  // GM-authored progressive complications (issue 1286). TOP-LEVEL, beside `difficulty`,
  // because the concern spans all three activities; see requirement 19. The key is ABSENT
  // on a component that authored none, and an authored empty list normalizes to absent.
  complications?: Array<{
    id: string,
    name: string,
    description: string,
    severity: "minor" | "major" | "severe",   // default "minor"; narrative gravity
    visibility: "gmOnly" | "visible",         // DEFAULT "gmOnly"
    activities: { crafting: boolean, salvage: boolean, gathering: boolean },
    match: "any" | "all",                     // default "any"
    when: {
      stageAwarded: boolean,
      stagePartial: boolean,
      stageMissed: boolean,
      checkTrigger: string | null,            // a CheckBreakageTrigger id, never a boolean
    },
    rollCondition: { enabled: boolean, expr: string, cmp: string, value: string },
    effectRoll: { enabled: boolean, expr: string, label: string },
    macroUuid?: string,                       // absent when unauthored
  }>,

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
   This bound is enforced at the `_normalizeSalvage` normalizer — the single chokepoint every writer passes (GM save, import, copy-mode, migration) — not by any UI control, via a success-first retain-one clamp whose post-clamp `resultGroups[0]` is the first success group (the group the engine awards ON SUCCESS via `slice(0, 1)`, with no role filter).
   **The reserved-failure tolerance is a LIVE CAPABILITY, governed by `salvageCraftingCheck.failureResultPolicy` (issue 1098).**
   Its previous reading — a data-model / validation allowance only, with salvage Simple never awarding or routing to a failure group — is RETRACTED.
   When the policy permits results on failure, the salvage failure branch resolves the reserved group and awards it.
   **Both clamps are unchanged, and the ordering guarantee becomes MORE load-bearing, not less:** the SUCCESS branch still selects `resultGroups[0]` by INDEX, so the FAILURE branch selects the reserved group **by ROLE and never by index**, returning nothing when none is authored — an index-based failure selection would award the full success salvage output on a failed check.
   The `enabled` clamp — a Simple config with no success group cannot be enabled — is unchanged.
6. Runtime essence matching, craftability checks, discovered-recipe craftability, crafting-check contexts, and effect-transfer contexts must count `Component.essences` for actor items that match the component by source reference or name.
   Explicit `fabricate.essences` item flags remain a compatibility override for that item.
   The source-reference half of that match is governed by the shared **Component Item Matching** resolver defined below (its identity tier, then the raw-reference fall-through).
   The separate name fallback some callers apply after the resolver returns null is not part of this matcher and is unchanged here.
   That fallback is case-insensitive in `RecipeManager.ingredientMatchesItem`, `RecipeManager.toolMatchesItem`, and `essenceResolver.findMatchingComponent`, and case-sensitive in `CraftingEngine.findComponentItems` (the private `_findComponentItems` spelling survives only as a thin delegate for existing callers).
   Closing that name path is deferred to issue 557.
7. `salvage.outcomeRouting` is only meaningful when `salvageResolutionMode` is `"routed"`.
   In routed salvage mode it keys on the salvage check's outcome-tier NAMES (`salvageCraftingCheck.routed.{relativeOutcomes,fixedOutcomes}` for the active `type`) — the same source the per-component routing editor offers and the runtime routes by — NOT the legacy flat `salvageCraftingCheck.outcomes` list.
   Every SUCCESS tier must route to an existing result group; failure tiers may stay unrouted (the runtime yields nothing for an unrouted outcome), and a route pointing at a deleted group is invalid.
   When the salvage check defines no outcome tiers, routing is impossible and the component must NOT be faulted — the gap surfaces once as the system-level `salvageRoutedNoTiers` issue instead of a per-component error.
8. `salvage.ingredientQuantity` must be a positive integer.
9. If a linked source item updates its name, image, or description, managed components that match the item's live UUID, canonical source UUID, or fallback source references must refresh their stored `name`, `img`, and display-safe plain-text `description` from the linked item.
   9a.
   A component's or recipe-item definition's stored `description` is the RESOLVED plain text of its source document's description.
   A content-link directive resolves to the referenced document's name whether or not the author supplied a label.
   A reference that cannot be resolved contributes its authored label when one is present, and is otherwise omitted rather than rendered as a placeholder word.
   Enrichment output has visibility-gated and secret markup removed before storage, by attribute — GM-only, owner-only, hidden, and unrevealed secret regions are stripped from the resolved markup regardless of which user performed the enrichment — so no such content reaches a stored description or any reader of one.
   Resolution never inlines an embedded document, and never evaluates a dice expression into a fixed number: an inline roll contributes its label when authored and otherwise its bare dice formula.
   9b.
   The stored description is refreshed by exactly two triggers: a linked source item changing, and the GM item-data repair.
   It is not refreshed on render.
   9c.
   Unlike the one-hop `name` and `img` snapshots of requirement 9, a resolved description is N-hop — it embeds the names of other documents.
   Renaming a referenced document, or removing the module that provided it, does not refresh the components quoting it; the GM item-data repair is the reconciliation path.
   A game-system or module content update is likewise a reason to run it.
   9d.
   A name resolved under GM authority may be visible to a player who could not have resolved it themselves; this is an accepted consequence of write-time resolution.
10. When importing or replacing a component source from a Foundry Item, Fabricate must verify a recorded canonical source UUID from `_stats.compendiumSource` or `flags.core.sourceId` before storing it as the component's primary source reference.
11. If the recorded canonical source UUID no longer resolves but the live dropped Item UUID does resolve, Fabricate must store the live dropped Item UUID as the component's primary `registeredItemUuid` and `originItemUuid`, and preserve the broken canonical source UUID in `aliasItemUuids`.
12. The broken-source fallback applies to single item import, folder import, compendium pack import, and replace-source.
    12a.
    Every bulk component-import path — compendium pack import, folder import, and the folder-mapping commit — must persist its whole run with a SINGLE `craftingSystems` world-setting write, and the number of writes must not grow with the number of imported items or with the number of mapped folders.
    Each write replaces the entire setting and is replicated to every connected client, so a per-item write makes a bulk import quadratic in corpus size.
    The bound covers the per-folder category/tag set-apply as well as the item import: a mapping commit that imports across several folders still writes once in total, not once per folder.
    Batching must not change any per-item outcome: the same added / updated / skipped classification, the same counts, the same aggregated broken-source fallbacks, the same durable role-flag stamp on each source document, and the same overwrite-on-redrop application of a folder's mapping to already-present components.
    A run that changes nothing in the corpus — every item already present and no mapping to apply — must write nothing at all.
    An item that fails part-way through a run must still surface its error to the caller, and the items imported before it must be carried by the run's single write rather than lost.
    A single-item import is its own batch of one and must persist immediately.
    The bound is on the number of PERSISTENCE OPERATIONS a run issues, not on the identity of the key it writes, so a backend that addresses records individually inherits it unchanged.
    It is satisfied today by the single `craftingSystems` write named above.
    The bound gains a DIFFERENTIAL-COST half, which an operation count does not imply: a run that NAMES the systems it touched must not diff another system's records.
    A bare whole-corpus flush is explicitly NOT a violation of that half.
    A run that names nothing is telling the repository it does not know what moved, which is exactly what a deferred-persistence batch flushes with, and narrowing it would drop the in-place mutations such a batch relies on being flushed.
    What the whole-corpus flush costs is a COMPARISON rather than a write: it diffs every system's extracted records against the index, emitting no extra write and no extra replication.
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
    The clamp applies to every writer that passes through normalization — GM edits, import, copy-mode, migration, and the set-apply bulk write — and only ever turns `enabled` off, never on.
    Enforcement must not rest on a UI control's disabled state: a GM surface that merely refuses to _enable_ a zero-group component does not prevent a component from _becoming_ zero-group while enabled.
16. The set-apply component write carries every bulk axis in one persist: category overwrite, additive tag union, tag removal applied after the union, whole-map essence replacement, and progressive DC.
    An axis is written only when the caller supplies it; supplying an empty essence map or a zero difficulty is an instruction to CLEAR that value, not an absent instruction, and a removal-only call is a real edit rather than a no-op.
    Every written component is re-normalized under the owning system's essence and salvage context, exactly as a single-component write is, so an essence outside the system's definitions cannot be introduced and the salvage invariants of this data model continue to hold.
    The bulk axes never carry salvage: salvage is only ever touched by that shared normalization, never edited by this write.
17. **Bulk destroy** deletes every contributing document of the named component **on the target actor** — whole stacks — and never reads `salvage.ingredientQuantity`.
    It is not gated on `salvage.enabled` or on `CraftingSystem.features.salvage`: destroying is not a salvage outcome, and a row blocked for salvage is often exactly the row a player wants gone.
    Whole stacks are the unit because that is what destroying a thing means and the gesture carries no quantity control; salvage's one-unit-at-a-time rule comes from the GM-authored `ingredientQuantity`, for which destroy has no analogue.
    Document resolution uses the **same Component Item Matching resolver salvage uses** (see the `### Component Item Matching` section below), including the case-sensitive name fallback requirement 6 records — a destroy that matched more broadly than salvage would delete documents the player was shown as belonging to a different component.
    The reported unit count derives from the documents the delete **actually removed**, never from the ids requested, because a `preDeleteItem` veto drops individual ids silently while the rest of the batch deletes; a vetoed document is reported to the player rather than counted as destroyed.
    Stack quantities are read through the configured stack-quantity accessor and captured **before** deleting, since a deleted document's name, image and stack size are unreadable afterwards.
18. **Bulk salvage** consumes `salvage.ingredientQuantity` per selected row exactly as a single salvage does.
    There is no per-row quantity in the bulk gesture: each queued row is one `salvage()` call at the component's authored `ingredientQuantity`.
19. **`complications` is TOP-LEVEL on the component and is not part of `salvage`.**
    Two independent reasons hold it there, and the first is the deciding one.
    A complication is scoped to a component's participation in ANY progressive activity — as a recipe result, as a salvage yield, or as a gathering drop — so a cross-activity concern parked inside `salvage`, the salvage-ACTIVITY sub-record, is an aggregate-boundary violation; the sibling that already spans all three activities is `difficulty`, the progressive DC a complication keys on, and it is correctly top-level.
    The second reason is SPEC VALIDITY rather than data loss: requirement 4 makes `salvage` valid only when `CraftingSystem.features.salvage` is true, and a complication authored on a crafting OUTPUT component has to fire on a system with salvage switched off — precisely where a `salvage`-nested record would be spec-invalid.
    A complication fires when the component is PRODUCED as a progressive stage, and never when the component is itself salvaged or spent; complications on the salvaged or crafted SOURCE component are a separate concern tracked as issue 1287.
20. `complications` normalizes at the single component chokepoint and is **absence-preserving**.
    The attach emits the key ONLY for a non-empty normalized list, so a component that authored none carries no key at all and its persisted bytes are unchanged.
    There is **no authored-empty state**: unlike `salvage.checkModifierIds`, an empty complication list carries no meaning distinct from absence, so an authored `[]` normalizes to ABSENT.
    No reader may distinguish an absent `complications` from an empty one, and that obligation is audited per reader rather than assumed (the omitted-when-default rule in § Canonical-Write and Legacy-Read Compatibility Policy: legitimate only where NO reader distinguishes the two, which is a property of the readers and is audited per field).
    A member that is not a plain object is dropped; an entry with no authored `id` is minted one rather than discarded.
21. Normalization CLAMPS the three closed vocabularies and PRESERVES every operand.
    `severity`, `visibility` and `match` clamp to their declared token sets, because each drives a rendering treatment rather than a validated operand and no complication validator exists to report an unknown token, so an unclamped value would render as garbage indefinitely.
    The operands — both dice expressions, the comparand, the effect label, the macro uuid and the trigger id — are preserved verbatim, never repaired and never dropped, on the same reasoning the gathering failure-outcome normalizer records: silently deleting a malformed operand makes the validator unreachable and turns an authoring mistake into silent data loss.
    `rollCondition.value` stays a STRING because it may itself carry roll data.
    The single alias is the comparator `ne`, which normalizes to the operator table's `neq`; that is an alias rather than a repair, and every other comparator survives verbatim for the gate to reject.
22. `visibility` defaults to `gmOnly`.
    Every other default on this record preserves pre-existing behaviour; there is no pre-existing behaviour here, so the default is the SAFE one, and an audience Fabricate cannot read must never resolve to "show the player".
23. **`visibility: 'gmOnly'` is a DISCLOSURE guarantee across every Fabricate surface, and is NOT a confidentiality guarantee.**
    A `gmOnly` complication must appear in no chat message, no view-model, no engine return read by a player and no actor-flag run record — including when a GM is the acting user.
    It is nevertheless readable by a determined player, because `craftingSystems` is a world setting and world settings replicate UNFILTERED to every joining client.
    This is the first Fabricate field whose VALUE is intended to be secret, and the limit is stated here and in the field documentation rather than in editor chrome; a GM authoring one must understand that the guarantee is about what Fabricate shows, not about what the client holds.
    **The GM-only chat card does not narrow that limit, and must not be described as though it did.**
    Foundry does not scope whispers server-side: a whispered `ChatMessage` is broadcast in full to every connected client, and `visible` / `isContentVisible` are purely presentational, so a player can read a GM whisper's `content` out of `game.messages` in the console.
    That is core behaviour, identical for core's own Private GM Roll, and it is not a Fabricate defect — but it means the GM card is the same class of home for authored `description` and `severity` that the world setting already is, and neither surface may be offered as confidentiality.
    Relatedly, a whispered message carrying `rolls` is visible to EVERY client, because `visible` short-circuits on `isRoll` before it tests the whisper list; a `gmOnly` complication's card therefore carries no roll, and a `gmOnly` complication's effect ROLL discloses its own existence by design (`AGENTS.md` § FoundryVTT Notes).
24. **`when.checkTrigger` is a trigger id, never a boolean, and a trigger id is owned by exactly ONE activity's progressive check block.**
    `craftingCheck.progressive`, `salvageCraftingCheck.progressive` and `gatheringCraftingCheck.progressive` each own their own `checkBreakage.triggers` id space.
    A complication enabled for several activities therefore matches its trigger clause only in the activity that owns the named trigger, and the clause is INERT in the others.
    An id that resolves to no trigger is likewise inert — fail-open, contributing nothing to `match` — and never a validation error.
    The clause is an id rather than a flag because a `CheckBreakageTrigger` declares each of its three existing effects explicitly and defaulted-off: an "any trigger fires any complication" boolean would hand every already-authored trigger a fourth effect with no GM action at all.
    A complication naming a trigger fires when that trigger's CONDITION matches the roll, regardless of that trigger's own `breakTools`, `outcome` or `tierStep` values, because a trigger's match is a fact about the roll and its three effects are independent of it.
25. **`complications` requires no migration and is not `downgradeLosesData`.**
    Component normalization is an allowlist rebuild, so a component's persisted shape after a save is exactly what that rebuild emits and the key is absent for a component that authored none.
    This is the **omitted-when-default** doctrine of § Canonical-Write and Legacy-Read Compatibility Policy, whose in-file precedent is `salvage.checkModifierIds` and NOT `salvage.allowPlayerResultReorder` — the latter is stamped on both normalizer return paths and is therefore absent-reads-as-default but not byte-preserving.
    No earlier build ever wrote this key, so the write-side alias-retirement rule does not apply; what carries over is the AUDIT obligation at requirement 20.

## Recipe

### Purpose

Represent a complete recipe with inputs, outputs, and visibility settings.

### Properties

```js
Recipe = {
  id: string,
  name: string,
  description: string,
  img: string, // default DEFAULT_RECIPE_IMAGE ('icons/sundries/documents/blueprint-recipe-alchemical.webp'); see requirement 16
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
  // success outcome tier. When set, a craft whose FINAL (post-step) tier ranks below
  // it (fixed tiers rank by `start`) fails outright. Null/unset = no override (outcome
  // = that same final tier). Meaningful only for routedByCheck with a fixed-type
  // check; ignored otherwise. Semantics in resolution-modes/spec.md.
  minSuccessOutcomeId?: string | null,

  // The recipe author's PICK of crafting-check modifiers (issues 770, 1055). Absent
  // (null) = picked nothing; inherit the system's `defaultModifierIds`. Present = names
  // the eligible id subset reduced to the contribution appended to the check roll (unknown ids
  // dropped at resolution against the live catalogue, and the survivors truncated to
  // `craftingCheck.maxModifierPicks`, and each clamped to its own entry's `min`/`max`).
  // It is honoured ONLY under the system's `bySubject` combination rule — rendered "By
  // recipe" on this activity; under `addAll`, `highest` and `playerPicks` a stored pick
  // sits here and is not consulted at all.
  // ITS SIBLINGS ARE `Component.salvage.checkModifierIds` AND `GatheringTask.checkModifierIds`
  // (issue 1095): the same authoredness rule, on the other two activities' subjects.
  // IT CARRIES NO RULE. A recipe chooses WHICH modifiers apply, never HOW they combine,
  // so the combination rule is the system's alone. Older data may carry a `policy` key
  // from the era when a recipe could override it; `Recipe._normalizeCraftingModifier`
  // DROPS it on the way in, so it cannot round-trip back out through `toJSON`, and
  // `resolveModifierPolicy` never reads it wherever it survives unnormalized on disk.
  // `modifierIds` is keyed on `Array.isArray` AT THE POINT OF ENTRY, not on the
  // filtered array's length: an authored `[]` is preserved as an authored EMPTY set
  // (0 eligible modifiers, so nothing is appended), distinct from an absent `modifierIds`,
  // which inherits. The normalizer drops a malformed value, and an object carrying no
  // authored `modifierIds` array, to null (nothing picked). Semantics in
  // resolution-modes/spec.md §Check Source.
  craftingModifier?: { modifierIds?: string[] } | null,

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
  // malformed value normalizes to null), null for hand-authored recipes, re-stamped on
  // every import, and retained across GM edits. OMITTED from toJSON() when null
  // (requirement 18) — the never-prune guard is the RECONSTRUCTED null, which absence
  // rebuilds, not the presence of the key on the wire.
  importSource: { systemId: string, importedAt: number } | null,
}
```

### Requirements

1. A _craftable_ Recipe must include at least one ingredient set and at least one result group, either at recipe level (single-step mode) or within steps (multistep mode).
   This is a _completeness_ requirement: it gates crafting and craftable-visibility, not persistence.
   `Recipe.validate()` enforces completeness and is the craftability contract; the crafting engine gates on it, so an incomplete recipe is never craftable.
   `Recipe.validateStructure()` omits completeness (it waives the missing-ingredient-set / missing-result-group / missing-result errors) and is the persistence contract.
2. An authoring _incomplete shell_ — a recipe with valid identity (a name; default name "Unnamed Recipe" and default image apply when omitted) that is structurally consistent but missing its ingredient sets and/or result groups — MAY be persisted via the GM authoring path (create-then-edit and identity-only saves).
   Persistence gates only on structural validity (`validateStructure()`), never on completeness; structural-integrity errors (duplicate result-group/result IDs, invalid results, invalid step time/currency values, variable result-mapping and outcome-routing integrity) still block persistence.
   Reserved/duplicate `ResultGroup.name` is a reference-integrity rule enforced at the service level for the routed modes and alchemy `tiered` check mode (see the next paragraph), NOT a structural/persistence blocker: `validateStructure()` waives the name checks, so an authoring incomplete shell — or a recipe carrying a stray leftover `resultSelection` — is never blocked on a name error.
   Issue 554 retired the per-recipe `resultSelection.provider`, so `Recipe._validateRoutedResultSelection` no longer governs alchemy name-uniqueness.
   `routedByCheck` `ResultGroup.name` integrity is enforced at the service level (`ResolutionModeService._validateRoutedGroupNames`, a per-mode reference-integrity check that always applies), independent of this persistence gate.
   Incompleteness is _derived_ from the recipe's structure (no stored flag): an implicit recipe is incomplete when it has no ingredient sets or no result groups; an explicit multi-step recipe is incomplete when any step is missing an ingredient set or result group.
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
    13a. `craftingModifier` is the recipe author's optional PICK of crafting-check modifiers (issues 770, 1055): `{ modifierIds? } | null`, defaulting to `null` (picked nothing; inherit the system's `defaultModifierIds`).
    It authors ONE axis — WHICH modifiers apply — and never the combination rule; the rule is the system's `craftingCheck.defaultModifierPolicy` alone, and the pick is honoured only under that field's `bySubject` value (rendered "By recipe" on this activity).
    **The same `Array.isArray`-at-entry authoredness rule now governs `Component.salvage.checkModifierIds` and `GatheringTask.checkModifierIds`** (issue 1095), which are the salvage and gathering subjects of the same rule; all three share one attach so the four normalizers that emit them cannot drift.
    The normalizer keeps a de-duplicated non-empty string `modifierIds` list; a malformed value, or an object carrying no AUTHORED `modifierIds` array, round-trips to `null`.
    A legacy `policy` key — persisted when a recipe could still override the rule — is DROPPED by the normalizer, so it never round-trips out through `toJSON()`, and an object carrying only a `policy` normalizes to `null` because it holds no pick.
    That drop is a normalizer-level erasure, not a migration: the `1.20.0` migration deliberately leaves the raw key on disk (see `destructive-changes-and-migrations/spec.md`), and it is inert either way because `resolveModifierPolicy` reads only the system field.
    `modifierIds` authoredness is keyed on `Array.isArray(input.modifierIds)` AT THE POINT OF ENTRY, before de-duplication/filtering — so an authored `[]`, or an authored array whose only entries are malformed (e.g. `[123, '']`), still round-trips as `{ modifierIds: [] }` (an authored EMPTY set: 0 eligible modifiers, so nothing is appended to the roll), never collapsing to `null` (inherit).
    Keying on the filtered length instead would flip malformed import data from _inherit_ to _no modifiers_, which is the unsafe direction.
    Whether the pick is actually honoured — rather than merely stored — is decided at the resolver, not by this normalizer: under any rule other than `bySubject` it is ignored outright, and under `bySubject` it is truncated to `craftingCheck.maxModifierPicks`.
    See resolution-modes/spec.md §Check Source.
    An unrecognized `defaultModifierPolicy` falls back to `addAll` at the activity-check level (`CraftingSystemManager._normalizeCheckModifierSelection`), which is the only level a rule exists at.
    Neither selecting rule needs new per-recipe fields: `playerPicks` changes only when the eligible set is chosen, and `bySubject` reuses this same `modifierIds` list.
    Library membership of the ids is NOT enforced here — the resolver drops unknown ids against the live WORLD modifier library.
14. `importSource` is durable settings-payload provenance stamped by the compendium importer (NOT a Foundry flag): `{ systemId, importedAt } | null`, identifying the source pack.
    The `Recipe` constructor normalizes it to object-or-`null` — a non-object, or an object missing a non-empty string `systemId`, normalizes to `null` — and `toJSON()` emits it.
    A recipe created through the GM authoring path is never stamped, so it round-trips as `null`; this structural absence is the never-prune guard (import never auto-removes an unprovenanced recipe).
    It survives export/import (the importer re-stamps it) and is retained across GM edits (an edit that omits `importSource` inherits the stored value through the `{ ...recipe.toJSON(), ...updates }` merge in `updateRecipe`).
15. Legacy `toolBonusModes` input is ignored immediately and omitted from canonical Recipe writes.
    Recipe and Step data persist Tool references only; prerequisite, bonus, breakage, and on-break behavior belong to the referenced Tool or its Crafting System.
16. A Recipe's displayed image is its own `img` and nothing else (issue 884).
    A recipe item definition's artwork — a book or scroll — is never substituted at any surface, regardless of membership.
    Book membership is many-to-many (`RecipeItemDefinition.recipeIds[]`), so "the containing book" is not well defined and a borrowed icon would track definition resolution order rather than anything the GM authored.
    An unset image — empty, whitespace, or Foundry's generic `icons/svg/item-bag.svg` sentinel — resolves to `DEFAULT_RECIPE_IMAGE` (mirrored in the UI as `DEFAULT_CRAFTING_IMAGE`, pinned equal by `tests/crafting-image-defaults.test.js`), never to a book-shaped fallback.
    Every image-resolving caller must pass through one of two deliberately mirrored chokepoints — `resolveRecipeImage` (`src/ui/svelte/util/craftingImageDefaults.js`) for the GM manager and `InventoryListingBuilder._resolveRecipeImg` for the player surfaces — rather than re-deriving the rule at the call site.
    The legacy scalars `recipe.recipeItemId` and `recipe.linkedRecipeItemUuid` are never inputs to image resolution; their remaining non-image consumers are unaffected.
    Shipped code meets that chokepoint rule at every user-visible surface as of issue 887, which retired the borrow from the four `src/systems` resolvers — `InventoryListingBuilder`'s used-by index (which no longer has a second resolver at all), the inline block in `CraftingListingBuilder`, `CraftingEngine._resolveRecipePromptImg`, and `RunJournalBuilder._resolveCraftingRunImg` — and removed the injected `getRecipeItemImg` port that existed solely to feed one of them.
    `RecipeManager.resolveRecipeIcon` and `resolveRecipeIconAsync` still re-derive it under `src/systems`, ordering it the other way — an authored non-default `img` wins outright and the borrow outranks only the default — but both are caller-less, so no surface resolves through them.
    The one re-derivation inside `src/ui` is `createRecipeGraphIndex` (`src/ui/svelte/util/recipeGraphBuilder.js`), which takes `recipe.img || DEFAULT_RECIPE_IMAGE` at the call site: it borrows nothing, but it does not treat the `icons/svg/item-bag.svg` sentinel (or a whitespace-only `img`) as "no image".
    Issue 1082 moved that expression out of `buildRecipeGraph` and into the retained index every graph query now reads; the resolution itself is unchanged.
    It carries no user impact today, because the Graph surface is an unimplemented placeholder gated behind `fabricate.experimentalFeatures` (issue 442).
17. A UI draft seeded from the recipe-browser projection carries DERIVED, non-model fields — `recipeItemId`, `recipeItemIds`, `recipeItemName` and `recipeItemSourceUuid` — for display only (issue 978).
    A save must OMIT them from the update payload rather than writing them, and must never write them as `null`: `RecipeManager.updateRecipe` merges over the persisted record, so omission preserves the persisted value while an explicit `null` would destroy the scalar maintained for the standalone alchemy formula-item cohort.
    The strip belongs to the store that derives them, so the projection's producer owns its own write boundary and the draft keeps carrying them for the editor's Books & Scrolls display.
    Only `recipeItemId` reaches disk today, because `Recipe.fromJSON` reconstructs from named fields and drops the other three; that is a property of the model's current field list rather than a guarantee, so the whole derived set is stripped and named in one place.
    `recipe.recipeItemId` is authored ONLY by migration and by `CraftingSystemManager._migrateLegacyRecipeItems`, never by the editor.
    A recipe that is a book member through `RecipeItemDefinition.recipeIds[]` and carries no `linkedRecipeItemUuid` has its leaked scalar cleared by that same un-gated pass, which is idempotent because a cleared recipe is not a re-stamp candidate.
    The repair is deliberately unreachable while the system's `membershipResolvesByRecipeIds` marker is unset, because no recipe is then a member by `recipeIds` and the scalar is still the membership source for `getRecipeItemDefinitionsContaining` and `_getRecipeObjectsReferencingRecipeItemDefinition`.
    That forward read, the reverse read, and the book-side `adminStore` derivation `_enrichRecipeItemLibrary` are each gated on that marker rather than on any per-read inference over the arrays, so a leaked scalar never resurrects phantom book membership — its only live consequence was the image borrow in requirement 16.
    The forward read has ONE implementation for every reader that asks it — the recipe browser's row projection included, which formerly carried a copy of the rule with no `linkedRecipeItemUuid` leg and could therefore name different books from the delete impact statement on an un-migrated world.
18. `Recipe.toJSON()` OMITS a field whose value is the one the constructor rebuilds from absence, and omits the flat top-level `results` alias unconditionally (issue 1087).
    A recipe is rewritten whole on every mutation, replicated to every client, and stringified twice more by `RecipeManager.reload()`'s change comparison, so an always-emitted default is paid once per recipe on every one of those.
    Absence and the written default already mean the same thing on read, which is what makes the omission a pure write-side reduction: it needs no migration, loses nothing on downgrade, and does not change what any stored recipe means.
    On a 10,000-recipe corpus the alias accounts for ~10% of the serialized bytes and the defaults for ~26%, together ~36% (23.75 MB to 15.23 MB).
    Three fields are deliberately NOT omitted, and the reasons are the rule rather than exceptions to it.
    `complex` is DERIVED from the authored shape when absent (`_deriveComplex`), not defaulted, so omitting a stored `false` can reconstruct as `true`.
    `metadata` is rebuilt from `Date.now()` and the current user's name when absent, which is not the value that was omitted.
    `enabled: true` is omittable by the model and NOT by its readers: `SignatureValidator.validateSystem` scopes the alchemy signature-collision scan with a truthy `recipe?.enabled` over payloads handed to it straight from `toJSON()` by `CraftingSystemManager._assertNoAlchemySignatureCollisions` and `collectAlchemySignatureBlockers`, so omitting the default would empty that scan and silently retire the save-block.
    `allowPlayerResultReorder: true` IS omitted, and the difference is instructive: absence has been a live on-disk state for it since issue 651 declined to seed it by migration, so every reader already asks `!== false`.
    Whether a default may be omitted is therefore a property of the field's READERS, audited per field, and the omission set is a hand-maintained mirror of the constructor guarded mechanically by `tests/recipe-serialization-payload.test.js`.
    The rule reaches the NESTED rows as well as the top-level ones (issue 1135).
    A result group emits `checkOutcomeIds` only when it names at least one routed outcome tier, at recipe level and step level alike, through the one serializer both emitters share; `_normalizeResultGroups` rebuilds `[]` from absence and the only two arbiters that read it — `ResolutionModeService`'s routed-group filters — treat an omitted key and `[]` identically.
    The nested ingredient rows are recorded under § IngredientSet, § IngredientGroup and § Ingredient, whose omissions are far larger than the recipe's own: on the corpus this rule was measured against, everything removable is 36.89% of a simple serialized corpus and 58.79% of a rich one, and the whole `ingredientSets` subtree is 54.66% / 93.68% of it.

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
Residual, CLOSED by issue 570: copy-mode import now regenerates every component id and atomically remaps every within-payload component reference (recipe ingredient and result refs including the `systemItemId` alias, the recursive `alternatives[]` refs, and the flat `ingredients`/`results` aliases; the retained `tool.componentId` alias in both the system and gathering-library tool slices; component-discriminated `onBreak.replacementTarget`; `essence.sourceComponentId`; salvage result refs; gathering drop-row `componentId`; and legacy `catalysts[]`), so two systems copy-imported from the same origin no longer share a component id.
Issue 561 removed the blocker by giving Tools their own identity — a Tool no longer borrows `componentId` for cross-system matching — and issue 570 flipped regeneration on in `prepareForImport('copy')`.
The per-system `roles` map and the resolver's `systemId` scoping remain load-bearing, because component ids stay per-system-unique only: independently-authored systems, and worlds that copy-imported BEFORE issue 570, can still share ids.

### Registration Source Identity

At registration (both recipe items and components), a definition's `originItemUuid` is a best-effort source POINTER; the durable flag is the identity-OF-RECORD.
Every kind's durable identity-of-record is a per-system leaf under `flags.fabricate.roles[systemId]`: a component's is `componentId`, a first-class tool's is `toolId`, and a recipe item's is `recipeItemDefinitionId`.
`flags.fabricate.roles` is the unified, final per-system role map and the single home for all three durable identities; issue 556 populates `componentId`, issue 561 populates `toolId` (stamped by `addToolFromUuid` and the `autoStampToolSources` one-shot restamp), and issue 567 populates `recipeItemDefinitionId` (stamped by `addRecipeItemFromUuid` and the repurposed `autoStampRecipeItemSources` restamp), each an additive sibling key.
A legacy scalar `flags.fabricate.componentId` (components) or `flags.fabricate.recipeItemDefinitionId` (recipe items) is still honored at match time as a claimed id — a transitional read-only fallback tier — until the one-shot restamp backfills the map; tools never had a legacy scalar.
Registration stamps only the owning system's `roles[system.id]` leaf for the kind, and clears only that per-system leaf on re-point or repair, never the whole `roles` flag nor the whole `roles[systemId]` object (which would destroy the sibling leaves).
A CRAFTED OUTPUT item carries the durable component identity of its result component: crafting stamps `flags.fabricate.roles[craftingSystemId].componentId` on the output item at creation, so a freshly crafted product resolves to its OWN component through the identity tier and never through the transitive `_stats.duplicateSource` it inherits from a source item duplicated off a sibling component (a result with no managed component, or a system id that is not a durable-flag-key segment, is left unstamped and degrades to raw-reference resolution).
A GATHERED AWARD item carries the durable component identity of its awarded component: the gathering award creation path stamps `flags.fabricate.roles[systemId].componentId` (the awarding system's id) on the created item at creation, so a gathered part resolves to its OWN component through the identity tier; an award with no managed component (a bare `itemUuid` source), or a system id that is not a durable-flag-key segment, is left unstamped and degrades to raw-reference resolution.
A TOOL-REPLACEMENT grant item created from a Component-discriminated `onBreak.replacementTarget` carries that replacement Component's durable identity: the creation path stamps `flags.fabricate.roles[systemId].componentId`, and additionally stamps `flags.fabricate.roles[systemId].toolId` when exactly one first-class Tool links that Component, so a replacement that is itself a working Tool stays durably matchable and breakable.
A direct-Item replacement preserves the resolved Item source identity and never receives fabricated Component identity.
These creation-time stamps write the same `roles[systemId]` leaves the one-shot component restamp and the **Repair item data** action write, with the same values, so they are idempotent-compatible; they add no migration and fix only items created after the one-shot back-fill has run.

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
};
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
  toolIds: string[], // active only for a named set in routedByIngredients

  // routedByIngredients: routes the satisfied ingredient set to this result group
  resultGroupId?: string,
}
```

### Requirements

1. `ingredientGroups` must contain at least one `IngredientGroup` (essence options included), unless the legacy `essences` map contains one or more positive requirements (back-compat read for one release).
2. Ingredient-set evaluation is always OR-across-sets at recipe/step level.
3. AND-across-ingredient-sets is not supported.
4. `toolIds` normalizes to `[]` when absent; each id coerces to a trimmed string and empties are dropped.
   Ingredient-set Tool ids are active only when the owning Crafting System uses `routedByIngredients` and the set's trim-normalized name is non-empty.
   Outside that boundary the ids remain serialized for lossless round-tripping but are ignored by craftability, execution, inventory `requiredFor` projections, Recipe complexity, and admin Tool counts.
   For an active set, the applicable Tool set is the distinct union of recipe-level, active-step, and ingredient-set-level `toolIds`, resolved against the per-system Tools library; ids that miss the library are logged and dropped.
5. `IngredientSet.toJSON()` OMITS a field whose value is the one the constructor rebuilds from absence, and omits the flat `ingredients` alias unconditionally (issue 1135).
   This is the same rule as Recipe requirement 18, applied to the set: absence and the written default already mean the same thing on read, so the omission needs no migration, loses nothing on downgrade, and does not change what any stored set means.
   The omitted set is `name`, `essences`, `toolIds`, `resultMapping` and `resultGroupId`; `id` and `ingredientGroups` are never omitted, being the set's identity and its authored shape.
   `name` is the one candidate with a SEMANTIC reader and is therefore the one that proves the rule: `toolCheckBonus` treats a non-empty set name as "this set's Tool prerequisites are active" under `routedByIngredients`, exactly the `enabled`-shaped hazard requirement 18 exists for, and it survives omission only because the written default `''` is already the falsy side of that predicate — had the default been a non-empty sentinel, omitting it would have silently deactivated every set's Tools.
   `SignatureValidator` reads `set.name || null` and falls back to the set position for absence and `''` alike.
   Absence of `essences` is already a live on-disk state, because the 1.17.0 migration deletes the key outright once it has folded each positive entry into an essence option.
   The omission set is a hand-maintained mirror of the constructor, guarded mechanically by `tests/ingredient-serialization-payload.test.js`.
6. Every writer that rewrites a serialized ingredient set — the component-delete cascade, the essence-delete cascade, and the tag-vocabulary cascade — MUST resolve the flat `ingredients` alias rather than carry it through a `{ ...set }` spread or recompute it (issue 1135).
   The rule is: DROP the alias when the source set carries `ingredientGroups`, and KEEP the filtered legacy array when it does not.
   Both halves are load-bearing.
   Re-emitting it puts a write-retired alias back one cascade at a time, producing a corpus that is not lossy but is mixed — most sets alias-free, cascade-touched sets carrying a stale one — which is the issue-1036 resurrection hazard in latent form.
   Dropping it unconditionally destroys a flat-authored set's ONLY ingredient data and removes the `set.ingredients?.length` leg of the retention filter that keeps such a set alive at all.

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
5. `IngredientGroup.toJSON()` emits exactly `{id, name, options}`, and omits none of its own keys; the payload reduction at group level comes entirely from its OPTIONS, which are filtered by the Ingredient omission table (issue 1135).
   `checkOutcomeIds` is NOT an ingredient-group field and never has been — it lives on `ResultGroup`, and its omission is recorded under Recipe requirement 18.
   The group's own `name` is a further omission candidate (`data.name || ''`, read only through `typeof === 'string' && trim()` guards) but is deliberately out of scope for issue 1135, whose omissions are exactly the fields its per-field reader audit covered.

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
    unit?: string,    // a configured CurrencyConfig.units[].id (world scope)
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
7. A `match.type === "currency"` option is a currency ALTERNATIVE for its ingredient group: `unit` is a configured world `CurrencyConfig.units[].id` and `amount` is a positive cost.
   A currency option matches no inventory item and contributes no alchemy signature.
8. A `match.type === "essence"` option is an essence ALTERNATIVE for its ingredient group: `essenceId` is a configured `CraftingSystem.essences` key and `amount` is a positive essence quantity.
   It is satisfied by consuming items whose accumulated `essenceId` essence meets `amount`, and it expands to every component carrying that essence.
   An essence option matches no single inventory item (satisfaction is amount-accumulative across items and routes through the consumption planner).
   An essence option is resolved inside its ingredient set's single essence block rather than in its own author position (see §Essence-Alternative Consumption), so its funding is pooled with every other essence option in the set.
   The player selects the held **items** that fund the block through the `essenceAllocation` channel, rather than picking one option per essence requirement as they would for a component/tag group.
9. `Ingredient.toJSON()` OMITS a field whose value is the one the constructor rebuilds from absence, and omits the `systemItemId` duplicate unconditionally (issue 1135).
   Option-level keys are the dominant term in a serialized recipe corpus because they are paid once per option, per group, per set, per recipe: an authored component option of 68 bytes was written as 213 — a 3.1x expansion made entirely of these defaults and one exact duplicate — and ablating them is 19.66% of a simple corpus and 47.55% of a rich one.
   The omitted set is `componentId`, `itemUuid`, `tag`, `alternatives`, `extractEffects` and `effectFilter`; `match` and `quantity` are never omitted.
   `quantity` is omittable by the model (`data.quantity || 1`) and is deliberately excluded, because serialized options are read arithmetically by the shopping-list and consumption projections and that is a separate reader audit.
   Absence is not a new on-disk state for any omitted key: the 1.17.0 essence migration and `IngredientSet._legacyIngredientsToGroups` have both been writing options as a bare `{quantity, match}` with all seven fields missing, so every reader has always had to cope.
   `extractEffects` and `effectFilter` have NO readers at all — the ingredient-level effect-extraction path was removed — and are worth 7.00% of a simple corpus between them.
   `componentId` is a canonical field omitted when `null`, which does not weaken the canonical-write policy: the top-level field is DERIVED by the constructor from `match` (`match.type === 'component' ? match.componentId : null`), the canonical component reference is `match.componentId` and is always emitted, and `null` means "this option is not a component match" — which absence says identically to every reader, each of which coerces through `componentId || systemItemId`.
   The omission set is a hand-maintained mirror of the constructor, guarded mechanically by `tests/ingredient-serialization-payload.test.js`.

### Currency-Alternative Spend (Craft-Time)

When the crafting system has `requirements.currency.enabled === true`, a currency option can satisfy its ingredient group by spending the crafting actor's currency at craft time:

1. Selection is **items-first, currency-fallback** per group.
   Every non-currency option is tried first; the first item-satisfiable option wins even if a currency option is authored earlier (items strictly beat currency).
   Only if no item option satisfies does the resolver choose the first AFFORDABLE currency option in author order among the group's currency options.
2. Affordability is evaluated against the crafting actor through the world's currency profile and spend strategy (`actorProperty` / `actorInventory` / `macro`), which the system's toggle only admits or refuses.
   The craftability display and the engine execution resolve currency against the **same** actor, so what a player sees agrees with what the craft spends.
   With no crafting actor the currency option is treated as unaffordable (shown missing); it never throws.
3. The engine computes the chosen item plan and currency spends **once** for a craft, then runs an all-affordable gate over the chosen spends — aggregated per terminal base unit — **before** any item or currency mutation.
   On a shortfall the craft aborts with an `Insufficient currency` message and zero mutation, and never falls back to an unselected item plan.
4. On the CRAFT path, currency is deducted after item consumption on success (and on a failure path only when the failure policy consumes ingredients).
   The scope matters because the companion contract's pooled holdings consume settles in the same order for a different reason, and the two agree rather than merely coinciding: an earlier draft of that member had them opposed.
   Here the order follows from the craft's own sequencing; there it follows from which leg has a reliable inverse — a deleted component is restorable exactly, while a currency give-back may be absent or lossy — so the recoverable leg is taken first in both.
   Deduction makes change across the configured denomination ladder; a deduction failure is logged, not refunded — the settled deductions are NOT rolled back, and the craft still proceeds.
   That last clause is the craft path's alone: the pooled consume gives back everything it took in the same call, which is the difference between a craft that has already produced its result and a companion request that has produced nothing yet.
   Deduction is aggregated per terminal base unit and stops at the first group that fails, so no further currency is taken for a craft already in an anomalous state; the deduction reports which groups settled.
   A time-gated step that consumes at START records on its run ONLY the spends that actually settled, never the intended plan.
   A group that did not settle is not recorded, so no later reversal can return currency the actor never paid.
5. When `requirements.currency.enabled === false`, a currency option can never satisfy its group (it is shown missing), regardless of the actor's balance.
6. A currency requirement or cost is displayed by resolving the unit `id` to a human label through the chain `abbreviation` (when authored) → `label`, so a well-formed requirement never surfaces the raw unit `id`.
   The sole exception is a degenerate orphaned reference — a `requirement.unit` id no longer present in the resolved world currency config — which `formatCurrencyRequirement` renders verbatim as a last-resort fallback (a stale id being preferable to a blank cost).
   This applies to the player crafting-app currency option cost row (`RecipeManager` resolves the recipe's currency units through `normalizeCurrencyUnit` so the abbreviation self-heal applies, then formats the row through `formatCurrencyRequirement`).

### Essence-Alternative Consumption (Craft-Time)

An essence option satisfies its ingredient group by consuming essence-carrying items until its `amount` is met — jointly with the set's other essence options rather than by an independent per-group draw (clause 5), and unit-granular like a component/tag alternative:

1. The per-item essence contribution is read through an injected bound `resolveItemEssences(item) => essenceMap` collaborator, keeping the pure model Foundry-free.
   The default resolver is **flag-only** (`fabricate.essences` item flag), so the no-probe `canBeCraftedWith`/display path stays byte-for-byte the legacy behaviour; callers (`RecipeManager`, `CraftingEngine`, the per-slot selector) bind a **component-aware** resolver that also credits component-defined essences — an intentional capability increase over the old flag-only per-set gate.
2. Consumption reads the shared `remaining` map and commits through `_commitItemPlan` (keyed by `uuid || id`), so an item already claimed by a component/tag group in the same set is not recounted toward the essence group (anti-double-consume).
3. Consumption is **unit-granular**: an indivisible item may over-consume past `amount` (e.g. one item worth 3 essence to meet `amount: 2`), acceptable and symmetric with tag/component options.
4. Accounting is per-unit occurrence in alchemy (the submitted multiset) and summed over the configured stack-quantity path in standard craft, mirroring the existing documented divergence between the two matchers.
   The two paths **agree** that essence requirements share units with each other: alchemy pools the whole submission across every essence requirement, and standard craft resolves an ingredient set's essence options as one joint block (clause 5).
   They still **differ** on whether a unit already claimed by a component/tag requirement contributes its essences: alchemy credits it, standard craft does not, because clause 2's `remaining`/`_commitItemPlan` ledger has already spent that unit.
5. Every `match.type === "essence"` option in one ingredient set forms a single **essence block**, resolved as one backtrackable node placed last — after every component/tag group has claimed from `remaining`.
   Within the block a consumed unit credits every essence it carries to every essence requirement in the block, so one dual-essence carrier can fund two essence requirements at once.
   The block's scope is exactly one ingredient set: it does not span ingredient sets, it does not span steps, and it does not reach across the component/tag boundary.
   The governing principle, stated so the boundary is not arbitrary: an occurrence-based requirement (component or tag) claims a unit exclusively, while amount-based essence requirements share the units claimed for the block.
   Joint resolution is a strict relaxation of per-group draw-down — the union of the per-group draws satisfies every group a fortiori — so no authored recipe becomes uncraftable.
   Being a backtrackable node rather than a post-pass is load-bearing for that claim: a block that cannot fund must be able to force an earlier component/tag group to re-branch.
6. The player MAY steer which held items fund the block through `resolveIngredientSelection`'s `essenceAllocation` override channel, a `{ itemKey: units }` map.
   `itemKey` is an index into the already-resolved ledger and never a uuid the model resolves, so no allocation entry can trigger a document lookup; a key naming nothing in the ledger contributes zero units and is dropped.
   Each entry is clamped against the units `remaining` still holds after the component/tag groups have claimed, and the allocation survives the resolver's re-branching.
   The allocation is honoured whether or not it satisfies the block: a short allocation is reported short and is **never** topped up from unallocated carriers.
   A craft submitted with a player allocation that does not fund the block is therefore **refused with the missing-materials message** rather than consuming its partial plan (`CraftingEngine._allocationShortfallMessage`), mirroring the `optionOverrides` rule in `recipes-and-steps` that an insufficient override blocks the craft rather than being silently redirected; the default path, which gates on the allocator's own suggestion, is unchanged.
   The resolved allocation is returned on `selection.essenceAllocation`, so a surface displaying it is displaying exactly what the craft consumes.
7. The block contributes **at most one consumption-plan entry per item key**, whose `quantity` is the number of units the block draws from that item, committed once through `_commitItemPlan` after every component/tag group has claimed.
   A component/tag group MAY still contribute its own entry for the same item key: those draws are disjoint and compose correctly under the engine's live read of the configured stack-quantity path.
   Two entries for the same _shared_ unit do not compose, and on Foundry V13/V14 the second delete throws mid-consumption rather than silently overspending, so the block never emits a second entry for an item key it already claims.
8. Every essence requirement's reported quantity comes from a **per essence id** partition of what the block delivers: for each essence id, the requirements naming that id settle in author order, each taking `min(need, remaining delivered of that id)`.
   A requirement is missing exactly when its take is less than its `need`, and its reported quantity is that take — an essence amount in the same unit as `need`, never the ledger total of matching items held.
   The partition is total (every essence requirement is either satisfied or in `missingGroups`), it runs whether or not the block is short, and it is independent across essence ids: a short Radiant requirement never marks a fully delivered Shadow requirement missing.
   Because every take is capped at `need`, a satisfied essence requirement always reports delivered exactly equal to `need`; the unit-granular overshoot of clause 3 is visible in the per-carrier allocation, never in a requirement's ratio.
9. Each essence-block plan entry carries `essenceGroupIds: string[]` naming every essence requirement it funds, alongside `ingredient` (the first funded option, retained for back-compat).
   A reader resolving an essence requirement's consumed item MUST prefer `essenceGroupIds`, because one block entry names one `ingredient` and its sibling essence requirements would otherwise resolve to no consumed item.
   Consumption-plan entries are not persisted, so no migration follows.

## Alchemy Signature Uniqueness (Validation Contract)

### Purpose

Define the save/import invariant that guarantees deterministic ingredient-signature resolution in alchemy mode.

### Contract

1. Applies only when `CraftingSystem.resolutionMode === "alchemy"`.
2. Scope is the **enabled** recipes in the crafting system.
   `SignatureValidator.validateSystem` scans only enabled recipes — the exact complement of the runtime matcher's `if (!recipe.enabled) continue;` skip — so the scanned set equals the matchable set.
   The invariant is _"the set of **enabled** recipes is collision-free"_: the `blocks:'system'` gate, the save-block, and the disable-reconciliation all funnel through one scan scope, and disabling all participants of a conflict genuinely clears it (re-enabling a disabled collider is re-caught at that mutation).
   That scan may be served from a report compiled once per revision rather than re-run per question, provided the report is invalidated by every change that can alter a signature — the recipes of the system, the system's own component/tag/essence definitions, and any in-place rewrite of a stored recipe — and provided a candidate evaluated incrementally against it yields the conflicts, in the order, a full `validateSystem` scan of the same substituted corpus would have reported.
   `validateSystem` remains the unpruned oracle the cached path is answerable to.
3. Signature overlap is based on satisfiable ingredient assignments, not just textual equality.
4. Matching expansion must include:
   - direct component matches (`match.type === "component"`)
   - tag matches (`match.type === "tags"`) expanded against current system components/tags
   - essence matches (`match.type === "essence"`) expanded to components carrying the essence, counted by AMOUNT (not occurrence) with `computeGroupOptions` capacity `min(amount, ids.size)`.
5. Ingredient groups may resolve to the same component ID when inventory quantity is sufficient to satisfy the aggregate quantity across those groups.
6. Any overlapping satisfiable signatures between ingredient sets in the same system are invalid.
7. Save is blocked for any collision among enabled recipes in the system, including when editing an unrelated recipe.
8. The scan MUST evaluate the candidate recipe as though its activation had already landed — the enabled cohort it is scanned against is the stored one with the candidate SUBSTITUTED for its stored copy, or APPENDED when no stored recipe carries its id.
   Both arrangements are required, because a candidate reaches the gate at two different moments: an enable transition (`updateRecipe`, `canActivateRecipe`) validates a candidate whose stored copy is still disabled or still carries the pre-edit ingredient sets, while a create or import (`createRecipe`, `importRecipes`) validates a candidate that is not stored at all and is persisted only after the gate passes.
   A conflict is reported as a pair of recipe ids and then filtered to the ones naming the candidate, so a candidate missing from the scanned cohort can never be named and the gate answers "no collision" for every candidate whatever its signature.
   Which recipes a new recipe may collide with is therefore identical on all four paths, and a first-time collision is refused at the moment it is introduced rather than only at the next reconciliation.
   An appended candidate takes the cohort position persisting it would give it — after every stored recipe — so the conflicts it reports carry the order and the pair orientation an audit of the post-create cohort would have produced.
9. A recipe refused by the gate is never persisted enabled, and each entry path refuses it in its own idiom:
   - a strict `createRecipe` REJECTS, so the caller fixes the collision before the recipe exists;
   - a drafting `createRecipe` (`allowIncomplete`) is BORN DISABLED, the same outcome any other activation failure already produces for a draft;
   - `importRecipes` SKIPS AND REPORTS the recipe rather than throwing, so one ambiguous recipe never aborts the recipes around it.
10. Import behavior is partial:
    - non-conflicting recipes are imported,
    - conflicting recipes are rejected,
    - one aggregated conflict report is returned at completion.
    A recipe rejected SOLELY for a signature collision is reported under its own reason, distinct from the malformed-recipe reason, because it is authored correctly and is refused only for the company it keeps; a recipe that is both malformed and colliding is reported as malformed, the fault to fix first.

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
  id: string,
  enabled: boolean,
  componentId: string | null,      // OPTIONAL managed-component link; null for an item-sourced tool
  // Own source references (issue 561; renamed in issue 560), identical field shape to a component.
  registeredItemUuid: string | null, // the registered live source document uuid
  originItemUuid: string | null,     // the canonical/compendium source uuid
  aliasItemUuids: string[],          // additional source references for matching
  // Registration/migration-time DISPLAY SNAPSHOT (name + img + description, never `label`).
  name: string | null,
  img: string | null,
  description: string,
  label: string,                   // pre-existing, user-authored display override (distinct from the snapshot)
  requirement: null | {
    formula: string,
  },
  prerequisites: {
    enabled: boolean,
    ids: string[],                 // ids into the WORLD characterLibraries.characterPrerequisites
    gateMode: "bonus" | "usability",
  },
  bonus: {
    enabled: boolean,
    expression: string,
  },
  breakage: {
    mode: "limitedUses" | "breakageChance" | "diceExpression",
    maxUses?: number | null,         // limitedUses; null means unlimited
    breakageChance?: number,         // breakageChance; integer 0..100
    formula?: string,                // diceExpression
    threshold?: number,              // diceExpression; broken when result < threshold
  },
  checkBreakable: boolean,         // default true; check-driven immunity only
  onBreak: {
    mode: "destroy" | "flagBroken" | "replaceWith",
    replacementTarget?:
      | { type: "component", componentId: string }
      | { type: "item", itemUuid: string },
  },
  repairRequirements: IngredientGroup[], // flagBroken repair recipe; zero groups is valid
}
```

### Requirements

1. A Tool must carry EITHER a `componentId` (a managed-component link) OR its own source references (`registeredItemUuid` / `originItemUuid`); a Tool with NEITHER is invalid.
   A first-class tool registered from an Item uuid carries its own source references plus a `name` + `img` display snapshot and `componentId: null`; a whetstone that is also a component, or a tool migrated from a legacy componentId-tool, keeps `componentId` populated (for `onBreak.replaceWith` resolution and the UI's linked-component display) but `componentId` is no longer the matching basis.
   A component-linked tool that carries no own source references derives them and its `name` + `img` snapshot from its linked component on every `_normalizeSystem` load (`deriveToolSourceFromComponents`), not only at migration time — so a tool authored by dropping a managed component, a copy-imported tool, and a post-migration authored tool all match owned items by source reference, continuous with the `1.15.0` migration and idempotent (an item-sourced or already-derived tool is left untouched, and the derivation never overwrites the tool's own snapshot or `label`).
   The `name` + `img` + `description` display snapshot is captured at registration or relinking time and is NOT auto-refreshed when the GM changes the source Item — parity with recipe-item definitions, not the component `updateItem` refresh path — because durable identity, not the snapshot, is the matching basis.
   The pre-existing user-authored `label` is a DISTINCT field and is NEVER written by snapshot capture, migration, or any refresh.
2. Tools are **SYSTEM-OWNED**: the single canonical library lives on the crafting-system object as `system.tools` (persisted in the `craftingSystems` setting, populated by `CraftingSystemManager._normalizeSystem`).
   Every consumer reads this one source — the recipe/step/ingredient-set/salvage tool gate (`RecipeManager`, `CraftingEngine`), the canvas interactable browser and item-drop resolution, and gathering.
   Gathering composition (`GatheringRichStateService.composeEnvironment`) sources `task.toolIds` lookups from `system.tools` (exposed on the composed environment as the non-enumerable `__libraryTools` map); it does **not** read a gathering-scoped tools copy.
   The 0.6.0 Catalyst→Tool migration writes migrated crafting Tools onto `system.tools`; the 0.7.0 migration reconciles any UI-authored `gatheringConfig.systems[id].tools` onto `system.tools` (dedupe by id, the system tool wins) and clears the gathering-config copy, so `system.tools` is the sole library going forward.
3. A referenced Tool is always required: it must be present and pass any enabled shared-prerequisite usability gate before crafting, salvage, or gathering may proceed.
   Its optional legacy gathering `requirement` formula is additionally enforced only for gathering attempts.
   A reference whose id no longer resolves in its library, or that resolves to a disabled tool, blocks the attempt with `TOOL_BLOCKED`.
4. `requirement` is optional and formula-only.
   When present, it requires a non-empty `formula` — a Foundry roll expression evaluated against the actor's roll data.
   The actor satisfies the requirement when the result is truthy (a non-zero number or a `true` boolean).
   There is no provider discriminator and no macro support on this surface.
5. Exactly one of the three tool-specific `breakage.mode` values is configured per Tool, and that configuration is retained but entirely inactive while `checkDriven` authority is active (including no mutation of retained tool-specific usage counters):
   - `limitedUses`: `maxUses` is null or a positive integer.
     Tool usage is tracked on the owned item via `flags.fabricate.toolUsage = { timesUsed }`.
     The tool breaks once `timesUsed >= maxUses` (after the per-attempt increment).
   - `breakageChance`: `breakageChance` is an integer in `0..100`.
     The tool breaks when `Math.random() * 100 < breakageChance` (so `0` never breaks and `100` always breaks).
   - `diceExpression`: `formula` is a non-empty Foundry roll formula evaluated against the actor's roll data; `threshold` is a finite number.
     The tool breaks when the numeric result is `< threshold`.
     Legacy `breakage.mode: "immune"` reads forward in both `Tool` construction and `_normalizeSystem` as `{ mode: "limitedUses", maxUses: null }` plus `checkBreakable: false`, and the next canonical write never emits `immune`.
6. `prerequisites` always persists `{ enabled, ids, gateMode }`, and `bonus` always persists `{ enabled, expression }` even while either setting is inactive.
   **The prune of unknown Tool prerequisite ids is CONDITIONAL on a known-complete Valid Id Basis, and is NOT performed "in every state"** — that unqualified rule stood only while the library lived on the crafting system beside the Tools, and issue 1308 falsified it by moving the library to a world setting a given client may not have migrated.
   The normalizer resolves the basis for the prerequisite library BEFORE Tools (`CraftingSystemManager._characterLibraryBasis`, the union of the world library and any surviving legacy in-system copy) and passes it in; when that basis is UNKNOWN the pass still runs and still rebuilds the record, but every id passes through untouched.
   When the basis IS known-complete the prune is unchanged: an unknown id is dropped, valid ids are retained while the gate is disabled, and an enabled gate is changed to disabled when pruning leaves no ids.
   The same basis MUST reach `upsertTool`, which does not go through `_normalizeSystem` and would otherwise derive an empty one of its own and clear a healthy world's gate on every Tool save.
   An UNKNOWN basis is carried as a sentinel value that is not a `Set`, and every prune site tests for that rather than for emptiness, because an empty `Set` is a real, prunable basis and is exactly what the omitted-argument form of this failure looks like.
7. Exactly one `onBreak.mode` is configured per Tool.
   `replaceWith` carries exactly one discriminator in `replacementTarget`: a managed Component id or a direct Item UUID; malformed, empty, or dual targets are invalid, and a Component target must differ from the Tool's own `componentId` when present.
   New Manager authoring is Component-only: the Tool Studio never creates or edits the direct Item discriminator.
   Direct Item targets remain normalized and executable solely for backward compatibility with already-persisted Tools, and an unrelated Tool edit or immediate enabled toggle must preserve them byte-for-byte.
   `flagBroken` permits zero or more repair `IngredientGroup`s; every present group must be complete canonical `IngredientGroup`/`Ingredient` JSON whose options use valid Component, Tag, Essence, or Currency match shapes and numeric positive option quantities.
   Every breakage consumer resolves and creates exactly one quantity-one replacement before deleting the original.
   Direct UUID resolution awaits `fromUuid` and accepts only a returned Document with `documentName === "Item"`; null, index entries, and non-Item Documents fail.
   Resolution failure, missing creation API, a throw, and null/empty creation preserve the original and are not reported as `replaced`.
   Component targets receive managed Component identity, while direct Item targets preserve source Item identity without fabricated Component identity.
8. `flags.fabricate.toolBroken === true` on an owned item disqualifies it from satisfying a tool's presence gate until the flag is cleared.
9. A **virtual-present** Tool injected by a canvas Tool station (system-scoped via `presentTools = { systemId, componentIds, toolIds }`) satisfies a Tool prerequisite without the actor owning the item and is excluded from usage and breakage.
   The match fires only when the evaluated recipe/task's own crafting system equals the active tool's `systemId`, because both id kinds are per-system.
   Virtual presence is keyed by the station's **library `toolId`** as well as any linked `componentId`, so an item-sourced Tool participates on the same terms as a component-linked one (issue 1119).
   Keying on `componentId` alone is invalid: a station built from an item-sourced Tool then resolves to no payload at all, and the activation is refused — silently, in the shipped 1.8.0 behaviour — even though the station places and renders correctly.
   A station whose Tool cannot be resolved denies activation with a routed, player-facing reason; it never answers a click with no response.
10. An owned item is selected for tool **usage OR breakage** — both, not breakage alone — only when it matches the tool by **durable-identity matching** against the tool's OWN identity.
    Durable-identity matching means: (a) the durable per-system tool-identity flag `flags.fabricate.roles[systemId].toolId`, OR (b) the item's own `uuid` or compendium source (`_stats.compendiumSource` / `flags.core.sourceId`) intersecting the tool's source references.
    Tools have no legacy scalar identity tier.
    An item is NEVER selected for usage or destruction by a transitive `_stats.duplicateSource` reference or by name alone, either of which still satisfies the non-destructive **presence** gate (the wide shared tool matcher).
    An item that satisfies presence only via a transitive duplicate-source reference or by name is spared from usage/breakage and recorded as a skipped tool.
    When an actor owns both a durable-identity match and a presence-only match for the same tool, the durable-identity item is the one used or broken.
    Because destroying the wrong item is irreversible, this is the shipped behaviour ("is"): a world-template copy lacking both a compendium source and a durable flag is spared until repaired, rather than risking an irreversible wrong-item destroy.
    A locked-compendium copy carries its own compendium source, matches durable identity (b), and still breaks.
11. A Tool's durable identity is `flags.fabricate.roles[systemId].toolId`, stamped on its source Item by the atomic Tool upsert used by `addToolFromUuid` and by the one-shot `ready`-body restamp (`autoStampToolSources`, keyed by `TOOL_FLAG_STAMP_VERSION`), an additive SIBLING of `roles[systemId].componentId`.
    A whetstone that is both a component and a tool carries both leaves in one `roles[systemId]` object, and neither registration clobbers the other: deregistering or re-pointing a tool clears ONLY the `roles[systemId].toolId` leaf.
    A bulk-imported tool (via `createSystem`) matches by raw source references until a manual "Repair item data" stamps its owned copies, identical to imported components.
    The upsert rejects non-Item Documents, stages the description/name/image/source snapshots, clears only a changed old Tool role leaf, stamps the new leaf, and persists one normalized Tool atomically.
12. Tool **presence** matching resolves the owned item against the system Tools library by the tool's own source references (durable `roles[systemId].toolId` first, then source-ref intersection including the transitive `_stats.duplicateSource`, then the tool's snapshot-name fallback), not through a managed component.
    Tool **usage/breakage** selection matches by durable identity against the Tool's own identity per requirement 10.
    EVERY surface that answers "is this owned item a Tool, and which Tool is it" resolves through that shared matcher — the crafting and gathering tool gates, the canvas item-drop resolver, and the player Inventory listing (`InventoryListingBuilder`).
    Consulting `componentId` alone is invalid, for the same reason requirement 13 gives for display: a first-class item-sourced Tool carries `componentId: null`, so a component-only resolver finds nothing for a Tool whose identity is fully populated.
    That asymmetry — stated for display but left unstated for identity — is why the player Inventory kept a component-only projection through both issue 561 and issue 976, listing no row at all for an owned item-sourced Tool (issue 1119).
    A surface that resolves PRESENCE must use the wide matcher rather than the narrow durable-identity gate, so an item that satisfies the crafting tool gate is never absent from the surfaces that report what the player is carrying.
13. A Tool's displayed name and image resolve by ONE precedence at every surface: the user-authored `label` (trimmed) when non-empty, then the registration display snapshot (`name` / `img`), then the linked managed component's `name` / `img` when `componentId` resolves, then a localized fallback name and the generic `icons/svg/item-bag.svg` sentinel.
    The snapshot outranks the linked component deliberately, because a Tool that is also a managed component keeps `componentId` populated (requirement 1) and its own snapshot is the more specific identity.
    Consulting `componentId` alone is invalid: a first-class item-sourced Tool carries `componentId: null`, so a component-only resolver renders the fallback name and the item-bag sentinel for a Tool whose identity is fully populated (issue 976).
    A surface that renders the Tool's description resolves it the same way — the snapshot `description` first, then the linked component's — because the same omission blanks a populated description.
    `label` is never substituted into the snapshot and the snapshot is never written back to `label`; they are distinct fields per requirement 1.
    The reference implementation is `resolveToolDisplayName` / `resolveToolDisplayImage` / `resolveToolDescription` (`src/models/toolDisplay.js`), which `toolStudio.js` re-exports unchanged; a surface that receives the component lookup pre-flattened may re-derive the same ordering, but must not reorder or drop a rung.
    The precedence lives beside the `Tool` model rather than under the manager UI because the bound surfaces include engines, chat cards and the Run Journal projection, which cannot import from `src/ui/**` without inverting the layering — being unable to reach the reference implementation is what caused five further surfaces to re-derive it wrongly after issue 976 (issue 1119).
    Non-UI surfaces are bound by the same ordering: a chat card, a chat evidence projection, and the Run Journal step detail each render the Tool's own identity, never the linked component's alone and never the matched item's name ahead of an authored `label`.
    Breakage evidence records carry `toolId` alongside `componentId` precisely so a chat card can reach the Tool; without it the salvage card had no route back and emitted blank entries.

### Validation Matrix

| Field                                    | Valid values                                              | Invalid values                  |
| ---------------------------------------- | --------------------------------------------------------- | ------------------------------- |
| `componentId`                            | optional when source references are present               | absent AND no source references |
| `requirement.formula`                    | non-empty string                                          | empty                           |
| `breakage.limitedUses.maxUses`           | null or positive integer                                  | `0`, negative, fractional       |
| `breakage.breakageChance.breakageChance` | integer `0..100`                                          | non-integer, out of range       |
| `breakage.diceExpression.formula`        | non-empty string                                          | empty                           |
| `breakage.diceExpression.threshold`      | finite number                                             | non-finite                      |
| `prerequisites.ids`                      | world-library ids; at least one when enabled              | enabled-empty; unknown only against a known-complete basis |
| `bonus.expression`                       | non-empty when enabled                                    | enabled-empty                   |
| `checkBreakable`                         | boolean                                                   | non-boolean canonical input     |
| `onBreak.replaceWith.replacementTarget`  | exactly one valid Component id or Item UUID discriminator | absent, malformed, or dual      |
| `repairRequirements`                     | empty or complete canonical `IngredientGroup`s            | incomplete present group        |

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
  // alchemy tiered). Empty for non-tiered groups, and OMITTED from the serialized
  // payload when empty (issue 1135; see Recipe requirement 18).
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
};
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

  // START-phase consumption snapshot for a time-gated step, written when the gate is ARMED
  // and read at FINISH (source items are already deleted) and by the cancel reversal.
  // Absent for instant / non-timed steps and on pre-snapshot historical records.
  preparedConsumption?: {
    selectedIngredientSetId: string | null,
    currencySpends: Array<{ unit: string, amount: number }>, // SETTLED spends only
    resolvedEssences: object,
    essenceEnabled: Record<string, boolean>, // COMPLETE map over every resolvedEssences key
    consumedSummary: Array<{
      itemUuid: string | null, actorUuid: string | null, quantity: number,
      name: string | null, img: string | null, componentId: string | null,
    }>,
  },

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
7. `preparedConsumption.currencySpends` records what was actually deducted, never what was intended.
   It is the sole input to the cancel reversal's refund, so a spend that did not settle must not appear in it; an empty array is the correct record for a step whose currency deduction settled nothing.
8. `preparedConsumption.essenceEnabled` records each contributing essence's `enabled` state as it stood at START, and the FINISH phase evaluates the essence behaviour gate from it rather than from the live definitions.
   Evaluating at FINISH would let a mid-run GM toggle change the outcome of a craft whose inputs are already consumed.
   It is a **complete** map over every key in `resolvedEssences`, not only the disabled ones, because run persistence is a flag merge that cannot delete a key inside a surviving run and an omitted key would resurrect with its old value.
   An ABSENT map — a run armed before the field existed — reads as all-enabled.
   A collapsed multi-step chain has no such snapshot at all, because it consumes nothing when its single gate is armed and executes every step live at maturity; it therefore evaluates enabled-ness at maturity, consistent with its already-live essence resolution.

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
    granted?: true,      // present only on a granted entry; never written `false`
    grantedBy?: string,  // optional caller-supplied label, trimmed, at most 64 characters
  },
}
```

Requirements:

1. `recipeId` must reference a valid recipe.
2. `learnedAt` must be a valid timestamp.
3. `sourceItemUuid` should reference the matched owned recipe item used to learn.
   It is an actor-owned item uuid, so it dangles permanently once that copy is deleted, and it is written as `null` by BOTH of the paths that learn without a book: the craft-time auto-learn (alchemy `learnOnCraft`) and the knowledge grant of requirement 4.
   Two such writers rather than one is exactly what makes a null uuid insufficient on its own as a display discriminant, and is why a granted entry carries a flag of its own.
4. `granted` and `grantedBy` are optional scalars written only by the companion contract's knowledge grant (see `companion-api` and `recipe-visibility`).
   `granted` is written as `true` and is NEVER written `false`: an entry that was not granted OMITS the field, so its presence is the whole fact and no reader has to tell `false` from absent.
   `grantedBy` is the caller-supplied label for what did the granting — trimmed, at most 64 characters, and absent when the caller supplied none.
   The grant REFUSES a non-string, an over-long, or an object- or array-valued label rather than coercing or truncating it, and writes nothing in that case, because a truncated module id names a DIFFERENT module.
   Neither field is ever written by either book-learn path.
   The field is named `grantedBy` rather than joining the `source*` family because every `source*` field on this entry already means THE BOOK.
   Adding the two fields does not widen what counts as an entry: the entry boundary is still a numeric `learnedAt`, so a node carrying only `granted` yields no entry at all.
   Both fields are UNTRUSTED at display — the flag is public and any module may write it — so a surface tests `granted === true` and `typeof grantedBy === 'string'` strictly rather than for truth (see `ui-integration` _Knowledge Surface_).
5. Stored and read via `getFabricateFlag` / `setFabricateFlag`; the effective persisted path is the doubly nested `flags.fabricate.fabricate.learnedRecipes` (the flag helpers prefix `fabricate.`), so it is never read via a raw single-nested `actor.flags.fabricate.learnedRecipes` path.
   A reader using the raw path finds nothing in a real world and silently reports zero.

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
  [realmId: string]: {                                     // was [systemId][realmId]
    discoveredAt: number,
    source: "manual" | "partyToken" | "import" | "api",
    partyId?: string,
    sceneUuid?: string,        // Foundry bridge — NOT renamed
    sceneRegionUuid?: string,  // Foundry bridge — NOT renamed
  },
}
```

Requirements:

1. The flag is actor-scoped and world-local so realm knowledge follows the character across party changes.
2. Discovery is WORLD-WIDE and is keyed by `realmId` alone.
   Realms are geography, so knowing one is knowledge of the world: a character who has found Northreach Vale has found it, whichever crafting system they were serving at the time.
   `realmId` must refer to a `GatheringRealm` in the world library, and discovery writes validate that before persisting.
3. `discoveredAt` must be a timestamp and `source` must be one of the listed values.
4. Reads never throw on a stale `partyId`; missing or stale realm ids must not disclose secret realm names to non-GM users.
5. Because this is an actor flag (not a world setting), it is **not** rewritten by the migration runner, which reaches two corpora and four world settings and has no actor access at all.
   Reads accept the legacy `discoveredGatheringRegions` flag as a fallback, flatten a legacy `[systemId][realmId]` map on read, and every write persists only the current shape, upgrading each actor lazily.
   That is the same mechanism the earlier `discoveredGatheringRegions` rename used, for the same reason.
   Two details make the lazy upgrade safe.
   The DISCRIMINATOR is `discoveredAt`: every entry has one and no `systemId` bucket ever does, so an object carrying a numeric `discoveredAt` is a realm entry and any other object is a legacy bucket.
   And a HALF-UPGRADED map is reachable in normal use rather than hypothetical — upgrade an actor, write, then discover a second realm, and the map holds both shapes at once until the next full read — so the flattener handles a mixed map rather than assuming one shape.
6. On a collision between two legacy buckets the EARLIEST `discoveredAt` wins.
   Discovery records the first time a character saw a place; a later duplicate recorded under another crafting system is not a re-discovery.
7. Discovery semantics are defined in `gathering-and-harvesting` (_Actor Realm Discovery_).

## Run Journal Projection

### Purpose

Define the unified, UI-safe projection the player-facing Journal screen reads (see `ui-integration/spec.md` _Journal App_).
It is a **derived, computed view**, not a persisted entity: there is no new actor flag or `CraftingSystem` field, mirroring the System Validation Report's derived-view contract.
`RunJournalBuilder` recomputes it on demand from the selected actor's three native run sources — `craftingRuns` (see _CraftingRun_ / _CraftingRunStepState_), `salvageRuns`, and `gatheringRuns` — projecting each native run into a single superset `RunModel`.
Crafting runs populate the step fields; gathering and salvage carry no steps.
Like the gathering listing it never returns raw Foundry documents: every model is built from cloned primitives, so the Journal monitors and (crafting only) advances _existing_ runs without creating them.

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
  manualAdvance: boolean,                // true for every crafting run (the Trigger Next Step gate); redaction does not suppress it
  canCancel: boolean,                    // crafting only: true when the run is live (non-terminal) and the viewer OWNS the actor — a player may self-cancel only their own in-progress craft, redacted or not
  refundOnCancel: boolean,               // mirrors the system's features.refundOnPlayerCancel (default true), so the cancel affordance can tell the player whether inputs will be returned
}
```

A **player self-cancel** removes an in-progress crafting run (archived to history as `cancelled`), produces nothing, and discards any rolled check outcome so the recipe becomes craftable again.
It is owner-scoped with no GM relay (the engine writes items directly), so the cancel edge blocks a non-owner exactly as the advance edge does.
When the system's `features.refundOnPlayerCancel` policy is on (default), the reversal restores each consumed ingredient onto its recorded source actor and refunds the spent currency (the shared "un-consume" primitive, reused by the GM cancel/reverse); when off, the inputs are forfeit.
The reversal is best-effort and reports the actual outcome — a partial or failed restore does not falsely report the inputs as returned, and the run is still archived so it can never be re-cancelled (which would double-restore).
The currency refund is attempted for EVERY recorded group even when one fails, and its result distinguishes a full refund, a partial refund, and a total failure, because "one terminal base unit returned, another failed" and "nothing returned" require different operator responses.

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

### Startup Maintenance Passes

The housekeeping passes `Fabricate#initialize` runs — `CraftingRunManager.cleanupInvalidRuns`, `CraftingRunManager.pruneInstantaneousActiveRuns`, `SalvageRunManager.cleanupInvalidRuns`, and `RecipeVisibilityService.cleanupLearnedRecipes` — drop run and learned-knowledge entries that name deleted content.
They are governed by two rules that are deliberately DIFFERENT from the `processWorldTime` gate above (issue 970).

**Write scoping.** Each pass walks only the actors the CURRENT client may update (`selectWritableActors`, keyed on `Actor#isOwner`), not all of `game.actors`.
No socket-to-GM relay carries a housekeeping write, so a pass that writes to an actor a player does not own is refused by Foundry, and `setFabricateFlag` REJECTS on a refused update by contract rather than reporting a phantom success.
That statement is scoped to these passes and is not a claim that Fabricate has no relay at all: the blind-gathering start relay and the complication delivery relay (issue 1286) both exist, and both are REQUEST/NOTIFY channels a client uses to ask the elected GM to take an action of its own.
Neither is available to a housekeeping write, and neither may be recruited into one, because these passes are ownership-scoped idempotent key deletions on documents the acting client already owns — routing them through a GM would trade a refused write for a message with no acknowledgement, no retry and no ordering.
`isOwner` is unconditionally true for a GM, so a GM client still sweeps the whole world while a player sweeps only their own characters.
An ownership scope is chosen over a primary-GM gate because these passes are idempotent key deletions rather than state advances — several clients each doing their own share is harmless, and unlike a primary-GM gate it does not make cleanup hostage to a GM ever connecting.
The predicate FAILS CLOSED: an actor that does not answer `isOwner === true` is skipped, because a skipped cleanup is strictly less harmful than the rejected startup a permissive default would restore.
This is a WRITE-permission question and is NOT the `isGatheringActorSelectableByUser` predicate, which asks which actor a user may ACT AS.

**Failure isolation.** The passes run through `runStartupMaintenance`, which runs each one in order, reports a failure, and continues to the next.
None of them is a precondition for Fabricate working, and `initialize()` must reach `ready` regardless: every facade method throws through `_requireReady()`, so an escaping rejection took the whole module down for that client — and skipped the remaining `ready`-body steps (world-time processing and the flag auto-stamps) with it.
`runStartupMaintenance` therefore never rejects.
The two rules compose as defence in depth: scoping should make a refusal unreachable, and isolation bounds the damage if one occurs anyway.

The GM-only cascade walkers (`removeRunsForSystem`, `removeRunsForComponent`, and the `CraftingSystemManager._cleanupSalvage*` pair) are out of this scope: they are reachable only behind `_assertGM`, and a GM owns every actor.
2. **Per-runType `timeGate` source.**
   For a crafting run, `timeGate` and the readiness derivation come from the ACTIVE step's gate (the step at `currentStepIndex`).
   For gathering and salvage runs, they come from the RUN-level `timeGate`.
   Gathering re-maps its native `*WorldTime` fields (`startedAtWorldTime` / `updatedAtWorldTime` / `completedAtWorldTime`) onto the common `startedAt` / `updatedAt` / `finishedAt`; salvage already uses the crafting `startedAt` / `updatedAt` / `finishedAt` names.
3. **Viewer redaction (`redacted`).**
   For a non-GM viewer, a crafting or alchemy run whose recipe the viewer cannot see — a recipe that no longer resolves, or an undiscovered alchemy / knowledge-gated crafting recipe — is redacted: `redacted: true`, `names.title` becomes the generic localized label (`FABRICATE.App.Journal.Redacted.Title`), `recipeId` is `null`, `steps` / `createdResults` / `failureReason` / `stepLabel` are blanked, and `img` falls back to the default run image.
   Redaction hides IDENTITY ONLY and is NOT an authorization gate (issue 966): `manualAdvance` and `canCancel` are unaffected by it, so an owner can still finish and abandon a redacted run.
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
5. **`manualAdvance` states what the run TYPE needs, not what the viewer may do.**
   It is `true` for every crafting run — including a redacted one (issue 966) — and `false` for gathering, salvage, and recipe-less alchemy fizzle history entries, which resolve off the world-time hook or are terminal.
   Authorization belongs to the advance seam (`resolveAdvanceSources`), not the projection; the player-facing advance contract is defined in `recipes-and-steps/spec.md` (_Run Progression — Player-Initiated Advance_).
6. **`resolutionModeLabel` uses the player-facing label map.**
   It resolves through the localized mode-label map defined in `resolution-modes/spec.md` (_Player-Facing Mode Labels_) and never emits the raw `resolutionMode` token.
7. **`counts.active` feeds the nav badge.**
   It is the count of active (non-terminal) runs the Journal navigation surfaces as its active-run count badge.

## Item Flags

### Recipe Item Usage Flag

Tracks how many time an owned item granting knowledge of a recipe has been used to craft.

```js
Item.flags.fabricate.recipeItemUsage = {
  timesUsed: number,
  inert?: boolean,
};
```

Requirements:

1. `timesUsed` must be a non-negative integer.
2. Usage is tracked per owned item instance.
3. Maximum uses is configured per recipe item in `RecipeItemDefinition.caps.item.maxUses` (enabled by `caps.item.limitUses`), resolved from the recipe's linked definition.
4. When `timesUsed >= maxUses`, the item is exhausted.
5. On exhaustion the resolved `caps.item.whenSpent` decides disposal: `"destroyed"` deletes the item, `"inert"` (the default) keeps it and sets `inert: true` alongside the `timesUsed` write.
   The legacy `caps.item.destroyWhenExhausted === true` is the derivation for `whenSpent: "destroyed"`; absent or false derives `"inert"`.
6. `inert` is a **record** of the exhaustion event, **not a craftability gate**.
   Item-based access is filtered on `timesUsed >= maxUses` alone and never reads `inert`, so after a GM raises `maxUses` a copy may be `inert: true` and still grant craftability.
7. No Fabricate writer ever clears the flag — a merge write cannot remove a key, so it is sticky until something explicitly deletes it.
   A GM clears it via the Foundry item flag editor or a future repair flow, mirroring the Tool Broken Flag's escape hatch but **not** its gate semantics: `toolBroken` _is_ a gate, `inert` is not.

### Recipe Item Learning Flag

Tracks how many recipes have been learned from an owned recipe item under the learn cap (issue 511).
It mirrors the Recipe Item Usage Flag: a distinct counter for the learn-cap mechanic, held on the same physical item document.

```js
Item.flags.fabricate.recipeItemLearning = {
  learnedCount: number,
};
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
9. **Deleting the holding document releases no consumed learn budget and leaves `Actor.flags.fabricate.learnedRecipes` untouched.**
   The counter dies with the document, so a `perInstance` budget is effectively discarded rather than refunded; a `total` pool key is not decremented at all, because the refund path resolves the pool key through a **still-held** source copy.
   Erasing a learned entry before deleting its source copy reclaims the slot; deleting first never can.

### Tool Item Usage Flag

Tracks how many times an owned tool item has been used.
Written only by the `limitedUses` breakage mode.

```js
Item.flags.fabricate.toolUsage = {
  timesUsed: number,
};
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
Item.flags.fabricate.toolBroken = true;
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
  interactableType: 'tool' | 'gatheringTask', // initial "tool" (unconfigured sentinel)
  sourceUuid: string, // the Fabricate Tool / Gathering Task source identity; initial "Fabricate.unconfigured.tool" (non-resolvable sentinel)
  systemId: string, // initial "unconfigured" (sentinel)
  toolId: string | null, // tool interactables
  taskId: string | null, // gatheringTask interactables
  environmentId: string | null, // resolved at drop (gatheringTask only)
  taskNodeLink: 'linked' | 'unlinked', // gatheringTask resource-node link (default "linked")
  node: object | null, // independent node pool when taskNodeLink === "unlinked" (issue 302); else null
  name: string,
  presentation: { promptText: string | null, hidden: boolean },
  linkedVisual: {
    uuid: string | null,
    documentName: 'Tile' | 'Drawing' | 'Token' | null,
    mode: 'marker' | 'none', // "none" = region-only (no visible marker)
    missingPolicy: 'ignore' | 'warn' | 'recreate',
  },
  // `taskNodeLink` selects whether a gatheringTask shares the task's node or owns
  // its own — much like an FVTT token↔actor link:
  //   "linked" (default) — env nodeRuntime[taskId] owns counts/depletion/respawn (depletion
  //                        and respawn follow the gathering task); `node` is null.
  //   "unlinked"         — the behaviour owns its OWN independent pool, stored verbatim in `node`
  //                        (normalized node shape; independent lifecycle). issue 302.
  // A `tool` is always linked with a null node.
  state: {
    enabled: boolean,
    consumed: boolean,
    locked: boolean,
    uses: { max: number | null, used: number },
    cooldown: { seconds: number | null, lastUsedWorldTime: number | null },
  },
  activation: { trigger: 'regionEnter', audience: 'players' | 'all' },
};
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
6. **Token-presence re-validation is canvas-independent.** `validateActivationRequest`'s containment re-check — confirming the activating token is still inside the interactable's region before granting — MUST be resolvable without the validating GM's rendered canvas, since the active GM may not be viewing the requester's scene.
   It consults Foundry's authoritative token→region membership (`TokenDocument#regions`) first, then Foundry's own containment test, and only then a geometric test derived from the token document rather than its placeable.
   An absent membership record is never by itself a negative, because an unpopulated record cannot be distinguished from a genuine absence.
   Activation is denied `TOKEN_NOT_INSIDE` (`FABRICATE.Canvas.Interactable.Denied.NotInside`) only when the first source to return a determinate answer reports the token outside, and is admitted when no source returns one.
   The seam is `regionContainsTokenDocument` in `src/canvas/regionHitTest.js`; `InteractableManager#_tokenInsideRegion` is a thin loop over it that keeps the pre-existing "any token of the requesting actor is inside" admission.
7. **The controlled-token re-trigger honours elevation.** The `controlToken` / "interact here" re-prompt that re-offers the interact prompt for a token already inside an eligible region MUST test the token's own elevation against the region's elevation band rather than assuming elevation `0`, so an elevation-banded region can re-prompt a token standing in it.

### Region-level ownership & provenance-aware deletion (issue 533)

A `fabricate.interactable` region reaches Fabricate through two different lifecycles that MUST be distinguished at delete time.
A **CREATED** region is spawned by a drag/drop or click-to-place placement and exists ONLY to be the interactable, so Fabricate owns the whole Region.
A **PROMOTED** region is a region the user already drew for another purpose (lighting/darkness, conditions, a third-party module) that a GM points Fabricate at via the Manage panel's "Promote region to interactable"; Fabricate owns only the one behaviour it attached, and the Region plus every other (foreign) behaviour on it are the user's data.

```js
region.flags.fabricate = {
  interactableRegion: true, // stamped ONLY on a region Fabricate CREATED
};
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

Note the two distinct uses of an environment id at different lifecycle stages: a **Scene Region `flags.fabricate.environmentId`** is a _drop-time placement_ hint used only to resolve which environment a dropped interactable belongs to, whereas `environment.sceneUuid` is the _runtime gathering gate_ that ties a composed environment to a scene during attempt validation.
They are unrelated mechanisms.

## Macro Contracts

### Dynamic DC Macro Contract

The dynamic DC macro is a **crafting-check** mechanism, and within crafting it reaches exactly the two DC-bearing check slots.
Those are `craftingCheck.simple` — the shared pass/fail slot backing the `simple` and `routedByIngredients` modes and the alchemy `simple` check mode — and `craftingCheck.routed`, backing `routedByCheck` and the alchemy `tiered` check mode.
Both resolve their DC through `CraftingEngine._resolveSimpleCheckDc`, which is the sole caller of `CraftingEngine._resolveCheckAnchorDc` and the sole dynamic-DC caller of the shared macro executor.
No other check reaches either symbol.
The crafting `progressive` check has no DC at all, and salvage and gathering resolve theirs arithmetically through `CraftingEngine._resolveSalvageDc` and `GatheringEngine._resolveGatheringRoutedDc` — a per-record `dcOverride` when finite, else the slot's static `dc`, else a literal `15` — consulting no `checkTierId`, no `tiers`, and no macro.
Salvage and gathering nonetheless persist `dcMode`, `macroUuid`, and `tiers`, because they reuse the `SimpleCheck` and `RoutedCheck` shapes so the Checks-tab editors can be shared.
No DC-resolution path outside the crafting check reads any of the three.
They are not inert for that reason.
Outside the shared Checks-tab editors, which round-trip whatever their slot holds, salvage's `simple.tiers` and `simple.dcMode` have one reader: the per-component salvage DC control (`src/ui/svelte/apps/manager/component/salvageDcPresets.js`) builds its preset options from `salvageCraftingCheck.simple.tiers` in EVERY salvage resolution mode, routed included — there is no `.routed.tiers` sibling for presets — and renders its system-default option without a DC number when `salvageCraftingCheck.simple.dcMode` is `dynamic`, because a macro-computed DC has no number to show.
Dropping salvage's `simple.tiers` would therefore silently empty that preset list, and dropping its `simple.dcMode` would mislabel the default option, so arithmetic DC resolution licenses removing neither.
`macroUuid` is the one of the three with no reader at all on salvage or gathering, and gathering has no manager-side reader of any of them.

Before the configured macro runs, `_resolveCheckAnchorDc` computes an **anchor DC** for the crafting check slot being resolved.
The anchor is the recipe's selected difficulty tier — `Recipe.checkTierId` matched against that slot's `tiers[].id` — when it names a tier that still exists, and the slot's static `dc` otherwise.
`CraftingSystemManager._normalizeSimpleCraftingCheck` and `_normalizeRoutedCraftingCheck` normalize that `dc` to a finite integer, defaulting to 15, on every save, so a normalized crafting check slot's static `dc` is never absent or non-finite.
`_resolveCheckAnchorDc`'s own fallback to a literal `15` therefore guards only a check config that reached it without that normalization, and is not reachable through normal play.

When a crafting slot's `dcMode` is anything other than `dynamic`, or no `macroUuid` is configured, the anchor IS that check's resolved DC and no macro runs.
When `dcMode` is `dynamic` and a `macroUuid` is configured, `_resolveSimpleCheckDc` runs that macro and hands it one payload object containing:

- `recipe`
- `craftingSystem`
- `craftingActor`
- `candidateIngredientSet`
- `anchorDc` — the anchor DC resolved above, before the macro runs

Fabricate exposes that exact object with identity as `scope`, `context`, and `args`.
The `scope` identifier provides Foundry-facing familiarity while `context` and `args` remain backward-compatible aliases.
This is not full native `Macro#execute` behavior: Foundry's native `scope` is a rest copy, and Fabricate does not add Foundry's native `speaker`, `actor`, `token`, or `character` locals.

Fabricate applies `Number(result)` to the macro's return value.
When the coerced value is finite, Fabricate truncates it to an integer and uses it as that crafting check's DC.
An absent configured macro, a `dcMode` other than `dynamic`, a thrown error, or a result whose numeric coercion is non-finite all leave the anchor DC in force, so a recipe's difficulty tier and a dynamic DC macro compose rather than acting as alternatives: the tier sets the number the macro is asked to adjust.

The shared executor deliberately evaluates the selected script Macro command instead of calling `Macro#execute`.
This keeps player-initiated workflows from being blocked by Foundry's current-user Macro permission gate.
The direct evaluation bypasses only the client-side Macro document check and grants no additional server or document authority; the script still runs as the current player.
Foundry runtime globals `game`, `foundry`, `ui`, and `fromUuid` remain directly available and are not injected as payload parameters.
Errors thrown by a configured macro propagate unchanged to the owning Fabricate workflow, which decides whether to abort or apply a documented fallback such as the anchor-DC fallback above, as does the executor's own `Macro not found or invalid` error when the configured uuid resolves to no document or to one carrying no string `command`.

### Crafting Check Macro Contract (Removed in 1.8.0)

The crafting-check macro / built-in game-system adapter path has been removed.
The GM-authored roll formula is now Fabricate's built-in check: a plain dice expression the engine rolls and evaluates natively, giving GMs a low-complexity check without writing a macro or relying on a dnd5e/pf2e stat adapter (see requirement 30 in _Data Models_).
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

An essence property macro (`EssenceDefinition.propertyMacroUuid`, see `recipes-and-steps/spec.md` _Essence Property Macros_) receives two further context members the result's own property macro does not:

- `essence` — the resolved `EssenceDefinition` whose macro is running.
- `essenceQuantity` — that essence's resolved quantity for this craft or salvage result, taken from `resolvedEssences[essence.id]`.

Without these two members a macro shared across essences could not tell which essence invoked it, making the archetypal "+1 damage per unit of Fire" macro impossible to author.

Return shape:

```js
{ [propertyPath: string]: any }
```

Each returned path is applied with `foundry.utils.setProperty`, immediately after that macro returns.
Returns are never spread-merged into one map first, because the returns are string paths and a subtree return is not order-equivalent to a leaf return under a merge.
Two macros writing the same path is supported, resolves last-writer-wins, and is not an error.
A path that cannot be written (for example because an intermediate segment is `null` or a primitive) is logged and skipped.
For the essence property macro loop specifically, that failure is isolated to the essence whose macro produced the unwritable path: every other essence's macro, and the result's own macro, still runs and still applies.

#### The complication macro is the one macro surface that does NOT run on the acting client

A component complication's `macroUuid` (issue 1286, behaviour in `recipes-and-steps/spec.md` _Complication Macros_) shares this contract's execution SHAPE and departs from it in three stated ways.

- Its input context is its own: `{ kind: 'componentComplication', craftingSystemId, activity, resolutionId, resultId, bucket, effectRollTotal, component, complication, actor, token, speaker, requestingUser }`.
  It carries no `recipe`, no `ingredientPool` and no `resolvedEssences`, because a complication is a consequence of a progressive STAGE rather than of an item build, and it returns no property map: nothing is applied from its return.
- Its scope is Fabricate's `('context','args','scope')` binding under `"use strict"`, not Foundry's own `#executeScript` bindings, so every other name a macro author reaches for resolves as a GLOBAL on the executing client.
  `canUserExecute` is not consulted and `MACRO_SCRIPT` remains deliberately unconsulted.
- **It executes on a GM client rather than on the current user's**, so that a complication's authority does not depend on whether the activity was time-gated.
  The consequence is that `game.user.character` is the GM's (normally none), `canvas` is whatever scene the GM is viewing and may not be ready, the token selection is the GM's, and `game.user.isGM` is TRUE — so a macro branching on it flips.
  `speaker`, `actor` and `token` are therefore supplied explicitly on the scope, resolved GM-side from the addressing; a complication macro that needs the acting player's own client, such as any UI prompt, cannot work.
  The bypass of `canUserExecute` is justified for this surface by the addressing-only payload, the server-attested sender and the GM-side actor re-authorization stated in `recipes-and-steps/spec.md` _Complication Macros_, and NOT by the "no added authority" argument the other macro surfaces rest on, which is false of a GM client.

### Success Macro Contract (Removed in 1.8.0)

The step-level success macro has been removed.
Crafting outcomes are resolved entirely by the engine (check formula, resolution mode, and consumption policy); there is no GM-authored success-side macro hook.

### Failure Macro Contract (Removed in 1.8.0)

The step-level failure macro has been removed.
A step failure is handled entirely by the engine's failure-consumption policy; there is no GM-authored failure-side macro hook.

## Foundry Multi-Write Invariants

When one Fabricate operation uses multiple separate sequential Foundry settings, flag, or document API calls to establish one invariant, it MUST treat the calls as a compensating transaction.
Equality of the primary setting, flag, or document value MUST NOT short-circuit the operation when an ancillary invariant may still require repair.

Before the first write, the operation MUST snapshot the complete pre-state needed to restore every affected key or document, including whether each key existed separately from its stored value.
It MUST perform forward writes in a declared order.
If a forward write fails, it MUST compensate every completed write in reverse order and restore both prior values and prior key presence.
If compensation also fails, the operation MUST report the original failure and every compensation failure rather than presenting a successful rollback.

Tests MUST cover a same-primary-value call that repairs an unsatisfied ancillary invariant, each forward-write failure boundary, reverse compensation after every partially completed prefix, restoration of absent versus present-with-undefined or equivalent values, and compensation failure reporting.

This requirement applies only when the application composes separate sequential API calls into one invariant.
A single Foundry atomic or batched document operation does not require application-level compensation merely because its one API call writes several documents or fields.

**Reverse-compensating a delete cannot restore document identity.**
Value and key presence are restorable; a document's `_id` and its `_stats` are not.
`_stats.systemId` and `_stats.systemVersion` are captured at creation, so a compensated delete-then-recreate produces a document that is not the document it replaced even when the restored value is byte-identical.

## Destructive Pass Safety

Crafting definitions are persisted in `world` settings, one whole-array key per entity class.
This section governs the destructive passes that prune durable state against those records; it constrains no record's contents.

**Corpus order is not semantic.**
No consumer may depend on the order records are returned in.

### Valid Id Basis

A **Valid Id Basis** is the set of live-corpus id sets a destructive pass derives its "still valid" answer from — the valid recipe, system, component and salvage-component id sets a cleanup pass builds before pruning anything that names an id outside them.

**A destructive pass runs only when its Valid Id Basis is known-complete.**
A pass whose basis is incomplete does not see a live record, concludes the thing naming it is stale, and deletes durable state that was never stale.

**The requirement is scoped to the KIND of prune, not to the moment it runs.**
A **corpus-derived** prune asks "is this id still in the live corpus?" and removes everything that is not.
It infers a deletion from an ABSENCE, so it is governed by this requirement wherever it runs — at startup, and equally in the flag cleanup a GM triggers by deleting a recipe, deleting a set of recipes, deleting a crafting system, re-importing a compendium pack, or changing a system's resolution mode.
Those mutation-time paths recompute the same id sets from the same live managers and call the same destructive collaborators, so the loss is identical and the trigger is more ordinary than a boot.
A **subject-targeted** prune asks instead "does this name one of the ids the caller just removed?".
Those ids are positively known, and no missing corpus can make a just-deleted id valid again, so a subject-targeted prune needs no Valid Id Basis and MUST NOT be gated on one.

**A gated mutation-time pass that prunes ACTOR-SCOPED durable state MUST name a subject-targeted fallback whenever the mutation removed something**, and the fallback runs in the refused sweep's place.
Without it the gate trades a data-loss defect for a flag leak: the actor flags the mutation itself orphaned are the reason the cleanup path exists, nothing else re-derives them, and nothing would detect their absence.
What a refusal gives up is therefore only the hunt for orphans of UNKNOWN origin, which the startup pass reconciles on the next known-complete boot.
A mutation that removed nothing — an import, or the public orphaned-flag entry point called with no id set — has no fallback and needs none: an omitted sweep there removes nothing and leaks nothing.

**A pass that prunes only world- or user-scoped PREFERENCES is exempt from the fallback requirement, and the exemption is stated because the obvious justification for it is false.**
"Nothing there names a subject" is not true of the preference sweep: a crafting-system deletion holds the removed system id and the removed recipe ids, and `lastManagedCraftingSystem`, `lastAlchemySystem` and the `recipe:` / `salvage:` keys of the progressive-order map are all targetable from them.
The exemption is that the cost of leaving a stale preference is bounded and self-healing where the cost of leaving a stale actor flag is not.
A preference names something that no longer exists; the next read corrects it, and the startup `stale preferences` pass reconciles it on the next known-complete boot.
Against that, a targeted preference prune would add a fresh write — to a `user`-scoped replicated document, no less — on a path whose defining condition is that this client cannot describe the world it is writing to.
A pass claiming this exemption MUST say which of the two reasons it is claiming, so that a future pass cannot inherit it by resembling this one.

**Every id set a corpus-derived pass is given MUST be derived from the corpus, never defaulted away.**
A pass handed an empty set for one entity class prunes every key scoped to that class on every run, which is this requirement's own failure mode reached with no conversion involved at all.
A pass that rewrites ONE store keyed by several entity classes is declared on the UNION of those classes and MUST NOT be decomposed, because it replaces the whole store and an incomplete basis for any one class would wipe the keys of the others.

**What makes a basis known-complete.**
Each entity class's corpus arrives as a single whole-array read, which either yields the corpus or fails: there is no partial state a reader could hold and mistake for the whole.
A basis is therefore known-complete when every id set the pass will prune against was derived from a completed corpus read of the classes the pass declares, and it is NOT known-complete for a class whose id set was defaulted, omitted or supplied by a caller that did not read that class.
The requirement is stated over the DERIVATION rather than over any storage fact, because the storage fact it once turned on is gone and a requirement that names one would be vacuous.

**A pass whose declared entity kind is not established MUST be omitted, and establishment MUST be positive.**
A basis stated as a negation fails open: "this kind is not incomplete" is true of an absent entry, a renamed key and a threading typo alike.
The builder therefore requires each declared kind to be positively true, and a pass that declares no kind at all is omitted rather than run.

**Migration currency MUST NOT be an input, and neither MUST the identity of the client running the pass.**
A whole-array corpus cannot be partial whatever the migration version says, so gating a pass on it buys no hazard reduction — and it costs a permanent silent omission, because `migrationVersion` is world-scoped and the migration pass is primary-GM-only.
Gating on it would omit every destructive pass on EVERY client for the whole window between a GM upgrade and its migration pass, and permanently on any world whose GM has not booted since.
"This client did not run the migration pass" MUST NOT be an input for the same reason, stated separately because it is the shape the mistake usually takes.
It is true on every non-primary client on every boot, including a fully converted and fully migrated healthy world, so it would omit the destructive passes on every player client permanently.
The primary GM cannot cover for that, because some pruned state is `user`-scoped and only that user's own client can prune it.
A non-primary client on a fully converted, fully migrated world therefore DOES run the destructive passes.

**The gate is applied by OMITTING the pass from the pass list, never by throwing from inside it.**
A guard that throws from inside a pass arrives after the destructive work has already landed, and both doors then swallow it: the startup maintenance runner catches every throw into a failure label, and the mutation-time system-scoped cleanup catches each block's throw into a console line so that a teardown is never left half-done.
The pass list MUST therefore be constructed by a pure, exported builder that the composition site calls, so the omission is directly assertable.
A pass that declares no basis MUST be omitted, so that a destructive pass cannot ship ungated by omitting its declaration.
**Both doors MUST share that one builder.**
Two independently written gates on the same collaborators drift, and the half that drifts is the half nobody is looking at; the mutation-time composition site therefore supplies its own pass-to-entity-kind declarations to the same builder rather than restating the partition.

**THERE ARE TWO ENFORCEMENT SHAPES, and the second is not a footnote on the first.**
The rule above — omit the pass — is the shape available when the pass exists only to prune, so that not running it is a complete and honest outcome; that is true of every startup and mutation-time cleanup pass, and it stays the DEFAULT shape because an omitted pass is directly assertable from a pure builder.
It is unavailable when the prune is one step inside a pass that MUST still run for another reason.
`CraftingSystemManager._normalizeSystem` is the case that established the second shape (issue 1308): it is a whitelist rebuild that produces the persisted crafting-system record, so omitting it does not decline to prune — it declines to emit the record at all, and the caller writes nothing or writes a shape the corpus cannot carry.
The same is true of `upsertTool`, whose job is to save a Tool.

**In that shape the UNKNOWN basis MUST be carried to the prune site as a SENTINEL, and ONLY the prune is skipped.**
The pass runs, every non-destructive derivation it performs still happens, and the reference lists it would have filtered pass through unchanged.
Three rules make that safe, and all three are consequences of the first shape rather than new licence:

- **The sentinel MUST be distinguishable from an EMPTY basis by its TYPE, never by its size.**
  An empty basis is a real, prunable answer — the GM deleted every entry — and it is also precisely what an omitted argument produces, so a site testing `size === 0` cannot tell "prune everything" from "prune nothing" and would silently pick one of them.
  The reference implementation passes `null` and every prune site tests `instanceof Set`, so a caller that supplies nothing gets the safe direction.
- **Every prune site that can receive the sentinel MUST test for it**, including sites reached only through an argument default.
  An argument default of an EMPTY set is this requirement's own failure mode reached by an omitted argument, so those defaults become the sentinel too.
- **The basis MUST be threaded as an argument rather than read from a collaborator inside the pass**, so the pass stays a function of its arguments and a caller that cannot vouch for the ids can say so.
  A pass that digs the basis out of ambient state cannot be handed an UNKNOWN one, and cannot be tested for what it does with one.

**The sentinel shape does NOT relax what makes a basis known-complete**, and it is not a licence to skip pruning where the first shape applies.
It is the same gate with a different lever, chosen because the pass cannot be omitted, and it reports nothing because the pass itself still ran; what the first shape reports as an omission, this shape leaves visible as unpruned references that the next known-complete normalize resolves.

**An omission MUST be reported.**
Neither door's caller reads what its runner returns — the startup runner returns only FAILED labels and its caller discards them, and the mutation-time callers discard the outcome entirely — so a gate that omitted every pass is otherwise indistinguishable from a run that found nothing to prune.
The report names the omitted passes and the entity kinds that decided them.
It MUST NOT fail the operation it reports on: an omitted pass is what this gate exists to survive, so it must not stop a boot and must not fail a GM's delete.

**One destructive door remains OUTSIDE this requirement, and it is not safe.**
The one-shot version-keyed flag auto-stamps are corpus-derived and set their done-marker unconditionally, so an id set that was defaulted rather than derived — or one built from a corpus read that failed — burns the one shot and leaves the world permanently under-stamped, repairable only through the manual item-data repair action.
It is recorded here so that this gate is not read as making it safe.
The mutation-time door recorded here previously — the flag cleanup reachable from recipe deletion, bulk recipe deletion, the public orphaned-flag entry point, compendium re-import, and system-scoped state cleanup — is now inside the requirement, per the prune-kind scoping above.

**Distinguished from _membership basis_.**
`ui-integration/spec.md` uses _basis_ only as a qualified noun — **membership basis** (`ui-integration/spec.md:1356`), **routing basis** (`:2110`), **disabled-action basis** (`:2960`) — and in each of those it names the RULE by which something is resolved.
_Valid Id Basis_ names the DATA a decision rests on, which is a different sense of the same noun, so the qualifier is mandatory here too and the bare noun is never used for this concept.

## Runtime Read Indexes and Revision Tokens

Runtime read indexes and revision tokens are **derived, in-memory, per-client state**.
They change no persisted shape, are never serialized, never cross the wire, and are rebuildable in full from the authoritative persisted definitions.
A client that discarded every one of them would answer every question identically, only slower.

### Runtime Read Indexes

The runtime managers MAY retain `Map`-backed read indexes over a crafting system's definition arrays — components, first-class tools, essence definitions and recipe-item definitions — so that identity resolution, name-fallback matching and reverse book-membership lookups are constant-time rather than a linear scan per owned item.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Requirement | Rule |
| --- | --- |
| **System-scoped** | An index is derived from ONE system's candidate array and MUST NOT be keyed globally. Component, tool and recipe-item ids are unique only within a system — a copy-imported system deliberately preserves its origin's ids — so a globally-keyed index would resolve an item to a definition in a system it does not belong to. |
| **Precedence-preserving** | An indexed lookup MUST return exactly the definition the equivalent `Array.find()` returned. Id, exact-name and folded-name facets are therefore first-insert-wins in array order, source-reference lookups take the EARLIEST matching candidate in array order (not the first matching reference), and membership buckets keep array order. |
| **Case semantics are held apart** | The exact-name and case-folded name facets are separate. The read/craft sites match case-INSENSITIVELY and the salvage/destroy site matches case-SENSITIVELY, deliberately; one folded facet cannot serve both, and collapsing them would let bulk destroy delete items belonging to a differently-cased component. |
| **Telemetry-preserving** | A name-only match MUST still emit the deprecation telemetry defined for the name fallback — once per `(system, definition, item name)`, for the matched definition only. An index that resolves faster but stops emitting it removes the signal that tells a GM their items are unstamped. |
| **Explicitly invalidated** | An index derived from array `A` is valid while `A` is the same object, has the same length, and carries the same index revision. Any in-place mutation of `A` — replacing or reordering an element, or rewriting an INDEXED FIELD of an element (`id`, `name`, `registeredItemUuid`, `originItemUuid`, `aliasItemUuids`, `recipeIds`) — MUST advance that array's index revision. Rebuilding the array is itself sufficient. |
| **Reuse is licensed by record equality alone** | A reload MAY keep a retained record — and with it every definition array that record owns — in place of the freshly parsed one, so that a client whose corpus did not change keeps its indexes. It MAY do so ONLY for a record its corpus delta reports STRUCTURALLY EQUAL in full. A record reported changed MUST take the freshly parsed arrays, and no weaker licence (an unchanged id set, an unchanged length, an unchanged count of systems) MAY stand in for record equality: those admit a same-object, same-length array whose elements were replaced, which is precisely what the index revision clause exists to catch and what array identity and length cannot see. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

An index is a cache, so a stale index is a correctness defect that presents as a data defect.
Tests MUST cover invalidation directly: a definition added, renamed, deleted and reordered through the manager's own API must each be visible to the very next resolution, including the constant-length element replacement that neither array identity nor length can detect.

### Revision Tokens

A **revision token** is an opaque non-negative integer, monotonically increasing within one scope of one manager, starting at `0`.
Its value carries no meaning; the only supported operation is `===` against a token the same consumer read earlier from the same scope.
It is per-client and per-process: it is never persisted, never replicated, and carries no meaning on another client.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Requirement | Rule |
| --- | --- |
| **Managers mint, consumers read** | Only the recipe and crafting-system managers advance a token. A consumer holds a token and compares it; it never advances one. |
| **Three granularities, all published** | Every mutation advances the ENTITY scope (`recipes`, `systems`), the affected crafting system's scope, and the `facts:<invalidation domain>:<systemId>` scope of every fact class it moved. A consumer that can attribute its cache to one system watches the narrow scope and is untouched by an edit elsewhere; a consumer that cannot watches the entity scope; a consumer that depends on SOME of a system's fact classes and not others watches the fact scope. The noun is **entity scope**, never "domain scope": _domain_ names an invalidation domain below, and one constant carrying both senses is an ambiguity a consumer resolves silently and wrongly. |
| **A move advances both systems** | A recipe moved between crafting systems advances the scopes of the system it left AND the system it joined, because a consumer watching the former must also stop trusting its cache. |
| **Comparable without serializing the corpus** | Change detection MUST NOT serialize the whole collection. A reload that finds no change MUST advance no token, and MUST answer that question by short-circuiting record-wise comparison rather than by hashing or stringifying the corpus. |
| **Remote edits arrive as local reloads** | A remote edit reaches a client as a replicated setting change; the client's `reload()` detects it and advances the LOCAL token, which is what a local consumer needs. |
| **A reload advances only what moved** | A reload MUST advance only the scopes of the records its corpus delta reports changed, pairing records by ID rather than by position — index pairing reports every record after an insertion as changed, which is the over-broad invalidation this contract exists to remove, on the one path that runs on every connected client. A change the delta cannot attribute to individual records — a reordering, which is a change because order is significant — MUST advance every system rather than none. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Invalidation Domains

An **invalidation domain** is a CLASS OF FACT a crafting-data change can belong to.
It exists for exactly one purpose: to decide which derived read models a change obliges a client to rebuild.

It is not the DDD bounded context `DOMAIN.md` calls the domain, and it is not the entity scope of a revision token.
It is also deliberately not called `presentation`: that noun already names a LAYER across this repository, and the fact class covering names, images and categories is `labelling`.

There are seven, and the set is closed.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Domain | Facts it covers |
| --- | --- |
| `labelling` | Names, images, categories, tags and sort keys |
| `narrative` | All authored prose CARRIED ON THE CRAFTING-DATA CHANNEL — recipe, step, system, component, tool and recipe-item descriptions. The qualifier is load-bearing and the unqualified reading is a trap. Gathering realm and task prose are outside it: a realm description is classified under domains the gathering store DOES consume, task prose travels on the gathering-environments channel instead, and that store consumes no `narrative` — so filing either here would leave it unable to reach the only surface that renders it. Teaser prose is outside it too: the whole teaser object is gate configuration and is classified `access-and-knowledge`, prose included, so that one fact has one answer |
| `materials-and-yield` | Ingredient sets and groups, set essences, results, steps |
| `resolution-config` | Tools, currency alternatives, checks, resolution modes, tool breakage, modifiers and requirements |
| `component-definitions` | Component, tool and essence definitions |
| `access-and-knowledge` | Teasers in whole (their prose included), recipe-item definitions, and the authored configuration gating learning and discovery — visibility mode, recipe visibility, character prerequisites, per-recipe grants and locks. A viewer's own learned and discovered state is NOT here: it lives in actor flags rather than in a definition record, and the field classification covers top-level keys of a persisted record only |
| `held-inventory` | Actor-held items |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Requirement | Rule |
| --- | --- |
| **One authored mapping** | Which read-model stores CONSUME each domain is authored once, and the store-to-domain transpose is derived from it. Authoring both admits a drift no gate can see, and a test comparing two derivations of one table asserts nothing. |
| **A consumer set is an UPPER BOUND** | Naming a store as a domain's consumer says that store MAY need rebuilding when that class of fact moves. It is NOT a claim that every field of every projection that store publishes reads that fact. Store-granular routing cannot express anything finer, and stating it as a dependency would contradict _Summary Projections_ below, which is normative that cheap availability consults no tool, check, knowledge or currency. |
| **Attribution accompanies every mutation** | Every site that mutates stored definitions MUST name the domains it moved. Saying nothing is legal and means EVERY domain, so a site that forgets is over-broad rather than stale — and because that failure is silent, the sites MUST be counted by a test rather than trusted. |
| **Replicated changes are attributed from the delta** | A client that did not write derives its domains from the corpus delta's changed FIELD names through a field-to-domain classification. The classification is complete in both directions: every field a persisted record can carry is classified, and no classified field is one no projection produces. |
| **The batch attribution is per record** | A change naming several records MUST attribute domains per record. A flat union applies every listed domain to every listed record, which is the over-broad invalidation this contract exists to remove, at batch scale. |
| **Unattributable means EVERYTHING** | A change no domain can be attributed to — a corpus reordering, an unrecognised payload, a field the classification does not name — MUST invalidate every consumer. Over-broad invalidation is a performance defect; a stale read model is a correctness one. |
| **Coalesced per batch** | A batch or import MUST produce ONE invalidation boundary carrying every record's attribution, not one per record and not one per storage leg. |
| **A consumer set is CLOSED OVER DERIVED GATES** | A store that consumes a derived gate consumes every domain feeding that gate's INPUTS, not merely the domains of the gate's output. A consumer column derived from direct fact reads cannot see a gate, because the store reads the gate's boolean and never reads the facts behind it — and the resulting under-consumption produces a well-formed, correctly attributed change that no fail-safe can catch. Every store's set MUST therefore be closed over the system-validity gate, the recipe-access evaluation, the cheap-availability projection and the browse-status derivation. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

Closing the five stores over those four gates moves exactly one of them.
`crafting`, `inventory` and `alchemy` consume all seven domains already, so no closure can widen them.
`journal` already consumes every domain feeding all four gates — the recipe-access evaluation it reads for redaction is `access-and-knowledge` plus `held-inventory` for the owned-copy branch, both of which it consumes.
`gathering` gains `resolution-config` and `materials-and-yield` from the system-validity gate, taking it from three domains to five.

`journal`'s exclusion from `narrative` survives the closure, and is structurally robust rather than incidental: the run journal's redaction reads a single boolean off the access result, and the builder has NO prose-bearing output field at all — its three flavour fields are hardcoded empty literals and every other value it emits is a name, an image, a structural count or a boolean, so prose returned by a collaborator would have nowhere to land.

The single routing decision this taxonomy exists to make observable is that the run journal does NOT consume `narrative`: it reads no authored description anywhere.
A description-only edit therefore MUST NOT rebuild it, and that assertion MUST be made from a WARMED counter — a "did not rebuild" assertion against a cold fixture compares zero with zero and observes nothing.

## Summary Projections

A **summary** is the cheap, serializable row shape a browse surface pages, filters, sorts and counts BEFORE hydrating any expensive detail.
Like the read indexes above it is derived, in-memory, per-client state: it changes no persisted shape, is never serialized to a setting or a flag, and is rebuildable in full from the authoritative definitions plus one inventory snapshot.

There is exactly ONE summary shape per entity, and every browse surface — the player crafting listing and the GM manager browsers alike — MUST consume it rather than define its own.
The two audiences MAY differ in which FIELDS they carry, and MUST NOT differ in how a shared field is DERIVED.
A surface that needs a field this contract does not define amends the contract; it does not define a second shape.

The projection is a per-entity function over VALUES, and it performs no cohort selection of its own.
Choosing WHICH entities to project — and, for a player audience, projecting only recipes the visibility evaluation made visible — belongs to the calling surface, which also supplies each recipe's own access result.
A summary built with no access result is unredacted and reads as available, which is correct for a visible recipe and a disclosure for one that is not; see `recipe-visibility/spec.md` § Summary Projection Disclosure.

### RecipeSummary

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Audience | Source |
| --- | --- | --- |
| `id` | shared | `Recipe.id` |
| `name` | shared | `Recipe.name` |
| `img` | shared | `Recipe.img`, resolved through the shared recipe-image default (Foundry's generic item bag is the "no image" sentinel). NEVER the containing book's artwork — see `## Recipe` requirement 16. `ComponentSummary.img` is deliberately NOT defaulted this way: the sentinel is a recipe-icon rule, and a component has no equivalent |
| `systemId` | shared | `Recipe.craftingSystemId` — the RECIPE's own field, never the id of whatever system object the projection was handed |
| `systemName` | shared | The owning `CraftingSystem.name`, off the system the caller supplies. The caller resolves that system through the per-system runtime read index; the projection never looks one up |
| `category` | shared | `Recipe.category`, normalized to the reserved `general` bucket when absent |
| `categoryLabel` | shared | The display form of `category`, through the ONE shared recipe-category label helper: a GM-authored category is surfaced verbatim and only the reserved `general` bucket is localized. This is the single exception to "a summary carries tokens, the surface localizes", and it is admitted because it breaks neither thing that rule protects. The localization seam is OPTIONAL — omitted, the helper answers its own default — so no caller is forced to acquire i18n. And no sort keys on it: every non-`general` label IS its token, and the one surface that orders category labels pins `general` outside the comparator, so the ordering is language-independent. It is served here rather than re-derived per surface because `category` and `categoryLabel` are one field with two facets, and deriving the second facet in each consumer is exactly the divergence this contract exists to prevent |
| `tags` | shared | `Recipe.tags`, trimmed and deduped in authored order |
| `browseStatus` | shared | The single browse-status precedence rule below |
| `availability` | shared | The single cheap-availability rule below, or `null` |
| `redaction` | shared | `{ redacted, hiddenFields }` derived from the visibility access result |
| `audience` | shared | The contract the row was built under, `gm` or `player` |
| `locked` | GM only | `Recipe.locked`. Authoring state; it says nothing a player can act on and MUST NOT cross to a player client |
| `enabled` | GM only | `Recipe.enabled`, absent reading as ON per the model default. Authoring state for the same reason `locked` is, and it would be a constant `true` on a player summary in any case, since the visibility service never surfaces a disabled recipe to one |
| `favourite` | player only | That viewer's stored favourite recipe ids. It is per-VIEWER, and the GM manager has no viewer to read it for, so a `false` there would assert something untrue rather than something absent |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The GM browsers' SORT keys are NOT served by this contract yet, and the gap is recorded rather than left to be discovered.
The recipe browser sorts on activation-blocked state, check DC, ingredient count and result count; the component browser sorts on salvage result-group count.
Sorting runs over the whole filtered cohort before pagination, so those values cannot be deferred to a page-row tier — a browser built on summaries alone would render name order under a "DC" label, silently.
They are omitted rather than guessed because two of them are owned elsewhere (the cached alchemy signature report, and the check-resolution path) and none can be validated without its consuming surface.
Adding a caller-supplied field for each is the intended amendment and belongs in the change that can prove the shape.

### ComponentSummary

A component carries no teaser gate, no knowledge gate and no per-viewer state, so its summary has NO audience split.
That is a finding rather than an omission: a later surface needing an audience-specific component field amends this contract explicitly rather than assuming an axis that does not exist today.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Field | Source |
| --- | --- |
| `id` | `Component.id` |
| `name` | `Component.name` |
| `img` | `Component.img` |
| `systemId` | Supplied by the caller, NOT read off the component. Component ids are unique only within a system, so a summary that could not name its system would be ambiguous the moment two systems were browsed together |
| `category` | `Component.category`, normalized to the reserved `general` bucket when absent |
| `tags` | `Component.tags`, trimmed and deduped in authored order |
| `essences` | `Component.essences`, projected to an id-ordered list of `{ id, quantity, name }` with the display name resolved through the per-system essence-definition index. Non-positive quantities are dropped |
| `salvageEnabled` | `Component.salvage.enabled` |
| `held` | `{ quantity, stacks }` for this component from the inventory snapshot's per-system tallies, or `null`. As with the cheap-availability rule, `null` is "not asked" and is deliberately distinct from a held quantity of zero |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### The cheap-availability rule

One rule answers "does this actor plausibly have the materials for this recipe?", and both surfaces consume it rather than each deriving one.
It reads the inventory snapshot's per-system component quantities, per-tag quantities and essence totals, and nothing else.

This is the same rule the inventory snapshot introduced as the **indexed availability projection**.
"Cheap availability" and "indexed availability projection" name one rule with one implementation; a second name for it is not a second rule, and no surface may hold a second implementation.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Requirement | Rule |
| --- | --- |
| **It is an UPPER BOUND** | A positive answer means nothing in the tallies rules the recipe out; contended requirements drawing on the same held stacks are counted for each independently, so exact evaluation may still refuse. A negative answer is definitive, because a requirement the totals cannot cover cannot be covered by any assignment of them either. |
| **The imprecision is carried, not laundered** | The result carries an explicit optimism marker so a consumer cannot read it as exact by accident, and a surface presents a positive answer as "looks makeable", never as "you can make this". Exactness stays at craft time. |
| **Tools, checks, knowledge and currency are not consulted** | Each can only ever make a recipe LESS craftable, so ignoring them keeps the result an upper bound. A surface needing them asks the paths that own them. |
| **"Not asked" is distinct from "unavailable"** | A surface with no actor in view — the GM browser projects definitions rather than one actor's view of them — receives `null`, and MUST NOT be rendered as a material shortfall. An unresolvable recipe answers `null` for the same reason: an index miss must not present as a recipe with no requirements, which the empty-requirements case would otherwise report as plausible. |
| **Cost is per SNAPSHOT, not per row** | Per-system tallies are resolved once per snapshot, so projecting a page of summaries walks the held inventory once and performs one component-identity resolution per held document, not one per row. |
| **A multi-step recipe is read from its FIRST execution step** | An explicit multi-step recipe carries its requirements on `steps[]` and leaves its top-level ingredient sets empty, so a rule reading only the top level would treat every stepped recipe as having no requirements and answer "plausible" against an empty inventory. That is not the documented optimism — optimism is being wrong about contention, not blind to a whole recipe class. The FIRST step is used, not the actor's active step, because that is what the detail surface's requirement rail shows; a summary pointed at a mid-run step would disagree with the inspector opened from it. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Browse-status precedence

A row's browse status is derived by ONE rule, highest precedence first: teaser, then locked, then knowledge-gated, then recipe-item exhausted, then a material shortfall, otherwise available.
Exhaustion is READ from the knowledge access evaluation that already established it and MUST NOT be recomputed — see `recipe-visibility/spec.md` § One Candidate Collection Per Evaluation.
The material term reads the cheap-availability rule's tristate: only a definitive negative yields a material shortfall, and "not asked" does not.

The browse status is a SHARED field, so the rule that derives it is one rule for both audiences.
Its exhaustion INPUT is nevertheless empty for a GM, because a GM bypasses the knowledge gate that produces exhaustion at all; a GM-audience row is therefore never exhausted.
That is a property of the knowledge gate rather than an audience-dependent derivation, and it is the distinction to hold: the rule may not branch on audience, and an input the gate never produces for that audience is not a branch.

### What a summary MUST NOT contain, and MUST NOT call

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Prohibition | Rule |
| --- | --- |
| **No exact craftability** | Building any number of summaries MUST invoke exact craftability evaluation and ingredient selection ZERO times. This is a counter-asserted invariant, not a guideline: it is the property the paging surfaces depend on, and the one most likely to erode silently behind a helpfully-named private method. |
| **No redacted content** | A summary crossing to a player client carries no field the recipe's teaser hides, and no signal DERIVED from one. |
| **No localized text, with ONE enumerated exception** | Summaries carry tokens; the consuming surface localizes. A localized summary would key a row's sort on the active language. The single exception is `RecipeSummary.categoryLabel`, admitted on the terms its field row above records: the localization seam is OPTIONAL, so no caller is forced to acquire i18n, and nothing sorts on it. The exception is enumerated rather than general — a surface needing a second localized field amends this row and states why the same two tests pass, and MUST NOT read `categoryLabel` as a precedent that summaries may localize. |
| **No documents** | Only ids, plain strings, numbers, booleans and arrays of those, so a summary is serializable and cheap to hold by the page. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

The prohibition on exact evaluation is also enforced structurally: the projection accepts VALUES — a definition, a system, a snapshot, an access result — and never a manager or a listing builder, so there is no collaborator present to call either function on.
Tests MUST cover the counted invariant over a run of N summaries, and MUST prove the counter non-vacuous rather than reporting a green baseline forever.

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
- **Retiring an alias from the WRITE path is a separate decision from retiring it from the READ path**, and the two are recorded in different tables below.
  An alias may stop being emitted the moment no production path reads it off a serialized payload; it may stop being ACCEPTED only when no data in the wild can still carry it, which for anything a world, an exported system file or third-party content may hold is never.
  A write-retired alias therefore keeps a permanent inbound shim and belongs in § Write-Retired Aliases (Read Permanently), not in § Retired Aliases (Fully Removed) — the latter's "strip on import/export" rule would delete exactly the data the shim exists to recover.
- A serialized payload MAY omit a field whose absence its own constructor rebuilds to the identical value, and absence then carries the same meaning the written default carried.
  This is a write-side reduction, not a schema change: no migration is required and no downgrade loses data, because every reader that already handled the default keeps reading the same value.
  It is legitimate only where NO reader distinguishes the two, which is a property of the readers and must be audited per field rather than assumed from the constructor (see Recipe requirement 18).

### Canonical Fields

The following canonical field names must be used in all new writes:

| Model                     | Canonical Field                   | Description                                                                                                                                                                                                                        |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool                      | `componentId`                     | Managed item reference                                                                                                                                                                                                             |
| Ingredient                | `match.type = "component"`        | Match type for component-based ingredients                                                                                                                                                                                         |
| Ingredient                | `match.componentId`               | Component reference inside match object                                                                                                                                                                                            |
| Result                    | `componentId`                     | Produced item component reference                                                                                                                                                                                                  |
| CraftingSystem            | `components`                      | Array of managed item entries                                                                                                                                                                                                      |
| CraftingSystem            | `recipeItemDefinitions`           | Array of managed recipe-item entries                                                                                                                                                                                               |
| CraftingSystem            | `membershipResolvesByRecipeIds`   | Monotonic marker: recipe↔book membership resolves by `recipeIds`, never by the legacy scalar (issue 1010)                                                                                                                          |
| CraftingSystem            | `essenceDefinitions`              | Array of essence definitions, emitted unconditionally by normalization (empty when `features.essences` is off); supersedes the derived `essences` id-string alias                                                                  |
| CraftingSystem            | `visibilityMode`                  | Canonical flat recipe-visibility strategy (`global`/`restricted`/`item`/`knowledge`); supersedes legacy `recipeVisibility.listMode` + `knowledge.mode`                                                                             |
| IngredientSet             | `ingredientGroups`                | Array of ingredient group objects                                                                                                                                                                                                  |
| Recipe                    | `resultGroups`                    | Array of result group objects                                                                                                                                                                                                      |
| Recipe                    | `access`                          | Per-recipe restricted-mode grants (`{ characterIds, playerIds }`); read-forward from legacy `visibility.allowedUserIds`                                                                                                            |
| ~~Recipe~~ `recipeItemId` | _(legacy)_                        | Removed by the 1.13.0 migration; membership inverted to `RecipeItemDefinition.recipeIds`                                                                                                                                           |
| EssenceDefinition         | `sourceComponentId`               | Managed component source reference                                                                                                                                                                                                 |
| EssenceDefinition         | `sourceItemUuid`                  | Resolved or legacy template item evidence for effect transfer                                                                                                                                                                      |
| EssenceDefinition         | `colorToken`                      | Nullable `--fab-tag-*` palette key for the essence's authored colour; no `customColor` sibling                                                                                                                                     |
| Component                 | `originItemUuid`                  | Template item reference (registered-entry source ref; renamed from `sourceItemUuid` in issue 560)                                                                                                                                  |
| RecipeItemDefinition      | `originItemUuid`                  | Template item reference (registered-entry source ref; renamed from `sourceItemUuid` in issue 560)                                                                                                                                  |
| RecipeItemDefinition      | `recipeIds`                       | Canonical recipe↔book membership (many-to-many); inverts the removed `Recipe.recipeItemId`                                                                                                                                         |
| RecipeItemDefinition      | `caps`                            | Per-recipe-item use/learn caps (`caps.item`, `caps.learn`); canonical cap fields `whenSpent`, `limitLearning`, `learnsAllowed`, `learnScope` (legacy mirrors `destroyWhenExhausted`, `limitRecipes`, `maxRecipes`, `learningMode`) |
| CraftingSystem            | `itemTags`                        | Array of tag strings                                                                                                                                                                                                               |
| Item flag                 | `toolUsage.timesUsed`             | Tool usage tracking (legacy `catalystItemUsage.timesUsed` read as fallback)                                                                                                                                                        |
| Item flag                 | `recipeItemUsage.timesUsed`       | Recipe-item craft-charge tracking (`RecipeItemDefinition.caps.item` cap)                                                                                                                                                           |
| Item flag                 | `recipeItemLearning.learnedCount` | Recipe-item learn-cap tracking (`RecipeItemDefinition.caps.learn` cap), per document instance                                                                                                                                      |

### Legacy Read Aliases

The following legacy aliases are accepted by constructors and normalization functions and are normalized to their canonical counterparts on read:

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Legacy Alias                                                       | Canonical Form                                             | Context                               | Normalization                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `systemItemId`                                                     | `componentId`                                              | Tool, Ingredient, Result              | Constructor reads `systemItemId` as fallback; normalized to `componentId`                                                                                                                                                                               |
| `match.type = "systemItem"`                                        | `match.type = "component"`                                 | Ingredient.match                      | Constructor and migration rewrite type to `"component"`                                                                                                                                                                                                 |
| `match.systemItemId`                                               | `match.componentId`                                        | Ingredient.match                      | Constructor reads as fallback for `componentId`                                                                                                                                                                                                         |
| `managedItems`                                                     | `components`                                               | CraftingSystem                        | Normalization and migration rename to `components`                                                                                                                                                                                                      |
| `ingredients` (flat array)                                         | `ingredientGroups`                                         | IngredientSet                         | Constructor wraps each ingredient into a single-option group                                                                                                                                                                                            |
| `results` (flat array)                                             | `resultGroups`                                             | Recipe                                | Constructor wraps into a single result group                                                                                                                                                                                                            |
| `associatedSystemItemId`                                           | `sourceComponentId`                                        | EssenceDefinition                     | Normalization reads as fallback for the managed source component reference                                                                                                                                                                              |
| `associatedSystemItemId`                                           | `originItemUuid`                                           | Component                             | Constructor reads as fallback for `originItemUuid`                                                                                                                                                                                                      |
| `tags`                                                             | `itemTags`                                                 | CraftingSystem                        | Normalization reads `tags` as fallback for `itemTags`                                                                                                                                                                                                   |
| `catalystItemUsage` / `catalystUses` (bare number)                 | `toolUsage.timesUsed`                                      | Item flag                             | Runtime reads `toolUsage` first; when absent, falls back to `catalystItemUsage` (and the bare-number `catalystUses`, coerced to `{ timesUsed }`) so migrated `limitedUses` tools preserve in-flight usage. Legacy flag is never back-filled or cleared. |
| `sourceUuid` / `sourceItemUuid` / `fallbackItemIds` (pre-`1.16.0`) | `registeredItemUuid` / `originItemUuid` / `aliasItemUuids` | Component, RecipeItemDefinition, Tool | Issue 560 rename: normalization reads the old names new-name-first, old-name-tolerant, and emits the new names                                                                                                                                          |
| `linkedRecipeItemUuid`                                             | `recipeItemId`                                             | Recipe                                | Migration/import paths synthesize or resolve a `RecipeItemDefinition` by `originItemUuid` within the recipe's crafting system                                                                                                                           |
| `IngredientSet.essences` (map)                                     | essence ingredient options (`match.type === "essence"`)    | IngredientSet                         | The 1.17.0 migration rewrites each positive `essences[essenceId]` entry into a single-option essence group; constructors keep reading the map for one release                                                                                           |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Transitional Write Aliases (Scheduled for Removal)

The following aliases are currently emitted in `toJSON()` / normalization output alongside their canonical counterparts.
These are transitional and will be removed in a future version once all dependent UI code paths have been updated:

- `systemItemId` (emitted alongside `componentId` in Tool and Result; `Ingredient.toJSON` no longer emits it — see § Write-Retired Aliases)
- `essences` (emitted by `IngredientSet.toJSON` only when the legacy map carries at least one entry, which post-migration is never; superseded by essence ingredient options — one-release window)
- `essences` (CraftingSystem: derived id-string array equal to `essenceDefinitions.map(def => def.id)`, emitted alongside canonical `essenceDefinitions`; stripped on export by `stripTransitionalAliases` and re-derived after component deletion — not a Record, never feature-gated)
- `associatedSystemItemId` (emitted alongside `sourceComponentId` in EssenceDefinition and alongside `originItemUuid` in Component)
- `tags` (emitted alongside `itemTags` in CraftingSystem normalization)
- UI convenience aliases (`enableTags`, `enableEssences`, `enableCategories`, `enableMultiStepRecipes`, `advancedOptionsEnabled`)

These transitional aliases exist solely for UI code paths that have not yet been updated.
They do not represent the canonical data contract and must not be relied upon by new code.

### Write-Retired Aliases (Read Permanently)

The following aliases are **no longer emitted** by `toJSON()` / normalization output and **must never be re-introduced on the write path**, while their read fallbacks are PERMANENT and must not be removed by a later alias cleanup.

<!-- markdownlint-disable markdownlint-sentences-per-line -->

| Alias                        | Write Retired By | Read Fallback                            | Why the read stays                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ---------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `results` (flat array, Recipe) | #1087 | `Recipe._normalizeResultGroups`, which wraps each flat result into a single-result group when `resultGroups` is absent or empty | It duplicated `resultGroups[].results` wholesale and was ~10% of a representative recipe payload, paid on every write and every socket replication. Worlds, exported system files and third-party content authored before the retirement carry it as their only result data and cannot all be reached by a migration, so accepting it is not a window that closes. Import reference remapping and `migrateComponentId` keep traversing it for the same reason. |
| `ingredients` (flat array, IngredientSet) | #1135 | `IngredientSet._legacyIngredientsToGroups`, which wraps each flat ingredient into a single-option group when `ingredientGroups` is absent or empty; plus the FOUR projections that perform the same `{options: [ingredient]}` synthesis on raw json — `RecipeManager._displayGroups` and `RecipeManager._validateTagPlaceholders`, `adminRecipeRowProjection._ingredientCountForSet`, and `inventorySnapshot.groupsOf` | It was a DERIVED first-option-per-group projection of `ingredientGroups` — never authored, and strictly lossy, since a two-option group surfaced only its first option — and it was 19.89% of a simple serialized corpus and 21.13% of a rich one. The read fallback is permanent because it is reachable only for a pre-groups payload where the flat array is the set's ONLY ingredient data: a world, an exported system file or third-party content authored before ingredient groups existed. Stripping it on import would therefore delete a recipe's entire input requirement, which is why it must never be listed under § Retired Aliases (Fully Removed). The in-memory `IngredientSet#ingredients` property is unchanged and is what every runtime reader of the alias sees. |
| `systemItemId` (Ingredient) | #1135 | Every fallback in `models/match/matchTypes.js` — `normalizeMatch`'s bare-field read, `getComponentId`, and the ingredient-reference id extraction — each of which reads `componentId` first and falls back to `systemItemId`. That file is the largest cluster but NOT the whole set: seven more ingredient-scoped `componentId \|\| systemItemId` reads live outside it, in `Recipe.isSimpleRecipe`, `CraftingEngine`'s prepared-step consumed summary, `InventoryListingBuilder._optionConsumedComponentIds`, `importReferenceResolver`'s `remapIngredientRef` and `reportIngredientRef`, `recipeGraphBuilder.extractComponentIds` (which reads it on grouped options AND on the flat alias), and `recipeComponentReferences`'s `isDeletedLegacy`. Re-derive the list mechanically before any cleanup — grep `systemItemId` under `src/` and keep the reads whose subject is an ingredient option or a flat `set.ingredients` row, discarding the Result, Tool and gathering-drop reads of the same-named alias | On an `Ingredient` it was a byte-for-byte duplicate of `componentId` on the SAME object, so it never distinguished anything on the wire. The read fallback is permanent for the same reason as `results`: a payload written before `componentId` existed carries the alias as its only component reference, and the 1.13.0 `migrateComponentId` pass cannot reach content outside the world. `Tool.toJSON` and `Result.toJSON` still emit it and stay in § Transitional Write Aliases; only `Ingredient` retires. `src/ui/recipeIngredientGroups.js` also writes it, and is DEAD — an orphaned draft serializer with no importer anywhere in the repository — so it is not a missed retirement site. |

<!-- markdownlint-enable markdownlint-sentences-per-line -->

### Retired Aliases (Fully Removed)

The following aliases **must not be emitted by new code** and must be stripped on import/export for backward compatibility with data written by older versions:

| Retired Alias | Removed In | Notes                                                                                                |
| ------------- | ---------- | ---------------------------------------------------------------------------------------------------- |
| `enableTiers` | #105       | Tiered crafting mode was removed; this field was hardcoded to `false` and never functionally active. |
| `tiers`       | #105       | Tiered crafting mode was removed; this field was hardcoded to `[]` and never functionally active.    |

### Testing Requirements

Tests must include:

- Backward-compatible read tests: constructing models from legacy-only data (e.g., `systemItemId` without `componentId`) must produce correct canonical state.
- Canonical-write assertions: `toJSON()` output must include all canonical fields with correct values, except where a model documents an omitted-when-default set (Recipe requirement 18), which is instead asserted as "omitted for a defaulted model, emitted for a non-default value, and reconstructed identically from absence".
- Migration idempotency: running the `migrateComponentId` migration on already-migrated data must produce identical output.
- Round-trip integrity: `Model.fromJSON(model.toJSON())` must preserve all canonical fields.

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

    // The SELECTION TRIPLE over `CraftingSystem.modifiers` (issues 1095, 1117), the SAME
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

    // The SELECTION TRIPLE over `CraftingSystem.modifiers` (issues 1095, 1117), the SAME
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

  // THE ONE named modifier library for the WHOLE system (issue 1117). It has moved twice:
  // out of `craftingCheck.checkModifiers` in `1.22.0`, because salvage and gathering select
  // over the same entries so it can belong to no one activity; and then, in `1.23.0`, it
  // ABSORBED the gathering character-modifier library
  // (`gatheringConfig.systems[systemId].characterModifiers`), because a named actor-driven
  // expression is ONE concept and authoring it twice let a GM define "Medicine" as two
  // unrelated records that could disagree. Both migrations delete the old key.
  //
  // THE SHAPE IS A SUPERSET, and each field is honoured by whichever consumer needs it:
  // `min`/`max` clamp a CHECK modifier's contribution — the resolved number for a flat
  // entry, and the ROLLED result for a rolling one — while a gathering drop-row
  // reference carries its OWN `min`/`max` that clamp its contribution independently.
  // `isRollExpression` is DERIVED from the expression on every normalize and never read
  // from the input, so a persisted or imported flag cannot contradict the expression
  // beside it.
  //
  // Each `expression` is a roll-data fragment evaluated against the acting character
  // (missing/failed → 0). `icon`, `min` and `max` are attached ONLY when authored, so
  // absence round-trips as key-absent and means unbounded — a bound of `0` is a real
  // bound, which is why the guard is `Number.isFinite` on an explicitly-guarded value
  // rather than truthiness. An authored `min > max` is preserved VERBATIM and is a
  // BLOCKING readiness issue (`modifierBoundsInverted`): that entry contributes 0 until
  // it is repaired, matching gathering's `INVALID_CHARACTER_MODIFIER_BOUNDS` posture.
  // A finite bound that no dice-grammar `Constant` can express (`1e21`, `1e-7`) is the
  // SECOND blocking bounds fault, `modifierBoundsUnsafe`, also `critical`, and likewise
  // contains the entry to 0. Two issue ids rather than one cause with two readings: the
  // repairs differ and `1e21` is not an inversion.
  // A ROLL-SHAPED expression is legal here and legal in a CHECK (issue 1118). A gathering
  // drop row evaluates the expression and applies the result as a percentage-point delta;
  // a check appends the DICE to its roll formula, so the authored variance survives to the
  // roll and shows on the card. The bounds above clamp the ROLLED result for such an entry,
  // in the formula. `isRollExpression` is therefore a DISPLAY classification and never a
  // gate: the blocking `modifierRollExpression` readiness issue issue 1117 raised is
  // RETIRED.
  //
  // An entry with an EMPTY expression is KEPT rather than dropped: the library has an "Add
  // modifier" button, and an entry that vanished on save the moment it was created would
  // make that button appear broken. It is still a runtime misconfiguration wherever it is
  // referenced.
  //
  // Absent = empty library, so every activity's contribution is nothing and no term is
  // appended.
  modifiers?: {
    id: string, label: string, expression: string, isRollExpression: boolean,
    icon?: string, min?: number, max?: number
  }[],  // default []

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

    // THE SELECTION TRIPLE, and only it (issues 1095, 1117). The LIBRARY moved UP to
    // `CraftingSystem.modifiers` — see the system shape above — because salvage and
    // gathering now select over the same entries; the `1.22.0` migration relocates it and
    // DELETES this level's `checkModifiers` key. The identical triple appears on
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
    Record shapes and behavior are defined in `gathering-and-harvesting` (_Location-Aware Gathering_).
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
    Each strategy is realized by a symmetric coin spender behind a common `{ check(actor, requirement, ctx), spend(actor, requirement, ctx) }` interface (the `actorProperty`/`actorInventory` spenders also retain `readCoins` as the affordability primitive their `check` wraps); a consumer resolves the spender by `spendStrategy` and drives both the up-front affordability check and the deduction uniformly. (These spenders are reusable infrastructure; the step-level integration that previously drove them has been removed, and component-level currency spending is a deferred follow-up.) - `"actorProperty"` (the generic `ActorPropertyCoinSpender`) reads each unit's balance from its `actorPath` and spends through a single batched `actor.update(...)`, making its own change across configured sub-units.
    This is the dnd5e and general behavior. - `"actorInventory"` uses a preconfigured provider.
    The generic `ActorInventoryCoinSpender` delegates the system-specific coin I/O to a per-system coin adapter resolved by `game.system.id`.
    Providers are registered in a pure, Foundry-free registry (`getCurrencyProvidersForFoundrySystem`, `getDefaultProviderId`, `resolveProvider`); the only registered provider is the pf2e inventory adapter (an internal `systemId → adapter` map, not a third-party plugin registry), which reads coins from the pf2e inventory aggregate (`actor.inventory.coins`) and spends through `actor.inventory.removeCoins(...)`, letting pf2e make its own change and report insufficient funds; Fabricate does not run its own change-making on this path. `providerId` is stored and selectable but the runtime still resolves the adapter by `game.system.id` (one provider per system today).
    Systems with no registered provider (e.g. dnd5e) surface an empty-provider callout steering the GM to the `"macro"` strategy.
    When no adapter is registered for the active system, the spend fails loudly with a clear message rather than silently succeeding. - `"macro"` drives currency through GM-supplied macros.
    Because the macro receives the actor and does whatever it needs, macro spending is **not inventory-specific** and is a peer top-level strategy rather than a sub-mode of `"actorInventory"`. `MacroCoinSpender` runs the `canAfford` macro for the affordability check and the `decrement` macro for the deduction, passing each a context `{ actor, cost: [{ abbreviation, amount }], units: [{ id, abbreviation, label }], requirement, recipe, craftingSystem }`.
    A macro return of `true`, or an object with a truthy `success`/`canAfford`, passes; `false`/`null`/a thrown error (or a falsy `success`/`canAfford`) fails and surfaces the macro's `message` to the player, aborting the craft before ingredient consumption.
    The `increment` macro performs the player-cancel refund: when a player cancels an in-progress craft and the system's `features.refundOnPlayerCancel` policy is on, `MacroCoinSpender` runs the `increment` macro to return the spent currency (the inverse of `decrement`).
    It remains optional — a macro-mode system with no `increment` macro simply cannot refund a cancel, and the reversal reports that failure rather than aborting.
    The macro strategy is GM-only config with no separate feature flag (matching the property macros). - The pf2e currency preset seeds units with `denomination` set, selects the `"actorInventory"` spend strategy, and sets the system's default `providerId`; the legacy pf2e system-adapter config normalizes to the same strategy (and the legacy dnd5e adapter normalizes to `"actorProperty"`).
20. `providerId` is a trimmed string (default `""`) and `macros` is an object of trimmed `canAfford`/`increment`/`decrement` UUID strings (each default `""`).
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
    **`craftingCheck.checkModifiers` no longer exists at this level either** (issues 1095, 1117): the library is `CraftingSystem.modifiers`, and `_normalizeCraftingCheck` — an allowlist rebuild — does not emit the old key at all, which is why the `1.22.0` and `1.23.0` migrations' before-any-load ordering is load-bearing rather than incidental.

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

33. **System-level modifier library.** `CraftingSystem.modifiers` is the ONE named modifier library for the whole system: an ordered array of `{ id, label, expression, isRollExpression, icon?, min?, max? }`, ids unique and trimmed, malformed entries dropped, a bad expression coerced to `''`, `icon` / `min` / `max` attached only when authored, and `isRollExpression` DERIVED from the expression on every normalize.
    It is referenced by all three activity checks AND by every gathering drop row, event and stamina cost, and it is authored on exactly ONE surface (System settings › Modifiers).
    It replaces `craftingCheck.checkModifiers` (moved up and deleted by `1.22.0`), `CraftingSystem.checkModifiers` and `gatheringConfig.systems[systemId].characterModifiers` (merged and deleted by `1.23.0`).
    An entry with an empty expression is kept, not dropped, because the authoring surface can create one.
    Each of `craftingCheck`, `salvageCraftingCheck` and `gatheringCraftingCheck` carries its own `{ defaultModifierPolicy, defaultModifierIds, maxModifierPicks? }` selection over it, normalized by ONE shared derivation (`CraftingSystemManager._normalizeCheckModifierSelection`) so the three cannot drift; a default id naming nothing in the catalogue is dropped, preserving order and de-duplication.
    `min` / `max` clamp that entry's CONTRIBUTION, so a bound means the same thing under every combination rule: the resolved value for a flat expression, and the ROLLED result for a rolling one, the latter expressed in the formula as `min(max((1d8), -1), 6)`.
    Both are absence-preserving in the same way `maxModifierPicks` is: only a FINITE number is attached, and `null` / `''` / `[]` are guarded explicitly before coercion because `Number()` reads all three as `0` and `0` is a real bound.
    An authored `min > max` is preserved verbatim rather than reordered, raises the BLOCKING `modifierBoundsInverted` readiness issue, and makes that entry contribute exactly 0 until it is repaired.
    A bound that is finite but NOT expressible as a dice-grammar `Constant` — `1e21`, `1e-7` — is the SECOND blocking bounds fault, `modifierBoundsUnsafe` (also `critical`), and contains that entry to 0 in the same way; it is a separate issue id rather than a second cause on the first, because the repairs differ and `1e21` is not an inversion.
    The expressibility test is the same `isDecimalSafeTermValue` the term emit asks, so the clamp and the emit cannot disagree about which numbers a formula can carry.

34. **Subject-level modifier picks.** Under the `bySubject` combination rule the pick lives on the record being resolved: `Recipe.craftingModifier.modifierIds`, `Component.salvage.checkModifierIds`, `GatheringTask.checkModifierIds`.
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

## CurrencyUnit

### Purpose

Define one actor-backed currency denomination and its optional sub-unit breakdown.

```ts
type CurrencyUnit = {
  id: string; // stable internal reference used by CurrencyRequirement.unit
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
   The scalar reverse ref `recipe.recipeItemId` (and the legacy `recipe.linkedRecipeItemUuid` book alias) is removed by the `1.13.0` migration, which inverts it onto `recipeIds`; membership is authored book-side on the Contents tab, and the runtime falls back to the legacy reverse ref only while the system's monotonic `membershipResolvesByRecipeIds` marker is unset (issue 1010).
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
    Library membership of the ids is NOT enforced here — the resolver drops unknown ids against the live system-level `CraftingSystem.modifiers`.
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
    The one re-derivation inside `src/ui` is `buildRecipeGraph` (`src/ui/svelte/util/recipeGraphBuilder.js`), which takes `recipe.img || DEFAULT_RECIPE_IMAGE` at the call site: it borrows nothing, but it does not treat the `icons/svg/item-bag.svg` sentinel (or a whitespace-only `img`) as "no image".
    It carries no user impact today, because the Graph surface is an unimplemented placeholder gated behind `fabricate.experimentalFeatures` (issue 442).
17. A UI draft seeded from the recipe-browser projection carries DERIVED, non-model fields — `recipeItemId`, `recipeItemIds`, `recipeItemName` and `recipeItemSourceUuid` — for display only (issue 978).
    A save must OMIT them from the update payload rather than writing them, and must never write them as `null`: `RecipeManager.updateRecipe` merges over the persisted record, so omission preserves the persisted value while an explicit `null` would destroy the scalar maintained for the standalone alchemy formula-item cohort.
    The strip belongs to the store that derives them, so the projection's producer owns its own write boundary and the draft keeps carrying them for the editor's Books & Scrolls display.
    Only `recipeItemId` reaches disk today, because `Recipe.fromJSON` reconstructs from named fields and drops the other three; that is a property of the model's current field list rather than a guarantee, so the whole derived set is stripped and named in one place.
    `recipe.recipeItemId` is authored ONLY by migration and by `CraftingSystemManager._migrateLegacyRecipeItems`, never by the editor.
    A recipe that is a book member through `RecipeItemDefinition.recipeIds[]` and carries no `linkedRecipeItemUuid` has its leaked scalar cleared by that same un-gated pass, which is idempotent because a cleared recipe is not a re-stamp candidate.
    The repair is deliberately unreachable while the system's `membershipResolvesByRecipeIds` marker is unset, because no recipe is then a member by `recipeIds` and the scalar is still the membership source for `getRecipeItemDefinitionsContaining` and `_getRecipeObjectsReferencingRecipeItemDefinition`.
    Those two membership reads, and their `adminStore` mirrors `_recipeItemDefinitionsContaining` and `_enrichRecipeItemLibrary`, are each gated on that marker rather than on any per-read inference over the arrays, so a leaked scalar never resurrects phantom book membership — its only live consequence was the image borrow in requirement 16.
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
   An essence option is resolved inside its ingredient set's single essence block rather than in its own author position (see §Essence-Alternative Consumption), so its funding is pooled with every other essence option in the set.
   The player selects the held **items** that fund the block through the `essenceAllocation` channel, rather than picking one option per essence requirement as they would for a component/tag group.

### Currency-Alternative Spend (Craft-Time)

When the crafting system has `requirements.currency.enabled === true`, a currency option can satisfy its ingredient group by spending the crafting actor's currency at craft time:

1. Selection is **items-first, currency-fallback** per group.
   Every non-currency option is tried first; the first item-satisfiable option wins even if a currency option is authored earlier (items strictly beat currency).
   Only if no item option satisfies does the resolver choose the first AFFORDABLE currency option in author order among the group's currency options.
2. Affordability is evaluated against the crafting actor through the same currency profile/spend strategy the system configures (`actorProperty` / `actorInventory` / `macro`).
   The craftability display and the engine execution resolve currency against the **same** actor, so what a player sees agrees with what the craft spends.
   With no crafting actor the currency option is treated as unaffordable (shown missing); it never throws.
3. The engine computes the chosen item plan and currency spends **once** for a craft, then runs an all-affordable gate over the chosen spends — aggregated per terminal base unit — **before** any item or currency mutation.
   On a shortfall the craft aborts with an `Insufficient currency` message and zero mutation, and never falls back to an unselected item plan.
4. Currency is deducted after item consumption on success (and on a failure path only when the failure policy consumes ingredients).
   Deduction makes change across the configured denomination ladder; a deduction failure is logged, not refunded — the settled deductions are NOT rolled back, and the craft still proceeds.
   Deduction is aggregated per terminal base unit and stops at the first group that fails, so no further currency is taken for a craft already in an anomalous state; the deduction reports which groups settled.
   A time-gated step that consumes at START records on its run ONLY the spends that actually settled, never the intended plan.
   A group that did not settle is not recorded, so no later reversal can return currency the actor never paid.
5. When `requirements.currency.enabled === false`, a currency option can never satisfy its group (it is shown missing), regardless of the actor's balance.
6. A currency requirement or cost is displayed by resolving the unit `id` to a human label through the chain `abbreviation` (when authored) → `label`, so a well-formed requirement never surfaces the raw unit `id`.
   The sole exception is a degenerate orphaned reference — a `requirement.unit` id no longer present in the system's resolved currency config — which `formatCurrencyRequirement` renders verbatim as a last-resort fallback (a stale id being preferable to a blank cost).
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
   The invariant is _"the set of **enabled** recipes is collision-free"_: the `blocks:'system'` gate, the save-block, and the disable-reconciliation all funnel through `validateSystem`, and disabling all participants of a conflict genuinely clears it (re-enabling a disabled collider is re-caught at that mutation).
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
    ids: string[],                 // shared CraftingSystem.characterPrerequisites ids
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
   The system normalizer processes `characterPrerequisites` before Tools, prunes unknown Tool prerequisite ids in every state, retains valid ids while disabled, and changes an enabled gate to disabled when pruning leaves no ids.
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
| `prerequisites.ids`                      | known shared ids; at least one when enabled               | unknown or enabled-empty        |
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
  },
}
```

Requirements:

1. `recipeId` must reference a valid recipe.
2. `learnedAt` must be a valid timestamp.
3. `sourceItemUuid` should reference the matched owned recipe item used to learn.
   It is an actor-owned item uuid, so it dangles permanently once that copy is deleted, and the craft-time auto-learn path writes it as `null`.
4. Stored and read via `getFabricateFlag` / `setFabricateFlag`; the effective persisted path is the doubly nested `flags.fabricate.fabricate.learnedRecipes` (the flag helpers prefix `fabricate.`), so it is never read via a raw single-nested `actor.flags.fabricate.learnedRecipes` path.
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
6. Discovery semantics are defined in `gathering-and-harvesting` (_Actor Realm Discovery_).

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
Fabricate has no socket-to-GM relay, so a pass that writes to an actor a player does not own is refused by Foundry, and `setFabricateFlag` REJECTS on a refused update by contract rather than reporting a phantom success.
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

A configured dynamic DC macro receives one payload object containing:

- `recipe`
- `craftingSystem`
- `craftingActor`
- `candidateIngredientSet`

Fabricate exposes that exact object with identity as `scope`, `context`, and `args`.
The `scope` identifier provides Foundry-facing familiarity while `context` and `args` remain backward-compatible aliases.
This is not full native `Macro#execute` behavior: Foundry's native `scope` is a rest copy, and Fabricate does not add Foundry's native `speaker`, `actor`, `token`, or `character` locals.

Fabricate applies `Number(result)` to the macro's return value.
When the coerced value is finite, Fabricate truncates it to an integer and uses it as the dynamic DC.
An absent configured macro, a thrown error, or a result whose numeric coercion is non-finite falls back to the configured static DC.

The shared executor deliberately evaluates the selected script Macro command instead of calling `Macro#execute`.
This keeps player-initiated workflows from being blocked by Foundry's current-user Macro permission gate.
The direct evaluation bypasses only the client-side Macro document check and grants no additional server or document authority; the script still runs as the current player.
Foundry runtime globals `game`, `foundry`, `ui`, and `fromUuid` remain directly available and are not injected as payload parameters.
Errors thrown by a configured macro propagate unchanged to the owning Fabricate workflow, which decides whether to abort or apply a documented fallback such as the dynamic DC fallback above.

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

- `systemItemId` (emitted alongside `componentId` in Tool, Ingredient, Result)
- `essences` (emitted by `IngredientSet.toJSON` as `essences: this.essences`, `{}` post-migration; superseded by essence ingredient options — one-release window)
- `essences` (CraftingSystem: derived id-string array equal to `essenceDefinitions.map(def => def.id)`, emitted alongside canonical `essenceDefinitions`; stripped on export by `stripTransitionalAliases` and re-derived after component deletion — not a Record, never feature-gated)
- `ingredients` (emitted alongside `ingredientGroups` in IngredientSet)
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

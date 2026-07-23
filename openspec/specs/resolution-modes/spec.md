# Resolution Modes

## Purpose

Define semantics and validation rules for crafting-system resolution modes.
A crafting system has exactly one mode, and every recipe/step in that system must conform to it.

## Mode Invariant

- `CraftingSystem.resolutionMode` is system-wide.
- Recipes cannot mix resolution modes inside one crafting system.
- Mode changes are **migration-first** and governed by
  `destructive-changes-and-migrations/spec.md`:
  recipes are migrated to fit the new mode wherever possible and a recipe is
  deleted only when a per-recipe *structural* constraint of the target mode cannot
  be satisfied by clearing the result selection or collapsing a multi-set recipe.
  System-level gaps (a target mode that needs a check the system has not
  configured, an alchemy signature collision, ...) never delete a recipe; they are
  surfaced as system-validation issues that gate visibility, not deletion.
- **Migratability matrix (normative).**
  The columns are the *target* mode and the rows the *source* mode.
  RI = `routedByIngredients`, RC = `routedByCheck`.
  Migrating *into* alchemy no longer seeds a per-recipe provider (retired, issue 554):
  it clears any stale `resultSelection` and collapses a multi-INGREDIENT-SET recipe
  to its first set (best-effort, single `console.warn`); the system-level
  `alchemy.checkMode` is seeded separately (defaults to `none`, or via the
  `hasCheckProvider`/`hasTieredShape` reduction on the startup migration).
  "clear" sets `resultSelection` to `null`;
  "carry" keeps the recipe verbatim;
  "reconcile" means the recipe survives but its stale routing is surfaced as a
  re-authoring validation issue, never silently mis-routed;
  "1×1" means the recipe has exactly one ingredient set and one result group.

  | From \ To             | `simple`                     | `routedByIngredients`        | `routedByCheck`                          | `progressive`                | `alchemy`                                                           |
  |-----------------------|------------------------------|------------------------------|------------------------------------------|------------------------------|--------------------------------------------------------------------|
  | `simple`              | —                            | clear                        | clear; reconcile                         | clear                        | clear; collapse multi-set                                          |
  | `routedByIngredients` | clear if 1×1 else **delete** | —                            | carry; reconcile                         | clear if 1×1 else **delete** | clear; collapse multi-set; single-step else **delete**            |
  | `routedByCheck`       | clear if 1×1 else **delete** | carry; reconcile             | —                                        | clear if 1×1 else **delete** | clear; collapse multi-set; single-step else **delete**            |
  | `progressive`         | clear                        | clear                        | clear; reconcile                         | —                            | clear; collapse multi-set                                          |
  | `alchemy`             | clear if 1×1 else **delete** | carry                        | carry; reconcile                         | clear if 1×1 else **delete** | —                                                                  |

  The only structural delete causes are: narrowing into `simple`/`progressive`
  (which require 1×1) from a recipe with more than one ingredient set or result
  group, and moving a multi-STEP recipe into `alchemy` (which has no multi-step
  support).
Moving a multi-INGREDIENT-SET recipe into `alchemy` is a best-effort
  collapse to the first set, NOT a delete.
  `RI↔RC` never deletes (`carry`); it reconciles stale routing.
  Re-running a `carry` migration with no reconcile pending is a no-op (idempotent).
- Mode *cardinality* checks (e.g. "must have exactly/at least N ingredient set/result group", progressive "requires ordered results") are *completeness* and are waived under structural-only validation (`ResolutionModeService.validateRecipe(recipe, { requireComplete: false })`, used when persisting an authoring incomplete shell); mode *reference-integrity* checks always apply, per mode: `routedByIngredients` checks the invalid `resultGroupId` integrity, and `routedByCheck` checks the reserved/duplicate `ResultGroup.name`. (The routed modes carry no `resultSelection.provider`, so there is no provider value to validate.) (Legacy `mapped`/`tiered` are not live modes; they are accepted only as one-time migration inputs per `destructive-changes-and-migrations/spec.md §Resolution-Model Migration`, which hard-migrates `mapped → routedByIngredients` and `tiered → routedByCheck`.)

## Mode Matrix

| Mode                  | Ingredient Sets | Result Groups               | Check Requirement  | Routing Basis                       |
|-----------------------|-----------------|-----------------------------|--------------------|-------------------------------------|
| `simple`              | exactly 1       | 1 success (+ optional reserved failure group) | optional | single result group                 |
| `routedByIngredients` | one or more     | one or more                 | optional           | `IngredientSet.resultGroupId`       |
| `routedByCheck`       | one or more     | one or more                 | required           | system routed-check outcome         |
| `progressive`         | exactly 1       | exactly 1 (ordered results) | required           | numeric value spending              |
| `alchemy`             | exactly 1       | per `checkMode` (see below) | none / required-when-simple / required-when-tiered | system `alchemy.checkMode`          |

## Check Source

- Every mode's check has a single supported source: a GM-authored roll formula (`craftingCheck.simple` / `routed` / `progressive.rollFormula`) that the engine rolls and evaluates natively.
This built-in dice-expression check is the low-complexity path for GMs who do not need dnd5e/pf2e-specific stat integration — no macro and no game-system adapter is required or supported.
- A check is **usable** IFF its mode's `rollFormula` is authored.
The historical macro-as-check-source and the `checkSource: "builtIn"` game-system adapter (`builtIn: { ability, skill, dc, advantage }`) were removed in 1.8.0 and are not part of the model; see `data-models` requirement 30 and its *Crafting Check Macro Contract* section.
- The legacy `craftingCheck.mode` discriminator has the single valid value `passFail` and drives nothing; the active check sub-object is selected by `resolutionMode` (see `data-models` requirement 29).
- A check roll formula MAY reference **`@craftingmod`**, a Fabricate-resolved scalar computed from the system's **`checkModifiers`** catalogue (`{id,label,icon?,expression}[]`) under a **`defaultModifierPolicy`** (`addAll` → sum, `highest` → deterministic `max(...)` scalar, `byRecipe` → the recipe's own set summed, `playerPicks` → the player selects one at roll time; see below), optionally overridden per recipe by **`Recipe.craftingModifier`** (`{policy?, modifierIds?}`; absent = inherit the system default policy + `defaultModifierIds`).
Each eligible entry's `expression` is a roll-data fragment (e.g. `@abilities.med.mod`) evaluated against the crafter's roll data to a number (a missing/failed expression contributes 0, never NaN).
Resolution is **deterministic** for `addAll`/`highest`/`byRecipe` (and for `playerPicks` on any non-interactive craft — see below); `@craftingmod` is resolved to a scalar and substituted **before** the string reaches Foundry's `Roll` (Foundry would otherwise treat an unresolved `@craftingmod` as 0), feeding **both** evaluation (`checkRoll.js` `evaluateCheckRoll`) and display (`resolveCheckFormulaDisplay`) so the shown formula equals what evaluates.
A formula with no `@craftingmod` token is unchanged (full single-formula back-compat).
- The crafting-check modifier policy (`defaultModifierPolicy`, per-recipe `Recipe.craftingModifier.policy`) supports a fourth value **`playerPicks`** (crafting only; not salvage/gathering).
On an **interactive** craft whose effective policy is `playerPicks`, the roll prompt presents the eligible modifier set (label + icon + resolved numeric value) at roll time as radio options and resolves `@craftingmod` to the value of the **single modifier the player selects**; the prompt pre-selects the highest-valued eligible modifier (tie-break: eligible-set order, first-listed among equal-highest wins).
On any **non-interactive** craft (API / macro / headless), `playerPicks` resolves deterministically as `highest`, so `@craftingmod` is never left unresolved and API results stay deterministic.
The interactive substitution occurs **before** the situational-bonus append and before `Roll`; the same substituted formula feeds evaluation and display (eval == display).
A cancelled prompt aborts with zero mutation and no substitution.

## Player-Facing Mode Labels

The `resolutionMode` token is system-internal and must never surface raw in player UI.
The player-facing Journal screen (see `ui-integration/spec.md` *Journal App*) maps each mode to a localized display label through a frozen label-key map (`RunJournalBuilder.MODE_LABEL_KEYS`), resolved against the `FABRICATE.App.Journal.Mode.*` localization keys.

| Mode                  | Localization key                                 | Player label          |
|-----------------------|--------------------------------------------------|-----------------------|
| `simple`              | `FABRICATE.App.Journal.Mode.Standard`            | Standard (DC)         |
| `routedByIngredients` | `FABRICATE.App.Journal.Mode.RoutedByIngredients` | Routed by Ingredients |
| `routedByCheck`       | `FABRICATE.App.Journal.Mode.RoutedByCheck`       | Routed by Check       |
| `progressive`         | `FABRICATE.App.Journal.Mode.Progressive`         | Progressive           |
| `alchemy`             | `FABRICATE.App.Journal.Mode.Alchemy`             | Alchemy               |

- There is no canonical "Standard" resolution mode.
`simple` (a DC pass/fail check) renders as "Standard (DC)" for players, even though its internal token stays `simple`.
- A run whose recipe resolves to an unknown or absent mode falls back to the `simple` ("Standard (DC)") label rather than emitting a raw token.

## Simple Mode

### Semantics

- One ingredient set and one success result group, plus an **optional reserved `role: 'failure'` result group** (mirroring alchemy's none/simple path).
- Optional pass/fail crafting check.
- On success, produce the single success result group.
- On a failed (enabled) check, produce the reserved `role: 'failure'` group when one is authored; otherwise nothing is produced.

### Validation

- Exactly one `IngredientSet`.
- Exactly one success `ResultGroup` (validation counts only non-`failure` groups); an optional reserved `role: 'failure'` group is tolerated, and a simple recipe carrying one still validates.
- The crafting check is optional: it runs only when `craftingCheck.simple.rollFormula` is authored **AND crafting checks are enabled** (`features.craftingChecks === true` or `craftingCheck.enabled === true`; both default false).
With no authored formula, or with checks disabled, the attempt proceeds with no check; there is no macro-return contract.

## Routed by Ingredients Mode (`routedByIngredients`)

### Semantics

- Multiple ingredient sets and result groups are allowed.
- The routing basis is a property of the **mode** (not a per-recipe provider): routing uses `IngredientSet.resultGroupId`.
The mode carries no `resultSelection`.
- **Single-selection semantics: exactly one result group is selected per craft attempt, determined by the chosen ingredient set.
No other result groups are awarded.**
- The crafting check uses the SAME shared **`craftingCheck.simple`** config slot as `simple`/`alchemy` mode (which backs `simple`, `alchemy`, and `routedByIngredients` — it is not a simple-mode-only slot), but its **run condition differs from simple mode**: routedByIngredients (like alchemy-Simple) rolls on an authored `craftingCheck.simple.rollFormula` alone, **ungated by the crafting-checks toggle**, whereas simple mode additionally requires crafting checks to be enabled (see §Simple Mode Validation).
It runs only when `craftingCheck.simple.rollFormula` is authored; with no formula the attempt proceeds with no check.
It is a pass/fail gate comparing the roll total against the DC (meet/exceed per `thresholdMode`), honouring per-recipe DC tiers (`checkTierId` → `craftingCheck.simple.tiers`), a dynamic-DC macro (`dcMode: 'dynamic'`), and the check's `checkBreakage` triggers.
It never reads outcome tiers and never changes which result group is produced (routing stays `IngredientSet.resultGroupId`).

### Routing

- Routing uses `IngredientSet.resultGroupId`.
- If there is only one result group, explicit mapping may be omitted.
- If there are multiple result groups, every satisfiable ingredient set must resolve to exactly one group.

### Validation

- At least one `IngredientSet`.
- At least one `ResultGroup`.
- Reference integrity (always applies): each `IngredientSet.resultGroupId` must point at a real `ResultGroup` in scope.
- This mode never raises `routedCheckNoFormula`: a missing `craftingCheck.simple.rollFormula` simply means no check runs.
It shares the `craftingCheck.simple` config slot with its `simple`/`alchemy` peers, but its run condition matches alchemy-Simple (an authored formula rolls on its own), not simple mode (which also requires the crafting-checks toggle enabled).

## Routed by Check Mode (`routedByCheck`)

### Semantics

- Multiple ingredient sets and result groups are allowed.
- The routing basis is a property of the **mode** (not a per-recipe provider): the system-level routed crafting-check outcome routes to a `ResultGroup`.
The mode carries no `resultSelection`.
- **Single-selection semantics: exactly one result group is selected per craft attempt, determined by the check outcome.
No other result groups are awarded.**
- The crafting check is **required**.
The outcome is produced by the system's configured routed crafting check, whose required field is an authored `craftingCheck.routed.rollFormula`.
- `outcome` is trim-normalized and case-insensitive.
- **Relative tier clamp:** when the routed check uses **relative** outcome tiers and the rolled total meets no tier's effective threshold (`baseDc + outcome.dc`), the outcome is the lowest (closest) tier rather than an empty/null outcome, so a recipe tier or dynamic DC that raises the base difficulty never yields a rolled-but-unrouted craft.
The clamp is relative-only; **fixed** tiers keep the "outside every range → no outcome" behaviour (their ranges are authored explicitly).
- **Fixed tiers carry no DC.**
Fixed outcome tiers own explicit, non-overlapping `[start, end]` value ranges and the roll total is matched by range, so the check DC and the meet/exceed `thresholdMode` comparison are unused in fixed mode — DC and the comparison are relative-only.
The DC still governs `routedByIngredients` (whose pass/fail gate compares the roll against it — that DC now lives on its simple check, `craftingCheck.simple.dc`) and relative-type routed checks (which read `craftingCheck.routed.dc`); only `routedByCheck` with `type: "fixed"` drops it.
- **Per-recipe minimum success tier (fixed only).**
A `routedByCheck` recipe MAY carry an optional `minSuccessOutcomeId` referencing a fixed success outcome tier id; fixed tiers rank by their `start` value.
When set, a craft whose naturally-rolled tier ranks below the required tier — or whose total lands outside every fixed range, so no tier matched at all — fails outright: `success: false`, no outcome routes, and the recipe takes its normal failure/consumption path with no success result.
Because no tier routes on this failure, the rolled tier's own `breakTools` flag is dropped (the per-tier breakage bridge fires only for a routed tier); independent dice-group / roll-total breakage triggers are unaffected.
The default (null/unset) imposes no override, so the outcome is the tier actually rolled.
A forced-outcome trigger (a natural crit) bypasses the gate — a natural crit is never downgraded by a recipe minimum.
A stale or unknown `minSuccessOutcomeId` no-ops.
The gate is fixed-type only; relative-type routed checks ignore it.
It is enforced in the shared routed-check runner (`runFormulaRouted`) through an optional minimum-tier parameter that is no-op by default, so salvage and gathering routed checks are unaffected.
Runtime scope: the minimum-success-tier gate is `routedByCheck`-only.
The crafting dispatch threads `minOutcomeId: recipe.minSuccessOutcomeId` on the `routedByCheck` path alone; although **alchemy `checkMode: tiered`** is dispatched to the same `_runRoutedCheck` caller, that dispatch forces `minOutcomeId: null` (`applyMinSuccessOutcome: false`), so a `minSuccessOutcomeId` carried on an alchemy tiered brew — authored before a mode switch, or imported — has NO runtime effect.
Alchemy tiered brews already gate success through each outcome tier's own `success` flag, so they need no per-recipe minimum.
This matches the authoring control, which auto-hides outside `routedByCheck` (`resolveRecipeFixedOutcomeTierOptions`): the value the GM cannot see or clear is also the value the runtime ignores.
A persisted alchemy `minSuccessOutcomeId` is left inert by the dispatch guard rather than migrated away.
- **Single-result-group exemption (mirrors `routedByIngredients`):** when a step (or an implicit recipe) has exactly one result group, no outcome/tier mapping is required.
A non-failure outcome produces that single group (`disposition: success`); a failure/miss keyword produces nothing (failure path).
Resolution never aborts with a misconfiguration for an unmatched success outcome when there is exactly one result group.
- **Routing is success-disposition-gated.**
A check result whose matched tier has `success: false` takes the failure/consumption path regardless of the tier's name — the engine short-circuits on `!checkResult.success` before routing runs.
Routing via `checkOutcomeIds` resolves only `success === true` tiers (a `success: false` tier must never produce a `disposition: 'success'` result), and validation/authoring offer success tiers only for assignment.
So a relative check's non-keyword-named failure tier (e.g. "Botch") whose id a GM or import placed in a group's `checkOutcomeIds` never routes and never produces a success result.
- Resolution rules (applied per step/scope; "exactly one result group" is evaluated per step for multi-step recipes):
  1. Explicit tier assignment wins: when a **success** outcome resolves to a routed-check success outcome tier id, the result group listing that tier id in `checkOutcomeIds` is selected.
  2. If `outcome` is a reserved failure keyword (`fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`, `hazard`, `danger`, `complication`, `trap`, `oops`), execution takes the failure path.
  3. If the scope has exactly one result group, that single group is produced for any non-failure outcome (no mapping required).
  4. Otherwise, with multiple result groups, `outcome` must match exactly one `ResultGroup.name` under the same normalization.
  5. If multiple result groups are present and no result-group name matches, execution aborts with a crafting-system misconfiguration error (not a player failure outcome).
     For an instant (non-timed) step this is a zero-mutation abort: it happens BEFORE any consumption, so no ingredients, currency, or tools are consumed or broken, and the craft reports failure (never a player success with zero items).
     A resolved-but-unassigned outcome tier (`unrouted-tier`) is treated identically.
     Timed exception: a time-gated `routedByCheck` step consumes its inputs at START (the check outcome is unknowable until the gate matures), so a routing misconfiguration detected at FINISH cannot un-consume — it records a step FAILURE with no refund and still reports failure (never a false success with zero items), rather than a true zero-mutation abort.

### Validation

- At least one `IngredientSet`.
- At least one `ResultGroup`.
- **One result group → no mapping required:** a step with exactly one result group needs no outcome/tier mapping; it is produced on any non-failure outcome and yields nothing on a failure keyword.
Outcome/tier mapping is required only when a step has multiple result groups (each success outcome must route to a group), and the `recipe-visibility` readiness warnings (`unroutedResultGroup`, `unproducedOutcomeTier`) do not fire for single-result-group steps.
- Reference integrity (always applies): `ResultGroup.name` values must be unique under trim-normalized, case-insensitive comparison, and may not be any reserved failure keyword.
- A missing routed crafting check (`craftingCheck.routed.rollFormula` unauthored) is an **unconditional system-level blocker** (`routedCheckNoFormula`), independent of any recipe — every recipe in this mode routes by the check, so no craft can resolve without it (see `recipe-visibility`).
A `routedByCheck` recipe is otherwise structurally valid regardless of the check configuration; the formula requirement is a system-level concern, not a per-recipe validation error.

## Progressive Mode

### Semantics

- Exactly one ingredient set and one result group.
- The result order is meaningful.
- Result entries carry no quantity: awarding spends the budget against each entry once, so the same `Component` may appear multiple times and repetition is how a recipe or a salvage config asks for more of a result.
Each awarded entry grants a single item (any legacy authored quantity is normalized to 1).
This governs **every** progressive award surface, crafting and salvage alike — the rule follows from the award loop, which charges one entry's `difficulty` and awards that one entry, so honouring a count would grant N items for the price of one.
The normalization is enforced at award time on both paths (`ResolutionModeService._resolveProgressive` for recipes, `CraftingEngine._resolveSalvageResultGroups` for salvage), never by a migration: `quantity` remains a stored, normalizer-clamped field and is simply inert in this mode.
The salvage scope is stated explicitly because it was read as recipe-only once and the salvage path shipped honouring the authored count.
- Each result references a `Component` with `difficulty >= 1`.
This `difficulty` IS the component's **progressive DC** — the field the GM component editor labels verbatim "This component's Progressive DC" — and it is stable, per-component authored data.
It is distinct from the progressive **check**, which has **no DC** of its own: the check produces the numeric budget (`value`), and each stage spends that budget against its component's progressive DC.
Player-facing progressive surfaces therefore show both per stage — the component's progressive DC (`DC N`) and the cumulative budget that reaches the stage (`Reach ≥N`).
- Check is mandatory and returns numeric `value`.
- Awarding evaluates ordered results using `awardMode`.
- **All result groups whose difficulty threshold is met or exceeded are awarded, not just the highest matching group.
This is the key distinction from the routed modes, which select exactly one result group.**

### Award Modes

Let `remaining = check.value` and `cost = result.component.difficulty`.

- `equal`: award result when `remaining >= cost`; then `remaining -= cost`.
- `exceed`: award result when `remaining > cost`; then `remaining -= cost`.
- `partial`:
  - if `remaining >= cost`, award and decrement.
  - else if `remaining > 0`, award the current result (with only partial credit), set `remaining = 0`, stop.
  - else stop.

### Player Reorder

Progressive awarding spends the roll down an ordered list, so the order decides what the player actually receives.
Two distinct concepts govern it and MUST NOT be collapsed: the GM-authored **Result Order Permission** (on the aggregate, exported) and the per-user **Player Result Order** (runtime preference, never exported).

#### Result Order Permission (GM-authored)

- The permission lives on the entity whose results are being ordered, and nowhere else: `Recipe.allowPlayerResultReorder` for crafting, `Component.salvage.allowPlayerResultReorder` for salvage.
- Both default to `true`.
- An absent key reads as `true`, so no migration seeds the field; only an explicit `false` pins the authored order.
- The retired system-level `craftingCheck.progressive.allowPlayerReorder` is gone from all three progressive check blocks (crafting, salvage, gathering).
- Gathering has no reorder feature: it exposes no ordered result-stage surface, so the retired flag was removed without replacement.
- When the permission is `false` the authored order is authoritative and any stored player order is ignored.
- `Component.salvage.allowPlayerResultReorder` has its **first UI consumer**: the player Inventory tab's salvage panel (`ui-integration` §Player Salvage Surface).
It was previously modelled, normalized, GM-authorable, captured onto every salvage run, and read at award time — with no surface that let a player exercise it, so the permission a GM set had no observable effect.

#### Player Result Order (per-user runtime state)

- The order is stored as a list of **result ids**, not indices, so it survives a GM editing the recipe.
- Keys are namespaced by scope: `recipe:<recipeId>` and `salvage:<componentId>`.
- One key per recipe, not per step.
- The order is a **standing preference**: it applies to every craft of that recipe until the player changes it, and is NOT a per-attempt gesture.
- It is stored per-user **within a world**, not per-account globally: the same player in a second world starts from the authored order.

#### Reconciliation contract

Reconciling a stored order against the authored list MUST satisfy all of the following.

- The result count is preserved exactly: reconciliation never drops a result, because the award loop spends budget down the list and a dropped result silently denies the player an award they were entitled to.
- Ids in the stored order that match no authored result are skipped.
- Authored results the stored order does not name are **tail-appended in authored order**, so an unranked stage can never displace a ranked one: a GM adding a stage cannot silently demote a player's ranked stage, and the new stage is awarded only if budget remains.
- A result with **no id** is never reorderable and always retains its authored position (it matches nothing and tail-appends).
- **Duplicate ids: first match wins.** The second copy tail-appends rather than vanishing or doubling.
- An absent or empty stored order yields the authored list unchanged.

#### Cross-step id uniqueness (assumption)

- One flat id list reconciles every step of a multi-step progressive recipe.
- This is correct only while result ids are **unique across a recipe's steps**, which nothing enforces — copy-mode import preserves result ids by design.
- A result id colliding across two steps therefore ranks independently in each.
- This is a recorded assumption, not a guarantee.

#### Which user's order is read

- **Crafting reads the order live, at resolve time, and it is the EXECUTING user's** — not the actor owner's.
A GM invoking `craft` through the API resolves down the *GM's* order.
This is deliberate: the recipe path resolves on the acting client.
- **Salvage reads the order captured on its run record at start**, never from settings.
- This asymmetry is deliberate and load-bearing, not drift.
A world-time-resumed salvage is driven by the synced `updateWorldTime` hook, which fires on every client with no ownership filter, so whichever client wins the race executes the resume.
Capturing the order at start makes the executing user irrelevant, which makes that class of defect structurally unreachable on the salvage path rather than merely documented.
- A salvage with **no run record uses the authored order**, and there is deliberately **no settings fallback**; adding one would reintroduce the executing-user read the capture exists to prevent.
- Salvage gates on the permission at **read time, not capture time**, so a GM toggling the permission off mid-run takes effect on that run's award.
The captured order is retained but ignored.
- The player-facing salvage surface writes only the **standing preference** under `salvage:<componentId>` and relies on the existing run-record capture; it MUST NOT thread an order into the salvage call.
The "no settings fallback" rule above is unaffected by that surface existing and MUST NOT be relaxed.
- A pending debounced order write MUST be **flushed before a salvage run starts**: the capture happens once, at start, so a run begun inside the debounce window captures the **stale** order.

### Validation

- Exactly one `IngredientSet`.
- Exactly one `ResultGroup`.
- The result group contains ordered results.
- Every referenced `Component` has `difficulty >= 1`.
- `CraftingSystem.craftingCheck.progressive.rollFormula` must be authored: the progressive check is required, and the engine rolls that formula to produce the numeric `value` the awarding spends against result difficulties.
- With no authored progressive roll formula the attempt fails loudly (the required-check guard aborts with zero mutation); this surfaces as a system-level blocker, not a per-recipe validation error.

## Alchemy Mode

### Semantics

- Player submits ingredient combinations directly instead of selecting a visible recipe.
- Recipe visibility is **reveal-not-gate** (see `recipe-visibility/spec.md`): the system's `visibilityMode` selects which source REVEALS a recipe in a non-GM's Known list (`item` = a held book/scroll, `knowledge` = learned, Manual/`restricted` = a per-recipe access grant, `global` = brew-discovery), with brew-discovery unioned across all modes; brewing is NEVER gated by visibility (a matched ingredient signature is the sole brew gate, so a non-GM alchemy recipe is always `craftable`). `learnOnCraft` governs only whether a matched brew records the brew-discovery reveal, never craftability.
- An alchemy recipe always has EXACTLY ONE ingredient set and is never routed by ingredients.
- Result-group selection and check-ness are driven by the SYSTEM-level `alchemy.checkMode` (`none` | `simple` | `tiered`), NOT a per-recipe `resultSelection.provider` (retired, issue 554; this supersedes the earlier "alchemy check optional" behaviour):
  - **None** — one ingredient set + one result group, no check; a matched brew always succeeds and produces that group.
  - **Simple** — the mandatory shared `craftingCheck.simple` pass/fail check (cannot be disabled).
Pass → the success result group; fail → the reserved `role: 'failure'` result group (produced only when non-empty; a matched fail is a genuine outcome, not a fizzle).
The failure group's absence is tolerated (a settings-only None→Simple flip runs no recipe migration).
This reserved failure-group mechanism is **shared** with plain `simple` resolution mode (see §Simple Mode), which mirrors the same none/simple path; `role: 'failure'` is not alchemy-only.
  - **Tiered** — behaves EXACTLY like `routedByCheck`: the mandatory `craftingCheck.routed` check (cannot be disabled) routes each success outcome to its assigned `ResultGroup` via `checkOutcomeIds`; a failed routed check fizzles before result creation.
Tiered has NO `role: 'failure'` group.
- Multi-step recipes are not supported.
- `consumeOnFail` defaults to true; a matched Simple fail consumes via `alchemy.consumeOnFail`, consistent with a no-match fizzle (NOT the crafting-check consumption policy).

### Signature Resolution

- Matching is based on satisfiable signatures from the single ingredient set's groups/options (the multi-group loop degenerates to one set).
- A submitted item's component identity is resolved **exactly once**, scoped by the crafting system's id (`systemId`), durable-flag-first, through the shared list-aware Component Item Matching resolver defined in the `data-models` spec.
Every SIGNATURE/BUCKETING surface that attributes a submitted item to a component — the workbench owned-components palette, the submission collector, signature matching, and the fizzle dead-end multiset — MUST **consume that single attribution**; none may independently re-derive a submission's component from raw source references after it has been bucketed.
The downstream CRAFTABILITY surfaces (the craftability ingredient and essence checks, ingredient selection for consumption, and the essence context built for result effect transfer and property macros) re-derive a submission's component from raw items, but MUST do so through the IDENTICAL tier-4-aware resolver the bucketing surfaces used, so they land on the same component by construction — this is consistent with, not in conflict with, the consume-once rule above (which governs only the bucketing surfaces).
This preserves the existing exclusivity rule (a `roles[systemId].componentId = B` item carrying `_stats.duplicateSource = A.uuid` resolves to B, never A) and the raw source-reference fall-through (load-bearing for unstamped items, MUST NOT be weakened).
- A submitted item is attributed to exactly one component: when its `roles[systemId].componentId` (or the legacy scalar `componentId`) names a component in the system, it resolves exclusively to that component even if it carries a transitive `_stats.duplicateSource` pointing at a different component's source; when no claimed id names a known component, it resolves by the resolver's raw source-reference fall-through.
- A single submission contributes at most one unit to a group even when it matches two or more of that group's components.
- The raw source-reference fall-through remains load-bearing for unstamped (pre-durable-identity) items and MUST NOT be weakened.
- Alchemy craftability and essence attribution MUST resolve a submitted item to the same component the submission collector bucketed it to, including a submission resolvable solely by the bare top-level `registeredItemUuid` tier.
This parity spans the entire alchemy craft path — signature matching, the craftability ingredient and essence checks, ingredient selection for consumption, the essence context built for result effect transfer and property macros, and the timed (time-gated) START/FINISH twin — so a purely-tier-4 submission that matches a signature also passes craftability, is consumed, and contributes its component's essences to both success and reserved-failure crafted results.
An item's own `flags.fabricate.essences` still take precedence over any component-defined essences.
This alchemy-scoped resolution MUST NOT be pushed into the shared `findMatchingComponent`, `resolveComponentForItem`, or `getItemSourceReferences`; gathering, inventory, and standard crafting keep the narrower ladder unchanged, so the same tier-4-only item remains unrecognized in a standard (non-alchemy) craft.
- A group is satisfied only when one of its options has its required `Ingredient.quantity` met by the available submitted quantity matching that option's components; submitting fewer than the required quantity does NOT satisfy the group and yields a no-signature-match failure.
- Submitted quantity is counted per submission (one submission = one unit), not by reading an item's stack `system.quantity`; the workbench is responsible for expanding a stack into one submission per unit, consistent with occurrence-based essence accumulation and submitted-ingredient consumption.
- The runtime matcher resolves a submission to the **most-specific matching set**, not the first authored match.
It collects EVERY enabled set whose every group is satisfied by the submission (superset-tolerant, `>= required`, extras consumed as essence contributors) and picks the unique maximum under a specificity partial order: set A is MORE SPECIFIC than B when a natural transversal of A also satisfies every group of B (A's required-group structure is a proper superset of B's — required-group containment, NOT units consumed) while no transversal of B satisfies A.
When no unique maximum exists — two incomparable co-matching sets (e.g. an over-submission satisfying both siblings `{S,V,E}` and `{S,V,R}`) — the runtime FAILS SAFE to a no-signature-match fizzle; it MUST NOT pick one by iteration order.
This is the runtime counterpart of the enable-time guard below and consumes the SAME domination predicate, so the two can never disagree about which set is more specific.
- Signature INSEPARABILITY is invalid across all recipes in the system.
Two ingredient sets are inseparable only when they are ambiguous in a way no added or different ingredient can ever resolve: a plausible submission of EACH set also satisfies the OTHER — the **symmetric** transversal condition.
A pair conflicts iff some **transversal** of one set — the natural "the ingredients each requirement calls for" craft, choosing one satisfying option per group and supplying exactly its required quantity of units — satisfies every group of the other set AND vice versa (BOTH directions).
The transversal is quantity-aware: a `quantity: N` option can supply up to `N` DISTINCT components.
Symmetric-transversal inseparability covers exactly: identical signatures; two single-group sets sharing a component that satisfies both (e.g. a `mithril` tagged both `rare` and `metal` for `{rare}` vs `{metal}`); and an OR-option set that fully shadows a narrower one.
A strict subset/superset pair (e.g. `{Water}` vs `{Water},{Herb}`, or a `{metal x2}` group vs its distinct `{iron},{gold}` components) is ONE-directional and is now ALLOWED — the runtime's most-specific pick brews the superset when the extra ingredient is present and the base when it is not.
Incomparable siblings (`{S,V,E}` vs `{S,V,R}`) satisfy neither direction and are ALLOWED; an ambiguous over-submission of both fizzles safely rather than brewing the wrong one.
Merely sharing a common base component (water, reagent, flask) is NOT inseparability when the sets are otherwise distinguishable (e.g. `{Water},{Herb}` vs `{Water},{Mineral}`).
- No-signature-match (a fizzle) is treated as a failed attempt: the player sees a specific failure message and the submitted ingredients are consumed (per `alchemy.consumeOnFail`).
Learning is never granted by a fizzle.
- The matched-but-unroutable **misconfiguration** path applies to **Tiered only** (None/Simple do not route by name): the craft aborts with ZERO mutation BEFORE any consumption (no ingredients, currency, or tools consumed or broken), reports failure (never a player success with zero items), and returns actionable GM diagnostics.
The reserved-keyword "nothing" rule must not collide with Simple's producing failure group.

### Alchemy UI Interaction Model

#### Component Palette

- Grid of all components in selected alchemy system owned by component source actor(s).
- Shows: image, name, available quantity (inventory minus workbench count).
- Zero-quantity components remain visible but visually distinguished.
- Left-click: add one to workbench (decrement palette quantity).
- Right-click: remove one from workbench (increment palette quantity), only if component is in workbench.
- Drag-drop from external sources remains supported.

#### The Workbench

- Session-scoped working set displayed as compact grid with quantity badges (e.g., "Iron Ore x3").
- Each unique component appears once; adding increments the badge count.
- Supports: add from palette, remove (right-click or direct action), clear all, submit.
- Submit triggers signature matching per existing Signature Resolution rules.
- On submit, a quantity badge of N contributes N unit submissions (one per unit), so occurrence-based signature matching and consumption observe the displayed quantity.

#### Workbench Status Model (five modes)

- The bench drives a five-mode status model that governs the status pill, the Produces panel, and the Brew affordance: `empty`; `assembling` (the bench is a strict subset of a selected known recipe's signature); `ready` (the bench matches a known signature — superset-tolerant and resolved to the same MOST-SPECIFIC pick as the engine, so a bench that CONTAINS one known concrete while being a superset of another does not read a false `ready` for the smaller, and a non-unique maximum reads no confident `ready`); `untried` (the bench matches no known recipe AND is not a remembered fizzle); `no-reaction` (the bench matches no known recipe AND IS a remembered fizzle).
- The projected revealed-recipe **signature summary** must be rich enough to display alternatives, per-option quantities, and set-level essence requirements (an alchemy recipe now carries exactly one ingredient set, so multi-set richness no longer applies — issue 554).
- **Client mode is advisory; the engine is authoritative on brew.** The client resolves TWO signature shapes: a concrete plain-component multiset AND an essence-only requirement (via a projected `essenceRequirement`, using `>=` matching that mirrors the engine's `_matchAlchemySignature`).
It fails safe to `untried` for everything else — alternatives (multi-option groups), tag-based requirements, and mixed group+essence sets (`AlchemyListingBuilder._essenceRequirement` deliberately returns null for those) — and NEVER emits a false `ready`/`assembling`.
- **Brew-result banner status enum.** A resolved brew reports one of four banner states, styled distinctly: `success` (a passed brew produced its success result set); `tiered-tier` (a passed Tiered brew produced its outcome-tier result set); `produced-on-failure` (a matched Simple brew FAILED its check and produced the reserved failure result set — styled with the warning tone, NEVER success-green, and composing with a discovery); `no-match-fizzle` (no reaction, a Tiered fail, or a misconfiguration).
A `simple`/`tiered` learned recipe carries a "check gates this outcome" hint; the reserved failure-group result is NEVER surfaced to the player Produces panel (leak invariant).
The same caveat applies to select-to-load auto-fill.
- **Hidden dead-end rule.** Non-revealed recipes and never-tried dead-ends BOTH present as `untried`.
The player projection exposes only revealed recipes plus the **count** of non-revealed recipes; no status text, Produces panel, or styling leaks the existence, result, or signature of a non-revealed recipe.
- **Per-character x system tried-dead-end memory.** `Actor.flags.fabricate.alchemyDeadEnds` is an append-only, deduped array of canonical `componentId:qty|...` keys per system, written on a fizzled brew only when `alchemy.showAttemptHistoryToPlayers === true`.
It is the ONLY thing that flips `untried` -> `no-reaction`; it grants no visibility (a fizzle matches no enabled recipe) and is consumed solely by the client status model.

#### Alchemy System Selection

- Required when multiple alchemy-mode (crafting) systems exist: a chooser presents one card per system (icon, name, `N known . M total`, blurb, Enter).
- A "Switch" affordance returns to the chooser and resets the per-selection workbench state (bench, selection, last-brew, search); it is shown only when more than one alchemy system exists.
- Selector shows only `resolutionMode === "alchemy"` systems and determines which components appear in the palette.
- Auto-enters when exactly one alchemy system exists.
- Persisted in the `fabricate.lastAlchemySystem` client setting (like `lastCraftingActor` and `lastComponentSources`).
Canonical text uses "alchemy (crafting) system"; "discipline" is reserved for player-facing copy only.

#### Discovered Recipes Panel

- Panel is always visible, even when no recipes have been revealed yet.
- Shows an encouraging empty state message (e.g., "No recipes revealed yet — learn or brew recipes to reveal them here").
- Once recipes are revealed, the empty state is replaced by the searchable list.
- Selecting a known recipe **auto-loads** its signature onto the bench (auto-fill is a selection side effect, not a separate per-recipe button), scoped to recipes reducible to a concrete plain-component multiset.
- The "Craftable only" filter is DEFERRED this iteration.

#### Tab Feature Scope

- Includes: component inventory, workbench, and the known-recipes list.
- Recorded run/attempt **history stays a Journal concern** — the tab has NO history panel and NO active-runs surface.
Its only local memory is the internal fizzle dead-end set (which is not run history).
- Excludes: shopping list, recipe browsing, favourites.
- This is a deliberate narrowing from the earlier "active runs, history" scope.

### Validation

- `features.multiStepRecipes` must be false; an alchemy recipe must have no explicit steps.
- Exactly one `IngredientSet` (alchemy is never routed by ingredients).
- Result-group cardinality is per `alchemy.checkMode`:
  - **None / Simple** — exactly one SUCCESS group (`role !== 'failure'`).
Simple additionally tolerates the reserved `role: 'failure'` group, whose ABSENCE is permitted (a settings-only None→Simple flip runs no recipe migration).
  - **Tiered** — at least one result group; reserved/duplicate `ResultGroup.name` integrity is enforced at the service level (`ResolutionModeService._validateRoutedGroupNames`, Tiered only), exactly like `routedByCheck`.
- A Simple- or Tiered-check-mode system requires an authored crafting-check roll formula (`craftingCheck.simple` for Simple, `craftingCheck.routed` for Tiered): a missing formula is an unconditional system-level blocker (`alchemyCheckNoFormula`) surfaced by `systemValidation`, not a per-recipe error.
The retired provider required/enum rules no longer apply (issue 554).
- All recipes must satisfy alchemy-wide signature separability invariants; a signature collision — now narrowed to an INSEPARABLE (symmetric-transversal) pair, no longer a mere subset/superset — blocks save/import operations system-wide until resolved.

## Testing Requirements

- Unit tests per mode for cardinality and routing validation.
- Unit tests for mode-specific routed behavior (`routedByIngredients`, `routedByCheck`) and the alchemy check-mode matrix (`none`, `simple` pass/fail incl. the reserved failure-group path, `tiered`).
- Unit tests for reserved failure keyword handling and result-group name matching normalization.
- Unit tests for progressive award modes (`partial`, `equal`, `exceed`).
- Integration tests validating mode-specific behavior in full crafting flow.
- Integration tests for alchemy no-signature failure behavior (failure message + ingredient consumption).
- Integration tests for alchemy routing-mismatch misconfiguration behavior (error + no player-failure consumption).
- Integration tests for alchemy uniqueness blocking semantics in save/import workflows.
- A regression test asserts durable-flag-first, exclusive, bucket-once attribution by driving the **real end-to-end path** — the owned-components palette (`AlchemyListingBuilder`) → `submitAlchemyAttempt` → the collector (`resolveAlchemySubmissions`) → `craftAlchemy` (`_matchAlchemySignature` / dead-end multiset), NOT hand-built submissions or a hand-supplied `systemId`.
It asserts the palette's attribution, the collector's attribution, and the signature matcher all **agree** on component B (and the item is brewable, not dropped as `No ingredients`) for an item stamped `roles[systemId].componentId = B` carrying `_stats.duplicateSource = A.uuid` with no legacy scalar (A a distinct component in the recipe's set whose source ref genuinely overlaps the item's raw refs).
It MUST be RED against any systemId-blind or second-bucketing implementation and green after.
- A regression test asserts one-unit-per-group counting: a single submission that matches two or more of a group's components contributes exactly one unit to that group, not one per matched component.

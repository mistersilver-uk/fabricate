# Specification 004: Resolution Modes

## Purpose

Define semantics and validation rules for crafting-system resolution modes.
A crafting system has exactly one mode, and every recipe/step in that system must conform to it.

## Mode Invariant

- `CraftingSystem.resolutionMode` is system-wide.
- Recipes cannot mix resolution modes inside one crafting system.
- Mode changes are **migration-first** and governed by
  `007-destructive-changes-and-migrations.md`:
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
- Mode *cardinality* checks (e.g. "must have exactly/at least N ingredient set/result group", progressive "requires ordered results") are *completeness* and are waived under structural-only validation (`ResolutionModeService.validateRecipe(recipe, { requireComplete: false })`, used when persisting an authoring incomplete shell); mode *reference-integrity* checks always apply, per mode: `routedByIngredients` checks the invalid `resultGroupId` integrity, and `routedByCheck` checks the reserved/duplicate `ResultGroup.name`. (The routed modes carry no `resultSelection.provider`, so there is no provider value to validate.) (Legacy `mapped`/`tiered` are not live modes; they are accepted only as one-time migration inputs per `007-destructive-changes-and-migrations.md §Resolution-Model Migration`, which hard-migrates `mapped → routedByIngredients` and `tiered → routedByCheck`.)

## Mode Matrix

| Mode                  | Ingredient Sets | Result Groups               | Check Requirement  | Routing Basis                       |
|-----------------------|-----------------|-----------------------------|--------------------|-------------------------------------|
| `simple`              | exactly 1       | exactly 1                   | optional           | single result group                 |
| `routedByIngredients` | one or more     | one or more                 | optional           | `IngredientSet.resultGroupId`       |
| `routedByCheck`       | one or more     | one or more                 | required           | system routed-check outcome         |
| `progressive`         | exactly 1       | exactly 1 (ordered results) | required           | numeric value spending              |
| `alchemy`             | exactly 1       | per `checkMode` (see below) | none / required-when-simple / required-when-tiered | system `alchemy.checkMode`          |

## Player-Facing Mode Labels

The `resolutionMode` token is system-internal and must never surface raw in player UI.
The player-facing Journal screen (see `003-ui-integration.md` *Journal App*) maps each mode to a localized display label through a frozen label-key map (`RunJournalBuilder.MODE_LABEL_KEYS`), resolved against the `FABRICATE.App.Journal.Mode.*` localization keys.

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

- One ingredient set and one result group.
- Optional pass/fail crafting check.
- On success, produce the single result group.

### Validation

- Exactly one `IngredientSet`.
- Exactly one `ResultGroup`.
- The crafting check is optional: it runs only when `craftingCheck.simple.rollFormula` is authored (the engine rolls the formula and resolves pass/fail against the DC).
With no authored formula the attempt proceeds with no check; there is no macro-return contract.

## Routed by Ingredients Mode (`routedByIngredients`)

### Semantics

- Multiple ingredient sets and result groups are allowed.
- The routing basis is a property of the **mode** (not a per-recipe provider): routing uses `IngredientSet.resultGroupId`.
The mode carries no `resultSelection`.
- **Single-selection semantics: exactly one result group is selected per craft attempt, determined by the chosen ingredient set.
No other result groups are awarded.**
- The crafting check is the SAME optional pass/fail check as `simple`/`alchemy` mode, stored in the shared **`craftingCheck.simple`** slot (which backs `simple`, `alchemy`, and `routedByIngredients` — it is not a simple-mode-only slot).
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
- This mode never raises `routedCheckNoFormula`: a missing `craftingCheck.simple.rollFormula` simply means no check runs (its readiness is identical to its equally-optional `simple`/`alchemy` peers).

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
It is enforced in the shared routed-check runner (`runFormulaRouted`) through an optional minimum-tier parameter that is no-op by default, so salvage and gathering routed checks are unaffected — only the crafting `routedByCheck` caller threads the recipe's minimum.
- **Single-result-group exemption (mirrors `routedByIngredients`):** when a step (or an implicit recipe) has exactly one result group, no outcome/tier mapping is required.
A non-failure outcome produces that single group (`disposition: success`); a failure/miss keyword produces nothing (failure path).
Resolution never aborts with a misconfiguration for an unmatched success outcome when there is exactly one result group.
- Resolution rules (applied per step/scope; "exactly one result group" is evaluated per step for multi-step recipes):
  1. Explicit tier assignment wins: when the outcome resolves to a routed-check outcome tier id, the result group listing that tier id in `checkOutcomeIds` is selected.
  2. If `outcome` is a reserved failure keyword (`fail`, `failed`, `failure`, `f`, `miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`, `hazard`, `danger`, `complication`, `trap`, `oops`), execution takes the failure path.
  3. If the scope has exactly one result group, that single group is produced for any non-failure outcome (no mapping required).
  4. Otherwise, with multiple result groups, `outcome` must match exactly one `ResultGroup.name` under the same normalization.
  5. If multiple result groups are present and no result-group name matches, execution aborts with a crafting-system misconfiguration error (not a player failure outcome).
     The abort is a zero-mutation abort: it happens BEFORE any consumption, so no ingredients, currency, or tools are consumed or broken, and the craft reports failure (never a player success with zero items).
     A resolved-but-unassigned outcome tier (`unrouted-tier`) is treated identically.

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
- Result entries carry no quantity: awarding spends the budget against each entry once, so the same `Component` may appear multiple times and repetition is how a recipe asks for more of a result.
Each awarded entry grants a single item (any legacy authored quantity is normalized to 1).
- Each result references a `Component` with `difficulty >= 1`.
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

- If `allowPlayerReorder` is false, recipe-defined order is authoritative.
- If true, player may reorder before execution; the reordered list is used for award evaluation.

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
- Recipe visibility is **reveal-not-gate** (see `006`): the system's `visibilityMode` selects which source REVEALS a recipe in a non-GM's Known list (`item` = a held book/scroll, `knowledge` = learned, Manual/`restricted` = a per-recipe access grant, `global` = brew-discovery), with brew-discovery unioned across all modes; brewing is NEVER gated by visibility (a matched ingredient signature is the sole brew gate, so a non-GM alchemy recipe is always `craftable`). `learnOnCraft` governs only whether a matched brew records the brew-discovery reveal, never craftability.
- An alchemy recipe always has EXACTLY ONE ingredient set and is never routed by ingredients.
- Result-group selection and check-ness are driven by the SYSTEM-level `alchemy.checkMode` (`none` | `simple` | `tiered`), NOT a per-recipe `resultSelection.provider` (retired, issue 554; this supersedes the earlier "alchemy check optional" behaviour):
  - **None** — one ingredient set + one result group, no check; a matched brew always succeeds and produces that group.
  - **Simple** — the mandatory shared `craftingCheck.simple` pass/fail check (cannot be disabled).
Pass → the success result group; fail → the reserved `role: 'failure'` result group (produced only when non-empty; a matched fail is a genuine outcome, not a fizzle).
The failure group's absence is tolerated (a settings-only None→Simple flip runs no recipe migration).
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
- Signature overlap is invalid across all recipes in the system.
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

- The bench drives a five-mode status model that governs the status pill, the Produces panel, and the Brew affordance: `empty`; `assembling` (the bench is a strict subset of a selected known recipe's signature); `ready` (the bench equals a known signature); `untried` (the bench matches no known recipe AND is not a remembered fizzle); `no-reaction` (the bench matches no known recipe AND IS a remembered fizzle).
- The projected revealed-recipe **signature summary** must be rich enough to display alternatives, per-option quantities, and set-level essence requirements (an alchemy recipe now carries exactly one ingredient set, so multi-set richness no longer applies — issue 554).
- **Client mode is advisory; the engine is authoritative on brew.** The client fails safe to `untried` for any signature not reducible to a concrete plain-component multiset (single-option groups, no essence-only requirement; the single-ingredient-set condition is now guaranteed by the mode invariant) and NEVER emits a false `ready`/`assembling`.
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
- Excludes: shopping list, recipe browsing, recents, favourites.
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
- All recipes must satisfy alchemy-wide signature uniqueness invariants; any signature collision blocks save/import operations system-wide until resolved.

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

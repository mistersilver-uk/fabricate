# Acquisition, Knowledge, and Resolution Terms

## Gathering

Every gathering attempt happens within exactly one environment.

Canonical mapping: `features.gathering`, `GatheringEnvironment`, `GatheringTask`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-gathering-app/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Harvesting

Canonical mapping: Boundary rule only; no standalone aggregate

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Salvage

Salvage is a **GM feature toggle that defaults ON**, not an always-present capability: `_normalizeFeatures` reads `salvage: has('salvage') ? features.salvage === true : true`, so an **absent** key defaults to `true` (backward compatibility — existing systems persisted `salvage: true`) but an **explicit `false` is honoured**, and the toggle is authored in the GM Features list (`SystemEditView.svelte`, `FABRICATE.Admin.Manager.Feature.Salvage`).
Salvageability is therefore gated **twice**: the system-level `features.salvage`, then per-component `salvage.enabled`.
When the feature is off the salvage subsystem — Checks tab, resolution-mode card, component editor, validation, and runtime — is hidden/skipped, while authored component salvage config is **preserved** (`_normalizeComponent`), which is what makes the toggle reversible.
Because an explicit `false` is honoured, `updateSystem`'s feature-disable branch (`oldSalvageEnabled && !newSalvageEnabled` → `_cleanupSalvageRunsForSystem`) is **live, reachable code** — do not read it as dead.
Its resolution surface is the GM-configurable `salvageResolutionMode` (valid set `simple | routed | progressive`, default `simple`; canonical token `routed`, display name "Routed by check").
`simple` awards **exactly one success result group** at `resultGroups[0]` under an optional pass/fail salvage check — on SUCCESS the engine (`CraftingEngine._resolveSalvageResultGroups`, under its default `disposition: 'success'`) awards `allGroups.slice(0, 1)` with **no role filter**.
**The claim that salvage never awards or routes to a `role: 'failure'` group is RETRACTED (issue 1098), and the reserved group is now a LIVE capability** governed by **Failure Result Policy**: it is still tolerated at index 1 only when `salvageCraftingCheck.simple.rollFormula` is authored, but when the policy permits results on failure the failure branch resolves it through `_resolveSalvageResultGroups(…, 'failure')`, which selects it **BY ROLE and never by index** — the retain-one clamp guarantees index 0 is the SUCCESS group, so an index-based failure selection would award the full success salvage output on a failed check — and the award is reported on the run record, the chat card and the returned `results` alike.
The `1.25.0` migration seeds `never` onto every existing system, so a world that authored such a group before this release goes on awarding nothing until the GM opts in (issue 764 for the clamp; issue 1098 for the capability).
The invariant — one success group at index 0, at most one reserved failure group — is enforced for **every** writer by `_normalizeSalvage`'s **success-first retain-one clamp** (a failure-first `[failure, success]` input from import/copy/migration is re-ordered so the success group lands at index 0; a failure-only config has no success group and clamps `enabled` to `false`), NOT by any UI control; the Simple editor caps authoring at one success group as UX only.
Because salvage has exactly one ingredient, ingredient-set routing is meaningless, so the GM card offers `simple`, `progressive`, and `routed` but never `alchemy`.
The persisted mode is the selected radio, defaulting to `simple` when `simple`/absent; changing the mode is non-destructive for recipes and runs (it deletes none and reversibly disables salvage on incompatible components), but switching **into** `simple` drops a component's surplus result groups via the clamp and emits a naming `ui.notifications.warn` disclosing the drop.

Canonical mapping: `Component.salvage`, `salvageResolutionMode`, `salvageCraftingCheck`, `adminStore.setSalvageResolutionMode`, `CraftingSystemManager._disableInvalidSalvageConfigs`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/ui-integration/spec.md

## Bulk Salvage

It **executes immediately and stages nothing** — no draft to assemble, no Apply step, and no way to inspect the change before it lands beyond the pre-commit preview.
That is what separates it from the GM **authoring** operations **Component Bulk Edit** and **Recipe Bulk Edit**, which stage a draft and then apply it in one write; the shared word "bulk" names the multi-select gesture, not a shared mechanism.
**Bulk** is the one noun in code and machine ids (`BULK_MAX_ITEMS`, `skipReason: 'bulkLimit'`); "batch" is prose only.
The selection is bounded at **25 at SELECTION level**, so **Bulk Destroy** inherits the same bound rather than leaving the destructive path unbounded; execution is strictly sequential (tool breakage, shared stack depletion and read-modify-write run records all require it); and the outcome vocabulary is `succeeded | failed | waiting | misconfigured | skipped | notPermitted | cancelled | error`, rolled up on the card as `succeeded | mixed | failed` — `mixed`, because `partial` already names a progressive award mode.
The GM bulk-edit **selection model and panel chrome are deliberately NOT reused**: `bulkSelectionModel.js`, `BulkSelectionToolbar` and `BulkEditPanelShell` are manager-scoped, and `SelectionCheckbox` — which is area-agnostic and would render correctly here — is left unused because the design rules out a toolbar and checkboxes in favour of shift-click alone.
The player panel adopts the inventory inspector's own shell instead.

Canonical mapping: `Fabricate#salvageComponents`; `src/systems/BulkSalvageService.js` (`BULK_MAX_ITEMS`, `classifySalvageOutcome`, `BULK_SALVAGE_SKIP_REASONS`); `src/ui/presenters/BulkSalvageChatCard.js`; `bulkSelectedKeys`/`toggleBulkSelection`/`bulkEntries` in `inventoryStore.svelte.js`; `src/ui/svelte/apps/inventory/bulk/**`

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/data-models/spec.md

## Bulk Destroy

**Destroy carries ONE meaning across all three of its trigger contexts** — a Tool's `onBreak: 'destroy'`, a Recipe Item "destroyed when spent", and this player action: _the document is removed permanently and nothing replaces it_. **"Scrap" is reserved as a salvage RESULT-GROUP name** — what a salvage GIVES you, which is how Fabricate's own authored content uses it — and **must never name a destructive action**; the collision is recorded here so it is not re-derived from an issue that will be closed.
Bulk Destroy is deliberately **not** gated on `features.salvage` or `Component.salvage.enabled`, because a player can already delete their own owned Items from the Foundry sheet, so it adds ergonomics rather than capability and a blocked-for-salvage row is often exactly the row a player wants gone.
It posts **no chat card** (a result card reports what an activity produced, and this produces nothing), deletes whole stacks because the gesture carries no quantity control and `salvage.ingredientQuantity` has no destroy analogue, resolves documents through the **same matcher salvage uses**, and reports the units the delete actually **returned** — so a `preDeleteItem` veto is reported to the player rather than counted as destroyed, and a stale id is reported as its own distinct story.
Its confirmation names **both** the row count and the unit count and executes against the snapshot it named.

Canonical mapping: `Fabricate#destroyComponents`; `src/systems/BulkDestroyService.js` (`BULK_DESTROY_SKIP_REASONS`); `CraftingEngine.findComponentItems`; `readStackQuantity`; `Tool.onBreak: 'destroy'`; `RecipeItemDefinition` destroyed-when-spent

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/data-models/spec.md

## Ingredient Set

Its `toolIds` are active only when the set has a non-blank authored name and its Crafting System uses `routedByIngredients`; elsewhere those ids round-trip but remain runtime-inert.

Canonical mapping: `IngredientSet`, `ingredientSetToolsAreActive`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Ingredient Group

All groups in an ingredient set must be satisfied.

Canonical mapping: `IngredientGroup`

Spec reference: openspec/specs/data-models/spec.md

## Choice Group

A result-side choice group is something an existing result row BECAME, through the convert control that row carries; there is no adder that creates an empty one.

Canonical mapping: `IngredientGroup`, `Result.alternatives`

Spec reference: openspec/specs/design-system/spec.md, openspec/specs/data-models/spec.md

## Award Strategy

Where the ROLL is the **Chooser**, `up to N` additionally states whether repeats are allowed — unique awards, or the same alternative more than once, which makes N exact.
A repeated draw is NOT a third strategy: it is `up to N` under a roll with repeats allowed, and modelling it separately would be two ways to author one behaviour.
It is called a STRATEGY and never an award mode, because `awardMode` already names the progressive `equal` / `partial` / `exceed` policy deciding how a check-value budget is spent across an ordered result list — a different closed set, over a different object, at a different level.
A reader who conflates the two reaches for the wrong three values.

Canonical mapping: `Result.awardStrategy`, `Result.awardCount`, `Result.withReplacement`

Spec reference: openspec/specs/design-system/spec.md, openspec/specs/data-models/spec.md

## Chooser

It is deliberately NOT `playerPicks`, and the two are never unified: `playerPicks` is one of four values of a crafting check’s `defaultModifierPolicy`, deciding who selects a check MODIFIER at roll time, while the chooser is two-valued, belongs to one choice group, and decides which REWARD is handed over.
The same question, asked of different objects.
No **Award Strategy** pins the chooser: a repeated draw is not a strategy of its own but `up to N` under a roll with repeats allowed, so either chooser is authorable under either strategy.
The dependence runs ONE way only — repeats are a setting of the single cell where `up to N` meets the roll, and allowing them makes N exact rather than a ceiling — so the chooser constrains the count while no strategy ever constrains the chooser.
Beware the overload: the design library's `RequirementChooser` entry and a requirement slot's open chooser are the PLAYER-side rail and its disclosure, never this field, which the GM authors on a result-side group alone.

Canonical mapping: `Result.chooser`, `Result.selectionFormula`, `Result.selectionRange`

Spec reference: openspec/specs/design-system/spec.md, openspec/specs/resolution-modes/spec.md

## Rolled Amount

Presence of `quantityFormula` IS the mode: absent or empty leaves the amount fixed at `quantity`, which stays the AUTHORED amount, is never omitted from disk, and is what a cleared formula returns to.
The RESOLVED amount is a different value from the authored one and only it may be zero — an **empty award**, which creates no item, is still stated on the chat card with the roll that produced nothing, and writes no award receipt, because there was no Item write to acknowledge.
Validation is rollability and never parsability: `Roll.validate` passes expressions that cannot evaluate, so the floor is a maximised evaluation of the formula AS AUTHORED, applied by the authoring surface and by the gathering data boundary alike.
Result-only — a requirement amount and a gathering drop row's quantity are always fixed, and a progressive or salvage-progressive award strips the formula and awards 1.

Canonical mapping: `Result.quantityFormula`, `Result.quantity`, `quantityFormulaErrors` (`src/models/Result.js`); `resolveRolledAmount` (`src/systems/rolledAmountResolver.js`); `maximisedTotal` (`src/utils/rollFormulaRollability.js`)

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-crafting-app/spec.md, openspec/specs/ui-entity-editors/spec.md, openspec/specs/design-system/spec.md

## Contention Component

Groups in different components cannot alter each other's available quantities, so each component is resolved on its own and a component of one group that does not carry the block is answered by that group's FIRST choice without entering the search at all.
It is an implementation freedom and never an outcome change: the selection MUST stay byte-identical to the unscoped search wherever that already succeeded, for every observable field.
Beware the overload — "component" here is graph connectivity and NEVER the managed **Component** aggregate, which is what `component/tag group` means inside the same docblock; always write the phrase in full.

Canonical mapping: module-private `contentionComponents`, `resolveContentionComponent` and `unionFind` (`src/models/ingredientAssignment.js`)

Spec reference: openspec/specs/recipes-and-steps/spec.md

## Ingredient Assignment Cost (`searchStats`)

The distinction it exists to draw is between bounding NODES and bounding WORK: the 200,000-node safeguard bounds the search TREE, and before issue 1083 every node copied and restored the whole shared no-double-count ledger, so per-node cost was proportional to held inventory and a bound stated in nodes said nothing about elapsed time — which is what made "adversarial fixtures stay within the safety cap" an unfalsifiable claim.
The canonical rule is therefore that per-node cost MUST NOT grow with held-stack count, and that any index derived to achieve it is per resolve pass and NEVER retained across calls (nothing mints a revision token when an actor's items change, so a retained index would describe stacks a craft had already consumed).
`nodes` is the tree-size term ONLY and MAY be `0` — the observable form of "an ordinary direct-component recipe does not search".
The per-node term is measured by deterministic operation counts (ledger operations, matcher invocations, essence probes) in tests rather than published here, and a wall clock — being the product of both terms — is recorded and never asserted.

Canonical mapping: `INGREDIENT_SEARCH_NODE_CAP`, `undoLedger` (`src/models/ingredientLedger.js`); `createIngredientSolver`, `buildPassIndexDefault` and module-private `searchAssignment` (`src/models/ingredientAssignment.js`); `tests/ingredient-set-solver-cost.test.js`

Spec reference: openspec/specs/recipes-and-steps/spec.md

## Slot

A slot IS an `IngredientGroup` — the same record, named for how the player meets it — so "slot" and "ingredient group" are never two different things.
A slot is **fixed** when its group authors exactly one option, a **choice** when it authors more than one, and an **essence** slot when the option resolved for it is an essence alternative.
Slot state is `met` / `partial` / `short`, and the rail keeps at most one slot's chooser open at a time.

Canonical mapping: `IngredientGroup`, `requirementSlots.js`, `RequirementRail.svelte`

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/data-models/spec.md

## Tier Stepping

**Two named tiers:** the **rolled tier** is what tier matching produced after any forced reroute, and is what step CONDITIONS read; the **final tier** is what remains after stepping, and is what routes to a result group, what the recipe minimum-success-tier gate judges, what breakage conditions read, and whose `success`/`breakTools` apply.
A step condition asks about the tier the dice landed on, never about the tier the step produces, so the pass is a pure function of (rolled tier, triggers, roll) and cannot iterate.
**Composition:** relative steps sum as signed integers (`Σ up.steps − Σ down.steps`); among ELIGIBLE `target` triggers the one naming the lowest-ranked tier wins (a dangling `tierId`, or one naming the opposite disposition under forcing, is discarded BEFORE the comparison rather than winning and then no-opping); the winning target sets the base index and the net offset applies from there; and an out-of-range result CLAMPS to the extremes of the array in play rather than no-opping (`stepClamped` — unrelated to `clampToNearest`, which decides whether a tier matched at all).
**Placement:** after a forced reroute and before the fixed-only recipe minimum-success-tier gate, so the gate judges the final tier; there is no forced-outcome bypass.
**Disposition-preserving:** under a forced outcome the step moves only within that disposition's ranked tier subset and clamps there, so `data.success` can never disagree with the final tier's own `success`; with no forced outcome, `success` and `breakTools` follow the final tier across the whole ranked list.
A `null` matched tier steps nothing, `target` included.
Only a REAL tier change records `data.tierStepApplied` evidence (whose `steps` is the REALIZED magnitude, the absolute index delta, with `stepClamped` carrying that the author asked for more) or renders a chat note; gathering emits the evidence but threads it to no chat surface.
A persisted `natStepping: true` converts ON READ into the equivalent `natstep-up` / `natstep-down` trigger pair (stable literal ids, `allDice == 20` / `== 1` on the first d20 group, and only while the check is not `fixed` at conversion time) with no versioned migration; the key is stripped from the output, so the conversion runs once and is idempotent.

Canonical mapping: `applyTierStepTriggers`/`rankedRoutedOutcomes` in `src/systems/checkRoll.js`; `CraftingSystemManager._normalizeTierStep`/`_convertNatSteppingToTriggers`, `normalizeTierStep`/`convertNatSteppingToTriggers` in `src/systems/normalize/craftingCheck.js`; `CheckTriggers.svelte`; `data.tierStepApplied`

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/data-models/spec.md, openspec/specs/ui-system-studio/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Tool

A Tool has its own id, durable `roles[systemId].toolId` identity, source UUIDs, and `name`/`img`/`description` snapshots captured on registration or relinking and never auto-refreshed; `label` is an author override, `componentId` is an optional non-load-bearing link, and there is no Tool Kind.
It may retain a legacy gathering formula `requirement`, shared-prerequisite settings (`enabled`, ids, and `bonus | usability` gate mode), and a numeric check bonus.
Tool-specific breakage retains exactly one of `limitedUses`, `breakageChance`, or `diceExpression`; `checkBreakable` independently controls check-driven immunity.
`onBreak` chooses `destroy`, `flagBroken`, or `replaceWith`; `flagBroken` may carry Recipe-compatible repair Ingredient Groups, while replacement targets exactly one managed Component or direct Item UUID.
New Tool Studio replacement authoring selects a managed Component so repair routes keep first-class Component identity.
Persisted direct Item targets remain normalized and executable for backward compatibility, but the Tool Studio does not create or edit them.
Replacement is lossless: create the quantity-one replacement with the target's correct identity before deleting the original, and preserve the original on any resolution or creation failure.
**Presence vs usage/breakage matching is asymmetric:** the wide presence matcher may accept a durable role, source reference, transitive duplicate source, or snapshot-name fallback, but destructive usage/breakage selection requires the Tool's own durable role or direct UUID/compendium-source identity.
A presence-only match is spared, and the durable match wins when both exist.
Tools are referenced by id from recipe, step, ingredient-set, salvage, and gathering-task scopes.
**Replaces the retired Catalyst concept** (migrated by 0.6.0; gathering-scoped copies reconciled by 0.7.0; legacy component-linked Tools converted to first-class by 1.15.0).

Canonical mapping: `Tool`, `system.tools`, `CraftingSystemManager._normalizeSystem`/`upsertTool`/`addToolFromUuid`/`autoStampToolSources`, `src/systems/SourceIdentityService.js` (`autoStampToolSources`), `resolveToolForItem`/`itemIsToolByDurableIdentity`, `RecipeManager`, `src/toolBreakageRuntime.js`, `src/gatheringToolRuntime.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Tool-Breakage Authority

Under `toolSpecific`, each Tool's retained `breakage.mode` decides and check triggers never break Tools.
Under `checkDriven`, the active check's **Check Breakage** triggers decide whether all required Tools with `checkBreakable !== false` break; Tool-specific modes remain stored but are not evaluated, and retained Tool-specific usage counters do not change.
Forced check outcomes still apply under both authorities.
The governing rule is: **authority decides WHETHER; Check Breakage decides WHEN under `checkDriven`; `checkBreakable` decides participation; the Tool's `onBreak` decides WHAT happens.**
Crafting, salvage, and gathering route through the same evaluator.
**SCOPE decides where authority is authored; AUTHORITY still decides WHETHER** — issue 1358 lifts this same switch to world scope with the per-system value as an ABSENT-PRESERVING override (`system.toolBreakage.authority ?? worldToolBreakage.authority`), carrying the SAME two tokens and leaving `checkBreakable` as the per-tool control.
That is a MODIFICATION of the shipped switch and NOT a fourth breakage control.
The world half is **PERSISTED AND LIVE** as of `1.30.0` (persisted at issue 1359, made reachable at issue 1363): it lives on `fabricate.toolScope` alone, absence-preservingly, with no per-system home beside the shipped one.
It was INERT until `1.30.0`, because this switch's own normalizer substituted `toolSpecific` for anything missing or unrecognised on EVERY normalize, so `system.toolBreakage.authority ?? world` could never fall through; the flip that makes that normalizer ABSENCE-PRESERVING is what made it live, and it treats every existing stored value as AUTHORED rather than defaulted, since the corpus cannot tell the two apart.
**FOUR non-Svelte readers are routed through the resolver** — `createToolBreakageRuntime`'s evaluator, both `CraftingEngine` breakage decisions and `InventoryListingBuilder`'s exhaustion projection — because a reader that re-defaults locally re-creates the unreachability at its own call site.
**The UI readers are routed at ONE point rather than five** (issue 1374), and NOT through that seam: the manager's selected-system projection (`adminSystemInspectorProjection.js`) calls the pure resolver, with the world block handed to it explicitly by `adminStore`, and every manager surface that draws or gates on the authority reads that published value.
They were once deferred to the world tool-breakage editor, which cannot discharge the obligation — four of the five sit in `CraftingSystemManagerRoot.svelte`, a file `ui-world-scope/spec.md` `## GM World Scoped Entity Routes` requirement 7 closes to that lane, and the fifth IS the projection the other four read.
Routing at the projection is what keeps the reader count from growing with the screens, so a manager surface that re-defaults locally is a DEFECT, not a duplicate.
The projection publishes the AUTHORING SCOPE beside the resolved token as `system`/`world`/`default`, one value per branch of `resolveToolBreakageAuthority`, because a control offering "inherit" as a third choice cannot recover that from the resolved value — `checkDriven` looks identical whether the system authored it or the world did — and `ToolsBrowserView` carries it on its own `breakageSource` prop.

Canonical mapping: `CraftingSystem.toolBreakage.authority`, `Tool.checkBreakable`, `effectiveToolBreakageAuthority` (`src/systems/toolBreakageAuthority.js`), `resolveToolBreakageAuthority` (`src/systems/toolScope.js`), `evaluateCheckBreakage`/`createToolBreakageRuntime`, `CraftingEngine._applyToolBreakage`, `CraftingSystemManager._normalizeSystem`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-system-studio/spec.md

## Section Inheritance

The `1.30.0` migration writes every membership record fully OVERRIDING, so on a migrated world nothing resolves through the world layer until a GM clears an override — but once cleared it really does resolve: the **Read Union** applies each inheriting section from the **World Defaults** AFTER the in-system re-spread, on the shipped field names, so the answer changes when the world default moves.
**THE COMPONENT `tags` CLAUSE BELOW IS THE EXCEPTION AND STAYS INERT**: `tags` is not a section, carries no writer in the union's inherited-section table, and the in-system record emits it unconditionally, so the additive merge is the RESOLVER's contract and the union's trailing in-system re-spread discards it.
**AND THE MUTE HALF OF THAT CLAUSE HAS NO AUTHORING SURFACE AT ALL as of issue 1371's prototype-parity rebuild**: `mutedTags` is persisted, normalized, read back and displayed, and the `setMutedTags` leg that writes it is published on the component family alone and called from nowhere in `src/` — so a mute reaches the corpus only through the `1.30.0` migration, an import or a hand edit, and a GM can see one and neither make nor clear it.
`dormant` keeps its meaning HERE, for the retained local override a re-inherited section leaves on disk, which is why the world identity copy the migration writes is called a **World Identity Snapshot** and never a dormant one.
An overriding switch over an ABSENT section is not an override and still resolves to the WORLD value, because absence is not a partial block and no field inside a stored block ever falls back; the switch is still reported AS AUTHORED rather than repaired.
Turning a switch OFF SEEDS the local block from the current world value; turning it back ON flips the switch ONLY and **RETAINS the dormant override**, which re-overriding RESTORES rather than re-seeding — nothing is lost, so the copy stays "fall back" and no confirmation is required.
An `inherit` map that OMITS a section reads as inheriting it, because that is the state a record created by "add to system" is in.
Three fields depart from the plain pattern, each with its own named helper: the component `category` (the world value wins IF AUTHORED, otherwise the local value falls through), the component `tags` (ADDITIVE — world minus muted plus system-only, with no switch at all), and the tool `repairRequirements` (named for the shipped `Tool.repairRequirements` it seeds; a SEED copied once on add, never a live parent).
**A SYSTEM-SCOPE WRITE OF AN INHERITABLE SECTION IS AN OVERRIDE, NOT A SHADOWED WRITE** (issue 1371 r19, first stated at component `essences`): every system-scope writer flips that pair's switch to `false` BEFORE the values land, on the same flag-before-values order the editors' own inherit controls use, so what a GM stages is what that system resolves — and **A DELETE IS ONE OF THOSE WRITERS** (issue 1371 r21), which is the least obvious of them: deleting an essence from a system strips it from that system's own rows, which an inheriting pair does not resolve, so the strip changed nothing the GM had just been told it would.
The delete's flip carries an addition the other writers do not need: the row is SEEDED from what the pair RESOLVED before the flip, because an inheriting pair's own row is dormant and EMPTY for anything adopted after the migration, so flipping onto it and stripping would have answered `{}` and taken every other essence with the one deleted.
The world map is untouched, because a delete is scoped to one system — a write that landed under the switch would be masked by the world value on the next read and counted as a success by the surface that made it.
The one exemption is a save that merely RESTATES THE BASELINE ITS OWN EDITOR WAS SEEDED FROM: an editor sends the section whether or not the GM touched it, so turning that into an override would flip a switch nobody touched and overwrite the dormant local block the section falls back to.
**THE BASELINE IS THE CALLER'S TO STATE, NOT THE RULE'S TO ASSUME** (issue 1371 r20): comparing against what the system RESOLVES is sound only for an editor seeded from the read union, and a second editor seeded from the persisted row read its own untouched values as an authored override — so a caller states the map an untouched save of its own rendered rows would produce, and only a caller that states none is taken to have been seeded from the union.
Two further conditions bound the flip: it fires only where the write would in fact be SHADOWED — a pair inheriting a section the world record never authored already resolves its own row, and flipping there would opt it out of a world default it has not yet received — and a flip that lands ahead of a value write that then FAILS is rolled back TO THE RECORD'S PRE-STATE rather than to the switch's old value, because the flip is a durable replicated write made first and leaving it standing would opt those pairs out of every later world edit while the GM is told the write failed.
Restoring the value alone does not compensate: moving a switch OFF SEEDS a local block from the world map, and moving it back ON leaves that block dormant on disk, where it silently becomes the GM's next genuine override — so the rollback clears a block its own flip seeded, and a compensation that reads as closed while leaving a residue is worse than none.
A pair whose flag write is refused loses its ESSENCE axis alone, not the rest of the edit.
**The component `essences` section (issue 1371 r18-store, maintainer ruling M31; `1.32.0`) is a PLAIN-pattern section** — a map `essenceId -> quantity` over the world essence catalogue, `{}` an authored "none", a non-object absence — and the SECOND section authored at component scope: the world entry and the catalogue's bulk `Essence values` group write it, the rules editor's inherit choice switches it, and its migration marks each existing record inheriting only where the system's own map equals the elected world map, so nothing resolves differently on the day it lands.

Canonical mapping: `setSectionInheritance` / `isSectionInherited` (`src/systems/scopedDefinitions.js`); `resolveComponentCategory` / `resolveComponentTags`; `seedToolRepairRequirements`

Spec reference: openspec/specs/data-models/spec.md

## Tool Check Bonus

A failed `usability` prerequisite gate makes the Tool absent; a failed `bonus` gate preserves presence but suppresses its bonus.
Crafting and salvage add every distinct enabled eligible Tool's finite non-zero contribution once; gathering never applies numeric Tool bonuses.
Recipe data stores Tool references only and owns no bonus policy.

Canonical mapping: `Tool.prerequisites`, `Tool.bonus`, `evaluateToolCheckContribution`, `composeToolBonusTerms`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Check Breakage (`checkBreakage`)

Each `UnifiedTrigger` is `{ id, condition, outcome, tierStep, breakTools }` and carries THREE effects, not two: a matched trigger whose `breakTools === true` breaks **all** required tools for the attempt (v1 never targets a single named tool), its `outcome` forces a disposition (see **Forced Outcome**), and its `tierStep` moves a routed check's outcome tier (see **Tier Stepping**).
Triggers are ORed.
`condition` is one of: `rollTotal` (raw roll total `data.total`, with `==/<=/>=/</>` operator + `value`); `progressiveValue` (the awarding `value`, meaningful only on progressive checks — absent → never matches; **distinct** from `rollTotal` because a forced outcome can overwrite `value` while `data.total` keeps the raw roll); `outcomeTier` (resolved tier/outcome in `tierIds[]`/`outcomeKeys[]`, routed checks only); and `diceGroup` (`groupId` = index into the evaluated `roll.dice` term order, an aggregate `total`/`anyDie`/`allDice`/`lowestDie`/`highestDie` over active-only raw faces, plus operator + value; **plain-die eligible only** — modified pools are not).
The `breakTools` effect is authored and applied **only under `checkDriven`** authority (`showBreakTools={checkDriven}`); under `toolSpecific` a check never breaks tools, though forced outcomes still apply.
The shared evaluator additionally reads a routed tier's `data.breakTools` as an implicit always-on trigger (the only remaining legacy bridge), and force-breaks only for engine-evaluated checks (`engineEvaluated !== true` is skipped, preserving the macro/built-in guard).
Legacy per-die `DiceCrit` rows migrate ON READ into triggers (`diceGroup`+`total`+`==`; `success`→`outcome`; carried `breakTools`; ineligible non-plain-die crits dropped).
**Distinct from the per-realm gathering `toolBreakagePolicy`** (`failureOnBreak | successDespiteBreak`), which governs what a _broken_ tool does to the gather outcome, not when tools break.

Canonical mapping: `check.checkBreakage`, `resolveForcedOutcome`/`rolledDiceGroups` in `src/systems/checkRoll.js`, `evaluateCheckBreakage`/`evaluateCheckBreakageCondition`/`createToolBreakageRuntime` in `src/toolBreakageRuntime.js`, `CraftingSystemManager._normalizeUnifiedTriggers`/`_convertDiceCritsToTriggers`/`_normalizeUnifiedTrigger`/`_normalizeTierStep`/`_convertNatSteppingToTriggers`, `normalizeUnifiedTriggers`/`convertDiceCritsToTriggers`/`normalizeUnifiedTrigger`/`normalizeTierStep`/`convertNatSteppingToTriggers` in `src/systems/normalize/craftingCheck.js`, `CheckTriggers.svelte`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-system-studio/spec.md

## Provider (vocabulary boundary)

The 1.6.0 provider enum was `ingredientSet` | `check` — the legacy `macroOutcome` and `rollTableOutcome` providers (and the `rollTableUuid` field) were **removed** and persisted recipes migrated onto `check`; issue 554 then retired the per-recipe result-selection provider entirely (alchemy — the last provider-routed mode — moved to the system-level `alchemy.checkMode`, and the `1.14.0` migration strips `resultSelection` from every alchemy recipe).
It is **retired** for visibility gates, gathering checks, tool requirements, character modifiers (all now **formula-only**), and stamina (now a `maxReadOnly` boolean).
The old **currency** discriminator `requirements.currency.provider` (`system` | `macro`) is **legacy**: it was replaced by the **Currency Spend Strategy** model (three peer top-level strategies `spendStrategy` ∈ { `actorProperty`, `actorInventory`, `macro` } + a `providerId` for the `actorInventory` strategy), where "provider" now means a _preconfigured inventory provider_ (a coin-adapter bundle), not a check/spend discriminator.
The legacy `provider`/`systemAdapter`/single-macro-UUID fields are read-compatible on normalization but never re-emitted.
Documentation must not reintroduce a `dnd5e`/`pf2e`/`macro` provider for the retired surfaces, nor the removed `macroOutcome`/`rollTableOutcome` result-selection providers.

Canonical mapping: `resultSelection.provider`; legacy `requirements.currency.provider` (normalized away); `GatheringGateAndCheckEvaluator` (formula-only); `GatheringRichStateService` stamina `maxReadOnly`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/data-models/spec.md

## Currency Unit

It carries `{ id, label, abbreviation, icon, actorPath, denomination?, contains[] }`.
`id` is the stable reference a salvage `currencyRequirement.unit` stores; `actorPath` locates the numeric balance under the `actorProperty` strategy; `denomination` (a pf2e coin key) locates it under the `actorInventory` strategy.
A unit with an empty `contains[]` is a **terminal base unit** (value 1 in its branch).

Canonical mapping: `CurrencyUnit`, `normalizeCurrencyUnit`/`validateCurrencyProfile` in `src/systems/currencyProfile.js`; `requirements.currency.units[]`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/ui-world-scope/spec.md, openspec/specs/ui-system-studio/spec.md

## Denomination / Sub-unit (`contains`) breakdown

Each Currency Unit's `contains[]` lists `{ unitId, amount }` pairs naming the child denominations one unit breaks down into (e.g. one `gp` _contains_ 10 `sp`).
The graph forms a **denomination DAG** that must be acyclic and resolve every connected branch to exactly one **terminal base unit**.
A single unit's decomposition must reach each descendant by exactly one path: a sub-unit `S` is eligible for parent `P` only when `reachable(P) ∩ reachable(S) = ∅` (each set being the unit plus everything transitively reachable through `contains`), which rejects self-containment, an already-direct child, a cycle, and the descendant/diamond cases that would give `P` two conversion paths to the same node; a profile where any unit reaches a descendant via two distinct paths is a validation error (conflicting conversion paths).
A node legitimately shared by two **different** parents (`gp -> sp` and `ep -> sp`) is allowed.
The recursive resolver multiplies the ratios back to integer base values (cp=1, sp=10, ep=50, gp=100, pp=1000 on the seeded ladder) used for affordability and change-making.
`contains` is **only relevant to the `actorProperty` strategy** (which makes its own change across configured sub-units); under `actorInventory` the provider/system or the macros own coin breakdown, so the ladder is informational there.
The seeded preset is a parent-linked ladder (cp base; sp→cp; ep→sp; gp→sp; pp→gp).

Canonical mapping: `CurrencyUnit.contains[]`, `buildUnitResolver`/`buildCurrencySpendUpdates` in `src/systems/currencyProfile.js`; preset ladder in `src/config/currencyPresets.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Currency Spend Strategy

One of **three peer top-level strategies**: `actorProperty` — a flat numeric actor data path per unit (e.g. dnd5e `system.currency.gp`), read/spent via batched `actor.update(...)` with Fabricate-owned change-making; `actorInventory` — coins held in the actor inventory and resolved through a preconfigured **inventory provider** (filtered by `game.system.id`); or `macro` — the GM's own currency macros (the macro receives the actor and does whatever it needs).
Macro is **not inventory-specific**, so it is its own peer strategy rather than a sub-mode of `actorInventory` (the retired nested `inventoryMode` field is mapped forward on normalization and never re-emitted).
A consumer resolves a symmetric **coin spender** per strategy behind a common `{ check, spend, refund }` interface and drives the up-front affordability check, the deduction, and the player-cancel refund uniformly.
Defaults to `actorProperty`; any unknown value normalizes to it.

Canonical mapping: `CurrencyConfig.spendStrategy` (world `fabricate.currencyConfig` setting, `CurrencyConfigStore`, issue #1278); `ActorPropertyCoinSpender`/`ActorInventoryCoinSpender`/`MacroCoinSpender` in `src/systems/CoinSpenders.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Inventory Provider (currency)

A provider knows how to read and spend coins from a Foundry actor's inventory and owns its own (frozen, read-only) denomination ladder, so the engine's affordability/baseValue math tracks the system's real coin values.
The registry is pure and Foundry-free; the only registered provider is **pf2e inventory** (`Pf2eInventoryCoinAdapter`, which reads `actor.inventory.coins` and spends via `actor.inventory.removeCoins(...)`, letting pf2e make its own change and report insufficient funds).
`providerId` is stored and selectable but the runtime still resolves the adapter by `game.system.id` (one provider per system today); it becomes load-bearing only when a system gains a second provider.
Systems with no registered provider (e.g. dnd5e) show an empty-provider callout steering the GM to the **Macro strategy**, and `actorInventory` provider units are **provider-owned and read-only** in the editor.

Canonical mapping: `requirements.currency.providerId`; `getCurrencyProvidersForFoundrySystem`/`getDefaultProviderId`/`resolveProvider`/`getProviderCanonicalUnits` in `src/config/currencyProviders.js`; `Pf2eInventoryCoinAdapter` in `src/systems/Pf2eInventoryCoinAdapter.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-world-scope/spec.md

## Custom Currency Macro Strategy

Because the macro receives the actor and does whatever it needs, macro spending is **not inventory-specific** and is a peer strategy (not a sub-mode of `actorInventory`).
`MacroCoinSpender` runs `canAfford` for the affordability gate and `decrement` for the deduction; `increment` is **invoked by `MacroCoinSpender.refund`** on the player-cancel reversal — the refund flow it was always reserved for — and stays optional, so a system with no `increment` macro simply cannot refund a macro-mode cancel (the reversal reports that failure rather than aborting).
Validation requires `canAfford` and `decrement` (increment optional) and requires each unit to have a non-empty `abbreviation` (not a denomination/actorPath).
The macro strategy is GM-only config with no separate feature flag.

Canonical mapping: `CurrencyConfig.macros` (world `fabricate.currencyConfig` setting, issue #1278), `MacroCoinSpender`/`interpretMacroSpendResult` in `src/systems/CoinSpenders.js`; drag-drop zones in `SystemEditView.svelte`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-world-scope/spec.md

## Currency Macro Contract

Fabricate runs it through `MacroExecutor.run` (not `Macro#execute`), passing a context `{ actor, cost: [{ abbreviation, amount }], units: [{ id, abbreviation, label }], requirement, recipe, craftingSystem, caller }` (`cost` keys the requirement by the unit's abbreviation so a macro matches coins by the same abbreviation the GM configured).
A return of `true`, or an object with a truthy `success` or `canAfford`, passes; `false`/`null`/a thrown error (or a falsy `success`/`canAfford`) fails, surfacing the macro's `message` to the player. **"A thrown error propagates loudly" was documented here and is FALSE against shipped code** (found false on inspection, issue #1289): `MacroCoinSpender._runMacroKey` **catches** every thrown error and, before this change, returned the exact same `{ valid: false, message }` shape a genuine shortfall returns — nothing downstream could tell "this macro is broken" from "this actor is poor".
The craft path tolerates that collapse, because either answer correctly refuses the craft either way, but the companion contract's `game.fabricate.checkAffordability({ actorId, unitId, amount })` (issue 1289), the world-scoped affordability answer this member enables, REPORTS its result to a companion and a GM, and reporting a well-funded actor as unable to pay because a craft-shaped macro dereferenced a null `recipe` is a lie.
Two fields close that gap, both additive and both read only by the new affordability path (every existing craft caller reads only `valid`/`message` and is unaffected): **`caller`** (`'craft' | 'award'`, on both `ctx` and the macro's own `context` — REQUIRED and NEVER DEFAULTED, because defaulting it to `'craft'` would make a forgotten award call site indistinguishable from a craft, the exact confusion the field exists to remove) and **`thrown: true`**, stamped on `_runMacroKey`'s catch branch only, so a caller can discriminate a broken macro from a genuine refusal.
On an `'award'` call, `recipe` and `craftingSystem` arrive `null` (the question belongs to no recipe and no crafting system), which is why a macro written for crafts that dereferences `context.recipe.name` used to throw silently on that path; a macro can now test `caller` before touching anything craft-shaped instead of inferring the call kind from a `null` it might not check.
This is distinct from the untouched **Item Piles** currency path (`recipe.currencyCost`). (`currencyAffordance.buildSpendContext` builds this context on every check, spend and refund today; component-level currency spending remains a deferred follow-up.)
**A FOURTH macro key, `balance`, ships with issue 1342, and it is the only one that ASKS rather than acts.**
It reports how much one actor holds and is what lets a `macro` world answer a **Pooled Holdings** read at all — without it Fabricate can spend a macro world's coins but cannot see them, so every pooled currency reading answers "cannot see".
Its return is interpreted by its OWN interpreter (`interpretMacroBalanceResult`) and NEVER by `interpretMacroSpendResult`, because a bare number is an ANSWER here where the spend interpretation reads `250` as a refusal: a returned NUMBER is the balance — `0` meaning provably none — and anything else (including `true`) means UNKNOWN, i.e. `null`.
The number is denominated in the ladder's TERMINAL BASE UNIT (the coin whose own `baseValue` is `1`), which is the same denomination the other two spenders' `readCoins` answer in, so N actors' answers sum without any conversion.
It is OPTIONAL on the `increment` precedent, and needs NO migration: `CURRENCY_MACRO_KEYS` is iterated by the normalizer and by `MacroCoinSpender`'s constructor, and normalization runs on every read, so `macros.balance: ""` backfills in every existing world for free.
The `caller` discriminator gains a third token with it — `consume`, covering BOTH halves of the pooled pair (the read runs `balance`, the debit runs `decrement`), named for the ACT as `craft` and `award` are and not for the thing being paid.
One `(macro key, caller)` cell is NOT unique and that is declared rather than discovered: a pooled consume unwinding a currency cost it already settled routes through the published **Currency Credit**, so `increment` + `award` names the credit AND that unwind, while `increment` + `consume` names the currency leg's own intra-call restore.

Canonical mapping: `interpretMacroSpendResult`/`MacroCoinSpender._runMacroKey` in `src/systems/CoinSpenders.js`; `MacroExecutor.run` in `src/utils/MacroExecutor.js`; `interpretMacroBalanceResult`/`MacroCoinSpender.readCoins` in `src/systems/CoinSpenders.js`; `CURRENCY_MACRO_KEYS` in `src/systems/currencyProfile.js`; `CURRENCY_SPEND_CALLERS`/`buildSpendContext`/`checkWorldCurrencyAffordability` in `src/systems/currencyAffordance.js`; `Fabricate.checkAffordability` (`src/bootstrap/companionFacade.js`)

Spec reference: openspec/specs/recipes-and-steps/spec.md, openspec/specs/data-models/spec.md

## Canvas Interactable

A GM drags an entry from the GM-only scene-control browser (or a tool-linked Item) to spawn a Region + behaviour + linked Tile, or a **region-only** interactable with no visible marker.
**Activation is token presence**: a controlled token entering the region offers the controlling player a non-blocking interact prompt.
**No synthetic actor or proxy token is ever created.**
A **Tool** interactable opens the **Crafting** tab with a session-scoped `activeCanvasTool` (virtual-present).
A **Gathering-Task** interactable opens the gathering UI scoped to that environment + task (auto-selecting both); it is either **linked** to the gathering task or **unlinked** (independent), gated by `taskNodeLink` — by default (`linked`) it reads/decrements the **environment's `nodeRuntime[taskId]`** as the single source of truth (depletion/respawn follow the task; `node` null), and when `taskNodeLink === 'unlinked'` (issue 302) it owns its OWN independent pool in `behavior.system.node` with an independent lifecycle (capacity/current/depletion/respawn).
The behaviour carries source identity, a resolved `environmentId`, `taskNodeLink`/`node`, presentation, linked-visual config, and `state{enabled,consumed,locked,uses,cooldown}`.

Canonical mapping: `src/canvas/*` (`InteractableManager`, `interactableSpawner` (drop-to-spawn transaction), `regionEnterPrompt` (enter/exit prompt), `interactableGrant` (activation request/validate/grant), `interactablePredicates` (geometry + containment predicates), `interactableResolution`, `environmentResolution`, `interactableSocket`); `src/canvas/regions/*` (`FabricateInteractableRegionBehavior`, `interactableRegionFlags`, `interactableRegionActivation`, `interactableRegionNodeAdapter` (pure ref resolver; link selected by `GatheringRichStateService._resolveNodeSource`), `interactableConfigSheet`); `src/canvas/linkedVisuals/linkedInteractableVisual.js`; `behavior.system`; module manifest `documentTypes.RegionBehavior.interactable` + `"socket": true` + `CONFIG.RegionBehavior.dataModels`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Linked Visual

It carries only reverse flags (`isInteractableVisual`, `linkedRegionUuid`, `linkedBehaviorId`) — it **never OWNS interactable state**.
**Deleting the visual does NOT destroy the interactable** (recovery governed by `linkedVisual.missingPolicy`: `ignore`/`warn`/`recreate`); a missing visual is a clean no-op.
The marker is presentation-only in the sense that it holds no node pool/state of its own, but it now **reflects two GM-controlled facts** about its owning behaviour: (1) **node depletion** — when the active node is depleted (`current <= 0`) and the task/node configures `depletedBehavior.swapImage`, the linked **Tile** marker swaps its texture to that image and flips back on recharge (SHIPPED — `interactableMarkerDepletion.js`, active-GM sync; the available image is stashed at `flags.fabricate.markerAvailableImg` and restored).
The depleted state is read from the shared `environment.nodeRuntime[taskId]` for a task-linked interactable, or from the behaviour's OWN `system.node.current` for an unlinked one (issue 302); and (2) **concealment** — when the interactable is DISABLED (`state.enabled === false`) or explicitly HIDDEN (`presentation.hidden === true`), the linked Tile marker is hidden from players (`tile.hidden = true`, GM-only).
A LOCKED interactable's marker stays visible.
The reflection is driven by the active node + concealment state.

Canonical mapping: `behavior.system.linkedVisual`, `src/canvas/linkedVisuals/linkedInteractableVisual.js`, `buildLinkedVisualFlags`/`readLinkedVisualRef`, `src/canvas/regions/interactableMarkerDepletion.js` (`resolveMarkerImage`/`syncInteractableMarkers`), `resolveMarkerHidden` in `interactableRegionActivation.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Gathering-Task Interactable Shortcut

It is either **linked** to the gathering task or **unlinked** (independent), gated by `behavior.system.taskNodeLink` — much like an FVTT token↔actor link: by default (`linked`) node counts, depletion, and respawn follow the task, owned by the **environment's `nodeRuntime[taskId]`** (the single source of truth read/decremented by a normal gathering attempt; `node` null); when `taskNodeLink === 'unlinked'` (issue 302) the behaviour owns its OWN independent pool in `behavior.system.node` with an **independent lifecycle** (capacity, current, depletion timing, respawn policy incl. non-regenerating) — depleting it never touches the env node and vice-versa, and a dedicated primary-GM world-time pass respawns independent pools (sibling of `respawnNodes`).
The link is resolved by `GatheringRichStateService._resolveNodeSource`, which falls back to the environment branch whenever there is no ref / the behaviour is task-linked / the behaviour is gone; it is switchable post-placement and non-destructive (re-linking clears `node`, re-seeding reuses a node still carried on the behaviour).
A timed run persists its `interactableRef` so maturity decrements the SAME independent pool.
**SHIPPED — node-driven marker swap:** when the active node depletes (`current <= 0`) and `depletedBehavior.swapImage` is configured, the linked Tile marker swaps its texture (and flips back on recharge), via an idempotent active-GM sync.

Canonical mapping: `behavior.system.{environmentId,taskId,taskNodeLink,node}`, `environment.nodeRuntime[taskId]`, `GatheringRichStateService._resolveNodeSource`/`respawnInteractableNode`, `GatheringEngine._processInteractableNodeRespawn`, `InteractableManager.openGrant`, `src/canvas/regions/interactableMarkerDepletion.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Depleted Behavior (task/node config; node-driven marker swap)

The depleted state is read from the shared `environment.nodeRuntime[taskId]` (linked) or the behaviour's `system.node.current` (unlinked, issue 302).

Canonical mapping: `depletedBehavior`, `src/systems/gatheringNodeConfig.js`, `src/ui/svelte/stores/adminStore.js`, `src/ui/svelte/apps/manager/GatheringTaskEditView.svelte`, `src/ui/svelte/apps/InteractableConfigRoot.svelte`, `src/canvas/regions/interactableMarkerDepletion.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Active Canvas Tool

Activating a Tool interactable opens the **Crafting** tab (`describeGrant` returns `{ tab: 'crafting' }`; the Crafting tab is a shipped player surface — recipe browse/detail/shopping list/craft/run summary — and the injected tool feeds tool-availability checks, with the active-tool chip in the header as the visible marker).
The payload is **system-scoped** (`presentTools = { systemId, componentIds }`) so a system-A station tool cannot satisfy a system-B prerequisite sharing a `componentId`.
Set on the `SvelteFabricateApp` instance via `show('crafting', { activeCanvasTool })` and cleared on close; never persisted to a run record.
**UI placement:** the active station tool is surfaced as an accent-pill status chip in the tab header bar's right-side context cluster (alongside gathering's weather/time/realm), implemented in `ActorSelectTopBar` (`.actor-bar-tool-chip`); the chip appears on whatever tab is active (gathering next to the conditions; crafting/alchemy in the otherwise-empty right).
When the Crafting and (conditional, feature-gated) Alchemy tabs gain their own header/context bars, the chip should move into that bar's right side next to the tab's own context info.

Canonical mapping: `activeCanvasTool`, `presentTools`, `SvelteFabricateApp.svelte.js`, `gatheringToolRuntime.resolvePresentComponentIds`, `ActorSelectTopBar.svelte`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Interactable Activation Pipeline

**Visibility is split from eligibility.**
_Concealment_ (pure rule `shouldPromptOnEnter` / `resolveMarkerHidden`): when the interactable is DISABLED (`state.enabled === false`) OR explicitly HIDDEN (`presentation.hidden === true`) it is **concealed from players** — the on-enter prompt does NOT fire and the linked Tile marker is hidden from players (`tile.hidden = true`, GM-only).
A **LOCKED** interactable is the opposite: it stays **visible** (marker shown, prompt fires) but pressing Interact is **denied** with `FABRICATE.Canvas.Interactable.Denied.Locked` ("This is locked.").
A region `tokenEnter` (behaviour event handlers run on EVERY client) that passes the concealment check raises a non-blocking prompt on the **mover's** client AND on the **owning non-GM player's** client (a GM moving a player's token prompts both; the GM is not spammed for players' autonomous moves).
On Interact an activation request routes to the **active GM**, which re-validates (behaviour/region exist; user controls the actor; token inside; source + environment valid; eligibility) and emits a grant; `evaluateActivationEligibility` still gates the actual activation (precedence DISABLED → LOCKED → CONSUMED → USES_EXHAUSTED → COOLDOWN — there is **no NODE_DEPLETED gate** in activation eligibility; node depletion is checked by the gathering engine when the session opens, against whichever node the interactable uses — the environment's `nodeRuntime[taskId]` (default, linked) or the behaviour's own independent `system.node` when `taskNodeLink === 'unlinked'`) and a **denied** activation sends the specific localized reason (`FABRICATE.Canvas.Interactable.Denied.*`) back to the requesting player.
A `controlToken` hook + keybinding re-raise the prompt for a token already inside on scene load.
No active GM ⇒ fails cleanly.

Canonical mapping: `behavior.system.state`/`activation`, `src/canvas/regions/interactableRegionActivation.js` (`evaluateActivationEligibility`/`buildActivationRequest`/`validateActivationRequest`/`describeGrant`/`activationDenialMessageKey`), `src/canvas/interactableSocket.js`, `InteractableManager`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Drop-Time Environment Resolution

Holding **Alt** forces the dialog.
This drop-time placement use of an environment id is distinct from `environment.sceneUuid`, the runtime gathering gate.

Canonical mapping: `task.defaultEnvironmentId`, Scene Region `flags.fabricate.environmentId`, `src/canvas/environmentResolution.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Result

Canonical mapping: `Result`

Spec reference: openspec/specs/data-models/spec.md

## Result Group

In routed and alchemy flows, it is the routing target.

Canonical mapping: Plain object `{ id, name, results[] }`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/resolution-modes/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Essence

Essence is a **first-class ingredient match option** (`match.type === "essence"`, `{ essenceId, amount }`): an `IngredientGroup` option that expands to every component carrying the essence, so "component OR essence" is authorable.
It is NOT satisfied by drawing essence-carrying items down per group: every essence option in an ingredient set resolves inside that set's single **Essence Block**, sharing one pool of consumed units, and each requirement reports what the block **delivers** to it rather than what the actor holds.
An `EssenceDefinition` may carry an optional GM-authored `colorToken` from the `--fab-tag-*` palette; unset renders in the theme accent, and the colour is drawn WHEREVER the essence is drawn as a chip or a tile, at world scope and system scope alike, through one shared essence chip (issue 1371, maintainer ruling M29) — the world entity's colour wins where one is authored, because the GM sets it once in the world Essence Catalogue and expects to see it everywhere.
**THAT PRECEDENCE IS A READ OVERLAY AND IS NEVER WRITTEN BACK**: it is computed in the GM manager's own refresh over a projection several editors seed from, so an editor sends `colorToken` only where the GM touched it and the bulk colour axis is withheld where the world owns the essence — an overlaid value an editor persists is a second authority over one field wearing the first one's clothes.
Its reach is the manager's alone; the recipe editor and the player surfaces still answer the read union's in-system colour.
**AND WITHHOLDING A CONTROL IS NOT WITHHOLDING A WRITE**: a staged bulk instruction outlives the selection that made it, so the condition that withdraws the colour axis DISARMS the staged colour rather than only hiding the control.
**HOW MUCH OF AN ESSENCE A COMPONENT CARRIES IS A WORLD FACT BY DEFAULT** as of `1.32.0` (issue 1371, maintainer ruling M31): the quantity map is a **World Defaults** section on the world component record, inherited by every system that has rules for that component until one overrides it, so a GM authors a component's essence contribution once rather than per system — see **Section Inheritance** and the **Component** row.
The per-set `IngredientSet.essences` map is now a **legacy read-only** field superseded by essence options — the `1.17.0` migration folds each positive entry into a single-option essence group; constructors keep reading the map for one release and nothing new writes it, and because it is threshold-only and never consumed it never enters an **Essence Allocation**.

Canonical mapping: `essenceDefinitions` (incl.
`colorToken`), `match.type === "essence"` ingredient options, legacy read-only `IngredientSet.essences`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-world-scope/spec.md, openspec/specs/ui-system-studio/spec.md

## Essence Block

It is placed last — after every component/tag group has claimed from the set's shared `remaining` ledger — and within it a consumed unit credits every essence it carries to every essence requirement in the block, so one dual-essence carrier can fund two requirements at once.
Its scope is exactly one ingredient set: it never spans sets or steps and never reaches across the component/tag boundary, because an occurrence-based requirement (component/tag) claims a unit exclusively while amount-based essence requirements share the units claimed for the block.
Joint resolution is a strict relaxation of the former per-group draw-down, so no authored recipe becomes uncraftable, and being a backtrackable node (not a post-pass) is what lets a block that cannot fund force an earlier group to re-branch.

Canonical mapping: `resolveEssenceBlock` (`src/models/ingredientEssenceBlock.js`), `src/utils/essenceAllocation.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Essence Carrier

A carrier is identified by its ledger `itemKey` (an index into the already-resolved ledger, never a uuid the model resolves) and reports `perUnit` (the essence map one unit contributes), `ownedUnits` (units still available AFTER the set's non-essence plan has claimed, never the raw stack count at the configured stack-quantity path) and `allocatedUnits` (units the current **Essence Allocation** draws from it).

Canonical mapping: `craftability.essencePool.carriers[]`, `EssencePoolPanel.svelte`

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/data-models/spec.md

## Essence Allocation

It is the player's control over essence requirements: `optionOverrides` answers "which option does this group use", while an allocation answers "which held items pay for the block".
It is clamped against the ledger, honoured whether or not it satisfies the block, NEVER topped up from unallocated carriers when short, and returned on `selection.essenceAllocation` — which is what makes the displayed tiles equal to what the craft consumes.
It is scoped to one ingredient set on one step; only the active step's allocation is interactive, and the engine drops an allocation whose step does not match the step it resolved.

Canonical mapping: `resolveIngredientSelection({ essenceAllocation })`, `selection.essenceAllocation`, `craftRecipe({ ingredientEssenceAllocation })`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-crafting-app/spec.md

## Consumption Plan

The **Essence Block** contributes AT MOST ONE entry per item key: a component/tag group MAY still contribute its own entry for the same item key (those draws are disjoint and compose correctly under the engine's live read of the configured stack-quantity path), but two entries for the same _shared_ unit do not compose and the second delete throws mid-consumption on Foundry V13/V14 rather than silently overspending.
Each block entry carries `essenceGroupIds` naming every requirement it funds alongside the back-compat `ingredient`, and a reader resolving an essence requirement's consumed item MUST prefer `essenceGroupIds`.
Plan entries are not persisted, so their shape needs no migration.

Canonical mapping: `ingredientLedger.commitItemPlan`, `selection.plan[]`, `CraftingEngine._consumeIngredients`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Delivered

It is deliberately NOT `owned` (the essence amount held across every matching carrier) and NOT the component/tag `have` (which is not net of the consumption plan).
Delivered is assigned by a per-essence-id partition: for each essence id, the requirements naming that id settle in author order, each taking `min(need, remaining delivered of that id)`; the partition runs whether or not the block is short and is independent across essence ids.
Because every take is capped at `need`, a satisfied essence requirement always reports `delivered === need`, and unit-granular overshoot is visible only in a carrier's `allocatedUnits`.

Canonical mapping: `ingredientStates[essence].delivered`, `essencePool.requirements[].delivered`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-crafting-app/spec.md

## Signature

Alchemy signature matching is **quantity-aware**: a group is satisfied only when one of its OR-alternative options has its required `Ingredient.quantity` met by the available submissions matching that option's components.
Submitted quantity is counted **per submission (one submission = one unit)**, not by reading a stack's count at the configured stack-quantity path — the workbench expands a stack into one submission per unit, consistent with occurrence-based essence accumulation and `_consumeSubmittedAlchemyItems`.
An essence OR-alternative (`match.type === "essence"`) is instead satisfied by **amount**: the accumulated essence for its `essenceId` across submissions must meet `match.amount` (not occurrence), and for uniqueness it expands to every component carrying that essence, with `computeGroupOptions` capacity `min(amount, ids.size)`.
Uniqueness is enforced wherever a save could land an ambiguous match: recipe create/update, and (as of #99) an edit to an **already-`alchemy`** system (components, essences, recipe items), which is **hard-blocked before persist** via `CraftingSystemManager._assertNoAlchemySignatureCollisions`.
The gate scans only **enabled** recipes — `SignatureValidator.validateSystem` is the exact complement of the runtime matcher's `if (!recipe.enabled) continue;` skip — so the invariant is _"the set of enabled recipes is collision-free"_ and every consumer (`blocks:'system'`, the save-block, the disable-reconciliation) agrees.
A resolution-mode change _into_ `alchemy` is the sole exception — it **disables** colliding recipes rather than blocking; because the gate is enabled-scoped, disabling all participants of a conflict genuinely clears it (re-enabling a disabled collider is re-caught at that mutation) (openspec 007 §"Alchemy Uniqueness Revalidation").

Canonical mapping: `SignatureValidator`, `CraftingEngine._matchAlchemySignature`, `CraftingSystemManager._assertNoAlchemySignatureCollisions`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/resolution-modes/spec.md

## Simple

Canonical mapping: `resolutionMode: "simple"`

Spec reference: openspec/specs/resolution-modes/spec.md

## Routed by Ingredients

Exactly one result group is produced per attempt, determined by the satisfied ingredient set.
The routing basis is a property of the **mode**, not a per-recipe provider — the mode carries no `resultSelection`.
The crafting check is the SAME **optional** pass/fail check as `simple`/`alchemy` mode, stored in the shared **`craftingCheck.simple`** slot (the shared optional pass/fail crafting-check slot that backs `simple`, `alchemy`, AND `routedByIngredients` — not a simple-mode-only slot).
It runs only when `craftingCheck.simple.rollFormula` is authored and never changes which group is produced; a missing simple formula simply means no check runs, so this mode **never** raises `routedCheckNoFormula`.
With one result group, explicit `resultGroupId` mapping may be omitted; with multiple, every satisfiable ingredient set must resolve to exactly one group.
The GM authors `simple | routedByIngredients | routedByCheck | progressive | alchemy` and nothing else.
**Cross-activity asymmetry (deliberate, not drift):** crafting **retired** the `routed` token, but salvage (`salvageResolutionMode`) and gathering (`economy.resolutionMode` / per-task `GatheringTask.resolutionMode`) are unrelated routing concepts on separate enums and **keep** their `routed` token untouched by this split.

Canonical mapping: `resolutionMode: "routedByIngredients"`

Spec reference: openspec/specs/resolution-modes/spec.md

## Routed by Check

Exactly one result group is produced per attempt.
The routing basis is a property of the **mode**, not a per-recipe provider (no `resultSelection`).
The crafting check is **required**: a `routedByCheck` system with no authored `craftingCheck.routed.rollFormula` is an **unconditional** system-level blocker (`routedCheckNoFormula`), independent of any recipe — even with zero recipes — because every recipe routes by the check.
**Single-result-group rule:** a recipe/step with exactly one result group needs no outcome/tier mapping — the single group is produced on any non-failure (success) outcome and nothing on a failure outcome (it uses only the success/failure aspect of the roll, mirroring routed-by-ingredients' single-group exemption); only multiple result groups require each success outcome to map (by tier assignment or name), and resolution does not abort for an unmatched success outcome when there is exactly one group.
A reserved failure keyword as a `ResultGroup.name` is rejected and group names must be unique under trim/case normalization — enforced at the service level via `ResolutionModeService._validateRoutedGroupNames` (reference integrity, always applied).

Canonical mapping: `resolutionMode: "routedByCheck"`

Spec reference: openspec/specs/resolution-modes/spec.md

## Progressive

`runFormulaProgressive` (`src/systems/checkRoll.js`) reports `success: true` for every completed roll that reaches a dice engine, however low the total, because a progressive award spends the rolled value against result difficulties rather than gating pass/fail on a DC; there is no low-roll failure branch to hit.
The ONLY reachable progressive failure — for crafting, salvage or gathering alike — is `success: false` from the roll itself rejecting, in the dice-engine `catch` (`checkRoll.js:1029-1037`).
A "progressive failure" test scenario must therefore be driven by a dice-engine rejection, never by an authored low roll, and this holds equally for progressive salvage.

Canonical mapping: `resolutionMode: "progressive"`; `runFormulaProgressive` in `src/systems/checkRoll.js`

Spec reference: openspec/specs/resolution-modes/spec.md

## Alchemy

Routing + check-ness are driven by the SYSTEM-level **`alchemy.checkMode`** ∈ { `none`, `simple`, `tiered` } (issue 554 — the retired per-recipe `resultSelection.provider` is gone).
**None**: one set + one result group, no check, always succeeds.
**Simple**: mandatory `craftingCheck.simple` pass/fail — pass → success group, fail → the reserved `ResultGroup.role: 'failure'` group (produced only when non-empty; a matched fail is a genuine outcome + a discovery, NOT a fizzle; consumes via `alchemy.consumeOnFail`; learns regardless of pass/fail when `learnOnCraft`).
**Tiered**: identical to `routedByCheck` (mandatory `craftingCheck.routed`; success tiers route via `checkOutcomeIds`; a fail fizzles; no failure group).
Alchemy recipes always have exactly one ingredient set — the editor forces a single set, so `Recipe._deriveComplex` never fires for alchemy and there is no Complex/multi-set toggle.
The reserved failure-group result is NEVER surfaced to the player workbench Produces panel (leak invariant).
**Visibility is reveal-not-gate** (issue 563): the system `visibilityMode` selects which source REVEALS a recipe in the player's **Known recipes** panel ("Known" ≈ _revealed to you_) — `global` = brew-discovery, `item` = a held book/scroll, `knowledge` = learned, **Manual** (alchemy's display name for the stored `restricted` mode, distinct from the respawn/override/revealMode/learn/restock/stamina uses of "Manual") = a per-recipe GM access grant — with brew-discovery (`learnOnCraft`) unioned across all modes; but brewing is NEVER gated by visibility (a matched ingredient signature is the sole brew gate, so `guardCraftStart` returns `craftable: true` for a non-GM regardless of reveal).
Non-revealed recipes stay count-only (`undiscoveredCount = valid − revealed`).

Canonical mapping: `resolutionMode: "alchemy"`, `alchemy.checkMode`, `visibilityMode`; `ResolutionModeService._resolveAlchemyResultGroups`; `CraftingEngine._resolveAlchemySimpleFailure`; `RecipeVisibilityService.evaluateRecipeAccess` (alchemy branch); `AlchemyListingBuilder`; `migrateAlchemyCheckMode.js`

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/ui-crafting-app/spec.md, openspec/specs/ui-entity-editors/spec.md

## Legacy Resolution Mode (`mapped` / `tiered`)

They are **not live modes** and have no runtime, editor, or validation branch: they are accepted **only as one-time migration inputs**.
The `1.4.0` hard migration converts persisted/imported `mapped → routedByIngredients` (carried verbatim — mapped routing is byte-identical to `IngredientSet.resultGroupId`, so **no provider is seeded**) and `tiered → routedByCheck` (**no provider seeded** either — the routing basis is now a property of the mode), and for former-`tiered` recipes reconciles routing by renaming each routed `ResultGroup.name` to the `outcome` that mapped to it (fan-in splits the group into per-outcome clones; an orphaned outcome is logged and left as a craft-time misconfiguration; an unrouted group keeps its name; a reserved-keyword outcome drops to the failure path without renaming any group), then **drops `outcomeRouting`**. (Before the routed split this migration seeded `resultSelection.provider` — historically the now-removed `macroOutcome` alias, later `check`; the split drops per-recipe routed providers entirely, and any upgrading world whose earlier pass already wrote a stray provider is reconciled by the one-time routed-split migration — see **Resolution Mode Change (migration-first)** and **Legacy Result-Selection Provider Removal**.)
A normalized `ResultGroup.name` collision that cannot be avoided makes the recipe **unmigratable** — it is removed (with the established startup cleanup passes and a JSON log) rather than cascaded through the live `deleteRecipe`, because a pure JSON-payload migration cannot call the live-document cascade.
A narrow read-time **token** normalizer also maps un-migrated/imported data to a first-class mode — bare `routed → routedByIngredients`, `mapped → routedByIngredients`, `tiered → routedByCheck` (`routed` is no longer a landing/output token, matching the one-time migration's tie/zero default); no legacy routing algorithm is retained.
The migration is pure, idempotent, and version-gated.

Canonical mapping: `migrateLegacyResolutionModes.js` (`1.4.0` in `MigrationRunner`); `CraftingSystemManager._normalizeResolutionMode` token alias

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/destructive-changes-and-migrations/spec.md

## Legacy Result-Selection Provider Removal (`1.6.0`)

It rewrites `resultSelection.provider` `macroOutcome | rollTableOutcome → check` at the recipe level, on every `steps[].resultSelection`, and on alchemy recipe-level (no-`steps[]`) recipes.
`macroOutcome → check` is lossless (both route by the crafting-check outcome name); `rollTableOutcome → check` is **lossy** — the table-draw mechanism is gone, so `rollTableUuid` is DROPPED and the affected recipes/steps are collected into a recovery-warning payload for manual reconfiguration.
Routed gathering tasks (`gatheringConfig.systems[*].tasks[*]`) lose their now-unsupported per-task `resultSelection`; the stripped tasks join the same payload, which instructs the GM to populate `gatheringCraftingCheck.routed.rollFormula` so routed gathering resolves via the system check formula.
The payload rides the runner's transient-field pattern (mirroring `_migratedCatalystCount`): captured in the summary, surfaced once to the GM, then stripped so it is never persisted.
Pure, idempotent, by-reference, version-gated.

Canonical mapping: `migrateRemoveResultSelectionProviders.js` (`1.6.0` in `MigrationRunner`); recovery notice via `migrationRecoveryPrompt.js` in `src/bootstrap/migrations.js`

Spec reference: openspec/specs/destructive-changes-and-migrations/spec.md, openspec/specs/resolution-modes/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Resolution Mode Change (migration-first)

A GM confirms; the confirm dialog runs a pure **dry-run** (`classifyModeChange`, no mutation) and reports accurate migrate/delete counts — when nothing will be deleted the copy must not mention deletion (two distinct lang keys: `ResolutionModeChangeContent` vs `ResolutionModeChangeContentDelete`).
The merged system (new mode) is **persisted FIRST**, so recipe migration/validation read the new mode through the in-memory `systems` map, then each recipe is run through `migrateRecipeForModeChange(recipeJSON, fromMode, toMode, system)` per the normative **5×5 migratability matrix** (rows = source, columns = target `simple` / `routedByIngredients` (RI) / `routedByCheck` (RC) / `progressive` / `alchemy`): no target seeds a per-recipe `resultSelection.provider` (retired for the system-level `alchemy.checkMode`, issue 554) — migrating _into_ `alchemy` `clear`s any stale `resultSelection` and collapses a multi-**ingredient-set** recipe to its first set (best-effort, single `console.warn`), while the system-level `alchemy.checkMode` is seeded separately by the startup migration (default `none`); `clear` sets `resultSelection` to `null` for every other target too (a no-op for the routed modes, which never carry one); `carry` verbatim into a structurally-identical target (`RI↔RC`, or alchemy↔routed survival); `reconcile` (a `reconcile: true` flag on `ModeChangeResult`) when a carried/cleared recipe's routing data is stale for the new basis — entering `routedByCheck` from any source, or `RC → RI` — so the recipe survives but is surfaced as a re-authoring validation issue, never silently mis-routed.
**`RI↔RC` never deletes** (`carry`, with `reconcile` for the stale direction).
A recipe is **deleted ONLY** for a per-recipe **structural** constraint of the target mode: narrowing into `simple`/`progressive` (which require **1×1** — exactly one ingredient set and one result group) from a non-1×1 recipe, or moving a multi-step recipe into `alchemy` (no multi-step support).
**System-level gaps never delete or disable** here — they are surfaced by the System Validation aggregator as `blocks:'system'` issues that gate visibility, not deletion.
Migrated recipes persist on structural validity alone (`updateRecipe(..., { allowIncomplete: true })`).
Standard clean-up (runs, learned entries, progressive ordering prefs) applies only to deleted recipes; in alchemy the signature reconciliation (disable colliding recipes) re-runs **only** on mode-into-alchemy.
An edit to an already-`alchemy` system that would introduce a collision is **hard-blocked before persist** (the #99 behavior, `_assertNoAlchemySignatureCollisions`), not reconciled-after — so there is no longer a separate component-list-edit reconcile branch.
Notifications are aggregated (one migrated summary, one deleted-recipes warning when any were deleted) with a single `recipesChanged` emission.
The migration helper is pure and reuses the `_clone` idiom from `migrateLegacyResolutionModes.js` (it no longer seeds an alchemy provider; `_seedProvider` survives only for the recipe editor's per-recipe seeding path, retained but off the mode-change pass).

Canonical mapping: `migrateRecipeForModeChange`/`classifyModeChange` in `src/systems/migrateRecipeForModeChange.js`; `CraftingSystemManager.updateSystem`/`_migrateRecipesForModeChange`/`_assertNoAlchemySignatureCollisions`; `adminStore.setResolutionMode` dry-run

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/destructive-changes-and-migrations/spec.md, openspec/specs/recipe-visibility/spec.md

## System Validation

`evaluateSystemValidation(system, { recipes, environments, components })` → `{ issues, counts, blocksSystem }`.
Each issue is `{ kind: 'recipe'|'environment'|'task'|'event'|'salvage'|'system', entityId, entityName, severity: 'critical'|'warning'|'info', blocks: 'enable'|'visibility'|'system'|undefined, code, message, nav: { view, tab? } }`.
It **composes** the existing per-entity readiness evaluators (recipe / environment / salvage / signature) — rebuilding the admin-store **projected** shapes the editors pass (so #431's routed `unroutedResultGroup`/`unproducedOutcomeTier` warnings surface) — and **re-tags** each issue with `kind`/`entityId`/`nav`, then adds the NEW **system-blocker** checks keyed on system fields (each `blocks:'system'`): a `routedByCheck` system with no usable crafting check (unconditional — every recipe in the mode routes by the check, so the blocker holds even with zero recipes, computed with no recipe scan); progressive mode with no progressive check or no component with `difficulty >= 1`; `multiStepRecipes` left on in alchemy mode; and (subsuming **#99**) any `SignatureValidator.validateSystem` alchemy signature collision.
These system-blockers are **distinct** from #431's per-recipe routed _warnings_ (those stay `severity:'warning'` with no `blocks`).
`blocksSystem` is true iff any issue is `blocks:'system'`.
Pure: no `game`/`ui`/`Hooks`, no store reads, no I/O — reusable from both the synchronous visibility hot-path and the GM overview view.

Canonical mapping: `evaluateSystemValidation`/`computeSystemVisibility` in `src/systems/systemValidation.js`; composes `evaluateRecipeReadiness`/`evaluateEnvironmentReadiness`/`ResolutionModeService.validateSalvage`/`SignatureValidator.validateSystem`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/resolution-modes/spec.md

## Recipe Activation Gate (`enableBlocked`)

The clone is load-bearing rather than defensive, because the signature scan reads only enabled recipes, so scanning the stored disabled recipe would filter the candidate out of its own scan and answer "not blocked" for a recipe the write then refuses.
Projected onto every GM recipe browser row as `enableBlocked`, and NOT derivable from `incomplete` (`validate()` false while `validateStructure()` true): a structurally broken recipe reads `incomplete: false` and still cannot be enabled, and a dangling essence reference, a tag placeholder, an unmet resolution-mode requirement and a signature conflict move it no further.
ONE predicate feeds the row's `Can't enable` pill, the row's `Incomplete` pill, the bulk panel's pre-flight count and the bulk write itself, so no two surfaces can disagree about one recipe.
`Can't enable` and `Incomplete` differ ONLY in whether the recipe is currently off, because the gate runs on a transition INTO the enabled state and an already-enabled recipe is therefore never refused anything.
EXACT for the persistence and completeness blockers.
A LOWER BOUND for the alchemy signature collisions a BATCH creates itself: two selected recipes that collide only with each other both answer "not blocked" against the pre-batch list, while the write enables the first and refuses the second, so a pre-flight count is worded as a lower bound and the post-apply report is the authority.
The recipe editor's enable TOGGLE is gated by a DIFFERENT predicate, `enableToggleBlocked` (`RecipeEditView.svelte`), and the two are INCOMPARABLE — neither bounds the other.
`enableToggleBlocked` is `!enabled && blocksEnable(readiness.issues)`, a FORECAST computed from `evaluateRecipeReadiness` rather than this gate itself, and readiness raises exactly seven blocking ids: `noName`, `noIngredientSet`, `noResultGroup`, `duplicateAlternative`, `duplicateRequirement`, `alchemyResultSelection`, `signatureCollision`.
It UNDER-reports: readiness does not run `_validateEssenceReferences`, `_validateTagPlaceholders`, `_validateResolutionMode` or `_validateEnabledEssenceReferences`, so a dangling essence reference, a tag placeholder, an unmet resolution-mode requirement or a DISABLED essence reference blocks activation while leaving the editor toggle live, in every resolution mode and not only alchemy (the ONE readiness counterpart to any of these is `alchemyResultSelection`, which independently mirrors alchemy's None/Simple single-success-group rule).
It also OVER-reports: `duplicateAlternative` and `duplicateRequirement` disable the toggle for a recipe this gate accepts, because no activation validator implements duplicate-match detection — a DEFECT tracked by #1067, and this sentence retires with it.
A third divergence, likewise an UNDER-report, is a DEFECT rather than design: readiness receives signature conflicts precomputed by `adminStore.getRecipeSignatureConflicts`, which substitutes the live draft into the enabled-scoped `SignatureValidator.validateSystem` WITHOUT forcing `enabled: true`, so — because `enableToggleBlocked` is consulted only while the recipe is off — the draft is filtered out of its own scan and the collision branch never reaches the toggle, the same self-exclusion the `enabled: true` clone above exists to prevent; tracked by #1066, and this sentence retires with it.

Canonical mapping: `RecipeManager.canActivateRecipe` over `_validateRecipeForActivation`; `RecipeActivationError`; `enableBlocked` on the GM recipe row projection in `adminStore`; `countBlockedRecipeEnables` in `src/ui/model/recipeBulkEditModel.js`; `enableToggleBlocked` in `src/ui/svelte/apps/manager/RecipeEditView.svelte` (the editor's enable-TOGGLE gate, a DIFFERENT predicate)

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-system-studio/spec.md, openspec/specs/ui-entity-editors/spec.md

## System Visibility Gate (two-tier)

It **never mutates any entity's stored `enabled` flag** (hiding is computed and **auto-restores** the moment the gap is fixed).
`computeSystemVisibility(system, { recipes, environments, components })` → `{ blocksSystem, hiddenEntityIds }` is the lightweight hot-path read (no localized messages / full overview rebuild).
**Tier 1 (system):** a `blocks:'system'` issue means the system exposes **NO** recipes to non-GM users in any list mode and the crafting guard rejects every craft against it.
**Tier 2 (entity):** otherwise only entities marked `blocks:'visibility'` (or an `enable`-disabled entity) are excluded for non-GM viewers; the rest stays listed/craftable.
**GM bypass:** a GM bypasses BOTH tiers — they must still see and reach a broken system/entity to fix it — gated on `game.user?.isGM` (an explicit bypass branch was added; none existed before).
The decision is computed at most **once per listing call (cached per system)**, not per entity, because listing is a synchronous per-render read.
Wired at `RecipeManager.getAvailableRecipes`, `game.fabricate.getAvailableRecipes`, and the gathering listing chokepoint (keeping the prior gathering `enabled` parity + GM bypass).

Canonical mapping: `computeSystemVisibility` in `src/systems/systemValidation.js`; `RecipeManager.getAvailableRecipes`/`_isSystemBlockedForRecipes`; `game.fabricate.getAvailableRecipes`

Spec reference: openspec/specs/recipe-visibility/spec.md, openspec/specs/data-models/spec.md

## GM System Overview

A separate **system-blocker banner** (a GM-only, full-width `role="note"` callout above the identity card in `SystemEditView`) appears only when `blocksSystem === true`. (Shipped in PR #452.)

Canonical mapping: `SystemOverviewView.svelte`, system-blocker banner in `SystemEditView.svelte` (PR #452)

Spec reference: openspec/specs/ui-system-studio/spec.md, openspec/specs/data-models/spec.md

## Environment Selection Mode

Canonical mapping: `GatheringEnvironment.selectionMode`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Task Resolution Mode

Canonical mapping: `GatheringTask.resolutionMode`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Gathering Resolution Mode (system-level economy)

It is distinct from both `CraftingSystem.resolutionMode` (recipe) and the per-task `GatheringTask.resolutionMode`: this is the system-level default for gathering, whereas Task Resolution Mode is the per-task choice.
Today only `d100` is honored at runtime; `progressive`/`routed` are modelled but unimplemented, surfaced disabled with a "Coming soon" affordance in the GM gathering economy UI.
It is GM configuration and is not part of the player gathering listing payload.

Canonical mapping: `gatheringConfig.systems[systemId].economy.resolutionMode`, `GatheringRichStateService.normalizeGatheringEconomy`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Result Selection Provider

The two routed crafting modes derive their routing basis from the system **mode**, not a per-recipe provider (see **Routed by Ingredients** → `IngredientSet.resultGroupId` and **Routed by Check** → system routed-check outcome), and carry no `resultSelection`.
Alchemy now routes on the SYSTEM-level `alchemy.checkMode` (`none` | `simple` | `tiered`, issue 554), not a per-recipe provider (see **Alchemy** and **Resolution Mode Change**); `resultSelection` survives only as an un-migrated read fallback that the `1.14.0` migration strips from every alchemy recipe.
The same engine-evaluated check-routing machinery is shared by `routedByCheck` **mode** and alchemy **`tiered`** check-mode — both key on the system's routed crafting-check outcome NAME (explicit `checkOutcomeIds` tier assignment wins).
As of #431 this check routing is **engine-evaluated at craft time** (no longer authoring-only): when the system's routed config carries a `rollFormula`, `CraftingEngine._runRoutedCheck` rolls it (via `runFormulaRouted`) and the final (post-step) tier NAME drives routing through `ResultGroup.checkOutcomeIds` (else name fallback); a usable routed check requires `routed.rollFormula`, and with no routed `rollFormula` there is no routed check path (the deprecated macro/builtIn routed resolution has been removed).
The **unrouted-tier diagnostic** (`ResolutionModeService._routeByTierAssignment`): when the routed outcome resolves to an authored success tier **and the recipe opts into tier routing** (at least one group declares `checkOutcomeIds`) but no group lists THAT tier's id, resolution surfaces a distinct `disposition:'unrouted-tier'` (empty groups) rather than silently falling through to name matching — disambiguating it from generic `misconfiguration`.
A purely name-routed recipe (no group declares any `checkOutcomeIds`), or an outcome that resolves no success tier, still falls back to outcome-name matching.
**Check-mode authoring safety (#431):** two non-blocking recipe-readiness _warnings_ (`recipeReadiness.collectRoutedCheckIssues`, fired only when `routingProvider === 'check'` — now **derived from the system mode**: `routedByCheck → 'check'`, `routedByIngredients → 'ingredientSet'`, with alchemy deriving `'check'` only in its `tiered` check-mode) flag a check-mode result group assigned no valid outcome tier (`unroutedResultGroup`) and an authored success tier no group produces (`unproducedOutcomeTier`, the backstop for the craft-time `unrouted-tier`), **but only for steps with MULTIPLE result groups** — a single-result-group step routes on the routed-by-check success/failure exemption and raises neither warning; each surviving warning carries a paired checklist entry and `target:'results'` deep link; and deleting a routed outcome tier strips its now-dangling id from every recipe's `ResultGroup.checkOutcomeIds` on save (`adminStore.saveCraftingCheckRouted` → `_stripDeletedRoutedTierIds`) with a GM notification of the count of result groups changed.
Gathering routed tasks carry **no** per-task result-selection provider: routed gathering is **system-check-formula only**, resolving via `gatheringCraftingCheck.routed.rollFormula` → outcome tier → result-group name match.

Canonical mapping: `resultSelection.provider`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/resolution-modes/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Failure Outcome

Absence means default feedback; authored values may be text or macro outcomes.
Invalid failure-outcome configuration is task misconfiguration, not a terminal player failure outcome.
It is **emitted by all THREE gathering-task rebuilds** — both library whitelist normalizers AND the engine-facing `_libraryTaskToRuntimeTask`, which is the object `_applyFailureFeedback` reads — where before issue 1098 it was emitted by none, so a GM-authored value was dropped on save and unread at roll time alike; the Checks Studio gathering On-failure section cross-references it read-only.
Distinct from **Failure Result Policy**, which answers whether a failed check PRODUCES an item at all: this one owns the text/macro feedback and nothing else.

Canonical mapping: `GatheringTask.failureOutcome`, `SpecialOutcome`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Reserved Failure Keyword

The canonical set spans three families: **fail** (`fail`, `failed`, `failure`, `f`), **miss** (`miss`, `missed`, `m`, `nothing`, `none`, `whiff`, `whiffed`), and **hazard** (`hazard`, `danger`, `complication`, `trap`, `oops`).
The hazard family now takes the failure path at runtime (it is no longer a tolerated-but-inert alias).
The **same single shared keyword set** drives `routedByCheck` mode's failure routing in crafting (and alchemy `tiered` check mode) and the routed-gathering equivalent (system-check-formula tier names), so the set must not be forked; a reserved keyword is also forbidden as a `ResultGroup.name` under `routedByCheck` mode and alchemy `tiered` check mode.
`fail` remains the preferred authored keyword for new content.
Distinct from **Failure Result Policy** and from an outcome TIER whose `success` is false: this is a tier-NAME convention, whereas the policy is what makes a failure-marked tier assignable at all.

Canonical mapping: `FAIL_KEYWORDS`/`MISS_KEYWORDS`/`HAZARD_KEYWORDS` + `isReservedRoutedName`/`normalizeRoutedName`/`isFailKeyword`/`isMissKeyword` in `src/utils/routedOutcomeKeywords.js` (the single source of truth); consumed by `Recipe.js` (via `isReservedRoutedName`) and wrapped as `_isFailKeyword`/`_isMissKeyword` in `ResolutionModeService`

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Failure Result Policy

A newly-created system defaults to `perRecord`; an absent or unrecognized value normalizes to `perRecord` on read (the **Tool-Breakage Authority** precedent); and the `1.25.0` migration seeds `never` onto every check that already exists, so no upgraded world changes behaviour.
It **SELECTS an authored failure output and never fabricates one**, so `always` on a record authoring none produces nothing — which is why `perRecord` and `always` share ONE runtime predicate and differ as GM-facing declarations of intent rather than as a second branch.
It is orthogonal to the failure CONSUMPTION axis (`recipes-and-steps` §Failure Consumption and Failure-Result Policy), which answers whether a failed attempt consumes; gathering carries the produce axis and no consume axis, and **Failure Outcome** continues to own its text/macro feedback through `_applyFailureFeedback`.
Its reach is bounded by what each mode's model can express: real on crafting `simple` and `alchemy simple` and on salvage `simple` (the reserved `role: 'failure'` group, selected BY ROLE and never by index — the retain-one clamp guarantees index 0 is the SUCCESS group); real on crafting `routedByCheck` and salvage `routed`, where — and only where — the policy permits, failure-marked outcome tiers become assignable in the recipe result-authoring UI and route with a `disposition: 'failure'`; inert on `routedByIngredients` and `progressive`, which have no tier to mark; and on gathering the whole path ships DORMANT pending issue 683.
**The policy therefore gates AUTHORING as well as resolution** — the tier picker, the readiness validator and the routing all read the same policy-conditional set.
Distinct from the **Reserved Failure Keyword**, a tier-NAME convention, and from an outcome TIER whose `success` is false: the policy is what makes the latter assignable.

Canonical mapping: `CraftingSystem.craftingCheck.failureResultPolicy` (and the salvage/gathering siblings); `CraftingSystemManager._normalizeFailureResultPolicy`, `normalizeFailureResultPolicy` in `src/utils/failureResultPolicy.js`; `CraftingEngine._produceCraftingFailureResults` / `_isFailureAwardDisposition`; `CraftingEngine._resolveSalvageResultGroups(…, disposition)`; `ResolutionModeService._resolveRoutedTierId`; `GatheringEngine._terminalSideEffectPlan` / `_commitTerminalSideEffects`; `routedSuccessTierOptions` / `routedOutcomeTierOptions` / `routedTierOptionsForPolicy`; `migrateSeedFailureResultPolicy`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/resolution-modes/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-system-studio/spec.md, openspec/specs/destructive-changes-and-migrations/spec.md

## Complication

It names what goes wrong, how severe it is, whether the player is told, which activities it applies to, the conditions that fire it, and two optional effects: a dice expression rolled to chat and a script Macro.
It is persisted TOP-LEVEL on the component beside `difficulty` and deliberately NOT under `salvage`, because the concern spans all three activities and `salvage` is one activity's sub-record — and because `salvage` is only valid when the salvage feature is on, which a crafting-output complication must not depend on.
Its conditions read the five stage buckets a progressive award produces (`full`, `partial`, `halted`, `unreached`, `skipped`), it fires AT MOST ONCE per component per resolution, and it is strictly DOWNSTREAM of the award: it never influences what was granted.
`visibility: 'gmOnly'` is a **disclosure** guarantee across every Fabricate surface and NOT a confidentiality one — `craftingSystems` is a world setting and replicates unfiltered, and the GM-only chat card does not narrow that: Foundry broadcasts a whispered `ChatMessage` in full to every client and `visible` is presentational only, exactly as it is for core's own Private GM Roll.
So a GM authoring a secret must understand the limit.
**`Complication.severity` (`minor` | `major` | `severe`) is a NARRATIVE-GRAVITY axis and is distinct from the two existing `severity` fields**: the System Validation report's `critical` | `warning` | `info` authoring diagnostics, and the startup notice channel's `warn` | `info`.
It must never be projected through a generic severity helper shared with either.
Distinct from a **Gathering Event** (next row), and distinct from the `complication` token in the four reserved routed failure-keyword sets, which governs result-group NAME matching only and is untouched: GM-facing copy therefore says "component complication" in full.
Complications on the salvaged or crafted SOURCE component are a separate, deferred concern (issue 1287).

Canonical mapping: `Component.complications`; `authoredComplications`; `planComplications` / `publicComplications` / `forecastComplications`; `fireComplications` / `gmComplications`; `createComplicationDeliveryWriter` / `routeComplicationDeliveryMessage`; `complicationSummary`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/resolution-modes/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/import-export/spec.md, openspec/specs/ui-crafting-app/spec.md, openspec/specs/ui-entity-editors/spec.md

## Gathering Event

A **Complication** is COMPONENT-scoped, attached directly to one component with no composition step, selected by the stage outcome a progressive award produced for that component, and fires across all three activities.
An Event answers "what else happened while you were out there"; a Complication answers "what went wrong with THIS thing".
Neither is a special case of the other, they are never merged, and a system may author both — which is exactly why the two rows sit adjacent: a GM seeing "Event" and "Complication" in one system must be able to tell them apart.
The 1.0.0 hazards-to-events rename moved the gathering vocabulary toward "Event" deliberately, and this feature does not reclaim it.

Canonical mapping: `GatheringEventDefinition`; `gatheringConfig.events`; `migrateRenameGatheringHazardsToEvents`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-system-studio/spec.md

## Visibility Gate

Canonical mapping: `GatheringVisibilityGate`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Gathering Time Requirement

Absence means immediate resolution during `startAttempt`; presence means a timed active `waitingTime` run that completes after world time reaches the derived gate.

Canonical mapping: `GatheringTask.timeRequirement`, `GatheringRun.timeGate`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Required Tool Display State

A tool is `damaged` when the only matching items carry `flags.fabricate.toolBroken === true`, or when no working item matches and the actor holds the tool's `onBreak.replaceWith` broken-variant target: either an item matching the Component identified by `replacementTarget: { type: "component", componentId }` (with legacy `replacementComponentId` read forward as that form), or an item whose live/source UUID references include the direct-Item `replacementTarget: { type: "item", itemUuid }`.
Holding both the working tool and a broken variant yields `present` (working-item precedence).
The `flagBroken` on-break action that sets `toolBroken` also appends a localized `" (broken)"` suffix to the owned item's display name (display-only; applied idempotently — never double-appended and never appended to an item already `toolBroken`-flagged; not auto-cleared by Fabricate).
The flag (not the name) stays the authoritative gate disqualifier, so this rename does not change classification on its own; but a managed component matched purely by name (no `registeredItemUuid`/fallback ids) stops matching its component once renamed, so a GM clearing the flag must also restore the original name to regain `damaged`-tier recognition.
This classification is **display-only**: it never relaxes the start-attempt tool gate, so an actor holding only the broken variant still fails attempt validation and the attempt stays blocked with `TOOL_BLOCKED`.

Canonical mapping: `classifyGatheringToolStates()` in `src/gatheringToolRuntime.js`; tool-state label `FABRICATE.App.Gathering.Detail.ToolState.damaged` = "Broken" in `lang/en.json`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Ingredient Display State

The essence variant reports `delivered`/`owned` in place of `have`, because an essence requirement is amount-based and not net of the consumption plan (issue 917) — the same rule the set's `essencePool.requirements` follow.
On every other variant `have` is re-derived by re-matching `availableItems` against the chosen option (`matchesItem` + `readStackQuantity`), NOT read from the solver's own plan/ledger, so it can diverge from what the plan actually reserves.
`hasChoice`/`choiceCount` are NOT produced by the state builder: `evaluateCraftability` tags them on afterward from the sibling `ingredientChoices` build, keyed by `groupId`.

Canonical mapping: `buildIngredientState()` / `buildEssenceIngredientState()` in `src/systems/recipeDisplayStates.js`, delegated through `RecipeManager._buildIngredientStates()` (`src/systems/RecipeManager.js`); `hasChoice`/`choiceCount` tagged by `evaluateCraftability()` from `_buildIngredientChoices()`'s output

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/recipes-and-steps/spec.md, issue #917

## No-Image Sentinel

The SAME literal is `resolveComponentImg`'s fallback for an unresolvable component — `GENERIC_ITEM_IMG` in `recipeDisplayStates.js`, `FALLBACK_COMPONENT_IMG` in `RecipeManager.js`, split across files by #1702 but each carrying a one-line comment naming the other.
The two MUST stay byte-equal: `resolveIngredientVisual`'s component branch composes them as `materialImg(componentImg(...))`, so an unresolvable component resolves to the fallback literal, which `materialImg` then recognises as the sentinel and nulls out — drift between the two constants would make the tile draw a literal bag icon instead of its glyph.
Pinned behaviourally, not by string comparison, in `tests/systems/recipe-display-states.test.js`.

Canonical mapping: `materialImg()`, `GENERIC_ITEM_IMG` (`src/systems/recipeDisplayStates.js`); `FALLBACK_COMPONENT_IMG`, `resolveComponentImg()` (`src/systems/RecipeManager.js`)

Spec reference: openspec/specs/ui-crafting-app/spec.md

## Inventory Broken Verdict

It answers **usability, not salvageability**, and deliberately does **NOT** gate the salvage surface — a broken salvageable tool is still salvageable, and recycling it is the most useful thing left to do with it.
It reads **TWO** sources, because brokenness has two: (1) the persisted past fact `flags.fabricate.toolBroken` — mode- and authority-agnostic, read through the shared `gatheringToolRuntime.isToolBroken`, and the source that matters most, since `flagBroken` is the only on-break action that leaves a broken item in an inventory at all (`destroy`/`replaceWith` remove it) and a `breakageChance`/`diceExpression` tool carries the flag with **no usage counter**; and (2) a projection of `limitedUses` usage exhaustion (`timesUsed >= maxUses`), **gated on `toolBreakage.authority !== 'checkDriven'`** — under `checkDriven` the active check decides breakage, per-tool modes are ignored, and their retained usage counters remain unchanged.
Reading source 2 alone renders nearly every visible broken tool intact; reading it ungated inverts the verdict on a usable one.
**Distinct from Required Tool Display State**, which answers a different question on a different surface and must not be collapsed into it: that one is per-tool-across-all-matching-items (any non-broken match ⇒ `present`) and adds a `replaceWith` broken-variant tier but projects **no** exhaustion; this one is computed from the row's single representative item and does project exhaustion.
Both are display-only and neither relaxes any engine gate.

Canonical mapping: `broken` in `InventoryListingBuilder._isToolBroken`; `isToolBroken` (`src/gatheringToolRuntime.js`); `FABRICATE.App.Inventory.Detail.BrokenBanner`

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/data-models/spec.md

## Gathering Evaluator Result

Check results may be neutral value-only results, terminal success/failure results that still retain the numeric value, or diagnostics for provider/configuration problems.
Diagnostics are not terminal player failure outcomes.

Canonical mapping: `GatheringGateAndCheckEvaluator`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Terminal Attempt Resolution

Each entry path supplies its own policy for every stage, built fresh per call rather than shared; a stage answering a refusal ends the pipeline through the shared `refuse` collaborator.
The domain distinguishes four refusal dispositions, not one: **blocked** (the general task-misconfiguration and run-creation-failure response), **cancelled** (an immediate attempt whose interactive roll prompt was dismissed), **cleared** (a matured run discarded with no terminal history written), and **cancelled-run** (a matured run discarded with terminal history written, which shares the word with the immediate disposition but is not it).
A persistence failure is never a refusal: it is reported as an error on the caller's own result (the matured paths throw and the caller collects the throw; the immediate path refuses only on a thrown write and passes a falsy return through unguarded), so the two failure families stay distinct.
A cancelled outcome can reach the pipeline only on the immediate path: on the matured path the policy throws instead of clearing the run, because a dismissed interactive roll on a timed run never reaches the engine at all (a cross-module invariant in `src/systems/journalRunCommands.js` filters a cancelled check result out beforehand), so the throw exists to fail loudly should that invariant ever break rather than to handle a reachable case.

Canonical mapping: `createGatheringAttemptResolution` (`src/systems/gatheringAttemptResolution.js`), driven by a matured policy (`GatheringEngine._prepareMaturedAttempt` / `_validateMaturedTask` / `_writeMaturedTerminalHistory` / `_commitMaturedTerminal` / `_refuseMaturedAttempt`) and an immediate policy (`_checkTerminalRunCreation` / `_composeRichTerminalHistory` / `_createTerminalRunHistory` / `_refuseImmediateAttempt`), sharing `_resolveTaskOutcome` and `_respondTerminalAttempt`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Environment Validation State

It contains localized summary text, field-addressable errors, a first-invalid target, and an attempt counter used to move focus after failed saves.
Save failures are validation or misconfiguration boundaries: draft edits remain dirty and are not persisted until corrected.

Canonical mapping: `adminStore.environmentValidationState`, `EnvironmentsTab.validationState`

Spec reference: openspec/specs/ui-system-studio/spec.md, issue #179

## Dirty Environment Draft

It is protected by discard confirmation before navigation, replacement by another environment/new/duplicate/system selection, gathering feature disable, or app close.
Declining preserves the dirty draft; accepting intentionally discards it or proceeds with the replacement/close.
Concurrent navigation shares one in-flight discard confirmation.
Persisted environment delete uses delete confirmation instead; unsaved new drafts use discard confirmation because no persisted environment exists to delete.

Canonical mapping: `adminStore.environmentDraftDirty`, `confirmDiscardDirtyEnvironmentDraft()`, `SvelteRecipeManagerApp.close()`

Spec reference: openspec/specs/ui-system-studio/spec.md, issue #179

## Player Gathering Store

It owns selected-actor UI state, `lastGatheringActor` preference writes, listing refresh state, start-in-flight state, `activeRuns`/`history` display state, and `lastResult` terminal feedback state; it delegates listing and attempts to runtime APIs and must not duplicate gathering domain rules or act as a domain service.
Immediate failed terminal attempts rely on runtime/configured failure feedback, so the store does not emit a second generic failure warning.

Canonical mapping: `createGatheringStore()`, `SvelteGatheringApp`, `GatheringAppRoot`

Spec reference: openspec/specs/ui-gathering-app/spec.md, issue #179

## Check Modifier

The library is reduced over an eligible id set under a **COMBINATION RULE** persisted as **`defaultModifierPolicy`**, and the resulting scalar is added to the check roll automatically (issue 1094): there is no placeholder for a GM to author and none to forget.
Since issue 1308 the LIBRARY is a **world** record (`characterLibraries.modifiers`) while the SELECTION stays on the crafting system — crafting, salvage and gathering each select over the SAME library through their own `{defaultModifierPolicy, defaultModifierIds, maxModifierPicks?}` triple, so what a system owns is which entries apply and how they combine, never the entries themselves — and since issue 1117 that library is ALSO the one gathering drop rows and events reference (see **Character Modifier**: the same entries, applied as a percentage-point / multiplicative shift on a d100 chance rather than as an additive term).
A ROLL-SHAPED expression is legal EVERYWHERE, a check included (issue 1118): a check appends a rolling entry to its formula AS DICE, so the authored variance survives to the roll, appears in `roll.dice`, animates and shows on the chat card.
The blocking `modifierRollExpression` issue 1117 raised is RETIRED, because there is nothing left to report about an entry that rolls.
**The SYSTEM owns both axes outright** (issue 1055): a recipe never overrides the rule, and never substitutes its own eligible set except where the rule itself says so.
**The rule states BOTH how the values reduce AND who selects them, at four values** — `addAll` (sum the system's own `defaultModifierIds`; nobody selects), `highest` (the single highest-AVERAGING entry of that same set; nobody selects), **`bySubject`** (the record being resolved selects, at authoring time — labelled "By recipe" / "By component" / "By gathering task" from the activity), `playerPicks` (the PLAYER selects, at roll time).
**SELECTION TIME is the distinction the rule name carries and no separate field records**: `bySubject` and `playerPicks` are the two _selecting_ rules (`policyDefersSelection`), differing only in who is asked and when — which is why `bySubject` is a first-class rule and not a delegation of authority (a subject chooses WHICH modifiers apply, never HOW they combine), and why only `playerPicks` ever prompts (by roll time a `bySubject` selection is already made and stored, so prompting would re-ask an answered question).
The pre-1095 spelling `byRecipe` is a legacy READ alias accepted by `normalizeModifierPolicy` and NEVER re-emitted; the `1.22.0` migration rewrites it.
**The SUBJECT's pick** — `Recipe.craftingModifier.modifierIds` on crafting, `Component.salvage.checkModifierIds` on salvage, `GatheringTask.checkModifierIds` on gathering (see **Modifier Pick Subject**) — is consulted **only** under `bySubject`; under the other three rules a stored pick sits on disk unread — a real behaviour change from the pre-1055 resolver, which preferred a recipe's own set under every rule.
An AUTHORED EMPTY pick (`[]`) is a real pick under `bySubject` — zero eligible modifiers, so nothing is added to the roll — distinct from an absent one, which inherits; the two are told apart by `Array.isArray` at the point of authoring, never by the filtered array's length.
A legacy recipe-level `policy` key is never consulted (`resolveModifierPolicy` reads only the system field), is dropped by `Recipe._normalizeCraftingModifier` on read, and is left on disk by migration until then.
**`maxModifierPicks`**, carried by each activity check independently, bounds the two selecting rules and is inert under the other two: a positive integer, or ABSENT meaning UNLIMITED (`Infinity` at `resolveMaxModifierPicks`, the single point that decides what absence means, so a check never asked the question cannot silently acquire a bound that truncates subject picks already on disk).
It is a property of those two rules, not an orthogonal axis over them — it names no new party and bounds one already named by the rule — and it is stored system-wide regardless of the current rule so flipping between them does not destroy it.
**The two RANKING rules — `highest`, and `playerPicks` on every non-interactive path — order entries by the DETERMINISTIC AVERAGE of their expressions** (`reduceRollExpression`), so `1d4` (2.5) beats a flat `+2`, the winner is the same on every attempt, no hidden roll is spent to find it, and the winner is appended AS DICE so ranking deterministically never flattens what it selects; the average is exact for arithmetic, plain dice and keep/drop dice (order statistics), and an explicit approximation for a `min`/`max` around a die, for a pool's members and for the remaining die modifiers — it RANKS and never PAYS.
**Both selecting rules SUM what was picked**, so a cap of 1 reproduces the historical single-pick behaviour exactly; under `bySubject` the cap TRUNCATES the resolved list (first N in authored order, enforced at `resolveEligibleModifierIds` and not only at the picker, so lowering it neither over-rolls nor deletes a subject's stored picks), while under `playerPicks` the eligible list is the full menu OFFERED and the cap bounds the player's selection from it.
`addAll`, `highest` and `bySubject` resolve **deterministically**: the contribution is **APPENDED** **before** the formula reaches Foundry's `Roll`, as ONE flavoured `+ N[Modifiers]` term carrying the FLAT sum plus one `+ (…)[Modifiers]` term per ROLLING entry in eligible order (the flat term leads, so a library with no dice emits the byte-identical formula it always did; one term per rolling entry keeps the dice attributable and contains a refused fragment to its own entry).
The flat term uses the same `appendToolBonusTerms` emit that applies tool bonuses — sign-aware (`Constant` is unsigned, so the `sign` + `Math.abs` split is required), label-sanitized, SKIPPED at a value of 0, and formatted decimal-safe so an exponent-notation or non-finite value skips the term rather than emitting something the grammar cannot parse.
A rolling fragment is ALWAYS parenthesised before its flavour is attached, because an authored expression may carry its own (`1d4[fire][Modifiers]` is a syntax error on 14.365 where `(1d4[fire])[Modifiers]` rolls), and each assembled fragment is validated with `Roll.validate` so a refusal blocks THAT ENTRY alone rather than throwing inside `new Roll(...)` as a rolled, therefore consuming, failure.
The `[Modifiers]` label is a fixed ASCII literal and deliberately NOT localized, because `parsePlainDiceGroups` tokenizes on flavour brackets and a localized label containing a `\d*d\d+` token would be read as a phantom crit-eligible die group.
Both paths build the context through the one shared `buildCheckModifierContext(system, activity, subject)`, so the eval path (`checkRoll.js` `evaluateCheckRoll`) and the display path (`resolveCheckFormulaDisplay`) cannot disagree, and a missing/failed expression contributes 0, never NaN.
The `activity` argument is load-bearing: the library is shared but the SELECTION is not, so an arity-2 call resolves one activity's formula against another's rule.
`playerPicks` is the one rule deferred to roll time: the engine builds a choice descriptor (`{modifiers: [{id,label,icon,value,formula,average,display}], maxPicks, defaultSelectedIds, defaultSelectedId}`, where a rolling option carries `value: null` plus its clamped roll `formula` and a `display` chip showing what it will ROLL rather than the average it is merely ranked by) only when the call is interactive AND the active mode carries an authored (post-shim) roll formula AND the rule is `playerPicks` AND at least two modifiers are eligible, and the deferred slot renders in the interactive roll prompt as a radio group at `maxPicks === 1` or a capped checkbox group above it, whose picks SUM into the appended term before the advantage transform, the situational-bonus append, and `Roll`.
The pre-selection is the **best legal selection** (the highest-AVERAGING `maxPicks` modifiers, tie-broken by eligible-set order), so simply confirming the prompt reproduces the deterministic contribution exactly.
Every other case — a non-interactive/API/macro/headless craft, an unauthored formula, fewer than two eligible modifiers, or a prompt confirmed without a selection — falls back to that same best legal selection (`highest` at a cap of 1, everything when unbounded), so the contribution is always resolved; the prompt's own cap is a UI affordance re-imposed by `evaluateCheckRoll`, never the invariant.
The pre-roll dialog is the single place shown != evaluated: the deferred slot renders as a trailing `+ (modifier)[Modifiers]` term because the value is unknown until the player picks (and `cleanHTML` forecloses a live-updating preview), while the posted roll, its chat flavor (suffixed with one bullet-joined segment of the chosen labels) and the run journal all carry the appended formula.
**The `@craftingmod` placeholder is RETIRED** (issue 1094): the `1.21.0` migration strips it from every stored roll formula, and `stripRetiredModifierPlaceholder` removes any survivor at roll time and inside the usability readers, deciding a NON-ADDITIVE placement positionally rather than by `Roll.validate` — which ACCEPTS `max(, 2)` and would roll `-Infinity`.
**`min` / `max` clamp ONE entry's contribution**, and a bound means the same thing under every rule: the resolved value for a flat expression, and the ROLLED result for a rolling one, the latter expressed IN THE FORMULA as `min(max((1d8), -1), 6)` — one roll, dice still visible on the card, and a maximum of +6 meaning exactly that.
Verified against the shipped 14.365 dice stack (`CONFIG.Dice.functions` is `{}` so `min`/`max` reach `Math.min`/`Math.max`, `FunctionTerm` evaluates a dice argument rather than stringifying it, and `FunctionTerm#dice` bubbles the inner die into `Roll#dice`), recorded in `tests/helpers/recordedModifierRollShapes.js`.
Both are absence-preserving exactly as `maxModifierPicks` is (only a FINITE number is attached, and `null` / `''` / `[]` are guarded explicitly because `Number()` reads all three as `0` and `0` is a real bound); absence means unbounded on that side.
An authored `min > max` is preserved verbatim rather than reordered, is the BLOCKING readiness issue `modifierBoundsInverted`, and makes that entry contribute exactly 0 until it is repaired — deliberately the same refuse posture `INVALID_CHARACTER_MODIFIER_BOUNDS` already takes for gathering drop modifiers.
**CRAFTING and SALVAGE build a choice** under `playerPicks`, through the one shared `_buildInteractiveModifierChoice`; **GATHERING builds none** — it threads the context through both formula-rolled runners and resolves a `playerPicks` selection through the deterministic best-legal-selection, with the roll-time prompt deferred to issue 683 alongside the rest of the seam, and its `d100` mode rolls no formula so the selection is inert there with cause `noModifierSupport` — the d100 against each drop's chance IS that mode's check, so the cause names the absent modifier seam rather than denying the mode rolls.

Canonical mapping: `checkModifierResolver.js` (`isRollExpression`, `resolveCheckModifierContribution`, `resolveSelectedCheckModifiers`, `resolveEligibleModifierIds`, `resolveMaxModifierPicks`, `resolveModifierBounds`, `clampModifierValue`, `policyDefersSelection`, `appendResolvedCheckModifier`, `buildCheckModifierContext`, `buildCheckModifierChoice`, `normalizeModifierPolicy`, `MODIFIER_POLICIES`, `resolveActiveSalvageCheckFormula`, `resolveActiveGatheringCheckFormula`), `CraftingSystem.modifiers`, `craftingCheck` / `salvageCraftingCheck` / `gatheringCraftingCheck` `.defaultModifierPolicy` / `.defaultModifierIds` / `.maxModifierPicks`, `Recipe.craftingModifier`, `Component.salvage.checkModifierIds`, `GatheringTask.checkModifierIds`, `normalizeModifierLibrary` in `src/systems/modifierLibrary.js`, `CraftingSystemManager._normalizeCheckModifierSelection` / `._characterLibraryBasis`, `normalizeCheckModifierSelection` in `src/systems/normalize/craftingCheck.js`, `resolveModifierLibrary` in `src/systems/characterLibraries.js`, `src/utils/checkModifierPicks.js`, `src/migration/migrateSystemCheckModifierCatalogue.js`, `src/migration/migrateUnifyModifierLibraries.js`, `src/migration/migrateMaxModifierPicks.js`, `CraftingEngine._buildInteractiveModifierChoice`, `CraftingListingBuilder`, `toolCheckBonus.js` `appendCheckModifierTerm` / `appendCheckModifierRollTerms`, `src/utils/rollExpressionAverage.js` `reduceRollExpression`, `craftingCheckExpression.js` `stripRetiredModifierPlaceholder`, `src/migration/migrateRetireCraftingModToken.js`, `checkRoll.js` `resolveModifierSelection`, `promptCheckRoll` `modifierChoice`, `CraftingModifierCatalogueCard.svelte`, `RecipeOverviewTab.svelte`

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/data-models/spec.md, openspec/specs/destructive-changes-and-migrations/spec.md, openspec/specs/import-export/spec.md, openspec/specs/ui-entity-editors/spec.md, openspec/specs/ui-world-scope/spec.md

## Modifier Library

It is authored on exactly ONE surface (System settings › Modifiers, relocating to a World route in the follow-up to issue 1308) and read by every consumer: each of `craftingCheck`, `salvageCraftingCheck` and `gatheringCraftingCheck` decides which entries apply and how they combine through its own selection triple, and every gathering drop row, event and stamina cost references entries by `modifierId`.
**The pairing this row used to carry is RETIRED** (issue 1117): it named a "Check Modifier Catalogue" against a "Gathering Character Modifier" as two libraries told apart by name, and that was the absence of a home rather than a design — the two shapes were near-identical, nothing in the domain distinguished them, and a GM could define Medicine twice as unrelated records that silently disagreed.
**What survives is a distinction of APPLICATION, not of library**: a check appends its eligible entries as ADDITIVE `[Modifiers]` terms on a roll formula, while a gathering reference applies a percentage-point delta or a multiplicative factor to a d100 drop chance.
Those arithmetics stay incompatible, so an entry is a shared definition and never a shared application, and the SECTIONS keep distinct names for that reason — "Check modifiers" on a Checks route (it authors a selection), "Character modifiers" on a drop row or event (it authors a reference), and plain "Modifiers" on the library itself (it is neither).
**A ROLL-SHAPED expression is legal for BOTH consumers** (issue 1118): a drop row evaluates it and shifts a chance, and a check appends the dice to its roll formula.
`isRollExpression` is therefore a DISPLAY classification and never a gate; the blocking `modifierRollExpression` readiness issue is RETIRED.
The list has moved THREE times: `craftingCheck.checkModifiers` before `1.22.0`, `CraftingSystem.checkModifiers` between `1.22.0` and `1.23.0`, and `CraftingSystem.modifiers` between `1.23.0` and `1.28.0` — the last move being to WORLD scope (issue 1308), because an expression evaluated against the acting character is not a fact about a crafting system and three systems meant three copies of Medicine that could drift apart.
**ABSENT IS NOT EMPTY since that move**: an unwritten world setting reads back as the registered default, so emptiness alone cannot say whether the GM emptied the library or never wrote it, and the store's raw-key-presence predicate (`isSeeded()`) is what makes the difference decidable — see **Valid Id Basis**.
A read RESOLVES the union of the world library and a crafting system's surviving legacy copy, so an unmigrated player or assistant GM still resolves every `modifierId`; that union is bounded by the `1.28.0` migration and is not a permanent read-alias — it is the shipped instance of a **Read Union**.

Canonical mapping: `characterLibraries.modifiers`, `normalizeModifierLibrary` in `src/systems/modifierLibrary.js`, `CharacterLibrariesStore`, `resolveModifierLibrary` in `src/systems/characterLibraries.js`, `checkModifierResolver.js` (`isRollExpression`, `buildCheckModifierContext`), `src/utils/rollExpressionAverage.js`, `GatheringRichStateService._systemModifierLibrary`, `SystemEditView.svelte`, `src/migration/migrateSystemCheckModifierCatalogue.js`, `src/migration/migrateUnifyModifierLibraries.js`, `src/migration/migrateCharacterLibrariesToWorldScope.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/resolution-modes/spec.md, openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/destructive-changes-and-migrations/spec.md

## Modifier Pick Subject

The rule's meaning is activity-independent — "the record being resolved picks, at authoring time" — which is why the token is `bySubject` and only its LABEL varies ("By recipe" / "By component" / "By gathering task").
All three obey ONE authoredness rule: an AUTHORED EMPTY array is a real pick of zero (nothing is appended), an ABSENT one inherits the activity's `defaultModifierIds`, and the two are told apart by `Array.isArray` AT ENTRY rather than by the filtered array's length — so a malformed member cannot flip an authored empty set back to inherit.
All three are truncated to `maxModifierPicks` at the resolver, not only at the picker.
`GatheringTask` alone is normalized by THREE whitelist rebuilds and ALL THREE must emit the key: the two mirrored LIBRARY rebuilds plus the engine-facing `_libraryTaskToRuntimeTask`, whose failure mode is distinct — the pick persists correctly and both library rebuilds agree, but it is never read at roll time, so `bySubject` can be silently and wholly broken on gathering even when the two-rebuild reading is satisfied.

Canonical mapping: `src/utils/checkModifierPicks.js`, `Recipe._normalizeCraftingModifier`, `CraftingSystemManager._normalizeSalvage`, `normalizeSalvage` in `src/systems/normalize/salvage.js`, `normalizeLibraryTask` (`GatheringRichStateService.js`), `_normalizeGatheringTask` (`adminStore.js`), `_libraryTaskToRuntimeTask` (`GatheringRichStateService.js`), `resolveEligibleModifierIds`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/resolution-modes/spec.md

## Recipe Check Tier

A recipe carries NO numeric DC of its own.
It names a tier or it names nothing, and naming nothing is the real instruction "use the check slot's default DC" rather than an absence.
Distinct from an **Outcome Tier**, which bands a routed check's roll RESULT: the check tier is an input to the roll while the outcome tier reads its output, and the bulk panel states that on screen because the two are easy to conflate.
The axis exists only where the system's check has recipe-level tiers to offer, and where it does not the surface names WHICH of four reasons applies instead of hiding the control: a progressive system puts difficulty on each result component, a dynamic simple DC is resolved at craft time, a fixed-type routed check takes per-recipe difficulty from the recipe's minimum success tier instead, and a check that authors no tiers leaves every recipe on the default DC.
None of those four is the same fact as the system having no usable crafting check at all, which the recipe row's own check pill reports, and the two are never conflated.
A bulk write REJECTS a tier id this system does not author, before it mutates anything; the single-recipe editor write tolerates a dangling id and falls back to the default DC at resolution time, because one recipe is a smaller blast radius than a whole selection.

Canonical mapping: `Recipe.checkTierId`; `craftingCheck` slot `tiers[]`; `resolveRecipeCheckTierOptions` in `src/utils/routedOutcomeKeywords.js`; `describeRecipeCheckTierAxis` in `src/ui/model/recipeBulkEditModel.js`; `CraftingSystemManager._resolveBulkCheckTierId`; `RecipeOverviewTab.svelte`

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/ui-system-studio/spec.md, openspec/specs/ui-entity-editors/spec.md

## Player Crafting Projection

A `CraftingListingBuilder` (the crafting analogue of the gathering listing builder) projects the existing crafting backend (`RecipeManager`/`RecipeVisibilityService`/`ResolutionModeService`/`CraftingSystemManager`) into `RecipeListingModel`s.
It is one-directional and Foundry-global-free: it never mutates state and resolves GM and player viewers through ONE code path, so the visibility service's GM bypass is honoured everywhere.
It projects only `access.visible === true` recipes; each model carries `modeToken` + a localized `modeLabel` (the raw `simple` token is never surfaced), a `browseStatus`, per-set `ingredientSets[].craftability` (essences + per-set Tools + actor-bound currency probe, folded by `evaluateCraftability`), an optional `check` descriptor (`usable` derives from an authored `rollFormula`, not the `enabled` flag), `outcomeTiers` (populated only for `routedByCheck`, success tiers only), and `result`.
Under Discovery Mode (`listMode === 'teaser'`) an undiscovered recipe shown to a non-GM is teaser-redacted: every `teaserState.hiddenFields` field (default `ingredients`/`results`/`description`) is dropped and only a generic identity + the `discovery` status surfaces.
Since issue 1091 this is the DETAIL PHASE of a two-phase read side (see **Crafting Read Phases**): the cheap **Summary Projection** is what a browse surface pages, filters and counts, and the two MUST agree about teaser redaction and about a row’s **Crafting Browse Status** — a recipe that is a teaser in the list and not in the inspector is a disclosure either way round.
Since issue 1075 it is NOT what `game.fabricate.listCraftingForActor()` returns: that seam serves **Summary Projection** rows, and a rich model is reached only through the per-recipe detail seam `game.fabricate.hydrateCraftingRecipe()` → `CraftingListingBuilder.buildRecipeDetail`, one recipe at a time.
Because that seam takes a recipe id supplied by a client, it re-resolves every gate the summary phase applied — the system block for a non-GM, the `enabled` gate and the visibility evaluation — and answers `null` rather than a redacted model for a recipe the viewer may not see.

Canonical mapping: `CraftingListingBuilder`, `RESOLUTION_MODE_LABEL_KEYS`, `CRAFTING_BROWSE_STATUS`; `RecipeVisibilityService.isKnowledgeItemExhausted`; `CraftingListingBuilder.buildRecipeDetail` behind `game.fabricate.hydrateCraftingRecipe()` — NOT `listCraftingForActor()`, which serves summaries since issue 1075

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/data-models/spec.md

## Crafting Browse Status

`discovery` is the Discovery-Mode teaser-redacted state (player copy "Undiscovered"); `incomplete` is deliberately NOT a player status, because an unfinished recipe is either visible-and-projected or filtered out upstream.
Precedence (highest first): teaser → `discovery`, locked → `locked`, unlearned knowledge → `unknown`, recipe-item uses exhausted → `exhausted`, materials missing → `missingMaterials`, else `available`.
The `exhausted` status reads `RecipeVisibilityService.isKnowledgeItemExhausted` (item-limited knowledge owned but every matching item capped); owning no matching item is `unknown`, not `exhausted`.
Since issue 1091 the vocabulary AND the precedence rule live in ONE import-free leaf, `src/ui/presenters/craftingBrowseStatus.js`, so the detail model and the **Summary Projection** the page rows are built from cannot label the same recipe differently; `CraftingListingBuilder` re-exports the vocabulary and delegates the rule.
`materialsAvailable` is a TRISTATE there — `false` is a material check that ran and came back short, `null`/absent is no check at all, and only `false` yields `missingMaterials` — so a surface holding no inventory (the GM browser projects definitions, not one actor’s view of them) does not paint every row short of materials.
Exhaustion is a PLAYER-only term: a GM bypasses the knowledge gate, so a GM-audience row is never `exhausted`.

Canonical mapping: `CRAFTING_BROWSE_STATUS` and `deriveBrowseStatus` in `src/ui/presenters/craftingBrowseStatus.js` (re-exported as `CRAFTING_BROWSE_STATUS` from `src/ui/presenters/CraftingListingBuilder.js`, which delegates `_deriveBrowseStatus` to it; `craftingStore.svelte.js` still keeps a private `'available'` literal)

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/data-models/spec.md

## Summary Projection

It is derived, in-memory, per-client state of exactly the kind the runtime read indexes are: it changes no persisted shape, is never serialized to a setting or a flag, and is rebuildable in full from the authoritative definitions plus one inventory snapshot.
There is ONE shape per entity — the recipe summary and the component summary — and the player crafting listing (#1075) and the GM manager browsers (#1081) both consume it rather than each growing a DTO.
The contract is **one derivation per shared field**, NOT one identical DTO: the two audiences MAY differ in which FIELDS they carry and MUST NOT differ in how a SHARED field is derived.
That difference list is executable rather than prose — `RECIPE_SUMMARY_FIELDS`/`COMPONENT_SUMMARY_FIELDS` enumerate `shared`/`gmOnly`/`playerOnly`, and a projection emits exactly `shared` ∪ `<audience>`, so a field added to one surface and not the manifest fails a test rather than quietly forking the shape.
On a recipe summary `locked` and `enabled` are `gmOnly` (authoring state, which does not cross to a player client) and `favourite` is `playerOnly` (a per-VIEWER preference the GM manager has no viewer to read).
The component summary has NO audience split, and that is a FINDING rather than an omission: a component carries no teaser gate, no knowledge gate and no per-viewer state, so the two surfaces have nothing to disagree about.
A summary carries no exact craftability, no redacted content, no localized text (tokens only — a localized summary would key a GM row’s sort on the active language) and no Foundry documents; building any number of summaries invokes `evaluateCraftability()` and `resolveIngredientSelection()` ZERO times, a counter-asserted invariant held STRUCTURALLY because the projections take VALUES and never a manager, engine or listing builder.
Distinguish from the **Player Crafting Projection**, which is the DETAIL PHASE of the same read side and which issue 1075 made per-selected-recipe rather than corpus-wide, and from the many field-level `*Summary` descriptors already nested inside models (`checkSummary`, `salvageSummary`, `accessSummary`), which are unrelated.
KNOWN GAP, recorded rather than guessed, and deliberately NOT closed by the surface it was written for: the GM browsers’ SORT keys — activation-blocked state, check DC, ingredient count, result count, salvage result-group count — are still not served by this manifest, and sorting runs over the whole filtered cohort before pagination, so they cannot be deferred to a page-row **Projection Tier**.
Issue 1081 was expected to bring that amendment back and chose not to: it made all five cheap on the GM browsers’ OWN row projection instead — the two structure counts as an arithmetic fold over the execution steps, the system half of the DC resolved once per cohort, the salvage result-group count already arithmetic, and `enableBlocked` demand-scoped behind its own memo slot.
The consequence is the one worth writing down: the five sort keys now have TWO potential derivations — this manifest’s (unwritten) and the GM row projection’s (shipped) — so a future amendment here MUST adopt the shipped derivations rather than author new ones, or the “one derivation per shared field” rule this entry states is broken the day the manifest grows them.

Canonical mapping: `projectRecipeSummary`, `projectComponentSummary`, `RECIPE_SUMMARY_FIELDS`, `COMPONENT_SUMMARY_FIELDS`, `summaryFieldsFor` in `src/ui/presenters/summaryProjection.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md

## Summary Audience

An OMITTED audience defaults to `player`, the REDACTING one, so a caller that forgot the argument fails safe rather than shipping an unredacted teaser.
It is DERIVED from the viewer (GM or not) but is not the **viewer**: the viewer is the Foundry user the visibility service evaluates against, while the audience is the shape contract the row satisfies.
Note the deliberate homonym: the Canvas Interactable `activation.audience` (`players` | `all`) is a different concept on a different axis — WHO may activate a region, not WHICH row contract was built — and the two vocabularies must not be conflated (`player` singular here, `players` plural there).

Canonical mapping: `SUMMARY_AUDIENCE` in `src/ui/presenters/summaryProjection.js`; the unrelated `ACTIVATION_AUDIENCES` in `src/canvas/regions/interactableRegionFlags.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md

## Cheap Availability Projection

It reads a snapshot’s per-system tallies — component quantities, per-tag quantities, essence totals — and NOTHING else, resolved once per system per snapshot, so projecting a page walks the held inventory once and performs one component-identity resolution per held document rather than one per row.
It is an UPPER BOUND and says so in its own shape: `optimistic` is always `true`, `available: true` means “nothing rules this out” and MUST be presented as “looks makeable” rather than “you can make this”, while `available: false` is definitive (a requirement the totals cannot cover cannot be covered by any assignment of them either).
Tools, checks, knowledge and currency are not consulted at all, which is what keeps it an upper bound — each can only ever make a recipe LESS craftable.
`null` is NOT ASKED, deliberately distinct from unavailable, and is what a surface with no actor in view receives.
A multi-step recipe is read from its FIRST execution step — never the actor’s active step, which would make the row disagree with the inspector opened from it — because such a recipe leaves its top-level ingredient sets empty and a raw read would call every stepped recipe makeable against an empty inventory.
Naming: #1077 called it the _indexed availability projection_ and #1091’s canonical text calls it the _cheap-availability rule_; ONE rule, one implementation, two phrasings.
Distinguish from `evaluateCraftability()`, which is EXACT and remains authoritative immediately before consumption, and from **optimistic** in the UI stores, where it means an unacknowledged write rather than an upper bound.

Canonical mapping: `projectRecipeAvailability` in `src/systems/inventorySnapshot.js`; `projectSummaryAvailability` in `src/ui/presenters/summaryProjection.js`

Spec reference: openspec/specs/data-models/spec.md

## Summary Redaction

It applies the SAME test the detail model applies — not a GM AND the recipe’s access reason is `teaser` — and the hidden-field list is the recipe’s authored `teaserState.hiddenFields`, falling back to the documented default (`ingredients`, `results`, `description`).
A redacted summary carries NO availability and MUST NOT compute one: availability is derived from the recipe’s INGREDIENTS, which the default teaser configuration hides, so an answer there would disclose the shape of a requirement the player has not discovered — refreshable once per inventory change, across a whole corpus.
The guard sits at the DERIVATION, not the write-out; blanking a computed value is equivalent for today’s shape and wrong the first time a “why not?” field is added beside it.
Identity and grouping metadata are NOT redacted: a teaser is shown to the player deliberately, so `name`, `img`, `category` and `category`’s display form `categoryLabel` are the part they are meant to see (issue 1075 added the last of those, and it needs no separate judgement: a total function of `category` and the active language can disclose nothing `category` does not).
`tags` is likewise not redacted, and that is a NEW decision rather than an inherited one — no player-facing surface has carried recipe tags before, so it does not follow from the `category` precedent — taken because a tag is GM grouping metadata of exactly the same kind as a category, because `teaserState.hiddenFields` cannot name it (the authored vocabulary is ingredients, results, description, tools, essences), and because withholding it would break the filtering a summary exists to serve.
The projection performs no visibility gating of its own: it redacts a teaser it is TOLD about, and building a player summary for a recipe the visibility evaluation did not make visible is the calling surface’s defect, not something this contract catches.

Canonical mapping: the `redaction` field and private `redactionOf` in `src/ui/presenters/summaryProjection.js`; `access.teaserState.hiddenFields` from `RecipeVisibilityService`

Spec reference: openspec/specs/recipe-visibility/spec.md, openspec/specs/data-models/spec.md

## Crafting Read Phases

The **summary phase** is corpus-wide: `game.fabricate.listCraftingForActor()` → `CraftingListingBuilder.buildListing` answers `{ summaries, total, counts }` — one **Summary Projection** per browsable recipe, over ONE inventory snapshot built for that pass and discarded with it.
The **detail phase** is per-recipe: `game.fabricate.hydrateCraftingRecipe()` → `buildRecipeDetail` answers the **Player Crafting Projection** for the ONE recipe an inspector is about to render, or `null`.
All browse state — search, the favourite/craftable/system/category filters, the A→Z sort and pagination — runs over summary rows in `craftingStore`, so the page window is chosen before any exact work happens: building N summaries invokes `evaluateCraftability()` and `resolveIngredientSelection()` ZERO times (the counter-asserted invariant recorded under **Summary Projection**), opening the app hydrates only the selection (falling back to the first visible row), and even hydrating an entire page is bounded by page size × (sets + 1) and is independent of corpus size.
Splitting the read SPLITS THE GATE, which is the security content of this term: a recipe id is whatever a client sent, so the detail phase re-resolves the system block, the `enabled` gate and the visibility evaluation from scratch and answers nothing rather than a redacted model — and re-evaluating ONE recipe is not a second corpus-wide candidate collection.
The two phases may disagree about materials in ONE direction only: a row carries the **Cheap Availability Projection**’s upper bound, so it can read available where the inspector refuses, and can NEVER read unavailable for a recipe exact evaluation would allow; craft-time validation is untouched and stays authoritative.
A hydrated detail never outlives the read pass that produced it — it carries exact craftability derived from live `actor.items`, so it is dropped wholesale whenever the listing is refetched, which is the same invalidation rule the snapshot behind the summary phase obeys, for the same reason.
The store therefore holds `selectedSummary` (the ROW the browser highlights, which survives a failed or pending hydration) beside `selectedRecipe` (the hydrated model every exact-craftability consumer reads); the two are not substitutable, since a summary has no `ingredientSets`, no `check` and no `defaultSetId` to stand in with.
Say PHASE, never "tier": **Recipe Check Tier** and routed outcome tiers already own that noun.

Canonical mapping: `buildListing`/`buildRecipeDetail` in `src/ui/presenters/CraftingListingBuilder.js`; `listCraftingForActor`/`hydrateCraftingRecipe` in `src/bootstrap/craftingFacade.js`; `selectedSummary`, `selectedRecipe` and the per-pass `hydratedDetails` memo in `src/ui/svelte/stores/craftingStore.svelte.js`

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/data-models/spec.md

## Projection Tier (`summary` / `detail`)

**The qualifier is mandatory, because a bare “tier” is already taken.**
In Fabricate’s domain vocabulary an unqualified _tier_ is an **Outcome Tier** — the check band a **Recipe Check Tier** points at, the thing `checkTierId` names and `tiers.find()` resolves — so “the detail tier” and “the DC tier” are different axes that happen to share a noun, and the cost axis must always be spoken as a _projection tier_.
The membership rule is mechanical, not editorial: a field is SUMMARY-tier iff the pure browser model reads it — a filter field, a category, or a SORT KEY — because filtering, counting and sorting all run over the whole filtered cohort BEFORE pagination.
Demoting a sort key to the detail tier does not slow anything down; it renders **name order under the label of the key the GM chose**, silently and with no empty state to notice.
Everything else is DETAIL-tier: the recipe’s `toJSON()` deep clone and everything derived from it, the requirements preview, the completeness verdict, and the component’s linked source document.
On a recipe row the detail fields are ENUMERABLE ACCESSORS over one shared memoized producer, so the row’s key set, `Object.keys`, spread, `JSON.stringify` and `deepEqual` are all unchanged and only WHEN the work happens differs; on a component card the detail half sits behind a NON-ENUMERABLE `hydrate()` because it is asynchronous (see **Card Hydration**).
`enableBlocked` holds its OWN memo slot rather than joining either bundle: it is the `attention` sort key so it must be answerable cohort-wide, but it is the most expensive field on the row, so sorting by attention pays N activation checks and nothing else while every other sort pays for the page plus the bulk selection.
Distinguish from **Summary Projection**, which is the systems-layer manifest of a shared row SHAPE: a projection tier is a per-surface scheduling decision about one row object and mints no shape.

Canonical mapping: `RECIPE_DETAIL_FIELDS`, `_defineLazyFields`, `_buildRecipeRowDetail` in `src/ui/svelte/stores/adminRecipeRowProjection.js`; `_createItemCard` in `src/ui/svelte/stores/adminComponentRowProjection.js`

Spec reference: openspec/specs/ui-system-studio/spec.md

## Card Hydration

A card is projected CHEAPLY for the whole cohort, carrying the reading derivable without I/O — the stored description, and a source origin inferred from the linked uuid’s SHAPE alone — which is the right answer for the overwhelming majority of components, so an un-hydrated card renders correctly rather than blankly.
`hydrate()` resolves the linked source document and corrects the two cases the shape cannot know: an empty stored description falls back to the document’s enriched prose, and a document that has been DELETED flips the accent origin pill (`Compendium` / `Items Directory`) to the amber `Missing`.
It is idempotent and memoized per card so a render effect may call it every render; a REJECTION is deliberately NOT memoized, because the callers swallow it and a cached rejection would leave that one card unable to hydrate for the life of the projection.
**Identity is what makes the correction visible, and this is the load-bearing rule.**
The fill lands IN PLACE, which is a private staging step and NOT how the answer reaches the screen: the store publishes through a `writable`, which does not proxy, so Svelte compares by `===` at every hop — `$derived`, the filter/sort/paginate chain, and a keyed `{#each}` — and a card whose identity did not move stops at the first of them.
The card must therefore be REPUBLISHED as a fresh object carrying the same own property descriptors (a spread would drop the non-enumerable `hydrate`), selected by IDENTITY rather than by id, since a refresh landing between the fill and the republish has already published a different card under the same id with its own fill still to come.
Preserving card identity looks like it keeps the row, the inspector and the editor from diverging; it keeps all three wrong together, which is the issue 676 / 800 regression.
The corollary is a boundary obligation: EVERY route that resolves a card from the whole cohort rather than from a rendered page — the inspector’s default and held selection, the component editor, and the gathering task picker — must ask for hydration itself, because the browser only ever asks for the page it renders.

Canonical mapping: `hydrate` / `onHydrated` in `_createItemCard`, `hydrateItemCards`, `republishHydratedItemCards` in `src/ui/svelte/stores/adminComponentRowProjection.js`; `_scheduleItemCardRepublish` in `src/ui/svelte/stores/adminStore.js`

Spec reference: openspec/specs/ui-system-studio/spec.md

## Visibility Mode

`global` = every recipe visible; `restricted` = per-recipe/character grants (Access tab); `item` = craft only while holding the linked book (use cap applies, no Learn); `knowledge` = learn the recipe from the book (learn cap applies).
The `1.12.0` migration (`migrateVisibilityModeEnum.js`) seeds it from the legacy fields (`global`→`global`, `player`→`restricted`, `knowledge`+`item`→`item`, `knowledge`+`learned`/`itemOrLearned`→`knowledge`, `teaser`→`global` with `teaserConfig` preserved, absent/invalid→`knowledge`).
A stored value is normalized on read (unknown/absent→`knowledge`, `_normalizeVisibilityMode`); the visibility runtime instead derives from the legacy pair only for a raw/un-normalized system that carries none (`player`→`restricted`, `knowledge`+`item`→`item`, `knowledge`+learning→`knowledge`, else `global`).
Switching it is non-destructive (migrates no recipes).
Changing it can remove the Crafting nav entry the GM's active route belongs to — including cross-client, since a world-setting change replicates to every connected client; the manager reconciles rather than stranding the GM on an entry-less route, redirecting to the first mode-conditional entry the system still offers in rail order (`Access` → `Books & Scrolls` → `Knowledge`) or to `Recipes` when none remain, and this cross-client path is the one case where that redirect silently discards a dirty `recipe-item-edit` draft with no confirm-discard prompt (issue 1151).

Canonical mapping: `CraftingSystem.visibilityMode`; `craftingEffect()` / `VISIBILITY_MODES` in `src/ui/svelte/apps/manager/crafting/craftingVisibility.js`; `RecipeVisibilityService._getVisibilityMode`; `migrateVisibilityModeEnum.js`; `adminStore.setVisibilityMode`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/ui-integration/spec.md

## List Mode

It is read only as a fallback when a system carries no `visibilityMode`, and it is no longer UI-authorable — the crafting Settings page writes `visibilityMode` instead.
`teaser` is a legacy runtime value (still honoured for Discovery Mode) that should be eliminated.

Canonical mapping: `recipeVisibility.listMode` (legacy) → `CraftingSystem.visibilityMode`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md

## Knowledge Mode

It is still read as a runtime fallback and preserves a migrated `learned`-only system's semantics; the flat enum collapses authoring to `item` (item-access only) and `knowledge` (item + learning / `itemOrLearned`).

Canonical mapping: `recipeVisibility.knowledge.mode` (legacy) → `CraftingSystem.visibilityMode`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md

## Recipe Item Definition

It is distinct from components and, like a component, is backed by a **union** of source references — `registeredItemUuid` (the registered live document), `originItemUuid` (the canonical compendium/source uuid), and `aliasItemUuids` (issue 555) — so a compendium-imported book resolves owned copies dragged from either the compendium item or the imported world item.
Its identity-of-record is the durable, system-scoped, transferable flag `flags.fabricate.roles[systemId].recipeItemDefinitionId` (issue 567 — the third `roles` sibling after `componentId` #556 and `toolId` #561, retiring the #555 single scalar `flags.fabricate.recipeItemDefinitionId` which lingers only as a transitional read-only fallback tier); `originItemUuid` is a best-effort pointer.
It **owns the canonical recipe↔book membership** as a `recipeIds[]` list (issue 511, PR-B many-to-many — a recipe may belong to several books), authored on the Books & Scrolls item **Contents** tab.
It also owns that item's use/learn `caps` (`caps.item` craft charges, `caps.learn` learn cap, `learnScope`, and `consumeOnLearn`) — per recipe item, no longer one system-wide config; the `1.11.0` migration seeds each definition's caps from the old `recipeVisibility.knowledge.item`/`.learn` values.

Canonical mapping: `CraftingSystem.recipeItemDefinitions[]`, `RecipeItemDefinition.recipeIds`, `RecipeItemDefinition.caps`, `CraftingSystemManager._normalizeRecipeItemCaps`/`updateRecipeItemDefinition`, `normalizeRecipeItemCaps` in `src/systems/normalize/recipeItems.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md

## Recipe↔Book Membership

Canonical storage is each definition's `recipeIds[]` (many-to-many); the scalar reverse ref `recipe.recipeItemId` is **removed** by the `1.13.0` migration (`migrateInvertRecipeItemLink.js`), which resolves each recipe's former book the way the old runtime did and pushes the recipe id onto that definition's `recipeIds`.
The migration strips `recipe.recipeItemId` unconditionally and strips `recipe.linkedRecipeItemUuid` **only** when that uuid itself resolved a book — a `linkedRecipeItemUuid` that instead links a standalone alchemy formula item is preserved.
Membership is authored book-side (the Contents tab, `adminStore.updateRecipeItemDefinition({ recipeIds })`) or, for a multi-row selection, from the recipe browser's bulk edit panel (**Recipe Bulk Edit**); the recipe editor still writes no book link.
`RecipeVisibilityService._getRecipeItemDefinitions` reads `recipeIds[]` and falls back to the legacy reverse ref only while the system's monotonic `membershipResolvesByRecipeIds` marker is unset (issue 1010, absorbing issue 1011).
The marker is set by the first write to any definition's `recipeIds` — which first seeds every definition in the system from the legacy scalars, so switching basis carries membership across rather than orphaning it — is backfilled on load as a monotone OR over the persisted value, and is never cleared.
The retired system-wide inference (`definitions.some(d => d.recipeIds?.length > 0)`) flipped in both directions and is forbidden.
Six readers consult the marker: `CraftingSystemManager.getRecipeItemDefinitionsContaining` and `_getRecipeObjectsReferencingRecipeItemDefinition`, `RecipeVisibilityService._getRecipeItemDefinitions`, `InventoryListingBuilder`, and the `adminStore` recipe-row projection and `_enrichRecipeItemLibrary`.
The FORWARD question — which definitions contain this recipe — has one implementation, `utils/recipeItemMembership.js` (issue 1155), which the manager, the visibility service, the recipe-row projection and the delete impact leaf all ask; before that it was written out five times, and the row projection copy had no `linkedRecipeItemUuid` leg, so on an un-migrated world the browser row and the delete card could name different books.
That gate does not stop the scalar from reappearing, though: `CraftingSystemManager._migrateLegacyRecipeItems` runs un-gated on every `initialize()`, and for a recipe whose standalone-alchemy `linkedRecipeItemUuid` survived the `1.13.0` migration it mints/finds a recipe item definition from that uuid and rewrites `recipe.recipeItemId` **without** ever adding the recipe id to that definition's `recipeIds[]`.
The four image resolvers that then lived under `src/systems`, named in `data-models/spec.md` `## Recipe` requirement 16, read `recipe.recipeItemId` directly rather than through `_getRecipeItemDefinitions`, so they pick up that reappeared scalar and borrow the book's image even in an otherwise fully migrated system — the asymmetry behind the GM/player image divergence for the alchemy cohort (issue 884, closing deferred to issue 887).

Canonical mapping: `RecipeItemDefinition.recipeIds`; `CraftingSystem.membershipResolvesByRecipeIds`; `migrateInvertRecipeItemLink.js`; `RecipeVisibilityService._getRecipeItemDefinitions`; `CraftingSystemManager._seedMembershipFromLegacyScalars`/`_migrateLegacyRecipeItems`; `InventoryListingBuilder`; `recipe.recipeItemId` / `recipe.linkedRecipeItemUuid` (legacy)

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/ui-system-studio/spec.md

## Recipe Display Image

A book's or scroll's artwork is never substituted, whatever the membership — many-to-many membership (`RecipeItemDefinition.recipeIds[]`, see **Recipe↔Book Membership**) makes "the containing book" ill-defined, and a borrowed icon would track definition resolution order rather than anything the GM authored.
An unset image — empty, whitespace, or Foundry's generic `icons/svg/item-bag.svg` sentinel — resolves to `DEFAULT_RECIPE_IMAGE`, never to a book-shaped fallback.
The book keeps its own artwork on its Item sheet and in inventory; only the recipe stops borrowing it.
Shipped code meets that rule at every user-visible surface as of issue 887, which retired the borrow from the four resolvers that then lived under `src/systems` — `InventoryListingBuilder`'s used-by index (reduced to the class's single `_resolveRecipeImg`), the inline block in `CraftingListingBuilder`, `CraftingEngine._resolveRecipePromptImg`, and `RunJournalBuilder._resolveCraftingRunImg` — and removed the injected `getRecipeItemImg` port that fed the last of them.
Two paths that once armed those resolvers are also closed: issue 978 stopped the GM manager persisting a projection-derived `recipeItemId` onto any recipe linked to a book (the ordinary-cohort path, far wider than this row previously recorded) and clears already-leaked scalars, while `CraftingSystemManager._migrateLegacyRecipeItems` still repopulates `recipe.recipeItemId` from a standalone alchemy `linkedRecipeItemUuid` the 1.13.0 migration preserved (see **Recipe↔Book Membership**) — which is now harmless, because no image resolver reads the scalar.
`RecipeManager.resolveRecipeIcon`/`resolveRecipeIconAsync` still live under `src/systems` and order it the OTHER way — an authored non-default `img` wins outright and the borrow is consulted only when `img` is unset or still the default — and both are caller-less in production code, so no surface resolves through them; `docs/api/recipe-manager.md` documents that reversed chain as the behaviour of those two methods, which is still accurate.
The one place inside `src/ui` that re-derives the rule instead of routing through one of the two chokepoints is `buildRecipeGraph`: it borrows nothing, but does not treat the bag sentinel or a whitespace `img` as "no image", which carries no user impact today because the Graph surface is an unimplemented placeholder gated behind `fabricate.experimentalFeatures` (issue 442).

Canonical mapping: `resolveRecipeImage` / `DEFAULT_CRAFTING_IMAGE` / `GENERIC_ITEM_IMAGE` (`src/ui/svelte/util/craftingImageDefaults.js`); `DEFAULT_RECIPE_IMAGE` (`src/models/Recipe.js`); `InventoryListingBuilder._resolveRecipeImg`; `CraftingSystemManager._migrateLegacyRecipeItems`; `RecipeManager.resolveRecipeIcon` / `resolveRecipeIconAsync`; `buildRecipeGraph` (`src/ui/svelte/util/recipeGraphBuilder.js`)

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-integration/spec.md

## Owned Copy

It is the unit every RUNTIME knowledge fact hangs off — `recipeItemUsage.timesUsed`/`inert` (craft charges) and `recipeItemLearning.learnedCount` (learn budget) are per-**document** counters shared by every unit in a stack, which is why a stacked copy is deleted whole rather than quantity-decremented: a partial decrement would leave one set of counters attached to fewer units and silently falsify every derived remaining figure.
An owned copy is never a definition — definitions are authored on Books & Scrolls, owned copies are only ever audited and mutated on the **Knowledge Surface** — and a **Learned Recipe** is INDEPENDENT of it, surviving the copy's deletion with a permanently dangling `sourceItemUuid`.
Deleting a copy frees no learn budget and never touches `learnedRecipes`.

Canonical mapping: `matchRecipeItemDefinition` in `src/utils/sourceUuid.js`; `RecipeVisibilityService._applyRecipeItemUse` / `_getActorOwnedItemById` / `expendRecipeItemUse`; `projectOwnedCopyRow` in `src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js`; `_buildKnowledgeSnapshot` in `src/ui/SvelteCraftingSystemManagerApp.svelte.js`

Spec reference: openspec/specs/recipe-visibility/spec.md, openspec/specs/data-models/spec.md, openspec/specs/ui-system-studio/spec.md

## Learned Recipe

**Deletion is a first-class supported lifecycle** (issue 773): the shared `forgetLearnedRecipes` primitive serves three grains from one path — **erase one** learned recipe, **reset one system**, and **reset all systems** — via a reload-safe per-id forced deletion (V13 `-=`, V14 operator) under the doubly-nested `flags.fabricate.fabricate.learnedRecipes` path (never a merge-blind `setFlag` map rebuild).
`freeLearnBudget` (default on for reset/erase, off for the recipe-deletion cleanup path) refunds one consumed learn slot per cleared entry against a still-held source copy (`perInstance` → the item's `recipeItemLearning.learnedCount`; `total` → the `recipeItemPartyLearnPool` key); orphan entries free nothing.
The reset grains also clear the recipe's scoped `discoveryProgress`, and the deliberate asymmetry — an erase is an un-learn, a reset is an amnesia — means the **Knowledge Surface** per-row erase explicitly DECLINES `clearDiscovery` while both reset grains pass it.
GM-only `game.fabricate.resetActorKnowledge({ actorId, systemId, freeLearnBudget })` is the API the Knowledge Surface's per-character reset routes through (both grains, with and without `systemId`), also usable from macros and the console.
A learned entry is INDEPENDENT of currently-owned copies: it survives deletion of the **Owned Copy** it was learned from, its `sourceItemUuid` then dangles permanently, and no learn budget is freed — so a surface presenting both lists must never couple them, and MUST NOT promise slot recovery on a row whose erase will free nothing.

Canonical mapping: `Actor.flags.fabricate.learnedRecipes`; `RecipeVisibilityService.forgetLearnedRecipes`/`forgetSystemLearnedRecipes`/`forgetAllLearnedRecipes`; `Fabricate.resetActorKnowledge` (`src/bootstrap/companionFacade.js`)

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md

## Recipe-Item Learn Cap

Caps are per recipe item, not one system-wide config, so a one-recipe scroll and a three-recipe tome in the same system differ; they are resolved from the recipe's member book(s) (`RecipeItemDefinition.recipeIds` → that definition's `caps`; the learn/use path anchors caps on the SELECTED owned book via `_matchDefinitionForItem`) and FAIL CLOSED to uncapped when no definition resolves.
The learn cap has a **scope** (`caps.learn.learnScope`): `perInstance` (default) counts against each physical item **document** — a **learn budget** count (`recipeItemLearning.learnedCount`, mirroring `recipeItemUsage.timesUsed`) with **remaining budget** = `maxRecipes − count`, accumulating across every holder and not reset on transfer — while `total` draws every actor's learns from ONE GM-authoritative shared world pool keyed `system::defId` (`recipeItemPartyLearnPool`).
A capped recipe item never auto-learns on drop — the player learns one recipe at a time via the item-sheet picker, surfaced regardless of `dragDropEnabled`; `consumeOnLearn` is ignored (hidden in authoring) and `destroyWhenSpent` governs removal instead.
**`destroyWhenSpent` (learn) is deliberately NOT the same flag as `destroyWhenExhausted` (craft-charges)** — never normalize the two names.
A recipe item with `limitRecipes` on but an invalid `maxRecipes` fails closed to the uncapped learn path.
The `1.11.0` migration (`migrateRecipeItemCapsPerItem.js`) seeds each definition's `caps` from the system's old `knowledge.item`/`.learn` and strips those fields; caps are authored per item on the Books & Scrolls item page via `adminStore.updateRecipeItemCaps`.

Canonical mapping: `RecipeVisibilityService._getRecipeItemCaps`/`getLearnableRecipesFromItem`/`learnOneRecipeFromItem`; `RecipeItemDefinition.caps.learn.limitRecipes`/`maxRecipes`/`destroyWhenSpent`; `Item.flags.fabricate.recipeItemLearning.learnedCount`

Spec reference: openspec/specs/recipe-visibility/spec.md, openspec/specs/data-models/spec.md, issue 511

## Recipe-Item Use Cap

`RecipeVisibilityService._applyRecipeItemUse(item, itemCaps)` is the SINGLE decision point for the increment, the exhaustion test and the `whenSpent` disposal, shared by the recipe-driven craft path and the GM-driven Expend action so the two can never diverge.
An uncapped book performs ZERO writes (not a zero-delta write) and an already-spent copy performs zero writes too, reported as distinct outcomes, so a surface offering Expend renders it **disabled** rather than as a silent no-op.
The core re-reads the current count from the document instead of trusting a caller snapshot, and that read MUST collapse a non-numeric `timesUsed` to `0` — a `NaN` would force the exhaustion test false and strand a copy that can never reach any `whenSpent` branch.
Caps resolve only through `_getRecipeItemCaps` (definition-only via `_capsForDefinition`), never a raw `definition.caps` read, so the legacy `destroyWhenExhausted` derivation stays applied.

Canonical mapping: `RecipeVisibilityService._applyRecipeItemUse` / `_getRecipeItemUsage` / `_capsForDefinition` / `applyRecipeItemUseOnCraft` / `expendRecipeItemUse`

Spec reference: openspec/specs/recipe-visibility/spec.md, openspec/specs/data-models/spec.md

## Spent

It is DERIVED, never stored, and is the exact complement of `_filterNonExhausted`.
A non-finite or non-positive `maxUses` reads as UNLIMITED (fail-open), which is why derived remaining charges of `null` mean "Unlimited" and must never render as "0 left".
Any projection must match the predicate on BOTH axes, the `Number(timesUsed || 0)` coercion included, or a row claims a copy is spent while the runtime still grants craftability from it.
Only `spent` disables Expend; **Inert** does not.

Canonical mapping: `RecipeVisibilityService._filterNonExhausted`; `isRecipeItemSpent` / `recipeItemRemainingUses` / `canExpendRecipeItemUse` in `src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js`

Spec reference: openspec/specs/recipe-visibility/spec.md, openspec/specs/ui-system-studio/spec.md

## Inert

Item-based access filters on `timesUsed >= maxUses` alone and never reads the flag, so raising `maxUses` leaves a copy simultaneously `inert: true` and craftable, while lowering it below a copy's `timesUsed` makes that copy **Spent** while carrying no `inert` flag it can ever acquire.
`inert` is therefore projected as an INDEPENDENT row fact, never folded into the uses chip and never a gate on the GM Expend action (disabling there would apply a gate the engine does not).
Contrast `toolBroken`, which shares the escape-hatch shape but IS a real gate.
No Fabricate writer clears it — a merge write cannot remove a key — so it is sticky until force-deleted (V13 `-=`, V14 operator); a GM clears it through the Foundry flag editor pending a repair flow (known gap, issue 785).

Canonical mapping: `RecipeVisibilityService._markRecipeItemInert`; `projectOwnedCopyRow` in `src/ui/svelte/apps/manager/knowledge/knowledgeStudio.js`; `KnowledgeOwnedCopyRow.svelte`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/ui-system-studio/spec.md

## Knowledge Surface

It is the play-state counterpart to the Books & Scrolls surface (which AUTHORS recipe item definitions) and the Access surface (which GRANTS visibility), and it operates on owned copies only, never on definitions. "Surface" is deliberate: "tab" is reserved for its two inner tabs (Recipe items / Learned recipes).
The name is NOT the `knowledge` **Visibility Mode** — the entry is shown when `craftingEffect(visibilityMode).showBooksScrolls` is true OR `resolutionMode === "alchemy"`, deliberately wider than the Books & Scrolls gate, because `learnRecipeOnCraft` writes `learnedRecipes` under EVERY visibility mode and under `global` + alchemy those entries are the sole reveal source.
Its three mutations (Expend one use, Delete one owned copy, Erase one learned recipe) are `isGM`-gated at the manager service seam — single-client, user-initiated GM actions, so `isGM` and never `activeGM`, which would lock out the assistant GMs the application already admits — and add no player-reachable facade; the per-character reset routes through the existing GM-only `game.fabricate.resetActorKnowledge`.
The projection is surface-gated on `knowledgeActive`, published as an always-new top-level `viewState.knowledge`, and never joins the shared admin-store `refresh()`.
Until it holds a snapshot it publishes `loading`, or `error` after a failed read, and only the latest read settles either.

Canonical mapping: `KnowledgeView.svelte` and `src/ui/svelte/apps/manager/knowledge/`; `knowledgeStudio.js`; `refreshKnowledge` / `setKnowledgeActive` in `src/ui/svelte/stores/adminStore.js`; `adminKnowledgeSection.js` (`createKnowledgeReadTracker`); `_buildKnowledgeSnapshot` in `src/ui/SvelteCraftingSystemManagerApp.svelte.js`; `buildCraftingNavItems` in `src/ui/svelte/apps/manager/crafting/craftingNav.js`

Spec reference: openspec/specs/ui-system-studio/spec.md, openspec/specs/recipe-visibility/spec.md

## Character Prerequisite

The GM authors a library of them on the System Settings **Character prerequisites** accordion — a world record edited on a system-framed page until the follow-up change relocates the editor, which is why the card carries an "every system" scope chip and a delete confirmation naming that reach; each is `{ id, name, icon, path, op, value }` stored in `characterLibraries.characterPrerequisites[]`.
`path` is a dotted key into `actor.getRollData()` (stored WITHOUT its leading `@`; e.g. `skills.arc.value` in dnd5e, `actor.skills.crafting.rank` in pf2e — the per-system root difference is the GAME SYSTEM's choice, not Fabricate's: `dnd5e` spreads `system` onto its roll data and `pf2e` returns `{ actor }` alone), `op` is a word-token comparison, and `value` is the comparand (null for the valueless operators).
The operator vocabulary is `eq`/`neq`/`gt`/`gte`/`lt`/`lte`/`isTrue`/`isFalse`/`exists`; the last three are valueless (they force `value` to `null` and hide the editor's value field), and an unknown token normalizes to `gte`.
A book/scroll references a subset of them by id through `RecipeItemDefinition.caps.learn.characterPrerequisiteIds` (authored on the Limits tab's "Learning prerequisites" typeahead picker), gating that book **per-book**: a reader must pass **ALL** referenced prerequisites (AND semantics) to learn any of the book's recipes.
Both this gate and the Required Knowledge gate are only enforced when the book's `caps.learn.limitLearning` is on (issue 544); with Limited learning off, neither is enforced.
Resolution is a pure, Foundry-free module: an unknown/missing `path` degrades to `0`/`false` (never throws; single `console.warn`), and a `characterPrerequisiteIds` entry that no longer resolves to a library definition is **skipped (fail-open)**.
**THE CONCEPT HAS TWO OPPOSITE FAILURE POLARITIES, one per gate, and the asymmetry is the thing to know about it.**
The LEARNING gate fails **OPEN**: an unresolvable id is skipped, so a book with one broken reference still gates on the rest and stays learnable.
The TOOL gate fails **CLOSED**: `toolCheckBonus` passes only when `resolved.length > 0 && unresolvedIds.length === 0`, so ONE unresolvable id leaves the gate unpassed — and under `gateMode: 'usability'` that makes the Tool unusable, blocking every craft, salvage and gathering attempt that requires it, which can take a whole gathering task offline.
Each direction is defensible on its own (knowledge that cannot be checked is granted; a tool whose gate cannot be checked is withheld), but the pair is why an id-losing prune is a nuisance on one side and an outage on the other, and it is what makes the tool prune's **Valid Id Basis** load-bearing rather than tidy.
It is enforced at every learn entry point (`learnRecipe`, `learnOneRecipeFromItem`, `learnRecipeFromOwnedBook`) with the `FABRICATE.Knowledge.CharacterPrerequisiteNotMet` message, silently filters blocked recipes out of the drop-learn preview and the item-sheet picker, silently skips the craft-time auto-learn, and drives the inventory `learnBlocked`/`learnBlockedReason` chip that disables the Learn button.
The inventory builder evaluates both gates once per book in `InventoryListingBuilder._evaluateBookRequirements` (Required Knowledge folded into `learnBlocked`, `reason` = unmet names) and emits a per-book `requirements` array (`{ kind, id, name, icon, met }`) that the book detail renders as read-only "Needs: &lt;name&gt;" chips reflecting met/unmet; the GM recipe-item editor mirrors the same as "Needs:" rows in Effective rules + preview-card chips — all only when Limited learning is on.
**Three-way `prerequisite` disambiguation:** a **Tool** is a _presence/consumable_ prerequisite (the actor must hold the item and optionally pass its formula gate); a recipe item's `caps.learn.prerequisiteIds` (**Required Knowledge**) is a _prior-knowledge_ gate (the reader must have **already learned ALL** the named recipes); a **Character Prerequisite** is an _actor-roll-data_ gate (a stat/flag comparison).
All three simply block; none carries a policy field.
The word-token `op` vocabulary is a deliberate parallel to the **Check Breakage** condition's symbolic operators (`==`/`<=`/`>=`/`<`/`>`) — same comparison intent, different surface.

Canonical mapping: `characterLibraries.characterPrerequisites`, `PREREQUISITE_OPERATORS`/`evaluatePrerequisites`/`prerequisitePreview`/`normalizeCharacterPrerequisiteList` in `src/systems/characterPrerequisites.js`; `CharacterLibrariesStore`; `resolveCharacterPrerequisiteLibrary` in `src/systems/characterLibraries.js`; `RecipeItemDefinition.caps.learn.characterPrerequisiteIds`; `Tool.prerequisites.ids` and `src/systems/toolCheckBonus.js`; `RecipeVisibilityService._meetsCharacterPrerequisites`; `InventoryListingBuilder._evaluateBookRequirements`; `CharacterPrerequisitesCard.svelte`; `src/migration/migrateCharacterLibrariesToWorldScope.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/ui-world-scope/spec.md, openspec/specs/ui-system-studio/spec.md

## Recipe Access Grant

It replaces the legacy `visibility.allowedUserIds` player list, which `Recipe._normalizeAccess` reads-forward into `playerIds` when both grant lists are empty.
A non-GM sees a restricted recipe when their user id is in `playerIds` OR they **control** an actor in `characterIds` — controlled meaning the viewer's assigned character or an actor they hold Foundry `OWNER` on (`RecipeVisibilityService._isRecipeVisibleByAccessGrant` / `_viewerControlsCharacter`, wired at `getVisibleRecipes`).
Both lists empty (no legacy fallback) hides the recipe from every non-GM; the GM always sees it.

Canonical mapping: `Recipe.access`, `Recipe._normalizeAccess`; `RecipeVisibilityService._isRecipeVisibleByAccessGrant` / `_viewerControlsCharacter`; `adminStore.saveRecipeAccess` / `getPcRoster`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/ui-system-studio/spec.md

## Knowledge Access Grant

A GM is granted _access only_ — the grant's `hasLearned`/`hasMatchedItem: true` flags signal "always granted for a GM", not the GM actor's real learned state or item ownership, and its `matchedItems` collection is intentionally empty because no inventory is scanned.
Callers that need the actor's actual owned, matching recipe items (selecting an item to consume on learn, deciding whether to track a limited use on craft) must collect candidates directly against the actor's inventory rather than reuse this output for a GM.
Learning therefore requires an actually-owned matching recipe item for every viewer, GM included: a GM who genuinely owns one can learn it, while any viewer who owns none is rejected with the no-matching-item outcome.

Canonical mapping: `RecipeVisibilityService.evaluateKnowledgeAccess`/`learnRecipe`

Spec reference: openspec/specs/recipe-visibility/spec.md, issue #86

## Knowledge Grant

It is a downtime reward's write path: "you learned this by doing the work", no book involved, no copy consumed, no learn budget spent.
It is a **free function** (`companionKnowledgeGrant.grantRecipeKnowledge`), never a method on `RecipeVisibilityService`, because that service is handed out **live and ungated** through the published `getRecipeVisibilityService()` accessor, and an unbounded write placed there would make `grantRecipeKnowledge({ recipe, actor: myOwnCharacter })` a fully authorised, self-benefiting write any player could make from the console; `resetActorKnowledge` is self-harm, a grant is self-benefit, and that asymmetry is why the two writes live in different places despite both clearing through the facade's shared GM-actor preamble.
It refuses `knowledgeNotObservable` and performs **zero writes** where **Learned-Knowledge Observability** answers false for the recipe's system, so a grant can never land an entry no player could ever see.
It is **idempotent**: an already-known recipe (read through the entry-boundary reader, never a bare index, so a dot-expanded legacy id is not re-granted) answers `success: true` with outcome `alreadyKnown` and zero writes, because the caller is an automation tick that may legitimately re-run and a bare `success: false` would make a correct re-run read as a failure.
The written entry is four scalars — `{ learnedAt, sourceItemUuid: null, granted: true, grantedBy }` — spread over the raw persisted map exactly as `learnRecipeOnCraft` already does, so no second write shape is introduced.
`granted` is the **display discriminant**: stamped `true` and never `false` (absence means not granted, so no migration touches the existing corpus), and kept separate from the presence of a label because a label-less grant — the likely common case, a macro with nothing meaningful to say — must still render as a grant rather than falling through to "Learned by crafting".
`grantedBy` is an optional, caller-supplied provenance label — a trimmed string of at most 64 characters, or `null` — **refused, never coerced or truncated**, on the reasoning `normalizeGrantedBy` states and the **Alignment Findings** table records: see that table for why the field is `grantedBy` and not `source`.
Distinct from the pre-existing **Recipe Access Grant** and **Knowledge Access Grant** terms, both of which name **read-side** visibility/access evaluation; this term names the one **write** path a companion or a GM macro reaches with no book in play.

Canonical mapping: `grantRecipeKnowledge` (`src/systems/companionKnowledgeGrant.js`); `Fabricate.grantRecipeKnowledge`/`Fabricate._requireGmActor` (`src/bootstrap/companionFacade.js`); `game.fabricate.api.companion`; `normalizeGrantedBy`/`GRANTED_BY_MAX_LENGTH` (`src/systems/companionContract.js`)

Spec reference: openspec/specs/companion-api/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/data-models/spec.md, issue #1289

## Learned-Knowledge Observability

It is a **sibling predicate derived from the reveal evaluator**, never expressed in terms of `_isLearnModeEnabled` and never described as that gate plus a disjunct: the predicate is built arm-by-arm from `evaluateRecipeAccess`'s reveal switch, and it is left standing beside the learn gate rather than layered onto it because the two answer different questions and **disagree in both directions**.
Two earlier revisions of this predicate's own design got exactly this wrong, specifying it as "the existing learn-mode gate **or** `resolutionMode === 'alchemy'`" — a widening that reads as a superset and is not one, because the disjunct is simultaneously too narrow and too broad.
**Too narrow:** a system carrying a flat `visibilityMode: 'knowledge'` with a residual `recipeVisibility.knowledge.mode: 'item'` — exactly the state a migrated world reaches the moment a GM clicks "Knowledge" on the radio, since `migrateVisibilityModeEnum` deliberately leaves the legacy block in place and `setVisibilityMode` writes only `{ visibilityMode }` — **is** observable, because the non-alchemy reveal arm forces the `itemOrLearned` sub-mode whenever a flat enum is authored and `hasLearned` grants, while a flat widen-by-disjunct predicate would still read the residual `'item'` and answer false, exactly as `_isLearnModeEnabled` does.
**Too broad:** an alchemy system set to `item` or `restricted` with `alchemy.learnOnCraft` off is **not** observable, because neither of those two reveal arms ever consults the learned map and the only other route back in, brew-discovery, requires `learnOnCraft === true`; a blanket "learn mode OR alchemy" widening would have reported a **successful grant onto an entry no player could ever see**, a false-success case the learn gate alone never had.
`_isLearnModeEnabled` is untouched by this predicate's addition — body and comment both, pinned byte-identical by a source-contract test — because it answers "may a reader learn this from a book here", a question this predicate does not extend, narrow, or stand in front of.
`game.fabricate.grantRecipeKnowledge` (**Knowledge Grant**) refuses with outcome `knowledgeNotObservable` when this predicate answers false, reporting the refusal's `visibilityMode`/`resolutionMode` as **authored** on the system rather than resolved through the private methods this predicate reaches internally, so a GM reads the same words their own system editor shows.

Canonical mapping: `RecipeVisibilityService.isLearnedKnowledgeObservable` (`src/systems/RecipeVisibilityService.js`); `RecipeVisibilityService._isLearnModeEnabled` (untouched)

Spec reference: openspec/specs/recipe-visibility/spec.md, issue #1289

## Component Award

It **resolves its stack targets** through the published `findComponentItems` matcher — so what an award stacks onto and what salvage consumes can never disagree — and performs the stack write ITSELF; the shared create-or-stack seam is consumed as the **create** primitive alone, and never as this member's stack.
It inherits that matcher's veto-less, case-SENSITIVE name fallback, which fires whenever no owned item resolved to the component by durable identity, so in an unmigrated world the fallback is the ordinary path rather than a legacy edge.
Three neighbours it is deliberately NOT.
**Award Item Stacking** is the _gathering_ award's own stacking rule set (`gathering-and-harvesting/spec.md`), whose fallback is shared raw source references rather than a name match at all — two capabilities one word apart, and the cross-reference each way is what stops the wrong rule being applied to either.
`awardMode` (the progressive gathering `equal` / `partial` / `exceed` policy, in the gathering lifecycle notes below) decides how much a progressive roll awards; it is a QUANTITY concept a reader of a member that takes `quantity` will reach for, and it is not this.
And `CURRENCY_SPEND_CALLERS.award` is a **currency-path caller scope** meaning "this currency question came from the companion path" — true of a **Currency Credit** and of `checkAffordability`, and NEVER produced by a Component Award, the one member actually named for it.

Canonical mapping: `awardComponents` (`src/systems/companionComponentAward.js`); `Fabricate.awardComponents` (`src/bootstrap/companionFacade.js`); `COMPONENT_AWARD_MESSAGE_KEYS` / `COMPONENT_AWARD_ENTRY_OUTCOMES` / `AWARD_ENTRIES_MAX` (`src/systems/companionContract.js`)

Spec reference: openspec/specs/companion-api/spec.md, openspec/specs/gathering-and-harvesting/spec.md, issue #1301

## Currency Credit

It is the first world-scoped currency member that WRITES: it resolves the denomination through the same resolution `checkAffordability` uses, so the check and the credit cannot disagree about what a unit is; it requires a positive safe-integer amount rather than truncating one; and it reaches the configured coin spender's `refund` directly, never `refundCurrencySpends`, which for a recipe-less request returns a silent `{ valid: true, groups: [] }` success that credits nothing.
Its `credited` scalar carries THREE values across four outcomes: the amount when Fabricate observed the credit, `0` for `creditNotConfigured` and for every refusal taken before any mechanism ran, and `null` for `creditFailed` and `creditUnavailable` alike — `0` means Fabricate can PROVE nothing moved and `null` means it cannot say.
Under `spendStrategy: "macro"` it runs the GM's `increment` macro with `caller: "award"`, the first companion-reachable occasion for that key and the second occasion for that macro.
Named `credit` rather than `award`; see **Alignment Findings** for why.

Canonical mapping: `creditWorldCurrency` (`src/systems/currencyAffordance.js`); `Fabricate.creditCurrency` (`src/bootstrap/companionFacade.js`); `CURRENCY_CREDIT_MESSAGE_KEYS` / `currencyCreditResult` (`src/systems/companionContract.js`)

Spec reference: openspec/specs/companion-api/spec.md, openspec/specs/data-models/spec.md, issue #1301

## Pooled Holdings

The two words are one letter apart in intent and must never be swapped.
Published as the companion pair `game.fabricate.readPooledHoldings({ actorUuids, costs })` and `game.fabricate.consumePooledHoldings({ actorUuids, callSite, costs })` (issue 1342).
Both are GM-gated and address their actors by **UUID**, not id, because `game.actors.get()` cannot distinguish an unlinked token actor from its world prototype — a tolerable ambiguity for every member that GIVES and a corrupting one for the first that DELETES.
The READ takes human-written NAMES on all three cost axes (`component`, `currency`, `tool`), answers the canonical ids each resolved to, reports `ambiguous` rather than silently first-matching, writes nothing, and is **exact at read time and NOT a reservation** — nothing stops an item moving before the consume.
The CONSUME takes RESOLVED IDS only, serves `component` and `currency` (a `tool` cost answers `costTypeUnsupported`; tool WEAR is out of scope), settles components FIRST and coin LAST because a deleted component has an exact inverse (`toObject()` snapshot, re-created `{ keepId: true, keepEmbeddedIds: true }`) while a currency give-back may be absent or lossy, refuses a currency cost UP FRONT as `creditNotConfigured` in a world that has published no way to return coin, is **all-or-nothing** and **NOT idempotent**, and answers a `ledger` naming which document on which actor paid.
`null` means Fabricate CANNOT SEE and `0` means it can PROVE none, on the **Currency Credit** rule; a tool answers a **Required Tool Display State** and its `sufficient` is `state === 'present'` and nothing else.
A currency row's `requested` echoes the caller's own unit while its `consumed` is in the TERMINAL BASE UNIT — a 2 gp cost reads `requested: 2, consumed: 200` — because a payer's share converted back is fractional and a collapsed take discards per-actor attribution.

Canonical mapping: `readPooledHoldings` (`src/systems/companionPooledHoldings.js`); `consumePooledHoldings` (`src/systems/companionPooledConsumption.js`); `pooledItemOrder`/`planFirstFitDrain` (`src/systems/pooledAllocation.js`); `readPooledCurrencyBalance`/`consumePooledCurrency` (`src/systems/currencyAffordance.js`); `POOLED_COST_TYPES` / `POOLED_HOLDINGS_READ_MESSAGE_KEYS` / `POOLED_HOLDINGS_CONSUME_MESSAGE_KEYS` / `POOLED_ACTORS_MAX` / `POOLED_COSTS_MAX` (`src/systems/companionContract.js`)

Spec reference: openspec/specs/companion-api/spec.md, openspec/specs/data-models/spec.md, issue #1342

## Recipe Fragment

This replaces the legacy `TeaserFragment` name.

Canonical mapping: Domain decision; runtime still uses `FragmentDiscoveryHook` / `teaserConfig` aliases

Spec reference: issue #119

## Discovery Mode

This replaces the legacy `teaser` naming family.

Canonical mapping: Domain decision; runtime still uses `teaserConfig` / `Recipe.teaser` aliases

Spec reference: issue #119

## Source UUID

`getCompendiumSourceUuid()` resolves only the **compendium source** (`_stats.compendiumSource`, with the legacy `flags.core.sourceId` fallback).
It is distinct from the **world-duplicate source** (`_stats.duplicateSource`), which Foundry stamps when a world Item is duplicated or dragged into an actor.

Canonical mapping: `getCompendiumSourceUuid()` in `src/utils/sourceUuid.js`

Spec reference: openspec/specs/recipe-visibility/spec.md

## Item Source Reference Chain

An owned item is resolved to the single component it IS through the shared, list-aware, **system-scoped** resolver `resolveComponentForItem(item, components, systemId)` (boolean companion `itemResolvesToComponent`): its durable identity tier — `flags.fabricate.roles[systemId].componentId`, then the legacy scalar `flags.fabricate.componentId` — matches a named component **exclusively** when that id is present in the system's candidate set (siblings fail closed); otherwise it falls through to the raw-reference intersection of this chain against the component's declared references (`registeredItemUuid`, `originItemUuid`, `aliasItemUuids`), unchanged.
`systemId` is threaded because component ids are not globally unique (copy-import preserves them), so identity is scoped per system.
The resolver serves every source-reference consumer — crafting ingredients, crafting/gathering Tool presence, essence/used-by resolution, owned-item repair, gathering award-stacking, alchemy signature matching, and canvas Item→Tool drop — so a drag/duplicate copy of a component's source world item is recognized everywhere, while a copy carrying a distinct durable identity is NOT mis-attributed via a transitive `duplicateSource`.
The separate **name fallback** some callers apply after the resolver returns null is not part of this matcher and is deferred to issue #557.
**Identity decisions use a narrower chain:** import de-duplication (`addItemFromUuid`) and source-metadata propagation (`refreshComponentMetadataForUpdatedItem`) use `getItemIdentityReferences()` — `item.uuid` + compendium **Source UUID** only, **excluding** `_stats.duplicateSource`.
This keeps a world Item cloned from another world Item (Foundry stamps `duplicateSource` on the copy) as a distinct component instead of merging it with — or rewriting — the original.
`flags.fabricate.mythwrightId` and similar importer/pack bookkeeping ids are never matching keys.

Canonical mapping: `getItemSourceReferences()` / `getItemIdentityReferences()` / `getDuplicateSourceUuid()` / `resolveComponentForItem()` / `itemResolvesToComponent()` in `src/utils/sourceUuid.js`; `RecipeManager.toolMatchesItem`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Recipe Item Match Tiers

Definition ids are NOT globally unique (generated per system), so `systemId` scopes the identity tier exactly like components; a dotted/unsafe id degrades to the legacy-scalar + source-uuid tiers (warn once), never throws.
There is **no clone-gate** at match time (tier 3 is always trusted).
The clone-gate is a **registration/source-repair** rule: a world source Item carrying `_stats.duplicateSource` at registration is a duplicate and keys on its own uuid only (excluding the inherited compendium source), so a registered duplicate becomes a NEW definition instead of overwriting the original.
Registration stamps the durable flag and strips a clone's stale `_stats`.
A primary-GM one-shot auto-stamp backfills the flag on existing sources; its recipe-item arm reads `originItemUuid` alone, with NO `registeredItemUuid` fallback, unlike the component and tool arms which read `originItemUuid || registeredItemUuid` (`SourceIdentityService.js:146` vs `:158`, `:170`) — a recipe item's `registeredItemUuid` is set once at registration and never refreshed on re-registration, unlike a component's (`CraftingSystemManager.js:1288-1291` vs `:2552`), so falling back to it here would risk stamping a document the flag no longer names; the GM **Repair Item Data** action reconciles both kinds across world items, packs, and actor inventories, with a guardrailed name-assisted re-point.
Within that reconciliation, the tools kind alone filters out any tool with neither `originItemUuid` nor `registeredItemUuid` (`SourceIdentityService.js:489-491`); an alias-only tool is genuinely representable (`normalizeTool` preserves `aliasItemUuids` whether or not a primary ref is present, `src/systems/normalize/tools.js:46-59`) and matchable by the same resolver the component and recipe-item kinds use, so the exclusion is a deliberate narrowing rather than a no-op, pinned as intended behaviour by issue #1699's revision — no comment, spec or issue history states why a tool must clear that bar before the component and recipe-item kinds are asked to.
Its remit is every PROJECTION of a definition’s resolved source document, not identity alone: the same action also refreshes each component’s and recipe-item’s stored **description** by resolving that definition’s own source reference through Foundry’s enricher (issue 800), which — unlike the identity walk — reaches sources in LOCKED packs.
The bulk on-drop auto-learn path refuses a tier-4-only match **only for a registered definition** (one with an `id`).
A recipe linked solely by the legacy `linkedRecipeItemUuid` — an un-migrated book or a standalone alchemy formula item — resolves through an id-less synthetic entry (`{ id: null, originItemUuid }`) that the auto-stamp can never reach (it iterates `system.recipeItemDefinitions`), so tier 4 is the only signal it can ever produce; refusing it would disable that item's on-drop learning permanently rather than transitionally, so the guard checks `definition.id` and lets an id-less link auto-learn.

Canonical mapping: `matchRecipeItemDefinition()` / `getItemMatchUuids()` in `src/utils/sourceUuid.js`; `CraftingSystemManager` `_resolveImportedSourceData` / `_stampSourceIdentity` / `autoStampRecipeItemSources` / `repairItemData`; `src/systems/SourceIdentityService.js` (`stampSourceIdentity`, `autoStampRecipeItemSources`, `repairItemData`)

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md

## Component Source Actor

Fabricate searches the selected component source actors for ingredients and, when visibility rules allow, recipe-item matches.
The crafting actor receives created results, but ingredient consumption may come from any selected component source actor.
This is distinct from a component's `originItemUuid` or an owned item's source UUID.
Component source actors apply to crafting and recipe-knowledge evaluation; they are not the source of gathering Tools.

Canonical mapping: `componentSourceActors`, `componentSourceActorUuids`, `lastComponentSources`

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/recipe-visibility/spec.md

## Gathering Actor

Gathering _attempt authorization_ is based on actor resolution and Foundry ownership/permission only; Fabricate does not exclude actor document types such as NPCs or groups by type.
Gathering Tools and results are resolved against this actor, not against component source actors.
The remembered `lastGatheringActor` preference is cleared only when the actor no longer resolves or is no longer selectable for the current user, and that startup cleanup stays ownership-based (it does not narrow by the Player Character concept).

Canonical mapping: `lastGatheringActor`, `isGatheringActorSelectableByUser()`, `cleanupStalePreferences()`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-gathering-app/spec.md

## Player Character

`'character'` always counts and cannot be removed; a GM may add further actor types the active game system declares, through a settings-menu picker, and `resolvePlayerCharacterTypes()` unions the additions with `'character'` by construction.
The concept now governs FOUR surfaces: the actor-selection top bar, the GM gathering-stamina roster, the manager's Access and Knowledge rosters, and the party member picker.
A _selectable_ Player Character on the bar and the stamina roster is such an actor the user owns (non-GM) or any such actor (GM); the Access roster, Knowledge roster, and party picker apply the type filter alone with no ownership narrowing, since those are GM-only admin views.
It is deliberately distinct from three predicates it must NEVER be narrowed to match: gathering attempt authorization (ownership-based, unaffected by actor type), write permission (`selectWritableActors`), and access-grant resolution (which resolves granted character ids over every world actor with no type filter).
An unknown or stale configured type id is inert (matched by no actor) and is never auto-pruned.

Canonical mapping: `isPlayerCharacterActor()`, `isSelectableBarActor()`, `getBarSelectableActors()`, `game.fabricate.listSelectableActors()`, `resolvePlayerCharacterTypes()`; distinct from `isGatheringActorSelectableByUser()`, `selectWritableActors()`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-integration/spec.md

## Selectable Actor Listing API

`game.fabricate.listSelectableActors()` returns redaction-safe display records of the form `{ id, uuid, name, img }` (and no other actor internals) for the calling user's selectable Player Characters — owned for non-GM, all for GM, narrowed by `isPlayerCharacterActor` against the GM-configured player-character actor types (`resolvePlayerCharacterTypes()`).
It does not reuse or expand gathering attempt authorization.

Canonical mapping: `listSelectableActors()` in `src/bootstrap/gatheringFacade.js`, `getBarSelectableActors()` in `src/bootstrap/gatheringRuntime.js`

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## Remembered Gathering Actor

It reads and writes the existing `lastGatheringActor` client setting through `game.fabricate.getSelectedGatheringActorId()` / `setSelectedGatheringActorId(id)`; no new persistence key is introduced.
`listGatheringForActor(options)` defaults `rememberedActorId` to this persisted value (or `null` when unset) while an explicit `rememberedActorId` in `options` overrides it.
The listing resolves a remembered id against its **ownership** selectable list (not the Player Character list), so a legacy persisted owned non-PC id MAY be honored on the first fetch; the actor-bar store converges it by falling back to the first Player Character and re-persisting, after which the store and persisted setting agree (the "single source of truth" guarantee holds _after convergence_).

Canonical mapping: `lastGatheringActor`, `getSelectedGatheringActorId()`/`setSelectedGatheringActorId()`, `listGatheringForActor()` `rememberedActorId` default

Spec reference: openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/ui-gathering-app/spec.md

## Actor Selection Top Bar

Its left side is a portrait + caret trigger opening a searchable popover of selectable Player Characters; its right side carries tab-specific context (current weather + time-of-day + current-realm context on the `Gathering` tab only).
The realm chip is driven by the **listing-level realm context** (a party/system property surfaced independent of environment selection), NOT by a selected environment, so it appears whenever the realm subsystem is enabled for the active gathering system — including the all-environments-locked / no-current-realm state, where it shows a "No current realm" placeholder.
It carries an accessible name and announces value changes through a polite live region; it is omitted (selection-driven fallback) when more than one realm-enabled gathering system is present.
Selection and realm/conditions state flow through a single shared store (`services.actorBar`) read and written by both the shell and the gathering tab, never per-tab prop drilling.

Canonical mapping: `ActorSelectTopBar.svelte`, `createActorBarStore()` (`services.actorBar`), `src/ui/svelte/stores/actorBarStore.svelte.js`

Spec reference: openspec/specs/ui-gathering-app/spec.md

## Shopping List

It is derived state, not a persisted aggregate.

Canonical mapping: `shoppingListAggregator.js`, `craftingStore`

Spec reference: issue #11, issue #12

## Workbench

Displayed as compact entries with quantity badges.
Components move between the component inventory and the workbench.
Derived state, not persisted.
Owned by the new `alchemyStore` (NOT `craftingStore`).
Submitting brews via the engine (`submitAlchemyAttempt` -> `craftAlchemy`), which is authoritative.

Canonical mapping: `alchemyStore.workbench` (`src/ui/svelte/stores/alchemyStore.svelte.js`); `src/ui/svelte/apps/alchemy/Workbench.svelte`

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/ui-crafting-app/spec.md

## Workbench Status Mode

Advisory + engine-authoritative: `ready`/`assembling` are scoped to learned recipes reducible to a concrete plain-component multiset; a rich signature (alternatives/tags/essences/multiple sets) fails safe to `untried`.
Undiscovered recipes and never-tried dead-ends both present as `untried`.

Canonical mapping: `alchemyStore` mode resolution; `canonicalSignatureKey` (`src/utils/alchemySignatureKey.js`)

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/ui-crafting-app/spec.md

## Alchemy Dead-End Memory

It is the ONLY thing that flips a bench from `untried` to `no-reaction`, is leak-safe (a fizzle matches no enabled recipe), and is distinct from run history.
Read/written via `getFabricateFlag`/`setFabricateFlag` (doubly-nested `flags.fabricate.fabricate.alchemyDeadEnds`).

Canonical mapping: `Actor.flags.fabricate.alchemyDeadEnds`; `CraftingEngine._recordAlchemyDeadEnd`; `AlchemyListingBuilder` fizzle-key projection

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipe-visibility/spec.md, openspec/specs/recipes-and-steps/spec.md

## Component Palette

Each entry shows image, name, and available quantity (inventory minus workbench).

Canonical mapping: Derived from actor inventories + system components

Spec reference: openspec/specs/resolution-modes/spec.md

## Auto-Fill

Scoped to recipes reducible to a concrete plain-component multiset; rich signatures are shown but not auto-filled (client fails safe to `untried`).
Not a separate per-recipe button.
Reuses the ingredient expansion logic from signature matching.

Canonical mapping: `alchemyStore.selectRecipe`

Spec reference: openspec/specs/ui-crafting-app/spec.md, openspec/specs/recipe-visibility/spec.md

## Check

One roll engine (`src/systems/checkRoll.js`) exposes three runners: `runFormulaPassFail` (roll vs a DC met-or-exceeded → `pass`/`fail`), `runFormulaProgressive` (roll total IS the numeric value progressive awarding spends against result difficulties — **no DC**), and `runFormulaRouted` (map the total onto a named **Outcome Tier** whose name routes to a result group).
A `label` (`Crafting`/`Salvage`/`Gathering`) only customises failure-message wording; the result shape is identical across activities.
The persisted system keys are `craftingCheck`, `salvageCraftingCheck`, and `gatheringCraftingCheck` — the `*CraftingCheck` naming is kept **verbatim for back-compat** even though the model is now activity-agnostic, so `gatheringCraftingCheck` is the gathering check, NOT misplaced crafting config.

Canonical mapping: `runFormulaPassFail`/`runFormulaProgressive`/`runFormulaRouted`/`evaluateCheckRoll` in `src/systems/checkRoll.js`; `system.{craftingCheck,salvageCraftingCheck,gatheringCraftingCheck}`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/resolution-modes/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Standalone Check Roll

It is therefore NOT a **Check**: a Check is taken on a subject inside a Crafting System and carries that system's **Check Modifier** catalogue, combination rule, tool bonuses, **Check Breakage** triggers, **Tier Stepping** and failure-result policy, none of which a Standalone Check Roll has a system or a subject to derive.
A companion wanting those routes a real craft or salvage instead.

Canonical mapping: `src/systems/companionCheckRoll.js` (`rollActorCheck`, `resolveBulkCheckDecision`); published as `game.fabricate.rollActorCheck` / `game.fabricate.resolveBulkCheckDecision` on the `companion` contract (issue 1293)

Spec reference: openspec/specs/companion-api/spec.md, openspec/specs/resolution-modes/spec.md, openspec/specs/ui-crafting-app/spec.md

## Outcome Tier

Two banding types, never mixed in one check: **relative** tiers carry a `dc` **delta** added to a base DC (`threshold = baseDc + outcome.dc`), and among matching tiers the highest effective threshold (best tier) wins; **fixed** tiers own a non-overlapping `[start, end]` value range and match when `start <= total <= end`.
The **final** tier's `name` is the routing key: a **Tier Stepping** trigger effect may move the rolled tier before anything routes (issue 975).
**Clamp (relative only):** a total below EVERY relative threshold routes to the lowest (closest) tier rather than a null outcome, so a rising base DC never leaves a rolled attempt unrouted — opted into by all three activity runners (crafting, salvage, gathering) via `clampToNearest`; **fixed** mode keeps the null "no match" behaviour (its ranges are authored explicitly).
The clamp routes to the closest tier, it does not force success — a below-lowest roll adopts that tier's own `success`/`breakTools` flags, so a failing lowest tier still fails.
**No DC in fixed mode:** because fixed tiers match by explicit range, the check DC and the meet/exceed `thresholdMode` are unused for `routedByCheck` + `type: fixed` (DC is relative-only), so the Checks editor hides both and no `DC N` chip renders on the player check card or the interactive roll prompt; `routedByIngredients` (a pass/fail gate) and relative tiers still use the DC.
**Per-recipe minimum success tier (fixed only):** a `routedByCheck` recipe may carry `minSuccessOutcomeId` (a fixed success-tier id); when the **final** (post-step) tier ranks below it (by `start`), the craft fails outright (`success:false`, no outcome routes, the recipe's normal failure/consumption path runs, no success result), the default null = the final tier, a forced (crit) outcome bypasses it, and a stale/unknown id no-ops.
It is threaded only by the crafting `_runRoutedCheck` caller through `runFormulaRouted`'s optional `minOutcomeId`, so salvage and gathering routed checks are unaffected; on a blocked craft the tier it blocked is recorded as `data.blockedOutcomeId`.
**One ranking (issue 975):** tier ORDER is derived in exactly one place, `rankedRoutedOutcomes`, shared by the forced reroute, this minimum gate and the tier-step pass — ascending by `dc` (relative) / `start` (fixed), non-finite ranks dropped, and the FIRST authored tier kept among equal ranks in both directions.
The gate consumes it only to LOCATE the required tier and still compares threshold VALUES, so two fixed tiers sharing a `start` compare equal and the craft passes, where an index comparison would strictly fail it.

Canonical mapping: `matchRoutedOutcome`/`routeCritOutcome`/`rankedRoutedOutcomes`/`applyTierStepTriggers` in `src/systems/checkRoll.js`; `relativeOutcomes[]`/`fixedOutcomes[]` from `_normalizeRoutedCraftingCheck`, `normalizeRoutedCraftingCheck` in `src/systems/normalize/craftingCheck.js`; `Recipe.minSuccessOutcomeId`; `resolveRecipeFixedOutcomeTierOptions` in `src/utils/routedOutcomeKeywords.js`

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/data-models/spec.md, openspec/specs/ui-integration/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Forced Outcome

Triggers are ORed and a matched **failure takes precedence over a matched success**.
The forced disposition differs by runner: **simple** forces pass/fail; **progressive** forces award-all (`MAX_SAFE_INTEGER`) or award-none (`0`); **routed** REROUTES — a forced success routes to the best succeeding tier and a forced failure to the worst failing tier, and when no tier of that disposition exists the match is **dropped entirely** (no outcome).
A **Tier Stepping** effect may then move that rerouted tier, but stepping is **disposition-preserving**: it moves only within the ranked subset of tiers sharing the forced disposition and clamps there, so a forced success never surfaces a failing tier's name and `data.success` never disagrees with the final tier's own `success`.
Stepping has no forced-outcome bypass — the retired `natStepping` boolean had one because it was a check-wide policy the GM could not scope, whereas a `tierStep` is something the GM opted into on that trigger.
A `diceGroup` condition is **plain-die eligible only**: **modified pools (keep/drop/explode/reroll)** are not eligible, and the editor shares the `parsePlainDiceGroups` classifier with normalization so UI eligibility and persistence cannot drift.
Forced outcome applies under **both** tool-breakage authorities; only the trigger's separate `breakTools` effect is gated to `checkDriven` (see **Check Breakage**).
The macro/built-in guard is preserved: a macro/built-in check passes its `data` through verbatim and is never engine-forced (`engineEvaluated !== true`), so a macro result cannot force an outcome — forcing is an authored-trigger concept absent from the macro contract.
Legacy per-die `DiceCrit` rows migrate ON READ into triggers (`success:true`→`outcome:'success'`, `success:false`→`outcome:'failure'`, carried `breakTools`, converted to a `diceGroup`+`total`+`==` condition; ineligible non-plain-die crits dropped; idempotent).

Canonical mapping: `resolveForcedOutcome`/`rolledDiceGroups` in `src/systems/checkRoll.js`; triggers normalized by `CraftingSystemManager._normalizeUnifiedTriggers`/`_convertDiceCritsToTriggers`/`_normalizeUnifiedTrigger`, `normalizeUnifiedTriggers`/`convertDiceCritsToTriggers`/`normalizeUnifiedTrigger` in `src/systems/normalize/craftingCheck.js`; plain-die classifier `parsePlainDiceGroups` in `src/utils/craftingCheckExpression.js`; `evaluateCheckBreakageCondition` in `src/toolBreakageRuntime.js`

Spec reference: openspec/specs/resolution-modes/spec.md, openspec/specs/gathering-and-harvesting/spec.md, openspec/specs/data-models/spec.md

## System Salvage Check

A per-component `salvage.dcOverride` shifts the resolved DC.
**Routed → result-group routing is explicit:** the final (post-step) tier NAME is looked up in `component.salvage.outcomeRouting` (outcome name → result-group id).

Canonical mapping: `system.salvageCraftingCheck`, `_normalizeSalvageCraftingCheck`, `normalizeSalvageCraftingCheck` in `src/systems/normalize/craftingCheck.js`; `_resolveSalvageDc`/`_runSalvageSimpleCheck`/`_runSalvageRoutedCheck`/`_runSalvageProgressiveCheck` in `CraftingEngine`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## System Gathering Check

A per-task `dcOverride` shifts the resolved DC.
**Routed → result-group routing differs by activity:** crafting and salvage use an explicit `outcomeRouting` map (outcome name → group id), but gathering matches the final (post-step) tier NAME against the task **result-group name** (case-insensitive) — so a routed gathering task's result groups are addressed BY NAME.
The engine consults the system progressive/routed formula only when one is configured.

Canonical mapping: `system.gatheringCraftingCheck`, `_normalizeGatheringCraftingCheck`, `normalizeGatheringCraftingCheck` in `src/systems/normalize/craftingCheck.js`; `_resolveRoutedFormulaOutcome`/`_resolveGatheringRoutedDc` in `GatheringEngine`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Check DC Override

A per-component `salvage.dcOverride` and a per-task gathering `dcOverride` replace the check sub-object's default `dc` (else fallback 15) when finite.
Progressive checks have **no DC**, so an override is irrelevant to (and ignored by) progressive salvage and progressive gathering: it is not a universal knob.

Canonical mapping: `salvage.dcOverride`, `GatheringTask.dcOverride`; `_resolveSalvageDc` in `CraftingEngine`, `_resolveGatheringRoutedDc` in `GatheringEngine`

Spec reference: openspec/specs/recipes-and-steps/spec.md, openspec/specs/gathering-and-harvesting/spec.md

## Character Modifier

Since issue 1117 the entries themselves live in the ONE **Modifier Library**, and since issue 1308 that library is WORLD scope (`characterLibraries.modifiers`); a character modifier is the drop row's or event's REFERENCE into it, by `modifierId`, with an operator (`+`/`-`) and its own optional `min`/`max` caps — independent of the entry's own check-side bounds.
The additive-vs-multiplicative application mode is NOT set per modifier: it is a single global system setting `gatheringConfig.systems[systemId].rules.dropModifierMode` (one of `additive`/`multiplicative`, defaulting to `additive`; the legacy `characterModifierMode` key is read-compatible) and cannot be overridden or subverted per modifier.
That global mode selects whether each clamped value applies as an additive percentage-point delta or as a multiplicative factor `(1 ± V/100)`, and it governs ALL drop-chance modifiers uniformly — character modifiers AND condition modifiers (weather, time of day, biome).
Under additive mode every contribution is summed onto the base; under multiplicative mode every contribution is a factor: additive deltas apply to the base first, then the product of every multiplicative factor, then the rate is clamped and rounded once; biome modifiers are aggregated by the system biome aggregation under the global mode (additive subset into one delta, multiplicative subset into one factor); stamina-cost adjustments stay additive regardless of mode.
Character modifiers adjust the **threshold side** of the d100 comparison; the existing `task.gatheringModifier` and `event.eventModifier` continue to adjust the **roll side**, and the two surfaces are evaluated independently.
A per-row `expressionOverride` lets a single row substitute its own expression in place of the library entry's expression.
**The "two libraries" pairing is RETIRED** (issue 1117): there is one library, and what differs is how each consumer APPLIES an entry.
Character modifier references are `d100` ONLY — they **do not participate in progressive or routed gathering resolution**, which roll an authored formula and carry the check selection's additive `+ N[Modifiers]` term instead — so the two applications never both apply to one roll.
The SECTIONS keep distinct names for that reason: "Character modifiers" on a drop row or event, "Check modifiers" on a Checks route, "Modifiers" on the library.
An entry whose expression rolls dice is legal here AND on a check (issue 1118), which appends it to its roll formula as dice.
Presets for `dnd5e` and `pf2e` ship as opt-in seedable bundles (keyed on `game.system.id`, supplying system-specific roll expressions); nothing is added without explicit GM action.

Canonical mapping: `characterLibraries.modifiers`; `resolveModifierLibrary` in `src/systems/characterLibraries.js`; `normalizeDropCharacterModifiers`/`normalizeEventCharacterModifiers`, `applyDropModifierContributions`/`matchingConditionModifierEntries`/`matchingBiomeModifierEntries`, `_systemModifierLibrary` and `resolveD100Attempt` in `GatheringRichStateService`; `DND5E_CHARACTER_MODIFIER_PRESETS`/`PF2E_CHARACTER_MODIFIER_PRESETS` in `src/config/gatheringCharacterModifierPresets.js`; admin store actions `addSystemModifier`, `seedSystemModifierPresets` (both retain a `System` in their names while writing the WORLD library, and are named for renaming with the editor relocation), and the row/event-scoped add/update/delete actions

Spec reference: openspec/specs/gathering-and-harvesting/spec.md

## World-Time Anchor

Governing principle, stated once and applying to all three families: _a rewind must neither re-grant an entitlement nor re-impose a restriction resolved in the discarded timeline; a commitment still in flight is simply not yet due._
**Accrual anchor** — a resource-node pool's `respawn.lastEvaluatedWorldTime`, an actor stamina pool's `lastRegenWorldTime` — is a high-water mark of entitlement already granted: monotonic non-decreasing, so a backward `now` FREEZES it (writes nothing for that resource, and it may legitimately sit ahead of `now`, including from a foreign-timeline actor import, not only a rewind); an ABSENT anchor (missing key, or `null`) is SEEDED at `now` and persisted instead of frozen — seeding establishes an anchor that never existed and is not itself a re-anchor.
The absent predicate is **nullish or non-finite, never falsy**: world time `0` is a legitimate anchor, and `Number(null) === 0` is finite, so a bare finiteness check reads a `null` anchor as anchored at epoch.
A GM re-anchor remedy for a frozen accrual anchor is deferred (issue 894); today only the stamina side has one (`game.fabricate.rollGatheringStamina`, lossy).
**Restriction anchor** — an interactable's cooldown `state.cooldown.lastUsedWorldTime` — measures a penalty running FROM a recorded instant, so its rule is the INVERSE of accrual: clamp forward to `now` when the anchor sits ahead, since leaving it in place would re-impose a penalty resolved in a discarded timeline.
Specified here for taxonomy completeness only; NOT implemented (issue 891).
**Commitment deadline** — a gathering run's `timeGate.availableAt` — is an absolute maturity instant for work already in flight and is never adjusted in either direction, since a rewound world genuinely has not reached it yet; it is normatively specified in the recipes-and-steps and data-models specs, and this row is its cross-subsystem taxonomy home rather than a second normative source.
**Record** (not an anchor at all) — `startedAtWorldTime`, `completedAtWorldTime`, `updatedAtWorldTime`, and the `worldTime` stamped onto a history event — nothing is gated on it, a world-time move never adjusts it, and it may legitimately read as later than the current world time.

Canonical mapping: `nodeRespawnMath.js` `respawnNodeOnce` (node accrual anchor, all three call paths — environment pools, interactable-scoped pools, and `GatheringRichStateService.commitAcceptedAttempt`'s seed); `GatheringStaminaService.regenerateActorStamina` (stamina accrual anchor); interactable `state.cooldown.lastUsedWorldTime` (restriction anchor, unimplemented — issue 891); run `timeGate.availableAt` in `CraftingRunManager`/`CraftingEngine` (commitment deadline).
**Trap:** `numberOrNull` names two different null policies.
`src/utils/scalars.js` exports both — `numberOrNull` answers `null` for `null`, `undefined` and `''`, while `laxNumberOrNull` collapses `null` and `''` to `0` because `Number(null)` and `Number('')` are `0`, and of those three only `undefined` still answers `null` — and the bare name `numberOrNull` still carries the lax policy in `systems/gatheringEngineInternals.js`, which re-publishes it to its importers, and in `systems/GatheringRichStateService.js`, which aliases it at import beside `numberOrNullStrict` for the strict one.
An accrual-anchor absent-check must consume the `null`-preserving one: the lax (`0`-collapsing) one would make the seed branch unreachable in production even though hand-built unit fixtures still pass against it.

Spec reference: openspec/specs/gathering-and-harvesting/spec.md (## World-Time Anchors and Rewind Policy; Gathering Resource Nodes Requirement 14; Gathering Economy and Stamina Requirement 27), openspec/specs/recipes-and-steps/spec.md, openspec/specs/data-models/spec.md

## Valid Id Basis

The rule is one line: **a destructive pass runs only when its Valid Id Basis is known-complete**, because a pass that cannot see a live record concludes the thing naming it is stale and deletes durable state that never was.
Scoped to the KIND of prune rather than to the moment it runs: a CORPUS-DERIVED prune infers a deletion from an ABSENCE and is governed wherever it runs, while a SUBJECT-TARGETED prune names ids the caller just removed and needs no basis.
Every id set a corpus-derived pass is given MUST be derived from the corpus and never defaulted away — a pass handed an empty set for one entity class prunes every key scoped to that class on every run, which is this rule's own failure mode reached by an omitted ARGUMENT rather than by an incomplete corpus.
A pass that rewrites ONE store keyed by several classes is declared on the UNION of them and MUST NOT be decomposed. "This client did not run the migration" is NOT an input: it is true on every non-primary client on every boot, so it would omit the passes permanently on a healthy world, and `progressiveResultOrder` is `user`-scoped, so no GM can prune it on another user's behalf.
**THE GATE HAS TWO ENFORCEMENT SHAPES.**
The FIRST and default is to OMIT the pass from the pass list, never to throw from inside it, because `runStartupMaintenance` catches every throw only after the destructive work has already landed; it is available whenever a pass exists only to prune, so not running it is a complete outcome.
The SECOND (issue 1308) is for a prune that is one step inside a pass that MUST still run: `CraftingSystemManager._normalizeSystem` is a whitelist rebuild that PRODUCES the persisted crafting-system record, and `upsertTool` exists to save a Tool, so omitting either declines to emit a record rather than declining to prune.
There the UNKNOWN basis is carried to the prune site as a SENTINEL and only the prune is skipped: the pass runs, every non-destructive derivation still happens, and the unfiltered reference lists pass through.
Three rules keep that safe.
The sentinel must be distinguishable from an EMPTY basis by TYPE and never by size, because an empty basis is a real prunable answer AND is exactly what an omitted argument produces (`null`, tested with `instanceof Set`, so a caller who supplies nothing gets the safe direction).
Every prune site that can receive it must test for it, argument defaults included — an argument default of `new Set()` IS this rule's failure mode reached by an omitted argument.
And the basis must be THREADED AS A PARAMETER rather than dug out of a collaborator inside the pass, so the pass stays a function of its arguments and can be handed, and tested with, an unknown one.
**A SEEDEDNESS PREDICATE MUST BE ASKED ABOUT THE SUB-KEY THE ID SET IS DRAWN FROM** (issue 1359): a store holding several sub-keys under one setting answers an aggregate `isSeeded()` by ORing across them, so an aggregate answer reports seeded on the strength of a SIBLING and hands the basis a real, empty, prunable id set derived from a sub-key that is simply absent.
That is also why the three world scope settings are three KEYS and not one — on a shared key the predicate cannot be honest per entity type at all, because one entity type's first write persists the others as empty.
**THE LEGACY HALF COUNTS ONLY WHEN IT IS NON-EMPTY:** an empty in-system array is a legacy KEY rather than a legacy corpus, so it vouches for nothing while licensing a full prune, and the answer is UNKNOWN only when the store is unseeded AND that array is empty — deriving it from seededness alone returns UNKNOWN on every unmigrated client for every system and silently disables every prune in the corpus for a release.
**A VOCABULARY IS A BASIS TOO:** an icon map is pruned only against a known-complete vocabulary and only against ITS OWN (`componentCategoryIcons` against `componentCategories`, `categoryIcons` against `categories`, never the other's), with an unknown one falling back to the map's own keys so shape rules still apply and nothing is dropped.
**A DEGRADED ARGUMENT IS THIS RULE'S BLIND SPOT:** a defect that keeps the derivation call and corrupts only what it is derived FROM passes any site-counting census, so the change that first reads an id set rather than only its known/unknown state owns behavioural coverage for the prune's OUTCOME.
The second shape relaxes nothing about what makes a basis known-complete and reports nothing, because the pass itself did run; what the first shape reports as an omission, this one leaves visible as unpruned references the next known-complete normalize resolves.
_Neighbour disclosed:_ the UI surface specs already use _basis_ as an ALWAYS-QUALIFIED noun — **membership basis** (`ui-system-studio/spec.md` _Books & Scrolls Surface_, "Which basis resolves membership is recorded on the system, not inferred per read"), **routing basis** (`ui-entity-editors/spec.md` _Step Editor_), **disabled-action basis** (`ui-crafting-app/spec.md` _Player Salvage Surface_) — and in every one of those it names the RULE by which something is resolved, whereas _Valid Id Basis_ names the DATA a decision rests on; the senses differ, so the qualifier is mandatory and the bare noun is never used for this concept, but it FITS that established always-qualified pattern rather than colliding with a single term, which is why it is preferred to a fresh coinage.
_Definition Corpus Completeness_ was rejected because `DOMAIN.md` (**Projection Tier**) already uses "the completeness verdict" as a PER-RECIPE authoring field, and per-record versus per-corpus is exactly the confusion that must not be introduced here.

Canonical mapping: `buildStartupPassList` and `WHOLE_CORPUS_ID_BASIS` in `src/systems/startupMaintenance.js`; `cleanupStalePreferences` in `src/config/preferencesCleanup.js`; `CraftingSystemManager._characterLibraryBasis` (the sentinel shape) with `_normalizeToolPrerequisites` (`normalizeToolPrerequisites` in `src/systems/normalize/tools.js`), `_normalizeCheckModifierSelection` (`normalizeCheckModifierSelection` in `src/systems/normalize/craftingCheck.js`) and `_normalizeEssenceQuantities` (`normalizeEssenceQuantities` in `src/systems/normalize/essences.js`) as its prune sites, and `CharacterLibrariesStore.isSeeded()` as the never-written-versus-emptied predicate; `CraftingSystemManager._scopeBasis` / `_scopeEntityBasis` / `_vocabularyBasis` / `_iconAllowance` with `_normalizeSystem`, `createItem`, `addItemFromUuid`, `replaceItemSource`, `updateItem` and `applyBulkEditToComponents` as its six derivation sites, and `ScopedDefinitionStore.isSeeded(subKey)` as the per-sub-key predicate

Spec reference: openspec/specs/data-models/spec.md (### Valid Id Basis)

## Invalidation Domain

Seven, closed: `labelling`, `narrative`, `materials-and-yield`, `resolution-config`, `component-definitions`, `access-and-knowledge`, `held-inventory`.
Two other senses of "domain" are live in this repository and neither is this one.
It is NOT a **Bounded Context** (see below): a bounded context is a region of the ubiquitous language, while an invalidation domain classifies FACTS and exists only to decide what to rebuild.
It is also NOT the **entity scope** of a revision token — `recipes` / `systems`, which `revisionTokens.js` once called "the domain scope" and no longer does, precisely so one frozen constant does not carry both senses.
A domain composes into a token scope as `facts:<domain>:<systemId>`.
Which stores CONSUME each domain is authored once and transposed; the transpose is derived, never written by hand.
Attribution accompanies every mutation, and saying nothing means EVERY domain — over-broad, never stale.

Canonical mapping: `INVALIDATION_DOMAINS`, `DOMAIN_CONSUMERS`, `STORE_DOMAINS` (`src/systems/invalidationDomains.js`); `REVISION_SCOPES.facts` (`src/systems/revisionTokens.js`); `tests/invalidation-domains.test.js`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/ui-crafting-app/spec.md

## Item Receipt

Its quantity is an acknowledged DELTA derived from stored source quantities — never a final stack total and never a defaulted authored amount.
An explicit zero stays zero; an invalid or missing amount stays unknown.
For a rolled amount the receipted quantity is the RESOLVED integer and never the authored `quantity`, and an empty award writes no receipt at all.
One invocation owns its receipts, so repeated awards onto the same document cannot borrow a later row's or run's amount, and an unacknowledged, short or throwing write yields uncertainty rather than a positive receipt.

Canonical mapping: `itemReceipt` / `createItemReceiptCollector` / `writeItemAward` in `src/systems/runHistoryEvidence.js`; used by the gathering result creator, `createOrStackComponentItem`, crafting consumption, alchemy fizzle and native salvage

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md

## Evidence State

Five states stay distinct and never collapse into one another: **unknown** (nothing was captured), **withheld** (evidence exists but the current viewer is not entitled to it), **not applicable** (`notApplicable` — the fact was genuinely never attempted), **complete-empty** (`complete` beside an explicitly empty receipt, a decided zero), and **uncertain** (`uncertain` — an invoked effect whose outcome was never acknowledged).
Missing evidence is never rendered as "No check", as zero, or as an award; withheld evidence is never encoded as complete-empty; and a historical fallback never supplies a quantity.

Canonical mapping: `historySettlement.{consumption,awards}` via `historyEvidenceFields` for the last four; withheld is the entitlement gate in `RunJournalBuilder` (`historyEntitled`, redacting to "Hidden recipe"); rendered by `historyPresentation.js` / `HistoricalRunDetail.svelte`

Spec reference: openspec/specs/data-models/spec.md, openspec/specs/recipes-and-steps/spec.md, openspec/specs/ui-journal-app/spec.md

## Recorded Roll Model

Only an explicit root roll establishes sharing — equal row values do not — and a missing root roll is never synthesized from the first row.
This is a legacy-history presentation exception; current gathering execution semantics are unchanged.

Canonical mapping: `gatheringHistoryEvidence()` → `gatheringYield.rollModel`; the `rollModel` prop on `YieldScale.svelte`

Spec reference: openspec/specs/ui-journal-app/spec.md, openspec/specs/design-system/spec.md

## Visual Style

Normative for every screen and owned by no one screen, which is why it is a domain rather than a section of one.

Canonical mapping: `styles/fabricate.css`, the `--fab-*` token set

Spec reference: openspec/specs/ui-visual-style/spec.md

## Manager Shell

Named separately so a route cites the shell's return-to-list, selection and marker rules instead of restating them.

Canonical mapping: `CraftingSystemManagerRoot.svelte`, the Manager nav rail

Spec reference: openspec/specs/ui-manager-shell/spec.md

## System Studio

The per-system half of the Manager, as against the world-scoped entity rows below.

Canonical mapping: `src/ui/svelte/apps/manager/`, `adminStore`

Spec reference: openspec/specs/ui-system-studio/spec.md

## Entity Editors

Their inspector, dirty-draft and save patterns are one shared contract, not three.

Canonical mapping: `src/ui/svelte/apps/manager/recipe/`, `src/ui/svelte/apps/manager/component/`

Spec reference: openspec/specs/ui-entity-editors/spec.md

## Extension Points

Both are experimental-gated, and both are contribution, never consumption.

Canonical mapping: `src/ui/managerExtensions.js`, `src/ui/playerExtensions.js`

Spec reference: openspec/specs/ui-extension-points/spec.md

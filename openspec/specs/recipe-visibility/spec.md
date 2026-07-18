# Recipe Visibility

## Purpose

Define recipe visibility, knowledge gating, recipe-item matching, and learning behaviour.
UI rendering requirements live in `ui-integration/spec.md`.

## Scope

This spec governs:

- Which recipes are visible in player listings.
- Which visible recipes are craftable.
- How recipe-item possession is evaluated.
- How learned recipes are stored and checked.
- How limited-use recipe items are consumed.

## Data Model References

From `data-models/spec.md`:

- `CraftingSystem.visibilityMode` (canonical flat strategy: `global` | `restricted` | `item` | `knowledge`)
- `CraftingSystem.recipeVisibility` (legacy strategy, superseded by `visibilityMode`; read as a derivation fallback: `listMode`, `knowledge.mode`, `knowledge.learn.dragDropEnabled`)
- `CraftingSystem.recipeItemDefinitions`
- `RecipeItemDefinition.recipeIds` (canonical recipe↔book membership, many-to-many)
- `RecipeItemDefinition.caps` (per-recipe-item use/learn caps, including `caps.learn.prerequisiteIds` and `caps.learn.characterPrerequisiteIds`)
- `CraftingSystem.characterPrerequisites` (system-owned character-prerequisite library referenced by `caps.learn.characterPrerequisiteIds`)
- `Recipe.access` (canonical restricted-mode grants: `characterIds`, `playerIds`)
- `Recipe.visibility` (legacy restricted-mode player list; `access` read-forward source)
- `Recipe.recipeItemId` (legacy; removed by the 1.13.0 migration, read as an un-migrated fallback)
- `Recipe.locked`
- `Actor.flags.fabricate.learnedRecipes`
- `Item._stats.compendiumSource` (Foundry v12+, primary source UUID field)
- `Item.flags.core.sourceId` (Foundry v11 and earlier, legacy fallback)
- `Item.flags.fabricate.recipeItemUsage.timesUsed`
- `Item.flags.fabricate.recipeItemLearning.learnedCount`

## Source UUID Resolution

Foundry v12 changed how the origin of a compendium-derived item is recorded.
On v12 and later the canonical field is `_stats.compendiumSource`; on v11 and earlier it was `flags.core.sourceId`.
Both fields serve the same purpose: they record the UUID of the compendium document from which a world or actor-owned copy was created.

**All matching logic in this spec that previously referred to `flags.core.sourceId` now uses a shared source-UUID resolver** defined as follows:

```text
resolveSourceUuid(item):
  return item._stats?.compendiumSource
      ?? item.flags?.core?.sourceId
      ?? null
```

The resolver reads `_stats.compendiumSource` first.
If that field is absent or nullish, it falls back to `flags.core.sourceId`.
If neither field is present, it returns `null`.

Every matching rule in this spec that compares an item's source identity to a stored UUID must invoke the resolver rather than reading either field directly.
This ensures consistent behaviour across Foundry versions.

## Recipe Item Matching

A candidate owned item is matched to a recipe item definition through one shared, system-scoped matcher (`matchRecipeItemDefinition(item, definitions, systemId)`) that evaluates four tiers (issue 555, made per-system by issue 567), mirroring `resolveComponentForItem`.
The durable identity tier (tier 1) is evaluated first and is LIST-AWARE (a claimed id naming nothing in the candidate set falls through); among the source-reference tiers 2–4 the FIRST that yields a matching definition wins, with NO fall-through to a lower source tier.
Tiers 2–4 test membership in the definition's UNION of source references — its `registeredItemUuid` (the registered live document), its `originItemUuid` (the canonical compendium/source uuid), and any `aliasItemUuids`.

1. `identity` — the durable, system-scoped identity: `flags.fabricate.roles[systemId].recipeItemDefinitionId` names a definition in the set first, then the legacy scalar `flags.fabricate.recipeItemDefinitionId` names one — each matching exclusively and otherwise falling through.
2. `uuid` — `candidate.uuid` is among the definition's source references.
3. `compendium` — `resolveSourceUuid(candidate)` is among the definition's source references.
4. `duplicate` — `resolveDuplicateSourceUuid(candidate)` (the transitive `_stats.duplicateSource`) is among the definition's source references.

Tier 1 is the durable identity-of-record: `flags.fabricate.roles[systemId].recipeItemDefinitionId` is the third per-system `roles` sibling after `componentId` (#556) and `toolId` (#561), a transferable marker copied into every drag/duplicate copy that survives Foundry's transitive `_stats.duplicateSource` template chaining, which source-uuid matching cannot.
The legacy scalar `flags.fabricate.recipeItemDefinitionId` is a transitional read-only fallback tier honored until the one-shot restamp backfills the map.
Definition ids are NOT globally unique (generated per system), so `systemId` scopes the identity tier exactly as it does for components; a dotted/unsafe id degrades to the legacy-scalar + source-uuid tiers (warning once) rather than throwing.
Tiers 3 and 4 cover compendium-derived and world-duplicate copies; on Foundry v12+, `_stats.compendiumSource` carries the tier-3 value and on v11 `flags.core.sourceId` does, and the resolver handles both transparently.
The tier-4 `_stats.duplicateSource` condition was matched at runtime before issue 555 but undocumented here; it is now part of the precedence.

There is no clone-gate in this matcher: tier 3 is always trusted at match time, because an actor-owned copy legitimately carries both an inherited `_stats.compendiumSource` (provenance) and a `_stats.duplicateSource` (Foundry stamps it on every non-compendium drag-drop).
The clone-gate is a REGISTRATION and source-repair rule only (see the data-models spec) and must never reach this matcher.

### Bulk auto-learn confidence gate (tier 4)

The `createItem` bulk on-drop auto-learn path (`mode: 'auto'`) must NOT auto-grant a recipe whose owned item matches a **registered** definition (one that carries an `id`) ONLY via tier 4 (the un-migrated `_stats.duplicateSource` fallback).
A silent bulk grant of recipe knowledge is neither cheap nor reversible, so it demands a higher-confidence match.
The refusal is scoped to registered definitions on purpose.
A recipe linked solely by the legacy `linkedRecipeItemUuid` — an un-migrated book, or a standalone alchemy formula item — resolves through the id-less synthetic entry `_recipeItemMatchDefinitions` builds (`{ id: null, originItemUuid: legacyUuid }`), which has no source the auto-stamp can ever reach because `autoStampRecipeItemSources` iterates `system.recipeItemDefinitions` and an id-less entry is not one of them.
Tier 4 is therefore the only signal such an item can ever produce, so refusing it would disable its on-drop learning **permanently** rather than only until the auto-stamp runs; the guard checks `definition.id` precisely so an id-less link still auto-learns.
Explicit learn, the item-sheet picker (`mode: 'manual'`), and every display path still honour tier 4.
This gate is paired with the mandatory primary-GM auto-stamp (see the data-models spec), which flags every registered book so real books resolve at tier 1 and keep auto-learning.

> Authoring note (issue 511, PR-B): recipe↔book membership is authored **book-side** on the Books & Scrolls item Contents tab — each recipe item definition owns a `recipeIds[]` list of the recipes it contains.
The recipe editor no longer writes a book link.
When a definition's `originItemUuid` no longer resolves, the editor surfaces a missing/stale state and retains the reference.
The matching rules above are unchanged; UI rendering specifics defer to `ui-integration`.

## Visibility Mode (Canonical Strategy)

`CraftingSystem.visibilityMode` is the **canonical** recipe-visibility strategy (issue 511, PR-B): a single flat enum `global` | `restricted` | `item` | `knowledge` that supersedes the legacy compound `recipeVisibility.listMode` + `knowledge.mode` pair.

- `global` — every enabled recipe is visible to all players.
- `restricted` — recipes are gated by per-recipe/character grants (the legacy `player` list mode; see Restricted Visibility below).
- `item` — a player may craft a recipe only while holding a book/scroll linked to it; the book grants **crafting-by-holding** (a use cap may apply) and offers no Learn affordance.
- `knowledge` — a player must **learn** the recipe from a linked book/scroll; the book offers a Learn affordance (a learn cap may apply).

Resolution: when a system carries an authored `visibilityMode`, it wins; otherwise the runtime derives one from the legacy fields — `player` → `restricted`, `knowledge`+`item` → `item`, `knowledge`+(`learned`|`itemOrLearned`) → `knowledge`, `global` → `global`, missing/unknown → `global` (`teaser` keeps its own Discovery-Mode runtime).
The `1.12.0` migration seeds `visibilityMode` from the legacy block once (mapping `player`→`restricted`, `knowledge`+`item`→`item`, `knowledge`+learning→`knowledge`, `teaser`→`global`, absent/invalid→`knowledge`) and leaves `recipeVisibility` in place for its residual `dragDropEnabled`.

The player book affordances (Learn vs Craft) are classified from this flat mode by the inventory builder: `item` books list Craft controls and their craft-use limit, `knowledge` books list Learn controls and their learn limit, and `global`/`restricted` systems project no book rows.

## Recipe↔Book Membership

The recipes a book/scroll contains are the canonical many-to-many membership `RecipeItemDefinition.recipeIds[]` (issue 511, PR-B) — a recipe may belong to several books, and each book carries its own caps.
The runtime reads `recipeIds[]`; it falls back to the legacy scalar reverse ref (`recipe.recipeItemId`, or `recipe.linkedRecipeItemUuid` → a definition `originItemUuid`) **only** for a fully un-migrated system where no book carries `recipeIds` yet.
The `1.13.0` migration inverts each recipe's former book onto `recipeIds` and strips `recipe.recipeItemId` unconditionally; it strips `recipe.linkedRecipeItemUuid` only when that uuid itself resolved a book, preserving a `linkedRecipeItemUuid` that instead links a standalone alchemy formula item.

## Recipe-Item Cap Resolution

The use cap (craft charges) and the learn cap are **per recipe item**, not a single system-wide config.
They are read from the recipe's member book definition (`RecipeItemDefinition.recipeIds` → that definition's `caps`), so two books in one crafting system may enforce different caps.
Because membership is many-to-many, the learn/use paths anchor caps on the **specific owned book** the reader holds (`_matchDefinitionForItem` selects the definition the owned item matches through the shared four-tier matcher).

Cap resolution has two distinct fallback cases (issue 555, R6):

- A **supplied** item that matches no member definition resolves to **no** definition (`null`), so its caps are uncapped — the reader is not held to some other book's cap it does not hold.
- An **absent** item (`null`) resolves to the recipe's **first** member book, used for system-wide defaults and previews.

Cap resolution otherwise **fails closed**: when a recipe resolves to no `RecipeItemDefinition`, the caps default to uncapped (unlimited uses, no learn cap, `consumeOnLearn` on).
An unresolved link therefore never bricks a recipe with a zero budget.

The per-**document** runtime counters are unchanged by this move: craft charges accumulate in `Item.flags.fabricate.recipeItemUsage.timesUsed`, and the `perInstance`-scope learn budget accumulates in `Item.flags.fabricate.recipeItemLearning.learnedCount`.
Both counters live on the physical item document, accumulate across every holder, and survive transfer.
A `caps.learn.learnScope === "total"` learn cap instead draws every actor's learns from one GM-authoritative shared world pool keyed `system::defId` (the recipe-item party learn pool), not the per-document counter.
Only the cap *configuration* moved from the system config onto each recipe item definition.

## Visibility Evaluation

### System-Validity Gate

A crafting system is evaluated for system-level validity by the derived
system-validation report (see `data-models`).
A report whose `blocksSystem === true` means the system is structurally unusable
(for example a `routedByCheck` system with no crafting check roll formula, a
progressive system with no progressive check, multi-step recipes left on in
alchemy mode, or an alchemy ingredient-signature collision).

A `routedByCheck` system with no configured crafting check roll formula
(`craftingCheck.routed.rollFormula`) surfaces `routedCheckNoFormula` as an
**unconditional** system-blocker (`severity: 'critical', blocks: 'system'`),
computed purely from `resolutionMode === 'routedByCheck'` plus the missing formula
with NO recipe scan: every recipe in the mode routes by the check, so the gap
blocks the whole system regardless of how many recipes exist (even zero).
A `routedByIngredients` system carries no `routedCheckNoFormula` pressure at any
formula state — its check is optional, so a missing routed roll formula simply
means no check runs.

The gate is two-tier and computed — it never mutates any entity's stored
`enabled` flag, so it auto-restores the moment the underlying gap is fixed:

1. **System tier.** If the report's `blocksSystem === true`, the system exposes
   NO recipes to non-GM users in any list mode, and the crafting guard rejects
   every craft against the system.
2. **Entity tier.** Otherwise, exclude only the individual entities the report
   marks with `blocks: 'visibility'` (or an `enable`-disabled entity); the rest of
   the system stays listed and craftable.

**GM bypass.** A GM bypasses both tiers — a GM always sees and can reach a broken
system and its entities so they can fix it.
The gate is evaluated against `game.user?.isGM`.

The system-blocker decision is computed at most once per listing call (cached per
system), not rebuilt per entity, because listing is a synchronous per-render read.

### Listing Algorithm

Given `viewer`, `craftingSystem`, optional `craftingActor`, optional `componentSourceActors`:

0. Apply the System-Validity Gate above.
   If `blocksSystem === true` and the viewer is not a GM, return no recipe
   listings for `craftingSystem`.
   Otherwise drop entities marked `blocks: 'visibility'` for non-GM viewers before
   continuing.
1. Collect recipes in `craftingSystem`.
2. If `craftingSystem.resolutionMode === "alchemy"`, apply the **reveal-not-gate** model (see Alchemy Visibility and Learning):
   - GM sees all recipes.
   - A non-GM sees a recipe when it is REVEALED, where reveal is `access.visible === true` from the alchemy branch of `evaluateRecipeAccess`, dispatched on the system's `visibilityMode`: `global` reveals discovery-only (`learnedRecipes`); `item` reveals a linked book/scroll held on the crafting actor or a component source; `knowledge` reveals a recipe learned via the Inventory learn path (`learnedRecipes`); `restricted`/Manual reveals via the per-recipe `access` grant.
   - Discovery-by-brew reveal (`learnedRecipes`, written only when `alchemy.learnOnCraft === true`) is unioned across ALL modes.
   - For existing worlds seeded `visibilityMode` (absent/invalid → `knowledge`, 1.12.0), `global` and `knowledge` both collapse to `learnedRecipes ∪ brew-discovery` from the same `learnedRecipes` read (no book/grant is needed for the discovery-only path), so behavior does not silently change.
   - `visibilityMode` selects only the reveal source; brewing is NEVER gated by reveal (see Brew Never Gated by Visibility).
   - Skip non-alchemy list-mode branches below.
3. If `listMode === "global"`:
   - GM sees all recipes.
   - Non-GM sees all enabled recipes.
No restriction or knowledge filtering is applied.
4. If the mode is `restricted` (flat `visibilityMode === "restricted"`, or the legacy `listMode === "player"`):
   - GM sees all recipes, including restricted recipes with no grants.
   - A non-GM sees a recipe when the recipe's per-recipe `access` grant admits them (`_isRecipeVisibleByAccessGrant`): the viewer's **user id** is in `access.playerIds`, OR the viewer **controls** an actor in `access.characterIds`.
   - "Controls" (`_viewerControlsCharacter`) means the actor is the viewer's assigned character (`viewer.character`) OR the viewer holds Foundry `OWNER` permission on it.
   - When a recipe has both grant lists empty (and no legacy fallback), no non-GM user can see it.
   - Legacy fallback: when a recipe carries no `access` grant object, the old `visibility.restricted` / `allowedUserIds` player-list gate applies (an unrestricted recipe is visible; otherwise the viewer's user id must be in `allowedUserIds`).
5. If the mode is `item` or `knowledge` (flat `visibilityMode`, or the legacy `listMode === "knowledge"`):
   - Evaluate knowledge access for each recipe.
   - Keep only recipes where access is granted.
6. Keep locked recipes visible but not craftable for non-GMs.

### Restricted Visibility Examples

Restricted mode grants access through the per-recipe `access = { characterIds, playerIds }` object.
The examples below use viewer `U` (user id `"U"`) who controls actor `A` (assigned character or `OWNER`).

| `access.playerIds` | `access.characterIds` | GM sees? | Viewer `U` sees? | Notes                                                    |
|--------------------|-----------------------|----------|------------------|----------------------------------------------------------|
| `["U"]`            | `[]`                  | Yes      | Yes              | `U`'s user id is granted directly                        |
| `[]`               | `["A"]`               | Yes      | Yes              | `U` controls a granted character                         |
| `["X"]`            | `["B"]`               | Yes      | No               | `U` is not granted and controls no granted character     |
| `[]`               | `[]`                  | Yes      | No               | No grants: hidden from all non-GM users                  |
| (no `access`)      | (no `access`)         | Yes      | per legacy       | Falls back to `visibility.restricted` / `allowedUserIds` |

### Crafting Guard Algorithm

Before starting/resuming a run and before each step:

0. Apply the System-Validity Gate.
   For a non-GM viewer, reject execution when the system's validation report has
   `blocksSystem === true`, or when the targeted entity is marked
   `blocks: 'visibility'`.
   A GM bypasses this step.
1. If `craftingSystem.resolutionMode === "alchemy"`:
   - attempts are validated by submitted ingredients, not by selecting from listed recipes.
   - no-signature attempts are treated as failed attempts with specific failure feedback and ingredient consumption.
   - non-GM users cannot bypass visibility by directly targeting hidden recipe IDs.
2. Re-run listing visibility checks for the active mode.
3. For non-GM users, reject locked recipes regardless of list mode.
4. If the mode is `global`, no additional filtering beyond step 3.
Non-GM users may craft any unlocked, enabled recipe.
5. If the mode is `restricted`, re-run the access-grant check.
Reject when the recipe's `access` grant does not admit the viewer — the viewer's user id is not in `access.playerIds` and the viewer controls no actor in `access.characterIds` (legacy fallback: not in `allowedUserIds` for a restricted recipe).
6. If the mode is `item` or `knowledge`, re-run knowledge access evaluation.
Reject if knowledge access is denied.
7. Reject execution when any guard fails.

## Alchemy Visibility and Learning

Applies only when `CraftingSystem.resolutionMode === "alchemy"`.

Alchemy visibility is **reveal-not-gate**: `visibilityMode` selects which source(s) REVEAL a recipe in the player's Known list, but brewing is NEVER gated by visibility (a matched ingredient signature is the sole brew gate — see Brew Never Gated by Visibility).

1. Per-mode reveal for a non-GM viewer (each returns the alchemy branch's `visible`; a GM has every recipe revealed):
   - `global` — discovery-only (`learnedRecipes`).
   - `item` — a linked book/scroll held on the crafting actor OR a component source (ephemeral; follows possession, computed synchronously from live `actor.items`, recomputed per build — a dropped book un-reveals on the next build with no flag write).
   - `knowledge` — a recipe learned via the Inventory learn path (`learnedRecipes`).
   - `restricted`/Manual — the per-recipe `access` grant admits the viewer (`_isRecipeVisibleByAccessGrant`).
2. Discovery-by-brew reveal is unioned across ALL modes and is on a MATCHED SIGNATURE, decoupled from check success (issue 554):
   - if `alchemy.learnOnCraft === true`, a matched-signature attempt writes `learnedRecipes` REGARDLESS of the check outcome — a passed OR failed Simple brew (and any matched Tiered brew) learns it; the recipe is then revealed under any mode.
   - if `alchemy.learnOnCraft !== true`, a brew writes nothing to `learnedRecipes`; `learnOnCraft` governs ONLY the brew-discovery union, not whether anything is revealed (a book/grant/learn under item/knowledge/Manual still reveals independent of `learnOnCraft`).
3. Learning is never granted by a NO-SIGNATURE fizzle (which still grants nothing — dead-end/`no-reaction` memory only).
A matched-signature check FAILURE is a genuine discovery, not a fizzle.
4. No-signature attempts are treated as failed attempts (fizzles, not misconfiguration errors).
5. If a matched alchemy attempt cannot route to a valid result group, classify as crafting-system misconfiguration error (GM-fix required), not a player-failure outcome.
This applies to **Tiered only** (None/Simple never route by name).
6. The player listing projection (`AlchemyListingBuilder`) surfaces REVEALED recipes plus the non-revealed **count** only (`undiscoveredCount = valid − revealed`).
A revealed recipe projects identically to a brew-discovered one (name + full signature summary + result), so both are selectable and auto-fillable.
The count is derived behind the viewer-enforcing seam — the client never receives the non-revealed list to count locally, and no non-revealed name/signature/result reaches any client field.
7. A fizzled attempt MAY record a per-character dead-end key at `Actor.flags.fabricate.alchemyDeadEnds`, gated by `alchemy.showAttemptHistoryToPlayers`.
This affects only client-side status feedback (flipping `untried` -> `no-reaction`) and NEVER grants visibility — a fizzle matches no enabled recipe (rule 3 preserved).

### Brew Never Gated by Visibility

For `resolutionMode === "alchemy"`, `RecipeVisibilityService.evaluateRecipeAccess` / `guardCraftStart` returns `craftable: true` for a non-GM regardless of reveal state; the brew guard is gated ONLY by a matched ingredient signature.
Reveal state governs only `visible` (the Known-list projection).
This distinguishes alchemy from non-alchemy modes, whose Crafting Guard Algorithm re-runs visibility gating.
The alchemy reason taxonomy is `gm` (GM), `alchemy-revealed`, and `alchemy-unrevealed`; the retired `alchemy-hidden` / `alchemy-not-learned` / `alchemy-learned` returns no longer occur.

## Discovered Recipe Browsing

Applies only when `CraftingSystem.resolutionMode === "alchemy"`.

### Listing

- Show recipes from the selected alchemy system that the viewer has **revealed** (learned-by-brew ∪ the mode's reveal source — see Alchemy Visibility and Learning), not learned-only.
- GM sees all recipes in panel (consistent with GM-sees-all rule).
- Searchable by recipe name.
- The "Craftable only" filter is DEFERRED this iteration.

### Craftability Evaluation

- A discovered recipe is craftable when >= 1 ingredient set can be fully satisfied by full inventory quantities.
- Evaluate against full inventory, not inventory minus workbench, since auto-fill clears the workbench before populating it.

### Auto-Fill (a select-to-load selection side effect)

Selecting a discovered recipe auto-loads its signature onto the bench — auto-fill is a side effect of selection, not a separate per-recipe button.
It is scoped to recipes reducible to a concrete plain-component multiset; a rich signature (alternatives/tags/essences/multiple sets) is shown but not auto-filled (the client fails safe to `untried`).
The algorithm:

1. Clear the workbench.
2. For each ingredient group in first satisfiable ingredient set:
   - Resolve which components satisfy the group (component match, tag match, essence match — same expansion as signature matching via `SignatureValidator.expandIngredientToComponentIds()`).
   - Select first available component with sufficient palette quantity.
   - Decrement palette quantity tracker.
   - Add to workbench.
3. If all groups satisfied → workbench is ready for submission.
4. If any group unsatisfied → fill what is possible, report unfulfilled requirements:
   - Which ingredient groups failed.
   - What was needed (component name, tag set, or essence type).
   - What was available.

### Multi-Set Auto-Fill

- Multiple ingredient sets are not reducible to a concrete plain-component multiset, so a multi-set recipe is NOT auto-filled this iteration (the client fails safe to `untried`); it is still shown with its full signature summary and still brews via the engine.
Richer client-side auto-fill for multi-set / alternatives / tags / essences is a deferred follow-up.

### Information Disclosure

- Show recipe name and image for revealed recipes.
- May show ingredient details (the recipe is revealed to the player).
- May show result descriptions.
- Non-revealed recipes must not appear for non-GM users; only their count is surfaced (`undiscoveredCount = valid − revealed`), and no non-revealed name/signature/result reaches any client field.

## Knowledge Access Evaluation

Input:

- `recipe`
- `craftingSystem`
- `viewer`
- `craftingActor`
- `componentSourceActors`
- `knowledge.mode`

Algorithm:

1. If the viewer is GM, grant access.
2. Compute `hasLearned` from `Actor.flags.fabricate.learnedRecipes`.
3. Compute `hasMatchedItem`:
   - If the recipe belongs to no recipe item definition (no `recipeIds` membership, and no legacy `recipeItemId`/`linkedRecipeItemUuid` fallback): false.
   - Resolve the recipe's member `recipeItemDefinition`(s) from `craftingSystem.recipeItemDefinitions`.
   - If no definition resolves: false.
   - Else, gather candidate items from crafting actor plus component sources (if allowed).
   - Keep candidates matching by UUID or `resolveSourceUuid(candidate)`.
   - If limited uses are enabled, keep only non-exhausted candidates.
4. Evaluate by mode:
   - `item`: grant if `hasMatchedItem`.
   - `learned`: grant if `hasLearned`.
   - `itemOrLearned`: grant if `hasMatchedItem || hasLearned`.
5. Otherwise deny.

### GM Access-Grant Semantics

The GM grant in step 1 represents *access only* — a GM is unconditionally allowed to see and craft.
It does NOT assert that the GM actor has learned the recipe or owns a matching recipe item.
On this bypass path the returned `hasLearned` and `hasMatchedItem` flags are signalling "access is always granted for a GM" rather than the GM actor's real state, and the matched-items collection is empty because no inventory is scanned.
Callers that need the actor's *actual* owned, matching recipe items — for example selecting an item to consume on learn, or deciding whether to track a limited use on craft — must not rely on the matched-items output of this evaluation for a GM.
They must collect candidate items directly against the actor's inventory so they react to what the actor really owns.

## Limited Uses

When the recipe item's `caps.item.limitUses === true` (resolved per Recipe-Item Cap Resolution):

- Uses are tracked on the matched owned item instance via `timesUsed`.
- An item is exhausted when `timesUsed >= caps.item.maxUses`.
- Exhausted items are ignored for item-based access.
On exhaustion the item's `caps.item.whenSpent` decides its fate: `"destroyed"` (the legacy `destroyWhenExhausted === true`) removes the item, while `"inert"` (the default) keeps it but records the exhaustion so it stops granting craftability.

### Deterministic Item Selection

When a single matched instance must be mutated (increment or consume), choose:

1. Highest `timesUsed`.
2. Stable actor order tie-break.
3. Stable item order tie-break.

## Learning Recipes

### Preconditions

- Mode grants learning (flat `visibilityMode === "knowledge"`, or the legacy `learned` / `itemOrLearned` knowledge sub-mode).
- Recipe belongs to a recipe item definition (`recipeIds` membership, or a legacy `recipeItemId`/`linkedRecipeItemUuid` fallback).
- The member recipe item definition exists.
- Recipe is not yet learned for the selected crafting actor.
- At least one matched, owned recipe item exists.
- The recipe's **Required Knowledge** is satisfied (see Learn Prerequisite below).
- The book's **character-prerequisite learning gate** is satisfied (see Character Prerequisite Learning Gate below).

Both learning gates are only enforced when the book's `caps.learn.limitLearning` is `true`; with Limited learning off, neither gate applies and the book's recipes learn freely (issue 544).

The "at least one matched, owned recipe item exists" precondition is evaluated against the crafting actor's actual inventory for every viewer, including a GM.
The learn operation must collect and filter candidate items directly rather than reusing the GM access-grant's matched-items output (which is empty — see GM Access-Grant Semantics).
A GM who genuinely owns a matching recipe item can therefore learn it, while any viewer who owns none is rejected with the no-matching-item outcome.

### Learn Operation

1. Select matched owned item deterministically.
2. Write:

```js
Actor.flags.fabricate.learnedRecipes[recipe.id] = {
  learnedAt: Date.now(),
  sourceItemUuid: selectedItem.uuid,
}
```

1. If the recipe item's `caps.learn.consumeOnLearn === true`, consume selected item.
2. Return the updated access state.

### Learn Prerequisite

A recipe item's learn cap may name **Required Knowledge** (`caps.learn.prerequisiteIds`, a list of recipe ids, resolved per Recipe-Item Cap Resolution; folds a legacy single `caps.learn.prerequisite` string on normalize).
When Limited learning is on and the list is non-empty, a reader may only learn the recipe once the crafting actor has **already learned ALL** of the required recipes (**AND** semantics; `RecipeVisibilityService._isPrerequisiteMet` checks `Actor.flags.fabricate.learnedRecipes[id]` for every id).
An empty list is always satisfied, and when `caps.learn.limitLearning` is not `true` the gate is not enforced at all (`_isPrerequisiteMet` returns `true` immediately).
A `prerequisiteIds` id that no longer resolves to an existing recipe is **skipped (fail-open)**, mirroring the character-prerequisite gate: a deleted required recipe removes its part of the gate rather than permanently bricking the book (the learned map is pruned of deleted recipes, so an unresolvable required id could otherwise never be satisfied).
Every learn path enforces this gate on the same entry points as the character gate — the single-learn paths (`learnRecipe`, `learnOneRecipeFromItem`, `learnRecipeFromOwnedBook`) refuse with the `FABRICATE.Knowledge.PrerequisiteNotMet` outcome and write no `learnedRecipes` entry, while the drag-and-drop bulk preview (`previewOwnedItemLearning`), the item-sheet picker (`getLearnableRecipesFromItem`), and the craft-time auto-learn (`learnRecipeOnCraft`) silently omit a recipe whose Required Knowledge is unmet.

### Character Prerequisite Learning Gate

A book/scroll may carry a **character-prerequisite learning gate** (issue 544): the recipe item definition's `caps.learn.characterPrerequisiteIds`, a list of ids into the system's `characterPrerequisites` library.
This is **distinct** from Required Knowledge above: `prerequisiteIds` gates on **prior recipe knowledge** (has the reader already learned recipe X), while the character-prerequisite gate gates on the acting **actor's roll data** (a stat, level, proficiency, or flag comparison).
The gate is **per-book**: every recipe a book teaches shares that book's `characterPrerequisiteIds`, so the gate is evaluated once per definition, not per recipe.
Like Required Knowledge, it is only enforced when `caps.learn.limitLearning` is `true` (`_meetsCharacterPrerequisites` returns `{ met: true }` immediately when Limited learning is off).

When enforced, a reader may learn the book's recipes only when the acting actor passes **ALL** of the referenced prerequisites (**AND** semantics), evaluated against `actor.getRollData()` by the pure `evaluatePrerequisites` resolver (`RecipeVisibilityService._meetsCharacterPrerequisites` → `{ met, reason }`).
A `characterPrerequisiteIds` entry that no longer resolves to a system definition is **skipped (fail-open)**: a deleted prerequisite removes its gate rather than bricking the book.
An unknown or missing roll-data `path` degrades to `0`/`false` (never throws) and fails its condition.

The gate is enforced at **every learn entry point**, beside the Required Knowledge check:

- The single-learn paths (`learnRecipe`, `learnOneRecipeFromItem`, `learnRecipeFromOwnedBook`) refuse an unmet gate with the `FABRICATE.Knowledge.CharacterPrerequisiteNotMet` outcome (carrying the recipe name and the failing prerequisites' names as `reason`) and write no `learnedRecipes` entry.
- The bulk drop-learn preview and the item-sheet picker (`previewOwnedItemLearning` / `getLearnableRecipesFromItem`) **silently filter out** recipes the actor cannot learn, so an unlearnable recipe is never offered.
- The craft-time auto-learn (`learnRecipeOnCraft`) **silently skips** learning a recipe whose gate the crafter fails.
- The inventory listing (`InventoryListingBuilder`) evaluates BOTH gates once per book (`_evaluateBookRequirements`, mirroring the service Foundry-free) and, only when the book's `caps.learn.limitLearning` (or legacy `limitRecipes`) is on, tags each book row's recipes with `learnBlocked` / `learnBlockedReason` — where `learnBlocked` folds in Required Knowledge (any required recipe not yet learned) AND the character-prerequisite gate, and `learnBlockedReason` joins the UNMET requirements' names.
The Inventory detail disables the Learn button on a blocked recipe and shows the blocking names; with Limited learning off, neither gate is enforced and `learnBlocked` is `false`.
- The same `_evaluateBookRequirements` also returns a per-book `requirements` array (`[{ kind: 'knowledge' | 'character', id, name, icon, met }]`, only when Limited learning is on; dangling ids skipped fail-open) that the book detail renders as read-only "Needs: &lt;name&gt;" chips reflecting each requirement's met/unmet state (success/danger ramp).
The GM recipe-item editor mirrors these as "Needs: &lt;name&gt;" rows in "Effective rules" and read-only chips in the "How players see it" preview card (informational, no actor).

Test requirements:

- `evaluatePrerequisites` passes only when every referenced prerequisite passes (AND), and returns each failure with a `prerequisitePreview` string for messaging.
- An unknown/missing roll-data `path` fails its condition without throwing and warns exactly once; the valueless operators (`isTrue`/`isFalse`/`exists`) evaluate with no comparand.
- A dangling `characterPrerequisiteIds` id (no matching system definition) is skipped so the gate stays satisfiable (fail-open).
- Each learn entry point refuses an unmet gate with `FABRICATE.Knowledge.CharacterPrerequisiteNotMet` and writes no `learnedRecipes` entry, while the preview/picker/craft-learn paths omit the blocked recipe silently.
- The inventory row projects `learnBlocked === true` with a non-empty `learnBlockedReason` for a failed gate and `false` for a satisfied or absent gate.

### Recipe-Item Learn Cap

A recipe item may carry a **learn cap** (`caps.learn.maxRecipes`, enabled by `caps.learn.limitRecipes`), resolved per Recipe-Item Cap Resolution from the recipe's linked definition.
The learn cap limits how many of that recipe item's linked recipes may be learned from it, distinct from the item craft-charge limit (`caps.item.limitUses`), which caps how many times the item grants crafting access.
Because caps are per recipe item, one book may be a one-recipe scroll while another in the same system is a three-recipe tome.

Each recipe-item **document instance** tracks a **learn budget** count that mirrors the craft-charge `timesUsed` count (per physical item document, so a stacked `qty > 1` document shares one count).
The **remaining budget** is `maxRecipes − count`.
A further recipe is refused once the count reaches `maxRecipes`.

Optional `caps.learn.destroyWhenSpent` removes the recipe item when the budget is spent (the count reaches `maxRecipes`).
`destroyWhenSpent` (learn cap) is deliberately distinct from `destroyWhenExhausted` (item craft-charges); the two flags are independent and are not normalized to one name.

#### Cross-Actor Budget Semantics

The learn budget is per **physical recipe-item document copy**.
It **counts across all actors** that hold the document and is **not reset** on transfer or ownership change.

#### Player-Selected Learning From The Inventory Tab

Players learn from an owned recipe item one recipe at a time in the player Inventory tab, which is the manual learn surface for every knowledge mode; a **batch "Read & learn all N recipes"** affordance (below) is defined as a sequence of that single-recipe primitive, not a distinct engine path.
A recipe item with an **effective** learn cap (its own `caps.learn.limitRecipes === true` AND a finite positive `caps.learn.maxRecipes`) is a **capped recipe item** and does not auto-learn every linked recipe on drop.
A recipe item that toggled `limitRecipes` on but carries a missing or invalid `maxRecipes` is normalized so that `learnsAllowed` (and its legacy `maxRecipes` mirror) seeds to `1` — a limit of "0/undefined" is meaningless and would wrongly read as uncapped downstream (issue 544), so the observable behaviour for stored, normalized systems is a 1-learn budget rather than an uncapped auto-learn path.
The runtime uncapped fallback survives only as a defensive dead path for raw, un-normalized data.

- Owned recipe items surface in the Inventory listing (`InventoryListingBuilder`) as learnable rows for any `knowledge` list-mode system, carrying their linked recipes (each with a per-actor `learned` flag) and their applicable limits.
  A `learnable` row flag is set only for `learned` / `itemOrLearned` modes; an item-only book lists its recipes and its craft-use limit but offers no Learn affordance (it grants access by being held).
- The learning limit is projected only when the book is learnable; the craft-use limit is projected only when the mode grants access by holding the item (`item` / `itemOrLearned`).
- Learning one recipe (`RecipeVisibilityService.learnRecipeFromOwnedBook`) resolves the owned document deterministically, writes one `learnedRecipes` entry, and — for a capped recipe item — increments the document's learn budget count and removes the item when the budget is then spent if `caps.learn.destroyWhenSpent === true`.
- `caps.learn.consumeOnLearn` is ignored on this path (it would delete a multi-recipe book on the first learn); only `destroyWhenSpent` on a spent cap removes the book.
- A capped recipe item is refused a further learn once `count` reaches `maxRecipes`.
- **Batch "Read & learn all N recipes"** (knowledge-mode book detail, `InventoryBookDetail` → `inventoryStore.learnAll()`; shipped in feat(#511), PR #527): offered only under a conservative eligibility rule — the book is learnable, its learn budget is not already spent, at least one recipe is unlearned, and either there is no learn limit or the projected cap covers the FULL book size (`caps.learn.learnsAllowed >= recipeTotal`).
Gate-blocked recipes (`learnBlocked`, issue 544) are excluded so the batch never sends a recipe the runtime would refuse.
It executes as sequential single-recipe learns through the same `learnRecipeFromInventory` seam, stopping on the first failure and surfacing its message, with a single reload if anything was learned.

### Drag-and-Drop Learn Configuration

Automatic actor-drop learning is controlled by `recipeVisibility.knowledge.learn.dragDropEnabled`.

- Default is `true`.
- The setting is only meaningful when `listMode === "knowledge"` and `knowledge.mode` is `learned` or `itemOrLearned`.
- If disabled, actor item drops must not trigger recipe learning and manual learning UI affordances must be used.

#### Allowed Hook Triggers

Automatic learning from actor item drops may be implemented using:

- `createItem` (preferred)
- `preCreateItem`
- `dropActorSheetData`

`createItem` is preferred because it runs against the created owned item instance and keeps consume-on-learn behaviour deterministic.
Regardless of hook choice, runtime behaviour must match this specification.

### Drag-and-Drop Learn (When Enabled)

When `dragDropEnabled === true`, dropping a matched recipe item onto an actor must immediately attempt learning for that actor.

#### Supported Drop Targets

- Actor sheet drop zones for owned items are in scope and must be handled.
- Actor-bound crafting UI drop targets (if present) must follow the same matching and notification contract.
- Non-actor targets are out of scope for learning and must be ignored.

#### Actor Resolution and Permission

- The drop handler must resolve exactly one target actor from the drop context.
- Learning is only attempted when the current user has ownership permission to mutate that actor's flags/inventory.
- If actor resolution fails or permission is insufficient, no learn operation occurs and no notification is shown.

#### Recipe Scope for Drop Evaluation

- Evaluate only enabled recipes whose crafting system visibility mode is `knowledge`.
- Learning-by-drop is only valid when `knowledge.mode` is `learned` or `itemOrLearned`.
- Auto-learning eligibility is evaluated per matched recipe using that recipe's own `knowledge.learn.dragDropEnabled` setting.
- Systems in `global` or `player` list mode are not evaluated for drag-and-drop learning.
- In multi-system worlds, all eligible knowledge-mode recipes are considered.
Recipes from systems where `dragDropEnabled !== true` are excluded from auto-learning even when the same owned item matches them.
Matching is otherwise based solely on the resolved recipe item definition identity rules below.

#### Matching Rules

A dropped item is matched to a recipe item definition through the shared, system-scoped four-tier matcher (`matchRecipeItemDefinition`) defined in **Recipe Item Matching** above: the durable identity tier (tier 1) — the per-system `roles[systemId].recipeItemDefinitionId` leaf, then the legacy scalar — first, then membership in the definition's union of source references by the item's own uuid (tier 2), its compendium source (tier 3), or its transitive `_stats.duplicateSource` (tier 4).
The list-aware identity tier is evaluated first; among the source-reference tiers the first that yields a match wins, with no fall-through.
`resolveSourceUuid` reads `_stats.compendiumSource` first (Foundry v12+), then falls back to `flags.core.sourceId` (Foundry v11 and earlier).

The `createItem` bulk auto-learn path applies the tier-4 confidence gate above; explicit learn, the picker, and display do not.

#### Multi-Recipe Matching

When a single dropped item matches multiple recipes, the actor learns all matched recipes in a single operation.
A recipe item definition linked to multiple recipes functions as a "recipe book" -- one drop teaches every recipe it is linked to.

Learning is applied per matched recipe independently:

- Already-learned recipes are skipped.
- New learn entries are written only for recipes that pass preconditions.
- `consumeOnLearn` is evaluated for each newly learned recipe.
If any learned recipe requires consumption, the dropped owned item must be removed by the end of the operation.

The "learn every linked recipe in a single operation" rule gains an exception applied **per matched recipe**: for a matched recipe whose linked recipe item has `caps.learn.limitRecipes === true` (a **learn cap**, see Recipe-Item Learn Cap below), learning is player-chosen and capped at the remaining budget rather than auto-applied on drop.
Matched recipes linked to uncapped recipe items in the same drop still auto-learn.
A single dropped recipe item is one definition with one caps block, so a drop either auto-learns all its linked recipes (uncapped) or routes them all to the Inventory-tab learn path (capped); the drop is never a whole no-op.
`caps.learn.consumeOnLearn` is not applied to a capped recipe item and is hidden for it in the authoring UI -- it is superseded by `caps.learn.destroyWhenSpent`.

#### Notifications

After a drag-and-drop learn operation completes, the module must provide user feedback:

- **Success**: Display a notification listing the recipe(s) learned and the actor that learned them.
- **Partial success**: When some recipes were already learned, notify only for newly learned recipes.
If all matched recipes were already learned, notify the user that nothing new was learned.
- **No match**: When the dropped item does not match any recipe, no learn operation occurs and no notification is shown (the drop is silently ignored for learning purposes).
- **Precondition failure**: When the knowledge mode does not support learning (i.e., mode is `item` only), no learn operation occurs and no notification is shown.

### Manual Learn Path (When Disabled)

When `dragDropEnabled === false`:

- Drops must never trigger auto-learning from `createItem`, `preCreateItem`, or `dropActorSheetData`.
- The actor still receives the dropped item through normal Foundry item-drop behaviour.
- The manual learning affordance is the player **Inventory tab**: the owned recipe item appears as a learnable row and each not-yet-learned recipe offers a Learn action (see Player-Selected Learning From The Inventory Tab).
- The Inventory learn path's primitive learns one recipe at a time and does not apply `consumeOnLearn`; a capped book removes itself only when its budget is spent and `destroyWhenSpent === true`.
The batch "Read & learn all" affordance (see Player-Selected Learning From The Inventory Tab) is a stop-on-first-failure sequence of that primitive, not a separate path.
- Manual-learning eligibility is evaluated per matched recipe using that recipe's own knowledge configuration.
In mixed-system worlds, the manual path only includes recipes from systems where `dragDropEnabled === false`.

## Edge Cases

### Recipe Item Definition Missing

If `recipeItemId` points to no `RecipeItemDefinition` in the recipe's crafting system:

- Keep the stored `recipeItemId`.
- Warn in admin/editor UI.
- Item-based knowledge matching fails until the reference is repaired.

### Recipe Item Source Template Missing

If `recipeItemDefinition.originItemUuid` no longer resolves to a template:

- Keep the stored `originItemUuid`.
- Warn in admin/editor UI.
- Matching may still succeed via `resolveSourceUuid` on owned items.

### Recipe Deletion

- Remove corresponding learned entries from all actors.

### Visibility Mode Change

- Learned entries remain stored.
- Access behaviour changes immediately, according to the new mode.

## Testing Requirements

- Unit tests for listing behaviour in `global`, `player`, and `knowledge` list modes.
- Unit tests for matching by UUID and by `resolveSourceUuid` — covering both `_stats.compendiumSource` (v12+) and `flags.core.sourceId` (legacy fallback) independently.
- Unit tests for limited-use exhaustion and deterministic matched-item selection.
- Unit tests for learning with and without consume-on-learn.
- Unit tests for restricted recipes with empty `allowedUserIds` confirming GM access and non-GM denial.
- Unit tests for alchemy reveal-not-gate rules: per-mode reveal (global discovery-only, item held-book incl. component-source-only, knowledge learned, Manual/restricted access grant), discovery-by-brew unioned across modes, GM-sees-all through the routed decision, and `craftable: true` for a non-GM regardless of reveal.
- Integration test that a matched-signature brew SUCCEEDS and PRODUCES for a non-revealed recipe under every mode, exercising the real `guardCraftStart` (brew never gated by visibility).
- Unit tests for alchemy no-signature attempts: specific failure feedback, failed-attempt classification, and ingredient consumption behavior.
- Unit tests for alchemy routing mismatches: misconfiguration classification and non-application of player-failure consumption.
- Integration tests for full craft guard re-check on start, resume, and step execution.
- Integration tests for drag-and-drop learn when `dragDropEnabled === true`: single-recipe match, multi-recipe match, already-learned skip, and no-match silent ignore.
- Integration tests for drag-and-drop learn notifications: success message content, partial-success filtering, and no-notification on zero matches.
- Integration tests for drag-and-drop learn with `_stats.compendiumSource` matching (item duplicated from compendium on Foundry v12+).
- Integration tests for drag-and-drop learn with `flags.core.sourceId` matching (item duplicated from compendium on Foundry v11, legacy path).
- Integration tests for consume-on-learn in drop flow: item is removed when required by matched recipe settings.
- Integration tests for actor resolution and permissions: ignore drop when target actor cannot be resolved or user lacks write permission.
- Integration tests for recipe-scope filtering: only knowledge-mode recipes with learn-capable modes are evaluated during drop.
- Integration tests for `dragDropEnabled === false`: drops do not auto-learn and item-sheet manual learn flow is available instead.
- Integration tests for "Craftable only" filter: recipes are included when actor inventory satisfies requirements via `_stats.compendiumSource`, `flags.core.sourceId`, or direct UUID match.

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

**A tier is a provenance label, never an ambiguity signal.**
The matcher returns exactly one definition and one tier, never a set and never a count, so no tier value can report that an owned copy matched more than one definition.
In particular `duplicate` says only that the copy reached its definition through `_stats.duplicateSource`; a candidate set holding a single definition can produce it, and a copy that would satisfy two definitions is resolved silently by tier precedence and then candidate order without any distinguishing output.
Any consumer surfacing `duplicate` MUST describe it as the weakest provenance link (the tier the bulk auto-learn confidence gate below refuses), and MUST NOT describe it as a duplicate, conflicting, or ambiguous match.

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
The runtime reads `recipeIds[]`; it falls back to the legacy scalar reverse ref (`recipe.recipeItemId`, or `recipe.linkedRecipeItemUuid` → a definition `originItemUuid`) **only** while the system's monotonic `membershipResolvesByRecipeIds` marker is unset (issue 1010).
Once that marker is set, only `recipeIds` resolves membership, so an empty `recipeIds` array means "this book has no members" rather than "this system has not migrated"; the basis is recorded on the system and is never re-derived per read.
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
   - `alchemy.learnOnCraft` DEFAULTS ON (issue 966): `_normalizeAlchemyConfig` reads `!== false`, so only an explicitly stored `false` disables it.
Under `global` the learned map is the ONLY reveal source, so an off default left the most permissive-sounding mode revealing nothing to any player; `systemValidation` raises the non-blocking `alchemyGlobalNoDiscovery` warning for a `global` alchemy system that turns it off.
   - if `alchemy.learnOnCraft === true`, a matched-signature attempt writes `learnedRecipes` REGARDLESS of the check outcome — a passed OR failed Simple brew (and any matched Tiered brew) learns it; the recipe is then revealed under any mode.
   - if `alchemy.learnOnCraft !== true`, a brew writes nothing to `learnedRecipes`; `learnOnCraft` governs ONLY the brew-discovery union, not whether anything is revealed (a book/grant/learn under item/knowledge/Manual still reveals independent of `learnOnCraft`).
   - The write happens wherever the brew RESOLVES, which for a time-gated brew is the matured FINISH, not the START that armed the gate.
Both alchemy tails at FINISH (`learnRecipeOnCraft` and the reserved-failure-group branch) derive alchemy-ness from the RECIPE'S OWN SYSTEM, never from a per-call submission flag: a matured brew resumes through `advanceCraftingRun`, which carries no `isAlchemyAttempt` (issue 966).
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

## Summary Projection Disclosure

The canonical recipe summary defined in `data-models/spec.md` § Summary Projections is a PLAYER-facing payload whenever it is built for a player audience.
Its redaction obeys the same teaser rule the detail model obeys, and the two MUST agree: a recipe that is a teaser in the list and not in the inspector, or the reverse, is a disclosure either way round.

The following are normative.

- **The redaction test is the same test.**
A summary is redacted when the viewer is not a GM AND the recipe's access reason is `teaser`, and the hidden-field list is the recipe's authored `teaserState.hiddenFields`, falling back to the documented default of ingredients, results and description.
- **An omitted audience defaults to the REDACTING one.**
Failing safe matters more than caller convenience: a default of GM would ship an unredacted teaser to whichever caller forgot the argument.
- **A redacted summary carries no availability, and MUST NOT compute one.**
Material availability is derived from the recipe's INGREDIENTS, which the default teaser configuration hides, so an availability answer on an undiscovered recipe discloses the shape of a requirement the player is not meant to see yet — refreshable once per inventory change, across a whole corpus.
The guard belongs at the derivation, not at the write-out: blanking a computed value is equivalent for today's shape and wrong the first time a field is added beside it.
- **Identity and grouping metadata are NOT redacted.**
A teaser is shown to the player deliberately, so its name, image and category are the part they are meant to see; the shipped listing model records that decision for `category` already.
`categoryLabel`, the display form of `category`, is likewise not redacted and needs no separate judgement: it is a total function of `category` and the active language, so it can disclose nothing `category` does not.
Redacting it while leaving `category` visible would render a blank chip for a bucket the player can still filter by.
`tags` is likewise not redacted, and that is a NEW decision rather than an inherited one — no player-facing surface has carried recipe tags before, so it does not follow from the `category` precedent.
It is taken because a tag is GM grouping metadata of exactly the same kind as a category, because `teaserState.hiddenFields` cannot name it (the authored vocabulary is ingredients, results, description, tools and essences), and because withholding it would break the filtering a summary exists to serve.
- **Authoring state does not cross.**
A player-audience summary carries no GM-only field, which today means the recipe's lock state and its enabled state.
- **Exhaustion is a player-only status.**
A GM bypasses the knowledge gate, so a GM-audience summary MUST NOT report a recipe exhausted even when the caller supplies an exhaustion result.
Because the browse status is a field both audiences share, honouring it for a GM would make a shared field's derivation depend on the audience, which this contract forbids.
- **The summary does not gate visibility; the calling surface does.**
The projection answers what a summary of THIS recipe for THIS audience is, given an access result the visibility evaluation already produced.
It performs no cohort selection and no visibility filtering of its own, so a surface building player-audience summaries MUST build them only for recipes that evaluation made visible, and MUST pass each recipe's own access result.
Omitting the access result yields an unredacted summary reporting the available browse status — correct for a visible recipe, and a disclosure for one that is not.
The gate is upstream and stays there; this contract does not move it and MUST NOT be read as duplicating it.

Tests MUST cover the redacted player summary directly — that it withholds availability, that the snapshot is never consulted to build it, that it reports the discovery browse status, and that the same recipe is unredacted for a GM.

### Per-Recipe Detail Hydration

The player crafting read is two phases: a corpus-wide summary phase and a per-recipe detail phase (see `ui-integration/spec.md` § Browse And Detail Phases).
Splitting the read splits the gate, so the following are normative for the detail phase.

- **A recipe id is not a permission.**
The detail phase receives an id chosen by a client, so it MUST re-resolve the viewer's access for that recipe rather than trusting that a summary was built for it.
It MUST apply every gate the summary phase applies — the system-blocked-for-recipes predicate for a non-GM, and the visibility evaluation — and MUST answer nothing rather than a redacted model when the viewer may not see the recipe.
- **Re-evaluating is not a second candidate collection.**
The detail phase evaluates access for ONE recipe through the same per-recipe evaluation the corpus-wide pass calls, so § One Candidate Collection Per Evaluation is unaffected: the corpus-wide pass is not repeated, and no second corpus-wide walk is introduced.
- **Redaction is unchanged by the split.**
A detail model for a recipe whose access reason is `teaser` is redacted exactly as before, so the row and the inspector cannot disagree about whether a recipe is undiscovered.
- **The detail phase re-applies the `enabled` gate by the reader convention, not by mirroring the corpus query.**
The summary phase reads the enabled corpus, so it can never project a disabled recipe; the detail phase resolves a recipe by id and MUST therefore re-apply that gate for a non-GM viewer.
It applies the convention this field carries at every other reader — absent reads as ON, so only an explicit `false` refuses — whereas the corpus query filters on strict equality with `true`.
The recipe model stores whatever non-`undefined` value it was given, so the two answers differ for a non-boolean `enabled` that an import or a macro can write: such a recipe is absent from the browse list yet still hydrates by id.
That asymmetry is RECORDED rather than closed, and its direction is stated because it is the disclosing one.
Closing it by reading an omitted `enabled` as OFF is not admissible, because that would blank the inspector for every recipe authored before the field existed.

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
   - Else, gather candidate items from the crafting actor plus any supplied component-source actors, unconditionally (`_collectCandidateItems` and its callers include supplied `componentSourceActors` with no gate).
   - Keep candidates matching any member definition per the four-tier, system-scoped matcher defined in §Recipe Item Matching (durable per-system identity, own uuid, compendium source, transitive `_stats.duplicateSource`, evaluated against the `registeredItemUuid` + `originItemUuid` + `aliasItemUuids` union) — this step defers to that section rather than restating a subset of it.
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
On exhaustion the item's `caps.item.whenSpent` decides its fate: `"destroyed"` (the legacy `destroyWhenExhausted === true`) removes the item, while `"inert"` (the default) keeps it and **records** the exhaustion.
The `inert` flag is a record, not a gate.
Access filtering is on `timesUsed >= caps.item.maxUses` alone, which the same write sets at the moment of exhaustion, so the flag and the filter agree at write time and can diverge only if a GM later changes `maxUses` **in either direction**.
Raising it re-admits an `inert` copy that is no longer spent, so a copy can be simultaneously `inert: true` and craftable.
Lowering it below a copy's `timesUsed` makes the filter treat that copy as spent without any disposal branch re-running, so a `whenSpent: "inert"` copy can be spent while carrying no `inert` flag and never acquire one.
No Fabricate writer ever clears the flag (see the Recipe Item Usage Flag clause in `data-models`).

### Item-Anchored Use Expenditure

`RecipeVisibilityService._applyRecipeItemUse(item, itemCaps)` is the **single decision point** for the use increment, the exhaustion test and the `whenSpent` disposal.
It is shared by the recipe-driven craft path (`applyRecipeItemUseOnCraft`, which keeps its candidate-selection logic and collapses its disposal branch onto the core) and the GM-driven Knowledge surface (`expendRecipeItemUse`), so the two can never diverge.

- The GM path applies **no** visibility-mode or knowledge-mode gate: the GM named the copy.
- An **uncapped** book (`caps.item.limitUses !== true`) performs **zero** writes on either path — not a zero-delta write.
A surface offering the action MUST therefore render it disabled rather than as a silent no-op.
- An **already-spent** copy performs zero writes too, and the guard is the exact complement of `_filterNonExhausted`: a capped book whose `maxUses` is a finite number greater than zero and whose current `timesUsed` is at or above it is refused inside the core.
This is behaviour-preserving on the craft path, which only ever reaches the core with a candidate that predicate already kept.
It is load-bearing on the GM path, which has no such pre-filter: without it a stale row — an asynchronous re-projection, a second GM window, a macro spending the last charge — would drive one further increment and, under `whenSpent: "destroyed"`, silently delete the copy while reporting success.
The guard MUST be evaluated against the count the core itself re-reads from the document, never against a caller-supplied snapshot, because the stale row is exactly the case it exists to refuse.
The refusal MUST be reported distinctly from the uncapped refusal, because the two are different facts about the copy: one says the book has no charges to spend at all, the other says this copy has none left.
- Caps MUST come from `_getRecipeItemCaps` (via `_capsForDefinition` when only a definition is in hand), never a raw `definition.caps` read, so the legacy `destroyWhenExhausted` / `limitRecipes` / `learningMode` derivations stay applied.
- The current count is re-read from the document inside the core rather than taken from a caller-supplied candidate snapshot.
On the craft path the two are provably equal today (nothing awaits between candidate collection and the write), so the re-read is strictly safer and never behaviour-changing: it closes a staleness window that would open the moment an `await` is inserted between the two.
That equality is conditional on one coercion rule, and the rule is normative rather than incidental: the shared read MUST collapse a non-numeric `timesUsed` to `0`, exactly as the craft path's historical outer `Number(<snapshot> || 0)` did over an already-coerced value.
A truthy but unparseable stored count (`"abc"`) otherwise reads as `NaN`, which forces the exhaustion test false, writes `null` as the new count, and leaves a copy that can never reach any `whenSpent` disposal branch.

### Deterministic Item Selection

When a single matched instance must be mutated (increment or consume), choose:

1. Highest `timesUsed`.
2. Stable actor order tie-break.
3. Stable item order tie-break.

### One Candidate Collection Per Evaluation

A read pass that evaluates recipe access for MORE THAN ONE recipe evaluates them against the SAME crafting actor and component-source actors.
The candidate collection in step 3 of the Knowledge Access Algorithm MUST therefore be derivable from one walk of those actors' inventories per pass, not one walk per recipe.

The requirement is stated on the PASS, not on any one surface, and that generality is load bearing rather than stylistic.
It binds the corpus-wide visibility pass, the player crafting listing, the alchemy workbench's reveal decision (both its chooser summaries and its active panel), the run journal's per-run redaction, and any surface added later that asks the same question about a set of recipes.
Naming only the corpus-wide pass left two of those evaluating access per recipe with no per-pass value at all, each performing a complete inventory enumeration per recipe on an `item`-visibility-mode system.

Three consequences are normative:

- **The candidate walk MAY be narrowed by a prefilter, and that prefilter MUST be a superset.**
An implementation may restrict the documents offered to the per-recipe matcher to those matching **any** of the crafting system's recipe-item definitions **union every legacy `linkedRecipeItemUuid` carried by a recipe in the pass**.
That union is a superset of every individual recipe's match set, so the per-recipe matcher — which still decides each candidate — returns the identical set.
Omitting the legacy leg makes the union a *subset* for un-migrated recipes and silently hides their books; the legacy leg is therefore part of the requirement, not an optimisation detail.
- **Exhaustion MUST NOT re-collect a candidate set an access evaluation already produced.**
A recipe's item-knowledge is exhausted when at least one matching copy is owned and every such copy has reached its own book's cap.
Both numbers are already established by the Knowledge Access Algorithm, so a caller holding that result derives exhaustion from it.
A result that owns no evidence — the GM bypass, which scans no inventory, or a mode that never evaluated knowledge — MUST be distinguishable from a genuine count of zero, and only the latter answers "not exhausted"; the former falls back to collecting candidates.
- **A per-pass inventory value is ONE kind of thing, built ONE way.**
Every pass MUST build it through a single construction that supplies the recipe-item matcher, rather than each surface choosing which identity collaborators to supply.
The reason is a failure mode rather than tidiness: a value built without the matcher offers the per-recipe matcher every held document unfiltered, and because that matcher still decides each candidate the ANSWER is unchanged — the per-recipe walk is reinstated in full while every correctness test stays green and every inventory-read counter stays flat, because the unfiltered offer is served from a single memoised walk.
A conformance guard for this section MUST therefore count the documents OFFERED to the per-recipe matcher, not the times an inventory was read; the latter cannot distinguish a correct pass from that reinstatement.

These are read-path requirements only.
Exact craft submission continues to revalidate against current documents before consumption, and no snapshot or prefilter is authoritative at consumption time.

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

### Learned-Entry Durability

A learned entry **survives deletion of the copy it was learned from**.
`sourceItemUuid` is the actor-owned item uuid, so it dangles forever once that copy is gone; the entry itself is never pruned by the deletion, and no learn budget is freed (see Knowledge Reset / Erase).
Learned entries are therefore INDEPENDENT of currently-owned copies, and a surface presenting both MUST NOT couple the two lists.

A UI surfacing learned knowledge MUST resolve the source display name through the recipe's **member recipe-item definition** when the copy is gone.
The full ladder is: a still-owned copy's name, else the member definition's name rendered as "no longer owned", else the trailing uuid segment, else a "learned by crafting" statement for the `null` `sourceItemUuid` every `learnRecipeOnCraft` entry carries.

### Recipe And System Id Constraint

A **recipe id** is a durable-flag MAP KEY: it is interpolated into the per-actor `learnedRecipes` and `discoveryProgress` maps, which are written through a flattened `Document#update` path where every dot separates an object segment.
A **crafting-system id** is one for the same reason (`roles.<systemId>.componentId` and its `toolId` / `recipeItemDefinitionId` siblings).

Both MUST therefore satisfy `isSafeFlagKeySegment` (`/^[A-Za-z0-9_-]+$/`) and are refused **at intake**, loudly, naming the offending id: `RecipeManager.createRecipe` for a recipe and `CraftingSystemManager.createSystem` for a system.
`foundry.utils.randomID()` always satisfies the pattern, so the constraint can only fire for an imported or hand-authored id; the compendium importer already isolates a per-recipe failure into its import report.
Neither id is ever rewritten to make it safe — recipe books, Required Knowledge, learned entries, tools, and gathering config all reference these ids — so the only outcomes are acceptance and refusal.
The edit paths cannot smuggle one past the guard: `updateRecipe` and `updateSystem` both pin the id to the record being updated and ignore any `id` in the payload.

Refusal at intake is the **complete** fix for the nesting hazard described in Reading A Recipe-Id-Keyed Flag Map; reader-side repair is the best-effort half, for worlds that already carry such an id.
Loading an existing world MUST NOT route through either guard — rehydration goes through `Recipe.fromJSON` and `_normalizeSystem`, never through the create paths — because retroactively refusing an id a previous version accepted would brick the affected world rather than repair it.

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

### Knowledge Reset / Erase

A single knowledge-deletion primitive (`RecipeVisibilityService.forgetLearnedRecipes`) serves three grains from one code path: **erase one** learned recipe, **reset one system**, and **reset all systems** for one actor.
It is the shared mutation behind the GM reset API and the Knowledge surface's per-recipe "Erase memory" action.

- Deletion is an explicit, reload-safe `-=` flag-key removal at the **full doubly-nested** path `Actor.flags.fabricate.fabricate.learnedRecipes.-=<recipeId>` (and, when clearing discovery, `Actor.flags.fabricate.fabricate.discoveryProgress.-=<recipeId>`), batched into a single `Actor#update`.
It must NOT prune by rebuilding a filtered map through `setFlag` as the sole write — that merge never removes keys, so the entry resurrects on reload (the `deleteRemovedActiveRunFlags` doctrine); a shallow `flags.fabricate.learnedRecipes.-=<id>` silently no-ops.
- An id routes to a **two-step delete-then-write fallback** whenever a batched `-=<id>` key would destroy anything other than that id's own entry: the parent key is dropped first (`await actor.update({ 'flags.fabricate.fabricate.-=learnedRecipes': null })`), then the retained map is re-written (`await _setLearnedMap(actor, retainedMap)`).
These are two sequential awaited operations, never one order-dependent update — `mergeObject`/`_migrateDeletionKey` may process the deletion after the insertion and wipe the whole map.
The same two-step applies to `discoveryProgress` when clearing discovery.
Two conditions each force it, and the second is NOT the dotted-id case: the id is not a safe flag-key segment, so `-=<id>` cannot address it; **or** another entry nests inside it, because ids `a` and `a.b` share one persisted node and `-=a` is a well-formed key that removes recipe `a.b` along with it.
The retained map is rebuilt from the **entry view** below, never by filtering `Object.entries` of the raw store against the cleared ids — that comparison puts nested first segments on one side and recipe ids on the other, matches nothing, and writes the just-deleted entry straight back.
A retained entry whose own id contains a dot re-splits on the step-2 rewrite exactly as the original learn write did — a known fidelity limit of dotted retained ids, not an expandObject-safe guarantee.
- `freeLearnBudget` defaults ON for the reset/erase grains (respec/amnesia must let the actor re-learn) and is passed OFF for the recipe-deletion cleanup path.
When on, each cleared learned entry frees one consumed learn slot against a **still-held** source copy, reading its **current** `learnScope`: `perInstance` decrements the held item's `Item.flags.fabricate.recipeItemLearning.learnedCount`; `total` decrements the `recipeItemPartyLearnPool` key (a new GM-authoritative `decrement`, symmetric with `increment`, floored at 0, non-GM degrades safely).
- **A slot is freed only when FOUR conditions all hold**, and an entry failing any one of them frees nothing: the entry names a `sourceItemUuid`, the actor still holds that copy, the recipe id still resolves, AND that copy's resolved definition actually caps learning (`caps.learn.limitRecipes`).
The first three are unresolvable/orphan cases and get no budget math at all — in particular a `total` pool key is unreconstructable once the recipe/definition is gone, so it is deliberately left as-is (no decrement, never a wrong-key decrement).
The fourth is NOT an orphan case and must not be described as one: the source copy is present and the recipe resolves, so the refund arithmetic runs, but it has nothing to give back because the learn counter is only ever incremented for a capped book and the setter clamps at zero.
Any surface that predicts the outcome per row MUST test all four, not the three early-returns, or it will promise a slot recovery an uncapped source book can never deliver.
- **Grain composition.** Erase-one clears only the learned entry and leaves `discoveryProgress` untouched by default.
The off-by-default `clearDiscovery` option also clears the recipe's discovery key, and the Knowledge surface's per-row erase **declines** it — an erase is an un-learn, a reset is an amnesia — while both reset grains pass it.
That asymmetry is deliberate and MUST be disclosed to the GM at the point the reset grain is chosen.
Reset-one-system clears every learned entry whose recipe belongs to the system (via `getRecipe(id).craftingSystemId`) plus its scoped `discoveryProgress`, and **leaves orphan learned keys (unresolvable recipe) in place** — they cannot be attributed to a system.
Reset-all-systems clears every learned key **including orphans**, plus every `discoveryProgress` entry.

#### Reading a recipe-id-keyed flag map

`learnedRecipes` and `discoveryProgress` are both keyed by recipe id, and NEITHER is persisted as the flat `{ id: entry }` object it is written as.
`Document#update` dot-expands the whole nested **value tree** of an `ObjectField`, so an id containing a `.` is stored as a subtree: `{ 'imported.recipe.id': entry }` persists as `{ imported: { recipe: { id: entry } } }`.
Both supported builds do this, by different routes — V14 inside the field (`ObjectField#_cleanType` → `SchemaField.expandObject`, recursing into every nested plain object) and V13 one level up (`DataModel#updateSource` replaces `changes` with `expandObject(changes)` whenever any top-level key contains a dot, and V13's `expandObject` re-splits keys at every depth).
Fabricate always writes the dotted `flags.fabricate.fabricate.<key>` path, so the V13 guard always fires and the persisted shape is the same on both.

Every reader of either map — the recipe-deletion cascade, the deletion primitive's existence check, its budget lookup, its retained-map rebuild, the per-system and reset-all id enumerations, and the GM panel's learner index — MUST derive ids from a shared **entry-boundary** reader rather than from the map's top level.
Reading the top level yields a dotted id's FIRST SEGMENT, which names no recipe; the cascade therefore classified it as stale and issued `-=imported`, destroying every sibling entry under that segment whose recipe still existed.
The panel-facing learner index and the cascade MUST agree on the ids they see, or the GM surface reports learners the mutation does not act on.

The reader recognises an entry by its own **marker fields** — `learnedAt` / `sourceItemUuid` for learned entries, `progress` / `fragments` / `discoveredAt` / `manuallySet` for discovery entries — so it is parameterised on the shape rather than hard-coding one map's fields.
Two alternatives are specifically excluded.
`foundry.utils.flattenObject` is not the inverse of the expansion: it recurses to non-object leaves, so it yields `plainid.learnedAt` rather than `plainid`, no key reads as a recipe id, and every actor's whole map is deleted on any recipe deletion.
Longest-prefix matching against the known recipe ids cannot find an **orphan** entry, whose id is by definition absent from that set — and orphans are the cascade's only input.
A learned entry is therefore **scalar-only** by contract: a plain-object-valued field added to one would be walked as a nested recipe id and dropped from the entry view.

Reader-side repair is explicitly **best-effort**, because the id → storage mapping is not injective and some inputs lose data before any reader runs:

- Learning `a` and then `a.b` is recoverable — `a`'s fields are scalars and `b` is not, so entry-shape detection separates them.
- Learning `a.b` and then `a` is **not**: writing `a` replaces the whole node and `a.b` is gone from storage.
- Learning `a` and then `a.learnedAt` leaves both entries addressable but destroys recipe `a`'s own `learnedAt` timestamp, which the collision overwrote.
The reader reports `a` without a `learnedAt` rather than presenting the colliding entry as `a`'s timestamp.

The invariant this establishes is that **no surviving learner's entry is destroyed**, not that a dotted id round-trips normalized.
The complete fix is at the write boundary (see Recipe And System Id Constraint), and repair exists for worlds that already carry such an id.

### GM-Only Knowledge Reset API

`game.fabricate.resetActorKnowledge({ actorId, systemId, freeLearnBudget })` is the GM API the Knowledge surface's per-character reset routes through — both grains, with and without `systemId` — and it remains available to macros and the console.
It is explicitly GM-gated (a non-GM returns the `FABRICATE.Knowledge.Reset.GMOnly` outcome and never mutates), takes an `actorId` (never an actor uuid, resolved via `game.actors.get`; a missing actor returns `FABRICATE.Knowledge.Reset.NoActor`), delegates the scoped id set to `forgetLearnedRecipes` with `clearDiscovery: true`, and returns `{ success, message, messageData }` without throwing.

### Auto-Relearn Semantics

A reset does not spontaneously re-learn on refresh or reopen: auto-learn fires only from the `createItem` hook, so a still-held auto-learn book re-grants the recipe only on a fresh `createItem` (remove and re-add) or an explicit learn affordance — never from a render or reload.
Separately, in `item` / `knowledge` visibility modes, *holding* a matching book makes a recipe visible/craftable via `evaluateKnowledgeAccess().hasMatchedItem` independent of the learned map, so clearing learned knowledge does not hide a recipe reachable purely by possessing the book; the reset clears the durable **learned** grant while item-possession access persists while the book is held.

## GM Knowledge Management

The GM may audit and correct a character's **runtime** knowledge state directly: the owned copies of a system's recipe items a character carries, and the recipes they have learned.
Three operations exist — **expend one use**, **delete one owned copy**, and **erase one learned recipe** — alongside the per-character reset grains of the GM Knowledge Reset API.

- All three are **GM-only**, gated on `game.user.isGM` at the top of each mutating seam method.
`isGM` rather than `activeGM`: each is a single-client, user-initiated mutation from a GM-only application, so there is no N-client duplicate-execution risk, and `activeGM` would lock out assistant GMs whom the application already admits.
No player-reachable facade is added for any of them.
Each takes document **ids**, never uuids, and returns a `{ success, message }` result rather than throwing when its target document has vanished between render and click.
- **Expend** routes through `_applyRecipeItemUse` (see Item-Anchored Use Expenditure) and applies no visibility or knowledge-mode gate.
- **Erase** calls `forgetLearnedRecipes(actor, [recipeId], { freeLearnBudget: true, clearDiscovery: false })`.
Both option values are pinned: `freeLearnBudget` must be passed explicitly even though it already defaults true, and `clearDiscovery` is deliberately declined.
The erase semantics themselves are defined once in Knowledge Reset / Erase and are not restated here.
- **Delete** removes one owned copy and nothing else.
It MUST NOT free learn budget and MUST NOT modify `learnedRecipes`.
It MUST delete the **whole document** rather than decrementing the stack-quantity path, even for a stacked copy.
This is a deliberate exception to the component-consumption convention: `recipeItemUsage.timesUsed` and `recipeItemLearning.learnedCount` are per-**document** counters shared by every unit in the stack, so decrementing the quantity would leave one set of counters attached to fewer units and silently falsify every derived remaining-uses figure.
Whole-document deletion is also what all three existing recipe-item disposal paths already do (`whenSpent: "destroyed"`, `consumeOnLearn`, and `destroyWhenSpent` each delete the item and none reads a quantity).

**Ordering hazard for a party-pool book.** Under `caps.learn.learnScope === "total"` the budget refund resolves the shared pool key through a **still-owned** source copy, so the order of the two GM actions is load-bearing.
Erase-then-Delete reclaims the slot; Delete-then-Erase never can, and the world pool is permanently short one learn.
A surface offering both operations MUST warn that Erase memory precedes Delete for a party-pool book.

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

- Remove corresponding learned entries from the actors the deleting client may write.
This is the same scope `destructive-changes-and-migrations/spec.md`'s Delete Recipe cascade states, and the same scope the GM surface counts characters over, so one cascade is never described by two capabilities as reaching two different sets.
- The removal uses the explicit `-=` deletion primitive (`forgetLearnedRecipes`) called with `freeLearnBudget: false` — recipe deletion is content management, not an in-fiction un-learn, so it must not refund any consumed learn budget.
`cleanupLearnedRecipes` is rerouted onto that primitive, fixing the prior filtered-map `setFlag` rebuild that MERGED and therefore never actually deleted the stale keys (they resurrected on reload).
- The stale set is derived through the entry-boundary reader (see Reading A Recipe-Id-Keyed Flag Map), so deleting one recipe removes **only** that recipe's entry.
An actor holding entries for several recipes whose ids share a leading segment keeps every entry whose recipe still exists, and an actor with no stale entry is not written to at all.

### Visibility Mode Change

- Learned entries remain stored.
- Access behaviour changes immediately, according to the new mode.

## Testing Requirements

- The document doubles backing these tests MUST expand the nested value tree — in the constructor seed, `setFlag`, and `update` alike — so a fixture written with a dotted id is stored in the shape Foundry really persists it in.
Expanding only the write paths leaves the seed lying, and a double storing a dotted key verbatim reports a false pass for any code path that only exists to handle nesting.
- Unit tests asserting a dotted id's persisted shape MUST assert it **post-reload**, against the nested storage, rather than against the update payload.
- Unit tests that deleting one recipe forgets only its own entry, that siblings sharing a leading id segment survive, that an id which is a strict prefix of another resolves to the right entry in both deletion directions, and that the unrecoverable collisions are asserted as losses rather than silently mishandled.
- A unit test that the panel-facing learner index counts a learner whose recipe id is dotted, agreeing with the deletion cascade.
- Unit tests that a dotted recipe id and a dotted crafting-system id are refused at intake, and that a world already holding one still loads.
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
- Integration tests for `dragDropEnabled === false`: drops do not auto-learn and the Inventory-tab manual learn flow is available instead.

# Specification 006: Recipe Visibility

## Purpose

Define recipe visibility, knowledge gating, recipe-item matching, and learning behaviour.
UI rendering requirements live in `003-ui-integration.md`.

## Scope

This spec governs:

- Which recipes are visible in player listings.
- Which visible recipes are craftable.
- How recipe-item possession is evaluated.
- How learned recipes are stored and checked.
- How limited-use recipe items are consumed.

## Data Model References

From `002-data-models.md`:

- `CraftingSystem.recipeVisibility`
- `Recipe.visibility`
- `Recipe.linkedRecipeItemUuid`
- `Recipe.locked`
- `Actor.flags.fabricate.learnedRecipes`
- `Item._stats.compendiumSource` (Foundry v12+, primary source UUID field)
- `Item.flags.core.sourceId` (Foundry v11 and earlier, legacy fallback)
- `Item.flags.fabricate.recipeItemUsage.timesUsed`

## Source UUID Resolution

Foundry v12 changed how the origin of a compendium-derived item is recorded. On v12 and later the canonical field is `_stats.compendiumSource`; on v11 and earlier it was `flags.core.sourceId`. Both fields serve the same purpose: they record the UUID of the compendium document from which a world or actor-owned copy was created.

**All matching logic in this spec that previously referred to `flags.core.sourceId` now uses a shared source-UUID resolver** defined as follows:

```
resolveSourceUuid(item):
  return item._stats?.compendiumSource
      ?? item.flags?.core?.sourceId
      ?? null
```

The resolver reads `_stats.compendiumSource` first. If that field is absent or nullish, it falls back to `flags.core.sourceId`. If neither field is present, it returns `null`.

Every matching rule in this spec that compares an item's source identity to a stored UUID must invoke the resolver rather than reading either field directly. This ensures consistent behaviour across Foundry versions.

## Recipe Item Matching

A candidate owned item matches `Recipe.linkedRecipeItemUuid` when any of the following is true:

1. `candidate.uuid === linkedRecipeItemUuid`
2. `resolveSourceUuid(candidate) === linkedRecipeItemUuid`

The second condition covers compendium-derived copies. On Foundry v12+, `_stats.compendiumSource` carries this value; on v11, `flags.core.sourceId` carries it. The resolver handles both transparently.

## Visibility Evaluation

### Listing Algorithm

Given `viewer`, `craftingSystem`, optional `craftingActor`, optional `componentSourceActors`:

1. Collect recipes in `craftingSystem`.
2. If `craftingSystem.resolutionMode === "cauldron"`:
   - GM sees all recipes.
   - Non-GM handling:
     - if `craftingSystem.cauldron.learnOnCraft !== true`: return no recipe listings.
     - if `craftingSystem.cauldron.learnOnCraft === true`: return only enabled recipes learned by the actor.
   - Skip non-cauldron list-mode branches below.
3. If `listMode === "global"`:
   - GM sees all recipes.
   - Non-GM sees all enabled recipes. No restriction or knowledge filtering is applied.
4. If `listMode === "player"`:
   - GM sees all recipes, including restricted recipes with empty allow-lists.
   - Non-GM sees recipes where `visibility.restricted === false`, or where `allowedUserIds` includes the viewer's user ID.
   - When `visibility.restricted === true` and `allowedUserIds` is empty, no non-GM user can see the recipe.
5. If `listMode === "knowledge"`:
   - Evaluate knowledge access for each recipe.
   - Keep only recipes where access is granted.
6. Keep locked recipes visible but not craftable for non-GMs.

### Restricted Visibility Examples

| `restricted` | `allowedUserIds` | GM sees? | Player "abc" sees? | Notes                                                                            |
|--------------|------------------|----------|--------------------|----------------------------------------------------------------------------------|
| `false`      | (any)            | Yes      | Yes                | Unrestricted; allow-list ignored                                                 |
| `true`       | `["abc", "def"]` | Yes      | Yes                | Player is in allow-list                                                          |
| `true`       | `["def"]`        | Yes      | No                 | Player is not in allow-list                                                      |
| `true`       | `[]`             | Yes      | No                 | Valid config: hidden from all non-GM users                                       |
| `true`       | missing/null     | Yes      | No                 | Invalid shape: treated as validation error at save time; runtime treats as empty |

### Crafting Guard Algorithm

Before starting/resuming a run and before each step:

1. If `craftingSystem.resolutionMode === "cauldron"`:
   - attempts are validated by submitted ingredients, not by selecting from listed recipes.
   - no-signature attempts are treated as failed attempts with specific failure feedback and ingredient consumption.
   - non-GM users cannot bypass visibility by directly targeting hidden recipe IDs.
2. Re-run listing visibility checks for the active mode.
3. For non-GM users, reject locked recipes regardless of list mode.
4. If `listMode === "global"`, no additional filtering beyond step 3. Non-GM users may craft any unlocked, enabled recipe.
5. If `listMode === "player"`, re-run restricted visibility checks. Reject if the viewer is not in `allowedUserIds` for a restricted recipe.
6. If `listMode === "knowledge"`, re-run knowledge access evaluation. Reject if knowledge access is denied.
7. Reject execution when any guard fails.

## Cauldron Visibility and Learning

Applies only when `CraftingSystem.resolutionMode === "cauldron"`.

1. Recipe lists are hidden from non-GM users by default.
2. Learned visibility behavior:
   - if `cauldron.learnOnCraft === true`, a recipe may become visible only after successful craft completion and learning.
   - if `cauldron.learnOnCraft !== true`, recipes remain hidden to non-GM users.
3. Learning is never granted by failed attempts.
4. No-signature attempts are treated as failed attempts (not misconfiguration errors).
5. If a matched cauldron attempt cannot route to a valid result group, classify as crafting-system misconfiguration error (GM-fix required), not a player-failure outcome.

## Knowledge Access Evaluation

Input:

- `recipe`
- `viewer`
- `craftingActor`
- `componentSourceActors`
- `knowledge.mode`

Algorithm:

1. If the viewer is GM, grant access.
2. Compute `hasLearned` from `Actor.flags.fabricate.learnedRecipes`.
3. Compute `hasMatchedItem`:
   - If `linkedRecipeItemUuid` missing: false.
   - Else, gather candidate items from crafting actor plus component sources (if allowed).
   - Keep candidates matching by UUID or `resolveSourceUuid(candidate)`.
   - If limited uses are enabled, keep only non-exhausted candidates.
4. Evaluate by mode:
   - `item`: grant if `hasMatchedItem`.
   - `learned`: grant if `hasLearned`.
   - `itemOrLearned`: grant if `hasMatchedItem || hasLearned`.
5. Otherwise deny.

## Limited Uses

When `knowledge.item.limitUses === true`:

- Uses are tracked on the matched owned item instance via `timesUsed`.
- An item is exhausted when `timesUsed >= maxUses`.
- Exhausted items are ignored for item-based access and may be destroyed on exhaustion depending on settings.

### Deterministic Item Selection

When a single matched instance must be mutated (increment or consume), choose:

1. Highest `timesUsed`.
2. Stable actor order tie-break.
3. Stable item order tie-break.

## Learning Recipes

### Preconditions

- Mode is `learned` or `itemOrLearned`.
- Recipe has `linkedRecipeItemUuid`.
- Recipe is not yet learned for the selected crafting actor.
- At least one matched, owned recipe item exists.

### Learn Operation

1. Select matched owned item deterministically.
2. Write:

```js
Actor.flags.fabricate.learnedRecipes[recipe.id] = {
  learnedAt: Date.now(),
  sourceItemUuid: selectedItem.uuid,
}
```

3. If `consumeOnLearn === true`, consume selected item.
4. Return the updated access state.

### Drag-and-Drop Learn Configuration

Automatic actor-drop learning is controlled by `recipeVisibility.knowledge.learn.dragDropEnabled`.

- Default is `true`.
- The setting is only meaningful when `listMode === "knowledge"` and `knowledge.mode` is `learned` or `itemOrLearned`.
- If disabled, actor item drops must not trigger recipe learning and manual learning UI is required.

#### Allowed Hook Triggers

Automatic learning from actor item drops may be implemented using:

- `createItem` (preferred)
- `preCreateItem`
- `dropActorSheetData`

`createItem` is preferred because it runs against the created owned item instance and keeps consume-on-learn behaviour deterministic. Regardless of hook choice, runtime behaviour must match this specification.

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
- Systems in `global` or `player` list mode are not evaluated for drag-and-drop learning.
- In multi-system worlds, all eligible knowledge-mode recipes are considered, and matching is based solely on linked recipe item identity rules below.

#### Matching Rules

A dropped item matches a recipe when any of the following is true:

1. `droppedItem.uuid === recipe.linkedRecipeItemUuid`
2. `resolveSourceUuid(droppedItem) === recipe.linkedRecipeItemUuid`

`resolveSourceUuid` reads `_stats.compendiumSource` first (Foundry v12+), then falls back to `flags.core.sourceId` (Foundry v11 and earlier). A match on any condition is sufficient.

#### Multi-Recipe Matching

When a single dropped item matches multiple recipes, the actor learns all matched recipes in a single operation. A recipe item linked to multiple recipes functions as a "recipe book" -- one drop teaches every recipe it is linked to.

Learning is applied per matched recipe independently:

- Already-learned recipes are skipped.
- New learn entries are written only for recipes that pass preconditions.
- `consumeOnLearn` is evaluated for each newly learned recipe. If any learned recipe requires consumption, the dropped owned item must be removed by the end of the operation.

#### Notifications

After a drag-and-drop learn operation completes, the module must provide user feedback:

- **Success**: Display a notification listing the recipe(s) learned and the actor that learned them.
- **Partial success**: When some recipes were already learned, notify only for newly learned recipes. If all matched recipes were already learned, notify the user that nothing new was learned.
- **No match**: When the dropped item does not match any recipe, no learn operation occurs and no notification is shown (the drop is silently ignored for learning purposes).
- **Precondition failure**: When the knowledge mode does not support learning (i.e., mode is `item` only), no learn operation occurs and no notification is shown.

### Manual Learn Path (When Disabled)

When `dragDropEnabled === false`:

- Drops must never trigger auto-learning from `createItem`, `preCreateItem`, or `dropActorSheetData`.
- The actor still receives the dropped item through normal Foundry item-drop behaviour.
- The manual learning affordance is an item-sheet header learn icon/button, as specified in `003-ui-integration.md`.
- Clicking the manual learn action prompts the user to confirm learning for the owning actor and, on confirmation, runs the same learning operation used by drag-and-drop.
- The manual path must apply `consumeOnLearn` and remove the item when required.

## Edge Cases

### Linked Template Missing

If `linkedRecipeItemUuid` no longer resolves to a template:

- Keep the stored UUID.
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
- Unit tests for cauldron listing rules: hidden-by-default for non-GM, learned-only visibility when `learnOnCraft === true`, always-hidden when `learnOnCraft !== true`.
- Unit tests for cauldron no-signature attempts: specific failure feedback, failed-attempt classification, and ingredient consumption behavior.
- Unit tests for cauldron routing mismatches: misconfiguration classification and non-application of player-failure consumption.
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

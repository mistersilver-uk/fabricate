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
- `Item.flags.core.sourceId`
- `Item.flags.fabricate.recipeItemUsage.timesUsed`

## Recipe Item Matching

A candidate owned item matches `Recipe.linkedRecipeItemUuid` when either is true:

1. `candidate.uuid === linkedRecipeItemUuid`
2. `candidate.flags.core.sourceId === linkedRecipeItemUuid`

`core.sourceId` is treated as the canonical identity link across duplicated copies.

## Visibility Evaluation

### Listing Algorithm

Given `viewer`, `craftingSystem`, optional `craftingActor`, optional `componentSourceActors`:

1. Collect recipes in `craftingSystem`.
2. If `listMode === "global"`:
   - GM sees all recipes.
   - Non-GM sees all enabled recipes. No restriction or knowledge filtering is applied.
3. If `listMode === "player"`:
   - GM sees all recipes, including restricted recipes with empty allow-lists.
   - Non-GM sees recipes where `visibility.restricted === false`, or where `allowedUserIds` includes the viewer's user ID.
   - When `visibility.restricted === true` and `allowedUserIds` is empty, no non-GM user can see the recipe.
4. If `listMode === "knowledge"`:
   - Evaluate knowledge access for each recipe.
   - Keep only recipes where access is granted.
5. Keep locked recipes visible but not craftable for non-GMs.

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

1. Re-run listing visibility checks for the active `listMode`.
2. For non-GM users, reject locked recipes regardless of list mode.
3. If `listMode === "global"`, no additional filtering beyond step 2. Non-GM users may craft any unlocked, enabled recipe.
4. If `listMode === "player"`, re-run restricted visibility checks. Reject if the viewer is not in `allowedUserIds` for a restricted recipe.
5. If `listMode === "knowledge"`, re-run knowledge access evaluation. Reject if knowledge access is denied.
6. Reject execution when any guard fails.

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
   - Keep candidates matching by UUID or `core.sourceId`.
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

### Drag-and-Drop Learn

Dropping a recipe item onto a crafting actor is a required learning pathway. The module must register a drop handler that triggers recipe learning when a valid recipe item is dropped onto an actor sheet.

#### Matching Rules

A dropped item matches a recipe when either condition is true:

1. `droppedItem.uuid === recipe.linkedRecipeItemUuid`
2. `droppedItem.flags.core.sourceId === recipe.linkedRecipeItemUuid`

Both UUID identity and `core.sourceId` ancestry must be evaluated. A match on either is sufficient.

#### Multi-Recipe Matching

When a single dropped item matches multiple recipes, the actor learns all matched recipes in a single operation. A recipe item linked to multiple recipes functions as a "recipe book" -- one drop teaches every recipe it is linked to.

#### Notifications

After a drag-and-drop learn operation completes, the module must provide user feedback:

- **Success**: Display a notification listing the recipe(s) learned and the actor that learned them.
- **Partial success**: When some recipes were already learned, notify only for newly learned recipes. If all matched recipes were already learned, notify the user that nothing new was learned.
- **No match**: When the dropped item does not match any recipe, no learn operation occurs and no notification is shown (the drop is silently ignored for learning purposes).
- **Precondition failure**: When the knowledge mode does not support learning (i.e., mode is `item` only), no learn operation occurs and no notification is shown.

## Edge Cases

### Linked Template Missing

If `linkedRecipeItemUuid` no longer resolves to a template:

- Keep the stored UUID.
- Warn in admin/editor UI.
- Matching may still succeed via owned item `core.sourceId`.

### Recipe Deletion

- Remove corresponding learned entries from all actors.

### Visibility Mode Change

- Learned entries remain stored.
- Access behaviour changes immediately, according to the new mode.

## Testing Requirements

- Unit tests for listing behaviour in `global`, `player`, and `knowledge` list modes.
- Unit tests for matching by UUID and by `core.sourceId`.
- Unit tests for limited-use exhaustion and deterministic matched-item selection.
- Unit tests for learning with and without consume-on-learn.
- Unit tests for restricted recipes with empty `allowedUserIds` confirming GM access and non-GM denial.
- Integration tests for full craft guard re-check on start, resume, and step execution.
- Integration tests for drag-and-drop learn: single-recipe match, multi-recipe match, already-learned skip, and no-match silent ignore.
- Integration tests for drag-and-drop learn notifications: success message content, partial-success filtering, and no-notification on zero matches.
- Integration tests for drag-and-drop learn with `core.sourceId` matching (item duplicated from compendium).

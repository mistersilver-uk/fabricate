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
   - GM sees all recipes.
   - Non-GM sees recipes where `visibility.restricted === false` or `allowedUserIds` includes viewer ID.
4. If `listMode === "knowledge"`:
   - Evaluate knowledge access for each recipe.
   - Keep only recipes where access is granted.
5. Keep locked recipes visible but not craftable for non-GMs.

### Crafting Guard Algorithm

Before starting/resuming a run and before each step:

1. Re-run listing visibility checks.
2. For non-GM users, reject locked recipes.
3. If in knowledge mode, re-run knowledge access evaluation.
4. Reject execution when any guard fails.

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

If implemented, a dropped item matches recipes by:

- `droppedItem.uuid === recipe.linkedRecipeItemUuid`, or
- `droppedItem.flags.core.sourceId === recipe.linkedRecipeItemUuid`.

If multiple recipes match, the actor learns all matched recipes.
A recipe item used by multiple recipes is functionally a "recipe book", with many entries.

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
- Integration tests for full craft guard re-check on start, resume, and step execution.

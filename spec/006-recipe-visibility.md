# Specification 006: Recipe Visibility

## Purpose

Define how recipe visibility is determined for players, including optional “recipe items” and optional learning mechanics.
Recipe visibility is evaluated whenever Fabricate displays recipe lists, recipe detail views, and when a crafting run starts/resumes.
This spec is system-agnostic and must not assume any particular game system’s data model.

## Terminology

- **Viewer**: The user attempting to view or craft a recipe.
- **Crafting Actor**: The actor selected by the player for crafting.
- **Component Sources**: Any additional (owned) actors selected as inventory sources (if allowed by the system).
- **Recipe Item**: A world item that represents knowledge of a recipe (e.g., a scroll, schematic, formula book page).
- **Learned Recipe**: A recipe recorded as known by an actor.
- **Visibility Rule**: The policy that decides if a recipe is visible and craftable.

## High-level Goals

- Allow GMs to control which recipes are visible to which players.
- GMs may lock and unlock recipes.
- Support multiple approaches to recipe knowledge:
  - Always visible (no gating)
  - Permission-gated (explicit per recipe and per player-owned actor)
  - Item-gated (must possess a recipe item)
  - Learn-gated (must learn recipe, using a recipe item)
- Ensure visibility is deterministic and explainable

## Data Model

This specification uses the following data model fields defined in **002-data-models.md**:

### CraftingSystem

- `recipeVisibility.listMode` - Controls how recipes are listed ("player" or "knowledge")
- `recipeVisibility.knowledge.mode` - Knowledge gating mode ("item", "learned", "itemOrLearned")
- `recipeVisibility.knowledge.item.limitUses` - Whether recipe items have limited uses
- `recipeVisibility.knowledge.item.maxUses` - Maximum uses per recipe item
- `recipeVisibility.knowledge.learn.consumeOnLearn` - Whether learning consumes the recipe item

### Recipe

- `visibility.restricted` - Whether recipe is restricted to specific players (default: false)
- `visibility.allowedUserIds` - List of Foundry user IDs allowed to view this recipe
- `linkedRecipeItemUuid` - UUID of associated recipe item (world item or compendium entry)
- `locked` - Whether recipe is locked by GM, preventing players from crafting (default: false)

### Actor Flags

- `Actor.flags.fabricate.learnedRecipes` - Map of recipe IDs to learning metadata (timestamp, source item UUID)

### Item Flags

- `Item.flags.fabricate.recipeItemUsage.timesUsed` - Current usage count for recipe items with limited uses

See **002-data-models.md** for complete field definitions, validation rules, and requirements.

## Visibility Evaluation Algorithm

### Listing Recipes (CraftingApp)

When displaying a list of recipes to a player, the following algorithm determines which recipes are visible:

1. **Get all recipes** for the selected crafting system.
2. **Filter by listMode**:
   - If `listMode === "player"`:
     - If viewer is GM: show all recipes.
     - If viewer is player:
       - Show recipes where `visibility.restricted === false` OR `visibility.allowedUserIds` includes the viewer's user ID.
   - If `listMode === "knowledge"`:
     - Evaluate knowledge access for each recipe (see Knowledge Access below).
     - Show only recipes where knowledge access is granted.
3. **Show locked recipes** as visible but not craftable (unless viewer is GM).
4. **Sort and display** remaining recipes.

### Crafting a Recipe

When a player attempts to start or resume crafting:

1. **Verify visibility** using the listing algorithm above.
2. **Verify not locked** (unless viewer is GM).
3. **Verify knowledge access** (if knowledge mode is enabled):
   - Evaluate knowledge access for the recipe and crafting actor (see below).
   - If access is denied, prevent crafting and display an appropriate error message.
4. **Proceed with crafting** if all visibility and craftability tests pass.

### Knowledge Access Evaluation

When `recipeVisibility.listMode === "knowledge"`, evaluate knowledge access as follows:

**Input**:

- `recipe`: The recipe being evaluated.
- `craftingActor`: The actor selected for crafting.
- `viewer`: The user viewing the recipe.

**Algorithm**:

1. **Check if viewer is GM**: If yes, grant access immediately.
2. **Check if recipe has linked item**:
   - If `recipe.linkedRecipeItemUuid` is null or empty, deny access (knowledge mode requires recipe items).
3. **Resolve recipe item** from `recipe.linkedRecipeItemUuid`.
4. **Evaluate based on knowledge mode**:
   - If `knowledge.mode === "item"`:
     - Check if recipe item is in `craftingActor` inventory (or component sources if allowed).
     - If found and not exhausted (see usage tracking below), grant access.
     - Otherwise, deny access.
   - If `knowledge.mode === "learned"`:
     - Check if recipe is learned by `craftingActor` (see actor flags above).
     - If learned, grant access.
     - Otherwise, deny access.
   - If `knowledge.mode === "itemOrLearned"`:
     - Check if recipe item is in inventory (not exhausted) OR recipe is learned.
     - If either condition is true, grant access.
     - Otherwise, deny access.

### Usage Tracking (Item Mode with Limited Uses)

When `knowledge.item.limitUses === true`:

1. **Initialize usage data** on recipe item when first used for crafting:
   - Set `item.flags.fabricate.recipeItemUsage.timesUsed = 0`.
2. **On each crafting attempt** (when initiated by the player):
   - Increment `timesUsed`.
   - If `timesUsed >= maxUses`, mark item as exhausted (cannot be used for further crafting).
   - Optionally delete the item or update its name/description to indicate exhaustion.
3. **Exhausted items** are ignored during knowledge access evaluation.

## Learning Recipes

### Learn Action (UI)

When a player views a recipe detail or recipe item:

1. **Check if learning is applicable**:
   - System must have `knowledge.mode === "learned"` or `knowledge.mode === "itemOrLearned"`.
   - Recipe must have a linked recipe item.
   - Recipe must not already be learned by the crafting actor.
2. **Display "Learn Recipe" button** if applicable.
3. **On click**:
   - Verify player owns the recipe item.
   - Add recipe ID to `actor.flags.fabricate.learnedRecipes` with timestamp and source item UUID.
   - If `knowledge.learn.consumeOnLearn === true`, delete the recipe item from inventory.
   - Display success notification.
   - Refresh recipe list to reflect new knowledge.

### Learn Action (Drag-and-Drop)

Optionally support learning by dragging a recipe item onto an actor sheet:

1. **Detect drop event** on actor sheet.
2. **Check if dropped item is a recipe item**:
   - Search all recipes for `linkedRecipeItemUuid` matching the dropped item's UUID.
3. **If match found**, trigger the learn action as described above.

## UI Considerations

### Recipe Manager (GM)

- Add **Visibility** tab/section to recipe editor:
  - Toggle `visibility.restricted` (if `listMode === "player"`).
  - Multi-select user picker for `visibility.allowedUserIds`.
  - Input for `linkedRecipeItemUuid` (with item picker/browser).
  - Toggle `locked` flag.
- Display visibility icon/badge in recipe list to indicate restricted or locked status.

### Crafting App (Player)

- Display **padlock icon** for locked recipes (if visible).
- Display **knowledge status** for each recipe:
  - "Available" (learned or item possessed).
  - "Unknown" (item not possessed and not learned).
  - "Learned" (explicitly learned via learn action).
- For recipes with `mode === "item"` or `mode === "itemOrLearned"`:
  - Display item name and icon next to recipe name.
  - Display usage count if `limitUses === true` (e.g., "3/5 uses remaining").
- Display **"Learn Recipe"** button when applicable.
- Display **error message** when attempting to craft without knowledge access:
  - "You do not have the required recipe item to craft this recipe."
  - "You have not learned this recipe yet."
  - "This recipe item has been exhausted."

### Recipe Item Linking (GM)

- Drag and drop and item onto recipe editor to link it and set the `linkedRecipeItemUuid`, or to replace with a new item.
- Display item name and icon next to recipe name.

## Edge Cases and Validation

### Recipe Item Deletion

- If a recipe item (world item or compendium entry) is deleted:
  - Recipes with `linkedRecipeItemUuid` pointing to the deleted item should display a warning in the recipe editor.
  - Knowledge access evaluation should handle missing items gracefully (deny access and log warning).

### Recipe Deletion

- If a recipe is deleted:
  - Clean up `learnedRecipes` flags from all actors that have learned it.
  - Optionally notify players who had learned the recipe.

### Crafting System Mode Change

- If `recipeVisibility.listMode` or `knowledge.mode` changes:
  - Existing `learnedRecipes` flags remain but may become irrelevant (do not auto-delete).
  - UI should adapt to show/hide controls based on current mode.

### Component Sources

- When evaluating knowledge access in `item` mode:
  - Check both `craftingActor` inventory AND `componentSourceActors` inventories (if allowed by system).
  - Recipe item in any valid source grants access.

### Locked Recipe Bypass (GM)

- GMs can always view and craft locked recipes.
- UI should indicate when a recipe is locked but allow GM interaction.

### Ownership and Permissions

- Players can only learn recipes for actors they own.
- Players can only view recipe items in inventories of actors they own.
- GMs have unrestricted access to all recipes, actors, and items.

## Testing Requirements

- **Unit tests**:
  - Visibility evaluation algorithm with various `listMode` and `visibility` configurations.
  - Knowledge access evaluation for all `knowledge.mode` values.
  - Usage tracking and exhaustion logic.
  - Learning recipes and consumption logic.
- **Integration tests**:
  - End-to-end recipe listing with different user permissions.
  - Crafting with knowledge requirements (item, learned, itemOrLearned).
  - Learning recipes via UI and drag-and-drop.
  - Recipe item creation and linkage.
- **Edge case tests**:
  - Deleted recipe items.
  - Deleted recipes with learned flags.
  - Mode changes and their effects.
  - Component sources and inventory checks.

## Future Enhancements (Out of Scope)

- Recipe discovery through exploration or quests.
- Skill/attribute requirements for learning recipes.
- Progressive recipe unlocking (e.g., must craft recipe A before learning recipe B).
- Recipe item variants with different use counts or learning requirements.
- Shared knowledge between party members or guilds.
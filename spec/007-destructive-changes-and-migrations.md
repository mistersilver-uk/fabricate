# Specification 007: Destructive Changes and Migrations

## Purpose

Define destructive operations, required confirmations, clean-up behaviour, and migration policy.

## Principles

- Destructive actions must be explicit and confirmed.
- Clean-up must be deterministic and idempotent.
- Invalid references should be removed or marked stale immediately.

## Destructive Operations

### Change Crafting System Resolution Mode

When `CraftingSystem.resolutionMode` changes:

1. Require explicit GM confirmation.
2. Delete all recipes in that crafting system.
3. Delete all in-progress runs referencing deleted recipes.
4. Remove learned recipe entries referencing deleted recipes.
5. Clear per-user progressive ordering preferences referencing deleted recipes.

### Delete Crafting System

1. Delete all recipes in the system.
2. Apply the same clean-up as mode change.
3. Remove the system from persisted settings.

### Delete Recipe

1. Remove recipe from persisted recipes.
2. Remove run records referencing the recipe.
3. Remove learned flags for that recipe from all actors.
4. Remove recipe-specific UI preference data.

### Disable Multi-step Feature

If disabling `features.multiStepRecipes` for a system with multistep recipes:

1. Require explicit GM confirmation.
2. Existing multistep recipes become invalid and must be deleted unless migrated.
3. Any active runs for deleted recipes must be cleaned up.

### Change Visibility Knowledge Mode

When switching `recipeVisibility.listMode` or `knowledge.mode`:

- Existing learned flags are retained.
- Access behaviour changes immediately according to `006`.
- UI must hide controls that are no longer applicable.

### Linked Recipe Item Template Deletion

If a linked world/compendium item is deleted:

- Keep `linkedRecipeItemUuid` unchanged.
- Warn in the recipe editor.
- Runtime matching may still succeed via `core.sourceId` on owned copies.

## Clean-up Rules

### Runs Clean-up

- Remove run entries that reference missing recipe IDs.
- Remove run entries for recipes in deleted systems.
- Runs cleanup should be executed after every destructive operation and during startup migration.

### Learned Recipes Clean-up

- Remove learned entries for missing recipe IDs.
- Keep valid learned entries even if the visibility mode changes.

### Preferences Clean-up

- Remove stale `fabricate.lastManagedCraftingSystem` references.
- Remove stale progressive-order preferences for missing recipes.

## Migration Policy

### Versioning

- Migrations are keyed by the module version.
- Migration steps must be idempotent.

### Startup Migration Pass

On startup or world load:

1. Apply namespace or setting migrations if defined, and when needed.
2. Validate crafting systems shape.
3. Validate recipes shape and foreign keys.
4. Run stale run clean-up.
5. Run stale learned-recipe cleanup.
6. Persist migrated data only when changes are detected.
7. Check world time against in-progress crafting runs with a time requirement. Complete steps/recipes as appropriate and notify users owning the actor(s).

### Error Handling

- Corrupt records should be skipped and logged with actionable details.
- Migration should continue for remaining records.
- If migration cannot safely continue, abort with an explicit GM-facing error.

## Testing Requirements

- Unit tests for each destructive operation clean-up path.
- Unit tests for idempotent migration behaviour.
- Integration tests for mode changes, recipe deletion, and startup migration.

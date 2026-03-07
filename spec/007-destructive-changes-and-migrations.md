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

### Migration State Storage

- `fabricate.migrationVersion` is a world-scoped setting (type: String, default: `"0.0.0"`).
- It stores the semver version string of the last successfully applied migration.
- Registered under the `fabricate` namespace via `SETTING_KEYS.MIGRATION_VERSION`.

### Migration Registry

- Migrations are registered in an ordered array (`MIGRATIONS`), each entry containing: `version` (semver string), `label` (human-readable description), and a `migrate(data)` function.
- Each migration receives a `{ recipes, systems }` data payload and returns the transformed payload.
- Migrations must be idempotent -- running the same migration twice on the same data must produce identical output.

### Startup Migration Flow

On module initialization:

1. Read `fabricate.migrationVersion` (defaults to `"0.0.0"` if unset).
2. Filter the migration registry for entries where `migration.version > migrationVersion` using numeric semver comparison.
3. Sort pending migrations by ascending semver order.
4. If no pending migrations exist, exit early (no data reads or writes).
5. Read current `fabricate.recipes` and `fabricate.craftingSystems` settings.
6. Snapshot the original data (JSON serialization) for change detection.
7. Execute each pending migration sequentially, passing the accumulated data payload.
8. After all migrations complete, compare final data against the original snapshot.
9. Persist `fabricate.recipes` only if recipes changed.
10. Persist `fabricate.craftingSystems` only if systems changed.
11. Update `fabricate.migrationVersion` to the highest version among executed migrations.
12. Log a summary of how many migrations ran.

### Per-Migration Error Handling

- If an individual migration throws an error, log a warning with the migration label and error message: `Fabricate | Migration "<label>" failed: <message>`.
- The migration runner continues executing remaining pending migrations.
- Failed migrations do not advance the `highestVersion` tracker; they will be re-attempted on subsequent startups until they succeed or are removed from the registry.
- If migration cannot safely continue (e.g., corrupt base data prevents reading), abort with an explicit GM-facing error.

### Write-on-Change Persistence

- Data is persisted only when the JSON-serialized output differs from the pre-migration snapshot.
- This avoids unnecessary setting writes that would trigger Foundry change hooks and potential re-renders.
- `migrationVersion` is always updated after a migration pass, regardless of whether data changed.

### Versioning

- Migrations are keyed by module version.
- Version comparison uses numeric semver (major.minor.patch) with zero-padding for missing segments.

### Canonical-Write and Legacy-Read Policy

The migration framework supports the canonical-write / legacy-read compatibility policy defined in `002-data-models.md § Canonical-Write and Legacy-Read Compatibility Policy`.

- Migrations MUST rewrite legacy field names to their canonical equivalents (e.g., `systemItemId` -> `componentId`, `managedItems` -> `components`).
- After migration, persisted data must contain only canonical keys. Legacy keys must be deleted from persisted data by the migration.
- Runtime constructors and normalization functions continue to accept legacy aliases as read fallbacks to handle data that has not yet been migrated (e.g., data from external imports, manual JSON edits, or worlds that skipped a migration version).
- Transitional write aliases (dual-emit in `toJSON()`) are a temporary measure for UI compatibility. They are NOT part of the migration contract and do not affect persisted data integrity because migrations operate on raw persisted JSON, not on `toJSON()` output.
- Each migration entry in the registry should document which legacy aliases it retires from persisted data.
- Cross-reference: full alias tables are maintained in `002-data-models.md § Canonical-Write and Legacy-Read Compatibility Policy`.

## Testing Requirements

- Unit tests for each destructive operation clean-up path.
- Unit tests for idempotent migration behaviour: running a migration twice on the same data produces identical results.
- Unit tests for partial-failure progression: when one migration fails, subsequent migrations still execute and `migrationVersion` advances.
- Unit tests for write-on-change: verify no setting writes occur when data is unchanged.
- Unit tests for pending migration selection: only migrations newer than `migrationVersion` are selected, ordered by ascending semver.
- Integration tests for mode changes, recipe deletion, and startup migration.

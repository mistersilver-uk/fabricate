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
4. Emit one summary notification that includes the deleted crafting system name and the number of related entities removed; do not emit one notification per deleted recipe.

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

### Delete Recipe Item Definition

When deleting a `RecipeItemDefinition` from a crafting system:

- Require explicit GM confirmation.
- Clear `recipeItemId` from every recipe in that system that references the deleted definition.
- Warn in the recipe editor.
- Learned recipe flags remain stored.
- Access behaviour changes immediately according to `006`.

### Recipe Item Source Template Deletion

If a recipe item's linked world/compendium source item is deleted:

- Keep `RecipeItemDefinition.sourceItemUuid` unchanged.
- Warn in the relevant admin/editor UI.
- Runtime matching may still succeed via source UUID resolution (`_stats.compendiumSource`, legacy fallback `flags.core.sourceId`) on owned copies.

### Import Recipes into Crafting System

On recipe import:

1. Import is partial by design:
   - non-conflicting recipes are imported,
   - conflicting recipes are rejected.
2. If target system mode is `alchemy`, signature uniqueness collisions are treated as conflicts.
3. The import operation must emit one aggregated conflict report at completion.
4. The import operation must emit one terminal notification summary and must not emit per-recipe create or update notifications.

### Alchemy Uniqueness Revalidation

For systems in `alchemy` mode:

1. Signature uniqueness is validated across all recipes in the system.
2. Any detected collision blocks saves globally until resolved, including saves from unrelated recipe edits.

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
- Migration metadata SHOULD include a `downgradeTo` (Fabricate module version string) used for GM recovery guidance when migration aborts.

### Startup Migration Flow

On module initialization:

1. Read `fabricate.migrationVersion` (defaults to `"0.0.0"` if unset).
2. Filter the migration registry for entries where `migration.version > migrationVersion` using numeric semver comparison.
3. Sort pending migrations by ascending semver order.
4. If no pending migrations exist, exit early (no data reads or writes).
5. Read current `fabricate.recipes` and `fabricate.craftingSystems` settings.
6. Snapshot the original data (JSON serialization) as rollback baseline.
7. Execute each pending migration sequentially, passing the accumulated data payload.
8. Before each migration, capture a per-migration checkpoint of the last known-good transformed payload.
9. If an unusable-document migration error is detected, stop immediately, restore the last known-good checkpoint, and mark the migration pass as aborted.
10. If the pass is aborted:
    - Persist no migrated recipe/system data.
    - Do not update `fabricate.migrationVersion`.
    - Emit GM-facing recovery guidance in console (see "Migration Abort Recovery Guidance").
    - Present a GM decision prompt, defaulting to `Keep existing data`.
11. If the pass completes successfully, compare final data against the original snapshot.
12. Persist `fabricate.recipes` only if recipes changed.
13. Persist `fabricate.craftingSystems` only if systems changed.
14. Update `fabricate.migrationVersion` to the highest version among successfully executed migrations.
15. Log a summary of how many migrations ran.

### Per-Migration Error Handling

- If an individual migration throws an error, log a warning with the migration label and error message: `Fabricate | Migration "<label>" failed: <message>`.
- If the error indicates unusable migrated documents (for example: invalid required fields after transform, unresolved hard references that violate spec invariants, or malformed macro references required for execution), migration is **fatal** for the current startup pass.
- On fatal migration error, the runner must abort immediately and roll back to the last known-good transformed checkpoint in memory.
- The runner must not persist partially migrated data from an aborted pass.
- `migrationVersion` must remain unchanged when a pass aborts.
- Non-fatal warnings may be logged, but they must not mutate persisted data unless the migration pass completes.

### Migration Abort Recovery Guidance

When a migration pass aborts, Fabricate must provide explicit GM guidance:

1. Print a clear console header: `Fabricate | Migration aborted. Existing data has been kept unchanged.`
2. Print a recommended downgrade target version (`downgradeTo`) so the GM can continue using existing data without immediate manual remediation.
3. Print explicit, per-document fix instructions for each failure:
   - document type (`recipe` or `craftingSystem`)
   - document ID/name
   - exact validation or transform error
   - required fix action
4. When applicable, include macro-oriented remediation suggestions in console output (for example, suggested macro payload shape or required return keys).
5. Show a GM prompt with choices:
   - `Keep existing data` (default)
   - `I will manually fix or delete failed documents, then retry migration`
6. If the GM keeps existing data, no additional migration writes occur during that startup session.
7. If the GM opts to fix/delete and retry, retry is explicit and user-initiated (never automatic in the same aborted pass).

### Write-on-Change Persistence

- Data is persisted only when the JSON-serialized output differs from the pre-migration snapshot.
- This avoids unnecessary setting writes that would trigger Foundry change hooks and potential re-renders.
- On successful migration passes, `migrationVersion` is updated to the highest successfully executed migration version even when data is unchanged.
- On aborted migration passes, `migrationVersion` is unchanged.

### Versioning

- Migrations are keyed by module version.
- Version comparison uses numeric semver (major.minor.patch) with zero-padding for missing segments.

### Canonical-Write and Legacy-Read Policy

The migration framework supports the canonical-write / legacy-read compatibility policy defined in `002-data-models.md § Canonical-Write and Legacy-Read Compatibility Policy`.

- Migrations MUST rewrite legacy field names to their canonical equivalents (e.g., `systemItemId` -> `componentId`, `managedItems` -> `components`).
- Migration output payloads SHOULD be canonical-first and SHOULD remove retired legacy keys where safe.
- Runtime constructors and normalization functions continue to accept legacy aliases as read fallbacks to handle data that has not yet been migrated (e.g., data from external imports, manual JSON edits, or worlds that skipped a migration version).
- Transitional write aliases (dual-emit in `toJSON()`) are temporary compatibility outputs for runtime writers and UI paths. They are deprecated and must not be introduced for new fields.
- During the transitional window, persisted settings MAY still include documented transitional aliases when written by runtime managers. This does not invalidate migration correctness.
- Each migration entry in the registry should document which legacy aliases it retires from persisted data.
- Cross-reference: full alias tables are maintained in `002-data-models.md § Canonical-Write and Legacy-Read Compatibility Policy`.

### Resolution-Model Migration (Pre-Release)

The pre-release migration path removes legacy crafting modes `mapped` and `tiered`.

1. System migration:
   - `mapped` -> `routed`
   - `tiered` -> `routed`
2. Recipe migration:
   - legacy mapped recipes -> `resultSelection.provider = "ingredientSet"`
   - legacy tiered recipes -> `resultSelection.provider = "macroOutcome"`
3. Mode and recipe migration is best-effort with hard cleanup on invalid documents:
   - recipes that cannot be migrated are deleted,
   - cascading cleanup is applied immediately (runs, learned flags, UI prefs, and stale references),
   - migration logs JSON for removed objects to console.
4. Provider-switch behavior:
   - when provider is changed, stale provider-specific config from the previous provider is cleared.
5. Because this is pre-release, legacy-mode compatibility shims are not retained.

### Recipe Item Library Migration (Pre-Release)

The pre-release migration path replaces legacy recipe-level `linkedRecipeItemUuid` values with system-owned recipe item definitions.

1. Group recipes by `craftingSystemId`.
2. For each distinct legacy `linkedRecipeItemUuid` inside one crafting system:
   - create one generated `RecipeItemDefinition`,
   - set `sourceItemUuid` to the legacy UUID,
   - derive `name`/`img` from the resolved source item when available, otherwise use deterministic fallback metadata.
3. Rewrite each recipe to `recipeItemId` referencing the generated definition for that UUID.
4. If a legacy UUID is unresolved, keep it as stale `sourceItemUuid` on the generated definition and emit a migration warning rather than dropping the reference.
5. When multiple recipes in one system share the same legacy UUID, they must reuse the same generated `RecipeItemDefinition`.
6. Remove `linkedRecipeItemUuid` from canonical migrated recipe output.

## Testing Requirements

- Unit tests for each destructive operation clean-up path.
- Unit tests for idempotent migration behaviour: running a migration twice on the same data produces identical results.
- Unit tests for fatal migration abort: unusable-document failure aborts the pass, no partial data is persisted, and `migrationVersion` remains unchanged.
- Unit tests for rollback behaviour: data after abort equals the last known-good checkpoint.
- Unit tests for GM guidance output: console output includes downgrade recommendation and explicit per-document remediation steps.
- Unit tests for GM prompt defaults: `Keep existing data` is pre-selected/default.
- Unit tests for write-on-change: verify no setting writes occur when data is unchanged.
- Unit tests for pending migration selection: only migrations newer than `migrationVersion` are selected, ordered by ascending semver.
- Unit tests for pre-release mode migration (`mapped`/`tiered` -> `routed`) and provider assignment.
- Unit tests for pre-release recipe-item migration (`linkedRecipeItemUuid` -> `recipeItemDefinitions` + `recipeItemId`).
- Unit tests for unmigratable recipe deletion with cascade cleanup and JSON logging output.
- Unit tests for provider-switch stale-config cleanup.
- Unit tests for partial import conflict handling and aggregated conflict reporting.
- Unit tests for alchemy global save blocking when any system collision exists.
- Integration tests for mode changes, recipe deletion, and startup migration.

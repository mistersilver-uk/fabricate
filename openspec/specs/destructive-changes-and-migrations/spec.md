# Specification 007: Destructive Changes and Migrations

## Purpose

Define destructive operations, required confirmations, clean-up behaviour, and migration policy.

## Principles

- Destructive actions must be explicit and confirmed.
- Clean-up must be deterministic and idempotent.
- Invalid references should be removed or marked stale immediately.

## Destructive Operations

### Change Crafting System Resolution Mode

A resolution-mode change is **migration-first**, not delete-all.
When `CraftingSystem.resolutionMode` changes:

1. Require explicit GM confirmation.
   The confirmation reports accurate counts from a dry run: how many recipes will be migrated to the new mode and, only when any cannot be migrated, how many will be deleted and their names.
   When no recipe will be deleted the confirmation must not mention deletion.
2. Persist the merged system (with its new mode) before migrating recipes, so recipe migration and validation read the new mode.
3. For each recipe in the system, migrate it to fit the new mode per the migratability matrix in `004-resolution-modes.md § Mode Invariant` (seed a result-selection provider, clear the routed selection, or carry it verbatim).
   Migrated recipes are persisted on structural validity alone.
4. Delete a recipe only when a per-recipe *structural* constraint of the target mode cannot be met by seed/clear: narrowing into `simple`/`progressive` from a recipe that is not 1×1, or moving a multi-step recipe into `alchemy`.
5. System-level gaps other than alchemy signature collisions (for example a target mode whose required check is unconfigured) never delete or disable a recipe here; they are surfaced as system-validation issues that gate visibility (see `recipe-visibility`), not deletions.
   An alchemy signature collision is the exception, handled by item 7 below: migrating *into* `alchemy` disables (`enabled = false`) the colliding recipes rather than deleting them or hard-blocking the switch.
   Migrating into routed `check` seeds the provider but does NOT author outcome tiers or mark any tier `success`, so a migrated routed system produces no result until a GM authors at least one Success outcome tier and routes a result group to it; this is surfaced as a validation issue, never auto-healed.
6. Apply the standard clean-up for any recipes that were deleted: remove in-progress runs, learned-recipe entries, and per-user progressive ordering preferences referencing them.
7. When the new mode is `alchemy`, re-run the alchemy signature reconciliation: colliding migrated recipes are disabled (`enabled = false`) to gate them out of craftable visibility rather than blocking the mode switch.
   Disabling does not resolve the collision in the persisted data (disabled recipes still participate in signature validation), so any later edit to the now-`alchemy` system remains blocked per §"Alchemy Uniqueness Revalidation" until the GM deletes or de-collides those recipes — there is no separate reconciliation on alchemy component-list edits, which are handled by that revalidation block, not here.
8. Emit aggregated notifications: one summary of migrated recipes, one warning listing deleted recipes only when any were deleted, and a single `recipesChanged` emission for the whole pass (never one notification per recipe).

### Delete Crafting System

1. Delete all recipes in the system.
2. Apply the same clean-up as mode change.
   This clean-up covers all three actor- and user-scoped stores keyed by the deleted system: crafting runs (both active and history) via the runs clean-up; learned-recipe flags via the learned-recipes clean-up; and per-user progressive-ordering and stale-reference preferences via the preferences clean-up.
   For performance and reliability, once all recipes have been deleted this clean-up is performed as a single bulk pass across all actors per store, not a per-recipe sequential clean-up that fans out to one flag write per recipe per actor.
   Batching how the clean-up runs does not narrow which categories it covers.
   The deliberately-orphaned per-actor `discoveryProgress` flag remains out of scope.
3. Remove the system from persisted settings.
4. Emit one summary notification that includes the deleted crafting system name and the number of related entities removed; do not emit one notification per deleted recipe.
5. A failure to delete an individual recipe must not abort the deletion: the remaining recipes are still deleted, the system is still removed from persisted settings, and clean-up still runs.
   Each failed recipe deletion is logged with its recipe id so a GM can locate and manually remove orphaned recipe data, and the summary notification reflects how many recipes could not be auto-deleted.

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
3. Editing an already-`alchemy` system (for example changing its component list, essences, or recipe-item definitions) revalidates signature uniqueness against the proposed system before persisting, and blocks the update with actionable diagnostics naming the conflicting recipes when a collision is detected, so a rejected update never persists the colliding state.
4. This system-level revalidation applies only to edits of a system that is already in `alchemy` mode; a resolution-mode change *into* `alchemy` instead follows the resolution-mode migration policy in §"Change Crafting System Resolution Mode" (recipes are migrated and colliding recipes are disabled — `enabled = false` — to gate them out of craftable visibility, rather than hard-blocking the mode switch).
5. Disabling colliding recipes on a mode change gates visibility but does NOT resolve the collision: the disabled recipes still participate in signature validation, so the next edit covered by clause 3 (or any colliding-recipe edit) stays blocked until the GM deletes or de-collides them.
   This is how the mode-change disable path and clause 2's "blocks saves globally until resolved" reconcile — the mode switch is the one save permitted to land a collision (a mode switch cannot be refused wholesale), after which the global block resumes.
6. Non-`alchemy` system updates are not signature-validated.

## Clean-up Rules

### Runs Clean-up

- Remove run entries that reference missing recipe IDs.
- Remove run entries for recipes in deleted systems.
- Runs cleanup should be executed after every destructive operation and during startup migration.
- During a Delete Crafting System operation this clean-up runs as one bulk pass per store across all actors, not once per deleted recipe; this batches how the clean-up executes without changing its scope.

### Learned Recipes Clean-up

- Remove learned entries for missing recipe IDs.
- Keep valid learned entries even if the visibility mode changes.
- During a Delete Crafting System operation this clean-up runs as one bulk pass across all actors, not once per deleted recipe; this batches how the clean-up executes without changing its scope.

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
5. Show a GM-only interactive prompt (`foundry.applications.api.DialogV2`) with choices:
   - `Keep existing data` (the pre-selected default button)
   - `I will manually fix or delete failed documents, then retry migration`
6. If the GM keeps existing data, no additional migration writes occur during that startup session.
7. If the GM opts to fix/delete and retry, retry is explicit and user-initiated (never automatic in the same aborted pass).
Because `migrationVersion` is unchanged on abort, the pending migrations re-run automatically on the next world reload after the GM fixes or deletes the failed documents; the fix/retry choice is informational and triggers no same-pass retry.

The prompt's DialogV2 configuration (window title, content mirroring the console guidance, both choices, and the `Keep existing data` default) is produced by a pure builder (`src/migration/migrationRecoveryPrompt.js`) so the default choice is unit-testable without Foundry.
The runner exposes a `promptRecovery` seam invoked with `{ downgradeTo, documents, label }` on abort; `src/main.js` `_runMigrations` wires the thin Foundry edge that opens DialogV2 from that config.

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
- Transitional write aliases (dual-emit in `toJSON()`) are temporary compatibility outputs for runtime writers and UI paths.
They are deprecated and must not be introduced for new fields.
- During the transitional window, persisted settings MAY still include documented transitional aliases when written by runtime managers.
This does not invalidate migration correctness.
- Each migration entry in the registry should document which legacy aliases it retires from persisted data.
- Cross-reference: full alias tables are maintained in `002-data-models.md § Canonical-Write and Legacy-Read Compatibility Policy`.

### Resolution-Model Migration (Pre-Release)

The pre-release migration path retires the legacy crafting modes `mapped`/`tiered`
AND the interim single `routed` mode, landing every system on the two first-class
routed modes `routedByIngredients` / `routedByCheck`.
The routing basis is now a property of the system MODE (not a per-recipe
`resultSelection.provider`), so the migration — not the read-time normalizer — must
make the system-level basis decision.
`routed` is no longer a landing token for the read-time normalizer.

1. Legacy `mapped`/`tiered` system migration (the clean, per-system tokens):
   - `mapped` -> `routedByIngredients`
   - `tiered` -> `routedByCheck`
2. Legacy `mapped`/`tiered` recipe migration:
   - former mapped recipes are carried verbatim (mapped routing is byte-identical to `IngredientSet.resultGroupId` ingredient routing — no provider, no reshaping).
   - former tiered recipes run the group-name reconciliation below, then carry.
2a.
For former `tiered` recipes, each `outcomeRouting[outcome] -> groupId` entry is reconciled by renaming the target `ResultGroup.name` to `outcome` (so canonical check name-matching reproduces the legacy routing), then `outcomeRouting` is removed.
Fan-in (multiple outcomes -> one group) splits the group into per-outcome clones; an outcome with no resolvable group is logged and left as a craft-time misconfiguration; an unroutable group keeps its name; a reserved-keyword outcome drops to the failure path without renaming any group; an unavoidable normalized `ResultGroup.name` collision makes the recipe unmigratable (hard cleanup per item 4).
3. One-time `routed` system migration (a `routed` system has no system-level provider constraint and may mix `ingredientSet`- and `check`-routed recipes, so a per-system mode is chosen and disagreeing recipes reconciled):
   - **Majority provider wins.** The system becomes the mode matching the provider used by the majority of its recipes; ties — including a system with NO routed recipes — break to `routedByIngredients` (the optional-check, lower-friction mode).
   - **Minority reconciliation.** Recipes whose old provider disagrees with the chosen system mode keep their result data but have their now-meaningless `resultSelection` dropped; the stale routing is surfaced by system validation as a re-authoring issue — never silently mis-routed.
   - **Provider drop.** Every recipe of a migrated system has its `resultSelection` cleared (agreeing recipes lose only a redundant field); the routed modes derive their basis from the system mode.
   - A `routedByCheck` system that lacks `craftingCheck.routed.rollFormula` is the new unconditional system blocker (visibility), not a recipe deletion.
4. Mode and recipe migration is best-effort with hard cleanup on invalid documents:
   - recipes that cannot be migrated are deleted,
   - cascading cleanup is applied immediately (runs, learned flags, UI prefs, and stale references),
   - migration logs JSON for removed objects to console.
5. Because this is pre-release, legacy-mode compatibility shims are not retained.

The salvage `salvageResolutionMode: "routed"` and the gathering economy
`resolutionMode: "routed"` are unrelated routing concepts on separate enums and are
explicitly untouched by this split — they keep the `routed` token.

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

### Catalyst → Tool Migration (`0.6.0`)

The `0.6.0` migration (`src/migration/migrateCatalystsToTools.js`) retires the Catalyst concept by converting recipe-side catalysts into shared library **Tools** referenced by `toolIds`.
It is automatic, versioned, idempotent, and by-reference.

1. Walk **recipe**-level, step-level, ingredient-set-level, and salvage-definition catalysts.
Dedupe them into per-system library Tools written onto the crafting system (`system.tools`, the `craftingSystems` setting) and replace the inline catalyst arrays with `toolIds` references.
2. The gathering `task.catalysts` field is **dead/vestigial** — never authored, only read, always empty.
The `0.6.0` migration does **not** walk it and does not mutate `gatheringConfig`; the residual field is stripped later by the `1.7.0` migration (below).
3. Catalyst → Tool mapping:
   - `degradesOnUse: false` (presence-only, never consumed) → `breakage { mode: breakageChance, breakageChance: 0 }` + `onBreak { mode: flagBroken }`.
This is a deliberate modeling choice (a 0% break chance writes NO item usage flag), preserving the never-consumed behavior.
The migration is **behavior-preserving**, not strictly structurally lossless, for this case.
   - `degradesOnUse: true`, `maxUses: N`, `destroyWhenExhausted: true` → `breakage { mode: limitedUses, maxUses: N }` + `onBreak { mode: destroy }`.
   - `degradesOnUse: true`, `maxUses: N`, `destroyWhenExhausted: false` → `breakage { mode: limitedUses, maxUses: N }` + `onBreak { mode: flagBroken }`.
4. Dedup keys on the **full** catalyst shape (componentId + degradesOnUse + maxUses + destroyWhenExhausted) so semantically different catalysts are NOT merged into one library Tool.
5. Recipes whose crafting system is missing are **skipped, not thrown** — log and continue.
6. Mutated setting keys are `recipes` and `craftingSystems` (`systems[id].tools`); `gatheringConfig` is untouched.
7. **Item-flag fallback (migrated `limitedUses` tools only).** At runtime, tool usage reads `flags.fabricate.toolUsage` and falls back to the legacy `flags.fabricate.catalystItemUsage` (and the bare-number `catalystUses`, coerced to `{ timesUsed }`) when `toolUsage` is absent, so in-flight per-item usage counters survive the cutover without an item-flag rewrite.
The first post-migration `applyUsage` writes `toolUsage` (authoritative thereafter); the legacy flag is never back-filled or cleared.
This fallback is meaningless for presence-only (`breakageChance: 0`) tools, which never read or write usage.
8. After the pass, a one-time GM `ui.notifications` notice states that recipe catalysts moved to the Tools library, including a count of migrated entries and a pointer to the Tools tab.
The migrated count is surfaced through the runner (`_migratedCatalystCount`) and is never persisted as a setting.

### Tools-to-System Reconciliation (`0.7.0`)

Tools are **system-owned**: every consumer reads `system.tools`.
The `0.7.0` migration (`src/migration/migrateToolsToSystem.js`) reconciles any UI-authored gathering-scoped tools — persisted under `gatheringConfig.systems[id].tools` before tools became system-owned — onto the matching crafting system's `tools`, the single canonical source.
It is pure, idempotent, and version-gated.

1. For each `gatheringConfig.systems[id].tools` array, MOVE its tools onto the matching `system.tools` and clear the gathering-config copy (`delete systemConfig.tools`).
2. Dedupe by tool `id`: when the same id exists on both the system and the gathering config, the **existing system tool wins** (the gathering copy is dropped, not merged), so a re-author on the system is never clobbered.
Tools without an `id` are skipped.
3. A gathering-config tools array whose `systemId` has **no matching crafting system** is left in place rather than dropping authored data.
4. Mutated setting keys are `craftingSystems` (`systems[].tools`) and `gatheringConfig` (`systems[id].tools` cleared).
Idempotent: once the config arrays are emptied/removed a re-run is a no-op.

### Gathering Limitation Toggles (`0.8.0`)

The gathering economy limitation moved from a single mutually-exclusive `mode` enum (`none` | `stamina` | `nodes`) to two independent boolean toggles (`stamina.enabled` / `nodes.enabled`).
The `0.8.0` migration (`src/migration/migrateGatheringLimitationToggles.js`) rewrites the legacy `mode` into the toggles.
It is pure, idempotent, by-reference, and version-gated.

1. For each `gatheringConfig.systems[id].economy` still carrying a legacy `mode`, write `stamina.enabled = (mode === 'stamina')` and `nodes.enabled = (mode === 'nodes')`, then delete `mode`.
2. Already-migrated economies (no `mode`, toggles present) are left untouched, so a re-run is a no-op.
3. Mutated setting key is `gatheringConfig` (`systems[id].economy`).
A read-time normalizer applies the same `mode → toggles` mapping (gated on the toggle KEY being absent) so an un-migrated world behaves identically before the migration runs.

### Legacy Result-Selection Provider Removal (`1.6.0`)

The legacy routed result-selection providers `macroOutcome` and `rollTableOutcome` are removed; result routing is canonicalized on the `check` provider.
The `1.6.0` migration (`src/migration/migrateRemoveResultSelectionProviders.js`) rewrites persisted recipes onto `check` and drops the now-unsupported roll-table mechanism.
It is pure, idempotent, by-reference, and version-gated.

1. Recipes — rewrite `resultSelection.provider` `macroOutcome | rollTableOutcome → check` at the recipe level, on every `steps[].resultSelection`, and on alchemy recipe-level (no-`steps[]`) recipes.
   `macroOutcome → check` is behaviourally equivalent (lossless): both route by the crafting-check outcome name.
2. `rollTableOutcome → check` is lossy: the table-draw mechanism is gone, so `rollTableUuid` is DROPPED from every selection.
   Each recipe/step whose `rollTableUuid` was dropped is collected into a recovery-warning payload listing the affected recipes/steps for manual reconfiguration.
3. Gathering routed tasks (`gatheringConfig.systems[*].tasks[*]`) lose their now-unsupported per-task `resultSelection`; the stripped tasks are collected into the same recovery-warning payload, which instructs the GM to populate the system `gatheringCraftingCheck.routed.rollFormula` so routed gathering resolves via the system check formula.
4. The recovery-warning payload is surfaced through the runner's transient-field pattern (mirroring `_migratedCatalystCount`): captured in the runner's summary, surfaced as a one-time GM `ui.notifications` notice, then stripped so it is never persisted as a setting.
5. Idempotent: once no `macroOutcome`/`rollTableOutcome` provider, no `rollTableUuid`, and no gathering-task `resultSelection` remain, a re-run is a no-op.
6. Recovery from the dropped `rollTableUuid`: the table-draw routing mechanism no longer exists, so a former `rollTableOutcome` recipe must be reconfigured by the GM — name its `ResultGroup`s to match the system crafting-check outcomes the `check` provider routes by (the recovery-warning notice lists the affected recipes/steps).

### Break-Tools-on-Fail Rename (`1.7.0`)

The failure-consumption key `consumption.consumeCatalystsOnFail` — retained by its catalyst-era name only to defer a persisted-key migration, but governing **Tool** breakage on a failed craft or salvage since `0.6.0` — is renamed to `consumption.breakToolsOnFail` to match the domain language (Tools *break*, they are not *consumed*).
The same migration strips residual dead `catalysts` arrays that `0.6.0` could not reach.
The `1.7.0` migration (`src/migration/migrateBreakToolsOnFail.js`) is pure, idempotent, by-reference, and version-gated.

1. Rename `consumeCatalystsOnFail → breakToolsOnFail` on `system.craftingCheck.consumption` and `system.salvageCraftingCheck.consumption`.
   The rename guards on "old key present AND new key absent", so a stale legacy key beside an existing new key is left inert.
2. Strip residual dead `catalysts` arrays.
   `0.6.0` converts catalysts to `toolIds` and deletes the inline arrays everywhere it can reach, so any survivors are inert dead data the engine never reads.
   Stripped sites: recipe-level, step-level, step-ingredient-set, and recipe-ingredient-set `catalysts`; `system.components[].salvage.catalysts`; and the dead `gatheringConfig.systems[*].tasks[*].catalysts`.
   For recipes whose crafting system was missing at `0.6.0` (skipped, never converted) this is a deliberate drop of permanently-dead data.
3. Mutated setting keys are `craftingSystems`, `recipes`, and `gatheringConfig`.
4. A read-time normalizer reads `breakToolsOnFail` then falls back to the legacy `consumeCatalystsOnFail`, so an un-migrated import/export behaves identically before the migration runs.
5. Idempotent: once every consumption block carries `breakToolsOnFail` and no `catalysts` arrays remain, a re-run is a no-op.

## Testing Requirements

- Unit tests for each destructive operation clean-up path.
- Unit tests for idempotent migration behaviour: running a migration twice on the same data produces identical results.
- Unit tests for fatal migration abort: unusable-document failure aborts the pass, no partial data is persisted, and `migrationVersion` remains unchanged.
- Unit tests for rollback behaviour: data after abort equals the last known-good checkpoint.
- Unit tests for GM guidance output: console output includes downgrade recommendation and explicit per-document remediation steps.
- Unit tests for GM prompt defaults: `Keep existing data` is pre-selected/default.
- Unit tests for write-on-change: verify no setting writes occur when data is unchanged.
- Unit tests for pending migration selection: only migrations newer than `migrationVersion` are selected, ordered by ascending semver.
- Unit tests for pre-release mode migration (`mapped -> routedByIngredients`, `tiered -> routedByCheck`; no per-recipe provider seeded) and the one-time `routed -> routedByIngredients`/`routedByCheck` split (majority-provider system mode, ties → `routedByIngredients`, minority reconciliation).
- Unit tests for pre-release recipe-item migration (`linkedRecipeItemUuid` -> `recipeItemDefinitions` + `recipeItemId`).
- Unit tests for unmigratable recipe deletion with cascade cleanup and JSON logging output.
- Unit tests for provider-switch stale-config cleanup.
- Unit tests for the `1.6.0` legacy-provider removal migration: recipe-level, per-step, and alchemy recipe-level `macroOutcome | rollTableOutcome → check` rewrite; `rollTableUuid` drop; gathering-task `resultSelection` stripping; the surfaced-then-stripped recovery-warning payload; and the chained `1.4.0 → 1.6.0` catch-up path.
- Unit tests for the `1.7.0` break-tools-on-fail rename: `consumeCatalystsOnFail → breakToolsOnFail` on crafting and salvage consumption; residual `catalysts` stripping across recipes, component salvage, and gathering tasks; idempotency; both-keys-present left inert; and the normalization read-fallback to the legacy key.
- Unit tests for partial import conflict handling and aggregated conflict reporting.
- Unit tests for alchemy global save blocking when any system collision exists.
- Integration tests for mode changes, recipe deletion, and startup migration.

# Destructive Changes and Migrations

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
3. For each recipe in the system, migrate it to fit the new mode per the migratability matrix in `resolution-modes/spec.md § Mode Invariant` (clear the routed selection, collapse a multi-ingredient-set recipe into alchemy, or carry it verbatim).
   Migrating *into* `alchemy` seeds NO per-recipe provider (retired, issue 554): it clears any `resultSelection` and collapses a multi-INGREDIENT-SET recipe to its first set; the system-level `alchemy.checkMode` is seeded separately (defaults to `none`).
   Migrated recipes are persisted on structural validity alone.
4. Delete a recipe only when a per-recipe *structural* constraint of the target mode cannot be met: narrowing into `simple`/`progressive` from a recipe that is not 1×1, or moving a multi-STEP recipe into `alchemy` (a multi-INGREDIENT-SET recipe is collapsed, not deleted).
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

### Delete a Referenced Category or Tag

Deleting a vocabulary entry that records still reference is a confirmed destructive record rewrite, not a silent orphaning.

1. Require explicit GM confirmation via the Tags & Categories screen's inline confirm strip; an unreferenced entry may be removed without a cascade.
2. Deleting a referenced recipe category reassigns every recipe carrying it to `general` before the category (and its icon) is dropped from the vocabulary.
3. Deleting a referenced component category reassigns every component carrying it to `general` before the category (and its icon) is dropped.
4. Deleting a referenced item tag strips the tag from the `tags` of every component carrying it, and from every recipe tag-placeholder ingredient (`match.type === 'tags'`) that names it, before the tag is dropped from the vocabulary.
   A placeholder emptied by the strip is persisted as an incomplete ingredient rather than left naming the deleted tag.
5. Nothing is left dangling: no recipe or component retains a `category` or tag value that no longer exists in the system vocabulary.

### Disable Multi-step Feature

If disabling `features.multiStepRecipes` for a system with multistep recipes:

1. Require explicit GM confirmation.
2. Existing multistep recipes become invalid and must be deleted unless migrated.
3. Any active runs for deleted recipes must be cleaned up.

### Change Visibility Knowledge Mode

When switching `recipeVisibility.listMode` or `knowledge.mode`:

- Existing learned flags are retained.
- Access behaviour changes immediately according to `recipe-visibility/spec.md`.
- UI must hide controls that are no longer applicable.

### Delete Recipe Item Definition

When deleting a `RecipeItemDefinition` from a crafting system:

- Require explicit GM confirmation.
- Remove the deleted definition's membership entries (its `recipeIds[]`), per the many-to-many recipe↔book membership model in `data-models/spec.md`; the retired `recipe.recipeItemId` reverse ref no longer participates.
- Warn in the recipe editor.
- Learned recipe flags remain stored.
- Access behaviour changes immediately according to `recipe-visibility/spec.md`.

### Recipe Item Source Template Deletion

If a recipe item's linked world/compendium source item is deleted:

- Keep `RecipeItemDefinition.originItemUuid` unchanged.
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
- Each migration receives a five-key `{ recipes, systems, gatheringConfig, environments, gatheringParties }` data payload (built from the `RECIPES`, `CRAFTING_SYSTEMS`, `GATHERING_CONFIG`, `GATHERING_ENVIRONMENTS`, and `GATHERING_PARTIES` settings) and returns the transformed payload **or a subset of its keys**.
- A migration may return a payload containing only the keys it mutates; the runner spread-merges the return over the accumulated payload so untouched keys pass through intact.
This is what makes partial returns (e.g. the 0.1.0 migration returning only `{ recipes, systems }`, or a gathering migration returning only `{ gatheringConfig }`) safe.
- Migrations must be idempotent -- running the same migration twice on the same data must produce identical output.
- Migration metadata SHOULD include a `downgradeTo` (Fabricate module version string) used for GM recovery guidance when migration aborts.

### Startup Migration Flow

**Precondition — primary-GM gate.** The startup migration pass runs only on the client where `game.users.activeGM.id === game.user.id`.
All other clients — including assistant GMs, who also hold `SETTINGS_MODIFY` — skip the pass entirely, because an `isGM` gate would let the full GM and every assistant GM transform-and-write the world-scoped settings concurrently (last-writer-wins), whereas `activeGM` fires on exactly one client.
Two consequences follow: non-primary clients never migrate and rely on read-time legacy fallbacks until the primary GM loads, and a world session with no GM connected migrates nothing.
This precondition is distinct from the primary-GM `autoStampToolSources` ready-body pass described later in this document (that pass is not a `MigrationRunner` entry).

On module initialization (on the primary-GM client):

1. Read `fabricate.migrationVersion` (defaults to `"0.0.0"` if unset).
2. Filter the migration registry for entries where `migration.version > migrationVersion` using numeric semver comparison.
3. Sort pending migrations by ascending semver order.
4. If no pending migrations exist, exit early (no data reads or writes).
5. Read all five current settings: `fabricate.recipes`, `fabricate.craftingSystems`, `fabricate.gatheringConfig`, `fabricate.gatheringEnvironments`, and `fabricate.gatheringParties`.
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
12. Persist each of the five settings only if its serialized value changed against the snapshot (`fabricate.recipes`, `fabricate.craftingSystems`, `fabricate.gatheringConfig`, `fabricate.gatheringEnvironments`, `fabricate.gatheringParties`).
13. Each of the five write-on-change comparisons is independent, so an unchanged setting is never rewritten.
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

- Each of the five migrated settings (`recipes`, `systems`, `gatheringConfig`, `environments`, `gatheringParties`) is persisted only when its own JSON-serialized output differs from that setting's pre-migration snapshot; the comparison is per-setting, not a single all-or-nothing check.
- This avoids unnecessary setting writes that would trigger Foundry change hooks and potential re-renders.
- On successful migration passes, `migrationVersion` is updated to the highest successfully executed migration version even when data is unchanged.
- On aborted migration passes, `migrationVersion` is unchanged.

### Versioning

- Migrations are keyed by module version.
- Version comparison uses numeric semver (major.minor.patch) with zero-padding for missing segments.

### Canonical-Write and Legacy-Read Policy

The migration framework supports the canonical-write / legacy-read compatibility policy defined in `data-models/spec.md § Canonical-Write and Legacy-Read Compatibility Policy`.

- Migrations MUST rewrite legacy field names to their canonical equivalents (e.g., `systemItemId` -> `componentId`, `managedItems` -> `components`).
- Migration output payloads SHOULD be canonical-first and SHOULD remove retired legacy keys where safe.
- Runtime constructors and normalization functions continue to accept legacy aliases as read fallbacks to handle data that has not yet been migrated (e.g., data from external imports, manual JSON edits, or worlds that skipped a migration version).
- Transitional write aliases (dual-emit in `toJSON()`) are temporary compatibility outputs for runtime writers and UI paths.
They are deprecated and must not be introduced for new fields.
- During the transitional window, persisted settings MAY still include documented transitional aliases when written by runtime managers.
This does not invalidate migration correctness.
- Each migration entry in the registry should document which legacy aliases it retires from persisted data.
- Cross-reference: full alias tables are maintained in `data-models/spec.md § Canonical-Write and Legacy-Read Compatibility Policy`.

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

### Alchemy Check-Mode Migration (`1.14.0`, best-effort, per system)

The per-recipe alchemy `resultSelection.provider` is retired for the system-level
`alchemy.checkMode` (`none` | `simple` | `tiered`), issue 554.
Per ALCHEMY system
(`resolutionMode === "alchemy"`, incl. the legacy `cauldron` alias):

1. Reduce over the system's alchemy recipes: `hasCheckProvider` = any recipe with
   `resultSelection.provider === "check"`; `hasTieredShape` = any such `check` recipe
   carrying MORE THAN ONE result group with a non-empty `checkOutcomeIds` (the tiered
   routing shape).
Seed `alchemy.checkMode = hasCheckProvider ? (hasTieredShape ?
   "tiered" : "simple") : "none"`, but only when the system does not already carry a
   valid `checkMode` (idempotency).
2. Strip `resultSelection` from every alchemy recipe.
A former `ingredientSet`-provider
   recipe with a usable `craftingCheck.simple` that maps to `none` intentionally stops
   running that check — `checkMode` is now the sole authority, not data loss.
3. Collapse any multi-INGREDIENT-SET alchemy recipe to its first set (alchemy requires
   exactly one set) with a single `console.warn`.
This is DISTINCT from a multi-STEP
   alchemy recipe, which stays unsupported (delete-on-migrate), not collapsed here.
   Stale `checkOutcomeIds` on a Tiered→Simple/None reduction are left intact (inert,
   preserved for round-trip).
4. Idempotent once no alchemy `resultSelection` remains and each alchemy system has a
   `checkMode` (re-run ⇒ no mutation, no duplicate warn, stable `checkMode`).

### Tools First-Class Migration (`1.15.0`, per system, idempotent)

Issue 561 makes a Tool a first-class registered kind carrying its OWN source references plus a `name` + `img` display snapshot, so tool matching no longer routes through a managed component.
The `1.15.0` settings-data migration (`migrateToolsToFirstClass.js`) reads and writes the `craftingSystems` payload as pure data.

1. For each `system.tools[]` entry that holds a `componentId` but no own source references, copy the referenced component's `registeredItemUuid` / `originItemUuid` / `aliasItemUuids` (reading the pre-`1.16.0` `sourceUuid` / `sourceItemUuid` / `fallbackItemIds` when a not-yet-renamed component is encountered) and its `name` / `img` snapshot onto the tool (`deriveToolSourceFromComponents`), so a world that matched a tool yesterday matches it today.
`componentId` is PRESERVED as a non-load-bearing link for `onBreak.replaceWith` resolution and the UI's linked-component display; the pre-existing user-authored `label` is NEVER written.
2. A tool already carrying its own source references, or one whose `componentId` no longer resolves, is left as-is (the dangling case degrades to presence-by-name / componentId display, exactly as a dangling component reference does today); the migration never throws.
3. The same `deriveToolSourceFromComponents` derivation runs on every `_normalizeSystem` load, so a component-linked tool authored after the migration (for example by dropping a managed component) and a copy-imported tool acquire their source references and snapshot without a re-run.
4. Durable identity is a SEPARATE Item-flag concern.
The migration cannot stamp `flags.fabricate.roles[systemId].toolId` (it has no Item handle), so the one-shot `ready`-body `autoStampToolSources` pass — gated by `TOOL_FLAG_STAMP_VERSION`, primary-GM only, NOT a `MigrationRunner` entry — stamps existing tools' source Items AFTER the migration has persisted the source references it reads.
A bulk-imported tool is not stamped by that one-shot (version-gated to run once per world) and matches by raw source-reference intersection until a manual **Repair Item Data**, identical to imported components.

This migration was authored as `1.14.0` in the change plan and renumbered to `1.15.0` when issue 545's alchemy check-mode migration took the `1.14.0` slot first.

### Source-UUID Field Rename Migration (`1.16.0`, per system, idempotent)

Issue 560 renames the three source-reference fields borne by every registered-entry kind so their names say what they mean.
The `1.16.0` settings-data migration (`migrateRenameSourceUuidFields.js`) reads and writes the `craftingSystems` payload as pure data, with no behaviour change: the identity and matching semantics are frozen, only the field names change.

The rename mapping is `sourceUuid` → `registeredItemUuid`, `sourceItemUuid` → `originItemUuid`, and `fallbackItemIds` → `aliasItemUuids`.

1. For every entry of each of the three stored entry-array kinds — `system.components[]`, `system.recipeItemDefinitions[]`, and `system.tools[]` — map each old key to its new key only when the old key is present and the new key is absent, then delete the old key.
2. Idempotent: after a run no old keys remain, so a second run is a no-op; an entry already carrying only new names is untouched.
3. Both-shape tolerant: an entry with only old names, only new names, or both (the new name wins and the old is dropped) all normalize correctly, and the migration never throws.
4. A world that matched an item before the migration matches it identically after.

The essence definition's own `sourceItemUuid` pointer and the `fabricate.interactable` RegionBehaviour `sourceUuid` DataModel field are DIFFERENT field families outside this migration's scope and are left unchanged.

### Essences → Ingredient Groups Migration (`1.17.0`, per recipe, destructive, irreversible)

Issue 649 supersedes the per-set `IngredientSet.essences` map with first-class essence ingredient options (`match.type === "essence"`).
The `1.17.0` settings-data migration (`migrateEssencesToIngredientGroups.js`) reads and returns the `recipes` payload as pure data via `crypto.randomUUID()` for new ids (`foundry.utils.randomID()` throws under `node --test`, and `crypto.randomUUID` also satisfies the Sonar S2245 no-`Math.random` gate).
It additionally reads the `systems` payload READ-ONLY for each alchemy system's components (the ingredient sets live under the recipes setting; `systems` carries zero ingredient sets).

1. For each recipe, walk recipe-level `ingredientSets[]` AND step-level `steps[].ingredientSets[]` (a step-level `set.essences` would orphan when the back-compat read is later removed).
2. Rewrite each positive `set.essences[essenceId]` entry into a single-option essence group `{ id, name, options: [{ quantity: 1, match: { type: "essence", essenceId, amount } }] }` appended to `ingredientGroups`, then delete `set.essences`.
Because all groups in a set are AND-required, one single-option essence group per essence preserves the old "in addition to" AND semantics exactly.
3. Drop empty / non-positive essence entries (already runtime no-ops) — behaviour-preserving.
4. Idempotent: guarded on a non-empty `essences` map, so a set already lacking it (re-run, or authored post-migration) is untouched.
5. One-way and irreversible: this framework has no reverse-migration mechanism; `downgradeTo` is only GM-guidance printed on abort.
6. `IngredientSet` constructors keep the back-compat READ of `data.essences` for one release; nothing new writes it.

**Post-migration alchemy-collision reconciliation.**
Folding per-set essences into `ingredientGroups` makes them signature-bearing, so a required essence group grows a set's transversal coverage and can silently introduce new alchemy signature collisions.
Because `SignatureValidator.validateSystem` is enabled-scoped and every migrated recipe starts enabled, one pass over the all-enabled migrated set finds every collision; the migration DISABLES both participant recipes of each conflict (mirroring the runtime `disableSignatureConflicts` policy at the data level — it never hard-blocks) so the enabled residual is collision-free and the system loads without a `blocks:'system'` gate.
A post-load GM notification names the disabled recipes.

### Progressive Reorder-Flag Retirement Migration (`1.18.0`, per system, idempotent)

Issue 651 moves the progressive reorder permission off the system's check and onto the entities it describes (`Recipe.allowPlayerResultReorder` and `Component.salvage.allowPlayerResultReorder`, both defaulting to `true`), leaving exactly one owner.
The `1.18.0` settings-data migration (`migrateRetireProgressiveAllowPlayerReorder.js`) reads and writes the `craftingSystems` payload as pure data.

1. For every system, delete `allowPlayerReorder` from all three progressive check blocks that can carry it: `craftingCheck.progressive`, `salvageCraftingCheck.progressive`, and `gatheringCraftingCheck.progressive`.
2. Sibling keys on the same object (`awardMode`, `rollFormula`, `checkBreakage`) are untouched — this is a targeted delete, not a rebuild.
3. Idempotent: the key is deleted, so a second run finds nothing and is a no-op.
4. Tolerant and non-throwing: a malformed system, check, or progressive block is skipped rather than repaired (normalization is the normalizer's responsibility, not this migration's).

This migration is a **defensive strip of stored settings data, not an export fix**.
`_normalizeProgressiveCraftingCheck` is an allowlist literal that never spreads its source; `getSettings()` returns the normalized in-memory map and the exporter reads from that map, so the normalizer already drops the field on read and it can never reach an export.
What the normalizer does not do is rewrite the stored payload, which keeps the dead key until an unrelated save happens to rewrite that system.
The same allowlist shape is a safety property: because the normalizer enumerates its keys rather than spreading them, **importing a legacy payload cannot reintroduce the flag**.

The migration deliberately does **not seed** `allowPlayerResultReorder` onto recipes or salvage configurations.
The `Recipe` constructor and `_normalizeSalvage` both read an absent key as `true`, which is exactly the value a seed would write and exactly the pre-migration implicit behaviour (the retired flag was never honoured at runtime, so the authored order always won).
Seeding would churn stored JSON for zero observable change, so the omission is a decision rather than an oversight.

### Recipe Item Library Migration (Pre-Release)

The pre-release migration path replaces legacy recipe-level `linkedRecipeItemUuid` values with system-owned recipe item definitions.
Recipe↔book membership was subsequently **inverted** by the `1.13.0` migration (`src/migration/migrateInvertRecipeItemLink.js`): membership now lives on `RecipeItemDefinition.recipeIds[]` (a recipe may belong to many books), and the recipe-level reverse ref `recipe.recipeItemId` is retired (see `data-models/spec.md` and `recipe-visibility/spec.md`).
The sections below describe the shipped behaviour, not the retired `recipeItemId`-as-canonical-output model.

1. Group recipes by `craftingSystemId`.
2. For each distinct legacy `linkedRecipeItemUuid` inside one crafting system:
   - create one generated `RecipeItemDefinition`,
   - set `originItemUuid` to the legacy UUID,
   - derive `name`/`img` from the resolved source item when available, otherwise use deterministic fallback metadata.
3. Record membership by pushing the recipe id onto the generated definition's `recipeIds[]`.
The `1.13.0` inversion drops the book-only `recipe.recipeItemId` reverse ref unconditionally.
4. If a legacy UUID is unresolved, the migration derives deterministic fallback metadata for the generated definition and keeps the stale `originItemUuid`; the `1.13.0` inversion does not emit a migration warning for this case.
5. When multiple recipes in one system share the same legacy UUID, they must reuse the same generated `RecipeItemDefinition`.
6. `linkedRecipeItemUuid` is dropped **only** when it was itself the alias that resolved to a book; it is **preserved** when it links a standalone alchemy formula item (never unconditionally removed).

The surviving init-time reconciler `_migrateLegacyRecipeItems` (`src/systems/CraftingSystemManager.js`) reconciles legacy recipe-item links on read.
It matches on the trigger "no valid `recipeItemId` and a non-empty `linkedRecipeItemUuid`", generating or reusing a definition, silently deriving fallback metadata for an unresolved UUID (no migration warning), and — transitionally — still writing the retired reverse ref `recipe.recipeItemId = definition.id`.
Treat that reverse-ref write as a transitional shim, not canonical output.
A post-`1.13.0` **preserved alchemy-formula** `linkedRecipeItemUuid` still satisfies the reconciler's trigger; the current, intended behaviour is that the reconciler may re-process such preserved formula links (they are not exempt from the trigger).

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
- Unit tests for pre-release recipe-item migration and the `1.13.0` inversion (`linkedRecipeItemUuid` -> `recipeItemDefinitions`, membership on `RecipeItemDefinition.recipeIds[]`, retired `recipe.recipeItemId`, preserved standalone alchemy-formula links).
- Unit tests for unmigratable recipe deletion with cascade cleanup and JSON logging output.
- Unit tests for provider-switch stale-config cleanup.
- Unit tests for the `1.6.0` legacy-provider removal migration: recipe-level, per-step, and alchemy recipe-level `macroOutcome | rollTableOutcome → check` rewrite; `rollTableUuid` drop; gathering-task `resultSelection` stripping; the surfaced-then-stripped recovery-warning payload; and the chained `1.4.0 → 1.6.0` catch-up path.
- Unit tests for the `1.7.0` break-tools-on-fail rename: `consumeCatalystsOnFail → breakToolsOnFail` on crafting and salvage consumption; residual `catalysts` stripping across recipes, component salvage, and gathering tasks; idempotency; both-keys-present left inert; and the normalization read-fallback to the legacy key.
- Unit tests for partial import conflict handling and aggregated conflict reporting.
- Unit tests for alchemy global save blocking when any system collision exists.
- Integration tests for mode changes, recipe deletion, and startup migration.

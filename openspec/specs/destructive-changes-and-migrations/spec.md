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
   For performance and reliability, once all recipes have been deleted this clean-up is performed as a single bulk pass per store across the actors the deleting client may write, not a per-recipe sequential clean-up that fans out to one flag write per recipe per actor.
   Batching how the clean-up runs does not narrow which categories it covers.
   The deliberately-orphaned per-actor `discoveryProgress` flag remains out of scope.
3. Remove the system from persisted settings.
4. Emit one summary notification that includes the deleted crafting system name and the number of related entities removed; do not emit one notification per deleted recipe.
5. A failure to delete an individual recipe must not abort the deletion: the remaining recipes are still deleted, the system is still removed from persisted settings, and clean-up still runs.
   Each failed recipe deletion is logged with its recipe id so a GM can locate and manually remove orphaned recipe data, and the summary notification reflects how many recipes could not be auto-deleted.

### Delete Recipe

Deleting a recipe is a confirmed destructive record rewrite across recipe items and characters, not a silent orphaning.
It has both a single-recipe and a SET form, and the two perform the same cascade.

1. Remove recipe from persisted recipes.
2. Remove run records referencing the recipe.
3. Remove learned flags for that recipe from the actors the deleting client may write.
4. Remove recipe-specific UI preference data.
5. Remove the deleted recipe's id from every recipe item definition whose `recipeIds[]` contained it, so no membership entry points at a recipe that no longer exists.
   The basis is explicit rather than inferred: on a system whose `membershipResolvesByRecipeIds` marker is unset, membership resolves through the recipe's own legacy scalar and therefore dies with the recipe, so no definition is rewritten and none is left dangling.
   The prune's WRITE neither sets that monotone marker nor consults it to decide what to rewrite — an unauthored, irreversible basis flip is not an acceptable side effect of a deletion the GM authored for another reason — while the basis-aware figure in clause 6 does read it, which is why clause 5 is a statement about the write and not about the capability.
6. Both forms state their impact before the GM commits, and both report the same arithmetic: how many recipes will be deleted, how many recipe items will no longer contain them, and how many characters will lose the learned knowledge.
   The recipe-item figure counts DISTINCT recipe items — two selected recipes in one recipe item is one recipe item — and it is basis-aware, so it may exceed the number of definitions the write actually rewrites.
   The character figure counts DISTINCT actors resolved through the same writable-actor scope clause 3 cascades over.
   It counts the actors THIS deletion makes forget something; clause 3's clean-up removes every learned entry naming a recipe that no longer exists, so on a world carrying pre-existing orphans it touches a superset of them.
7. Deletion is WARNED, not BLOCKED: no recipe is refused or skipped on account of the recipe items containing it or the characters who have learned it.
8. Every GM-initiated recipe deletion routes through one shared body, so the entry points cannot disagree about what deleting a recipe reaches.
   Two paths are exempt and both are recorded on the leaf delete itself: deleting a whole crafting system, where the recipe items go with the system that holds them, and the compendium importer's orphan-prune phase, where the pack owns the whole definition set it has just written and the phase deliberately batches to a single recipes write.
   An overwrite import that changes a system's resolution mode still cascades, transitively through the resolution-mode migration.
9. A recipe item's `caps.learn.prerequisiteIds` and a teaser's `fragments[].recipeIds` are deliberately NOT pruned: both are authored content an unrelated delete must not silently rewrite, and the Required Knowledge gate fails open on a dangling prerequisite.
   The accepted consequence is recorded rather than discovered later — because that gate SKIPS a dangling prerequisite rather than clearing it, a retained id re-arms if a keep-mode pack reinstall re-mints a recipe under the same id.

### Delete a Referenced Category or Tag

Deleting a vocabulary entry that records still reference is a confirmed destructive record rewrite, not a silent orphaning.

1. Require explicit GM confirmation via the Tags & Categories screen's inline confirm strip; an unreferenced entry may be removed without a cascade.
2. Deleting a referenced recipe category reassigns every recipe carrying it to `general` before the category (and its icon) is dropped from the vocabulary.
3. Deleting a referenced component category reassigns every component carrying it to `general` before the category (and its icon) is dropped.
4. Deleting a referenced item tag strips the tag from the `tags` of every component carrying it, and from every recipe tag-placeholder ingredient (`match.type === 'tags'`) that names it, before the tag is dropped from the vocabulary.
   A placeholder emptied by the strip is persisted as an incomplete ingredient rather than left naming the deleted tag.
5. Nothing is left dangling: no recipe or component retains a `category` or tag value that no longer exists in the system vocabulary.
6. Reassigning every carrying component to `general`, and stripping a deleted tag from every carrying component, each persist as part of the single crafting-systems write that drops the vocabulary entry — never one write per carrying component.

### Delete Essence Definition

Deleting an essence is a confirmed destructive record rewrite across components and recipes, not a silent orphaning.
It has both a single-essence and a SET form, and the two perform the same cascade.

1. Require explicit GM confirmation.
   Deletion is WARNED, not BLOCKED: component usage never refuses a delete, because the cascade strips the essence from every carrying component, so neither the single delete nor a set member is ever excluded or skipped on account of the components carrying it.
   Both forms state their impact before the GM commits: the single delete's confirmation states how many components the essence is removed from and how many recipes are rewritten, and the set delete states, before it is armed, how many essences will be deleted, how many components carry them, and how many recipes will be rewritten.
   Both carrier numbers are counted over DISTINCT carriers, never summed per essence: the cascade rewrites each referencing recipe once for the whole selection and strips every deleted essence from a carrying component in one pass, so a component or recipe naming two selected essences is one carrier, not two.
2. The essence is removed from `essenceDefinitions` and from the derived `essences` id array.
3. Every component still carrying the essence has that quantity stripped, so no component is left naming a deleted essence.
4. Every recipe referencing the essence — through either the legacy per-set essences map or a first-class essence ingredient option, at recipe level or step level — is rewritten to drop it.
   A group left with no options is dropped, and a set left with no ingredient groups, ingredients or essences is dropped.
5. A recipe left with no ingredient sets, or with no results, is clamped to disabled.
6. Each rewritten recipe is re-saved as an INCOMPLETE authoring shell (`allowIncomplete`), because a recipe stripped of its only requirement is deliberately persisted rather than deleted.
7. The rewrites run BEFORE the crafting-system write.
   That ordering is only safe because the disabled-essence blocker is an ACTIVATION-only validation and never a persistence one: a persistence-level blocker would abort the cascade partway through, with the essence definitions and component essence maps already mutated in memory and nothing persisted.
8. The set form issues exactly ONE crafting-systems write and ONE recipes write for the whole operation, computing each recipe's union rewrite once, so a recipe referencing two deleted essences is written once rather than twice.
9. A single summary notification is emitted, never one per rewritten recipe.
10. Alchemy signature uniqueness is reconciled once after the cascade, because stripping essences collapses signatures and can create collisions that did not exist before.
11. No run clean-up applies: a crafting run records component ingredients and a resolved-essence snapshot, neither of which is invalidated by the definition's removal.

### Disable Multi-step Feature

Disabling `features.multiStepRecipes` is a **non-destructive collapse**, not a destructive migration and not an information-hiding gate.
Turning the feature off does not hide multi-step recipes: each multi-step recipe instead **collapses to a single-step presentation** whose behaviour is that of an **atomic chain execution**, while its authored steps are preserved untouched so turning the feature back on restores everything.

When `features.multiStepRecipes` is disabled for a system that has multi-step recipes (recipes carrying more than one explicit step in `steps[]`):

1. Existing multi-step recipes are **retained verbatim** in persisted data.
   No recipe is deleted, migrated, reverted, or rewritten, and no active run, learned flag, or per-user preference is cleaned up.
2. Each such recipe stays **listed and craftable** for every viewer — it is never hidden from the player listing and the crafting guard never rejects it on multi-step grounds.
3. A collapsed recipe executes as an **atomic chain**: one craft action runs the authored steps sequentially, back-to-back, in a single call, with no step-triggering UX and no between-step waiting.
   Each step keeps its own consumption, crafting check, tool, and result-creation behaviour, so the chain reuses the existing per-step machinery.
4. **Time requirements sum into one gate.** When time requirements are enabled, the single atomic action waits behind one gate whose duration is the **sum** of every step's duration; the chain then executes all steps at maturity.
   Per-step gates are not armed individually while collapsed.
5. **Mid-chain failure follows the existing per-step failure policy.** A step that fails mid-chain records its failure per the run model and stops the chain; components consumed by already-completed prior steps stay consumed (no rollback).
6. The run record **may keep per-step detail**, but the Journal renders a collapsed run as a **single-step run** (`multiStep` is `false` in the projection while collapsed); re-enabling the feature restores the multi-step projection from the same untouched record.
7. **GM editing collapses too.** With the feature off, the recipe editor presents the recipe as single-step: step authoring (steps, per-step ingredients and tools) is shown read-only with an "enable multi-step recipes to edit steps" note, and the normal results surface edits the chain's **effective results — the final step's result groups — writing edits through to that final step**.
   The per-step data is never touched, so re-enabling the feature restores the full step editor with all steps intact.
8. **Toggling the feature off is gated by a warning/confirm dialog** when the system has multi-step recipes: the dialog states that existing multi-step recipes will run as one combined action and show only their final results for editing, that their steps are kept and restored on re-enable, and that no recipe data is deleted.
   The toggle persists only on confirm; declining leaves everything untouched.
   Turning the feature **on** needs no dialog.

The collapse behaviour is realized at the engine and editor seams (`CraftingEngine.craft` atomic-chain execution, the recipe editor's final-step results write-through, and the Journal projection), not only at the UI toggle, so every writer that produces a multi-step recipe under a feature-off system — including import, copy, and migration — collapses on the same invariant.

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
   A recipe not yet held by the manager is evaluated as though it were already stored and enabled, so a collision an import would INTRODUCE is caught at import rather than only by the next reconciliation (see `data-models/spec.md` §Alchemy Signature Uniqueness).
   Such a recipe is skipped and reported under its own conflict reason rather than throwing, and the recipes around it still import.
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
- During a Delete Crafting System operation this clean-up runs as one bulk pass across the actors the deleting client may write, not once per deleted recipe; this batches how the clean-up executes without changing its scope.

### Learned Recipes Clean-up

- Remove learned entries for missing recipe IDs, from the actors the running client may write.
- Keep valid learned entries even if the visibility mode changes.
- During a Delete Crafting System operation this clean-up runs as one bulk pass across those actors, not once per deleted recipe; this batches how the clean-up executes without changing its scope.

### Preferences Clean-up

- Remove stale `fabricate.lastManagedCraftingSystem` references.
- Remove stale progressive-order preferences for missing recipes.

### GM Item-Data Repair

- The GM maintenance action is named **Repair Item Data**, and its code, module, localization namespace, and registered menu entry carry that name.
- Its remit is reconciling every projection of a definition's resolved source document — durable identity and derived display snapshots (name, image, description) alike; it is not limited to repairing identity flags.
It resolves each definition's own source reference, including sources in locked compendium packs, and reports description outcomes in a summary bucket distinct from the identity-repair counts.
Descriptions are refreshed for components and recipe-item definitions; tools are excluded, as they carry no description.
- Worlds created before this behaviour carry stored descriptions captured under the previous rules; bringing them forward is the GM's explicit action.
There is no silent load-time rewrite and no automatic migration.
The action's stated purpose and its confirmation prompt must name description refresh so the GM's consent covers it.

## Migration Policy

### Migration State Storage

- `fabricate.migrationVersion` is a world-scoped setting (type: String, default: `"0.0.0"`).
- It stores the semver version string of the last successfully applied migration.
- Registered under the `fabricate` namespace via `SETTING_KEYS.MIGRATION_VERSION`.

### Migration Registry

- Migrations are registered in an ordered array (`MIGRATIONS`), each entry containing: `version` (semver string), `label` (human-readable description), and a `migrate(data)` function.
- Each migration receives a twelve-key `{ recipes, systems, gatheringConfig, environments, gatheringParties, currencyConfig, travelConfig, characterLibraries, componentScope, essenceScope, toolScope, worldScopeRekeyMap }` data payload (built from the `RECIPES`, `CRAFTING_SYSTEMS`, `GATHERING_CONFIG`, `GATHERING_ENVIRONMENTS`, `GATHERING_PARTIES`, `CURRENCY_CONFIG`, `TRAVEL_CONFIG`, `CHARACTER_LIBRARIES`, `COMPONENT_SCOPE`, `ESSENCE_SCOPE`, `TOOL_SCOPE` and `WORLD_SCOPE_REKEY_MAP` settings) and returns the transformed payload **or a subset of its keys**.
- The payload GROWS as world-scope settings are added, and every statement of its size below counts the settings the runner actually threads: `1.26.0` took it from five to six, `1.27.0` from six to seven, `1.28.0` from seven to eight, and `1.30.0` from eight to twelve.
  Threading a key is FOUR edits, not one — the raw read, the snapshot, the `data` literal and the change detection — and omitting any one of them is SILENT.
- A migration may return a payload containing only the keys it mutates; the runner spread-merges the return over the accumulated payload so untouched keys pass through intact.
This is what makes partial returns (e.g. the 0.1.0 migration returning only `{ recipes, systems }`, or a gathering migration returning only `{ gatheringConfig }`) safe.
- Migrations must be idempotent -- running the same migration twice on the same data must produce identical output.
- A migration MUST NOT depend on corpus order.
`data-models/spec.md` § Destructive Pass Safety already declares corpus order non-semantic; this states the consequence for migrations.
A migration MUST derive nothing from record position, and any cross-record reconciliation MUST produce a set-equal result under permutation.
A migration that accumulates references into a list MAY produce a permuted list; that list is a set and no consumer may depend on its order.
- **A migration MAY derive an ordering fact from stored corpus POSITION, but only under three conditions, all three declared.**
  The exception exists because the corpus holds no other age fact: crafting systems carry no timestamp, `randomID()` is not time-ordered, and `createSystem` appends — so array position is the only thing a "which of these came first" rule can be built on.
  The conditions are that the exception is DECLARED IN THAT MIGRATION'S OWN SPEC SECTION, that the migration's output is still SET-EQUAL under permutation apart from that one fact, and that every consequence of the choice is REPORTED BY NAME to the GM.
  `1.30.0` is the first migration to take it: it groups definitions by source item, which is permutation-invariant, and then elects the OLDEST contributing system's identity for the group, reporting every rename with both systems.
- **The writeback order encodes a PER-MIGRATION source/destination DIRECTION, and two migrations may want opposite orderings of the same pair.**
  `0.7.0` treats `gatheringConfig` as the SOURCE and `craftingSystems` as the DESTINATION — it lifts tools off the config and then DELETES the config copy — while `1.30.0` needs the reverse.
  Both run in one pass for a world upgrading from below `0.7.0`, so no single leg order satisfies both, and the shipped order is not reordered: `0.7.0`'s invariant wins because reordering it would destroy a pre-`0.7.0` world's tool library outright.
  A migration whose direction the shipped order contradicts MUST therefore carry its OWN order-independent recovery record rather than reordering the legs.
  `1.30.0`'s is the persisted `fabricate.worldScopeRekeyMap`, written as the FIRST leg of the writeback and holding the old-to-new id pairs, so a re-run can finish the rewrite whichever legs landed.
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
5. Read all eight current settings: `fabricate.recipes`, `fabricate.craftingSystems`, `fabricate.gatheringConfig`, `fabricate.gatheringEnvironments`, `fabricate.gatheringParties`, `fabricate.currencyConfig`, `fabricate.travelConfig`, and `fabricate.characterLibraries`.
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
12. Persist each of the twelve settings only if its serialized value changed against the snapshot (`fabricate.recipes`, `fabricate.craftingSystems`, `fabricate.gatheringConfig`, `fabricate.gatheringEnvironments`, `fabricate.gatheringParties`, `fabricate.currencyConfig`, `fabricate.travelConfig`, `fabricate.characterLibraries`, `fabricate.componentScope`, `fabricate.essenceScope`, `fabricate.toolScope`, `fabricate.worldScopeRekeyMap`).
13. Each of the twelve write-on-change comparisons is independent, so an unchanged setting is never rewritten.
    Every DESTINATION of a world-scope lift is written BEFORE the `craftingSystems` SOURCE it was lifted from, so a tear between the two legs is recoverable rather than destructive; `currencyConfig`, `travelConfig`, `characterLibraries`, `componentScope`, `essenceScope` and `toolScope` are all written ahead of it.

    **`fabricate.worldScopeRekeyMap` is the ONE leg written ahead of `recipes`**, and therefore ahead of every other leg.
    It is the `1.30.0` pass's durable DECISION RECORD rather than a migrated setting, so writing it first is what makes a tear at ANY later leg recoverable — including the `craftingSystems`-then-`gatheringConfig` tear, where `craftingSystems` no longer holds the old ids and a re-derived map would answer EMPTY.
    Writing it ahead of `recipes` is strictly safer than the ordering constraint the recipes-first rule below records, because it touches neither `recipes` nor `systems`, and a rejection there abandons everything under the same deferral disposition.
    It carries its OWN containment: it sits outside both shipped `try` blocks, and an escaping rejection out of the async `ready` callback fires no error hook and no notification, leaves the readiness promise unsettled and the module with no managers.
14. Update `fabricate.migrationVersion` to the highest version among successfully executed migrations.
15. Log a summary of how many migrations ran.

**The recipe writeback is ordered first.**
The 0.6.0 migration writes `toolIds` onto recipes and the tool bodies onto systems, so a systems write issued after a failed recipes write leaves a dangling reference the re-run cannot reconstruct: the source fields have already been consumed.
A tear in the recipes leg MUST therefore abandon the remaining writes rather than continue.
The ordering exists to minimise the set of cross-setting states a tear can produce, not to protect the version: the version bump is unconditionally last in every ordering.

**The corpus read and writeback MUST be error-contained.**
The pass MUST contain a read or write failure, persist nothing further, leave `fabricate.migrationVersion` un-advanced, and report to the GM.
It MUST NOT let the rejection escape the module's readiness callback: the hook dispatcher's error handling is synchronous, so a rejection from an asynchronous callback fires no error hook, shows no notification, and leaves the readiness promise unsettled with no managers constructed.
A write-failure report MUST instruct a reload, because the migrations have already transformed the session's own setting values while nothing was persisted; a read failure MUST NOT, because it refuses before any migration runs.

### Per-Migration Error Handling

- If an individual migration throws an error, log a warning with the migration label and error message: `Fabricate | Migration "<label>" failed: <message>`.
- If the error indicates unusable migrated documents (for example: invalid required fields after transform, unresolved hard references that violate spec invariants, or malformed macro references required for execution), migration is **fatal** for the current startup pass.
- On fatal migration error, the runner must abort immediately and roll back to the last known-good transformed checkpoint in memory.
- The runner must not persist partially migrated data from an aborted pass.
- `migrationVersion` must remain unchanged when a pass aborts.
- Non-fatal warnings may be logged, but they must not mutate persisted data unless the migration pass completes.

### Migration Abort Recovery Guidance

When a migration pass aborts, Fabricate must provide explicit GM guidance:

1. Print a clear console header scoped to the pass that aborted: `Fabricate | Migration aborted. This pass saved nothing: your stored data is exactly as it was before this startup. Reload Foundry to discard this session's partly-migrated copy.`
The assurance states that THIS PASS persisted nothing.
It MUST NOT be phrased as a claim that a failed migration leaves data unchanged — a non-fatal migration error is logged and the pass continues, advancing the version past the failed migration and writing — and MUST NOT be phrased so it reads as an assurance about the multi-setting writeback or a storage conversion, neither of which is all-or-nothing.
It is a claim about STORED data: a setting's value is initialized once and handed back by reference, so an in-place migration transforms the session's own copy and a reload is what discards it.
The assurance and the downgrade advice MUST be changed together and MUST NOT be split across revisions: "your data is unchanged" beside "downgrade to keep using it" reads as "safe to go back", when on a converted world the truth is "intact, and unreadable by the build you are going back to".
2. Print a recommended downgrade action: downgrade to the recorded `downgradeTo` version to keep using the existing data without manual remediation.
It MUST be a complete localized sentence rather than a template with a value interpolated into a GM-facing string, and the console guidance and the GM dialog MUST select it from the same source so the two cannot drift apart.
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
The layout reaches both surfaces from the value the pass already resolved, never from a second read: a re-read at guidance time can report a layout a remote conversion moved mid-pass, and the message must describe the pass that just failed.

### Write-on-Change Persistence

- Each of the eight migrated settings (`recipes`, `systems`, `gatheringConfig`, `environments`, `gatheringParties`, `currencyConfig`, `travelConfig`, `characterLibraries`) is persisted only when its own JSON-serialized output differs from that setting's pre-migration snapshot; the comparison is per-setting, not a single all-or-nothing check.
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
- **Retiring an alias from the WRITE path requires no migration and no registry entry when its READ fallback is retained.**
  Every normalizer in this codebase is an allowlist rebuild, so a key it stops emitting is dropped from a record the next time that record is saved: the persisted shape converges lazily with no pass over the world, and a record never re-saved keeps the alias and keeps being read through the fallback.
  Such a change is not downgrade-lossy either — an older build reads the canonical field it always preferred — so it MUST NOT be declared `downgradeLosesData`, which would put a false loss warning in front of a GM at the Keep/Downgrade prompt.
  The retirement of the Recipe flat `results` alias (issue 1087) is the worked example: no migration, no registry entry, no downgrade loss, and a permanent inbound shim (`data-models/spec.md § Write-Retired Aliases (Read Permanently)`).
- The same holds for a payload that stops emitting a field whose absence its constructor rebuilds to the identical value: absence and the written default already mean the same thing, so there is nothing to migrate and nothing a downgrade can lose.
  The obligation moves to the audit instead — a reader that distinguishes absent from the default is a defect the omission would expose, and it MUST be found before the field is omitted rather than after (`data-models/spec.md` requirement 18).
- **A NEW additive field whose ABSENCE is meaningful requires no migration and no registry entry either, and it inherits the audit obligation rather than the write-side-reduction rule.**
  The write-side-reduction rule above governs a key an earlier build DID write and a later build stops writing.
  A field no build ever wrote has no persisted state to reduce: every normalizer in this codebase is an allowlist rebuild, so a component, recipe or system that authored none simply carries no key, its persisted bytes are unchanged, and an older build reads the same absence it always read.
  Such a field MUST NOT be declared `downgradeLosesData`, and it MUST NOT be given a seeding migration, because seeding would write the key onto every record in the world to express the state that absence already expresses.
  What DOES apply is the audit: where absence and the field's empty or default form are declared to mean the same thing, no reader may distinguish them, and that must be verified per reader before the field ships.
  `Component.complications` (issue 1286) is the worked example — a new top-level array, absent for every component that authored none, an authored empty list normalized to absent, no migration, no registry entry, no downgrade loss, and a per-reader audit that absent and empty are indistinguishable (`data-models/spec.md` § Component requirements 20 and 25).
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

### Modifier Pick Cap Migration (`1.20.0`, `downgradeTo: '1.19.0'`, pure, clone-first, idempotent)

Issue 1055 generalizes the crafting-check combination rule.
`craftingCheck.defaultModifierPolicy` keeps **four** rules (`addAll`/`highest`/`byRecipe`/`playerPicks` — the third renamed `bySubject` by `1.22.0`), each stating both how the eligible values reduce AND who selects them, and the new `craftingCheck.maxModifierPicks` bounds the two SELECTING rules, which both SUM what was picked.
`resolveMaxModifierPicks` reads an ABSENT cap as UNLIMITED.
The `1.20.0` settings-data migration (`src/migration/migrateMaxModifierPicks.js`) reads and returns both the `craftingSystems` and `recipes` payloads as pure, clone-first data — it mutates only its own clones, never the runner's payload, so even a hypothetical throw would leave the pre-migration checkpoint untouched — and throws no `FatalMigrationError`.

1. **Stamp `craftingCheck.maxModifierPicks = 1` onto pre-existing `playerPicks` systems only.** Before this change `playerPicks` meant "the player picks EXACTLY ONE modifier": the roll prompt was a radio group and the non-interactive fallback was `max(...)`.
   Every system already on that rule carries no cap, because the field did not exist when it was authored, so without this stamp the upgrade would silently widen each one from "pick one" to "pick everything" and jump its check-modifier scalar from `max(...)` to the full sum.
   The migration writes back the bound those systems always had, exactly once.
2. **The other three rules are deliberately left absent, i.e. unlimited.** `addAll` and `highest` do not select at all, so a cap means nothing to them and stamping one would only leak a bound into any later switch to a selecting rule.
   `byRecipe` (renamed `bySubject` by `1.22.0`) is the other selecting rule, but its historical behaviour was NOT single-pick: a record already on disk may legitimately have picked several modifiers, and `resolveEligibleModifierIds` TRUNCATES a subject's pick to the cap, so a stamp of `1` here would silently discard picks the GM authored.
   Unlimited is the only value that preserves them, and a GM who wants a bound can set one.
3. **`byRecipe` is NOT mapped or retired BY THIS MIGRATION, at either level — and that was the correct call for this release.** The rule was first-class then and had no activity-independent name — the recipe author selecting at recipe-edit time, the parallel of the player selecting at roll time — so a persisted `byRecipe` was valid data that had to survive untouched.
   **The `1.22.0` *System Check-Modifier Catalogue Migration* below supersedes this deliberately, not by oversight** (issue 1095): once salvage and gathering select over the same catalogue the rule's label stopped being "Recipe picks", so the token is renamed to `bySubject` and `normalizeModifierPolicy` accepts the old spelling as a never-re-emitted READ alias.
   `1.20.0` still leaves it alone: rewriting it here as well would make two gates answer differently about one field, and this one runs first.
4. **The stamp is conditional on purpose.** It fires only where the cap is still unbounded (`resolveMaxModifierPicks` reports `Infinity`), so an authored cap always wins.
   That is what makes the migration idempotent under re-run without relying on the version gate, and the View Lab depends on it directly: the lab boots the real runner over fixtures that seed no `migrationVersion`, so `lastRunVersion` is `0.0.0` and every migration runs on every lab build — an unconditional write would overwrite an authored cap and corrupt the exact frame that case exists to capture.
5. **It does not seed a missing `craftingCheck` block.** At this point in the ladder the library still lives inside `craftingCheck` — `1.22.0` below moves it to `CraftingSystem.checkModifiers` and `1.23.0` merges that into `CraftingSystem.modifiers` — so a system without that block has no library, no modifiers to pick from and no cap to observe; it also cannot be on `playerPicks`, since the rule is persisted in the very block that is missing.
   **The reasoning survives the move unchanged**, and `1.22.0` follows it for salvage and gathering for the same reason: an absent selection normalizes to `addAll` with an empty id set, which is a no-op.
   Precedent: the *Progressive Reorder-Flag Retirement Migration* above makes the same call for the same reason — no storage churn for zero observable change.
6. **The recipe payload is read and returned unchanged, on purpose.** Recipes are the other half of this feature's data, so returning them makes the deliberate no-op explicit rather than leaving a reader to wonder whether they were forgotten; the runner compares each setting's JSON against its pre-pass snapshot before writing, so an unchanged clone persists nothing.
   In particular a recipe's legacy `craftingModifier.policy` is NOT stripped here: the resolver no longer consults it, so it is inert, and leaving it on disk is what keeps the downgrade below lossless.
   `Recipe._normalizeCraftingModifier` drops the key on read, so it disappears the next time that recipe is saved (see `data-models/spec.md` requirement 13a).
7. **Mutated setting key:** `craftingSystems`, and only it.
8. **Lossless downgrade.** `downgradeTo: '1.19.0'` is lossless: `maxModifierPicks` is a key the pre-change build never knew, and its `_normalizeCheckModifierConfig` is an allowlist literal that never spreads its source, so it silently drops the key on read — and that build's `playerPicks` already means "pick one", which is exactly what the dropped cap encoded.
   No other field is touched, so a downgraded world lands on that release's own schema and behaviour with no data loss.

**Mirrored on import.** `migrateExportPayload` applies the identical per-system transform (`applyMaxModifierPicks`, shared with the settings-data migration, not a second implementation of it) to an imported bundle, branch-independently — it runs whether or not the payload's envelope `schemaVersion` needed upcasting, because the cap is a new field on an OLD schema version and its absence is orthogonal to the envelope version.
An export bundle carries exactly one system, so the shared per-system transform is applied directly with no grouping.
It is idempotent for the same reason as the settings-data migration: an authored cap in the bundle always survives the import, and a bundle's `byRecipe` rule is left exactly as authored at both levels by THIS transform (the `1.22.0` upcast, which runs after it, is what rewrites the token).

**A recipe's picks are never destroyed by a cap.** Lowering `maxModifierPicks` below what a recipe already picked leaves that recipe's stored `craftingModifier.modifierIds` exactly where it was — only how many of them the resolver HONOURS changes, `resolveEligibleModifierIds` keeping the first N in authored order.
Raising the cap again re-applies the rest immediately, with nothing to re-enter.
Switching the system away from the subject-selecting rule likewise leaves every recipe's stored pick intact and simply stops consulting it.
The recipe editor's picker truncates its own seed to the cap and refuses an add at the cap, but that is a UI affordance layered on top of the resolver's truncation, never the invariant.

### Check-Modifier Placeholder Retirement Migration (`1.21.0`, `downgradeTo: '1.20.0'`, pure, clone-first, idempotent)

Issue 1094 retires the Fabricate-owned `@craftingmod` roll-formula placeholder.
The resolved check-modifier scalar is now APPENDED to the check roll as one flavoured `+ N[Modifiers]` term, exactly the way `appendToolBonusTerms` appends tool bonuses, so a GM authors no placeholder and cannot forget one.
The `1.21.0` settings-data migration (`src/migration/migrateRetireCraftingModToken.js`) reads and returns the `craftingSystems` payload as pure, clone-first data — it mutates only its own clones, never the runner's payload — and throws no `FatalMigrationError`.

1. **Strip the placeholder from every stored roll formula.** `craftingCheck.{simple,routed,progressive}.rollFormula`, `salvageCraftingCheck.{simple,routed,progressive}.rollFormula` and `gatheringCraftingCheck.{progressive,routed}.rollFormula`, plus the legacy `routed.rollExpression` read alias, which is still consulted as a fallback and would otherwise keep the placeholder reachable.
The token is removed together with its PRECEDING additive operator; a LEADING token is removed ALONE, KEEPING the operator that follows it, because that operator carries the sign of the next term and `Expression` admits a leading `Additive` (`grammar.pegjs:17`, `:89`) — so `<token> - 2` becomes `- 2` and preserves the total the retired substitution produced, where dropping the operator too would silently double the modifier.
The word-boundary match leaves a hypothetical `@craftingmodifier` untouched.
2. **Salvage and gathering are swept DEFENSIVELY.** Neither ever authored the placeholder and neither passes a modifier context to its runner, so stripping changes no total there — but an imported bundle can carry one, a survivor would be stripped by the runtime shim anyway, and leaving it on disk would only mislead a GM reading the field.
3. **A placement that is not TOP-LEVEL ADDITIVE is left UNTOUCHED on disk and REPORTED.**
A placement is **ADDITIVE** — and therefore liftable out of the formula and re-appended as a trailing term — IFF all FOUR hold: it sits at **bracket depth 0**; the run of additive operators immediately before it is **at most one**; that run is **empty only when the placeholder is LEADING**, so the nearest non-whitespace character BEFORE it is **absent or a single `+`/`-`**; and the nearest non-whitespace character AFTER it is **absent or `+`/`-`**.
The predecessor clause is not a restatement of the run-length one and omitting it made this predicate FALSE: `1d20 * @craftingmod` has an EMPTY additive run before the placeholder (`*` is not an additive operator), so a three-clause reading calls it ADDITIVE — two lines from where its dangling residue is named as refused.
An empty run after a preceding term means that term binds the placeholder multiplicatively or opens a group.
**Every other placement is REFUSED**, including an additive placement NESTED inside a parenthetical, a function argument, a pool or a dice count.
The reason is ARITHMETIC, not syntax, and stating it as syntax was wrong: the appended `+ N[Modifiers]` term lands at the END of the WHOLE formula, so lifting the placeholder out is sound only where the two positions are interchangeable.
Some refused residues do fail to parse (a dangling `1d20 *`, an empty `()`), but others parse perfectly and are simply WRONG — `(1d20 + @craftingmod) * 2` strips to `(1d20 ) * 2`, halving a modifier that was being scaled, and `(2 + @craftingmod + 4) * 3` goes from 27 to 21 at a scalar of 3 with no notice at all.
The interior cases are why the test is a depth scan rather than an inspection of the two adjacent characters: an interior placement has `+` on both sides and no adjacent bracket to notice.
The multiplicative, function-argument, dice-count and lone-parenthetical contexts named in earlier drafts are EXAMPLES of this predicate, not the rule itself.
Some of those residues throw in the dice grammar, but **`max(, 2)` does not**: `FunctionTerm`'s head is `Expression?`, so it parses with ZERO argument terms, `Math.max()` yields `-Infinity`, and `Roll#total`'s `Number(this._total) || 0` lets that through — so `Roll.validate` ACCEPTS it and a rule that guessed would hand that world a permanent, silent automatic failure on every craft.
A **structural** residue check runs before any dice engine is consulted, so a residue that ends in a binary operator is refused on this path too; the migration passes no engine, so that check is the only guard on what it writes.
The decision is therefore POSITIONAL and STRUCTURAL, and it is ONE decider — `planRetiredPlaceholderStrip` — shared by the migration, the runtime shim and the Checks Validation tab, so no two of them can disagree about a placement.
It is not the placement classifier alone: `describeRetiredModifierPlaceholder` answers only the first half (is this placement additive), and a formula such as `1d20 - @craftingmod -` or `@craftingmod +` is ADDITIVE by that classifier yet REFUSED by the decider, because its residue would be structurally incomplete.
A surface that asked the classifier where usability was decided by the decider would give the GM the opposite instruction on exactly those formulas.
The shim answers `''` for a refused formula so the usability readers report `noFormula`, and the migration's job is to TELL THE GM rather than to repair.
4. **TWO BEHAVIOUR CHANGES are recorded here as behaviour changes, not no-ops.**
   - **The inert go live.** A system with an authored catalogue whose active check formula never spent the placeholder was INERT — that is exactly why the `noPlaceholder` inert cause and its two notice surfaces existed.
After this migration every such world starts adding those modifiers to every crafting roll.
   - **Sign inversion and multiple-occurrence collapse.** The retired `substituteCraftingModifier` substituted `(${value})`, parenthesised precisely so a negative stayed valid arithmetic, so `1d20 - @craftingmod` rolled `1d20 - (3)`.
The same world now rolls `1d20 + 3[Modifiers]`: −3 becomes +3, a 2×scalar swing in the crafter's favour.
A formula carrying the placeholder twice moves from double-counting to counting once.
5. **The migration counts and tells the GM.** Per system it counts formulas that were inert for want of the placeholder (scoped to the ACTIVE check slot, and gated on the RESOLVED ELIGIBLE SET being non-empty — `resolveEligibleModifierIds`, not merely a non-empty catalogue, because ids absent from the catalogue are dropped and a system whose set already resolves to nothing has had nothing start applying, so counting it would state a change that did not happen and prescribe a remedy already in force), formulas that placed it subtractively, formulas that carried it more than once, and formulas left UNTOUCHED — which is every formula the decider REFUSES, both the non-additive placements and the additive ones whose residue would be structurally incomplete.
Those counts ride a transient `data._retiredCraftingModCounts` field that `MigrationRunner.run()` captures and `delete`s before any settings write — a migration cannot add a summary key by returning it, because the pass loop spread-merges a returned value into the DATA payload — and reach the one-time GM notice channel in `src/main.js`, fired only when a count is non-zero and following the shape of the `0.6.0` catalyst and `0.9.0` realm notices.
The notice's COMPOSITION is not in `src/main.js`: `buildRetiredCraftingModNotice` (in the migration module, beside the counts it reports) owns the totals, the systems list, the clause selection, the join and the severity, and `src/main.js` keeps only the Foundry edge — the GM gate, the localizer, and which notification channel the composed severity selects.
The lift is not cosmetic: `src/main.js` cannot be imported by a unit test, so everything it holds is covered by source-text greps, which can pin a dispatch but not a sum — three semantic mutations to that arithmetic survived a green suite while it lived inline.
`_runMigrations` is gated on `game.users?.activeGM?.id !== game.user?.id`, so the notice is **primary-GM-only**: exactly one client in a multi-GM world posts it, and an assistant GM (who holds `isGM`) never does.
**The remedy is spelled out in the notice text, and it names ONE action:** a GM who authored a catalogue and deliberately never spent the placeholder must CLEAR the Default modifiers set (`defaultModifierIds`) on those systems to preserve the previous total.
An earlier draft also offered "move to a rule whose set resolves to 0", which names no rule that does that — every combination rule reduces the same eligible set, so switching between them cannot zero it — and that clause is gone from both the notice copy and this entry.
6. **It does not seed a missing check block**, the same call the `1.20.0` and Progressive Reorder-Flag migrations make for the same reason: a block that does not exist carries no formula, so there is no storage churn to spend for zero observable change.
7. **Mutated setting key:** `craftingSystems`, and only it.
8. **Idempotent.** A second pass finds no placeholder and changes nothing, including on a formula left untouched for a non-additive placement — which is reported again, because it is still on disk exactly as authored, and rewritten never.
9. **The downgrade is DATA-lossless but BEHAVIOUR-lossy, and this is stated rather than glossed.** A world downgraded to `1.20.0` finds its formulas intact and its catalogue intact — nothing was deleted but a placeholder that release no longer needs — yet that build resolves check modifiers ONLY through the placeholder it now lacks, so they stop contributing to any roll until a GM types it back into each formula by hand.
No previous entry in this registry carries that shape of caveat, and it **must not** be described as "lands on that release's own schema".

**Mirrored on import.** `migrateExportPayload` applies the identical per-system transform (`applyRetireCraftingModToken`, shared with the settings-data migration, not a second implementation of it) to an imported bundle, branch-independently — it runs whether or not the payload's envelope `schemaVersion` needed upcasting, because the placeholder is an OLD field on a CURRENT schema version and its presence is orthogonal to the envelope version.
The per-system counts are discarded there on purpose: the GM notice reports what a WORLD migration changed under the GM's feet, whereas an import is an act the GM just performed against a bundle they chose.

**The runtime shim is the fail-safe, not a second migration.** `stripRetiredModifierPlaceholder` (`src/utils/craftingCheckExpression.js`) removes any placeholder that survives — hand-edited, imported, or seeded by a fixture — at the head of `evaluateCheckRoll` and `resolveCheckFormulaDisplay`, and inside `resolveActiveCraftingCheckFormula` and `resolveSalvageCheck` BEFORE their emptiness test.
Its rule is normative in `resolution-modes/spec.md` §Check Source.

### System Check-Modifier Catalogue Migration (`1.22.0`, `downgradeTo: '1.21.0'`, pure, clone-first, idempotent)

Issue 1095 lifts the check-modifier catalogue out of `craftingCheck` and up to the system, so salvage and gathering can select over the same entries, and renames the `byRecipe` combination rule to its activity-independent name `bySubject`.
The `1.22.0` settings-data migration (`src/migration/migrateSystemCheckModifierCatalogue.js`) reads and returns the `craftingSystems` payload as pure, clone-first data — it mutates only its own clones, never the runner's payload — and throws no `FatalMigrationError`.

1. **It moves an ARRAY-valued `craftingCheck.checkModifiers` to `CraftingSystem.checkModifiers` and deletes the old key.** The old key is deleted rather than aliased, so there is exactly one location and nothing to keep in sync.
   The deletion is **conditional on the legacy value being an `Array`**, and deliberately so: a non-array value there is not a catalogue, so moving it is impossible and deleting it would be a REPAIR — this migration destroying data it has decided it cannot read, on the one code path where the GM has no surviving copy.
   It is left exactly as authored instead, which also keeps the migration's no-throw guarantee resting on one rule ("a malformed system or check is skipped rather than repaired — normalization is the normalizer's job") rather than on an exception to it.
2. **The move is GUARDED.** An authored system-level catalogue always wins and is never clobbered; an array-valued legacy key is still deleted, so a half-migrated system converges rather than carrying two catalogues that could disagree.
   **A skipped non-array legacy value converges too, by a different route:** `_normalizeCraftingCheck` is an allowlist rebuild that no longer emits `checkModifiers` at all, so the residue is dropped the next time that system is saved, and nothing reads it in the meantime.
   Convergence therefore does not depend on this migration deleting it.
   The guard is also what makes the migration idempotent without relying on the version gate, and the View Lab depends on it directly: the lab boots the real runner over fixtures that seed no `migrationVersion`, so every migration runs on every lab build, and `tests/view-lab/world/labContent.js` deliberately GOES ON authoring its catalogue at the OLD location so the lab build IS a live exercise of this transform and its frames render post-migration data.
3. **It rewrites `craftingCheck.defaultModifierPolicy === 'byRecipe'` to `'bySubject'`**, independently of the move — a system may carry the rule with no catalogue at all, and the token must still stop being re-emitted.
   `normalizeModifierPolicy` accepts `byRecipe` as a never-re-emitted READ alias, so a world that somehow misses this migration still behaves correctly; rewriting it here is what stops the alias becoming permanent.
4. **It deliberately seeds NOTHING onto a salvage or gathering check that has no block**, matching the no-storage-churn decisions `migrateMaxModifierPicks` and the *Progressive Reorder-Flag Retirement Migration* already record: an absent selection normalizes to `addAll` with an empty id set, which resolves to a scalar of 0 and appends no term.
5. **The per-system transform is SHARED with the export-payload upcast** (`applySystemCheckModifierCatalogue`), not reimplemented; `migrateExportPayload` applies it branch-independently, and AFTER the `1.21.0` transform, whose inert count reads the catalogue at its pre-move location.
6. **Mutated setting key:** `craftingSystems`, and only it.
7. **The runner's ordering is load-bearing and stated, not assumed.** `_runMigrations()` runs before any manager loads persisted data (`src/main.js`) and is gated to the primary GM.
   `_normalizeCraftingCheck` is an ALLOWLIST REBUILD that no longer emits `checkModifiers`, so had any save run first, the catalogue would have been DELETED rather than relocated — silently, with no error and no recoverable copy.
8. **The downgrade LOSES the catalogue.** `1.21.0`'s `_normalizeCheckModifierConfig` is an allowlist that never saw a system-level `checkModifiers`, so a downgraded world drops it on the first read and every check modifier stops contributing to every roll until a GM re-authors it.
   It is **the first entry in this registry whose downgrade is not lossless**, and the warning is carried in the registry entry's **`label` STRING** — the one string a GM ever reads about this migration, rendered by `migrationRecoveryPrompt` beside the very Downgrade button it is about.
   A source comment would state the same fact to the wrong reader at the wrong moment.
9. **A world upgraded but not yet re-saved has a stated GAP, and it is ACCEPTED rather than closed.** The migration is GM-gated and runs at init, so a PLAYER who loads the world before the primary GM's pass reads a system whose catalogue still sits at `craftingCheck.checkModifiers`; `buildCheckModifierContext` reads only `system.modifiers`, so that client resolves a scalar of `0` and appends no term.
   There is deliberately NO runtime read alias for the old location, and the properties that make that acceptable are stated rather than assumed: the state **cannot be persisted** (a player writes no system settings), it **self-heals** the moment the GM's migration lands and `updateSetting` propagates, and it is **the same shape every earlier RELOCATING migration in this registry has** — none of them carries a read alias either.
   It is deliberately **asymmetric with `1.21.0`**, which DOES carry a runtime backstop (`stripRetiredModifierPlaceholder`), and the asymmetry is the point: an unstripped `@craftingmod` makes a formula fail to roll AT ALL and is reachable from hand-edits, imports and fixtures that no migration ever sees, whereas an unrelocated catalogue only under-applies a bonus and is reachable only in the window before one GM-gated pass.

### Unified Modifier Library Migration (`1.23.0`, `downgradeTo: '1.22.0'`, pure, clone-first, idempotent)

Issue 1117 merges the TWO modifier libraries a crafting system authored into one.
`CraftingSystem.checkModifiers` (put there by `1.22.0`) and `gatheringConfig.systems[systemId].characterModifiers` differed only in which optional fields each consumer honoured, and nothing in the domain distinguished them — "a named actor-driven expression" is one concept — so authoring it twice let a GM define Medicine as two unrelated records that could silently disagree.
The `1.23.0` settings-data migration (`src/migration/migrateUnifyModifierLibraries.js`) reads and returns the `craftingSystems` and `gatheringConfig` payloads as pure, clone-first data — it mutates only its own clones, never the runner's payload — and throws no `FatalMigrationError`.

**It is a NEW forward migration, not an amendment to `1.22.0`.** `1.22.0` is released and may already have run in a GM's world, so rewriting it would leave `migrationVersion` at `1.22.0` with the OLD transform applied and the new one unreachable.

1. **It merges both libraries into `CraftingSystem.modifiers` and deletes BOTH old keys**, in ONE order: check entries first in their authored order, then gathering entries in theirs.
   The check library's order was already meaningful to a rolled check, and appending is the only merge that preserves both source orders.
2. **AN ID AUTHORED IN BOTH LIBRARIES IS RESOLVED DETERMINISTICALLY, never by last-write-wins.**
   The CHECK entry keeps the id; the colliding gathering entry is re-keyed to `<id>-gathering`, then `<id>-gathering-2`, `-3`, … until one is free.
   The rule is **"rename the side whose every reference is in scope"**, which is a fact about the data rather than a preference between the two libraries: the gathering library's ids are referenced only from `tasks[].dropRows[].characterModifiers[]`, `tasks[].staminaCostModifiers[]` and `events[].characterModifiers[]` — all inside the same `gatheringConfig` block this migration is already rewriting, so renaming it is a CLOSED rewrite — while the check library's ids are referenced from `Recipe.craftingModifier.modifierIds` in the separate `recipes` world setting, which this migration never sees.
   The suffix search reads only the set of ids already taken, and entries are visited in their authored array order, so the output is a pure function of the input: re-running on the same world yields the same ids, and two GMs upgrading the same world land in the same place.
3. **EVERY reference to a re-keyed entry is rewritten in the same pass.** A rename with a missed reference site is not a partial success — the row would name an id the library no longer carries, and the gathering runtime reports that as a misconfigured attempt.
4. **The per-system collision COUNT is reported to the GM** through the transient `_unifiedModifierCollisions` field, which the runner captures for the one-time notice and strips before persisting.
   A re-key is a visible rename in the authoring surface, so the GM is told which systems it happened in rather than discovering it.
   A clean merge is silent.
5. **A malformed legacy value is SKIPPED, not deleted**, the same call `1.22.0` makes and for the same reason: deleting a value the migration has decided it cannot read is a REPAIR, on the one code path where the GM has no surviving copy.
   The allowlist rebuilds drop the residue on the next save anyway.
6. **The merge is GUARDED.** An authored `CraftingSystem.modifiers` always wins and is never clobbered; the legacy keys are still retired, so a half-migrated system converges rather than carrying libraries that could disagree.
   That is what makes the migration idempotent without relying on the version gate, and the View Lab depends on it directly: `tests/view-lab/world/labContent.js` deliberately goes on authoring BOTH libraries at their pre-migration locations — including a real id collision — so every lab build is a live exercise of this transform.
7. **It seeds NOTHING onto a system carrying neither library**, matching the no-storage-churn decisions `1.22.0` and `migrateMaxModifierPicks` already record.
8. **The per-system transform is SHARED with the export-payload upcast** (`applyUnifiedModifierLibrary`), not reimplemented; `migrateExportPayload` applies it branch-independently and AFTER `applySystemCheckModifierCatalogue`.
   That order is **observable, not merely symmetrical**: a pre-`1.22.0` bundle carries its catalogue at `craftingCheck.checkModifiers` and this transform reads only the system-level key, so running it first would merge an empty catalogue and then retire it, silently dropping every check modifier in the bundle.
9. **Mutated setting keys:** `craftingSystems` and `gatheringConfig`.
10. **The runner's ordering is load-bearing and stated, not assumed.** `_runMigrations()` runs before any manager loads persisted data (`src/main.js`) and is gated to the primary GM.
    Both `CraftingSystemManager._normalizeModifierLibrary` and the gathering config normalizer are ALLOWLIST REBUILDS that no longer emit the old keys, so had any save run first, BOTH libraries would have been DELETED rather than merged — silently, with no error and no recoverable copy.
11. **The downgrade LOSES BOTH libraries**, and is declared `downgradeLosesData: true` with the loss named in the registry entry's **`label` STRING** — the one string a GM ever reads about this migration, rendered by `migrationRecoveryPrompt` beside the very Downgrade button it is about.
    `1.22.0`'s normalizers are allowlists that never saw `CraftingSystem.modifiers`, so a downgraded world drops the merged library on the first read: every check modifier stops contributing to every roll AND every gathering drop row, event and stamina cost loses the entry it references.
    That is strictly more loss than `1.22.0`'s own lossy downgrade, which is why it is declared and named again rather than inherited.
12. **The pre-save window is the same ACCEPTED gap `1.22.0` records**, with the same properties: a player loading the world before the primary GM's pass reads a system whose libraries still sit at their old keys, resolves a check-modifier scalar of `0`, and reports a gathering drop-row reference as missing; the state cannot be persisted by a player, self-heals when the GM's pass lands, and carries no runtime read alias for exactly the reasons `1.22.0` states.

### Failure-Result Policy Seed Migration (`1.25.0`, `downgradeTo: '1.24.0'`, pure, clone-first, idempotent)

Issue 1098 gives every activity check a `failureResultPolicy` whose normalize-on-read default is `perRecord` — a value that PERMITS a failed check to produce an authored failure result.
The `1.25.0` settings-data migration (`src/migration/migrateSeedFailureResultPolicy.js`) writes `failureResultPolicy: 'never'` onto every `craftingCheck`, `salvageCraftingCheck` and `gatheringCraftingCheck` block that already exists on disk.

1. **Its entire purpose is that NO UPGRADED WORLD CHANGES BEHAVIOUR**, and the hazard is concrete rather than theoretical.
   A salvage component may legally persist a reserved `role: 'failure'` result group carrying results — `_normalizeSalvage` tolerates one whenever the Simple salvage check has an authored roll formula — and until this issue it awarded **nothing**, in every world, always.
   Without the seed, the upgrade would silently turn it on and every failed salvage would start handing out loot the GM authored for a capability that did not exist.
   Only NEWLY-CREATED systems get the `perRecord` default; the GM opts in deliberately, per activity, per system.
2. **It seeds NOTHING onto a check block that does not exist**, matching the no-storage-churn decisions `migrateMaxModifierPicks`, `migrateRetireProgressiveAllowPlayerReorder` and the `1.22.0` catalogue migration already record.
   An absent block has no authored failure output to award and no surface to observe the policy on; it picks up the read-time default the first time the GM authors that check, which is a system they are creating rather than one they are upgrading.
3. **An already-present value always wins**, and the guard is key PRESENCE rather than validity: deciding the absent case is this migration's only job, so a value this build would normalize away is still not overwritten.
   That is what makes it idempotent without relying on the version gate, and the View Lab depends on it directly — it boots the real runner over its fixtures with no `migrationVersion`, so every migration runs on every lab build.
4. **The per-system transform is SHARED with the export-payload upcast** (`applySeededFailureResultPolicy`), applied branch-independently, so an imported bundle lands exactly where a migrated world does — and a bundle written by a post-1098 build already carries an authored policy, which the guard above is what stops a round trip from resetting.
5. **It reports nothing and therefore adds no key to the runner's three return literals.** Unlike `1.21.0` it needs no GM notice, because its entire observable effect is that nothing observable changes.
6. **Mutated setting key:** `craftingSystems`, and only it.
7. **The runner's before-any-load ordering is load-bearing**, as it is for `1.22.0` and `1.23.0`: all three check normalizers are ALLOWLIST REBUILDS, so a save running first would emit the `perRecord` default onto every check — and this migration would then correctly decline to overwrite it, permanently locking in the very behaviour change it exists to prevent.
8. **The downgrade is CLEAN, and is deliberately NOT declared `downgradeLosesData`.**
   `1.24.0`'s normalizers do not emit `failureResultPolicy`, so the key is dropped on the next save — and since that release has no failure-result capability at all, nothing changes behaviourally.
   It is the first entry since `1.21.0` of which that is true, and the rule `1.22.0` established is about naming a REAL loss in the label rather than about every entry claiming one.

### Currency World-Scope Migration (`1.26.0`, `downgradeTo: '1.25.0'`, pure, non-mutating, idempotent)

Issue 1278 moves the whole currency configuration — the coin ladder, the spend strategy, the selected provider and the GM macro set — off every crafting system's `requirements.currency` block and into the `currencyConfig` WORLD setting, leaving each system only `requirements.currency.enabled`.
The `1.26.0` settings-data migration (`src/migration/migrateCurrencyToWorldScope.js`) reads the `craftingSystems` and `currencyConfig` payloads and returns both; it mutates neither input, and it throws no `FatalMigrationError` — every level is guarded, and a malformed system, requirements block or unit is SKIPPED rather than repaired, because repair is the normalizer's job.

1. **Without it, every upgraded world silently loses its currency**, which is why it is not optional cleanup.
   The reader (`getCurrencyRequirementConfig`) no longer looks at the system block at all, so an unmigrated world would present an empty ladder and every authored currency cost would stop resolving.
2. **Units are UNION-MERGED across every system, keyed by unit `id`, first system wins a collision.**
   The union is not arbitrary: recipe currency options (`match.unit`) and salvage currency requirements store unit **ids**, so a dropped unit orphans every reference to it and taking the union preserves the most references.
   Keying by `id` rather than by label is what makes the merge reference-preserving at all.
   On an id collision the earlier system's definition wins, because choosing either is arbitrary and "first" is at least deterministic and order-stable across re-runs.
3. **The scalars cannot be unioned, so they are ADOPTED from the first system that had currency ENABLED.**
   A system with currency switched off never configured `spendStrategy` / `providerId` / `macros` deliberately, so preferring an enabled system's choice is the one signal available.
   If no system has currency enabled, the first system carrying any currency block supplies them, so a world where every system is switched off still keeps the strategy its GM configured rather than reverting to `actorProperty`; failing that, the normalizer's defaults apply.
   The legacy `provider` / `systemAdapter` / `inventoryMode` inputs are carried across verbatim rather than resolved here, because the shared normalizer (`normalizeWorldCurrencyConfig`) already knows how to map them forward.
4. **It is genuinely lossy when two systems disagree, and the label says so.**
   Only one strategy, provider and macro set survives, so the registry entry's **`label` STRING** — the one string a GM ever reads about this migration — names that outcome and tells them to check World > Currency afterwards.
5. **Every system's block is rewritten to `{ enabled }`, with no guard of its own.**
   That leg needs none, because it is already idempotent: a system reduced to `{ enabled }` has nothing left to strip, and the transform returns such a system BY REFERENCE rather than rebuilding an equal copy, so the runner's per-setting change detection stays honest.
6. **The world-config leg IS guarded, and the guard is load-bearing.**
   Once the world ladder carries units it is authoritative and is never re-merged, because a second pass must not re-impose stale system blocks over a ladder the GM has since edited — they may have deliberately deleted a unit.
7. **It seeds NOTHING onto a world that never used currency**, matching the no-storage-churn decisions `migrateMaxModifierPicks`, `1.22.0` and `1.25.0` already record.
   When there was nothing to lift the migration returns the ORIGINAL stored object rather than a freshly-built `{ units: [] }`, because the runner detects change by JSON comparison and emitting the latter over a stored `{}` would register as a change and write the setting in every world that has never used currency — churn showing up as an unexplained write in an otherwise no-op upgrade.
8. **The runner's before-any-load ordering is load-bearing**, and more sharply here than for `1.22.0`, `1.23.0` or `1.25.0`.
   `CraftingSystemManager._normalizeCurrencyConfig` is now an ALLOWLIST REBUILD emitting `{ enabled }` and nothing else, so had any system save run before the pass, the ladder, strategy, provider and macros would have been DELETED rather than lifted — silently, with no error and no recoverable copy.
9. **The transforms are SHARED with the export-payload upcast** (`buildWorldCurrencyConfig` and `stripSystemCurrencyConfig`), not reimplemented; `migrateExportPayload` applies them branch-independently.
   An export carries one system, so the union degenerates there to that system's own ladder — but it is the same function, so a world upgrade and an imported bundle cannot drift on how a unit is carried across.
10. **Mutated setting keys:** `currencyConfig` (created) and `craftingSystems` (shrunk).
    This is the migration that took the runner's payload from five settings to six; `currencyConfig` is read, snapshotted, passed, change-detected and written back exactly like the five that preceded it.
11. **The `currencyConfig` writeback MUST precede the `craftingSystems` writeback**, and the ordering is load-bearing in the same way requirement 8's is.
    Systems are the SOURCE of the lift and `currencyConfig` is the DESTINATION, and the writeback legs share one `try` whose `catch` abandons every leg after the one that rejected.
    Write the source first and a tear between the two destroys the configuration irrecoverably: `migrationVersion` stays behind, the re-run finds systems already reduced to `{ enabled }`, `buildWorldCurrencyConfig` lifts nothing, and requirement 7's no-churn guard correctly declines to write — so the ladder, strategy, provider and macros are gone with no error and no recoverable copy.
    Writing the destination first makes the identical tear fully recoverable, because the re-run finds a populated world ladder, requirement 6's guard keeps it, and the shrink it re-applies is idempotent by construction.
12. **The downgrade is NOT lossless**, and is declared `downgradeLosesData: true` with the loss named in the `label` string beside the very Downgrade button it is about.
    `1.25.0` reads currency only from the crafting system, so a downgraded world would find no configuration at all and every authored currency cost would stop resolving until the GM re-authored it per system.
    A GM who downgrades, re-authors per system, and then upgrades AGAIN does not get a second lift: `migrationVersion` is already `1.26.0`, so the pass does not re-run, and `CraftingSystemManager._normalizeCurrencyConfig`'s allowlist rebuild discards the re-authored ladder on that system's next save.
    The re-upgrade path is therefore re-authoring at World > Currency, not re-authoring per system.

### Travel World-Scope Migration (`1.27.0`, `downgradeTo: '1.26.0'`, pure, non-mutating, idempotent)

Issue 1282 moves the whole travel configuration — the realm library, the reveal mode, the modifier visibility and the Foundry Scene Region links nested inside each realm as `sceneMappings[]` — off every crafting system and into the `travelConfig` WORLD setting, leaving each system only `gatheringRealmSettings.enabled`.
It also collapses each party's per-system realm override into one.
The `1.27.0` settings-data migration (`src/migration/migrateTravelToWorldScope.js`) reads the `craftingSystems`, `gatheringParties` and `travelConfig` payloads and returns all three; it mutates none of them, and it throws no `FatalMigrationError` — every level is guarded, and a malformed system, party or realm is SKIPPED rather than repaired, because repair is the normalizer's job.

1. **Without it, every upgraded world silently loses its realms**, which is why it is not optional cleanup.
   No reader looks at the system block any more, so an unmigrated world would present an empty library, every environment's realm gating would stop resolving, and every Scene Region link would be gone.
2. **Realms are UNION-MERGED across every system, keyed by realm `id`, first system wins a collision.**
   The union is not arbitrary: environments (`includedRealmIds` / `excludedRealmIds`), party overrides and actor discovery flags all store realm **ids**, so a dropped realm orphans every reference to it and taking the union preserves the most references.
   Keying by `id` rather than by name is what makes the merge reference-preserving at all, and is why two systems that both authored "Northreach Vale" keep both records rather than being silently fused.
3. **A collision is REPORTED, never re-keyed.**
   Ids are `randomID()`, so a collision can only arise from a hand edit or a copy-import that skipped id rebinding — but re-keying the loser would orphan every reference to it, which is the precise harm requirement 2 exists to prevent, so the first wins and the discarded copy is reported.
4. **The scalars cannot be unioned, so they are ADOPTED from the first system that had travel ENABLED.**
   A system with the toggle off never configured `revealMode` / `modifierVisibility` deliberately, so preferring an enabled system's choice is the one signal available.
   If no system has travel enabled, the first system carrying any settings block supplies them, so a world where every system is switched off still keeps the reveal mode its GM configured rather than silently reverting to `manual` — which would start hiding realm names from players with no error anywhere.
5. **Parties collapse to ONE override, keeping the entry with the highest `updatedAt`.**
   A party is one set of tokens standing in one place, so a per-system map modelled it as being in several places at once.
   Unlike `1.26.0`, which had to settle for "first wins because picking either is arbitrary", there is a real signal here: the most recent entry is the GM's latest statement of where the party is.
   A `mode: "none"` entry records that the GM CLEARED the override for one system, which is not a statement about where the party is, so a real manual placement outranks a cleared one however recently it was cleared.
6. **Environments are deliberately untouched.**
   Under first-wins every realm id survives, so `includedRealmIds` / `excludedRealmIds` need no rewrite and adding one would be pure churn.
   One consequence is worth naming: an environment citing a realm that belonged to a DIFFERENT system was previously invalid-but-inert, because validation ran only at save boundaries and only against the owning system.
   It becomes valid and live, so it starts gating.
   That is reachable only by hand edit or copy-import, but it is a real behaviour change on upgrade.
7. **Every system's block is rewritten to `{ enabled }`, with no guard of its own.**
   That leg needs none, because it is already idempotent: a system reduced to `{ enabled }` has nothing left to strip, and the transform returns such a system BY REFERENCE rather than rebuilding an equal copy, so the runner's per-setting change detection stays honest.
   The legacy pre-`1.1.0` `gatheringRegions` and `gatheringRegionSettings` keys are dropped by the same leg, so they cannot resurrect the library.
8. **The world-config leg IS guarded, and the guard is load-bearing.**
   Once the world library carries realms it is authoritative and is never re-merged, because a second pass must not re-impose stale system blocks over a library the GM has since edited — they may have deliberately deleted a realm.
   This is reachable in normal use: a legacy export re-imported over an already-migrated world resets the systems, because the import path does not re-run migrations inline.
9. **It seeds NOTHING onto a world that never used travel**, matching the no-storage-churn decisions `migrateMaxModifierPicks`, `1.22.0`, `1.25.0` and `1.26.0` already record.
   When there was nothing to lift the migration returns the ORIGINAL stored object rather than a freshly-built `{ realms: [] }`, because the runner detects change by JSON comparison and emitting the latter over a stored `{}` would register as a change and write the setting in every world that has never used travel.
10. **The runner's before-any-load ordering is load-bearing**, in the same way requirement 8 of `1.26.0` is, and with more to lose.
    `CraftingSystemManager._normalizeSystem` is an ALLOWLIST REBUILD that no longer emits `gatheringRealms` at all, so had any system save run before the pass, the whole library AND every `sceneMappings` entry would have been DELETED rather than lifted — silently, with no error and no recoverable copy.
    This is also why the change lands as one atomic commit: the normalizer change and the migration cannot be separated by even one release.
11. **The transforms are SHARED with the export-payload upcast** (`buildWorldTravelConfig` and `stripSystemTravelConfig`), not reimplemented; `migrateExportPayload` applies them branch-independently.
    An export carries one system, so the union degenerates there to that system's own library — but it is the same function, so a world upgrade and an imported bundle cannot drift on how a realm is carried across.
12. **The actor discovery flag CANNOT be migrated here, and the reason is structural rather than a choice.**
    The runner reaches two corpora and four world settings and has no actor access at all, so `flags.fabricate.discoveredGatheringRealms` is re-keyed LAZILY on read instead.
    That is the same mechanism the `1.1.0` region-to-realm rename used, and it is specified in `data-models` (*Discovered Gathering Realms Flag*).
13. **Mutated setting keys:** `travelConfig` (created), `craftingSystems` (shrunk) and `gatheringParties` (overrides collapsed).
    This is the migration that took the runner's payload from six settings to seven; `travelConfig` is read, snapshotted, passed, change-detected and written back exactly like the six that preceded it.
14. **The `travelConfig` writeback MUST precede the `craftingSystems` writeback**, and the ordering is load-bearing in the same way requirement 11 of `1.26.0` is.
    Systems are the SOURCE of the lift and `travelConfig` is the DESTINATION, and the writeback legs share one `try` whose `catch` abandons every leg after the one that rejected.
    Write the source first and a tear between the two destroys the configuration irrecoverably: `migrationVersion` stays behind, the re-run finds systems already reduced to `{ enabled }`, `buildWorldTravelConfig` lifts nothing, and requirement 9's no-churn guard correctly declines to write — so the library and every Scene Region link are gone with no error and no recoverable copy.
    Writing the destination first makes the identical tear fully recoverable, because the re-run finds a populated world library, requirement 8's guard keeps it, and the shrink it re-applies is idempotent by construction.
15. **Each of those four legs is mutation-checked** — suppressing the payload read, the writeback, the writeback ORDER, or requirement 8's idempotence guard must each turn a test red.
    A silent leg is the failure mode that destroys worlds, and it is not detectable by a green suite that never exercised the leg at all.
16. **The downgrade is NOT lossless**, and is declared `downgradeLosesData: true` with the loss named in the `label` string beside the very Downgrade button it is about.
    `1.26.0` reads realms only from the crafting system, so a downgraded world would find no library at all, every environment's realm gating would stop resolving, and every Scene Region link would need re-authoring per system.
    A GM who downgrades, re-authors per system, and then upgrades AGAIN does not get a second lift: `migrationVersion` is already `1.27.0`, so the pass does not re-run, and the allowlist rebuild discards the re-authored library on that system's next save.
    The re-upgrade path is therefore re-authoring at World > Travel, not re-authoring per system.

### Character Libraries World-Scope Migration (`1.28.0`, `downgradeTo: '1.27.0'`, pure, non-mutating, idempotent)

Issue 1308 moves BOTH character libraries — the character-prerequisite library (`characterPrerequisites`) and the modifier library (`modifiers`) — off every crafting system and into the `characterLibraries` WORLD setting.
Unlike `1.26.0` and `1.27.0`, NOTHING stays on the crafting system: there is no participation flag, because an unreferenced entry already costs nothing and there is no meaningful "off" state to model.
The `1.28.0` settings-data migration (`src/migration/migrateCharacterLibrariesToWorldScope.js`) reads the `craftingSystems` and `characterLibraries` payloads and returns both; it mutates neither input, and it throws no `FatalMigrationError` — every level is guarded, and a malformed system or entry is SKIPPED rather than repaired, because repair is the normalizer's job.

1. **Without it the move is incomplete rather than broken, which is what distinguishes this pass from `1.26.0` and `1.27.0`.**
   The runtime readers resolve the UNION of the world library and a system's own surviving legacy copy (`data-models` -> CharacterLibraries requirement 9), so an unmigrated world still resolves every reference.
   What it does NOT have is one library: the GM would be editing a world pool no crafting system had contributed to, so the migration is what actually completes the move.
2. **Entries are UNION-MERGED across every system, keyed by entry `id`, first system wins a collision — and the union is PER LIBRARY, never across both.**
   Books and scrolls, tool requirement gates, complications, recipes, components, gathering tasks, drop rows, events and stamina costs all store ids, so a dropped entry orphans every reference to it and taking the union preserves the most references.
   Keying by `id` rather than by label is what makes the merge reference-preserving at all.
3. **COLLISIONS ARE THE NORMAL CASE HERE, and that changes what the harm IS.**
   Preset ids are stable semantic slugs on both libraries — `smithsTools`, `proficientArcana`, `expertCrafter`; `strength`, `perception`, `survival` — and presets are explicitly editable once seeded, so a GM who seeded presets into two systems collides on every seeded entry.
   Elsewhere a bad merge orphans a reference, which is visible; here the reference still RESOLVES, to a different rule.
   If system B edited its `smithsTools` to require rank 2 and system A's copy wins, system B's books silently start gating at the easier threshold, with no error and nothing on screen to notice.
4. **A collision is REPORTED, never re-keyed, and only a CONTENT-DIFFERING collision is reported.**
   Re-keying the loser would orphan every reference to it, which is the precise harm requirement 2 exists to prevent.
   Two systems seeded from the same preset bundle collide on every entry while agreeing exactly about what each one means, and reporting those would bury the one collision that changed a rule under dozens that changed nothing.
   Sameness is judged on the NORMALIZED entry, through each library's own normalizer, so a difference in key order or in an absent-versus-undefined bound is not mistaken for a disagreement.
   The report rides the payload as a transient `_characterLibraryCollisions` key, is normalized to a fixed `{ library, entryId, keptFrom, discardedFrom }` shape by the runner, and is STRIPPED before persistence so the diagnostic never reaches the setting.
5. **The idempotence guard is a TWO-LIST DISJUNCTION, and so is the lifted-anything predicate.**
   Either populated library proves the lift already ran, so a world whose GM authored only modifiers is not re-merged on every boot and a second pass never re-imposes stale system blocks over a library the GM has since edited — they may have deliberately deleted an entry.
   Symmetrically, the pass returns the ORIGINAL stored object when there was nothing to lift, because a freshly-built `{ characterPrerequisites: [], modifiers: [] }` over a stored `{}` registers as a change under the runner's JSON comparison and would write the setting in every world on upgrade, matching the no-storage-churn decisions `1.22.0`, `1.25.0`, `1.26.0` and `1.27.0` already record.
6. **Every system's copy is stripped unconditionally, and an ALREADY-STRIPPED system is returned BY REFERENCE.**
   The strip needs no guard of its own because it is already idempotent, but the reference identity is load-bearing: the runner detects change by JSON comparison over the whole corpus, so rebuilding every system into an equal copy would report the crafting systems as changed in every upgraded world and rewrite the entire corpus for nothing.
7. **The runner's before-any-load ordering is load-bearing**, in the same way requirement 8 of `1.26.0` and requirement 10 of `1.27.0` are.
   `_normalizeSystem` is an ALLOWLIST REBUILD that no longer emits either key, so a system save running before the pass would DELETE both libraries rather than lift them.
   This is why the normalizer change and the migration cannot be separated by even one release.
8. **The transforms are SHARED with the export-payload upcast** (`buildWorldCharacterLibraries` and `stripSystemCharacterLibraries`), not reimplemented; `migrateExportPayload` applies them branch-independently.
   An export carries one system, so the union across systems degenerates there to that system's own libraries — but it is the same function, so a world upgrade and an imported bundle cannot drift on how an entry is carried across.
   One system cannot collide with itself, so the export path discards the diagnostic rather than persisting it into an envelope no reader would consult.
9. **Mutated setting keys:** `characterLibraries` (created) and `craftingSystems` (shrunk).
   This is the migration that took the runner's payload from seven settings to eight; `characterLibraries` is read, snapshotted, passed, change-detected and written back exactly like the seven that preceded it, and omitting any one of those four threading points is silent — omit the read and the idempotence guard never sees the GM's edits, omit the snapshot and the setting is written on every boot.
10. **The `characterLibraries` writeback MUST precede the `craftingSystems` writeback**, and the ordering is load-bearing in the same way requirement 11 of `1.26.0` and requirement 14 of `1.27.0` are.
    Systems are the SOURCE of the lift and `characterLibraries` is the DESTINATION, and the writeback legs share one `try` whose `catch` abandons every leg after the one that rejected.
    Write the source first and a tear between the two destroys both libraries irrecoverably: `migrationVersion` stays behind, the re-run finds systems already stripped, the build lifts nothing, and requirement 5's no-churn guard correctly declines to write — so every prerequisite and every modifier in the world is gone with no error and no recoverable copy.
    Writing the destination first makes the identical tear fully recoverable, because the re-run finds a populated world library, requirement 5's guard keeps it, and the strip it re-applies is idempotent by construction.
11. **The pass is NOT what protects an unmigrated client**, and reading it as such is the mistake this requirement exists to foreclose.
    Migrations are primary-GM-gated, and a pass may DEFER or a preceding pass may ABORT while startup continues normally, so a player, an assistant GM holding `SETTINGS_MODIFY`, or the primary GM on a deferred pass all boot against an unmigrated setting.
    What protects them is the Valid Id Basis on the read and prune paths (`data-models` -> CharacterLibraries requirements 4 and 9), which is derived from the CORPUS and never from `migrationVersion` — gating on the migration version is forbidden outright by ### Valid Id Basis.
12. **The downgrade is NOT lossless**, and is declared `downgradeLosesData: true` with the loss named in the `label` string beside the very Downgrade button it is about.
    `1.27.0` reads both libraries only from the crafting system, so a downgraded world would find neither: every learning gate and every tool requirement would stop resolving, and every check modifier would contribute nothing until the GM re-authored them per system.
    A GM who downgrades, re-authors per system, and then upgrades AGAIN does not get a second lift: `migrationVersion` is already `1.28.0`, so the pass does not re-run, and the allowlist rebuild discards the re-authored libraries on that system's next save.
13. **The `label` string is the one string a GM ever reads about this migration**, so it names the collision outcome, tells them to check the two library editors afterwards, and says what the downgrade costs.

### Manual Composition Force-List Fold (`1.29.0`, `downgradeTo: '1.28.0'`, pure, copy-on-write, idempotent)

Issue 1315 gives every gathering environment ONE list that decides what it composes: force add becomes an override of AUTOMATIC mode's biome-and-danger filter — the only mode that has a filter to override — and MANUAL mode composes exactly the records the GM picked in `enabled*Ids`, matching or not (*gathering-and-harvesting* §12a, §12b).
Both halves of that rule move records, so the `1.29.0` settings-data migration (`src/migration/migrateManualCompositionForces.js`) exists to make sure none are lost: it reads the `environments` payload, folds and clears, and returns it.
It mutates no input, throws no `FatalMigrationError`, and skips a malformed environment rather than repairing it, because repair is the normalizer's job.

1. **The FOLD applies to `compositionMode === 'manual'` environments only.**
   Every id in `forcedTaskIds` is appended to `enabledTaskIds` and every id in `forcedEventIds` to `enabledEventIds`, de-duplicated by normalized id, existing entries left byte-identical and in place and new ids appended in the order the force list held them.
   `taskOrder` and `eventOrder` are DISPLAY order and are untouched, so composed order does not move.
   Without the fold those records would simply stop composing: force add RENDERED in manual mode until this change — that is the defect 1315 reports — so a real world holds manual environments whose entire composed set lives in a force list.
2. **The CLEAR applies to EVERY environment, manual and automatic alike.**
   Force add has never rendered in automatic mode in any released version (`09d8e5f1`, the environment editor's first commit, already gated those branches on the mode their own enclosing section excludes) and `setEnvironmentCompositionMode` clears nothing when a GM flips a mode, so an automatic force entry is residue from a manual editing session or from an imported bundle.
   It composed nothing before this migration and it must compose nothing after it, which is the ONLY thing keeping `docs/gathering/environments.md`'s documented guarantee true: switching from manual to automatic does not silently make force-added non-matching records available.
   Activating those entries instead would have been the reverse of a repair — it would make every world that ever edited an environment in manual mode gain composed records at upgrade, silently.
3. **NO ENVIRONMENT LOSES OR GAINS A COMPOSED RECORD**, which is the property the whole pass is shaped around and the one an acceptance test states directly.
   A manual environment composes the union of its prior picked and forced lists, which is what it composed before; an automatic environment composes what its filter and `disabled*Ids` already gave it; and a record disabled in the library never composed and still does not, because the library-enabled gate precedes both modes.
4. **The mode predicate is STRICT `=== 'manual'`**, matching `resolveGatheringCompositionMode` and the store's own gate.
   An absent, `undefined`, wrong-case (`'Manual'`, `'MANUAL'`) or garbage (`42`, `{}`) mode is automatic everywhere else in the module, so reading any of them as manual here would fold force entries into a list automatic mode ignores — a silent loss dressed as a rescue.
5. **A cleared list is a DELETED KEY, not `[]`.**
   `GatheringEnvironmentStore._normalizeEnvironment` emits `forced*Ids` only when it is non-empty, so absence is the shape the world's own next save produces; writing `[]` would invent a shape this module never writes for itself, and — because the runner detects change by `JSON.stringify` — would rewrite the whole environment list of every world that has no force lists at all.
   Both shapes exist in the wild regardless, and every consumer reads through `normalizeIdList` or `gatheringComposition`'s `idList`, which map an absent key and an empty array to the same `[]`.
6. **An already-empty force list is left exactly as found, key and all**, and its environment is returned BY REFERENCE and counts as unmigrated.
   The reference identity is load-bearing for the same reason it is in `1.28.0` requirement 6: the runner compares JSON over the whole corpus, so rebuilding every environment into an equal copy would report a change in every world and rewrite the corpus for nothing.
   An untouched corpus returns the INPUT ARRAY itself with `migratedCount` 0.
7. **Idempotence is proven twice**: the pure function re-run is byte-identical with `migratedCount` 0 because there is no force list left to find, AND the runner's version gate blocks re-entry.
   Neither depends on the other, which is what makes a regression in either one visible.
8. **The transform is SHARED with the export-payload upcast** (`applyManualCompositionForceFold`), not reimplemented, and `migrateExportPayload` applies it branch-independently.
   Import is a second ingress for the very records this pass rescues, because `importReferenceResolver` carries `forcedTaskIds` and `forcedEventIds` through import untouched; see *import-export*.
9. **Mutated setting keys:** `environments` (rewritten in place).
   The runner's payload does not grow: `environments` is already one of the settings it threads, so unlike `1.26.0`, `1.27.0` and `1.28.0` this pass adds no read, snapshot, pass or writeback point.
10. **The downgrade is NOT lossless**, and is declared `downgradeLosesData: true` with the literal string `DOWNGRADING IS NOT LOSSLESS` in the `label` beside the very Downgrade button it is about.
    `1.28.0` filters a manual environment by match and reads an empty force list, so after the fold every non-matching record this migration rescued vanishes from its environment again — exactly the records it rescued, and with no force list left to re-express them.
    The `enabled*Ids` entries themselves survive the downgrade; what is lost is their COMPOSITION, silently, because the old engine drops a picked record that no longer matches rather than reporting it.
11. **The `label` string is the one string a GM ever reads about this migration**, so it states the new rule in both modes, says the fold is what stops a manual environment composing nothing after the upgrade, says the clear is what keeps the manual-to-automatic guarantee, and names the downgrade cost.

### World-Scope Entity Migration (`1.30.0`, `downgradeTo: '1.29.0'`, pure, non-mutating, idempotent)

Issue 1363 (epic 1357, PR 3) gives the world ONE record per component, essence and tool instead of one per crafting system.
The pass (`src/migration/migrateWorldScopeEntities.js`) creates a WORLD ENTITY per resolved source item across every system, re-keys every other member of the group to that id, rewrites every reference the re-key invalidates, and writes one fully-overriding SYSTEM MEMBERSHIP RECORD per original definition.
It mutates no input, throws no `FatalMigrationError`, and returns the ORIGINAL object for any key it did not change.

**The identity divergence this migration accepts is REPAIRED BY THE READ UNION, not by a second pass.**
The world entity and the in-system record are equal at migration time by construction, and they diverge on the first post-migration identity edit, because every shipped identity writer writes the in-system copy.
While `## CraftingSystem` requirement 36 holds, the read union re-derives world identity FROM the in-system record at READ TIME, so the divergence is resolved on every read by the same mechanism that answers it — never by a boot-time rewrite of the three settings, which could not hold anyway: the component metadata refresh bound to the item-update hook rewrites `name`, `img` and `description` in place at any point in a session.
The divergence is also REPORTED once per session to the active GM, as a disclosure; nothing is written by that report.

1. **GROUPING: components and tools by TRANSITIVE CLOSURE over source-reference sets; essences by trimmed `id`.**
   The key is deliberately not a single canonical field, because two systems that registered the same Item by different routes carry different ones — so the pass unions over `{originItemUuid, registeredItemUuid, ...aliasItemUuids}` and their pre-#560 aliases.
   Union-find is permutation-invariant, so the entity PARTITION is set-equal under a shuffled corpus.
   A tool with no source references of its own resolves through its `componentId`, applying the same derivation the crafting-system normalizer applies on load; the migration must do it itself, because it runs on raw settings before any manager load.
   An essence has no source item and its id is a stable semantic slug, so two systems' `fire` are intended to be one essence.
   **ESSENCE IDS ARE NEVER RE-KEYED**, so no essence reference is rewritten and the re-key map carries no essence leg.
2. **AN UNLINKED DEFINITION BECOMES ITS OWN WORLD ENTITY AND IS NEVER MERGED** — not with another unlinked definition of the same name, and not with a linked one.
   Two unlinked "Ash Salt"s in two systems are not provably the same thing, and merging on a name would be a silent irreversible content change made on a guess.
3. **"OLDEST" IS STORED CORPUS POSITION, and this is a DECLARED exception** to § Migration Registry's rule that a migration MUST NOT depend on corpus order, taken under the three conditions that rule states.
   Systems carry no timestamp and `randomID()` is not time-ordered, so array position is the only age fact the corpus holds.
   On a disagreement the OLDEST contributing definition wins every DISPLAY identity field AS A UNIT, never field-by-field, so no chimera identity is minted
   **The THREE SOURCE-LINK fields are UNIONED across the group instead, because donor-wins would DELETE data there.**
   Union-find guarantees only that a group is CONNECTED, not that every member shares a reference with the donor: in a chain A-B-C where C shares a uuid with B and nothing with A, taking A's links as a unit deletes the uuids only C claimed, and an owned Item sourced from one of them stops resolving at the source-reference tier.
   The donor's `originItemUuid` and `registeredItemUuid` stay the primaries and every member's references are collected into `aliasItemUuids`, so the set may only ever WIDEN.
   EVERY rename is reported by name with both systems, while a byte-identical group produces none.
4. **The ID-CLAIM LADDER is deterministic**, so a re-run chooses identically: the oldest contributing id if unclaimed, else the next-oldest if unclaimed, else `<oldestId>-w<n>` with the smallest unclaimed `n >= 2`.
   Steps 2 and 3 exist because component and tool ids are NOT globally unique — copy-import preserves them.
   **The SAME ladder governs COPY-MODE IMPORT's binding of an incoming entity to a destination world entity** (issue 1364), with the ranked intersecting candidates in place of the group's members: it is what makes that binding INJECTIVE, and its middle rung is what makes a re-import idempotent rather than adding one world entity per run (`import-export/spec.md` -> Copy-mode identifier rebinding).
5. **The map is built and applied PER SYSTEM, and a pair that cannot be re-keyed safely is REFUSED ENTIRELY**: no lift, no re-key, no membership, and the pair's own definitions are byte-identical to their input.
   **"Byte-identical" is scoped to the refused pair's own definitions and their ids, and this qualification is load-bearing.**
   Refusal is per `(system, entityType)`, so a system whose COMPONENTS pair is refused while its TOOLS pair is accepted still has its `component.salvage.toolIds` rewritten — those are TOOL references, and the tools pair was not refused.
   What the refusal withholds is the component pair's own lift, re-key and membership.
   A refusal is also not always caused by this migration: a system carrying a NATIVE duplicate definition id fails the output-uniqueness invariant on its own.
   Because a refusal removes that system's definitions from every group they belonged to, it can change ANOTHER system's elected identity donor — which is reported by name like any other identity change, and named in the GM notice's refusal reason.
   TWO invariants decide it, and the second is a POST-condition rather than a pre-condition.
   DISJOINTNESS: the map's image must not intersect its key set, or a single simultaneous lookup is not idempotent.
   OUTPUT UNIQUENESS: the ids the pair emits must be unique, because disjointness alone does not forbid an output id colliding with an id in the same pair that was NOT re-keyed, and such a duplicate is silently last-wins in both index builders — making a definition unreachable with no error.
   Refusing a pair removes its definitions from every group they belonged to, which can change another group's identity donor, so the derivation is iterated to a FIXED POINT; the refusal set only grows and is bounded by the number of `(system, entityType)` pairs.
6. **Every membership record is created with EVERY SECTION OVERRIDDEN**, each value copied verbatim from that system's own definition, so nothing inherits at migration time and every system's resolved behaviour is unchanged.
   A component record carries `category` verbatim — `general` is a legitimate stored token on an override — and its own `tags` with no `mutedTags`.
   An essence record carries `effectSource` and `macro` and its `enabled` flag; a tool record carries `breakage`, `onBreak`, the seeded `repairRequirements` and its `enabled` flag.
7. **WORLD DEFAULTS ARE ELECTED FROM THE DONOR** - the OLDEST contributing system, the same donor that wins identity, extending the oldest-wins rule from identity to behaviour.
   SIX sections take one: component `category`, essence `effectSource` and `macro`, and tool `breakage`, `onBreak` and the seeded `repairRequirements`.
   **TWO are excluded, for two DIFFERENT reasons.**
   Component `tags` is excluded because the tag merge is ADDITIVE with no inherit switch, so a world tag list is granted to EVERY member system at once - a hazard independent of who the donor is.
   The world tool-breakage authority is excluded because its problem is unknowable PROVENANCE rather than an ambiguous donor: the pre-flip normalizer minted a concrete `toolSpecific` on every save, so `### Tool scope` requirement 5's every-existing-value-is-AUTHORED rule applies and there is nothing to lift.

   **FIVE CONSTRAINTS can decline an individual SECTION**, and a declined section simply gets no world default and is reported.
   Nothing is lost by a refusal, which is why refusing is always the safe answer: every membership record still OVERRIDES every section with its own system's value verbatim, so resolution at migration time is unchanged either way and a world default only ever matters for a system added LATER or an override cleared later.
   (0) **EVERY LIVE MEMBER OF THE GROUP MUST HAVE AUTHORED THE SECTION** - `worldScopeDefaults.js` names this CONSTRAINT 0, and it is numbered from zero because it is applied BEFORE the four addressability rules and can decline a section every one of them would have accepted.
   It is what makes the paragraph above true BY CONSTRUCTION rather than true only of the corpora that happened to be tested, and it binds the THREE FALLBACK-EXPOSED sections: component `category`, tool `breakage` and tool `onBreak`.
   A membership record cannot express an EMPTY override for any of the three, so a member that authored nothing carries an ABSENT section, and an absent section under an `inherit: false` switch resolves to the WORLD value (`## Scoped Entity Definitions` requirement 2).
   Electing a donor value for a section some member left unauthored would therefore hand that member the donor's category, breakage mode or on-break action at migration time, which is the exact condition this election was granted on.
   **Why an empty override is inexpressible differs between `category` and the two tool sections, and both reasons are stated because only one of them generalizes.**
   For `category` it is the shape rule: `coerceComponentSection` coerces `''` to ABSENCE, so an empty category cannot be stored at all.
   For `breakage` and `onBreak` it is a NAME COLLISION with the surviving in-system record rather than a normalizer quirk - both are spelled identically at world scope and on the shipped `Tool`, so an override of `{}` would ERASE a live in-system block instead of meaning "no breakage".
   **That erasure is DORMANT while `## CraftingSystem` requirement 36 holds and RE-ARMS when it retires, so the decline is kept rather than relaxed.**
   The read union no longer spreads the resolved sections LAST: for the duration of requirement 36 it re-applies the whole in-system record over them (`## Scoped Entity Definitions` requirement 15), so a `{}` override cannot reach a live in-system block today.
   Requirement 36 keeps those in-system records authoritative, so that block is still where a GM's post-migration edits land, which is what would make the erasure durable rather than cosmetic the moment the record stops deciding its own keys.
   `effectSource` and `macro` are exempt for exactly the converse reason: they are NEW section names that collide with nothing the in-system record carries, so `{}` and `null` are storable overrides, both are written UNCONDITIONALLY onto every membership record, and no member is ever left falling back.
   `repairRequirements` is exempt because it is not a resolver section at all - `### Tool scope` requirement 2 answers it from the membership record alone and never reads the world defaults.
   (a) `category` is NEVER the reserved `general` (`### Component scope` requirement 2), because an absence-preserving world category that mints it resets every inheriting system on the first resolve.
   (b) `effectSource` may name only a WORLD-ADDRESSABLE referent (`### Essence scope` requirement 5) - a document UUID, or a component id in the world roster; a non-addressable donor value stays on the system side as an override with the switch off, which that requirement already mandates.
   (c) `onBreak` carries the same addressability rule for a `replaceWith` COMPONENT target; an `itemUuid` target is globally addressable.
   (d) `repairRequirements` is lifted ONLY when every referenced component is a world component that EVERY member system of the group is a member of.
   It is a SEED, copied once when a tool is added to a system and never re-read, so a dangling group is baked silently into a future system's repair recipe with no reader that can report it.
   The alternative - lift freely and validate at add-to-system time - puts the check inside an action that does not exist yet, so it would ship a world default no shipped code can validate; the chosen rule is decidable from the corpus alone and can never produce a dangling seed.
   It is not restrictive in practice, because a single-member group always satisfies it.

   **ALL FIVE ARE DECIDED AGAINST THE SOURCE CORPUS HERE, AND ARE RE-DECIDED AT IMPORT** (issue 1364, epic 1357, PR 4).
   A membership-filtered export cannot carry the facts three of them rest on: constraint (0)'s every-live-member test was decided over systems the export does not carry, and (b), (c) and (d) may name a component absent from the destination entirely.
   So a carried world default the import would ADD has every section re-evaluated against the DESTINATION's merged corpus, and that corpus is a LOGICAL UNION that includes membership records not yet persisted, because the membership layer is written after the defaults layer (`import-export/spec.md` -> World-default constraint re-check on import).
   Constraint (0) there applies THIS constraint's own authored-section predicate rather than a second one, because the import's inputs include hand-authored payloads whose blank or whitespace `category` carries the key while storing as an ABSENCE — so a key-presence reading of it admits exactly the fallback the constraint forbids.
   Declining at import is lossless for the reason declining here is: every incoming membership record still overrides every section with its own system's value verbatim.

   **The `defaults` SUB-KEY IS WRITTEN whether or not it holds a record**, because seededness keys on key PRESENCE rather than content and the persisted shape must round-trip through the store unchanged.
8. **THE REWRITE RUNS BEFORE THE THREE SCOPE PAYLOADS ARE BUILT**, and the order is load-bearing.
   Three lifted values contain component ids this same pass re-keys — essence `effectSource`, tool `onBreak.replacementTarget.componentId` and tool `repairRequirements` — so a payload built pre-rewrite would ship a membership record naming a retired id in every migrated world, and the per-pair lift guard is keyed on the NEW pair, so a re-run would skip it and the stale ids would persist permanently.
   The shared walk then runs over the three payloads as a FOURTH target as a belt-and-braces check; on a correctly ordered pass it finds nothing to change.
9. **The REFERENCE WALK is ONE shared enumeration**, used by this migration and by copy-mode import alike, so the two cannot drift.
   It covers every component-id and tool-id position across `recipes`, `craftingSystems` and `gatheringConfig`: ingredient, catalyst and repair-option refs and their `alternatives`, result refs, salvage result groups, recipe / step / ingredient-set / salvage `toolIds`, essence `sourceComponentId` / `associatedSystemItemId` / legacy `sourceItemUuid`, tool `componentId`, `onBreak.replacementTarget.componentId` and `repairRequirements[].options[]`, gathering task and event drop rows and `toolIds`, and the legacy pre-`0.7.0` gathering tools copy.
   It is KEY-AWARE: recipe ids, outcome ids and salvage-group ids are NEVER rewritten, and a value at a non-reference position is never touched even if it coincidentally equals a component id.
   It is IDEMPOTENT by construction, because every site performs ONE simultaneous lookup and requirement 5's disjointness makes an already-rewritten value not a key.
   **Under COPY-MODE IMPORT it additionally covers the three scope payloads' `defaults` records, on the same SECTION SHAPE it already walks for a `membership` record, and the world entity roster's own identifiers** (issue 1364).
   A world default carries component references exactly as a membership record does, so driving the walk over `membership` alone — which is all this migration needs, because it elects defaults from records the walk has already rewritten — would leave a copy-imported world default naming a pre-import component id.
10. **The pass writes SEVEN legs, and `fabricate.worldScopeRekeyMap` is the FIRST of them.**
    The map is `{ [systemId]: { components: { [oldId]: newId }, tools: { ... } } }`, and it is the pass's durable DECISION RECORD rather than a migrated setting — see § Migration Registry for why the leg order is not reordered and why this record is what replaces reordering it.
    The three scope keys are DESTINATIONS and are written before the `craftingSystems` SOURCE, as `currencyConfig`, `travelConfig` and `characterLibraries` already are.
11. **The GUARDED LIFT half and the UNGUARDED REWRITE half are separated, and that separation is what makes a torn pass recoverable.**
    The LIFT/CLAIM half is gated PER `(entityId, systemId)` on a CORPUS-DERIVED predicate — the world corpus already holds a membership record for that pair — and NEVER on `migrationVersion`.
    `1.28.0`'s "this key has entries" disjunction is not reusable here: any GM edit seeds a key, and migrations run on the active GM alone, so key presence does not prove this pass ran.
    The REWRITE half runs UNCONDITIONALLY, driven by the persisted map alone.
    **The in-system identity WRITE-BACK belongs to the REWRITE half**, not the LIFT half: a tear between the three scope legs and `craftingSystems` would otherwise make the re-run skip it, leaving world entities holding merged identity while in-system records keep their original identity.
    On a re-run its source is the PERSISTED SCOPE PAYLOADS, keyed by the mapped NEW id, because the map carries old-to-new IDS and no identity VALUES.
12. **The residual window is named rather than glossed.**
    Between an abandoned pass that tore at the `craftingSystems`-to-`gatheringConfig` boundary and the next boot, `gatheringConfig` holds old ids while `craftingSystems` holds new ones.
    `migrationVersion` is unadvanced, so the next boot repairs it — but only because the map CLEAR is gated on `migrationVersion`; without that gate the same-boot `ready` pass destroys the map and the next boot cannot repair anything.
    The window is bounded to one abandoned pass on one client, and the deferral already posts a permanent GM-facing notice instructing a reload.
13. **The Item- and actor-FLAG remap is NOT a registry entry, and the existing restamp cannot serve.**
    The runner reads and writes only settings payloads and has no Actor or Item handle, and `restampOwnedItemComponentIdentity`'s planner returns EARLY for any item that already carries a durable identity flag — precisely the population the re-key invalidates.
    It is a NEW one-shot `ready`-body pass keyed by its own NUMBER setting, on the shipped `*_FLAG_STAMP_VERSION` precedent.
    Source Items are covered by bumping the component and tool flag-stamp targets, because the source-side writer overwrites when the stored value differs.
    **BOTH OF THOSE STAMP PASSES WITHHOLD THEIR OWN VERSION ADVANCE on requirement 17's gate**, which is not the shipped one-shot pattern and is deliberate: bumping the target makes each of them a pass that CONSUMES this migration's output, and a DEFERRED migration returns NORMALLY, so on a torn boot they run against the OLD ids, change nothing, and an unconditional advance would gate them off FOREVER.
    Nothing else repairs a source Item — the actor-flag remap never touches one — so every later drag would copy the stale flag onto an owned item that the owned-item restamp then refuses because it already carries a durable identity flag.
    They still RUN on their own Number version; it is only the advance that waits.
14. **The complete actor-flag site list**, or the reason for exclusion:
    `roles[<systemId>].componentId` and `roles[<systemId>].toolId` on owned Items; the LEGACY FLAT SCALAR `flags.fabricate.fabricate.componentId`, remapped only when the old id is a key in exactly ONE system's component map across the whole corpus or in several that agree, and otherwise left untouched; `craftingRuns` and `salvageRuns` at their DOUBLY-nested depth and `gatheringRuns` at its SINGLE-scope depth, the two depths differing so a pass that assumes one silently misses the other; and `alchemyDeadEnds`, whose signature keys embed component ids SORTED LEXICALLY, so a re-key changes the sort order and the remap must PARSE, remap, RE-SORT and re-join rather than substitute.
    `learnedRecipes` is EXCLUDED, because it holds recipe ids and recipe ids are never re-keyed.
    Leaving the legacy scalar is behaviour-PRESERVING rather than lossy: a stale scalar makes tiers 1-2 miss and resolution falls through to the unchanged source-reference tier.
15. **The dotted-`systemId` guard applies to every `roles.<systemId>` write.**
    A role leaf is written through a flattened `Document#update` key, which Foundry expands on every dot, so a dotted `systemId` nests one level deeper than any reader indexing `roles[systemId]`.
    An unsafe segment is SKIPPED and counted in the report.
    The `alchemyDeadEnds` `systemId` is a VALUE-side object key rather than a dotted update-path segment, so the guard does not apply to it.
15a. **The remap is also available as a GM RECOVERY ACTION**, `game.fabricate.remapWorldScopeIdentityFlags()`.
    It is ACTIVE-GM only, matching the boot pass, because it writes across every actor in the world and `game.fabricate` is bound on every client; it performs the remap alone and never clears the map or advances the one-shot version.
    It is reachable exactly when the boot pass WITHHELD itself — a torn migration, or a partial remap — because both leave the map pending, and once the map is cleared it answers `null`.

16. **Between the settings write and the remap, resolution degrades to the SOURCE-REFERENCE tier**, which this change does not touch.
    A source Item in a LOCKED pack is skipped and stays in that tier permanently — accepted, stated, and counted in the report.
17. **The map CLEAR is gated on the PRODUCING MIGRATION HAVING COMPLETED, and whenever the clear is withheld the pass withholds its own version advance too.**
    Gating for the pass to RUN is corpus-derived plus its own Number version; gating for it to DESTROY the decision record is `compareSemver(migrationVersion, '1.30.0') >= 0` and NEVER a bare JavaScript `>=`, which is a LEXICOGRAPHIC compare and is TRUE for `'1.4.0'` through `'1.9.0'` — all six registered migration versions, and the worlds running the longest multi-migration pass.
    The version advance shares that gate because the shipped one-shot precedent writes its version unconditionally: a pass that skips the clear but advances its version short-circuits on every later boot and NEVER clears, orphaning the setting permanently.
18. **The pass REPORTS every reference that resolves to nothing, and does NOT delete any of them.**
    They are listed under `flaggedForReview` and named in the GM notice.

    **The report is not a predicted deletion, and this is stated because an earlier form of this requirement said it was.**
    Measured across the whole acceptance set, ten references resolve to nothing before the migration and ZERO disappear after the round-trip save.
    Two independent facts explain that: the crafting-system normalizer consumes the component basis at exactly ONE site — the essence source-uuid retention — and prunes no recipe ingredient, salvage result, gathering drop row or tool link against it; and the basis was ALREADY known for any system with a non-empty in-system array, which after this migration is every system, because `1.30.0` does not shed those arrays.
    The newly-decidable case is a system whose in-system array is EMPTY, and that becomes the common case only when the CONSUMER SWEEP sheds them.
    So these references become prunable AT THE SWEEP; the value of reporting them here is that this is the one moment the whole corpus is walked.
19. **The TRANSIENT REPORT** carries entities created per type, groups merged, every rename with its two systems, transitively-formed groups, refusals with reasons, the references that ALREADY RESOLVE TO NOTHING, and the world-default sections a constraint declined, through a `_worldScopeEntityReport` field the runner captures and DELETES so it is never persisted.
    The reference list is `flaggedForReview` and it is NOT a list of newly-prunable references: requirement 18 establishes that nothing is pruned at this release and that they become prunable only at the CONSUMER SWEEP.
    `refusedDefaultSections` is a DIAGNOSTIC and is deliberately NOT in the GM notice, because requirement 7's constraint (0) makes decline the DOMINANT class - a notice enumerating it would fire on nearly every migrated world - and because a declined section has no observable consequence until a reader resolves through the world layer.
20. **`migrateWorldScopeEntities` ITSELF is SHARED with the export-payload upcast**, not reimplemented; `migrateExportPayload` applies it branch-independently to a synthesized ONE-SYSTEM corpus, exactly as the four world-scope lifts before it apply theirs.
    An export bundle IS a one-system corpus, so the union across systems degenerates there to that system's own definitions — but it is the same function, so a world upgrade and an imported bundle cannot drift on how a world entity is derived.

    **This one differs from all four predecessors in three ways, each of which is a rule the upcast has to keep.**
    First, the upcast DERIVES and never STRIPS: there is no `stripSystemScopedEntities` half, because the shed is deferred to the consumer sweep and the in-system arrays stay authoritative, so writing one would perform that shed through the import door.
    Second, the upcast adopts ONLY the three scope keys and DISCARDS the returned `systems`, `recipes` and `gatheringConfig`; that discard is load-bearing rather than defensive, because requirement 1's source-link union is written back onto every in-system record and adopting it would rewrite in-system identity on every import.
    Third, this function reads `defaults` and `membership` ONLY in their PERSISTED MAP shape and IGNORES an array rather than rejecting one, so ANY caller holding the export envelope's array form must RE-KEY BEFORE CALLING IT (`data-models/spec.md` -> Scoped Entity Definitions requirement 13).

21. **Mutated setting keys:** `worldScopeRekeyMap`, `recipes`, `componentScope`, `essenceScope`, `toolScope`, `craftingSystems`, `gatheringConfig`.
22. **The downgrade is LOSSLESS FOR DATA and is declared `downgradeLosesData: false`**, checked rather than copied.
    The merged identities are a loss at MIGRATION time, not one the downgrade causes; and the three scope settings are PRESERVED as orphaned `Setting` documents that `1.29.0` neither reads nor writes, so a re-upgrade finds them intact — "stranded and unreadable there" is accurate, "lost" is not.
    ONE real caveat is stated in the `label` without being claimed as data loss: `1.29.0`'s crafting-system normalizer RE-MINTS a concrete `toolSpecific` authority onto a system that authored none, which pins that system out of a world authority only a later release can create.
    That is DATA-lossless and BEHAVIOUR-relevant, which this registry already treats as a different fact.

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

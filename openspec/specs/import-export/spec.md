# Complete Authoring Import/Export

## Purpose

Define how Fabricate exports and imports the complete GM-authored model of a crafting system.
This covers crafting authoring (the `system` object plus its recipes) and gathering authoring (per-system environments and the per-system `gatheringConfig` slice).
The goal is a clean restore or transfer of a system between worlds without manually rebuilding newer features.

## Scope

This spec governs:

- Which GM-authored record types a system export MUST include.
- The export envelope's explicit schema version and runtime-state marker.
- The authoring-versus-runtime boundary (what is stripped on export).
- Backward-compatible migration of older export payloads.
- Reference classification (internal versus external) and unresolved-reference reporting.
- Copy-mode identifier rebinding rules.
- Round-trip integrity guarantees.

## Data Model References

From `data-models/spec.md`:

- `CraftingSystem` and its `recipeItemDefinitions`, `tools`, `gatheringRealms`.
- The `gatheringEnvironments` world setting (per-system environment records).
- The `gatheringConfig` world setting (per-system `rules`, `conditions`, `vocabularies`, `economy`, reusable `tasks`, reusable `events`, `characterModifiers`).
- The excluded `gatheringParties` world setting.

## Requirements

### Export completeness

A system export MUST include every supported GM-authored record type for that system.
This spans the `craftingSystems`, `recipes`, `gatheringEnvironments`, and `gatheringConfig` settings.
The per-system `economy` slice (stamina defaults and resource-node/limitation flags) MUST ride along.

### Explicit schema markers

The export envelope MUST carry an integer `schemaVersion` that is distinct from `fabricateVersion`.
The current schema version is `2`.
The envelope MUST carry a `runtimeStateIncluded` boolean marker, which is `false` for authoring-only exports.

### Authoring-versus-runtime boundary

Export MUST exclude runtime and world state by default.
Excluded state comprises: per-environment `nodeRuntime`; the current-condition selection at both the top level (`conditions.{weather,timeOfDay}`) and per system (`conditions.<kind>.current`); gathering parties; per-character stamina and blind-task discovery; recent gathering history; active timed runs (including a salvage run's captured `resultOrder`); the stored per-user progressive result order (`progressiveResultOrder`, a user-scoped runtime preference); and actor or scene state.
The GM-authored reorder **permission** is authoring data and IS exported, via `Recipe.toJSON()` and the salvage definition — only the player's chosen order is excluded.
When resetting the current-condition selection, export MUST preserve the authoring overrides (`conditions.<kind>.enabled` and `conditions.<kind>.values`) and reset only `current` to defaults.
The `runtimeStateIncluded: false` marker MUST stay honest with this boundary.

### Migration of older exports

Import MUST accept exports of any prior `schemaVersion` by upcasting through a migration before validation.
A legacy export carries no `schemaVersion` and is treated as schema `1`.
The migration MUST be idempotent: migrating an already-current payload is a no-op, and migrating a migrated payload equals migrating it once.

### GM gating

Import MUST be GM-gated and MUST fail fast before any world-scope write.
A non-GM import attempt MUST leave no partial system and no rejected writes.

### Reference handling

Import MUST classify every cross-reference as internal or external.
Internal references are resolvable within the payload: environment-to-task and environment-to-event identifier linkages; drop-row `componentId`; tool `componentId` and `onBreak.replacementComponentId` across both the system tools and the gathering-library tool slice; recipe ingredient-option, result, and catalyst component references including the recursive `alternatives[]` refs and the flat `ingredients`/`results` aliases at both top level and per step; component salvage result references and legacy salvage catalysts; recipe `recipeItemId`; essence `sourceComponentId`; and `recipeItemDefinitions[].recipeIds` recipe-book membership.
A broken internal reference is a data-integrity warning that MUST be kept verbatim and reported.
This classification is unchanged by copy-mode component-id and recipe-id regeneration: after the copy transform (see Copy-mode identifier rebinding) no internal component reference and no recipe-book membership reference points at a pre-regeneration id, so a faithful copy import surfaces zero broken component references and zero broken `RECIPE_ITEM` references.
External references point at world documents that may be absent: component `originItemUuid`, environment `sceneUuid`, realm `sceneMappings[].sceneUuid` and `sceneMappings[].sceneRegionUuid`, drop-row `itemUuid`, and macro UUIDs.
Import MUST accept the pre-`1.16.0` source-reference field names (`sourceUuid` / `sourceItemUuid` / `fallbackItemIds`) on components, recipe-item definitions, and tools, and emit the renamed fields (`registeredItemUuid` / `originItemUuid` / `aliasItemUuids`); an export produced after the rename carries the new names.
Import MUST preserve unresolved references rather than dropping them.
Import MUST return a structured `unresolvedReferences[]` collection, each entry carrying `kind`, `ownerType`, `ownerId`, `ownerName`, `referenceValue`, and a `disposition` of `remapped`, `retained`, or `reported`.
Import MUST surface that collection to the GM in a readable report.

### Copy-mode identifier rebinding

Copy-mode import MUST rebind record-container identifiers: the system identifier, realm identifiers, and environment record identifiers.
Copy-mode import MUST regenerate component identifiers in addition to the record-container identifiers, and MUST atomically remap every within-payload reference to a regenerated component id.
The remapped references are: recipe ingredient-option and result component refs including the `systemItemId` alias, the recursive `alternatives[]` refs, and the legacy flat `ingredients`/`results` aliases; `tool.componentId` in both the system and gathering-library tool slices; tool `onBreak.replacementComponentId`; essence `sourceComponentId`/`associatedSystemItemId`; component salvage result refs; gathering task/event drop-row `componentId`; and legacy `catalysts[]` component refs when present in a legacy or hand-edited payload.
Copy-mode import MUST also regenerate recipe identifiers, and MUST atomically remap every within-payload recipe-book membership reference (`recipeItemDefinitions[].recipeIds` entries) to the regenerated recipe id, so a copy's books resolve to the copy's recipes.
The remap MUST be key-aware and per id class: a value at a non-reference position that coincidentally equals an id MUST NOT be rewritten by that class's remap.
A `recipeIds[]` entry is protected from the component-id remap but IS rewritten by the recipe-id remap; an outcome or salvage-group id, or a scene or macro UUID, is rewritten by no remap.
A membership entry naming a recipe id absent from the payload MUST be preserved verbatim and reported as a broken internal reference.
After the transform, no within-payload reference may point at a pre-regeneration or absent component id, and no `recipeIds[]` membership entry may point at a pre-regeneration recipe id.
Copy-mode import MUST preserve task, event, character-modifier, recipe-item-definition, and salvage-group identifiers so environment-to-library linkages and routing survive.
Keep-mode import MUST NOT regenerate component identifiers or any reference.

### Environment persistence

Environment persistence on import MUST replace only the imported system's environments.
It MUST NOT clobber other systems' environments, and a repeated overwrite MUST NOT accumulate or duplicate stale environments.

### Import persistence batching

Recipe persistence on import MUST issue a single `recipes` world-setting write for the whole imported batch, not one write per recipe.
The batched persistence MUST preserve the per-recipe import outcome: the same skip / overwrite / create classification, the same imported / skipped / error counts, the same `collisions[]` entries, and the same `errors[]` isolation of a per-recipe persistence failure as an unbatched per-recipe import.
The single change hook the writing client emits after the batch is unchanged.
Collapsing the per-recipe writes additionally reduces a replicated player's mid-import refreshes from one per recipe to one at completion, which is a strictly-better consequence and not a behavioural regression.

### Import progress feedback

A system import MUST surface live progress to the GM while it runs, advancing at phase boundaries and periodically through the recipe phase, so a large import is not indistinguishable from a frozen client.
Progress reporting MUST NOT alter the import's final state, summary counts, or reference reporting.

### Round-trip integrity

For supported authoring data, a single-store keep-mode `export → import → export` MUST be equivalent modulo the volatile envelope fields `exportedAt` and `fabricateVersion`.

## Out of Scope

- Gathering parties, which remain excluded from system import/export (see `data-models/spec.md`).
- An opt-in "include runtime state" export toggle, which is deferred; the schema is versioned so it can be added additively.
- Cross-world document creation (scenes, macros, source items); Fabricate preserves and reports these references but does not create the referenced documents in the target world.

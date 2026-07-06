# Specification 010: Complete Authoring Import/Export

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

From `002-data-models.md`:

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
Excluded state comprises: per-environment `nodeRuntime`; the current-condition selection at both the top level (`conditions.{weather,timeOfDay}`) and per system (`conditions.<kind>.current`); gathering parties; per-character stamina and blind-task discovery; recent gathering history; active timed runs; and actor or scene state.
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
Internal references are resolvable within the payload: environment-to-task and environment-to-event identifier linkages, drop-row `componentId`, tool `componentId`, recipe `recipeItemId`, and essence `sourceComponentId`.
A broken internal reference is a data-integrity warning that MUST be kept verbatim and reported.
External references point at world documents that may be absent: component `sourceItemUuid`, environment `sceneUuid`, realm `sceneMappings[].sceneUuid` and `sceneMappings[].sceneRegionUuid`, drop-row `itemUuid`, and macro UUIDs.
Import MUST preserve unresolved references rather than dropping them.
Import MUST return a structured `unresolvedReferences[]` collection, each entry carrying `kind`, `ownerType`, `ownerId`, `ownerName`, `referenceValue`, and a `disposition` of `remapped`, `retained`, or `reported`.
Import MUST surface that collection to the GM in a readable report.

### Copy-mode identifier rebinding

Copy-mode import MUST rebind record-container identifiers: the system identifier, realm identifiers, and environment record identifiers.
Copy-mode import MUST preserve task, event, and character-modifier identifiers so environment-to-library linkages survive.

### Environment persistence

Environment persistence on import MUST replace only the imported system's environments.
It MUST NOT clobber other systems' environments, and a repeated overwrite MUST NOT accumulate or duplicate stale environments.

### Round-trip integrity

For supported authoring data, a single-store keep-mode `export → import → export` MUST be equivalent modulo the volatile envelope fields `exportedAt` and `fabricateVersion`.

## Out of Scope

- Gathering parties, which remain excluded from system import/export (see `002-data-models.md`).
- An opt-in "include runtime state" export toggle, which is deferred; the schema is versioned so it can be added additively.
- Cross-world document creation (scenes, macros, source items); Fabricate preserves and reports these references but does not create the referenced documents in the target world.

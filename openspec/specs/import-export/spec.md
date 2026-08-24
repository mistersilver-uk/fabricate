# Complete Authoring Import/Export

## Purpose

Define how Fabricate exports and imports the complete GM-authored model of a crafting system.
This covers crafting authoring (the `system` object plus its recipes), gathering authoring (per-system environments and the per-system `gatheringConfig` slice), and the world currency configuration the system's recipes charge against.
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

- `CraftingSystem` and its `recipeItemDefinitions` and `tools`.
- The `gatheringEnvironments` world setting (per-system environment records).
- The `gatheringConfig` world setting (per-system `rules`, `conditions`, `vocabularies`, `economy`, reusable `tasks`, reusable `events`).
  The modifier library moved onto the crafting system in issue 1117 and is exported with it.
- The `currencyConfig` world setting (the world coin ladder, spend strategy, provider, and macro set; see `data-models/spec.md` -> CurrencyConfig).
  Currency moved to world scope in issue 1278; each crafting system carries only `requirements.currency.enabled`.
- The `travelConfig` world setting (the world realm library, its reveal mode and its modifier visibility, including each realm's Foundry Scene Region `sceneMappings`; see `data-models/spec.md` -> TravelConfig).
  Travel moved to world scope in issue 1282; each crafting system carries only `gatheringRealmSettings.enabled`.
- The excluded `gatheringParties` world setting.

## Requirements

### Export completeness

A system export MUST include every supported GM-authored record type for that system.
This spans the `craftingSystems`, `recipes`, `gatheringEnvironments`, `gatheringConfig`, `currencyConfig`, and `travelConfig` settings.
The per-system `economy` slice (stamina defaults and resource-node/limitation flags) MUST ride along.
The world currency configuration MUST ride along as its own envelope slice even though it is not part of the `CraftingSystem` record, because an exported recipe's currency option and an exported component's salvage currency requirement both name a unit by `id` and are unusable in the destination world unless that unit arrives with them.
Unlike the gathering slices there is no per-system filtering to do: the world has exactly one currency configuration, so the whole of it travels.

The world travel configuration MUST ride along as its own envelope slice for the same reason and on the same terms: an exported environment's `includedRealmIds` / `excludedRealmIds` name realms by `id` and are unusable in the destination world unless those realms arrive with them.
The whole library travels rather than the subset one system's environments happen to cite, because a realm is geography rather than a per-system record and there is no owning system to filter by.

Completeness is a property of the authoring DATA, not of the key set: an exported recipe carries whatever `Recipe.toJSON()` emits, which since issue 1087 omits the flat top-level `results` alias and every field whose absence the constructor rebuilds to the identical value (see `data-models/spec.md` requirement 18).
An export produced after that change is therefore smaller and key-sparser than one produced before it while describing the same system, and MUST NOT be treated as incomplete for the keys it leaves out.
Import MUST keep ACCEPTING both, permanently: the read fallbacks are what let an export authored by any earlier version — or by third-party content that never round-tripped through this module — still import with every result and every authored value intact.

### Explicit schema markers

The export envelope MUST carry an integer `schemaVersion` that is distinct from `fabricateVersion`.
The current schema version is `4`.
Schema `4` added the envelope-level `travelConfig` slice; schema `3` added the envelope-level `currencyConfig` slice; schema `2` added the explicit version marker and the runtime-state boundary flag.
The envelope MUST carry a `runtimeStateIncluded` boolean marker, which is `false` for authoring-only exports.

### Authoring-versus-runtime boundary

Export MUST exclude runtime and world state by default.
Excluded state comprises: per-environment `nodeRuntime`; the current-condition selection at both the top level (`conditions.{weather,timeOfDay}`) and per system (`conditions.<kind>.current`); gathering parties; per-character stamina and blind-task discovery; recent gathering history; active timed runs (including a salvage run's captured `resultOrder`); the stored per-user progressive result order (`progressiveResultOrder`, a user-scoped runtime preference); and actor or scene state.
The GM-authored reorder **permission** is authoring data and IS exported, via `Recipe.toJSON()` and the salvage definition — only the player's chosen order is excluded.
Export MUST also strip the Checks Studio's progressive PREVIEW SANDBOX (`progressive.preview`) from every check block that can carry one — the crafting, salvage and gathering checks alike.
That list of ordered result difficulties is an experiment a GM types on one authoring screen to see what a progressive check would award: no runtime path reads it and no readiness rule validates it, so a value shipped inside a distributed system would read to the recipient as configuration they are expected to understand.
The strip MUST DELETE the key rather than empty it, because an absent sandbox and an authored empty one are different states and an import must not be able to tell an exported experiment from one that was never run.
When resetting the current-condition selection, export MUST preserve the authoring overrides (`conditions.<kind>.enabled` and `conditions.<kind>.values`) and reset only `current` to defaults.
The `runtimeStateIncluded: false` marker MUST stay honest with this boundary.

### Migration of older exports

Import MUST accept exports of any prior `schemaVersion` by upcasting through a migration before validation.
A legacy export carries no `schemaVersion` and is treated as schema `1`.
The migration MUST be idempotent: migrating an already-current payload is a no-op, and migrating a migrated payload equals migrating it once.
A payload's `craftingCheck.maxModifierPicks` MUST be derived by `migrateExportPayload` from the payload's own system, by the same per-system transform the world-side `1.20.0` settings migration applies (stamp `1` onto a system on the `playerPicks` combination rule that carries no usable cap, and leave every other rule — the subject-selecting one included — unbounded), and this derivation MUST run **branch-independently** of the schema-envelope upcast: a bundle already at the current `schemaVersion` still needs it, because the cap is a field added on an OLD schema version and its absence is orthogonal to the envelope version.
An authored cap in the bundle MUST survive the import, which is what makes the derivation idempotent.
A pre-`3` payload carries its currency configuration on the system at `requirements.currency`, and `migrateExportPayload` MUST hoist it to the envelope-level `currencyConfig` and reduce the system's own block to `{ enabled }`, using the SAME union-merge transform the world-side `1.26.0` migration applies (`buildWorldCurrencyConfig` / `stripSystemCurrencyConfig`), not a second implementation of it.
An export carries one system, so the union across systems degenerates here to that system's own ladder — but it is the same function, so the two paths cannot drift on how a unit is carried across.
This hoist MUST also run **branch-independently**, for the reason every other field-level upcast does: `migrateExportPayload` returns early once `schemaVersion` is current, so a derivation reachable only from the schema-bump path would silently skip every payload authored at the current schema.

A pre-`4` payload carries its realm library on the system at `gatheringRealms` (or, pre-`1.1.0`, at `gatheringRegions`), and `migrateExportPayload` MUST hoist it to the envelope-level `travelConfig` and reduce the system's own block to `{ enabled }`, using the SAME transforms the world-side `1.27.0` migration applies (`buildWorldTravelConfig` / `stripSystemTravelConfig`), not a second implementation of them.
This hoist MUST also run branch-independently, and MUST be idempotent: once the envelope carries a library the lift is a no-op, and a system already reduced to `{ enabled }` has nothing left to strip.
It is idempotent: once the envelope carries units the hoist is a no-op, and a system already reduced to `{ enabled }` has nothing left to strip.

### Currency configuration merge on import

Import MUST merge the payload's `currencyConfig` into the destination world's own configuration NON-DESTRUCTIVELY.
Currency is world scope, so unlike the per-system gathering slice there is no key under which an import may simply replace what is there; overwriting would destroy a ladder the destination GM authored for systems that have nothing to do with this import.

Units MUST merge by `id` with the DESTINATION winning a collision: an id already present in the destination keeps its own definition, and only genuinely new denominations are appended.
That is what makes an import safe to run twice, and it is what keeps the destination's existing recipe currency costs resolving to the units their author meant.
The merge MUST NOT reorder or remove a destination unit.

The scalars — `spendStrategy`, `providerId`, and `macros` — MUST be seeded ONLY into an unconfigured world (one whose ladder is empty).
A world that already has a ladder has already answered "how do actors here store coins", and an imported system does not get to overrule it.

An incoming configuration carrying no units MUST write nothing, and a merge that adds no unit to an already-configured world MUST write nothing, so an import that changes no currency data issues no setting write.
Copy-mode import MUST NOT regenerate currency unit ids: they are cross-referenced by recipe currency options and salvage currency requirements, and regenerating them would orphan every one of those references (see `data-models/spec.md` -> CurrencyConfig requirement 7).

### Travel configuration merge on import

Import MUST merge the payload's `travelConfig` into the destination world's own configuration NON-DESTRUCTIVELY, on exactly the terms the currency merge above uses and for the same reason: travel is world scope, so there is no key under which an import may simply replace what is there, and overwriting would destroy a library the destination GM authored for systems that have nothing to do with this import.

Realms MUST merge by `id` with the DESTINATION winning a collision: an id already present in the destination keeps its own definition — including its `sceneMappings`, which point at the DESTINATION world's Foundry Scenes and would be meaningless if replaced by the source world's — and only genuinely new realms are appended.
That is what makes an import safe to run twice, and it is what keeps the destination's existing environment realm gating resolving to the places their author meant.
The merge MUST NOT reorder or remove a destination realm.

The scalars — `revealMode` and `modifierVisibility` — MUST be seeded ONLY into an unconfigured world (one whose library is empty).
A world that already has realms has already answered how it reveals its places, and an imported system does not get to overrule it.

An incoming configuration carrying no realms MUST write nothing, and a merge that adds no realm to an already-configured world MUST write nothing, so an import that changes no travel data issues no setting write.
Copy-mode import MUST NOT regenerate realm ids: they are cross-referenced by environment location availability, party overrides and the actor discovery flag, and regenerating them would orphan every one of those references (see `data-models/spec.md` -> TravelConfig requirement 4).
Realms are therefore no longer part of what a copy-mode import rebinds at all: a copy that duplicated the world's realms would give the destination two records for one valley.

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
Import MUST surface that collection to the GM in a readable report, grouped by reference kind, with each entry naming its owner and showing the unresolved reference value verbatim.
Every `kind` and every `ownerType` the import can emit MUST have a localized label, including the values that reach the report only through a dynamic pass-through helper; the report MUST never display a raw localization key.
A component's salvage result and catalyst references are owned by that COMPONENT, not by a recipe, and the report MUST label them accordingly.

A component **complication**'s `macroUuid` (issue 1286) is an external macro reference and MUST be collected as one, with `ownerType: 'component'` — a type that already carries a localized label — and with the OWNING COMPONENT's id and name.
It is collected by a dedicated walk rather than by the flat one-level-deep collector, for a REPORTING reason as much as a structural one: the flat collector cannot reach a nested list, and a flattened form would take the owner id and name from the complication, so the report would name a record the GM cannot open instead of the component they have to go and fix.
Left uncollected, the uuid is never remapped and the complication runs the WRONG macro in the importing world.

### Copy-mode identifier rebinding

Copy-mode import MUST rebind record-container identifiers: the system identifier and environment record identifiers.
Realm identifiers are deliberately NOT among them since issue 1282 (see the travel-configuration merge above): they are world scope, and a copy that minted fresh ones would duplicate the world's geography rather than recognise it.
Copy-mode import MUST regenerate component identifiers in addition to the record-container identifiers, and MUST atomically remap every within-payload reference to a regenerated component id.
The remapped references are: recipe ingredient-option and result component refs including the `systemItemId` alias, the recursive `alternatives[]` refs, and the legacy flat `ingredients`/`results` aliases; `tool.componentId` in both the system and gathering-library tool slices; tool `onBreak.replacementComponentId`; essence `sourceComponentId`/`associatedSystemItemId`; component salvage result refs; gathering task/event drop-row `componentId`; and legacy `catalysts[]` component refs when present in a legacy or hand-edited payload.
Copy-mode import MUST also regenerate recipe identifiers, and MUST atomically remap every within-payload recipe-book membership reference (`recipeItemDefinitions[].recipeIds` entries) to the regenerated recipe id, so a copy's books resolve to the copy's recipes.
The remap MUST be key-aware and per id class: a value at a non-reference position that coincidentally equals an id MUST NOT be rewritten by that class's remap.
A `recipeIds[]` entry is protected from the component-id remap but IS rewritten by the recipe-id remap; an outcome or salvage-group id, or a scene or macro UUID, is rewritten by no remap.
A membership entry naming a recipe id absent from the payload MUST be preserved verbatim and reported as a broken internal reference.
After the transform, no within-payload reference may point at a pre-regeneration or absent component id, and no `recipeIds[]` membership entry may point at a pre-regeneration recipe id.
Copy-mode import MUST preserve task, event, character-modifier, recipe-item-definition, and salvage-group identifiers so environment-to-library linkages and routing survive.
Component **complication** identifiers join that preserve list: nothing outside the owning component references one, and every runtime key that names a complication pairs its id with a component id or a result id the component-id remap already rebinds on its own half.
Keep-mode import MUST NOT regenerate component identifiers or any reference.

### Environment persistence

Environment persistence on import MUST replace only the imported system's environments.
It MUST NOT clobber other systems' environments, and a repeated overwrite MUST NOT accumulate or duplicate stale environments.

### Import persistence batching

Recipe persistence on import MUST issue a single `recipes` world-setting write for the whole imported batch, not one write per recipe.
The batched persistence MUST preserve the per-recipe import outcome: the same skip / overwrite / create classification, the same imported / skipped / error counts, the same `collisions[]` entries, and the same `errors[]` isolation of a per-recipe persistence failure as an unbatched per-recipe import.
The single change hook the writing client emits after the batch is unchanged.
Collapsing the per-recipe writes additionally reduces a replicated player's mid-import refreshes from one per recipe to one at completion, which is a strictly-better consequence and not a behavioural regression.
The single batched write also carries any provenance-matched prune deletions (see Recipe import provenance and pruning), and it fires when at least one recipe was imported OR pruned; an overwrite that imports nothing and prunes nothing writes nothing.
"Single write" scopes the `recipes` world setting only — the actor-flag cleanup following a prune is a separate concern, run as ONE bulk pass across affected actors (not once per pruned recipe), independent of the `recipes` write.

### Recipe import provenance and pruning

Import MUST stamp a durable provenance marker (`Recipe.importSource`, see `data-models/spec.md`) on every recipe it creates or overwrites, identifying the source pack: the payload's `system.id` when present (keep-mode, the pack's own stable identity preserved across reinstalls), else the created system id (copy-mode / id-less payloads).
The marker MUST be re-stamped on each import, so a stale or foreign inbound marker is overwritten and provenance self-heals across re-export/re-import chains.
The marker MUST be absent on GM-authored recipes so pack-shipped and hand-authored recipes are distinguishable.
A GM edit to an imported recipe MUST retain the marker (an edit is still the pack's recipe, tweaked); a GM who wants a customization to survive a later pack drop MUST author a fresh (unprovenanced) recipe instead, which is never auto-pruned.

Under `overwriteExisting`, after the recipe loop import MUST remove recipes that belong to the target system, carry provenance matching the incoming pack, and are absent from the incoming payload.
The absent-set MUST be computed over ALL payload recipe ids, so a payload recipe whose overwrite failed is still "shipped" and is never pruned.
Import MUST NOT auto-remove recipes lacking provenance (GM-authored, or imported before provenance existed) or carrying a different pack's provenance; these MUST be preserved and reported only.
Auto-pruning therefore takes effect from the first provenance-stamping reinstall ONWARD: recipes imported before this feature are unprovenanced on their first post-fix reinstall and resolve via the report-only path.
Pruning MUST persist in the same single batched `recipes` write as the import (a prune-only reinstall still writes once), and the actor-flag cleanup following the prune MUST run as ONE bulk pass across affected actors, not once per pruned recipe.
A copy-mode / fresh-system import mints a new system id and has no persisted recipes to overwrite, so it never enters the prune path.

### Orphan reporting

The import summary MUST include an `orphans[]` collection, each entry carrying the recipe id and name and a `disposition` (`pruned` for auto-removed provenance-matched recipes, `reported` for preserved orphan candidates), plus a `recipes.pruned` count.

### Import progress feedback

A system import MUST surface live progress to the GM while it runs, advancing at phase boundaries and periodically through the recipe phase, so a large import is not indistinguishable from a frozen client.
Progress reporting MUST NOT alter the import's final state, summary counts, or reference reporting.
Progress feedback MUST reach a terminal (dismissed) state on every exit path — successful completion, an already-installed skip, and a thrown failure before completion — so a failed import never leaves a frozen progress indicator on screen until reload.
Terminating the progress indicator on failure MUST NOT suppress, wrap, or alter the error the import propagates to its caller.

### Round-trip integrity

For supported authoring data, a single-store keep-mode `export → import → export` MUST be equivalent modulo the volatile envelope fields `exportedAt` and `fabricateVersion`.
Equivalence is over the RECONSTRUCTED authoring data, not the literal key set: a bundle carrying the flat top-level `results` alias, or carrying a field at the value its constructor rebuilds from absence, MUST come back describing the same recipes even though the re-export omits those keys (`data-models/spec.md` requirement 18 and § Write-Retired Aliases).
Losing a result that reached the payload only through the flat alias would be a round-trip failure, which is why the read fallback is permanent rather than a migration window.
`craftingCheck.maxModifierPicks` MUST round-trip through `export → import → export` under keep mode, and an ABSENT cap MUST stay absent for every rule the derivation above does not stamp — absence is the "unlimited" value, so writing a bound where the source had none would truncate recipe picks the bundle carries.
`CraftingSystem.modifiers` — the ONE system-level modifier library (issues 1095, 1117), with each entry's absence-preserving `min` / `max` — MUST round-trip under keep mode, as MUST each of the three activity checks' `defaultModifierPolicy` / `defaultModifierIds` / `maxModifierPicks` selection triple.
`buildExportPayload` deep-clones the system, so the top-level catalogue round-trips for free once `_normalizeSystem` emits it there; an entry that authored NEITHER bound MUST come back with neither key, because a `min: 0` acquired in transit is a legal-looking catalogue that silently zeroes the modifier.
Every SUBJECT pick MUST round-trip, including an AUTHORED EMPTY array, which is distinct from an absent one: `Recipe.craftingModifier.modifierIds`, `Component.salvage.checkModifierIds` and `GatheringTask.checkModifierIds`.
A bundle carrying the pre-1095 `craftingCheck.checkModifiers`, the pre-1117 `CraftingSystem.checkModifiers`, a gathering-slice `characterModifiers` library, or the legacy `byRecipe` token is upcast by the export-payload transforms (`applySystemCheckModifierCatalogue`, then `applyUnifiedModifierLibrary`) and is NOT required to round-trip in its legacy form.
The two run in that order because it is observable: the merge reads only the system-level key, so running it first would merge an empty catalogue out of a pre-1095 bundle and then retire it.
The gathering slice therefore carries NO `characterModifiers` on export, and a re-keyed entry's references inside the slice are rewritten with it.
A legacy recipe-level `craftingModifier.policy` in a source bundle is inert and is not required to round-trip: `Recipe._normalizeCraftingModifier` drops it on read (see `data-models/spec.md` requirement 13a), and no resolver consults it.
The world `currencyConfig` slice MUST round-trip under keep mode into an UNCONFIGURED destination world — every unit, its `contains[]` breakdown, the spend strategy, the provider, and the macro set.
Into an ALREADY-CONFIGURED destination the round trip is deliberately NOT identity, and that is the merge rule rather than a round-trip failure: a destination unit id wins over the incoming definition and the destination's scalars are left alone, so the re-export describes the destination's ladder.
A bundle carrying the pre-`3` per-system currency block is upcast by the hoist above and is NOT required to round-trip in its legacy form.
The world `travelConfig` slice MUST round-trip under keep mode into an UNCONFIGURED destination world — every realm, its `sceneMappings`, its biomes and modifiers, the reveal mode and the modifier visibility.
Into an ALREADY-CONFIGURED destination the round trip is deliberately NOT identity, on the same terms as currency: a destination realm id wins over the incoming definition and the destination's scalars are left alone.
A bundle carrying the pre-`4` per-system realm library is upcast by the hoist above and is NOT required to round-trip in its legacy form.
`Component.complications` MUST round-trip under keep mode in full, macro uuids included, and an ABSENT `complications` MUST stay absent — absence and an empty list are the same state by `data-models/spec.md` § Component requirement 20, so a round trip that materialized an empty array would be inventing a key the normalizer refuses to write.

## Out of Scope

- Gathering parties, which remain excluded from system import/export (see `data-models/spec.md`).
- An opt-in "include runtime state" export toggle, which is deferred; the schema is versioned so it can be added additively.
- Cross-world document creation (scenes, macros, source items); Fabricate preserves and reports these references but does not create the referenced documents in the target world.

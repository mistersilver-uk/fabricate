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
  The modifier library moved onto the crafting system in issue 1117 and off it again, to world scope, in issue 1308; it now travels in the `characterLibraries` slice.
- The `currencyConfig` world setting (the world coin ladder, spend strategy, provider, and macro set; see `data-models/spec.md` -> CurrencyConfig).
  Currency moved to world scope in issue 1278; each crafting system carries only `requirements.currency.enabled`.
- The `travelConfig` world setting (the world realm library, its reveal mode and its modifier visibility, including each realm's Foundry Scene Region `sceneMappings`; see `data-models/spec.md` -> TravelConfig).
  Travel moved to world scope in issue 1282; each crafting system carries only `gatheringRealmSettings.enabled`.
- The `characterLibraries` world setting (the world character-prerequisite library and the world modifier library; see `data-models/spec.md` -> CharacterLibraries).
  Both libraries moved to world scope in issue 1308; a crafting system carries neither key and no participation flag over them.
- The excluded `gatheringParties` world setting.

## Requirements

### Export completeness

A system export MUST include every supported GM-authored record type for that system.
This spans the `craftingSystems`, `recipes`, `gatheringEnvironments`, `gatheringConfig`, `currencyConfig`, `travelConfig`, `characterLibraries`, `componentScope`, `essenceScope`, and `toolScope` settings.
The per-system `economy` slice (stamina defaults and resource-node/limitation flags) MUST ride along.
The world currency configuration MUST ride along as its own envelope slice even though it is not part of the `CraftingSystem` record, because an exported recipe's currency option and an exported component's salvage currency requirement both name a unit by `id` and are unusable in the destination world unless that unit arrives with them.
Unlike the gathering slices there is no per-system filtering to do: the world has exactly one currency configuration, so the whole of it travels.

The world travel configuration MUST ride along as its own envelope slice for the same reason and on the same terms: an exported environment's `includedRealmIds` / `excludedRealmIds` name realms by `id` and are unusable in the destination world unless those realms arrive with them.
The whole library travels rather than the subset one system's environments happen to cite, because a realm is geography rather than a per-system record and there is no owning system to filter by.

The world character libraries MUST ride along as their own envelope slice, on the same terms and for the same reason: an exported book's `caps.learn.characterPrerequisiteIds`, an exported tool's `prerequisites.ids` and an exported check's `defaultModifierIds` all name entries by `id` and are unusable in the destination world unless those entries arrive with them.
The slice carries BOTH libraries under one key, `characterLibraries`, mirroring the setting — but each is assembled by its own normalizer, and every rule below treats the two independently.
The whole of each library travels, because since issue 1308 there is no owning system to filter by.

The three WORLD-SCOPE ENTITY settings — `componentScope`, `essenceScope` and `toolScope` — MUST ride along as their own envelope slices, one per setting, each carrying the three layers `data-models/spec.md` -> Scoped Entity Definitions requirement 13 names: the world entity roster, the world defaults, and the per-`(entity, system)` membership records.

**Unlike currency, travel and the character libraries, these slices MUST be FILTERED BY MEMBERSHIP to the exported system.**
Those three travel whole because there is no owning system to filter by.
That reasoning does not transfer: here there IS an owning relation, and it is membership.
`membership` is filtered to the exported system's id, and `entities` and `defaults` are filtered to exactly the entity ids that filtered set names.
Shipping the unfiltered roster would import a foreign world's ENTIRE component roster into the destination — every entity of every system that world runs — which is the opposite of what a per-system export means.

The consequence is stated rather than left to be discovered: a reference in the exported system naming a world entity the system has NO membership record for does not travel.
That is requirement 3's REFUSAL rather than a prune, and it lands in the destination as an ordinary broken internal reference — reported verbatim and never repaired.

**The WORLD TOOL-BREAKAGE AUTHORITY MUST NOT travel.**
It is `toolScope`'s fourth sub-key, world scope rather than entity scope, and the currency and travel precedent of seeding a scalar into an unconfigured destination MUST NOT be followed for it: the `1.30.0` migration writes NO world authority at all, so that rule would fire on essentially every import and hand a destination world an authority no GM there authored.
Omitting it from the export assembler is necessary but NOT SUFFICIENT, because a HAND-EDITED payload never reaches that assembler and the shared migration preserves every unrecognised key through its extras spread.
It MUST therefore be DROPPED BY THE PAYLOAD UPCAST, and REPORTED.

Completeness is a property of the authoring DATA, not of the key set: an exported recipe carries whatever `Recipe.toJSON()` emits, which since issue 1087 omits the flat top-level `results` alias and every field whose absence the constructor rebuilds to the identical value (see `data-models/spec.md` requirement 18).
An export produced after that change is therefore smaller and key-sparser than one produced before it while describing the same system, and MUST NOT be treated as incomplete for the keys it leaves out.
Import MUST keep ACCEPTING both, permanently: the read fallbacks are what let an export authored by any earlier version — or by third-party content that never round-tripped through this module — still import with every result and every authored value intact.

### Explicit schema markers

The export envelope MUST carry an integer `schemaVersion` that is distinct from `fabricateVersion`.
The current schema version is `6`.
Schema `6` added the three envelope-level world-scope entity slices (`componentScope`, `essenceScope`, `toolScope`); schema `5` added the envelope-level `characterLibraries` slice; schema `4` added the envelope-level `travelConfig` slice; schema `3` added the envelope-level `currencyConfig` slice; schema `2` added the explicit version marker and the runtime-state boundary flag.

**Schema `6` is NOT A LIFT, and that breaks with the previous three bumps.**
Schemas `3`, `4` and `5` each moved data OFF the system and reduced or deleted the system's own copy, pairing a hoist with a strip.
Schema `6` has no hoist and no strip half, because the source data has not left the system: the in-system `components`, `essenceDefinitions` and `tools` arrays survive and the in-system record remains AUTHORITATIVE until the consumer sweep (`data-models/spec.md` -> CraftingSystem requirement 36).
The invariant is therefore ONE-DIRECTIONAL, and is stated in the only form that is true of the whole upcast: it MUST NOT REMOVE a key from any record of `system.components`, `system.essenceDefinitions` or `system.tools`, nor change the value of a key the input carried.
"Deep-equal to the input" is false for a schema-`1` payload independently of this change, because the first-class tool upcast already ADDS keys to a component-linked tool.
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

A pre-`5` payload carries both character libraries on the system at `characterPrerequisites` and `modifiers`, and `migrateExportPayload` MUST hoist them to the envelope-level `characterLibraries` and DELETE the system's own keys, using the SAME transforms the world-side `1.28.0` migration applies (`buildWorldCharacterLibraries` / `stripSystemCharacterLibraries`), not a second implementation of them.
Nothing is left behind on the system: unlike currency and travel there is no participation flag, so the strip is a deletion rather than a reduction.
This hoist MUST also run branch-independently, for the reason every other field-level upcast does, and MUST be idempotent.
**Its already-lifted guard MUST key on the LISTS being non-empty, not on the slice being present**, because `buildExportPayload` always emits the slice with both keys: a presence check would read every current-schema export as already lifted and then strip the system's copy, losing both libraries outright for any payload whose system still carries them.
Keying on the lists is safe here precisely because this slice has NO scalars — unlike currency and travel, there is no configured-but-empty state an emptiness check could mistake for absence.
The guard MUST be a TWO-LIST DISJUNCTION for the reason the world migration's is: either populated library proves the lift already ran, so an export from a world that authored only modifiers does not get its prerequisite half rebuilt from a system block already stripped.

A payload whose gathering environments carry `forcedTaskIds` / `forcedEventIds` MUST have the world-side `1.29.0` transform applied to `gatheringEnvironments`, using the SAME function that migration applies (`applyManualCompositionForceFold`), not a second implementation of it.
Import is a second ingress for exactly the records that migration rescues: `importReferenceResolver` carries the force lists through untouched, so a bundle exported before the upgrade and imported after it would arrive with a manual environment's composed records sitting in a list the engine no longer honours in that mode (see *gathering-and-harvesting* §12a/§12b).
The MANUAL FOLD is NOT keyed on `schemaVersion` and MUST run branch-independently: the force lists are an old ARRANGEMENT of current fields, so every bundle the shipping build writes carries the current schema and would skip a legacy-branch-only transform.
It is safe unconditionally because after `1.29.0` no manual environment can carry a force list at all — the control that wrote one does not exist in that mode — so a manual force list is pre-upgrade by construction.

**Clearing an AUTOMATIC force list MUST NOT run on the current-schema branch.**
That branch runs on every payload forever, so clearing there would delete a legitimate automatic-mode force add on every export/import round-trip, permanently, for the very affordance `1315` moved into that mode.
The legacy branch MUST still clear, because a bundle carrying no schema marker predates the upgrade and its automatic force entries are the residue `1.29.0` repairs.
The residual case is a bundle stamped at the current schema but authored before the upgrade: its automatic residue is carried through and, under the new rule, composes.
That is accepted as the lesser cost — it affects only worlds exporting across the upgrade boundary, whereas clearing would break the feature for every world forever.
It is idempotent, because a second pass finds no manual force list to fold and does not clear what it preserved.

A pre-`6` payload carries no world-scope entity slices at all, and `migrateExportPayload` MUST DERIVE all three from the bundle's own system by applying `migrateWorldScopeEntities` — the SAME `1.30.0` function the world-side migration applies — to a synthesized ONE-SYSTEM corpus, not a second implementation of it.
An export bundle IS a one-system corpus, which is the same degeneracy the currency, travel and character-library hoists already exploit.
It MUST run branch-independently, for the reason every other field-level upcast does, and it MUST run AFTER the first-class tool upcast, so a legacy bundle's tools are first class before the grouping reads them.

**It MUST convert the envelope's `defaults` and `membership` ARRAYS to the persisted MAP shape before applying that function, and MUST project them back to arrays afterwards.**
The shared function reads those two sub-keys only as maps and SILENTLY IGNORES an array rather than rejecting it, so passing the envelope's own shape in would discard both layers, defeat the per-`(entityId, systemId)` lift guard, and REBUILD a membership record a GM hand-edited.
The map key MUST be DERIVED from each record — `defaults` by its own `id`, `membership` by `"<entityId>|<systemId>"` — and never carried, because a key that disagrees with its record produces a DUPLICATE record rather than an error: nothing validates a key against its record on the way in.
A record that cannot be keyed, for want of a usable `id`, `entityId` or `systemId`, MUST be dropped before the call.
Passing the payload's own slices in that shape is also what supplies IDEMPOTENCE, so there is no slice-level presence check to get wrong: there is no presence check.

It MUST adopt ONLY the three scope keys from the result and MUST NOT adopt the returned `systems`, `recipes` or `gatheringConfig`.
That discard is LOAD-BEARING rather than defensive: the shared function unions every legacy source-reference spelling into `aliasItemUuids` even for a singleton group and writes the merged identity back onto every in-system record, so adopting the returned systems would rewrite in-system identity through the import door — which the one-directional invariant above forbids.
It MUST NOT hand back a value that ALIASES the shared function's result, because that function answers the ORIGINAL object for a key it did not change and a later in-place reference rewrite would otherwise reach the caller's payload.

For a one-system corpus the re-key map MUST be EMPTY for every ACCEPTED `(system, entityType)` pair among the re-keyable types — components and tools; essences are never re-keyed and carry no map — and a pair whose map is non-empty MUST be REFUSED, so no imported bundle is ever re-keyed.
A REFUSED pair MUST yield an empty slice AND a REPORTED refusal, never a silently empty slice: an empty slice alone is indistinguishable from a system with no world members.

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

### Character libraries merge on import

Import MUST merge the payload's `characterLibraries` into the destination world's own NON-DESTRUCTIVELY, on exactly the terms the currency and travel merges use and for the same reason: both libraries are world scope, so there is no key under which an import may simply replace what is there, and overwriting would destroy libraries the destination GM authored for systems that have nothing to do with this import.

**The merge MUST be TWO independent id-keyed merges, one per library, and MUST NEVER be a single object-level merge.**
The two lists share one setting key for persistence economy only and share no invariant (`data-models/spec.md` -> CharacterLibraries requirements 1 and 2).
A single object-level destination-wins merge would let a destination world that has prerequisites but no modifiers win the whole slice and silently discard every incoming modifier — the concrete harm the per-library rule exists to prevent, and one that leaves every imported check, drop row and event citing modifier ids that name nothing.

Entries MUST merge by `id` with the DESTINATION winning a collision: an id already present in the destination keeps its own definition, and only genuinely new entries are appended.
That is what makes an import safe to run twice, and it is what keeps the destination's existing books, tools and checks resolving to the rules their author meant.
The merge MUST NOT reorder or remove a destination entry.
There are no scalars in this slice, so there is nothing to seed and no unconfigured-world special case.

An incoming slice adding no entry to either library MUST write nothing, so an import that changes no character-library data issues no setting write.
Copy-mode import MUST NOT regenerate character-prerequisite or modifier ids: they are cross-referenced by book learning gates, tool requirement gates, all three activity checks' default sets, every subject pick, and every gathering drop row, event and stamina cost, and regenerating them would orphan every one of those references (see `data-models/spec.md` -> CharacterLibraries requirement 7).
They are world scope and already merge destination-wins, so rebinding them would fork the world's own rules once per copy.

**The character-libraries merge MUST run BEFORE the crafting system is created or updated, and MUST reach the destination through the store rather than behind its cache.**
This is the ONE ordering difference between this slice and the currency and travel slices, which are persisted LAST because nothing reads them during normalization.
Both of these libraries ARE read during normalization: `CraftingSystemManager` derives its Valid Id Basis from them on every system normalize, so a system created while the incoming entries are still only in the payload has every tool prerequisite reference and every default modifier id pruned against a basis that cannot yet see them.
Writing the setting earlier is necessary but not sufficient — a direct setting write leaves the store's cache holding the pre-import libraries, and the manager reads the cache — so the merge MUST refresh the store as part of the write.

### World-scope entity merge on import

Import MUST merge each of the payload's three world-scope entity slices into the destination world's own scope NON-DESTRUCTIVELY, on the terms the currency, travel and character-library merges use and for the same reason: these are world scope, so there is no key under which an import may simply replace what is there.

**Each slice MUST be THREE INDEPENDENT per-layer id-keyed merges, and MUST NEVER be a single object-level merge.**
`entities` merges by `id`, `defaults` by `id`, and `membership` by the `(entityId, systemId)` pair, with the DESTINATION winning every collision and no destination record ever reordered or removed.
A single object-level merge would let a destination holding entities but no defaults win the whole scope and silently discard every incoming default, which is the same harm the two-library rule above exists to prevent.

**The merge MUST be SPLIT across system creation.**
`entities` and `defaults` MUST be merged BEFORE the crafting system is created or updated, because `CraftingSystemManager` derives its Valid Id Basis from the `entities` sub-key on every normalize: a system created while the incoming world entities are still only in the payload has every essence quantity pruned against a basis that cannot yet see them.
`membership` MUST be merged AFTER it, because the destination's system id does not exist until then — copy-mode import removes the payload's id, and a keep-mode overwrite may resolve an existing system by NAME under a different id — and every incoming membership record's `systemId` MUST be REWRITTEN to the resolved destination system id.
The persisted map key follows for free, because it is re-derived from the record on every normalize.

The two writes are NOT atomic, and the intermediate state is stated rather than hidden: a set of world entities with no membership record for the imported system.
That state is INERT, because requirement 3 makes an absent membership record a REFUSAL and never a prune and the basis union is deliberately not membership-filtered.
Re-running a KEEP-mode import repairs it, because the destination-wins merge makes the second run additive.
A COPY-mode re-run does NOT repair it: it creates a second system rather than completing the torn one, and the torn one keeps its memberless world entities until a GM deletes them.

All of it MUST reach the destination THROUGH THE STORE rather than behind its cache, and **the merge base MUST be the store's own persisted projection** — never an object built from the three sub-keys alone.
Normalization rebuilds a scope's unrecognised keys from the raw argument, so building the merge from the three sub-keys ERASES the destination's WORLD TOOL-BREAKAGE AUTHORITY, which MUST survive an import verbatim.
An ABSENT store seam MUST SKIP the merge rather than construct one, so an import can never write into a synthesized, unseeded destination.

**A merge MUST NOT write into a scope the destination has not already SEEDED**, judged per sub-key on `entities` and never on the aggregate form, which ORs across sub-keys.
Any first write flips that entity type's Valid Id Basis from UNKNOWN to KNOWN across every system in the world, including systems the import never touched.
So an import into an unmigrated world leaves its three settings ABSENT and behaves exactly as the previous schema does; the derived slices are computed and then DISCARDED, and nothing is lost, because when that world later migrates the `1.30.0` pass derives the world entities for the imported system from the in-system arrays the import did land.
Because the destination is already seeded whenever a write happens, the merge only ever WIDENS a KNOWN basis, and widening a basis can never prune anything that was surviving.

An incoming slice adding no record to any of the three layers MUST write nothing, evaluated INDEPENDENTLY for each of the two writes.

### World-default constraint re-check on import

A carried world default that the import would ADD MUST have its constraints RE-EVALUATED against the DESTINATION's merged corpus, per SECTION.
A destination record already present WINS and is never re-examined.
The five constraints (`destructive-changes-and-migrations/spec.md` -> World-Scope Entity Migration requirement 7) are all decided against the SOURCE world at migration time, and none survives a membership-filtered export unexamined: the every-member precondition was decided over systems the export does not carry, and a world-addressable `effectSource`, `onBreak.replacementTarget.componentId` or `repairRequirements` group may name a component absent from the destination entirely.

**The re-check corpus MUST be the LOGICAL UNION of the destination's persisted membership and the INCOMING membership slice, and MUST NOT be persisted state alone.**
The membership layer is written AFTER the defaults layer, so a persisted-only reading makes the every-member precondition VACUOUSLY TRUE for every entity the import mints — and the second write then lands a membership record inheriting a value no system in the destination authored, which is the exact behaviour that precondition exists to prevent.
The incoming records MUST count as ONE system distinct from every destination system, under a SYNTHETIC token and regardless of the payload's own identifier, because that identifier names the destination's system in neither mode.

That union is deliberately CONSERVATIVE and MAY decline a default that was valid against the DESTINATION ALONE, because the union has more members than the destination had.
Over-declining is LOSSLESS; under-declining is not.
The claim is stated against the destination alone rather than as "valid in each world separately", because that stronger form is UNREACHABLE: every predicate here is either universally quantified over the member union or a membership test on a roster that only ever grows, so validity over each half implies validity over the union, and no fixture can exhibit the case.

The every-member precondition binds the three sections a membership record cannot express an empty override for, and at import time it is the SAME PREDICATE the migration applies — literally the same one, not the same rule restated.
It does NOT reduce to whether the merged record carries the section key.
That reduction is sound only for a record the migration's own builder produced, and a HAND-AUTHORED payload is a first-class input here: a `category` of `''` or whitespace carries the key, is coerced to ABSENCE by the store on the way in, and then falls back to the very world default the precondition was asked to decide — handing the imported system a value no GM authored, which is exactly what the precondition exists to prevent.
The three addressability rules and the repair-requirements rule are decided against the merged world component roster and the merged membership.

**When the component scope is not SEEDED in the destination, so no component roster will be written, every section carrying a component reference MUST be DECLINED**, because the roster those rules consult is undecidable.
A section carrying no component reference — a dotted-UUID `effectSource`, an `itemUuid` `onBreak`, a `category`, a `breakage` — is unaffected.
This is not an inversion of the unknown-basis rule for destructive passes: that rule refuses to let an unknown basis license a DELETION, and this one refuses to let it license a DANGLING SEED.

A section that FAILS is DECLINED: its key is dropped from the incoming record before it merges, the world ENTITY and every membership record are untouched, a record left carrying only its `id` is not written at all, and the decline is REPORTED.
Declining is LOSSLESS, because every incoming membership record still overrides every section with its own system's value verbatim — a world default matters only for a system added LATER or an override cleared later, which is exactly the case a destination-blind default would get wrong.

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

Import MUST additionally emit four WORLD-SCOPE ENTITY kinds, each carrying the shipped `reported` disposition; the disposition vocabulary is UNCHANGED.

- `worldEntityCollision` — an incoming entity id equals a DESTINATION world entity's id while their source-reference sets prove they are different items.
  It RESOLVES, to the wrong thing, which is why it is reported and not repaired: keep mode must not regenerate anything.
  It applies in keep mode for all three entity types and in COPY mode for tools and essences, whose identifiers copy mode preserves verbatim; components in copy mode are protected by the match-or-mint rule below.
  **The ESSENCE arm of this rule is VACUOUS in practice, and is stated rather than quietly relied on:** an essence id is a stable semantic slug that the world-scope grouping treats as the identity itself, so no world essence entity carries a source link at all and the disjointness test can never find the positive evidence it requires.
  The rule is still stated over all three types, so a world essence that ever acquired a source link is covered without an amendment; it is not a tested arm today.
  It is also the kind under which a copy-mode MULTI-MATCH reports each losing candidate, and under which a copy-mode CONTENTION — two incoming records wanting the same destination entity — reports the contested id against BOTH owners.
- `worldEntityMissing` — a membership record or world default whose entity id names no entity in the MERGED roster.
  It is UNRESOLVED, the class this section already models.
- `worldDefaultDeclined` — a world-default SECTION the destination re-check refused.
- `worldToolBreakageDropped` — an incoming `toolScope.toolBreakage` authority dropped by the payload upcast.
  It is a SEPARATE kind because the authority is not a world default: it is `toolScope`'s fourth sub-key, world scope rather than entity scope, and folding it into `worldDefaultDeclined` would make the kind name assert a falsehood about what it reports.

The first three MUST reuse the existing entity-specific `ownerType` values `component`, `tool` and `essence`.
A WORLD-SCOPE entry — one whose subject is a SETTING rather than a record, which `worldToolBreakageDropped` alone is — MUST use the existing `unknown` ownerType and name the SETTING as its owner, rather than introducing a scope-level ownerType.
A generic `worldEntity` or `worldScope` ownerType is the unsearchable generic the domain naming rules reject, and in a report already grouped by kind it would lose the entity type as well.

`worldDefaultDeclined` is an explicit EXCEPTION to the preserve-verbatim rule above, and the reason is what makes it an exception rather than a breach: a world default is a DERIVED SEED rather than authored destination data, and preserving a non-addressable one bakes a dangling ingredient group into every system that later adopts the entity, with no reader that can report it.

### Copy-mode identifier rebinding

Copy-mode import MUST rebind record-container identifiers: the system identifier and environment record identifiers.
Realm identifiers are deliberately NOT among them since issue 1282 (see the travel-configuration merge above): they are world scope, and a copy that minted fresh ones would duplicate the world's geography rather than recognise it.
**Copy-mode import MUST bind an incoming component to the destination's existing world entity where their source references say they are the same item, and MUST mint a fresh identifier only where they do not.**
This RETRACTS the previous rule that copy-mode import regenerate every component identifier.
That rule was correct while component ids were per system; once they name WORLD entities it became the duplication epic 1357 exists to end, because re-importing a pack the destination already has created a second world record for every real item in it.

The source-reference set MUST be computed over the IN-SYSTEM record and never over the derived world-entity slice, across the six shipped and legacy spellings — `originItemUuid`, `registeredItemUuid`, `sourceUuid`, `sourceItemUuid`, and `aliasItemUuids` OR, only in its absence, `fallbackItemIds` — with a tool that carries no references of its own deriving through its `componentId`.
The in-system record keeps its legacy spellings, whereas the derived world entity has already canonicalised them into `aliasItemUuids`, so matching over the slice would silently narrow the rule to the modern spellings alone.
An incoming entity whose set INTERSECTS an existing destination world entity's set MUST bind to that entity's id; an unmatched or UNLINKED entity MUST mint.
An incoming set intersecting MORE THAN ONE destination entity MUST bind to the LARGEST intersection with a deterministic first-wins tie-break and MUST REPORT the ambiguity; it MUST NOT merge the destination's entities and MUST NOT mint.
The destination index MUST be supplied by the caller, and a copy-mode call without one MUST FAIL rather than fall back to minting.

**THE BINDING MUST BE INJECTIVE: one destination world entity MUST be claimed by at most ONE incoming record per import.**
The converse of the multi-match rule is the case that loses data, and it is reachable two ways that are both ordinary: two incoming records sharing a source reference outright, and two incoming records sharing NOTHING with each other that both intersect a destination entity whose own set was WIDENED by the `1.30.0` grouping's union.
So "intersects a destination entity" is NOT an equivalence relation over the incoming records and cannot partition them, and a binding that lets two records take one id makes the second one VANISH: a duplicate definition id is last-wins in every index builder and the read union de-duplicates by entity id, so the record disappears from the screen, from the index and from the engine with no error raised anywhere.
The same corpus is REFUSED outright by the migration's output-uniqueness post-condition, and one release must not answer the same question two ways.

The rule is therefore the ID-CLAIM LADDER (`destructive-changes-and-migrations/spec.md` -> World-Scope Entity Migration requirement 4), keyed on the destination id rather than on a group's members: the best intersecting candidate if UNCLAIMED, else the next unclaimed intersecting candidate in the same ranked order, else MINT.
Every contested destination id MUST be REPORTED, naming BOTH the record that claimed it and the record that wanted it, because a contention the GM cannot attribute is not actionable.

**The middle rung is required, not an optimisation.**
Minting as soon as the best candidate is claimed is neither ORDER-STABLE nor IDEMPOTENT: destination roster order is the key order of a persisted setting that nothing in this pipeline sorts, and a record that mints because its preferred candidate was taken mints again on every subsequent import, adding one world entity per import forever — since the entity it minted last time is never the one it prefers this time.
Taking the next unclaimed candidate binds to that previously minted entity instead, so a re-import adds nothing.

The guarantee the previous rule provided survives, restated accurately: two copies share an id only when each INTERSECTS THE SAME destination world entity — so the two would have resolved to that one world entity had they been grouped in one corpus.
It is deliberately NOT stated as "their own sets intersect each other": because a destination entity's set may have been widened by the grouping's union, two incoming records that share no reference at all can each intersect it, and only the injectivity rule above — not the intersection relation — is what keeps them apart.

Copy-mode import MUST atomically remap every within-payload reference to a rebound or minted component id.
The remapped references are: recipe ingredient-option and result component refs including the `systemItemId` alias, the recursive `alternatives[]` refs, and the legacy flat `ingredients`/`results` aliases; `tool.componentId` in both the system and gathering-library tool slices; tool `onBreak.replacementComponentId`; essence `sourceComponentId`/`associatedSystemItemId`; component salvage result refs; gathering task/event drop-row `componentId`; and legacy `catalysts[]` component refs when present in a legacy or hand-edited payload.
Copy-mode import MUST also regenerate recipe identifiers, and MUST atomically remap every within-payload recipe-book membership reference (`recipeItemDefinitions[].recipeIds` entries) to the regenerated recipe id, so a copy's books resolve to the copy's recipes.
The remap MUST be key-aware and per id class: a value at a non-reference position that coincidentally equals an id MUST NOT be rewritten by that class's remap.
A `recipeIds[]` entry is protected from the component-id remap but IS rewritten by the recipe-id remap; an outcome or salvage-group id, or a scene or macro UUID, is rewritten by no remap.
A membership entry naming a recipe id absent from the payload MUST be preserved verbatim and reported as a broken internal reference.
After the transform, no within-payload reference may point at a pre-regeneration or absent component id, and no `recipeIds[]` membership entry may point at a pre-regeneration recipe id.
The map MUST additionally rewrite every component reference INSIDE the three world-scope entity slices — each `defaults` record and each `membership` record, on the same section shape the shared walk already visits for a membership record — together with each `defaults` record's own `id`, each `membership` record's own `entityId`, and the incoming world entity roster's own `id`.
A MATCHED entity's roster record MUST be DROPPED from the incoming roster rather than added under its pre-import id, which would create a second world record for an item the destination already holds and would leave every membership record naming a world entity absent from the merged roster.
Dropping rather than re-keying is stated deliberately: re-keying and relying on the merge's destination-wins collision rule is observationally equivalent under a CORRECT merge, and choosing it would make this rule's correctness depend on that one being right.

Tool and essence identifiers are unaffected — copy mode never regenerated them — and an id collision on either is REPORTED rather than repaired.

Copy-mode import MUST preserve task, event, character-modifier, recipe-item-definition, and salvage-group identifiers so environment-to-library linkages and routing survive.
Character-prerequisite and modifier-library entry identifiers are preserved for a stronger reason since issue 1308: they are world scope, so a copy that minted fresh ones would fork the world's own rules rather than duplicate a per-system record.
Component **complication** identifiers join that preserve list: nothing outside the owning component references one, and every runtime key that names a complication pairs its id with a component id or a result id the component-id remap already rebinds on its own half.
Keep-mode import MUST NOT regenerate component identifiers or any reference; under keep mode the map is the identity map and every one of the targets above is inert.

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
The world modifier library (issues 1095, 1117, 1308), with each entry's absence-preserving `min` / `max`, MUST round-trip under keep mode, as MUST each of the three activity checks' `defaultModifierPolicy` / `defaultModifierIds` / `maxModifierPicks` selection triple.
An entry that authored NEITHER bound MUST come back with neither key, because a `min: 0` acquired in transit is a legal-looking library entry that silently zeroes the modifier.
Since issue 1308 the library round-trips through the `characterLibraries` envelope slice rather than through the system object, and a full export's system object MUST carry NEITHER `modifiers` NOR `characterPrerequisites`.
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
The world `characterLibraries` slice MUST round-trip under keep mode into an UNCONFIGURED destination world, and MUST do so PER LIBRARY: a destination configured with one library and not the other MUST receive the whole of the library it lacks, which is the assertion a single object-level merge would fail.
Into an ALREADY-CONFIGURED destination the round trip is deliberately NOT identity, on the same terms as currency and travel: a destination entry id wins over the incoming definition, per library and independently.
A bundle carrying the pre-`5` per-system libraries is upcast by the hoist above and is NOT required to round-trip in its legacy form.
The three world-scope entity slices MUST round-trip under keep mode into an UNCONFIGURED-BUT-SEEDED destination world, PER LAYER, on the character-libraries terms: a destination whose scope has been written but holds nothing MUST receive the whole of every layer.
Into an ALREADY-CONFIGURED destination the round trip is deliberately NOT identity, on the same terms as currency, travel and the character libraries: a destination entity, default or membership record wins over the incoming one, per layer and independently.
The destination therefore holds identity DRIFT by construction — the world record is the destination's while the system arrives carrying the SOURCE's in-system identity — which is the same state the `1.30.0` migration accepts and which the shipped world-identity drift detector is the detector for.

Under COPY mode, and scoped to a SEEDED destination because the seeding gate makes it untrue for an unmigrated one, two copy-imports from one origin MUST resolve every LINKED component to the SAME world entity id and every UNLINKED component to a disjoint id, and the second import MUST mint ZERO world entities for the linked components while minting exactly one per unlinked component.

After ANY import, every membership record the import wrote MUST name the DESTINATION's system id.

`Component.complications` MUST round-trip under keep mode in full, macro uuids included, and an ABSENT `complications` MUST stay absent — absence and an empty list are the same state by `data-models/spec.md` § Component requirement 20, so a round trip that materialized an empty array would be inventing a key the normalizer refuses to write.

## Out of Scope

- Gathering parties, which remain excluded from system import/export (see `data-models/spec.md`).
- An opt-in "include runtime state" export toggle, which is deferred; the schema is versioned so it can be added additively.
- Cross-world document creation (scenes, macros, source items); Fabricate preserves and reports these references but does not create the referenced documents in the target world.

# Rename Gathering Regions to Gathering Realms

## Summary

Rename the Fabricate gathering-geography concept **Gathering Region** to **Gathering Realm**
root-and-branch across persistence, runtime, stores, the public JS API, UI, i18n, specs, and docs.
Foundry VTT ships its own first-class **Region** (`RegionDocument` scene object + Region Behaviour),
and a single Fabricate region is frequently mapped *many-to-one* from several Foundry Scene Regions
through `sceneMappings`. The shared word "Region" is a constant source of confusion. Renaming the
**Fabricate gathering geography** concept to **Realm** removes the collision while leaving every
Foundry Scene-Region reference — the `RegionDocument` bridge, `sceneMappings`, `sceneRegionUuid`,
the `fabricate.interactable` Region Behaviour, and the Map Region Links tab — completely untouched.

The mechanic is unchanged. A Realm is still named geography scoped to one crafting system that owns
no tasks/events/drops, carries `enabled`/`secret`/`biomes`/`sort`, gates environment availability
through `includedRealmIds`/`excludedRealmIds`, and is discovered per-actor. Only the
ubiquitous-language term and every identifier, key, flag, route, CSS hook, and string derived from
it change.

## Motivation

Fabricate's gathering domain and Foundry's canvas both use the noun "Region" for different things.
A Fabricate region is geography you author in the Travel tab; a Foundry Region is a scene polygon
with behaviours. They are bridged (`region.sceneMappings[].sceneRegionUuid` points at a
`RegionDocument`) and the bridge is intentionally many-to-one. Authors, code readers, and i18n keys
constantly have to disambiguate "which Region?". Renaming the gathering concept to **Realm** makes
every reference unambiguous by vocabulary alone: a **Realm** is always the Fabricate geography, a
**Region** is always the Foundry scene object.

## Goals

- **Realm** is the only term for the Fabricate gathering-geography concept. No
  `Region`/`region`/`REGION` token survives for that concept in source, the public API, UI, i18n
  keys/values, CSS, specs, or docs.
- Persisted world data migrates automatically and idempotently with no data loss via a versioned
  `1.1.0` startup migration: `systems[*].gatheringRegions`→`gatheringRealms`,
  `gatheringRegionSettings`→`gatheringRealmSettings`; per-environment
  `includedRegionIds`/`excludedRegionIds`→`includedRealmIds`/`excludedRealmIds`; per-party
  `currentRegionOverrides`→`currentRealmOverrides` (inner `regionIds`→`realmIds`).
- The public `game.fabricate` JS API gains canonical `*Realm*` method names and keeps the old
  `*Region*` names as thin **deprecated delegates** (one-line console deprecation warn), so the
  rename is non-breaking for downstream macros and modules.
- The actor-scoped discovery flag (`discoveredGatheringRegions`→`discoveredGatheringRealms`) — which
  is NOT a world setting and so is not handled by the migration runner — is read with a
  **legacy-accepting fallback** in `gatheringRealmDiscovery.js` (read both keys, write the new key).
- The normalizer/store read paths accept the legacy `gatheringRegions*` / `*RegionIds` /
  `currentRegionOverrides` keys on import (un-migrated or pre-rename exports) and coerce them, so
  imported payloads load even before the startup migration rewrites them.

## Non-Goals

- **No change to any Foundry Scene-Region reference.** `RegionDocument`, `RegionBehavior` /
  `RegionBehaviorConfig`, `region.flags`, `region.uuid`, `TokenDocument#regions`,
  `senseSceneRegions`, `sceneRegionUuidsContainingToken`, the
  `INTERACTABLE_BEHAVIOR_SUBTYPE='fabricate.interactable'` Region Behaviour, and everything under
  `src/canvas/regions/`, `src/canvas/regionHitTest.js`, `src/canvas/InteractableManager.js`, and
  `src/ui/svelte/util/sceneRegions.js` are untouched.
- **No rename of the Foundry-bridge fields.** `sceneMappings`, `sceneRegionUuid`, and `sceneUuid`
  (members of a Realm record and of the discovery flag) stay verbatim — they name Foundry objects.
- **No change to the modifier value vocabulary.** The Realm modifier `kind` (`eventChance`,
  `dropRate`, `yield`, …), `operation` (`add`, `multiply`, …), and `visibility` (`visible`, `gmOnly`)
  *values* are not renamed; only the constant identifiers wrapping them
  (`GATHERING_REGION_MODIFIER_KINDS`→`GATHERING_REALM_MODIFIER_KINDS`) change.
- **No change to the Map Region Links tab structure.** `GatheringMapLinksTab.svelte`
  (`data-manager-map-region-uuid`), `MapRegionLinkPicker.svelte`, and the
  `PartiesInMapRegionTitle` / `JumpToRegion` / `PlaceRegionOnly` / `RegionOnlyHint` keys stay; only
  the Fabricate **link destination** copy ("Fabricate region"→"Fabricate realm") and the Fabricate
  picker option labels reword to Realm.
- **No rewrite of archived changes or shipped history.** `openspec/changes/unify-gathering-regions/`
  and `openspec/changes/location-aware-gathering-regions/` are left as-is, and
  `src/migration/migrateUnifyGatheringRegions.js` (plus its `_unifiedRegionSystems` identifiers)
  stays untouched — it is shipped history that produces the OLD schema the new `1.1.0` migration
  consumes.

## Migration

A versioned (`1.1.0`), idempotent migration converts each persisted payload from the region schema
to the realm schema: it renames the per-system collection (`gatheringRegions`→`gatheringRealms`) and
settings (`gatheringRegionSettings`→`gatheringRealmSettings`), the per-environment id lists
(`includedRegionIds`/`excludedRegionIds`→`includedRealmIds`/`excludedRealmIds`), and the per-party
override map (`currentRegionOverrides`→`currentRealmOverrides`, inner `regionIds`→`realmIds`). It
renames a key only when the old key is present and the new key absent, so a second run is a no-op.
The Foundry-bridge fields (`sceneMappings`, `sceneRegionUuid`, `sceneUuid`) and the modifier `kind`
values are left untouched. `1.1.0` becomes the new highest migration version (the current highest is
`1.0.0`, `migrateRenameGatheringHazardsToEvents`).

## Affected Specs

- `data-models`
- `gathering-and-harvesting`
- `ui-integration`

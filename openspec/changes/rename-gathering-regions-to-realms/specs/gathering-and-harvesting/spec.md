# Gathering And Harvesting Spec Delta

## Renamed Concept

### Gathering Region → Gathering Realm

The Fabricate gathering-geography concept is renamed from **Gathering Region** to **Gathering Realm**
to remove the collision with Foundry's own first-class **Region** (`RegionDocument` / Region
Behaviour). A Realm is still named geography scoped to one crafting system that owns no tasks/events/
drops, gates environment availability, and is discovered per-actor. The location-resolution,
disclosure, redaction, travel-guidance, and availability mechanics are unchanged — only the term and
its derived identifiers change.

Requirements:

1. The realm/travel/availability subsystem is gated by the per-system `gatheringRealmSettings.enabled`
   toggle (was `gatheringRegionSettings.enabled`), read through the single predicate
   `isGatheringRealmsEnabled(system)` (was `isGatheringRegionsEnabled`). When disabled (the default),
   every gate point behaves as if no environment is location-gated and no travel surfaces exist.
2. Current-realm resolution (`resolveCurrentRealms` / `buildCurrentRealmContext`, was
   `resolveCurrentRegions` / `buildCurrentRegionContext`) returns `realms` / `realmIds` /
   `staleRealmIds` (was `regions` / `regionIds` / `staleRegionIds`). The resolution order — GM manual
   override (including disabled realms as a GM diagnostic; missing ids become `staleRealmIds`) →
   travel-actor sensing → `unresolved` — is unchanged.
3. Environment location availability evaluates `includedRealmIds` / `excludedRealmIds` (was
   `*RegionIds`) plus the unchanged `includedBiomeIds` / `excludedBiomeIds` against the party's
   resolved current realms. Exclusions win; inclusion-gated with no current realm resolved blocks with
   `NO_CURRENT_REALM` (was `NO_CURRENT_REGION`); a matched-but-excluded or no-match-while-resolved case
   is `LOCATION_BLOCKED` (unchanged). The engine re-evaluates in the start-attempt guard, not just
   listing.
4. Realm disclosure (`buildRealmDisclosure`, was `buildRegionDisclosure`) NEVER leaks a secret
   undiscovered realm's id or name to a non-GM viewer (`id: null` + the
   `…Realm.UndiscoveredPlaceholder` key, was `…Region.UndiscoveredPlaceholder`). Travel guidance
   states (`noCurrentRealm` | `excluded` | `travel`) and the GM-only raw-id exposure are unchanged.
5. Per-actor realm discovery (`revealGatheringRealm` / `hideGatheringRealm` /
   `getDiscoveredRealmIdsForSystem`, was `…Region…`) writes validate that the realm belongs to the
   referenced system; reads accept the legacy `discoveredGatheringRegions` flag and write the new
   `discoveredGatheringRealms` key.

### Public API

Requirements:

1. `game.fabricate` exposes canonical `*Realm*` methods: `getGatheringRealmStore`,
   `setGatheringPartyRealmOverride`, `clearGatheringPartyRealmOverride`,
   `revealGatheringRealmForActor`, `hideGatheringRealmForActor`; and `game.fabricate.gathering`
   exposes `getRealmStore`, `setPartyRealmOverride`, `clearPartyRealmOverride`,
   `revealRealmForActor`, `hideRealmForActor`. `game.fabricate.api.GatheringRealmStore` is the
   canonical class export.
2. The old `*Region*` method/helper names (`getGatheringRegionStore`,
   `setGatheringPartyRegionOverride`, `clearGatheringPartyRegionOverride`,
   `revealGatheringRegionForActor`, `hideGatheringRegionForActor`, the matching `gathering.*`
   helpers, and `api.GatheringRegionStore`) are retained as thin **deprecated delegates** that emit a
   single console deprecation warning and forward to the new names. The rename is non-breaking.
3. `getGatheringLocationForActor` keeps its name (it carries no "Region" token) but its returned
   payload renames `regions` / `regionIds` / `staleRegionIds` → `realms` / `realmIds` /
   `staleRealmIds`.
4. All location-aware API methods continue to gate on `isGatheringRealmsEnabled` (no-op / `null` /
   `false` when the subsystem is disabled), and the reveal mutator continues to validate realm
   membership against the owning system snapshot.

## Unchanged: Foundry Scene Region

Foundry Scene Regions (`RegionDocument`, `RegionBehavior`, `senseSceneRegions`,
`sceneRegionUuidsContainingToken`, the `fabricate.interactable` Region Behaviour, and the
`sceneMappings`/`sceneRegionUuid` bridge) are Foundry's concept and are **not** renamed. The Map
Region Links tab — which links a Foundry Scene Region to a Fabricate Realm — keeps its structure and
key names; only the Fabricate **link-destination** copy ("Fabricate region"→"Fabricate realm")
rewords.

## Migration

A one-time, idempotent `1.1.0` migration rewrites persisted region keys to their realm equivalents
across `systems[*]`, `environments[*]`, and `gatheringParties[*]` (see the `data-models` delta),
leaving the Foundry-bridge fields and modifier values untouched.

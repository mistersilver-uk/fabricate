# Data Models Spec Delta

## Renamed Models

### Gathering Region → Gathering Realm

The first-class per-crafting-system geography concept formerly called **Gathering Region** is renamed
**Gathering Realm**. The record shape, ownership scoping, `enabled`/`secret`/`biomes`/`sort` fields,
scene-mapping bridge, and modifier list are unchanged; only the term and the identifiers/keys derived
from it change.

```js
GatheringRealm = {                                   // was GatheringRegion
  id: string,
  craftingSystemId: string,
  name: string,                                      // default "New Realm" (was "New Region")
  description: string,
  img?: string|null,
  enabled: boolean,
  secret: boolean,
  biomes: string[],
  sceneMappings?: GatheringRealmSceneMapping[],       // bridge; member field NAMES unchanged
  modifiers?: GatheringRealmModifier[],
  sort?: number
}

GatheringRealmSceneMapping = { id, sceneUuid, sceneRegionUuid }   // Foundry bridge — NOT renamed
```

Requirements:

1. The per-system persisted field `gatheringRegions` is renamed `gatheringRealms`, and
   `gatheringRegionSettings` is renamed `gatheringRealmSettings`. Their semantics are unchanged.
2. The Foundry-bridge fields `sceneMappings`, `sceneRegionUuid`, and `sceneUuid` are **not** renamed
   — they name Foundry `RegionDocument` objects, not the Fabricate concept.
3. The modifier `kind` values (`eventChance`, `dropRate`, `yield`, `difficulty`, `staminaCost`,
   `attemptLimit`, `custom`), `operation` values (`add`, `multiply`, `set`, `min`, `max`), and
   `visibility` values (`visible`, `gmOnly`) are **not** renamed; only the wrapping constant
   identifiers (`GATHERING_REGION_MODIFIER_KINDS`→`GATHERING_REALM_MODIFIER_KINDS`, etc.) change.

### Gathering Realm Settings

The per-system `gatheringRealmSettings` record (was `gatheringRegionSettings`) is unchanged in shape:
`enabled` (boolean, default `false`) gates the WHOLE realm/travel/availability subsystem; `revealMode`
(`manual` | `onPartyTokenEntry` | `alwaysVisible`, default `manual`); `modifierVisibility`
(`visible` | `gmOnly`, default `visible`). The single-source-of-truth gate predicate
`isGatheringRegionsEnabled(system)` is renamed `isGatheringRealmsEnabled(system)`.

### GatheringEnvironment location-availability fields

The per-environment realm-membership availability fields are renamed:

```js
GatheringEnvironment = {
  // …unchanged task/event/biome fields…
  includedRealmIds?: string[],   // was includedRegionIds (legacy compat-read)
  excludedRealmIds?: string[],   // was excludedRegionIds (legacy compat-read)
  includedBiomeIds?: string[],   // UNCHANGED
  excludedBiomeIds?: string[],   // UNCHANGED
  region?: string                // inert legacy free-text string — UNCHANGED (not a Realm id)
}
```

Requirements:

1. `includedRealmIds` / `excludedRealmIds` store opt-in location availability rules evaluated against
   the party's resolved current realms (renamed from `includedRegionIds` / `excludedRegionIds`;
   behavior unchanged — exclusions win, empty/absent = ungated).
2. The legacy single `region` free-text string remains **inert** (not a composition input, not
   editor-surfaced, not a `GatheringRealm.id`) and is **not** renamed.
3. `includedBiomeIds` / `excludedBiomeIds` and the `biomes` composition dimension are **not**
   renamed.
4. The realm-id save-boundary validation (`includedRealmIds` references unknown realm) validates
   against the owning system's `gatheringRealms` only where the system context resolves; load paths
   never throw on stale ids.

### Gathering Party current-realm overrides

```js
GatheringParty = {
  // …id/name/enabled/members/travelActorUuid unchanged…
  currentRealmOverrides?: {                          // was currentRegionOverrides
    [systemId]: { mode: 'none'|'manual', realmIds: string[], updatedAt, updatedByUserId }
  }
}
```

Requirements:

1. `currentRealmOverrides` (was `currentRegionOverrides`) and its inner `realmIds` (was `regionIds`)
   are renamed; the mode vocabulary, stamping, and the `mode: 'none'` clear behavior are unchanged.

### Discovered Gathering Realms (actor flag)

The actor-scoped discovery flag key `discoveredGatheringRegions` is renamed
`discoveredGatheringRealms`, logical shape unchanged:

```js
discoveredGatheringRealms = {
  [systemId]: { [realmId]: { discoveredAt, source, partyId?, sceneUuid?, sceneRegionUuid? } }
}
```

Requirements:

1. The inner `realmId` key (was `regionId`) is renamed; the entry members `sceneUuid` /
   `sceneRegionUuid` (Foundry bridge) are **not**.
2. Because this is an actor flag (not a world setting), it is **not** rewritten by the migration
   runner. Reads accept the legacy `discoveredGatheringRegions` flag as a fallback and every write
   persists only the new `discoveredGatheringRealms` key, upgrading each actor lazily.

## Unchanged: Foundry Scene Region

`RegionDocument`, `RegionBehavior` / `RegionBehaviorConfig`, `region.flags`, `region.uuid`,
`TokenDocument#regions`, `senseSceneRegions`, `sceneRegionUuidsContainingToken`, the
`fabricate.interactable` Region Behaviour, and the `sceneMappings` / `sceneRegionUuid` / `sceneUuid`
bridge fields are Foundry's own first-class Region concept and are **not** renamed.

## Migration

A versioned (`1.1.0`), idempotent migration:

1. For each `systems[*]`: renames `gatheringRegions`→`gatheringRealms` and
   `gatheringRegionSettings`→`gatheringRealmSettings`.
2. For each `environments[*]`: renames `includedRegionIds`/`excludedRegionIds`→
   `includedRealmIds`/`excludedRealmIds`.
3. For each `gatheringParties[*]`: renames `currentRegionOverrides`→`currentRealmOverrides` and inner
   `regionIds`→`realmIds`.
4. Leaves `sceneMappings`, `sceneRegionUuid`, `sceneUuid`, the inert legacy `region` string, the
   biome fields, and the modifier `kind`/`operation`/`visibility` values untouched.

Requirements:

1. The migration is idempotent: every rename guards on "old key present AND new key absent", so a
   second run makes no change and a stale legacy key beside an existing new key is left inert.
2. It runs at a higher version than all existing migrations (new highest `1.1.0`; the prior highest
   is `1.0.0`, the hazards→events migration).
3. The migration runner reads, diffs, and persists the `gatheringParties` world setting (newly wired)
   so the party-override rename actually persists.
4. Imports do not re-run the migration; pre-rename imports upgrade on the next startup, and the
   normalizer/store legacy-key fallbacks keep un-migrated payloads loadable in the interim.

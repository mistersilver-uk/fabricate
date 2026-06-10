# Data Models Spec Delta

## Added Models

### GatheringRegion

```js
GatheringRegion = {
  id: string,
  craftingSystemId: string,
  name: string,
  description?: string,
  img?: string,
  enabled: boolean,
  secret: boolean,
  biomes: string[],
  sort?: number,
  sceneMappings?: GatheringRegionSceneMapping[],
  modifiers?: GatheringRegionModifier[],
}
```

Requirements:

1. `id` must be stable and unique within the owning crafting system.
2. `craftingSystemId` must reference an existing `CraftingSystem`.
3. `name` is required for GM users and for players only after discovery/visibility permits disclosure.
4. `secret` defaults to `false`.
5. `biomes` defaults to an empty array and stores stable biome ids from the system biome vocabulary.
6. `sceneMappings` defaults to an empty array.
7. `modifiers` defaults to an empty array.

### GatheringRegionSceneMapping

```js
GatheringRegionSceneMapping = {
  id: string,
  sceneUuid: string,
  sceneRegionUuid: string,
}
```

Requirements:

1. `id` must be unique within the owning region's `sceneMappings`.
2. `sceneUuid` references a Foundry Scene document.
3. `sceneRegionUuid` references a Foundry V13 Scene Region document.
4. Stale references must remain readable for GM repair and must be ignored by automation.

### GatheringRegionModifier

```js
GatheringRegionModifier = {
  id: string,
  enabled: boolean,
  kind:
    | "hazardChance"
    | "dropRate"
    | "yield"
    | "difficulty"
    | "staminaCost"
    | "attemptLimit"
    | "custom",
  operation: "add" | "multiply" | "set" | "min" | "max",
  value: number,
  visibility: "visible" | "gmOnly",
  note?: string,
}
```

Requirements:

1. `id` must be unique within the owning region's modifiers.
2. Unknown `kind`, `operation`, or `visibility` values are invalid at save/import boundaries.
3. `enabled` defaults to `true`.
4. `visibility` defaults to `visible`.
5. `value` must be finite.
6. Modifier semantics and timing are defined in `gathering-and-harvesting`.

### GatheringParty

```js
GatheringParty = {
  id: string,
  name: string,
  enabled: boolean,
  memberActorUuids: string[],
  travelActorUuid: string | null,
  currentRegionOverrides?: {
    [systemId: string]: GatheringPartyRegionOverride,
  },
}
```

```js
GatheringPartyRegionOverride = {
  mode: "none" | "manual",
  regionIds: string[],
  updatedAt: number,
  updatedByUserId: string,
}
```

Requirements:

1. `id` must be unique within Fabricate's party list.
2. `memberActorUuids` stores actor UUIDs and defaults to an empty array.
3. `travelActorUuid` is required for enabled parties and may be `null` on disabled parties.
4. `travelActorUuid` must be an Actor document UUID — the actor that represents the party on a campaign map — not a placed Token UUID or prototype token reference.
5. One enabled party must have exactly one travel actor.
6. One travel actor UUID must not be assigned to more than one enabled party.
7. One actor UUID must not appear in more than one enabled party's `memberActorUuids`. The travel actor may also be a member of its own party.
8. An actor UUID may be associated with at most one enabled party in total, whether as a member, as the travel actor, or both; when both, it must be the same party. Membership in disabled parties does not count toward this invariant.
9. `currentRegionOverrides` is keyed by crafting system id because regions are per crafting system.
10. A manual override may include more than one region id to support overlapping/mixed geography.
11. `mode: "none"` clears the override and allows token-derived resolution. Clearing is a stamped mutation: it sets `mode: "none"`, empties `regionIds`, and updates `updatedAt`/`updatedByUserId`. For a disabled or travel-actor-less party, `mode: "none"` resolves to no current region.
12. A newly created party defaults to `enabled: false` because enabling requires a travel actor. Setting `enabled: true` without a travel actor is rejected at save boundaries.
13. Duplicate party ids on read normalize by keeping the first occurrence; duplicates are rejected at save boundaries.
14. Stale actor, system, or region references must remain readable for GM repair.

### GatheringRegionSettings

```js
GatheringRegionSettings = {
  revealMode: "manual" | "onPartyTokenEntry" | "alwaysVisible",
  modifierVisibility: "visible" | "gmOnly",
}
```

Requirements:

1. Settings are scoped to one crafting system.
2. Missing settings normalize to `revealMode: "manual"` and `modifierVisibility: "visible"`.
3. Unknown values are invalid at save/import boundaries and normalize to defaults when read from existing data.

## Added Actor Flags

### Discovered Gathering Regions Flag

Stored on actor flags via Fabricate's actor-flag helpers (`src/config/flags.js`), which write under the module's flag namespace. Logical shape:

```js
discoveredGatheringRegions = {
  [systemId: string]: {
    [regionId: string]: {
      discoveredAt: number,
      source: "manual" | "partyToken" | "import" | "api",
      partyId?: string,
      sceneUuid?: string,
      sceneRegionUuid?: string,
    },
  },
}
```

Requirements:

1. The flag is actor-scoped and world-local.
2. `systemId` must refer to the crafting system that owns the region.
3. `regionId` must refer to a `GatheringRegion` in that crafting system.
4. `discoveredAt` must be a timestamp.
5. `source` must be one of the listed values.
6. Missing or stale region ids must not disclose secret region names to non-GM users.

## Modified Models

### CraftingSystem

When `features.gathering === true`, a crafting system may own a gathering region library.

```js
CraftingSystem = {
  // existing fields omitted
  gatheringRegions?: GatheringRegion[],
  gatheringRegionSettings?: GatheringRegionSettings,
}
```

Requirements:

1. `gatheringRegions` defaults to an empty array.
2. Region records are scoped to the owning crafting system and must not be shared by reference across systems.
3. Import/export may include region records with the crafting system.
4. `gatheringRegionSettings` defaults are defined by `GatheringRegionSettings`.

### GatheringEnvironment

Add explicit location availability fields:

```js
GatheringEnvironment = {
  // existing fields omitted
  includedRegionIds?: string[],
  includedBiomeIds?: string[],
  excludedRegionIds?: string[],
  excludedBiomeIds?: string[],
}
```

Requirements:

1. Each region id must reference a `GatheringRegion` in the same crafting system when validation runs with a complete system context.
2. Each biome id must reference the selected system's biome vocabulary when validation runs with a complete system context.
3. Blank and duplicate ids normalize away.
4. Explicit exclusions are persisted separately from inclusions.
5. Existing `region` and `biomes` fields remain compatibility/display metadata and must not be removed by this change.

## World Settings

Fabricate may add a world setting for parties:

- `fabricate.gatheringParties`

Requirements:

1. Party records are world-level because parties can be used across multiple crafting systems.
2. Party records are JSON-serializable.
3. Party validation must enforce travel-actor uniqueness across all enabled parties in the complete party list.
4. Party records are excluded from crafting-system import/export because they reference world-local actors. Overrides referencing missing systems or regions persist as stale repair evidence.

## Canonical-Write And Legacy-Read Compatibility

New code should write explicit location availability fields on environments and `gatheringRegions` on crafting systems.

Legacy read behavior:

1. Existing `GatheringEnvironment.region` is a legacy region tag string used for display and existing composition matching. It is not a `GatheringRegion.id`. It may be offered as a migration source for `includedRegionIds` when a matching `GatheringRegion` exists.
2. Existing `GatheringEnvironment.biomes` may be displayed as environment metadata and may be offered as a migration source for `includedBiomeIds`.
3. Legacy environments without explicit availability fields remain valid and are not location-gated by default.

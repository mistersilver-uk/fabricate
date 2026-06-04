# Gathering And Harvesting Spec Delta

## Added Requirements

### Location-Aware Gathering

Fabricate MUST support location-aware gathering through first-class regions and Fabricate-managed parties.

1. A **Gathering Region** is named geography scoped to one crafting system.
2. A **Gathering Party** is a Fabricate-managed world record with actor members and exactly one travel token.
3. Gathering availability MAY be evaluated against the current regions resolved for the selected actor's party.
4. Region-aware gathering MUST remain optional. Existing environments without region availability rules remain valid and may remain available when no current region is resolved.
5. Fabricate core MUST remain system-agnostic and MUST NOT depend on game-system party or group actor types.

### Gathering Region

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

1. `id` MUST be unique within the owning crafting system's region list.
2. `craftingSystemId` MUST reference an existing crafting system.
3. Region records are geography; they MUST NOT own environment, task, hazard, or drop records.
4. `biomes` are terrain/ecology traits resolved through the selected system's biome vocabulary.
5. Secret regions MAY affect runtime availability and modifiers, but their names, descriptions, images, and GM notes MUST NOT be disclosed to a player until the selected actor has discovered that region or `GatheringRegionSettings.revealMode === "alwaysVisible"`.
6. Disabled regions MUST NOT satisfy environment availability for non-GM users unless a GM override explicitly includes them for diagnostic or preview purposes.
7. Stale region ids in environments, parties, discovery flags, or Scene Region mappings MUST be ignored at runtime and surfaced to GMs as repair evidence where practical.

### Gathering Party

```js
GatheringParty = {
  id: string,
  name: string,
  enabled: boolean,
  memberActorUuids: string[],
  travelTokenUuid: string,
  currentRegionOverrides?: {
    [systemId: string]: {
      mode: "none" | "manual",
      regionIds: string[],
      updatedAt: number,
      updatedByUserId: string,
    },
  },
}
```

Requirements:

1. A party MUST have exactly one travel token.
2. `travelTokenUuid` MUST identify a placed Scene Token document. It MUST NOT be an Actor UUID or prototype token reference.
3. A token MUST NOT represent more than one enabled Fabricate party.
4. Party membership is actor-based, not user-based.
5. An actor MUST NOT belong to more than one enabled Fabricate party.
6. When a party enters or is manually assigned to a region, every current member actor MAY receive discovery for that region according to the configured reveal mode.
7. Fabricate MUST NOT require a party actor type supplied by the active game system.
8. A selected actor's party is the source for current-region resolution in player gathering views.
9. If an actor is not in a party, region-aware gathering falls back to no current region unless a later explicit solo-actor location mode is specified.
10. Existing blind-task `revealScope: "party"` is not redefined by this change and remains the existing blind reveal scope until a later spec changes it.

### Gathering Region Settings

Each gathering-enabled crafting system MAY define region behavior settings.

```js
GatheringRegionSettings = {
  revealMode: "manual" | "onPartyTokenEntry" | "alwaysVisible",
  modifierVisibility: "visible" | "gmOnly",
}
```

Requirements:

1. Missing settings normalize to `revealMode: "manual"` and `modifierVisibility: "visible"`.
2. `manual` reveal mode means only GM/API reveal actions add actor discovery for secret regions.
3. `onPartyTokenEntry` reveal mode means mapped Scene Region entry reveals the mapped Fabricate region to every current member actor in that party.
4. `alwaysVisible` reveal mode means region identities are visible to players without actor discovery, while actor discovery flags may still be written for history/evidence.
5. The settings are scoped per crafting system because regions are scoped per crafting system.

### Current Region Resolution

Current regions are resolved per `partyId` and `systemId`.

Resolution order:

1. If the party has a GM manual current-region override for the selected system, that override is authoritative.
2. Otherwise, Fabricate MAY resolve the party travel token's occupied Foundry V13 Scene Regions and map them to Fabricate `GatheringRegion` ids.
3. If neither source resolves, the party has no current region for that system.

Requirements:

1. Manual override MUST take precedence over token-derived region automation.
2. Overlapping token-derived regions MUST merge; the current-region set is the union of all mapped Fabricate regions.
3. The current-region resolver MUST expose redaction-safe source evidence: manual override, token-derived, or unresolved.
4. Player-facing current-region labels MUST hide secret undiscovered region names.
5. Changing current region MUST refresh gathering listings but MUST NOT retroactively rewrite completed gathering history.

### Actor Region Discovery

Region discovery is tracked on actor flags.

```js
Actor.flags.fabricate.discoveredGatheringRegions = {
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

1. Discovery is actor-scoped so region knowledge follows the character across party changes.
2. Discovery writes MUST validate that the region belongs to the referenced crafting system.
3. Manual GM reveal MAY add or remove actor discovery entries.
4. Automatic reveal MAY add discovery when a party travel token enters a mapped Scene Region.
5. Secret undiscovered regions MUST be represented to players as undiscovered placeholders, not by name.
6. GM users MAY inspect full discovered and undiscovered region state.

### Environment Location Availability

Gathering environments MAY declare location availability separately from their display metadata.

```js
GatheringEnvironmentAvailability = {
  includedRegionIds?: string[],
  includedBiomeIds?: string[],
  excludedRegionIds?: string[],
  excludedBiomeIds?: string[],
}
```

Requirements:

1. Explicit region exclusions win over all inclusions.
2. Biome exclusions win when any current region has an excluded biome.
3. Explicit region inclusions match when at least one current region id appears in `includedRegionIds`.
4. Biome inclusions match when at least one current region has a biome in `includedBiomeIds`.
5. If an environment declares exclusions but no inclusions, it is globally available except in matching excluded current regions/biomes.
6. If an environment declares no included region ids, included biome ids, excluded region ids, or excluded biome ids, the environment is not location-gated by this mechanism.
7. If no current region is resolved, inclusion-gated environments are blocked by missing current-region context; exclusion-only and ungated environments are not blocked by location.
8. Existing `GatheringEnvironment.region` remains player-facing legacy region-tag metadata and compatibility input until migrated. It is not a `GatheringRegion.id`.
9. Existing `GatheringEnvironment.biomes` remains player-facing environment metadata and compatibility input until migrated.
10. Availability evaluation MUST be visible/attemptable aware: an unavailable environment may remain visible with blocked reasons and travel guidance when safe to reveal.
11. Availability evaluation MUST NOT leak hidden blind task identity, hidden results, hidden hazards, provider diagnostics, GM-only notes, or secret undiscovered region names.
12. Start-attempt guards MUST re-evaluate location availability at attempt time and MUST NOT trust stale listing state.

### Region Travel Guidance

Player listings SHOULD explain location blockers when doing so is redaction-safe.

Requirements:

1. If all destination regions are known to the actor, guidance MAY list their names.
2. If some destinations are secret or undiscovered, guidance MUST summarize them as undiscovered destinations.
3. If no current region is resolved for the actor's party, guidance MUST say that the GM needs to set or resolve the party's current region.
4. If an environment is explicitly excluded from the current region, guidance MUST distinguish exclusion from missing conditions, tools, stamina, node availability, or permission blockers where practical.
5. Non-GM listings MUST use disclosure-safe region display data for current regions, destination guidance, filters, visible text, `title`, `aria-label`, and DOM `data-*` attributes.

### Region Modifiers

Regions MAY define modifiers that adjust gathering listing evidence or attempt calculations.

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

1. Region modifiers MUST NOT rewrite source environment, task, hazard, drop, or component records.
2. Region modifiers MUST be applied only through runtime composition/evaluation.
3. Listing and start responses SHOULD include modifier source evidence when visible to the viewer.
4. Hidden modifiers MUST remain GM-only and MUST NOT reveal secret region identity.
5. Immediate attempts MUST snapshot current region ids and applied modifier evidence in gathering history where safe.
6. Timed attempts MUST use the start-time region snapshot unless a future setting explicitly chooses completion-time region evaluation.
7. Modifier aggregation MUST be deterministic, bounded, and covered by tests for every supported modifier kind.

### Foundry V13 Scene Region Mapping

```js
GatheringRegionSceneMapping = {
  id: string,
  sceneUuid: string,
  sceneRegionUuid: string,
}
```

Requirements:

1. Scene Region mapping uses Foundry V13 Scene Region document UUID evidence and MUST NOT require user-authored macros.
2. Missing or stale scenes/Scene Regions MUST fail closed for automation but MUST NOT prevent manual current-region overrides.
3. Overlapping mapped Scene Regions MUST merge into a union of Fabricate regions for current-region resolution.
4. Scene Region automation is optional; manual current-region assignment remains supported.

## Modified Requirements

### Scope

The gathering specification's previous exclusion of "map authoring or travel simulation" remains true for travel simulation and pathfinding. Location-aware gathering adds optional current-region state and Foundry Scene Region mapping, but does not introduce a full map-authoring subsystem.

### GatheringEnvironment

`GatheringEnvironment` gains optional location availability fields:

```js
GatheringEnvironment = {
  // existing fields omitted
  includedRegionIds?: string[],
  includedBiomeIds?: string[],
  excludedRegionIds?: string[],
  excludedBiomeIds?: string[],
}
```

Existing `region?: string` and `biomes?: string[]` remain valid compatibility/display metadata. New location gating SHOULD use `includedRegionIds`, `includedBiomeIds`, `excludedRegionIds`, and `excludedBiomeIds`.

### Gathering Task And Hazard Matching

Task and hazard legacy region/biome matching continues to describe composition into environments. Legacy `region` vocabulary values are tag strings used by existing environment/task/hazard composition and are not `GatheringRegion.id` values. Runtime gathering first determines whether the environment is available in the party's current `GatheringRegion` set, then applies existing task/hazard composition, visibility, condition, tool, stamina, node, and attempt gates.

### Rich Gathering APIs And Hooks

Fabricate SHOULD expose narrow GM/API methods for:

- listing regions for a crafting system
- creating/updating/deleting regions
- listing parties
- assigning actor members and travel tokens
- setting or clearing current-region overrides
- reading current-region evidence for an actor/party/system
- revealing or hiding actor region discovery

Public player APIs MUST enforce the same region discovery, secret redaction, and availability guidance rules as the UI.

## Testing Requirements

- Unit tests for region normalization, validation, disabled/secret behavior, and stale references.
- Unit tests for party normalization and one-token-per-party / one-party-per-token validation.
- Unit tests for actor membership uniqueness across enabled parties.
- Unit tests for current-region resolution precedence: manual override, token-derived mapping, unresolved.
- Unit tests for overlapping mapped Scene Regions merging all matching Fabricate regions.
- Unit tests for actor discovery flags and actor knowledge preservation across party changes.
- Unit tests for environment availability inclusions, biome inclusions, explicit exclusions, exclusion-only global-except behavior, inclusion-gated no-current-region blocking, and ungated legacy environments.
- Unit tests for mixed current-region cases where one current region includes an environment and another current region excludes it; exclusions must win.
- Unit tests proving start-attempt guards reject location-gated attempts when current region changed or cleared after listing.
- Unit tests for per-system `GatheringRegionSettings` defaults and reveal-mode behavior.
- Unit tests for player travel guidance with known destinations, partially undiscovered destinations, secret destinations, and no current region.
- Unit tests proving non-GM output does not leak secret undiscovered region names or ids through display labels, `title`, `aria-label`, filter labels, or DOM `data-*` attributes.
- Unit tests for modifier application, clamping, visible/GM-only disclosure, and gathering history snapshots.
- Component tests for GM region authoring, party assignment, current-region override controls, and player current-region/travel guidance.
- Foundry smoke coverage for UI-changing slices that add Region, Party, or player location controls.

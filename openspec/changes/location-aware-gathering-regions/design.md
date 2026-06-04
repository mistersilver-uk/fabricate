# Design: Location-Aware Gathering Regions

## Concept Boundary

Region must not become a second Environment editor.

- **Region** answers "Where is the party?"
- **Biome** answers "What kind of terrain/ecology is this region?"
- **Environment** answers "What gathering activity or reusable resource profile is available?"
- **Task/Hazard/Drop** answers "What happens during an attempt?"

This keeps region authoring lightweight and lets the same environment be reused across many named places.

## Data Ownership

Regions are scoped to a crafting system because environment availability, biomes, modifiers, and importable travel content belong to that system's gathering vocabulary.

Parties are world/cross-system Fabricate records because the same adventuring party can interact with multiple crafting systems. Current-region override state is keyed by `systemId` on the party so each system can resolve a region from its own region library.

Actor discovery lives on actor flags so discovered geography follows the character even when the actor later joins a different party.

## Region Model

`GatheringRegion` should include:

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

`biomes` are the optional reusable terrain/ecology traits the user called "region tags." Use the existing biome vocabulary where possible instead of inventing a separate "tags" concept.

Secret regions are real runtime regions. They can gate availability and apply modifiers, but player-facing output uses undiscovered placeholders until the selected actor has discovered the region or the GM manually reveals it.

## Party Model

`GatheringParty` should include:

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

Validation rules:

- A party must have exactly one `travelTokenUuid`.
- `travelTokenUuid` is a placed Scene Token document UUID, not an Actor UUID or prototype token reference.
- A token UUID may be assigned to at most one party.
- Party members are actors, not users.
- A member actor may belong to at most one enabled party. This keeps selected-actor current-region resolution and party-driven discovery unambiguous.
- Stale member actor UUIDs and stale travel token UUIDs remain readable but fail current-region automation until repaired.

Existing blind-task `revealScope: "party"` is not redefined by this change. It remains the existing blind reveal scope until a later approved change explicitly migrates it to `GatheringParty` semantics.

## Region Settings

Each gathering-enabled crafting system owns region behavior settings:

```js
GatheringRegionSettings = {
  revealMode: "manual" | "onPartyTokenEntry" | "alwaysVisible",
  modifierVisibility: "visible" | "gmOnly",
}
```

Defaults:

- `revealMode: "manual"`
- `modifierVisibility: "visible"`

`revealMode` controls player discovery of secret region identities. `manual` requires GM reveal actions. `onPartyTokenEntry` reveals a mapped region to every member actor when their party travel token enters it. `alwaysVisible` makes region names visible to all players while still preserving actor discovery history for future use.

## Current Region Resolution

Current region is resolved per party and per crafting system.

Resolution order:

1. **GM manual override**: if a party has `currentRegionOverrides[systemId].mode === "manual"`, those region ids are authoritative for gathering availability.
2. **Token-derived Scene Region mapping**: if no manual override is active, Fabricate resolves the party travel token's occupied Foundry V13 Scene Regions and maps them to Fabricate regions for that system.
3. **No current region**: if neither source resolves, the party has no current region for that system and location-gated environments are blocked with guidance.

Overlapping Foundry Scene Regions merge. The resolved current region set is the union of all mapped Fabricate region ids. Environments are available if at least one current region satisfies their availability rules and no explicit exclusion applies.

The player UI must show the source of current region evidence:

- `GM override`
- `Travel token`
- `No current region`

## Discovery

Actor discovery is stored under actor flags:

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

When a party enters a region through token automation or manual GM reveal, every current party member actor receives the discovery entry. If an actor later joins another party, their discovery history remains on that actor.

Reveal behavior is configured by `GatheringRegionSettings.revealMode` for the selected crafting system. Manual override of any actor's discovered regions remains available to GMs in every reveal mode.

Secret regions remain hidden by name until discovered, but unavailable guidance may say "undiscovered region" when the environment would otherwise name that region.

## Environment Availability

Existing environment `region` and `biomes` are static metadata and matching evidence. This change adds explicit availability rules:

```js
GatheringEnvironmentAvailability = {
  includedRegionIds?: string[],
  includedBiomeIds?: string[],
  excludedRegionIds?: string[],
  excludedBiomeIds?: string[],
}
```

Evaluation:

1. Explicit region exclusions win.
2. Biome exclusions win when any current region has an excluded biome.
3. Explicit region inclusions match when any current region id is included.
4. Biome inclusions match when any current region has an included biome.
5. If an environment has exclusions but no inclusions, it is globally available except in matching excluded current regions/biomes.
6. If an environment has no included regions, included biomes, excluded regions, or excluded biomes, it remains globally available unless another guard blocks it. This preserves existing worlds and avoids making every old environment disappear.

Existing `environment.region` is a legacy region tag string used for display and existing task/hazard composition. It is not a `GatheringRegion.id`. It can be offered as a migration source for `includedRegionIds` after matching Fabricate region records exist. Existing `environment.biomes` can continue to represent the environment's own ecological evidence and may also seed `includedBiomeIds` when the GM opts into location gating.

## Region Modifiers

Region modifiers are declarative, system-agnostic adjustment records:

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

Region modifiers apply only to gathering behavior. They must not rewrite task, hazard, drop, environment, or component library records.

Modifier timing:

- Listing should include redaction-safe modifier summaries when the system setting allows modifier visibility.
- Starting an immediate attempt should snapshot the current region ids and applied modifier evidence.
- Timed attempts should snapshot the start-region evidence unless a later setting explicitly chooses completion-time location.
- Completed history must not be retroactively rewritten when region configuration changes.

Aggregation should be explicit and tested. The first implementation should choose conservative defaults and explain them in listing/start evidence. For example, additive percentage-point drop/hazard changes can clamp to `0..100`; multiplicative yield changes should avoid stacking into unbounded values.

## Player Guidance

Unavailable environments remain visible when safe. They are sorted after available environments and explain why travel is needed.

Examples:

- `Not available in The Verdant Expanse. Travel to Ashen March or Glass Coast.`
- `Not available in The Verdant Expanse. Available in 2 undiscovered regions.`
- `Not available while no party region is set. Ask the GM to set the party's current region.`

Secret-region destinations use undiscovered placeholders unless the selected actor has discovered them. Guidance must not leak hidden task names, hidden results, hidden hazards, GM-only notes, or secret region names.

Player-facing UI should use a disclosure-safe display model for every region-derived label:

```js
GatheringRegionDisclosure = {
  id: string | null,
  label: string,
  discovered: boolean,
  secret: boolean,
  placeholder: boolean,
}
```

For non-GM users, secret undiscovered region ids and names must not appear in visible text, `title`, `aria-label`, filter option labels, or DOM `data-*` attributes. Filters may show known destination names plus aggregate buckets such as `Undiscovered regions`.

## GM Setup Path

The manual MVP should have a low-burden setup path:

1. Create at least one region.
2. Optionally add location availability rules to environments. The default environment availability state is `Available everywhere`.
3. Create a party.
4. Assign actor members and exactly one placed travel token.
5. Set the party's current region manually.

Region, Travel, and Environment empty states should present this sequence as setup cards or a checklist. Foundry Scene Region mapping must be presented as an advanced/future automation path, not as required setup.

## Foundry V13 Scene Region Mapping

Foundry V13 Scene Regions are native scene polygons/areas with behaviors and token-enter/token-exit events. Fabricate should use them as a source of location evidence without requiring user-authored macros.

Mapping can be stored on Fabricate region records as stable Foundry document UUID references:

```js
GatheringRegionSceneMapping = {
  id: string,
  sceneUuid: string,
  sceneRegionUuid: string,
}
```

Runtime automation should listen at Fabricate's Foundry edge layer, resolve mapped Scene Regions for the party travel token, and update party current-region evidence/discovery. The first slice may persist mapping fields and manual controls without implementing automatic event handling, but the spec must leave room for automation.

## Migration And Compatibility

No destructive migration should run as part of the planning slice.

Compatibility behavior:

- Existing environments with only `region` / `biomes` remain valid.
- Existing player listing fields continue to expose environment metadata.
- New location gating is additive and opt-in until a GM adds availability rules or enables current-region enforcement for a system.
- Imported systems may include region records and environment availability rules.
- Scene compendia may include matching Foundry Scene Regions, but missing scenes must not break manual gathering.

## Risks

- **Prep complexity**: mitigate by making manual current-region and simple region assignment useful before Scene automation.
- **Concept overlap**: mitigate by keeping Region as geography and Environment as reusable gathering activity.
- **Secret leakage**: all player guidance must go through a central disclosure policy.
- **Modifier opacity**: visible modifiers should include concise source evidence; hidden modifiers should not change labels in misleading ways.
- **Multiple systems**: party location state must be keyed by system id because regions are per crafting system.

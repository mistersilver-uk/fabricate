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

Parties are excluded from crafting-system import/export: they are world-local records that reference world actors. Party current-region overrides that reference missing or re-imported systems/regions are preserved as stale repair evidence rather than dropped.

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
  travelActorUuid: string | null,
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

- An enabled party must have exactly one `travelActorUuid`.
- `travelActorUuid` is an Actor document UUID — the actor that represents the party on a campaign map. It is not a placed Token UUID or prototype token reference; region presence sensing resolves the travel actor's placed token(s).
- A travel actor UUID may be assigned to at most one enabled party.
- The travel actor may also appear in its own party's `memberActorUuids`; that is allowed and not a duplicate-membership violation.
- An actor may be associated with at most one **enabled** party in total, whether as a member, as the travel actor, or both. When an actor is both a member and a travel actor on enabled parties, those must be the same party. This single composite invariant subsumes member uniqueness and travel-actor uniqueness and keeps selected-actor current-region resolution unambiguous.
- Membership in **disabled** parties does not count toward the uniqueness invariant; an actor in a disabled party may freely join an enabled party.
- Party members are actors, not users.
- **Actor-to-party resolution predicate**: a selected actor resolves to the unique enabled party that references the actor's UUID either in `memberActorUuids` or as `travelActorUuid`. The composite uniqueness invariant guarantees at most one such party.
- A newly created party defaults to `enabled: false` because enabling requires a travel actor; the UI should hint "assign a travel actor to enable". Setting `enabled: true` on a party without a travel actor is rejected at save. Disabling a party relaxes its participation in the uniqueness invariant.
- Stale member actor UUIDs and stale travel actor UUIDs remain readable but fail current-region automation until repaired.
- Duplicate party ids encountered on read normalize by keeping the first occurrence; duplicate ids are rejected at save boundaries.

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

`revealMode` controls player discovery of secret region identities. `manual` requires GM reveal actions. `onPartyTokenEntry` reveals a mapped region to every member actor when a placed token of their party's travel actor enters it. `alwaysVisible` makes region names visible to all players while still preserving actor discovery history for future use.

## Current Region Resolution

Current region is resolved per party and per crafting system.

Resolution order:

1. **GM manual override**: if a party has `currentRegionOverrides[systemId].mode === "manual"`, those region ids are authoritative for gathering availability.
2. **Token-derived Scene Region mapping**: if no manual override is active, Fabricate resolves the placed token(s) of the party's travel actor, determines their occupied Foundry V13 Scene Regions, and maps them to Fabricate regions for that system.
3. **No current region**: if neither source resolves, the party has no current region for that system and location-gated environments are blocked with guidance.

Resolution detail:

- The canonical machine source tokens are `manualOverride`, `travelActor`, and `unresolved`. Their player-facing labels are `GM override`, `Travel actor`, and `No current region`. All specs and UI surfaces use these tokens/labels; do not invent additional source names.
- `mode: "none"` on a party that is disabled or has no travel actor resolves to `unresolved` (no current region) — there is no token-derived fallback for such parties.
- A manual override that includes a **disabled** region id still resolves that region for availability evaluation: explicit GM inclusion is the spec's diagnostic/preview override. The UI marks such regions as disabled. Disabled regions never resolve through token automation. Region ids that reference **missing** regions are stale repair evidence and do not resolve.

Overlapping Foundry Scene Regions merge. The resolved current region set is the union of all mapped Fabricate region ids. Environments are available if at least one current region satisfies their availability rules and no explicit exclusion applies.

The player UI must show the source of current region evidence:

- `GM override`
- `Travel actor`
- `No current region`

## Discovery

Actor discovery is stored on actor flags via Fabricate's actor-flag helpers (`src/config/flags.js`), which write under the module's flag namespace. The logical shape is:

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
4. Assign actor members and exactly one travel actor.
5. Set the party's current region manually.

Region, Travel, and Environment empty states should present this sequence as setup cards or a checklist. Foundry Scene Region mapping must be presented as an advanced/future automation path, not as required setup.

## First Slice UI Notes (Travel Route, #257)

The first implementation slice ships the `Travel` route with the following pinned decisions:

- **Routing**: `Travel` renders under `currentView === 'environments'` with `activeGatheringTab === 'travel'`, like the Tasks/Encounters/Settings gathering tabs, so the existing route-guard effect and `gatheringNavItems`-derived sets pick it up without special cases.
- **World vs system access**: Travel is reachable only while a gathering-enabled crafting system is selected. Party create/rename/enable/member/travel-actor management is world-global; only the current-region override block is per selected system. The view states this explicitly so GMs understand parties are shared across systems.
- **Nav count**: the Travel submenu item shows the total party count as its badge.
- **Layout split**: party list and all editing controls (rename, enable, members, travel actor, override Set/Clear) live in the center column; the right inspector shows a read-only evidence echo for the selected party (current-region evidence per source state, member/travel-actor summary, stale references). Override editing exists in exactly one place (center).
- **Evidence display**: the current-region evidence component renders all three source states. In this slice `Travel actor` is shown as "automation not yet available" rather than hidden, so the model is complete before Phase 3.
- **Disabled-party behavior**: the enable toggle is disabled (with the "assign a travel actor to enable" hint) while no travel actor is assigned, preventing known-invalid saves. Newly created parties visibly show the disabled state immediately.
- **Stale references**: each stale member/travel-actor/override-region reference gets a remove/clear action; "repair" means removing the stale reference and re-assigning through the normal pickers. No special re-point flow ships in this slice.
- **No-actors empty state**: when the world has no actors, the member and travel-actor pickers show an explicit "No actors exist in this world yet — create an Actor first" state so checklist steps 3–4 do not appear broken.
- **Region quick list**: the Travel route embeds a minimal name-only region quick list (create, inline rename, enable toggle, delete-with-referenced-by-confirm) as a temporary host until the dedicated Regions route ships. It is a lightweight picker-builder, not a region editor: name and enabled only, never description/img/secret/biomes/modifiers/mappings, which round-trip untouched.
- **Discovery controls are out of this slice**: the Region Discovery Controls capability ships with the later GM Region management surface, not with Travel.
- **Validation ownership**: uniqueness/invariant validation lives in the party store; the view surfaces store validation errors inline next to the relevant control using the Manager's existing `aria-invalid`/`aria-describedby` pattern. Actor pickers follow the accessible semantics already established by `ActorSelectTopBar.svelte`.
- **Discovery flag naming**: the actor flag uses the bare key `discoveredGatheringRegions` through the flag helpers in `src/config/flags.js`, matching sibling actor-state keys (`learnedRecipes`, `gatheringRuns`).
- **Environment availability validation context**: the environment store persists to a world setting while regions live on the crafting system, so region-id validation for `includedRegionIds`/`excludedRegionIds` runs only at save boundaries where the store resolves the owning system (its existing system lookup seam); load paths never throw on stale ids.

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

Runtime automation should listen at Fabricate's Foundry edge layer, resolve mapped Scene Regions for the placed token(s) of the party's travel actor, and update party current-region evidence/discovery. The first slice may persist mapping fields and manual controls without implementing automatic event handling, but the spec must leave room for automation.

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

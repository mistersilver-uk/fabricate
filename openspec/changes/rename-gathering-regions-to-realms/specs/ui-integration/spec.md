# UI Integration Spec Delta

## Renamed Surface

### Gathering Region authoring → Gathering Realm authoring

The Manager Travel-tab geography authoring surface formerly working in **Regions** is renamed to
**Realms**. Its components, test hooks, CSS classes, i18n keys/values, and the player-facing
realm-locked chip are renamed from `region` to `realm`; its capabilities are unchanged.

Requirements:

1. When `features.gathering === true` and the realm/travel subsystem is enabled, Manager exposes
   realm authoring (name, description, image, enabled, secret, biomes; create/delete with
   referenced-by confirm) in the Travel tab, renamed from the region quick-list / regions tab.
2. Renamed components: `GatheringRegionQuickList.svelte`→`GatheringRealmQuickList.svelte`,
   `GatheringRegionsTab.svelte`→`GatheringRealmsTab.svelte`, `RegionNameField.svelte`→
   `RealmNameField.svelte`, `RegionEnvironmentsEditor.svelte`→`RealmEnvironmentsEditor.svelte`.
3. Renamed test hooks / CSS: `data-manager-region-editor` / `-env-editor` / `-name-field`→
   `data-manager-realm-*`; the `is-region` CSS modifier→`is-realm`;
   `data-environment-field="includedRegionIds"`→`"includedRealmIds"`; the `.*-region-*` CSS classes
   scoped to these surfaces→`.*-realm-*`.
4. The Environments editor exposes realm membership via `includedRealmIds` / `excludedRealmIds`
   (renamed from the region equivalents); the included / excluded / non-matching wiring is unchanged.
5. The player environment list's "Not in current region" chip and the realm-locked teaser are
   reworded/renamed to Realm (e.g. `RegionLockedChip`→realm copy, the
   `player-gathering-region-locked` screenshot id→`player-gathering-realm-locked`).
6. The admin-store realm CRUD/state surface is renamed: `selectedSystemRegions`→`selectedSystemRealms`,
   `getRegionStore`→`getRealmStore`, `createRegionQuick`/`renameRegion`/`toggleRegionEnabled`/
   `updateRegion`/`deleteRegion`→`…Realm…`, `setGatheringRegionsEnabled`→`setGatheringRealmsEnabled`,
   `setEnvironmentRegionMembership`→`setEnvironmentRealmMembership`, `setPartyRegionOverride`/
   `clearPartyRegionOverride`/`dropStaleOverrideRegion`→`…Realm…`.

## Map Region Links tab — kept, with a per-string copy split

The Map Region Links tab (`GatheringMapLinksTab.svelte`, `MapRegionLinkPicker.svelte`) links a
Foundry **Scene Region** to a Fabricate **Realm**. Because it spans both concepts, the boundary runs
*through* this one surface:

Requirements:

1. The tab structure, component names, the `data-manager-map-region-uuid` hook, and the map-side i18n
   keys/copy (`Travel.Tabs.MapLinks` "Map Region Links", `PartiesInMapRegionTitle`,
   `NoPartiesInMapRegion`, `InspectorKicker` "Selected map region", `NoScene`/`NoRegions`/
   `UnnamedRegion`) are **kept** — they describe the Foundry Scene Region.
2. The Fabricate **link-destination** copy is reworded to Realm: `LinkSectionTitle` / `LinkLabel`
   ("Linked Fabricate region"→"Linked Fabricate realm"), `PartiesInFabricateRegionTitle` /
   `NoPartiesInFabricateRegion` / `NotLinked`, and the picker's Fabricate option labels. The
   adminStore field `partiesInFabricateRegion`→`partiesInFabricateRealm` renames in lockstep.

## Unchanged

The Foundry canvas Region surfaces — `Canvas.Interactable.Region.Label`, `PlaceRegionOnly` /
`RegionOnlyHint` / `JumpToRegion`, the `fabricate.interactable` Region Behaviour config sheet, and
the scene-region sensing util — are Foundry's Region concept and are **not** renamed. The shipped
`Migration.UnifyRegions.Notice` i18n **key** is kept (it names the shipped 0.9.0 migration history);
only its value copy rewords to Realm.

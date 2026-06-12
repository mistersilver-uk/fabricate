# Design — Rename Gathering Regions to Gathering Realms

## The rename boundary (Realm vs Foundry Region)

This is the load-bearing decision of the whole change. There are two distinct "Region" concepts:

- **Fabricate gathering geography** — authored in the Travel tab, scoped to a crafting system, owns
  no tasks/drops, gates availability. This is the rename target → **Realm**.
- **Foundry Scene Region** — `RegionDocument` / `RegionBehavior`, a canvas polygon with behaviours.
  This is Foundry's own first-class object. **Never renamed.**

The two are bridged: a Realm's `sceneMappings[].sceneRegionUuid` points at a Foundry `RegionDocument`,
and the mapping is intentionally many-to-one (several scene regions → one Realm). The bridge fields
are Foundry-named and stay verbatim.

### RENAME (Fabricate gathering concept → Realm)

| Area | Before → After |
|------|----------------|
| `src/systems/gatheringRegions.js` (file) | `gatheringRealms.js` |
| Exported constants | `GATHERING_REGION_REVEAL_MODES` / `…MODIFIER_VISIBILITIES` / `…MODIFIER_KINDS` / `…MODIFIER_OPERATIONS` → `GATHERING_REALM_*` |
| Exported fns | `normalizeGatheringRegion[List|Modifier|SceneMapping|Settings]` / `validateGatheringRegion[List|Modifiers|SceneMappings|Settings]` / `isGatheringRegionsEnabled` → `…Realm…` |
| `src/systems/GatheringRegionStore.js` (file) | `GatheringRealmStore.js`; class `GatheringRegionStore`→`GatheringRealmStore`; error `GatheringRegionValidationError`→`GatheringRealmValidationError` |
| Persisted system field | `gatheringRegions`→`gatheringRealms`, `gatheringRegionSettings`→`gatheringRealmSettings` |
| `src/systems/gatheringRegionDiscovery.js` (file) | `gatheringRealmDiscovery.js`; `getDiscoveredGatheringRegions`/`isGatheringRegionDiscovered`/`revealGatheringRegion`/`hideGatheringRegion`/`getDiscoveredRegionIdsForSystem`→`…Realm…`; actor flag key `discoveredGatheringRegions`→`discoveredGatheringRealms`; inner `regionId`→`realmId` |
| `src/systems/GatheringLocationService.js` | `resolveCurrentRegions`/`buildCurrentRegionContext`→`…Realm…`; returned `regions`/`regionIds`/`staleRegionIds`→`realms`/`realmIds`/`staleRealmIds`; `_getRegions`/`_regionsEnabled`→`…Realm…` |
| `src/systems/GatheringPartyStore.js` | `currentRegionOverrides`→`currentRealmOverrides`; `setCurrentRegionOverride`/`clearCurrentRegionOverride`→`…Realm…`; inner `regionIds`→`realmIds` |
| `src/systems/gatheringLocation.js` | `buildRegionDisclosure`→`buildRealmDisclosure`; `UNDISCOVERED_PLACEHOLDER_KEY` value `…Region.UndiscoveredPlaceholder`→`…Realm.UndiscoveredPlaceholder`; **the reason-code/state STRING LITERALS it PRODUCES** — `['NO_CURRENT_REGION']` (`:78`) / `includes('NO_CURRENT_REGION')` (`:256`) → `…REALM`, and disclosure-state `'noCurrentRegion'` (`:257`) + `:235` JSDoc → `'noCurrentRealm'` (in lockstep with the engine reason-code + `EnvironmentCard.svelte`/`gatheringBlockedReasons.js` consumers, see §Engine reason-code consumers); the region-named locals/params throughout (e.g. `includedRegionIds`/`excludedRegionIds` reads, `matchedRegionIds`, `regionsById`, `discoveredRegionIds`) |
| `src/systems/GatheringEnvironmentStore.js` | env fields `includedRegionIds`/`excludedRegionIds`→`includedRealmIds`/`excludedRealmIds`; validation error strings; the `gatheringRegions` lookup (now `gatheringRealms`). LEAVE `includedBiomeIds`/`excludedBiomeIds`, `biomes`, and the inert legacy `region` string |
| `src/systems/GatheringEngine.js` | `_currentRegionSummary`/`_resolveRegionContext`/`_regionRevealMode`/`_locationBlockedReasons`; listing output `region`/`regionsEnabled`/`currentRegions`→`realm`/`realmsEnabled`/`currentRealms`; `NO_CURRENT_REGION` reason + i18n key → `…Realm…` (see §Engine reason-code consumers — `NO_CURRENT_REGION`→`NO_CURRENT_REALM` is a cross-file lockstep) |
| Engine reason-code consumers (§below) | `EnvironmentCard.svelte` (`reason?.code === 'NO_CURRENT_REGION'`→`'NO_CURRENT_REALM'`) and `gatheringBlockedReasons.js` `BLOCK_LABEL_KEYS` key `NO_CURRENT_REGION`→`NO_CURRENT_REALM` rename in lockstep with the engine reason-code |
| Actor-bar Realm-context source (§below) | `actorBarStore.svelte.js` `regionContext`/`setRegionContext`/`regions` payload → `realmContext`/`setRealmContext`/`realms`; `ActorSelectTopBar.svelte` `showRegion`/`regionNames`/`regionLabel`/`.actor-bar-region`/`ActorBar.Region.None`; `GatheringView.svelte:281` `setRegionContext({ enabled, regions })`→`setRealmContext({ enabled, realms })` |
| `src/systems/CraftingSystemManager.js` | `gatheringRegions`/`gatheringRegionSettings` fields + normalizer call sites → `…Realm…` |
| `src/main.js` API | `getGatheringRegionStore`/`getGatheringLocationForActor` region internals/`setGatheringPartyRegionOverride`/`clearGatheringPartyRegionOverride`/`revealGatheringRegionForActor`/`hideGatheringRegionForActor`; `gathering.*` helper aliases (`getRegionStore`/`setPartyRegionOverride`/`clearPartyRegionOverride`/`revealRegionForActor`/`hideRegionForActor`); `GatheringRegionStore` in `api` → `…Realm…` (PLUS deprecated delegates, see below) |
| UI Svelte (git mv) | `GatheringRegionQuickList.svelte`→`GatheringRealmQuickList.svelte`; `GatheringRegionsTab.svelte`→`GatheringRealmsTab.svelte`; `RegionNameField.svelte`→`RealmNameField.svelte`; `RegionEnvironmentsEditor.svelte`→`RealmEnvironmentsEditor.svelte`; **`RegionOverridePicker.svelte`→`RealmOverridePicker.svelte`** (see below — it imports `SearchablePopover`, NOT any of the 4 above) |
| UI Svelte (in-place) | realm state/handlers/props in `EnvironmentOverviewTab.svelte`, `GatheringTravelView.svelte`, `CraftingSystemManagerRoot.svelte`, `adminStore.js`, `GatheringView.svelte`, **`EnvironmentsBrowserView.svelte`** (large realm surface — see below), **`GatheringPartiesTab.svelte`** (renders the override picker — see below) |
| UI Svelte (tab descriptor) | `GatheringTravelTabs.svelte` imports **no** components; its edit is the `{ id: 'regions', … key: 'Regions', fallback: 'Regions' }` tab descriptor (line 14) → realm token + key/fallback (see §Travel-tab sub-route token below) |
| `src/systems/CraftingSystemExporter.js` (lines 75-81) | reads/validates `data.system.gatheringRegions`, emits `'System "gatheringRegions" field must be an array'` / `'Gathering region at index ...'` → rename to `gatheringRealms` + add a **legacy `gatheringRegions` READ fallback** (per §4 import-fallback policy: read `data.system.gatheringRealms ?? data.system.gatheringRegions`) so pre-rename exports still validate; reword the warning strings to "realm" |
| `src/ui/SvelteCraftingSystemManagerApp.svelte.js` (line 99) | `getGatheringRegionStore: () => game?.fabricate?.getGatheringRegionStore?.()` Realm API call site → canonical `getGatheringRealmStore`. KEEP its Foundry-scene lines (12/14/101-121: `sceneRegions.js`, `regionHitTest.js`, `getCurrentSceneRegions`, `getActorUuidsInSceneRegion`, `sceneRegionUuid`) |
| Test hooks / CSS | `data-manager-region-*` (e.g. `data-manager-region-editor`/`-env-editor`/`-name-field`) → `data-manager-realm-*`; `data-gathering-region-toggle-panel` (`EnvironmentsBrowserView.svelte:912`) → `data-gathering-realm-toggle-panel`; `data-environment-region-empty` + `.manager-environment-region-empty` (`environment/EnvironmentOverviewTab.svelte:173`, live realm empty-state) → `data-environment-realm-empty` / `.manager-environment-realm-empty`; `is-region` CSS modifier → `is-realm` (live realm surfaces only — see §F boundary note); `data-environment-field="includedRegionIds"` → `"includedRealmIds"`; the live-realm `.*-region-*` CSS (~`styles/fabricate.css` 2340/2344) → `.*-realm-*`; the player realm-lock card scoped CSS `.gathering-env-card-region-alert` / `.gathering-env-card-region-label` (`EnvironmentCard.svelte` 461/475 + render at 129/131) → `…-realm-alert`/`…-realm-label` |
| Travel-tab sub-route token | `'regions'` → `'realms'` (the paired `data-travel-panel="regions"` hook, AND the hardcoded `id="travel-panel-regions"` / `aria-labelledby="travel-tab-regions"` in `GatheringRegionsTab.svelte:99,101` — `GatheringTravelTabs` derives `aria-controls="travel-panel-{tab.id}"`/`id="travel-tab-{tab.id}"` from the descriptor id, so the panel ids must move in lockstep or the tab↔panel ARIA relationship breaks) — see §Travel-tab sub-route token below |
| Public API route/data | (no manager `data-manager-view` route for realms today — the Travel route id `manager-gathering-nav-travel` is unrelated; see *Ambiguities*) |

#### EnvironmentsBrowserView.svelte (large realm surface)

`src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte` carries a broad realm surface and was
absent from the table. It RENAMES:

- Props / handlers: `gatheringRegionSettings`, `onSetGatheringRegionsEnabled`, `travelSystemRegions`,
  `travelSelectedRegionId`, `onSelectRegion`, `onAddEnvironmentToRegion`,
  `onRemoveEnvironmentFromRegion`, `onSetPartyRegionOverride`, `onClearPartyRegionOverride`,
  `onDropStaleOverrideRegion`, `onCreateRegionQuick`, `onRenameRegion`, `onToggleRegionEnabled`,
  `onUpdateRegion`, `onDeleteRegion` → the `…Realm…` equivalents (in lockstep with adminStore +
  CraftingSystemManagerRoot, which pass these props).
- `import GatheringRegionsTab` (line 14) → `GatheringRealmsTab` (this import BREAKS the build on the
  Step 4 `git mv` unless updated in lockstep).
- `regionsEnabled` derived → `realmsEnabled`.
- Env projection `includedRegionIds` (line 202) → `includedRealmIds`.
- Test hook `data-gathering-region-toggle-panel` (line 912) → `data-gathering-realm-toggle-panel`.
- `Environment.RegionToggle.*` i18n references → realm.
- `activeTravelTab === 'regions'` (line 881) → `'realms'` (see §Travel-tab sub-route token).

#### GatheringPartiesTab.svelte + RegionOverridePicker → RealmOverridePicker

`src/ui/svelte/apps/manager/GatheringPartiesTab.svelte` was absent. It RENAMES:

- Props `systemRegions`, `onSetRegionOverride`, `onClearRegionOverride` → `systemRealms`,
  `onSetRealmOverride`, `onClearRealmOverride`.
- Locals `party.overrideRegionIds` → `party.overrideRealmIds`; `chooseOverride(party, regionId)` →
  `chooseOverride(party, realmId)`.
- Its `import RegionOverridePicker` + render (line 22/165, `regions={systemRegions}` line 167) →
  `RealmOverridePicker` with `realms={systemRealms}`.
- The region-named doc comment (lines 11-13).

`src/ui/svelte/apps/manager/RegionOverridePicker.svelte` — **DECISION: `git mv` →
`RealmOverridePicker.svelte`.** It imports `SearchablePopover` only (NOT any of the 4 renamed
components — the earlier "imports renamed components" characterization was wrong). It RENAMES:

- Its `regions` prop → `realms`, and the `region`-named internals (`options` map var `region`,
  `selectedName` lookup).
- Its `Travel.Parties.Override*` i18n and the `NoRegionMatches` key + `'Unknown region'` fallback →
  realm copy.
- Its `writeCompiledSvelte` consumers: `tests/components/manager-mounted.test.js:57` and
  `tests/components/gathering-parties-tab.test.js:74` → the new `RealmOverridePicker.svelte` path.

### Engine reason-code consumers (`NO_CURRENT_REGION`→`NO_CURRENT_REALM` lockstep)

The engine surfaces the location-blocked reason code (`NO_CURRENT_REGION`→`NO_CURRENT_REALM`, design
table row for `GatheringEngine.js`), but the **PRODUCER** of that string literal — and of the paired
disclosure `state` value — is `src/systems/gatheringLocation.js`, which the engine merely re-exports.
The engine↔consumer lockstep is incomplete without it, so rename the producer literals in the SAME
slice:

- **`src/systems/gatheringLocation.js`** (PRODUCER of the reason code + disclosure state):
  - `gatheringLocation.js:78` — `reasons: ['NO_CURRENT_REGION']` → `['NO_CURRENT_REALM']` (the
    inclusion-gated "no current realm resolved" branch).
  - `gatheringLocation.js:256` — `result.reasons.includes('NO_CURRENT_REGION')` → `'NO_CURRENT_REALM'`
    (the travel-guidance consumer of its own reason).
  - `gatheringLocation.js:257` — disclosure-state value `state: 'noCurrentRegion'` → `'noCurrentRealm'`,
    and the matching `:235` JSDoc return-union member `state: 'noCurrentRegion'|'excluded'|'travel'`
    → `'noCurrentRealm'|…`.
  - These align with the spec deltas already committing to `NO_CURRENT_REALM`
    (`specs/gathering-and-harvesting/spec.md:28`) and the `noCurrentRealm` guidance state (`:34`).
  - Producer pinning tests in this lockstep slice (already in the realm-token test list):
    `tests/gathering-location-availability.test.js:32`, `tests/gathering-blocked-reasons.test.js:18,25,31,46`,
    `tests/gathering-engine-location-gating.test.js:104`, `tests/gathering-region-disclosure.test.js:52,63`.

Two further player-facing consumers read the engine code by string and break **silently** if the key
renames and they do not — they were absent from the table:

- **`src/ui/svelte/apps/gathering/EnvironmentCard.svelte`** (player realm-lock card). RENAMES:
  - `regionAlertTitle`'s `reason?.code === 'NO_CURRENT_REGION'` (line 90) → `'NO_CURRENT_REALM'`
    (the lockstep with the engine reason-code — if this lags, the locked-card header alert silently
    falls back to the generic chip label).
  - `notInRegion` derived (line 83) → `notInRealm`; `regionAlertTitle` (88) → `realmAlertTitle`.
  - The `RegionLockedChip` localize calls (92, 131) →
    `FABRICATE.App.Gathering.Environments.RealmLockedChip` (in lockstep with the i18n rename, Step 5).
  - Scoped CSS `.gathering-env-card-region-alert` (461, render 129) /
    `.gathering-env-card-region-label` (475, render 131) → `…-realm-alert` / `…-realm-label`, and the
    region-named comments (79-82, 457-459).
  - KEEP the `'LOCATION_BLOCKED'` code (line 90) — that is a separate, un-renamed engine reason.
- **`src/ui/svelte/apps/gathering/gatheringBlockedReasons.js`** — `BLOCK_LABEL_KEYS` is keyed on
  `NO_CURRENT_REGION` (line 26). Rename the **key** `NO_CURRENT_REGION`→`NO_CURRENT_REALM` in
  lockstep with the engine reason-code. (Its i18n value `…Detail.Callout.NoRegion` rewords with the
  Step 5 i18n sweep; KEEP the other un-renamed reason-code keys.)

### Actor-bar Realm-context source (PRODUCER + CONSUMER)

The actor-bar current-region header chip is a **true Realm surface** (its store doc says it mirrors
the gathering environment's region/travel disclosure list — it is NOT a Foundry-Region). The pinning
tests were already in the lockstep list, but the SOURCE files they pin were not. RENAMES:

- **`src/ui/svelte/stores/actorBarStore.svelte.js`** (Realm consumer/store):
  - `regionContext` state (37) → `realmContext`; `setRegionContext` (147) → `setRealmContext`;
    `get regionContext()` getter (170-171) → `get realmContext()`.
  - The `regions:` payload shape (37, 150) → `realms:`; the `next?.regions` read (150) → `next?.realms`.
  - The doc comments (32-36, 140-145) reword "region/travel"/"no region selected" → realm.
- **`src/ui/svelte/components/ActorSelectTopBar.svelte`** (Realm consumer):
  - `showRegion` (87) → `showRealm` (`store?.realmContext?.enabled`); `regionNames` (88) →
    `realmNames` (`store?.realmContext?.realms`); `regionLabel` (95) → `realmLabel`; the `region`
    map param (90) → `realm`.
  - `localize('FABRICATE.App.ActorBar.Region.None')` (96) →
    `FABRICATE.App.ActorBar.Realm.None`; the undiscovered placeholder `FABRICATE.Gathering.Region.UndiscoveredPlaceholder`
    (91) → `…Realm.UndiscoveredPlaceholder` (Step 1 already renames this key value).
  - `.actor-bar-region` scoped class (264) → `.actor-bar-realm`; the region-named comments (84-86).
- **`src/ui/svelte/apps/gathering/GatheringView.svelte:281`** — the producer call
  `store?.setRegionContext({ enabled, regions })` → `setRealmContext({ enabled, realms })`, reading
  `selectedEnvironment?.realmsEnabled` and `selectedEnvironment?.currentRealms` (in lockstep with the
  engine listing-output rename — `regionsEnabled`/`currentRegions`→`realmsEnabled`/`currentRealms`).

### KEEP (Foundry Scene Region — must NOT change)

- Files: `src/canvas/regionHitTest.js`, `src/ui/svelte/util/sceneRegions.js`,
  `src/canvas/regions/FabricateInteractableRegionBehavior.js`,
  `src/canvas/regions/interactableRegionFlags.js`, `src/canvas/InteractableManager.js`, and the rest
  of `src/canvas/regions/`.
- Identifiers: `RegionDocument`, `RegionBehavior` / `RegionBehaviorConfig`, `region.flags`,
  `region.uuid`, `TokenDocument#regions`, `senseSceneRegions`, `sceneRegionUuidsContainingToken`,
  `INTERACTABLE_BEHAVIOR_SUBTYPE='fabricate.interactable'`, `resolveRegion`,
  `getCurrentSceneRegions`, `getActorUuidsInSceneRegion`.
- Realm-record / discovery-flag bridge fields: `sceneMappings`, `sceneRegionUuid`, `sceneUuid`.
- adminStore Foundry-side: `currentSceneRegions`, `linkBySceneRegionUuid`, `setMapRegionLink`,
  `partiesInMapRegion`, `getCurrentSceneRegions`. (The Fabricate-side `partiesInFabricateRegion`
  RENAMES → `partiesInFabricateRealm`, see below.)
- i18n: `FABRICATE.Canvas.Interactable.Region.Label`, `PlaceRegionOnly` / `RegionOnlyHint` /
  `JumpToRegion`, `PartiesInMapRegionTitle`, and the Map Region Links tab key names
  (`GatheringMapLinksTab.svelte` `data-manager-map-region-uuid`, `MapRegionLinkPicker.svelte`). Only
  the Fabricate **link destination** strings ("Fabricate region"→"Fabricate realm") and Fabricate
  picker option labels reword.
- Archived `openspec/changes/unify-gathering-regions/` and
  `openspec/changes/location-aware-gathering-regions/`; `src/migration/migrateUnifyGatheringRegions.js`
  and its `_unifiedRegionSystems` identifiers (shipped history that emits the OLD schema).
- The AWS `region: 'eu-west-2'` config in `tests/ui-pr-screenshot-evidence.test.js` and
  `scripts/` (cloud region, unrelated).

### Boundary corrections — inert legacy `region` stays (do NOT over-reach)

These look like rename targets but are the **inert legacy `region` free-text family** and must STAY
`region` (they are kept verbatim alongside the renamed Realm surface — see tasks.md:17 and the
`data-models` spec's `region?` field):

- **`src/ui/svelte/apps/gathering/GatheringEventDetail.svelte:192`** — the
  `is-region` chip iterates the inert legacy `event.regions[]` composition-tag array (the `regions`
  derived at line 71 = `event?.regions`), NOT a Realm. It is the same inert-legacy `region` family as
  the `environment.region` free-text and is explicitly KEPT. Therefore it is **removed from the
  `is-region`→`is-realm` rename list**: the
  only live `is-region`→`is-realm` rename target is the realm authoring surface
  (`src/ui/svelte/apps/manager/environment/EnvironmentOverviewTab.svelte:186`) plus the live realm CSS
  at ~`styles/fabricate.css` 2340/2344. Keep the paired `data-evidence-field="region"` / Region
  evidence row pinned in `tests/components/manager-layout.test.js:1445,1545` (inert legacy).
- **Dead legacy-vocab CSS** — `.manager-region-add` (`styles/fabricate.css:6965`) and
  `.manager-vocabulary-pill.is-region` (7009) style the REMOVED legacy region-vocabulary editor; no
  live markup emits them (the vocab editor renders only `is-biome`). **DECISION: keep as legacy-vocab
  CSS — do not rename, do not delete.** They are NOT the live realm CSS targets (those are ~2340/2344).
  Their pinning test is `tests/components/manager-layout.test.js:438,441,442`
  (`blockFor('.fabricate-manager .manager-region-add')` and
  `blockFor('.fabricate-manager .manager-vocabulary-pill.is-region')`, asserted beside the live
  `is-biome` pill) — track it as KEEP-verifying. (NB: the brief's `theme-rendered-validation.test.js`
  reference was a mis-cite; that file pins unrelated `[data-region]` layout-boundary markers.)

### Shared travel CSS classes straddling the boundary (KEEP — distinct from realm-only chip classes)

Three `.manager-travel-region-*` classes are **shared structural layout primitives** used by BOTH the
Realm inspector AND the KEEP Map-Links scene-region inspector, so renaming them would force touching
the KEEP Foundry-scene surface (and a class split) for no user benefit. **DECISION: KEEP — do not
rename.** Each is defined ONCE in `styles/fabricate.css:10230-10272` and consumed by both surfaces:

- `.manager-travel-region-thumb` / `.manager-travel-region-item-name` / `.manager-travel-region-parties`
  — used by the Realm inspector (`CraftingSystemManagerRoot.svelte:4371-4400`) AND the Map-Links
  scene-region inspector (`:4422-4465`). Shared travel-inspector layout primitives.
- `.manager-map-link-region-card` (`styles/fabricate.css:10046`, render `CraftingSystemManagerRoot.svelte:4408`)
  — a Foundry-scene Map-Links card class (KEEP).

These KEEP classes are **DIFFERENT from the realm-only `.manager-travel-region-chip` /
`-chips` / `-chip-flag` classes in `GatheringTravelView.svelte` (RENAME → `…-realm-chip*` — see
§Live Realm `data-region-*` hooks below)**. The implementer must NOT conflate them: the `-thumb` /
`-item-name` / `-parties` / map-link-card classes are shared/scene structural classes and stay
`region`; the `-chip*` classes are realm-only authoring-surface classes and become `realm`. Both are
recorded in the grep-sweep keep-list (the KEEP set) vs the RENAME set so the distinction is explicit.

### Live Realm `data-region-*` hooks + `.manager-travel-region-chip*` (RENAME)

`src/ui/svelte/apps/manager/GatheringTravelView.svelte` is a live Realm-override authoring surface
(not a Foundry-scene surface). These are realm-only and RENAME, in lockstep with
`tests/components/gathering-travel-view.test.js:199,278,310-350`:

- `data-region-id` (`:510`) → `data-realm-id`.
- `data-stale-region` (`:555`) → `data-stale-realm`.
- `.manager-travel-region-chip` / `-chips` / `-chip-flag` (`:503/:508/:516`) → `.manager-travel-realm-chip*`
  (realm-only chip classes — DIFFERENT from the shared `-thumb`/`-item-name`/`-parties` KEEP classes above).

The per-row data hooks on the git-mv'd realm components also RENAME (these are distinct from the
already-listed `data-manager-region-editor`/`-env-editor`/`-name-field`):

- `GatheringRealmQuickList.svelte` (formerly `GatheringRegionQuickList.svelte`):
  `data-region-id` (`:139`) → `data-realm-id`; `data-region-select` (`:144`) → `data-realm-select`;
  `data-region-detail` (`:170`) → `data-realm-detail`; `data-region-field` (`:186,:202,:222,:238,:244`,
  values `enabled`/`secret`/`name`/`description`/`biomes`) → `data-realm-field`.
- `RealmEnvironmentsEditor.svelte` (formerly `RegionEnvironmentsEditor.svelte`):
  `data-region-env-column` (`:67,:118`, values `available`/`included`) → `data-realm-env-column`
  (and its `.manager-region-env-column` class is a live realm class → `.manager-realm-env-column`).
- `GatheringRealmsTab.svelte` (formerly `GatheringRegionsTab.svelte`):
  `data-manager-travel-region-id` (`:129`) → `data-manager-travel-realm-id`.

### The Map Region Links split (per-string boundary)

The Map Region Links tab is mostly KEEP (it is the Foundry-Region link surface), but a handful of
its strings name the *Fabricate link destination* and therefore RENAME:

- KEEP key names + map-side copy: `Travel.MapLinks.PartiesInMapRegionTitle`,
  `NoPartiesInMapRegion`, `InspectorKicker` ("Selected map region"), `Tabs.MapLinks`
  ("Map Region Links"), `NoScene`/`NoRegions`/`UnnamedRegion` (these describe the *scene's* regions).
- RENAME copy (destination = Fabricate geography) to Realm: `LinkSectionTitle` /
  `LinkLabel` ("Linked Fabricate region"→"Linked Fabricate realm"),
  `PartiesInFabricateRegionTitle` / `NoPartiesInFabricateRegion` /`NotLinked`
  ("…linked to a Fabricate region"→"…realm"), and the corresponding adminStore field
  `partiesInFabricateRegion`→`partiesInFabricateRealm`.
- RENAME the **`MapRegionLinkPicker` destination-picker copy** (lines 2011-2016) to Realm — these
  strings drive the picker that lists **Fabricate realms** to link the selected scene region to, so
  their "region" copy is realm-vocabulary: `None` ("Not linked"), `Stale` ("Unknown region"→"Unknown
  realm"), `SearchPlaceholder` ("Search regions..."→"Search realms..."), `SearchLabel` ("Search
  regions"→"Search realms"), `NoMatches` ("No regions match your search."→"No realms match your
  search."). KEEP `DisabledSuffix`. (Key names stay; only the values reword. The scene-side
  `PartiesInMapRegionTitle`/`InspectorKicker`/`NoScene`/`NoRegions`/`UnnamedRegion` still KEEP.)

This per-string split is the single place where the boundary runs *through* one i18n block; flag it
for the implementer and the reviewer.

## Travel-tab sub-route token (`'regions'` → `'realms'`)

**DECISION: rename the Travel-tab sub-route token `'regions'` → `'realms'`.** The Travel tab has
three sub-routes (`'parties'`, `'regions'`, `'map'`); the middle token is the realm authoring panel.
Leaving it as `'regions'` would leave a `Region` survivor in the active-tab routing/deep-link state
and violate the zero-`Region`-survivor goal. Persisted active-tab is transient UI state, so
re-keying it is acceptable (a stale persisted `'regions'` simply falls back to the default sub-tab).

The token is hardcoded at:

- `src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte:45`
  (`['parties','regions','map'].includes(tabId)`), `:2928`, `:4336`.
- `src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte:881` (`activeTravelTab === 'regions'`).
- `src/ui/svelte/apps/manager/GatheringTravelTabs.svelte:14` (the `{ id: 'regions', … }` descriptor).
- The `data-travel-panel="regions"` test hook in
  `src/ui/svelte/apps/manager/GatheringRegionsTab.svelte:102` (this file also `git mv`s →
  `GatheringRealmsTab.svelte`).
- The hardcoded **tab↔panel ARIA ids** in the same file: `id="travel-panel-regions"` (line 99) and
  `aria-labelledby="travel-tab-regions"` (line 101). `GatheringTravelTabs.svelte` derives the button
  side from the descriptor id (`id={`travel-tab-${tab.id}`}` line 34, `aria-controls={`travel-panel-${tab.id}`}`
  line 37); renaming the descriptor to `'realms'` makes the buttons emit `travel-tab-realms` /
  `travel-panel-realms`, **stranding** the hardcoded `…-regions` ids and breaking the
  `aria-labelledby`↔`id` / `aria-controls`↔`id` relationship. Rename
  `travel-panel-regions`→`travel-panel-realms` and `travel-tab-regions`→`travel-tab-realms`
  alongside the `data-travel-panel` hook.

Rename `'regions'`→`'realms'`, the `data-travel-panel` hook, and the paired panel/tab ARIA ids in
lockstep with the persisted / deep-link active-tab state and any selecting test (e.g.
`data-travel-panel="regions"` / `travel-panel-regions` panel-id selectors in the manager
component/mounted tests). All five call sites plus the test hook and the two ARIA ids move together
so no `'regions'` route token survives.

## Decisions

### 1. Full key rename + a `1.1.0` startup migration

Storage keys are renamed and a `1.1.0` migration rewrites existing worlds. Rationale: keeping
internal keys as `region` while everything else reads `realm` would leave a permanent seam and keep
the Foundry-collision confusion alive in the persistence layer. The migration infra
(`MigrationRunner` + the `migrateRenameGatheringHazardsToEvents` template) makes a safe, idempotent
rewrite cheap. `1.1.0` is the new highest version (current highest is `1.0.0`).

### 2. Public API: rename + keep deprecated aliases (non-breaking)

`game.fabricate` and its `gathering.*` helper namespace gain the canonical `*Realm*` methods. The
old `*Region*` method names are retained as thin one-line delegates that emit a single console
deprecation warning and forward to the new method. This keeps existing macros/modules working:

- `Fabricate.getGatheringRealmStore()` is canonical; `getGatheringRegionStore()` delegates +warns.
- `setGatheringPartyRealmOverride` / `clearGatheringPartyRealmOverride` /
  `revealGatheringRealmForActor` / `hideGatheringRealmForActor` are canonical; the `…Region…`
  names delegate +warn.
- `getGatheringLocationForActor` keeps its name (it does not contain "Region"); its returned shape
  renames `regions`/`regionIds`/`staleRealmIds` keys to `realms`/`realmIds`/`staleRealmIds`. Because
  the returned payload shape changes, document it in the spec delta as a Realm rename.
- `game.fabricate.gathering` gains `getRealmStore` / `setPartyRealmOverride` /
  `clearPartyRealmOverride` / `revealRealmForActor` / `hideRealmForActor`; the old
  `getRegionStore` / `setPartyRegionOverride` / `clearPartyRegionOverride` / `revealRegionForActor` /
  `hideRegionForActor` delegate +warn.
- `game.fabricate.api.GatheringRealmStore` is canonical; keep `GatheringRegionStore` as an alias
  pointing at the same class (the surface test pins both).

Use a single shared `deprecate(oldName, newName)` console helper so the warning text is uniform and
fires once per old-name call site (a simple `console.warn` is acceptable; do not throw).

### 3. Actor discovery flag: legacy-read fallback (not the migration runner)

`discoveredGatheringRegions` is an **actor flag**, not a world setting, so the `MigrationRunner`
(which only reads `craftingSystems` / `gatheringConfig` / `gatheringEnvironments` /
`gatheringParties` / `recipes` settings) never sees it. Renaming it to `discoveredGatheringRealms`
is handled by a **legacy-read fallback** in `gatheringRealmDiscovery.js`: the getter reads the new
flag key first and falls back to the old key, and every write persists under the **new** key only.
This upgrades each actor lazily on its next discovery write and never throws on a stale old-key flag.
`getDiscoveredGatheringRealms(actor)` reads `discoveredGatheringRealms ?? discoveredGatheringRegions`;
`revealGatheringRealm` / `hideGatheringRealm` clone the merged map and write `discoveredGatheringRealms`.

### 4. Import / un-migrated read fallbacks

Mirroring the hazard→event precedent (`GatheringEnvironmentStore` already accepts
`forcedHazardIds` on read), the normalizer/store read paths accept the legacy keys so a pre-rename
export imported before the `1.1.0` migration still loads:

- `GatheringEnvironmentStore._normalizeEnvironment`: `includedRealmIds: normalizeIdList(data?.includedRealmIds ?? data?.includedRegionIds)`,
  likewise `excludedRealmIds`.
- `GatheringPartyStore` override normalization: accept `currentRealmOverrides ?? currentRegionOverrides`
  and inner `realmIds ?? regionIds` on read; write the new keys.
- `CraftingSystemManager._normalizeSystem`: read `gatheringRealms ?? gatheringRegions` and
  `gatheringRealmSettings ?? gatheringRegionSettings`.

The migration is still the primary path; these fallbacks only cover the import-before-startup window.

## Migration design (`migrateRenameGatheringRegionsToRealms.js`, v1.1.0)

Modelled on `src/migration/migrateRenameGatheringHazardsToEvents.js`: a pure function deep-cloning
its inputs via `JSON.parse(JSON.stringify())`, idempotent, returning
`{ systems, environments, gatheringParties }` so the runner spread-merges those keys. Registered in
`MigrationRunner.MIGRATIONS` as the new highest version `1.1.0`.

For each crafting system in `systems[*]`:
- `renameKey(system, 'gatheringRegions', 'gatheringRealms')`.
- `renameKey(system, 'gatheringRegionSettings', 'gatheringRealmSettings')`.
- Do NOT touch `gatheringRealms[*].sceneMappings`, `…sceneRegionUuid`, `…sceneUuid`, or the modifier
  `kind`/`operation`/`visibility` values.

For each `environments[*]`:
- `renameKey(env, 'includedRegionIds', 'includedRealmIds')`.
- `renameKey(env, 'excludedRegionIds', 'excludedRealmIds')`.
- Leave `includedBiomeIds` / `excludedBiomeIds`, `biomes`, and the inert legacy `region` string.

For each `gatheringParties[*]`:
- `renameKey(party, 'currentRegionOverrides', 'currentRealmOverrides')`, then for each override map
  value, `renameKey(override, 'regionIds', 'realmIds')`.

**Runner wiring.** Add `gatheringParties` to the runner's read/diff/persist set: the runner today
reads `recipes`/`systems`/`gatheringConfig`/`environments` but NOT `gatheringParties`. Add
`SETTING_KEYS.GATHERING_PARTIES` to the loaded raw payloads, the original-JSON snapshot, the diff
check, and the conditional persist, so the party-override rename actually persists. (This is the one
non-template piece: the hazard migration only touched system/config/environment settings.)

**Idempotency:** every rename guards on "old key present AND new key absent"; a stale legacy key left
alongside an already-present new key is left inert (no clobber, no drop). A second run is a
byte-for-byte no-op. Mixed payloads migrate each key independently.

**Migration ordering invariant (load-bearing).** The new `1.1.0` rename is correct ONLY because it
runs strictly *after* the two migrations that still consume the pre-rename `gatheringRegions` key in
the semver-sorted `MIGRATIONS` pass:

- The `1.0.0` hazards→events migration reads `system.gatheringRegions` directly
  (`src/migration/migrateRenameGatheringHazardsToEvents.js:140`) to reach the per-realm modifier
  list — it must still see the OLD `gatheringRegions` key.
- The shipped `0.9.0` unify migration *writes* `gatheringRegions`
  (`src/migration/migrateUnifyGatheringRegions.js`), which the later migrations then consume.

**Invariant: `1.1.0` must remain the highest migration version and must not be reordered before
`1.0.0`, which still consumes the pre-rename `gatheringRegions` key.** If `1.1.0` ran before `1.0.0`,
the hazards migration would find `gatheringRealms` and silently skip its per-realm modifier rewrite.
Because `MIGRATIONS` is applied in semver order, registering `1.1.0` as the new highest version
satisfies the invariant; do not renumber `1.0.0`/`0.9.0` or reorder the pass. The new migration must
not read or rewrite anything those earlier migrations depend on before they run.

## Collision guards

- **`sceneRegionUuid` / `sceneMappings` / `sceneUuid`** — substring `Region` appears inside
  `sceneRegionUuid`. These are Foundry-bridge fields and must NOT match a bulk replace. The rename
  must be done with whole-identifier edits, never a blind `Region`→`Realm` text sweep.
- **`src/canvas/regions/**` and `RegionBehavior`/`RegionDocument`** — Foundry Region objects; never
  a replace source.
- **`senseSceneRegions` / `sceneRegionUuidsContainingToken` / `getCurrentSceneRegions` /
  `getActorUuidsInSceneRegion`** — Foundry sensing; keep.
- **AWS `region` config** (`tests/ui-pr-screenshot-evidence.test.js:260,306`, S3 publish scripts) —
  cloud region; keep.
- **`migrateUnifyGatheringRegions.js`** and `_unifiedRegionSystems` / `unifiedRegionSystems` (in
  `MigrationRunner.js` and `main.js`) — shipped 0.9.0 history producing the OLD schema; keep. The new
  `1.1.0` migration consumes that schema's output.
- **`FABRICATE.Migration.UnifyRegions.Notice`** i18n key — names the shipped 0.9.0 migration; the
  brief lists it under rename, but its key path mirrors the `migrateUnifyGatheringRegions` history
  that is explicitly kept. Decision: keep the **key** `UnifyRegions.Notice` and the
  `unifiedRegionSystems` plumbing (shipped-history names), and reword only the **value** copy to
  "Realm" so the GM-facing notice uses the new vocabulary. (See *Ambiguities*.)

## Layer ordering (each step keeps `npm test` + `npm run build` green)

A storage-key, API-name, or i18n-key rename must land together with its consumer or tests break.
Sequence: OpenSpec → persistence/migration/runtime (`gatheringRealms.js`, `GatheringRealmStore.js`,
`gatheringRealmDiscovery.js`, `GatheringLocationService`, `GatheringPartyStore`, `gatheringLocation`,
`GatheringEnvironmentStore`, `GatheringEngine`, `CraftingSystemManager`, the migration + runner +
their tests) → public API in `main.js` (canonical + deprecated delegates) + the surface test →
admin store + manager root → Svelte components (`git mv`) + test-hooks + CSS (+ component/mounted/
screenshot tests) → i18n keys/values (incl. the Map Region Links per-string split) → docs/specs.

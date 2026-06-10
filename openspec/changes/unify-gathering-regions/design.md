# Design: Unify Gathering Regions

## Concept Boundary

- **Region** (`GatheringRegion`) answers "where is this — and where is the party?" It is geography. It drives location availability, current-region resolution, travel, and discovery. It is NOT a composition axis.
- **Biome** answers "what terrain/ecology is here?" It is a composition axis (which tasks/hazards belong) and the source of a region's terrain traits.
- **Danger** answers "how dangerous?" It is a composition axis for hazards.
- **Environment** answers "what gathering activity is available?" It declares which regions it belongs to and which biomes/danger it matches.

The legacy region vocabulary conflated geography with composition tagging. This change removes that conflation: composition uses biome + danger; geography uses `GatheringRegion`.

## Composition Change

`evaluateEnvironmentMatch` (`src/systems/gatheringMatch.js`) currently matches on region + biome + danger. Region is removed:

- A task/hazard composes into an environment when their biomes intersect (and, for hazards, danger), exactly as today minus the region axis.
- The `region` axis, `recordRegionList`, `envRegion`, and `evidence.region` are removed. Every consumer of `evidence.region` (composition match evidence) is pruned — verified consumers: `MatchingEvidenceChips.svelte`, `GatheringTasksBrowserView.svelte`, `GatheringHazardsBrowserView.svelte`, `CraftingSystemManagerRoot.svelte` (inspector evidence), the admin composition view model in `adminStore.js`. NOTE: `adminStore.js` `evidence.regions` (travel current-region geography) is NOT composition evidence and must NOT be pruned.
- Task/hazard normalizers stop reading `region`/`regions` (`GatheringRichStateService` + `adminStore`).

**Composition-outcome direction (important):** today an empty match-tag dimension means "matches any". So a task that was *narrowed* by a region tag but has empty `biomes` will, after its region tag is stripped, become "matches any biome" — it composes into **more** environments, not fewer. A task that matched by region AND biome keeps composing by biome. The GM notice and migration copy MUST say region-scoped tasks/hazards "may now appear in more environments," not merely "may change." This is an intentional, version-gated behavior change (see Migration).

## Region Settings: Enable Flag

`gatheringRegionSettings` (`src/systems/gatheringRegions.js`) gains an `enabled` boolean:

```js
GatheringRegionSettings = {
  enabled: boolean,            // default false — gates the whole region/travel subsystem
  revealMode: "manual" | "onPartyTokenEntry" | "alwaysVisible",
  modifierVisibility: "visible" | "gmOnly",
}
```

- Default `false`. Only an explicit `true` enables; non-boolean is invalid at save/import and coerces to `false` on read.
- A shared `isGatheringRegionsEnabled(system)` helper is the single source of truth every gate reads.
- Homed on `gatheringRegionSettings` (not `system.features`) because the region store already owns the normalize/validate/persist boundary for region behavior and `updateRegionSettings` is the existing write path; this keeps reveal/modifier/enabled coherent and round-trips through `_normalizeSystem` for export/import.

## Toggle Gating

When `isGatheringRegionsEnabled(system)` is false, the system behaves as if no environment is location-gated and no travel surfaces exist. Gate points:

- **Engine (central choke point):** `GatheringEngine._locationBlockedReasons` early-returns the ungated `location` shape when disabled, before the `environmentHasLocationRules` check. `system` is in scope at all callers (`startAttempt`, `_environmentBlockedReasons`, and the method param). This also neutralizes the listing `location` field.
- **Resolver:** `GatheringLocationService.resolveCurrentRegions` / `resolveForActor` / `buildCurrentRegionContext` fast-exit to the unresolved-empty shape (the service reads the system via its `systemManager`).
- **Public API (`src/main.js`):** `getGatheringLocationForActor` → `null`; `setGatheringPartyRegionOverride` / `clearGatheringPartyRegionOverride` → `null`; `revealGatheringRegionForActor` / `hideGatheringRegionForActor` → `false` (this also gates discovery writes).
- **Manager UI:** the `travel` nav item is hidden; the environment editor hides region selectors. The nav filtering MUST also feed the tab-resolution/fallback guards (`selectGatheringTab`/`openGatheringSection` validate against the nav-item list) so a stale `activeGatheringTab === 'travel'` actually falls back to `environments` — filtering only the render is insufficient. The Settings tab stays visible (it hosts the toggle), and the toggle card includes hint copy naming where Travel lives ("Enabling this reveals the Travel tab…") so a GM can connect the toggle to the outcome.
- **Player UI:** no current-region surface exists yet; when one is built it must gate on the flag. Today the suppressed engine `location` field is sufficient.

This mirrors the existing `system.features?.gathering` gating precedent.

## Environment Multi-Region

`environment.includedRegionIds` (already present, normalized) becomes the editor-surfaced region membership — a multi-select chip control mirroring the biome selector, sourced from `system.gatheringRegions`, gated on the toggle. The legacy single `environment.region` string is left readable but inert (no longer composition input, not surfaced in the editor). `excludedRegionIds` and the biome-availability fields remain available but the editor surfaces `includedRegionIds` as the primary region control in this change.

**Empty-region state:** when the toggle is on but the system has no `GatheringRegion` records yet, the selector mirrors the biome selector's graceful empty handling (hide the add-`<select>`, show a muted line) and adds a hint pointing the GM to the Travel tab to create regions first.

## Region UI Removal (full scope)

Removing the region vocabulary is broader than the settings panel. All of the following region UI becomes inert once region is no longer a composition axis and the vocabulary is cleared, and MUST be removed (verified surfaces):

- **Settings vocabulary panel** — the `regions` entry in the vocabulary editor (`EnvironmentsBrowserView.svelte`); remove the `regions` dimension from the shared vocabulary helpers/actions (`adminStore.js`). Biome vocabulary stays.
- **Task editor** — the `region` availability picker in `GatheringTaskEditView.svelte` (the `['regions','biomes','timeOfDay','weather']` block) and its `regionOptions` prop pass-through from `CraftingSystemManagerRoot.svelte`.
- **Hazard editor** — the equivalent `region` picker in `GatheringHazardEditView.svelte` + its hint copy + prop pass-through.
- **Task browser** — region filter `<select>`, `regionOptions`, per-row region chips, and `regionFilter` state/logic in `GatheringTasksBrowserView.svelte`.
- **Hazard browser** — region filter, `regionOptions`, `matchesRegion`, region chips in `GatheringHazardsBrowserView.svelte`.
- **Environments browser** — the legacy "Region" filter (`regionOptions` derived from `environment.region`, `matchesRegion`, filter state) in `EnvironmentsBrowserView.svelte`. Repointing it at `includedRegionIds` is out of scope; remove it (the multi-region data is authored in Travel and surfaced in the env editor). Confirm no environment-row or list label reads `environment.region`.

## Region Authoring In Travel

Region CRUD moves entirely into the Travel tab. The `GatheringRegionQuickList` (name + enabled only) grows into the canonical region authoring surface: name, description, image, enabled, secret, and biomes (chosen from the system biome vocabulary). To support this:

- Widen the Travel view-model projection (`adminStore.js` `selectedSystemRegions`, currently `{id,name,enabled,secret}`) to carry `description`, `img`, and `biomes`.
- Thread the system **biome vocabulary** options into the Travel view (not passed today) so region biome authoring has a source.
- Add store update actions for the new fields → `GatheringRegionStore.update` (merge patch so unedited fields round-trip).
- The current inline `<ul>` of name+enabled rows will not scale to full authoring; use a region list + detail layout within the Travel view, with namespaced `.manager-travel-region-*` CSS.
- **Delete confirmation is a behavior change:** the current quick-list delete removes immediately with no confirm. The expanded authoring MUST route delete through `services.confirmDialog` with referenced-by evidence (this is a deliberate change, not assumed prior behavior).

The legacy region vocabulary editor is removed, and the `regions` dimension is removed from the shared vocabulary helpers. The biome vocabulary stays.

## Migration

A versioned, idempotent migration runs through the existing migration runner. The legacy region vocabulary lives in `gatheringConfig.systems[systemId].vocabularies.regions` (one setting), `GatheringRegion` records live on crafting `systems` (a different setting), and environments are a third — the runner exposes all three payloads in one pass. **Correlation key is the crafting-system id.** Steps:

1. For each crafting system `sysId`, append a `GatheringRegion` (`{ id, name: label || id, enabled: true }`) for each `gatheringConfig.systems[sysId].vocabularies.regions.values` entry not already present on that system's `gatheringRegions[]` (id-dedupe → idempotent). A `gatheringConfig` system id with no matching crafting system is skipped (no target to write to). Duplicate vocabulary *labels* with distinct ids produce distinct regions (dedupe is by id, matching the vocabulary's own identity model).
2. For each environment with a non-empty legacy `region` and empty `includedRegionIds`: if a derived `GatheringRegion` with that id exists, set `includedRegionIds = [thatId]`; **orphan fallback** — if the `environment.region` string has no matching vocabulary-derived region (legacy free-text), leave `includedRegionIds` empty and leave the inert `region` string in place (no stale-reference creation, no data loss; the environment is simply not location-gated).
3. Strip `region` / `regions` from gathering-config tasks and hazards.
4. Clear each migrated system's `gatheringConfig.systems[sysId].vocabularies.regions` to `{ values: [] }` after deriving.
5. Leave `gatheringRegionSettings.enabled` unset → normalizes to `false`. Fire a one-time GM notice naming systems that had regions (using the runner's transient-notice pattern — the field is surfaced to the GM and stripped before persist), warning that region-scoped tasks/hazards may now appear in more environments (see Composition-outcome direction).

Idempotency: id-dedupe on regions, the empty-`includedRegionIds` guard, the orphan-leave-inert rule, and the cleared vocabulary mean a second run is a no-op. Edge cases that MUST be tested: orphan `environment.region`, duplicate vocabulary labels, a partially-migrated system (some `gatheringRegions` already exist alongside legacy vocab), and a `gatheringConfig` system id with no matching crafting system.

**Reconcile with the 0.2.0 migration:** `migrateGatheringConfig` intentionally *preserves* per-system `vocabularies.regions` (asserted by `tests/migrate-gathering-config.test.js` and `tests/stores/adminStore.test.js`). This change clears it. Those tests and assertions must be updated in lockstep, and the new migration must run after (higher version than) the 0.2.0 one so it sees the preserved per-system vocab.

Import/export: regions and region settings round-trip through `_normalizeSystem`. Imports do not re-run the migration, so a pre-unification export imported later carries legacy data and is upgraded idempotently on the next startup. Document "import upgrades on next load," and cover it with a test (legacy export → next migration run upgrades).

## Docs-Loop Canonical Targets

The docs loop must update these specific canonical statements (region/biome/danger → biome/danger; region as inert legacy read; add `enabled`):
- `openspec/specs/gathering-and-harvesting/spec.md` — L149, L152, L155b, L167, L436, L473-475, L591, L605-607, L1113 (decide whether the player listing keeps echoing the inert `region`), L1548.
- `openspec/specs/data-models/spec.md` — L109, L149, L167-168.
- `DOMAIN.md` — L27 (task glossary drop region), L35 + the `GatheringRegionSettings` shape (add `enabled`), L168 (reframe `region` as inert legacy), and the issue `#257` "Remaining Drift to Track" block (L586-602): record that `#286` supersedes the prior region model (region no longer composition; subsystem default-off; vocabulary removed).
- `openspec/specs/overview/spec.md` — likely no composition-by-region statement to change (only the toggle/flag mentions); confirm rather than hunt for a phantom edit.

There is no `openspec/changes/archive/` in this repo; supersession of `location-aware-gathering-regions` is recorded via this `proposal.md` plus the DOMAIN.md drift note.

## Risks

- **Composition behavior change**: dropping region as a composition axis changes which tasks auto-populate environments that previously relied on region tags — region-only (empty-biome) records *broaden*. Mitigated by the GM notice copy and the version gate.
- **Default-disabled hides Travel** for current feature users. Mitigated by the one-time GM notice and the Settings-toggle hint copy.
- **Stray `evidence.region` consumers**: grep `src/ui` + `src/systems` and prune all (but not the unrelated travel `evidence.regions`).
- **Existing tests assert the removed behavior**: `tests/gathering-match.test.js`, `tests/gathering-rich-library.test.js`, `tests/gathering-engine-listing.test.js` (hazard.regions normalization), `tests/migrate-gathering-config.test.js` + `tests/stores/adminStore.test.js` (per-system region-vocab preservation), `tests/components/environment-editor.test.js` (RegionHint/CheckRegion), `tests/components/gathering-task-browser-redesign.test.js` (regionChips), `tests/helpers/gathering.js` — all updated in lockstep.

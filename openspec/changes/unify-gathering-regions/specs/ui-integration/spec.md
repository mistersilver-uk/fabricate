# UI Integration Spec Delta

## Added Requirements

### Travel & Regions Toggle In Gathering Settings

The gathering Settings tab MUST expose an "Enable Travel & Regions" toggle bound to `gatheringRegionSettings.enabled`.

Requirements:

1. The toggle reflects and updates the per-system flag, using the existing `aria-pressed` toggle pattern.
2. When disabled, the environment editor MUST NOT show region selectors, the Travel nav item MUST be hidden, and no current-region/availability/party/discovery surfaces appear.
3. The Settings tab itself remains visible when disabled (it hosts the toggle).
4. The toggle card includes hint copy naming where Travel lives, so a GM who has never seen the Travel tab can connect the toggle to the outcome.

### Environment Multi-Region Selector

The environment editor MUST let GMs assign an environment to multiple regions.

Requirements:

1. A multi-select chip control (mirroring the biome selector) is bound to `includedRegionIds`, with options sourced from the system's `GatheringRegion` records.
2. The selector is shown only when the toggle is enabled.
3. The legacy single-region `<select>` is removed.
4. When the toggle is on but the system has no `GatheringRegion` records, the selector shows an empty state with a hint pointing the GM to the Travel tab to create regions first.

### Region Authoring In Travel

Region create/edit/delete MUST live in the Travel tab, in a region list + detail layout.

Requirements:

1. The Travel region surface authors name, description, image, enabled, secret, and biomes (from the system biome vocabulary). The Travel view-model and store update actions carry these fields, and the biome vocabulary is threaded into the Travel view.
2. Destructive delete goes through the standard confirmation dialog with referenced-by evidence (a behavior change from the prior immediate-delete quick list).
3. New region controls use namespaced `.manager-travel-region-*` CSS and wrap without overflow at narrow widths.

## Removed Requirements

### Legacy Region UI

All region UI tied to the removed region vocabulary / region-as-composition is removed:

1. The region vocabulary editor panel in the gathering settings/vocabulary area, and the `regions` vocabulary dimension and store actions (biome vocabulary unchanged).
2. The region availability picker in the Gathering Task editor and the Gathering Hazard editor (and their `regionOptions` pass-throughs).
3. The region filter and per-row region chips in the Gathering Tasks browser and the Gathering Hazards browser.
4. The legacy `environment.region` filter in the Environments browser. No environment-row or list label reads `environment.region`.
5. Composition `region` match evidence (chips/facts) is removed; the unrelated travel current-region evidence is unaffected.

## Modified Requirements

### Manager Gathering Navigation

The `Travel` nav item is shown only when `gatheringRegionSettings.enabled` is true. The nav-item filtering MUST also feed the tab-resolution/fallback guards so a stale `travel` active tab falls back to `environments` when the flag is off (filtering only the render is insufficient).

## Testing Requirements

- Component tests: settings toggle flips `enabled` (aria-pressed); region vocabulary panel and the task/hazard region pickers/filters are gone; environment editor shows the multi-region selector bound to `includedRegionIds` only when enabled, with an empty-state hint when no regions exist; Travel nav hidden when disabled; expanded Travel region authoring create/update/delete (with delete confirmation).
- Smoke screenshot evidence for the settings toggle and the expanded Travel region authoring surface.

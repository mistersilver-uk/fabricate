# UI Integration Spec Delta

## Added Requirements

### Travel & Regions Toggle In Gathering Settings

The gathering Settings tab MUST expose an "Enable Travel & Regions" toggle bound to `gatheringRegionSettings.enabled`.

Requirements:

1. The toggle reflects and updates the per-system flag.
2. When disabled, the environment editor MUST NOT show region selectors, the Travel nav item MUST be hidden, and no current-region/availability/party/discovery surfaces appear.
3. The Settings tab itself remains visible when disabled (it hosts the toggle).

### Environment Multi-Region Selector

The environment editor MUST let GMs assign an environment to multiple regions.

Requirements:

1. A multi-select chip control (mirroring the biome selector) is bound to `includedRegionIds`, with options sourced from the system's `GatheringRegion` records.
2. The selector is shown only when the toggle is enabled.
3. The legacy single-region `<select>` is removed.

### Region Authoring In Travel

Region create/edit/delete MUST live in the Travel tab.

Requirements:

1. The Travel region surface authors name, description, image, enabled, secret, and biomes (from the system biome vocabulary).
2. Destructive actions (delete) go through the standard confirmation dialog with referenced-by evidence.

## Removed Requirements

### Legacy Region Vocabulary Editor

The region vocabulary editor in the gathering settings/vocabulary area is removed, along with the `regions` vocabulary dimension and its store actions. The biome vocabulary editor is unchanged.

## Modified Requirements

### Manager Gathering Navigation

The `Travel` nav item is shown only when `gatheringRegionSettings.enabled` is true. A stale `travel` active tab falls back to `environments` when the flag is off.

## Testing Requirements

- Component tests: settings toggle flips `enabled`; region vocabulary panel is gone; environment editor shows the multi-region selector bound to `includedRegionIds` only when enabled; Travel nav hidden when disabled; expanded Travel region authoring create/update/delete.
- Smoke screenshot evidence for the settings toggle and the expanded Travel region authoring surface.

# Fix Gathering Task Editor Dropdowns And Region Multi-Select

## Why

The Manager V2 gathering task editor has two related gaps in its task availability section:

1. The custom dropdown menus for biome, weather, and time of day open on click but never dismiss when the user clicks outside the menu or presses Escape. Other Manager V2 pickers already dismiss on outside click via the shared `dismissOnOutsideClick` action, so the gathering task editor is the outlier.
2. The Region field is still a native `<select>` and stores a single scalar `task.region`. GMs need to mark a task as valid in multiple regions (a forest task that also makes sense in grassland), and the Region field should match the visual language of the other availability fields.

## What Changes

- Wire `dismissOnOutsideClick` into the existing biome/time-of-day/weather picker wrapper so each menu dismisses on outside mousedown and on Escape.
- Replace the native Region `<select>` with the same custom dropdown pattern used for biome/time-of-day/weather, supporting multi-select with removable pills.
- Migrate the gathering task data shape from scalar `region` to `regions[]` for both tasks and hazards. Read-time normalization accepts legacy `region: 'x'` and surfaces it as `regions: ['x']`; writes use `regions[]` only.
- Update env-vs-record matching in `GatheringRichStateService` and `adminStore` so a record matches when the environment region is included in its `regions[]`.
- Update downstream view sites (`CraftingSystemManagerV2Root` task fact display, `GatheringTasksBrowserView` filter and chip display) to read arrays.
- Add localized strings `AddRegionCondition` ("Add region") and `AllRegionsSelected` ("All regions selected") alongside the existing biome/weather equivalents.

## Scope Notes

- The gathering tasks **browser** Region filter stays a native single-select. It is a filter, not an editor, and a single-value filter is idiomatic for browser tables.
- Environments themselves retain `environment.region: string` (one environment = one location).
- No one-shot data migration script. Legacy saved data heals on next save via read-time normalization.
- Hazards mirror tasks (`hazard.regions[]`) for model symmetry, since they share the same normalization and matching code paths.

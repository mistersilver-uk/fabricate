# Manager V2 Gathering Condition Settings

## Summary
Add Manager V2 Gathering Settings controls for the selected crafting system's time-of-day and weather condition vocabularies, plus per-system Regions and Biomes vocabulary panels. Time/weather values have editable labels and icons; Regions have editable labels; Biomes have editable labels, icons, and theme-aware colours.

## Motivation
Weather and time-of-day matching currently depend on global gathering condition vocabulary, while reusable tasks and hazards are authored per crafting system. GMs need a system-scoped settings surface where they can enable or disable those matching dimensions, manage allowed values, and cleanly remove values from reusable library records.

## Scope
- Persist per-system weather and time-of-day condition settings under `gatheringConfig.systems[systemId].conditions`.
- Seed default weather and time-of-day values for systems that do not have explicit settings.
- Keep legacy top-level `gatheringConfig.conditions` and `gatheringConfig.vocabularies` as backward-compatible normalization inputs.
- Store per-system weather and time-of-day values as option records with stable normalized ids, display labels, and Font Awesome icon classes.
- Normalize legacy string values into option records without requiring a separate migration.
- Render Settings-tab center-panel controls for weather and time-of-day values.
- Render a Systems Library right-inspector shortcut card for setting the selected system's current enabled weather and time-of-day values.
- Render condition pills and current selectors with configured labels/icons while matching continues to use normalized ids.
- Persist per-system `regions` and `biomes` vocabulary records under `gatheringConfig.systems[systemId].vocabularies`.
- Normalize legacy top-level string regions/biomes into selected-system option records when per-system values are absent.
- Render Settings-tab Regions and Biomes panels below time/weather. Region records are text-only; biome records include icon, `colorToken`, and optional `customColor`.
- Remove Regions and Biomes from the environment editor's generic vocabulary CSV controls; keep Danger there.
- Remove weather and time-of-day from the environment editor's generic CSV vocabulary controls.
- Prune deleted time/weather values from reusable tasks and hazards in the selected system only.
- Prune deleted region/biome ids from selected-system environments, reusable tasks, and hazards only.

## Out of Scope
- New condition provider integrations.
- New Foundry API requirements.
- Player-facing weather/time browse filters.

# Manager V2 Gathering Condition Settings

## Summary
Add Manager V2 Gathering Settings controls for the selected crafting system's time-of-day and weather condition vocabularies.

## Motivation
Weather and time-of-day matching currently depend on global gathering condition vocabulary, while reusable tasks and hazards are authored per crafting system. GMs need a system-scoped settings surface where they can enable or disable those matching dimensions, manage allowed values, and cleanly remove values from reusable library records.

## Scope
- Persist per-system weather and time-of-day condition settings under `gatheringConfig.systems[systemId].conditions`.
- Seed default weather and time-of-day values for systems that do not have explicit settings.
- Keep legacy top-level `gatheringConfig.conditions` and `gatheringConfig.vocabularies` as backward-compatible normalization inputs.
- Render Settings-tab center-panel controls for weather and time-of-day values.
- Remove weather and time-of-day from the environment editor's generic CSV vocabulary controls.
- Prune deleted values from reusable tasks and hazards in the selected system only.

## Out of Scope
- New condition provider integrations.
- New Foundry API requirements.
- Player-facing weather/time browse filters.

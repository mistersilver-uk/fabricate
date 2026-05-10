# Manager V2 Gathering Rules Settings

## Summary
Add selected-system Gathering Rules settings to the Manager V2 Gathering Settings tab. The settings define authoritative d100 reward and hazard selection behavior for every gathering environment in that crafting system.

## Problem
The v2 Gathering Settings tab is placeholder-only, while d100 reward and hazard behavior is split across task and environment fields. That makes system-wide behavior hard to audit and easy to configure inconsistently.

## Scope
- Persist `gatheringConfig.systems[systemId].rules`.
- Normalize rules in the admin store and runtime rich gathering config.
- Render a real Settings tab summary and a right-inspector Rules card with Rewards, Hazards, and Hazard Outcome controls.
- Make runtime d100 resolution use system rules over legacy task/environment selection fields.
- Remove duplicate v2 environment-editor controls for item selection, hazard selection, and hazard policy.

## Out of Scope
- New npm dependencies.
- Foundry API compatibility metadata changes.
- New d100 drop-row template behavior beyond documenting `dropRows` as the canonical row field.

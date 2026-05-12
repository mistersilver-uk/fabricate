# Add Gathering Character Modifiers

## Summary

Add a per-crafting-system reusable library of character modifiers (Strength, Stealth, Nature, ...) that d100 gathering drop rows and hazard rows can reference to adjust their chance threshold from the selected gathering actor's sheet. GMs author each modifier once with an icon and a provider-backed expression, then reference it from any row with a `+`/`-` operator and optional `min`/`max` caps. Rows can optionally override the expression, provider, or macro for one-off cases like `1d6 + @abilities.dex.mod`.

## Motivation

GMs already balance gathering through static `dropRate`, weather/time-of-day condition modifiers, and task-level `gatheringModifier`. Tying drop chance to actor capability (a strong character finds more ore, a stealthy character triggers fewer traps) is a frequent request that today requires GMs to author bespoke macro modifiers per task. The reusable library lets a Strength definition live in one place and serve dozens of rows; the per-row override preserves expressiveness when a specific row wants a custom formula. Because each system's modifier definitions live with that system's other gathering settings, GMs can bundle and share a system's complete gathering setup across worlds running the same Foundry game system.

## Scope

In scope:

- A per-crafting-system character modifier library, stored under each system's gathering settings alongside conditions, rules, tasks, and hazards.
- Opt-in preset seeding for recognized Foundry systems (`dnd5e`, `pf2e`), invoked per selected crafting system.
- Row references with operator, optional `min`/`max`, and optional per-row override fields.
- Threshold-side math that composes with existing condition modifiers and clamps to `0..100`.
- Timed snapshot extension to include character modifier evidence.
- Blind redaction of expressions, macro UUIDs, and diagnostics for non-GM viewers.
- Manager V2 UI: a character-modifier card in the system inspector beneath the existing system-conditions card, scrollable inspector, preset-seeding affordance, and row-side picker on the drop row and hazard editors.

## Out of Scope

- Changing the roll-side math (`gatheringModifier`, `hazardModifier` remain as today).
- A world-global character modifier library. Definitions live per system to keep provider-tagged expressions co-located with the system that owns them.
- Migrating existing macro-based balancing into the new library automatically.
- Replacing attempt gates, visibility gates, or pass/fail checks with character modifiers.
- Bundled import/export tooling for per-system setups. The data shape supports it; the tooling is a follow-on capability.

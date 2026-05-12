# Add Gathering Character Modifiers

## Summary

Add a world-global reusable library of character modifiers (Strength, Stealth, Nature, ...) that d100 gathering drop rows and hazard rows can reference to adjust their chance threshold from the selected gathering actor's sheet. GMs author each modifier once with an icon and a provider-backed expression, then reference it from any row with a `+`/`-` operator and optional `min`/`max` caps. Rows can optionally override the expression, provider, or macro for one-off cases like `1d6 + @abilities.dex.mod`.

## Motivation

GMs already balance gathering through static `dropRate`, weather/time-of-day condition modifiers, and task-level `gatheringModifier`. Tying drop chance to actor capability (a strong character finds more ore, a stealthy character triggers fewer traps) is a frequent request that today requires GMs to author bespoke macro modifiers per task. The reusable library lets a Strength definition live in one place and serve dozens of rows; the per-row override preserves expressiveness when a specific row wants a custom formula.

## Scope

In scope:

- A world-global character modifier library stored in gathering configuration.
- Opt-in preset seeding for recognized Foundry systems (`dnd5e`, `pf2e`).
- Row references with operator, optional `min`/`max`, and optional per-row override fields.
- Threshold-side math that composes with existing condition modifiers and clamps to `0..100`.
- Timed snapshot extension to include character modifier evidence.
- Blind redaction of expressions, macro UUIDs, and diagnostics for non-GM viewers.
- Manager V2 UI: library editor, preset seeding affordance, row-side picker on the drop row and hazard editors.

## Out of Scope

- Changing the roll-side math (`gatheringModifier`, `hazardModifier` remain as today).
- Per-system character modifier libraries. The library is world-global by design.
- Migrating existing macro-based balancing into the new library automatically.
- Replacing attempt gates, visibility gates, or pass/fail checks with character modifiers.

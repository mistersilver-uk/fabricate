# Gathering Attempt Limitation — System-Level Modes

## Summary

Gathering tasks can now be paced through a per-crafting-system **limitation mode**:

- `none` — no limit (legacy behaviour).
- `stamina` — tasks cost stamina; each actor has a per-system pool that regenerates over world time (fixed amount or formula, optionally adjusted by character modifiers).
- `nodes` — each task is a finite, environment-scoped resource node that regenerates over world time (a number or a percentage chance per interval).

The mode is stored on the crafting system's gathering config (`gatheringConfig.systems[systemId].economy`). Enforcement is mode-gated: stamina is spent/blocked only in `stamina` mode, nodes deplete/block only in `nodes` mode. Player-facing UI surfaces the active mode's state (pool, per-task cost, node counts, depleted state) with blind redaction preserved.

## Goals

- System-level economy mode + system-level stamina regeneration config.
- Stamina spend, gating, and over-time regeneration (fixed / formula / character-modifier-adjusted).
- Per-actor stamina-cost modifiers on tasks.
- Node depletion, manual restock, and over-time respawn (number / probability).
- Mode-aware blocking; a depleted node blocks in targeted mode and behaves like a missing requirement in blind mode.
- Player UI for each mode; GM authoring + manual state controls in the Manager app.
- Remove the unused per-scope attempt-**count** limiter (`task.attemptLimit` + recharge).

## Out of Scope

- The separate per-scope attempt-count limiter (removed, not finished).
- External stamina providers beyond treating their maximum as read-only.
- Timed-attempt (`timeRequirement`) behaviour, which is orthogonal and unchanged.

## Decisions

- Mode is per crafting system (not per environment); the legacy per-environment `economyMode` field is removed and migrated.
- Stamina pools are per actor, per crafting system, stored in actor flags.
- GM manual controls (actor stamina, node counts) live in the Crafting System Manager app.

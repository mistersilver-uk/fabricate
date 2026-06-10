# Gathering Limitation — Independent Stamina + Resource Node Toggles

## Summary

Today a crafting system's gathering limitation is a single mutually-exclusive enum:
`gatheringConfig.systems[systemId].economy.mode` is one of `none | stamina | nodes`. A GM
can use stamina **or** resource nodes, never both.

This change replaces that enum with **two independent boolean flags** — `stamina.enabled`
and `nodes.enabled`. "Both" emerges by enabling both flags; "none" is both-off; "stamina"
and "nodes" are each-one-on. The combined mode is the real goal: it stops a high-stamina
party from **dogpiling** a task, because finite resource nodes cap total pulls until they
respawn over world time, regardless of how much collective stamina the party has.

The existing gate/consume logic in `evaluateStart()` / `commitAcceptedAttempt()` is already
written as two **separate `if` blocks` (one per mode), so the engine work is mostly turning
`mode === 'x'` string checks into independent boolean predicates — not restructuring control
flow. Both player-side inspectors are already presence-driven, so most player work is small.

## Goals

- New normalized economy shape: `{ stamina: { enabled, max, start, regen }, nodes: { enabled } }`
  (drop `mode`), emitted by `normalizeGatheringEconomy()`.
- Two boolean predicates — `staminaEnabled(systemId)` / `nodesEnabled(systemId)` — as the
  single read used by enforcement, listings, world-time drivers, and every UI surface.
- "Both" semantics with no special code path: with both flags on, one accepted attempt both
  depletes the node pool and spends the actor's stamina; both start gates fire.
- GM control: **two toggle pills** (Stamina, Resource nodes) reusing the existing
  `.manager-economy-mode-option` styling; both can be active; neither active = no limit; no
  explicit "No limit" option.
- Read-time legacy compat: when the new flags are absent but a legacy `mode` is present, map
  `stamina → stamina.enabled`, `nodes → nodes.enabled`, else both false — un-migrated worlds
  keep working on every read.
- Versioned `0.8.0` migration that rewrites legacy `mode` to the two flags and drops `mode`.

## Out of Scope

- Per-task node counts/respawn config and per-actor stamina pools/regen mechanics — these are
  unchanged; only the system-level limitation selection changes shape.
- Timed attempts (`timeRequirement`), which remain orthogonal and available regardless of the
  limitation flags.
- The legacy per-environment economy fields and per-scope attempt-count limiter, already
  removed by prior changes.

## Decisions

- The two flags are independent booleans; there is no `mode` field on the normalized shape.
  `economyMode(systemId)` is retained only as a thin derived back-compat accessor returning
  `'both' | 'stamina' | 'nodes' | 'none'` for any external/API consumer; no internal caller
  relies on it after this change.
- "Both" is achieved by running the two already-separate gate/consume blocks; there is no
  dedicated combined-mode branch.
- The GM UI drops the explicit "None" radio: neither pill active means no limit.
- Migration is a versioned `0.8.0` step plus read-time normalization (repo convention), so a
  world is safe whether or not the migration has run.

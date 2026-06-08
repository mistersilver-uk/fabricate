# Calendar-Aware Gathering Regen & Respawn Intervals

## Summary

Stamina regeneration and resource-node respawn already advance over Foundry world
time, driven by the core `updateWorldTime` hook (`game.time.worldTime`). Because
Fabricate depends only on core world time — not on any calendar module — SmallTime,
Simple Calendar, and Calendaria already drive these features today with no
module-specific integration.

The remaining gap: interval lengths for the `days` and `weeks` units were hardcoded
to Earth seconds (86400 / 604800). On the **custom calendars** these modules exist to
provide (non-24h days, non-7-day weeks), a "per day"/"per week" rule drifts from what
players see on the calendar. This change derives `days`/`weeks` lengths from Foundry
V13's native `game.time.calendar` when present, with a safe fallback to the Earth
constants when no calendar is configured.

## Goals

- A mockable `secondsPerUnit` seam on `GatheringRichStateService`; the Foundry-facing
  default reads `game.time.calendar` and is injected in `main.js`.
- Stamina regen (`regenerateActorStamina`) and node respawn (`_respawnNode`) resolve
  `days`/`weeks` interval lengths through the seam; `minutes`/`hours` stay fixed.
- Node respawn persists the authored intent — `intervalUnit` + `intervalAmount` —
  instead of a calendar-baked raw `intervalSeconds`, resolved at runtime like stamina.
- A 0.5.0 migration rewrites legacy `intervalSeconds` to unit+amount; the runtime and
  normalizer keep a legacy fallback so un-migrated nodes never break.

## Out of Scope

- Any hard dependency on SmallTime, Simple Calendar, or Calendaria. Core
  `game.time.worldTime` + `updateWorldTime` remains the only integration point.
- Surfacing calendar dates (e.g. "next regen on <date>") in the gathering UI.
- The minutes/hours units, which are universal (60 / 3600) and never calendar-derived.

## Decisions

- Calendar access is confined to `main.js` (the `game.time?.calendar` lookup) plus pure
  helpers in `src/systems/foundryCalendar.js`; the unit-tested service only sees the
  injected seam, whose default reproduces the Earth table.
- Seconds-per-week = weekday-count × seconds-per-day, falling back to 7 × day when the
  calendar exposes no week concept, then to 604800 with no calendar at all.
- The interval length is resolved per evaluation (not memoized) so a mid-session
  calendar reconfiguration is honoured; anchoring math is unchanged and stays idempotent.

## Caveat (documentation, not code)

If a user sets Simple Calendar's *World Time Integration* to "None", advancing its
clock does not fire `updateWorldTime` and regen/respawn will not run. This is Simple
Calendar configuration, not a Fabricate defect; the synced/default mode is recommended.

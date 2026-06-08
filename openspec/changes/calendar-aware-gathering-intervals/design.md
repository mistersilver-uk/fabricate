# Design — Calendar-Aware Gathering Intervals

## The seam

`GatheringRichStateService` gains an injected `secondsPerUnit(unit) -> number` seam
(constructor `src/systems/GatheringRichStateService.js`). The default reproduces the
existing hardcoded table:

```js
this.secondsPerUnit = typeof secondsPerUnit === 'function'
  ? secondsPerUnit
  : (unit) => SECONDS_PER_UNIT[unit] || SECONDS_PER_UNIT.hours;
```

A new instance helper `_durationToSeconds(count, unit)` routes through the seam and is
used by both consumers:

- `regenerateActorStamina`: `const interval = this._durationToSeconds(1, regen.unit)`.
- `_respawnNode`: `respawn.intervalUnit ? this._durationToSeconds(respawn.intervalAmount, respawn.intervalUnit) : Number(respawn.intervalSeconds || 0)`.

Anchoring math is untouched: both advance `lastRegenWorldTime` /
`respawn.lastEvaluatedWorldTime` by exactly the consumed intervals, so resolving the
interval through the seam changes only the interval length, never the idempotency.

## Foundry-facing default (V13 calendar)

`src/systems/foundryCalendar.js` holds pure, calendar-object-in helpers (no `game.*`):

- `secondsPerDayFromCalendar(cal)` — prefers `days.hoursPerDay * days.minutesPerHour *
  days.secondsPerMinute`; else measures `componentsToTime({day:1}) - componentsToTime({day:0})`;
  else 86400.
- `secondsPerWeekFromCalendar(cal, spd)` — `days.values.length × spd`; else `7 × spd`;
  else 604800 with no calendar.
- `secondsPerUnitFromCalendar(unit, cal)` — minutes→60, hours→3600, days/weeks via the
  above, Earth fallback with no calendar.

`main.js` performs the global lookup and injects the seam at the service construction:

```js
secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, game.time?.calendar ?? null)
```

Resolved per call, so a mid-session calendar change is picked up.

## Node interval schema (unit + amount)

Previously the task editor collapsed unit→seconds at edit time and persisted a raw
`respawn.intervalSeconds`, baking the calendar's day length into stored data. Now the
editor persists `intervalUnit` + `intervalAmount` (`GatheringTaskEditView.svelte`
`setRespawnInterval` / `intervalParts`), `normalizeRespawn` validates them
(`VALID_RESPAWN_UNITS`, default `hours`), and `_respawnNode` resolves seconds at
runtime — symmetric with stamina. `normalizeRespawn` and the runtime both keep a legacy
`intervalSeconds` fallback so a node persisted before this schema keeps respawning until
migrated.

## Migration (0.5.0)

`src/migration/migrateNodeRespawnIntervals.js` (registered after the 0.4.0 policy
migration in `MigrationRunner`) converts any respawn carrying `intervalSeconds` and no
`intervalUnit` into unit+amount using the largest whole Earth unit that divides evenly
(else fractional hours), then drops `intervalSeconds`. Pure, idempotent, and
by-reference — already-converted nodes and worlds with no node config see zero churn.
Legacy seconds were authored against the Earth table, so this reproduces the original
unit+amount with no visible drift on migration day. It rewrites all three storage
sites: library `systems[sid].tasks[].nodes.respawn`, inline env tasks, and
`nodeRuntime[taskId].respawn`. See `openspec/specs/destructive-changes-and-migrations`.

## Risks / edge cases

- **Mid-session calendar change**: each tick re-derives the interval and advances the
  anchor by `intervals × interval`; a changed day length only affects future math — no
  double-apply or lost tick.
- **Backward compat**: legacy `intervalSeconds` nodes keep working via the runtime +
  normalizer fallback even before the migration runs.
- **No week concept / no calendar / odd config**: 7×day, then Earth constants; never throws.

## Tests

- Pure `foundryCalendar` helpers (custom day length, weekday-count week, fallbacks).
- Service: a non-Earth `secondsPerUnit` seam makes stamina regen and node respawn tick
  at the calendar length, not 86400; the default seam locks 86400/604800; a legacy
  `intervalSeconds` node still respawns.
- `normalizeRespawn` unit/amount + legacy fallback; the new migration across all three
  sites, idempotency, and the whole-unit/fractional-hours heuristic.
- Existing suites stay green: the default seam reproduces the constants; migration-runner
  version + 0.4.0-collapse expectations updated for the new 0.5.0 step.

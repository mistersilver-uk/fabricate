# Gathering And Harvesting Spec Delta

## Modified Requirements

### Resource Node Respawn

The persisted node respawn schema stores the authored interval intent rather than a
calendar-baked seconds count.

1. A node `respawn` block uses `policy` of `manual` or `overTime`; an `overTime` policy
   carries a `gainMode` of `guaranteed`, `chance`, or `expression`.
2. The respawn interval is persisted as `intervalUnit` (`minutes` | `hours` | `days` |
   `weeks`) + `intervalAmount`, not as a raw seconds count.
3. A `days` or `weeks` interval resolves its length from the active Foundry world
   calendar (`game.time.calendar`) at runtime so it tracks custom (non-24h-day /
   non-7-day-week) calendars. `minutes` (60s) and `hours` (3600s) are fixed. With no
   calendar configured, day = 86400s and week = 604800s, reproducing prior behaviour.
   Seconds-per-week is the calendar's weekday count × the day length, falling back to
   7 × day when the calendar has no week concept.
4. The interval length is resolved per respawn evaluation, so a mid-session calendar
   change is honoured; the `lastEvaluatedWorldTime` anchor still advances by exactly the
   consumed intervals (idempotent, fractional remainder accrues).
5. A node persisted before this schema may carry a legacy raw `intervalSeconds`; the
   runtime and the respawn normalizer MUST honour it until a migration rewrites it to
   `intervalUnit` + `intervalAmount`.

### Stamina Regeneration Over World Time

6. Automatic elapsed-time stamina regeneration whose `unit` is `days` or `weeks` derives
   the interval length from the active Foundry world calendar (same rules as resource-node
   respawn above); `minutes`/`hours` are fixed; the Earth constants are the no-calendar
   fallback. The regeneration anchor (`lastRegenWorldTime`) advances by exactly the
   consumed intervals, unchanged.

## Migration

A 0.5.0 migration converts every node `respawn` carrying a legacy `intervalSeconds`
(and no `intervalUnit`) into `intervalUnit` + `intervalAmount`, using the largest whole
Earth unit that divides the stored seconds evenly (else fractional hours), and drops
`intervalSeconds`. It is pure, idempotent, and by-reference, and rewrites library tasks,
inline environment tasks, and per-environment node runtime state.

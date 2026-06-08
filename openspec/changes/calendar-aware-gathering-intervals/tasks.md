# Tasks

## Service seam (done)

- [x] Add the injected `secondsPerUnit` seam + `_durationToSeconds` helper to
      `GatheringRichStateService`; default reproduces the Earth `SECONDS_PER_UNIT` table.
- [x] `regenerateActorStamina` resolves its interval through `_durationToSeconds`.
- [x] `_respawnNode` resolves its interval from `intervalUnit`/`intervalAmount`, with a
      legacy raw `intervalSeconds` fallback.

## Node interval schema (done)

- [x] `normalizeRespawn` persists `intervalUnit` + `intervalAmount` (export
      `VALID_RESPAWN_UNITS`), preserving a legacy `intervalSeconds` when no unit present.
- [x] `GatheringTaskEditView.svelte` authors amount + unit (`setRespawnInterval`,
      `intervalParts`, `DEFAULT_NODES`).

## Foundry calendar wiring (done)

- [x] `src/systems/foundryCalendar.js` — pure `secondsPerDay/Week/UnitFromCalendar`.
- [x] Inject `secondsPerUnit: (unit) => secondsPerUnitFromCalendar(unit, game.time?.calendar)`
      at the service construction in `main.js`.

## Migration (done)

- [x] `src/migration/migrateNodeRespawnIntervals.js` (seconds → unit/amount), registered
      as 0.5.0 in `MigrationRunner` after the 0.4.0 policy migration.

## Spec & tests (done)

- [x] `gathering-and-harvesting` spec deltas: calendar-derived day/week interval lengths
      for stamina regen and node respawn; node respawn schema as unit+amount with legacy
      fallback.
- [x] Tests: pure calendar helpers, non-Earth seam regen/respawn, default-seam lock,
      legacy node fallback, `normalizeRespawn` unit/amount, the new migration; updated
      migration-runner version + 0.4.0-collapse expectations and the editor-economy assertion.
- [x] `npm test` (2412 pass) and `npm run build` green.

## Follow-ups (not in this change)

- [ ] Optional: surface the next regen/respawn as a calendar date in the gathering UI.
- [ ] Docs note: Simple Calendar "World Time Integration: None" disables world-time
      regen (recommend the synced mode).

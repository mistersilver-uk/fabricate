# Design

## Mode is per crafting system

`gatheringConfig.systems[systemId].economy = { mode: 'none'|'stamina'|'nodes', stamina: { regen: {...} } }`. The legacy per-environment `economyMode` (`time|nodes|stamina|hybrid`) is removed; a 0.3.0 migration strips it and maps a non-`time` legacy value onto the owning system's mode (`hybrid → stamina`). `GatheringRichStateService.economyMode(systemId)` is the single read used by enforcement, listings, and the world-time drivers.

## Stamina

Pools live in actor flags at `gatheringState.stamina[systemId] = { current, max, provider, regenerationMode, lastRegenWorldTime }`. Spend and the start gate both use `_effectiveStaminaCost` (base `task.staminaCost` plus `task.staminaCostModifiers` resolved against the per-system character-modifier library, floored at 0) so they always agree. A GM viewer bypasses spend/gate.

Regeneration (`regenerateActorStamina`) runs on world-time advance: it adds `_regenAmountPerInterval` (fixed `amount` or `formula`, plus regen character modifiers) once per whole `regen.unit` elapsed since `lastRegenWorldTime`, clamps to `max`, and advances the anchor by exactly the consumed intervals so the fractional remainder accrues. Backwards/standstill jumps re-anchor without regenerating. A `null` max skips (the GM seeds it first). External-provider maxima are read-only once set.

## Nodes

Node state stays on `environment.tasks[].nodes` (environment-scoped). Depletion on attempt and manual `restockNode` already existed. `respawnNodes` runs on world-time advance for nodes-mode systems: one node per interval (`elapsedTime`) or one persisted d100 roll per interval (`probability`/`manualAndElapsedTime`), clamped to max, advancing `respawn.lastEvaluatedWorldTime` together so same-tick refreshes never reroll. A depleted node blocks in targeted mode (`NODE_DEPLETED`) and is excluded from blind candidate selection (behaving like a missing requirement).

## World-time driver & concurrency

`GatheringEngine.processWorldTime` matures timed runs, then — only on the primary GM (`isPrimaryGM` seam) — drives stamina regen across actors with a pool and node respawn across nodes-mode environments. Advancing the persisted anchors makes re-entry idempotent, so a missed/duplicated tick cannot double-apply.

## Edge cases

- Huge jumps: integer interval counts plus a cap at `max - current` bound stochastic loops to one clamped write.
- Blind redaction: node `current`/`max` stay null for opaque-blind non-GM viewers unless `showCountsToPlayers`; header copy is generic.
- Uninitialised pool: regen skips; the gate blocks with a "no pool set" message; the GM panel seeds `{current: max, max}` on first set.

# Gathering Blind Mode

## Summary

An environment's `selectionMode` can be `targeted` (players pick a visible task) or `blind` (players see a single generic "gather" action and the system resolves a task for them). Blind mode is currently a stub: the runtime collapses the listing to one opaque `blindGather` action (`GatheringEngine.js:1030-1046`) and, on start, always picks `tasks[0]` (`_findStartTask`, `GatheringEngine.js:1180-1188`). It ignores attemptability, so the generic action can resolve to a task the character cannot attempt (e.g. missing a required tool) and silently fail. There is no weighting, no way to influence which task is chosen, and no way to reveal what was gathered.

A partial, **unimplemented** schema already exists in `GatheringEnvironmentStore.js`: a `blindSelection { strategy: firstAvailable|weightedRandom|rollTable|macro, macroUuid, rollTableUuid, weights }` shape (`normalizeBlindSelection`) and a `reveal { scope: actor|user|party|global }` shape (`normalizeRevealConfig`), plus a manual scoped `revealTask` (`GatheringRichStateService.js:663-670`) that nothing calls automatically.

This change specs and implements blind mode: a per-system candidate gate, an environment-level selection strategy with per-task weights (and roll-table / macro strategies), and a system-default-plus-environment-override reveal policy wired to `revealTask`. It also removes task drag-and-drop reordering from the editor (it only ever fed the `tasks[0]` placeholder; weights replace it). Hazard reordering stays (it drives highest-ranked hazard selection).

## Goals

- **Candidate gating** via a per-system `GatheringRules.blindCandidateGate` (`attemptableOnly` default | `allMatching`): when `attemptableOnly`, tasks the character cannot currently attempt (unmet tool/catalyst/visibility/resource gates) are excluded from the blind pool, so the generic gather never resolves to a doomed task. An empty pool surfaces an explicit "nothing to gather" state rather than a silent failure.
- **Weighted selection**: environment-level `blindSelection.strategy` defaulting to back-compatible `firstAvailable`, plus `weightedRandom` using a per-task `weights` map keyed by task id (default weight 1). GMs set weights per task on the Tasks-tab row (blind only).
- **Roll-table and macro strategies**: `rollTable` (resolve `rollTableUuid` → candidate) and `macro` (`macroUuid` via the existing `MacroExecutor`), both still respecting the candidate gate, falling back to `firstAvailable` when they yield no eligible candidate.
- **Reveal policy**: `GatheringRules.revealPolicy` (`never` default | `onSuccess` | `onAttempt`) + `revealScope` (reuse `VALID_REVEAL_SCOPES`), overridable per environment (`environment.reveal`). After an attempt resolves, the engine calls the existing `revealTask` at the configured scope.
- **Remove task reordering** from the Tasks tab; keep hazard reordering.
- Backwards compatible: legacy environments normalize to `firstAvailable` selection and inherit the system reveal default; no migration runner entry.

## Out of Scope

- Per-task (library-level) `blindSelection`/`reveal` overrides beyond the system+environment levels — the existing per-task schema is left as-is/deferred; environment-level config wins.
- Party-wide reveal coordination beyond the existing `revealTask` scopes.
- Changes to targeted-mode behavior, hazard composition, or the matching engine.
- Showing weights or selection internals to players (blind stays opaque to non-GMs).

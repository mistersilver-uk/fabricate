# Design

## Current state (anchors)

- `GatheringEngine._findStartTask` (`:1180-1188`): blind + no `taskId` → `tasks[0]`. No gating, no weighting.
- Opaque listing: `_isOpaqueBlindTask` / `blindGather` model (`GatheringEngine.js:1030-1046`).
- Attemptability already computed: `_taskBlockedReasons` (`GatheringEngine.js:890-952`) yields `attemptable: false` + reason codes (`TOOL_BLOCKED`, `CATALYST_BLOCKED`, `TASK_HIDDEN`, `NODE_DEPLETED`, `STAMINA_BLOCKED`, …). Visibility gates filter tasks out earlier; everything else is "visible but not attemptable".
- System rules: `DEFAULT_GATHERING_RULES` (`GatheringRichStateService.js:58-66`) + `normalizeGatheringRules` (`:1277-1297`); Rules UI in `CraftingSystemManagerRoot.svelte:~3950-4031`.
- Existing schema (unimplemented): `normalizeBlindSelection` + `VALID_BLIND_SELECTION_STRATEGIES = {firstAvailable, weightedRandom, rollTable, macro}` (`GatheringEnvironmentStore.js:18,1087`); `normalizeRevealConfig` + `VALID_REVEAL_SCOPES = {actor,user,party,global}` (`:19,1116`); both currently attached **per task** (`:338-347`). Manual `revealTask` (`GatheringRichStateService.js:663-670`).
- Task order is cosmetic apart from feeding the `tasks[0]` placeholder; hazard order drives `highestRankedDrop` selection.

## Data model

- **Environment-level selection** (new): `environment.blindSelection = { strategy, macroUuid, rollTableUuid, weights: { [taskId]: number } }`. Reuse the existing `normalizeBlindSelection` shape but normalize it on the environment (the `weights` map keyed by composed task id matches the per-row weight UI). Default `strategy: 'firstAvailable'`. Add to the adminStore draft + `updateEnvironmentDraft` allow-list.
- **System rules** (extend `DEFAULT_GATHERING_RULES` + `normalizeGatheringRules`):
  - `blindCandidateGate`: `'attemptableOnly'` (default) | `'allMatching'`.
  - `revealPolicy`: `'never'` (default) | `'onSuccess'` | `'onAttempt'`.
  - `revealScope`: one of `VALID_REVEAL_SCOPES`, default `'actor'`.
- **Environment reveal override** (new, optional): `environment.reveal = { policy, scope }` via `normalizeRevealConfig` (extended to carry `policy`); when present it overrides the system reveal default.
- The vestigial per-task `task.blindSelection` / `task.reveal` normalization stays for now (deferred); environment + rules win at runtime.

## Runtime behavior

### Selection (`_findStartTask` blind branch)
1. Build the candidate pool from the composed environment tasks (the same set listing uses).
2. If `rules.blindCandidateGate === 'attemptableOnly'`, drop tasks whose computed `attemptable` is false (reuse `_taskBlockedReasons`). If `allMatching`, keep all.
3. Select from the pool by `environment.blindSelection.strategy`:
   - `firstAvailable`: first in pool order (today's behavior, over the gated pool).
   - `weightedRandom`: weighted pick using `weights[taskId]` (default 1, non-positive → 0/skip) via an injectable RNG (seedable in tests).
   - `rollTable` / `macro` (Phase 2): resolve via `rollTableUuid` / `macroUuid` (`MacroExecutor`); map result to a pool member; fall back to `firstAvailable` on miss.
4. Empty pool → return null; `startAttempt` returns a blocked result and the `blindGather` listing reports `attemptable: false` ("nothing to gather").

### Reveal (post-resolution)
After an attempt resolves, resolve the effective policy (`environment.reveal?.policy ?? rules.revealPolicy`) and scope; if `onSuccess` (success only) or `onAttempt` (success or failure), call `revealTask(taskId, scope, …)`. `never` = no-op.

## Phasing (each its own PR)

1. **Runtime core** — `blindCandidateGate` rule + env `blindSelection` normalize/validate + adminStore plumbing; `_findStartTask` gating + `firstAvailable`/`weightedRandom`; empty-pool/listing attemptability. Tests.
2. **rollTable + macro** strategies in the engine. Tests.
3. **Reveal policy** — rules defaults + env override + `revealTask` wiring after resolution. Tests.
4. **Editor UI** — Tasks-tab weight input + strategy/table/macro controls (blind only); remove task reorder (keep hazards); Rules/Settings controls for gate + reveal defaults + env reveal override; `lang/en.json`. Tests.

## Decisions / open questions

- Per-task library-level `blindSelection`/`reveal` overrides: **deferred**; env-level wins.
- Empty blind pool: **explicit "nothing to gather"** (not attemptable) rather than hiding the environment.
- RNG: inject a `rollRandom`/seedable function into the engine for deterministic weighted-selection tests (mirror the existing `rollD100` injection).

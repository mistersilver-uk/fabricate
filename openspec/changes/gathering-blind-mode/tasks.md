# Tasks

## Phase 1 — Candidate gating + weighted selection (runtime core)
- [x] Add `blindCandidateGate` (`attemptableOnly`|`allMatching`, default `attemptableOnly`) to `DEFAULT_GATHERING_RULES` and `normalizeGatheringRules` in `src/systems/GatheringRichStateService.js` (+ a `BLIND_CANDIDATE_GATES` set).
- [x] Normalize/validate environment-level `blindSelection` in `src/systems/GatheringEnvironmentStore.js` (`_normalizeEnvironment` + `_validateEnvironment`), reusing `normalizeBlindSelection`; weights keyed by task id. Attached only when present (legacy shape unchanged).
- [ ] Plumb `blindCandidateGate` + `blindSelection` through `src/ui/svelte/stores/adminStore.js` — deferred to Phase 4 (the editor UI is the writer; runtime reads the persisted/composed values).
- [x] Inject a seedable RNG (`random`) into `GatheringEngine`.
- [x] Rework `GatheringEngine` blind start selection (`_selectBlindStartTask` + `_pickBlindTask`/`_weightedPickTask`): build the candidate pool from visible+enabled tasks, gate by `attemptable` when `attemptableOnly`, select via `firstAvailable`/`weightedRandom`; return null on empty pool.
- [x] Emit an opaque `BLIND_NO_CANDIDATE` blocked reason at start when the gated pool is empty; add the `FABRICATE.Gathering.Blocked.BlindNoCandidate` key. (Listing attemptability already reflects per-task blocked reasons.)
- [x] Tests: extended `tests/gathering-engine-start-attempt.test.js` for gating, `weightedRandom` (seeded), empty-pool, and allMatching; updated blind-privacy tests to allMatching; added store normalize/validate coverage in `tests/gathering-rich-library.test.js`.
- [x] `npm test` + `npm run build`.

## Phase 2 — rollTable + macro strategies
- [x] Engine delegates `rollTable`/`macro` to an injected `blindSelectionResolver` over the gated pool, validates the returned id against the pool, and falls back to `firstAvailable` (`GatheringEngine._pickBlindTask`/`_resolveBlindSelection`/`_matchResolvedBlindTask`).
- [x] Wire `resolveGatheringBlindSelection` in `src/main.js` (macro via `runGatheringMacro`/`MacroExecutor`, rollTable via `fromUuid` + `table.draw`, matching result to candidate id/name; best-effort → null on failure).
- [x] Tests for macro + rollTable selection, fallback on no-match, and gated-candidates-only (`tests/gathering-engine-start-attempt.test.js`).
- [x] `npm test` + `npm run build`.

## Phase 3 — Reveal policy
- [x] Add `revealPolicy` (`never`|`onSuccess`|`onAttempt`, default `never`) + `revealScope` (default `actor`) to `DEFAULT_GATHERING_RULES` + `normalizeGatheringRules`.
- [x] Add optional `environment.reveal = { policy, scope }` override (`normalizeEnvironmentReveal`, attached only when present). adminStore plumbing deferred to Phase 4 (UI writer).
- [x] After an attempt terminates (`GatheringEngine._terminalStart`, covering immediate + timed completion), call `revealTask` per the effective policy/scope (`onSuccess` = success only, `onAttempt` = success or failure, `never` = no-op; blind only; best-effort).
- [x] Tests for each policy + scope, the env override beating the rule default, and targeted-mode no-op (`tests/gathering-engine-start-attempt.test.js`); store normalize coverage (`tests/gathering-rich-library.test.js`).
- [x] `npm test` + `npm run build`.

## Phase 4 — Editor UI
- [ ] Tasks tab: per-task numeric **weight** input in the Override column, shown only when the environment is `blind`, writing `environment.blindSelection.weights[taskId]` via `onUpdateEnvironment`; add the environment strategy select + rollTable/macro pickers.
- [x] Remove task drag/reorder: gated the drag handle/grip, draggable, drop handlers, and Move up/down menu actions to `kind === 'hazard'` in `CompositionList.svelte` (tasks keep an empty handle cell). Hazard reorder + `onReorderRecord`/`reorderEnvironmentRecord` wiring retained.
- [ ] Rules/Settings UI (`src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte`): controls for `blindCandidateGate`, `revealPolicy`, `revealScope`; per-environment reveal override.
- [ ] `lang/en.json` keys for all new controls/labels.
- [ ] Update `tests/components/environment-editor.test.js` (no task reorder; weight input present in blind) + `manager-layout`/`manager-contract` as needed.
- [ ] `npm test` + `npm run build`.

## Specs / docs
- [ ] Update `openspec/specs/gathering-and-harvesting/spec.md` with blind-mode selection, candidate gating, and reveal behavior.
- [ ] Update `openspec/specs/data-models/spec.md` with the `blindSelection` / reveal / rules additions.
- [ ] Update `docs/gathering-environments.md` with a Blind mode subsection.

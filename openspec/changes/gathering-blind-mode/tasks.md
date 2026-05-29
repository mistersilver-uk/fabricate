# Tasks

## Phase 1 — Candidate gating + weighted selection (runtime core)
- [ ] Add `blindCandidateGate` (`attemptableOnly`|`allMatching`, default `attemptableOnly`) to `DEFAULT_GATHERING_RULES` and `normalizeGatheringRules` in `src/systems/GatheringRichStateService.js` (+ a `BLIND_CANDIDATE_GATES` set).
- [ ] Normalize/validate environment-level `blindSelection` in `src/systems/GatheringEnvironmentStore.js` (`_normalizeEnvironment` + `_validateEnvironment`), reusing `normalizeBlindSelection`; weights keyed by task id.
- [ ] Plumb `blindCandidateGate` + `blindSelection` through `src/ui/svelte/stores/adminStore.js` (`_newEnvironmentDraft` default, `updateEnvironmentDraft` allow-list).
- [ ] Inject a seedable RNG into `GatheringEngine` (mirror `rollD100`) for weighted selection.
- [ ] Rework `GatheringEngine._findStartTask` blind branch: build the candidate pool, gate by `attemptable` when `attemptableOnly`, select via `firstAvailable`/`weightedRandom`; return null on empty pool.
- [ ] Make the opaque `blindGather` listing report `attemptable: false` (with a reason, e.g. `BLIND_POOL_EMPTY`) when the gated pool is empty; add the `FABRICATE.Gathering.Blocked.*` localization key.
- [ ] Tests: extend `tests/gathering-engine-start-attempt.test.js` / `tests/gathering-engine-listing.test.js` for gating, `weightedRandom` (seeded), and empty-pool behavior; add store normalize/validate coverage.
- [ ] `npm test` + `npm run build`.

## Phase 2 — rollTable + macro strategies
- [ ] Implement `rollTable` selection (resolve `rollTableUuid`, map result → pool member) and `macro` selection (`macroUuid` via `src/utils/MacroExecutor.js`) in `_findStartTask`, both gated, falling back to `firstAvailable`.
- [ ] Tests for both strategies (mocked table/macro).
- [ ] `npm test` + `npm run build`.

## Phase 3 — Reveal policy
- [ ] Add `revealPolicy` (`never`|`onSuccess`|`onAttempt`, default `never`) + `revealScope` (`VALID_REVEAL_SCOPES`, default `actor`) to `DEFAULT_GATHERING_RULES` + `normalizeGatheringRules`.
- [ ] Add optional `environment.reveal = { policy, scope }` override (normalize/validate) + adminStore plumbing.
- [ ] After attempt resolution in `GatheringEngine`, call `revealTask` per the effective policy/scope (`onSuccess` = success only, `onAttempt` = success or failure, `never` = no-op).
- [ ] Tests across the runtime/resolution suites for each policy + scope.
- [ ] `npm test` + `npm run build`.

## Phase 4 — Editor UI
- [ ] Tasks tab: per-task numeric **weight** input in the Override column, shown only when the environment is `blind`, writing `environment.blindSelection.weights[taskId]` via `onUpdateEnvironment`; add the environment strategy select + rollTable/macro pickers.
- [ ] Remove task drag/reorder: drop the reorder handle + Move up/down menu actions and `onReorderRecord` wiring for `kind === 'task'` in `src/ui/svelte/apps/manager/environment/CompositionList.svelte`; keep hazards. Stop writing `taskOrder` from the editor.
- [ ] Rules/Settings UI (`src/ui/svelte/apps/manager/CraftingSystemManagerRoot.svelte`): controls for `blindCandidateGate`, `revealPolicy`, `revealScope`; per-environment reveal override.
- [ ] `lang/en.json` keys for all new controls/labels.
- [ ] Update `tests/components/environment-editor.test.js` (no task reorder; weight input present in blind) + `manager-layout`/`manager-contract` as needed.
- [ ] `npm test` + `npm run build`.

## Specs / docs
- [ ] Update `openspec/specs/gathering-and-harvesting/spec.md` with blind-mode selection, candidate gating, and reveal behavior.
- [ ] Update `openspec/specs/data-models/spec.md` with the `blindSelection` / reveal / rules additions.
- [ ] Update `docs/gathering-environments.md` with a Blind mode subsection.

# Gathering Environment Data Model

Gathering environment objects carry **two parallel sets** of task/hazard fields. Knowing which one to read for which question saves a lot of stale-zero confusion.

## Modern (canonical for new envs)

Library references — the environment composes content from `gatheringConfig.systems[].tasks` / `.hazards` by id:

- `environment.enabledTaskIds[]` — task ids included automatically
- `environment.disabledTaskIds[]` — task ids the GM explicitly excluded
- `environment.forcedTaskIds[]` — task ids force-added in manual mode
- `environment.enabledHazardIds[]` / `disabledHazardIds[]` / `forcedHazardIds[]` — same shape for hazards

The actual composed-task set is `enabled ∪ forced − disabled`, then filtered by environment matching rules (biome / region / danger / library-enabled).

**Canonical composition counts** for the row table and inspector live at `$viewState.environmentTaskCounts[envId]` (shape: `{ availableTaskCount, availableHazardCount }`), computed inside `adminStore.js` via `_buildEnvironmentCompositionViewModel(environment)?.counts`. This is the authoritative read for "how many tasks / hazards does this environment surface to players".

## Legacy (still normalized, almost always empty)

`environment.tasks[]` — full task records embedded directly on the environment. Normalized via `_normalizeTask` in `src/systems/GatheringEnvironmentStore.js` (~line 318). Each embedded task carries `catalysts[]`, `tools[]`, `dropRows[]`, `resultGroups[]`.

In modern environments this array is empty — the embedded-task UX moved out to the standalone `gathering-task-edit` route, and new environments only reference library tasks by id. The schema slot survives for back-compat with older worlds.

**Do not read counts off `environment.tasks.length`** for the row table, inspector, or readiness checks. The browser-row inspector previously did this and showed 0 for everything; the fix was to switch to `$viewState.environmentTaskCounts`.

## Catalysts vs required tools

"Catalysts" is a **task-level** concept (a component consumed during gathering). Environments do not surface catalysts — they surface **required tools**, aggregated from the unique `task.toolIds` across the composed task set.

UI strings that say "Catalysts" at the environment scope are a sign of stale code copying from the task editor. The correct env-scope label is "Required tools".

## Quick reference

| Question | Read from |
| --- | --- |
| How many tasks does this env compose? | `$viewState.environmentTaskCounts[id]?.availableTaskCount` |
| How many hazards? | `$viewState.environmentTaskCounts[id]?.availableHazardCount` |
| Which task ids? | `enabled ∪ forced − disabled` from the env object |
| Which tools are required? | Look up composed task ids in `gatheringTaskDefinitions`, union the `toolIds` |
| What catalysts does the env require? | None — catalysts are per-task. Ask "what tools" instead. |
| Embedded task records | `environment.tasks[]` (legacy; almost always empty) |

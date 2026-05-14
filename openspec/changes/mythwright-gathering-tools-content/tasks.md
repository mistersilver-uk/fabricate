# Tasks

- [x] Resolve gathering task `toolIds` through `environment.__libraryTools` in `GatheringEngine` for start gates, listing blocked reasons, terminal planning, terminal application, and `usedTools` evidence.
- [x] Block `TOOL_BLOCKED` when `toolIds` reference missing or disabled library entries before actor inventory checks.
- [x] Preserve legacy inline `task.tools` behavior.
- [x] Extend Mythwright bootstrap icons, base items, tool library data, broken tool components, gathering tasks, and repair recipe builders.
- [x] Seed Mythwright tools and gathering tasks into `gatheringConfig.systems[mythwright-dnd5e].tools` and `.tasks`; compose environments from those task-library records.
- [x] Update Mythwright bootstrap exports for new helper data/builders used by tests.
- [x] Update `openspec/specs/gathering-and-harvesting/spec.md` so missing or disabled required tool library references block with `TOOL_BLOCKED`.
- [x] Update `openspec/specs/data-models/spec.md` so `Tool` language reflects per-system library entries referenced by task `toolIds`, not inline per-task authoring.
- [x] Add runtime tests for library `toolIds`, missing/disabled library references, `listForActor` blocked reasons, `processWorldTime` completion, broken actor tools, missing actor tools, failed requirements, replacement breakage, public/persisted `usedTools`, and legacy compatibility.
- [x] Add Mythwright bootstrap tests for deterministic tool ids, broken components, repair recipes, and seeded task `toolIds`.
- [x] Run `node --test tests/mythwright-bootstrap.test.js tests/gathering-tool-runtime.test.js`.
- [x] Run `npm test`.
- [x] Run `npm run build`.

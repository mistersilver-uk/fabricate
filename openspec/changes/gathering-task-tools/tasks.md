# Tasks

- [ ] Add `evaluateRequirement` to `src/systems/GatheringGateAndCheckEvaluator.js`.
- [ ] Expose `getGatheringRules(systemId)` on `src/systems/GatheringRichStateService.js`.
- [ ] Add `createGatheringToolAvailability` and `createGatheringToolBreakage` factories in `src/main.js`; wire them into `GatheringEngine`. Both must resolve tools through `environment.__libraryTools` from `task.toolIds`.
- [ ] Add `TOOL_BLOCKED` reason, start-attempt gate, `_planTerminalTools`, `_applyTerminalTools`, and policy override to `src/systems/GatheringEngine.js`. Resolve references through `__libraryTools`; drop ids that miss the library with a logged warning.
- [ ] Plumb `toolBreakagePolicy` through `src/ui/svelte/stores/adminStore.js` (constant, default, normalization).
- [ ] Add the `toolBreakagePolicy` select row to `src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte`.
- [ ] Add localization keys to `lang/en.json` for the rules section, on-break/breakage labels surfaced in chat, and the `FABRICATE.Gathering.Blocked.ToolBlocked` reason.
- [ ] Update `openspec/specs/data-models/spec.md` with a `Tool` entry if not already present from `gathering-tools-page`.
- [ ] Update `openspec/specs/gathering-and-harvesting/spec.md` with `toolBreakagePolicy` runtime behaviour.
- [ ] Add `docs/how-to/breakable-gathering-tools.md`.
- [ ] Update `docs/gathering-environments.md` with a Tools subsection (insert if missing).
- [ ] Add `tests/gathering-tool-runtime.test.js` exercising the library-reference resolution: missing-tool / failed-requirement / `toolBroken` block start; `failureOnBreak` overrides status and clears results; `successDespiteBreak` preserves success; multi-tool semantics; `usedTools` evidence; ids missing from the library are silently dropped.
- [ ] Extend `tests/gathering-gate-and-check-evaluator.test.js`.
- [ ] Extend `tests/gathering-bootstrap-api.test.js`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.

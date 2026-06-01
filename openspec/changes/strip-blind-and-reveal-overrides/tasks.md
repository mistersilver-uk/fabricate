# Tasks

- [x] Collapse `GatheringEngine._pickBlindTask` to weighted-only; delete `_resolveBlindSelection`, `_matchResolvedBlindTask`, and the `blindSelectionResolver` constructor parameter.
- [x] Strip `environment.reveal` lookup from `_resolveRevealPolicy`; reveal reads only from the system Gathering Rules.
- [x] Simplify `normalizeBlindSelection` in `GatheringEnvironmentStore.js` to `{ weights }` only; delete `normalizeEnvironmentReveal`, `validateBlindSelection`, `VALID_BLIND_SELECTION_STRATEGIES`, and `VALID_REVEAL_POLICIES`.
- [x] Remove the vestigial `task.blindSelection` normalization.
- [x] Simplify `_normalizeDraftBlindSelection` in `adminStore.js`; delete `_normalizeDraftReveal`; drop `'reveal'` from the allowed-fields list and its setter.
- [x] Delete the "Blind behaviour" card (strategy picker, Roll table UUID, Macro UUID, Reveal policy, Reveal scope) from `EnvironmentOverviewTab.svelte`, plus its script bindings/setters.
- [x] Remove `resolveGatheringBlindSelection` from `src/main.js` and its wiring.
- [x] Purge `BlindBehaviour`, `BlindStrategy*`, `BlindRollTableUuid`, `BlindMacroUuid`, and `Reveal*` keys from `lang/en.json` under `EnvironmentEditor.Overview`.
- [x] Update `docs/gathering-environments.md` and `openspec/specs/gathering-and-harvesting/spec.md` to describe blind selection as weighted-only and reveal as system-only.
- [x] Update tests: drop strategy/UUID and reveal-override fixtures and assertions; cover the silent migration.
- [x] Run `npm test` and `npm run build`; grep guard for stale references.

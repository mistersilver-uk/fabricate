# Tasks

- [ ] Add `duplicateGatheringLibraryHazard(systemId, hazardId)` to `src/ui/svelte/stores/adminStore.js` mirroring the task duplicate helper.
- [ ] Create `src/ui/svelte/apps/manager/GatheringHazardsBrowserView.svelte` mirroring `GatheringTasksBrowserView.svelte` with hazard columns, filters, and action callbacks.
- [ ] Create `src/ui/svelte/apps/manager/GatheringHazardEditView.svelte` mirroring the applicable sections of `GatheringTaskEditView.svelte` (identity, availability, dangerTags, dropRate, hazardModifier, characterModifiers).
- [ ] Wire the `encounters` tab in `src/ui/svelte/apps/manager/EnvironmentsBrowserView.svelte`: rename placeholder localisation keys, mount `GatheringHazardsBrowserView` when active, mount `GatheringHazardEditView` for a selected hazard.
- [ ] Add `FABRICATE.Admin.Manager.GatheringHazards.*` keys to `lang/en.json` (browser + editor labels) and rename `EncountersPlaceholderTitle/Hint` → `EncountersTitle/Hint`.
- [ ] Add `.manager-gathering-panel-hazards`, `.manager-gathering-hazards-table`, `.manager-gathering-hazard-row`, `.manager-gathering-hazard-identity` selectors to `styles/fabricate.css`. Add `.manager-danger-tag-pill` if dangerTag chips need a distinct accent. Reuse shared selectors.
- [ ] Add `tests/components/gathering-hazards-browser.test.js` covering render, filter, search, action callbacks, and usage-aware delete confirmation.
- [ ] Add `tests/components/gathering-hazard-editor.test.js` covering section render, dropRate clamp, name validation, and save dispatch.
- [ ] Extend `tests/stores/adminStore.test.js` with cases for `duplicateGatheringLibraryHazard` and hazard `_gatheringLibraryRecordUsages`.
- [ ] Extend `tests/components/manager-mounted.test.js` compile list to include the new hazard views.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.

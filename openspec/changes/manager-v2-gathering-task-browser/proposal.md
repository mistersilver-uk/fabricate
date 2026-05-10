# Manager V2 Gathering Task Browser

## Summary

Replace the Manager V2 Gathering `Tasks` placeholder with a Gathering Task browser backed by `gatheringConfig.systems[systemId].tasks`.

## Motivation

GMs can already define Gathering Tasks in the underlying config and attach them to environments, but Manager V2 only exposes a placeholder for the library. A browser lets GMs inspect, find, duplicate, delete, and select Gathering Tasks before the full authoring form is ready.

## Proposed Change

- Render a Gathering Task library browser in the Gathering `Tasks` tab only.
- Leave the Hazards/Encounters tab placeholder behavior unchanged.
- Support search by task name, description, and drop reference.
- Support filters for status, region, biome, and availability.
- Show paginated rows with Gathering Task identity, region, biomes, drops count, availability, matching environment count, status, and edit/duplicate/delete actions.
- Track the selected Gathering Task in the Manager V2 root so the right inspector can show task details and drop summaries.
- Open a dedicated task editor placeholder from the row Edit action and provide a back-to-library control.
- Add `duplicateGatheringLibraryTask(systemId, taskId)` to the admin store. The clone receives a new task id, new drop-row ids, and a ` (Copy)` name suffix before persisting.
- Keep task deletion routed through the existing gathering task delete confirmation behavior.
- Wire task add/update/delete/duplicate callbacks from `CraftingSystemManagerV2Root` into `EnvironmentsBrowserView`.
- Update the UI contract in `openspec/specs/ui-integration/spec.md` and gathering behavior in `openspec/specs/gathering-and-harvesting/spec.md` through this change.

## Impact

- Manager V2 UI behavior changes for gathering-enabled systems.
- Adds a store action for Gathering Task duplication.
- No new runtime hook, migration, Foundry API, or package dependency is introduced.
- Full task authoring fields remain out of scope for this slice.

## Acceptance Criteria

- Empty Gathering Task libraries show a create-task prompt that calls the existing task creation action.
- Filtered-out libraries show a no-results state with a clear-filter control.
- Pagination appears when filtered rows exceed the page size.
- Selection resets when the selected crafting system changes, and selected-task deletion falls back to the next available task or an empty inspector.
- Status toggles call the existing Gathering Task update action.
- Duplicate and delete actions are row-local and do not select or edit unrelated tasks.
- Duplicate preserves normalized task fields without leaking edits across systems.
- Drop rows are summarized in the row and inspector; full drop editing remains deferred.
- Desktop and narrow Manager V2 widths keep the task toolbar, row actions, inspector, and pagination bounded and usable.

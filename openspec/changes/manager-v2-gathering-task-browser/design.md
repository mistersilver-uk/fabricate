# Manager V2 Gathering Task Browser Design

## UI

`EnvironmentsBrowserView` continues to own the local Gathering tab strip. The `Tasks` panel renders a browser over Gathering Task records backed by `GatheringTaskDefinition` data using the same Manager V2 toolbar, table, empty state, and pagination patterns used by the recipe and environment browsers.

Rows are selectable independent of Edit. Selecting a row updates root-owned Gathering Task selection state for the inspector. Edit selects the task and switches the center panel to a non-saving placeholder editor route. The placeholder explicitly states that detailed authoring fields are coming later and returns to the task library without mutating the task.

## Availability

Availability text is derived from the definition's `timeOfDay` and `weather`, resolved through selected-system condition value labels. Empty dimensions render as `Any time` and `Any weather`.

The environment count includes enabled environments for the selected system where the enabled definition matches region, biome, enabled current weather and time-of-day settings, and task allow/deny lists. `disabledTaskIds` excludes a definition. Non-empty `enabledTaskIds` allows only those listed.

## Store

`duplicateGatheringLibraryTask(systemId, taskId)` works against normalized gathering config, deep-clones the selected-system task, assigns a fresh task id, assigns fresh ids to each drop row, appends a localized copy suffix to the task name, preserves normalized fields, persists `gatheringConfig`, refreshes view state, and returns the created task. Missing systems or missing tasks return `null`.

The browser receives callbacks for create, update/toggle, edit, duplicate, and delete from `CraftingSystemManagerV2Root`. It never writes config directly.

## Tests And Review

Targeted checks cover mounted task-browser behavior, source/contract wiring, localization keys, duplicate store behavior, and CSS layout contracts. Full validation remains `npm test` and `npm run build`. Visual review should cover desktop and narrow Manager V2 widths, first visible Tasks state, toolbar alignment, row action hit targets, inspector scroll containment, pagination visibility, and localized controls.

## Out Of Scope

The full Gathering Task authoring form, validation UX for individual task fields, hazard browser work, and any migration of legacy Environment Tasks are deferred.

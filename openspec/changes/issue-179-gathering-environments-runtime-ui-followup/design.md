# Design: Issue #179 Gathering Environments Runtime UI Follow-up

## Decisions

1. Treat the completed #179 runtime branch/slice as the implementation baseline. This follow-up does not restate or modify runtime contracts.
2. Keep the first implementation slice behavior-neutral by extracting presentational components only. The public `EnvironmentsTab` prop surface stays stable for `RecipeManagerRoot` and the admin store.
3. Use Svelte components, not helper utility buckets, as the split boundary. Each extracted component owns one visible section of the current editor markup and receives explicit props and callbacks.
4. Keep the UI-local incomplete visibility state machine intact. It may remain in `EnvironmentsTab` or move into a visibility authoring component, but incomplete provider state must stay local and must not be committed to `adminStore`.
5. Keep validation addressing stable: `data-environment-field` paths, inline error IDs, `aria-invalid`, `aria-describedby`, validation summary links, and first-invalid focus behavior remain unchanged.
6. Keep CSS and DOM class contracts stable during extraction so the existing responsive and layout tests remain meaningful.
7. Extracted components must not import or access Foundry runtime globals such as `game`, `ui`, `Hooks`, `CONFIG`, or `fromUuid`, and must not perform direct Foundry collection lookups.
8. Later picker support must use injected data/actions from the app/store boundary, not runtime globals in presentational components.

## First Slice Boundary

The first slice extracts current markup around these prop-driven areas:

- environment list
- validation summary and save error display
- environment base fields and save actions
- task list
- task base fields
- time requirement and failure outcome advanced fields
- routed result-selection controls
- progressive check and award controls
- visibility authoring, including local incomplete provider visibility
- catalyst table
- result group/result authoring

`EnvironmentsTab.svelte` remains the orchestration component for:

- derived selected task state
- field path construction
- validation helper functions
- first-invalid focus behavior
- wiring current callbacks to presentational child components

## Sequencing

1. Component extraction only.
2. Add environment/task summary text and invalid indicators.
3. Add validation-aware collapsibles.
4. Add assisted scene, roll-table, image, component, and macro picker affordances.
5. Add contextual reorder controls.
6. Add catalyst dependent controls.
7. Apply visual/responsive polish and capture Foundry screenshots when the UI behavior warrants it.
8. Replace the environment selection list with a 3-column card grid and direct card actions.

The first task must not implement tasks 2 through 7.

## Environment Card Grid

The GM `Environments` tab keeps the current two-pane structure: environment selection on the left/top and the draft editor on the right/below. The selection surface changes from compact rows to a scrollable grid of cards.

Card requirements:

- Use `grid-template-columns: repeat(3, minmax(0, 1fr))` for the default card grid.
- Collapse responsively inside narrow admin containers so cards remain readable rather than forcing horizontal overflow.
- Resolve the card image from injected `sceneOptions` by matching `environment.sceneUuid` to `scene.uuid` and using `scene.img` or `scene.thumbnail` when present.
- Use a default icon image when the environment has no linked scene or when the injected scene option lacks imagery.
- Keep card image and environment name as buttons that call `onSelectEnvironment(environment.id)` and open the draft editor.
- Provide explicit icon actions for edit, enable/disable, and delete. The edit action selects the environment. The delete action uses the existing delete callback.
- Provide a dedicated persisted-environment toggle callback so enabling/disabling a card updates the represented environment, not whichever draft is currently selected.
- Preserve presentational component isolation: card rendering receives plain data, plain callbacks, and injected scene option data; it must not import Foundry globals or resolve scenes itself.

The toolbar should keep the `Gathering Environments` heading and `New Environment` button on the same baseline. Avoid wrapping the create button below the title except when the container becomes too narrow to keep both usable.

## Grid-First Editor Flow

The Environments tab starts in a browsing mode. Browsing mode shows only the scrollable card grid below the toolbar and lets it fill the available tab height. The editor form is not mounted in this mode, even when the admin store has a selected persisted draft for state continuity.

Entering editor mode:

- Clicking a card image, card name, or explicit edit button selects that environment and shows the editor.
- Clicking `New Environment` creates a draft and shows the editor.
- Direct card actions such as enable/disable and delete stay in browsing mode unless they inherently change selection.

Editor mode:

- The card grid is hidden.
- The environment editor fills the available tab height.
- A Back button in the editor header returns to browsing mode without changing persisted data by itself.
- Existing Cancel/Save behavior remains unchanged for draft discard/save.

Card visual requirements:

- Card imagery should be large enough to read as the primary card surface.
- Edit, enable/disable, delete, and overflow/reorder controls sit as an overlay in the image's top-right corner.
- Environment names are larger than metadata, with compact spacing between name and summary details.
- Summary metadata stays readable but should not create large vertical gaps.

## Card Interaction And Image Bugfix

The card grid must be validated against real browser pointer hit-testing, not only direct DOM `.click()` calls.

Interaction decisions:

- Do not use a full-card overlay button that can sit above card action controls.
- Use a guarded card-level activation handler or a non-overlapping semantic control so blank card body clicks open the editor without intercepting edit, toggle, delete, or overflow-menu actions.
- Explicit card controls stop propagation before invoking their callbacks so they do not also open the editor.
- The overflow/reorder menu must be able to extend outside the media frame; the media frame may clip the image itself, but must not clip menu content.
- Grid-mode save/action errors must be visible outside the editor so a failed enable/disable action cannot look like a no-op.

Image decisions:

- Scene option data should preserve high-resolution scene image data separately from thumbnail data.
- Card imagery should prefer `scene.background.src`/scene image paths over generated thumbnails, with thumbnail as fallback.
- The default card media ratio should be scene-like and stable; use a `16 / 9` frame for linked scene imagery rather than the prior square-ish `4 / 3` crop.
- Fallback icons remain centered, contained, and visually distinct from scene images.

## Validation Reveal Requirements

Later validation-aware collapsibles must reveal the section that contains the first invalid field before focus is applied. Reveal state uses compact UI section keys while remaining derived from the existing validation path prefixes:

- Environment-level fields such as `environment.name`, `environment.selectionMode`, and `environment.sceneUuid` keep the existing field selectors; they are not part of the task subsection collapse state.
- `task.<taskId>.base` for `task.<taskId>.name`, `task.<taskId>.description`, `task.<taskId>.img`, `task.<taskId>.enabled`, and `task.<taskId>.resolutionMode`.
- `task.<taskId>.time` for `task.<taskId>.timeRequirement.*`.
- `task.<taskId>.failure` for `task.<taskId>.failureOutcome.*`.
- `task.<taskId>.resolution` for `task.<taskId>.resultSelection.*`.
- `task.<taskId>.check` for both `task.<taskId>.progressive.*` and `task.<taskId>.check.*`.
- `task.<taskId>.visibility` for `task.<taskId>.visibility.*`.
- `task.<taskId>.catalysts` for `task.<taskId>.catalysts.*`.
- `task.<taskId>.resultGroups` for collection-level result-group errors and result fields, including `task.<taskId>.resultGroups`, `task.<taskId>.resultGroups.<groupId>.*`, and `task.<taskId>.result.<resultId>.*`.
- `task.<taskId>.resultGroups.<groupId>` for nested result-group expansion when an invalid result-group or result row belongs to a specific group.

Reveal behavior must keep current field selectors valid. A failed save should reveal the section, preserve or switch the selected task when `firstInvalidField.taskId` is present, then focus the same `data-environment-field` target currently used by the component.

## Injected Picker Data Contracts

Later assisted picker tasks must keep lookup data injected into the Svelte tree:

- Scene picker data: array entries with at least `{ uuid, name }`; optional `{ active, thumbnail }` may be used for display only.
- Roll-table picker data: array entries with at least `{ uuid, name }`; optional `{ pack, img }` may be used for display only.
- Image picker action: a callback that receives the current image path and resolves to a string path or `null`/`undefined` when cancelled.
- Component picker data: the existing `managedItemOptions` contract remains the source for component IDs, names, images, and difficulty.
- Macro picker data: the existing `availableScriptMacros` contract remains the source for script macro UUIDs and names.

Presentational components must treat these contracts as plain data/actions. Foundry document resolution and file picker integration belong at the admin app/store edge.

## Test Seams

- Source-level component contract tests should confirm `EnvironmentsTab` continues to pass all existing callbacks and props to the extracted components.
- Characterization tests should continue to cover callback wiring, dirty/save state, validation accessibility state, stale UUID display, and incomplete local visibility behavior.
- Build validation is required because Svelte extraction errors are often caught at compile time rather than by source-string tests.

## Risks

- Large Svelte extraction can accidentally alter DOM class names or `data-environment-field` paths. Keep the first slice mostly mechanical and verify source contracts before broad tests.
- Moving visibility controls can accidentally commit incomplete provider state. Preserve the current local state machine exactly.
- Source-string tests are brittle but useful for this behavior-neutral slice because they guard contracts that are not yet runtime-mounted in Foundry tests.

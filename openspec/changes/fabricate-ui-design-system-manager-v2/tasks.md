# Tasks

## Planning

- [x] Review redesign proposal images for systems manager, environments index, and environment editor.
- [x] Read current UI integration spec and existing Svelte manager/admin structure.
- [x] Query open GitHub issues; no dedicated redesign issue exists, and `#179` remains the closest gathering-specific issue only.
- [x] Create a design-system artifact that applies across Fabricate UI applications.
- [x] Create a delta spec for a parallel manager-v2 app.
- [x] Review the design system and delta spec against the images and record iteration notes.
- [x] Review the later recipe browser/editor direction and update the manager-v2 design system/spec for those views.
- [x] Review the later essence browser/editor direction and update the manager-v2 design system/spec for that view.
- [x] Extract keepable patterns from the latest Steps / Ingredients tab design and add explicit delta requirements for that page.
- [x] Review the latest Steps / Ingredients iteration and add palette, option-type, OR-divider, and drag-target requirements.
- [x] Link the reference screenshots under `references/` from the change docs and clarify that written OpenSpec requirements take precedence over imperfect visual references.
- [x] Link the added `Edit Recipe Results` reference screenshot and capture its intended result-group authoring direction.
- [x] Fold the crafting-check versus successful-provider resolution model into the manager-v2 recipe editor delta.
- [x] Review the added component, essence, resolution, and visibility reference screenshots and record explicit keep/change/discard decisions.
- [x] Review the added tags/categories reference screenshot and add system-level item-tag/category guidance.
- [x] Review the added actor Crafting app simple and complex references and add player-facing Crafting mode design direction.
- [x] Review the added actor Alchemy app reference and add workbench-first Alchemy mode design direction.
- [x] Add Actor Crafting/Alchemy references to the proposal, design system, design notes, review notes, and UI delta.

## Implementer Entry Criteria

- [x] Treat this as an additive manager-v2 implementation. Do not replace the current manager in the first pass.
- [x] Reuse the existing admin store and service callbacks unless a later approved design update identifies a specific derived-view-state need.
- [x] Preserve all runtime semantics, persistence schemas, import/export behavior, validation ownership, and dirty-draft protection.
- [x] Add no npm dependencies without a new plan entry explaining why they are needed.
- [x] Keep all presentational Svelte components free of direct Foundry global lookups.
- [x] Use the design-system tokens and layout rules from `design-system.md`.

## Concrete Implementation Plan: First Slice

This first implementation slice creates the basic structure for `CraftingSystemManagerV2` and routes the existing GM Items Directory `Manage Crafting Systems` action to it. The current `SvelteRecipeManagerApp` remains registered and available; v2 is additive but becomes the explicit manager launch path for the directory button once the shell exists.

- [x] Add a parallel v2 app registry in `src/ui/appFactory.js`.
- [x] Add `src/ui/SvelteCraftingSystemManagerV2App.svelte.js` as a parallel ApplicationV2 wrapper that reuses the current manager service and admin-store behavior.
- [x] Add `src/ui/svelte/apps/manager-v2/CraftingSystemManagerV2Root.svelte` with the three-region shell, compact header, toolbar, systems table, selected-system inspector, compact empty state, and deferred-view placeholders.
- [x] Add scoped manager-v2 CSS variables and layout rules to `styles/fabricate.css`, including container-query stacking and no-gradient product styling.
- [x] Add localized strings under `FABRICATE.Admin.ManagerV2` in `lang/en.json`.
- [x] Import/register the v2 app from `src/main.js` and change the GM Items Directory `Manage Crafting Systems` button to call the v2 app class.
- [x] Add focused tests for the app factory v2 registry, v2 source contract, root component structure, and item-directory launch wiring where practical.

## First-Slice Scope Decisions

- [x] Build only the manager shell plus a real Systems view in the first slice.
- [x] Defer full v2 recipe editor, components, essences, tags/categories, graph, and environment editor work.
- [x] Show only real data supported by the existing store: system name, description, enabled state, resolution mode, feature flags, component count, recipe count, gathering environment count, import/export/create/delete actions.
- [x] Do not invent version, created/updated timestamps, biome, size, source-state metadata, recipe tags, station/skill/output-quality/byproduct fields, or recipe-local resolution mode.
- [x] Preserve canonical feature gates for future views: environments require gathering, essences require essences, tags/categories require their system features.
- [x] Keep legacy `mapped`/`tiered` mode handling display-only if encountered; v2 does not add new legacy editing behavior.
- [x] Do not add recipe dnd5e/pf2e crafting-check UI in this slice; those providers are gathering-check behavior unless a later recipe-check spec adds them.
- [x] Do not add essence source-item editing in this slice because current runtime and the delta still need source-link semantic alignment.

## Corrective Implementation Plan: First-Slice Screenshot Review

- [x] Clamp system row names and descriptions so identity text cannot overflow row geometry or collide with metadata/actions.
- [x] Remove duplicate `Import` and `Create` actions from the System library section header; keep them in the top-right application header.
- [x] Hide deferred left-rail feature/admin tabs while no crafting system is selected, and feature-gate visible placeholders once a system is selected.
- [x] Remove the selected/no-selection info block from the left rail so selection evidence lives in the selected row and right inspector.
- [x] Resize and constrain the right inspector title/summary so long names stay readable instead of fragmenting into narrow columns.
- [x] Remove the inspector `Quick actions` card because export/delete are already available inline on each row and global actions are in the header.
- [x] Update focused source, mounted, and CSS contract tests for the corrected hierarchy and text containment.
- [x] Validate with `npm test`, `npm run build`, and Foundry Playwright screenshot/pointer coverage.

## Concrete Implementation Plan: Second Slice - Recipes Browser

This implementation slice promotes `Recipes` from a selected-system placeholder to a real manager-v2 browser view. It is browser-only: create and edit continue to open the existing recipe editor, and the v2 slice does not introduce inline recipe editing, recipe editor tabs, resolution controls, visibility controls, or new persistence semantics.

- [x] Add local manager-v2 route state for `systems` and `recipes`; keep the recipes route unavailable until a crafting system is selected.
- [x] Switch the application header actions by active view: systems actions remain system-scoped, while recipes actions use existing create/import/export recipe callbacks.
- [x] Add derived admin-store recipe browser display data only where needed for honest UI: description, step/result counts, ingredient/catalyst counts, and a multi-step-safe requirements preview from execution-step semantics when available.
- [x] Add the manager-v2 recipes browser table with compact columns: recipe identity, category when backed by the selected system, structure, status, requirements, and actions.
- [x] Add recipe search, status filter, and category filter controls without changing the existing store search contract.
- [x] Add selected-recipe state and right inspector showing only data-backed fields: image, name, enabled/disabled, locked/unlocked, category, structure, visibility summary when already available, requirements preview, and quick actions.
- [x] Wire recipe row and inspector actions to existing store/service callbacks: `createRecipe`, `setRecipeSearch`, `toggleRecipeEnabled`, `importRecipes`, `exportRecipes`, `duplicateRecipe`, `deleteRecipe`, and inherited `services.onEditRecipe`.
- [x] Add localized manager-v2 recipe labels under `FABRICATE.Admin.ManagerV2`.
- [x] Add scoped recipe-table and inspector CSS, including normal, stacked, and narrow container behavior with no horizontal overflow.
- [x] Extend focused source, mounted, layout, and store-contract tests for recipes browser routing, data shape, filters, selected inspector, action wiring, and accessibility labels.
- [x] Extend Foundry smoke coverage to capture `manager-v2-recipes-normal` at `1200x790` and `manager-v2-recipes-stacked` at `1000x700`, with pointer coverage for Recipes nav, search, filters, row selection, enabled toggle, edit, duplicate, delete, import, export, and create.

## Second-Slice Scope Decisions

- [x] Implement only the manager-v2 recipes browser; keep the full recipe editor as a later slice.
- [x] Preserve recipe scoping to the selected crafting system.
- [x] Preserve existing recipe manager behavior for create, edit, duplicate, delete, import/export, enabled toggle, cleanup, persistence, and validation ownership.
- [x] Do not show unsupported conceptual fields from the reference image, including required station, minimum skill, output quality, byproduct, XP, rarity, recipe-local resolution mode, biome, owner, or invented timestamps.
- [x] Use `Requirements` or `Structure` copy for counts so the browser does not confuse recipe ingredients with the Fabricate `Component` aggregate.
- [x] Do not present knowledge-mode visibility summaries unless a later derived-view-state task adds canonical support.
- [x] Do not treat locked recipes as hidden; locked remains its own recipe state.
- [x] Do not apply player-facing alchemy discovered-recipe behavior to the GM manager browser.
- [x] Keep recipe imagery data-backed and prove at least one linked recipe image in smoke screenshots where fixture data supports it.

## Corrective Implementation Plan: Systems Browser Navigation And Editing

This corrective slice addresses review feedback after the systems and recipes browser slices. It keeps manager-v2 additive and routes system editing through the existing system editor behavior until a full manager-v2 system editor is planned.

- [x] Add manager-v2 breadcrumbs matching the reference hierarchy. The root breadcrumb returns to the systems browser, and selected-system crumbs route back to the selected system scope.
- [x] Remove `Systems` as a left-rail tab. The systems browser remains reachable from the selected system title/scope control and the root breadcrumb.
- [x] Rework the left rail scope section so the selected system name is the route target for the systems browser and does not duplicate a Systems nav item.
- [x] Fix systems list identity overflow: names, descriptions, and active/disabled badges must stay inside row geometry at normal and stacked widths.
- [x] Remove duplicate inline component, recipe, and feature count pills from systems rows because the selected-system summary lives in the right inspector.
- [x] Remove the orange browser/focus highlight from clicked system names while preserving accessible focus-visible styling.
- [x] Rework the systems inspector header so the icon no longer disrupts selected-system name, status, and resolution layout.
- [x] Add an Edit action to each systems row. The action must select the system and open the existing system editor overview behavior through a service callback, without adding a second persistence path.
- [x] Add localized copy for breadcrumbs and the systems edit action.
- [x] Update focused mounted/source/layout tests and Foundry smoke pointer coverage for breadcrumbs, selected system scope routing, row edit action, and no-overflow systems rows.

## Corrective Implementation Plan: Systems Browser Row And Inspector Polish

- [x] Make the full systems row select the system, except for explicit row action buttons.
- [x] Preserve keyboard selection on systems rows.
- [x] Clamp compact row descriptions so they cannot overflow row geometry.
- [x] Align selected-system count numbers and labels on one line in the inspector.
- [x] Align enabled feature pills to the top-left of the enabled-features card.
- [x] Add focused mounted/layout tests for row selection and inspector alignment.

## Corrective Implementation Plan: Systems Inspector Count Pills

- [x] Keep count-pill values and labels on one inline, non-breaking line.
- [x] Render the gathering-disabled state as `Gathering environments Off`, with `Off` retaining value emphasis.
- [x] Update focused mounted and layout tests for count-pill ordering and no-wrap CSS.

## Corrective Implementation Plan: Systems Row Status Toggles

- [x] Replace static system status chips in the systems library rows with interactive on/off toggle buttons.
- [x] Persist row status changes through a focused admin-store `toggleSystemEnabled(systemId, enabled)` action.
- [x] Use distinct active/off colors and stable compact toggle geometry that fits the systems table status column.
- [x] Stop row-selection event propagation from the status toggle so toggling does not unexpectedly select a different system.
- [x] Add focused mounted, layout, source/localization, and admin-store tests for system status toggles.

## Corrective Implementation Plan: Component Description Normalization

- [x] Diagnose `[object Object]` in the components browser as object-shaped Foundry description data being coerced with `String(...)`.
- [x] Update component description normalization to extract plain text from Foundry-style objects such as `{ value: "<p>...</p>" }`.
- [x] Ensure unknown object-shaped descriptions resolve to empty display text rather than `[object Object]`.
- [x] Add an admin-store defensive normalization layer for manager-v2 `itemCards` so raw or stale component data cannot leak object strings into the browser.
- [x] Add focused system-manager and admin-store regression tests for object-shaped descriptions.

## Corrective Implementation Plan: Environment Browse Row Layout

- [x] Replace the environment browse checkbox status with the shared compact manager-v2 on/off toggle.
- [x] Render the tasks column as a plain numeric task count only.
- [x] Remove result and catalyst evidence from environment browse rows.
- [x] Remove the linked-scene table column and rely on the environment thumbnail plus inspector for scene evidence.
- [x] Make environment row thumbnails wider and scene-proportional.
- [x] Rework environment row actions so edit, duplicate, and delete sit in a compact grid left of a top/bottom move-up/down stack.
- [x] Update focused layout and mounted tests for the revised environment browse contract.

## Concrete Implementation Plan: System Edit View

This slice replaces the temporary manager-v2 Edit action bridge to the current admin with a real in-manager-v2 system edit view. It remains deliberately narrow and reuses the current admin store for all writes.

- [x] Add a manager-v2 `system-edit` route that is reachable from each systems row Edit action after selecting the target system.
- [x] Update breadcrumbs, header copy, and left rail active state so the edit view reads as part of manager-v2, with a back action returning to the systems browser.
- [x] Add edit controls for system name, description, resolution mode, advanced-option visibility, and optional feature toggles.
- [x] Reuse existing store callbacks for persistence: `saveSystemDetails`, `setResolutionMode`, `toggleAdvancedOptions`, and `toggleFeature`.
- [x] Keep destructive resolution-mode confirmation behavior delegated to the existing store.
- [x] Remove `onEditSystem` usage from the v2 wrapper and root for this action; keep `openCurrentAdmin` as the explicit legacy fallback button only.
- [x] Add localized manager-v2 edit-view labels under `FABRICATE.Admin.ManagerV2`.
- [x] Add scoped manager-v2 edit form CSS with stable inputs, toggle rows, scroll containment, and narrow-container stacking.
- [x] Extend source, mounted, and layout tests so system Edit transitions in-place, writes through existing store callbacks, and no longer opens the current admin.
- [x] Run review feedback with a reviewer agent before final validation.
- [x] Validate with `npm test` and `npm run build`.

## System Edit View Scope Decisions

- [x] Do not implement deep category, tag, essence, crafting-check, requirements, visibility, alchemy, gathering environment, or recipe configuration in this slice.
- [x] Do not add a second persistence path or call Foundry globals from the Svelte root.
- [x] Do not remove the explicit `Open current admin` fallback from manager-v2.
- [x] Use only existing optional feature keys already present in `selectedSystem.features` and `store.toggleFeature`.

## Concrete Implementation Plan: Components Browser

This slice promotes `Components` from a selected-system placeholder to a real manager-v2 page. It is browser-only: deep component editing continues to open the existing component editor, and all persistence remains delegated to the current admin store and service callbacks.

- [x] Add a manager-v2 `components` route that is available only after a crafting system is selected.
- [x] Update breadcrumbs, header copy, and left rail active state so Components reads as a first-class manager-v2 page.
- [x] Render a component browser from existing `store.viewState.itemCards` and `store.viewState.itemSearchTerm`.
- [x] Add component search and display-backed filters for source state and component facts without changing the existing store search contract.
- [x] Add a prominent drop-to-add import target that reuses the existing `services.onDropItem` behavior for selected-system component import.
- [x] Add component rows with image, name, description, source state, tags when item tags are enabled, essence assignments when essences are enabled, salvage/progressive evidence when available, and row actions.
- [x] Add selected-component state and a right inspector showing data-backed identity, description, tags, essences, source UUID/state, salvage/progressive evidence, and quick actions.
- [x] Wire component actions to existing callbacks: `store.setItemSearch`, `services.onDropItem`, `services.onEditComponent`, `store.deleteComponent`, and `services.onCopySourceUuid`.
- [x] Add localized manager-v2 component labels under `FABRICATE.Admin.ManagerV2`.
- [x] Add scoped component-table, drop-zone, chip, and inspector CSS with stable normal and stacked geometry.
- [x] Extend source, mounted, and layout tests for components routing, filtering, selected inspector, drop import, and action wiring.
- [x] Run review feedback with reviewer and QA agents before final validation.
- [x] Validate with `npm test` and `npm run build`.

## Components Browser Scope Decisions

- [x] Do not implement inline component editing, a second component editor, new persistence semantics, or new source-resolution behavior in this slice.
- [x] Do not invent usage counts, timestamps, source freshness, or progressive difficulty fields when current admin data does not provide them.
- [x] Do not implement recipe-item import from the component drop zone unless existing callbacks can distinguish and confirm that behavior.
- [x] Preserve unresolved source references; missing source evidence must not trigger deletion or cleanup.
- [x] Keep component, recipe item, essence, and generic Foundry item concepts visually distinct.

## Concrete Implementation Plan: Environments Browse/Edit

This slice promotes `Environments` from a selected-system placeholder to a real manager-v2 page and edit route. It must reuse the existing environment list, draft, validation, save/cancel, and dirty-confirmation behavior from `adminStore`; there is no second persistence path.

- [x] Run review feedback before implementation starts: ask a reviewer/UX pass to check this plan against the existing `EnvironmentsTab` behavior, manager-v2 root, and gathering spec, then iterate the plan if blockers are found.
- [x] Add a manager-v2 `environments` route that is available only when a crafting system is selected and `selectedSystem.features.gathering === true`.
- [x] Update breadcrumbs, header copy, and left rail active state so Environments reads as a first-class manager-v2 page and returns cleanly to the selected system/systems browser.
- [x] Render the browse page from existing environment state: `$viewState.environments`, `$viewState.environmentsLoading`, `$viewState.environmentsError`, `$viewState.selectedEnvironmentId`, `$viewState.environmentDraft`, `$viewState.environmentDraftDirty`, and `$viewState.environmentValidationState`.
- [x] Add local display-only search, status filter, and selection-mode filter for the environment list; do not add store persistence or a new search contract.
- [x] Add environment rows with linked scene/fallback image, name, description, enabled/disabled state, targeted/blind mode, task count, result/catalyst evidence when derivable from tasks, scene-link state when available, and row actions.
- [x] Add selected-environment state and right inspector showing linked scene image, identity, description, enabled state, selection mode, scene/source state, task/result/catalyst counts, dirty/validation evidence when selected, and existing quick actions.
- [x] Wire row/header/inspector actions only to existing store callbacks: `createEnvironmentDraft`, `selectEnvironment`, `toggleEnvironmentEnabled`, `moveEnvironmentDraft`, `duplicateEnvironmentDraft`, and `deleteEnvironmentDraft`.
- [x] Add an in-v2 environment edit route. Prefer mounting/reusing the existing `EnvironmentsTab` editor with current props/actions inside the manager-v2 shell; any wrapper must be presentation-only and must not fork draft mutation or validation behavior.
- [x] Pass through the existing environment editor props and callbacks from manager-v2 root: `environmentDraft`, `environmentDraftDirty`, `environmentDraftIsNew`, `environmentSaving`, `environmentSaveError`, `environmentValidationState`, `selectedEnvironmentTaskId`, `managedItemOptions`, `availableScriptMacros`, `sceneOptions`, `rollTableOptions`, `onPickImagePath`, `updateEnvironmentDraft`, `selectEnvironmentTask`, `addEnvironmentTask`, `updateEnvironmentTask`, `duplicateEnvironmentTask`, `deleteEnvironmentTask`, `moveEnvironmentTask`, `addEnvironmentTaskResultGroup`, `updateEnvironmentTaskResultGroup`, `deleteEnvironmentTaskResultGroup`, `moveEnvironmentTaskResultGroup`, `addEnvironmentTaskResult`, `updateEnvironmentTaskResult`, `deleteEnvironmentTaskResult`, `moveEnvironmentTaskResult`, `addEnvironmentTaskCatalyst`, `updateEnvironmentTaskCatalyst`, `deleteEnvironmentTaskCatalyst`, `updateEnvironmentTaskVisibility`, `updateEnvironmentTaskResultSelection`, `updateEnvironmentTaskProgressive`, `updateEnvironmentTaskCheck`, `updateEnvironmentTaskTimeRequirement`, `updateEnvironmentTaskFailureOutcome`, `saveEnvironmentDraft`, and `cancelEnvironmentDraft`.
- [x] Preserve dirty-draft confirmation semantics for environment selection, create/edit transitions, leaving the environments route, selected-system changes, delete/cancel, and gathering feature disablement by delegating through the existing store actions.
- [x] Add localized manager-v2 environment labels under `FABRICATE.Admin.ManagerV2` and reuse existing `FABRICATE.Admin.Environments` labels inside the editor where practical.
- [x] Add scoped manager-v2 environment browse/edit CSS with stable row geometry, linked image framing, inspector sections, scroll containment, and container-query stacking; preserve existing editor validation/focus affordances.
- [x] Extend focused source, mounted, layout, and store-contract tests for feature gating, route entry, filters, selected inspector, row action wiring, create/edit route transitions, save/cancel wiring, validation display/focus, dirty-confirmation delegation, and no second persistence path.
- [x] Run the requested review -> iterate loop after implementation: reviewer/UX pass for layout and behavior, apply necessary fixes, then run final reviewer/QA pass before sign-off.
- [x] Validate with `npm test`, `npm run build`, and `npm run test:foundry`.
- [x] Confirm with Playwright UI smoke tests and screenshot artifacts: `manager-v2-environments-browse-normal` at `1200x790`, `manager-v2-environments-browse-stacked` at `1000x700`, `manager-v2-environments-edit-first-state` at `1200x790`, `manager-v2-environments-edit-validation`, `manager-v2-environments-edit-authoring`, and `manager-v2-environments-edit-stacked` at `1000x700` or narrower.
- [x] Playwright artifacts must prove first visible state, alignment, no clipping/overlap, linked scene image fidelity, scroll containment, visible controls, responsive stacking, and live browser pointer hit-tests for nav, filters, rows, toggles, menus, editor controls, save/cancel, validation links, and inspector actions.

## Environments Browse/Edit Scope Decisions

- [x] Reuse the current environment store/actions as the only persistence path; do not add a manager-v2 environment service, second draft model, second validation path, or direct Foundry global lookups.
- [x] Keep selected-system scoping and gathering feature gating canonical; Environments is hidden/unavailable when `features.gathering !== true`.
- [x] Do not invent biome, size, difficulty, rarity, map/travel data, last-updated timestamps, standalone harvesting, or ingredient-set-based gathering.
- [x] Use only data-backed imagery. At least one smoke fixture must include linked scene imagery so screenshots prove the intended image path instead of only fallback icons.
- [x] Preserve unresolved/stale scene, macro, and roll-table references as visible warnings; do not delete or clean them merely because they fail to resolve.
- [x] Keep deep environment editing behavior equivalent to the current `EnvironmentsTab` until a later OpenSpec change intentionally redesigns task/result/catalyst authoring.

## Corrective Implementation Plan: Environment Editor Redesign

The first v2 environment edit route is behaviorally wired but visually wrong. It mounts the legacy `EnvironmentsTab` form stack inside manager-v2, which does not match the updated `references/Edit Gathering Environment.png` reference. This corrective slice replaces the visible edit surface with a purpose-built manager-v2 environment editor while preserving the existing admin-store draft, validation, dirty confirmation, and save/cancel contracts.

### Current-State Findings

- [ ] The current screenshot `test-results/screenshot-22-manager-v2-environments-edit-first-state.png` shows duplicate manager-v2 and legacy headings, a legacy `Gathering Environments` title inside the edit route, old fantasy display typography, and legacy buttons such as `+ New Environment` and `Back to environments` inside the editor body.
- [ ] The current editor first visible state shows environment name/selection/description/scene UUID fields, but task authoring is mostly below the fold; the reference keeps task list, active task editor, and validation/evidence visible together.
- [ ] The current route uses a generic right inspector separate from the editor, while the reference uses an integrated evidence column with environment summary, validation, and selected-task summary.
- [ ] The current scene workflow emphasizes manual Scene UUID fields and fallback art; the reference emphasizes a linked scene image/card with open/replace/unlink actions and linked-state evidence.
- [ ] The current task sections are long stacked `<details>` blocks. The reference uses selected-task tabs/segments so details, results, catalysts, rewards/visibility/timing are reachable without scanning a long form.
- [ ] The current validation summary is a legacy inline block near the top of the form. The reference groups validation by task/warning in the evidence column and provides quick task links.

### Design Target

- [ ] Use `references/Edit Gathering Environment.png` as the visual target for hierarchy, density, and layout.
- [ ] Keep written OpenSpec semantics above the image when they conflict. Do not add unsupported `biome`, `rarity`, travel/map, standalone harvesting, ingredient-set gathering, or invented timestamp data.
- [ ] Preserve data-backed linked scene imagery in the first visible state. Fallback icons are acceptable only for fixtures without resolvable scene imagery.
- [ ] Keep the top manager-v2 shell concise: breadcrumb, `Edit Environment`, one-line description, dirty indicator, `Cancel`, and primary `Save Environment`.
- [ ] Add an environment details band under the header with `Environment Details` and `Advanced` tabs or segmented controls.
- [ ] Put name, description, enabled/available state, selection mode, scene card, and player visibility/availability controls in this band.
- [ ] Treat raw scene UUID as advanced/recovery evidence, not the primary scene workflow.
- [ ] Use a main work grid at normal widths: left task list, center selected-task editor, right evidence/validation column.
- [ ] Collapse that grid predictably at narrow Foundry widths: environment details, task list, selected-task editor, then evidence/validation.

### Architecture And File Plan

- [ ] Do not continue mounting `EnvironmentsTab` as the visible manager-v2 edit surface in `CraftingSystemManagerV2Root.svelte`.
- [ ] Keep `EnvironmentsTab` for the current admin tab until a separate replacement is approved.
- [ ] Add a manager-v2 editor component under `src/ui/svelte/apps/manager-v2/`, for example `EnvironmentEditView.svelte`, with named props/callbacks matching the existing environment editor surface.
- [ ] Add manager-v2 child components with narrow responsibilities, likely:
  - `EnvironmentEditHeader.svelte` or route-local header actions if not kept in root
  - `EnvironmentDetailsPanel.svelte`
  - `EnvironmentSceneCard.svelte`
  - `EnvironmentTaskRail.svelte`
  - `EnvironmentTaskEditor.svelte`
  - `EnvironmentTaskTabs.svelte`
  - `EnvironmentEvidenceColumn.svelte`
  - `EnvironmentValidationPanel.svelte`
- [ ] Reuse existing environment child components only where their markup can be made v2-compatible without dragging in the legacy stacked layout. Good candidates are field-level controls and result/catalyst row editors; weak candidates are the legacy `EnvironmentFields`, `TaskList`, and full `EnvironmentsTab` structure.
- [ ] Extract shared behavior from `EnvironmentsTab.svelte` into a small JS helper module only if duplication becomes meaningful, for example validation target normalization, task summary derivation, section/tab mapping, and field path helpers. Keep the helper UI-free.
- [ ] Keep all mutations delegated through existing callbacks: `updateEnvironmentDraft`, task update/select/add/duplicate/delete/move, result group/result/catalyst updates, visibility/result-selection/progressive/check/time/failure updates, `saveEnvironmentDraft`, and `cancelEnvironmentDraft`.
- [ ] Keep presentational Svelte free of direct `game`, `ui`, `Hooks`, and `CONFIG` references.

### Editor Interaction Plan

- [ ] On route entry, selected environment draft is active and the task rail selects the store-selected task or first valid task.
- [ ] Top `Cancel` delegates to `cancelEnvironmentDraft`; if clean, it can return to browse without prompting; if dirty, keep store-owned behavior.
- [ ] Top `Save Environment` delegates to `saveEnvironmentDraft` and uses existing validation state/focus behavior.
- [ ] Task rail rows show validity icon, enabled/disabled state, task name, concise resolution/time label, and action menu.
- [ ] Add Task remains in the task rail header. Reorder affordance should be visually present even if actual drag/drop remains a later step; move actions must remain available through menus/buttons.
- [ ] Selected-task tabs map to existing data:
  - `Task Details`: name, description, image, enabled, resolution mode.
  - `Results`: routed result selection, result groups, result rows.
  - `Catalysts`: catalyst rows and degradation fields.
  - `Visibility`: visibility gate provider/formula/threshold/macro fields.
  - `Timing`: time requirement, repeatability-equivalent supported fields if backed, and failure outcome.
  - `Advanced`: progressive award/check fields and raw/stale references where needed, or combine progressive/check into `Task Details` when the task mode makes it primary.
- [ ] Switching validation links selects the relevant task and tab before focusing the invalid field.
- [ ] The right evidence column shows environment summary, validation grouped by error/warning, and selected task summary. It should not duplicate every row action already in the task rail.

### Styling Plan

- [ ] Add manager-v2-scoped CSS under `.fabricate-manager-v2`, not broad `.fabricate-admin` rules.
- [ ] Avoid card-in-card stacking. Use full-width bands/panels for the environment-details band and repeated task/evidence cards only where the reference uses compact panels.
- [ ] Use restrained dark surfaces, clear borders, green active/valid states, amber dirty/warning states, red invalid states, and no gradients.
- [ ] Normalize form controls to manager-v2 sizing. Current purple-ish Foundry input defaults visible in screenshots must be overridden in the manager-v2 editor.
- [ ] Ensure the task rail, center editor, and right evidence column have stable min/max widths at `1200x790`.
- [ ] At `1000x700`, stack before horizontal overflow and keep `Save Environment`, `Cancel`, validation, selected task, result/catalyst controls, and scene card reachable.

### Test Plan

- [ ] Add/extend mounted manager-v2 tests for route structure: no legacy `Gathering Environments` inner heading, no `+ New Environment` button inside edit body, no legacy grid/list inside `environment-edit`.
- [ ] Add mounted tests for environment-details band controls writing through existing callbacks.
- [ ] Add mounted tests for task rail selection, add, duplicate, delete, move actions, and active/invalid task states.
- [ ] Add mounted tests for task tabs preserving edits through existing callbacks.
- [ ] Add mounted tests for validation links selecting task + tab and preserving first-invalid focus.
- [ ] Add layout tests for normal grid geometry, evidence column presence, form control sizing, no horizontal overflow, and narrow stacking.
- [ ] Keep existing `EnvironmentsTab` tests passing for the current admin.
- [ ] Add source/contract tests preventing `manager-v2` from importing Foundry globals and preventing the edit route from mounting the full legacy `EnvironmentsTab` as its visible editor.

### Playwright Smoke Plan

- [ ] Update Foundry smoke screenshots:
  - `manager-v2-environments-edit-first-state` must show environment details band, task rail, selected-task editor, and evidence column in the first viewport.
  - `manager-v2-environments-edit-validation` must show grouped validation in the right evidence column and an invalid selected task.
  - `manager-v2-environments-edit-results` must show result group/result authoring in the center editor.
  - `manager-v2-environments-edit-catalysts` must show catalyst authoring in the center editor.
  - `manager-v2-environments-edit-stacked` must show narrow layout with primary actions and validation reachable.
- [ ] Use linked scene fixture imagery in the first-state screenshot, not fallback leaf art.
- [ ] Add pointer hit tests for top save/cancel, scene open/replace/unlink or equivalent supported actions, environment detail tabs, task rail rows, task action menu, task tabs, result/catalyst add/delete controls, validation links, and narrow layout controls.
- [ ] Validate with focused component/layout tests, `npm test`, `npm run build`, and `npm run test:foundry`.

### Review Gates

- [ ] Before implementation, run a UX/design review of this corrective plan against `references/Edit Gathering Environment.png`.
- [ ] After implementation, run a reviewer pass focused on behavior preservation and dirty/validation semantics.
- [ ] Run a UX pass comparing the new screenshots against the reference before marking the editor acceptance criteria complete.

## Future Implementation Sequence

- [ ] Add manager-v2 app wrapper and root component behind an explicit launch path or setting.
- [ ] Add manager-v2 design-system primitives: shell, side rail, toolbar, data table, inspector, chip, action menu, icon button, and status toggle.
- [ ] Build the systems manager-v2 view using existing system data and actions.
- [ ] Build the components browser/editor manager-v2 view using existing component, tag, essence, source, usage, and salvage data/actions.
- [ ] Build the tags/categories manager-v2 view using existing item-tag and recipe-category data/actions.
- [ ] Build the recipes browser and recipe editor manager-v2 views using existing recipe data and actions.
- [ ] Build the essences browser/editor manager-v2 view using existing essence data and actions.
- [ ] Build the environments manager-v2 browse/edit route using existing environment data and actions.
- [ ] Migrate additional admin tabs to manager-v2 presentation patterns while preserving behavior.
- [ ] Add localized strings for all new labels, tooltips, headers, chips, empty states, and inspector actions.
- [ ] Add focused component and store-contract tests.
- [ ] Run full validation gates before implementation sign-off.

## UI Acceptance Criteria

### Corrective Implementation Plan: Selected-System Navigation Polish

- [x] Route the selected-system breadcrumb to the in-place System settings view.
- [x] Keep System settings as the first selected-system left-nav item regardless of feature gating.
- [x] Render the selected-system rail scope as a clear-selection button with a non-danger `x` affordance.
- [x] Clear the real selected-system store state when the rail scope button is activated.
- [x] Preserve visible manager-v2 focus styling without host orange/red outlines.

- [x] Normal-width manager-v2 systems view matches the reference hierarchy: left rail, central table, right inspector, compact header, search/filter toolbar, selected row, and quick actions.
- [x] Normal-width environments view matches the reference hierarchy: feature rail, environment table, image-backed inspector, filters, and quick actions.
- [x] Normal-width recipes browser matches the reference hierarchy: system rail, recipe table, selected recipe inspector, requirements preview, filters, import/export, and quick actions.
- [x] System Edit opens inside manager-v2 from the systems row Edit action, shows name, description, resolution mode, advanced options, and optional feature toggles, and returns to the systems browser without launching the current admin.
- [ ] Components view matches the reference hierarchy: drop-to-add import, explicit component/recipe-item drop action where applicable, filters, table, tags, essences, usage legend, source states, selected component inspector, and quick actions.
- [ ] Tags/categories view matches the reference hierarchy while preserving Fabricate semantics: system item tags, flat recipe categories, reserved `General`, usage counts, cleanup actions, impact warnings, feature-disabled states, and right guidance/summary panels.
- [ ] Recipe editor matches the reference shell while exposing Fabricate recipe semantics: overview, steps/ingredients, result groups, mode-aware resolution, visibility, advanced, and live evidence column.
- [ ] Resolution tab separates crafting check from successful result selection, supports provider-specific mapping/guidance, and keeps failure outcome distinct from success result groups.
- [ ] Visibility tab adapts to system-owned global, player, knowledge, and alchemy modes; shows linked recipe item workflows only when relevant; and uses effective visibility, validation, example scenarios, and docs panels backed by real mode data.
- [ ] Steps / Ingredients tab preserves compact step cards, ingredient-set cards, active set editor, group blocks, typed option rows, compact OR dividers, mapped-result chips, collapsed requirement summaries, left-side validation, and right-side Components/Essences/Tags source palette with search, filters, drag target, and drag/drop behavior.
- [ ] Essences view matches the reference hierarchy: system rail, essence table, source item linking, selected essence inspector, usage summary, warnings, filters, import/export, and quick actions.
- [ ] Actor Crafting app simple state matches the reference hierarchy: shared actor/source header, mode tabs, active/history bands, shopping list, searchable recipe list, selected-recipe inspector, and reachable start/continue/details actions.
- [ ] Actor Crafting app complex state matches the reference hierarchy while preserving Fabricate semantics: compact row summaries, complexity chips, craft-plan inspector, path selector, ingredient groups/options, source allocation, optional essences/catalysts, outcome evidence, and multi-step timeline.
- [ ] Actor Alchemy app matches the reference hierarchy while preserving hidden-recipe rules: shared actor/source header, alchemy system selector, component palette, central workbench, discovered recipes panel, selected discovered-recipe detail, active/history bands, auto-fill, and attempt feedback.
- [ ] Environment editor shows compact object context, tabs/workflow, primary resource/result authoring, and live evidence column.
- [ ] Environments browse/edit Playwright smoke artifacts prove linked scene image fidelity, first visible state, alignment, clipping, scroll containment, visible controls, responsive widths, and live pointer hit-tests.
- [x] All image-backed screenshots include representative linked images, not only fallback icons.
- [x] Narrow layouts stack without horizontal overflow and keep primary actions, selected object, validation, and save/cancel reachable.
- [x] Pointer hit tests cover row selection, row action menus, toggles, search/filter controls, view toggles, primary actions, and inspector quick actions.
- [x] Focus-visible states remain clear after styling.

## Corrective Implementation Plan: Edit Essence View

- [x] Review [Edit Essence](<references/Edit Essence.png>) against current essence browser implementation and Fabricate essence semantics.
- [x] Update the manager-v2 UI delta and canonical UI integration spec so browse essences is browse-only and editing moves to a dedicated route.
- [ ] Add a manager-v2 `edit-essence` route with breadcrumb trail `Crafting Systems > {system} > Essences > Edit Essence`.
- [ ] Change essence row Edit and inspector Edit actions to select the essence and open the `edit-essence` route instead of toggling inline edit controls.
- [ ] Remove inline edit state and controls from the browse essences page; retain row selection, filters, source-state evidence, usage evidence, and non-inline actions.
- [ ] Build a focused edit essence component owned by the manager-v2 route. It should expose identity fields, dirty-state tracking, save/cancel, validation, and route-exit protection using existing admin-store essence actions.
- [ ] Use the existing icon picker as a pop-over for essence icon selection; do not expose raw icon class entry as the primary edit control.
- [ ] Show all source UI only when the selected system has `features.effectTransfer === true`; hide source columns, filters, source item card, source inspector sections, drop zone, replace/clear controls, and source warnings when effect transfer is disabled.
- [ ] When effect transfer is enabled, source selection must use picker and drag/drop flows, preserve stale source evidence, and surface whether the linked source resolves and can provide effects.
- [ ] Preserve the right evidence rail from the reference: identity preview, details/usage/source evidence where applicable, validation, duplicate/delete actions, and no unsupported decorative metrics.
- [ ] Update localization, mounted tests, layout tests, and Foundry/Playwright smoke coverage for browse-only essences, edit-route navigation, pop-over icon picker, conditional source panel, dirty save/cancel, and responsive screenshots.

## Verification For This Planning Change

- [x] `git diff --check -- openspec/changes/fabricate-ui-design-system-manager-v2`
- [x] Manual review of `design-system.md`, `design.md`, and `specs/ui-integration/spec.md` against the systems, environments, recipe browser, recipe editor, and essence input images.

## Future Implementation Validation

- [x] Focused component tests for new manager-v2 views.
- [x] Existing current-manager tests continue to pass.
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:foundry` for final screenshot and pointer validation.

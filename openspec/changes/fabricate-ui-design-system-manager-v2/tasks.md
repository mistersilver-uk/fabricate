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
- [x] Keep selected essence source evidence readable in the inspector by separating source thumbnail/copy from the unlink action row.
- [x] Move selected essence source actions below the linked item card, add copy source UUID, and style unlink as amber destructive.

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

## Concrete Implementation Plan: Design-System Token Foundation

Phase 1 of the manager-v2 audit follow-up. The agreed design-system tokens were never declared at stylesheet root; manager-v2 only had its private `--fab-mv2-*` namespace with hard-coded hex/rgba and px values. This slice establishes the canonical token layer at `:root` so future polish work can consume `var(--fab-accent)`, `var(--fab-space-3)`, etc., as the source of truth.

- [x] Declare the full `design-system.md` token set at `:root` in `styles/fabricate.css`: `--fab-bg-0..3`, `--fab-surface`, `--fab-surface-soft`, `--fab-surface-raised`, `--fab-border[-strong]`, `--fab-text[-muted/-subtle]`, `--fab-accent[-hover/-strong/-soft]`, `--fab-info[-soft]`, `--fab-warning[-soft]`, `--fab-danger[-soft]`, `--fab-purple[-soft]`, `--fab-space-1..6`.
- [x] Keep manager-v2 internal `--fab-mv2-*` token values unchanged in this slice so existing screenshot baselines, hard-coded color assertions, and rendered hierarchy do not shift unexpectedly.
- [x] Add a focused CSS contract test asserting every spec-required token is present in the `:root` declaration.
- [x] Validate with `npm test` and `npm run build`.

### Token Foundation Scope Decisions

- [x] Declare globals additively. Do not migrate manager-v2 internal tokens to consume globals in this slice; that is a follow-up that needs intentional screenshot baseline updates.
- [x] Do not redefine Foundry's existing `--fabricate-primary/success/warning/danger/dark/light` tokens.
- [x] Do not extend tokens beyond what `design-system.md` specifies.

## Concrete Implementation Plan: Tags & Categories Evidence Panels

Phase 2 first slice. The reference [Edit Crafting System Tags and Categories](<references/Edit Crafting System Tags and Categories.png>) shows a richer right rail than the manager-v2 implementation: `How it works` guidance, `System Summary`, `Examples`, and a documentation link. The corrected spec § Tags And Categories Editors permits these *as long as they reflect Fabricate semantics*. The shipped inspector had only the intro card, vocabulary counts, and General hint. This slice adds two new evidence cards that surface real Fabricate semantics without inventing data.

- [x] Add a `How it works` inspector card with three flat-language bullets explaining flat categories, reserved General, and item-tag references on components plus tag-placeholder ingredients.
- [x] Add an `Examples` inspector card that surfaces the most-used custom category (excluding General) and the most-used item tag derived from real `categoryRows` / `tagRows` usage data.
- [x] Render an empty-state hint inside the `Examples` card when no usage references exist yet.
- [x] Localize all new copy under `FABRICATE.Admin.ManagerV2.TagsCategories.*`, including singular/plural variants for the example strings.
- [x] Add `manager-v2-evidence-list` styling for compact bulleted lists inside inspector cards.
- [x] Extend the existing tags/categories mounted test to assert the new evidence cards render and contain the expected explanatory copy.
- [x] Validate with `npm test` and `npm run build`.

### Tags & Categories Evidence Scope Decisions

- [x] Do not add a documentation link card until the canonical docs URL exists.
- [x] Do not invent hierarchical, multi-category, or category-description content.
- [x] Top-used examples must be derived from real `tagCategoryUsage` data; never invented or seeded with placeholders.
- [x] Singular/plural variants must remain literal copy; do not introduce a templating dependency.

## Concrete Implementation Plan: Recipe Inspector Polish

Phase 2 second slice. The reference [Browse Recipes](<references/Browse Recipes.png>) shows the selected-recipe inspector with a prominent hero image, a fact grid for category/structure, a requirements list, and a clearly green primary `Edit Recipe` CTA followed by secondary `Duplicate` and `Delete Recipe` actions. The shipped inspector had the right structure but rendered Edit/Duplicate/Delete as three identical neutral buttons and used a small 44px hero. This slice tightens the visual hierarchy without introducing any new derived data or persistence path.

- [x] Promote `Edit recipe` to the primary inspector action with green fill (`is-primary`); keep `Duplicate recipe` neutral and `Delete recipe` danger.
- [x] Add a `is-hero-large` modifier to the recipe inspector title row so the recipe preview renders at a more prominent 56px square (matching the mock's hero weighting).
- [x] Add explicit `.manager-v2-recipe-preview` CSS so the recipe image consistently uses the manager-v2 border, radius, and `object-fit: cover` treatment.
- [x] Add `data-recipe-fact` and `data-recipe-action` attributes to the inspector facts and action buttons for testability without coupling to copy.
- [x] Extend the recipes-browser mounted test to assert the primary Edit CTA, the new hero modifier, and the structure/result-groups facts render as expected.
- [x] Validate with `npm test` and `npm run build`.

### Recipe Inspector Polish Scope Decisions

- [x] Do not add ingredient-image rows to the requirements list; the spec keeps the requirements preview as execution-step summaries derived from existing data, not per-ingredient images.
- [x] Do not invent recipe fields (difficulty, craft time, last updated, output quantity) that the reference image shows but the recipe contract does not back.
- [x] Do not change the recipe action callbacks; Edit continues to delegate through `services.onEditRecipe` to the legacy editor as the spec requires for this slice.
- [x] The `is-hero-large` title-row modifier is reusable. Future inspector polish (Components, Essences, Systems) may opt into it but this slice does not retro-apply it elsewhere.

## Concrete Implementation Plan: Component Inspector Polish

Phase 2 third slice. The reference [Browse Components](<references/Browse Components.png>) shows the selected-component inspector with a prominent hero image, a Component / Usage / Source structure, and a green primary `Edit Component` CTA paired with a `Delete Component` danger action. The shipped inspector had the right sections (identity, tags, essences, source, usage evidence, actions) but rendered Edit and Delete as identical neutral buttons and used a small 44px hero. This slice tightens visual hierarchy and adds testable section markers without adding any new derived data, persistence path, or callback.

- [x] Apply the existing `is-hero-large` modifier to the components inspector title row so the component preview gets the same 56px hero weighting as recipes.
- [x] Promote `Edit component` to the primary inspector action (`is-primary`); keep `Delete component` danger.
- [x] Consolidate the recipe and component preview CSS into a single multi-selector rule so future image-led inspectors share the same 56px square treatment.
- [x] Add `data-component-section` markers (`tags`, `essences`, `source`, `usage`) and `data-component-action` markers (`edit`, `delete`, `copy-source`) for testability without coupling tests to copy.
- [x] Extend the components-browser mounted test to assert the primary Edit CTA, the new hero modifier, and the source section render as expected.
- [x] Validate with `npm test` and `npm run build`.

### Component Inspector Polish Scope Decisions

- [x] Do not add a `Duplicate component` action; the spec restricts manager-v2 component callbacks to drop import, edit, copy source UUID, and delete. Duplicate would need a new admin-store action.
- [x] Do not add Component / Usage / Source as interactive tabs; the spec permits sections-or-lightweight-tabs and the existing section stack already meets the readability target.
- [x] Do not invent component fields (last used, owner, progressive difficulty when not data-backed) that the reference image shows but the current admin store does not provide.
- [x] Preserve unresolved source UUID display; never delete or hide stale source evidence.

## Concrete Implementation Plan: Essence Inspector Polish

Phase 2 fourth slice. The reference [Browse Essences](<references/Browse Essences.png>) shows the selected-essence inspector with a prominent icon hero, status chips, source/usage sections, and a green primary `Edit Essence` CTA paired with a `Delete Essence` danger action. The shipped browse-mode inspector had the right sections (identity, source evidence under the effect-transfer gate, usage with component thumbnail grid, deletion-blocked notice, browse actions) but used a 44px icon container and rendered Edit/Delete as identical neutral buttons.

- [x] Apply `is-hero-large` to the essence inspector title row so the icon container gets a 56px hero treatment, with a slightly larger icon glyph inside.
- [x] Promote `Edit essence` to the primary inspector action (`is-primary`) in the browse view; keep `Delete essence` danger and preserve the existing usage-blocked disabled state.
- [x] Reuse the existing `manager-v2-inspector-icon` rule by adding an additive `.is-hero-large` modifier so other icon-led inspectors can opt in without a new selector family.
- [x] Add `data-essence-section` markers (`source`, `usage`) and `data-essence-action` markers (`edit`, `delete`) for testability without coupling tests to copy.
- [x] Extend the essences-browser mounted test to assert the primary Edit CTA, the new hero modifier, and the Usage section render as expected.
- [x] Validate with `npm test` and `npm run build`.

### Essence Inspector Polish Scope Decisions

- [x] Keep the source-evidence section gated by `showEssenceSourceUi` (which mirrors `features.effectTransfer === true`); do not surface source UI when effect transfer is disabled.
- [x] Do not add `Edit essence` / `Delete essence` to the `essence-edit` route inspector; the route owns its own save/cancel header strip.
- [x] Do not invent author, created/updated timestamps, or rarity fields when current admin data does not back them.
- [x] Preserve the deletion-blocked disabled state and the in-use chip; visual hierarchy changes must not bypass usage protection.

## Concrete Implementation Plan: Systems Inspector Polish

Phase 2 fifth slice. The reference [Browse Crafting Systems](<references/Browse Crafting Systems.png>) and the design § Systems inspector both call for an `icon, name, resolution, enabled state, description, counts, and enabled features` summary in the right inspector. The shipped inspector had counts, features, and identity, but the prior corrective slice removed the icon entirely (because it was disrupting layout) and the identity card became a plain text block. This slice restores icon presence using the new `is-hero-large` modifier so the icon contributes visual scan-anchor without the disruptive layout it caused before.

- [x] Apply `manager-v2-inspector-title-row.is-hero-large` to the systems inspector identity card (both the regular `selectedSystem` view and the `system-edit` view).
- [x] Render a `manager-v2-inspector-icon.is-hero-large` `fa-layer-group` glyph that mirrors the system row icon family.
- [x] Drop the now-redundant `manager-v2-system-inspector-heading` wrapper in favour of the shared title-row grid.
- [x] Preserve the corrective-slice rules: keep counts, enabled features, and the legacy-fallback action card; do not reintroduce a `Quick actions` card or duplicate row commands.
- [x] Extend the systems-shell mounted test to assert the prominent hero title row + icon render in the inspector.
- [x] Validate with `npm test` and `npm run build`.

### Systems Inspector Polish Scope Decisions

- [x] Do not invent a system image field; the current admin store does not expose one. The shared icon glyph stays the canonical visual until a future slice adds image support to the system data model.
- [x] Do not reintroduce a separate `Quick actions` card on the systems inspector. Edit, Duplicate, Export, and Delete remain available inline on each row and in the application header.
- [x] Do not retro-apply hero treatment to the no-systems setup card; that surface intentionally uses a different first-run shape.
- [x] Keep the legacy-fallback `Open current admin` button on the `system-edit` inspector during additive rollout.

## Concrete Implementation Plan: Toolbar And Action Chrome Polish

Phase 3 first slice. The mock toolbars include a `Clear Filters` affordance that is missing from the shipped manager-v2 toolbars; clear actions only existed inside empty-state messages. The mock action buttons also use semantic hover treatments — primary green deepens, danger red tints — while the shipped buttons uniformly used a generic white hover tint that overrode the semantic colors. This slice closes both gaps.

- [x] Add a `manager-v2-clear-filters` button to the systems, recipes, components, environments, and essences toolbars; render only when at least one filter (search or any select) is non-default.
- [x] Add per-route `$derived` flags (`systemFiltersActive`, `recipeFiltersActive`, `componentFiltersActive`, `environmentFiltersActive`, `filtersActive` in EssenceBrowserView) that key the visibility.
- [x] Add a `clearSystemFilters` action that resets the systems route's local search and status filter; existing `clearRecipeFilters`, `clearComponentFilters`, `clearEnvironmentFilters`, and `clearSearch` (essences) continue to own the per-route reset.
- [x] Replace the recipes route's `bind:value` selects with the same explicit `value=` + `onchange=` pattern used by components so `change`-event-based test interactions exercise reactivity consistently.
- [x] Add semantic hover treatments to manager-v2 buttons: `.manager-v2-button.is-primary:hover` deepens the green; `.manager-v2-button.is-danger:hover` and `.manager-v2-icon-button.is-danger:hover` use a red soft tint instead of the generic white tint.
- [x] Style `.manager-v2-clear-filters` as an outline-only secondary affordance right-aligned via `margin-left: auto` so it never competes with primary create/import actions.
- [x] Localize `FABRICATE.Admin.ManagerV2.ClearFilters`.
- [x] Extend the recipes-browser mounted test to assert the Clear filters button shows/hides correctly and resets the filter state.
- [x] Validate with `npm test` and `npm run build`.

### Toolbar And Action Chrome Polish Scope Decisions

- [x] Clear filters resets local route filter state only; it does not call any new admin-store mutator and does not change the existing `setRecipeSearch` / `setItemSearch` contracts.
- [x] Hover treatments use literal rgba values that resolve to the manager-v2 internal accent/danger family. Migrating to `var(--fab-accent-soft)` etc. is reserved for the future global-token migration slice.
- [x] Do not retro-apply the toolbar Clear-filters button to the Tags & Categories view; that view's vocabulary panels manage their own search/feedback state and the spec does not call for this affordance there.
- [x] Do not introduce pagination footers in this slice; row counts in current fixtures stay below typical page-size thresholds and the existing `{shown} of {total}` count chip already provides scan evidence.

## Concrete Implementation Plan: SystemEditView Extraction

Phase 4 first slice. The 2,785-line `CraftingSystemManagerV2Root.svelte` inlines five route bodies while the other four (Essence browse + edit, Tags & Categories, Environment edit) live in dedicated `*View.svelte` files. The system-edit body is the smallest of the inline routes and a clean candidate for the first extraction; it has a moderate prop surface and no shared derivations beyond the existing `selectedSystem` data.

- [x] Add `src/ui/svelte/apps/manager-v2/SystemEditView.svelte` containing the previously inline system-edit form: identity card (name/description/resolution mode), advanced visibility toggle, optional features card.
- [x] Move the local form state (`systemNameValue`, `systemDescriptionValue`, `systemResolutionModeValue`), the `featureDefinitions` and `resolutionModeOptions` constants, and the form helpers (`handleSubmit`, `handleResolutionModeChange`, `handleToggleAdvancedOptions`, `handleToggleFeature`, `hasFeatureKey`) into the new component.
- [x] Define a clean prop surface: `selectedSystem` data plus four named callbacks (`onSaveDetails`, `onSetResolutionMode`, `onToggleAdvancedOptions`, `onToggleFeature`). No service grab-bag.
- [x] Mount `<SystemEditView ... />` in the root for the `system-edit` route, passing through admin-store calls via narrow inline arrow functions.
- [x] Delete the now-unused root state, the `$effect` that synced form values, the constants, the helper functions, and `hasFeatureKey` from `CraftingSystemManagerV2Root.svelte`.
- [x] Register the new file with the test harness (`writeCompiledSvelte` registration in `manager-v2-mounted.test.js`).
- [x] Update the source-contract test: combine `rootSource`, the existing extracted views, and the new `SystemEditView` source into a `managerV2Source` so feature-level invariants (form selectors, `mapped`/`tiered` resolution mode values, no-legacy-toggles) can be asserted against the manager-v2 surface as a whole rather than coupling them to a specific file.
- [x] Validate with `npm test` (2305/2305 pass) and `npm run build` (clean).

### SystemEditView Extraction Scope Decisions

- [x] Extract one route per slice. SystemsBrowserView, RecipesBrowserView, ComponentsBrowserView, and EnvironmentsBrowserView remain inline pending follow-up slices.
- [x] Pass admin-store callbacks through inline arrow functions in the mount call; do not pass the `store` reference into the view. Keeps the component's prop surface narrow and testable.
- [x] Preserve the existing form-state sync semantics: `$effect` re-syncs name/description/resolution-mode values whenever the underlying `selectedSystem` fields change, so external admin-store updates remain visible inside the form.
- [x] Do not change the form's accessible structure, IDs, names, or data attributes; existing layout and pointer tests continue to apply.
- [x] Do not introduce a new admin-store mutator; the four callbacks map 1:1 to `saveSystemDetails`, `setResolutionMode`, `toggleAdvancedOptions`, `toggleFeature`.

## Concrete Implementation Plan: SystemsBrowserView Extraction

Phase 4 second slice. The systems browser was the largest of the inline route bodies (~130 lines of markup plus filter state, derivations, and helpers). This slice promotes it to a dedicated `SystemsBrowserView.svelte` matching the existing extracted pattern.

- [x] Add `src/ui/svelte/apps/manager-v2/SystemsBrowserView.svelte` containing the systems table, search/status toolbar, status-toggle row controls, action buttons, and empty/no-match states.
- [x] Move local filter state (`searchTerm`, `statusFilter`) and derivations (`normalizedSearchTerm`, `filteredSystems`, `filtersActive`) into the view.
- [x] Move helper functions into the view: `text`, `stackedLabel`, `resolutionModeLabel` (small enough to duplicate without a shared util module), `isSelectedSystem`, `selectRow`, `selectRowFromKeyboard`, `clearFilters`, `toggleEnabled`.
- [x] Define a clean prop surface: `systems`, `selectedSystemId`, plus six named callbacks (`onSelectSystem`, `onCreateSystem`, `onEditSystem`, `onExportSystem`, `onDeleteSystem`, `onToggleSystemEnabled`).
- [x] Mount `<SystemsBrowserView ... />` in the root systems route and remove the now-unused `systemSearchTerm`, `systemStatusFilter`, `normalizedSystemSearchTerm`, `filteredSystems`, `systemFiltersActive`, `clearSystemFilters`, `selectSystemRowFromKeyboard`, `toggleSystemEnabled`, and `isSelectedSystem` from `CraftingSystemManagerV2Root.svelte`.
- [x] Register the new file with `manager-v2-mounted.test.js` `compileManagerV2Root` and append the source to `managerV2Source` in the contract test.
- [x] Update the contract assertions: shell-render checks for `manager-v2-systems-table` move to `systemsBrowserSource`; the localized `EditSystem` lookup moves to `managerV2Source`.
- [x] Validate with `npm test` (2305/2305 pass) and `npm run build` (clean).

### SystemsBrowserView Extraction Scope Decisions

- [x] Duplicate the small `text` / `stackedLabel` / `resolutionModeLabel` helpers in the new view rather than introducing a shared util module; the duplication is minimal and the view stays self-contained.
- [x] Pass `selectSystemRow` through `onSelectSystem` so the root keeps owning the `selectSystem(id, 'systems')` route-confirm semantics; do not call `store.selectSystem?.` directly from the view.
- [x] Preserve all existing data attributes, ARIA labels, and CSS class names so layout and mounted tests continue to pass without modification.
- [x] Do not introduce a new admin-store mutator. `onToggleSystemEnabled` maps directly to `store.toggleSystemEnabled?.` via the inline arrow function in the mount.

## Concrete Implementation Plan: RecipesBrowserView Extraction

Phase 4 third slice. The recipes browser was the next-most-complex inline route after the systems table. It owns its own status + category filter state, derives a filtered list, calls into the admin-store search contract, and exposes per-row actions for edit / duplicate / delete / toggle-enabled. This slice promotes it to a dedicated `RecipesBrowserView.svelte` while keeping the recipe inspector aside in the root.

- [x] Add `src/ui/svelte/apps/manager-v2/RecipesBrowserView.svelte` containing the recipes table, search/status/category filter toolbar, status toggles, action buttons, and empty/no-match states.
- [x] Move local filter state (`statusFilter`, `categoryFilter`) and derivations (`filteredRecipes`, `filtersActive`) into the view.
- [x] Duplicate the small recipe-table helpers (`text`, `stackedLabel`, `recipeImage`, `ingredientCount`, `catalystCount`, `formatCount`, `stepRequirementSummary`, `requirementsSummary`, `structureLabel`, `isSelectedRecipe`) inside the view; the root keeps its own copies for the inspector aside.
- [x] Define a clean prop surface: `recipes`, `recipeCategories`, `recipeSearchTerm`, `selectedRecipeId`, `showRecipeCategories`, `selectedSystemName`, plus seven named callbacks (`onSearchChange`, `onSelectRecipe`, `onCreateRecipe`, `onEditRecipe`, `onDuplicateRecipe`, `onDeleteRecipe`, `onToggleEnabled`).
- [x] Mount `<RecipesBrowserView ... />` in the root recipes route and remove the now-unused `recipeStatusFilter`, `recipeCategoryFilter`, `recipeFiltersActive`, `filteredRecipes`, `setRecipeSearch`, `clearRecipeSearch`, and `clearRecipeFilters` from `CraftingSystemManagerV2Root.svelte`.
- [x] Adjust the root's `selectedRecipe` derivation to fall back to the first recipe in `$viewState.recipes` instead of the previously-filtered list. The inspector preview keeps showing the active recipe even when filters change in the table; auto-selection of the first recipe on first render is preserved.
- [x] Register the new file with `manager-v2-mounted.test.js` `compileManagerV2Root` and append the source to `managerV2Source` in the contract test.
- [x] Update the contract assertions: shell-render checks for `manager-v2-recipes-table`, `manager-v2-recipe-row`, `manager-v2-recipe-identity`, and `manager-v2-recipe-status` move to `recipesBrowserSource`.
- [x] Validate with `npm test` (2305/2305 pass) and `npm run build` (clean).

### RecipesBrowserView Extraction Scope Decisions

- [x] Search remains a store-owned contract; the view receives the current `recipeSearchTerm` and emits debounced-style updates via `onSearchChange`. Do not let the view mirror the search term in local state.
- [x] Auto-selection fallback runs against the unfiltered `$viewState.recipes` rather than the view-local filtered list. Hiding the selected recipe via filters does not deselect it; the inspector keeps the previous selection until the user picks another row.
- [x] Duplicate the recipe-table helper functions inside the view rather than extracting a shared util module; the duplication is contained and the inspector still needs them in the root.
- [x] Do not introduce a new admin-store mutator. `onSearchChange`, `onToggleEnabled` map directly to `store.setRecipeSearch?.` and `store.toggleRecipeEnabled?.`; `onCreateRecipe`, `onEditRecipe`, `onDuplicateRecipe`, `onDeleteRecipe` go through the existing root helpers that already wrap admin-store and service callbacks.

## Concrete Implementation Plan: ComponentsBrowserView Extraction

Phase 4 fourth slice. The components browser was the third-largest inline route. It carries a triple filter (source, tag, essence), drop-zone wiring with a Foundry drag/drop action, the `componentTableClass` derivation, and a per-row evidence column with source-state, salvage, and usage-count helpers. The view-internal filter state must auto-reset when the selected system changes so hidden facets do not silently filter away a different system's components.

- [x] Add `src/ui/svelte/apps/manager-v2/ComponentsBrowserView.svelte` containing the components table, drop-zone, search/source/tag/essence toolbar, action buttons, and empty/no-match states.
- [x] Move local filter state (`sourceFilter`, `tagFilter`, `essenceFilter`) and derivations (`filteredComponents`, `filtersActive`, `componentTagOptions`, `componentEssenceOptions`, `showComponentTags`, `showComponentEssences`, `componentTableClass`) into the view.
- [x] Duplicate the row-level helpers (`text`, `stackedLabel`, `componentImage`, `uniqueSorted`, `componentSourceState`, `componentEvidenceItems`, `usageEvidenceItems`, `salvageSummaryLabel`, `isSelectedComponent`) inside the view; the root keeps its own copies for the inspector aside.
- [x] Move the `dragDrop` action import and drop-zone markup into the view; remove the now-unused `dragDrop` import from `CraftingSystemManagerV2Root.svelte`.
- [x] Add a `selectedSystemId` prop and an `$effect` that resets the three local filters whenever it changes, preserving the previous root-side reset behavior.
- [x] Define a clean prop surface: `itemCards`, `totalComponentsCount`, `itemSearchTerm`, `selectedComponentId`, `selectedSystemName`, `selectedSystemId`, `dropEnabled`, plus six named callbacks (`onSearchChange`, `onSelectComponent`, `onDropComponent`, `onEditComponent`, `onDeleteComponent`, `onCopySourceUuid`).
- [x] Mount `<ComponentsBrowserView ... />` in the root components route and remove the now-unused `componentSourceFilter`, `componentTagFilter`, `componentEssenceFilter`, `componentFiltersActive`, `componentTagOptions`, `componentEssenceOptions`, `componentTableClass`, `filteredComponents`, `setComponentSearch`, `clearComponentFilters`, and `isSelectedComponent` from `CraftingSystemManagerV2Root.svelte`.
- [x] Adjust the root's `selectedComponent` derivation to fall back to the first item in `itemCards` instead of the previously-filtered list, mirroring the recipe pattern.
- [x] Trim the system-change reset effect to only clear `selectedComponentId`; filter resets now live inside the view.
- [x] Register the new file with `manager-v2-mounted.test.js` `compileManagerV2Root` and append the source to `managerV2Source` in the contract test.
- [x] Update the contract assertions: `manager-v2-component-drop-zone`, `componentTableClass`, `manager-v2-component-row`, `manager-v2-component-identity` move to `componentsBrowserSource`.
- [x] Validate with `npm test` (2305/2305 pass) and `npm run build` (clean).

### ComponentsBrowserView Extraction Scope Decisions

- [x] The view owns drop-zone wiring through `dragDrop` directly; the root no longer imports the action. Drop intent stays a callback (`onDropComponent`) so the root continues to delegate to `services.onDropItem` without exposing the service through the view.
- [x] System-change filter reset moved from a root `$effect` to a view-local `$effect` keyed on `selectedSystemId`. Behavior is identical from the user's perspective: switching systems clears stale tag/essence/source filters before the next render.
- [x] Auto-selection fallback runs against unfiltered `itemCards`, mirroring the recipes browser change. The inspector keeps the active selection even when filters hide it.
- [x] Duplicate the component-evidence helpers in the view rather than introducing a shared module. The inspector keeps its own copies; the duplication is contained.
- [x] Do not introduce a new admin-store mutator. `onSearchChange`, `onSelectComponent`, `onDropComponent`, `onEditComponent`, `onDeleteComponent`, `onCopySourceUuid` map directly to existing store/service callbacks via inline arrow functions in the mount.

## Concrete Implementation Plan: EnvironmentsBrowserView Extraction

Phase 4 fifth slice (final). The environments browser was the last inline route in the root. It carries six filters (status, selection mode, risk, region, biome, search), draft-aware row rendering via `environmentDisplay`, dirty/invalid badge derivations, scene-image lookups against the selected system's `sceneOptions`, and per-row reorder controls.

- [x] Add `src/ui/svelte/apps/manager-v2/EnvironmentsBrowserView.svelte` containing the environments table, six-filter toolbar, status toggles, action grid + reorder stack, and loading/error/empty/no-match states.
- [x] Move local filter state (`searchTerm`, `statusFilter`, `selectionFilter`, `riskFilter`, `regionFilter`, `biomeFilter`) and derivations (`regionOptions`, `biomeOptions`, `normalizedSearchTerm`, `filteredEnvironments`, `filtersActive`) into the view.
- [x] Duplicate the environment helpers (`text`, `stackedLabel`, `uniqueSorted`, `linkedSceneForEnvironment`, `environmentName`, `environmentImage`, `hasEnvironmentSceneImage`, `environmentSelectionModeLabel`, `environmentTaskCount`, `environmentDirtyFor`, `environmentInvalidFor`, `environmentDisplay`, `environmentListIndex`, `canMoveEnvironmentUp`, `canMoveEnvironmentDown`) inside the view; the root keeps its own copies for the inspector aside.
- [x] Add a `selectedSystemId` prop and an `$effect` that resets the six local filters whenever it changes, preserving the previous root-side reset semantics.
- [x] Define a clean prop surface: `environments`, `environmentsLoading`, `environmentsError`, `environmentDraft`, `environmentDraftDirty`, `environmentValidationCount`, `selectedEnvironmentId`, `selectedSystemName`, `selectedSystemId`, `sceneOptions`, `shouldUseEnvironmentDraftForDisplay`, plus seven named callbacks (`onSelectEnvironment`, `onEditEnvironment`, `onCreateEnvironment`, `onDuplicateEnvironment`, `onDeleteEnvironment`, `onMoveEnvironment`, `onToggleEnvironmentEnabled`).
- [x] Mount `<EnvironmentsBrowserView ... />` in the root environments route and remove the now-unused `environmentSearchTerm`, `environmentStatusFilter`, `environmentSelectionFilter`, `environmentRiskFilter`, `environmentRegionFilter`, `environmentBiomeFilter`, `environmentRegionOptions`, `environmentBiomeOptions`, `normalizedEnvironmentSearchTerm`, `filteredEnvironments`, `environmentTableClass`, `environmentFiltersActive`, and `clearEnvironmentFilters` from `CraftingSystemManagerV2Root.svelte`.
- [x] Adjust the root's `selectedEnvironment` derivation to fall back to the first item in `environmentList` instead of the previously-filtered list, mirroring the recipes/components pattern.
- [x] Register the new file with `manager-v2-mounted.test.js` `compileManagerV2Root` and append the source to `managerV2Source` in the contract test.
- [x] Update the contract assertions: `class="manager-v2-main"` / `class="manager-v2-toolbar"` / `class="manager-v2-filter"` / `class="manager-v2-empty"` shell-render checks now run against `managerV2Source`; the `EnvironmentsBrowserView` import lookup runs against `rootSource`; the `manager-v2-status-toggle`, `Environment.EmptyTitle`, and `toggleSystemEnabled` lookups also move to view/aggregate sources where they now live.
- [x] Validate with `npm test` (2305/2305 pass) and `npm run build` (clean).

### EnvironmentsBrowserView Extraction Scope Decisions

- [x] Auto-selection fallback runs against unfiltered `environmentList`, mirroring the recipes/components pattern. The inspector keeps the active selection even when filters hide it.
- [x] System-change filter reset moves from the inline view's behavior into a view-local `$effect` keyed on `selectedSystemId`. Behavior is preserved for users.
- [x] Duplicate environment helpers in the view rather than introducing a shared module. The inspector keeps its own copies, including draft-aware `environmentDisplay`, scene-image lookup, and dirty/invalid badge logic.
- [x] Pass `shouldUseEnvironmentDraftForDisplay` from root to view so draft-vs-saved row rendering stays consistent. The view does not derive the boolean itself because it depends on `currentView === 'environment-edit'`, which only the root knows.
- [x] Do not introduce a new admin-store mutator. All seven callbacks map to existing root helpers (`selectEnvironment`, `editEnvironment`, `createEnvironment`, `duplicateEnvironment`, `deleteEnvironment`, `moveEnvironment`, `toggleEnvironmentEnabled`) which already wrap the canonical admin-store environment actions.

### Phase 4 Summary

- [x] All five inline route bodies extracted to dedicated `*View.svelte` files: `SystemEditView`, `SystemsBrowserView`, `RecipesBrowserView`, `ComponentsBrowserView`, `EnvironmentsBrowserView`.
- [x] `CraftingSystemManagerV2Root.svelte` shrunk from 2,785 lines to 2,042 lines (-743 lines, -27%). The root is now a router + shell + inspector, in line with the existing per-view component pattern (`EssenceBrowserView`, `EssenceEditView`, `TagsCategoriesView`, `EnvironmentEditView`).
- [x] No admin-store contract changes, no new persistence paths, no new dependencies.
- [x] All five extracted views own their filter state and emit explicit, named callbacks through narrow prop surfaces.

## Concrete Implementation Plan: Screenshot-Driven Re-Audit Slice

Re-audit follow-up after the previous source-vs-spec audit shipped as commit `a4821c8`. Existing Playwright screenshot artifacts predated the polish work and were stale. This slice applies the gaps identified by the screenshot-driven re-audit at `~/.claude/plans/audit-the-v2-gm-bubbly-lampson.md`: window sizing, missing route coverage, pagination footer, and the F4 verification that `risk` / `economyMode` / `timeOfDay` are real persisted contracts (not invented decorative metrics).

- [x] **F1 — bump default window size.** `SvelteCraftingSystemManagerV2App.svelte.js` raised from `1180×760` → `1280×820`. Body grid widened from `210px / 1fr / 280px` → `220px / 1fr / 300px` for a more comfortable rail and inspector. Environment-edit's two-column body grid bumped rail from 210→220 to match. Updated `tests/components/manager-v2-layout.test.js` assertions and the `setManagerV2WindowSize(1200, 790)` calls in `scripts/foundry-test-run.mjs` to `1280×820`.
- [x] **F4 — verify environment editor fields against runtime contract.** `risk`, `economyMode`, and `timeOfDay` are validated and persisted in `src/systems/GatheringEnvironmentStore.js` (lines 286-287, 749) with explicit `VALID_RISK_LEVELS` and `VALID_ECONOMY_MODES` allow-lists. The screenshot suspicion was misplaced; markup stays as-is, no code change.
- [x] **F3 — extend Playwright coverage.** Added seven new captures to `scripts/foundry-test-run.mjs` between recipes-stacked and environments-browse-normal: `manager-v2-components-normal/stacked`, `manager-v2-tags-categories-normal/stacked`, `manager-v2-essences-normal/stacked` (when feature gated on), and `manager-v2-essence-edit-first-state` (when essence rows are present). Each capture asserts a defining selector (drop zone, How-it-works evidence, etc.) before screenshotting.
- [x] **F5 — pagination footer.** New `src/ui/svelte/apps/manager-v2/Pagination.svelte` shared component with `totalCount` / `pageSize` / `pageIndex` / `pageSizeOptions` / `onPageChange` / `onPageSizeChange` props. Renders only when `totalCount > pageSize`. Integrated into `SystemsBrowserView`, `RecipesBrowserView`, `ComponentsBrowserView`, `EnvironmentsBrowserView`, `EssenceBrowserView` with default `pageSize=10`. Each view clamps `pageIndex` back to 0 via a view-local `$effect` when filters narrow the result count below the current page. New CSS in `styles/fabricate.css` (`manager-v2-pagination` band with summary / nav / per-page selector). Nine new lang strings under `FABRICATE.Admin.ManagerV2.Pagination.*`. Layout test asserts the scoped chrome; the existing recipes-browser mounted test asserts the footer hides at default `pageSize=10` with the 2-row fixture.
- [x] Validate with `npm test` (2306/2306 pass) and `npm run build` (clean).

### Screenshot-Driven Re-Audit Scope Decisions

- [x] Pagination is local view state only. No admin-store mutator, no settings persistence, no per-system per-page memory.
- [x] Auto-clamp resets `pageIndex` to 0 when filters narrow the result count below the current page; do not clamp to the final valid page because the user's intent is unclear in that moment.
- [x] Default `pageSize=10` matches the mock; selector offers `10 / 25 / 50`. No "All" option to keep the contract simple.
- [x] `risk` / `economyMode` / `timeOfDay` are persisted environment fields validated by `GatheringEnvironmentStore.js`; do not remove them as the audit initially suspected. The canonical `gathering-and-harvesting/spec.md` does not currently document them, but the runtime contract is real.

## Concrete Implementation Plan: Smoke-Test Fixture-Pollution Fix

The screenshot regen suite was failing at Phase D0 with "Manager V2 default selection did not select the first available system" because the world's persisted settings DB carried a leftover crafting system ("Alchemical Smithing", id `TPa0fbGzI7OO7hwu`) from a prior interactive dev session. Phase B's stale-system cleanup only matched literal name `Arcane Forge`, so it skipped that leftover. The manager-v2 auto-selected the alphabetically-first row (the leftover) instead of the test-created Herbalist's Compendium.

- [x] Broaden Phase B's stale-system cleanup in `scripts/foundry-test-run.mjs` to delete ALL crafting systems at startup. The smoke harness owns crafting state for the duration of the run, so a clean slate is correct. Comment cites the rationale (post-rename leftovers + dev-session orphans both miss the previous name filter).
- [x] Extend `assertManagerV2LayoutStable` to recognise `.manager-v2-component-row`, `.manager-v2-essence-row`, `.manager-v2-vocabulary-row`, and `.manager-v2-essence-edit-view` so the new F3 captures pass the row-presence assertion when the active route is Components / Essences / Tags & Categories / Essence Edit instead of just Systems / Recipes / Environments.
- [x] Re-run `npm run test:foundry` end-to-end — the suite now passes (`=== foundry-test: ALL PASSED ===`). Twenty-six manager-v2 screenshots regenerate, including the seven new captures from F3.
- [x] **F2 — stacked layout** at 1000×700 reads cleanly post-F1; no further changes needed. Verified against `test-results/screenshot-09-manager-v2-selected-stacked.png`.
- [x] **F7 — environment toolbar wrap** at 1280×820 fits all six filters on a single row; no `More filters` overflow needed. Verified against `test-results/screenshot-21-manager-v2-environments-browse-normal.png`.
- [x] Validate with `npm test` (2310/2310 pass) and `npm run build` (clean).

### Smoke-Test Fixture Fix Scope Decisions

- [x] Phase B owns the world's crafting state. Cleaning ALL systems at startup is the correct contract for an integration smoke test; no other test consumer relies on persisted systems across smoke runs.
- [x] `assertManagerV2LayoutStable` row check now covers every browser-row class in manager-v2; the editor-form check covers every `*-edit-*` view shell. Future routes must add their row class here.
- [x] Do not introduce a runtime "default seed system on first open" behaviour. The leftover came from prior dev sessions, not from a runtime contract.

## Concrete Implementation Plan: Smoke World Isolation

Follow-up to the previous Smoke-Test Fixture Fix. The "delete ALL crafting systems at Phase B start" change in `d503d2a` was destructive of user dev state: the leftover system that broke the smoke run was the maintainer's own interactive dev work in the `fabricate-smoke` world. Going forward the smoke harness must never touch the user's dev world. This slice reverts the aggressive cleanup and isolates the smoke run into a dedicated, ephemeral world.

- [x] Rename the smoke fixture from `.foundry-e2e/worlds/fabricate-smoke/` to `.foundry-e2e/worlds/fabricate-smoke-ci/` (via `git mv`). Update `world.json` `id` to `"fabricate-smoke-ci"` and set the title/description to clearly mark the world as auto-wiped CI-only.
- [x] Update `scripts/foundry-setup-data.mjs` so the smoke world is wiped (`rmSync` recursive) and re-copied (`cpSync`) on every `test:foundry:up`. The user's other worlds at `.foundry-e2e/data/Data/worlds/` are not touched; only `fabricate-smoke-ci/` is automation-owned.
- [x] Update `WORLD_ID` in `scripts/foundry-test-run.mjs` and `FOUNDRY_WORLD` in `docker-compose.foundry.yml` from `fabricate-smoke` to `fabricate-smoke-ci`. Update the harness header comment.
- [x] Update `docs/contributing.md` to reference the new CI world id.
- [x] Revert Phase B's "delete ALL systems" cleanup back to the original literal-name `s.name === 'Arcane Forge'` filter. The wipe-and-recreate in setup-data already guarantees an empty world; the literal-name filter is a belt-and-suspenders guard against a rare partial mid-run crash that left a renamed system around. The narrow filter cannot delete unrelated state if isolation ever regresses.
- [x] Verify with `npm test` (2313/2313 pass) and `npm run build` (clean). End-to-end `npm run test:foundry` should pass and write to `fabricate-smoke-ci` without touching the user's `fabricate-smoke` directory.

### Smoke World Isolation Scope Decisions

- [x] Choose a `-ci` suffix because it reads as automation-only and is unlikely to be opened interactively by mistake. The world title also calls out "auto-wiped each run" so anyone who does open it knows it is throwaway.
- [x] Keep the literal-name `Arcane Forge` filter in Phase B even though the wipe-and-recreate makes it almost always a no-op. It costs nothing and acts as a safety check if the wipe ever regresses.
- [x] Leave the user's existing `.foundry-e2e/data/Data/worlds/fabricate-smoke/` directory in place. It is theirs to keep or delete. The harness no longer reads from or writes to it.
- [x] Do not delete or modify anything in `fabricate-smoke/` programmatically. If the user wants to clean it up, that is a manual choice.

## Concrete Implementation Plan: Component Tag Search Layout

This corrective slice stabilizes the manager-v2 component toolbar when multiple tag filters are selected. The tag input should remain a bounded primary toolbar control; selected tag pills should wrap independently below it.

- [x] Keep component search, tag search input, essence filter, result count, and clear filters in a new `.manager-v2-toolbar-primary` row.
- [x] Move selected tag pills out of `.manager-v2-tag-search` and into a sibling `.manager-v2-toolbar-pills` row.
- [x] Keep tag suggestions anchored to `.manager-v2-tag-search` with absolute positioning.
- [x] Preserve tag pill removal through both the remove button and right-click context menu.
- [x] Update manager-v2 CSS so `.manager-v2-toolbar` is a grid container, primary controls flex-wrap independently, and the pill row wraps without resizing the tag input.
- [x] Update focused mounted/layout contract tests for the separated toolbar/pill structure.
- [x] Validate with the focused manager-v2 tests, `npm test`, and `npm run build`.

### Component Tag Search Layout Scope Decisions

- [x] This is layout-only; component filtering, tag suggestion matching, pagination reset, and clear-filter semantics stay unchanged.
- [x] The toolbar may grow vertically after tag selection, but selected pills must not live inside the tag search control or change suggestion anchoring.

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

## Corrective Implementation Plan: Essence Browser Source UI

- [x] Remove the duplicate essence create band from the browser; creation stays in the route header.
- [x] Replace visible linked-source badges in browser rows with compact source image evidence or localized `None`.
- [x] Move browse-mode source mutation to the selected essence inspector using the existing source selector/drop import flow and `store.updateEssence`.
- [x] Remove the duplicate browse-mode inspector Essence actions card so edit/delete remain row actions.
- [x] Update focused manager-v2 contract, mounted, and layout tests for the revised source UI.

## Verification For This Planning Change

- [x] `git diff --check -- openspec/changes/fabricate-ui-design-system-manager-v2`
- [x] Manual review of `design-system.md`, `design.md`, and `specs/ui-integration/spec.md` against the systems, environments, recipe browser, recipe editor, and essence input images.

## Future Implementation Validation

- [x] Focused component tests for new manager-v2 views.
- [x] Existing current-manager tests continue to pass.
- [x] `npm test`
- [x] `npm run build`
- [x] `npm run test:foundry` for final screenshot and pointer validation.

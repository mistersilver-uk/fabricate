# Design: Fabricate UI Design System And Manager V2

## Boundary Decision

Introduce the redesigned manager as a parallel app rather than replacing the current GM crafting admin in the first implementation pass.

## Reference Screenshots

Reference screenshots live in `references/`:

- [Actor Crafting App - Alchemy Mode](<references/Actor Crafting App - Alchemy Mode.png>)
- [Actor Crafting App - Crafting Mode - Complex Recipes](<references/Actor Crafting App - Crafting Mode - Complex Recipes.png>)
- [Actor Crafting App - Crafting Mode - Simple recipes](<references/Actor Crafting App - Crafting Mode - Simple recipes.png>)
- [Browse Crafting Systems](<references/Browse Crafting Systems.png>)
- [Browse Components](<references/Browse Components.png>)
- [Browse Essences](<references/Browse Essences.png>)
- [Edit Essence](<references/Edit Essence.png>)
- [Browse Gathering Environments](<references/Browse Gathering Environments.png>)
- [Browse Recipes](<references/Browse Recipes.png>)
- [Edit Crafting System Tags and Categories](<references/Edit Crafting System Tags and Categories.png>)
- [Edit Gathering Environment](<references/Edit Gathering Environment.png>)
- [Edit Recipe Overview](<references/Edit Recipe Overview.png>)
- [Edit Recipe Resolution](<references/Edit Recipe Resolution.png>)
- [Edit Recipe Results](<references/Edit Recipe Results.png>)
- [Edit Recipe Steps and Ingredients](<references/Edit Recipe Steps and Ingredients.png>)
- [Recipe Edit Visibility](<references/Recipe Edit Visibility.png>)

Use these as visual evidence for hierarchy, density, interaction placement, color language, and polish. They are not literal implementation blueprints. Where a screenshot omits required Fabricate behavior, shows placeholder data, introduces unsupported concepts, or conflicts with the written OpenSpec requirements, implement the written design and UI delta instead.

Reference decisions:

- [Actor Crafting App - Alchemy Mode](<references/Actor Crafting App - Alchemy Mode.png>): keep the shared actor/source header, alchemy system selector, active/history bands, component palette, central workbench, attempt action, discovered recipes panel, and selected discovered-recipe detail. Preserve alchemy secrecy and discovery rules; do not add Crafting-only shopping list, favourites, normal recipe browser, or recents.
- [Actor Crafting App - Crafting Mode - Complex Recipes](<references/Actor Crafting App - Crafting Mode - Complex Recipes.png>): keep the browse-first recipe list, complexity/status chips, summary columns, right craft-plan inspector, path selector, ingredient group breakdown, source allocation, outcome explanation, active-run card, and step timeline. Keep row requirements/results compact; full alternatives and step detail belong in the inspector.
- [Actor Crafting App - Crafting Mode - Simple recipes](<references/Actor Crafting App - Crafting Mode - Simple recipes.png>): keep the baseline Crafting mode hierarchy: actor/source header, mode switch, active run, recent history, shopping list, searchable recipe table, selected recipe inspector, and continue/start actions. Treat its flat requirement/result display as the simple case only.
- [Browse Crafting Systems](<references/Browse Crafting Systems.png>): keep as the manager shell anchor; discard decorative or non-data-backed metrics.
- [Browse Components](<references/Browse Components.png>): keep the component table, drag/drop import, filters, usage legend, and inspector; change labels/data to Fabricate component semantics and keep recipe items distinct. The component toolbar separates primary controls from selected tag pills: selected pills wrap in their own row below the tag search input, and tag suggestions stay anchored to the tag search control.
- [Browse Essences](<references/Browse Essences.png>): keep the essence table, source-state evidence, usage summary, row selection, and inspector; show only when essences are enabled and do not treat essences as components. Do not keep inline editing in the browse view.
- [Edit Essence](<references/Edit Essence.png>): keep the dedicated edit route, identity form, pop-over icon selection, conditional effect source panel, save/cancel strip, right summary rail, and destructive actions. Source UI appears only when effect transfer is enabled for the selected system.
- [Browse Gathering Environments](<references/Browse Gathering Environments.png>): keep the environment index hierarchy and image-backed inspector; discard fake summary/help dashboards.
- [Browse Recipes](<references/Browse Recipes.png>): keep the recipe table and selected-recipe inspector; derive requirements preview from real ingredient sets.
- [Edit Crafting System Tags and Categories](<references/Edit Crafting System Tags and Categories.png>): keep the split management layout, usage counts, search/add flows, cleanup actions, and right evidence panels; discard hierarchical categories, inherited subcategories, and multiple categories per recipe unless later data-model work adds them.
- [Edit Gathering Environment](<references/Edit Gathering Environment.png>): keep the compact editor, top save/cancel strip, tabbed task workflow, left task list, scene image card, validation/evidence column, and selected-task summary. Discard unsupported gathering fields and labels, but do not accept the legacy admin `EnvironmentsTab` form stack as the v2 visual surface.
- [Edit Recipe Overview](<references/Edit Recipe Overview.png>): keep the editor shell, tabs, save actions, and evidence column; discard generic recipe fields outside Fabricate contracts.
- [Edit Recipe Resolution](<references/Edit Recipe Resolution.png>): keep provider cards, mapping table, result summaries, help, and failure outcome; add the missing crafting-check section, discard duplicate mapping as an error unless a later rule adds it, and treat provider ownership according to the written data contract.
- [Edit Recipe Results](<references/Edit Recipe Results.png>): keep result-group authoring and source palette; keep provider mapping in Resolution.
- [Edit Recipe Steps and Ingredients](<references/Edit Recipe Steps and Ingredients.png>): keep the structure rail, active set editor, typed rows, and palette; preserve Fabricate's boolean ingredient model.
- [Recipe Edit Visibility](<references/Recipe Edit Visibility.png>): keep as a knowledge-mode reference for system-owned context, linked recipe item, effective visibility, validation, and docs; use human labels and add global, player, learned, item-or-learned, and alchemy variants.

Working name:

- `CraftingSystemManagerV2`

Likely implementation shape:

- a new ApplicationV2 wrapper, for example `SvelteCraftingSystemManagerV2App.svelte.js`
- a new Svelte root, for example `CraftingSystemManagerV2Root.svelte`
- shared presentational components for rails, tables, inspectors, toolbars, chips, and action menus
- reuse `createAdminStore()` and existing services where possible

This keeps the initial work mostly as a reskin and structural UI change while reducing risk to the current manager.

## Data And Behavior Reuse

Manager V2 should use the same behavior contracts as the existing manager:

- selected system state
- active tab state or equivalent view routing
- system create/import/export/delete
- item/component management
- recipe management
- environment management
- graph/rules access
- dirty draft protection
- validation and first-invalid focus behavior

Store changes should be limited to derived display data that is awkward to compute inside components, such as counts, table summaries, inspector facts, and stale-reference badges. Store changes must not become a second persistence or validation path.

## Shell Layout

The normal-width manager-v2 layout follows the reference images:

1. Left rail
   - app scope and navigation
   - current section active state
   - summary blocks for the active view when useful
   - compact help/documentation affordance

2. Main region
   - view header with title, description, breadcrumb, and primary actions
   - toolbar for search/filter/view controls
   - table/list/editor body
   - pagination where relevant

3. Inspector region
   - selected-object visual preview
   - status and key facts
   - timestamps/ownership when available
   - quick actions

At narrow widths, these regions stack in the same order: navigation/scope, main work, inspector/evidence.

## View Model

### Systems

Use the first image as the anchor.

Main list columns:

- name with icon and description
- status with toggle and label
- version
- environments
- recipes
- items
- resources/components
- last updated
- row actions

Inspector:

- system image/icon
- system name and status
- description
- version, environments, recipes, items, resources
- created/updated metadata
- quick actions: edit, duplicate, export, delete

System edit view:

- The systems row Edit action opens an in-manager-v2 edit route, not the current admin shell.
- The edit route stays scoped to the selected crafting system and keeps the left rail/breadcrumb context.
- The first edit slice exposes only base settings already owned by the current admin store:
  - name
  - description
  - resolution mode
  - advanced-option visibility
  - optional feature toggles
- Persistence must reuse existing admin-store actions such as `saveSystemDetails`, `setResolutionMode`, `toggleAdvancedOptions`, and `toggleFeature`; manager-v2 must not add a second system update path.
- Resolution mode changes keep the existing destructive confirmation and cleanup behavior.
- Until the runtime persistence layer accepts canonical `routed`, the edit control must keep using the current runtime-backed `mapped` and `tiered` routed values for selectable routed modes.
- Optional feature controls are direct toggles only in this slice. Do not reintroduce legacy toggles removed from the current system settings UI, including `complexRecipes`, `craftingChecks`, and `outcomeRouting`. Deeper editors for categories, tags, essences, crafting checks, requirements, visibility, and alchemy settings remain owned by later manager-v2 views or the current admin.
- The edit view should show compact guidance/evidence in the inspector: selected system, current resolution mode, enabled feature count, and a note that deeper configuration remains outside this slice.
- A back affordance returns to the systems browser for the selected system.

### Environments

Use the fourth image as the index target and the editor images as the edit target.

Index list columns:

- environment with image, name, status, and description
- biome
- size
- difficulty
- status/resources
- last updated
- row actions

Inspector:

- scene/environment image
- environment name, status, description
- biome, size, difficulty, resource count, updated date
- quick actions: edit, duplicate, delete

Editor:

- compact object header
- tabs/workflow for overview, resources, conditions, balancing, advanced
- primary resource/result authoring area
- evidence column for preview, expected results, balance summary, validation
- advanced behavior after primary composition

Environments page implementation slice:

- This slice promotes `Environments` from a selected-system placeholder to a real manager-v2 page and edit route. It is available only when the selected crafting system has `features.gathering === true`; disabling gathering must make the route unreachable and return to a visible manager-v2 route through the existing store/tab fallback behavior.
- The page must use existing admin-store environment contracts as the only source of persistence and validation: `store.viewState.environments`, `selectedEnvironmentId`, `environmentDraft`, `environmentDraftDirty`, `environmentDraftIsNew`, `environmentSaving`, `environmentSaveError`, `environmentValidationState`, `selectedEnvironmentTaskId`, and the existing `selectEnvironment`, `createEnvironmentDraft`, `updateEnvironmentDraft`, task/result/catalyst/visibility/result-selection/progressive/check/time/failure callbacks, `saveEnvironmentDraft`, `cancelEnvironmentDraft`, `duplicateEnvironmentDraft`, `deleteEnvironmentDraft`, `moveEnvironmentDraft`, and `toggleEnvironmentEnabled` actions.
- Manager-v2 may derive display-only environment facts locally or in the store when needed, such as scene image, selection mode, task count, enabled state, routed/progressive task counts, catalyst/result totals, validation count, and stale scene/macro/table reference indicators. These derived facts must not add persistence, validation, source-resolution, import/export, or cleanup behavior.
- The browse route should use the manager-v2 shell, breadcrumbs, and rail. Main content should include a search control, status filter, selection-mode filter, compact create action, environment table/list rows, selected-row state, and empty/error/loading states. Row fields are limited to image, name, enabled/disabled, description, targeted/blind selection mode, task count, and actions.
- Environment browse rows should use a wide scene-proportional thumbnail in the identity cell. Do not add a separate linked-scene column; linked-scene state is evident from the thumbnail and remains available in the selected-environment inspector.
- Environment browse status should use the same compact on/off toggle pattern as the systems browser. The task column should render only the numeric task count, without result/catalyst evidence or pill wrappers.
- Environment browse row actions should separate editing actions from reordering: edit, duplicate, and delete sit in a compact grid to the left, while move-up and move-down occupy the top-right and bottom-right of the actions column.
- The selected-environment inspector should prefer linked scene imagery from `sceneOptions` and fallback only when no linked image is available. It should show environment identity, status, description, selection mode, scene/source state, task/result/catalyst counts, validation or dirty evidence when selected, and quick actions for edit, duplicate, enable/disable, move, and delete where the existing store supports them.
- The edit route should keep the user inside manager-v2 after create or row Edit. It may reuse existing `EnvironmentsTab` child components or extract shared behavior from them, but the manager-v2 edit route must not simply mount the legacy tab as the visible editor. If a wrapper is needed, keep it thin and do not fork editor behavior. If visual integration requires small child components, they must receive named callbacks rather than a broad service/container grab bag.
- The corrected edit slice must preserve the current editor's fields and behavior while replacing the presentation: environment identity, enabled state, selection mode, scene UUID, task add/select/duplicate/delete/reorder, task base fields, time requirement, failure outcome, routed result selection, progressive/check settings, visibility, catalysts, result groups/results, save/cancel, stale-reference warnings, and first-invalid focus.
- The manager-v2 environment editor visual target is the updated [Edit Gathering Environment](<references/Edit Gathering Environment.png>) reference:
  - Top shell: breadcrumbs, `Edit Environment` title, short subtitle, dirty indicator, `Cancel`, and primary `Save Environment` button in the application header region.
  - Environment details band: tab strip or segmented control with `Environment Details` and `Advanced`; identity fields at left; linked scene image/card in the center; enabled/availability and player visibility controls at right.
  - Task work area: left task list with validity/status icons, task names, concise mode labels, drag/reorder handle affordance, row action menu, add/duplicate/delete/move actions, and a drag-to-reorder drop zone.
  - Center editor: selected task header with status chip and tab strip. Tabs should be mapped to Fabricate semantics rather than copied literally: `Task Details`, `Results`, `Catalysts`, `Visibility`, `Timing`, and `Advanced` or equivalent grouping.
  - Task details tab: task name/description, enabled/repeatable state where backed, resolution mode, time requirement, failure outcome, result-selection provider, progressive/check controls where relevant, and player visibility controls. Keep unsupported concepts out.
  - Results/Catalysts tabs: result groups/results and catalysts become primary tabbed authoring surfaces instead of long stacked details panels.
  - Right evidence column: environment summary, validation grouped by task/warning, selected task summary, stale-reference warnings, and quick links that select the relevant task and tab.
  - Bottom/meta strip: last-saved or dirty state only when backed by store/runtime data; do not invent timestamps.
- The old `EnvironmentsTab` grid/list affordances should not appear inside `currentView === "environment-edit"` because the v2 browse route already owns environment selection and creation.
- The current manager-v2 screenshot artifacts from the first pass demonstrate runtime wiring but fail the visual reference: duplicated headings, old fantasy display typography, generic form stack, hidden task authoring below the fold, manual scene UUID prominence, and a right inspector that is separate from rather than integrated with the editor evidence column. The corrective implementation must replace those defects, not style around them.
- Do not add unsupported environment concepts from the reference image, including biome, size, difficulty, resource rarity, map/travel authoring, invented last-updated timestamps, decorative metrics, ingredient-set-based gathering, or a harvesting subsystem. Gathering tasks have no ingredients.
- Dirty-draft protection remains store-owned. Browse navigation, selected-system changes, environment selection, create/edit transitions, cancel, delete, move, and feature-gathering disablement must continue to ask for discard confirmation through existing admin-store actions when needed.
- Representative fixtures for implementation should include at least two environments for the selected system, one enabled targeted environment with linked scene imagery, one disabled or blind environment, a draft with routed and progressive task evidence where practical, and at least one stale linked reference warning. Screenshots must prove a real linked scene image path, not only fallback icons.
- Browser pointer hit-tests should cover Environments nav, search, filters, row selection, row image/name edit target, enable toggle, move menu items, duplicate/delete actions, create, edit-route back, task selection, task/result/catalyst action menus, save, cancel, validation-link first-invalid focus, and inspector quick actions where present.
- Normal browse screenshot target: `1200x790`. Stacked browse target: `1000x700`. Edit screenshots should include first visible editor state at `1200x790`, validation state with first invalid focus target visible, result/catalyst authoring state, and a narrow stacked editor at `1000x700` or smaller with save/cancel and validation reachable.

### Recipes

Use the later recipe browser and editor images as the visual target, but keep Fabricate's canonical recipe semantics.

Browser main list columns:

- recipe with image, name, status, and description
- category
- structure or recipe classification when available
- status with toggle and label
- requirements summary
- craft time summary when backed by existing data
- last updated when backed by existing data
- row actions

Browser inspector:

- recipe image
- recipe name and status
- description
- category, structure, craft time, tags, and created/updated metadata when backed by existing data
- requirements preview derived from Fabricate execution-step semantics; explicit multi-step recipes must not be summarized only from top-level ingredient sets
- quick actions: edit, duplicate, delete

Second-slice browser boundary:

- implement only the recipes browser route, table, inspector, filters, and existing actions
- create and edit continue to open the existing recipe editor
- do not introduce inline recipe editing, recipe editor tabs, recipe-local resolution mode, visibility authoring, required station, minimum skill, output quality, byproduct, XP, rarity, owner, or invented timestamps
- hide or omit optional browser fields when the current recipe/store contract does not provide them

Editor shell:

- left rail remains system/navigation context
- compact top header with breadcrumb, title, save draft, cancel, save recipe, and optional overflow
- tab strip: overview, steps/ingredients, results, resolution, visibility, advanced
- main editor region for the selected tab
- right evidence column with recipe identity, recipe summary, ingredient preview, catalysts, result preview, validation, warnings, and quick actions

Editor tab responsibilities:

- Overview: recipe identity, description, category, image, enabled/locked state, tags, recipe-item link when knowledge mode needs it, high-level summary, and next-step links.
- Steps / Ingredients: explicit step navigator when multistep is enabled; implicit single-step editing when disabled; ingredient sets, ingredient groups, OR options, tag placeholders, catalysts, essences, time, and currency requirements.
- Results: result groups and result rows, not generic output rows; progressive result ordering and difficulty badges when the selected system is progressive.
- Resolution: mode-specific controls for simple, routed, progressive, and alchemy systems. Routed and alchemy providers must expose ingredient-set routing, macro outcome, or roll-table outcome rules. Progressive must expose award mode and ordered-result semantics.
- Visibility: controls that match the selected system's visibility mode, including player allow-list or recipe-item/knowledge linkage where applicable.
- Advanced: internal notes, ids, destructive or rarely used settings, and summaries that do not belong in the primary authoring flow.

The recipe editor should preserve the artistic direction in the image: dark tabbed workspace, numbered overview sections, green active tab/action states, compact evidence panels, and stable form geometry. It must not copy generic fields that are not backed by Fabricate contracts, such as required station, minimum skill, output quality, or byproduct, unless a later spec introduces those concepts.

Resolution layout:

- Use [Edit Recipe Resolution](<references/Edit Recipe Resolution.png>) as the visual target for provider selection, mapping management, result group summaries, validation, explanatory guidance, and failure outcome configuration.
- Top context:
  - show system-owned resolution mode
  - show that mode is set by the crafting system
  - link to edit the crafting system for mode-level changes
- Crafting check section:
  - explain that the check is the success/failure gate
  - expose check provider controls when the selected system mode supports or requires a check
  - support the intended provider families in UI planning: system expressions such as dnd5e/pf2e where available, and custom macro checks
  - make clear that failed checks use the failure outcome and do not award a normal success result group
- Mode fit:
  - simple mode uses the check as an optional or mode-supported gate before awarding the single successful result group
  - progressive mode shows that the check produces the value, degree, or pass/fail state used by progressive award logic
  - routed ingredient-set mapping evaluates the check before mapping the satisfied ingredient set to a successful result group
  - routed roll-table outcome evaluates the check before rolling or resolving the table provider
  - routed macro outcome labels whether a macro is being used as the check, the successful result provider, or both where the backing contract explicitly permits that
- Successful result selection section:
  - provider selector for ingredient-set mapping, roll table, and macro outcome in routed/alchemy-style modes
  - ingredient-set mapping maps each ingredient set to one result group using a dropdown
  - roll-table provider selects a roll table and maps inspectable table outcomes to result groups where Fabricate can inspect them
  - macro provider selects a macro and explains that Fabricate cannot exhaustively validate dynamic macro outcomes before runtime
- Failure outcome section:
  - always-present failure configuration for modes that can fail
  - optional failure message
  - optional failure macro
  - clear note that failure does not award a normal result group unless a later approved runtime model explicitly supports that behavior
- Supporting panels:
  - "How this works" guide and documentation link
  - result group summaries for reference
  - validation and warnings near the provider/mapping workflow

The Resolution tab should not attach separate checks to each mapping row in the first manager-v2 design. A check gates success for the recipe/active step; the result provider chooses what successful result group is awarded after the check passes. Per-mapping-row checks would be a separate advanced feature and need their own OpenSpec change.

When explicit dropdown mapping is used, result group names only need normalized uniqueness for reliable display/selection. Do not show reserved-failure-keyword warnings for dropdown-mapped result groups. If a provider still relies on runtime string matching, the UI must be honest about that provider-specific limitation instead of applying the warning globally.

Do not copy the resolution reference's duplicate-mapping warning as a hard error. Multiple ingredient sets may map to the same result group unless a later domain rule forbids it. Do not copy help text that says provider behavior is configured on the crafting system if the implementation data contract stores the selected provider on the recipe.

Visibility layout:

- Use [Recipe Edit Visibility](<references/Recipe Edit Visibility.png>) as the visual reference for knowledge-mode layout, not as the complete set of required mode states.
- Top context:
  - show `recipeVisibility.listMode` as system-owned context
  - show `knowledge.mode` as system-owned context when `listMode === "knowledge"`
  - link to edit the crafting system for mode-level settings
  - call out that GM users always see all recipes
- Global mode:
  - show read-only explanation that no per-recipe visibility controls apply
  - do not show player allow-list or recipe-item controls
- Player mode:
  - show the recipe-local restricted flag
  - show an allowed-user picker when restricted
  - make clear that an empty allowed-user list hides the recipe from all non-GM users and is valid
- Knowledge mode:
  - adapt the center content to `item`, `learned`, or `itemOrLearned`
  - for item-based access, show linked recipe item selector/drop zone, image, source status, UUID/source identity, change/unlink actions, and item-matching explanation
  - for learned access, show learning status and system-owned learning settings as evidence, not editable recipe-local toggles
  - for item-or-learned access, show both access routes and explain that either grants visibility and craftability
- Alchemy mode:
  - show that non-GM recipe lists are hidden by default
  - show learn-on-craft behavior as system-owned context where enabled
- Supporting panels:
  - effective player visibility for the active mode only
  - example scenarios whose pass/fail rows match the active mode
  - validation for missing required recipe item links, unresolved recipe item definitions, or invalid allowed-user shape
  - documentation links for recipe visibility and item matching

Use human-readable labels for system settings in the UI. Code-like labels such as `dragDropEnabled`, `manualLearnActionEnabled`, and `consumeOnLearn` may appear in developer docs but should not be visible product labels.

Results layout:

- Use [Edit Recipe Results](<references/Edit Recipe Results.png>) as the visual reference for result-group authoring structure, not as a literal source of runtime behavior.
- Left structure rail:
  - system-owned resolution context at the top, including resolution mode and an edit-crafting-system link
  - compact result-group cards with group name, result count, validity, and reachability/mapping summary where derivable
  - validation summary beneath resolution and result groups, with links into the active result group editor
- Center active editor:
  - breadcrumb for current recipe and result group
  - active result-group header with editable name, validity, result count, and mode-specific context
  - stable result rows with component identity, quantity, progressive difficulty badge where relevant, reorder controls where order matters, and row actions
  - empty state and add-result affordance for groups with no results
- Right source palette:
  - draggable Components palette with search and relevant filters
  - component entries showing image, name, tags, essences, progressive difficulty when relevant, and source-link state
  - visible drop target for adding a component as a result

The Results tab should keep result-group authoring separate from provider routing. It may show mapping/reachability context and links to the Resolution tab, but full provider mapping belongs in the Resolution tab.

Steps / Ingredients layout:

- Left structure rail:
  - system-owned resolution context at the top, including resolution mode, provider summary where relevant, and an edit-crafting-system link
  - compact step cards with order, name, status, and set/group/time summary chips
  - compact ingredient-set cards with set name, group/option/catalyst counts, routed mapping chip, and validity/warning state
  - validation summary beneath resolution, steps, and ingredient sets, with links into the active editor
- Center active editor:
  - breadcrumb for current step and ingredient set
  - active set header with name, edit affordance, mapping chip, validity, and summary counters
  - group blocks that communicate required-together groups without graph-like clutter
  - simple option rows that communicate OR alternatives, option type badge, selected component/essence/tags, quantity or required amount, consumption, validity, and actions
  - compact OR dividers between option rows
  - collapsed catalyst, time requirement, and currency requirement panels with meaningful configured summaries
- Right source palette:
  - tabbed Components, Essences, and Tags palette
  - search/filter controls appropriate to the active palette
  - source-state and ownership filter chips where useful
  - category/tag/type selectors where useful
  - draggable entries that can fill empty option rows, replace populated option rows, or create new options when dropped into a group
  - a visible dashed drop zone for adding the active palette item type as a new option
  - short drag/drop helper text that does not compete with the palette

Keepable visual elements from the latest Steps / Ingredients iteration:

- compact left step cards
- compact ingredient-set cards
- active set editing focus in the center column
- set header with mapped-result chip and validity state
- group-level blocks with concise helper copy
- option rows with image/icon identity, quantity, consume toggle, and row actions
- component option rows with item image and component badge
- essence option rows with essence icon, essence badge, and required amount
- tag-matching option rows with tag badge, tag chips, match logic, and match count
- collapsed secondary requirement panels for catalysts, time, and currency
- right source palette tabs with search, filter chips, linked/stale/unlinked source states, and drag target
- green active state, amber warning state, and restrained dark manager-v2 styling

### Components

Use [Browse Components](<references/Browse Components.png>) as the visual target for the component directory browser/editor.

Main list columns:

- component with image, name, status, and description
- tags
- essences with compact icon/count treatment
- progressive difficulty when relevant
- usage counts for ingredient, result, catalyst, gathering, and salvage-output references where derivable
- source state and source type
- updated metadata
- row actions

Toolbar and import:

- prominent drag/drop area for adding linked Foundry items as components
- explicit drop action choice when a dropped item may become a component or recipe item
- search
- status, tag, essence, and source-state filters
- clear filters
- list/grid view toggle if useful
- create/add component primary action
- import/export actions only when existing behavior supports them

Inspector:

- component image
- component name and status
- short description
- tabs or sections for component, usage, salvage, and source
- editable tags and essence assignments where existing behavior supports inline editing
- progressive difficulty value where the selected system uses progressive results
- source preview with linked/stale/unresolved/missing/no-source states
- quick actions: edit, duplicate, delete

The component view should preserve the artistic direction in the image: image-led rows, compact tags and essence chips, dense usage columns, source state, selected-row emphasis, usage legend, and a right inspector with tabs. It must not collapse components, recipe items, and general Foundry items into one undifferentiated object type.

Components page implementation slice:

- This slice promotes `Components` from a selected-system placeholder to a real manager-v2 page. It is directory/browser focused; deep component editing continues to use the existing component editor app and current admin-store/service callbacks.
- The public UI boundary should stay in the manager-v2 Svelte root or a small manager-v2 child component if the root becomes unwieldy. The owning behavior is selecting, filtering, presenting, importing, editing, replacing source, and deleting components for the selected system.
- Dependencies must stay explicit: use `store.viewState.itemCards`, `store.setItemSearch`, `store.deleteComponent`, and existing service callbacks for drop import, edit component, replace source, and copy source UUID. Do not pass a broad service bag deeper than the current root boundary unless the child component receives named callbacks.
- Store changes are allowed only for derived, display-only component facts that cannot be honestly derived in the component view. Any such derived data must be computed from existing selected-system, recipe, environment, essence, and item-card data and must not add persistence, validation, import/export, or source-resolution behavior.
- The page should show data-backed fields only: component image, name, description, tags when item tags are enabled, essences when essences are enabled, progressive difficulty when present, salvage summary when present, source UUID/source state when available, and usage counts only where they can be derived from current admin-store data.
- Component descriptions must be normalized to display-safe plain text before they reach the browser. Foundry-style description objects such as `{ value: "<p>...</p>" }` are valid inputs; unknown object shapes must render as empty descriptions rather than `[object Object]`.
- Drop-to-add import must reuse the existing manager drop behavior that imports world or compendium items into the selected system. If the implementation can distinguish a drop that could become either a component or a recipe item, it must require an explicit action choice; otherwise keep the existing component import path and do not invent recipe-item import behavior.
- Component edit actions must open the existing component editor. Delete must call `store.deleteComponent` so the existing confirmation and recipe cleanup behavior remain canonical. Source replacement must use the existing replace-source callback and must not erase unresolved source references merely because they fail to resolve.
- The selected-component inspector should contain identity, status/source evidence, tags, essences, progressive difficulty, salvage summary, usage evidence, source UUID copy/open/replace affordances when supported, and edit/delete actions. It should use sections or lightweight tabs only if they fit normal Foundry window widths without nested card stacks.
- Component, recipe item, essence, and generic Foundry item concepts must stay visually and semantically distinct. Component rows must not imply that recipe items or arbitrary dropped items are already managed components before the existing import action succeeds.
- Representative fixtures for implementation should include at least one component with a linked image/source UUID, one component with tags, one with essence assignments, and one with salvage or usage references where current fixtures can support it. Screenshots must prove the linked image/source path instead of only fallback item-bag icons.
- Browser pointer hit-tests should cover Components nav, drop zone hover/drop where feasible, search, filters, clear filters, row selection, edit, delete, source copy/replace affordances where present, and inspector action targets.
- Normal screenshot size target: `1200x790`. Stacked/narrow target: `1000x700` and one narrower container/window where the table stacks without horizontal overflow.

### Tags And Categories

Use [Edit Crafting System Tags and Categories](<references/Edit Crafting System Tags and Categories.png>) as the visual target for the system-level tags and categories management view.

Main layout:

- compact header with breadcrumb, title, view-system-overview action, and save/dirty action when the backing store uses a draft flow
- short informational banner explaining that these vocabularies are system-level configuration
- two-column management surface at normal widths when both features are enabled
- right evidence column with how-it-works guidance, system summary, example scenario, and documentation link
- bottom or summary notice for save/apply behavior that matches the existing admin store

Tags column:

- shown when `features.itemTags === true`
- manages `CraftingSystem.itemTags`
- search tags
- add tag
- list tag id/label, usage count, edit action, delete action
- usage should count tagged components and tag-placeholder ingredient references where derivable
- unused-tag cleanup is allowed only for tags with no derived references

Categories column:

- shown when `features.recipeCategories === true`
- manages custom entries in `CraftingSystem.categories`
- show the reserved effective `General` category as reserved when useful, but do not persist it in `CraftingSystem.categories`
- search categories
- add category
- list category id/label, optional description only if backed by a future data contract, recipe usage count, edit action, delete action
- unused-category cleanup is allowed only for categories with no recipe references

Corrections to the reference:

- Tags are item tags used by components and tag-placeholder ingredients, not generic recipe tags.
- Categories are flat recipe categories, not hierarchical folders.
- A recipe has one category, not multiple categories.
- There are no parent/child category inheritance rules.
- Do not add category descriptions unless the data contract is expanded; current custom categories are strings.
- Deleting or renaming in-use tags/categories should warn about impact and then follow existing store/runtime behavior rather than inventing new migration semantics.

### Essences

Use the later essence browser image as the visual target. The tab is shown only when `features.essences === true`.

Main list columns:

- essence with icon, name, and description
- source item with image, name, type, and linked/stale/no-source state
- used by components count
- updated
- row actions

Browse-page behavior:

- The essences browse view is a read/browse surface plus row selection. It must not show inline name, icon, description, or source edit controls.
- Creating or editing an essence opens a dedicated manager-v2 editor route rather than expanding a row or editing inside the browse table.
- The row Edit action opens the edit route for that essence and preserves the selected crafting-system context.
- The browse inspector may show details, usage, source state, and warnings, but its action buttons must navigate to the edit route for mutations other than delete/duplicate where those actions are supported.
- Source columns, source filters, source inspector sections, source cards, and source warnings are shown only when `features.effectTransfer === true`.

Toolbar:

- search
- status/source-state filter only when effect transfer is enabled; otherwise omit source-state filtering
- clear filters
- list/grid view toggle if useful
- create essence primary action
- import/export actions only when they use existing manager behavior

Inspector:

- large essence icon
- essence name and active/available state
- tabs for details, usage, and source
- basic information: name, description, essence id with copy action
- source item card with resolved/stale status, open action when available, unlink action, and drop zone for replacement only when effect transfer is enabled
- usage summary covering ingredients, catalysts, results, gathering, and salvage output when those references can be derived
- warnings for missing/stale source item and destructive usage impact
- quick actions: edit, duplicate, delete

Dedicated edit route:

- name
- icon picker using the existing essence icon behavior as a pop-over picker; do not expose raw icon class editing as the primary interaction
- description
- optional source item link from drag/drop or picker only when `features.effectTransfer === true`
- no source controls, source card, source tab, source filters, or source warnings when effect transfer is disabled; in that case the editor should focus on identity and usage evidence only
- stale source warning and clear/replace source actions when the effect-transfer source panel is visible
- save/cancel actions in the header strip with dirty-state indication and route-exit protection
- right summary rail with current identity preview, details/usage/source tabs or equivalent sections, validation, duplicate/delete actions, and no unsupported decorative metrics

The essence view should preserve the artistic direction in the image: icon-led rows, source-item linkage in the table, green linked state, dashed drop zones, compact usage summary tiles, and an inspector that separates details, usage, and source. It must not treat essences as components, recipes, or general item tags.

### Actor Crafting And Alchemy Apps

Use the actor app references as the visual target for player-facing crafting surfaces. These screens share the product palette and evidence patterns with manager-v2, but they intentionally reduce GM-only chrome. They are not manager pages and should not gain a persistent admin rail, import/export actions, or editor breadcrumbs.

Shared shell:

- compact top application title
- actor/source header with selected crafting actor image, level/summary where backed by actor data, and component source actors
- mode tabs for Alchemy and Crafting only when both modes are available
- mode-specific selector on the right when needed, such as alchemy system selection
- top active-run and recent-history bands before the main work area
- right evidence area for selected recipe, selected discovered recipe, active run, or craft plan

Crafting mode:

- Use [Actor Crafting App - Crafting Mode - Simple recipes](<references/Actor Crafting App - Crafting Mode - Simple recipes.png>) for the baseline browse-to-craft layout.
- Use [Actor Crafting App - Crafting Mode - Complex Recipes](<references/Actor Crafting App - Crafting Mode - Complex Recipes.png>) for multi-step, multiple-path, optional-requirement, routed, and progressive cases.
- The central recipe table is a scan surface. Requirements and results should be summarized with data-backed counts and labels rather than full nested structures.
- Complexity/status chips should distinguish craftable, missing materials, locked, learnable, in progress, complex, multi-step, routed, progressive, path count, and choice count where those concepts are backed by current recipe data.
- The selected-recipe inspector is the craft-plan surface. At normal widths it should show selected path, ingredient sets/groups/options, optional essences, catalysts/tools, source actor allocation, time/currency, outcome explanation, active run progress, and a step timeline.
- Ingredient-set alternatives are presented as paths. The UI should show which path is selected, which alternatives are satisfiable, and how the selected path affects required components and routed result evidence.
- Source allocation is shown where decisions are made: ingredient rows indicate which component source actor supplies each satisfied requirement.
- Multi-step runs show current step, remaining time/progress, and completed/current/pending steps in a compact timeline. Continue/cancel/details actions remain visible.
- Shopping list remains Crafting-only and should aggregate the selected path or clearly identify the path assumption.

Alchemy mode:

- Use [Actor Crafting App - Alchemy Mode](<references/Actor Crafting App - Alchemy Mode.png>) as the workbench-first layout.
- The main grid is component palette, workbench, and discovered recipes. It does not include the Crafting recipe browser, shopping list, recents, or favourites.
- The component palette lists selected alchemy-system components from component source actors. Quantity is inventory minus workbench quantity, and unavailable items remain visually distinct.
- The workbench is the primary composition surface with click/add, remove, drag/drop, grouped quantities, clear all, and one primary attempt action.
- The discovered recipes panel is always visible. It lists only recipes the viewer is allowed to know: learned/discovered recipes for non-GMs and all recipes for GMs.
- Auto-fill on discovered recipes populates the workbench using the canonical satisfiable-set algorithm and reports unfulfilled groups if no full set is available.
- Selected discovered recipe detail may show expected result and requirements because the recipe is known. Failed/no-signature attempts and hidden recipes must not leak recipe identity, result groups, or diagnostics to non-GMs.
- Active runs and history are filtered to alchemy systems and shown in the top bands.

### Items, Rules, Graph

These views should adopt the design system without changing their semantics.

- Items: table/grid hybrid with item image, tags/essences/difficulty/salvage facts, and inspector.
- Rules: settings grouped into compact panels with semantic summaries and evidence/validation where useful.
- Graph: graph remains a tool surface, but shell, toolbar, and inspector styling should match manager-v2 tokens.

## Component Ownership

Preferred split for later implementation:

- App wrapper/root owner: new manager-v2 ApplicationV2 wrapper and root component.
- Design-system components owner: shell, rail, toolbar, table, inspector, chips, buttons, menus.
- View owner: systems and environments manager-v2 views.
- Style owner: token definitions and manager-v2 CSS scope in `styles/fabricate.css`.
- Test owner: mounted component tests, source contract tests, Foundry screenshot/pointer checks.

Avoid parallel edits to shared CSS, `lang/en.json`, and `adminStore.js` without coordination.

## Compatibility

Manager V2 must be additive.

- The existing manager remains available.
- No current app id, setting key, module id, or module name changes.
- No runtime API is removed.
- Existing tests for the current manager continue to pass.
- A later implementation plan must define how GMs open manager-v2: setting, dev flag, alternate app factory entry point, or explicit menu action.

## First-Slice Corrective Pass

Screenshot review of the first manager-v2 systems implementation found polish and hierarchy defects rather than runtime defects. The corrective pass stays inside the Systems view and keeps the existing store, services, launch path, and import/export/create/delete behavior unchanged.

Required corrections:

- Rows must keep system names, descriptions, chips, counts, and action buttons inside their row geometry at normal Foundry window widths. Identity text should clamp to concise lines, while unbroken strings may break only as a last resort.
- Systems row status is an inline on/off toggle button, not a static chip. It uses the existing crafting-system `enabled` field, is color-coded for active/disabled state, and delegates persistence through the admin store/crafting system manager.
- The left rail should always expose `Systems`, but deferred feature/admin tabs should not be visible until a crafting system is selected. Once selected, feature-scoped placeholders should follow canonical feature gates: gathering controls environments, essences controls essences, and item tags or recipe categories control tags/categories.
- `System settings` is always the first selected-system rail item. It must not move when other feature-gated items appear or disappear.
- The selected-system rail scope is a static selected-system card with a separate Return to System Library icon button. The system name is prominent, but the card has stable height and long names truncate/clamp before they can overflow or push navigation buttons down.
- The root `Crafting Systems` breadcrumb returns to the systems browser. The selected-system breadcrumb opens that system's in-manager System settings view.
- The top manager-v2 header should not include duplicate view kickers such as `Systems View`, `Recipes View`, or `Components View`; keep the current title and subtitle.
- Count facts in the right inspector should read as compact inline facts. Enabled counts keep the number and first label word together when wrapping, while disabled facts read label-first with emphasized `Off`, e.g. `Gathering environments Off`.
- The systems section header should describe the table and filters only. Import and create actions belong in the top-right application header for this slice.
- The right inspector should be a readable system summary with icon, name, resolution, enabled state, description, counts, and enabled features. It should not include a separate quick-actions card while row actions and header actions already cover the implemented commands.
- At medium and narrow widths, the layout should stack before table columns become unreadable, and primary actions, row actions, search, filter, selected-row state, and inspector content should remain reachable.

## Essence Browser Source UI Correction

The essences browser should follow the same ownership pattern as the environment and component slices: route-level creation lives in the top-right header, row actions own edit/delete, and the inspector owns selected-object evidence and source maintenance.

Required corrections:

- Remove the in-page `Add an essence definition` band. The browser begins with the page header, then filters, then the table.
- Browser source rows use compact evidence, not state badges. A resolved `associatedItem` renders as an image-only Source cell with the source name available to title/accessible labels. Unresolved or absent source evidence renders localized `None`.
- Source filtering still uses existing source state data, but the browser no longer displays `Linked source` badges.
- The selected essence inspector no longer shows a source-state chip under the essence name.
- When effect transfer is enabled, the selected essence inspector shows source controls: resolved sources show image/name in the linked-item card, then `Copy source UUID` and amber `Unlink Source` actions underneath; unresolved sources show the existing essence source picker/drop target.
- Source unlink, picker selection, and drop import persist only through `store.updateEssence(essenceId, { sourceComponentId })`; drops continue to import through `services.importSingleManagedItemFromDrop(data)`.
- The browse-mode inspector does not render an `Essence actions` card. Edit/delete stay in table rows to avoid duplicating controls.

## Localization

All visible text belongs in `lang/`.

The design-system vocabulary should avoid long prose in compact panels. Use short labels, table headers, chip labels, tooltip labels, and empty-state strings that can tolerate longer localized values.

## Screenshot Acceptance

Future implementation must capture and inspect:

- manager-v2 systems list at normal width with left rail, table, selected-row state, inspector, and import/export actions visible
- manager-v2 components browser at normal width with drop-to-add import, filters, selected-row state, tags, essences, usage legend, source states, and inspector visible
- manager-v2 tags/categories view at normal width with split tag/category management, search/add flows, usage counts, cleanup actions, right guidance/summary panels, and disabled-feature states visible
- manager-v2 recipes browser at normal width with left rail, recipe table, selected-row state, inspector requirements preview, and create/import/export actions visible
- manager-v2 recipe editor at normal width with tab strip, overview summary, right evidence column, and recipe-structure navigation visible
- manager-v2 recipe Resolution tab with crafting-check section, provider selection, mapping table, result-group summary, failure outcome, validation, and guide panel visible
- manager-v2 recipe Visibility tab with global, player, knowledge, and alchemy mode states covered by screenshots or explicit coverage notes
- manager-v2 essences browser at normal width with source linking, usage summary, warnings, selected essence inspector, and source drop zone visible
- manager-v2 environments list at normal width with real environment imagery and inspector visible
- environment editor at normal width with primary resource authoring and evidence column visible
- actor Crafting app simple recipe state at normal width with actor/source header, active/history bands, shopping list, recipe table, selected recipe inspector, and continue/start action visible
- actor Crafting app complex recipe state at normal width with summary columns, complexity chips, craft-plan inspector, path selector, ingredient groups, source allocation, outcome card, and step timeline visible
- actor Alchemy app at normal width with actor/source header, alchemy system selector, component palette, workbench, discovered recipes, selected discovered-recipe detail, active/history bands, and attempt action visible
- each of the above at narrow container widths with no horizontal overflow
- menu/toggle/search/filter pointer hit tests
- selected-row and focus-visible states
- at least one real linked image fixture for systems/environments, not only fallback icons

## Risks

- A literal copy of the images could import presentation-only content or fake metrics. Only live data-backed panels belong in product UI.
- A literal copy of the recipe editor could flatten Fabricate recipes into generic ingredients and outputs. Recipe editor implementation must remain mode-aware and expose ingredient sets, result groups, catalysts, and visibility/knowledge rules.
- A new app shell can drift from existing behavior if it forks store logic. Reuse the existing store and callbacks first.
- A broad reskin can create CSS collisions. Scope manager-v2 selectors and prefer shared tokens.
- The right inspector can become too heavy at Foundry window sizes. Container-query stacking is required.
- Green accent overuse can flatten hierarchy. Green is primary action, active selection, and positive status only.

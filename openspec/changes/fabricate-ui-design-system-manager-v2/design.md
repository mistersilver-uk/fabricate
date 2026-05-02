# Design: Fabricate UI Design System And Manager V2

## Boundary Decision

Introduce the redesigned manager as a parallel app rather than replacing the current GM crafting admin in the first implementation pass.

## Reference Screenshots

Reference screenshots live in `references/`:

- [Browse Crafting Systems](<references/Browse Crafting Systems.png>)
- [Browse Components](<references/Browse Components.png>)
- [Browse Essences](<references/Browse Essences.png>)
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

- [Browse Crafting Systems](<references/Browse Crafting Systems.png>): keep as the manager shell anchor; discard decorative or non-data-backed metrics.
- [Browse Components](<references/Browse Components.png>): keep the component table, drag/drop import, filters, usage legend, and inspector; change labels/data to Fabricate component semantics and keep recipe items distinct.
- [Browse Essences](<references/Browse Essences.png>): keep the essence table, source linking, usage summary, drop zones, and inspector; show only when essences are enabled and do not treat essences as components.
- [Browse Gathering Environments](<references/Browse Gathering Environments.png>): keep the environment index hierarchy and image-backed inspector; discard fake summary/help dashboards.
- [Browse Recipes](<references/Browse Recipes.png>): keep the recipe table and selected-recipe inspector; derive requirements preview from real ingredient sets.
- [Edit Crafting System Tags and Categories](<references/Edit Crafting System Tags and Categories.png>): keep the split management layout, usage counts, search/add flows, cleanup actions, and right evidence panels; discard hierarchical categories, inherited subcategories, and multiple categories per recipe unless later data-model work adds them.
- [Edit Gathering Environment](<references/Edit Gathering Environment.png>): keep the compact editor and evidence-column structure; discard unsupported gathering fields.
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

### Recipes

Use the later recipe browser and editor images as the visual target, but keep Fabricate's canonical recipe semantics.

Browser main list columns:

- recipe with image, name, status, and description
- category
- type or recipe classification when available
- status with toggle and label
- craft time summary
- last updated
- row actions

Browser inspector:

- recipe image
- recipe name and status
- description
- category, type, craft time, experience, tags, created/updated metadata
- requirements preview derived from the first satisfiable ingredient set or selected preview set
- quick actions: edit, duplicate, delete

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

Toolbar:

- search
- status/source-state filter
- clear filters
- list/grid view toggle if useful
- create essence primary action
- import/export actions only when they use existing manager behavior

Inspector:

- large essence icon
- essence name and active/available state
- tabs for details, usage, and source
- basic information: name, description, essence id with copy action
- source item card with resolved/stale status, open action when available, unlink action, and drop zone for replacement
- usage summary covering ingredients, catalysts, results, gathering, and salvage output when those references can be derived
- warnings for missing/stale source item and destructive usage impact
- quick actions: edit, duplicate, delete

Editor:

- name
- icon picker using the existing essence icon behavior
- description
- optional source item link from drag/drop or picker
- stale source warning and clear/replace source actions

The essence view should preserve the artistic direction in the image: icon-led rows, source-item linkage in the table, green linked state, dashed drop zones, compact usage summary tiles, and an inspector that separates details, usage, and source. It must not treat essences as components, recipes, or general item tags.

### Items, Rules, Graph, Alchemy

These views should adopt the design system without changing their semantics.

- Items: table/grid hybrid with item image, tags/essences/difficulty/salvage facts, and inspector.
- Rules: settings grouped into compact panels with semantic summaries and evidence/validation where useful.
- Graph: graph remains a tool surface, but shell, toolbar, and inspector styling should match manager-v2 tokens.
- Alchemy: use the same shell and evidence panel model while preserving existing alchemy behavior.

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

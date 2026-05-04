# Review: Design System And Manager V2 Against Reference Images

## Review Inputs

- [Browse Crafting Systems](<references/Browse Crafting Systems.png>): systems manager with left rail, systems table, selected-system inspector, import/export actions.
- [Browse Components](<references/Browse Components.png>): component browser with drop-to-add affordance, filters for tags/essences/source, usage legend, selected-component inspector, and component/source actions.
- [Browse Essences](<references/Browse Essences.png>): essence browser/editor with essence table, source-item linking, selected-essence inspector, usage summary, warnings, and actions.
- [Edit Gathering Environment](<references/Edit Gathering Environment.png>): environment editor with compact editor header, resource authoring, preview/balance/validation evidence.
- [Browse Gathering Environments](<references/Browse Gathering Environments.png>): environments manager with feature rail, searchable environment table, selected-environment inspector, summary/help rail blocks.
- [Browse Recipes](<references/Browse Recipes.png>): recipe browser with system rail, searchable recipe table, selected-recipe inspector, requirements preview, and recipe actions.
- [Edit Crafting System Tags and Categories](<references/Edit Crafting System Tags and Categories.png>): system-level tags/categories view with split management columns, search/add flows, usage counts, cleanup actions, guidance, summary, and examples.
- [Edit Recipe Overview](<references/Edit Recipe Overview.png>): recipe editor with tabbed editor shell, overview page, right evidence column, and save actions.
- [Edit Recipe Resolution](<references/Edit Recipe Resolution.png>): recipe editor Resolution tab with provider selection, mapping table, result-group summary, validation, failure outcome, and guide panels.
- [Edit Recipe Results](<references/Edit Recipe Results.png>): recipe editor Results tab with result-group structure, active group editor, component palette, mode context, and validation.
- [Edit Recipe Steps and Ingredients](<references/Edit Recipe Steps and Ingredients.png>): recipe editor Steps / Ingredients tab with structure rail, active set editor, and source palette.
- [Recipe Edit Visibility](<references/Recipe Edit Visibility.png>): recipe editor Visibility tab with system-owned visibility context, linked recipe item card, effective visibility, validation, example scenario, and documentation links.

These references are reviewed as imperfect design inputs. The written design system and UI delta are the source of truth when a reference image omits required Fabricate behavior or conflicts with the domain model.

## Pass 1 Findings

### Systems Manager

The design system covers the major traits from image 1:

- dark shell
- left rail
- central searchable/filterable table
- selected-row green state
- right inspector
- quick actions
- import/export action group
- compact pagination

Gap found: the first draft needed stronger language that manager-v2 is additive and must define an explicit launch path. The delta spec includes that requirement.

### Environments Index

The design system covers the major traits from image 4:

- feature navigation rail
- environment table with images
- filters and view toggle
- selected-environment inspector
- summary/help rail blocks
- quick actions

Gap found: the image uses real environment imagery as a major polish signal. The design system and delta now require linked image fixtures and forbid fallback-only screenshot acceptance for image-heavy UI.

### Environment Editor

The design system covers the major traits from images 2 and 3:

- compact object header
- tab/workflow structure
- primary resource/result authoring
- right evidence column
- validation/balance/preview panels
- advanced behavior below primary composition
- stable row controls

Gap found: the reference includes presentation-board panels that should not ship. The design system and delta explicitly reject explanatory critique panels and decorative dashboards in product UI.

### All Fabricate UI Applications

The design system applies the look across:

- GM manager/admin
- recipe editor
- player crafting app
- player gathering app
- pickers and dialogs

Gap found: the first pass could overuse the manager-specific three-column layout. The final design system says manager/admin uses the full shell, while player apps reduce GM-only chrome and keep the same tokens, spacing, row, and evidence language.

Gap found: the first spec wording applied mainly to new/redesigned apps. The final delta now makes the design system the target for all Fabricate product UI while allowing existing surfaces to migrate incrementally.

## Color And Polish Review

The colors encode the screenshots' intent:

- near-black blue/green neutral shell
- layered dark surfaces
- green primary accent
- blue draft/info
- amber warning/medium
- red danger/invalid
- purple rare/special

The design system avoids gradients and glass effects, matching Fabricate's existing flat style rule while still allowing the screenshot's polished depth through borders, opacity layers, and restrained shadows.

## UX Review

The proposed rules should produce the desired UX because they require:

- one primary work surface per view
- search/filter controls near the data
- selected-object details without leaving the list
- live evidence near complex editing
- stable table rows for comparison
- semantic collapsed summaries for advanced configuration
- container-query responsive behavior for Foundry windows

## Iteration Outcome

After review, the docs were adjusted to make these points explicit:

- Manager V2 is additive and parallel.
- Manager V2 must define an explicit launch path before implementation.
- Image-backed views need representative linked-image fixtures.
- Presentation-board explanatory panels must not ship.
- Evidence panels must be live data-backed.
- The design system applies to all Fabricate apps without forcing player apps into GM management chrome.
- Existing apps may migrate incrementally, but future UI work must move toward this system.

## Implementation Plan Review

The first implementation slice should be deliberately narrower than the full delta. The reviewed plan is approved for implementation when it creates a parallel `CraftingSystemManagerV2` shell with a real Systems view, then changes the GM Items Directory `Manage Crafting Systems` button to open v2. This delivers the strongest parts of the conceptual systems-manager reference: dark product shell, left rail, table-first central work area, selected-row emphasis, right inspector, compact toolbar, and clear create/import/export/delete actions.

Plan feedback:

- Keep the current `SvelteRecipeManagerApp` registered and available. The item-directory button may open v2 once the basic shell exists, but the old app must not be deleted or behavior-replaced internally.
- Reuse `createAdminStore()` and the existing service callbacks as the implementation contract. Store additions, if any, should be read-only derived display data only.
- For the first slice, show real existing data only: system name, description, enabled state, resolution mode, feature flags, component count, recipe count, gathering environment count, and supported actions.
- Defer components, essences, tags/categories, recipe editor, graph, and environment editor v2 screens. Placeholders may exist in the left rail, but they must not imply unsupported new behavior.
- Keep presentational Svelte components free of direct Foundry globals. Foundry access belongs in the ApplicationV2 wrapper services.
- Use scoped manager-v2 selectors and shared `--fab-*` tokens so the palette can migrate across apps without destabilizing current admin styles.
- Do not add npm dependencies.

Domain caveats captured during review:

- Do not invent version, timestamps, biome, size, source-state metadata, recipe tags, required stations, skill requirements, output quality, byproducts, or recipe-local resolution mode.
- Do not add recipe `dnd5e`/`pf2e` crafting-check provider UI in this implementation; the canonical recipe check contract is macro-oriented today.
- Do not implement essence source-item editing until current runtime/source-link semantics are reconciled with the delta.
- Treat `mapped` and `tiered` as legacy compatibility labels if encountered, while new v2 copy should move toward canonical `routed` language.

First-slice acceptance should prove structure and usability rather than pixel copying:

- normal-width shell has left rail, systems table, selected row, right inspector, compact header, search/filter toolbar, and action group
- empty state is compact and actionable
- long names/descriptions do not overlap row actions or inspector controls
- narrow container rules avoid horizontal overflow and keep primary actions reachable
- row selection, search, create, import, export, delete, and inspector quick actions are keyboard and pointer reachable where implemented

## Pass 2 Recipe Findings

### Recipe Browser

The recipe browser direction is a strong fit for Manager V2.

Covered traits:

- selected system context in the left rail
- central recipe table with search, filters, pagination, and row actions
- selected recipe inspector with image, status, metadata, requirements, and quick actions
- green selected-row state and primary create action
- dark neutral shell aligned with the systems and environments direction

Spec additions:

- added a manager-v2 recipes browser requirement
- required requirements preview to come from Fabricate ingredient-set data
- required alternatives to be disclosed when a recipe has multiple ingredient sets
- required existing create/import/export/edit/duplicate/delete behavior to be preserved

### Recipe Editor

The recipe editor image has the right visual shell but still needs strict structural guidance.

Useful traits to preserve:

- compact breadcrumb/header with save draft, cancel, and save recipe
- tabbed editor navigation
- overview summary and next-step guidance
- right evidence column with recipe summary, validation, previews, and quick actions
- consistent dark shell, green active states, and stable form geometry

Model risks found:

- overview fields alone can imply a recipe is a flat form
- time/currency controls can hide the fact that requirements belong to a step or implicit step
- ingredient previews can flatten ingredient-set alternatives
- result preview can flatten result groups
- generic fields such as required station, minimum skill, output quality, or byproduct do not belong unless the data model adds them
- visibility cannot be represented as a generic hidden checkbox

Spec additions:

- added a manager-v2 recipe editor requirement
- required tabs for overview, steps/ingredients, results, resolution, visibility, and advanced
- required ingredient-set, ingredient-group, and option structure to remain visible
- required catalysts to remain separate from normal ingredients
- required result groups rather than generic outputs
- required mode-aware resolution UI for simple, routed, progressive, and alchemy systems
- required visibility controls to follow global, player allow-list, and knowledge/item-learning modes
- explicitly blocked unsupported generic crafting concepts without a separate OpenSpec change

## Pass 3 Essence Findings

### Essence Browser And Editor

The essence direction is a strong fit for Manager V2.

Covered traits:

- selected system context in the left rail
- central essence table with search, status filter, pagination, and row actions
- icon-led essence identity
- source item linkage shown directly in each row
- right inspector with details, usage, source state, warnings, and quick actions
- green linked/active state and dashed source drop zones
- compact usage summary tiles

Domain risks found:

- essences can be mistaken for components or general item tags unless the UI keeps them definition-focused
- source item linkage must be optional and stale-but-readable
- usage counts must come from component and authored-structure references, not fake metrics
- effect-transfer readiness should appear only when supported by source resolution and system configuration
- deletion needs usage-impact warning because components reference essences by id

Spec additions:

- added a manager-v2 essences view/editor requirement
- required the view to be feature-gated by `features.essences`
- required source states for linked, stale, missing, and no-source cases
- required drag/drop or picker source linking as the canonical interaction
- required details, usage, and source inspector sections
- required usage summaries to be derived from current system data
- required stale source warnings to preserve `sourceItemUuid`
- explicitly blocked treating essences as components, recipe items, or tags

## Pass 4 Steps / Ingredients Findings

The latest Steps / Ingredients design has several keepable elements even though the right column and resolution/validation placement still need correction.

Keepable traits:

- compact step cards with order, name, status, and summary chips
- compact ingredient-set cards that make alternatives scannable
- focused center editor for one active ingredient set
- breadcrumb showing current step and ingredient set
- active set header with editable name, routed mapping chip, counters, and validity state
- group blocks that keep each required group visually contained
- simple option rows with image/icon identity, quantity, consume toggle, validity, and row actions
- tag-matching row using chips
- collapsed catalyst, time, and currency panels with configured summaries
- green active state, amber warning state, and the restrained manager-v2 surface styling

Corrections preserved in the spec:

- resolution mode is system-owned and belongs in the left structure rail with an edit-crafting-system link
- validation belongs in the left structure rail under resolution, steps, and sets
- the right column should become a Components / Essences / Tags source palette rather than another summary column
- option creation must support explicit component, essence, and tag option types
- the implementation must support drag/drop from the source palette into option rows and groups

Spec additions:

- added a dedicated manager-v2 `Steps / Ingredients` tab requirement
- required left structure rail, center active editor, and right source palette at normal widths
- required compact step and ingredient-set cards
- required active set header, mapped-result chip, group blocks, simple option rows, tag/essence distinction, and collapsed requirement summaries
- required screenshots for drag/drop hover states, option types, validation links, and narrow-width stacking

## Pass 5 Steps / Ingredients Iteration Findings

The latest Steps / Ingredients iteration resolves the major workflow issues from Pass 4.

Newly keepable traits:

- resolution mode appears as system-owned context at the top of the left structure rail
- validation appears below resolution, steps, and ingredient sets
- right column is a real source palette with `Components`, `Essences`, and `Tags` tabs
- component palette entries show image, name, source-link state, tags, and essence count
- option rows now use explicit type badges for `Component`, `Essence`, and `Tags`
- essence options show an essence icon and required amount
- tag options show match logic and match count
- OR relationships are represented by compact dividers instead of graph-like structure
- the palette includes search, filters, and a dashed drag target

Spec additions:

- required option type badges
- required compact OR dividers
- required palette search/filter controls
- required component, essence, and tag palette entry details
- required a visible palette drop target
- expanded screenshot criteria to cover palette filters, option types, and drop target behavior

## Pass 6 Resolution Model Findings

The Resolution tab needs to keep two concepts separate:

- crafting check: determines whether crafting succeeds or fails
- successful result provider: determines which result group is awarded after success

Recommended model:

- simple mode: optional check gates the single result group
- progressive mode: required check returns the numeric value used to award ordered results
- routed ingredient-set mapping: check passes first, then ingredient set mapping selects the result group
- routed roll-table provider: check passes first, then the roll table selects or maps to a result group
- routed macro provider: macro may act as check, result provider, or both only where the backing data contract explicitly combines those responsibilities; UI must not claim exhaustive validation of dynamic macro outcomes

Spec additions:

- added a dedicated manager-v2 `Resolution` tab requirement
- required separate crafting-check and successful-provider sections
- clarified simple, progressive, ingredient-set mapping, roll-table, and macro-provider mode fit
- required provider choices for ingredient-set mapping, roll table, and macro where valid
- required failure outcome to be separate from normal success result groups
- disallowed per-mapping-row checks in the first manager-v2 design
- removed global reserved-keyword warnings from explicit dropdown mapping
- required normalized result-group name uniqueness where names are used for display/selection
- required macro provider UI to be honest about limited validation

## Pass 7 Added Reference Findings

The newly added reference images are useful enough to include, but each needs an explicit interpretation.

### Components Browser

Accepted with domain corrections.

Keep:

- prominent drop-to-add item import
- explicit component versus recipe item drop action
- component table with images, tags, essences, difficulty, usage, source state, and row actions
- selected component inspector with details, usage, salvage, source, and actions
- compact usage legend

Change or discard:

- keep components distinct from recipe items and generic Foundry items
- usage counts must be derived from recipe, gathering, and salvage references
- source states must warn on stale references instead of silently dropping data

### Essences Browser

Accepted with domain corrections.

Keep:

- icon-led essence identity
- source item linkage in rows and inspector
- dashed source drop zones
- usage summary and warnings
- details, usage, and source inspector structure

Change or discard:

- show only when essences are enabled
- do not treat essences as components, recipe items, or tags
- effect-transfer readiness must be evidence from source resolution, not decorative status

### Recipe Resolution

Use with changes.

Keep:

- provider cards
- ingredient-set mapping table
- result-group summary
- validation placement
- failure outcome section
- guide and documentation panel

Change or discard:

- add the missing separate crafting-check section
- do not mark duplicate ingredient-set to result-group mappings invalid unless a later domain rule introduces that restriction
- do not present provider behavior as system-owned when the implementation data contract stores provider choice on the recipe
- keep failure outcome separate from normal result groups

### Recipe Visibility

Accepted as the knowledge-mode visual reference, with required mode variants.

Keep:

- system-owned visibility context
- system-owned knowledge mode context
- linked recipe item card
- item matching explanation
- effective player visibility panel
- example scenario panel
- validation and documentation placement

Change or discard:

- replace code-like labels such as `dragDropEnabled` with human-readable product copy
- adapt example scenarios to the active mode only
- include separate global, player allow-list, learned, item-or-learned, and alchemy states
- do not reintroduce environments, roles, permissions, tags, skills, progression gates, or world-state gates as recipe visibility controls

Spec additions:

- added all current reference images to proposal, design-system, design, review, and UI delta reference lists
- added explicit reference keep/change/discard decisions
- added a dedicated manager-v2 `Components` view/editor requirement
- added a dedicated manager-v2 `Visibility` tab requirement
- tightened design-system rules for component directories and recipe visibility editors

## Pass 8 Tags And Categories Reference Findings

The tags/categories reference is accepted with domain corrections.

Keep:

- split management layout for tags and categories
- search and add affordances in each column
- usage counts beside each entry
- edit/delete row actions
- export and unused-cleanup action placement
- right guidance, system summary, example scenario, and documentation panels
- compact header with view-system-overview and save/dirty action area

Change or discard:

- tags are `CraftingSystem.itemTags`, used by components and tag-placeholder ingredients; do not describe them as generic recipe tags
- categories are flat `CraftingSystem.categories` values plus implicit reserved `General`
- recipes have one category, not multiple categories
- category hierarchy, parent/child inheritance, subcategories, and folder nesting are not supported by the current data model
- category descriptions are not currently persisted and should not be editable until a data-model change adds category metadata
- unused cleanup must be derived from real references and must not remove entries still in use

Spec additions:

- added the tags/categories reference to proposal, design-system, design, review, and UI delta reference lists
- added a dedicated manager-v2 `Tags and Categories` requirement
- added design-system guidance for item tags, flat categories, reserved `General`, usage counts, disabled feature states, and cleanup behavior

## Final Iteration Outcome

No further design-system gaps are blocking at the specification level. Implementation should proceed only after this OpenSpec change is accepted.

## Implementation Plan Review: Recipes Browser Slice

The second implementation slice is approved as a browser-only `Recipes` view inside `CraftingSystemManagerV2`.

Plan feedback:

- Promote `Recipes` from a disabled placeholder to a real route only after a crafting system is selected.
- Keep create and edit routed through the existing recipe editor and service callbacks; this slice must not implement inline editing or the manager-v2 recipe editor shell.
- Use existing recipe actions from the admin store for create, import, export, duplicate, delete, and enabled toggle so persistence, cleanup, and validation ownership stay centralized.
- Add only derived display data to `adminStore` where needed for the browser: description, counts, structure labels, and requirements preview. Do not add a second recipe behavior path.
- Keep the table compact at `1200x790`: recipe identity, category when backed by the selected system, structure, status, requirements, and actions.
- Omit unsupported conceptual fields from the reference image until backed by data contracts: station, minimum skill, output quality, byproduct, XP, rarity, owner, recipe-local resolution mode, and invented timestamps.

Domain caveats captured during review:

- Recipe rows must remain scoped to the selected crafting system.
- Requirements preview must respect explicit multi-step recipes. Use execution-step semantics when available, not only top-level `ingredientSets`.
- `locked` is not hidden; keep locked/unlocked distinct from enabled/disabled and visibility.
- Do not apply player-facing alchemy discovered-recipe rules to the GM manager browser.
- Do not show knowledge-mode visibility summaries unless a later derived-view-state task adds canonical support.

Screenshot and pointer acceptance:

- Capture `manager-v2-recipes-normal` at `1200x790` with the Recipes nav active, at least two recipe rows, a selected recipe row, and a populated inspector.
- Capture `manager-v2-recipes-stacked` at `1000x700` proving rail, main list, and inspector stack without horizontal overflow or clipped action controls.
- Prove at least one data-backed recipe image where the smoke fixture provides one.
- Pointer hit tests must cover Recipes nav, search, status/category filters, row selection, enabled toggle, create, import, export, edit, duplicate, and delete targets.

## Implementation Plan Review: Systems Browser Corrective Slice

The systems browser needs a corrective pass before broader manager-v2 rollout continues.

Plan feedback:

- Add breadcrumbs as a first-class navigation element, not as decorative header text. The root breadcrumb should return to the systems browser, and selected-system breadcrumbs should make the current system scope visible.
- Remove `Systems` from the left feature rail. Systems browser navigation belongs to the selected system scope control and the root breadcrumb.
- Keep the systems list as a browser surface. It should show identity, resolution/status, and row actions; counts belong in the right inspector to avoid duplicate information density.
- Add an Edit row action for systems, but route it through the existing system editor behavior until a manager-v2 system editor is separately planned.
- Preserve accessible focus-visible state while removing the unwanted orange host focus ring on system-name clicks.

Screenshot and pointer acceptance:

- Normal-width systems screenshot must show breadcrumbs, no `Systems` left-rail tab, contained system names/descriptions/badges, no duplicate row counts, and a tidy inspector header.
- Pointer hit tests must cover root breadcrumb, selected-system scope click, system row selection, system Edit, Export, Delete, and the existing recipe navigation.

## Design Review: Edit Essence Reference

The new [Edit Essence](<references/Edit Essence.png>) reference is a dedicated edit-route concept, not an inline expansion of the browse essences table.

Accepted direction:

- Route hierarchy: `Crafting Systems > {system} > Essences > Edit Essence`.
- Top save/cancel strip with dirty-state evidence.
- Primary identity card with icon, name, and description.
- Pop-over icon selection opened from a `Change Icon` style control.
- Conditional effect source card with linked source item evidence, open/replace actions, drag/drop or browse linking, and stale-impact warnings.
- Right evidence rail with identity preview, details/usage/source sections, validation, duplicate, and delete actions.

Corrections before implementation:

- The browse essences page must not contain inline edit fields. Row Edit opens this route.
- Source UI appears only when effect transfer is enabled for the selected system. When disabled, hide source columns, filters, source sections, warnings, and controls rather than showing inert source UI.
- The icon picker must be a pop-over picker. Raw FontAwesome class entry may exist only as an advanced fallback, not the primary interaction.
- Usage tiles must be derived from real Fabricate references; do not add unsupported created/updated/user metadata unless the store can supply it.

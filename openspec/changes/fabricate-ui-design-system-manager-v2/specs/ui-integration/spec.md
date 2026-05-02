# UI Integration Delta

## Reference Screenshots

This delta is informed by screenshots in `openspec/changes/fabricate-ui-design-system-manager-v2/references/`:

- [Browse Crafting Systems](<../../references/Browse Crafting Systems.png>)
- [Browse Components](<../../references/Browse Components.png>)
- [Browse Essences](<../../references/Browse Essences.png>)
- [Browse Gathering Environments](<../../references/Browse Gathering Environments.png>)
- [Browse Recipes](<../../references/Browse Recipes.png>)
- [Edit Crafting System Tags and Categories](<../../references/Edit Crafting System Tags and Categories.png>)
- [Edit Gathering Environment](<../../references/Edit Gathering Environment.png>)
- [Edit Recipe Overview](<../../references/Edit Recipe Overview.png>)
- [Edit Recipe Resolution](<../../references/Edit Recipe Resolution.png>)
- [Edit Recipe Results](<../../references/Edit Recipe Results.png>)
- [Edit Recipe Steps and Ingredients](<../../references/Edit Recipe Steps and Ingredients.png>)
- [Recipe Edit Visibility](<../../references/Recipe Edit Visibility.png>)

The screenshots are imperfect visual references. They should guide structure, density, spacing, hierarchy, and polish only when those details align with this written delta and the change design docs. If a screenshot conflicts with Fabricate's domain model, feature gates, validation, accessibility, responsive behavior, or source-of-truth written requirements, the written specification takes precedence.

## ADDED Requirements

### Requirement: Fabricate product UI design system

Fabricate product UI MUST follow a shared design system across Svelte applications.

1. Fabricate product UI MUST use a dark neutral shell, restrained borders, compact spacing, and green primary accents consistent with `openspec/changes/fabricate-ui-design-system-manager-v2/design-system.md`.
2. Product UI MUST remain flat: no product surfaces, headers, buttons, overlays, selected states, or control backgrounds may use CSS gradients or blur-glass effects.
3. Major management views SHOULD use a left navigation/scope rail, central work region, and selected-object inspector at normal widths.
4. Dense management views SHOULD prefer table-like row geometry when users need to compare objects by status, counts, dates, type, or ownership.
5. Cards MAY be used for image browsing, item previews, modals, and framed tools, but dense management surfaces MUST NOT become nested card stacks.
6. Image-backed panels MUST use real object, item, recipe, scene, environment, or representative fixture imagery. Decorative image panels with no data meaning MUST NOT be used.
7. Every redesigned app MUST define normal, medium, and narrow container behavior. Responsive behavior MUST be keyed to the application container, not only to viewport media queries.
8. Icon-only actions MUST have accessible labels and visible focus states. Color-coded states MUST include text, icon, or label support.
9. Preview, balance, validation, summary, and inspector panels MUST reflect current application data or draft state. Placeholder metrics and decorative dashboards MUST NOT ship as product UI.
10. Green is reserved for primary action, selected/active navigation, selected row emphasis, and positive status. Warning, danger, draft, rare, and info states MUST use distinct semantic colors.
11. Existing Fabricate UI applications MAY migrate incrementally, but new UI work and material redesigns MUST move GM admin, recipe editor, player crafting, player gathering, pickers, and dialogs toward this shared system instead of introducing a competing visual style.

### Requirement: Crafting System Manager V2 parallel app

Fabricate MUST allow a redesigned crafting system manager app to be introduced alongside the existing GM crafting admin.

1. Manager V2 MUST be additive. The existing `SvelteRecipeManagerApp` behavior and launch path MUST remain available during the initial manager-v2 rollout.
2. Manager V2 SHOULD reuse the existing admin store and service callback contracts for systems, items, recipes, environments, rules, graph, import/export, validation, and dirty-draft protection.
3. Manager V2 MUST NOT change crafting system data models, recipe data models, gathering environment data models, persistence schemas, runtime behavior, or import/export semantics as part of the first UI-focused implementation.
4. Manager V2 presentational Svelte components MUST NOT import or directly reference Foundry globals such as `game`, `ui`, `Hooks`, or `CONFIG`.
5. Manager V2 MUST provide a normal-width shell with left rail, main work region, and right inspector.
6. Manager V2 MUST provide container-query responsive layouts that stack or collapse the rail and inspector without horizontal overflow.
7. Manager V2 MUST preserve localization, keyboard accessibility, focus-visible states, validation linking, and pointer access to menus/toggles/actions.
8. The implementation plan for Manager V2 MUST define the explicit launch path, such as a setting, alternate app factory entry point, or GM-only menu action.

### Requirement: Manager V2 systems view

The manager-v2 systems view MUST follow the systems-manager redesign hierarchy.

1. The systems view MUST present a searchable and filterable systems table as the primary work surface at normal widths.
2. The systems table SHOULD include columns for system identity, status, version, environments, recipes, items, resources/components, last updated, and row actions when that data is available.
3. The first system column MUST include icon/image, name, concise description, and status chip where practical.
4. Inline status toggles MUST preserve existing enable/disable semantics and expose active, disabled, and draft states clearly.
5. Selecting a system MUST populate a right inspector with system image/icon, status, description, key counts, version, timestamps, and quick actions.
6. Quick actions SHOULD include edit, duplicate, export, and delete when the existing behavior supports those actions.
7. Import and export actions MUST remain available from the view header or action group.
8. Empty state MUST be compact and must provide a create-system action.

### Requirement: Manager V2 recipes browser

The manager-v2 recipes browser MUST follow the recipe-browser redesign hierarchy while preserving recipe semantics.

1. The recipes browser MUST present a searchable and filterable recipe table as the primary work surface at normal widths.
2. The recipes table SHOULD include columns for recipe identity, category, type/classification, status, craft time summary, last updated, and row actions when that data is available.
3. The recipe identity column MUST include recipe image, name, concise description, and status chip or active state where practical.
4. Inline recipe status toggles MUST preserve existing enable/disable or locked/visible semantics exposed by the existing admin store; they MUST NOT invent new runtime state.
5. Selecting a recipe MUST populate a right inspector with recipe image, status, description, category, type/classification, craft time, tags, created/updated metadata, requirements preview, and quick actions.
6. The requirements preview MUST be derived from Fabricate ingredient-set data. If more than one ingredient set exists, the preview MUST clearly indicate that it is showing one satisfiable/selected set or summarize multiple alternatives.
7. Create, import, export, duplicate, edit, and delete actions MUST preserve existing recipe manager behavior.
8. Recipe browser screenshots MUST prove selected-row state, inspector requirements preview, row action menus, status/focus states, and narrow-width stacking.

### Requirement: Manager V2 components view and editor

The manager-v2 components view and editor MUST follow the component-browser redesign hierarchy while preserving Fabricate component semantics.

1. The components view MUST present a searchable and filterable component table or list as the primary work surface at normal widths.
2. Component rows SHOULD include component image, name, description, status, tags, essences, progressive difficulty, usage counts, source state, updated metadata, and row actions when that data is available.
3. Component usage counts SHOULD distinguish ingredient, result, catalyst, gathering, and salvage-output references where those relationships can be derived.
4. The view SHOULD include a compact usage legend when multiple usage icons or counts are shown.
5. The toolbar SHOULD provide filters for status, tags, essences, source state, and other current component facets where available.
6. Drag/drop item import SHOULD be prominent. If a dropped Foundry item may be added as either a component or a recipe item, the UI MUST require an explicit drop action choice.
7. Selecting a component MUST populate a right inspector with component image, name, status, description, tags, essence assignments, progressive difficulty where relevant, source preview, usage/salvage/source sections, and quick actions where supported by existing behavior.
8. Source state MUST distinguish linked, stale/unresolved, missing, and no-source states when that information is available.
9. Component source linking MUST warn rather than delete stored source references when a linked source no longer resolves.
10. The component view MUST NOT collapse components, recipe items, and generic Foundry items into one undifferentiated object type.
11. Component screenshots MUST prove drag/drop import, explicit component-versus-recipe-item drop action where applicable, filters, selected row, tags, essences, usage legend, source states, inspector tabs/sections, row action menus, and narrow-width stacking.

### Requirement: Manager V2 tags and categories view

The manager-v2 tags and categories view MUST follow the system-level tags/categories redesign hierarchy while preserving Fabricate's flat item-tag and recipe-category semantics.

1. The view MUST manage system-level organization vocabularies for the selected crafting system.
2. The view SHOULD use a split management surface at normal widths when both `features.itemTags` and `features.recipeCategories` are enabled.
3. The tags section MUST manage `CraftingSystem.itemTags`, not generic recipe tags or visibility tags.
4. The tags section MUST be hidden, disabled, or replaced with an explanatory state when `features.itemTags !== true`.
5. The tags section SHOULD provide search, add, rename/edit, delete, usage count, and unused-tag cleanup affordances where supported by existing store behavior.
6. Tag usage counts SHOULD identify tagged components and tag-placeholder ingredient references where those relationships can be derived.
7. The categories section MUST manage custom entries in `CraftingSystem.categories`.
8. The categories section MUST be hidden, disabled, or replaced with an explanatory state when `features.recipeCategories !== true`.
9. The categories section SHOULD provide search, add, rename/edit, delete, recipe usage count, and unused-category cleanup affordances where supported by existing store behavior.
10. The reserved effective `General` category MUST remain available to recipes, MUST NOT be removable, and MUST NOT be persisted as a custom category entry.
11. Category UI MUST present categories as flat values. It MUST NOT introduce hierarchy, parent/child inheritance, folder nesting, or multiple categories per recipe unless a separate data-model change adds those contracts.
12. Category descriptions MUST NOT be presented as editable persisted fields unless a separate data-model change adds category metadata.
13. New and renamed tags/categories MUST follow canonical normalization: unique, trimmed strings.
14. Bulk delete unused actions MUST operate only on entries with zero derived references and MUST preserve existing store/runtime behavior.
15. Deleting or renaming in-use tags/categories SHOULD surface usage impact before applying the existing behavior.
16. Right evidence panels SHOULD include how-it-works guidance, system summary, example scenario, and documentation links, but MUST describe Fabricate semantics rather than unsupported hierarchy or multi-category behavior.
17. Tags/categories screenshots MUST prove split layout, enabled and disabled feature states, search/add flows, usage counts, reserved `General` treatment, unused cleanup affordances, impact warnings, right evidence panels, and narrow-width stacking.

### Requirement: Manager V2 recipe editor

The manager-v2 recipe editor MUST follow the recipe-editor redesign shell while exposing Fabricate's actual recipe model.

1. The recipe editor MUST use the manager-v2 shell language: left system rail, compact breadcrumb/header, save draft/cancel/save actions, tabbed main editor, and right evidence column.
2. The primary recipe editor tabs SHOULD be `Overview`, `Steps / Ingredients`, `Results`, `Resolution`, `Visibility`, and `Advanced`.
3. The `Overview` tab MUST edit recipe identity and metadata: name, description, category, image/icon, enabled/locked state where applicable, tags, and recipe-item link when knowledge mode requires recipe item matching.
4. The `Steps / Ingredients` tab MUST support both implicit single-step recipes and explicit multi-step recipes. When multi-step recipes are enabled, it MUST expose add, remove, reorder, select, and edit step workflows.
5. Ingredient authoring MUST represent Fabricate's boolean structure: OR across ingredient sets, AND across ingredient groups within a set, and OR across options within a group.
6. Ingredient option rows MUST support component references and tag-placeholder ingredients when item tags are enabled.
7. Catalyst authoring MUST be visually separate from normal ingredients and MUST expose degradation, destruction, and max-use fields wherever those fields are valid.
8. Step or implicit-step requirement editing MUST use Fabricate requirement contracts, including time duration fields and currency requirements only when the selected system enables them.
9. The `Results` tab MUST edit result groups and result rows. It MUST NOT present result groups as a single generic output list.
10. The `Resolution` tab MUST be mode-aware:
    - simple systems expose the single ingredient-set/single result-group contract;
    - routed systems expose provider selection and provider-specific controls for `ingredientSet`, `macroOutcome`, and `rollTableOutcome`;
    - progressive systems expose ordered results, component difficulty badges, award mode, and player-reorder state where applicable;
    - alchemy systems expose provider-specific routing and signature/collision diagnostics.
11. The `Resolution` tab MUST distinguish crafting-check success/failure from successful result-group selection.
12. The `Resolution` tab MUST NOT present system resolution mode as recipe-local state. It MUST show resolution mode as crafting-system-owned context with a path to edit the crafting system.
13. The `Resolution` tab MUST NOT apply reserved-failure-keyword warnings globally when explicit dropdown mapping is used. Result group names MUST still surface normalized uniqueness validation where names are used for display or selection.
14. The `Visibility` tab MUST reflect the selected system's visibility mode: global, player allow-list, or knowledge/item learning. It MUST NOT reduce visibility to a generic hidden checkbox.
15. The `Advanced` tab MAY contain internal ids, notes, rarely used settings, and destructive or expert controls, but it MUST NOT hide save-blocking validation without summary and reveal behavior.
16. The right evidence column MUST be live draft-backed and MAY include recipe summary, ingredient preview, catalyst summary, result preview, live validation, warnings, and quick actions.
17. Recipe editor implementation MUST NOT introduce unsupported concepts such as required station, minimum skill, output quality, or byproduct unless a separate OpenSpec change adds those data contracts.
18. Recipe editor screenshots MUST prove tab navigation, recipe-structure summaries, ingredient-set alternatives, result-group editing, mode-specific resolution UI, validation reveal behavior, and narrow-width stacking.

### Requirement: Manager V2 recipe editor Resolution tab

The manager-v2 `Resolution` tab MUST make the difference between crafting checks and successful result selection explicit.

1. The tab MUST show the selected crafting system's resolution mode as system-owned context, not recipe-owned state.
2. The tab MUST include an affordance to edit the crafting system when the GM needs to change resolution mode or system-level check behavior.
3. The tab MUST explain the core flow: the crafting check determines whether crafting succeeds; the selected provider determines which successful result group is awarded after success.
4. The tab MUST present crafting check configuration separately from successful result selection provider configuration.
5. Crafting check UI SHOULD support system expression providers such as dnd5e/pf2e where available and custom macro checks where supported by the backing data contract.
6. Failed checks MUST be represented as flowing to the configured failure outcome, not to a normal success result group.
7. Per-mapping-row checks MUST NOT be part of the first manager-v2 resolution design. Introducing per-row checks requires a separate OpenSpec change.
8. Simple-mode UI MUST treat the crafting check as an optional or mode-supported gate before the single successful result group is awarded.
9. Progressive-mode UI MUST show that the crafting check produces the value, degree, or pass/fail state consumed by progressive award logic, rather than routing between arbitrary named result groups.
10. Routed ingredient-set mapping MUST evaluate the crafting check before the ingredient-set mapping provider selects a successful result group.
11. Routed roll-table outcome MUST evaluate the crafting check before the roll-table provider is rolled or resolved for a successful result group.
12. Routed macro outcome MUST distinguish a macro used as the success/failure check from a macro used as the successful result provider unless the backing data contract explicitly combines those responsibilities.
13. Routed and alchemy-style successful result selection MUST expose a provider choice between ingredient-set mapping, roll-table outcome, and macro outcome where those providers are valid.
14. Ingredient-set mapping MUST map each ingredient set to exactly one result group using an explicit result-group selector.
15. Ingredient-set mapping validation MUST identify unmapped ingredient sets. It MUST NOT treat multiple ingredient sets mapping to the same result group as invalid unless a separate domain rule is introduced.
16. Roll-table provider UI MUST include a roll-table picker and SHOULD expose inspectable table outcomes with result-group selectors when Fabricate can inspect them.
17. Roll-table provider validation SHOULD warn about inspectable table outcomes that cannot resolve to a result group and result groups that appear unreachable from the inspected table outcomes.
18. Macro provider UI MUST include a macro picker and provider contract guidance.
19. Macro provider UI MUST NOT claim exhaustive pre-runtime validation of possible macro outcomes.
20. Result group summaries SHOULD appear in the Resolution tab as reference material for mapping decisions, with links to edit result groups in the Results tab.
21. Failure outcome MUST be visually separate from success result groups and SHOULD allow custom failure message plus optional failure macro where supported.
22. The Resolution tab SHOULD include a "How this works" guide and documentation link.
23. Resolution screenshots MUST prove provider selection, separate crafting-check and provider sections, ingredient-set mapping, roll-table picker/mapping state where applicable, macro provider guidance, failure outcome configuration, result group summaries, validation placement, and documentation guidance.

### Requirement: Manager V2 recipe editor Visibility tab

The manager-v2 `Visibility` tab MUST adapt to the selected crafting system's visibility model instead of presenting a generic access-control builder.

1. The tab MUST show the selected crafting system's `recipeVisibility.listMode` as system-owned context, not recipe-owned state.
2. The tab MUST include an affordance to edit the crafting system when the GM needs to change visibility mode or knowledge/learning settings.
3. The tab MUST make clear that GM users always see all recipes and that the tab controls non-GM visibility and craftability.
4. In global mode, the tab MUST show a read-only explanation that all enabled, unlocked recipes are visible to non-GM users and MUST NOT show per-recipe allow-list or recipe-item controls.
5. In player mode, the tab MUST expose the recipe-local restricted flag and allowed-user picker.
6. In player mode, a restricted recipe with an empty allowed-user list MUST be presented as valid and hidden from all non-GM users.
7. In player mode, the UI MUST use user terminology. It MUST NOT present role, permission, environment, tag, skill, progression, or world-state gates as recipe visibility controls.
8. In knowledge mode, the tab MUST show `knowledge.mode` as system-owned context and adapt content for `item`, `learned`, or `itemOrLearned`.
9. In item-based knowledge modes, the tab MUST provide a linked recipe item selector or drop zone bound to the recipe's recipe item reference.
10. Linked recipe item presentation MUST include image/name where resolvable, source status, stored identity, clear/unlink, replace/change, and open actions where supported.
11. Item matching guidance MUST explain direct UUID and resolved source UUID matching.
12. In learned knowledge modes, learning settings such as drag/drop learning and consume-on-learn MUST be shown as system-owned evidence, not editable recipe-local toggles.
13. In item-or-learned mode, effective visibility MUST show that either owning the matching recipe item or learning the recipe grants access.
14. In alchemy mode, the tab MUST show that non-GM recipe lists are hidden by default and that learn-on-craft behavior is system-owned where enabled.
15. Effective player visibility and example scenario panels SHOULD appear as right evidence panels, but their pass/fail rows MUST evaluate only the active visibility mode.
16. Validation MUST surface missing required recipe item links, unresolved recipe item definitions, and invalid allowed-user shapes when applicable.
17. Product labels SHOULD be human-readable. Code-like setting names such as `dragDropEnabled`, `manualLearnActionEnabled`, and `consumeOnLearn` MUST NOT be used as primary UI labels.
18. Visibility screenshots MUST prove global, player, knowledge item, knowledge learned, knowledge item-or-learned, and alchemy states or provide explicit coverage notes for omitted states.

### Requirement: Manager V2 recipe editor Steps / Ingredients tab

The manager-v2 `Steps / Ingredients` tab MUST preserve the useful structure of the latest design while supporting fast authoring from Fabricate component, essence, and tag sources.

1. The tab MUST use a focused authoring layout with a left structure rail, center active editor, and right source palette at normal widths.
2. The left structure rail MUST show system-owned resolution context above recipe-local structure. The context MUST identify the selected system's resolution mode and SHOULD include provider implications where relevant.
3. The resolution context MUST link to the crafting system editor for mode changes. It MUST NOT imply that resolution mode is edited per recipe.
4. The left structure rail MUST show compact step cards when multi-step recipes are enabled. Step cards SHOULD show order, name, validity/warning state, and summary chips for ingredient sets, groups, and time or requirement markers.
5. The left structure rail MUST show compact ingredient-set cards for the selected step or implicit step. Set cards SHOULD show set name, group count, option count, catalyst count, routed mapping state when relevant, and validity/warning state.
6. The left structure rail MUST show validation beneath resolution, steps, and ingredient sets. Validation entries MUST link to and reveal the relevant step, set, group, or option before focus.
7. The center active editor MUST focus on one selected ingredient set at a time.
8. The center active editor MUST show a current step and ingredient-set breadcrumb, plus an active set header with editable set name, mapped-result chip when relevant, summary counters, and validity state.
9. Ingredient groups MUST render as concise required-together blocks. The UI SHOULD avoid graph-like connectors when simple group blocks and row separators communicate the boolean structure clearly.
10. Ingredient options MUST render as stable rows. Each row MUST show option type, selected component/essence/tags, quantity or required amount, consumption state where applicable, validity, and row actions.
11. Option rows MUST use visible type labels or badges for component, essence, and tag options.
12. Tag-matching options MUST show tag chips and matching semantics clearly, including match logic and matching component count when available.
13. Essence-based options MUST be visually distinct from component and tag options and MUST make clear that the option matches components carrying the essence rather than selecting the essence definition as an item.
14. Essence-based options MUST expose required essence amount where the data contract requires a quantity.
15. Catalysts, time requirements, and currency requirements MAY be collapsed under the active set or step, but collapsed headers MUST summarize configured state.
16. The right source palette MUST provide `Components`, `Essences`, and `Tags` tabs instead of duplicating step summaries as the primary right-column content.
17. The right source palette MUST provide search and relevant filter controls for the active tab.
18. Component palette entries SHOULD show image, name, source-link state, tags, and essence count when available.
19. Essence palette entries SHOULD show icon, name, source-link state, and usage or matching-component hints when available.
20. Tag palette entries SHOULD show tag label and matching-component count when available.
21. Palette entries MUST be draggable into empty option rows, populated option rows, or ingredient groups where feasible.
22. Dragging a component, essence, or tag from the palette SHOULD create or replace the corresponding option type automatically. Manual add-option flows SHOULD still provide an explicit type choice for keyboard and non-drag users.
23. The palette SHOULD expose a visible drop target for adding a new option from the active palette tab.
24. The tab MUST preserve the latest design's keepable visual elements: compact step cards, compact set cards, active set header, mapped-result chip, group blocks, simple option rows, type badges, tag chips, compact OR dividers, collapsible catalyst/time/currency panels, green active states, and amber warning states.
25. Steps / Ingredients screenshots MUST prove the resolution context placement, step card states, ingredient-set card states, active set editor, group and option rows, component/tag/essence option types, collapsed requirement summaries, validation links, right palette tabs, palette filters, drag/drop hover states, drop target, and narrow-width stacking.

### Requirement: Manager V2 essences view and editor

The manager-v2 essences view and editor MUST follow the essence-browser redesign hierarchy while preserving EssenceDefinition semantics.

1. The essences view MUST be shown only when the selected crafting system has `features.essences === true`.
2. The essences view MUST present a searchable essence table or list as the primary work surface at normal widths.
3. Essence rows SHOULD include essence icon, name, description, source item summary, source-link state, component usage count, last updated when available, and row actions.
4. Source item state MUST distinguish linked, stale/unresolved, missing, and no-source states when that information is available.
5. Source item linking MUST use drag/drop or picker workflows as the primary interaction. Manual UUID entry MUST NOT be the canonical flow.
6. Selecting an essence MUST populate a right inspector with essence icon, name, description, essence id, source item status, usage summary, warnings, and quick actions.
7. The inspector SHOULD expose `Details`, `Usage`, and `Source` views or equivalent sections.
8. The usage summary MUST be derived from current system data and SHOULD identify component usage plus ingredient, catalyst, result, gathering, and salvage-output references where those relationships can be derived.
9. The source section MUST allow replacing, clearing, and opening the linked source item when supported by existing services.
10. Stale or unresolved source items MUST remain readable and warn rather than deleting the stored `sourceItemUuid`.
11. Deleting an essence MUST warn when components or other authored structures reference that essence.
12. The essence editor MUST expose name, icon, description, and optional source item link. It MUST NOT treat essences as components, recipe items, or general item tags.
13. If effect transfer is enabled, the view SHOULD surface whether the linked source item resolves and can provide effects. This display MUST be evidence from current source resolution, not a decorative metric.
14. Essence screenshots MUST prove icon-led identity, source-link states, source drop/replace affordance, usage summary, warnings, row action menus, and narrow-width stacking.

### Requirement: Manager V2 environments view and editor

The manager-v2 environments view and editor MUST follow the environment-index and environment-editor redesign hierarchy while preserving gathering semantics.

1. The environments index MUST present a searchable/filterable environment table or list as the primary work surface at normal widths.
2. Environment rows SHOULD show image, name, status, description, biome, size, difficulty, resource count, last updated, and row actions when data is available.
3. Environment imagery MUST prefer linked scene/environment imagery and MUST use fallback icons only when no image is available.
4. Selecting an environment MUST populate a right inspector with image, status, description, biome, size, difficulty, resource count, updated date, and quick actions.
5. The environment editor MUST use a compact object header, section tabs or workflow navigation, primary resource/result authoring, and a live evidence column.
6. The resource/result authoring area MUST be visually dominant once base environment/task setup exists.
7. Evidence panels MAY include preview, expected output, balance summary, validation, stale-reference warnings, and configured-output summaries, but each panel MUST be backed by current draft data.
8. Advanced behavior sections MAY collapse, but collapsed state MUST expose semantic summaries and reveal invalid fields before focus.
9. The environments view and editor MUST keep save/cancel, validation access, row actions, and selected-object context reachable at narrow container widths.

## MODIFIED Requirements

### Requirement: GM Crafting Admin

The existing GM crafting admin remains valid. Manager V2 is a parallel redesigned app unless a later OpenSpec change explicitly replaces the existing manager.

1. Existing GM admin tabs and behavior remain governed by the current `GM Crafting Admin` requirements.
2. Manager V2 MAY present the same capabilities with different navigation, layout, and visual hierarchy when it preserves the same underlying behavior and validation contracts.

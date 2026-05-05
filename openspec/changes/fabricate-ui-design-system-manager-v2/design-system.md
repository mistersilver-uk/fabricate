# Fabricate Product UI Design System

## Reference Screenshots

The visual reference screenshots for this change are:

- [Actor Crafting App - Alchemy Mode](<references/Actor Crafting App - Alchemy Mode.png>)
- [Actor Crafting App - Crafting Mode - Complex Recipes](<references/Actor Crafting App - Crafting Mode - Complex Recipes.png>)
- [Actor Crafting App - Crafting Mode - Simple recipes](<references/Actor Crafting App - Crafting Mode - Simple recipes.png>)
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

Treat these as directional references for polish, density, hierarchy, and interaction placement. They are imperfect designs and must be interpreted through this design system and the UI delta. Do not copy a screenshot exactly unless its details align with Fabricate's written domain, validation, feature-gating, accessibility, and responsive-layout requirements.

Reference interpretation:

| Reference | Decision | Keep | Change Or Discard |
|-----------|----------|------|-------------------|
| [Actor Crafting App - Alchemy Mode](<references/Actor Crafting App - Alchemy Mode.png>) | Accept as actor alchemy reference | Shared actor/source header, mode tabs, alchemy-system selector, component palette, central workbench, discovered recipes panel, active/history bands | Preserve hidden-recipe and no-signature secrecy rules; do not add shopping list, favourites, or normal recipe browser to alchemy |
| [Actor Crafting App - Crafting Mode - Complex Recipes](<references/Actor Crafting App - Crafting Mode - Complex Recipes.png>) | Accept as complex crafting reference | Crafting browse list, complexity chips, summary columns, craft-plan inspector, path selector, ingredient groups, source allocation, outcome card, active-run timeline | Requirements/result columns must remain summaries; full alternatives, routed/progressive outcomes, step detail, and source allocation belong in the inspector |
| [Actor Crafting App - Crafting Mode - Simple recipes](<references/Actor Crafting App - Crafting Mode - Simple recipes.png>) | Accept as simple crafting baseline | Actor/source header, active/history panels, shopping list, searchable recipe table, selected-recipe inspector, continue/start actions | Do not let the simple flat requirement/result layout become the only design; complex recipes need the craft-plan inspector pattern |
| [Browse Crafting Systems](<references/Browse Crafting Systems.png>) | Accept as manager shell reference | Left rail, systems table, selected-row state, inspector, import/export actions | Discard any decorative metrics not backed by current system data |
| [Browse Components](<references/Browse Components.png>) | Accept with domain corrections | Drop-to-add affordance, component table, tag/essence/source filters, usage legend, selected component inspector | Use Fabricate component semantics; do not confuse components, recipe items, resources, or generic items |
| [Browse Essences](<references/Browse Essences.png>) | Accept with domain corrections | Icon-led essence table, source item linking, dashed drop zones, usage summary, warnings, inspector tabs | Show only when essences are enabled; do not treat essences as components or item tags |
| [Browse Gathering Environments](<references/Browse Gathering Environments.png>) | Accept as environments index reference | Searchable environment table, image-backed inspector, filters, quick actions | Discard presentation-only help panels or fake metrics |
| [Browse Recipes](<references/Browse Recipes.png>) | Accept as recipe browser reference | Recipe table, selected recipe inspector, requirements preview, row actions | Requirements preview must come from real ingredient sets |
| [Edit Crafting System Tags and Categories](<references/Edit Crafting System Tags and Categories.png>) | Accept with domain corrections | Split management columns, search/add flows, usage counts, right help/summary/scenario panels, bulk cleanup affordances | Categories are flat, not hierarchical; each recipe has one category; item tags are component/ingredient-match tags, not generic recipe tags |
| [Edit Gathering Environment](<references/Edit Gathering Environment.png>) | Accept as environment editor reference | Compact editor shell, primary task/resource authoring, evidence column | Do not copy unsupported gathering fields or design-board explanation panels |
| [Edit Recipe Overview](<references/Edit Recipe Overview.png>) | Accept as recipe editor shell reference | Tab strip, save actions, overview structure, evidence column | Do not copy generic recipe fields not backed by Fabricate |
| [Edit Recipe Resolution](<references/Edit Recipe Resolution.png>) | Use with changes | Provider cards, ingredient-set mapping table, result group summary, failure outcome, help panel | Add separate crafting-check section; discard duplicate-result mapping as an error unless a later domain rule adds it; do not say provider behavior is system-owned if the backing recipe contract stores it per recipe |
| [Edit Recipe Results](<references/Edit Recipe Results.png>) | Accept with domain corrections | Result-group rail, active result-group editor, component source palette, validation placement | Keep routing/mapping management in Resolution, not Results |
| [Edit Recipe Steps and Ingredients](<references/Edit Recipe Steps and Ingredients.png>) | Accept with domain corrections | Step/set rail, active ingredient-set editor, typed option rows, source palette | Preserve Fabricate boolean recipe structure and avoid graph clutter |
| [Recipe Edit Visibility](<references/Recipe Edit Visibility.png>) | Accept as knowledge-mode visibility reference with variants required | System-owned visibility context, linked recipe item card, effective visibility, example scenario, validation, docs links | Use human labels instead of code-like setting names; add global, player, learned, item-or-learned, and alchemy variants |

## Design Target

Fabricate UI should feel like a quiet, high-trust game-master workstation: dense, legible, polished, and fast to scan. It should not feel like a marketing site, a fantasy parchment theme, or a generic form stack.

The reference images establish the target:

- dark shell with subtle depth
- green as the primary product accent
- compact left navigation
- table-first management views
- selected-object inspectors
- image-backed context for real game content
- compact headers with clear primary actions
- stable rows and predictable controls
- live preview, summary, balance, and validation panels near the edited data

## Core Principles

### Work Surface First

Every app opens directly into the user's real workflow. Do not use hero sections, onboarding panels, or large explanatory copy as the first visual priority.

### Dense But Calm

Screens should hold real operational data without feeling cramped. Use alignment, spacing, and section weight to create calm. Avoid oversized headings, oversized cards, and decorative filler.

### Object Plus Evidence

Management views should pair a primary object list with a selected-object inspector. Editing views should pair primary configuration with live evidence: preview, validation, balance, output summary, or history.

### Tables For Comparison

When users compare systems, environments, items, recipes, or resources, use table-like row geometry. Cards are reserved for browseable image collections, repeated item previews, modals, and genuinely framed tools.

### One Primary Action

Each view should have one visually dominant action in the header or toolbar. Secondary actions use outline buttons, icon buttons, or overflow menus.

### State Is Visible

Active, disabled, draft, invalid, warning, stale, dirty, and selected states must be visible in the row or panel where the user makes the decision.

### Real Imagery Only

Use images when they represent a system, scene, environment, item, recipe, or result. Do not add atmospheric art merely to decorate an empty panel.

### Flat, Not Plain

The style remains flat: no gradients, glass blur, skeuomorphic parchment, or ornamental glows. Polish comes from tokens, spacing, borders, typography, icons, and restrained shadows.

## Application Structure

### Shell

Use a dark bordered application shell with fixed-height header regions and independently scrollable content regions. Shells should have a radius of `8px` or less and a low-contrast border.

Recommended shell regions:

- `app-shell`: full ApplicationV2 body container
- `side-rail`: persistent navigation or object collection
- `main-region`: selected tab/list/editor work surface
- `inspector-region`: selected-object details, quick actions, summary, or validation

### Left Rail

Use a left rail for primary navigation, system scope, and lightweight summaries.

Rules:

- width target: `220px` to `260px` at normal manager widths
- collapses or stacks at narrow container widths
- active item uses a green-tinted fill and left accent edge
- icon plus label for app navigation
- count badges align right
- no long paragraphs except short help or empty guidance blocks

### Header

Each major view has a compact header with:

- breadcrumb or scope path
- object/view title
- one-line description only when it clarifies the current view
- primary action group on the right
- optional metadata chips

Do not put a full form in the header.

### Toolbar

Search and filters live below the header in a toolbar band.

Patterns:

- search first, left aligned
- filter controls after search
- view toggle and secondary controls right aligned
- reset/clear action uses outline styling
- toolbar height stays compact and stable

### Primary List

Management views use a list/table region as the main work surface.

Rules:

- row height target: `72px` to `92px` for object rows with thumbnails
- thumbnail cell: `56px` to `72px`, fixed size
- first column carries object identity, image, status chip, and summary
- numeric metadata columns align consistently
- row actions cluster at the far right
- selected row uses green border or green-tinted row fill, not large motion
- hover/focus must not shift row geometry

### Manager V2 Browser Route

Feature browsers promoted from placeholders use one durable page pattern:

1. Compact section header with selected-system context.
2. Optional create/import band when the route owns creation.
3. Toolbar with search, filters, and a count chip.
4. Scrollable table/list using stable row geometry.
5. Selected-row inspector with evidence and actions.

Promotion checklist:

- remove the feature from disabled placeholder/deferred-view collections
- add feature-gated left-nav button and active state
- add route normalization for feature-disabled systems
- add breadcrumbs, title, subtitle, and header action labels
- render a focused route component rather than adding another oversized branch to the root shell
- add mounted and source-contract tests proving the route is enabled, clickable, and no longer a placeholder

### Inspector

Inspectors provide selected-object evidence and quick actions.

Content order:

1. real image preview when available
2. object title and status
3. concise description
4. key facts with icons
5. timestamps or ownership
6. quick actions

Inspectors must not become a second editor unless the view explicitly switches to edit mode.

### Editor

Editors use a compact object header, section tabs or workflow rail, primary composition area, and evidence column.

Rules:

- base/overview fields come before advanced behavior
- tabs should describe the domain structure being edited, not generic form buckets
- primary composition gets the largest visual weight
- advanced sections may collapse but must show semantic summaries
- preview, validation, balance, and output summary stay adjacent at normal widths
- save/cancel remain reachable

Recipe editors use this pattern with tabs for `Overview`, `Steps / Ingredients`, `Results`, `Resolution`, `Visibility`, and `Advanced`. The overview tab may summarize setup and next actions, but the structural tabs must expose Fabricate's real recipe model instead of flattening recipes into one ingredient list and one output list.

## Component Patterns

### Buttons

Primary buttons:

- green fill
- text or icon plus text
- used only for the view's primary action

Secondary buttons:

- dark fill or transparent outline
- used for import, export, apply, save, duplicate

Icon buttons:

- square `32px` to `40px`
- clear `title`/aria label
- stable filled hover state
- used for overflow, row actions, view toggles, and compact direct commands

Danger buttons:

- red text or red outline by default
- stronger red fill only for confirmation/destructive final actions

### Search And Filters

Search inputs use a leading icon and full-width text field inside the toolbar. Filters use compact selects, menus, or segmented controls. Clear filters is secondary and must not compete with create/import actions.

### Chips And Badges

Use chips for status and short classifications.

Required status vocabulary:

- `Active`: green
- `Disabled` or `Inactive`: amber or muted red depending severity
- `Draft`: blue
- `Invalid`: red
- `Warning` or `Stale`: amber
- `Linked`: green
- `Missing`: amber
- `None`: muted/disabled

Chips should be compact, with radius `5px` to `6px`.

### Source State

Source-linked management views use consistent source-state language:

- `linked`: the configured source resolves and can be used.
- `missing`: the managed source exists but lacks the source item/template evidence required by the feature.
- `stale`: stored source evidence exists but no longer resolves to the expected managed source.
- `none`: no source has been configured.

Do not silently erase stale source evidence from UI display data. Show enough text evidence for the GM to recognize and clear or repair the link.

### Delete-Blocked State

Destructive actions that are blocked by derived usage evidence use a consistent pattern:

- the destructive icon/button is disabled or guarded
- the tooltip/title explains the blocking condition
- a warning chip appears near the selected object or row action
- the inspector includes the usage evidence and a short remediation hint
- clicking the blocked control must not call the destructive store/service action

### Toggles

Use toggles for enabled/disabled state when changing state inline. Use checkboxes for settings inside forms where the checkbox label carries the semantic meaning.

### Tabs And Segmented Controls

Use tabs for major sections inside an editor. Use segmented controls for small choices such as view mode, selection mode, resolution mode, provider type, and award mode.

### Menus

Overflow menus should hold less common row actions: move, duplicate, export, delete. Menus must remain inside the application window where possible and stay pointer-clickable over image/row surfaces.

### Empty States

Empty states are compact and actionable. They may include an icon, one sentence, and one primary action. Do not create large illustrated empty panels in dense admin surfaces.

### Validation

Validation appears in three layers:

- field-level inline messages
- compact summary panel or banner
- inspector/evidence panel when reviewing a complex object

Validation links must reveal collapsed sections before focus.

### Recipe Structure Editors

Recipe structure editors are mode-aware authoring surfaces.

Required patterns:

- Step navigation is shown when multi-step recipes are enabled and uses compact cards with step name, order, validity, and summary chips.
- Implicit single-step recipes use the same editing concepts without presenting fake step data.
- Ingredient sets are presented as alternatives in a compact selectable list before full editing.
- The active ingredient set is edited in a focused center workspace with a clear step/set breadcrumb.
- The active set header shows the set name, validity, group/option/catalyst summary, and routed result mapping when that mapping is relevant.
- Ingredient groups inside a set are presented as required-together blocks.
- Multiple options inside an ingredient group are presented as OR choices with simple row geometry.
- Option rows show their option type, selected component/essence/tags, quantity, consumption state, validity, and row actions without changing row height on hover.
- Option type badges use concise semantic labels such as `Component`, `Essence`, and `Tags`.
- OR separators should be compact row dividers, not large graph connectors.
- Catalysts are visually separate from normal ingredients because degradation and exhaustion behave differently.
- Catalysts, time requirements, and currency requirements may collapse under the active set or step, but their collapsed headers must expose configured summaries.
- Results are presented as result groups, not generic outputs.
- Resolution context is displayed as system-owned context, with a link to edit the crafting system when the GM needs to change resolution mode.
- Visibility controls change by the selected system's visibility/knowledge mode.
- The Steps / Ingredients source column should provide draggable Components, Essences, and Tags palettes for filling option rows. Validation and recipe summaries should not displace that source palette in the primary authoring workflow.
- Source palette tabs use search, filters, source-state chips, category selectors, and clear drop targets so GMs understand where ingredients come from and where dragged entries can land.

### Recipe Resolution Editors

Recipe resolution editors separate success/failure checks from successful result selection.

Required patterns:

- Show system-owned resolution mode as context, with an edit-crafting-system link when the GM needs to change mode.
- Present crafting check configuration as the success/failure gate.
- Present successful result selection as a separate provider choice.
- Explain the flow in plain language: check determines whether crafting succeeds; provider determines which successful result group is awarded.
- In simple mode, the check gates the single successful result group.
- In progressive mode, the check output feeds progressive award logic rather than arbitrary result-group routing.
- In routed modes, provider selection happens after success: ingredient-set mapping maps satisfied sets, roll-table providers resolve successful outcomes, and macro providers supply dynamic successful outcomes.
- When macros can appear in both areas, label whether the macro is acting as a check, as a result provider, or as an explicitly combined contract.
- Failure outcome is a separate persistent section, not an ordinary success result group.
- Provider UIs should be honest about what Fabricate can validate. Ingredient-set and inspectable roll-table mappings can be validated; dynamic macro outcomes cannot be exhaustively validated before runtime.
- Explicit dropdown mapping should not require reserved-word result-group naming rules. Result group names still need normalized uniqueness where names are shown or selected.

### Recipe Visibility Editors

Recipe visibility editors show recipe-local controls only where the selected crafting system's visibility mode makes them meaningful.

Required patterns:

- Show `recipeVisibility.listMode` as system-owned context, with an edit-crafting-system link.
- In global mode, show a read-only explanation that no per-recipe visibility controls apply.
- In player mode, show the per-recipe restricted flag and allowed-user picker. Use user terminology, not roles or permissions.
- In knowledge mode, show `knowledge.mode` as system-owned context and adapt the body to `item`, `learned`, or `itemOrLearned`.
- In item-based knowledge modes, show the linked recipe item selector/drop zone, source status, direct UUID/source UUID matching explanation, and clear/replace actions.
- In learned knowledge modes, show learning settings as system-owned evidence, not recipe-local toggles.
- In alchemy mode, show that non-GM recipe lists are hidden by default and that learn-on-craft behavior is system-owned.
- Keep the effective player visibility and example scenario panels, but make them evaluate only the active visibility mode.
- Keep validation near the edited recipe-local visibility data, such as missing linked recipe item or invalid allowed-user shape.
- Do not introduce environments, roles, item/component tag include/exclude rules, skill requirements, progression gates, or world-state gates into recipe visibility unless a later approved data contract adds them.

### Actor Crafting Apps

Actor crafting apps are player-facing work surfaces. They use the product tokens and evidence language, but they do not use GM management chrome such as system rails, admin breadcrumbs, import/export actions, or destructive authoring controls.

Shared patterns:

- The persistent header owns crafting actor selection, component source actors, mode tabs, and mode-specific system selection.
- Actor and source controls are compact image-led controls with searchable menus. The selected crafting actor remains a required component source.
- Active runs and recent history sit near the top of the app so resume/cancel/review actions are visible before browsing.
- The main action area changes by mode: Crafting is browse-first; Alchemy is workbench-first.
- Right-side evidence panels explain the selected recipe, selected attempt, current run, or discovered recipe using live actor/source inventory data.
- Player apps must keep start, continue, cancel, details, add-to-list, favourite, auto-fill, and attempt actions reachable without scrolling at normal Foundry window sizes.
- Status and complexity chips use the same semantic color system as manager-v2, but they must describe player-facing state: craftable, available, missing materials, locked, learnable, in progress, complete, complex, multi-step, routed, progressive, or low quantity.
- Player-facing panels must not expose hidden recipe metadata, GM-only diagnostics, stale admin references, or implementation ids unless the viewer is a GM and the runtime contract permits that detail.

### Actor Crafting Mode

Crafting mode is a browse-to-craft workflow for non-alchemy systems.

Required patterns:

- Use the simple crafting reference as the baseline for actor/source header, active run panel, recent history, shopping list, recipe search/filter toolbar, selected row state, and selected-recipe inspector.
- Use the complex crafting reference whenever a recipe has multiple steps, multiple ingredient sets, OR options, optional essences/catalysts, routed outcomes, progressive outcomes, or source-allocation decisions.
- Recipe rows summarize complexity instead of rendering the full recipe tree. Preferred row summaries are counts and chips such as `3 required`, `1 optional`, `2 paths`, `1 choice`, `fixed result`, `routed outcomes`, or `result depends on check`.
- The requirements column is a summary surface. It must not try to display every ingredient set, group, OR option, catalyst, essence, time requirement, and source actor inline.
- The result column is a summary surface. It must distinguish fixed results, learn-recipe outcomes, routed outcomes, progressive/quality-variable results, and locked/unknown results without implying all possible result groups are awarded.
- The selected-recipe inspector carries the full craft plan at normal widths: mode/complexity chips, path selector, ingredient-set/group breakdown, OR choices, optional essences, catalysts/tools, source allocation, time/currency, outcome explanation, and active-run controls.
- Path selection represents ingredient-set alternatives. It should show which path is selected, which paths are satisfiable, and what each path changes. Switching paths updates requirements, source allocation, and routed result evidence where relevant.
- Ingredient groups show AND groups as stacked blocks and OR options as choose-one rows. Source actor allocation appears at the row level when inventory is drawn from multiple actors.
- Active run detail shows the current step, remaining time/progress, and a step timeline for multi-step recipes. It should make completed/current/pending steps visually distinct.
- Shopping list aggregation remains Crafting-only and must account for the selected path or clearly state when it aggregates the currently selected/satisfiable path.

### Actor Alchemy Mode

Alchemy mode is an experiment/workbench workflow, not a normal recipe browser.

Required patterns:

- Use the alchemy reference as the baseline for shared actor/source header, mode tabs, alchemy-system selector, active/history bands, component palette, central workbench, and discovered recipes panel.
- The component palette shows selected-system components owned by the selected component sources, with available quantity calculated as inventory minus the workbench quantity.
- Palette state uses clear availability treatments: available, low quantity, and unavailable/zero quantity. Zero-quantity components may remain visible but cannot look craftable.
- The workbench is the primary composition surface. It supports click-to-add, right-click/direct remove, drag/drop, quantity grouping, clear all, and a single primary attempt action.
- The discovered recipes panel is always visible. It shows learned/discovered recipes only according to the canonical visibility rules; non-GM users must not see undiscovered recipe rows.
- Discovered recipe rows can offer auto-fill into the workbench. Auto-fill must follow the canonical first-satisfiable-set algorithm and report unfulfilled groups when no complete set can be filled.
- Selected discovered recipe detail may show expected result, required components, required essences, and missing state because the actor has discovered the recipe. Hidden or failed attempts must not disclose this detail.
- Alchemy excludes the Crafting shopping list, normal recipe browse list, recents list, and favourites. Active runs and history are filtered to alchemy systems only.
- Attempt feedback must distinguish success, normal failed/no-signature attempt, and GM-fix misconfiguration without leaking hidden recipe identity to non-GM users.

### Component Directory Editors

Component directory editors manage Fabricate components: the item-backed ingredients/results/catalysts used by recipes, gathering, and salvage.

Required patterns:

- Use image-led table rows with component name, description, status, tags, essences, progressive difficulty, usage counts, source state, updated metadata, and row actions where available.
- Provide search plus filters for status, tags, essences, source state, and other current component facets.
- Keep drag/drop item import prominent. When a drop can create either a component or recipe item, require an explicit drop action choice.
- Show usage counts with a compact legend for ingredient, result, catalyst, gathering, and salvage-output references where those relationships can be derived.
- Selecting a component opens a right inspector with image, name, status, tabs or sections for component details, usage, salvage, and source.
- Inspector details include editable tags, essence assignments, progressive difficulty, source preview, and quick actions when existing behavior supports them.
- Source state must distinguish linked, stale/unresolved, missing, and no-source states without deleting stored references.
- Do not flatten recipe items, components, and generic Foundry items into one undifferentiated directory.

### Tags And Categories Editors

Tags and categories editors manage system-level organization vocabularies.

Required patterns:

- Use a split work surface when both item tags and recipe categories are enabled: item tags on one side, recipe categories on the other.
- Show disabled or read-only explanatory states when `features.itemTags` or `features.recipeCategories` is off, with a link to edit system features.
- Treat item tags as `CraftingSystem.itemTags`: tags assigned to components and used by tag-placeholder ingredients. Do not describe them as generic recipe visibility tags.
- Treat recipe categories as `CraftingSystem.categories`: custom flat recipe categories plus the implicit reserved `General` category.
- Always show `General` as reserved when category context needs it, and prevent deleting or persisting it as a custom category.
- Do not introduce hierarchical categories, parent/child inheritance, or multiple categories per recipe unless a later data-model change adds them.
- Normalize new and renamed tags/categories to unique, trimmed strings, using the canonical data-model normalization rules.
- Show usage counts from real references: components and tag-placeholder ingredients for item tags; recipes for categories.
- Bulk delete actions must be limited to derived unused entries and must not remove entries that still have references.
- Deleting or renaming an in-use tag/category should surface impact and preserve existing store/runtime behavior.
- Right evidence panels may include how-it-works guidance, system summary, and examples, but those panels must reflect Fabricate semantics rather than the reference image's unsupported hierarchy model.

### Essence Definition Editors

Essence editors manage lightweight system-owned definitions, not inventory items.

Required patterns:

- Essence identity is icon-first: icon, name, description, and id.
- Browse screens are not edit forms. Essence create/edit mutations use dedicated manager-v2 routes, while browse rows and inspectors remain selection, evidence, and navigation surfaces.
- Essence icon editing uses a pop-over icon picker, not a raw FontAwesome class text field as the primary interaction.
- Source item linkage is visible as a stateful relationship only when effect transfer is enabled: linked, stale, missing, or none.
- Source linking uses drag/drop or picker workflows; manual UUID entry is not the primary path.
- Source UI is shown only when the selected system has effect transfer enabled. When effect transfer is disabled, browse and edit surfaces hide source columns, source filters, source sections, source warnings, and source controls rather than showing disabled source UI.
- Usage summaries count components and recipe structures that reference the essence.
- Deleting or changing an essence must surface component-usage impact.
- Effect-transfer readiness is shown only from real source-item resolution when effect transfer is enabled.
- Essence UI appears only when `features.essences === true`.

## Color System

The reference UI is dark neutral with green as the primary product accent and small semantic colors for status.

### Core Tokens

```css
:root {
  --fab-bg-0: #071116;
  --fab-bg-1: #0b1720;
  --fab-bg-2: #101d27;
  --fab-bg-3: #152633;
  --fab-surface: rgba(16, 29, 39, 0.94);
  --fab-surface-soft: rgba(255, 255, 255, 0.035);
  --fab-surface-raised: rgba(255, 255, 255, 0.06);
  --fab-border: rgba(153, 191, 204, 0.16);
  --fab-border-strong: rgba(153, 191, 204, 0.28);
  --fab-text: #f2f7f5;
  --fab-text-muted: #a9b8bd;
  --fab-text-subtle: #7f9299;
  --fab-accent: #63d47b;
  --fab-accent-hover: #72df89;
  --fab-accent-strong: #3eb95f;
  --fab-accent-soft: rgba(99, 212, 123, 0.16);
  --fab-info: #58b7e8;
  --fab-info-soft: rgba(88, 183, 232, 0.16);
  --fab-warning: #f4c04f;
  --fab-warning-soft: rgba(244, 192, 79, 0.16);
  --fab-danger: #ff5252;
  --fab-danger-soft: rgba(255, 82, 82, 0.14);
  --fab-purple: #a875ff;
  --fab-purple-soft: rgba(168, 117, 255, 0.16);
}
```

### Usage Rules

- Green is the primary action, active navigation, positive status, and selected-row accent.
- Blue is informational or draft state.
- Amber is caution, inactive, medium difficulty, or stale reference.
- Red is destructive, invalid, or hard failure.
- Purple is rare/special classification only.
- Do not let any one non-neutral hue dominate an entire screen.
- Do not use gradients for Fabricate product UI surfaces.

## Typography

Use Foundry's primary font unless a later approved change introduces a tokenized font stack.

Scale:

- app title: `22px` to `26px`, weight `700`
- panel title: `15px` to `17px`, weight `700`
- row title: `13px` to `15px`, weight `700`
- body: `12px` to `14px`, weight `400`
- metadata: `11px` to `12px`, muted color
- table headers: `10px` to `11px`, uppercase or small caps only when legible

Rules:

- letter spacing stays `0`
- no viewport-scaled font sizes
- long names truncate or wrap predictably without overlapping controls

## Spacing, Radius, And Shadow

Spacing tokens:

- `--fab-space-1: 4px`
- `--fab-space-2: 8px`
- `--fab-space-3: 12px`
- `--fab-space-4: 16px`
- `--fab-space-5: 20px`
- `--fab-space-6: 24px`

Radius:

- controls: `5px` to `7px`
- panels/cards: `8px` maximum
- image thumbnails: `6px`

Shadow:

- use restrained shadows only for elevated menus, popovers, active windows, and hover affordances
- no glow as primary decoration

## Imagery

Image-backed panels must show real content:

- system icon or representative system artwork
- scene/environment image
- item/recipe image
- generated fixture image only in tests when it stands in for real Foundry content

Rules:

- image containers use fixed aspect ratios
- object-fit is `cover` for environment/scene imagery
- object-fit is `contain` or `cover` based on existing item icon behavior
- fallback icons are acceptable but must not be the only screenshot fixture for image-heavy UI

## Responsive Behavior

All responsive behavior is keyed to the application container, not only the browser viewport.

Normal manager layout:

- left rail
- central table/list
- right inspector

Medium width:

- inspector may move below the primary list or become a tab/panel
- toolbar wraps cleanly

Narrow width:

- left rail becomes top navigation or stacked navigation
- list rows become stacked rows
- inspector stacks below selected row/list
- save/create/import actions remain reachable
- no horizontal overflow

## Accessibility

Requirements:

- all icon-only buttons have accessible labels and tooltips
- focus-visible states are obvious and do not rely only on color
- selected rows and active navigation expose semantic state where possible
- menus support Escape dismissal and outside-click dismissal
- invalid fields use `aria-invalid` and `aria-describedby`
- color-coded state includes text, icon, or label support

## App-Specific Application

Existing Fabricate applications may migrate incrementally, but all new UI work should move surfaces toward this system rather than adding another visual language.

### GM Crafting Admin And Manager V2

Use the full shell: left rail, main list/editor, right inspector. Primary management screens use tables. Editors use composition plus evidence.

Keep shell hierarchy terse. The app header should show breadcrumbs, title, optional subtitle, and actions; do not add redundant "View" eyebrow labels above titles. Rail scope controls and other fixed navigation areas must reserve stable dimensions and truncate long names before they can shift navigation. Inspector fact cards should read as short inline facts and wrap at word boundaries instead of splitting values from labels.

### Recipe Editor

Adopt the same editor system: compact object header, workflow navigation, primary composition, validation/evidence panel. Keep recipe semantics unchanged.

### Player Crafting App

Use the Actor Crafting Mode and Actor Alchemy Mode patterns above. Player surfaces prioritize available actions, requirements, source allocation, run status, attempt composition, and result evidence.

### Player Gathering App

Use environment/task imagery and evidence panels for active runs, history, actor gating, and scene blocking. Keep secrecy rules for blind environments.

### Pickers And Dialogs

Use compact shell, search/filter toolbar, table/grid body, and clear primary action. Avoid oversized dialog prose.

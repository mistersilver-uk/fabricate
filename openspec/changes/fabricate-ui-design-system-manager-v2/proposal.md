# Proposal: Fabricate UI Design System And Manager V2

## Summary

Codify the attached redesign proposals into a Fabricate product UI design system and define a new `CraftingSystemManagerV2` app that can ship alongside the existing GM crafting admin. The first implementation target is mostly a reskin and structural UI pass: reuse the existing admin store, domain behavior, persistence, validation, import/export behavior, and Foundry integration contracts while introducing a more polished shell, navigation model, list/detail layouts, evidence panels, and a shared CSS-variable color system.

This is planning and specification work only. It does not edit production UI code.

## Image Inputs

The proposal is informed by reference screenshots stored under `references/`.
These screenshots are visual direction, not executable specification. They are intentionally imperfect design inputs and must be interpreted alongside `design-system.md`, `design.md`, and the UI delta. If a screenshot conflicts with the written model, behavior, accessibility, responsiveness, or validation requirements, the written OpenSpec requirements win. Do not duplicate a screenshot exactly unless it is completely aligned with the written spec.

Reference files:

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

The proposal began from four UI direction images:

- Crafting systems manager: left rail, searchable systems table, selected-system inspector, import/export actions.
- Gathering environment editor: compact header, tabs, primary resource authoring table, preview/balance/validation evidence column.
- Gathering environment editor duplicate direction: reinforces the same hierarchy, spacing, and evidence-column model.
- Environments manager: feature navigation rail, environment table, summary/help side rail, selected-environment inspector.

This proposal has also been iterated with the later recipe direction images:

- Recipe browser: left system rail, searchable recipe table, selected-recipe inspector with requirements and actions.
- Recipe editor: tabbed editor shell with overview, steps/ingredients, results, resolution, visibility, advanced, and a right evidence column.
- Recipe results editor: result-group focused editor, component source palette, mode context, and validation for result groups.
- Recipe resolution editor: provider selection, mapping management, result-group summary, failure outcome, and documentation guidance, interpreted alongside the written crafting-check/provider model.
- Recipe visibility editor: knowledge-mode visibility layout with system-owned mode context, linked recipe item card, effective visibility, validation, and documentation guidance.
- Component browser/editor: component table with tags, essences, source state, usage legend, drag/drop import, and selected component inspector.
- Essence browser/editor: searchable essence table, source-item linking, usage summary, right inspector, and essence actions.
- Tags and categories editor: split system-level management for item tags and recipe categories, with usage counts, cleanup actions, right-side guidance, and domain corrections for Fabricate's flat category model.
- Actor Crafting app simple mode: actor/source header, active/history bands, shopping list, searchable recipe table, selected recipe inspector, and continue/start actions.
- Actor Crafting app complex mode: browse-first recipe list with compact complexity summaries, craft-plan inspector, path selector, source allocation, outcome evidence, and step timeline.
- Actor Alchemy app: workbench-first composition with component palette, alchemy-system selector, discovered recipes panel, selected discovered-recipe evidence, and attempt feedback.

## Problem

Fabricate's current admin UI has the right capabilities, but its visual structure is still closer to a functional form stack than a polished product surface. The redesign images point to a stronger language:

- persistent dark application shell
- clear left navigation
- table-first management views
- selected-object inspector panels
- image-backed context only where it represents real game content
- compact headers with primary actions
- green action/status accenting
- restrained borders, spacing, and row geometry

The repo needs this encoded as reusable design-system rules before implementation. Otherwise future UI work can copy isolated details from the images without achieving the overall look, interaction clarity, or polish.

Color consistency is a specific risk. Fabricate UI apps should not accumulate one-off hex, rgba, or semantic color values in individual components. The design system needs a single CSS custom property layer that defines base, surface, border, text, accent, and semantic state colors once, then has every Svelte UI app consume those variables so the palette can be reviewed and changed globally.

## Goals

- Produce a Fabricate UI design system covering principles, layout structure, component patterns, states, imagery, typography, spacing, and CSS-variable color tokens.
- Require shared CSS custom properties for the design-system palette, with Fabricate UI apps consuming variables instead of duplicating hard-coded color values.
- Ensure base, surface, border, text, primary accent, hover, focus, selected, warning, danger, info, draft, rarity, and success colors are consistent across GM admin, editor, player, picker, and dialog surfaces and can be changed from one global token definition.
- Add a UI spec delta for a new `CraftingSystemManagerV2` app introduced alongside the existing manager.
- Keep the first manager-v2 implementation mostly UI-only and store-compatible.
- Make the design system apply to all Fabricate Svelte applications: GM admin, recipe editor, player crafting app, player gathering app, and supporting pickers/dialogs.
- Define review gates that compare screenshots against the design intent, not only against DOM presence.
- Correct first-slice manager-v2 systems-view layout defects found in screenshot review: row text containment, selected-summary hierarchy, inspector readability, duplicate actions, and feature-tab visibility before later manager-v2 views are implemented.
- Continue manager-v2 implementation with a browser-only recipes slice that delivers the recipe table, selected-recipe inspector, search/filter controls, and existing recipe actions without introducing the full v2 recipe editor.
- Continue manager-v2 implementation with a system edit slice that keeps the user inside manager-v2 when the system Edit button is clicked and exposes the base system settings: name, description, resolution mode, advanced-option visibility, and optional feature toggles.
- Continue manager-v2 implementation with a Components page that delivers the component directory table, drop-to-add import affordance, search/filter controls, selected-component inspector, source/usage evidence, and existing component actions without introducing new component persistence paths.
- Continue manager-v2 implementation with an Environments browse/edit slice that delivers the gathering environments page and in-v2 environment edit route by reusing the existing environment store/draft actions, validation, dirty protection, and save/cancel flow.
- Correct the manager-v2 environment edit route so it follows the updated `Edit Gathering Environment` reference instead of embedding the legacy `EnvironmentsTab` form stack. The corrective slice keeps existing gathering semantics, but replaces the editor presentation with a purpose-built v2 task-authoring layout: compact environment details, scene card, task list, tabbed task editor, validation/evidence column, and top-level save/cancel actions.
- Extend the design direction to the actor Crafting and Alchemy apps so player-facing surfaces share the same product language without adopting GM management chrome.
- Define the Crafting mode split between simple recipe display and complex craft-plan inspection, including path alternatives, source allocation, routed/progressive outcome summaries, and multi-step run timelines.
- Define the Alchemy mode as a workbench-first surface with component palette, discovered recipes, auto-fill, attempt action, and strict hidden-recipe information-disclosure boundaries.

## Non-Goals

- Do not replace the existing `SvelteRecipeManagerApp` in this planning change.
- Do not change crafting, recipe, gathering, alchemy, migration, import/export, or persistence semantics.
- Do not add npm dependencies as part of the initial manager-v2 reskin.
- Do not introduce a marketing landing page or decorative dashboard content.
- Do not copy the redesign boards' explanatory critique panels into production UI.

## Scope

In scope:

- `openspec/changes/fabricate-ui-design-system-manager-v2/`
- Design-system guidance for all Fabricate product UI.
- CSS custom property guidance for a global Fabricate color layer used by all product UI apps.
- UI spec delta for `CraftingSystemManagerV2`.
- Implementation handoff notes and screenshot/pointer acceptance criteria.

Out of scope:

- Production `src/`, `styles/`, `tests/`, `lang/`, and docs changes.
- Runtime behavior changes.
- Foundry compatibility metadata changes.

## Affected Future Surfaces

Future implementation is expected to touch:

- `src/ui/SvelteRecipeManagerApp.svelte.js` or a parallel app wrapper such as `src/ui/SvelteCraftingSystemManagerV2App.svelte.js`
- `src/ui/svelte/apps/RecipeManagerRoot.svelte` or a parallel root component
- shared manager-v2 Svelte components under `src/ui/svelte/apps/`
- environment components under `src/ui/svelte/apps/environments/`
- `src/ui/svelte/stores/adminStore.js` only for derived view state, not behavior ownership
- `styles/fabricate.css`
- `lang/en.json`
- component, store, and Foundry screenshot tests

## Acceptance Criteria

- The design system document is concrete enough for future implementers to derive CSS tokens, layout regions, component behavior, and screenshot acceptance criteria.
- The design system requires CSS custom properties as the source of truth for product UI colors, so color changes can be made globally without editing each app or component.
- The proposal and delta make color consistency across Fabricate Svelte apps an explicit acceptance concern, including semantic colors for actions, statuses, validation, rarity, and focus states.
- The UI delta specifies a parallel manager-v2 app that can coexist with the current manager and reuse existing admin data/actions.
- The delta keeps runtime and persistence contracts unchanged unless a later OpenSpec change explicitly expands scope.
- The self-review confirms the design system and delta would recreate the hierarchy, polish, and UX intent visible in the current reference set while applying documented keep/change/discard decisions.
- The recipe browser and recipe editor requirements reflect the later recipe direction images while preserving Fabricate's recipe semantics.
- The component browser/editor requirements reflect the component direction image while preserving Fabricate component, source, tag, essence, usage, and salvage semantics.
- The essences requirements reflect the later essence direction image while preserving EssenceDefinition, source item, and component-usage semantics.
- The essences browser corrective slice keeps create/edit/delete ownership in the header/table rows, uses compact source image or `None` row evidence, and moves source link/unlink/drop maintenance into the selected essence inspector without new persistence APIs.
- The tags/categories requirements reflect the later system-level direction image while preserving Fabricate item-tag, flat recipe-category, reserved `General`, and single-category recipe semantics.
- The recipe resolution and visibility tab requirements reflect their later direction images while preserving system-owned mode context and recipe/domain-specific behavior.
- The first-slice systems view keeps actions in one clear header location, avoids duplicate quick-action panels, hides future feature/admin tabs until a system is selected, and preserves readable row and inspector text at normal Foundry window sizes.
- The second-slice recipes browser preserves selected-system scoping, uses existing recipe manager behavior for all actions, shows only data-backed recipe fields, and proves selected-row, inspector, requirements-preview, filter, action, and responsive behavior in tests and Foundry smoke screenshots.
- The manager-v2 system Edit action transitions to an in-v2 edit view instead of opening the current admin, reusing existing admin-store persistence methods for system details, destructive resolution-mode confirmation, advanced-options state, and optional feature toggles.
- The manager-v2 Components page preserves selected-system scoping, uses existing admin-store item-card data and existing component import/edit/delete/source-replacement behavior, shows only data-backed component fields, and proves drop zone, filters, selected-row, inspector, source state, usage evidence, action, and responsive behavior in tests and Foundry smoke screenshots.
- The manager-v2 Environments page preserves selected-system scoping and gathering feature gating, uses existing admin-store environment list/draft/action contracts as the only persistence path, shows only gathering-environment data backed by the current store, and proves browse, edit, validation, linked scene imagery, pointer targets, and responsive behavior in Playwright smoke screenshots.
- The manager-v2 Components toolbar keeps selected tag pills outside the tag search control so adding tags may grow the toolbar vertically without changing the tag input's bounded geometry or suggestion anchoring.
- Formatting validation passes for the new OpenSpec change files.

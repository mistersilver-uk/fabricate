# UI Integration Delta — Actor Crafting App V2

## Reference Screenshots

This delta is informed by screenshots in the parent change `openspec/changes/fabricate-ui-design-system-manager-v2/references/`:

- [Actor Crafting App - Alchemy Mode](<../../../fabricate-ui-design-system-manager-v2/references/Actor Crafting App - Alchemy Mode.png>)
- [Actor Crafting App - Crafting Mode - Simple recipes](<../../../fabricate-ui-design-system-manager-v2/references/Actor Crafting App - Crafting Mode - Simple recipes.png>)
- [Actor Crafting App - Crafting Mode - Complex Recipes](<../../../fabricate-ui-design-system-manager-v2/references/Actor Crafting App - Crafting Mode - Complex Recipes.png>)

The screenshots are imperfect visual references. Where they conflict with this written delta or with Fabricate domain, validation, secrecy, accessibility, and responsive requirements, the written specification takes precedence.

## Specification Ownership Note

The two requirements below duplicate verbatim the same-named requirements defined in the parent change `openspec/changes/fabricate-ui-design-system-manager-v2/specs/ui-integration/spec.md` (`Actor Crafting App design direction`, `Actor Alchemy App design direction`). They are restated here so this change is self-contained and can be archived independently of the parent's archive ordering. On parent archive, the parent's wording is canonical and any divergence is reconciled toward it.

## ADDED Requirements

### Requirement: Actor Crafting App design direction

The player-facing Crafting tab MUST follow the actor crafting redesign hierarchy while preserving existing crafting, recipe visibility, run, and shopping-list behavior.

1. The app MUST keep the shared actor/source header above tab content, including selected crafting actor identity, component source actors, and mode tabs when both alchemy and non-alchemy systems are available.
2. The Crafting tab MUST remain browse-first: active runs, recent history, shopping list, recipe search/filter toolbar, recipe list/table, and selected-recipe evidence are the primary surfaces.
3. The Crafting tab MUST NOT add GM manager rails, admin breadcrumbs, import/export controls, or recipe authoring controls.
4. Recipe rows MUST summarize requirements and results instead of attempting to render the full recipe structure inline.
5. Recipe row summaries SHOULD use data-backed labels and counts for required groups, optional requirements, paths, choices, fixed results, routed outcomes, progressive/quality-variable results, locked/learnable state, and in-progress state.
6. The selected-recipe inspector MUST carry full craft-plan detail at normal widths for complex recipes: complexity chips, selected path, ingredient sets/groups/options, optional essences, catalysts/tools, source actor allocation, time/currency evidence, outcome explanation, and active-run controls.
7. Ingredient-set alternatives MUST be presented as paths or equivalent selectable alternatives. The UI MUST show which path is selected and SHOULD show which alternatives are satisfiable from current component sources.
8. Ingredient groups MUST communicate Fabricate's boolean model: AND across groups and OR across options within a group.
9. Source allocation MUST show which component source actor supplies each satisfied requirement when multiple sources are involved.
10. Result presentation MUST distinguish fixed results, routed outcomes, progressive/quality-variable outcomes, learn-recipe outcomes, locked/unknown outcomes, and failed/missing states without implying that every possible result group is awarded.
11. Multi-step active runs MUST show current step, remaining progress/time where backed, and completed/current/pending step timeline evidence.
12. Continue/start/cancel/details/add-to-list/favourite actions MUST remain reachable at normal Foundry window sizes and at narrow stacked widths.
13. Shopping-list aggregation MUST remain Crafting-tab-only and MUST either use the currently selected/satisfiable path or clearly identify what path assumption it uses.
14. Non-GM users MUST NOT see hidden recipe metadata, GM-only diagnostics, unresolved admin references, or implementation ids through the selected-recipe inspector.
15. Actor Crafting screenshots MUST prove simple recipe state, complex recipe state, selected recipe inspector, path/choice summaries, source allocation, active run timeline, shopping list, row actions, focus states, and narrow-width stacking.

### Requirement: Actor Alchemy App design direction

The player-facing Alchemy tab MUST follow the actor alchemy redesign hierarchy while preserving alchemy discovery, secrecy, matching, and attempt behavior.

1. The Alchemy tab MUST use the shared actor/source header and mode tabs, plus an alchemy-system selector when multiple alchemy-mode systems are available.
2. The Alchemy tab MUST be workbench-first: component palette, alchemy workbench, discovered recipes panel, active runs, and recent history are the primary surfaces.
3. The Alchemy tab MUST NOT show Crafting-only shopping list, normal recipe browse table, recents list, favourites, or GM recipe authoring controls.
4. The component palette MUST show selected alchemy-system components owned by selected component source actors, with available quantity calculated as inventory minus current workbench quantity.
5. Zero-quantity or unavailable palette entries MAY remain visible, but they MUST be visually distinct from available entries and MUST NOT appear craftable.
6. Palette interactions MUST support the existing add/remove behavior: left-click or direct action to add, right-click or direct action to remove when present in the workbench, and drag/drop where supported.
7. The workbench MUST be the central composition surface. It MUST show grouped component entries with quantities, support clear-all and per-entry remove actions, and expose one primary attempt action.
8. The discovered recipes panel MUST remain visible even when empty. Empty state copy MUST encourage experimentation without revealing hidden recipe data.
9. Discovered recipe rows MUST follow canonical visibility rules: non-GM users see only learned/discovered recipes, while GMs may see all recipes consistently with GM-sees-all behavior.
10. The craftable-only filter MUST evaluate discovered recipes against full palette/source quantities as defined by the canonical auto-fill rules.
11. Auto-fill MUST populate the workbench from the first fully satisfiable ingredient set, or fill the best partial set and report unfulfilled groups when no set is fully satisfiable.
12. Selected discovered-recipe detail MAY show expected result, required components, required essences, and missing state because the recipe is already discovered or GM-visible.
13. Failed no-signature attempts MUST NOT reveal hidden recipe name, result groups, ingredients, or diagnostics to non-GM users.
14. Misconfiguration errors for matched attempts MUST be distinguishable from normal player failure while still respecting non-GM information disclosure limits.
15. Active runs and recent history shown in Alchemy mode MUST be filtered to alchemy systems.
16. Actor Alchemy screenshots MUST prove alchemy system selection, component palette availability states, workbench drag/click composition, discovered recipes panel, selected discovered-recipe detail, attempt action, active/history bands, no hidden recipe leakage, and narrow-width stacking.

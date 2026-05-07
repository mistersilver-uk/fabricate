# Proposal: Actor Crafting App V2

## Summary

Implement the V2 redesign of the player-facing Actor Crafting app — Alchemy tab and Crafting tab (simple + complex recipes) — against the design intent encoded in the parent change `fabricate-ui-design-system-manager-v2`. Replace the existing `AlchemyTab.svelte` / `CraftingTab.svelte` / `RunSummary.svelte` / `RecipeCard.svelte` / `RecipeList.svelte` components in place. New components live under `src/ui/svelte/apps/actor-app/`. No runtime, persistence, or domain semantics change. No new `src/systems/` helpers.

## Image Inputs

The proposal is informed by reference screenshots in the parent change folder:

- [Actor Crafting App - Alchemy Mode](<../fabricate-ui-design-system-manager-v2/references/Actor Crafting App - Alchemy Mode.png>)
- [Actor Crafting App - Crafting Mode - Simple recipes](<../fabricate-ui-design-system-manager-v2/references/Actor Crafting App - Crafting Mode - Simple recipes.png>)
- [Actor Crafting App - Crafting Mode - Complex Recipes](<../fabricate-ui-design-system-manager-v2/references/Actor Crafting App - Crafting Mode - Complex Recipes.png>)

These are imperfect visual references. Where they conflict with the written `Actor Crafting App design direction` and `Actor Alchemy App design direction` requirements, the written requirements win.

## Problem

The existing actor app works but predates the V2 design system. It uses the older `--fabricate-*` colour tokens, viewport-based responsive rules, ad-hoc card stacks, and lacks both the Crafting selected-recipe inspector and the Alchemy three-column workbench-first composition. Manager-v2 has shipped a polished GM admin shell with the same design language; the actor app currently looks visibly mismatched next to it.

## Goals

- Implement `Actor Crafting App design direction` and `Actor Alchemy App design direction` (parent change `specs/ui-integration/spec.md` lines 43–82) end to end.
- Migrate actor-app surfaces to `--fab-*` tokens and container-query responsive rules.
- Promote the manager-v2 Pagination component to a shared component for reuse across actor and manager apps.
- Preserve all existing crafting, alchemy, recipe-visibility, run, salvage, shopping-list, teaser, and learning behaviour. No new persistence schemas, no new runtime contracts, no new domain methods.

## Non-Goals

- Do not change `CraftingEngine.craft()` signature or any `src/systems/` API.
- Do not change `craftingStore.js` factory pattern (writables + recompute helpers, not chained `derived`).
- Do not introduce a parallel "actor-app-v2" app behind a feature flag — replacement is in place.
- Do not introduce interactive source-actor reassignment in the complex-recipe inspector. Source allocation is read-only, advisory, derived display data (see Pre-slice Verification in `design.md`).
- Do not add new persistence schemas, settings keys, or module ids.

## Scope

In scope:

- `openspec/changes/actor-crafting-app-v2/`
- `src/ui/svelte/apps/actor-app/` (new components)
- `src/ui/svelte/components/Pagination.svelte` (promoted from manager-v2)
- Modifications to `src/ui/SvelteCraftingApp.svelte.js`, `src/ui/svelte/apps/CraftingAppRoot.svelte`, `src/ui/svelte/apps/ActorCraftingHeader.svelte`, `src/ui/svelte/apps/ComponentPalette.svelte`, `src/ui/svelte/apps/Workbench.svelte`, `src/ui/svelte/apps/DiscoveredRecipesPanel.svelte`, `src/ui/svelte/apps/AlchemySystemSelector.svelte`, `src/ui/svelte/apps/ShoppingListPanel.svelte`, `src/ui/svelte/stores/craftingStore.js`
- `styles/fabricate.css` actor-app scope additions/migrations
- `lang/en.json` `FABRICATE.ActorApp.*` namespace
- `tests/components/`, `tests/stores/`, `tests/` for actor-app coverage

Out of scope:

- Any change to `src/systems/`, `src/models/`, `src/integrations/`, or persistence
- Manager-v2 visual changes (only the Pagination import path moves)
- New Foundry compatibility metadata

## Specification Ownership

This change duplicates `Actor Crafting App design direction` and `Actor Alchemy App design direction` into `specs/ui-integration/spec.md` as `## ADDED Requirements`. The wording is owned by the parent change `fabricate-ui-design-system-manager-v2`. On parent archive, the parent's wording is canonical and any drift is reconciled toward it.

This is done so the change can be archived independently of the parent's archive ordering.

## Affected Future Surfaces

Future implementation will touch:

- New components under `src/ui/svelte/apps/actor-app/`
- Promoted `src/ui/svelte/components/Pagination.svelte`
- `src/ui/svelte/stores/craftingStore.js` (derived view-state additions only)
- `styles/fabricate.css` actor-app scope
- `lang/en.json` `FABRICATE.ActorApp.*`
- Manager-v2 `*BrowserView.svelte` Pagination imports (path-only update)

## Acceptance Criteria

- Alchemy tab matches the V2 reference hierarchy: shared header, mode pills, alchemy-system selector in the header, In Progress / Recent History bands, three-column main grid (palette / workbench / discovered+selected), palette availability legend.
- Crafting tab simple state matches the V2 reference hierarchy: shared header, In Progress / Recent History bands, Shopping List band, toolbar, recipe table, pagination, persistent right inspector.
- Crafting tab complex state extends the inspector with complexity chips, path selector, ingredient-set cards (AND/OR), source allocation evidence (read-only), optional essences/catalysts, time/cost, outcome card, and step timeline.
- Non-GM users never see hidden recipe data through the Alchemy Selected Recipe card or any new selected-recipe inspector.
- Teaser recipes render existing teaser placeholders in the new components.
- All actor-app responsive behaviour uses container queries.
- All actor-app surfaces use `--fab-*` tokens.
- Existing tests pass (rewritten where their owning component is replaced).
- New tests cover dual-band runs, shell, recipe table, simple and complex inspectors, alchemy secrecy, and store selection isolation.
- Foundry smoke screenshots prove all required states for normal and stacked widths.

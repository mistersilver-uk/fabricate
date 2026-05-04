# Proposal: Always-On Tags And Categories

## Summary

Make recipe categories and item tags always available for every crafting system. The persisted feature keys remain as compatibility aliases, but saved `false` values no longer hide category/tag UI or invalidate tag-based ingredient matching.

No GitHub issue is assigned for this task.

## Problem

Recipe categories and item tags are foundational authoring tools, but they are currently modeled as optional system features. Existing gates appear in system normalization, recipe validation, ingredient matching, recipe editors, component tag editing, admin stores, manager-v2 navigation, docs, and specs.

That creates avoidable configuration work and makes older systems with disabled flags lose category and tag behavior even though these concepts should now be baseline.

## Goals

- Normalize all crafting systems so `features.recipeCategories`, `features.categories`, and `features.itemTags` are always `true`.
- Preserve compatibility aliases such as `enableCategories` and `enableTags`, but always emit them as `true`.
- Ignore legacy disable attempts through `features`, `enableCategories`, or `enableTags`.
- Always allow custom recipe categories and tag-based ingredient placeholders when tag IDs exist in `CraftingSystem.itemTags`.
- Always show category and tag authoring controls in current admin, manager-v2, component editing, and recipe editing flows.
- Update canonical specs, docs, and focused tests.

## Non-Goals

- Do not introduce a separate recipe-tag data model.
- Do not change essences, gathering, salvage, property macros, effect transfer, multi-step recipes, or integration feature gates.
- Do not remove persisted legacy keys from saved worlds in a migration.
- Do not add npm dependencies.

## Acceptance Criteria

- Systems saved with `recipeCategories: false` or `itemTags: false` normalize and behave as enabled.
- `updateSystem()` cannot disable recipe categories or item tags through canonical or legacy feature inputs.
- Recipe categories are preserved on recipe save and available in editors regardless of legacy disabled flags.
- Tag ingredient placeholders validate and match without checking `features.itemTags`.
- Component tag editing and category/tag list management are reachable without feature toggles.
- Manager v2 treats Tags & Categories as an always-available view and no longer lists recipe categories or item tags as optional feature toggles.
- `npm test` and `npm run build` pass.

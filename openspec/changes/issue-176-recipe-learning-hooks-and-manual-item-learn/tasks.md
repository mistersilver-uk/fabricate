# Tasks

- [x] Verify the exact Foundry V13 ApplicationV2 item-sheet header-control surface before implementation; document the chosen V13 adapter and whether a V1 `getItemSheetHeaderButtons` fallback is included
- [x] Extend `RecipeVisibilityService` with a new item-centric owned-item learn operation anchored to the exact passed actor-owned item, with mode-aware auto/manual recipe filtering and structured notification results
- [x] Preserve the existing `learnRecipe()` single-recipe contract (`{ success, message, messageData }`) for current crafting app and store callers
- [x] Add a dedicated runtime hook registration path for auto-learn from actor-owned `createItem` events, registered during Fabricate initialization
- [x] Add an actor-owned item-sheet header learn control with confirmation, Foundry document mutation permission gating, learnable-recipe gating, in-flight duplicate-submit protection, and post-action rerender/refresh
- [x] Add or update localization strings for manual action label/tooltip, confirmation title/body, consume warning, plural success, partial success, and nothing-new-learned/already-known notifications
- [x] Add service tests for exact item anchoring, including two matching copies where only the passed item is used or deleted
- [x] Add service tests for multi-recipe learning, mixed already-learned/new matches, mixed `consumeOnLearn`, delete-once behavior, delete-after-write ordering, and all-already-known no-delete behavior
- [x] Add service tests for canonical `recipeItemId` / recipe item definition matching, `_stats.compendiumSource`, `flags.core.sourceId`, and one legacy `linkedRecipeItemUuid` compatibility case
- [x] Add hook tests for auto-enabled scope, mixed-system split behavior, wrong `userId`, missing actor parent, insufficient permission, no match, non-knowledge systems, item-only knowledge mode, auto-disabled silence, and one-notification-max behavior
- [x] Add header-control tests for owned versus unowned items, permission gating, hidden when auto-enabled, visible when auto-disabled and learnable, hidden when no recipes are learnable, confirmation cancel, confirmation accept, in-flight guard, and post-action rerender/refresh
- [x] Add regression coverage proving existing `learnRecipe()` UI localization still occurs once
- [x] Add regression coverage proving crafting-store inventory refresh remains sane through hook-driven create/delete events
- [x] Run `npm test`
- [x] Run `npm run build`

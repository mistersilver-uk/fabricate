# Design: Always-On Tags And Categories

## Current Behavior

`CraftingSystemManager._normalizeFeatures()` derives `recipeCategories` and `itemTags` from `system.features` or legacy `enableCategories` / `enableTags`. Several runtime and UI paths then check those booleans before using categories or tags.

Important gates include:

- `RecipeManager._getSystemFeatures()` and recipe validation for tag ingredient placeholders.
- Legacy and Svelte recipe editor feature state for category and tag controls.
- Component editor state for tag editing.
- Current admin and manager-v2 feature toggle surfaces.
- Specs and docs describing categories/tags as optional features.

## Design Decisions

- Treat recipe categories and item tags as baseline system capabilities, not optional features.
- Keep the feature booleans and UI convenience aliases in normalized output for compatibility, but force them to `true`.
- Keep `CraftingSystem.categories` and `CraftingSystem.itemTags` normalization unchanged: custom categories exclude reserved `general`, and tags remain unique trimmed strings.
- Do not migrate persisted settings. Runtime normalization is enough and avoids destructive writes.
- Remove runtime checks that reject tag placeholders solely because `itemTags` is disabled. Validation should still reject unknown or empty tag IDs.
- Remove UI toggle affordances for recipe categories and item tags while keeping their list/editing controls available.
- Leave `advancedOptionsEnabled` as a legacy alias, but do not let it hide category/tag controls.

## Affected Areas

- `src/systems/CraftingSystemManager.js`: force category/tag features on and ignore disable updates.
- `src/systems/RecipeManager.js`: always enable tag matching/validation for real systems.
- `src/ui/RecipeEditorApp.js` and `src/ui/svelte/stores/editorStore.js`: always expose categories and item tags.
- `src/ui/svelte/util/componentEditor.js` and current admin category/tag handlers: always expose/edit tags and categories.
- `src/ui/svelte/apps/FeatureCardStack.svelte` and manager-v2 root: remove category/tag optional-toggle presentation.
- Canonical OpenSpec specs and docs: describe categories/tags as always-on baseline behavior.

## Test Strategy

- Update normalization tests to cover legacy false values and disable attempts.
- Update runtime validation/matching tests that currently depend on disabled item tags.
- Update editor/admin/component UI tests to expect categories/tags without feature gates.
- Keep exporter behavior that strips transitional aliases unchanged.
- Run `npm test` and `npm run build`.

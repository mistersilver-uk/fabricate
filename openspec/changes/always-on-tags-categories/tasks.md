# Tasks

## Planning

- [x] Read AGENTS.md instructions supplied for this repo.
- [x] Read the Fabricate orchestrator and implementer skills.
- [x] Confirm no GitHub issue is assigned and do not invent one.
- [x] Review canonical data-model, UI-integration, and recipes-and-steps specs.
- [x] Review the current normalization, runtime validation, editor, admin, and manager-v2 gates.
- [x] Create this OpenSpec change before implementation.

## Implementation Checklist

- [x] Update canonical specs and docs so categories and item tags are baseline capabilities.
- [x] Force `recipeCategories`, `categories`, and `itemTags` normalized feature values to `true`.
- [x] Make `updateSystem()` ignore category/tag disable attempts.
- [x] Remove runtime tag-placeholder disabled-feature rejection.
- [x] Always expose recipe category and item-tag controls in legacy and Svelte editor/admin paths.
- [x] Remove recipe category and item tag optional toggles from manager-v2 and current admin feature surfaces.
- [x] Update focused tests for normalization, runtime validation, stores, component editor, and manager-v2 contracts.

## Verification

- [x] Run `npm test`.
- [x] Run `npm run build`.

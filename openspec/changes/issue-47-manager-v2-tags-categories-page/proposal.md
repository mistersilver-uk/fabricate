# Proposal: Manager V2 Tags And Categories Page

## Issue

Addresses the Manager V2 authoring gap related to GitHub issue `#47`: GMs need an obvious place to define recipe categories before category assignment creates orphaned free-text values. Item tags have the same system-level authoring shape and already appear in Manager V2 counts, but the Tags & Categories route is still a disabled placeholder.

## Goals

- Promote the Manager V2 Tags & Categories navigation entry from placeholder to a real selected-system page.
- Let GMs add and remove custom recipe categories and item tags through existing admin-store actions.
- Make the reserved `General` recipe category visible as implicit, non-removable system behavior.
- Surface concise guidance when no custom categories or tags exist so GMs know where to define category/tag vocabulary.
- Keep recipe categories and item tags always available; do not reintroduce feature gates or optional toggles.

## Non-Goals

- Do not rename categories or migrate existing recipe/category references in this slice.
- Do not add new persistence fields.
- Do not change recipe editor category assignment behavior beyond making the system-level category authoring page available.
- Do not add npm dependencies.

## Acceptance Criteria

- Manager V2 shows an enabled Tags & Categories nav button for every selected system.
- The page renders custom recipe categories, the implicit `General` category, item tags, counts, search, and empty states.
- Adding a category delegates to `store.addCategory(value)` and adding a tag delegates to `store.addTag(value)`.
- Removing a custom category delegates to `store.removeCategory(category)`; removing a tag delegates to `store.removeTag(tag)`.
- In-use category and tag removals require localized impact warning copy and explicit confirmation before destructive callbacks run.
- The reserved `General` category cannot be removed from the page.
- Duplicate, blank, and reserved-category add attempts keep the input available and provide visible feedback instead of silently clearing the form.
- Localized Manager V2 copy covers the page, forms, empty states, and inspector.
- Focused source-contract and mounted Svelte tests cover route promotion and store delegation.

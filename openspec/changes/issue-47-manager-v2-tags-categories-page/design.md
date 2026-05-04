# Design: Manager V2 Tags And Categories Page

## Current Context

`CraftingSystemManagerV2Root.svelte` includes `tags` in `placeholderViews`, so the nav entry renders disabled even though categories and item tags are baseline system capabilities. `adminStore` already exposes `addCategory`, `removeCategory`, `addTag`, and `removeTag`; those methods normalize categories/tags and persist through `CraftingSystemManager.updateSystem()`.

The completed `always-on-tags-categories` change made recipe categories and item tags always enabled. This page should consume that behavior rather than adding any new feature checks.

## Implementation Shape

- Add `src/ui/svelte/apps/manager-v2/TagsCategoriesView.svelte`.
- Keep the component presentational and local-state only:
  - receives category rows, tag rows, counts, and callback props
  - owns search and form input state
  - delegates add/remove through callbacks
  - treats `General` as an implicit category row with disabled removal
- Update `CraftingSystemManagerV2Root.svelte`:
  - import the view
  - remove `tags` from `placeholderViews`
  - add an enabled nav button after Components
  - normalize the `tags` route only when no system is selected
  - add title, subtitle, breadcrumbs, header action context, main rendering, and inspector content
  - wire callbacks to existing store methods
- Add localized keys under `FABRICATE.Admin.ManagerV2.TagsCategories`.
- Add CSS for the page using existing Manager V2 table/chip/button/form patterns.

## Behavior Details

- Category form:
  - disables submit for blank input
  - shows inline feedback for blank, duplicate, reserved `General`, and normalized values
  - clears the input only after a successful add changes the selected system vocabulary
- Tag form:
  - disables submit for blank input
  - uses GM-facing copy that names are cleaned up automatically and duplicate names are ignored
  - clears the input only after a successful add changes the selected system vocabulary
- Search:
  - filters custom categories and item tags locally
  - keeps the implicit `General` category visible in the category section
  - distinguishes true empty states from filtered-empty states
- Inspector:
  - shows counts for `1 base category`, custom categories, item tags, and usage evidence
  - explains that categories and tags are always available baseline capabilities
  - links the page to issue `#47` behavior through user-facing guidance, not issue text
- Removal safety:
  - `General` renders as locked/non-removable
  - in-use custom categories and item tags show usage counts before removal
  - removal of an in-use category or tag opens a localized confirmation warning before calling the store
  - cancellation leaves the row and store untouched
- Route safety:
  - `tags` requires a selected system and falls back to `systems` when no selected system exists
  - add/remove callbacks must no-op when no selected system exists

## Risks

- Removing a category that is used by recipes can orphan existing recipe category values. The page must show impact evidence and require explicit confirmation before delegating to the existing store path.
- Removing an item tag can leave component tags or tag-placeholder references stale. The page must show component/tag-placeholder usage evidence and require explicit confirmation before delegating to the existing store path.
- The root component is large. The new page should live in a focused component to avoid growing another inline view branch.
- Mounted Svelte tests compile a fixed allow-list of manager-v2 components; the new component must be added there.

## Verification

- Source-contract test:
  - root imports `TagsCategoriesView`
  - tags route is not in `placeholderViews`
  - root delegates category/tag changes to existing store callbacks
  - localized page keys exist
- Mounted test:
  - nav button is enabled and routes to `data-manager-v2-view="tags"`
  - page renders `General`, custom categories, item tags, usage counts, and selected-page inspector facts
  - true empty and filtered-empty category/tag states render distinct copy
  - add/remove category and tag controls call the expected store methods
  - duplicate/reserved/blank add attempts keep the input and show visible feedback
  - in-use category/tag removal shows localized confirmation and does not call the destructive callback when cancelled
  - blank form submits do not call store methods
- Layout/accessibility:
  - category/tag sections stack at narrow Manager V2 widths
  - search and add forms wrap cleanly
  - remove buttons keep stable hit targets
  - long names and localized strings do not create horizontal overflow
  - search/add inputs are labeled, remove controls are keyboard reachable, `General` is exposed as locked, and focus returns to the relevant input after add
- Validation:
  - run focused Manager V2 component tests
  - collect compact-window layout evidence or a focused layout assertion for long category/tag names
  - run `npm test`
  - run `npm run build`

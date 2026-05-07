# Design

Manager V2 already exposes selected-system counts in `CraftingSystemManagerV2Root.svelte`. The empty Recipes inspector should use that count to decide which setup card content to render.

## UI Behavior

- If the selected system has zero recipes and at least one component, keep the existing recipe setup guidance.
- If the selected system has zero recipes and zero components, show component-first guidance:
  - explain that components are needed before recipe ingredients, catalysts, and results can be configured
  - list component import before recipe authoring
  - include an in-app button that navigates to the Components browser
- The central empty Recipes pane still renders its existing Create Recipe action.
- Filtered-empty recipe behavior remains unchanged because this branch only applies when the underlying recipes array is empty.

## Implementation Notes

- Use `selectedCounts.components` in the root component; do not add store state.
- Reuse `setView('components')` for the in-app navigation action.
- Add new `FABRICATE.Admin.ManagerV2.Recipe.EmptySetup.*` localization keys for the zero-component branch.
- Update `docs/quickstart.md` only for documentation.

## Accessibility

- The action is a real button, not an external link.
- The button includes an icon with `aria-hidden="true"` and localized visible text.
- Existing setup card section labels remain localized.

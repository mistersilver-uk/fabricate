# Design

Manager V2 already distinguishes no-systems and no-environments inspector states from generic row-selection prompts. This change applies the same pattern to selected-system browsers whose data arrays are empty.

## UI Behavior

- When `currentView === "recipes"` and the selected system has zero recipes, the inspector renders recipe setup guidance instead of "Select a recipe".
- When `currentView === "components"` and the selected system has zero component cards, the inspector renders component setup guidance instead of "Select a component".
- When `currentView === "essences"` and the selected system has zero essence cards, the inspector renders essence setup guidance instead of "Select an essence".
- If underlying rows exist but filters hide them, keep the existing selection or selection-prompt behavior.
- Existing main-pane empty states, create/drop actions, filters, and pagination remain unchanged.

## Styling

- Reuse `manager-v2-setup-card`, `manager-v2-setup-card-header`, `manager-v2-setup-list`, and `manager-v2-setup-links`.
- Add no new layout primitives or theme changes.

## Accessibility

- Each setup card has a localized accessible section label.
- Documentation links remain keyboard-reachable anchors styled as Manager V2 buttons.
- Existing primary create/import/drop controls remain in the main browser panes.

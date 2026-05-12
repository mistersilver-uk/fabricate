# Manager V2 Gathering Rail Submenu

## Summary

Move Manager V2 Gathering section navigation from the in-page horizontal tab strip into an expandable left-rail submenu.

## Motivation

The Gathering browser currently has two levels of navigation: the left rail opens Gathering, then an in-page tab strip switches between Environments, Tasks, Hazards, and Settings. This hides the active Gathering subsection from the primary navigation and uses the Gathering rail badge for an environment count instead of navigation state.

## Proposed Change

- Replace the Gathering rail count badge with an expand/collapse control.
- Clicking the Gathering rail item opens the Environments browser by default and expands the submenu.
- Clicking only the expand/collapse control toggles the submenu without navigating.
- Render Environments, Tasks, Hazards, and Settings as nested Gathering rail entries.
- Remove the horizontal Gathering tabs from the main Gathering browser.
- Keep existing Gathering panels, actions, placeholders, settings, and inspectors driven by the current active Gathering section.
- Highlight both the parent Gathering rail item and the selected child subsection.

## Impact

- Manager V2 UI behavior changes for gathering-enabled systems.
- No persistence, migration, runtime hook, Foundry API, or package dependency changes are introduced.

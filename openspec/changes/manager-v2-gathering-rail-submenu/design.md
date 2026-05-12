# Manager V2 Gathering Rail Submenu Design

## UI

`CraftingSystemManagerV2Root` owns the expanded state for the Gathering rail submenu and continues to own `activeGatheringTab`. The parent Gathering rail item remains the route entry point for the feature. Its label opens `activeView = 'environments'`, sets `activeGatheringTab = 'environments'`, and expands the submenu. The trailing icon button toggles expansion only.

Nested submenu buttons are rendered below the parent item when expanded. They set `activeGatheringTab` to `environments`, `tasks`, `encounters`, or `settings`, route to the Gathering browser surface, and keep the submenu expanded. The expanded parent group uses a soft container background; the parent `Gathering` row stays visually neutral, and only the selected child button uses the selected menu-item treatment.

`EnvironmentsBrowserView` no longer renders the horizontal tab list. It continues to render the existing panel body for the active Gathering section.

## Accessibility

The parent Gathering item exposes `aria-expanded`. The icon button has explicit localized expand/collapse labels and stops click propagation. Nested buttons use `aria-current="page"` when they represent the active Gathering section. Existing panel `aria-labelledby` targets are updated to point at the nested rail entries.

## Tests And Review

Focused mounted tests cover parent navigation, icon-only expansion, child selection, neutral parent styling, selected child highlighting, and existing Gathering panel behavior. CSS tests cover grouped submenu geometry, soft background, selected child styling, and removal of horizontal tab focus styling. Contract tests cover source wiring and localization.

## Out Of Scope

Hazard authoring remains placeholder-only. The submenu expanded/collapsed state is not persisted across app sessions.

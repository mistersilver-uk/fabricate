# Design: Gathering Environment Task Quick Actions

## UI

`CompositionList.svelte` remains the source of task and hazard composition row rendering. Manual task rows get a second icon button immediately before the existing 3-dot menu when there is a direct composition action:

- Included manual task rows render Exclude using `fas fa-ban`, `data-action="exclude"`, `onExclude(kind, entry.id)`, danger styling, and localized `aria-label`/`title` text of `Exclude`.
- Available manual task rows whose `availableRowAction(entry)` is `include` render Add using `fas fa-plus`, `data-action="include"`, `onInclude(kind, entry.id)`, success styling, and localized `aria-label`/`title` text of `Add`.
- Available manual task rows whose `availableRowAction(entry)` is `force-include` render Force add using `fas fa-circle-plus`, `data-action="force-include"`, `onForceInclude(kind, entry.id)`, warning styling, and localized `aria-label`/`title` text of `Force add`.
- Available manual task rows whose `availableRowAction(entry)` is `library-disabled` render no quick action.

The overflow menu stays in place and keeps the same actions so keyboard/menu workflows and secondary Open source actions remain available.

## Styling

The task composition action column grows from one icon button to two icon buttons plus the existing 4px gap. The shared manager icon button system gains success styling for `.manager-icon-button.is-primary`, matching `.manager-button.is-primary`; existing danger and warning-action icon styles are reused.

## Tests

Mounted component tests cover quick action presence and callback wiring in manual task mode, absence for library-disabled/manual automatic task rows, and no hazard layout regression. CSS contract tests cover the wider task action column and icon-button success styling.

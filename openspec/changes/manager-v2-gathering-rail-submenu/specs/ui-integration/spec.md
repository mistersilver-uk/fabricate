## MODIFIED Requirements

### Requirement: Manager V2 Shell
Manager V2 SHALL expose selected-system navigation through the left rail and SHALL keep feature-scoped routes visible only when available for the selected system.

#### Scenario: Gathering rail submenu opens Gathering sections
- **WHEN** a GM selects a gathering-enabled crafting system
- **THEN** the left rail shows a `Gathering` parent item with an expand/collapse control instead of an environment count
- **AND** clicking the parent item opens the Gathering Environments browser by default
- **AND** clicking the expand/collapse control toggles the submenu without changing the active page
- **AND** the expanded submenu contains Environments, Tasks, Hazards, and Settings entries
- **AND** the expanded Gathering group has a soft container background
- **AND** the parent Gathering row does not use the selected-pill visual treatment
- **AND** the selected submenu entry is the only selected-looking row
- **AND** the Gathering main panel does not render a duplicate horizontal section tab strip

## MODIFIED Requirements

### Requirement: Environments Tab

Manager V2 SHALL provide reusable Gathering Task authoring for the selected crafting system.

#### Scenario: Editing a reusable Gathering Task

- **WHEN** a GM opens a gathering task from the task browser
- **THEN** Manager V2 SHALL show editable task identity, image, description, enabled state, time/weather availability dropdowns, and drop rules on one central page
- **AND** the right inspector SHALL edit the selected drop rule
- **AND** the editor SHALL visually distinguish task-level availability gates from per-drop time/weather modifiers
- **AND** the drop rules table SHALL support search, pagination, resolved component rows, unresolved drop-zone rows, editable chance and quantity, modifier summaries, and row actions
- **AND** field edits SHALL persist through the Manager V2 reusable task library update path without a separate draft save step
- **AND** user-facing copy SHALL use drop chance, drop rules, or drop resolution language.

#### Scenario: Explaining availability and repeated drops

- **WHEN** a GM edits task availability or duplicate component drop rows
- **THEN** the editor SHALL explain that task availability controls whether the task can be attempted before drop resolution
- **AND** SHALL explain that drop-level modifiers only adjust individual drop row chance
- **AND** SHALL warn when repeated rows for the same component may be limited by the selected system Gathering Rules.

#### Scenario: Assigning a dropped component

- **WHEN** a GM drops a Foundry item onto an unresolved drop rule
- **THEN** the editor SHALL call the managed-item import service
- **AND** SHALL assign the returned managed item id to that drop rule.

#### Scenario: Editing selected drop modifiers

- **WHEN** a GM selects a reusable Gathering Task drop row
- **THEN** the right inspector SHALL edit the row component, base drop chance, quantity, time modifiers, and weather modifiers
- **AND** modifier values SHALL support positive, negative, and zero percentage-point adjustments
- **AND** the final chance preview SHALL show current time/weather context and clamp the computed chance between `0` and `100`.

#### Scenario: Editing task images

- **WHEN** a GM edits a reusable Gathering Task image
- **THEN** Manager V2 SHALL use the shared Foundry image path picker control.

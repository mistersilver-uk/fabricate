## MODIFIED Requirements

### Requirement: Environments Tab

Manager V2 SHALL provide reusable Gathering Task authoring for the selected crafting system.

#### Scenario: Editing a reusable Gathering Task

- **WHEN** a GM opens a gathering task from the task browser
- **THEN** Manager V2 SHALL show editable task identity, image, description, enabled state, time/weather availability dropdowns, and drop rules on one central page
- **AND** the right inspector SHALL edit the selected drop rule
- **AND** user-facing copy SHALL use drop chance, drop rules, or drop resolution language.

#### Scenario: Assigning a dropped component

- **WHEN** a GM drops a Foundry item onto an unresolved drop rule
- **THEN** the editor SHALL call the managed-item import service
- **AND** SHALL assign the returned managed item id to that drop rule.

#### Scenario: Editing task images

- **WHEN** a GM edits a reusable Gathering Task image
- **THEN** Manager V2 SHALL use the shared Foundry image path picker control.

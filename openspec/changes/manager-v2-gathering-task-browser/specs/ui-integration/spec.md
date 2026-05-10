## ADDED Requirements

### Requirement: Manager V2 Gathering Task Browser
Manager V2 SHALL provide a real browser for Gathering Tasks in the Gathering `Tasks` tab while leaving the Hazards tab placeholder unchanged.

#### Scenario: Task library browser replaces placeholder
- **WHEN** a GM opens Manager V2 Gathering and selects `Tasks`
- **THEN** the main panel lists Gathering Task records from `gatheringConfig.systems[systemId].tasks`
- **AND** it provides search, status, region, biome, and availability filters
- **AND** it paginates filtered rows
- **AND** it does not render the old task placeholder copy

#### Scenario: Row actions operate on Gathering Tasks
- **WHEN** a GM uses task row actions
- **THEN** edit selects the task and opens the placeholder editor route
- **AND** duplicate calls the Gathering Task duplicate store action
- **AND** delete calls the existing Gathering Task delete action
- **AND** status toggles call the existing Gathering Task update action

#### Scenario: Task inspector shows selected task details
- **WHEN** a Gathering Task is selected in the task browser
- **THEN** the right inspector shows task status, location filters, availability, active matching environment count, and drop summaries
- **AND** deleting the selected task falls back to another task or an empty inspector

#### Scenario: Placeholder editor is scoped
- **WHEN** a GM edits a Gathering Task from the browser
- **THEN** the center panel shows a task editor placeholder with the selected task name
- **AND** a back-to-library control returns to the Gathering `Tasks` browser
- **AND** detailed task authoring fields are not shown in this slice

#### Scenario: Empty and no-results states are distinct
- **WHEN** a selected system has no Gathering Tasks
- **THEN** the `Tasks` tab shows a create-task prompt
- **WHEN** filters hide all Gathering Tasks
- **THEN** the `Tasks` tab shows a no-results state with a clear-filter control

## ADDED Requirements

### Requirement: Manager V2 Gathering Task Browser
Manager V2 SHALL provide a real browser for reusable gathering task definitions in the Gathering `Tasks` tab while leaving the Hazards tab placeholder unchanged.

#### Scenario: Task library browser replaces placeholder
- **WHEN** a GM opens Manager V2 Gathering and selects `Tasks`
- **THEN** the main panel lists reusable `GatheringTaskDefinition` records from `gatheringConfig.systems[systemId].tasks`
- **AND** it provides search, status, region, biome, and availability filters
- **AND** it paginates filtered rows
- **AND** it does not render the old task placeholder copy

#### Scenario: Row actions operate on reusable tasks
- **WHEN** a GM uses task row actions
- **THEN** edit selects the task and opens the placeholder editor route
- **AND** duplicate calls the reusable task duplicate store action
- **AND** delete calls the existing reusable task delete action
- **AND** status toggles call the existing reusable task update action

#### Scenario: Task inspector shows selected task details
- **WHEN** a reusable task definition is selected in the task browser
- **THEN** the right inspector shows task status, location filters, availability, active matching environment count, and drop summaries
- **AND** deleting the selected task falls back to another task or an empty inspector

#### Scenario: Placeholder editor is scoped
- **WHEN** a GM edits a reusable task from the browser
- **THEN** the center panel shows a task editor placeholder with the selected task name
- **AND** a back-to-library control returns to the Gathering `Tasks` browser
- **AND** detailed task authoring fields are not shown in this slice

#### Scenario: Empty and no-results states are distinct
- **WHEN** a selected system has no reusable tasks
- **THEN** the `Tasks` tab shows a create-task prompt
- **WHEN** filters hide all reusable tasks
- **THEN** the `Tasks` tab shows a no-results state with a clear-filter control

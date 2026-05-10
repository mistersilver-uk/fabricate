## ADDED Requirements

### Requirement: Reusable Gathering Task Definition Duplication
The admin store SHALL support duplicating reusable `GatheringTaskDefinition` records stored in `gatheringConfig.systems[systemId].tasks`.

#### Scenario: Duplicate reusable task
- **WHEN** `duplicateGatheringLibraryTask(systemId, taskId)` is called for an existing task definition
- **THEN** the task is deep-cloned in the selected system's reusable task library
- **AND** the duplicate receives a new task id
- **AND** every duplicate drop row receives a new row id
- **AND** the duplicate name uses a localized copy suffix
- **AND** normalized fields are preserved
- **AND** `gatheringConfig` is persisted and view state is refreshed
- **AND** the duplicated task is returned

#### Scenario: Missing duplicate target
- **WHEN** the requested system or task does not exist
- **THEN** no config is persisted
- **AND** the method returns `null`

### Requirement: Reusable Gathering Task Definition Browser Matching
Manager V2 task-browser environment counts SHALL reflect active matching environments for the selected system.

#### Scenario: Active matching environment count
- **WHEN** a reusable task definition is listed
- **THEN** its environment count includes enabled selected-system environments that allow the task
- **AND** the task's region and biome filters match the environment metadata
- **AND** enabled current weather and time-of-day settings match the task when the task constrains those dimensions
- **AND** `disabledTaskIds` excludes the task
- **AND** non-empty `enabledTaskIds` allows only listed tasks

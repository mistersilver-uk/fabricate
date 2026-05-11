## MODIFIED Requirements

### Requirement: Gathering Task Library

Reusable gathering task drop rows SHALL support a base drop chance, positive quantity, optional component assignment during authoring, and weather/time modifier rows.

#### Scenario: Task availability gates run before drop modifiers

- **GIVEN** a reusable Gathering Task has task-level `timeOfDay[]` or `weather[]` availability gates
- **WHEN** current conditions do not match those gates
- **THEN** the task SHALL NOT be available for attempt
- **AND** drop-level condition modifiers SHALL NOT make the task available.

#### Scenario: Drop modifiers only adjust rows in available tasks

- **GIVEN** a reusable Gathering Task is available for the current conditions
- **WHEN** a drop row has matching time or weather modifiers
- **THEN** those modifiers SHALL adjust only that drop row chance
- **AND** SHALL NOT change task-level availability for any task.

#### Scenario: Drop row authoring stores valid chance and references

- **WHEN** a reusable Gathering Task drop row is saved
- **THEN** the row SHALL require a `dropRate` integer from `0` to `100`
- **AND** the row SHALL require a positive quantity
- **AND** resolved runtime rows SHALL require either a component reference or item UUID.
- **AND** unresolved editor rows MAY omit component references while a GM is still authoring the row
- **AND** unresolved editor rows SHALL remain disabled until assigned a component or item reference.

#### Scenario: Modifier values normalize as signed percentage points

- **WHEN** a reusable Gathering Task drop row modifier is saved
- **THEN** its value SHALL normalize to a signed integer percentage-point adjustment
- **AND** positive, negative, and zero values SHALL be valid.

#### Scenario: Matching conditions adjust drop chance

- **GIVEN** a reusable Gathering Task drop row has a base drop chance and condition modifiers
- **WHEN** drop resolution runs with matching current weather or time of day
- **THEN** all matching modifier values SHALL be summed and added to the base drop chance
- **AND** the final drop chance SHALL be clamped from `0` to `100`.

#### Scenario: Non-matching modifiers are ignored

- **GIVEN** a reusable Gathering Task drop row has condition modifiers for other weather or time values
- **WHEN** drop resolution runs
- **THEN** those non-matching modifiers SHALL NOT change the row chance.

### Requirement: Gathering Drop Resolution

Gathering Drop Resolution SHALL preserve row order for selected rewards after condition-adjusted drop chance checks.

#### Scenario: D100 drop checks use final drop chance

- **GIVEN** a reusable Gathering Task drop row has a base `dropRate` and matching condition modifiers
- **WHEN** d100 drop resolution checks that row
- **THEN** Fabricate SHALL calculate `finalDropRate = clamp(dropRate + matchingConditionModifiers, 0, 100)`
- **AND** SHALL use `finalDropRate` as the d100 success threshold for that row.

#### Scenario: Duplicate component rows remain independent

- **GIVEN** a reusable Gathering Task has multiple drop rows for the same component
- **WHEN** drop resolution checks the task
- **THEN** each row SHALL keep its own quantity, base chance, and condition modifiers
- **AND** each row SHALL be checked independently before selected-system Gathering Rules filter selected rewards
- **AND** selected rewards SHALL preserve the original row order.

#### Scenario: Zero chance rows are valid but do not drop without modifiers

- **GIVEN** a reusable Gathering Task drop row has `dropRate: 0`
- **WHEN** no matching condition modifier raises the final drop chance above `0`
- **THEN** the row SHALL remain valid
- **AND** the row SHALL not award.

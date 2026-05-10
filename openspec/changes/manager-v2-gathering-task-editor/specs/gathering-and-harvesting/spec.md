## MODIFIED Requirements

### Requirement: Gathering Task Library

Reusable gathering task drop rows SHALL support a base drop chance, positive quantity, and weather/time modifier rows.

#### Scenario: Drop row authoring stores valid chance and references

- **WHEN** a reusable Gathering Task drop row is saved
- **THEN** the row SHALL require a `dropRate` integer from `0` to `100`
- **AND** the row SHALL require a positive quantity
- **AND** the row SHALL require either a component reference or item UUID.

#### Scenario: Matching conditions adjust drop chance

- **GIVEN** a reusable Gathering Task drop row has a base drop chance and condition modifiers
- **WHEN** drop resolution runs with matching current weather or time of day
- **THEN** the matching modifier values SHALL be added to the base drop chance
- **AND** the final drop chance SHALL be clamped from `0` to `100`.

#### Scenario: Non-matching modifiers are ignored

- **GIVEN** a reusable Gathering Task drop row has condition modifiers for other weather or time values
- **WHEN** drop resolution runs
- **THEN** those non-matching modifiers SHALL NOT change the row chance.

### Requirement: D100 Gathering Resolution

D100 Gathering Resolution SHALL preserve row order for selected rewards after condition-adjusted drop chance checks.

#### Scenario: Zero chance rows are valid but do not drop without modifiers

- **GIVEN** a reusable Gathering Task drop row has `dropRate: 0`
- **WHEN** no matching condition modifier raises the final drop chance above `0`
- **THEN** the row SHALL remain valid
- **AND** the row SHALL not award.

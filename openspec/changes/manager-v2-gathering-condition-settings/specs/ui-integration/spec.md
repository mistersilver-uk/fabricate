### Requirement: Manager V2 Gathering Condition Settings
Manager V2 SHALL provide Gathering Settings controls for the selected system's weather and time-of-day condition vocabularies.

#### Scenario: Settings tab shows condition panels
- **WHEN** a GM opens Manager V2 Gathering and selects Settings
- **THEN** the center panel SHALL show `Times of day` and `Weather conditions` sections
- **AND** each section SHALL include an enable toggle, current value selector, add control, value pills, and remove buttons

#### Scenario: Weather and time vocabulary editing is centralized
- **WHEN** a GM edits a gathering environment
- **THEN** the generic tag vocabulary CSV controls SHALL expose region, biome, and danger vocabularies
- **AND** they SHALL NOT expose weather or time-of-day vocabulary CSV controls

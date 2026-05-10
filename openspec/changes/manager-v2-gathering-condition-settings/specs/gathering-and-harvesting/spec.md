### Requirement: Per-System Gathering Condition Settings
Gathering SHALL store weather and time-of-day condition matching settings per crafting system.

#### Scenario: Defaults are seeded for a system
- **WHEN** a crafting system has no explicit gathering condition settings
- **THEN** weather matching is enabled with current `clear` and values `clear`, `cloudy`, `rain`, `storm`, `snow`, `fog`, and `wind`
- **AND** time-of-day matching is enabled with current `day` and values `dawn`, `day`, `dusk`, and `night`

#### Scenario: Disabled dimensions are ignored during matching
- **WHEN** a selected system disables weather or time-of-day matching
- **THEN** reusable task and hazard tags for that disabled dimension SHALL NOT prevent the record from matching an environment

#### Scenario: Deleting a condition value prunes selected-system library records
- **WHEN** a GM deletes a weather or time-of-day value for the selected system
- **THEN** that value SHALL be removed from reusable tasks and hazards in that system
- **AND** reusable tasks and hazards in other systems SHALL NOT be changed

#### Scenario: Last enabled value is protected
- **WHEN** a condition dimension is enabled and contains one remaining value
- **THEN** deleting that value SHALL be rejected

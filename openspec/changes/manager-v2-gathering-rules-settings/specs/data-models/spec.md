## ADDED Requirements

### Requirement: Gathering Config Rules Schema
The `gatheringConfig` world setting SHALL preserve a normalized `rules` object for each configured crafting system.

#### Scenario: Invalid rules normalize
- **WHEN** stored rules contain unknown enum values or non-positive limits
- **THEN** normalization replaces unknown modes and policies with defaults
- **AND** clamps limits to positive integers

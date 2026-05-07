## ADDED Requirements

### Requirement: Step result selection persistence

Recipe steps SHALL persist an optional `resultSelection` object using the same provider schema as recipe-level result selection.

#### Scenario: Serializing a step result selection

- **WHEN** a recipe step contains `resultSelection.provider`
- **THEN** `Recipe.toJSON()` SHALL include that step result selection.

#### Scenario: Deserializing a step result selection

- **WHEN** a recipe is loaded from JSON with `steps[].resultSelection`
- **THEN** the Recipe model SHALL preserve a normalized step result selection.

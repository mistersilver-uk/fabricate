# UI Integration Spec Delta

## ADDED Requirements

### Requirement: Theme Selection

Fabricate MUST expose a global module setting that selects the active product UI colour theme.

#### Scenario: Default theme

- **GIVEN** Fabricate settings are registered for a world with no stored theme preference
- **WHEN** the active theme is resolved
- **THEN** the active theme is `Fabricate`
- **AND** the stored theme id defaults to `fabricate`

#### Scenario: Preserve current palette

- **GIVEN** a user opens Fabricate's module settings
- **WHEN** they open the theme dropdown
- **THEN** `Mythwright` is available
- **AND** selecting `Mythwright` applies the pre-existing product UI colour palette

#### Scenario: Apply selected theme

- **GIVEN** a user changes the theme dropdown
- **WHEN** the setting is saved
- **THEN** Fabricate sets a stable document-level theme attribute for the selected id
- **AND** open Fabricate UI surfaces that consume `--fab-*` tokens update without a reload

#### Scenario: Theme token discipline

- **GIVEN** Fabricate product UI CSS is authored
- **WHEN** colours are needed outside the theme declaration layer
- **THEN** styles MUST reference theme variables or reusable semantic variables
- **AND** raw hex, rgb, rgba, hsl, or hsla colour literals MUST NOT be added outside approved token definitions.

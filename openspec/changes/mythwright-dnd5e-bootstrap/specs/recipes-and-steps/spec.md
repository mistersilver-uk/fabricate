## ADDED Requirements

### Requirement: Routed recipe resolution

Fabricate SHALL treat `resolutionMode: "routed"` as a first-class recipe resolution mode for explicit and implicit recipe steps.

#### Scenario: Macro outcome routes by result group name

- **WHEN** a routed recipe step uses `resultSelection.provider: "macroOutcome"`
- **AND** the crafting check returns an outcome matching a result group name case-insensitively
- **THEN** Fabricate SHALL create results from the matching result group.

#### Scenario: Step result selection overrides recipe result selection

- **WHEN** a recipe and its active step both declare `resultSelection`
- **THEN** Fabricate SHALL use the active step's provider and provider configuration.

#### Scenario: Ingredient set provider remains deterministic

- **WHEN** a routed recipe step uses `resultSelection.provider: "ingredientSet"`
- **THEN** Fabricate SHALL resolve by `ingredientSet.resultGroupId` when present and otherwise fall back to the first result group.

#### Scenario: Roll table provider uses routed mode

- **WHEN** a routed recipe step uses `resultSelection.provider: "rollTableOutcome"`
- **THEN** Fabricate SHALL draw from the configured roll table and match the drawn result name to a result group.

### Requirement: Legacy mode compatibility

Fabricate SHALL preserve existing `mapped` and `tiered` recipe resolution behaviour.

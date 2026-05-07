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

### Requirement: Mythwright mundane and elemental result policy

The Mythwright DnD5e bootstrap SHALL separate mundane SRD quality crafting, elemental infusion crafting, and bespoke relic crafting.

#### Scenario: Mundane SRD finishing excludes Mythic

- **WHEN** Mythwright builds a mundane SRD weapon or armour finishing step
- **THEN** the finishing result groups SHALL include `Flawed`, `Standard`, `Fine`, and `Masterwork`.
- **AND** the finishing result groups SHALL NOT include `Mythic`.

#### Scenario: Relic recipes may use Mythic

- **WHEN** Mythwright builds a bespoke relic recipe
- **THEN** the recipe MAY include a `Mythic` result group.

#### Scenario: Elemental recipes require matching essence

- **WHEN** Mythwright builds a curated elemental finishing recipe
- **THEN** the recipe SHALL require the matching essence and an artisan or mythic catalyst.
- **AND** the recipe SHALL produce the matching curated elemental variant.

#### Scenario: Elemental item payloads expose DnD5e function and visible fallback text

- **WHEN** Mythwright builds an elemental weapon variant from an SRD item with `system.damage.parts`
- **THEN** the payload SHALL add an elemental damage part.
- **WHEN** Mythwright builds an elemental armour or shield variant
- **THEN** the payload SHALL add resistance metadata using an item ActiveEffect and visible description text.

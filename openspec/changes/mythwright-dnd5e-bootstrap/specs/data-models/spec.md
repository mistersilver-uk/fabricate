## ADDED Requirements

### Requirement: Step result selection persistence

Recipe steps SHALL persist an optional `resultSelection` object using the same provider schema as recipe-level result selection.

#### Scenario: Serializing a step result selection

- **WHEN** a recipe step contains `resultSelection.provider`
- **THEN** `Recipe.toJSON()` SHALL include that step result selection.

#### Scenario: Deserializing a step result selection

- **WHEN** a recipe is loaded from JSON with `steps[].resultSelection`
- **THEN** the Recipe model SHALL preserve a normalized step result selection.

### Requirement: Mythwright generated tag policy

The Mythwright DnD5e bootstrap SHALL emit tags only when generated recipes use those tags for tag-placeholder ingredient matching.

#### Scenario: Generated content omits unused tags

- **WHEN** Mythwright builds generated components, recipes, and `CraftingSystem.itemTags`
- **AND** no generated recipe uses a tag-placeholder ingredient that matches those tags
- **THEN** generated components SHALL have empty `tags`.
- **AND** generated recipes SHALL have empty `tags`.
- **AND** `CraftingSystem.itemTags` SHALL be empty.

#### Scenario: Recipe categories remain the UI grouping mechanism

- **WHEN** Mythwright builds generated recipes
- **THEN** recipe `category` values and `CraftingSystem.categories` SHALL provide GM UI grouping/filtering metadata instead of generated tags.

### Requirement: Mythwright authored variant identity

The Mythwright DnD5e bootstrap SHALL keep SRD base items source-linked while treating generated quality and elemental variants as Mythwright-authored world items.

#### Scenario: Variant strips SRD matching identity

- **WHEN** Mythwright creates a generated quality or elemental variant from an SRD item
- **THEN** the variant SHALL strip SRD matching fields such as `flags.core.sourceId`, `_stats.compendiumSource`, `sourceUuid`, `sourceItemUuid`, and `fallbackItemIds`.
- **AND** the variant MAY preserve the base SRD UUID as Mythwright provenance metadata.

#### Scenario: Elemental tiers preserve standard identity

- **WHEN** Mythwright creates tiered elemental variants for a curated elemental definition
- **THEN** the `Standard` variant SHALL keep the existing deterministic elemental ID.
- **AND** non-standard quality variants SHALL use deterministic quality-qualified IDs.

### Requirement: Mythwright authored icon validity

The Mythwright DnD5e bootstrap SHALL use valid Foundry core icon paths for Mythwright-authored images.

#### Scenario: Generated authored content uses valid icons

- **WHEN** Mythwright creates generated items, recipes, or its crafting check macro
- **THEN** hardcoded Mythwright icon paths SHALL exist in the Foundry core icon inventory.
- **AND** SRD-derived base items MAY preserve their source item image from DnD5e compendium data.

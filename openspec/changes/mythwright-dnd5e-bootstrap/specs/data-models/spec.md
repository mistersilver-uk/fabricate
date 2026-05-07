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

The Mythwright DnD5e bootstrap SHALL use component and recipe tags only for matchable traits, filtering roles, or essence identity.

#### Scenario: Generated content omits system-association tags

- **WHEN** Mythwright builds generated components, recipes, and `CraftingSystem.itemTags`
- **THEN** those generated tags SHALL NOT include a `mythwright` tag whose only purpose is identifying the source bootstrap.

#### Scenario: Generated tags describe matching traits

- **WHEN** Mythwright tags generated SRD, quality, elemental, essence, relic, component, or catalyst content
- **THEN** the tags SHALL describe matching/filtering traits such as `weapon`, `armor`, `srd`, `quality`, `elemental`, essence IDs, `relic`, `component`, `essence`, or `catalyst`.

### Requirement: Mythwright authored variant identity

The Mythwright DnD5e bootstrap SHALL keep SRD base items source-linked while treating generated quality and elemental variants as Mythwright-authored world items.

#### Scenario: Variant strips SRD matching identity

- **WHEN** Mythwright creates a generated quality or elemental variant from an SRD item
- **THEN** the variant SHALL strip SRD matching fields such as `flags.core.sourceId`, `_stats.compendiumSource`, `sourceUuid`, `sourceItemUuid`, and `fallbackItemIds`.
- **AND** the variant MAY preserve the base SRD UUID as Mythwright provenance metadata.

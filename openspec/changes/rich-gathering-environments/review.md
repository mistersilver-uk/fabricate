# Review: Actor Gathering App Reference

## Review Input

- [Actor Gathering App](<../fabricate-ui-design-system-manager-v2/references/Actor Gathering App.png>)

## Accepted Direction

The reference is a strong direction for making gathering feel like a fantasy activity instead of a thin roll-table interface.

Keep:

- actor-first header with selected actor and party/component sources
- prominent gathering stamina summary
- clear `Environments` and `Gathering Log` navigation
- environment browser with image-led rows
- region and biome filters
- risk/status chips such as safe, hazardous, unsafe, and extreme
- selected environment task list
- task rows with image, description, requirements/tools, and stamina cost
- selected environment detail with large image, region, biome, time of day, weather, visibility, and risk
- active task detail with requirements, potential results, notes, and primary start action
- result preview cards where visibility rules allow them
- dense but readable three-column layout at normal Foundry sizes

## Domain Opportunities

The image suggests several domain improvements beyond presentation:

- Environments should be independent places, not just scene wrappers.
- Scene links should remain optional evidence/access gates.
- Regions make environments searchable and grounded in a world map or campaign geography.
- Biomes help players understand what kinds of resources to expect.
- Weather and time of day can make gathering dynamic without changing the recipe model.
- Tasks can represent resource node types with availability and depletion.
- Node respawn can be manual, world-time-driven, probabilistic, or a hybrid.
- Risk levels make gathering choices meaningful.
- Encounter tables can add consequences without forcing Fabricate to become travel automation.
- Stamina can serve as a faster expedition economy for systems that do not want long timed runs or strict node respawn pacing.

## Corrections Before Implementation

- Do not expose potential results for blind or hidden tasks to non-GM users.
- Do not make stamina mandatory. It is an optional gathering economy.
- Do not make environment scene linkage mandatory.
- Do not make encounter tables mandatory.
- Do not hardcode dnd5e, pf2e, or any other system's stamina resource paths in core.
- Do not let probabilistic respawn reroll on every UI refresh; evaluated outcomes must persist.
- Do not let node count directly replace result quantity; result groups still define gathered outputs.
- Do not introduce standalone harvesting. Harvesting remains recipe or salvage data.

## Spec Outcome

This review produced:

- `specs/gathering-and-harvesting/spec.md` requirements for rich environments, regions/biomes, conditions, resource nodes, respawn, gathering economy mode, stamina, risk/encounters, and rich attempt lifecycle.
- `specs/ui-integration/spec.md` requirements for GM rich environment management, Actor Gathering app browsing, stamina presentation, and rich information disclosure.

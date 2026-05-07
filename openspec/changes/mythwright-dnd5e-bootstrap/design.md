# Mythwright DnD5e Bootstrap Design

## Runtime

`routed` becomes a canonical recipe resolution mode alongside legacy `tiered`. Legacy `tiered` keeps outcome routing by explicit `outcomeRouting`. Canonical `routed` delegates result group choice to `resultSelection.provider`.

Provider behaviour:

- `ingredientSet`: uses `ingredientSet.resultGroupId`, then caller-selected result group, then first group.
- `macroOutcome`: compares the crafting check outcome to result group names case-insensitively. Reserved fail and miss keywords produce no output.
- `rollTableOutcome`: draws from the configured table and matches the drawn result name to a result group.

Step-level `resultSelection` overrides recipe-level `resultSelection`, allowing non-final Mythwright steps to route to `Standard` while final finishing steps route to the quality ladder.

## Bootstrap Script

The world script:

- Requires GM permission, DnD5e, and Fabricate readiness.
- Discovers DnD5e Item compendiums dynamically from `game.packs`.
- Resolves SRD weapons and armour by normalized name and type.
- Creates or updates world Items under the `Mythwright > ...` folder tree using folder path and item name as identity.
- Creates or updates the `mythwright-dnd5e` crafting system through Fabricate's managers.
- Creates or updates recipes and gathering environments by deterministic IDs.
- Creates or updates a `Mythwright Crafting Check` world Macro and records its UUID on the system.

The script exposes helper functions on `globalThis.MythwrightDnd5eBootstrap` so the idempotency and SRD matching behaviour can be tested under Node without a live Foundry runtime.

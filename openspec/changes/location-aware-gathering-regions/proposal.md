# Location-Aware Gathering Regions

## Summary

Introduce location-aware gathering by making **Region** a first-class per-crafting-system geography record and adding Fabricate-managed **Parties** whose current region can drive gathering availability, player travel guidance, discovery, and future Foundry V13 Scene Region automation.

The design separates the concepts that currently blur together:

- **Region**: named geography such as `The Verdant Expanse`.
- **Biome**: descriptive terrain/ecology traits on a region, such as `forest`, `swamp`, or `coastal`.
- **Environment**: a reusable gathering place or activity profile that can be available in explicit regions or any region with matching biomes.
- **Party**: a Fabricate-managed world record with actor members and exactly one travel actor — the Actor that represents the party on a campaign map.

## Motivation

Gathering currently treats region/biome as static environment metadata. That supports authoring evidence, but it does not let the table ask the more important exploration question: "Where is the party right now, and what can they gather here?"

Exploration-heavy GMs need location context that changes as the party travels. A manual current-region control provides immediate value, while Foundry V13 Scene Regions and polygons create a natural later extension for hexcrawl/travel maps. Players benefit from a gathering view that explains unavailable options as travel goals without leaking secret geography.

## Goals

- Add first-class `GatheringRegion` records scoped to one crafting system.
- Keep regions as geography, not as environment containers; environments continue to own their availability rules.
- Add Fabricate-managed `GatheringParty` records as world/cross-system settings with actor membership and exactly one travel actor — the Actor that represents the party on a campaign map for region presence sensing.
- Enforce one-to-one party/travel-actor assignment: one enabled party has one travel actor, and one travel actor cannot represent multiple enabled parties.
- Enforce one enabled party per actor member so selected-actor location is unambiguous.
- Resolve a party's current regions per crafting system from a GM override first, then Foundry Scene Region mappings derived from the travel actor's placed token(s) when automation is available.
- Track region discovery on actors through Fabricate actor flags, updated through party travel and manual GM reveal controls.
- Let environments declare availability through explicit included regions, included biomes, and optional explicit exclusions.
- Surface player-facing unavailable guidance such as "Travel to Ashen March" or "Available in undiscovered regions" without exposing secret region names.
- Support secret regions that appear to players as undiscovered until revealed.
- Add region modifiers as a future-capable runtime input for hazard chance, drop rates, yield, difficulty, or related gathering calculations.
- Keep the feature system-agnostic and independent of game-system party actor types.
- Prepare for Foundry V13 Scene Region/polygon mapping without requiring map automation for the first implementation slice.

## Non-Goals

- No full travel simulation, pathfinding, calendar integration, or random encounter engine.
- No support for multiple travel actors per party.
- No support for one actor being an enabled member of multiple parties.
- No user-based party membership; membership is actor-based.
- No reliance on system-specific party/group actor types.
- No requirement that every world use Scene Regions or hex maps.
- No destructive migration that immediately removes existing environment `region` and `biomes` fields.
- No mandatory new dependency.

## Product Phasing

1. **Manual MVP**: Regions, parties, actor membership, one travel actor, GM current-region override, actor discovery, environment availability, and player travel guidance.
2. **Scene automation**: Foundry V13 Scene Region mapping, token-enter/token-exit based current-region updates, and automatic discovery.
3. **Region modifiers**: Apply region-derived modifiers to listing evidence, start guards, and live result calculations with clear player/GM disclosure settings.
4. **Importable travel kits**: Per-system region presets and optional scene compendia whose Foundry Scene Regions map to Fabricate regions.

## Affected Specs

- `gathering-and-harvesting`
- `data-models`
- `ui-integration`

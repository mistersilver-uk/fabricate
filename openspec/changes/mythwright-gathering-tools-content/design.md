# Design: Mythwright Gathering Tools Content

## Runtime Tool Resolution

`GatheringEngine` will introduce one internal resolver that returns the effective tools for a task. It will:

- read `task.toolIds` as the persisted library-reference source,
- resolve ids against `environment.__libraryTools` when available,
- return missing or disabled library ids as blocking references,
- append legacy inline `task.tools` for backwards compatibility, and
- return plain tool objects to the existing availability, breakage plan/apply, and evidence paths.

Using one resolver avoids divergence between start gates, listing blocked reasons, immediate terminal attempts, persisted terminal history, and timed terminal completion.

Missing or disabled library references block with `TOOL_BLOCKED` before actor inventory checks. The tool availability injectable remains responsible for actor inventory presence, broken actor item detection, and optional requirement checks.

## Mythwright Bootstrap Content

`scripts/foundry/create-mythwright-dnd5e.js` will seed:

- six reusable gathering tools: mining pick, wood axe, skinning knife, delver kit, planar binding rod, and dragon tongs,
- one broken managed component per tool,
- `breakageChance` settings with `onBreak.replaceWith` pointing at the broken component,
- repair recipes that consume the broken component and matching Mythwright materials,
- expanded gathering tasks under `gatheringConfig.systems[mythwright-dnd5e].tasks` using `toolIds`,
- environments that compose the seeded task-library records instead of relying on legacy inline-only environment task content, and
- plausible SRD item rewards for adventuring finds where matching compendium items are available.

The bootstrap already resolves SRD item UUIDs and creates deterministic Mythwright world items/components. The new content should continue to use deterministic ids and upsert existing systems, recipes, items, and environments.

The canonical gathering spec will be updated to state that a required tool id that cannot resolve, or that resolves to a disabled library tool, blocks the task with `TOOL_BLOCKED`. The canonical data-model spec will also be updated so `Tool` is described as a per-system library entry referenced by task `toolIds`, not inline per-task authored data.

## Testing

Runtime tests will cover library `toolIds` resolution, missing and disabled library references blocking with `TOOL_BLOCKED`, listing blocked reasons, timed completion through `processWorldTime`, missing actor tools, broken actor items, requirement failure propagation, breakage replacement evidence in the public response and persisted run payload, and legacy inline tools.

Bootstrap tests will validate deterministic tool ids, broken managed components, repair recipes, and seeded environments/tasks with `toolIds` rather than inline tool objects.

## Risks

- The engine has several tool touchpoints; using one resolver is necessary to keep blocking, planning, application, and timed completion consistent.
- Mythwright repair recipes depend on broken tool components being included in the system component payload before recipe creation.
- SRD reward UUIDs are only available for items listed in the bootstrap's DnD5e 2024 equipment table; tests should assert structure without requiring live Foundry compendium access.

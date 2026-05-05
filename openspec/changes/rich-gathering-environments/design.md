# Design: Rich Gathering Environments

## Reference

Primary visual reference:

- [Actor Gathering App](<../fabricate-ui-design-system-manager-v2/references/Actor Gathering App.png>)

The image is a direction, not an executable specification. It should guide hierarchy, player-facing fantasy, information density, environment browsing, stamina prominence, and task selection. Written requirements in this change remain authoritative when the mock-up omits edge cases or conflicts with Fabricate runtime rules.

## Domain Direction

Gathering becomes a location-first activity.

The key shift is that an environment is no longer primarily "a task list optionally linked to a scene." It is a configured place in the world, with region, biome, risk, current conditions, resource availability, and optional scene evidence. Scenes can still gate player self-service, but an environment can also stand alone as a place the GM exposes to players.

## New Concepts

### Regions

Regions are searchable world areas such as `Elderglen Valley`, `Stonecrag Highlands`, or `Stormbreak Shore`.

Initial recommendation:

- Store region as environment-local text first.
- Add reusable region definitions only if repeated region metadata becomes necessary.
- Player filters should treat region as a first-class facet even if the backing data is initially text.

### Biomes

Biomes classify environment ecology such as `Forest`, `Grassland`, `Mountain`, `Coastal`, `Wasteland`, or `Swamp`.

Biomes are useful for player filtering, GM organization, and future yield/condition rules. They should be configured as system-level or environment-local strings before introducing a global taxonomy.

### Conditions

Environments can have GM-controlled current conditions:

- time of day
- weather
- visibility or traversal condition where useful

Conditions may modify task availability, yield, risk, stamina cost, or check difficulty through declarative modifiers. They must not require hardcoded game-system logic in core.

### Resource Nodes

A gathering task can represent a node type with a configured available count.

Examples:

- `Harvest Wild Herbs`: 8 stamina, 4 available nodes, respawns each dawn with 60% chance.
- `Scavenge Mushrooms`: requires knife or sickle, 2 available nodes, manual GM restock only.
- `Search for Insects`: 6 stamina, uses encounter risk on failure.

Node availability is distinct from result quantity. A node count controls attempt availability/depletion; result groups still control what the actor receives from an attempt.

### Respawn Policies

Respawn can be one of:

- manual GM control
- elapsed world time
- probability on elapsed world time
- both manual and world-time/probability
- disabled/static

World-time respawn should be deterministic enough to test and inspect. Random/probabilistic respawn decisions must be persisted once evaluated so repeated UI refreshes do not reroll availability.

### Risk And Encounters

Risk level describes how dangerous an environment or task is. It is player-facing.

Encounter tables are optional GM-authored hooks. They can trigger on attempt, failure, critical failure, high-risk task, node depletion, or other supported event hooks. Core should select or report encounter outcomes; actual encounter automation can remain integration/provider-owned.

### Stamina

Stamina is an optional gathering economy.

When enabled, actors spend stamina to attempt gathering tasks. Stamina regenerates over world time, rest events, manual GM adjustment, or provider-specific formulas. It can replace long task durations and node-respawn waiting for groups that want an expedition resource loop.

Stamina is actor-scoped, not component-source-scoped.

## Mode Fit

Crafting systems with gathering enabled may choose a gathering economy:

- `time`: current timeRequirement and active-run model remains primary.
- `nodes`: node counts and respawn are primary; tasks may be immediate or timed.
- `stamina`: stamina cost and regeneration are primary; node counts may be disabled.
- `hybrid`: combines stamina, nodes, and/or time where configured.

The UI should avoid presenting all economies at once. The selected system economy determines which controls are primary and which are advanced or hidden.

## Runtime Principles

- Existing immediate and timed gathering runs remain valid.
- Node depletion happens only after an accepted attempt reaches the configured depletion point.
- Stamina spend happens only after guards pass and before terminal resolution begins.
- If terminal history persistence fails, committed result/catalyst side effects still must not occur. Stamina and node rollback behavior must be explicit in implementation design before code changes.
- Blind environments continue to redact task identity and result details for non-GM users.
- GM controls can inspect and override node availability, condition state, risk, and stamina when permissions allow.

## GM App Direction

The GM environment editor should become a rich place-authoring surface:

- environment identity: name, description, image, enabled state
- world placement: region, biome, optional scene link
- current conditions: time of day, weather, visibility/travel condition
- player discoverability/search tags where needed
- risk: environment risk level and optional task overrides
- economy: time, nodes, stamina, or hybrid
- task/node list with availability counts, max counts, depletion rules, respawn policy, and manual restock controls
- result/routing/progressive authoring remains the task resolution surface
- encounter table configuration and trigger hooks
- preview/evidence column showing player-facing summary, available nodes, modified yields/costs, risk, and validation

The GM browse view should make environments searchable by name, region, biome, risk, availability, and current condition.

## Actor App Direction

The Actor Gathering app should feel like choosing where and how to gather in the world:

- top header for selected actor, component sources where relevant, stamina summary when enabled, and `Environments`/`Gathering Log` tabs
- left environment browser with search, region filter, biome filter, risk/status chips, and image-led rows
- center task list for the selected environment, including task image, name, description, requirement/tool summary, stamina cost/time cost/node state, and start/select action
- right environment detail with image, region, biome, risk, time of day, weather, visibility, active task, potential results where visible, notes, and start action
- active/log surfaces show started tasks, completed attempts, failures, encounter events, stamina spending/regeneration where relevant, and blind redaction

The Actor app must present strong fantasy while staying honest about hidden information. Potential result previews are allowed only when the task is targeted and visible, or when GM visibility permits them.

## Compatibility

Legacy environments without the new fields should continue to load as:

- no region
- no biome
- no current conditions
- scene link remains optional
- current timeRequirement behavior remains unchanged
- no node count or respawn gating
- no stamina cost
- risk defaults to `safe` or equivalent neutral display state

Migration strategy should be additive: new fields get defaults, old fields are not rewritten unless the GM saves the environment through the new editor.

## Open Questions

- Should reusable region/biome definitions live on the crafting system, world settings, or environment records only?
- Should stamina be a Fabricate actor flag by default, or always delegated to a provider when a game system has a native resource?
- Should encounter outcomes create chat messages, journal links, scene notes, or only return structured data to a provider/integration?
- Should weather/time conditions be per environment, shared globally, or optionally inherited from a calendar/weather integration?

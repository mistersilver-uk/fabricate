# Gathering And Harvesting Delta

## ADDED Requirements

### Requirement: Rich gathering environments

Gathering environments MUST support richer place metadata while preserving optional scene linkage.

1. A gathering environment MAY define a player-facing image independent of any linked scene.
2. A gathering environment MAY define a `region` label used for player search/filtering and GM organization.
3. A gathering environment MAY define a `biome` label used for player search/filtering, GM organization, and condition/yield rules.
4. A gathering environment MAY define a risk level. Supported initial risk levels SHOULD include `safe`, `hazardous`, `unsafe`, and `extreme`.
5. A gathering environment MAY define current condition state, including time of day and weather.
6. Scene linkage MUST remain optional. If `sceneUuid` is absent, the environment is not scene-gated by default and may still be player-visible when other guards pass.
7. If `sceneUuid` is present, existing scene/token access rules still apply unless a later approved requirement adds a different access policy.
8. Environment metadata MUST be display-safe for non-GM users. It MUST NOT leak hidden task identity, hidden result details, provider diagnostics, or GM-only notes.
9. Legacy environments without rich metadata MUST remain valid and load with neutral defaults.

### Requirement: Gathering regions and biomes

Regions and biomes MUST make environments easier to ground in the game world and easier for players to browse.

1. Region values identify world areas such as valleys, shores, forests, highlands, districts, or ruins.
2. Biome values identify ecological or terrain classifications such as forest, grassland, mountain, coastal, swamp, wasteland, cave, urban, or ruins.
3. Region and biome values MAY initially be environment-local strings.
4. If reusable vocabularies are introduced, they MUST be system-owned or world-owned by an explicit data-model change and MUST include migration/defaulting rules.
5. Player-facing environment listings SHOULD expose region and biome filters when those fields are present on one or more visible environments.
6. GM-facing environment listings SHOULD expose region and biome filters and SHOULD show unclassified environments explicitly rather than hiding them.

### Requirement: Environment conditions

Gathering environments MUST support GM-controlled condition state for time of day and weather.

1. Condition state MAY include `timeOfDay`, `weather`, and `visibility` or equivalent labels.
2. Condition values MUST be authored or selected by the GM unless an approved integration provider supplies them.
3. Condition state MAY modify task availability, result yield, check difficulty, stamina cost, risk, or encounter chance.
4. Condition modifiers MUST be declarative or provider-driven. Fabricate core MUST NOT hardcode game-system-specific weather, time, or skill formulas.
5. A gathering attempt SHOULD snapshot relevant condition state when the attempt starts so active runs and history can explain what conditions affected the attempt.
6. Player-facing UI MAY show beneficial or harmful condition notes only when those notes are not hidden by blind task or visibility rules.
7. Changing current environment conditions MUST NOT retroactively rewrite completed gathering history.

### Requirement: Gathering resource nodes

Gathering tasks MAY represent resource node types with availability counts.

1. A task MAY define a maximum node count.
2. A task MAY define a current available node count.
3. Available node count controls whether additional attempts may start. It does not directly define result quantity.
4. Result quantity remains governed by routed/progressive task resolution and result group data.
5. A task with node gating and `availableCount <= 0` MUST be blocked for non-GM start attempts unless a GM override is explicitly used.
6. Node availability MUST be evaluated after environment/task visibility and before terminal resolution.
7. Node depletion MUST occur only after an attempt is accepted according to the configured depletion timing.
8. Supported depletion timing SHOULD include at least `onStart` and `onSuccess`.
9. If a task is blind, node count display to non-GM users MUST use generic availability copy unless revealing the count is explicitly safe for that environment.
10. GM users MUST be able to inspect and manually adjust node availability.

### Requirement: Node respawn policies

Gathering task nodes MUST support configurable respawn policies.

1. A respawn policy MAY be `manual`, `elapsedTime`, `probability`, `manualAndElapsedTime`, or `none`.
2. `manual` means only a GM restock action changes available node count.
3. `elapsedTime` means nodes become available after a configured world-time interval.
4. `probability` means a configured world-time interval creates a persisted chance to restore nodes.
5. `manualAndElapsedTime` means both GM restock and world-time restoration are allowed.
6. Probabilistic respawn MUST persist the evaluated roll/outcome so repeated listing refreshes do not reroll the same interval.
7. Respawn evaluation MUST be deterministic from persisted state once evaluated.
8. Respawn MUST NOT exceed the task's configured maximum node count unless a GM override explicitly changes the maximum or applies an overstock action.
9. Respawn and restock events SHOULD be visible in GM logs or audit-style UI where practical.
10. Player-facing UI SHOULD show availability and next respawn hints only when those hints do not violate hidden/blind environment rules.

### Requirement: Gathering economy mode

Crafting systems with gathering enabled MUST be able to define which gathering economy is primary.

1. Supported gathering economy modes SHOULD include `time`, `nodes`, `stamina`, and `hybrid`.
2. `time` preserves existing `timeRequirement` active-run behavior as the primary pacing model.
3. `nodes` uses task availability/depletion/respawn as the primary pacing model.
4. `stamina` uses actor stamina spend/regeneration as the primary pacing model.
5. `hybrid` allows a system to combine configured time requirements, node availability, and stamina costs.
6. The selected economy mode MUST control which GM authoring controls are primary, secondary, or hidden.
7. Existing gathering systems without an economy mode MUST behave as `time` or equivalent legacy-compatible mode.

### Requirement: Gathering stamina

Gathering stamina MUST be optional and actor-scoped.

1. A crafting system MAY enable gathering stamina.
2. When stamina is enabled, a gathering task MAY define a stamina cost.
3. A start attempt MUST be blocked if the selected actor lacks the required stamina and no GM override is used.
4. Stamina spend MUST occur only after start guards pass.
5. Stamina spend, refund, and rollback semantics MUST be explicit in implementation design before production code changes.
6. Stamina MAY regenerate by elapsed world time, rest event, manual GM adjustment, or provider-specific formula.
7. System-specific stamina formulas MUST be provider-driven or configured; Fabricate core MUST NOT hardcode system-specific resource paths.
8. Actor stamina state MAY be stored in Fabricate actor flags when no external provider owns stamina.
9. Actor stamina display MUST include current and maximum values when known.
10. Stamina history SHOULD record enough evidence for players and GMs to understand spend and regeneration events.

### Requirement: Gathering risk and encounters

Gathering environments and tasks MAY define risk levels and encounter hooks.

1. An environment MAY define a default risk level.
2. A task MAY override the environment risk level.
3. Risk level MUST be player-facing unless hidden by blind/visibility rules.
4. Risk level MAY modify encounter chance, failure outcome, check difficulty, stamina cost, or result yield through declarative modifiers or providers.
5. A task or environment MAY define one or more encounter table hooks.
6. Encounter hooks SHOULD support attempt, success, failure, critical failure, node depletion, and high-risk event points where those event points are available.
7. Encounter table resolution MUST be optional. A gathering attempt without encounter configuration behaves normally.
8. Encounter outcomes MUST be persisted or reported consistently enough that UI refreshes do not duplicate the same encounter.
9. Encounter automation beyond selecting/reporting an outcome MAY be delegated to integrations or macros.
10. Non-GM player-facing encounter feedback MUST respect blind-task redaction and visibility rules.

### Requirement: Rich gathering attempt lifecycle

Gathering start and completion MUST account for rich environment features when they are enabled.

1. Start guards MUST evaluate node availability and stamina after existing environment/task/scene/visibility/catalyst guards pass and before terminal resolution begins.
2. Condition modifiers MUST be resolved before check/provider execution when they affect check difficulty, yield, stamina cost, risk, or availability.
3. The attempt SHOULD snapshot economy-relevant data: selected environment conditions, risk level, stamina cost/spend, node depletion, and encounter hook state.
4. Timed runs MUST preserve the condition/economy snapshot needed to resolve or explain the run at completion.
5. If conditions are intended to affect completion rather than start, that behavior MUST be configured explicitly and visible to the GM.
6. History entries SHOULD include redaction-safe summaries of stamina spent, node availability changes, condition modifiers, risk, and encounter outcomes.
7. Blind environments MUST continue to redact real task identity, hidden results, provider diagnostics, and sensitive encounter details for non-GM users.

## MODIFIED Requirements

### Requirement: Gathering scope

The existing gathering scope is expanded to include rich environment metadata, resource-node availability, respawn, conditions, risk, encounters, and optional stamina. This change still does not introduce standalone harvesting, map travel simulation, or hardcoded system-specific skill logic.

# Gathering And Harvesting Delta

## ADDED Requirements

### Requirement: Rich gathering environments

Gathering environments MUST support richer place metadata while preserving optional scene linkage.

1. A gathering environment MAY define a player-facing image independent of any linked scene.
2. A gathering environment MAY define a `region` label used for player search/filtering and GM organization.
3. A gathering environment MAY define a `biome` label used for player search/filtering, GM organization, and condition/yield rules.
4. A gathering environment MAY define a risk level. Supported initial risk levels SHOULD include `safe`, `hazardous`, `unsafe`, and `extreme`.
5. A gathering environment MUST NOT own current weather or current time of day in the reusable-library model. It MAY define condition override notes or inheritance metadata, but the active weather/time state is global gathering state.
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

### Requirement: Global gathering conditions

Gathering MUST support GM-controlled global condition state for time of day and weather.

1. Global condition state MUST include current `weather` and current `timeOfDay`.
2. Global condition settings MUST include tag vocabularies for regions, biomes, danger, weather, and time of day.
3. Default vocabularies MUST seed biomes, danger, weather, and time of day when no custom values exist; regions default to empty because campaign geography is world-specific.
4. Default current weather MUST be `clear`.
5. Default current time of day MUST be `day`.
6. Condition values MUST be authored or selected by the GM unless an approved integration provider supplies them.
7. Condition mutation APIs MUST validate requested values against the configured vocabularies.
8. Authorized mutation APIs MUST persist condition changes, dispatch `fabricate.gathering.conditionsUpdated`, and refresh gathering listings.
9. Player-facing APIs MAY read current conditions but MUST NOT mutate them.
10. Environments MAY use weather/time as matching dimensions for reusable tasks and hazards, but player environment browse filters MUST NOT expose weather/time as environment filters.
11. Condition state MAY include `visibility` or equivalent labels in later provider-backed slices.
12. Condition state MAY modify task availability, result yield, check difficulty, stamina cost, risk, or encounter chance.
13. Condition modifiers MUST be declarative or provider-driven. Fabricate core MUST NOT hardcode game-system-specific weather, time, or skill formulas.
14. A gathering attempt SHOULD snapshot relevant condition state when the attempt starts so active runs and history can explain what conditions affected the attempt.
15. Player-facing UI MAY show beneficial or harmful condition notes only when those notes are not hidden by blind task or visibility rules.
16. Changing current global conditions MUST NOT retroactively rewrite completed gathering history.

### Requirement: Reusable gathering task libraries

Crafting systems with gathering enabled MUST support reusable GM-authored gathering task records.

1. A task record MUST be scoped to one crafting system.
2. A task record MUST include name, description, image, enabled state, and ordered item drop rows.
3. A task record MAY include matching tags for `region`, `biomes[]`, `weather[]`, and `timeOfDay[]`.
4. Empty matching tags for a dimension mean the task matches any value for that dimension.
5. A task matches an environment only when every configured task dimension matches the environment tags plus current global weather/time.
6. Disabled task records MUST NOT match for player gathering.
7. Item drop rows MUST include an item or component reference, quantity, enabled state, and `dropRate` from 1 through 100.
8. Task item selection mode MUST be `highestRankedDrop` or `allDrops`.
9. A task MAY define stamina cost and a gathering roll modifier provider.
10. Environment records MAY toggle matching task records on or off without copying their full task definition.
11. Per-environment overrides MUST remain associated with the environment and MUST NOT rewrite the reusable task definition.
12. Legacy embedded environment tasks MUST remain valid as inline compatibility tasks.

### Requirement: Reusable gathering hazard libraries

Crafting systems with gathering enabled MUST support reusable GM-authored hazard records.

1. A hazard record MUST be scoped to one crafting system.
2. A hazard record MUST include name, description, image, enabled state, and `dropRate` from 1 through 100.
3. A hazard record MAY include matching tags for `dangerTags[]`, `region`, `biomes[]`, `weather[]`, and `timeOfDay[]`.
4. Empty matching tags for a dimension mean the hazard matches any value for that dimension.
5. A hazard matches an environment only when every configured hazard dimension matches the environment tags plus current global weather/time.
6. Disabled hazard records MUST NOT match for player gathering.
7. A hazard MAY define a hazard roll modifier provider.
8. If no hazards are enabled and matched, the environment is mechanically safe even when it has danger tags.
9. Environment records MAY toggle matching hazard records on or off without copying their full hazard definition.
10. Hazard output MUST respect blind task and GM-only redaction rules.

### Requirement: Environment composition by tags

Gathering environments MUST compose reusable tasks and hazards from their configured tags and global conditions.

1. An environment MUST support one `region` value.
2. An environment MUST support zero or more `biomes[]` values.
3. An environment MUST support zero or more `dangerTags[]` values.
4. `danger` is the reusable-library matching vocabulary. Existing `risk` display values MAY map to danger tags for compatibility, but the matching contract MUST use `dangerTags[]`.
5. Matching tasks MUST use environment region/biomes plus global weather/time.
6. Matching hazards MUST use environment region/biomes/danger tags plus global weather/time.
7. Weather and time of day MUST NOT be environment-owned browse filters.
8. GM authoring screens MAY filter task and hazard libraries by weather/time tags for authoring.
9. Player listings MUST show the current global weather/time as context.
10. Player listings MUST show only enabled matching tasks and player-safe matched hazard/risk evidence.

### Requirement: Gathering-native d100 resolution

Gathering MUST support a `d100` task resolution mode for reusable task drop rows and matched hazards.

1. For every enabled item drop row in the selected task, Fabricate MUST roll `d100`, add the gathering modifier, and drop the row when `effectiveRoll >= 101 - dropRate`.
2. For every enabled matched hazard in the environment, Fabricate MUST roll `d100`, add the hazard modifier, and drop the hazard when `effectiveRoll >= 101 - dropRate`.
3. `dropRate` MUST be an integer from 1 through 100.
4. `highestRankedDrop` item selection MUST keep only the first dropped item row by task row order.
5. `allDrops` item selection MUST keep every dropped item row.
6. Environment hazard selection mode MUST support `highestRankedDrop` and `allDrops`.
7. Environment hazard policy MUST support success-with-hazard and failure-with-hazard behavior.
8. D100 resolution MUST write roll, modifier, threshold, selected item rows, selected hazards, condition snapshot, and hazard policy evidence where safe to reveal.
9. D100 resolution MUST preserve history-before-side-effects ordering.
10. Existing routed and progressive task resolution modes MUST remain valid compatibility behavior.

### Requirement: Natural gathering expressions and macros

Gathering checks, condition modifiers, stamina formulas, and attempt-limit formulas MUST allow natural game-system expressions where a supported system exposes them.

1. `dnd5e` expression fields MUST allow natural dnd5e roll/formula syntax with actor data references, such as `1d20 + @skills.prc.total + @prof`, subject to the selected dnd5e version's supported data paths.
2. `pf2e` expression fields MUST allow natural pf2e roll/formula syntax with actor data references, subject to the selected pf2e version's supported data paths.
3. Expression evaluation MUST use the selected gathering actor as the primary actor context.
4. Expression fields MUST support roll terms where the owning provider supports rolls, not only static numeric expressions.
5. Fabricate core MUST NOT invent a parallel replacement formula language for dnd5e or pf2e.
6. A GM MUST be able to choose a custom macro provider instead of a dnd5e or pf2e expression provider where the relevant feature supports provider choice.
7. Macro providers MUST receive enough context to make equivalent decisions: environment, task, actor, current conditions, stamina state where enabled, node/attempt state where enabled, risk, and triggering lifecycle event.
8. Provider diagnostics from invalid expressions, unsupported data paths, macro exceptions, or malformed macro return values MUST be GM-fix-required diagnostics, not normal player failure outcomes.
9. Player-facing UI MUST show safe failure/blocking copy for provider diagnostics without exposing macro internals, expression source, or GM-only data to non-GM users.

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

### Requirement: Gathering task attempt limits

Gathering tasks MAY define attempt limits separately from node availability.

1. A task MAY define a maximum number of accepted attempts per actor, per environment, per task, per user, or globally, as selected by GM configuration.
2. A task MAY define an attempt-limit time window, such as per hour, per day, per rest period, or a custom world-time duration.
3. A task MAY define probabilistic attempt recharge triggered by elapsed world time.
4. A task MAY define manual GM recharge of attempts.
5. A task MAY define both manual and elapsed/probabilistic recharge.
6. Attempt limits MUST be evaluated after visibility and access guards but before stamina spend, node depletion, provider execution, terminal history, or result creation.
7. Probabilistic attempt recharge MUST persist evaluated recharge outcomes so repeated UI refreshes do not reroll the same recharge interval.
8. Attempt-limit counters and recharge state MUST be scoped according to the configured limit scope.
9. GM users MUST be able to inspect and manually adjust attempt counters and recharge state.
10. Player-facing UI SHOULD show remaining attempts or generic exhausted/recharging copy when doing so does not violate blind or hidden-task rules.
11. Attempt limits MUST NOT replace node availability. A task may have node limits, attempt limits, both, or neither.

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
6. A crafting system MUST let the GM choose whether stamina regenerates over time, regenerates from explicit rest/provider events, is manual-only, or uses a hybrid of manual and automatic regeneration.
7. Manual-only stamina means stamina changes only through explicit GM adjustment, approved API calls, or provider events configured by the GM.
8. Automatic elapsed-time regeneration MUST define an interval and amount, or a provider expression/macro that calculates amount from actor and world-time context.
9. Rest/provider-event regeneration MUST identify the provider event or hook contract that grants stamina.
10. GMs MUST be able to manually set current stamina for an actor when they have permission to manage that actor's gathering state.
11. GMs SHOULD be able to manually set or override maximum stamina when the selected stamina provider is Fabricate-owned. External provider maximums may be read-only.
12. Stamina MAY regenerate by elapsed world time, rest event, manual GM adjustment, API call, or provider-specific formula.
13. System-specific stamina formulas MUST be provider-driven or configured; Fabricate core MUST NOT hardcode system-specific resource paths.
14. Actor stamina state MAY be stored in Fabricate actor flags when no external provider owns stamina.
15. Actor stamina display MUST include current and maximum values when known.
16. Stamina history SHOULD record enough evidence for players and GMs to understand spend, manual adjustment, and regeneration events.

### Requirement: Blind gathering discovery

Blind environments MUST support multiple hidden gathering tasks and optional progressive discovery.

1. A blind environment MAY contain more than one enabled gathering task.
2. Non-GM player listings for blind environments MUST NOT display individual task rows by default.
3. Non-GM player listings for blind environments MUST present a generic gather action or equivalent environment-level action unless progressive discovery has revealed one or more tasks to the selected actor.
4. Blind task selection for an unrevealed blind attempt MUST be resolved by configured provider logic, such as weighted random selection, roll table, macro, condition-based selection, node availability, or first-available strategy.
5. A blind environment MAY enable progressive task reveal.
6. Progressive reveal MAY be scoped per actor, per user, per party/source group, or globally, as configured by the GM.
7. Progressive reveal MAY occur on attempt, success, failure, specific result, encounter outcome, GM manual reveal, API call, or macro/provider decision.
8. Revealed blind tasks MAY become visible as named task rows for the reveal scope, but unrevealed tasks MUST remain hidden.
9. Revealed task history MUST preserve enough evidence to keep the task visible for the configured reveal scope unless the GM clears or resets discovery.
10. Blind task active runs, history, chat messages, and duplicate/attempt-limit blockers MUST use generic labels until the task is revealed for that viewer or the viewer is a GM.
11. GM users MUST be able to inspect all blind tasks, reveal state, reveal triggers, and reset/revoke reveal state.

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

### Requirement: Rich gathering hooks and programming interfaces

Rich gathering MUST expose stable hooks and programming interfaces for integration developers.

1. Fabricate MUST expose documented APIs for listing rich gathering environments for an actor, starting a gathering attempt, inspecting GM-only environment state, manually restocking nodes, manually recharging attempt limits, manually setting stamina, and revealing or clearing blind-task discovery where permissions allow.
2. Fabricate MUST expose `game.fabricate.gathering.getConditions()` for current global conditions and tag vocabularies.
3. Fabricate MUST expose `game.fabricate.gathering.setWeather(weatherTag)`, `setTimeOfDay(timeOfDayTag)`, and `setConditions({ weather, timeOfDay })` for authorized GM/API callers.
4. Condition mutation APIs MUST reject unauthorized player callers and invalid tags before persistence.
5. Public player APIs MUST enforce the same visibility, scene/access, blind redaction, stamina, node, attempt-limit, and provider-diagnostic secrecy rules as the UI.
6. GM APIs MAY expose full diagnostic and hidden task state when called by an authorized GM context.
7. Hook points SHOULD exist before and after major lifecycle events: environment listing, task visibility evaluation, condition modifier resolution, stamina calculation, stamina spend, attempt-limit evaluation, node availability evaluation, node depletion, attempt start, provider resolution, encounter resolution, result creation, history write, chat message creation, respawn/recharge, manual restock, manual stamina adjustment, and blind reveal.
8. Hooks MUST be able to observe or modify only the phases explicitly documented as mutable. Read-only phases MUST not allow mutation.
9. Hook payloads MUST include stable ids and redaction-safe display data for player-facing hooks, plus full GM data only for GM-authorized hooks.
10. Hooks and APIs MUST have clear error handling. Integration errors MUST be isolated and reported as diagnostics without corrupting gathering state.
11. APIs that mutate stamina, node counts, attempt limits, condition state, or reveal state MUST validate permissions and write auditable history or GM log evidence where practical.
12. Developer-facing contracts MUST avoid direct dependency on Foundry globals from presentational Svelte components; Foundry access remains in runtime/service boundaries.

### Requirement: Gathering chat messages

Gathering attempts MUST support chat message output.

1. A crafting system or gathering environment SHOULD allow GMs to configure whether gathering attempt chat messages are created.
2. Chat output MAY be configured for attempt started, immediate success, immediate failure, timed completion, cancellation, encounter outcome, node depletion/restock, stamina spend/regeneration, and blind discovery.
3. Chat messages MUST respect blind task redaction and non-GM information disclosure limits.
4. Chat messages SHOULD include actor, environment, task label or blind-safe generic label, condition summary, stamina spend where visible, risk where visible, and result/failure/encounter summary where visible.
5. GM-only diagnostics MAY be whispered or otherwise restricted to GMs.
6. Chat message creation MUST occur only after the relevant state transition is accepted or persisted enough to avoid announcing events that later fail to commit.
7. Chat output MUST be customizable by localization and MAY be customizable by macro/provider where approved.

## MODIFIED Requirements

### Requirement: Gathering scope

The existing gathering scope is expanded to include rich environment metadata, resource-node availability, respawn, conditions, risk, encounters, and optional stamina. This change still does not introduce standalone harvesting, map travel simulation, or hardcoded system-specific skill logic.

### Requirement: Blind environments

The existing blind environment requirement is modified. Blind environments are no longer limited to exactly one task under the rich gathering model. They may contain multiple hidden tasks, selected by configured blind-selection logic, and may optionally reveal tasks progressively to actors, users, parties, or the world.

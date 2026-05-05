# UI Integration Delta

## ADDED Requirements

### Requirement: GM rich gathering environment management

The GM manager MUST expose rich gathering environment authoring when a selected crafting system has gathering enabled.

1. The environment browse view SHOULD support search and filters for region, biome, risk, status, availability, and current condition where data exists.
2. Environment rows SHOULD show image, name, region, biome, risk, enabled state, node availability summary, and current condition summary where data exists.
3. The selected-environment inspector SHOULD show player-facing image, description, region, biome, risk, scene-link state, current conditions, node availability summary, stamina economy summary, and validation.
4. The environment editor MUST keep core environment identity separate from task/node authoring.
5. The editor MUST allow environments to exist without a linked scene. Scene link controls are optional access/evidence controls, not the identity of the environment.
6. The editor SHOULD include sections or tabs for Overview, Location, Conditions, Tasks / Nodes, Results, Risk / Encounters, Economy, Visibility, and Advanced, or an equivalent grouping.
7. Overview/Location authoring MUST include name, description, image, enabled state, region, biome, and optional scene link where supported.
8. Conditions authoring MUST let GMs set current time of day and weather when those features are enabled.
9. Conditions authoring MUST show which task availability, yield, risk, stamina, or difficulty modifiers are active.
10. Tasks / Nodes authoring MUST expose task identity, enabled state, current node count, max node count, depletion timing, respawn policy, next respawn evidence, and manual restock controls when node economy is enabled.
11. Manual restock controls MUST be GM-only and MUST show whether they affect current count, max count, or both.
12. Economy authoring MUST show the selected gathering economy mode and expose only relevant controls as primary: time requirement for `time`, node controls for `nodes`, stamina cost/regeneration for `stamina`, and combined controls for `hybrid`.
13. Stamina authoring MUST expose system-level stamina configuration, including max/current provider strategy, regeneration mode, regeneration rule, manual adjustment permissions, and task stamina costs.
14. Risk / Encounters authoring MUST expose environment risk, task risk overrides, encounter table links, trigger hooks, and player-facing risk copy.
15. Encounter controls MUST be optional and MUST NOT require every gathering task to have an encounter table.
16. The editor evidence column SHOULD preview the player-facing environment card, task availability, modified yields/costs, risk, encounter hooks, stamina cost, and validation.
17. Validation MUST identify invalid node counts, invalid respawn policies, invalid stamina formulas/providers, invalid condition modifiers, invalid encounter table links, and risk values outside supported vocabulary.
18. The editor MUST allow GMs to choose natural dnd5e/pf2e expression providers or macro providers for supported checks, modifiers, stamina formulas, and attempt/recharge rules.
19. Expression fields SHOULD support examples and helper text for natural system formulas, such as `1d20 + @skills.prc.total + @prof` for dnd5e where that data path is valid.
20. Stamina controls MUST let GMs choose over-time regeneration, rest/provider-event regeneration, manual-only stamina, or hybrid regeneration.
21. GM controls MUST allow authorized GMs to manually set an actor's current gathering stamina and, when Fabricate owns the maximum, maximum gathering stamina.
22. Blind environment authoring MUST allow multiple tasks, hide-by-default behavior, blind task-selection strategy, progressive reveal toggle, reveal scope, reveal triggers, manual reveal, and reset/revoke reveal controls.
23. Attempt limit authoring MUST expose limit scope, max attempts, time window, recharge policy, probabilistic recharge settings, manual recharge controls, and current counter/recharge evidence.
24. Developer/API configuration SHOULD expose hook enablement notes, chat message settings, and integration-safe identifiers for environments, tasks, nodes, stamina, attempt limits, encounters, and reveal states.
25. Chat message controls SHOULD allow GMs to choose which gathering lifecycle events produce chat messages and whether GM diagnostics are whispered/restricted.
26. GM screenshots MUST prove environment without scene link, region/biome filters, condition controls, node count/restock, respawn policy, attempt limits/recharge, blind multi-task reveal controls, risk/encounter controls, stamina regeneration/manual-set controls, expression/macro provider controls, chat settings, validation, and narrow-width stacking.

### Requirement: Actor Gathering App rich environment browsing

The Actor Gathering app MUST present rich environments as player-facing places while preserving gathering guards and redaction rules.

1. The app MUST use a dedicated gathering shell, not the Crafting app shell.
2. The top header MUST show selected actor and, when enabled, gathering stamina current/max values and regeneration/adjustment affordance where permitted.
3. The app SHOULD provide primary tabs or segmented navigation for `Environments` and `Gathering Log`.
4. The environment browser MUST support search plus region, biome, risk/status, and availability filters where data exists.
5. Environment rows SHOULD be image-led and include environment name, region, biome, risk/status chip, and availability summary where safe to reveal.
6. Selecting an environment MUST populate a task list and environment detail/evidence panel.
7. Environment detail SHOULD show image, name, region, biome, description, risk, current time of day, weather, visibility/condition summary, and scene/access state where relevant.
8. Task rows SHOULD show task image, name, description, required tools/catalysts summary, stamina cost or time cost, node availability state, risk modifier, and start/select action where safe to reveal.
9. If stamina is enabled, task rows MUST show stamina cost and start blockers when the actor lacks stamina.
10. If nodes are enabled, task rows MUST show availability or generic depleted state according to visibility/redaction rules.
11. Potential result previews MAY be shown for targeted visible tasks and GM-visible tasks. They MUST NOT reveal hidden blind-task results to non-GM users.
12. The active task panel SHOULD show requirements, potential results when visible, task notes, stamina/time/node cost, risk, and a primary start action.
13. Start actions MUST surface blocking reasons for missing stamina, depleted nodes, scene/token access, duplicate active runs, hidden tasks, missing catalysts/tools, and paused game.
14. Active runs MUST show environment, task label or blind-safe generic label, actor, status, started time, remaining/completion time where relevant, stamina/node evidence where safe, and cancel/details actions where supported.
15. Gathering Log MUST show recent attempts, terminal status, results/failure/encounter summary where visible, stamina spend/regeneration, node depletion/restock evidence where safe, and blind redaction.
16. Encounter feedback MUST be visible when an encounter hook produces player-facing output, but hidden diagnostics and GM-only encounter metadata MUST remain redacted.
17. Narrow layouts MUST keep actor/stamina header, environment filters, selected environment, task list, and start action reachable without horizontal overflow.
18. Blind environments with unrevealed tasks MUST present generic gather actions rather than individual hidden task rows to non-GM users.
19. If progressive reveal is enabled, revealed blind tasks MAY appear as named task rows for the relevant actor/user/party/global scope, while unrevealed tasks remain hidden.
20. Attempt-limit blockers MUST show remaining attempts, recharge state, or generic exhausted/recharging copy according to the active visibility/redaction rules.
21. Chat messages generated by gathering attempts MUST be reflected in the log or linked attempt detail where practical.
22. Actor Gathering screenshots MUST prove environment search/filtering, region/biome/risk chips, stamina summary, environment detail conditions, task stamina/node availability, attempt-limit blockers, blind generic action, progressive reveal state, potential results where visible, chat/log evidence, and narrow-width stacking.

### Requirement: Actor gathering stamina presentation

The Actor Gathering app MUST make stamina understandable when stamina economy is enabled.

1. Stamina summary MUST show current and maximum stamina when known.
2. Stamina summary SHOULD show regeneration hint or next regeneration time when known.
3. Task start buttons MUST communicate stamina cost before the attempt starts.
4. If a task is blocked by stamina, the UI MUST show the missing amount and any known recovery path.
5. Manual GM stamina adjustment controls MUST be visible only to users with permission.
6. Stamina UI MUST be hidden or demoted when the selected gathering system does not use stamina.
7. If stamina is manual-only, the UI MUST NOT imply automatic regeneration or next regeneration time.
8. If stamina regenerates over time, the UI SHOULD show the configured interval, next regeneration time, or regeneration rate when known.
9. GM manual stamina adjustment UI MUST provide set-current and add/subtract flows where permissions allow.

### Requirement: Rich gathering information disclosure

Rich gathering UI MUST preserve existing visibility and blind environment secrecy.

1. Non-GM users MUST NOT see hidden task names, hidden result groups, provider diagnostics, encounter table internals, or GM-only notes.
2. Blind environments MUST use generic task labels and redaction-safe active/history text for non-GM users.
3. Depleted-node and respawn hints MAY be generic for blind or hidden tasks.
4. Risk and condition summaries MAY be shown at the environment level when they are not task-revealing.
5. GM users MAY inspect full task, node, condition, risk, encounter, and diagnostic detail.

### Requirement: Rich gathering developer and chat UI

Rich gathering UI MUST expose integration and chat configuration without overwhelming normal GM authoring.

1. GM configuration SHOULD include an advanced Developer / Automation section for hook/API notes, stable ids, macro entry points, and provider diagnostics.
2. Developer-facing UI MUST distinguish read-only hook evidence from mutable provider controls.
3. Chat message settings SHOULD be grouped with automation or feedback settings and SHOULD expose event-level toggles.
4. Chat preview SHOULD show player-safe output and GM-only diagnostic output separately when possible.
5. Provider diagnostics from expressions, macros, hooks, APIs, and chat generation MUST be visible to GMs in validation/evidence panels.

## MODIFIED Requirements

### Requirement: Gathering App (Player)

The existing Gathering App requirements are expanded by rich environment browsing, stamina presentation, node availability, conditions, risk, and encounter feedback. Existing actor selection, scene gating, visibility, active run, completion, history, and blind redaction requirements remain in force.

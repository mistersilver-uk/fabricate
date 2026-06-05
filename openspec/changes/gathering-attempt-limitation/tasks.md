# Tasks

## Data model & runtime (done)

- [x] Remove `task.attemptLimit` + recharge and per-environment `economyMode` from `GatheringEnvironmentStore` normalize/validate.
- [x] Add per-system `economy` (mode + stamina regen) to `normalizeGatheringConfig`; add `task.staminaCostModifiers`.
- [x] Mode-gate `evaluateStart` / `commitAcceptedAttempt` / `buildListingMetadata`; GM viewer does not consume.
- [x] `_effectiveStaminaCost` (base + character-modifier references, floored at 0) shared by gate and spend.
- [x] `regenerateActorStamina` and `respawnNodes` driven from `GatheringEngine.processWorldTime` under a primary-GM gate.
- [x] System-derived `economyMode` + `staminaPool` in listings; external stamina-provider max read-only.

## Services (done)

- [x] `getGatheringEconomy` / `setGatheringEconomy`, `getGatheringStaminaState`; expose restock/stamina endpoints in the services bag.

## Player UI (done)

- [x] `NODE_DEPLETED` / `STAMINA_BLOCKED` callouts + block labels.
- [x] Per-task node count + stamina cost chips; attempt-cost summary in the detail inspector.
- [x] Mode-aware economy strip (stamina pool / node legend) in the center header, blind-redaction safe.

## GM UI (pending)

- [ ] Economy control (mode + stamina regen config) bound to get/set economy.
- [ ] Task editor: stamina cost + stamina-cost modifiers; node max / depletion timing / respawn config.
- [ ] Per-environment node-count editor in the environment task inspector.
- [ ] New "Gathering State" panel + routing for manual actor stamina editing.

## Migration, spec & tests

- [x] 0.3.0 migration: strip `attemptLimit`/`economyMode`, seed/preserve system economy mode.
- [x] Unit tests: regen, respawn, cost modifiers, mode gating, processWorldTime, migration.
- [ ] Component tests for the new GM surfaces; smoke screenshots for player + manager views.
- [x] Update the `gathering-and-harvesting` spec deltas.

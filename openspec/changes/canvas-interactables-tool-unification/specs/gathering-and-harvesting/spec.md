# Gathering And Harvesting Spec Delta

## Removed Requirements

### Gathering Catalysts

Gathering-task catalyst gating and terminal catalyst plan/apply are removed
(`_checkCatalysts`, `_planTerminalCatalysts` / `_applyTerminalCatalysts`, the
`CATALYST_BLOCKED` reason, `usedCatalysts`). Required-but-reusable, breakable prerequisites
for gathering tasks are expressed solely through Tools referenced by `task.toolIds`.
Terminal evidence reports `usedTools` in place of `usedCatalysts`; the blocked reason
collapses into the already-existing `TOOL_BLOCKED`.

> The gathering `task.catalysts` field is **dead/vestigial**: never authored (no task-editor
> tab, no store add/update/delete methods, not emitted by `_normalizeGatheringTask`, not
> preserved by `GatheringEnvironmentStore`), only read at runtime and always empty. Its
> removal drops no live data and requires no gathering-task migration.

## Added Requirements

### Canvas Gathering-Task Interactables

A gathering task may be placed on the canvas as an Interactable token (GM-only spawn).
Double-clicking the token opens the gathering app for that task and environment, passing
the per-token node state as a `nodeStateOverride`.

1. The token's environment is resolved at drop time by precedence: Scene Region
   auto-detect (region carrying `flags.fabricate.environmentId`) → task default (the new
   optional `task.defaultEnvironmentId` field) → GM dialog (only when neither auto-source
   resolves or an explicit override is requested). When region auto-detect resolves the
   environment, an `ui.notifications.info` names the resolved environment.
2. A modifier-key override (holding **Alt** during drop) always forces the GM dialog,
   bypassing the auto-resolve tiers.
3. The GM dialog presents an environment select; **cancel aborts the spawn** (no token is
   created).
4. The token owns its own depletion/respawn state in `flags.fabricate.node`, independent of
   `environment.nodeRuntime[taskId]`.

### Gathering Task Default Environment

A gathering library task MAY carry a new optional `defaultEnvironmentId: string | null`
field. This is a **new** field — tasks previously carried no environment reference (tasks
are composed into environments many-to-many via `enabledTaskIds` / `forcedTaskIds`).

1. `defaultEnvironmentId` normalizes to a trimmed string or `null` (empties dropped) in
   `adminStore` `_normalizeGatheringTask` and is preserved by `GatheringEnvironmentStore`.
2. It is the middle tier of on-drop environment resolution; a stale id (no matching
   environment) falls through to the GM dialog rather than throwing.

### Per-Token Attempt Flow

1. `GatheringEngine.startAttempt` accepts an optional `nodeStateOverride` adapter threaded
   into the terminal commit path (`_commitTerminalSideEffects` / `_commitRichAttempt`).
2. `GatheringRichStateService` node helpers prefer the injected `nodeStateOverride` adapter
   over `environment.nodeRuntime[taskId]` when present.
3. Per-token respawn runs in the core `updateWorldTime` handler, active-GM only, using the
   same calendar-aware interval resolution as resource-node respawn.

### Virtual-Present Tools (canvas Tool stations)

1. A canvas Tool station injects a virtual-present Tool keyed by `componentId`
   (`presentTools` / `presentToolComponentIds`) into gathering availability checks.
2. A virtual-present Tool satisfies the task's tool gate without the actor owning the item
   and is excluded from breakage and usage.

### Depleted Behavior

1. A gathering task may configure `depletedBehavior { swapImage?, postfixName?,
   deleteToken? }` on its node config. A node is depleted when `node.current <= 0` (a single
   shared definition used by both count logic and depleted-visual apply). `depletedBehavior`
   is orthogonal to `depletionTiming` (`onStart` / `onSuccess`).
2. On depletion, `swapImage` / `postfixName` are applied to the token and the prior token
   state is captured into `flags.fabricate.nodeOriginal`; respawn reverts to that captured
   state.
3. `deleteToken` is terminal AND mutually exclusive with `swapImage` / `postfixName`: when
   delete is enabled the swap/postfix fields are dead config (the editor greys them out and
   the normalizer drops them). The token is removed on depletion and has no revert; respawn
   no-ops against a deleted token.
4. All depleted-behavior token mutations are applied through the active GM via the
   `module.fabricate` `interactableNodeUpdate` socket action.

### Player-Facing Canvas Gathering

1. A gathering-task token's nameplate shows the source (task) name and exposes a hover
   affordance signalling that it is interactable (double-click discoverability).
2. When a player attempts to gather at a token and no active GM is connected, the player
   sees a graceful "A GM must be online to gather here" message (all node-state writes route
   through `activeGM`); the attempt does not silently fail.
3. The gathering app surfaces depleted + respawn-ETA state for a token-scoped node (e.g.
   "depleted, respawns in …") rather than presenting an empty list.

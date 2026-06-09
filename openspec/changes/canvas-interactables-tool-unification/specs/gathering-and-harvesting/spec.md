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

> **Region-first (SUPERSEDES the token language).** A gathering task is placed on the canvas
> as a **Scene Region** carrying a `fabricate.interactable` Region Behaviour; a linked Tile
> (or Drawing / existing Token) is a presentation-only marker. There is no synthetic actor or
> proxy token. Activation is **token presence** in the region, not a marker double-click.

A gathering task may be placed on the canvas as an Interactable region (GM-only spawn). When
a controlled token ENTERS the region, the controlling player is offered a non-blocking
prompt; on Interact the gathering app opens for that task and environment, scoped by the
per-behaviour node state (`nodeStateOverride`).

1. The interactable's environment is resolved at drop time by precedence: Scene Region
   auto-detect (region carrying `flags.fabricate.environmentId`) → task default (the new
   optional `task.defaultEnvironmentId` field) → GM dialog (only when neither auto-source
   resolves or an explicit override is requested). When region auto-detect resolves the
   environment, an `ui.notifications.info` names the resolved environment.
2. A modifier-key override (holding **Alt** during drop) always forces the GM dialog,
   bypassing the auto-resolve tiers.
3. The GM dialog presents an environment select; **cancel aborts the spawn** (no region is
   created).
4. The interactable owns its own depletion/respawn state in `behavior.system.node`,
   independent of `environment.nodeRuntime[taskId]`.

### Gathering Task Default Environment

A gathering library task MAY carry a new optional `defaultEnvironmentId: string | null`
field. This is a **new** field — tasks previously carried no environment reference (tasks
are composed into environments many-to-many via `enabledTaskIds` / `forcedTaskIds`).

1. `defaultEnvironmentId` normalizes to a trimmed string or `null` (empties dropped) in
   `adminStore` `_normalizeGatheringTask` and is preserved by `GatheringEnvironmentStore`.
2. It is the middle tier of on-drop environment resolution; a stale id (no matching
   environment) falls through to the GM dialog rather than throwing.

### Scoped Attempt Flow

1. `GatheringEngine.startAttempt` accepts an optional `nodeStateOverride` adapter threaded
   into the terminal commit path (`_commitTerminalSideEffects` / `_commitRichAttempt`). For a
   region interactable the adapter is the behaviour-backed node adapter
   (`src/canvas/regions/interactableRegionNodeAdapter.js`), which reads the node locally off
   the live behaviour and routes every write through the active GM.
2. `GatheringRichStateService` node helpers prefer the injected `nodeStateOverride` adapter
   over `environment.nodeRuntime[taskId]` when present.
3. Per-interactable respawn runs in the core `updateWorldTime` handler, active-GM only, using
   the same calendar-aware interval resolution as resource-node respawn, iterating placed
   region behaviours.

### Virtual-Present Tools (canvas Tool stations)

1. A canvas Tool station injects a virtual-present Tool keyed by `componentId`
   (`presentTools` / `presentToolComponentIds`) into gathering availability checks.
2. A virtual-present Tool satisfies the task's tool gate without the actor owning the item
   and is excluded from breakage and usage.

### Depleted Behavior

1. A gathering task may configure `depletedBehavior { swapImage?, postfixName?, deleteToken?,
   tokenHide? }` on its node config. A node is depleted when `node.current <= 0` (a single
   shared definition used by both count logic and depleted-visual apply). `depletedBehavior`
   is orthogonal to `depletionTiming` (`onStart` / `onSuccess`).
2. Depletion reflects onto the **linked visual** (not a proxy token), per its `documentName`:
   - **Tile** — `swapImage` swaps the texture (prior state stashed in
     `flags.fabricate.nodeOriginal`, restored on respawn).
   - **Drawing** — depletion hides the drawing (reversible), optionally with a `(depleted)`
     label.
   - **Token** — SAFE no-op by default (the GM's own document is never mutated/deleted);
     `deleteToken` is ignored for a Token. The only opt-in is `tokenHide`, a reversible hide.
3. `deleteToken` is terminal AND mutually exclusive with `swapImage` / `postfixName`: when
   delete is enabled the swap/postfix fields are dead config (the editor greys them out and
   the normalizer drops them). It deletes a Tile/Drawing visual on depletion with no revert;
   respawn no-ops against a deleted/missing visual. A missing linked visual is a clean no-op —
   the interactable still works.
4. All depleted-behavior visual mutations are applied through the active GM via the
   `module.fabricate` socket.

### Player-Facing Canvas Gathering

1. Activation is **token presence**: when a controlled token enters the region, the
   controlling player's client shows a non-blocking interact prompt; a `controlToken` hook and
   a keybinding re-raise the prompt for a token already standing inside on scene load.
2. When a player interacts at a gathering interactable and no active GM is connected, the
   player sees a graceful "A GM must be online to gather here" message (all node-state writes
   route through `activeGM`); the attempt fails cleanly rather than silently.
3. The gathering app surfaces depleted + respawn-ETA state for a behaviour-scoped node (e.g.
   "depleted, respawns in …") rather than presenting an empty list.

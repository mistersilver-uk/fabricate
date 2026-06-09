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
> (or Drawing / existing Token) is a marker that holds no state of its own. There is no
> synthetic actor or proxy token. Activation is **token presence** in the region, not a marker
> double-click.
>
> **Env-node correction (further-superseded).** The interactable carries **no per-behaviour
> node state and no `nodeStateOverride`** (`ae53384`, `4770a7f`). It is a pure
> `(environment, task)` shortcut: it opens the gathering app scoped to its environment + task
> (auto-selecting both) and reads/decrements `environment.nodeRuntime[taskId]` directly. The
> "Scoped Attempt Flow" subsection below is an abandoned draft.
>
> **What DID ship — env-node-driven Tile marker swap + concealment/lock visibility.** The
> "Depleted Behavior" subsection below is **rewritten to the shipped form**: when the SHARED
> `environment.nodeRuntime[taskId]` depletes (`current <= 0`) and the task configures
> `depletedBehavior.swapImage`, every linked **Tile** marker for that `(environment, task)`
> swaps to that image and flips back on recharge (idempotent active-GM sync in
> `interactableMarkerDepletion.js`). Separately, DISABLED/HIDDEN interactables are concealed
> (no prompt + hidden marker) and LOCKED interactables stay visible but deny Interact. These
> reflect the SHARED env node + the behaviour state — there is no per-interactable node pool.

A gathering task may be placed on the canvas as an Interactable region (GM-only spawn). When
a controlled token ENTERS the region, the controlling player is offered a non-blocking
prompt; on Interact the gathering app opens for that task and environment, auto-selecting both
and using `environment.nodeRuntime[taskId]` as the single node source of truth.

1. The interactable's environment is resolved at drop time by precedence: Scene Region
   auto-detect (region carrying `flags.fabricate.environmentId`) → task default (the new
   optional `task.defaultEnvironmentId` field) → GM dialog (only when neither auto-source
   resolves or an explicit override is requested). When region auto-detect resolves the
   environment, an `ui.notifications.info` names the resolved environment.
2. A modifier-key override (holding **Alt** during drop) always forces the GM dialog,
   bypassing the auto-resolve tiers.
3. The GM dialog presents an environment select; **cancel aborts the spawn** (no region is
   created).
4. The interactable carries **no** per-interactable node state. Node counts, depletion, and
   respawn are owned by `environment.nodeRuntime[taskId]`; activating the interactable
   reads/decrements that environment node like opening gathering directly. *(Superseded: the
   earlier `behavior.system.node` pool was abandoned.)*

### Gathering Task Default Environment

A gathering library task MAY carry a new optional `defaultEnvironmentId: string | null`
field. This is a **new** field — tasks previously carried no environment reference (tasks
are composed into environments many-to-many via `enabledTaskIds` / `forcedTaskIds`).

1. `defaultEnvironmentId` normalizes to a trimmed string or `null` (empties dropped) in
   `adminStore` `_normalizeGatheringTask` and is preserved by `GatheringEnvironmentStore`.
2. It is the middle tier of on-drop environment resolution; a stale id (no matching
   environment) falls through to the GM dialog rather than throwing.

### Scoped Attempt Flow — ABANDONED (env node is the single source of truth)

> **REMOVED — do not implement (`ae53384`, `4770a7f`).** There is no `nodeStateOverride`
> adapter, no behaviour-backed node adapter threaded into the commit path, and no
> per-interactable world-time respawn pass. A gathering-task interactable runs the **normal**
> gathering attempt against `environment.nodeRuntime[taskId]`; the engine and
> `GatheringRichStateService` are not parameterized by any interactable node override. The
> subsection below is a record of the abandoned draft.

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

### Depleted Behavior — SHIPPED as a SHARED env-node-driven Tile marker swap

> **SHIPPED (simple first version).** `depletedBehavior.swapImage` drives a **linked Tile**
> image swap keyed off the SHARED `environment.nodeRuntime[taskId]` — NOT a per-interactable
> node, and NOT the per-marker Drawing-hide / `deleteToken` / Token-hide / `nodeOriginal`-revert
> form originally drafted (that form was abandoned). The behaviour-schema/linked-visual contract
> is defined in `openspec/specs/data-models/spec.md`.

1. **Depletion trigger is the SHARED env node** — `environment.nodeRuntime[taskId].current <= 0`
   (`resolveMarkerImage` / `isNodeDepleted`, falling back to the task's own node `current`/`max`
   when the env runtime has no entry yet). There is **no per-interactable node pool** and **no
   `nodeStateOverride`**.
2. **Tile marker swap.** When depleted AND `swapImage` is configured, every linked **Tile**
   marker for that `(environment, task)` swaps its texture to `swapImage`; on recharge (env node
   above `0`) it flips back to the available image. The available image is stashed at
   `flags.fabricate.markerAvailableImg` on the FIRST swap and restored on recharge.
3. The swap (and marker concealment, see Player-Facing Canvas Gathering) is reconciled by an
   idempotent, no-throw, **active-GM** sync (`syncInteractableMarkers` in
   `src/canvas/regions/interactableMarkerDepletion.js`) on the `gatheringEnvironments` setting
   change (gather decrement + world-time respawn) and `canvasReady`; other clients see the
   change via normal Foundry document sync. A missing linked visual is a clean no-op.
4. The task's `postfixName` / `deleteToken` fields remain authorable node config but drive no
   interactable marker in the shipped model.

### Player-Facing Canvas Gathering

1. Activation is **token presence**: when a controlled token enters the region, the
   controlling player's client shows a non-blocking interact prompt (unless concealed; see
   req 4); a `controlToken` hook and a keybinding re-raise the prompt for a token already
   standing inside on scene load.
2. When a player interacts at a gathering interactable and no active GM is connected, the
   player sees a graceful "A GM must be online to gather here" message; the attempt fails
   cleanly rather than silently. A **denied** activation returns a localized reason
   (`FABRICATE.Canvas.Interactable.Denied.*`).
3. Depleted + respawn-ETA state comes from the environment's `nodeRuntime[taskId]` via the
   normal gathering listing — the interactable adds nothing to the listing on top of it. The
   depleted state IS reflected onto the linked Tile marker as an image swap (see Depleted
   Behavior).
4. **Concealment vs Lock visibility (SHIPPED).** A DISABLED (`state.enabled === false`) OR
   explicitly HIDDEN (`presentation.hidden === true`) interactable is **concealed from
   players**: no on-enter prompt fires and the linked Tile marker is hidden (`tile.hidden =
   true`, GM-only). A LOCKED (`state.locked === true`) interactable stays **visible** (marker
   shown, prompt fires) but pressing Interact is **denied** with
   `FABRICATE.Canvas.Interactable.Denied.Locked`. The pure rules (`shouldPromptOnEnter` /
   `resolveMarkerHidden`) and the Interact-time eligibility gate are defined in
   `openspec/specs/data-models/spec.md`.

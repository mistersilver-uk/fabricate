# Data Models Spec Delta

## Removed Requirements

### Catalyst

The `Catalyst` model is removed in full. `src/models/Catalyst.js`, the inline
`catalysts: Catalyst[]` arrays on `Recipe`, `RecipeItemDefinition`, step, `IngredientSet`,
and salvage definitions, and the `Catalyst` cross-reference / migration-alias rows are
deleted with no deprecation shim. The recipe-side "non-consumable catalyst requirement"
concept is replaced by the `Tool` prerequisite primitive below.

## Modified Requirements

### Tool (generalized to crafting + gathering)

`Tool` is no longer gathering-only. It is the single shared required-but-reusable,
breakable prerequisite primitive for **both** crafting recipes and gathering tasks. The
model shape (`componentId`, `requirement`, `breakage`, `onBreak`) and its validation matrix
are unchanged.

1. Tool entries are stored under `config.systems[systemId].tools` (per crafting system).
2. Tools are referenced from gathering tasks by `task.toolIds` **and** from recipes by
   `recipe.toolIds`, step `toolIds`, and `ingredientSet.toolIds`.
3. A referenced-but-present Tool is always required: it must be present and pass its
   `requirement` before crafting or a gathering attempt may proceed.

### Recipe / Step / IngredientSet tool references

`toolIds: string[]` is added at recipe, step, and ingredient-set granularity, replacing the
removed inline `catalysts` arrays.

1. `toolIds` normalizes to `[]` when absent; each id coerces to a trimmed string and empties
   are dropped.
2. The applicable Tool set for an ingredient set is the union of recipe-level, step-level,
   and ingredient-set-level `toolIds`, resolved against the per-system Tools library.
3. Ids that miss the library are logged and dropped (mirrors the existing gathering-task
   stale-reference behaviour).

### Tool Item Usage Flag (catalyst fallback)

`flags.fabricate.toolUsage = { timesUsed }` tracks per-item usage for `limitedUses` tools.

1. When `flags.fabricate.toolUsage` is absent, the runtime MUST fall back to reading
   `flags.fabricate.catalystItemUsage` so in-flight usage counters survive the
   Catalyst→Tool migration without an item-flag rewrite.
2. This fallback is meaningful **only** for migrated `limitedUses` tools
   (`degradesOnUse: true`); presence-only tools (`breakageChance: 0`, mapped from
   `degradesOnUse: false`) never read or write usage.
3. The first post-migration `applyUsage` on a `limitedUses` tool writes
   `flags.fabricate.toolUsage` (authoritative thereafter); `flags.fabricate.catalystItemUsage`
   is never back-filled or cleared. Once `toolUsage` exists it wins (the fallback path is not
   re-entered) — the lingering legacy flag is idempotent and acceptable.

### Gathering Task `defaultEnvironmentId` (new optional field)

A gathering library task MAY carry a new optional `defaultEnvironmentId: string | null`.
This is a **new** field; tasks previously carried no environment reference (they are
composed into environments many-to-many via `enabledTaskIds` / `forcedTaskIds`).

1. Normalized to a trimmed string or `null` (empties dropped) in `adminStore`
   `_normalizeGatheringTask` and preserved by `GatheringEnvironmentStore`.
2. Serves as the middle tier of on-drop environment resolution (region auto-detect → task
   default → GM dialog).

## Added Requirements

> **Region-first model (SUPERSEDES the token/tile drafts below).** This change shipped on a
> **region-first** architecture, not the actor-backed-token model originally drafted here. A
> Fabricate Canvas Interactable is a **Scene Region** carrying a custom
> **`fabricate.interactable` Region Behaviour** (a `RegionBehaviorType`) that OWNS the
> authoritative state. A **linked visual** (Tile by default; optionally a Drawing or an
> existing GM-placed Token) is presentation-only. **No synthetic actor or proxy token is ever
> created.** The token/tile-flag schemas in the next two subsections are retained only as a
> record of the abandoned draft; the canonical schema is the behaviour `system` defined in
> `openspec/specs/data-models/spec.md` (Canvas Interactables).
>
> **Env-node correction (further-superseded).** The "Per-Behaviour Node State" subsection below
> was ALSO abandoned (`ae53384`, `4770a7f`). The shipped gathering-task interactable carries
> **no `node` field**, **no `nodeStateOverride`**, and **no per-interactable node pool**: it is a
> pure `(environment, task)` shortcut using `environment.nodeRuntime[taskId]` as the single
> source of truth. A **Tool** interactable opens the **Crafting** tab. Read the "Per-Behaviour
> Node State" subsection as a record of an abandoned draft.
>
> **What DID ship — env-node-driven marker swap + concealment/lock visibility.** The
> `depletedBehavior.swapImage` and concealment mechanisms below shipped, but in the SIMPLE,
> SHARED-env-node form (NOT the per-interactable/per-marker form the old drafts described):
> when the SHARED `environment.nodeRuntime[taskId]` depletes (`current <= 0`), every linked
> **Tile** marker for that `(environment, task)` swaps to `swapImage` and flips back on
> recharge, reconciled by an idempotent active-GM sync (`interactableMarkerDepletion.js`,
> `syncInteractableMarkers` / `resolveMarkerImage`) on the `gatheringEnvironments` setting
> change and `canvasReady`; the available image is stashed at `flags.fabricate.markerAvailableImg`.
> Separately, **visibility is split from eligibility**: DISABLED (`state.enabled === false`) or
> explicitly HIDDEN (`presentation.hidden === true`) conceals the interactable (no prompt;
> `tile.hidden = true`, GM-only — `resolveMarkerHidden` / `shouldPromptOnEnter`), while LOCKED
> (`state.locked === true`) stays visible but denies Interact with
> `FABRICATE.Canvas.Interactable.Denied.Locked`. The "Depleted Behavior" subsection below is
> rewritten to the shipped form.

### Interactable Region Behaviour (`fabricate.interactable`)

A Fabricate Interactable is a **Scene Region** carrying a `fabricate.interactable` Region
Behaviour. The behaviour is a `RegionBehaviorType` registered via the module manifest
(`documentTypes.RegionBehavior.interactable`) + `CONFIG.RegionBehavior.dataModels`, and owns
all authoritative per-interactable state in its `system`:

```js
behavior.system = {
  interactableType: "tool" | "gatheringTask",
  sourceUuid: string,                 // the Fabricate Tool / Gathering Task source
  systemId: string,
  toolId|null, taskId|null,           // by interactableType
  environmentId|null,                 // resolved at drop (gatheringTask)
  name: string,
  presentation: { promptText: string|null, hidden: boolean },
  linkedVisual: {
    uuid: string|null,
    documentName: "Tile"|"Drawing"|"Token"|null,
    mode: "marker"|"none",            // "none" = region-only, no visible marker
    missingPolicy: "ignore"|"warn"|"recreate"
  },
  // NO `node` field — env nodeRuntime[taskId] is the single source of truth (abandoned draft).
  state: {
    enabled: boolean, consumed: boolean, locked: boolean,
    uses: { max: number|null, used: number },
    cooldown: { seconds: number|null, lastUsedWorldTime: number|null }
  },
  activation: { trigger: "regionEnter", audience: "players"|"all" }
}
```

Built/read via `src/canvas/regions/interactableRegionFlags.js`; the class + CONFIG
registration live in `src/canvas/regions/FabricateInteractableRegionBehavior.js`.

1. `interactableType`, `sourceUuid`, and `systemId` are required; `toolId`/`taskId` and
   `environmentId` are scoped by `interactableType`. A Tool interactable opens the Crafting tab
   (virtual-present `activeCanvasTool`); a gathering-task interactable opens the gathering app
   scoped to its `environmentId` + `taskId` using `environment.nodeRuntime[taskId]`.
2. Spawning is **GM-only**: a GM-only scene-control browser drags/places interactables
   (Region + behaviour + linked Tile, or region-only).
3. Deleting the linked visual does NOT destroy the interactable; recovery is governed by
   `linkedVisual.missingPolicy`. **Region-only** (`mode: "none"`) is supported.
4. **Visibility is split from eligibility (Lock vs Disable) — SHIPPED.** A DISABLED
   (`state.enabled === false`) OR explicitly HIDDEN (`presentation.hidden === true`)
   interactable is **concealed**: the on-enter prompt does not fire (`shouldPromptOnEnter`) and
   the linked Tile marker is hidden from players (`tile.hidden = true`, GM-only;
   `resolveMarkerHidden`). A LOCKED (`state.locked === true`) interactable stays **visible**
   (marker shown, prompt fires) but Interact is denied with
   `FABRICATE.Canvas.Interactable.Denied.Locked`. `evaluateActivationEligibility` still gates
   the activation at Interact time (DISABLED → LOCKED → CONSUMED → USES_EXHAUSTED → COOLDOWN).
   These pure rules live in `src/canvas/regions/interactableRegionActivation.js`.

### Linked Visual reverse flags (holds no state; reflects env depletion + concealment)

The linked visual (Tile / Drawing / Token) carries only a reverse pointer back at its owning
Region + Behaviour; it holds NO authoritative interactable state of its own (no node pool):

```js
visual.flags.fabricate = {
  isInteractableVisual: true,
  linkedRegionUuid: string,
  linkedBehaviorId: string,
  markerAvailableImg?: string   // stashed on first env-node depletion swap; restored on recharge
}
```

Built/read via `buildLinkedVisualFlags` / `readLinkedVisualRef`. The linked visual **never OWNS
state**, but it now **reflects two GM-controlled facts** about its owning behaviour (SHIPPED):

1. **Env-node depletion image swap (Tile markers only).** When the SHARED
   `environment.nodeRuntime[taskId]` is depleted (`current <= 0`) AND the task configures a
   `depletedBehavior.swapImage`, every linked Tile marker for that `(environment, task)` swaps
   its texture to that image and flips back on recharge (available image stashed/restored via
   `flags.fabricate.markerAvailableImg`). This reflects the SHARED env node — **not** a
   per-interactable node pool, and there is no `nodeStateOverride`. The decision
   (`resolveMarkerImage`) is pure; the sync (`syncInteractableMarkers` in
   `src/canvas/regions/interactableMarkerDepletion.js`) is active-GM-gated, no-throw, and
   idempotent, reacting to the `gatheringEnvironments` setting change and `canvasReady`.
2. **Concealment (all interactables).** DISABLED (`state.enabled === false`) or explicitly
   HIDDEN (`presentation.hidden === true`) hides the linked Tile marker from players
   (`tile.hidden = true`, GM-only; `resolveMarkerHidden`) in the same active-GM pass. A LOCKED
   interactable's marker stays visible.

### Per-Behaviour Node State (`behavior.system.node`) — ABANDONED

> **REMOVED — do not implement (`ae53384`, `4770a7f`).** The behaviour has **no `node` field**.
> A gathering-task interactable carries no per-interactable node pool; node counts, depletion,
> and respawn are owned by `environment.nodeRuntime[taskId]`. There is no `nodeStateOverride`,
> no behaviour-backed node adapter (`interactableRegionNodeAdapter.js` is now only a pure
> `{sceneId,regionId,behaviorId}` ref resolver), no per-behaviour world-time respawn pass, and
> no precedence of a behaviour node over the environment node. The timed/waiting-run maturity
> decrement lands on the **environment** node. The subsection below is a record of the abandoned
> draft.

A gathering-task interactable owns its own depletion/respawn state on the behaviour
(`behavior.system.node`), independent of `environment.nodeRuntime[taskId]`.

1. `node` is a **snapshot of the task's node CONFIG at drop time** (`current` seeded to
   `max`), normalized through the existing `normalizeNodeConfig` / `normalizeRespawn` helpers,
   and uses calendar-aware world-time respawn. A task with no node config yields `null` — an
   UNLIMITED gathering point (no depletion/respawn/writes).
2. Tool requirements are **NOT** snapshotted into `node`; they resolve from `task.toolIds`
   against the per-system Tools library at attempt time.
3. The node is depleted when `node.current <= 0` (one shared definition for count logic and
   depleted visuals).
4. When a per-behaviour node state is present for an attempt or listing, it takes precedence
   over `environment.nodeRuntime[taskId]` (threaded as a `nodeStateOverride`).
5. All writes to `behavior.system.node` are routed through the active GM (`module.fabricate`
   socket); only `game.users.activeGM` applies the behaviour update (a GM client applies its
   own write locally). A world-time respawn pass iterates placed region behaviours, active-GM
   only. Depletion reflects onto the linked visual (see Depleted Behavior).

### Depleted Behavior (gathering-task node config) — SHIPPED as a SHARED env-node-driven Tile swap

> **SHIPPED (simple first version).** The original per-interactable/per-marker form (Drawing
> hide, terminal `deleteToken`, Token hide, `flags.fabricate.nodeOriginal` revert stash) was
> abandoned. What shipped is the **simple, shared-env-node** form: `depletedBehavior.swapImage`
> drives a **linked Tile** image swap, keyed off the SHARED `environment.nodeRuntime[taskId]`,
> not a per-interactable node. The other fields (`postfixName`, `deleteToken`) remain authorable
> task node config but drive no interactable marker in the shipped model.

```js
depletedBehavior = {
  swapImage?: string | null,   // SHIPPED: linked Tile texture swapped while the env node is depleted
  postfixName?: string | null, // authored config; drives no interactable marker in the shipped model
  deleteToken?: boolean,       // authored config; drives no interactable marker in the shipped model
}
```

Shipped semantics (`src/canvas/regions/interactableMarkerDepletion.js`):

1. **Depletion trigger is the SHARED env node** — `environment.nodeRuntime[taskId].current <= 0`
   (the pure `resolveMarkerImage` decision; `isNodeDepleted` falls back to the task's own node
   `current`/`max` when the env runtime has no entry yet). There is **no per-interactable node
   pool** and **no `nodeStateOverride`**.
2. **Tile** — when depleted AND `swapImage` is configured, every linked **Tile** marker for that
   `(environment, task)` swaps its texture to `swapImage`; on recharge (env node above `0`) it
   flips back to the available image. The available image is stashed at
   `flags.fabricate.markerAvailableImg` on the FIRST swap (preferring the GM's actual marker
   texture) and restored on recharge.
3. The swap is reconciled by an **idempotent, no-throw, active-GM** sync
   (`syncInteractableMarkers`) that runs on the `gatheringEnvironments` setting change (gather
   decrement + world-time respawn) and `canvasReady`; every other client sees the change via
   normal Foundry document sync. The same pass reconciles marker concealment
   (`resolveMarkerHidden`).

## Migration

A `0.6.0` migration (`src/migration/migrateCatalystsToTools.js`) converts **recipe**-level,
step-level, ingredient-set-level, and salvage catalysts into deduped per-system library
Tools plus `toolIds` references, with this mapping:

| Catalyst shape | Resulting Tool |
| --- | --- |
| `degradesOnUse: false` (presence-only) | `breakage { breakageChance, breakageChance: 0 }` + `onBreak { flagBroken }` — writes NO item flag |
| `degradesOnUse: true`, `maxUses: N`, `destroyWhenExhausted: true` | `breakage { limitedUses, maxUses: N }` + `onBreak { destroy }` |
| `degradesOnUse: true`, `maxUses: N`, `destroyWhenExhausted: false` | `breakage { limitedUses, maxUses: N }` + `onBreak { flagBroken }` |

The presence-only row is a deliberate, behavior-preserving modeling choice: a
`breakageChance: 0` tool's `applyUsage` is a no-op (non-`limitedUses` mode), so it writes no
`flags.fabricate.toolUsage`, exactly preserving the old never-consumed behavior. (A
`limitedUses` tool would write `toolUsage` unconditionally, which is wrong for pure
presence.) The migration is therefore behavior-preserving, not strictly lossless.

The migration is pure, idempotent, and by-reference; identical catalysts dedupe to one
shared Tool keyed on the full catalyst shape (componentId + degradesOnUse + maxUses +
destroyWhenExhausted), so semantically different catalysts are NOT merged. Recipes whose
crafting system is missing are skipped (logged, not thrown). The migration mutates only the
`recipes` and `craftingSystems` (systems) settings — not `gatheringConfig`, because the
gathering `task.catalysts` field is dead/vestigial (never authored, only read, always
empty) and carries no data to migrate.

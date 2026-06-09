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
> **Env-node correction (further-superseded).** The "Per-Behaviour Node State" and
> "Depleted Behavior" subsections below were ALSO abandoned (`ae53384`, `4770a7f`). The shipped
> gathering-task interactable carries **no `node` field**, **no `nodeStateOverride`**, and
> **no per-marker depleted-behaviour**: it is a pure `(environment, task)` shortcut using
> `environment.nodeRuntime[taskId]` as the single source of truth. A **Tool** interactable opens
> the **Crafting** tab. Read those two subsections as a record of abandoned drafts.

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

### Linked Visual reverse flags (presentation-only)

The linked visual (Tile / Drawing / Token) carries only a reverse pointer back at its owning
Region + Behaviour; it holds NO interactable state of its own:

```js
visual.flags.fabricate = {
  isInteractableVisual: true,
  linkedRegionUuid: string,
  linkedBehaviorId: string
}
```

Built/read via `buildLinkedVisualFlags` / `readLinkedVisualRef`. The linked visual is
**presentation-only**: no per-interactable depletion mutation is applied to it in the shipped
model (env-driven marker depletion is a possible FUTURE option).

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

### Depleted Behavior (gathering-task node config) — ABANDONED as an interactable marker

> **REMOVED as an interactable mechanism.** `depletedBehavior` is still authored/normalized as
> task node config, but does NOT drive any per-interactable linked-visual transition in the
> shipped model. The schema/decision below is a record of the abandoned draft.

```js
depletedBehavior = {
  swapImage?: string | null,   // Tile texture swapped while depleted
  postfixName?: boolean,       // append "(depleted)" label (Drawing label only)
  deleteToken?: boolean,       // terminal: visual deleted on depletion (Tile/Drawing only)
  tokenHide?: boolean,         // Token-only opt-in: reversibly hide the linked Token
}
```

The depleted DECISION stays pure; the depletion reflects onto the linked visual per its
`documentName`:

1. **Tile** — `swapImage` swaps the texture (original captured in
   `flags.fabricate.nodeOriginal`, restored on respawn); terminal `deleteToken` deletes the
   tile (no revert). `deleteToken` is mutually exclusive with `swapImage`/`postfixName`.
2. **Drawing** — depletion HIDES the drawing (`hidden:true`, reversible), optionally appending
   a `(depleted)` label; terminal `deleteToken` deletes the drawing.
3. **Token** — **SAFE no-op by default**: a linked existing Token is the GM's own document and
   is NEVER mutated or deleted by depletion. `deleteToken` is deliberately IGNORED for a Token.
   The only opt-in is `tokenHide: true`, which reversibly hides the token on depletion and
   shows it again on respawn (the single state it ever touches).
4. `depletedBehavior` is orthogonal to `depletionTiming` (`onStart` / `onSuccess`); both key
   off the same `node.current <= 0` trigger. All visual mutations route through the active GM.

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

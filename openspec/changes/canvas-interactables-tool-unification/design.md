# Design: Canvas Interactables + Tool Unification

## Ground-Truth Facts

- Tools are already a shared per-crafting-system library at
  `config.systems[systemId].tools`, with CRUD UI in
  `src/ui/svelte/apps/manager/ToolsBrowserView.svelte`, referenced by gathering tasks via
  `task.toolIds`.
- `src/models/Tool.js` has `componentId`, `requirement {provider, formula?, macroUuid?}`,
  `breakage {mode: limitedUses | breakageChance | diceExpression}`,
  `onBreak {mode: destroy | flagBroken | replaceWith}`. Tools already match presence
  (reusing `catalystMatchesItem`), gate via `requirement`, and break.
- `src/models/Catalyst.js` has `componentId`, `degradesOnUse`, `destroyWhenExhausted`,
  `maxUses`; item usage is tracked under `flags.fabricate.catalystItemUsage`.
- Gathering tool runtime (presence/requirement/breakage) lives in
  `src/gatheringToolRuntime.js`; `src/main.js` `createGatheringToolBreakage` builds the
  breakage plan/apply pair. World-time respawn and calendar resolution live in
  `GatheringRichStateService` + `src/systems/foundryCalendar.js`.
- `0.5.0` is the highest registered migration; the next version is `0.6.0`.

## Key Technical Decisions

### 1. V13 token spawning model

One auto-provisioned generic world actor `"Fabricate Interactable"` backs every
Interactable. Spawned tokens are **unlinked**; all per-Interactable data lives in
`token.flags.fabricate`. Interactables are **Tokens, not Tiles**, because tokens deliver
`clickLeft2` (double-click) hit events through the canvas layer. Spawning is **GM-only**.
`ensureInteractableActor()` provisions the actor lazily on first spawn.

### 2. State-write authority

Token-flag mutations (node depletion, respawn, depleted-behavior apply/revert) are not
written directly by arbitrary clients. They emit an `interactableNodeUpdate` action over
the `module.fabricate` socket; only `game.users.activeGM` applies `token.update(...)`. A GM
client applies its own writes locally without round-tripping the socket. This mirrors the
existing `hazardSceneCoordinator` / `isActiveGM` pattern so authority semantics stay
consistent across the module.

### 3. Per-token attempt flow

`GatheringEngine.startAttempt` takes an optional `nodeStateOverride` adapter. When present
it is threaded into `_commitTerminalSideEffects` / `_commitRichAttempt`, and
`GatheringRichStateService` node helpers prefer the injected adapter over
`environment.nodeRuntime[taskId]`. The adapter (`src/canvas/tokenNodeStateAdapter.js`)
reads/writes `flags.fabricate.node`, reusing `normalizeNodeConfig` / `normalizeRespawn`
and the calendar respawn resolution, and routes writes through the GM socket. This keeps
per-token nodes fully independent of per-environment runtime state.

**Snapshot semantics.** At drop time the token **snapshots the task's node CONFIG** into
`flags.fabricate.node` (independent of any environment), carrying **both** config and
runtime. This is the only node state the token ever uses. **Tool requirements are NOT
snapshotted**: they still resolve from `task.toolIds` against the per-system Tools library
at attempt time (so library edits to a Tool propagate to placed tokens). The depletion
trigger is `node.current <= 0` — one shared definition used by both the count logic and the
depleted-visual apply.

### 4. `activeCanvasTool` injection (virtual-present tools)

Double-clicking a Tool station does not mint a synthetic `Item`. Instead it injects a
**virtual-present flag keyed by `componentId`** (`presentTools` / `presentToolComponentIds`)
into the crafting and gathering availability checks. A virtual-present tool is treated as
satisfied without the actor owning the item, and is **excluded from breakage and usage**
(it is the station's tool, not the actor's). `src/ui/SvelteFabricateApp.svelte.js` accepts
`options.activeCanvasTool`, exposes it via `_buildServices` `getActiveCanvasTool`, sets it
in `show(tab, { activeCanvasTool })`, and clears it on close.

**`show` signature change.** Today `SvelteFabricateApp.show(tab = DEFAULT_TAB)` is
**single-arg**. Phases 4 and 5 change it to `show(tab, options)` so callers can pass
`{ activeCanvasTool }` (Phase 4) and `{ environmentId, taskId, nodeStateOverride }`
(Phase 5). Existing single-arg callers remain valid (`options` defaults to `{}`).

### 5. Depleted-behavior config

`depletedBehavior` is authored on the gathering-task node config:
`{ swapImage?, postfixName?, deleteToken? }`. It is applied/reverted on the token via the
GM socket. The original token state is captured under `flags.fabricate.nodeOriginal` so a
respawn can restore image/name. `deleteToken` is **terminal** — once the token is deleted
there is nothing to revert.

- **Orthogonal to depletion timing.** `depletedBehavior` describes what happens to the
  token *visual* when the node is depleted; it is independent of `depletionTiming`
  (`onStart` / `onSuccess`), which describes *when* a node decrements. Both axes compose
  freely.
- **`deleteToken` is mutually exclusive with `swapImage` / `postfixName`.** When
  `deleteToken` is on, the token is removed, so `swapImage` and `postfixName` are **dead
  config**. The task editor disables/greys the swap+postfix controls when delete is enabled,
  and the normalizer drops them.
- **Depletion trigger.** Both the count logic and the depleted visuals key off a single
  shared definition: the node is depleted when `node.current <= 0`. There is one source of
  truth for "is this node depleted", reused by the respawn pass and the depleted-visual
  apply.

### 6. Environment resolution precedence on drop

`_onDrop` resolves the environment for a dropped Gathering Task in this order:

1. **Scene Region auto-detect** — the drop point falls within a region flagged with
   `flags.fabricate.environmentId`. When this fires, emit `ui.notifications.info` naming the
   resolved environment so the GM knows auto-detect won.
2. **Task default** — the task carries the new optional `defaultEnvironmentId` field
   (see "Task default environment" below).
3. **GM dialog** — when neither auto-source resolves, **or** when an explicit override is
   requested. The dialog presents an environment `<select>`; **cancel = abort the spawn**
   (no token is created).

**Modifier-key override.** Holding **Alt** during the drop always forces the GM dialog,
bypassing tiers 1 and 2. This is for the case where auto-detect or the task default would
resolve the "wrong" environment and the GM wants to pick explicitly. Discoverability: the
override is documented in the Interactable browser app (hint text near the draggable task
entries) and in the gathering-environment data-model doc.

### 6a. Task default environment — new optional field (`defaultEnvironmentId`)

"Task default environment" is a **new concept**. Today, gathering library tasks carry **no**
`environmentId` / `defaultEnvironmentId`; tasks are composed **into** environments
many-to-many via `enabledTaskIds` / `forcedTaskIds`. The middle precedence tier therefore
requires a **new optional field** on the gathering library task:

```js
task.defaultEnvironmentId?: string | null   // new optional field
```

- Normalized in `adminStore` `_normalizeGatheringTask` (coerce to a trimmed string or
  `null`; drop empties) **and** preserved by `GatheringEnvironmentStore`.
- Authored in the task editor (a single environment `<select>`, optional).
- Read by `_onDrop` as the precedence middle tier. A stale id (no matching environment)
  falls through to the GM dialog rather than throwing.

## Catalyst → Tool Migration Mapping

The 0.6.0 migration (`src/migration/migrateCatalystsToTools.js`) walks **recipe**-level,
step-level, ingredient-set-level, and salvage-definition catalysts, dedupes them into
per-system library Tools, and replaces the inline catalyst arrays with `toolIds`
references. (The gathering `task.catalysts` field is dead/vestigial — never authored, only
read, always empty — so it is **not** walked and there is no gathering-task migration; see
the proposal scope note.) Mapping:

| Catalyst shape | Resulting Tool |
| --- | --- |
| `degradesOnUse: false` (presence-only, never consumed) | `breakage { mode: breakageChance, breakageChance: 0 }` + `onBreak { mode: flagBroken }` — **presence-only, writes NO item flag** |
| `degradesOnUse: true`, `maxUses: N`, `destroyWhenExhausted: true` | `breakage { mode: limitedUses, maxUses: N }` + `onBreak { mode: destroy }` |
| `degradesOnUse: true`, `maxUses: N`, `destroyWhenExhausted: false` | `breakage { mode: limitedUses, maxUses: N }` + `onBreak { mode: flagBroken }` |

### Presence-only mapping (`degradesOnUse: false`) — deliberate modeling decision

The first row is a **deliberate modeling decision**, not an accident. A non-degrading
catalyst is required-but-never-consumed: it must be present and pass its requirement, but
must never increment usage or write any per-item flag. We model this with
`breakage { mode: breakageChance, breakageChance: 0 }` (a 0% break chance) rather than the
earlier `limitedUses, maxUses: null` proposal because:

- `Tool.applyUsage` is a **no-op for non-`limitedUses` breakage modes**, so a
  `breakageChance` tool writes **no** `flags.fabricate.toolUsage`. By contrast `limitedUses`
  writes `toolUsage` **unconditionally** through the shared breakage apply (even with
  `maxUses: null`), which would spuriously stamp an item flag onto an item that should be
  treated as pure-presence.
- Consequently this row's tools never touch item flags, exactly preserving the old
  `degradesOnUse: false` behavior.

This choice affects the display tier in `classifyGatheringToolStates`: a `breakageChance: 0`
tool surfaces as a present/never-degrading tool, not a limited-uses tool. The migration is
therefore **not "lossless"** in the strict structural sense; it is **behavior-preserving**
with this one documented modeling choice for the presence-only case.

Migration rules:

- Library Tools are **deduped** so identical catalysts across recipes collapse to one
  shared Tool entry; recipes then reference it by id. Dedup keys on the **full** catalyst
  shape (componentId + degradesOnUse + maxUses + destroyWhenExhausted) so semantically
  different catalysts are **not** merged.
- Recipes whose crafting `system` is missing are **skipped, not thrown** — the migration
  logs and continues so one orphaned recipe cannot fail the whole startup pass.
- The migration is pure, idempotent, and by-reference, consistent with the existing
  migration steps in `MigrationRunner.js`.
- **Mutated setting keys.** The migration mutates the `recipes` world setting and the
  `craftingSystems` systems setting (which holds `systems[id].tools`). It does **not** touch
  `gatheringConfig`. The `migrate(data)` return shape spreads partial results into the
  accumulated data, so returning `{ recipes, systems }` is correct (the systems object is
  the `craftingSystems` payload carrying the per-system Tool libraries).
- **Item-flag fallback (migrated `limitedUses` tools only).** At runtime, tool usage reads
  `flags.fabricate.toolUsage` and falls back to `flags.fabricate.catalystItemUsage` when
  `toolUsage` is absent, so in-flight per-item usage counters survive the cutover without an
  item-flag rewrite. This fallback is **meaningful only for migrated `limitedUses` tools**
  (`degradesOnUse: true`); it is meaningless for presence-only (`breakageChance: 0`) tools,
  which never read or write usage. After migration, the **first** `applyUsage` on a
  `limitedUses` tool writes `flags.fabricate.toolUsage` (authoritative thereafter);
  `flags.fabricate.catalystItemUsage` is **never** back-filled or cleared. The stale
  catalyst flag lingering is idempotent and acceptable: once `toolUsage` exists it wins, and
  the fallback path is never re-entered for that item.

## Evidence-Key Renames (Phase 2, atomic)

Phase 2 renames **all** catalyst-shaped evidence keys to their Tool equivalents in
lockstep. The complete set (six crafting/runtime keys plus the gathering reason and its
lang key):

| Catalyst key | Tool key | Surface |
| --- | --- | --- |
| `usedCatalysts` | `usedTools` | run-record persistence |
| `consumedCatalysts` | `consumedTools` | failure/success macro callback payload |
| `catalysts` | `tools` | chat-card UI param |
| `missing.catalysts` | `missing.tools` | diagnostic |
| `catalystStates` | `toolStates` | craftability evaluation |
| `CATALYST_BLOCKED` (reason) | `TOOL_BLOCKED` (reason) | gathering blocked reason — **`TOOL_BLOCKED` already exists** |
| `FABRICATE.Gathering.Blocked.CatalystBlocked` | (tool-blocked lang key) | localization for the blocked reason |

Because `TOOL_BLOCKED` already exists as a gathering reason, the `CATALYST_BLOCKED` rename
collapses into the existing reason (and its existing lang key) rather than introducing a new
one. The dead `CATALYST_BLOCKED` path is removed when the dead gathering catalyst runtime is
deleted.

## Data-Model Deltas

### Recipe / step / IngredientSet tool references

`toolIds: string[]` is added at recipe, step, and ingredient-set granularity (mirroring how
catalysts applied at each granularity). `RecipeManager.getToolsForSet` resolves the union
of applicable ids against the per-system library; `evaluateCraftability` returns
`toolStates` and `missing.tools` using the matcher from `src/gatheringToolRuntime.js`.
Inline catalyst arrays (`catalysts: Catalyst[]`) on Recipe / RecipeItemDefinition / step /
IngredientSet are removed in Phase 2.

### Gathering task `defaultEnvironmentId` (new optional field)

A new optional `defaultEnvironmentId?: string | null` is added to the gathering library
task (see §6a). It is normalized in `adminStore` `_normalizeGatheringTask` and preserved by
`GatheringEnvironmentStore`, authored in the task editor, and serves as the precedence
middle tier in on-drop environment resolution. It is unrelated to the existing
`enabledTaskIds` / `forcedTaskIds` many-to-many composition.

### Tool model generalization

`Tool` is no longer gathering-only. The model and validation are unchanged in shape, but
the canonical `Tool` is now the shared crafting + gathering prerequisite primitive
referenced by both `recipe/step/ingredientSet.toolIds` and `task.toolIds`. A
`toolMatchesItem` alias is kept during the Phase 0–1 transition and finalized (catalyst
matcher rename) atomically in Phase 2.

### Interactable token flag schema

`token.flags.fabricate` (built/read via `src/canvas/interactableTokenFlags.js`):

```js
flags.fabricate = {
  isInteractable: true,
  interactableType: "tool" | "gatheringTask",
  sourceUuid: string,            // the Fabricate Tool / Gathering Task source
  environmentId?: string,        // resolved at drop (gatheringTask)
  node?: {                       // gatheringTask only; per-token depletion/respawn state
    // SNAPSHOT of the task's node CONFIG at drop time, carrying BOTH config and runtime,
    // normalized via normalizeNodeConfig / normalizeRespawn; calendar-aware respawn
    // anchored on world time. Fully independent of any environment.nodeRuntime[taskId].
  },
  nodeOriginal?: {               // captured pre-depleted-behavior token state (image/name)
    img?: string,
    name?: string,
  }
}
```

### `depletedBehavior` (gathering-task node config)

```js
depletedBehavior = {
  swapImage?: string | null,     // token texture swapped while depleted
  postfixName?: string | null,   // appended to token name while depleted
  deleteToken?: boolean,         // terminal: token removed on depletion, no revert
}
```

Normalized in `adminStore` and authored in the task editor under
`CraftingSystemManagerRoot.svelte`. `deleteToken` is **mutually exclusive** with
`swapImage` / `postfixName`: when delete is on, swap+postfix are dead config (the editor
greys them out and the normalizer drops them). Triggered when `node.current <= 0`;
orthogonal to `depletionTiming` (`onStart` / `onSuccess`).

## Phase Boundaries & Test Seams

- **Phase 0** is purely additive: catalysts still work; `toolMatchesItem` is an alias of
  the existing matcher; shared breakage logic moves into `src/toolBreakageRuntime.js` so
  both crafting and gathering consume one breakage plan/apply implementation.
- **Phase 1** introduces migration before any catalyst deletion, so the migration can read
  catalyst data that still exists.
- **Phase 2** deletes catalyst code/UI/localization and finalizes the matcher rename
  atomically — only after migration is in place.
- **Phases 3–7** are canvas/runtime work layered on the unified Tool primitive: the
  Interactable foundation, virtual-present tool injection, per-token node state with GM-
  routed writes, depleted behavior + env precedence, and GM tooling.

## Open Risks

1. **Migration ordering vs. deletion.** The 0.6.0 migration must ship and run in Phase 1
   while catalyst data structures still exist; Phase 2 deletion must not land before the
   migration is registered. Mitigation: phases are separately gated, and the item-flag
   fallback covers in-flight usage counters.
2. **Dedup correctness.** Collapsing identical catalysts into shared library Tools must key
   on the full catalyst shape (componentId + degradesOnUse + maxUses + destroyWhenExhausted)
   so semantically different catalysts are not merged.
3. **Terminal pipeline ordering.** Tool breakage for recipes must integrate with the
   existing crafting terminal flow without changing catalyst-era success/fail ordering for
   already-migrated data.
4. **Socket authority races.** `interactableNodeUpdate` must apply only on
   `game.users.activeGM`; concurrent depletion writes from multiple players against one
   node must converge through the single GM applier (last-write-wins on the node state).
5. **Respawn vs. depleted-behavior revert.** Calendar-aware respawn must restore
   `nodeOriginal` image/name when un-depleting; `deleteToken` is terminal and has no revert
   path, so respawn must no-op against a deleted token.
6. **Virtual-present tool exclusion.** A station-injected `activeCanvasTool` must never be
   counted toward breakage/usage; a regression here would consume/break an item the actor
   does not own.
7. **Region auto-detect reliability.** V13 Scene Region containment tests for the drop
   point must be robust to overlapping regions; the precedence chain falls back to the GM
   dialog when ambiguous.
8. **Smoke-harness selectors.** Canvas spawning and the new Interactable browser app are
   not exercised by the existing Phase D0 manager selectors; runtime validation needs
   `npm run test:foundry` for the canvas surfaces.

## Spec Ownership

Durable product behavior introduced by this change is recorded as change-scoped spec
deltas under `openspec/changes/canvas-interactables-tool-unification/specs/`:

- `data-models/spec.md` — remove Catalyst; generalize Tool; add `toolIds` to
  recipe/step/IngredientSet; add the new optional `task.defaultEnvironmentId` field; add
  Interactable token flag schema, `flags.fabricate.node` (config+runtime snapshot),
  `flags.fabricate.nodeOriginal`, and `depletedBehavior`; record the catalyst→tool
  migration mapping (including the presence-only `breakageChance: 0` mapping) and the
  `catalystItemUsage` → `toolUsage` fallback.
- `recipes-and-steps/spec.md` — Tool prerequisite semantics replace catalyst prerequisites
  on recipes/steps/ingredient sets.
- `gathering-and-harvesting/spec.md` — per-token node state, depleted behavior, env
  resolution precedence, and virtual-present (canvas tool) injection.
- `destructive-changes-and-migrations/spec.md` — the 0.6.0 Catalyst→Tool migration.

These deltas are merged into the canonical `openspec/specs/*/spec.md` by the
domain-expert/docs loop after implementation; canonical specs are not edited in the
planning stage.

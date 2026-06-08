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

### Interactable Token Flags

A Fabricate Interactable is a token (not a tile) backed by one auto-provisioned generic
world actor `"Fabricate Interactable"`; spawned tokens are unlinked and carry all per-
Interactable data in `token.flags.fabricate`.

```js
token.flags.fabricate = {
  isInteractable: true,
  interactableType: "tool" | "gatheringTask",
  sourceUuid: string,            // the Fabricate Tool / Gathering Task source
  environmentId?: string,        // resolved at drop (gatheringTask)
  node?: NodeState,              // gatheringTask only; per-token depletion/respawn state
  nodeOriginal?: {               // captured pre-depleted-behavior token state
    img?: string,
    name?: string,
  }
}
```

1. `isInteractable`, `interactableType`, and `sourceUuid` are required on an Interactable
   token; `environmentId`, `node`, and `nodeOriginal` apply to gathering-task tokens only.
2. Token spawning is GM-only.

### Per-Token Node State (`flags.fabricate.node`)

A gathering-task token owns its own depletion/respawn state in `flags.fabricate.node`,
independent of `environment.nodeRuntime[taskId]`.

1. `node` is a **snapshot of the task's node CONFIG at drop time**, carrying **both** config
   and runtime, normalized through the existing `normalizeNodeConfig` / `normalizeRespawn`
   helpers, and uses calendar-aware world-time respawn (same resolution as resource-node
   respawn). It is independent of any environment.
2. Tool requirements are **NOT** snapshotted into `node`; they resolve from `task.toolIds`
   against the per-system Tools library at attempt time.
3. The node is depleted when `node.current <= 0` (one shared definition for count logic and
   depleted visuals).
4. When a per-token node state is present for an attempt, it takes precedence over
   `environment.nodeRuntime[taskId]`.
5. All writes to `flags.fabricate.node` are routed through the active GM (`module.fabricate`
   socket `interactableNodeUpdate`); only `game.users.activeGM` applies `token.update` (a GM
   client applies its own writes locally without a socket round-trip).

### Depleted Behavior (gathering-task node config)

```js
depletedBehavior = {
  swapImage?: string | null,   // token texture swapped while depleted
  postfixName?: string | null, // appended to token name while depleted
  deleteToken?: boolean,       // terminal: token removed on depletion, no revert
}
```

1. `depletedBehavior` is authored on the gathering-task node config and normalized in the
   admin store (unknown/empty fields normalize away). It is orthogonal to `depletionTiming`
   (`onStart` / `onSuccess`).
2. `swapImage` / `postfixName` capture the prior token state into
   `flags.fabricate.nodeOriginal` on apply and restore it on revert (respawn).
3. `deleteToken` is terminal — once applied there is no revert, and respawn must no-op
   against a deleted token. It is **mutually exclusive** with `swapImage` / `postfixName`:
   when `deleteToken` is set those fields are dead config and the normalizer drops them.

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

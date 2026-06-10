# Design

## Data model: two independent flags replace the mode enum

The single mutually-exclusive `economy.mode` (`none | stamina | nodes`) is replaced by two
independent booleans. The normalized shape emitted by `normalizeGatheringEconomy()`
(`src/systems/GatheringRichStateService.js`, ~line 1752) becomes:

```js
{
  stamina: { enabled: boolean, max, start, regen: { policy, unit, amount, lastRoll, ... } },
  nodes:   { enabled: boolean },
}
```

- `stamina.enabled` lives alongside the existing stamina config (`max` / `start` / `regen`),
  which is otherwise unchanged.
- `nodes` is a minimal block carrying only `enabled`. Per-task node counts and respawn stay
  exactly where they are today (per-task `task.nodes`, persisted in
  `environment.nodeRuntime`); only the system-level on/off selector moves here.
- `ECONOMY_MODES` / regen constants are retained for the read-compat mapping and for the
  derived `economyMode` accessor.

## Read-time legacy `mode` compatibility

`normalizeGatheringEconomy()` maps a legacy `mode` string whenever the new flags are absent:

| legacy `mode`     | `stamina.enabled` | `nodes.enabled` |
| ----------------- | ----------------- | --------------- |
| `'stamina'`       | `true`            | `false`         |
| `'nodes'`         | `false`           | `true`          |
| `'none'` / absent | `false`           | `false`         |

If the new flags are already present, they win and `mode` is ignored. This means an
un-migrated world (one that still stores `mode`) behaves identically on every read, before
the `0.8.0` migration ever runs. The GM-side mirror `normalizeEconomy()`
(`GatheringEconomyView.svelte`) applies the same mapping so the manager renders correctly
pre-migration.

## Single predicate pair drives every surface

Enforcement, listings, world-time drivers, and all UI read the **same two booleans** sourced
from the normalized economy:

- `staminaEnabled(systemId): boolean` and `nodesEnabled(systemId): boolean` are added to
  `GatheringRichStateService` (replacing the `_economyMode` / `economyMode` internal usage at
  ~1589–1612). `economyMode(systemId)` is kept only as a thin derived back-compat accessor
  returning `'both' | 'stamina' | 'nodes' | 'none'`.
- The engine listing view-model surfaces `staminaEnabled` / `nodesEnabled` verbatim on the
  environment view-model so player and GM UIs share one predicate pair with no per-surface
  string parsing.

## "Both" semantics and anti-dogpiling (no special code path)

`evaluateStart()` (~1357) and `commitAcceptedAttempt()` (~1386) already contain two separate
`if` blocks, one per limitation. The change swaps the string checks for the boolean
predicates:

- `evaluateStart()`: `if (mode === 'nodes')` → `if (nodesEnabled)`; `if (mode === 'stamina')`
  → `if (staminaEnabled)`. With both enabled, both gates run and both pieces of `evidence`
  (`rich.nodes` and `rich.stamina`) are populated.
- `commitAcceptedAttempt()`: the node-depletion block is guarded by `nodesEnabled`, the
  stamina-spend block by `staminaEnabled`. With both on, one accepted attempt both decrements
  the node pool and spends the actor's stamina.

This is the anti-dogpiling behaviour and it falls out of running both already-existing blocks:
finite nodes cap total pulls regardless of party stamina. No combined-mode branch is needed.

Other internal callsites that read the mode switch to the predicate pair: `listingStaminaCost()`
(~1669, `!== 'stamina'` → `!staminaEnabled`) and the `_economyMode(...)` checks at ~726, ~967,
~1032 (stamina seed on listing / node respawn skip).

## Engine drivers

In `src/systems/GatheringEngine.js`:

- `_processStaminaRegen` (~188): filter systems by `richState.staminaEnabled?.(id)` instead of
  `economyMode === 'stamina'`.
- `_processNodeRespawn` (~218): skip environments where
  `!richState.nodesEnabled?.(craftingSystemId)` instead of `economyMode !== 'nodes'`.
- Listing view-model (~964, ~1066–1069, ~1181): stamina auto-seed guarded by `staminaEnabled`;
  expose `staminaEnabled` / `nodesEnabled` on the environment view-model; keep populating
  `staminaPool` when `staminaEnabled`. `task.rich.stamina` / `task.rich.nodes` continue to be
  set from `evaluateStart` evidence, so both inspectors light up under "both".

## GM UI: two toggle pills

`GatheringEconomyView.svelte` replaces the 3-option `role="radiogroup"` with two toggle pills
(Stamina, Resource nodes) reusing the existing `.manager-economy-mode-option` styling. Each
pill toggles its flag (`setStamina(bool)` / `setNodes(bool)`), persisted via the existing
`setGatheringEconomy` endpoint; both can be `is-active`; the explicit "No limit" option is
dropped (neither active = no limit). The stamina sub-config block shows when
`economy.stamina.enabled`; the nodes note shows when `economy.nodes.enabled`; both can render
at once.

In `CraftingSystemManagerRoot.svelte` and `GatheringTaskEditView.svelte`, the
`selectedGatheringTaskEconomyMode` string and the `economyMode` prop are replaced by two
derived booleans (`...economy?.stamina?.enabled` / `...economy?.nodes?.enabled`); the
`{#if economyMode === 'stamina'}` / `=== 'nodes'` template guards become `{#if staminaEnabled}`
/ `{#if nodesEnabled}`, so both cards show when both are on.

## Player UI

`GatheringDetail.svelte` replaces its `economyMode` derivation and `=== 'stamina'` checks with
`staminaEnabled` / `nodesEnabled` derived from the env view-model; the economy strip renders the
stamina item when `staminaEnabled` **and** the node legend item when `nodesEnabled` (both can
appear together) instead of the current if/else. `GatheringTaskDetail.svelte` is already
presence-driven (`task.rich.stamina` / `task.rich.nodes`) and needs no logic change once the
engine populates both under "both" — verify only.

## Migration (0.8.0)

`src/migration/migrateGatheringLimitationToggles.js` (modeled on `migrateGatheringEconomy.js`):
pure, idempotent, by-reference. For each `gatheringConfig.systems[id].economy` that still
carries a legacy `mode`, write `stamina.enabled = (mode === 'stamina')` and
`nodes.enabled = (mode === 'nodes')`, then drop `mode`. Already-migrated economies (no `mode`,
flags present) are left untouched. Registered as a new `version: '0.8.0'` step in
`MigrationRunner.js`, appended after the `0.7.0` entry (~line 105) before the closing `]`.

The read-time mapping above and the migration are intentionally redundant: the migration makes
the persisted shape canonical, while the read mapping guarantees safety for any world that has
not yet migrated.

## Canonical spec edits (applied by the docs loop, not here)

`openspec/specs/gathering-and-harvesting/spec.md`:

- **"Gathering Economy and Stamina" (~660–722):**
  - Replace the `GatheringEconomyConfig` `mode` enum field in **Properties** with the two
    flags: `stamina: { enabled: boolean, ... }` and `nodes: { enabled: boolean }`.
  - Rewrite requirements 1–4 / 6–7: drop the single-mode requirement; state that stamina and
    resource-node limitations are independently toggled per crafting system; both-on applies
    both limits simultaneously and is the anti-dogpiling combination; neither-on is no limit;
    node enforcement applies when `nodes.enabled`, stamina enforcement when `stamina.enabled`.
  - Document the read-time legacy `mode → flags` mapping and that timed attempts remain
    orthogonal regardless of the flags.
- **Migration note:** record the `0.8.0` migration (legacy `mode` → `stamina.enabled` /
  `nodes.enabled`, drop `mode`; idempotent) alongside the existing migration references.
- **"Gathering Resource Nodes" (~573–620):** add/adjust the requirement wording so node
  enforcement is gated on `nodes.enabled` (system-level toggle) rather than the removed
  `nodes` mode, leaving per-task node mechanics unchanged.

## Risks / open questions

- The retained `economyMode()` derived accessor returns a `'both'` value the old enum never
  had; any external/API consumer that switches on the exact string set must tolerate `'both'`.
- `task.start` is listed in the normalized stamina shape per the plan; the implementer should
  confirm the existing field name (`start` vs an equivalent) when emitting the shape so no
  stamina sub-field is dropped.
- The GM-side `normalizeEconomy()` mirror must stay in lockstep with the service normalizer;
  drift would make the manager and runtime disagree pre-migration.

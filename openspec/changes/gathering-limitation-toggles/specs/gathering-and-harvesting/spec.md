# Gathering And Harvesting Spec Delta

## Modified Requirements

### Gathering Economy and Stamina

The single mutually-exclusive economy `mode` enum (`none` | `stamina` | `nodes`) is
replaced by two **independent boolean toggles** — `stamina.enabled` and `nodes.enabled`.
"Both" is achieved by enabling both toggles (the anti-dogpiling combination); "no limit"
is both-off. There is no `mode` field on the normalized shape.

Normalized economy shape (stored per crafting system at
`gatheringConfig.systems[systemId].economy`):

```js
GatheringEconomyConfig = {
  stamina: {
    enabled: boolean,
    max: string,    // expression template, blank ⇒ start full at max
    start: string,  // expression template, blank ⇒ start at max
    regen: {
      policy: "none" | "elapsedTime",
      unit: "minutes" | "hours" | "days" | "weeks",
      amount: string,           // expression: plain number or character-referencing formula
      lastRoll: object | null,
    },
  },
  nodes: { enabled: boolean },
}
```

The stamina `regen` sub-shape is reconciled to what the normalizer actually emits
(`policy` / `unit` / `amount` / `lastRoll`); the prior `formula` and
`characterModifiers` fields are NOT part of the normalized regen shape.

1. The stamina and resource-node limitations are each toggled independently per crafting
   system via `stamina.enabled` and `nodes.enabled`; there is no single mutually-exclusive
   limitation mode.
2. When neither toggle is enabled, no limitation applies (legacy behaviour); timed attempts
   via `timeRequirement` remain available regardless of either toggle and are orthogonal to
   the limitation toggles.
3. Task availability/depletion/respawn is the resource-node limitation model; node
   enforcement applies only when `nodes.enabled` is set.
4. Actor stamina spend/regeneration is the stamina limitation model; stamina enforcement
   applies only when `stamina.enabled` is set.
5. The two toggles independently show or hide their own GM authoring sub-blocks (stamina
   sub-config when `stamina.enabled`, resource-node note/config when `nodes.enabled`); both
   render together when both are on, neither when both are off. No single "selected mode"
   decides which controls are primary or hidden.
6. When both toggles are enabled, both limitations apply simultaneously: both start gates
   are evaluated, and one accepted attempt both depletes the node pool AND spends the
   actor's stamina (in that order). This is the anti-dogpiling combination — finite nodes
   cap total pulls regardless of collective party stamina, until they respawn over world time.
7. Read-time legacy compatibility: an economy block still carrying a legacy `mode` string
   maps it to the toggles ONLY when neither the `stamina.enabled` nor the `nodes.enabled`
   KEY is present (`stamina → stamina.enabled`, `nodes → nodes.enabled`, `none`/absent →
   both false). When either flag key is present it wins over `mode`, so a stale `mode` can
   never resurrect an explicitly-disabled toggle. An un-migrated world behaves identically
   on every read.
8. The back-compat accessor `economyMode` derives a string from the two toggles for
   external/API consumers and may return `'both'`, `'stamina'`, `'nodes'`, or `'none'`; no
   internal enforcement relies on it.

### Gathering Resource Nodes

All resource-node mechanics (availability gating, depletion, and respawn) apply only when
the owning crafting system's economy `nodes.enabled` toggle is set. When `nodes.enabled`
is false, per-task node configuration is inert and node pools are neither enforced nor
respawned, regardless of per-task `nodes` data. Per-task node mechanics are otherwise
unchanged.

## Migration

A `0.8.0` migration (`src/migration/migrateGatheringLimitationToggles.js`) rewrites the
legacy economy `mode` into the two toggles: for each
`gatheringConfig.systems[id].economy` still carrying a `mode`, it writes
`stamina.enabled = (mode === 'stamina')` and `nodes.enabled = (mode === 'nodes')`, then
drops `mode`. It is pure, idempotent, by-reference, and version-gated, and leaves
already-toggle-shaped economies untouched. The 0.3.0 migration history (per-environment
`economyMode` / per-task `attemptLimit` removal, `hybrid → stamina`) is retained; the
read-time normalizer applies the same `mode → toggles` mapping so a world is safe whether
or not the migration has run.

# Destructive Changes And Migrations Spec Delta

## Added Requirements

### 0.6.0 — Catalyst → Tool Migration

A `0.6.0` migration registered in `src/migration/MigrationRunner.js`
(`src/migration/migrateCatalystsToTools.js`) converts every recipe-level, step-level,
ingredient-set-level, and salvage catalyst into a per-system library Tool and replaces the
inline catalyst arrays with `toolIds` references.

1. Mapping:
   - `degradesOnUse: false` (presence-only, never consumed) →
     `breakage { mode: breakageChance, breakageChance: 0 }` + `onBreak { mode: flagBroken }`.
     This is a **presence-only** mapping that writes **no** item flag (`Tool.applyUsage` is a
     no-op for non-`limitedUses` modes); it is a deliberate, behavior-preserving modeling
     choice, not strictly lossless.
   - `degradesOnUse: true`, `maxUses: N`, `destroyWhenExhausted: true` →
     `breakage { mode: limitedUses, maxUses: N }` + `onBreak { mode: destroy }`.
   - `degradesOnUse: true`, `maxUses: N`, `destroyWhenExhausted: false` →
     `breakage { mode: limitedUses, maxUses: N }` + `onBreak { mode: flagBroken }`.
2. Identical catalysts dedupe into one shared library Tool keyed on the full catalyst shape
   (componentId + degradesOnUse + maxUses + destroyWhenExhausted); recipes reference the
   shared Tool by id. Semantically different catalysts are NOT merged.
3. The migration is pure, idempotent, and by-reference; re-running it is a no-op once the
   inline catalyst arrays have been rewritten to `toolIds`. It is version-gated: 0.6.0 is not
   re-applied when the stored `migrationVersion` is already `>= 0.6.0`.
4. Recipes whose crafting `system` is missing are skipped (logged, not thrown) so one
   orphaned recipe cannot fail the startup migration pass.
5. **Mutated setting keys.** The migration mutates only the `recipes` world setting and the
   `craftingSystems` systems setting (which holds `systems[id].tools`). It does NOT touch
   `gatheringConfig`. The `migrate(data)` return spreads partial results, so returning
   `{ recipes, systems }` is correct.
6. **Gathering `task.catalysts` is dead — no migration.** The gathering `task.catalysts`
   field is dead/vestigial (never authored — no task-editor tab, no store CRUD, not emitted
   by `_normalizeGatheringTask`, not preserved by `GatheringEnvironmentStore`; only read,
   always empty). Its removal drops no live data and requires no gathering-task migration.
7. The migration must ship and run before catalyst code is deleted (Phase 1 precedes
   Phase 2). At runtime, tool usage reads `flags.fabricate.toolUsage` and falls back to
   `flags.fabricate.catalystItemUsage` when absent, preserving in-flight per-item usage
   counters without an item-flag rewrite. This fallback applies only to migrated
   `limitedUses` tools; presence-only (`breakageChance: 0`) tools never read or write usage.
   The first post-migration `applyUsage` writes `toolUsage` (authoritative); the legacy
   `catalystItemUsage` flag is never back-filled or cleared.

### Catalyst Evidence-Key Renames (Phase 2)

All catalyst-shaped evidence keys are renamed to their Tool equivalents atomically in
Phase 2: `usedCatalysts` → `usedTools` (run-record persistence); `consumedCatalysts` →
`consumedTools` (failure/success macro callback payload); `catalysts` → `tools` (chat-card
UI param); `missing.catalysts` → `missing.tools` (diagnostic); `catalystStates` →
`toolStates` (craftability); the `CATALYST_BLOCKED` gathering reason collapses into the
already-existing `TOOL_BLOCKED`, and its lang key
`FABRICATE.Gathering.Blocked.CatalystBlocked` is replaced by the existing tool-blocked key.

### Test-File Deletion Exception

`tests/catalyst-model.test.js` is deleted in Phase 2. This is an explicit, justified
exception to the AGENTS.md "must not delete test files" rule, because its subject
`src/models/Catalyst.js` is removed in the same phase. Its behavioral assertions are first
ported into the tool tests (`tests/crafting-engine-tools` / `tests/toolBreakageRuntime` /
the fallback test): the degradation matrix (increment, exhaust-at-`maxUses`,
`destroyWhenExhausted` true/false, `maxUses:null` unlimited), `catalystItemUsage`
read/write, the legacy `catalystUses` bare-number migration, and the "new format takes
precedence when both flags present" case.

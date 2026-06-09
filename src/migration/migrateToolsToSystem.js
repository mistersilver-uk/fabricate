/**
 * 0.7.0 — Reconcile UI-authored library Tools onto the crafting system (pure,
 * idempotent, version-gated).
 *
 * Tools are system-owned: every consumer reads
 * `craftingSystemManager.getSystem(id).tools`. The 0.6.0 catalyst migration
 * already writes migrated catalysts onto `system.tools`, but tools authored in
 * the Manager before this change were persisted under
 * `gatheringConfig.systems[id].tools`. This migration MOVES any such
 * gathering-config tools onto the matching crafting system's `tools` (the single
 * canonical source) and clears the gathering-config copy.
 *
 * Mutated setting keys: `craftingSystems` (systems[].tools) and `gatheringConfig`
 * (systems[id].tools cleared).
 *
 * Dedupe rule: by tool `id`. When the same id exists on both the system and the
 * gathering config, the EXISTING system tool wins (the gathering copy is dropped,
 * not merged) so a re-author on the system is never clobbered by a stale config
 * copy. Tools without an id are skipped.
 *
 * Idempotent: once the gathering-config `tools` arrays are emptied/removed, a
 * re-run finds nothing to move and is a no-op.
 *
 * Pure: returns `{ systems, gatheringConfig }` and performs no I/O. The runner
 * detects the change and persists.
 *
 * @param {Array<object>} systems - raw craftingSystems setting
 * @param {object} gatheringConfig - raw gatheringConfig setting
 * @returns {{ systems: Array<object>, gatheringConfig: object, movedCount: number }}
 */
export function migrateToolsToSystem(systems, gatheringConfig) {
  const safeSystems = Array.isArray(systems) ? systems : [];
  const config = gatheringConfig && typeof gatheringConfig === 'object' ? gatheringConfig : {};
  const configSystems = config.systems && typeof config.systems === 'object' ? config.systems : null;

  if (!configSystems) {
    return { systems: safeSystems, gatheringConfig: config, movedCount: 0 };
  }

  const systemById = new Map();
  for (const system of safeSystems) {
    if (system && typeof system === 'object' && system.id) {
      systemById.set(String(system.id), system);
    }
  }

  let movedCount = 0;

  for (const [systemId, systemConfig] of Object.entries(configSystems)) {
    if (!systemConfig || typeof systemConfig !== 'object') continue;
    const configTools = systemConfig.tools;
    if (!Array.isArray(configTools) || configTools.length === 0) continue;

    const system = systemById.get(String(systemId));
    if (!system) {
      // No matching crafting system — leave the orphaned config tools in place
      // rather than dropping authored data.
      continue;
    }

    if (!Array.isArray(system.tools)) {
      system.tools = [];
    }
    const existingIds = new Set(
      system.tools
        .filter(tool => tool && typeof tool === 'object' && tool.id)
        .map(tool => String(tool.id))
    );

    for (const tool of configTools) {
      if (!tool || typeof tool !== 'object' || !tool.id) continue;
      const id = String(tool.id);
      // Dedupe by id: an existing system tool wins (config copy dropped).
      if (existingIds.has(id)) continue;
      existingIds.add(id);
      system.tools.push(tool);
      movedCount += 1;
    }

    // Clear the gathering-config copy so the system is the single source.
    delete systemConfig.tools;
  }

  return { systems: safeSystems, gatheringConfig: config, movedCount };
}

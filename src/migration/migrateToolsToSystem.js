/**
 * `0.7.0` — move any Manager-authored library Tool off `gatheringConfig.systems[id].tools` onto the
 * matching crafting system's `tools`, the single canonical source, and clear the gathering copy.
 * Pure, idempotent, version-gated. Dedupe is by tool `id`, and on a clash the EXISTING system tool
 * wins — the gathering copy is dropped, not merged, so a re-author is never clobbered by a stale
 * config copy. A tool without an id is skipped.
 */
export function migrateToolsToSystem(systems, gatheringConfig) {
  const safeSystems = Array.isArray(systems) ? systems : [];
  const config = gatheringConfig && typeof gatheringConfig === 'object' ? gatheringConfig : {};
  const configSystems =
    config.systems && typeof config.systems === 'object' ? config.systems : null;

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
        .filter((tool) => tool && typeof tool === 'object' && tool.id)
        .map((tool) => String(tool.id))
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

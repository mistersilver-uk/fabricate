/**
 * `0.8.0` — replace the mutually-exclusive gathering limitation `mode` with independent
 * `stamina.enabled` and `nodes.enabled` flags, dropping `mode`. Pure, idempotent and by-reference.
 * The matching read-time mapping in `normalizeGatheringEconomy` keeps un-migrated worlds working, so
 * this step only makes the persisted shape canonical.
 */

export function migrateGatheringLimitationToggles(gatheringConfig = {}) {
  const rawSystems = gatheringConfig?.systems;
  if (!rawSystems || typeof rawSystems !== 'object') {
    return { gatheringConfig };
  }

  const systems = { ...rawSystems };
  let systemsChanged = false;

  for (const [systemId, system] of Object.entries(rawSystems)) {
    const economy = system?.economy;
    // Only rewrite economies that still carry a legacy `mode`.
    if (!economy || typeof economy !== 'object' || !('mode' in economy)) continue;

    const { mode, ...restEconomy } = economy;
    const nextEconomy = {
      ...restEconomy,
      stamina: { ...restEconomy.stamina, enabled: mode === 'stamina' },
      nodes: { ...restEconomy.nodes, enabled: mode === 'nodes' },
    };
    systems[systemId] = { ...system, economy: nextEconomy };
    systemsChanged = true;
  }

  return {
    gatheringConfig: systemsChanged ? { ...gatheringConfig, systems } : gatheringConfig,
  };
}

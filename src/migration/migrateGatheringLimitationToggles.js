/**
 * 0.8.0 migration — independent stamina + resource-node limitation toggles.
 *
 * The single mutually-exclusive gathering limitation `mode`
 * (`none|stamina|nodes`) stored under
 * `gatheringConfig.systems[systemId].economy.mode` is replaced by two
 * independent boolean flags: `stamina.enabled` and `nodes.enabled`. This
 * migration rewrites any economy block that still carries a legacy `mode` into
 * the flag shape and drops `mode`.
 *
 * | legacy `mode` | `stamina.enabled` | `nodes.enabled` |
 * | ------------- | ----------------- | --------------- |
 * | `'stamina'`   | `true`            | `false`         |
 * | `'nodes'`     | `false`           | `true`          |
 * | `'none'`/else | `false`           | `false`         |
 *
 * Pure, idempotent, and by-reference (no clone). An already-migrated economy
 * (no `mode`, flags present) is left untouched. The matching read-time mapping
 * in `normalizeGatheringEconomy()` keeps un-migrated worlds working before this
 * migration ever runs; this step simply makes the persisted shape canonical.
 */

/**
 * @param {object} gatheringConfig Raw gathering config setting.
 * @returns {{gatheringConfig: object}}
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
    // Only rewrite economies that still carry a legacy `mode`. Already-migrated
    // economies (no `mode`) are left exactly as-is.
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

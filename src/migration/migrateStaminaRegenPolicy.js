/**
 * 1.2.0 migration — unify the stamina-regen "over world time" policy name.
 *
 * Stamina regen stored its world-time-driven policy as `elapsedTime` while the
 * sibling node-respawn feature uses `overTime` for the identical concept (both
 * even render the same "Over world time" label). This migration rewrites the
 * persisted stamina policy `elapsedTime` → `overTime` under
 * `gatheringConfig.systems[systemId].economy.stamina.regen.policy`, so a single
 * term names "over world time" across both economy features.
 *
 * NOTE: this is a DIFFERENT enum at a DIFFERENT path than the pre-0.4.0
 * node-respawn `elapsedTime` legacy value handled by `migrateNodeRespawnModes.js`
 * — do not conflate them. This migration only touches stamina regen.
 *
 * Pure, idempotent, and by-reference: an economy already on `overTime` (or with
 * no regen policy) is left untouched, so re-running is a no-op and worlds with no
 * stamina regen see zero churn. The matching read-time mapping in
 * `normalizeGatheringEconomy()` keeps un-migrated worlds regenerating before this
 * migration ever runs; this step simply makes the persisted shape canonical.
 */

/**
 * @param {object} gatheringConfig Raw gathering config setting.
 * @returns {{gatheringConfig: object}}
 */
export function migrateStaminaRegenPolicy(gatheringConfig = {}) {
  const rawSystems = gatheringConfig?.systems;
  if (!rawSystems || typeof rawSystems !== 'object') {
    return { gatheringConfig };
  }

  const systems = { ...rawSystems };
  let systemsChanged = false;

  for (const [systemId, system] of Object.entries(rawSystems)) {
    const regen = system?.economy?.stamina?.regen;
    // Only rewrite the one legacy value; everything else (already `overTime`,
    // `none`, or no regen block) is left exactly as-is.
    if (!regen || typeof regen !== 'object' || regen.policy !== 'elapsedTime') continue;

    const economy = system.economy;
    const stamina = economy.stamina;
    systems[systemId] = {
      ...system,
      economy: {
        ...economy,
        stamina: {
          ...stamina,
          regen: { ...regen, policy: 'overTime' }
        }
      }
    };
    systemsChanged = true;
  }

  return {
    gatheringConfig: systemsChanged ? { ...gatheringConfig, systems } : gatheringConfig
  };
}

/**
 * `1.2.0` — rewrite the persisted stamina-regen policy `elapsedTime` to `overTime`, so one term
 * names "over world time" across both economy features. Pure, idempotent and by-reference.
 * A DIFFERENT enum at a DIFFERENT path from the pre-0.4.0 node-respawn legacy value
 * `migrateNodeRespawnModes.js` handles — do not conflate them.
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
    // Only the one legacy value; already-`overTime`, `none` or no regen block is left as-is.
    if (!regen || typeof regen !== 'object' || regen.policy !== 'elapsedTime') continue;

    const economy = system.economy;
    const stamina = economy.stamina;
    systems[systemId] = {
      ...system,
      economy: {
        ...economy,
        stamina: {
          ...stamina,
          regen: { ...regen, policy: 'overTime' },
        },
      },
    };
    systemsChanged = true;
  }

  return {
    gatheringConfig: systemsChanged ? { ...gatheringConfig, systems } : gatheringConfig,
  };
}

/**
 * `0.3.0` — replace the per-environment `economyMode` with a per-system limitation mode under
 * `gatheringConfig.systems[systemId].economy`, and drop the unused per-task `attemptLimit`.
 * Pure and idempotent: a legacy non-`time` environment mode seeds the owning system's mode, but only
 * while that is still the default `none`.
 */

const LEGACY_MODE_MAP = Object.freeze({
  time: 'none',
  nodes: 'nodes',
  stamina: 'stamina',
  hybrid: 'stamina',
});

function defaultEconomy(mode = 'none') {
  return {
    mode,
    stamina: {
      max: '',
      start: '',
      regen: { policy: 'none', unit: 'hours', amount: '', lastRoll: null },
    },
  };
}

export function migrateGatheringEconomy(gatheringConfig = {}, environments = []) {
  const envs = Array.isArray(environments) ? environments : [];

  // First non-`time` legacy value wins for a given system.
  const legacyModeBySystem = {};
  for (const env of envs) {
    const legacy = env?.economyMode;
    const mapped = legacy ? LEGACY_MODE_MAP[legacy] : undefined;
    if (
      mapped &&
      mapped !== 'none' &&
      env?.craftingSystemId &&
      !legacyModeBySystem[env.craftingSystemId]
    ) {
      legacyModeBySystem[env.craftingSystemId] = mapped;
    }
  }

  // Only where a legacy mode must be preserved, so a default-`time` world sees no config churn.
  const systems = { ...gatheringConfig?.systems };
  let systemsChanged = false;
  for (const [systemId, desiredMode] of Object.entries(legacyModeBySystem)) {
    const system = systems[systemId];
    if (!system) {
      systems[systemId] = { economy: defaultEconomy(desiredMode) };
      systemsChanged = true;
    } else if (!system.economy) {
      systems[systemId] = { ...system, economy: defaultEconomy(desiredMode) };
      systemsChanged = true;
    } else if (!system.economy.mode || system.economy.mode === 'none') {
      systems[systemId] = { ...system, economy: { ...system.economy, mode: desiredMode } };
      systemsChanged = true;
    }
  }

  // Strip the removed fields from every environment and task.
  const nextEnvironments = envs.map((env) => {
    if (!env || typeof env !== 'object') return env;
    const { economyMode, ...restEnv } = env;
    const tasks = Array.isArray(env.tasks)
      ? env.tasks.map((task) => {
          if (!task || typeof task !== 'object' || !('attemptLimit' in task)) return task;
          const { attemptLimit, ...restTask } = task;
          return restTask;
        })
      : env.tasks;
    return { ...restEnv, tasks };
  });

  return {
    gatheringConfig: systemsChanged ? { ...gatheringConfig, systems } : gatheringConfig,
    environments: nextEnvironments,
  };
}

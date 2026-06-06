/**
 * 0.3.0 migration — system-level gathering economy modes.
 *
 * The gathering attempt-limitation feature replaces the legacy per-environment
 * `economyMode` field (`time|nodes|stamina|hybrid`) with a per-crafting-system
 * limitation mode (`none|stamina|nodes`) stored under
 * `gatheringConfig.systems[systemId].economy`, and removes the unused
 * per-task `attemptLimit` scaffold.
 *
 * This migration is pure and idempotent: it strips the removed fields and, when
 * an environment still carries a legacy non-`time` economyMode, preserves that
 * intent by seeding the owning system's economy mode (only while it is still
 * the default `none`).
 */

const LEGACY_MODE_MAP = Object.freeze({ time: 'none', nodes: 'nodes', stamina: 'stamina', hybrid: 'stamina' });

function defaultEconomy(mode = 'none') {
  return {
    mode,
    stamina: { max: '', start: '', regen: { policy: 'none', unit: 'hours', amount: '', lastRoll: null } }
  };
}

/**
 * @param {object} gatheringConfig Raw gathering config setting.
 * @param {Array<object>} environments Raw gathering environments setting.
 * @returns {{gatheringConfig: object, environments: Array<object>}}
 */
export function migrateGatheringEconomy(gatheringConfig = {}, environments = []) {
  const envs = Array.isArray(environments) ? environments : [];

  // Derive a desired non-default mode per system from legacy env economyMode
  // (first non-`time` value wins for a given system).
  const legacyModeBySystem = {};
  for (const env of envs) {
    const legacy = env?.economyMode;
    const mapped = legacy ? LEGACY_MODE_MAP[legacy] : undefined;
    if (mapped && mapped !== 'none' && env?.craftingSystemId && !legacyModeBySystem[env.craftingSystemId]) {
      legacyModeBySystem[env.craftingSystemId] = mapped;
    }
  }

  // Seed/update economy only where a legacy mode must be preserved, so worlds
  // with the default `time` economy see no config churn.
  const systems = { ...(gatheringConfig?.systems || {}) };
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
  const nextEnvironments = envs.map(env => {
    if (!env || typeof env !== 'object') return env;
    const { economyMode, ...restEnv } = env;
    const tasks = Array.isArray(env.tasks)
      ? env.tasks.map(task => {
          if (!task || typeof task !== 'object' || !('attemptLimit' in task)) return task;
          const { attemptLimit, ...restTask } = task;
          return restTask;
        })
      : env.tasks;
    return { ...restEnv, tasks };
  });

  return {
    gatheringConfig: systemsChanged ? { ...gatheringConfig, systems } : gatheringConfig,
    environments: nextEnvironments
  };
}

/**
 * 0.5.0 migration — convert resource-node respawn intervals from a raw
 * `intervalSeconds` to `intervalUnit` + `intervalAmount`.
 *
 * Older nodes stored the respawn interval as a single seconds count, computed at
 * edit time from an Earth-calendar unit table (days = 86400s, weeks = 604800s).
 * That baked the calendar's day length into persisted data, so "per day"/"per
 * week" respawn drifted on custom (non-24h-day / non-7-day-week) calendars. The
 * new schema stores the authored intent — `intervalUnit` (minutes|hours|days|
 * weeks) + `intervalAmount` — and resolves seconds against the active world
 * calendar at runtime.
 *
 * Conversion is exact for the values the old editor could produce: it picks the
 * largest whole Earth unit that divides the stored seconds evenly (the same
 * heuristic the editor used to display them), falling back to fractional hours.
 * Because legacy seconds were authored with the Earth table, this reproduces the
 * original unit+amount with no visible drift on migration day.
 *
 * Respawn config lives in three places, all migrated here:
 *   - library tasks:        `gatheringConfig.systems[sid].tasks[].nodes.respawn`
 *   - inline env tasks:     `environments[].tasks[].nodes.respawn`
 *   - per-env runtime state:`environments[].nodeRuntime[taskId].respawn`
 *
 * Pure, idempotent, and shape-preserving: a respawn already carrying
 * `intervalUnit`, or with no `intervalSeconds` to convert, is returned by
 * reference, so re-running is a no-op and worlds with no node respawn config see
 * zero churn.
 */

const SECONDS_PER_UNIT = Object.freeze({ minutes: 60, hours: 3600, days: 86400, weeks: 604800 });

/**
 * Express a seconds count as `{intervalUnit, intervalAmount}`, preferring the
 * largest whole unit that divides evenly, else fractional hours.
 *
 * @param {number} seconds
 * @returns {{intervalUnit: string, intervalAmount: number}}
 */
function secondsToUnitAmount(seconds) {
  const total = Number(seconds) || 0;
  for (const unit of ['weeks', 'days', 'hours', 'minutes']) {
    const size = SECONDS_PER_UNIT[unit];
    if (total > 0 && total % size === 0) return { intervalUnit: unit, intervalAmount: total / size };
  }
  return { intervalUnit: 'hours', intervalAmount: total ? total / SECONDS_PER_UNIT.hours : 0 };
}

function migrateRespawn(respawn) {
  if (!respawn || typeof respawn !== 'object') return respawn;
  // Already on the unit+amount schema → return by reference (idempotent no-op).
  if (respawn.intervalUnit !== undefined) return respawn;
  // Nothing to convert (e.g. a respawn block that never had an interval).
  if (!('intervalSeconds' in respawn)) return respawn;
  const { intervalSeconds, ...rest } = respawn;
  return { ...rest, ...secondsToUnitAmount(intervalSeconds) };
}

function migrateNode(node) {
  const respawn = node?.respawn;
  if (!respawn) return node;
  const migrated = migrateRespawn(respawn);
  return migrated === respawn ? node : { ...node, respawn: migrated };
}

function migrateTask(task) {
  const node = task?.nodes;
  if (!node) return task;
  const migratedNode = migrateNode(node);
  return migratedNode === node ? task : { ...task, nodes: migratedNode };
}

function migrateTasks(tasks) {
  if (!Array.isArray(tasks)) return tasks;
  let changed = false;
  const next = tasks.map(task => {
    const migrated = migrateTask(task);
    if (migrated !== task) changed = true;
    return migrated;
  });
  return changed ? next : tasks;
}

function migrateNodeRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object') return runtime;
  let changed = false;
  const next = {};
  for (const [taskId, node] of Object.entries(runtime)) {
    const migrated = migrateNode(node);
    if (migrated !== node) changed = true;
    next[taskId] = migrated;
  }
  return changed ? next : runtime;
}

/**
 * @param {object} gatheringConfig Raw gathering config setting.
 * @param {Array<object>} environments Raw gathering environments setting.
 * @returns {{gatheringConfig: object, environments: Array<object>}}
 */
export function migrateNodeRespawnIntervals(gatheringConfig = {}, environments = []) {
  // Library tasks under gatheringConfig.systems[sid].tasks.
  const systems = gatheringConfig?.systems;
  let nextConfig = gatheringConfig;
  if (systems && typeof systems === 'object') {
    let systemsChanged = false;
    const nextSystems = {};
    for (const [sid, system] of Object.entries(systems)) {
      const tasks = migrateTasks(system?.tasks);
      if (tasks !== system?.tasks) {
        systemsChanged = true;
        nextSystems[sid] = { ...system, tasks };
      } else {
        nextSystems[sid] = system;
      }
    }
    if (systemsChanged) nextConfig = { ...gatheringConfig, systems: nextSystems };
  }

  // Environment inline tasks + per-environment runtime state.
  const envs = Array.isArray(environments) ? environments : [];
  const nextEnvironments = envs.map(env => {
    if (!env || typeof env !== 'object') return env;
    const tasks = migrateTasks(env.tasks);
    const nodeRuntime = migrateNodeRuntime(env.nodeRuntime);
    if (tasks === env.tasks && nodeRuntime === env.nodeRuntime) return env;
    const nextEnv = { ...env };
    if (tasks !== env.tasks) nextEnv.tasks = tasks;
    if (nodeRuntime !== env.nodeRuntime) nextEnv.nodeRuntime = nodeRuntime;
    return nextEnv;
  });

  return { gatheringConfig: nextConfig, environments: nextEnvironments };
}

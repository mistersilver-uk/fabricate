/**
 * 0.4.0 migration — collapse resource-node respawn policies.
 *
 * Old policies: `none | manual | elapsedTime | probability | manualAndElapsedTime`.
 * New policies: `manual | overTime`, where `overTime` carries a `gainMode`
 * (`guaranteed | chance | expression`). Mapping:
 *   none | undefined       -> manual
 *   manual                 -> manual
 *   elapsedTime            -> overTime + guaranteed
 *   probability            -> overTime + chance
 *   manualAndElapsedTime   -> overTime + chance   (the manual half is dropped;
 *                             GMs still top up counts via the restock API)
 *
 * Respawn config lives in three places, all migrated here:
 *   - library tasks:        `gatheringConfig.systems[sid].tasks[].nodes.respawn`
 *   - inline env tasks:     `environments[].tasks[].nodes.respawn`
 *   - per-env runtime state:`environments[].nodeRuntime[taskId].respawn`
 *
 * Pure, idempotent, and shape-preserving: records already on the new schema (or
 * with no respawn block) are returned by reference, so re-running is a no-op and
 * worlds with no node respawn config see zero churn. The new `gainMode`/
 * `amountExpression` defaults are supplied at read time by `normalizeRespawn`,
 * so this migration only rewrites the `policy` (+ `gainMode` where it changes).
 */

const POLICY_MAP = Object.freeze({
  none: { policy: 'manual' },
  manual: { policy: 'manual' },
  elapsedTime: { policy: 'overTime', gainMode: 'guaranteed' },
  probability: { policy: 'overTime', gainMode: 'chance' },
  manualAndElapsedTime: { policy: 'overTime', gainMode: 'chance' }
});

function migrateRespawn(respawn) {
  if (!respawn || typeof respawn !== 'object') return respawn;
  // Already on the new schema → return by reference (idempotent no-op).
  if (respawn.policy === 'manual' || respawn.policy === 'overTime') return respawn;
  const mapped = POLICY_MAP[respawn.policy] || { policy: 'manual' };
  return { ...respawn, ...mapped };
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
export function migrateNodeRespawnModes(gatheringConfig = {}, environments = []) {
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

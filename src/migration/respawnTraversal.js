/**
 * Shared traversal for resource-node respawn migrations.
 *
 * Respawn config lives in three places, and every node-respawn migration has to
 * walk all three identically, differing only in how a single respawn block is
 * rewritten:
 *   - library tasks:         `gatheringConfig.systems[sid].tasks[].nodes.respawn`
 *   - inline env tasks:      `environments[].tasks[].nodes.respawn`
 *   - per-env runtime state: `environments[].nodeRuntime[taskId].respawn`
 *
 * This factors that walk out so each migration supplies only its per-respawn
 * transform. The traversal is shape-preserving and idempotent: any subtree the
 * transform leaves unchanged (returns by reference) is itself returned by
 * reference, so worlds with no matching respawn config see zero churn.
 */

/**
 * Apply a per-respawn transform across every place node respawn config lives.
 *
 * @param {object} gatheringConfig Raw gathering config setting.
 * @param {Array<object>} environments Raw gathering environments setting.
 * @param {(respawn: object) => object} migrateRespawn Rewrites one respawn
 *   block. MUST return the same reference when nothing changes, so the
 *   traversal can preserve references upstream.
 * @returns {{gatheringConfig: object, environments: Array<object>}}
 */
export function migrateNodeRespawnConfig(gatheringConfig = {}, environments = [], migrateRespawn) {
  const migrateNode = (node) => {
    const respawn = node?.respawn;
    if (!respawn) return node;
    const migrated = migrateRespawn(respawn);
    return migrated === respawn ? node : { ...node, respawn: migrated };
  };

  const migrateTask = (task) => {
    const node = task?.nodes;
    if (!node) return task;
    const migratedNode = migrateNode(node);
    return migratedNode === node ? task : { ...task, nodes: migratedNode };
  };

  const migrateTasks = (tasks) => {
    if (!Array.isArray(tasks)) return tasks;
    let changed = false;
    const next = tasks.map((task) => {
      const migrated = migrateTask(task);
      if (migrated !== task) changed = true;
      return migrated;
    });
    return changed ? next : tasks;
  };

  const migrateNodeRuntime = (runtime) => {
    if (!runtime || typeof runtime !== 'object') return runtime;
    let changed = false;
    const next = {};
    for (const [taskId, node] of Object.entries(runtime)) {
      const migrated = migrateNode(node);
      if (migrated !== node) changed = true;
      next[taskId] = migrated;
    }
    return changed ? next : runtime;
  };

  // Library tasks under gatheringConfig.systems[sid].tasks.
  const systems = gatheringConfig?.systems;
  let nextConfig = gatheringConfig;
  if (systems && typeof systems === 'object') {
    let systemsChanged = false;
    const nextSystems = {};
    for (const [sid, system] of Object.entries(systems)) {
      const tasks = migrateTasks(system?.tasks);
      if (tasks === system?.tasks) {
        nextSystems[sid] = system;
      } else {
        systemsChanged = true;
        nextSystems[sid] = { ...system, tasks };
      }
    }
    if (systemsChanged) nextConfig = { ...gatheringConfig, systems: nextSystems };
  }

  // Environment inline tasks + per-environment runtime state.
  const envs = Array.isArray(environments) ? environments : [];
  const nextEnvironments = envs.map((env) => {
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

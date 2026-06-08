/**
 * Pure scoping predicate for the session-scoped per-token node-state override.
 *
 * When a player double-clicks a gathering-task token, the token's node adapter
 * is injected into the Fabricate app and scoped to exactly ONE environment+task.
 * The attempt service (`nodeStateOverrideFor`) and the listing service must only
 * apply that override to its OWN env+task — a token's node must never leak into
 * any OTHER environment/task. This is the single source of truth for that
 * decision (factored out of `SvelteFabricateApp._buildServices` so it is
 * directly unit-testable without constructing the Foundry application).
 *
 * @param {object} args
 * @param {object|null} args.override The per-token node adapter, or null.
 * @param {string|null} args.scopedEnvironmentId The session's scoped environment id.
 * @param {string|null} args.scopedTaskId The session's scoped task id.
 * @param {string|null} [args.environmentId] The env id being evaluated (defaults
 *   to the scoped env when omitted — the gathering tab's own scoped session).
 * @param {string|null} [args.taskId] The task id being evaluated (defaults to the
 *   scoped task when omitted).
 * @returns {object|null} The override when (and only when) the evaluated env+task
 *   match the scoped env+task; otherwise null (inert).
 */
export function scopeNodeStateOverride({
  override = null,
  scopedEnvironmentId = null,
  scopedTaskId = null,
  environmentId,
  taskId
} = {}) {
  if (!override) return null;
  const env = environmentId ?? scopedEnvironmentId;
  const task = taskId ?? scopedTaskId;
  if (env && task && env === scopedEnvironmentId && task === scopedTaskId) {
    return override;
  }
  return null;
}

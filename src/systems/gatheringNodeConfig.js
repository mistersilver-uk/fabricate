/**
 * Canonical normalizers for gathering resource-node config/state.
 *
 * A "node" object is both config and runtime state:
 *   { enabled, max, current, depletionTiming, respawn: { policy, intervalSeconds,
 *     chance, lastEvaluatedWorldTime, nextEvaluationWorldTime, lastRoll }, showCountsToPlayers? }
 *
 * Library tasks carry node CONFIG; each environment keeps its own runtime STATE
 * (the `current` count + respawn timers) under `environment.nodeRuntime[taskId]`,
 * so the same task depletes independently per environment. Shared here so the
 * environment store, the rich-state runtime, and the admin UI store all agree.
 */

export const VALID_DEPLETION_TIMINGS = new Set(['onStart', 'onSuccess']);
export const VALID_RESPAWN_POLICIES = new Set(['none', 'manual', 'elapsedTime', 'probability', 'manualAndElapsedTime']);

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Normalize a node respawn block. Unknown policies fall back to `none`.
 *
 * @param {object|null} data
 * @returns {object}
 */
export function normalizeRespawn(data = null) {
  if (!data || typeof data !== 'object') return { policy: 'none' };
  const policy = VALID_RESPAWN_POLICIES.has(data.policy) ? data.policy : 'none';
  const intervalSeconds = numberOrNull(data.intervalSeconds);
  const chance = numberOrNull(data.chance);
  return {
    policy,
    intervalSeconds: intervalSeconds ?? 0,
    chance: chance ?? 0,
    lastEvaluatedWorldTime: numberOrNull(data.lastEvaluatedWorldTime),
    nextEvaluationWorldTime: numberOrNull(data.nextEvaluationWorldTime),
    lastRoll: data.lastRoll && typeof data.lastRoll === 'object' ? cloneJson(data.lastRoll) : null
  };
}

/**
 * Normalize a node config/state object, or `null` when there is no node config.
 * Preserves a stored `current` verbatim (callers seed `current = max` when first
 * materializing a pool; this never resets an in-progress count).
 *
 * @param {object|null} data
 * @returns {object|null}
 */
export function normalizeNodeConfig(data = null) {
  if (!data || typeof data !== 'object') return null;
  const max = numberOrNull(data.max ?? data.maxCount);
  const current = numberOrNull(data.current ?? data.availableCount);
  const config = {
    enabled: data.enabled === true || max !== null || current !== null,
    max: max ?? 0,
    current: current ?? max ?? 0,
    depletionTiming: VALID_DEPLETION_TIMINGS.has(data.depletionTiming) ? data.depletionTiming : 'onStart',
    respawn: normalizeRespawn(data.respawn)
  };
  if (data.showCountsToPlayers === true) config.showCountsToPlayers = true;
  return config.enabled ? config : null;
}

/**
 * Normalize a per-environment node runtime map (taskId → node object). Drops
 * entries that don't resolve to a node config.
 *
 * @param {object|null} data
 * @returns {Record<string, object>}
 */
export function normalizeNodeRuntime(data = null) {
  if (!data || typeof data !== 'object') return {};
  const out = {};
  for (const [taskId, value] of Object.entries(data)) {
    const node = normalizeNodeConfig(value);
    if (node) out[String(taskId)] = node;
  }
  return out;
}

/**
 * Canonical normalizers for gathering resource-node config/state.
 *
 * A "node" object is both config and runtime state:
 *   { enabled, max, current, depletionTiming, respawn: { policy, intervalUnit,
 *     intervalAmount, gainMode, chance, amountExpression, lastEvaluatedWorldTime,
 *     nextEvaluationWorldTime, lastRoll }, showCountsToPlayers? }
 *
 * Respawn interval is stored as `intervalUnit` (minutes|hours|days|weeks) +
 * `intervalAmount` so day/week lengths resolve against the active Foundry world
 * calendar at runtime. Nodes persisted before this schema carry a raw
 * `intervalSeconds` instead; that legacy field is preserved by `normalizeRespawn`
 * and honored by the runtime until the node-interval migration rewrites it.
 *
 * Respawn `policy` is one of `manual` (no automatic respawn — the GM tops up
 * counts via the restock API) or `overTime` (one evaluation per elapsed
 * interval). For `overTime`, `gainMode` selects the per-interval node gain:
 * `guaranteed` (+1), `chance` (a 0-1 probability of +1), or `expression`
 * (roll `amountExpression`, e.g. `1d4`, and add the rolled total).
 *
 * Library tasks carry node CONFIG; each environment keeps its own runtime STATE
 * (the `current` count + respawn timers) under `environment.nodeRuntime[taskId]`,
 * so the same task depletes independently per environment. Shared here so the
 * environment store, the rich-state runtime, and the admin UI store all agree.
 */

export const VALID_DEPLETION_TIMINGS = new Set(['onStart', 'onSuccess']);
export const VALID_RESPAWN_POLICIES = new Set(['manual', 'overTime']);
export const VALID_RESPAWN_GAIN_MODES = new Set(['guaranteed', 'chance', 'expression']);
export const VALID_RESPAWN_UNITS = new Set(['minutes', 'hours', 'days', 'weeks']);

// Pre-0.4.0 respawn policies mapped onto the manual|overTime + gainMode schema.
// The 0.4.0 migration rewrites these in persisted data, but normalization applies
// the same mapping at read time so a world whose node data was never migrated
// (e.g. a stale migrationVersion) still respawns instead of silently coercing to
// `manual` and never firing. Mirrors POLICY_MAP in migrateNodeRespawnModes.js.
const LEGACY_RESPAWN_POLICY_MAP = Object.freeze({
  none: { policy: 'manual' },
  elapsedTime: { policy: 'overTime', gainMode: 'guaranteed' },
  probability: { policy: 'overTime', gainMode: 'chance' },
  manualAndElapsedTime: { policy: 'overTime', gainMode: 'chance' }
});

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Normalize a node respawn block. Unknown policies fall back to `manual`;
 * unknown gain modes fall back to `guaranteed`. Legacy auto-respawn policies
 * (`elapsedTime`/`probability`/`manualAndElapsedTime`) are mapped to the current
 * `overTime` schema here at read time (mirroring the 0.4.0 migration), so a world
 * whose node data was never migrated still respawns instead of silently degrading
 * to `manual`; `none` and unknown values fall back to `manual`.
 *
 * The respawn interval is stored as `intervalUnit` + `intervalAmount` so day/week
 * lengths resolve against the active world calendar at runtime. A node that still
 * carries only a legacy raw `intervalSeconds` (pre-unit/amount schema) keeps that
 * field — the runtime honors it as a fallback — until the node-interval migration
 * rewrites it to unit+amount.
 *
 * @param {object|null} data
 * @returns {object}
 */
export function normalizeRespawn(data = null) {
  if (!data || typeof data !== 'object') return { policy: 'manual' };
  // Resilient to legacy (pre-0.4.0) policies even when the migration never ran:
  // map them to the current schema rather than silently coercing to `manual`
  // (which would disable respawn). An unknown policy still falls back to manual.
  const legacy = LEGACY_RESPAWN_POLICY_MAP[data.policy];
  const policy = VALID_RESPAWN_POLICIES.has(data.policy) ? data.policy : (legacy?.policy ?? 'manual');
  const gainMode = VALID_RESPAWN_GAIN_MODES.has(data.gainMode) ? data.gainMode : (legacy?.gainMode ?? 'guaranteed');
  const chance = numberOrNull(data.chance);
  const amountExpression = typeof data.amountExpression === 'string' ? data.amountExpression.trim() : '';
  const base = {
    policy,
    gainMode,
    chance: chance ?? 0,
    amountExpression,
    lastEvaluatedWorldTime: numberOrNull(data.lastEvaluatedWorldTime),
    nextEvaluationWorldTime: numberOrNull(data.nextEvaluationWorldTime),
    lastRoll: data.lastRoll && typeof data.lastRoll === 'object' ? cloneJson(data.lastRoll) : null
  };
  // Prefer the unit+amount schema; fall back to a legacy raw `intervalSeconds`
  // only when neither unit field is present (so un-migrated nodes keep working).
  if (data.intervalUnit !== undefined || data.intervalAmount !== undefined) {
    const intervalUnit = VALID_RESPAWN_UNITS.has(data.intervalUnit) ? data.intervalUnit : 'hours';
    const intervalAmount = numberOrNull(data.intervalAmount);
    return { ...base, intervalUnit, intervalAmount: intervalAmount ?? 0 };
  }
  return { ...base, intervalSeconds: numberOrNull(data.intervalSeconds) ?? 0 };
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

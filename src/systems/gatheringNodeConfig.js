/**
 * The canonical gathering resource-node normalizers. A node is config and state:
 * `{ enabled, max, current, depletionTiming, respawn, depletedBehavior?, showCountsToPlayers? }`.
 * Library tasks carry the config; each environment keeps its own state in
 * `environment.nodeRuntime[taskId]`, so a task depletes independently per environment. Respawn
 * `policy` is `manual` (GM restock only), `overTime` (per elapsed interval, by `gainMode`
 * `guaranteed`, `chance` or `expression`) or `nonRegenerating` (never regrows or restocks).
 * The interval is `intervalUnit` plus `intervalAmount`, resolved against the world calendar; a
 * legacy `intervalSeconds` is kept until the node-interval migration rewrites it.
 */

import { cloneJson, numberOrNull } from '../utils/scalars.js';

export const VALID_DEPLETION_TIMINGS = new Set(['onStart', 'onSuccess']);
export const VALID_RESPAWN_POLICIES = new Set(['manual', 'overTime', 'nonRegenerating']);
export const VALID_RESPAWN_GAIN_MODES = new Set(['guaranteed', 'chance', 'expression']);
export const VALID_RESPAWN_UNITS = new Set(['minutes', 'hours', 'days', 'weeks']);

// Pre-0.4.0 policies, mapped at read time too, as `POLICY_MAP` in `migrateNodeRespawnModes.js`
// does, so an unmigrated world still respawns rather than coercing to `manual`.
const LEGACY_RESPAWN_POLICY_MAP = Object.freeze({
  none: { policy: 'manual' },
  elapsedTime: { policy: 'overTime', gainMode: 'guaranteed' },
  probability: { policy: 'overTime', gainMode: 'chance' },
  manualAndElapsedTime: { policy: 'overTime', gainMode: 'chance' },
});

/** A respawn block; an unknown policy is `manual` and an unknown gain mode `guaranteed`. */
export function normalizeRespawn(data = null) {
  if (!data || typeof data !== 'object') return { policy: 'manual' };
  const legacy = LEGACY_RESPAWN_POLICY_MAP[data.policy];
  const policy = VALID_RESPAWN_POLICIES.has(data.policy)
    ? data.policy
    : (legacy?.policy ?? 'manual');
  // A pool that never regrows carries none of the timing or gain fields.
  if (policy === 'nonRegenerating') return { policy: 'nonRegenerating' };
  const gainMode = VALID_RESPAWN_GAIN_MODES.has(data.gainMode)
    ? data.gainMode
    : (legacy?.gainMode ?? 'guaranteed');
  const chance = numberOrNull(data.chance);
  const amountExpression =
    typeof data.amountExpression === 'string' ? data.amountExpression.trim() : '';
  const base = {
    policy,
    gainMode,
    chance: chance ?? 0,
    amountExpression,
    lastEvaluatedWorldTime: numberOrNull(data.lastEvaluatedWorldTime),
    nextEvaluationWorldTime: numberOrNull(data.nextEvaluationWorldTime),
    lastRoll: data.lastRoll && typeof data.lastRoll === 'object' ? cloneJson(data.lastRoll) : null,
  };
  // The legacy `intervalSeconds` only when neither unit field is present.
  if (data.intervalUnit !== undefined || data.intervalAmount !== undefined) {
    const intervalUnit = VALID_RESPAWN_UNITS.has(data.intervalUnit) ? data.intervalUnit : 'hours';
    const intervalAmount = numberOrNull(data.intervalAmount);
    return { ...base, intervalUnit, intervalAmount: intervalAmount ?? 0 };
  }
  return { ...base, intervalSeconds: numberOrNull(data.intervalSeconds) ?? 0 };
}

function trimmedOrNull(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * What a placed interactable's linked marker does while its node is depleted, or `null` for
 * nothing: `swapImage` retextures a Tile until respawn, and `postfixName` labels a Drawing
 * "(depleted)". Unrelated to `depletionTiming`, which is when a node decrements.
 */
export function normalizeDepletedBehavior(data = null) {
  if (!data || typeof data !== 'object') return null;

  const behavior = {};
  const swapImage = trimmedOrNull(data.swapImage);
  if (swapImage) behavior.swapImage = swapImage;
  if (data.postfixName === true) behavior.postfixName = true;
  return Object.keys(behavior).length > 0 ? behavior : null;
}

/** A node, or `null` when there is none; a stored `current` is kept, never reset. */
export function normalizeNodeConfig(data = null) {
  if (!data || typeof data !== 'object') return null;
  const max = numberOrNull(data.max ?? data.maxCount);
  const current = numberOrNull(data.current ?? data.availableCount);
  const config = {
    enabled: data.enabled === true || max !== null || current !== null,
    max: max ?? 0,
    current: current ?? max ?? 0,
    depletionTiming: VALID_DEPLETION_TIMINGS.has(data.depletionTiming)
      ? data.depletionTiming
      : 'onStart',
    respawn: normalizeRespawn(data.respawn),
  };
  if (data.showCountsToPlayers === true) config.showCountsToPlayers = true;
  const depletedBehavior = normalizeDepletedBehavior(data.depletedBehavior);
  if (depletedBehavior) config.depletedBehavior = depletedBehavior;
  return config.enabled ? config : null;
}

/**
 * Consume one unit without mutating the input, clamping `current` into `[0, max]`; a missing
 * `max` means no cap, never zero. An `overTime` pool's first depletion seeds its anchor at
 * `worldTime`, or the first advance would only re-anchor. The acting client and the GM applier
 * (`gatheringNodeSocket.js`) share it.
 */
export function depleteNodeOnce(node, { worldTime = 0 } = {}) {
  if (!node || typeof node !== 'object') return null;
  const max = numberOrNull(node.max);
  const decremented = Math.max(0, Number(node.current || 0) - 1);
  const current = max === null ? decremented : Math.min(max, decremented);
  const next = { ...cloneJson(node), current };
  if (next.respawn?.policy === 'overTime' && next.respawn.lastEvaluatedWorldTime == null) {
    next.respawn = {
      ...next.respawn,
      lastEvaluatedWorldTime: Number(worldTime) || 0,
    };
  }
  return next;
}

/** A per-environment `taskId` to node map, dropping entries that are not nodes. */
export function normalizeNodeRuntime(data = null) {
  if (!data || typeof data !== 'object') return {};
  const out = {};
  for (const [taskId, value] of Object.entries(data)) {
    const node = normalizeNodeConfig(value);
    if (node) out[String(taskId)] = node;
  }
  return out;
}

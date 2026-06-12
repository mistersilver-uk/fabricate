/**
 * Pure, Foundry-free resource-node depletion + respawn math.
 *
 * `GatheringRichStateService._respawnNode` owns the per-ENVIRONMENT respawn pass
 * (with its history hooks and per-environment persistence). The region node
 * adapter (`src/canvas/regions/interactableRegionNodeAdapter.js`) needs the same
 * calendar-aware interval + gain arithmetic without those Foundry-bound side
 * effects, so the
 * arithmetic is factored here as injectable pure functions: the calendar
 * (`secondsPerUnit`) and the random sources (`rollChance` / `rollExpression`) are
 * passed in, so the whole thing is unit-testable with deterministic fakes and no
 * `game.*` access.
 *
 * The depletion trigger is the single shared definition `node.current <= 0`
 * (mirrored by both the count logic and the depleted-visual apply in later
 * phases): see {@link isNodeDepleted}.
 */

/**
 * Whether a node is depleted. One shared definition used by the count logic and
 * (Phase 6) the depleted-visual apply: a node is depleted when its current count
 * is at or below zero.
 *
 * @param {object|null} node Normalized node object (`{ current, ... }`).
 * @returns {boolean}
 */
export function isNodeDepleted(node) {
  if (!node || typeof node !== 'object') return false;
  return Number(node.current || 0) <= 0;
}

/**
 * Resolve the respawn interval length in seconds from a normalized respawn block,
 * using the injected calendar seam for day/week lengths. Falls back to a legacy
 * raw `intervalSeconds` for nodes persisted before the unit+amount schema.
 *
 * @param {object|null} respawn Normalized respawn block.
 * @param {(unit: string) => number} secondsPerUnit Calendar seam.
 * @returns {number} Non-negative seconds; 0 when not resolvable.
 */
export function respawnIntervalSeconds(respawn, secondsPerUnit) {
  if (!respawn || typeof respawn !== 'object') return 0;
  if (respawn.intervalUnit) {
    const per = Number(secondsPerUnit?.(respawn.intervalUnit));
    const safe = per > 0 ? per : 3600;
    return Math.max(0, Number(respawn.intervalAmount || 0) * safe);
  }
  return Math.max(0, Number(respawn.intervalSeconds || 0));
}

/**
 * Compute one respawn step for a node as world time passes (`overTime` policy
 * only), returning the next node object and whether it changed. Pure: the
 * calendar and randomness are injected.
 *
 * Mirrors the per-interval gain semantics of the environment respawn pass:
 *  - `guaranteed`  → +1 per elapsed interval
 *  - `chance`      → roll per interval (`rollChance(chance)` → the RAW d100-style
 *                    roll, 1..100; the math compares `roll <= chance*100` and
 *                    persists the raw roll in `lastRoll.rolls` — IDENTICAL to the
 *                    authoritative per-environment respawn path)
 *  - `expression`  → roll per interval (`rollExpression(expr)` → integer)
 * clamped to `node.max`, advancing the `respawn.lastEvaluatedWorldTime` anchor by
 * the consumed intervals so a same-tick refresh never re-rolls. World time that
 * stands still or runs backwards only re-anchors (never gains).
 *
 * @param {object} node Normalized node object (config + state).
 * @param {object} ctx
 * @param {number} ctx.now Current world time (seconds).
 * @param {(unit: string) => number} ctx.secondsPerUnit Calendar seam.
 * @param {(chance: number) => number} [ctx.rollChance] Per-interval chance roll:
 *   returns the raw 1..100 roll (a hit is `roll <= chance*100`).
 * @param {(expression: string) => number} [ctx.rollExpression] Per-interval dice roll.
 * @returns {{ changed: boolean, node: object }}
 */
export function respawnNodeOnce(node, { now, secondsPerUnit, rollChance, rollExpression } = {}) {
  const respawn = node?.respawn;
  if (!node || !respawn || respawn.policy !== 'overTime') {
    return { changed: false, node };
  }
  const interval = respawnIntervalSeconds(respawn, secondsPerUnit);
  if (!(interval > 0)) return { changed: false, node };
  const nowTime = Number(now);
  if (!Number.isFinite(nowTime)) return { changed: false, node };
  const last = Number.isFinite(Number(respawn.lastEvaluatedWorldTime))
    ? Number(respawn.lastEvaluatedWorldTime)
    : nowTime;

  // World time stood still or ran backwards: re-anchor, never regenerate.
  if (nowTime <= last) {
    if (respawn.lastEvaluatedWorldTime !== nowTime) {
      return {
        changed: true,
        node: { ...node, respawn: { ...respawn, lastEvaluatedWorldTime: nowTime } },
      };
    }
    return { changed: false, node };
  }

  const max = Number(node.max || 0);
  const before = Number(node.current || 0);
  let intervals = Math.floor((nowTime - last) / interval);
  if (intervals <= 0) return { changed: false, node };
  const room = Math.max(0, max - before);
  const advancedAnchor = last + intervals * interval;
  if (room === 0) {
    return {
      changed: true,
      node: { ...node, respawn: { ...respawn, lastEvaluatedWorldTime: advancedAnchor } },
    };
  }
  intervals = Math.min(intervals, room); // bound stochastic loops to needed restocks

  const gainMode = respawn.gainMode || 'guaranteed';
  let gain = 0;
  let lastRoll = respawn.lastRoll;
  if (gainMode === 'guaranteed') {
    gain = intervals;
  } else if (gainMode === 'chance') {
    const chance = Math.max(0, Math.min(1, Number(respawn.chance || 0)));
    const rolls = [];
    for (let i = 0; i < intervals; i++) {
      // The chance seam returns the RAW 1..100 roll; persist it (matching the
      // authoritative env path's `lastRoll.rolls`) and hit on `roll <= chance*100`.
      const roll =
        typeof rollChance === 'function' ? Number(rollChance(chance)) : Number.POSITIVE_INFINITY;
      rolls.push(roll);
      if (roll <= chance * 100) gain += 1;
    }
    lastRoll = { worldTime: nowTime, chance, rolls };
  } else {
    const rolls = [];
    for (let i = 0; i < intervals; i++) {
      const amount =
        typeof rollExpression === 'function'
          ? Math.max(0, Math.round(Number(rollExpression(respawn.amountExpression)) || 0))
          : 0;
      rolls.push(amount);
      gain += amount;
      if (before + gain >= max) break;
    }
    lastRoll = { worldTime: nowTime, expression: String(respawn.amountExpression || ''), rolls };
  }
  const nextCurrent = Math.min(max, before + gain);
  return {
    changed: true,
    node: {
      ...node,
      current: nextCurrent,
      respawn: { ...respawn, lastEvaluatedWorldTime: advancedAnchor, lastRoll },
    },
  };
}

/**
 * Compute the world time at which a depleted/under-cap node next gains, for the
 * player-facing respawn ETA. Returns `null` when the node will never respawn
 * automatically (manual policy, no interval, or already at max).
 *
 * @param {object|null} node Normalized node object.
 * @param {(unit: string) => number} secondsPerUnit Calendar seam.
 * @param {number} now Current world time (seconds).
 * @returns {{ nextWorldTime: number, secondsUntil: number } | null}
 */
export function nextRespawnEta(node, secondsPerUnit, now) {
  const respawn = node?.respawn;
  if (!node || !respawn || respawn.policy !== 'overTime') return null;
  if (Number(node.current || 0) >= Number(node.max || 0)) return null;
  const interval = respawnIntervalSeconds(respawn, secondsPerUnit);
  if (!(interval > 0)) return null;
  const nowTime = Number(now);
  if (!Number.isFinite(nowTime)) return null;
  const last = Number.isFinite(Number(respawn.lastEvaluatedWorldTime))
    ? Number(respawn.lastEvaluatedWorldTime)
    : nowTime;
  // Next anchor strictly after `now`.
  const elapsed = Math.max(0, nowTime - last);
  const wholeIntervals = Math.floor(elapsed / interval) + 1;
  const nextWorldTime = last + wholeIntervals * interval;
  return { nextWorldTime, secondsUntil: Math.max(0, nextWorldTime - nowTime) };
}

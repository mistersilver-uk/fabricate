/**
 * Pure, Foundry-free resource-node depletion and respawn arithmetic, shared by
 * `GatheringNodeService` and the region node adapter
 * (`src/canvas/regions/interactableRegionNodeAdapter.js`). The calendar (`secondsPerUnit`) and
 * the random sources (`rollChance`, `rollExpression`) are injected.
 */

/** The one depletion definition: `current` at or below zero. */
export function isNodeDepleted(node) {
  if (!node || typeof node !== 'object') return false;
  return Number(node.current || 0) <= 0;
}

/**
 * Whether the accrual anchor `respawn.lastEvaluatedWorldTime` is absent, so it is seeded at `now`
 * rather than read. Nullish because `Number(null)` is a finite 0, non-finite so garbage never
 * yields `NaN`; every site doing anchor arithmetic uses it (issues 403, 896).
 * `commitAcceptedAttempt` only seeds the anchor, so its `== null` test is benign. An empty string
 * still reads as epoch 0.
 */
export function isAccrualAnchorAbsent(storedAnchor) {
  return storedAnchor == null || !Number.isFinite(Number(storedAnchor));
}

/** The anchor to measure from, `now` when absent so the seeding tick accrues nothing. */
export function resolveAccrualAnchor(storedAnchor, now) {
  return isAccrualAnchorAbsent(storedAnchor) ? Number(now) : Number(storedAnchor);
}

/**
 * The interval in seconds through the calendar seam, falling back to a legacy `intervalSeconds`
 * for nodes predating the unit and amount schema; 0 when unresolvable.
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
 * One `overTime` respawn step, answering `{ changed, node }`. Per elapsed interval, `guaranteed`
 * adds 1, `chance` hits on a raw 1..100 `rollChance` at most `chance*100` (rolls persisted in
 * `lastRoll`), and `expression` adds `rollExpression`'s integer, clamped to `max`. The anchor is a
 * monotonic accrual high-water mark (issue 403): absent seeds at `now`, and time running backwards
 * freezes with no write, so the anchor may sit ahead of `now`.
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
  // Before the backward comparison, which a `null` anchor coerced to 0 would pass.
  const storedAnchor = respawn.lastEvaluatedWorldTime;
  if (isAccrualAnchorAbsent(storedAnchor)) {
    return {
      changed: true,
      node: { ...node, respawn: { ...respawn, lastEvaluatedWorldTime: nowTime } },
    };
  }
  const last = Number(storedAnchor);

  // A re-anchor on a rewind would re-grant every interval on the way forward.
  if (nowTime <= last) return { changed: false, node };

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
      const roll = typeof rollChance === 'function' ? Number(rollChance(chance)) : Infinity;
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
 * The player-facing respawn ETA, `{ nextWorldTime, secondsUntil }`, or `null` for a pool that
 * never respawns on its own (manual, no interval, or full).
 */
export function nextRespawnEta(node, secondsPerUnit, now) {
  const respawn = node?.respawn;
  if (!node || !respawn || respawn.policy !== 'overTime') return null;
  if (Number(node.current || 0) >= Number(node.max || 0)) return null;
  const interval = respawnIntervalSeconds(respawn, secondsPerUnit);
  if (!(interval > 0)) return null;
  const nowTime = Number(now);
  if (!Number.isFinite(nowTime)) return null;
  // An absent anchor is `now` (issue 896); the clamps allow an anchor ahead of `now` after a
  // rewind, which is what the frozen pool does.
  const last = resolveAccrualAnchor(respawn.lastEvaluatedWorldTime, nowTime);
  // Next anchor strictly after `now`.
  const elapsed = Math.max(0, nowTime - last);
  const wholeIntervals = Math.floor(elapsed / interval) + 1;
  const nextWorldTime = last + wholeIntervals * interval;
  return { nextWorldTime, secondsUntil: Math.max(0, nextWorldTime - nowTime) };
}

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
 * Whether a pool's accrual anchor (`respawn.lastEvaluatedWorldTime`) is ABSENT —
 * i.e. the pool has never been evaluated, so it must be seeded at `now` rather
 * than read as anchored at some past instant.
 *
 * ONE shared definition for every site that does anchor ARITHMETIC (issues 403,
 * 896): the respawn step below, {@link nextRespawnEta}, and the two expression
 * pre-roll bounds in `GatheringNodeService` (`_respawnNode` and
 * `respawnInteractableNode`).
 *
 * It deliberately does NOT cover `commitAcceptedAttempt`
 * (`src/systems/GatheringRichStateService.js`), which tests `== null` alone. That
 * site is a seed WRITER, not an arithmetic read: it stamps the anchor at
 * depletion time so the first world-time advance gains instead of only
 * re-anchoring, and a non-finite anchor there is simply seeded one tick later by
 * this predicate's own seed branch. Benign, so it is recorded rather than
 * changed. (Note that file carries a raw NUL byte in a string literal, so plain
 * `grep` reports it as binary and prints no matches — use `grep -a`.)
 *
 * The predicate is nullish OR non-finite, and both halves are load-bearing:
 *  - the nullish half, because `normalizeRespawn` emits `null` for an unevaluated
 *    pool and `Number(null) === 0` is FINITE, so a laxer `Number.isFinite(...)`
 *    test reads that `null` as "anchored at world time 0";
 *  - the finiteness half, because it stops a garbage anchor persisting as `NaN`
 *    and yielding a `NaN` count.
 * Keeping the definition in one place is the point: issue 896 was two call sites
 * that kept the laxer form after issue 403 replaced it everywhere else.
 *
 * Known limitation, inherited from issue 403 deliberately: `Number('') === 0` is
 * finite, so an empty-string anchor still resolves to epoch zero.
 *
 * @param {*} storedAnchor The persisted `respawn.lastEvaluatedWorldTime`.
 * @returns {boolean} True when the anchor must be seeded rather than read.
 */
export function isAccrualAnchorAbsent(storedAnchor) {
  return storedAnchor == null || !Number.isFinite(Number(storedAnchor));
}

/**
 * Resolve a pool's accrual anchor for arithmetic, falling back to `now` when the
 * anchor is absent per {@link isAccrualAnchorAbsent} (so no elapsed time accrues
 * on the tick that seeds it).
 *
 * @param {*} storedAnchor The persisted `respawn.lastEvaluatedWorldTime`.
 * @param {number} now Current world time (seconds).
 * @returns {number} The anchor to measure elapsed intervals from.
 */
export function resolveAccrualAnchor(storedAnchor, now) {
  return isAccrualAnchorAbsent(storedAnchor) ? Number(now) : Number(storedAnchor);
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
 * the consumed intervals so a same-tick refresh never re-rolls.
 *
 * `respawn.lastEvaluatedWorldTime` is an ACCRUAL anchor (issue 403): a high-water
 * mark of the entitlement already granted, and therefore monotonic
 * non-decreasing. Three cases, in this order:
 *  - anchor ABSENT (nullish or non-finite) → seed it at `now` and report a change
 *    so the caller persists it. This is a seed, not a re-anchor, and it must be
 *    decided BEFORE the backward comparison: `normalizeRespawn` emits `null` for
 *    an unevaluated pool and `Number(null) === 0` is finite, so a `null` anchor
 *    otherwise reads as "anchored at world time 0" and takes the forward branch
 *    for any `now > 0` — a spurious full restock on first evaluation.
 *  - anchor present and `now < anchor` (world time ran backwards) → FREEZE:
 *    report no change and write nothing, so no persisted state is rewritten and
 *    no clamp rides along on the write. Re-anchoring here would re-grant every
 *    interval between the rewound instant and the anchor on the way forward.
 *  - anchor present and `now === anchor` → nothing to do.
 * A consequence every consumer must tolerate: the anchor may legitimately sit
 * AHEAD of `now`.
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
  // Absent anchor FIRST, ahead of the backward comparison: a `null` anchor (the
  // shape `normalizeRespawn`/`_mergeNodeConfigState` persist for an unevaluated
  // pool) coerces to a finite 0, so it would otherwise take the forward branch.
  const storedAnchor = respawn.lastEvaluatedWorldTime;
  if (isAccrualAnchorAbsent(storedAnchor)) {
    return {
      changed: true,
      node: { ...node, respawn: { ...respawn, lastEvaluatedWorldTime: nowTime } },
    };
  }
  const last = Number(storedAnchor);

  // World time stood still or ran backwards: freeze the accrual anchor and write
  // nothing at all (no gain, no re-anchor, no persisted node state).
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
      // The chance seam returns the RAW 1..100 roll; persist it (matching the
      // authoritative env path's `lastRoll.rolls`) and hit on `roll <= chance*100`.
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
  // An absent anchor resolves to `now` (issue 896): the pool seeds on the next
  // tick and gains a whole interval after that, so the ETA must not count down
  // against an epoch-zero grid. The `Math.max(0, ...)` clamp below is separate
  // and stays: under issue 403's accrual policy the anchor may legitimately sit
  // AHEAD of `now` (a world-time rewind freezes the pool), and the anchor-relative
  // countdown it produces is what the frozen pool actually does.
  const last = resolveAccrualAnchor(respawn.lastEvaluatedWorldTime, nowTime);
  // Next anchor strictly after `now`.
  const elapsed = Math.max(0, nowTime - last);
  const wholeIntervals = Math.floor(elapsed / interval) + 1;
  const nextWorldTime = last + wholeIntervals * interval;
  return { nextWorldTime, secondsUntil: Math.max(0, nextWorldTime - nowTime) };
}

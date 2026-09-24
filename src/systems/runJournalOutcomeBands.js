/**
 * Threshold-band labels for the Journal's routed outcome ladders: the "what a roll has to beat"
 * text beside each tier, for routed gathering and routed crafting.
 */

import { normalizeList, numberOrNull } from './gatheringEngineInternals.js';

/**
 * Band for one routed GATHERING tier. Fixed ladders state their authored range;
 * relative ladders are read against the resolved DC.
 */
export function routedOutcomeBand(outcome, routed, task) {
  if (routed?.type === 'fixed') {
    const start = numberOrNull(outcome?.start) ?? 0;
    const end = numberOrNull(outcome?.end) ?? start;
    return start === end ? String(start) : `${start}–${end}`;
  }
  // Mirrors GatheringEngine._resolveGatheringRoutedDc exactly: a finite task
  // override, then the routed slot's DC, then its canonical legacy fallback.
  const baseDc = numberOrNull(task?.dcOverride) ?? numberOrNull(routed?.dc) ?? 15;
  const threshold = baseDc + (numberOrNull(outcome?.dc) ?? 0);
  const { lowest, next } = outcomeBandPosition(routed, threshold, baseDc);
  const exceed = routed?.thresholdMode === 'exceed';
  if (!Number.isFinite(next)) return lowest ? '−∞–∞' : `${exceed ? '>' : '≥'}${threshold}`;
  if (lowest) return `${exceed ? '≤' : '<'}${next}`;
  return `${exceed ? '>' : '≥'}${threshold}, ${exceed ? '≤' : '<'}${next}`;
}

/** A routed crafting tier's band; an unresolved crafting DC states it relative to `DC`. */
export function craftingOutcomeBand(outcome, routed, dc) {
  if (routed?.type === 'fixed') return routedOutcomeBand(outcome, routed, null);
  const base = dc ?? 0;
  const threshold = base + (numberOrNull(outcome?.dc) ?? 0);
  const { lowest, next } = outcomeBandPosition(routed, threshold, base);
  const exceed = routed?.thresholdMode === 'exceed';
  if (lowest && !Number.isFinite(next)) return '−∞–∞';
  if (lowest) return `${exceed ? '≤' : '<'}${craftingThreshold(next, dc)}`;
  const text = craftingThreshold(threshold, dc);
  return exceed ? `>${text}` : `${text}+`;
}

/**
 * Where a threshold sits on the ladder. Routed crafting and gathering both resolve with
 * `clampToNearest`, so the bottom tier has no lower bound: it renders as an upper bound on the
 * next tier, never as a `threshold+` such as `-5+`.
 */
function outcomeBandPosition(routed, threshold, base) {
  const thresholds = normalizeList(routed?.relativeOutcomes).map(
    (entry) => base + (numberOrNull(entry?.dc) ?? 0)
  );
  return {
    lowest: threshold === Math.min(...thresholds),
    next: Math.min(...thresholds.filter((value) => value > threshold)),
  };
}

// Absolute once the DC resolved, relative to an unresolved `DC` when it did not.
function craftingThreshold(threshold, dc) {
  if (dc !== null) return String(threshold);
  return threshold === 0 ? 'DC' : `DC${threshold > 0 ? '+' : '−'}${Math.abs(threshold)}`;
}

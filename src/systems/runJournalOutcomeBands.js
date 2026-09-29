/**
 * Threshold-band labels for the Journal's routed outcome ladders: the "what a roll has to beat"
 * text beside each tier, for routed gathering and routed crafting. Thresholds rank through the
 * check's own direction; a character-value ladder has no number to state, so each tier names its
 * adjustment instead (issue 2005).
 */

import { formatCheckAdjustment } from '../utils/checkAdjustmentFormat.js';

import { better } from './checkEvaluation.js';
import { sumGrading } from './checkRouting.js';
import { activeCheckEvaluation } from './checkTarget.js';
import { normalizeList, numberOrNull } from './gatheringEngineInternals.js';

/** The boundary glyphs a band states, by direction and comparison. */
const GLYPHS = Object.freeze({
  over: { meet: { at: '≥', short: '<' }, exceed: { at: '>', short: '≤' } },
  under: { meet: { at: '≤', short: '>' }, exceed: { at: '<', short: '≥' } },
});

/** Band for one routed GATHERING tier. */
export function routedOutcomeBand(outcome, routed, task, labels = {}) {
  if (routed?.type === 'fixed') {
    const start = numberOrNull(outcome?.start) ?? 0;
    const end = numberOrNull(outcome?.end) ?? start;
    return start === end ? String(start) : `${start}–${end}`;
  }
  const grading = ladderGrading(routed);
  if (grading.source === 'attribute') return adjustmentBand(outcome, grading, labels);
  // Mirrors GatheringEngine._resolveGatheringRoutedDc exactly: a finite task
  // override, then the routed slot's DC, then its canonical legacy fallback.
  const baseDc = numberOrNull(task?.dcOverride) ?? numberOrNull(routed?.dc) ?? 15;
  const threshold = tierThreshold(baseDc, outcome, grading);
  const { lowest, next } = outcomeBandPosition(routed, threshold, baseDc, grading);
  const { at, short } = glyphs(routed, grading);
  if (!Number.isFinite(next)) return lowest ? '−∞–∞' : `${at}${threshold}`;
  if (lowest) return `${short}${next}`;
  return `${at}${threshold}, ${short}${next}`;
}

/** A routed crafting tier's band; an unresolved crafting target states it relative to its word. */
export function craftingOutcomeBand(outcome, routed, dc, labels = {}) {
  if (routed?.type === 'fixed') return routedOutcomeBand(outcome, routed, null);
  const grading = ladderGrading(routed);
  if (grading.source === 'attribute') return adjustmentBand(outcome, grading, labels);
  const base = dc ?? 0;
  const threshold = tierThreshold(base, outcome, grading);
  const { lowest, next } = outcomeBandPosition(routed, threshold, base, grading);
  const exceed = routed?.thresholdMode === 'exceed';
  if (lowest && !Number.isFinite(next)) return '−∞–∞';
  const { at, short } = glyphs(routed, grading);
  if (lowest) return `${short}${craftingThreshold(next, dc, grading)}`;
  const text = craftingThreshold(threshold, dc, grading);
  if (grading.direction === 'under') return `${at}${text}`;
  return exceed ? `>${text}` : `${text}+`;
}

/** How the ladder's own check grades; a count reads as sum/over, as routing reads it. */
function ladderGrading(routed) {
  return sumGrading(activeCheckEvaluation(routed));
}

function glyphs(routed, grading) {
  return GLYPHS[grading.direction][routed?.thresholdMode === 'exceed' ? 'exceed' : 'meet'];
}

/** Under, a tier's step lowers the target it must stay under: `base − dc` (checkRouting). */
function tierThreshold(base, outcome, grading) {
  const step = numberOrNull(outcome?.dc) ?? 0;
  return grading.direction === 'under' ? base - step : base + step;
}

/** A character-value tier's adjustment, or Otherwise for a multiply tier with none. */
function adjustmentBand(outcome, grading, { otherwise = 'Otherwise' } = {}) {
  if (!grading.multiply) return formatCheckAdjustment('add', numberOrNull(outcome?.dc) ?? 0);
  return outcome?.adjustment == null
    ? otherwise
    : formatCheckAdjustment('multiply', outcome.adjustment);
}

/**
 * Where a threshold sits on the ladder. Routed crafting and gathering both resolve with
 * `clampToNearest`, so the least demanding tier has no bound on its worse side: it renders as the
 * complement of the next tier, never as a `threshold+` such as `-5+`.
 */
function outcomeBandPosition(routed, threshold, base, grading) {
  const { direction } = grading;
  const thresholds = normalizeList(routed?.relativeOutcomes).map((entry) =>
    tierThreshold(base, entry, grading)
  );
  const harder = thresholds.filter((value) => better(value, threshold, direction));
  return {
    lowest: thresholds.every((value) => !better(threshold, value, direction)),
    next: direction === 'under' ? Math.max(...harder) : Math.min(...harder),
  };
}

// Absolute once the target resolved, relative to an unresolved `DC` or `Target` when it did not.
function craftingThreshold(threshold, dc, grading) {
  if (dc !== null) return String(threshold);
  const word = grading.direction === 'under' ? 'Target' : 'DC';
  return threshold === 0 ? word : `${word}${threshold > 0 ? '+' : '−'}${Math.abs(threshold)}`;
}

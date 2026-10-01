/**
 * Threshold-band labels for the Journal's routed outcome ladders: the "what a roll has to beat"
 * text beside each tier, for routed gathering and routed crafting. Thresholds rank through the
 * check's own direction; a character-value ladder has no number to state, so each tier names its
 * adjustment instead (issue 2005). A counting ladder is stated in net successes (issue 2006).
 */

import { formatCheckAdjustment } from '../utils/checkAdjustmentFormat.js';

import { better } from './checkEvaluation.js';
import { sumGrading } from './checkRouting.js';
import { activeCheckEvaluation } from './checkTarget.js';
import { countRequired } from './countCheck.js';
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
  const evaluation = activeCheckEvaluation(routed);
  if (evaluation.product === 'count') {
    return countBand(outcome, routed, taskCountRequired(routed, task));
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
  const evaluation = activeCheckEvaluation(routed);
  if (evaluation.product === 'count') {
    if (dc === null) return relativeCountBand(outcome, routed, labels.needed ?? 'Needed');
    return countBand(outcome, routed, dc);
  }
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

const namedBand = (tier, adjustment) => `${tier} · ${adjustment}`;

/**
 * A character-value tier's adjustment, or Otherwise for a multiply tier with none, labelled with
 * its tier's name (`Failed · −15`) by `labels.named(tier, adjustment)`.
 */
function adjustmentBand(outcome, grading, { otherwise = 'Otherwise', named = namedBand } = {}) {
  let adjustment;
  if (!grading.multiply) adjustment = formatCheckAdjustment('add', numberOrNull(outcome?.dc) ?? 0);
  else if (outcome?.adjustment == null) adjustment = otherwise;
  else adjustment = formatCheckAdjustment('multiply', outcome.adjustment);
  const tier = String(outcome?.name ?? '').trim();
  return tier ? named(tier, adjustment) : adjustment;
}

/**
 * Which selection rule a routed relative ladder states: `adjustment` for a character value, else
 * `under` or `underStrict` for roll-under; `null` keeps the roll-high rule.
 */
export function ladderRule(routed) {
  if (!routed || routed.type === 'fixed') return null;
  const grading = ladderGrading(routed);
  if (grading.source === 'attribute') return 'adjustment';
  if (grading.direction !== 'under') return null;
  return routed.thresholdMode === 'exceed' ? 'underStrict' : 'under';
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

/** `DC`, `DC+2` or `DC−1`: an offset from a word standing for an unresolved number. */
function offsetFrom(word, offset) {
  return offset === 0 ? word : `${word}${offset > 0 ? '+' : '−'}${Math.abs(offset)}`;
}

// Absolute once the target resolved, relative to an unresolved `DC` or `Target` when it did not.
function craftingThreshold(threshold, dc, grading) {
  if (dc !== null) return String(threshold);
  return offsetFrom(grading.direction === 'under' ? 'Target' : 'DC', threshold);
}

/** A relative count ladder's thresholds, `required + outcome.dc`, in authored order. */
function countThresholds(routed, required) {
  return normalizeList(routed?.relativeOutcomes).map(
    (entry) => required + (numberOrNull(entry?.dc) ?? 0)
  );
}

/** A routed gathering count's successes needed: the task's override, else the pool's; else null. */
export function taskCountRequired(routed, task) {
  const evaluation = activeCheckEvaluation(routed);
  if (evaluation.product !== 'count' || routed?.type === 'fixed') return null;
  return countRequired(evaluation, task?.successesOverride);
}

/**
 * A count tier's band in net successes (issue 2006), ranked by net whatever the per-die direction:
 * from its threshold up to the next tier's, the best met winning as the runner routes it. The
 * least demanding tier starts at 0, since a net below zero is the Botch row.
 */
function countBand(outcome, routed, required) {
  const threshold = required + (numberOrNull(outcome?.dc) ?? 0);
  const thresholds = countThresholds(routed, required);
  const higher = thresholds.filter((value) => value > threshold);
  const lowest = thresholds.every((value) => value >= threshold);
  if (higher.length === 0) return `${lowest ? 0 : threshold}+`;
  const next = Math.min(...higher);
  if (lowest && next <= 0) return `<${next}`;
  const low = lowest ? 0 : threshold;
  return low === next - 1 ? String(low) : `${low}–${next - 1}`;
}

/**
 * A count tier's band when a macro sets the successes needed, relative to `word` as an unresolved
 * summed DC reads: `<Needed` for the least demanding tier, `Needed+2+` above it.
 */
function relativeCountBand(outcome, routed, word) {
  const offset = numberOrNull(outcome?.dc) ?? 0;
  const thresholds = countThresholds(routed, 0);
  const higher = thresholds.filter((value) => value > offset);
  if (thresholds.some((value) => value < offset)) return `${offsetFrom(word, offset)}+`;
  return higher.length === 0 ? '0+' : `<${offsetFrom(word, Math.min(...higher))}`;
}

/**
 * A relative count ladder's `Botch` row while cancelling is on (issue 2006), beside the least
 * demanding tier on the ladder's outer end: a net below zero routes to that tier, so the row
 * carries its outcome and yields under the band `<0`. Any other ladder is returned as it is.
 */
export function withCountBotch(tiers, routed, name) {
  const evaluation = activeCheckEvaluation(routed);
  const relative = evaluation.product === 'count' && routed?.type !== 'fixed';
  if (!relative || !evaluation.pool.cancel.enabled || tiers.length === 0) return tiers;
  const thresholds = countThresholds(routed, 0);
  const at = thresholds.indexOf(Math.min(...thresholds));
  const botch = { ...tiers[at], id: 'count-botch', name, band: '<0' };
  // A best-first ladder ends on its least demanding tier, so its Botch row closes the ladder.
  return at === tiers.length - 1 && tiers.length > 1 ? [...tiers, botch] : [botch, ...tiers];
}

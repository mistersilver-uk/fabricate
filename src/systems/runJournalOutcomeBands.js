/**
 * Threshold-band labels for the Journal's routed outcome ladders: the "what a roll has to beat"
 * text beside each tier, for routed gathering and routed crafting. Thresholds rank through the
 * check's own direction; a character-value ladder has no number to state, so each tier names its
 * adjustment instead (issue 2005). A counting ladder is stated in net successes (issue 2006).
 */

import { formatCheckAdjustment, formatNet } from '../utils/checkAdjustmentFormat.js';

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
    return netRange(start, end);
  }
  const evaluation = activeCheckEvaluation(routed);
  if (evaluation.product === 'count')
    return countBand(outcome, routed, taskCountRequired(routed, task));
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
 * from its threshold up to the next tier's, the best met winning as the runner routes it.
 */
function countBand(outcome, routed, required) {
  const threshold = required + (numberOrNull(outcome?.dc) ?? 0);
  const thresholds = countThresholds(routed, required);
  const higher = thresholds.filter((value) => value > threshold);
  const next = higher.length > 0 ? Math.min(...higher) : null;
  const lowest = thresholds.every((value) => value >= threshold);
  const low = lowest ? lowestTierStart(routed, threshold, next) : threshold;
  if (next === null) return `${formatNet(low)}+`;
  return netRange(low, next - 1);
}

/** `low–high`, spaced (`−2 – 1`) when either end is negative so its minus reads apart from the dash. */
export function netRange(low, high) {
  if (low === high) return formatNet(low);
  const dash = low < 0 || high < 0 ? ' – ' : '–';
  return `${formatNet(low)}${dash}${formatNet(high)}`;
}

/**
 * Where the least demanding tier's band starts (issue 2135): at 0, every net below its threshold
 * clamping to it, or at its own threshold when cancelling can carry a net that low, a net below
 * every tier being the Botch row. A tier no net can reach still states its own range.
 */
function lowestTierStart(routed, threshold, next) {
  const cancels = activeCheckEvaluation(routed).pool.cancel.enabled;
  return cancels || (next !== null && next <= 0) ? Math.min(0, threshold) : 0;
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
 * A relative count ladder's `Botch` row while cancelling is on (issue 2006): the nets no tier
 * meets, below 0 or below the least demanding tier's threshold when that is lower (issue 2135),
 * routed to that tier, so the row carries its outcome, and its floor as `below`. It sits beside
 * that tier, before it on a ladder authored worst-first and after it on one authored best-first.
 * `required` is null under a macro. Any other ladder is returned as it is.
 */
export function withCountBotch(tiers, routed, name, required = null) {
  const evaluation = activeCheckEvaluation(routed);
  const relative = evaluation.product === 'count' && routed?.type !== 'fixed';
  if (!relative || !evaluation.pool.cancel.enabled || tiers.length === 0) return tiers;
  const thresholds = countThresholds(routed, 0);
  const least = Math.min(...thresholds);
  const at = thresholds.indexOf(least);
  const floor = Number.isInteger(required) ? Math.min(0, required + least) : 0;
  const botch = {
    ...tiers[at],
    id: 'count-botch',
    name,
    band: `<${formatNet(floor)}`,
    below: floor,
  };
  const after = at + (thresholds[0] > thresholds.at(-1) ? 1 : 0);
  return [...tiers.slice(0, after), botch, ...tiers.slice(after)];
}

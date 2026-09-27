/**
 * The read-only band pictures the Studio draws for every summed check except roll-over against a
 * fixed DC (ruling R2). Pure: each total in the window is graded by the runtime's own comparison
 * and routed classification, and contiguous runs become bands, so the picture cannot disagree
 * with a roll. Tier Steppers stay the authority; this only draws them.
 */
import {
  compareToTarget,
  resolveDeterministicExpression,
} from '../../../../../systems/checkEvaluation.js';
import { classifyCheckTotal } from '../../../../../systems/checkRouting.js';
import {
  isFixedSumOver,
  multiplyTierThreshold,
  resolveCheckTarget,
  selectTargetAdjustment,
} from '../../../../../systems/checkTarget.js';
import { normalizeCheckEvaluation } from '../../../../../systems/normalize/checkEvaluation.js';

import { formatCheckAdjustment } from './checkAdjustmentLabel.js';

const WINDOW_PADDING = 5;
const MAX_WINDOW = 5000;

/** Whether a strip keeps its drag handles: only summed roll-over against a fixed DC (R2). */
export function bandsAreEditable(evaluation) {
  return isFixedSumOver(normalizeCheckEvaluation(evaluation));
}

/**
 * The target a previewed record grades against: `{ state: 'ok', target, value }`, where `value`
 * is the character value read before any adjustment, or `{ state: 'needs-actor' }` and
 * `{ state: 'unresolved', reason }`. An actor-free literal resolves without a character.
 */
export function resolvePreviewTarget({ evaluation, anchor, adjustment = null, character = null }) {
  const normalized = normalizeCheckEvaluation(evaluation);
  if (normalized.target.source !== 'attribute') {
    return Number.isFinite(anchor)
      ? { state: 'ok', target: anchor, value: null }
      : { state: 'unresolved', reason: 'non-finite' };
  }
  if (!normalized.target.expression.trim()) {
    return { state: 'unresolved', reason: 'expression-missing' };
  }
  const rollData = character?.rollData ?? {};
  const read = resolveDeterministicExpression(normalized.target.expression, rollData, {
    pathMode: 'foundry',
  });
  if (!read.ok) {
    return !character && read.reason === 'unresolved-path'
      ? { state: 'needs-actor' }
      : { state: 'unresolved', reason: read.reason };
  }
  const resolved = resolveCheckTarget({
    evaluation: normalized,
    rollData,
    anchor,
    adjustment: selectTargetAdjustment(normalized, adjustment),
  });
  return resolved.ok
    ? { state: 'ok', target: resolved.target, value: read.value }
    : { state: 'unresolved', reason: resolved.reason };
}

/** Group each total's classification into contiguous runs, open at both ends of the window. */
function runsOver(low, high, classify) {
  if (!(high - low < MAX_WINDOW)) return [];
  const bands = [];
  for (let total = low; total <= high; total += 1) {
    const tier = classify(total);
    const last = bands.at(-1);
    if (last && last.key === tier.key) {
      last.to = total;
      continue;
    }
    bands.push({ ...tier, from: total, to: total });
  }
  const seen = {};
  return bands.map(({ key, ...band }, position) => {
    seen[key] = (seen[key] ?? 0) + 1;
    return {
      ...band,
      id: seen[key] > 1 ? `${key}-${seen[key]}` : key,
      low: position === 0 ? null : band.from,
      high: position === bands.length - 1 ? null : band.to,
    };
  });
}

/** The window to draw: the supplied reachable range, widened to show every edge in `edges`. */
function drawWindow(edges, min, max) {
  const finite = edges.filter(Number.isFinite);
  if (finite.length === 0) return null;
  const low = Math.min(...finite) - WINDOW_PADDING;
  const high = Math.max(...finite) + WINDOW_PADDING;
  return {
    low: Math.floor(Number.isFinite(min) ? Math.min(min, low) : low),
    high: Math.ceil(Number.isFinite(max) ? Math.max(max, high) : high),
  };
}

/**
 * A simple check's two bands against `target`, in value order. `names` carries the localized
 * `{ success, failure }` names.
 */
export function buildPassFailBands({
  evaluation,
  comparison,
  target,
  min = null,
  max = null,
  names,
}) {
  const window = drawWindow([target], min, max);
  if (!window) return [];
  const { direction } = normalizeCheckEvaluation(evaluation);
  return runsOver(window.low, window.high, (total) => {
    const success = compareToTarget(total, target, comparison, direction);
    return {
      key: success ? 'success' : 'failure',
      name: success ? names.success : names.failure,
      success,
      index: success ? 1 : 0,
    };
  });
}

function relativeEdges(normalized, anchor, outcomes) {
  const multiply =
    normalized.target.source === 'attribute' && normalized.target.adjustmentKind === 'multiply';
  return outcomes.map((outcome) => {
    if (multiply) {
      return outcome.adjustment == null
        ? NaN
        : multiplyTierThreshold(anchor, Number(outcome.adjustment));
    }
    const step = Number(outcome.dc);
    return normalized.direction === 'under' ? anchor - step : anchor + step;
  });
}

/**
 * A routed check's tier bands in value order. Relative tiers are classified by the runtime's
 * routing against `anchor`; fixed ranges are drawn as authored, and a gap or overlap is left
 * for the strip's own fallback.
 */
export function buildRoutedBands({
  evaluation,
  comparison,
  anchor,
  type,
  outcomes,
  min = null,
  max = null,
}) {
  const list = Array.isArray(outcomes) ? outcomes.filter(Boolean) : [];
  if (list.length === 0) return [];
  if (type === 'fixed') {
    const ordered = list
      .map((outcome, index) => ({ outcome, index }))
      .sort((a, b) => Number(a.outcome.start) - Number(b.outcome.start));
    return ordered.map(({ outcome, index }, position) => ({
      id: outcome.id,
      name: outcome.name,
      success: outcome.success === true,
      index,
      from: Number(outcome.start),
      to: Number(outcome.end),
      low: position === 0 ? null : Number(outcome.start),
      high: position === ordered.length - 1 ? null : Number(outcome.end),
    }));
  }
  const normalized = normalizeCheckEvaluation(evaluation);
  const window = drawWindow(relativeEdges(normalized, anchor, list), min, max);
  if (!window) return [];
  return runsOver(window.low, window.high, (total) => {
    const { matched } = classifyCheckTotal({
      type: 'relative',
      total,
      dc: anchor,
      comparison,
      relativeOutcomes: list,
      fixedOutcomes: [],
      triggers: [],
      clampToNearest: true,
      evaluation: normalized,
    });
    return {
      key: matched?.id ?? 'unrouted',
      name: matched?.name ?? '',
      success: matched?.success === true,
      index: Math.max(0, list.indexOf(matched)),
    };
  });
}

/** One band's range for the strip's hidden list; `text(key, fallback)` localizes. */
export function describeBandRange(band, text) {
  if (band.low === null && band.high === null) return '';
  if (band.low === null) {
    return text(
      'FABRICATE.Admin.Manager.Checks.Evaluation.RangeOrUnder',
      '{value} or under'
    ).replace('{value}', String(band.high));
  }
  if (band.high === null) {
    return text('FABRICATE.Admin.Manager.Checks.Evaluation.RangeOrOver', '{value} or over').replace(
      '{value}',
      String(band.low)
    );
  }
  if (band.low === band.high) return String(band.low);
  return text('FABRICATE.Admin.Manager.Checks.Evaluation.RangeBetween', '{from}–{to}')
    .replace('{from}', String(band.low))
    .replace('{to}', String(band.high));
}

/**
 * The sentence under a read-only strip naming its target and where success sits. `source` is the
 * already-joined character reading (`Idrin 55, Hard ×½`), or `''` for a fixed target.
 */
export function describeBandScale({ direction, comparison, target, source = '', cmp }, text) {
  let sentence;
  if (direction === 'under') {
    sentence = source
      ? text(
          'FABRICATE.Admin.Manager.Checks.Evaluation.ScaleUnderSourced',
          'Target {target} ({source}). Success sits at the low end: a total {cmp} {target} succeeds.'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Evaluation.ScaleUnder',
          'Target {target}. Success sits at the low end: a total {cmp} {target} succeeds.'
        );
  } else {
    sentence =
      comparison === 'exceed'
        ? text(
            'FABRICATE.Admin.Manager.Checks.Evaluation.ScaleOverExceed',
            'Target {target} ({source}). Success sits at the high end: a total above {target} succeeds.'
          )
        : text(
            'FABRICATE.Admin.Manager.Checks.Evaluation.ScaleOverMeet',
            'Target {target} ({source}). Success sits at the high end: a total of {target} or more succeeds.'
          );
  }
  return sentence
    .replaceAll('{target}', String(target))
    .replaceAll('{source}', source)
    .replaceAll('{cmp}', cmp);
}

/**
 * The previewed target plus the `source` reading {@link describeBandScale} names: the character
 * value and, when the previewed recipe tier sets one, its adjustment. `tier` is `{ name,
 * adjustment }` or null for the base.
 */
export function previewBandTarget({ evaluation, anchor, tier = null, character = null }, text) {
  const normalized = normalizeCheckEvaluation(evaluation);
  const resolved = resolvePreviewTarget({
    evaluation: normalized,
    anchor,
    adjustment: tier?.adjustment ?? null,
    character,
  });
  if (resolved.state !== 'ok' || normalized.target.source !== 'attribute') {
    return { ...resolved, source: '' };
  }
  const parts = [
    character
      ? text('FABRICATE.Admin.Manager.Checks.Evaluation.ScaleSourceActor', '{actor} {value}')
          .replace('{actor}', character.name)
          .replace('{value}', String(resolved.value))
      : String(resolved.value),
  ];
  const label = formatCheckAdjustment(normalized.target.adjustmentKind, tier?.adjustment);
  if (label) parts.push(`${tier.name} ${label}`.trim());
  return { ...resolved, source: parts.join(', ') };
}

/** Why a read-only strip draws nothing: no Preview-as actor, or one the value is missing on. */
export function describeBandsUnavailable(state, { character = null, expression = '' }, text) {
  if (state.state === 'needs-actor') {
    return text(
      'FABRICATE.Admin.Manager.Checks.Evaluation.BandsNeedActor',
      'This check reads the character, so there is nothing to chart without one. Choose a character in Preview as.'
    );
  }
  return text(
    'FABRICATE.Admin.Manager.Checks.Evaluation.BandsUnresolved',
    '{actor} is missing a value this check reads ({path}), so it cannot resolve for them.'
  )
    .replace('{actor}', character?.name ?? '')
    .replace('{path}', expression);
}

/**
 * The Checks Studio's preview view-model: record labels, abstention, the odds panel's model and
 * the signature a rolled result is valid for; the rolled readout is `checkReadoutModel.js`'s. Pure;
 * `text(key, fallback)` localizes, and every number shown comes from the plan or the result.
 */
import { formatCheckAdjustment } from './checkAdjustmentLabel.js';
import {
  describeFormulaEnumerability,
  enumeratePassFailOdds,
  enumerateProgressiveOdds,
  enumerateRoutedOdds,
  SANDBOX_ABSENT,
} from './checkOdds.js';
import { gradesLikeFixedOver, readsAttributeTarget } from './checkPreview.js';
import { interpolate } from './checksCopy.js';
import { missingTargetPaths, readsCharacter, targetExpressionFault } from './checkTargetStatus.js';
import {
  buildCountOddsModel,
  countAbstention,
  countPreviewEnumeration,
  countRecordReading,
} from './countPreviewModel.js';

/** Why a preview charts and rolls nothing although its check has a formula. */
export const PREVIEW_ABSTENTIONS = Object.freeze({
  needsPreviewActor: 'needs-preview-actor',
  pathUnresolved: 'attribute-path-unresolved',
  valueNotNumeric: 'attribute-value-not-numeric',
  targetInvalid: 'target-invalid',
  progressiveUnder: 'progressive-under-unsupported',
});

export { buildReadoutModel } from './checkReadoutModel.js';

const NOT_NUMERIC = new Set(['dice', 'invalid', 'non-finite']);

/**
 * What a record grades against: its required count under a count check, its adjustment under a
 * character value, else `target n` or `DC n`.
 */
function recordReading(record, evaluation, text) {
  if (evaluation.product === 'count') return countRecordReading(record, evaluation, text);
  if (evaluation.target.source === 'attribute') {
    if (record.adjustment === null) {
      return text(
        'FABRICATE.Admin.Manager.Checks.Evaluation.RecordBaseAdjustment',
        'base adjustment'
      );
    }
    return formatCheckAdjustment(evaluation.target.adjustmentKind, record.adjustment) || '—';
  }
  if (evaluation.direction === 'under') {
    return text('FABRICATE.Admin.Manager.Checks.Evaluation.RecordTarget', 'target {dc}').replace(
      '{dc}',
      String(record.dc)
    );
  }
  return `${text('FABRICATE.Admin.Manager.Checks.Crafting.TierDc', 'DC')} ${record.dc}`;
}

/** The records labelled for the pickers; a progressive check's carry no reading. */
export function labelPreviewRecords(records, { evaluation, progressive = false }, text) {
  return records.map((record) => ({
    ...record,
    label: [record.name, progressive ? '' : recordReading(record, evaluation, text)]
      .filter(Boolean)
      .join(' · '),
  }));
}

/** A static fault or a missing adjustment is the check's own; anything else is the actor's value. */
function targetAbstention(plan, character) {
  const expression = plan.evaluation.target.expression;
  const { reason } = plan.target;
  const invalid = { reason: PREVIEW_ABSTENTIONS.targetInvalid, refusal: reason };
  if (targetExpressionFault(expression)) return invalid;
  const actor = character?.name ?? '';
  if (reason === 'unresolved-path') {
    const path = missingTargetPaths(expression, character?.rollData ?? {}).join(', ');
    return { reason: PREVIEW_ABSTENTIONS.pathUnresolved, data: { actor, path } };
  }
  if (NOT_NUMERIC.has(reason)) {
    return { reason: PREVIEW_ABSTENTIONS.valueNotNumeric, data: { actor } };
  }
  return invalid;
}

/**
 * Why this preview abstains, `{ reason, data?, refusal? }`, or null when it charts and rolls.
 * Sum/over against a fixed DC never abstains here, keeping its own unresolved-roll-data reading.
 * With no actor, a check reading the character abstains first, whatever else is wrong with it.
 */
export function previewAbstention(plan, character) {
  if (!plan?.kind || gradesLikeFixedOver(plan)) return null;
  if (plan.evaluation.product === 'count') {
    return countAbstention(plan, character, PREVIEW_ABSTENTIONS);
  }
  if (String(plan.formula ?? '').trim() === '') return null;
  const attribute = readsAttributeTarget(plan);
  const expression = attribute ? plan.evaluation.target.expression : '';
  if (!character && (readsCharacter(plan.formula) || readsCharacter(expression))) {
    return { reason: PREVIEW_ABSTENTIONS.needsPreviewActor };
  }
  if (plan.kind === 'progressive' && plan.evaluation.direction === 'under') {
    return { reason: PREVIEW_ABSTENTIONS.progressiveUnder, refusal: 'progressive-under' };
  }
  if (plan.target && !plan.target.ok) return targetAbstention(plan, character);
  return null;
}

/** The enumerated outcome space the odds, the track window and the strips read. */
export function previewEnumeration(plan, abstention, { Roll = globalThis.Roll } = {}) {
  if (abstention) return { enumerable: false, reason: abstention.reason };
  if (plan.kind && plan.evaluation.product === 'count') {
    return countPreviewEnumeration(plan, { Roll });
  }
  const formula = String(plan.formula ?? '').trim();
  if (formula === '') return { enumerable: false, reason: 'no-dice' };
  return describeFormulaEnumerability(formula, plan.actor, {
    Roll,
    craftingModifier: plan.args?.craftingModifier ?? null,
    evaluation: plan.evaluation,
    toolContributions: plan.args?.rollOptions?.toolContributions ?? [],
  });
}

/** The reachable total range a strip is drawn across, or nulls when nothing enumerates. */
export function previewTrack(enumeration) {
  if (!enumeration.enumerable || enumeration.product === 'count') return { min: null, max: null };
  const totals = enumeration.outcomes.map((outcome) => outcome.total);
  return { min: Math.min(...totals), max: Math.max(...totals) };
}

function progressiveOdds({ outcomes, faces, combinations }, { difficulties, awardMode }, text) {
  if (difficulties.length === 0) {
    return { kind: 'progressive', enumerable: false, reason: SANDBOX_ABSENT };
  }
  const rows = enumerateProgressiveOdds({ outcomes, difficulties, awardMode }).map((row) => ({
    id: row.id,
    label: text('FABRICATE.Admin.Manager.Checks.Odds.AwardCount', '{awarded} of {of}')
      .replace('{awarded}', String(row.awarded))
      .replace('{of}', String(row.of)),
    percent: row.percent,
    success: row.awarded > 0,
  }));
  return { kind: 'progressive', enumerable: true, faces, combinations, rows };
}

function passFailRows(plan, outcomes, text) {
  return enumeratePassFailOdds({
    outcomes,
    args: {
      dc: plan.args.dc,
      comparison: plan.args.thresholdMode === 'exceed' ? 'exceed' : 'meet',
      triggers: plan.args.triggers,
      direction: plan.evaluation.direction,
    },
  }).map((row) => ({
    id: row.id,
    label: row.success
      ? text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success')
      : text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailure', 'Failure'),
    percent: row.percent,
    success: row.success,
  }));
}

/**
 * The odds heading a roll-under or character-value check names: "exact · {formula}", with each
 * separately rolled bonus the joint space crosses in; `''` leaves the heading to count faces.
 */
function exactCaption(plan, { bonuses = [] }, text) {
  if (gradesLikeFixedOver(plan)) return '';
  const formula = String(plan.formula ?? '').trim();
  if (bonuses.length === 0) {
    return interpolate(text('FABRICATE.Admin.Manager.Checks.Odds.Exact', 'exact · {formula}'), {
      formula,
    });
  }
  return interpolate(
    text('FABRICATE.Admin.Manager.Checks.Odds.ExactJoint', 'exact · {formula} with {bonuses}'),
    { formula, bonuses: bonuses.join(' + ') }
  );
}

/**
 * The model `CheckOddsPanel` renders, every branch either enumerating or stating why it did not.
 * `sandbox` carries a progressive check's `{ difficulties, awardMode }`.
 */
export function buildOddsModel({ plan, enumeration, abstention = null, sandbox }, text) {
  const { kind } = plan;
  if (!kind) return { kind: null };
  const direction = plan.evaluation.direction;
  const count = plan.evaluation.product === 'count';
  if (enumeration.enumerable !== true) {
    const reasonData = abstention?.data ?? null;
    const refused = { kind, direction, enumerable: false, reason: enumeration.reason, reasonData };
    return count ? { ...refused, product: 'count' } : refused;
  }
  if (count) return buildCountOddsModel(plan, enumeration, sandbox, text);
  const { faces, combinations, outcomes } = enumeration;
  if (kind === 'progressive') return progressiveOdds(enumeration, sandbox, text);
  const caption = exactCaption(plan, enumeration, text);
  if (kind === 'routed') {
    const unrouted = text('FABRICATE.Admin.Manager.Checks.Odds.Unrouted', 'No outcome');
    const rows = enumerateRoutedOdds({ outcomes, args: plan.args }).map((row) => ({
      id: row.id || 'unrouted',
      label: row.name || unrouted,
      percent: row.percent,
      success: row.success,
    }));
    return { kind, direction, enumerable: true, faces, combinations, caption, rows };
  }
  const rows = passFailRows(plan, outcomes, text);
  return { kind, direction, enumerable: true, faces, combinations, caption, rows };
}

/** The note under Preview as with no actor chosen, in the evaluation's own terms. */
export function previewActorNote({ plan, actor }, text) {
  if (actor) return '';
  if (plan?.kind && !gradesLikeFixedOver(plan)) {
    return text(
      'FABRICATE.Admin.Manager.Checks.PreviewAs.NoActorCharacter',
      'No actor chosen. Values read from a character are not charted.'
    );
  }
  return text(
    'FABRICATE.Admin.Manager.Checks.PreviewAs.NoActorHint',
    'With no actor selected every roll-data key reads as 0.'
  );
}

/**
 * The inputs one rolled result describes; a result rolled under another signature is dropped,
 * including one that arrives after its inputs changed.
 */
export function previewSignature({ activity, mode, plan, actorId, record, tier }) {
  return [
    activity,
    mode,
    String(plan.formula ?? '').trim(),
    actorId,
    record?.id ?? '',
    plan.dc,
    JSON.stringify(plan.evaluation),
    JSON.stringify(plan.target),
    JSON.stringify(tier ?? null),
  ].join('\0');
}

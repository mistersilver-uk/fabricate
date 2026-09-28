/**
 * The Checks Studio's preview view-model: record labels, abstention, the odds panel's model, the
 * simulator readout and the signature a rolled result is valid for. Pure; `text(key, fallback)`
 * localizes, and every number shown comes from the preview plan or the runner's own result.
 */
import { isFixedSumOver } from '../../../../../systems/checkTarget.js';

import { formatCheckAdjustment } from './checkAdjustmentLabel.js';
import {
  describeFormulaEnumerability,
  enumeratePassFailOdds,
  enumerateProgressiveOdds,
  enumerateRoutedOdds,
  SANDBOX_ABSENT,
} from './checkOdds.js';
import { terseBreakdown } from './checkPreview.js';
import { interpolate } from './checksCopy.js';
import {
  missingTargetPaths,
  readsCharacter,
  targetExpressionFault,
  targetRefusalSentence,
} from './checkTargetStatus.js';

/** Why a preview charts and rolls nothing although its check has a formula. */
export const PREVIEW_ABSTENTIONS = Object.freeze({
  needsPreviewActor: 'needs-preview-actor',
  pathUnresolved: 'attribute-path-unresolved',
  valueNotNumeric: 'attribute-value-not-numeric',
  targetInvalid: 'target-invalid',
  progressiveUnder: 'progressive-under-unsupported',
});

const NOT_NUMERIC = new Set(['dice', 'invalid', 'non-finite']);

/** What a record grades against: its adjustment under a character value, else `target n` or `DC n`. */
function recordReading(record, evaluation, text) {
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

/** Whether the plan grades against a character value the target resolution reads. */
function readsAttributeTarget(plan) {
  return (
    plan.kind !== 'progressive' &&
    plan.args?.type !== 'fixed' &&
    plan.evaluation.target.source === 'attribute'
  );
}

/** Whether the plan grades as roll-over against a fixed DC, an inert character value included. */
function gradesLikeFixedOver(plan) {
  return plan.evaluation.direction === 'over' && !readsAttributeTarget(plan);
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
  if (!enumeration.enumerable) return { min: null, max: null };
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
 * The model `CheckOddsPanel` renders, every branch either enumerating or stating why it did not.
 * `sandbox` carries a progressive check's `{ difficulties, awardMode }`.
 */
export function buildOddsModel({ plan, enumeration, abstention = null, sandbox }, text) {
  const { kind } = plan;
  if (!kind) return { kind: null };
  const direction = plan.evaluation.direction;
  if (enumeration.enumerable !== true) {
    const reasonData = abstention?.data ?? null;
    return { kind, direction, enumerable: false, reason: enumeration.reason, reasonData };
  }
  const { faces, combinations, outcomes } = enumeration;
  if (kind === 'progressive') return progressiveOdds(enumeration, sandbox, text);
  if (kind === 'routed') {
    const unrouted = text('FABRICATE.Admin.Manager.Checks.Odds.Unrouted', 'No outcome');
    const rows = enumerateRoutedOdds({ outcomes, args: plan.args }).map((row) => ({
      id: row.id || 'unrouted',
      label: row.name || unrouted,
      percent: row.percent,
      success: row.success,
    }));
    return { kind, direction, enumerable: true, faces, combinations, rows };
  }
  const rows = passFailRows(plan, outcomes, text);
  return { kind, direction, enumerable: true, faces, combinations, rows };
}

function passFailDetail(success, under, text) {
  if (under) {
    return success
      ? text(
          'FABRICATE.Admin.Manager.Checks.Simulator.BandSuccessUnder',
          'The roll stays at or under the target, and the recipe’s result group is produced in full.'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Simulator.BandFailureUnder',
          'The roll goes over the target; nothing is produced, and the failure policy decides the cost.'
        );
  }
  return success
    ? text(
        'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccessDesc',
        'The roll reaches the DC, and the recipe’s result group is produced in full.'
      )
    : text(
        'FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailureDesc',
        'The roll misses the DC; nothing is produced, and the failure policy decides the cost.'
      );
}

/** The matched band card: the tier the result object actually names. */
export function buildBandCard(result, plan, text) {
  if (!result) return { name: '', detail: '', success: false };
  const success = result.success === true;
  if (plan.kind === 'routed') {
    return {
      name:
        result.outcome ||
        text('FABRICATE.Admin.Manager.Checks.Simulator.NoOutcome', 'No outcome tier'),
      detail: success
        ? text(
            'FABRICATE.Admin.Manager.Checks.Simulator.BandSuccess',
            'Counts as a success · the result group bound to this tier is produced.'
          )
        : text(
            'FABRICATE.Admin.Manager.Checks.Simulator.BandFailure',
            'Counts as a failure · nothing is produced.'
          ),
      success,
    };
  }
  if (plan.kind === 'progressive') {
    return {
      name: text('FABRICATE.Admin.Manager.Checks.Simulator.AwardValue', 'Awards {value}').replace(
        '{value}',
        String(result.value ?? 0)
      ),
      detail: text(
        'FABRICATE.Admin.Manager.Checks.Simulator.AwardDetail',
        'The value is spent down the recipe’s ordered results, each costing its own difficulty.'
      ),
      success: true,
    };
  }
  return {
    name: success
      ? text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success')
      : text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailure', 'Failure'),
    detail: passFailDetail(success, plan.evaluation.direction === 'under', text),
    success,
  };
}

/**
 * The "What happens" rows, each read off the SAME result object the engine would act on.
 * `consumption` carries the activity's `{ consumeIngredientsOnFail, breakToolsOnFail }`.
 */
export function buildPreviewFacts({ result, plan, activity, consumption }, text) {
  if (!result) return [];
  const facts = [];
  const success = result.success === true;
  facts.push({
    id: 'result-group',
    icon: 'fas fa-box-open',
    title: text('FABRICATE.Admin.Manager.Checks.Simulator.FactResults', 'Result group produced'),
    subtitle: success
      ? buildBandCard(result, plan, text).name
      : text('FABRICATE.Admin.Manager.Checks.Simulator.FactResultsNone', 'None'),
  });
  if (activity !== 'gathering') {
    const consumes = success || consumption.consumeIngredientsOnFail;
    facts.push({
      id: 'ingredients',
      icon: 'fas fa-fire-flame-curved',
      title: text(
        'FABRICATE.Admin.Manager.Checks.Simulator.FactIngredients',
        'Ingredients consumed'
      ),
      subtitle: consumes
        ? text('FABRICATE.Admin.Manager.Checks.Simulator.FactAsListed', 'as listed')
        : text('FABRICATE.Admin.Manager.Checks.Simulator.FactNotConsumed', 'kept'),
    });
  }
  if (result.data?.breakTools === true || (!success && consumption.breakToolsOnFail)) {
    facts.push({
      id: 'tools',
      icon: 'fas fa-hammer',
      title: text('FABRICATE.Admin.Manager.Checks.Simulator.FactTools', 'Required tools break'),
      subtitle: '',
    });
  }
  facts.push(...gradingFacts(result.data, text));
  return facts;
}

function gradingFacts(data, text) {
  const facts = [];
  if (data?.tierStepApplied) {
    const step = data.tierStepApplied;
    facts.push({
      id: 'tier-step',
      icon: 'fas fa-arrow-up-right-dots',
      title: text(
        'FABRICATE.Admin.Manager.Checks.Simulator.FactTierStep',
        'A trigger moved the tier by {steps}'
      ).replace('{steps}', String(step.steps)),
      subtitle: step.stepClamped
        ? text(
            'FABRICATE.Admin.Manager.Checks.Simulator.FactTierStepClamped',
            'clamped at the end of the tier list'
          )
        : '',
    });
  }
  if (data?.minTierFailed) {
    facts.push({
      id: 'min-tier',
      icon: 'fas fa-ban',
      title: text(
        'FABRICATE.Admin.Manager.Checks.Simulator.FactMinTier',
        'Blocked by the recipe’s minimum success tier'
      ),
      subtitle: '',
    });
  }
  return facts;
}

/**
 * The readout's target and margin. Sum/over against a fixed DC reads `total − dc` against the
 * previewed DC; every other evaluation reads the runner's executed `data.target` and `data.margin`.
 */
function readoutGrading(plan, result, total, text) {
  if (plan.kind === 'progressive' || !Number.isFinite(total)) {
    return { target: null, margin: null, vsLabel: '' };
  }
  if (isFixedSumOver(plan.evaluation)) {
    return {
      target: plan.dc,
      margin: total - plan.dc,
      vsLabel: text('FABRICATE.Admin.Manager.Checks.Simulator.VsDc', 'vs DC {dc}').replace(
        '{dc}',
        String(plan.dc)
      ),
    };
  }
  const { target = null, margin = null } = result?.data ?? {};
  // Otherwise and fixed ranges execute with no target, which is not a target of 0.
  if (!Number.isFinite(target) || !Number.isFinite(margin)) {
    return { target: null, margin: null, vsLabel: '' };
  }
  return {
    target,
    margin,
    vsLabel: interpolate(
      text('FABRICATE.Admin.Manager.Checks.Simulator.VsTarget', 'vs target {target}'),
      { target }
    ),
  };
}

/** Why the simulator will not roll, in the sentence its hint shows. */
function abstentionHint(abstention, text) {
  if (abstention.refusal) return targetRefusalSentence(abstention.refusal, text);
  return text(
    'FABRICATE.Admin.Manager.Checks.Simulator.NeedsCharacter',
    'Choose a character who has every value this check reads, then roll.'
  );
}

/** The dynamic-target note a check taking its target from a macro shows, or `''`. */
function dynamicNote(plan) {
  if (!plan.dynamicDc) return '';
  return readsAttributeTarget(plan) ? 'dynamic-target' : 'dynamic-dc';
}

/**
 * The simulator readout. `resolved` is false for a formula that does not reduce for the actor;
 * `abstention` withholds the roll, the target and the margin, stating why instead.
 */
export function buildReadoutModel(
  { plan, result, rolling, resolved, abstention = null, actorName = '', facts = [] },
  text
) {
  const total = Number(result?.data?.total);
  const band = buildBandCard(result, plan, text);
  const grading = readoutGrading(plan, result, total, text);
  return {
    kind: plan.kind,
    hasFormula: String(plan.formula ?? '').trim() !== '',
    direction: plan.evaluation.direction,
    dynamicNote: dynamicNote(plan),
    resolved,
    rolling,
    abstain: abstention
      ? { reason: abstention.reason, hint: abstentionHint(abstention, text) }
      : null,
    result,
    total: Number.isFinite(total) ? total : null,
    dc: plan.dc,
    ...grading,
    breakdown: terseBreakdown(result, actorName),
    // The die the medallion is captioned with, off the result's own dice bag.
    dieLabel: result?.data?.diceGroups?.[0]?.group
      ? `d${String(result.data.diceGroups[0].group).split('d', 2)[1]}`
      : '',
    bandName: band.name,
    bandDetail: band.detail,
    bandSuccess: band.success,
    facts,
  };
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

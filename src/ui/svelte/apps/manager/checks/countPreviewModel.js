/**
 * The Checks Studio's success-counting preview: record readings, abstention, exact odds per
 * outcome and the simulator's per-die readout. Pure; odds come from `countOdds.js`, each outcome is
 * graded by the runtime's own count graders, and faces are marked by `countEvaluation.js`.
 */
import { resolveCheckModifierFormula } from '../../../../../systems/checkModifierResolver.js';
import { SUM_OVER_EVALUATION } from '../../../../../systems/checkModifierRouter.js';
import { planDecisionPlacement } from '../../../../../systems/checkRollDecision.js';
import { routedOutcomeOrder, triggerMovesOutcome } from '../../../../../systems/checkRouting.js';
import { actorRollData } from '../../../../../systems/checkTarget.js';
import { countRequired } from '../../../../../systems/countCheck.js';
import {
  gradeCountPassFail,
  gradeCountProgressive,
  gradeCountRouted,
} from '../../../../../systems/countCheckRoll.js';
import {
  countFacePredicates,
  countFormulaValues,
  projectCountResults,
} from '../../../../../systems/countEvaluation.js';
import { countOdds } from '../../../../../systems/countOdds.js';
import { evaluateCheckBreakageCondition } from '../../../../../toolBreakageRuntime.js';
import { resolveProgressiveAward } from '../../../../../utils/progressiveAward.js';

import { enumeratePreRollTotals, ODDS_REASONS, percentOf, SANDBOX_ABSENT } from './checkOdds.js';
import { interpolate, MINUS } from './checksCopy.js';
import { missingTargetPaths, readsCharacter, targetExpressionFault } from './checkTargetStatus.js';

/**
 * The digest's roll row for a count check, `Roll · {base}d{die} · each {comparison} {threshold}`,
 * with the authored expressions; `null` for any other check. A base that is not a whole number is
 * bracketed, `(@skills.smith.rank + 2)d10`, so it does not read as a sum with the dice.
 */
export function countDigestFormula(check, evaluation, text) {
  if (evaluation.product !== 'count') return null;
  const { base, die, threshold } = evaluation.pool;
  const authored = String(base ?? '').trim();
  const values = countFormulaValues({
    dice: authored === '' || /^\d+$/.test(authored) ? authored : `(${authored})`,
    die,
    direction: evaluation.direction,
    comparison: check?.thresholdMode,
    threshold,
  });
  const fallback = 'Roll · {pool}d{die} · each {comparison} {threshold}';
  return interpolate(text('FABRICATE.Admin.Manager.Checks.Digest.CountFormula', fallback), values);
}

/** A record's reading: its required count, `{count} successes` or `1 success`. */
export function countRecordReading(record, evaluation, text) {
  const count = countRequired(evaluation, record.successes);
  if (count === 1) {
    return text('FABRICATE.Admin.Manager.Checks.PreviewAs.RecordSuccessOne', '1 success');
  }
  return interpolate(
    text('FABRICATE.Admin.Manager.Checks.PreviewAs.RecordSuccesses', '{count} successes'),
    { count }
  );
}

/**
 * Why a count preview abstains, or null. With no actor a pool reading the character abstains
 * first; a pool the actor cannot fill names them; any other refusal is the check's own.
 */
export function countAbstention(plan, character, { needsPreviewActor, targetInvalid }) {
  const { base, threshold } = plan.evaluation.pool;
  if (!character && (readsCharacter(base) || readsCharacter(threshold))) {
    return { reason: needsPreviewActor };
  }
  const refusal = plan.target;
  if (!refusal || refusal.ok) return null;
  const expression = plan.evaluation.pool[refusal.refusedInput];
  const readsActor =
    ['base', 'threshold'].includes(refusal.refusedInput) &&
    readsCharacter(expression) &&
    !targetExpressionFault(expression);
  if (!readsActor) return { reason: targetInvalid, refusal };
  const actor = character?.name ?? '';
  if (refusal.reason !== 'unresolved-path') {
    return { reason: ODDS_REASONS.countValueNotNumeric, data: { actor } };
  }
  const rollData = character?.rollData ?? {};
  const paths = new Set([
    ...missingTargetPaths(base, rollData),
    ...missingTargetPaths(threshold, rollData),
  ]);
  return { reason: ODDS_REASONS.countPathUnresolved, data: { actor, path: [...paths].join(', ') } };
}

/**
 * The runner's modifier placement for this preview, as `resolveCheckDecision` plans it without a
 * prompt: Tool contributions, then the selected library entries.
 */
function countPlacement(plan, Roll) {
  const { args, actor, evaluation } = plan;
  const { selected } = resolveCheckModifierFormula(
    '',
    actor,
    args?.craftingModifier ?? null,
    Roll,
    evaluation
  );
  const toolContributions = args?.rollOptions?.toolContributions;
  return planDecisionPlacement({ evaluation, toolContributions, selected }).placementPlan;
}

const FACE_AGGREGATES = new Set(['anyDie', 'allDice']);

/**
 * The triggers with each any-die or all-dice condition on the pool replaced by a synthetic group
 * holding its joint mark, and those conditions as `countOdds` face aggregates; `null` when a
 * condition that can move an outcome reads the dice in a way a net distribution cannot follow.
 */
function faceTriggerView(triggers) {
  const aggregates = [];
  const rewritten = [];
  for (const trigger of Array.isArray(triggers) ? triggers : []) {
    const condition = trigger?.condition;
    const facesPool = condition?.type === 'diceGroup' && Number(condition.groupId) === 0;
    if (!facesPool || !triggerMovesOutcome(trigger)) {
      rewritten.push(trigger);
      continue;
    }
    if (!FACE_AGGREGATES.has(condition.aggregate)) return null;
    const groupId = -(aggregates.length + 1);
    aggregates.push({
      aggregate: condition.aggregate,
      matches: (face) =>
        evaluateCheckBreakageCondition(condition, {
          data: { diceGroups: [{ groupId: 0, results: [face] }] },
        }),
    });
    const marked = { type: 'diceGroup', groupId, aggregate: 'anyDie', operator: '==', value: 1 };
    rewritten.push({ ...trigger, condition: marked });
  }
  return { aggregates, triggers: rewritten };
}

/**
 * The count preview's outcome space: exact `countOdds` over the runner's placement, with every
 * separately rolled benefit mixed in and each face trigger enumerated jointly; or a refusal.
 */
export function countPreviewEnumeration(plan, { Roll = globalThis.Roll } = {}) {
  const view = faceTriggerView(plan.args?.triggers);
  if (!view) return { enumerable: false, reason: ODDS_REASONS.countFaceTriggerNotEnumerable };
  const rollData = actorRollData(plan.actor);
  const placement = countPlacement(plan, Roll);
  const pending = placement.preRolls.filter((entry) => !Object.hasOwn(entry, 'total'));
  const totals = enumeratePreRollTotals(pending, rollData, Roll);
  if (!totals.ok) return { enumerable: false, reason: totals.reason };
  const odds = countOdds({
    evaluation: plan.evaluation,
    thresholdMode: plan.args?.thresholdMode,
    rollData,
    placement,
    preRollTotals: totals.entries,
    faceAggregates: view.aggregates,
  });
  if (!odds.ok) return { enumerable: false, reason: odds.reason };
  return { enumerable: true, product: 'count', odds, triggers: view.triggers };
}

/** One outcome graded by the runtime's own count grader for this plan's kind. */
function gradeOutcome(plan, outcome, triggers) {
  const policy = { threshold: null, ...plan.target?.policy, zeroPool: outcome.zeroPool };
  const diceGroups = outcome.matches.map((matched, bit) => ({
    groupId: -(bit + 1),
    results: [matched ? 1 : 0],
  }));
  const rolled = {
    zeroPool: outcome.zeroPool,
    total: outcome.zeroPool ? null : outcome.net,
    diceGroups,
    policy,
    countProjection: { successes: 0, cancelled: 0 },
  };
  const { args } = plan;
  if (plan.kind === 'progressive') return gradeCountProgressive(rolled, { triggers });
  if (plan.kind === 'passFail') {
    return gradeCountPassFail(rolled, { required: args.dc, triggers });
  }
  return gradeCountRouted(rolled, {
    required: args.dc,
    type: args.type,
    relativeOutcomes: args.relativeOutcomes,
    fixedOutcomes: args.fixedOutcomes,
    triggers,
    clampToNearest: args.clampToNearest,
    minOutcomeId: args.minOutcomeId,
  });
}

/** The bucket a graded outcome lands in, with its label and whether it counts as a success. */
function bucketOf(plan, graded, { difficulties, awardMode }, text) {
  if (plan.kind === 'progressive') {
    const results = difficulties.map((difficulty, index) => ({ index, difficulty }));
    const { awarded } = resolveProgressiveAward({
      results,
      initialRemaining: graded.value,
      costFor: (result) => Number(result.difficulty),
      awardMode,
      invalidCost: 'skip',
    });
    const copy = text('FABRICATE.Admin.Manager.Checks.Odds.AwardCount', '{awarded} of {of}');
    const label = interpolate(copy, { awarded: awarded.length, of: results.length });
    return { id: `award-${awarded.length}`, label, success: awarded.length > 0 };
  }
  if (plan.kind === 'routed') {
    const id = graded.data.outcomeId ?? '';
    const label =
      graded.outcome || text('FABRICATE.Admin.Manager.Checks.Odds.Unrouted', 'No outcome');
    return { id: id || 'unrouted', label, success: graded.success };
  }
  return graded.success
    ? {
        id: 'success',
        label: text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success'),
        success: true,
      }
    : {
        id: 'failure',
        label: text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailure', 'Failure'),
        success: false,
      };
}

/** Bucket ids worst to best: failure first, unrouted before every tier, fewer awards first. */
function bucketRank(plan) {
  if (plan.kind === 'passFail') return (id) => (id === 'failure' ? 0 : 1);
  if (plan.kind === 'progressive') return (id) => Number(id.slice('award-'.length));
  const order = [
    'unrouted',
    ...routedOutcomeOrder({ ...plan.args, evaluation: SUM_OVER_EVALUATION }),
  ];
  return (id) => (order.includes(id) ? order.indexOf(id) : order.length);
}

/**
 * The rows, worst to best. With cancelling on, net-below-zero mass is split out of the bucket it
 * grades into as a first `botch` row, but only when every such outcome grades as a non-success
 * (for progressive, when every one awards nothing).
 */
function countRows(plan, enumeration, sandbox, text) {
  const buckets = new Map();
  let botch = 0;
  let botchSplits = plan.evaluation.pool.cancel.enabled;
  for (const outcome of enumeration.odds.outcomes) {
    const graded = gradeOutcome(plan, outcome, enumeration.triggers);
    const bucket = bucketOf(plan, graded, sandbox, text);
    const entry = buckets.get(bucket.id) ?? { ...bucket, probability: 0, botch: 0 };
    entry.probability += outcome.probability;
    if (!outcome.zeroPool && outcome.net < 0) {
      entry.botch += outcome.probability;
      botch += outcome.probability;
      if (bucket.success) botchSplits = false;
    }
    buckets.set(bucket.id, entry);
  }
  const rank = bucketRank(plan);
  const rows = [...buckets.values()]
    .map((entry) => ({
      ...entry,
      probability: entry.probability - (botchSplits ? entry.botch : 0),
    }))
    .toSorted((left, right) => rank(left.id) - rank(right.id));
  if (botchSplits && botch > 0) {
    rows.unshift({
      id: 'botch',
      label: text('FABRICATE.Admin.Manager.Checks.Odds.Botch', 'Botch'),
      success: false,
      probability: botch,
    });
  }
  return rows
    .filter((row) => row.probability > 0)
    .map(({ id, label, success, probability }) => ({
      id,
      label,
      success,
      percent: percentOf(probability, 1),
    }));
}

/** The odds heading's adjunct: exact or nearly exact, with the expected net to two decimals. */
function countDomain(odds, text) {
  const expected = Number(odds.expected.toFixed(2)) === 0 ? '0.00' : odds.expected.toFixed(2);
  const shown = expected.replace('-', MINUS);
  const label =
    odds.status === 'exact'
      ? text('FABRICATE.Admin.Manager.Checks.Odds.CountExact', 'exact · expected {expected}')
      : text(
          'FABRICATE.Admin.Manager.Checks.Odds.CountNearlyExact',
          'nearly exact · expected {expected}'
        );
  return { expected, domain: interpolate(label, { expected: shown }) };
}

/** The odds panel's count model: outcome rows, never a net histogram, and the expected net. */
export function buildCountOddsModel(plan, enumeration, sandbox, text) {
  const { kind } = plan;
  const direction = plan.evaluation.direction;
  if (kind === 'progressive' && sandbox.difficulties.length === 0) {
    return { kind, direction, product: 'count', enumerable: false, reason: SANDBOX_ABSENT };
  }
  const rows = countRows(plan, enumeration, sandbox, text);
  const { expected, domain } = countDomain(enumeration.odds, text);
  return { kind, direction, product: 'count', enumerable: true, rows, expected, domain };
}

const MARKS = Object.freeze([
  ['qualified', 'FABRICATE.Admin.Manager.Checks.Simulator.MarkQualified', 'qualified'],
  ['cancelled', 'FABRICATE.Admin.Manager.Checks.Simulator.MarkCancelled', 'cancelled'],
  ['exploded', 'FABRICATE.Admin.Manager.Checks.Simulator.MarkExploded', 'exploded'],
]);

/** "8, qualified and cancelled": the face, then every mark it carries. */
function faceLabel(face, marks, text) {
  if (marks.length === 0) return String(face);
  const words = marks.map((mark) => {
    const [, key, fallback] = MARKS.find(([id]) => id === mark);
    return text(key, fallback);
  });
  const and = text('FABRICATE.Admin.Manager.Checks.Simulator.MarkJoin', ' and ');
  const joined =
    words.length > 1 ? `${words.slice(0, -1).join(', ')}${and}${words.at(-1)}` : words[0];
  const copy = text('FABRICATE.Admin.Manager.Checks.Simulator.FaceMarked', '{face}, {marks}');
  return interpolate(copy, { face, marks: joined });
}

/**
 * Every active face the runner rolled, explosion dice included, marked by the production
 * projection against the executed threshold; the k-th exploding original produced the k-th
 * appended die, as Foundry appends them.
 */
function countFaces(plan, data, text) {
  const group = data?.diceGroups?.[0];
  if (!group || !plan.target?.ok) return [];
  const number = Number(String(group.group).split('d', 1)[0]);
  const policy = { ...plan.target.policy, threshold: data.target };
  const { explodes } = countFacePredicates(policy);
  const results = group.results.map((result, index) => ({
    result,
    exploded: explodes(result, { generated: index >= number }),
  }));
  return projectCountResults({ policy, results, number }).results.map((entry) => {
    const marks = MARKS.map(([id]) => id).filter((id) => entry[id]);
    return {
      index: entry.index,
      face: entry.face,
      marks,
      label: faceLabel(entry.face, marks, text),
    };
  });
}

/**
 * The simulator's count tiles and states: every active face marked, whether the pool was reduced to
 * zero, and whether the net fell below zero. The readout's lines are `checkReadoutModel.js`'s.
 */
export function buildCountReadout(plan, result, text) {
  const data = result?.data ?? {};
  const zeroPool = data.zeroPool === true;
  const net = data.total === null || data.total === undefined ? NaN : Number(data.total);
  return {
    faces: zeroPool ? [] : countFaces(plan, data, text),
    zeroPool,
    botch: Number.isFinite(net) && net < 0,
  };
}

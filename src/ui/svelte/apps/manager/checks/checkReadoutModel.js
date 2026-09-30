/**
 * The Checks Studio simulator's rolled readout: the medallion, the breakdown, the total and its
 * target line, the result card, its one note and the "What happens" rows. Pure; it reads the
 * runner's result and the check's own configuration and re-resolves nothing, `text(key,
 * fallback)` localizes, and every negative number carries U+2212.
 */
import { evaluateCheckBreakage } from '../../../../../toolBreakageRuntime.js';
import { resolveProgressiveAward } from '../../../../../utils/progressiveAward.js';

import { readoutBreakdown, readoutFamily, readsAttributeTarget } from './checkPreview.js';
import { formatSigned, interpolate } from './checksCopy.js';
import { targetRefusalSentence } from './checkTargetStatus.js';
import { buildCountReadout } from './countPreviewModel.js';

const COPY = Object.freeze({
  roll: ['FABRICATE.Admin.Manager.Checks.Simulator.Roll', 'Roll a test check'],
  rollActivity: [
    'FABRICATE.Admin.Manager.Checks.Simulator.RollActivity',
    'Roll a test {activity} check',
  ],
  rollAgain: ['FABRICATE.Admin.Manager.Checks.Simulator.RollAgain', 'Roll again'],
  waiting: [
    'FABRICATE.Admin.Manager.Checks.Simulator.WaitingHint',
    'Roll a test check to see exactly which outcome a {record} lands on and what it costs the character.',
  ],
  record: ['FABRICATE.Admin.Manager.Checks.Simulator.RecordNoun', 'recipe'],
  total: ['FABRICATE.Admin.Manager.Checks.Simulator.CaptionTotal', 'total'],
  net: ['FABRICATE.Admin.Manager.Checks.Simulator.CaptionNet', 'net'],
  vsDc: ['FABRICATE.Admin.Manager.Checks.Simulator.VsDc', 'vs DC {dc}'],
  vsDcMargin: ['FABRICATE.Admin.Manager.Checks.Simulator.VsDcMargin', 'vs DC {dc} · {margin}'],
  inBand: ['FABRICATE.Admin.Manager.Checks.Simulator.InBand', 'in the {min}–{max} band'],
  noBand: ['FABRICATE.Admin.Manager.Checks.Simulator.OutsideBands', 'outside every band'],
  spent: ['FABRICATE.Admin.Manager.Checks.Simulator.ValueSpent', 'value spent'],
  targetMargin: [
    'FABRICATE.Admin.Manager.Checks.Simulator.TargetMargin',
    'target {target} · margin {margin}',
  ],
  needs: ['FABRICATE.Admin.Manager.Checks.Simulator.Needs', 'needs {required} · margin {margin}'],
  needsBotch: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NeedsBotch',
    'needs {required} · a net below zero is a botch',
  ],
  success: ['FABRICATE.Admin.Manager.Checks.Crafting.OutcomeSuccess', 'Success'],
  failure: ['FABRICATE.Admin.Manager.Checks.Crafting.OutcomeFailure', 'Failure'],
  botch: ['FABRICATE.Admin.Manager.Checks.Odds.Botch', 'Botch'],
  produced: [
    'FABRICATE.Admin.Manager.Checks.Simulator.Produced',
    'The {record}’s result group is produced',
  ],
  nothing: ['FABRICATE.Admin.Manager.Checks.Simulator.NothingProduced', 'Nothing is produced'],
  netBelowZero: ['FABRICATE.Admin.Manager.Checks.Simulator.NetBelowZero', 'Net below zero'],
  countsSuccess: [
    'FABRICATE.Admin.Manager.Checks.Simulator.CountsSuccess',
    'Counts as a success · result group bound to this tier',
  ],
  countsFailure: [
    'FABRICATE.Admin.Manager.Checks.Simulator.CountsFailure',
    'Counts as a failure · result group bound to this tier',
  ],
  noTiers: ['FABRICATE.Admin.Manager.Checks.Simulator.NoTiers', 'No tiers configured'],
  noTiersDetail: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NoTiersDetail',
    'Add at least one outcome tier for this check to resolve',
  ],
  awardedOf: ['FABRICATE.Admin.Manager.Checks.Simulator.AwardedOf', '{awarded} of {of} awarded'],
  leftOver: [
    'FABRICATE.Admin.Manager.Checks.Simulator.LeftOver',
    '{remaining} left over — not enough for the next result',
  ],
  fullySpent: ['FABRICATE.Admin.Manager.Checks.Simulator.FullySpent', 'The value is fully spent'],
  awards: ['FABRICATE.Admin.Manager.Checks.Simulator.AwardValue', 'Awards {value}'],
  awardAll: ['FABRICATE.Admin.Manager.Checks.Simulator.AwardAll', 'Awards every result'],
  awardDetail: [
    'FABRICATE.Admin.Manager.Checks.Simulator.AwardDetail',
    'The value is spent down the recipe’s ordered results, each costing its own difficulty.',
  ],
});

const NOTES = Object.freeze({
  under: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NoteMarginUnder',
    'Margin is shown so that higher is always better: how far under the target the total landed.',
  ],
  over: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NoteMarginOver',
    'Margin is shown so that higher is always better: how far over the target the total landed.',
  ],
  count: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NoteMarginCount',
    'Margin is shown so that higher is always better: successes over what was needed.',
  ],
  zeroPool: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NoteZeroPool',
    'The pool was reduced to zero, so the check fails automatically.',
  ],
  stepTarget: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NoteStepTarget',
    'Trigger fired — the result is forced to {tier}.',
  ],
  up: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NoteStepUp',
    'Trigger fired — the result steps up {steps} tier.',
  ],
  upMany: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NoteStepsUp',
    'Trigger fired — the result steps up {steps} tiers.',
  ],
  down: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NoteStepDown',
    'Trigger fired — the result steps down {steps} tier.',
  ],
  downMany: [
    'FABRICATE.Admin.Manager.Checks.Simulator.NoteStepsDown',
    'Trigger fired — the result steps down {steps} tiers.',
  ],
});

/** The forced note by runner kind, then by the forced disposition (R5). */
const FORCED_NOTES = Object.freeze({
  passFail: {
    success: [
      'FABRICATE.Admin.Manager.Checks.Simulator.NoteForcedSuccess',
      'Trigger fired — automatic success.',
    ],
    failure: [
      'FABRICATE.Admin.Manager.Checks.Simulator.NoteForcedFailure',
      'Trigger fired — automatic failure.',
    ],
  },
  progressive: {
    success: [
      'FABRICATE.Admin.Manager.Checks.Simulator.NoteForcedAllAwarded',
      'Trigger fired — every result is awarded.',
    ],
    failure: [
      'FABRICATE.Admin.Manager.Checks.Simulator.NoteForcedNoneAwarded',
      'Trigger fired — nothing is awarded.',
    ],
  },
  routed: {
    success: [
      'FABRICATE.Admin.Manager.Checks.Simulator.NoteForcedBest',
      'Trigger fired — forced to the best succeeding tier.',
    ],
    failure: [
      'FABRICATE.Admin.Manager.Checks.Simulator.NoteForcedWorst',
      'Trigger fired — forced to the worst failing tier.',
    ],
  },
});

/** A routed success forced where no succeeding tier exists, so no tier caught it. */
const FORCED_UNCAUGHT = Object.freeze([
  'FABRICATE.Admin.Manager.Checks.Simulator.NoteForcedNoSucceedingTier',
  'Trigger fired — forced to success, but no succeeding tier exists, so nothing is produced.',
]);

const ROWS = Object.freeze({
  produced: ['FABRICATE.Admin.Manager.Checks.Simulator.FactResults', 'Result group produced'],
  full: ['FABRICATE.Admin.Manager.Checks.Simulator.FactFull', 'full'],
  ingredients: ['FABRICATE.Admin.Manager.Checks.Simulator.FactIngredients', 'Ingredients consumed'],
  returned: [
    'FABRICATE.Admin.Manager.Checks.Simulator.FactIngredientsReturned',
    'Ingredients returned',
  ],
  item: ['FABRICATE.Admin.Manager.Checks.Simulator.FactItemConsumed', 'Item consumed'],
  itemReturned: ['FABRICATE.Admin.Manager.Checks.Simulator.FactItemReturned', 'Item returned'],
  asListed: ['FABRICATE.Admin.Manager.Checks.Simulator.FactAsListed', 'as listed'],
  on: ['FABRICATE.Admin.Manager.Checks.Simulator.FactPolicyOn', 'policy on'],
  off: ['FABRICATE.Admin.Manager.Checks.Simulator.FactPolicyOff', 'policy off'],
  tools: ['FABRICATE.Admin.Manager.Checks.Simulator.FactTools', 'Required tools break'],
  survive: ['FABRICATE.Admin.Manager.Checks.Simulator.FactToolsSurvive', 'Tools survive'],
  byTrigger: ['FABRICATE.Admin.Manager.Checks.Simulator.FactByTrigger', 'by trigger'],
  byTier: ['FABRICATE.Admin.Manager.Checks.Simulator.FactByTier', 'by tier'],
  policy: ['FABRICATE.Admin.Manager.Checks.Simulator.FactFailurePolicy', 'Failure policy applies'],
  result: ['FABRICATE.Admin.Manager.Checks.Simulator.FactResultN', 'Result {n}'],
  awarded: ['FABRICATE.Admin.Manager.Checks.Simulator.FactAwarded', 'awarded'],
  partial: ['FABRICATE.Admin.Manager.Checks.Simulator.FactPartial', 'partial'],
  recovered: ['FABRICATE.Admin.Manager.Checks.Simulator.FactNothingRecovered', 'Nothing recovered'],
});

/** The failure-result policy's own row and its short meta, by policy. */
const FAILURE_POLICY_ROWS = Object.freeze({
  always: {
    icon: 'fas fa-box-open',
    tone: 'warning',
    label: [
      'FABRICATE.Admin.Manager.Checks.Simulator.FactFailureAlways',
      'Failure result produced',
    ],
    meta: ['FABRICATE.Admin.Manager.Checks.Simulator.FactPolicyAlways', 'always'],
  },
  perRecord: {
    icon: 'fas fa-scroll',
    tone: 'neutral',
    label: [
      'FABRICATE.Admin.Manager.Checks.Simulator.FactFailurePerRecord',
      'Failure result if this {record} defines one',
    ],
    meta: ['FABRICATE.Admin.Manager.Checks.Simulator.FactPolicyPerRecord', 'per {record}'],
  },
  never: {
    icon: 'fas fa-ban',
    tone: 'danger',
    label: ['FABRICATE.Admin.Manager.Checks.Simulator.FactNothingProduced', 'Nothing produced'],
    meta: ['FABRICATE.Admin.Manager.Checks.Simulator.FactPolicyNever', 'never'],
  },
});

/** Resolve one `[key, fallback]` pair and interpolate it. */
function say(text, [key, fallback], data = null) {
  return interpolate(text(key, fallback), data);
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
  if (plan.evaluation.product === 'count') return 'dynamic-required';
  return readsAttributeTarget(plan) ? 'dynamic-target' : 'dynamic-dc';
}

/** A number the result carries, or NaN for `null` and `undefined`, which `Number` reads as 0. */
function finite(value) {
  return value === null || value === undefined ? NaN : Number(value);
}

/** The facts every part of the readout reads, gathered once. */
function readoutFacts(input, text) {
  const { plan, result } = input;
  const family = readoutFamily(plan);
  const data = result.data ?? {};
  const count = family === 'count' ? buildCountReadout(plan, result) : null;
  const unrouted = plan.kind === 'routed' && !result.outcome;
  const success = count?.zeroPool || unrouted ? false : result.success === true;
  return {
    ...input,
    family,
    data,
    count,
    success,
    unrouted,
    total: finite(data.total),
    recordNoun: input.recordNoun || say(text, COPY.record),
    fixedRanges: plan.kind === 'routed' && plan.args?.type === 'fixed',
    botch: Boolean(count?.botch) && !success,
    award: plan.kind === 'progressive' ? progressiveAward(result, input.sandbox) : null,
  };
}

/** The progressive spend of the rolled value down the sandbox order, or null with no order. */
function progressiveAward(result, sandbox) {
  const difficulties = Array.isArray(sandbox?.difficulties) ? sandbox.difficulties : [];
  if (difficulties.length === 0) return null;
  const results = difficulties.map((difficulty, index) => ({ index, difficulty }));
  const forcedAll = result.data?.forcedOutcome === 'success';
  const spend = resolveProgressiveAward({
    results,
    initialRemaining: Math.max(0, finite(result.value) || 0),
    costFor: (entry) => Number(entry.difficulty),
    awardMode: sandbox.awardMode || 'equal',
    invalidCost: 'skip',
  });
  return {
    awarded: spend.awarded,
    partial: spend.partialResult,
    of: results.length,
    remaining: forcedAll ? 0 : spend.remaining,
  };
}

/** The medallion: the first face for a fixed DC, else the total or the net. */
function readoutMedallion(facts, text) {
  const { family, data, count, total } = facts;
  if (count?.zeroPool) return { value: '0', caption: say(text, COPY.net) };
  if (family === 'count') return { value: formatSigned(total), caption: say(text, COPY.net) };
  const group = data.diceGroups?.[0];
  if (family === 'fixedOver' && group) {
    const [, sides] = String(group.group ?? '').split('d', 2);
    return { value: String(group.results?.[0] ?? ''), caption: `d${sides}` };
  }
  return { value: formatSigned(total), caption: say(text, COPY.total) };
}

/** The fixed range the total fell in, the highest start winning, whatever a trigger stepped to. */
function rolledBand(plan, total) {
  const bands = Array.isArray(plan.args?.fixedOutcomes) ? plan.args.fixedOutcomes : [];
  const holding = bands.filter((band) => Number(band.start) <= total && total <= Number(band.end));
  return holding.toSorted((left, right) => Number(right.start) - Number(left.start))[0] ?? null;
}

/** A fixed DC's line: the DC alone, the DC and margin, the band, or the spent value. */
function fixedOverGrading(facts, text) {
  const { plan, total } = facts;
  const none = { target: null, margin: null, marginKind: '' };
  if (plan.kind === 'progressive') return { ...none, targetLine: say(text, COPY.spent) };
  if (facts.fixedRanges) {
    const band = rolledBand(plan, total);
    const targetLine = band
      ? say(text, COPY.inBand, { min: band.start, max: band.end })
      : say(text, COPY.noBand);
    return { ...none, targetLine };
  }
  const margin = total - plan.dc;
  if (plan.kind === 'passFail') {
    return {
      target: plan.dc,
      margin,
      marginKind: '',
      targetLine: say(text, COPY.vsDc, { dc: plan.dc }),
    };
  }
  const signed = formatSigned(margin, { plus: true });
  const targetLine = say(text, COPY.vsDcMargin, { dc: plan.dc, margin: signed });
  return { target: plan.dc, margin, marginKind: 'margin', targetLine };
}

/** A roll-under or character value reads the executed target and margin, when there is one. */
function targetGrading({ data }, text) {
  const target = finite(data.target);
  const margin = finite(data.margin);
  // Otherwise and fixed ranges execute with no target, which is not a target of 0.
  if (!Number.isFinite(target) || !Number.isFinite(margin)) {
    return { target: null, margin: null, marginKind: '', targetLine: '' };
  }
  const signed = formatSigned(margin, { plus: true });
  const targetLine = say(text, COPY.targetMargin, { target, margin: signed });
  return { target, margin, marginKind: 'margin', targetLine };
}

/** A count's line: the count needed and the margin, or why a net below zero botched. */
function countGrading(facts, text) {
  const { plan, count, total, data, botch } = facts;
  if (plan.kind === 'progressive') {
    return { target: null, margin: null, marginKind: '', targetLine: say(text, COPY.spent) };
  }
  if (count.zeroPool) {
    const required = plan.dc;
    const margin = -required;
    const signed = formatSigned(margin, { plus: true });
    const targetLine = say(text, COPY.needs, { required, margin: signed });
    return { target: required, margin, marginKind: 'margin', targetLine };
  }
  // "needs" is the check's own required count; a routed `data.margin` is measured from the
  // rolled tier's floor, which is not what the check needs.
  const required = Number.isFinite(plan.dc) ? plan.dc : total - finite(data.margin);
  if (!Number.isFinite(total) || !Number.isFinite(required)) {
    return { target: null, margin: null, marginKind: '', targetLine: '' };
  }
  const margin = total - required;
  if (botch) {
    const targetLine = say(text, COPY.needsBotch, { required });
    return { target: required, margin, marginKind: 'botch', targetLine };
  }
  const signed = formatSigned(margin, { plus: true });
  const targetLine = say(text, COPY.needs, { required, margin: signed });
  return { target: required, margin, marginKind: 'margin', targetLine };
}

const GRADINGS = Object.freeze({
  fixedOver: fixedOverGrading,
  target: targetGrading,
  count: countGrading,
});

/** The card's detail: produced, nothing, or a count's net below zero. */
function outcomeDetail(facts, text) {
  if (facts.success) return say(text, COPY.produced, { record: facts.recordNoun });
  return say(text, facts.botch ? COPY.netBelowZero : COPY.nothing);
}

/** A routed card: the tier and, for a fixed DC, whether it counts as a success. */
function routedCard(facts, text) {
  const { plan, result, success, family } = facts;
  if (!result.outcome) {
    const tiers =
      plan.args?.type === 'fixed' ? plan.args.fixedOutcomes : plan.args?.relativeOutcomes;
    if (!Array.isArray(tiers) || tiers.length === 0) {
      return [say(text, COPY.noTiers), say(text, COPY.noTiersDetail), false];
    }
    // A result no tier caught still passed or failed, which is what the card states.
    return [say(text, success ? COPY.success : COPY.failure), outcomeDetail(facts, text), success];
  }
  const title = facts.botch ? say(text, COPY.botch) : result.outcome;
  if (family !== 'fixedOver') return [title, outcomeDetail(facts, text), success];
  return [title, say(text, success ? COPY.countsSuccess : COPY.countsFailure), success];
}

/** A progressive card: what the value bought down the sandbox order (R8). */
function progressiveCard({ award, result }, text) {
  if (!award) {
    // A forced success spends MAX_SAFE_INTEGER, which is every result rather than a number.
    const title =
      result.data?.forcedOutcome === 'success'
        ? say(text, COPY.awardAll)
        : say(text, COPY.awards, { value: String(result.value ?? 0) });
    return [title, say(text, COPY.awardDetail), true];
  }
  const title = say(text, COPY.awardedOf, { awarded: award.awarded.length, of: award.of });
  const detail =
    award.remaining > 0
      ? say(text, COPY.leftOver, { remaining: award.remaining })
      : say(text, COPY.fullySpent);
  return [title, detail, award.awarded.length > 0];
}

/** The result card, toned by the graded result. */
function readoutCard(facts, text) {
  const { plan, success, count } = facts;
  let parts;
  if (count?.zeroPool && plan.kind !== 'progressive') {
    parts = [say(text, COPY.failure), say(text, COPY.nothing), false];
  } else if (plan.kind === 'progressive') {
    parts = progressiveCard(facts, text);
  } else if (plan.kind === 'routed') {
    parts = routedCard(facts, text);
  } else {
    const title = facts.botch ? COPY.botch : success ? COPY.success : COPY.failure;
    parts = [say(text, title), outcomeDetail(facts, text), success];
  }
  const [title, detail, good] = parts;
  return {
    tone: good ? 'success' : 'danger',
    icon: good ? 'fas fa-circle-check' : 'fas fa-circle-xmark',
    title,
    detail,
  };
}

/** A fixed DC's note: only when a trigger stepped or placed the tier. */
function stepNote({ data, result }, text) {
  const step = data.tierStepApplied;
  if (!step) return null;
  if (step.mode === 'target') {
    return { kind: 'trigger', text: say(text, NOTES.stepTarget, { tier: result.outcome ?? '' }) };
  }
  const many = step.steps !== 1;
  const copy =
    step.mode === 'up' ? (many ? NOTES.upMany : NOTES.up) : many ? NOTES.downMany : NOTES.down;
  return { kind: 'trigger', text: say(text, copy, { steps: step.steps }) };
}

/** The margin note a roll-under, character value or count carries whenever its line shows one. */
function marginNote(facts, grading, text) {
  if (facts.plan.kind === 'progressive' || grading.marginKind !== 'margin') return null;
  let copy = NOTES.count;
  if (facts.family === 'target')
    copy = facts.plan.evaluation.direction === 'under' ? NOTES.under : NOTES.over;
  return { kind: 'margin', text: say(text, copy) };
}

/** The one note slot: a zero pool, a trigger-forced outcome, a fixed DC's step, or the margin. */
function readoutNote(facts, grading, text) {
  const { data, plan, count, family } = facts;
  if (count?.zeroPool) return { kind: 'zero-pool', text: say(text, NOTES.zeroPool) };
  if (facts.unrouted && data.forcedOutcome === 'success') {
    return { kind: 'forced', text: say(text, FORCED_UNCAUGHT) };
  }
  const forced = FORCED_NOTES[plan.kind]?.[data.forcedOutcome];
  if (forced) return { kind: 'forced', text: say(text, forced) };
  if (family === 'fixedOver') return stepNote(facts, text);
  return marginNote(facts, grading, text);
}

/**
 * How a roll breaks the required tools, by the engine's own verdict and precedence: `tier`,
 * `trigger`, or `''`. The preview's result is the runner's own, which the engine marks evaluated.
 */
function toolBreak({ plan, result }) {
  const triggers = Array.isArray(plan.args?.triggers) ? plan.args.triggers : [];
  const verdict = evaluateCheckBreakage({
    checkBreakage: { triggers },
    checkResult: { ...result, engineEvaluated: true },
  });
  if (!verdict.forceBreak) return '';
  return verdict.triggerId === 'legacyBreakTools' ? 'tier' : 'trigger';
}

/** A "Required tools break" row naming what broke them, or null when nothing did. */
function brokenToolsRow(facts, text) {
  const cause = toolBreak(facts);
  if (!cause) return null;
  const meta = say(text, cause === 'trigger' ? ROWS.byTrigger : ROWS.byTier);
  return { id: 'tools', icon: 'fas fa-hammer', tone: 'danger', label: say(text, ROWS.tools), meta };
}

/** The tool row: breaking by trigger or tier, else the activity's own failure policy. */
function toolRow(facts, text) {
  const broken = brokenToolsRow(facts, text);
  // Gathering has no tool-breakage policy of its own, so only a trigger or a tier breaks there.
  if (broken || facts.success || facts.activity === 'gathering') return broken;
  const policyOn = facts.consumption?.breakToolsOnFail === true;
  return {
    id: 'tools',
    icon: 'fas fa-hammer',
    tone: policyOn ? 'danger' : 'success',
    label: say(text, policyOn ? ROWS.tools : ROWS.survive),
    meta: say(text, policyOn ? ROWS.on : ROWS.off),
  };
}

/** The ingredient row; salvage names its item, and gathering consumes nothing. */
function ingredientRow({ activity, success, consumption }, text) {
  if (activity === 'gathering') return null;
  const salvage = activity === 'salvage';
  const consumed = say(text, salvage ? ROWS.item : ROWS.ingredients);
  const base = { id: 'ingredients', icon: 'fas fa-flask' };
  if (success) return { ...base, tone: 'neutral', label: consumed, meta: say(text, ROWS.asListed) };
  if (consumption?.consumeOnFail === true) {
    return { ...base, tone: 'danger', label: consumed, meta: say(text, ROWS.on) };
  }
  const returned = say(text, salvage ? ROWS.itemReturned : ROWS.returned);
  return { ...base, tone: 'success', label: returned, meta: say(text, ROWS.off) };
}

/** The activity's own failure-result policy, `perRecord` for anything unrecognized. */
function failurePolicy(facts) {
  return FAILURE_POLICY_ROWS[facts.failureResultPolicy] ?? FAILURE_POLICY_ROWS.perRecord;
}

/** The result-group row a success produces, naming what it produced. */
function producedRow(meta, text) {
  const label = say(text, ROWS.produced);
  return { id: 'result-group', icon: 'fas fa-box-open', tone: 'success', label, meta };
}

/** A fixed DC lists the result or the failure policy, then ingredients and tools. */
function fixedOverRows(facts, card, text) {
  const rows = [];
  if (facts.success) {
    rows.push(producedRow(facts.plan.kind === 'routed' ? card.title : say(text, ROWS.full), text));
  } else {
    const policy = failurePolicy(facts);
    const data = { record: facts.recordNoun };
    rows.push({
      id: 'failure-result',
      icon: policy.icon,
      tone: policy.tone,
      label: say(text, policy.label, data),
      meta: say(text, policy.meta, data),
    });
  }
  rows.push(ingredientRow(facts, text), toolRow(facts, text));
  return rows.filter(Boolean);
}

/** Every other evaluation lists one row, plus a tool row only when the roll breaks tools (R3). */
function singleRow(facts, card, text) {
  const first = facts.success
    ? producedRow(card.title, text)
    : {
        id: 'failure-result',
        icon: 'fas fa-ban',
        tone: 'danger',
        label: say(text, ROWS.policy),
        meta: say(text, failurePolicy(facts).meta, { record: facts.recordNoun }),
      };
  return [first, brokenToolsRow(facts, text)].filter(Boolean);
}

/** One row per awarded result, "Result 1", "Result 2"…, or that nothing was recovered (R8). */
function progressiveRows({ award }, text) {
  if (!award) return [];
  if (award.awarded.length === 0) {
    const label = say(text, ROWS.recovered);
    return [{ id: 'nothing', icon: 'fas fa-ban', tone: 'muted', label, meta: '—' }];
  }
  return award.awarded.map((entry, index) => ({
    id: `result-${index + 1}`,
    icon: 'fas fa-box-open',
    tone: 'success',
    label: say(text, ROWS.result, { n: index + 1 }),
    meta: say(text, entry === award.partial ? ROWS.partial : ROWS.awarded),
  }));
}

/** The "What happens" rows the rolled result leads to, from the activity's own policies. */
function readoutRows(facts, card, text) {
  if (facts.plan.kind === 'progressive') return progressiveRows(facts, text);
  if (facts.family === 'fixedOver') return fixedOverRows(facts, card, text);
  return singleRow(facts, card, text);
}

/** The total as shown, with the true minus, and as the number it is; a zero pool shows `0`. */
function readoutTotal({ count, total }) {
  if (count?.zeroPool) return { total: '0', totalValue: 0 };
  if (!Number.isFinite(total)) return { total: '', totalValue: null };
  return { total: formatSigned(total), totalValue: total };
}

/** The rolled half of the readout, empty before a roll and while abstaining. */
function rolledReadout(input, text) {
  const empty = {
    medallion: null,
    breakdown: '',
    total: '',
    totalValue: null,
    targetLine: '',
    target: null,
    margin: null,
    marginKind: '',
    card: null,
    note: null,
    rows: [],
    count: null,
  };
  if (!input.result || input.abstention) return empty;
  const facts = readoutFacts(input, text);
  const grading = GRADINGS[facts.family](facts, text);
  const card = readoutCard(facts, text);
  return {
    medallion: readoutMedallion(facts, text),
    breakdown: readoutBreakdown(input.result, input, text),
    ...readoutTotal(facts),
    ...grading,
    card,
    note: readoutNote(facts, grading, text),
    rows: readoutRows(facts, card, text),
    count: facts.count,
  };
}

/**
 * The simulator readout. `resolved` is false for a formula that does not reduce for the actor;
 * `abstention` withholds the roll, the target and the margin, stating why instead. `consumption`
 * is the activity's own `{ consumeOnFail, breakToolsOnFail }` and `sandbox` a progressive check's
 * `{ difficulties, awardMode }`.
 */
export function buildReadoutModel(
  {
    plan,
    result = null,
    rolling = false,
    resolved = true,
    abstention = null,
    actorName = '',
    activity = 'crafting',
    activityLabel = '',
    recordNoun = '',
    failureResultPolicy = 'perRecord',
    consumption = {},
    sandbox = null,
  },
  text
) {
  const input = { plan, result, abstention, actorName, activity, recordNoun, failureResultPolicy };
  const noun = recordNoun || say(text, COPY.record);
  return {
    kind: plan.kind,
    product: plan.evaluation.product ?? 'sum',
    direction: plan.evaluation.direction,
    hasFormula: plan.evaluation.product === 'count' || String(plan.formula ?? '').trim() !== '',
    dynamicNote: dynamicNote(plan),
    resolved,
    rolling,
    abstain: abstention
      ? { reason: abstention.reason, hint: abstentionHint(abstention, text) }
      : null,
    result,
    rollLabel: rollLabel(result, activityLabel, text),
    waitingHint: say(text, COPY.waiting, { record: noun }),
    ...rolledReadout({ ...input, consumption, sandbox }, text),
  };
}

/** "Roll a test crafting check", or "Roll again" once a result is showing. */
function rollLabel(result, activityLabel, text) {
  if (result) return say(text, COPY.rollAgain);
  return activityLabel
    ? say(text, COPY.rollActivity, { activity: activityLabel })
    : say(text, COPY.roll);
}

/** The single and bulk check prompt: view preparation, the modal surface and answer translation. */
import { publicAdditionalDiceOffer } from '../../../../systems/additionalDiceReach.js';
import {
  bracketBonusExpression,
  publicAdvantageOffer,
} from '../../../../systems/checkAdvantage.js';
import { isFixedSumOver } from '../../../../systems/checkTarget.js';
import { describeCountPolicy } from '../../../../systems/countEvaluation.js';
import { fill } from '../../../../utils/fillPlaceholders.js';
import { additionalDiceCopy } from '../../../presenters/additionalDicePrompt.js';
import { countFaceClauses } from '../manager/checks/countInsetModel.js';

import { openRollPromptModal } from './rollPromptHost.js';
import { rollPromptTarget } from './rollPromptTarget.js';

// Legacy tokens on both versions (issue 1043): V14 maps them in Roll#toMessage, and core.messageMode is unregistered on V13, where reading it throws.
const ROLL_MODES = [
  ['publicroll', 'RollModePublic', 'Public roll'],
  ['gmroll', 'RollModePrivate', 'Private GM roll'],
  ['blindroll', 'RollModeBlind', 'Blind GM roll'],
  ['selfroll', 'RollModeSelf', 'Self roll'],
];

const ADVANTAGES = new Set(['normal', 'advantage', 'disadvantage']);

let surfaceOverride = null;

/**
 * Replace the modal surface for a Node suite that drives engine code with no DOM, returning the
 * restore. The surface receives the prepared view and answers like the modal, or `null`.
 */
export function overrideRollPromptSurface(open) {
  const previous = surfaceOverride;
  surfaceOverride = open;
  return () => {
    surfaceOverride = previous;
  };
}

function resolveSurface() {
  if (surfaceOverride) return surfaceOverride;
  return globalThis.document?.body ? openRollPromptModal : null;
}

function supportedRollMode(value, fallback = 'publicroll') {
  return ROLL_MODES.some(([mode]) => mode === value) ? value : fallback;
}

function localize(key, fallback) {
  const value = globalThis.game?.i18n?.localize?.(key);
  return typeof value === 'string' && value && value !== key ? value : fallback;
}

function promptLabel(name, fallback) {
  return localize(`FABRICATE.App.RollPrompt.${name}`, fallback);
}

function copy() {
  return {
    modifiers: promptLabel('Modifiers', 'Modifiers'),
    modifierChoice: promptLabel('CheckModifier', 'Check modifier'),
    unnamedModifier: promptLabel('UnnamedModifier', 'Unnamed modifier'),
    unnamedSubject: promptLabel('UnnamedSubject', 'Unnamed item'),
    pickUpTo: promptLabel('PickUpTo', 'Pick up to {count}'),
    eachAdds: promptLabel('EachAdds', 'Each adds to the total.'),
    bonus: promptLabel('SituationalBonus', 'Situational bonus'),
    bonusPlaceholder: promptLabel('BonusPlaceholder', '+2 or 1d4'),
    bonusHelp: promptLabel(
      'BonusHelp',
      'A bonus adds to the total. A rolled bonus such as 1d4 is rolled with the check.'
    ),
    rollMode: promptLabel('RollMode', 'Roll mode'),
    meet: promptLabel('MeetOrBeat', 'meet or beat'),
    exceed: promptLabel('Beat', 'beat'),
    bulkNote: promptLabel('BulkNote', 'One choice below applies to every roll in the batch.'),
    bulkRows: promptLabel('BulkRows', 'Rolls in this batch'),
    noCheck: promptLabel('NoCheck', 'No check'),
    noSingleTarget: promptLabel('NoSingleTarget', 'No single target'),
    dcValue: promptLabel('DcValue', 'DC {dc}'),
    targetValue: promptLabel('TargetValue', 'Target {target}'),
    countNeed: promptLabel('CountNeed', '{count} needed'),
    roll: promptLabel('roll', 'Roll'),
    advantage: promptLabel('advantage', 'Advantage'),
    disadvantage: promptLabel('disadvantage', 'Disadvantage'),
    close: promptLabel('Close', 'Close'),
  };
}

function planModifierChoice(choice) {
  const options = Array.isArray(choice?.modifiers) ? choice.modifiers : [];
  const rawCap = Number(choice?.maxPicks);
  const maxPicks = Math.max(
    Math.min(Number.isInteger(rawCap) && rawCap > 0 ? rawCap : 1, options.length),
    1
  );
  const defaults = Array.isArray(choice?.defaultSelectedIds)
    ? choice.defaultSelectedIds
    : [choice?.defaultSelectedId];
  return {
    options,
    maxPicks,
    defaultSelectedIds: defaults.filter((id) => typeof id === 'string' && id).slice(0, maxPicks),
  };
}

/** A leading `+` is dropped and blank input means no bonus; anything else is the player's text. */
export function normalizeSituationalBonus(value) {
  const bonus = String(value ?? '')
    .replace(/^\s*\+/, '')
    .trim();
  return bonus || null;
}

/** Why a choice of `dice` additional dice refuses under `offer`, else null; zero never refuses. */
function additionalDiceChoiceRefusal(dice, offer) {
  if (dice === 0) return null;
  if (!offer) return 'notOffered';
  if (!Number.isInteger(dice) || dice < 0) return 'choiceInvalid';
  if (offer.unavailable) return offer.unavailable;
  return dice > offer.limit ? 'choiceAboveLimit' : null;
}

/**
 * Any answer but an explicit confirmation is a dismissal; the pick cap is re-imposed here, and an
 * additional-dice choice the offer does not admit keeps its value, never clamped, with its refusal.
 */
export function translatePromptAnswer(
  answer,
  { defaultRollMode, choicePlan, additionalDiceOffer = null }
) {
  if (answer?.confirmed !== true) return { confirmed: false };
  const result = {
    confirmed: true,
    bonus: normalizeSituationalBonus(answer.bonus),
    rollMode: supportedRollMode(answer.rollMode, defaultRollMode),
    advantage: ADVANTAGES.has(answer.advantage) ? answer.advantage : 'normal',
  };
  if (choicePlan.options.length > 0) {
    const picked = Array.isArray(answer.chosenModifierIds)
      ? answer.chosenModifierIds
      : choicePlan.defaultSelectedIds;
    const ids = picked.map(String).slice(0, choicePlan.maxPicks);
    result.chosenModifierIds = ids;
    if (ids.length > 0) result.chosenModifierId = ids[0];
  }
  const dice = answer.additionalDice ?? 0;
  if (additionalDiceOffer || dice !== 0) {
    const refusal = additionalDiceChoiceRefusal(dice, additionalDiceOffer);
    result.additionalDice = dice;
    if (refusal) result.additionalDiceRefusal = refusal;
  }
  return result;
}

/** A summed roll-under check's wording: the chip names a target, and every bonus raises it. */
function underCopy() {
  return {
    meet: promptLabel('StayAtOrUnder', 'stay at or under'),
    exceed: promptLabel('StayUnder', 'stay under'),
    formulaNote: promptLabel('ComparedAsRolled', 'The dice are compared as rolled.'),
    targetBase: promptLabel('TargetBase', 'Base {value}'),
    targetValueOf: promptLabel('TargetValueOf', '{actor} {source} {value}'),
    targetAdjustment: promptLabel('TargetAdjustment', '{label} {value}'),
    targetDifficulty: promptLabel('TargetDifficulty', 'difficulty {value}'),
    targetTools: promptLabel('TargetTools', 'tools {value}'),
    targetModifiers: promptLabel('TargetModifiers', 'modifiers {value}'),
    targetSituational: promptLabel('TargetSituational', 'situational {value}'),
    targetPending: promptLabel('TargetPending', '{target} + {formula}'),
    eachAdds: promptLabel('EachRaises', 'Each raises the target.'),
    bonusHelp: promptLabel(
      'BonusHelpUnder',
      'A bonus raises the target. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
    ),
  };
}

/** A count check's wording: every modifier and bonus adds dice or moves the threshold. */
function countCopy(destination) {
  const threshold = destination === 'threshold';
  return {
    eachAdds: threshold
      ? promptLabel('EachMovesThreshold', 'Each moves the threshold.')
      : promptLabel('EachAddsDice', 'Each adds dice.'),
    bonusHelp: threshold
      ? promptLabel(
          'BonusHelpThreshold',
          'A bonus moves the threshold by that much. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
        )
      : promptLabel(
          'BonusHelpDice',
          'A bonus adds that many dice. A rolled bonus such as 1d4 is rolled first, and its result is applied.'
        ),
  };
}

function needText(need, labels) {
  if (need?.kind === 'dc') return fill(labels.dcValue, { dc: need.dc });
  if (need?.kind === 'target') return fill(labels.targetValue, { target: need.target });
  if (need?.kind === 'successes') return fill(labels.countNeed, { count: need.count });
  return need?.kind === 'noSingleTarget' ? labels.noSingleTarget : labels.noCheck;
}

/** A count check's successes chip, `{count} successes needed`, blank when nothing is required. */
function countNeededText({ required }) {
  if (required === 1)
    return localize('FABRICATE.App.RollPrompt.CountNeededOne', '1 success needed');
  if (required === null) return '';
  return fill(localize('FABRICATE.App.RollPrompt.CountNeeded', '{count} successes needed'), {
    count: required,
  });
}

/**
 * The templates a count line and its note settle into as the player picks and types, and the
 * face clauses (issue 2006), which no pick or bonus moves, formatted once from the actual faces.
 */
function countLabels({ count, direction, comparison }) {
  const rule = (face) =>
    face && { kind: face.kind, value: face.kind === 'from' ? face.face : null, once: face.once };
  const described = describeCountPolicy({
    die: count.die,
    direction,
    comparison,
    explode: rule(count.explode),
    cancel: rule(count.cancel),
  });
  return {
    // The chat card's own pool line, so the two cannot word it differently.
    countFormula: localize(
      'FABRICATE.Check.CountRoll.Pool',
      '{pool}d{die} · each {comparison} {threshold}'
    ),
    countPendingDice: localize(
      'FABRICATE.App.RollPrompt.CountPendingDice',
      '{pool}d{die} + {formula} dice · each {comparison} {threshold}'
    ),
    countPendingThreshold: localize(
      'FABRICATE.App.RollPrompt.CountPendingThreshold',
      '{pool}d{die} · each {comparison} {threshold} + {formula}'
    ),
    countRule: localize(
      'FABRICATE.App.RollPrompt.CountRule',
      'Success on {comparison} {threshold}'
    ),
    countRuleCharacter: localize(
      'FABRICATE.App.RollPrompt.CountRuleCharacter',
      'Success on {comparison} {threshold} (character value {value})'
    ),
    countRuleMoved: localize(
      'FABRICATE.App.RollPrompt.CountRuleMoved',
      '{rule}, moved {moved} by modifiers'
    ),
    countFaces: countFaceClauses(described, localize)
      .map((clause) => ` · ${clause}`)
      .join(''),
    countZeroPool: localize(
      'FABRICATE.App.RollPrompt.CountZeroPool',
      'This roll fails automatically: the pool is reduced to zero.'
    ),
  };
}

function targetText(data, labels) {
  if (!Number.isFinite(data.dc)) return '';
  return data.direction === 'under' || data.targetSource === 'attribute'
    ? fill(labels.targetValue, { target: data.dc })
    : fill(labels.dcValue, { dc: data.dc });
}

/** The labels a check's product and direction word the prompt with. */
function labelsFor(data) {
  if (data.count) {
    return { ...copy(), ...countCopy(data.count.destination), ...countLabels(data) };
  }
  if (data.countDestination) return { ...copy(), ...countCopy(data.countDestination) };
  return data.direction === 'under' ? { ...copy(), ...underCopy() } : copy();
}

/** The target, bulk-need and pick-cap copy, formatted here so the component renders strings only. */
function formatCopy(data, choicePlan) {
  const labels = labelsFor(data);
  const formatted = {
    labels: { ...labels, pickUpTo: fill(labels.pickUpTo, { count: choicePlan.maxPicks }) },
    dcText: data.count ? '' : targetText(data, labels),
  };
  if (data.count) {
    // The line and note as they open, with the default picks and no bonus yet.
    const line = rollPromptTarget(
      { ...data, labels: formatted.labels, choicePlan },
      choicePlan.defaultSelectedIds,
      ''
    );
    formatted.formula = line.formula;
    formatted.neededText = countNeededText(data.count);
    if (line.note) formatted.labels.formulaNote = line.note;
  }
  // The one target chip: a count's successes needed, else the DC or target and its comparison.
  if (data.additionalDiceOffer) {
    formatted.labels.additionalDice = additionalDiceCopy(data.additionalDiceOffer, localize);
  }
  if (data.additionalDiceMixed) {
    formatted.labels.additionalDiceMixed = localize(
      'FABRICATE.App.RollPrompt.AdditionalDice.Bulk.Mixed',
      'Rolls in this batch use different resources, so no dice can be added.'
    );
  }
  formatted.chipText = data.count
    ? formatted.neededText
    : formatted.dcText &&
      `${formatted.dcText} · ${data.comparison === 'exceed' ? labels.exceed : labels.meet}`;
  if (Array.isArray(data.subjects)) {
    formatted.subjects = data.subjects.map((subject) => ({
      ...subject,
      needText: needText(subject?.need, labels),
    }));
  }
  return formatted;
}

/** The notes under Disadvantage and Advantage that the offer's rule states; none when mixed. */
function actionNotes({ kind, detail }) {
  if (kind === 'keep') {
    return {
      disadvantage: localize('FABRICATE.App.RollPrompt.KeepWorse', 'keep the worse'),
      advantage: localize('FABRICATE.App.RollPrompt.KeepBetter', 'keep the better'),
    };
  }
  if (kind === 'bonus' && detail) {
    const values = { expression: bracketBonusExpression(detail.expression) };
    const [down, up] =
      detail.destination === 'target'
        ? [
            localize(
              'FABRICATE.App.RollPrompt.BonusTargetDisadvantage',
              '−{expression} to the target'
            ),
            localize(
              'FABRICATE.App.RollPrompt.BonusTargetAdvantage',
              '+{expression} to the target'
            ),
          ]
        : [
            localize(
              'FABRICATE.App.RollPrompt.BonusTotalDisadvantage',
              '−{expression} to the total'
            ),
            localize('FABRICATE.App.RollPrompt.BonusTotalAdvantage', '+{expression} to the total'),
          ];
    return { disadvantage: fill(down, values), advantage: fill(up, values) };
  }
  if (kind === 'count' && detail) {
    if (detail.dice === 1) {
      return {
        disadvantage: localize('FABRICATE.App.RollPrompt.CountDisadvantageOne', '−1 die'),
        advantage: localize('FABRICATE.App.RollPrompt.CountAdvantageOne', '+1 die'),
      };
    }
    const values = { count: detail.dice };
    return {
      disadvantage: fill(
        localize('FABRICATE.App.RollPrompt.CountDisadvantage', '−{count} dice'),
        values
      ),
      advantage: fill(localize('FABRICATE.App.RollPrompt.CountAdvantage', '+{count} dice'), values),
    };
  }
  return {};
}

function promptAction(action, label, note = '') {
  const name = note
    ? fill(localize('FABRICATE.App.RollPrompt.ActionName', '{label}, {note}'), { label, note })
    : label;
  return { action, label, note, name, submit: action === 'normal' || action === 'roll' };
}

/**
 * The footer, left to right (issue 2007): Disadvantage when offered, Roll and Advantage, each
 * outer action with the note its check's rule states. An empty offer is the single Roll.
 */
export function promptActions(offer, labels) {
  if (offer?.advantage !== true) return [promptAction('roll', labels.roll)];
  const notes = actionNotes(offer);
  return [
    ...(offer.disadvantage === true
      ? [promptAction('disadvantage', labels.disadvantage, notes.disadvantage)]
      : []),
    promptAction('normal', labels.roll),
    promptAction('advantage', labels.advantage, notes.advantage),
  ];
}

/** A producer that names no offer keeps the one rule it had before issue 2007: keep, both ways. */
function viewOffer(data, allowAdvantage) {
  if (data.advantageOffer) return publicAdvantageOffer(data.advantageOffer);
  return allowAdvantage === true
    ? { advantage: true, disadvantage: true, kind: 'keep', detail: null }
    : { advantage: false, disadvantage: false, kind: null, detail: null };
}

/** Open the surface for a prepared view; a failed or rejected open is a dismissal. */
export async function waitForPrompt(data, allowAdvantage, choicePlan, open = resolveSurface()) {
  const defaultRollMode = supportedRollMode(globalThis.game?.settings?.get?.('core', 'rollMode'));
  const formatted = formatCopy(data, choicePlan);
  const offer = viewOffer(data, allowAdvantage);
  const view = {
    ...data,
    ...formatted,
    allowAdvantage: offer.advantage,
    actions: promptActions(offer, formatted.labels),
    rollModes: ROLL_MODES.map(([value, key, fallback]) => ({
      value,
      label: promptLabel(key, fallback),
    })),
    defaultRollMode,
    choicePlan,
  };
  let answer = null;
  try {
    answer = await open(view);
  } catch (error) {
    console.error('Fabricate | Roll prompt failed:', error);
  }
  return translatePromptAnswer(answer, {
    defaultRollMode,
    choicePlan,
    additionalDiceOffer: data.additionalDiceOffer ?? null,
  });
}

/** A bulk row's need rolls under when it names a target or reads an under character value. */
function rollsUnder(need) {
  return need?.kind === 'target' || (need?.kind === 'noSingleTarget' && need.direction === 'under');
}

/**
 * A count check's view: the pool and threshold its picks and bonus settle onto, the threshold's
 * anchor and source, the faces it explodes and cancels on, and the required count.
 */
function countPromptView({
  pool,
  die,
  threshold,
  thresholdAnchor,
  thresholdSource,
  explode,
  cancel,
  zeroPoolFails,
  required,
  modifierDestination,
}) {
  const finite = (value) => (Number.isFinite(value) ? value : null);
  return {
    pool: finite(pool),
    die: finite(die),
    threshold: finite(threshold),
    thresholdAnchor: finite(thresholdAnchor),
    thresholdSource: ['fixed', 'character'].includes(thresholdSource) ? thresholdSource : null,
    explode: faceRule(explode, 'best'),
    cancel: faceRule(cancel, 'worst'),
    zeroPoolFails: zeroPoolFails !== false,
    required: Number.isInteger(required) ? required : null,
    destination: modifierDestination === 'threshold' ? 'threshold' : 'pool',
  };
}

/** `{ kind, face }` (plus `once` to explode) for a face the dice can show, else null. */
function faceRule(rule, extreme) {
  if (!rule || typeof rule !== 'object' || !Number.isInteger(rule.face) || rule.face < 1) {
    return null;
  }
  const kind = rule.kind === 'from' ? 'from' : extreme;
  return extreme === 'best'
    ? { kind, face: rule.face, once: rule.once === true }
    : { kind, face: rule.face };
}

/**
 * `displayFormula` is the producer's base without the itemised modifier terms, shown as chips.
 * `target` (else `dc`) is the pre-modifier number; `direction: 'under'` names it a target, which
 * `targetBasis` and `toolBonus` explain (see `rollPromptTarget`). A `product: 'count'` check shows
 * its pool line and required count instead of any formula or DC.
 */
export function buildSinglePromptData({
  formula,
  resolvedFormula,
  displayFormula,
  dc,
  target,
  direction,
  name,
  actorName,
  activity,
  img,
  selectedModifiers,
  thresholdMode,
  comparison,
  targetBasis = null,
  toolBonus = 0,
  product,
  pool,
  die,
  threshold,
  thresholdAnchor,
  thresholdSource,
  explode,
  cancel,
  zeroPoolFails,
  required,
  modifierDestination,
  offerSituationalBonus,
  targetSource,
} = {}) {
  const offer = offerSituationalBonus !== false;
  const title = fill(promptLabel('CheckTitle', '{activity} check'), {
    activity: activity || promptLabel('roll', 'Roll'),
  });
  const value = Number.isFinite(target) ? target : dc;
  const subtitle =
    actorName && name
      ? fill(promptLabel('ActorSubject', '{actor} · {subject}'), {
          actor: actorName,
          subject: name,
        })
      : actorName || name || '';
  if (product === 'count') {
    return {
      kind: 'single',
      title,
      subtitle,
      img: img || '',
      formula: '',
      dc: null,
      direction: direction === 'under' ? 'under' : 'over',
      comparison: (comparison ?? thresholdMode) === 'exceed' ? 'exceed' : 'meet',
      selectedModifiers: Array.isArray(selectedModifiers) ? selectedModifiers : [],
      offerSituationalBonus: offer,
      count: countPromptView({
        pool,
        die,
        threshold,
        thresholdAnchor,
        thresholdSource,
        explode,
        cancel,
        zeroPoolFails,
        required,
        modifierDestination,
      }),
    };
  }
  const under = direction === 'under' && Number.isFinite(value);
  return {
    kind: 'single',
    title,
    subtitle,
    img: img || '',
    formula: displayFormula || resolvedFormula || formula || '',
    dc: Number.isFinite(value) ? value : null,
    direction: under ? 'under' : 'over',
    ...(under && { targetBasis, toolBonus, actorName: actorName || '' }),
    // A character value is a target to name in either direction, never a DC (issue 2005).
    ...(targetSource === 'attribute' && Number.isFinite(value) && { targetSource }),
    comparison:
      comparison === undefined ? (thresholdMode === 'exceed' ? 'exceed' : 'meet') : comparison,
    selectedModifiers: Array.isArray(selectedModifiers) ? selectedModifiers : [],
    offerSituationalBonus: offer,
  };
}

/**
 * The bulk heading names the activity and the one actor when the caller knows them. The bonus
 * field is hidden only when every row with a check has its offer off; a row without one says nothing.
 */
export function buildBulkPromptData({ count, subjects, activity, actorName } = {}) {
  const rows = Array.isArray(subjects) ? subjects : [];
  const checked = rows.filter((row) => row?.need && row.need.kind !== 'noCheck');
  const items = fill(promptLabel('BulkHeading', '{count} items'), {
    count: Number.isFinite(count) ? count : rows.length,
  });
  const destinations = new Set(rows.map((row) => row?.need?.destination));
  return {
    kind: 'bulk',
    // Every row rolling under (a fixed target or a character value) gets the roll-under bonus
    // help; any other row (or an empty batch) keeps the roll-over copy.
    direction: rows.length > 0 && rows.every((row) => rollsUnder(row?.need)) ? 'under' : 'over',
    // Likewise every row a count check with one modifier destination gets that count's help.
    countDestination:
      destinations.size === 1 && rows.every((row) => row?.need?.kind === 'successes')
        ? ([...destinations].find((entry) => entry === 'pool' || entry === 'threshold') ?? null)
        : null,
    title: activity
      ? fill(promptLabel('CheckTitlePlural', '{activity} checks'), { activity })
      : promptLabel('BulkTitle', 'Bulk check'),
    subtitle: actorName
      ? fill(promptLabel('ActorSubject', '{actor} · {subject}'), {
          actor: actorName,
          subject: items,
        })
      : items,
    subjects: rows,
    offerSituationalBonus:
      checked.length === 0 || checked.some((row) => row.offerSituationalBonus !== false),
  };
}

/** The prompt data with the check's advantage offer, when its producer supplied one. */
function withAdvantageOffer(data, offer) {
  return offer ? { ...data, advantageOffer: publicAdvantageOffer(offer) } : data;
}

/** A count prompt's allowlisted additional-dice offer and the actor it names (issue 2008). */
function withAdditionalDiceOffer(data, offer, actorName) {
  const publicOffer = data.count ? publicAdditionalDiceOffer(offer) : null;
  return publicOffer
    ? { ...data, additionalDiceOffer: publicOffer, actorName: actorName || '' }
    : data;
}

export async function promptCheckRoll(options = {}) {
  const { modifierChoice, allowAdvantage, advantageOffer, additionalDiceOffer } = options;
  const plan = planModifierChoice(modifierChoice);
  const open = resolveSurface();
  if (!open) {
    return {
      confirmed: true,
      ...(modifierChoice && { chosenModifierIds: plan.defaultSelectedIds }),
      ...(modifierChoice &&
        plan.defaultSelectedIds.length > 0 && { chosenModifierId: plan.defaultSelectedIds[0] }),
      ...(additionalDiceOffer && { additionalDice: 0 }),
    };
  }
  const data = withAdditionalDiceOffer(
    withAdvantageOffer(buildSinglePromptData(options), advantageOffer),
    additionalDiceOffer,
    options.actorName
  );
  return waitForPrompt(data, allowAdvantage, plan, open);
}

/** A batch row's pool and reach facts, numbers and enums only; null for a row with none. */
function bulkRowDice(row) {
  const { countDice, reach } = row?.additionalDice ?? {};
  const finite = (value) => (Number.isFinite(value) ? value : null);
  return {
    countDice: countDice && {
      base: finite(countDice.base),
      poolDelta: finite(countDice.poolDelta) ?? 0,
      zeroPoolFails: countDice.zeroPoolFails !== false,
      destination: countDice.destination === 'threshold' ? 'threshold' : 'pool',
    },
    reach: publicAdditionalDiceOffer({ reach })?.reach ?? null,
  };
}

/**
 * A batch's additional-dice offer (issue 2008), the rolls one choice covers and the one actor it
 * names, each covered row keeping its own pool and reach; else the note that rows differ.
 */
function withBulkAdditionalDice(data, { additionalDiceOffer, additionalDiceMixed, actorName }) {
  const offer = publicAdditionalDiceOffer(additionalDiceOffer);
  if (!offer) return additionalDiceMixed === true ? { ...data, additionalDiceMixed: true } : data;
  const subjects = data.subjects.map((row) =>
    row?.additionalDice ? { ...row, additionalDice: bulkRowDice(row) } : row
  );
  return {
    ...data,
    subjects,
    additionalDiceOffer: offer,
    additionalDiceRolls: subjects.filter((row) => row?.additionalDice).length,
    actorName: actorName || '',
  };
}

export async function promptBulkCheckRoll({
  allowAdvantage,
  advantageOffer,
  count,
  subjects,
  activity,
  actorName,
  additionalDiceOffer,
  additionalDiceMixed,
} = {}) {
  const open = resolveSurface();
  if (!open) {
    return {
      confirmed: true,
      bonus: null,
      rollMode: undefined,
      advantage: 'normal',
      ...(additionalDiceOffer && { additionalDice: 0 }),
    };
  }
  return waitForPrompt(
    withBulkAdditionalDice(
      withAdvantageOffer(
        buildBulkPromptData({ count, subjects, activity, actorName }),
        advantageOffer
      ),
      { additionalDiceOffer, additionalDiceMixed, actorName }
    ),
    allowAdvantage,
    planModifierChoice(null),
    open
  );
}

/**
 * The chat flavor's ` (DC n)` suffix, which names only a summed roll-over fixed DC. Any other
 * target is named once its benefits settle, by the pass/fail runner (`flavorTarget`).
 */
export function checkFlavorSuffix(dc, evaluation) {
  return Number.isFinite(dc) && isFixedSumOver(evaluation) ? ` (DC ${dc})` : '';
}

export function buildInteractiveRollOptions(
  { interactive, actor, name, activity, dc, img, modifierChoice, targetBasis, ...input },
  prompt = promptCheckRoll
) {
  const dcLabel = checkFlavorSuffix(dc, input.evaluation);
  const rollOptions = {
    interactive: interactive === true,
    prompt: (rollOptions) => prompt({ ...rollOptions, actorName: actor?.name }),
    rollMode: supportedRollMode(globalThis.game?.settings?.get?.('core', 'rollMode')),
    flavor: `${name ? `${name} — ` : ''}${activity} check${dcLabel}`,
    speaker: globalThis.ChatMessage?.getSpeaker?.({ actor }),
    dc,
    name,
    activity,
    img,
  };
  if (modifierChoice) rollOptions.modifierChoice = modifierChoice;
  if (targetBasis) rollOptions.targetBasis = targetBasis;
  return rollOptions;
}

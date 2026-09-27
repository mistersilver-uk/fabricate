/** The single and bulk check prompt: view preparation, the modal surface and answer translation. */
import { dcFlavorSuffix } from '../../../../systems/checkTarget.js';
import { countFormulaValues } from '../../../../systems/countEvaluation.js';

import { openRollPromptModal } from './rollPromptHost.js';
import { fill } from './rollPromptTarget.js';

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
    worse: promptLabel('KeepWorse', 'keep the worse'),
    better: promptLabel('KeepBetter', 'keep the better'),
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

/** Any answer but an explicit confirmation is a dismissal; the pick cap is re-imposed here. */
export function translatePromptAnswer(answer, { defaultRollMode, choicePlan }) {
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
  return result;
}

/** A summed roll-under check's wording: the chip names a target, and every bonus raises it. */
function underCopy() {
  return {
    meet: promptLabel('StayAtOrUnder', 'stay at or under'),
    exceed: promptLabel('StayUnder', 'stay under'),
    formulaNote: promptLabel('ComparedAsRolled', 'The dice are compared as rolled.'),
    targetBase: promptLabel('TargetBase', 'Base {value}'),
    targetValueOf: promptLabel('TargetValueOf', '{source} {value}'),
    targetAdjustment: promptLabel('TargetAdjustment', '{label} {value}'),
    targetDifficulty: promptLabel('TargetDifficulty', 'difficulty {value}'),
    targetTools: promptLabel('TargetTools', 'tools {value}'),
    targetModifiers: promptLabel('TargetModifiers', 'modifiers {value}'),
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

/** The count formula line, `{pool}d{die} · each ≥ {threshold}`, and its successes chip. */
function countText(data) {
  const { pool, die, threshold, required } = data.count;
  const resolved = [pool, die, threshold].every(Number.isFinite);
  const { direction, comparison } = data;
  let neededText = '';
  if (required === 1) neededText = promptLabel('CountNeededOne', '1 success needed');
  else if (required !== null) {
    neededText = fill(promptLabel('CountNeeded', '{count} successes needed'), { count: required });
  }
  return {
    formula: resolved
      ? fill(
          promptLabel('CountFormula', '{pool}d{die} · each {comparison} {threshold}'),
          countFormulaValues({ dice: pool, die, threshold, direction, comparison })
        )
      : '',
    dcText: '',
    neededText,
  };
}

function targetText(data, labels) {
  if (!Number.isFinite(data.dc)) return '';
  return data.direction === 'under'
    ? fill(labels.targetValue, { target: data.dc })
    : fill(labels.dcValue, { dc: data.dc });
}

/** The target, bulk-need and pick-cap copy, formatted here so the component renders strings only. */
function labelsFor(data) {
  if (data.count) return { ...copy(), ...countCopy(data.count.destination) };
  return data.direction === 'under' ? { ...copy(), ...underCopy() } : copy();
}

function formatCopy(data, choicePlan) {
  const labels = labelsFor(data);
  const formatted = {
    labels: { ...labels, pickUpTo: fill(labels.pickUpTo, { count: choicePlan.maxPicks }) },
    ...(data.count ? countText(data) : { dcText: targetText(data, labels) }),
  };
  // The one target chip: a count's successes needed, else the DC or target and its comparison.
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

/** Open the surface for a prepared view; a failed or rejected open is a dismissal. */
export async function waitForPrompt(data, allowAdvantage, choicePlan, open = resolveSurface()) {
  const defaultRollMode = supportedRollMode(globalThis.game?.settings?.get?.('core', 'rollMode'));
  const view = {
    ...data,
    ...formatCopy(data, choicePlan),
    allowAdvantage: allowAdvantage === true,
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
  return translatePromptAnswer(answer, { defaultRollMode, choicePlan });
}

/** A bulk row's need rolls under when it names a target or reads an under character value. */
function rollsUnder(need) {
  return need?.kind === 'target' || (need?.kind === 'noSingleTarget' && need.direction === 'under');
}

/** A count check's view: the pre-modifier pool, per-die threshold and required count. */
function countPromptView({ pool, die, threshold, required, modifierDestination }) {
  return {
    pool: Number.isFinite(pool) ? pool : null,
    die: Number.isFinite(die) ? die : null,
    threshold: Number.isFinite(threshold) ? threshold : null,
    required: Number.isInteger(required) ? required : null,
    destination: modifierDestination === 'threshold' ? 'threshold' : 'pool',
  };
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
  required,
  modifierDestination,
} = {}) {
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
      count: countPromptView({ pool, die, threshold, required, modifierDestination }),
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
    ...(under && { targetBasis, toolBonus }),
    comparison:
      comparison === undefined ? (thresholdMode === 'exceed' ? 'exceed' : 'meet') : comparison,
    selectedModifiers: Array.isArray(selectedModifiers) ? selectedModifiers : [],
  };
}

/** The bulk heading names the activity and the one actor when the caller knows them. */
export function buildBulkPromptData({ count, subjects, activity, actorName } = {}) {
  const rows = Array.isArray(subjects) ? subjects : [];
  const items = fill(promptLabel('BulkHeading', '{count} items'), {
    count: Number.isFinite(count) ? count : rows.length,
  });
  return {
    kind: 'bulk',
    // Every row rolling under (a fixed target or a character value) gets the roll-under bonus
    // help; any other row (or an empty batch) keeps the roll-over copy.
    direction: rows.length > 0 && rows.every((row) => rollsUnder(row?.need)) ? 'under' : 'over',
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
  };
}

export async function promptCheckRoll(options = {}) {
  const { modifierChoice, allowAdvantage } = options;
  const plan = planModifierChoice(modifierChoice);
  const open = resolveSurface();
  if (!open) {
    return modifierChoice
      ? {
          confirmed: true,
          chosenModifierIds: plan.defaultSelectedIds,
          ...(plan.defaultSelectedIds.length > 0 && {
            chosenModifierId: plan.defaultSelectedIds[0],
          }),
        }
      : { confirmed: true };
  }
  return waitForPrompt(buildSinglePromptData(options), allowAdvantage, plan, open);
}

export async function promptBulkCheckRoll({
  allowAdvantage,
  count,
  subjects,
  activity,
  actorName,
} = {}) {
  const open = resolveSurface();
  if (!open) return { confirmed: true, bonus: null, rollMode: undefined, advantage: 'normal' };
  return waitForPrompt(
    buildBulkPromptData({ count, subjects, activity, actorName }),
    allowAdvantage,
    planModifierChoice(null),
    open
  );
}

export function buildInteractiveRollOptions(
  { interactive, actor, name, activity, dc, img, modifierChoice, targetBasis, ...input },
  prompt = promptCheckRoll
) {
  const dcLabel = dcFlavorSuffix(dc, input.evaluation);
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

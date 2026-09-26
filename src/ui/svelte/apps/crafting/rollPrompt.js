/** The single and bulk check prompt: view preparation, the modal surface and answer translation. */
import { openRollPromptModal } from './rollPromptHost.js';

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

// A function replacer, so a `$&` or `$1` in a user-authored name is inserted literally.
function fill(template, values) {
  return Object.entries(values).reduce(
    (text, [token, value]) => text.replace(`{${token}}`, () => String(value)),
    template
  );
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

/** Open the surface for a prepared view; a failed or rejected open is a dismissal. */
export async function waitForPrompt(data, allowAdvantage, choicePlan, open = resolveSurface()) {
  const defaultRollMode = supportedRollMode(globalThis.game?.settings?.get?.('core', 'rollMode'));
  const view = {
    ...data,
    allowAdvantage: allowAdvantage === true,
    labels: copy(),
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

export function buildSinglePromptData({
  formula,
  resolvedFormula,
  dc,
  name,
  actorName,
  activity,
  img,
  selectedModifiers,
  thresholdMode,
  comparison,
} = {}) {
  const title = fill(promptLabel('CheckTitle', '{activity} check'), {
    activity: activity || promptLabel('roll', 'Roll'),
  });
  const subtitle =
    actorName && name
      ? fill(promptLabel('ActorSubject', '{actor} · {subject}'), {
          actor: actorName,
          subject: name,
        })
      : actorName || name || '';
  return {
    kind: 'single',
    title,
    subtitle,
    img: img || '',
    formula: resolvedFormula || formula || '',
    dc: Number.isFinite(dc) ? dc : null,
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
  { interactive, actor, name, activity, dc, img, modifierChoice },
  prompt = promptCheckRoll
) {
  const dcLabel = Number.isFinite(dc) ? ` (DC ${dc})` : '';
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
  return rollOptions;
}

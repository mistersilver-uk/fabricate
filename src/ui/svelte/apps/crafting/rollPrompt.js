/** DialogV2 adapter for the shared single and bulk check prompt body. */
import { flushSync, mount, unmount } from 'svelte';

const ROLL_MODES = [
  ['publicroll', 'CHAT.RollPublic', 'Public Roll'],
  ['gmroll', 'CHAT.RollPrivate', 'Private GM Roll'],
  ['blindroll', 'CHAT.RollBlind', 'Blind GM Roll'],
  ['selfroll', 'CHAT.RollSelf', 'Self Roll'],
];

function supportedRollMode(value, fallback = 'publicroll') {
  return ROLL_MODES.some(([mode]) => mode === value) ? value : fallback;
}

function localize(key, fallback) {
  const value = globalThis.game?.i18n?.localize?.(key);
  return typeof value === 'string' && value && value !== key ? value : fallback;
}

function copy() {
  const label = (name, fallback) => localize(`FABRICATE.App.RollPrompt.${name}`, fallback);
  return {
    modifiers: label('Modifiers', 'Modifiers'),
    modifierChoice: label('CheckModifier', 'Check modifier'),
    unnamedModifier: label('UnnamedModifier', 'Unnamed modifier'),
    unnamedSubject: label('UnnamedSubject', 'Unnamed item'),
    pickUpTo: label('PickUpTo', 'Pick up to {count}'),
    eachAdds: label('EachAdds', 'Each adds to the total.'),
    bonus: label('SituationalBonus', 'Situational bonus'),
    bonusPlaceholder: label('BonusPlaceholder', '+2 or 1d4'),
    bonusHelp: label('BonusHelp', 'A number or dice expression adds to the total.'),
    rollMode: label('RollMode', 'Roll mode'),
    meet: label('MeetOrBeat', 'meet or beat'),
    exceed: label('Beat', 'beat'),
    bulkNote: label('BulkNote', 'One choice below applies to every roll in the batch.'),
    bulkRows: label('BulkRows', 'Rolls in this batch'),
    noCheck: label('NoCheck', 'No check'),
    noSingleTarget: label('NoSingleTarget', 'No single target'),
    worse: label('KeepWorse', 'keep the worse'),
    better: label('KeepBetter', 'keep the better'),
    dcValue: label('DcValue', 'DC {dc}'),
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

function readSelectedModifierIds(field) {
  if (!field) return null;
  const entries = typeof field.length === 'number' ? [...field] : [field];
  const checkable = entries.filter((entry) => typeof entry?.checked === 'boolean');
  if (checkable.length > 0)
    return checkable.filter((entry) => entry.checked).map((entry) => String(entry.value ?? ''));
  return field.value ? [String(field.value)] : null;
}

function readChoice(button, defaultRollMode, advantage, choicePlan) {
  const fields = button?.form?.elements;
  const bonus = String(fields?.situationalBonus?.value ?? '')
    .replace(/^\s*\+/, '')
    .trim();
  const result = {
    confirmed: true,
    bonus: bonus || null,
    rollMode: supportedRollMode(fields?.rollMode?.value, defaultRollMode),
    advantage,
  };
  if (choicePlan.options.length > 0) {
    const selected = readSelectedModifierIds(fields?.craftingModifier);
    const ids = (selected ?? choicePlan.defaultSelectedIds).slice(0, choicePlan.maxPicks);
    result.chosenModifierIds = ids;
    if (ids.length > 0) result.chosenModifierId = ids[0];
  }
  return result;
}

function buttons(allowAdvantage, reader) {
  const button = (action, label, advantage, isDefault = false) => ({
    action,
    label: localize(`FABRICATE.App.RollPrompt.${action}`, label),
    default: isDefault,
    callback: (_event, element) => reader(element, advantage),
  });
  if (!allowAdvantage) return [button('roll', 'Roll', 'normal', true)];
  return [
    button('disadvantage', 'Disadvantage', 'disadvantage'),
    button('normal', 'Roll', 'normal', true),
    button('advantage', 'Advantage', 'advantage'),
  ];
}

function appendFooterSublabels(dialog, labels) {
  const root = dialog?.element ?? dialog;
  for (const [action, label] of [
    ['disadvantage', labels.worse],
    ['advantage', labels.better],
  ]) {
    const element = [...(root?.querySelectorAll?.('button[data-action]') ?? [])].find(
      (button) => button.dataset.action === action
    );
    if (!element || element.querySelector('.fabricate-roll-prompt__footer-note')) continue;
    const note = element.ownerDocument.createElement('small');
    note.className = 'fabricate-roll-prompt__footer-note';
    note.textContent = label;
    element.append(note);
  }
}

/**
 * Mount the interactive check body only after DialogV2 has sanitized its host.
 * The adapter unmounts before every render and on close, then answers a confirmed choice or dismissal.
 */
export async function waitForPrompt(
  DialogV2,
  data,
  allowAdvantage,
  choicePlan,
  { loadBody = () => import('./RollPrompt.svelte'), mountBody = mount, unmountBody = unmount } = {}
) {
  const defaultRollMode = supportedRollMode(globalThis.game?.settings?.get?.('core', 'rollMode'));
  const labels = copy();
  const rollModes = ROLL_MODES.map(([value, key, fallback]) => ({
    value,
    label: localize(key, fallback),
  }));
  const state =
    data.kind === 'bulk'
      ? 'bulk'
      : globalThis.document?.body?.classList?.contains('theme-light')
        ? 'light'
        : choicePlan.options.some((modifier) => modifier.label?.length > 40)
          ? 'overflow'
          : choicePlan.options.length > 0
            ? choicePlan.maxPicks > 1
              ? 'multipick'
              : 'pick-one'
            : allowAdvantage
              ? 'advantage'
              : 'basic';
  const body = { ...data, state, labels, rollModes, defaultRollMode, choicePlan };
  let Component = null;
  try {
    Component = typeof document === 'undefined' ? null : (await loadBody()).default;
  } catch (error) {
    console.error('Fabricate | Roll prompt body failed to load:', error);
    return { confirmed: false };
  }
  let mounted = null;
  const cleanup = () => {
    if (mounted) unmountBody(mounted);
    mounted = null;
  };
  const result = await DialogV2.wait({
    window: { title: data.frameTitle },
    classes: ['fabricate', 'fabricate-dialog', 'fabricate-roll-prompt-dialog'],
    position: { width: 500 },
    content: '<div class="fabricate-roll-prompt-host"></div>',
    rejectClose: false,
    buttons: buttons(allowAdvantage, (element, advantage) =>
      readChoice(element, defaultRollMode, advantage, choicePlan)
    ),
    render: (_event, dialog) => {
      cleanup();
      try {
        const host = (dialog?.element ?? dialog)?.querySelector?.('.fabricate-roll-prompt-host');
        if (!host || !Component) throw new Error('Roll prompt mount host unavailable');
        mounted = mountBody(Component, { target: host, props: { data: body } });
        appendFooterSublabels(dialog, labels);
        flushSync();
        dialog?.setPosition?.({ height: 'auto', top: null });
      } catch (error) {
        console.error('Fabricate | Roll prompt mount failed:', error);
        void dialog?.close?.();
      }
    },
    close: () => {
      cleanup();
    },
  }).catch(() => ({ confirmed: false }));
  cleanup();
  return result?.confirmed === true ? result : { confirmed: false };
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
  const activityLabel = activity || localize('FABRICATE.App.RollPrompt.roll', 'Roll');
  const title = localize('FABRICATE.App.RollPrompt.CheckTitle', '{activity} check').replace(
    '{activity}',
    activityLabel
  );
  const subtitle =
    actorName && name
      ? localize('FABRICATE.App.RollPrompt.ActorSubject', '{actor} · {subject}')
          .replace('{actor}', actorName)
          .replace('{subject}', name)
      : actorName || name || '';
  return {
    kind: 'single',
    frameTitle: title,
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

export async function promptCheckRoll(options = {}) {
  const { modifierChoice, allowAdvantage } = options;
  const plan = planModifierChoice(modifierChoice);
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait) {
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
  return waitForPrompt(DialogV2, buildSinglePromptData(options), allowAdvantage, plan);
}

export async function promptBulkCheckRoll({ allowAdvantage, count, subjects } = {}) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2?.wait)
    return { confirmed: true, bonus: null, rollMode: undefined, advantage: 'normal' };
  const rows = Array.isArray(subjects) ? subjects : [];
  const total = Number.isFinite(count) ? count : rows.length;
  const title = localize('FABRICATE.App.RollPrompt.BulkTitle', 'Bulk check');
  const subtitle = localize('FABRICATE.App.RollPrompt.BulkHeading', '{count} items').replace(
    '{count}',
    String(total)
  );
  return waitForPrompt(
    DialogV2,
    {
      kind: 'bulk',
      frameTitle: title,
      title,
      subtitle,
      subjects: rows,
    },
    allowAdvantage,
    planModifierChoice(null)
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

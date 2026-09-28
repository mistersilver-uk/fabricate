/**
 * The "Player sees" line of a salvage or gathering-task check override: what a player is shown for
 * this subject's check, resolved for the character chosen in Preview as. Pure; the caller injects
 * `text` so every sentence stays localized, and a missing path is named rather than read as zero.
 */
import {
  isValidTargetAdjustment,
  resolveCheckTarget,
  selectTargetAdjustment,
} from '../../../../../systems/checkTarget.js';
import { numberOrNull } from '../../../../../utils/scalars.js';
import { formatCheckAdjustment } from '../checks/checkAdjustmentLabel.js';
import { interpolate, underComparisonPhrase } from '../checks/checksCopy.js';

const KEY = {
  fixedOver: ['FABRICATE.Admin.Manager.Checks.PlayerSees.FixedOver', '{subject} · DC {dc}'],
  fixedUnder: [
    'FABRICATE.Admin.Manager.Checks.PlayerSees.FixedUnder',
    '{subject} · stay {cmp} {dc}',
  ],
  under: [
    'FABRICATE.Admin.Manager.Checks.PlayerSees.Under',
    '{subject} · stay {cmp} {target} ({source})',
  ],
  over: ['FABRICATE.Admin.Manager.Checks.PlayerSees.Over', '{subject} · reach {target} ({source})'],
  underNone: [
    'FABRICATE.Admin.Manager.Checks.PlayerSees.UnderNoCharacter',
    '{subject} · stay {cmp} the character value ({source})',
  ],
  overNone: [
    'FABRICATE.Admin.Manager.Checks.PlayerSees.OverNoCharacter',
    '{subject} · reach the character value ({source})',
  ],
  sourceValue: [
    'FABRICATE.Admin.Manager.Checks.Evaluation.ScaleSourceValue',
    '{actor} {expression} {value}',
  ],
  adjustmentInvalid: [
    'FABRICATE.Admin.Manager.Checks.PlayerSees.AdjustmentInvalid',
    '{subject} cannot resolve: the difficulty adjustment {adjustment} is invalid; a multiplier must be above zero.',
  ],
  unresolved: [
    'FABRICATE.Admin.Manager.Checks.Evaluation.ValueUnresolved',
    '{actor} has no value at {path}. The check cannot resolve for them.',
  ],
  noActor: [
    'FABRICATE.Admin.Manager.Checks.Evaluation.ValueNoActor',
    'Choose a character in Preview as to see what this resolves to.',
  ],
};

/**
 * Whether a kept `adjustmentOverride` breaks its kind's rule — the SAME rule
 * `checksReadiness.js`'s `adjustmentInvalidForKind` grades a check's own base and tier
 * adjustments by (issue 2078). Only an attribute target's override is graded; a fixed target's DC
 * override has no kind to break.
 */
export function overrideInvalidForKind({ attribute, kind, adjustmentOverride }) {
  return (
    attribute === true &&
    Number.isFinite(adjustmentOverride) &&
    !isValidTargetAdjustment(kind, adjustmentOverride)
  );
}

/**
 * The dormant override an editor names in its callout, or `null`: the DC override under a
 * character value, or the adjustment override under a fixed target. Neither is ever cleared.
 */
export function keptOverride({ attribute, dcOverride = null, adjustmentOverride = null }) {
  const [field, value] = attribute
    ? ['dcOverride', dcOverride]
    : ['adjustmentOverride', adjustmentOverride];
  const number = numberOrNull(value);
  return number === null ? null : { field, value: number };
}

/**
 * `{ line, note, readsCharacter, state }` for one override. `line` is `''` where the check is not
 * graded against one number (`count`, fixed-range `ranges`); `note` names the missing character;
 * `readsCharacter` says whether Preview as matters; `state` is also `fixed`, `no-character`,
 * `unresolved`, `adjustment-invalid` or `resolved`.
 * @param {object} args
 * @param {string} args.subject The line's lead: `Salvage check`, or the task's name.
 * @param {object} args.evaluation The normalized check evaluation.
 * @param {string|null} args.type The routed check's `type`; `fixed` grades by ranges.
 * @param {number} args.anchorDc The system DC a fixed target falls back to.
 * @param {{ name: string, rollData: object }|null} args.character The Preview-as character.
 */
export function overridePlayerSees({
  subject,
  evaluation,
  type = null,
  thresholdMode = 'meet',
  dcOverride = null,
  adjustmentOverride = null,
  anchorDc = 15,
  character = null,
  text,
}) {
  const say = ([key, fallback], data) => interpolate(text(key, fallback), data);
  const attribute = evaluation?.target?.source === 'attribute';
  const under = evaluation?.direction === 'under';
  const cmp = underComparisonPhrase(thresholdMode, text);
  // The runtime reads `successesOverride` for a count check, and a fixed-range check its ranges.
  if (evaluation?.product === 'count')
    return { line: '', note: '', readsCharacter: false, state: 'count' };
  if (type === 'fixed') return { line: '', note: '', readsCharacter: false, state: 'ranges' };
  if (!attribute) {
    const dc = numberOrNull(dcOverride) ?? Number(anchorDc);
    const line = say(under ? KEY.fixedUnder : KEY.fixedOver, { subject, cmp, dc: Math.trunc(dc) });
    return { line, note: '', readsCharacter: false, state: 'fixed' };
  }
  const kind = evaluation.target.adjustmentKind;
  const expression = String(evaluation.target.expression ?? '').trim();
  const adjustment = selectTargetAdjustment(evaluation, adjustmentOverride);
  const adjustmentLabel = formatCheckAdjustment(kind, adjustment);
  if (adjustment !== null && !isValidTargetAdjustment(kind, adjustment)) {
    const line = say(KEY.adjustmentInvalid, { subject, adjustment: adjustmentLabel });
    return { line, note: '', readsCharacter: true, state: 'adjustment-invalid' };
  }
  if (!character) {
    const source = [expression, adjustmentLabel].filter(Boolean).join(', ');
    const line = say(under ? KEY.underNone : KEY.overNone, { subject, cmp, source });
    return { line, note: say(KEY.noActor, {}), readsCharacter: true, state: 'no-character' };
  }
  const rollData = character.rollData ?? {};
  const base = resolveCheckTarget({ evaluation, rollData });
  const resolved = resolveCheckTarget({ evaluation, rollData, adjustment });
  if (!base.ok || !resolved.ok) {
    const line = say(KEY.unresolved, { actor: character.name, path: expression });
    return { line, note: '', readsCharacter: true, state: 'unresolved' };
  }
  const value = say(KEY.sourceValue, { actor: character.name, expression, value: base.target });
  const source = [value, adjustmentLabel].filter(Boolean).join(', ');
  const line = say(under ? KEY.under : KEY.over, { subject, cmp, target: resolved.target, source });
  return { line, note: '', readsCharacter: true, state: 'resolved' };
}

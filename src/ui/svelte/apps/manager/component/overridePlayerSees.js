/**
 * The "Player sees" line of a salvage or gathering-task check override: what a player is shown for
 * this subject's check, resolved for the character chosen in Preview as. Pure; the caller injects
 * `text` so every sentence stays localized, and a missing path is named rather than read as zero.
 */
import { resolveCheckTarget, selectTargetAdjustment } from '../../../../../systems/checkTarget.js';
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
  unresolved: [
    'FABRICATE.Admin.Manager.Checks.Evaluation.ValueUnresolved',
    '{actor} has no value at {path}. The check cannot resolve for them.',
  ],
  noActor: [
    'FABRICATE.Admin.Manager.Checks.Evaluation.ValueNoActor',
    'Choose a character in Preview as to see what this resolves to.',
  ],
};

const isSet = (value) => ![null, undefined, ''].includes(value) && Number.isFinite(Number(value));

/**
 * `{ line, note, readsCharacter, state }` for one override. `line` is `''` where a macro supplies
 * the number; `note` names the missing character; `readsCharacter` says whether Preview as matters;
 * `state` is `macro`, `fixed`, `no-character`, `unresolved` or `resolved`.
 * @param {object} args
 * @param {string} args.subject The line's lead: `Salvage check`, or the task's name.
 * @param {object} args.evaluation The normalized check evaluation.
 * @param {number} args.anchorDc The system DC a fixed target falls back to.
 * @param {{ name: string, rollData: object }|null} args.character The Preview-as character.
 */
export function overridePlayerSees({
  subject,
  evaluation,
  thresholdMode = 'meet',
  dcMode = 'static',
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
  if (dcMode === 'dynamic')
    return { line: '', note: '', readsCharacter: attribute, state: 'macro' };
  if (!attribute) {
    const dc = isSet(dcOverride) ? Math.trunc(Number(dcOverride)) : Number(anchorDc);
    const line = say(under ? KEY.fixedUnder : KEY.fixedOver, { subject, cmp, dc });
    return { line, note: '', readsCharacter: false, state: 'fixed' };
  }
  const kind = evaluation.target.adjustmentKind;
  const expression = String(evaluation.target.expression ?? '').trim();
  const adjustment = selectTargetAdjustment(evaluation, adjustmentOverride);
  const adjustmentLabel = formatCheckAdjustment(kind, adjustment);
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

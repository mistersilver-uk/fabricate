/**
 * The words an effect and a counter rule say in the Crafting Action editor: the comparison and
 * operation choices, an effect's one-line summary and the sentence under "Applies when". Every key
 * is a literal, because `lang-keys-no-orphans` cannot see a built one.
 */
import { arrayOrEmpty } from '../../../../../utils/scalars.js';
import { interpolate } from '../checks/checksCopy.js';

/** The `Select` options over `COUNTER_RULE_OPS`. */
export const counterOpOptions = (text) => [
  { value: '>=', label: text('FABRICATE.Admin.Manager.Iterative.OpAtLeast', 'is at least') },
  { value: '<=', label: text('FABRICATE.Admin.Manager.Iterative.OpAtMost', 'is at most') },
  { value: '>', label: text('FABRICATE.Admin.Manager.Iterative.OpAbove', 'is above') },
  { value: '<', label: text('FABRICATE.Admin.Manager.Iterative.OpBelow', 'is below') },
  { value: '=', label: text('FABRICATE.Admin.Manager.Iterative.OpExactly', 'is exactly') },
];

/** The `SegmentedControl` options over `EFFECT_OPS`. */
export const effectOpOptions = (text) => [
  { value: 'add', label: text('FABRICATE.Admin.Manager.Iterative.EffectIncrement', 'Increment') },
  {
    value: 'subtract',
    label: text('FABRICATE.Admin.Manager.Iterative.EffectDecrement', 'Decrement'),
  },
  { value: 'set', label: text('FABRICATE.Admin.Manager.Iterative.EffectSet', 'Set') },
];

/** The sentence under an effect's conditions, which follows its All or Any choice. */
export const whenFootnote = (combine, text) =>
  combine === 'any'
    ? text(
        'FABRICATE.Admin.Manager.Iterative.WhenFootAny',
        'Any one of these may hold. Leave it empty to apply every session.'
      )
    : text(
        'FABRICATE.Admin.Manager.Iterative.WhenFootAll',
        'All of these must hold. Leave it empty to apply every session.'
      );

/** How many conditions an effect's `when` carries, counting the check ones only while `rolls`. */
export function conditionCount(when, rolls) {
  const check =
    (arrayOrEmpty(when?.checkOutcomeIds).length > 0 ? 1 : 0) +
    (typeof when?.success === 'boolean' ? 1 : 0) +
    (when?.value == null ? 0 : 1);
  return (rolls ? check : 0) + arrayOrEmpty(when?.rules).length;
}

function whenSummary(count, text) {
  if (count === 0) return text('FABRICATE.Admin.Manager.Iterative.WhenEvery', 'every session');
  if (count === 1)
    return text('FABRICATE.Admin.Manager.Iterative.WhenOne', 'when 1 condition holds');
  return interpolate(
    text('FABRICATE.Admin.Manager.Iterative.WhenMany', 'when {count} conditions hold'),
    { count }
  );
}

/** "Increment Heat by 2 · every session", the line under an effect's name. */
export function effectSummary(effect, { counterLabel, rolls }, text) {
  const data = { counter: counterLabel, amount: effect.amount ?? '' };
  const lines = {
    subtract: text(
      'FABRICATE.Admin.Manager.Iterative.EffectSummarySubtract',
      'Decrement {counter} by {amount}'
    ),
    set: text('FABRICATE.Admin.Manager.Iterative.EffectSummarySet', 'Set {counter} to {amount}'),
    add: text(
      'FABRICATE.Admin.Manager.Iterative.EffectSummaryAdd',
      'Increment {counter} by {amount}'
    ),
  };
  const line = interpolate(lines[effect.op] ?? lines.add, data);
  return `${line} · ${whenSummary(conditionCount(effect.when, rolls), text)}`;
}

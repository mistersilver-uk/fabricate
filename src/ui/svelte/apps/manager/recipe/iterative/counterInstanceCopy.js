/**
 * The sentences a Counter Instance row states under its counter, one per fault, in the words of the
 * Iterative Recipe Editor. Every key is a literal for `lang-keys-no-orphans`.
 */
import { fill } from '../../../../../../utils/fillPlaceholders.js';

const NOT_NUMBER = Object.freeze({
  start: [
    'FABRICATE.Admin.Manager.Recipe.Iterative.StartNotNumber',
    '{counter} start must be a number.',
  ],
  min: ['FABRICATE.Admin.Manager.Recipe.Iterative.MinNotNumber', '{counter} min must be a number.'],
  max: ['FABRICATE.Admin.Manager.Recipe.Iterative.MaxNotNumber', '{counter} max must be a number.'],
  target: [
    'FABRICATE.Admin.Manager.Recipe.Iterative.TargetNotNumber',
    '{counter} target must be a number.',
  ],
});

/**
 * @param {{ code: string, field?: string, side?: string, start?: number, min?: number, max?: number }} fault
 * @param {{ row: { label: string }, systemName: string, text: Function }} context
 */
export function counterFaultSentence(fault, { row, systemName, text }) {
  const values = { counter: row.label, system: systemName, ...fault };
  if (fault.code === 'iterativeUnknownCounter') {
    return fill(
      text(
        'FABRICATE.Admin.Manager.Recipe.Iterative.FaultUnknownCounter',
        'This counter isn’t in the {system} counter library. Remove this row or create the counter.'
      ),
      values
    );
  }
  if (fault.code === 'iterativeInvalidNumber')
    return fill(text(...NOT_NUMBER[fault.field]), values);
  if (fault.code === 'iterativeBoundsInverted') {
    return fill(
      text(
        'FABRICATE.Admin.Manager.Recipe.Iterative.FaultInverted',
        'Min {min} is above max {max}.'
      ),
      values
    );
  }
  return fault.side === 'max'
    ? fill(
        text(
          'FABRICATE.Admin.Manager.Recipe.Iterative.FaultAboveMax',
          'Max {max} is below the start value of {start}.'
        ),
        values
      )
    : fill(
        text(
          'FABRICATE.Admin.Manager.Recipe.Iterative.FaultBelowMin',
          'Start {start} is below the min of {min}.'
        ),
        values
      );
}

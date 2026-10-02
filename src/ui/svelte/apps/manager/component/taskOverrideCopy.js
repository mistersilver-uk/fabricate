/**
 * The gathering task check override's copy: the card's title, hint and field label for the one
 * override the routed check reads, and the callouts naming each dormant DC or adjustment override.
 * Pure; `text(key, fallback)` localizes.
 */
import { formatCheckAdjustment } from '../checks/checkAdjustmentLabel.js';
import { interpolate, underComparisonPhrase } from '../checks/checksCopy.js';

import { checkOverrideField, keptOverrides } from './overridePlayerSees.js';

function adjustmentCopy(kind, text) {
  return {
    title: text(
      'FABRICATE.Admin.Manager.Gathering.TaskOverrideAdjustment',
      'Difficulty adjustment override'
    ),
    hint:
      kind === 'multiply'
        ? text(
            'FABRICATE.Admin.Manager.Gathering.TaskOverrideMultiplyHint',
            'Adjusts the character value this task is attempted against. Multiplied, rounded down.'
          )
        : text(
            'FABRICATE.Admin.Manager.Gathering.TaskOverrideAddHint',
            'Adjusts the character value this task is attempted against. Added to the value.'
          ),
    label: text('FABRICATE.Admin.Manager.Gathering.TaskOverrideAdjustmentLabel', 'Adjustment'),
  };
}

function successesCopy(text) {
  return {
    title: text(
      'FABRICATE.Admin.Manager.Checks.Count.Overrides.Title',
      'Successes needed override'
    ),
    hint: text(
      'FABRICATE.Admin.Manager.Checks.Count.Overrides.HintTask',
      'Replaces the successes needed for this task. The pool and threshold still come from the check.'
    ),
    label: text('FABRICATE.Admin.Manager.Checks.Count.Overrides.Label', 'Successes needed'),
  };
}

/** `{ title, hint, label }` for the override `evaluation` reads under `thresholdMode`. */
export function taskOverrideCopy(evaluation, thresholdMode, text) {
  const field = checkOverrideField(evaluation);
  if (field === 'successesOverride') return successesCopy(text);
  if (field === 'adjustmentOverride') return adjustmentCopy(evaluation.target.adjustmentKind, text);
  if (evaluation.direction === 'under') {
    const cmp = underComparisonPhrase(thresholdMode, text);
    return {
      title: text('FABRICATE.Admin.Manager.Gathering.TaskOverrideTarget', 'Target override'),
      hint: interpolate(
        text(
          'FABRICATE.Admin.Manager.Gathering.TaskOverrideTargetHint',
          'Replaces the system target for this task. The total must stay {cmp} it.'
        ),
        { cmp }
      ),
      label: text('FABRICATE.Admin.Manager.Gathering.TaskOverrideTargetLabel', 'Target'),
    };
  }
  return {
    title: text('FABRICATE.Admin.Manager.Gathering.TaskDcOverrideTitle', 'DC override'),
    hint: text(
      'FABRICATE.Admin.Manager.Gathering.TaskDcOverrideHint',
      'Replaces the system DC for this task.'
    ),
    label: text('FABRICATE.Admin.Manager.Gathering.TaskDcOverride', 'DC'),
  };
}

/** One sentence per dormant DC or adjustment override `task` keeps beside the active one. */
export function taskKeptNotices({ evaluation, task }, text) {
  const kept = keptOverrides({
    field: checkOverrideField(evaluation),
    dcOverride: task?.dcOverride ?? null,
    adjustmentOverride: task?.adjustmentOverride ?? null,
  });
  return kept.map(({ field, value }) =>
    field === 'dcOverride'
      ? interpolate(
          text(
            'FABRICATE.Admin.Manager.Gathering.TaskOverrideKeptDc',
            'A DC override of {dc} is kept on this task. This system does not read it, so it is not shown for editing.'
          ),
          { dc: value }
        )
      : interpolate(
          text(
            'FABRICATE.Admin.Manager.Gathering.TaskOverrideKeptAdjustment',
            'A difficulty adjustment override of {adjustment} is kept on this task. This system does not read it, so it is not shown for editing.'
          ),
          { adjustment: formatCheckAdjustment(evaluation.target.adjustmentKind, value) }
        )
  );
}

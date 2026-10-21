/**
 * The checks studio's converted select vocabularies and their `<Select>` rows (issue 1510), and the
 * outcome toggle's segments.
 * Every label is carried verbatim from the `<option>` it replaced and every list keeps its authored
 * order. Localized copy arrives through an injected `text`, so this stays an import-free leaf — the
 * reason the previewed-record mapper lives here rather than beside `buildPreviewRecords`, whose own
 * module pulls in the whole roll engine.
 */

/** `buildPreviewRecords`' `{id, label}` rows in the picker's `{value, label}` option shape. */
export function previewRecordSelectOptions(records) {
  return records.map((record) => ({ value: record.id, label: record.label }));
}

/** The comparison a GM reads, not the symbol the model stores, and in the design order. */
export const CONDITION_OPERATORS = Object.freeze([
  {
    value: '==',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectExactly',
    fallback: 'is exactly',
  },
  {
    value: '>=',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectAtLeast',
    fallback: 'is at least',
  },
  {
    value: '<=',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectAtMost',
    fallback: 'is at most',
  },
  {
    value: '>',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectOver',
    fallback: 'is more than',
  },
  {
    value: '<',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OpSelectUnder',
    fallback: 'is less than',
  },
]);

/** How one dice group's faces are measured. */
export const DICE_AGGREGATES = Object.freeze([
  {
    value: 'total',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateTotal',
    fallback: 'Group total',
  },
  {
    value: 'anyDie',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateAnyDie',
    fallback: 'Any die',
  },
  {
    value: 'allDice',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateAllDice',
    fallback: 'All dice',
  },
  {
    value: 'lowestDie',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateLowestDie',
    fallback: 'Lowest die',
  },
  {
    value: 'highestDie',
    labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.AggregateHighestDie',
    fallback: 'Highest die',
  },
]);

const ROLL_TOTAL = Object.freeze({
  value: 'rollTotal',
  labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeRollTotal',
  fallback: 'Roll total',
});

// A counting check's total is its net successes (issue 2006).
const NET_SUCCESSES = Object.freeze({
  value: 'rollTotal',
  labelKey: 'FABRICATE.Admin.Manager.Checks.Count.Triggers.TypeNetSuccesses',
  fallback: 'Net successes',
});

const PROGRESSIVE_VALUE = Object.freeze({
  value: 'progressiveValue',
  labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeProgressiveValue',
  fallback: 'Awarded value',
});

const DICE_GROUP = Object.freeze({
  value: 'diceGroup',
  labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeDiceGroup',
  fallback: 'Dice group',
});

const OUTCOME_TIER = Object.freeze({
  value: 'outcomeTier',
  labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.TypeOutcomeTier',
  fallback: 'Outcome tier',
});

/** The outcome toggle's segments, good, neutral, bad, so the neutral default sits in the middle. */
export const OUTCOME_CHOICES = Object.freeze({
  progressive: [
    {
      value: 'success',
      variant: 'success',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardAll',
      fallback: 'Award all',
    },
    {
      value: 'none',
      variant: 'neutral',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceNone',
      fallback: 'No effect',
    },
    {
      value: 'failure',
      variant: 'danger',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.AwardNone',
      fallback: 'Award none',
    },
  ],
  standard: [
    {
      value: 'success',
      variant: 'success',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceSuccess',
      fallback: 'Automatic success',
    },
    {
      value: 'none',
      variant: 'neutral',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceNone',
      fallback: 'No effect',
    },
    {
      value: 'failure',
      variant: 'danger',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Breakage.OutcomeForceFailure',
      fallback: 'Automatic failure',
    },
  ],
});

/** `addTrigger` reads the first entry, so the order is the authored default, not a presentation choice. */
export function conditionTypesFor(kind, { counting = false } = {}) {
  return [
    counting ? NET_SUCCESSES : ROLL_TOTAL,
    kind === 'progressive' ? PROGRESSIVE_VALUE : null,
    DICE_GROUP,
    kind === 'routed' ? OUTCOME_TIER : null,
  ].filter(Boolean);
}

/** A `{value, labelKey, fallback, ...}` vocabulary as `{value, label, ...}` options; extras pass through. */
export function localizedOptions(vocabulary, text) {
  return vocabulary.map(({ labelKey, fallback, ...rest }) => ({
    ...rest,
    label: text(labelKey, fallback),
  }));
}

/**
 * One row per parsed dice group. The value is stringified because the condition stores a numeric
 * `groupId` and the primitive writes a strict `String(option.value) === id` test.
 */
export function diceGroupOptions(diceGroups) {
  return diceGroups.map((group) => ({ value: String(group.groupId), label: group.label }));
}

/**
 * `danglingTierId` — the persisted id no live tier matches — is appended as a disabled row, so a
 * target the list no longer holds shows as chosen rather than silently remapping to another tier.
 */
export function tierStepTargetOptions({
  outcomeOptions,
  danglingTierId,
  unnamedLabel,
  missingLabel,
}) {
  const live = outcomeOptions.map((option) => ({
    value: option.id,
    label: option.name || unnamedLabel,
  }));
  if (!danglingTierId) return live;
  return [...live, { value: danglingTierId, label: missingLabel, disabled: true }];
}

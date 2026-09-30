/**
 * The ONE set of sentences the Checks Studio uses to describe a readiness result. A section's
 * warning dot is explained IN the panel by a `Notice`, and a dot whose words are a second copy of
 * the Validation route's is how one issue comes to be described two ways on two screens a click
 * apart. Each entry is `[localizationSuffix, englishFallback]`, resolved against the shared
 * `FABRICATE.Admin.Manager.Checks.Validation.` namespace, so this module stays pure; the issue and
 * title maps are PROVEN EXHAUSTIVE against `CHECK_READINESS_ISSUE_IDS` in both directions by
 * `tests/checks-readiness.test.js`. */

/** The satisfied/unsatisfied TICKS a check reports. */
export const CHECK_TICK_LABELS = Object.freeze({
  hasRollFormula: ['CheckHasRollFormula', 'Has a roll formula'],
  outcomesNamed: ['CheckOutcomesNamed', 'Every outcome tier is named'],
  hasSuccessOutcome: ['CheckHasSuccessOutcome', 'At least one outcome is a Success'],
  rangesValid: ['CheckRangesValid', 'Every tier range is valid'],
  rangesNoOverlap: ['CheckRangesNoOverlap', 'No tier ranges overlap'],
  rangesContiguous: ['CheckRangesContiguous', 'Tier ranges leave no unclaimed values'],
  modifierBoundsValid: [
    'CheckModifierBoundsValid',
    'Every applied check modifier has usable bounds',
  ],
  modifierExpressionsResolve: [
    'CheckModifierExpressionsResolve',
    'Every applied check modifier can be rolled',
  ],
  tierStepTargetsResolve: [
    'CheckTierStepTargetsResolve',
    'Tier-step targets name exactly one existing tier',
  ],
  attributeTargetSet: ['CheckAttributeTargetSet', 'Has a character value to measure against'],
  attributeTargetReadable: [
    'CheckAttributeTargetReadable',
    'The character value can be worked out',
  ],
  recipeTiersSetAdjustment: [
    'CheckRecipeTiersSetAdjustment',
    'Every recipe tier sets an adjustment',
  ],
  adjustmentsSuitKind: ['CheckAdjustmentsSuitKind', 'Every adjustment suits its kind'],
  singleOtherwiseTier: ['CheckSingleOtherwiseTier', 'Exactly one Otherwise tier'],
  progressiveHigherIsBetter: [
    'CheckProgressiveHigherIsBetter',
    'Progressive checks use Higher is better',
  ],
  countPoolReadable: ['CheckCountPoolReadable', 'The base pool can be worked out'],
  countThresholdReadable: [
    'CheckCountThresholdReadable',
    'The success threshold can be worked out',
  ],
  countFacesOnDie: ['CheckCountFacesOnDie', 'Explode and cancel faces are on the die'],
  countExplosionStops: ['CheckCountExplosionStops', 'Explosion can stop'],
  countTiersSetSuccesses: [
    'CheckCountTiersSetSuccesses',
    'Every recipe tier sets its successes needed',
  ],
  countRequiredWithinMaxPool: [
    'CheckCountRequiredWithinMaxPool',
    'Successes needed fit within the most dice this check allows',
  ],
  countRequiredWithinBasePool: [
    'CheckCountRequiredWithinBasePool',
    'Successes needed fit within the base pool',
  ],
  countPoolCharacterDependent: [
    'CheckCountPoolCharacterDependent',
    'The base pool reads the character, so it is compared with the successes needed only when a character rolls.',
  ],
  summedFormulaCountsNothing: [
    'CheckSummedFormulaCountsNothing',
    'No summing formula counts successes',
  ],
  countFacesSet: ['CheckCountFacesSet', 'Explode and cancel faces are set'],
  countTriggersReachable: [
    'CheckCountTriggersReachable',
    'Every dice trigger can fire on the pool',
  ],
});

/** The ISSUES a check can raise, keyed by `CHECK_READINESS_ISSUE_IDS` member. */
export const CHECK_ISSUE_LABELS = Object.freeze({
  noRollFormula: [
    'IssueNoRollFormula',
    'Nothing is rolled, so this check cannot resolve until you enter a formula.',
  ],
  retiredPlaceholderInFormula: [
    'IssueRetiredPlaceholderInFormula',
    'This formula contains the retired @craftingmod placeholder. It is ignored and removed before the roll — check modifiers are added automatically now — so delete it.',
  ],
  retiredPlaceholderBreaksFormula: [
    'IssueRetiredPlaceholderBreaksFormula',
    'This formula uses the retired @craftingmod placeholder somewhere it cannot be removed safely, so the whole formula is discarded and this check will not roll. Rewrite it by hand without the placeholder — check modifiers are added automatically now.',
  ],
  unnamedOutcome: [
    'IssueUnnamedOutcome',
    'An unnamed tier cannot be routed to a result group. Name every tier.',
  ],
  noSuccessOutcome: [
    'IssueNoSuccessOutcome',
    'Every tier is marked as a failure, so this check can never succeed. Mark at least one tier as Success.',
  ],
  rangeInvalid: [
    'IssueRangeInvalid',
    'A tier whose end is lower than its start can never be rolled. Correct its start and end.',
  ],
  rangeOverlap: [
    'IssueRangeOverlap',
    'Bands must not overlap — a roll in the overlap has two possible tiers.',
  ],
  rangeGap: [
    'IssueRangeGap',
    'Some values between your lowest and highest tier belong to no tier at all, so a roll landing there matches nothing and the attempt cannot be routed. Close the gap.',
  ],
  modifierBoundsInverted: [
    'IssueModifierBoundsInverted',
    'A check modifier this check applies ({names}) has a minimum above its maximum, so it contributes nothing to the roll until you fix the two values.',
  ],
  modifierBoundsUnsafe: [
    'IssueModifierBoundsUnsafe',
    'A check modifier this check applies ({names}) has a minimum or maximum too large or too small to appear in a roll formula, so it contributes nothing. Use a whole number a die roll could plausibly reach.',
  ],
  modifierExpressionInvalid: [
    'IssueModifierExpressionInvalid',
    'A check modifier this check applies ({names}) has an expression Fabricate cannot roll, so it contributes nothing. Check it against your game system — a capitalised function name (MAX instead of max), more than 999 dice, or a decimal without a leading zero are all refused by the dice engine.',
  ],
  modifierAverageUnavailable: [
    'IssueModifierAverageUnavailable',
    'A check modifier this check ranks ({names}) changes what its dice total means — by counting successes, for example — so it has no average to compare with the others. Modifiers with an ordinary average are chosen ahead of it; it is still rolled exactly as written whenever a pick is left over.',
  ],
  modifiersInertNoCheck: [
    'IssueModifiersInertNoCheck',
    'This resolution mode rolls no check, so the check modifiers selected here are never applied.',
  ],
  modifiersInertNoModifierSupport: [
    'IssueModifiersInertNoModifierSupport',
    'The d100 roll against each drop’s chance is this mode’s check, and it cannot take check modifiers yet, so the ones selected here are never applied.',
  ],
  modifiersInertNoFormula: [
    'IssueModifiersInertNoFormula',
    'This check has no roll formula yet, so the check modifiers selected here are never applied.',
  ],
  danglingTierStepTarget: [
    'IssueDanglingTierStepTarget',
    "A trigger's target tier is not set, or names a tier this check does not have; that step does nothing until you pick one of this check's outcome tiers.",
  ],
  multipleTierStepTargets: [
    'IssueMultipleTierStepTargets',
    'If more than one matches on the same roll, the lowest-ranked tier wins.',
  ],
  attributeTargetMissing: [
    'IssueAttributeTargetMissing',
    'This check measures against a character value but names none. Enter a number or a character path.',
  ],
  attributeTargetInvalid: [
    'IssueAttributeTargetInvalid',
    "This check's character value uses dice or cannot be read as arithmetic. Use a number, a character path, or arithmetic on them without dice.",
  ],
  attributeTierWithoutAdjustment: [
    'IssueAttributeTierWithoutAdjustment',
    '{names} set no difficulty adjustment, so they use the base adjustment and are no harder than the default. Give each tier its own adjustment.',
  ],
  adjustmentInvalidForKind: [
    'IssueAdjustmentInvalidForKind',
    'An added adjustment must be a finite number and a multiplier must be above zero; {names} is not.',
  ],
  otherwiseTierMissing: [
    'IssueOtherwiseTierMissing',
    'No outcome tier is marked Otherwise, so a roll that meets no multiplied threshold has nowhere to go. Leave exactly one tier without a multiplier.',
  ],
  multipleOtherwiseTiers: [
    'IssueMultipleOtherwiseTiers',
    '{names} are all marked Otherwise. Leave exactly one tier without a multiplier.',
  ],
  progressiveUnderUnsupported: [
    'IssueProgressiveUnderUnsupported',
    'A progressive check spends its total as a budget, so Lower is better cannot apply. Switch this check to Higher is better.',
  ],
  attributePathUnresolvedForPreview: [
    'IssueAttributePathUnresolvedForPreview',
    '{actor} has no value at {path}, so this check cannot roll for them.',
  ],
  attributeValueNotNumeric: [
    'IssueAttributeValueNotNumeric',
    'The value this check reads from {actor} is not a number, so this check cannot roll for them.',
  ],
  countPoolInvalid: [
    'IssueCountPoolInvalid',
    "This check's base pool uses dice or cannot be read as arithmetic. Use a number, a character path, or arithmetic on them without dice.",
  ],
  countThresholdInvalid: [
    'IssueCountThresholdInvalid',
    "This check's success threshold uses dice or cannot be read as arithmetic. Use a number, a character path, or arithmetic on them without dice.",
  ],
  countFaceBeyondDie: [
    'IssueCountFaceBeyondDie',
    'The {kind} face {face} is not on a d{die}, so {effect}. Pick a face the die can show.',
  ],
  countExplodeUnbounded: [
    'IssueCountExplodeUnbounded',
    'Every face on this die explodes, so the roll would never stop. Pick a face that does not explode.',
  ],
  countTierWithoutSuccesses: [
    'IssueCountTierWithoutSuccesses',
    "{names} set no successes needed, so they use the check's {required} and are no harder than the default. Set successes needed on each tier before enabling.",
  ],
  countRequiredExceedsMaxPool: [
    'IssueCountRequiredExceedsMaxPool',
    'The successes needed by {names} exceed the {ceiling} dice this check allows before any explode, so an attempt succeeds only when dice explode or are added. Lower the successes needed or allow more dice.',
  ],
  countRequiredExceedsBasePool: [
    'IssueCountRequiredExceedsBasePool',
    'The successes needed by {names} exceed the base pool of {base} dice, so an attempt succeeds only when dice explode or are added to the pool.',
  ],
  countPoolTooLarge: [
    'IssueCountPoolTooLarge',
    "This check's base pool is more than the {max} dice Foundry can roll at once, so the check cannot roll. Use a smaller pool.",
  ],
  countPathUnresolvedForPreview: [
    'IssueCountPathUnresolvedForPreview',
    '{actor} has no value at {path}, so this check cannot roll for them.',
  ],
  countValueNotNumericForPreview: [
    'IssueCountValueNotNumericForPreview',
    'The value this check reads from {actor} is not a number, so this check cannot roll for them.',
  ],
  freeTextCountingFormula: [
    'IssueFreeTextCountingFormula',
    'The total of {formula} is a count, so every bonus and DC here is measured against the wrong number.',
  ],
  countFaceMissing: [
    'IssueCountFaceMissing',
    'Choose the face to {kind} from. Without one, this check cannot roll.',
  ],
  countTriggerGroupUnreachable: [
    'IssueCountTriggerGroupUnreachable',
    'The triggers {names} read dice this pool never rolls, so they cannot fire while the check counts successes. They are kept and work again if the check adds the dice.',
  ],
});

/** The one-trigger sentence of `countTriggerGroupUnreachable`, its name quoted in the copy. */
const ONE_TRIGGER_UNREACHABLE = Object.freeze({
  key: 'FABRICATE.Admin.Manager.Checks.Validation.IssueCountTriggerGroupUnreachableOne',
  fallback:
    'The trigger “{names}” reads dice this pool never rolls, so it cannot fire while the check counts successes. It is kept and works again if the check adds the dice.',
});

/** The words a `countFaceBeyondDie` issue's coded `kind` and `effect` fill its sentence with. */
const ISSUE_PHRASES = Object.freeze({
  kind: {
    explode: ['FaceKindExplode', 'explode'],
    cancel: ['FaceKindCancel', 'cancel'],
  },
  effect: {
    neverExplodes: ['FaceEffectNeverExplodes', 'it never explodes'],
    everyFaceCancels: ['FaceEffectEveryFaceCancels', 'every face cancels'],
    noFaceCancels: ['FaceEffectNoFaceCancels', 'no face cancels'],
  },
});

/** Every issue's short title, drawn over its sentence in the Validation row and the section
 *  notice alike (issue 2082). */
const TITLE_FALLBACKS = {
  noRollFormula: 'The check has no roll formula',
  retiredPlaceholderInFormula: 'The formula still uses @craftingmod',
  retiredPlaceholderBreaksFormula: '@craftingmod breaks this formula',
  unnamedOutcome: 'An outcome tier has no name',
  noSuccessOutcome: 'No tier counts as a success',
  rangeInvalid: 'A band ends before it starts',
  rangeOverlap: 'Two bands overlap',
  rangeGap: 'A gap between two bands',
  modifierBoundsInverted: "A check modifier's minimum is above its maximum",
  modifierBoundsUnsafe: "A check modifier's bounds are out of range",
  modifierExpressionInvalid: 'A check modifier cannot be rolled',
  modifierAverageUnavailable: 'A check modifier has no average to rank by',
  modifiersInertNoCheck: 'Check modifiers have no check to apply to',
  modifiersInertNoModifierSupport: 'The d100 roll cannot take check modifiers',
  modifiersInertNoFormula: 'Check modifiers have no formula to apply to',
  danglingTierStepTarget: "A trigger's target tier is missing",
  multipleTierStepTargets: 'More than one trigger sets a target tier',
  attributeTargetMissing: 'No character value to measure against',
  attributeTargetInvalid: 'The character value cannot be worked out',
  attributeTierWithoutAdjustment: 'A recipe tier has no difficulty adjustment',
  adjustmentInvalidForKind: 'An adjustment does not suit its kind',
  otherwiseTierMissing: 'No tier is marked Otherwise',
  multipleOtherwiseTiers: 'More than one tier is marked Otherwise',
  progressiveUnderUnsupported: 'Lower is better cannot drive a progressive check',
  attributePathUnresolvedForPreview: 'A character path does not resolve',
  attributeValueNotNumeric: 'A character value is not a number',
  countPoolInvalid: 'The base pool cannot be worked out',
  countThresholdInvalid: 'The success threshold cannot be worked out',
  countFaceBeyondDie: 'A face is not on the die',
  countExplodeUnbounded: 'The dice would explode forever',
  countTierWithoutSuccesses: 'A recipe tier sets no successes needed',
  countRequiredExceedsMaxPool: 'Successes needed above the most dice that can be rolled',
  countRequiredExceedsBasePool: 'Successes needed above the base pool',
  countPoolTooLarge: 'The base pool is too large to roll',
  countPathUnresolvedForPreview: 'A character path does not resolve',
  countValueNotNumericForPreview: 'A character value is not a number',
  freeTextCountingFormula: 'This formula counts successes, but the check adds the dice',
  countFaceMissing: 'A face to explode or cancel from is not chosen',
  countTriggerGroupUnreachable: 'A trigger reads dice the pool never rolls',
};

/** Each title's key is its id's `Issue<Id>Title`, so the table above holds only the fallbacks. */
export const CHECK_ISSUE_TITLES = Object.freeze(
  Object.fromEntries(
    Object.entries(TITLE_FALLBACKS).map(([id, fallback]) => [
      id,
      [`Issue${id[0].toUpperCase()}${id.slice(1)}Title`, fallback],
    ])
  )
);

const NAMESPACE = 'FABRICATE.Admin.Manager.Checks.Validation.';

function copyFor(map, id) {
  const meta = map[id] || [id, id];
  return { key: `${NAMESPACE}${meta[0]}`, fallback: meta[1] };
}

/** The localization key and English fallback for a readiness ISSUE id.
 *  @param {string} id A `CHECK_READINESS_ISSUE_IDS` member.
 *  @returns {{ key: string, fallback: string }} */
export function checkIssueCopy(id) {
  return copyFor(CHECK_ISSUE_LABELS, id);
}

/** The localization key and English fallback for a readiness TICK id.
 *  @param {string} id A check tick id. @returns {{ key: string, fallback: string }} */
export function checkTickCopy(id) {
  return copyFor(CHECK_TICK_LABELS, id);
}

/** The record a flag in an issue's data stands for, named before the tier and outcome names. */
function flaggedRecordName(data, text) {
  if (data.defaultRecord) {
    return text('FABRICATE.Admin.Manager.Checks.PreviewAs.DefaultRecord', 'Default');
  }
  if (!data.baseAdjustment) return '';
  const base = text(
    'FABRICATE.Admin.Manager.Checks.Evaluation.RecordBaseAdjustment',
    'base adjustment'
  );
  return `${base.charAt(0).toLocaleUpperCase()}${base.slice(1)}`;
}

/**
 * An issue's data in the reader's language: a flagged default record or faulted base adjustment
 * named before the rest, and any coded phrase (a face rule's kind and effect) localized.
 */
function issueData(data, text) {
  if (!data) return data;
  const { triggers, ...resolved } = data;
  for (const [field, phrases] of Object.entries(ISSUE_PHRASES)) {
    const phrase = phrases[resolved[field]];
    if (phrase) resolved[field] = text(`${NAMESPACE}${phrase[0]}`, phrase[1]);
  }
  if (Array.isArray(triggers)) {
    const names = triggers.map((fragment) => resolveFragment(fragment, text));
    resolved.names =
      names.length === 1 ? names[0] : names.map((name) => quotedName(name, text)).join(', ');
  }
  const named = flaggedRecordName(data, text);
  if (!named) return resolved;
  return { ...resolved, names: [named, data.names].filter(Boolean).join(', ') };
}

/** A `{ key, fallback, data }` fragment, any fragment nested in its data resolved first. */
function resolveFragment({ key, fallback, data = {} }, text) {
  const filled = Object.fromEntries(
    Object.entries(data).map(([field, value]) => [
      field,
      value && typeof value === 'object' ? resolveFragment(value, text) : value,
    ])
  );
  return interpolate(text(key, fallback, filled), filled);
}

/** One name of a listed trigger, in the reader's quotation marks. */
function quotedName(name, text) {
  const data = { name };
  const quoted = text('FABRICATE.Admin.Manager.Checks.Validation.QuotedName', '“{name}”', data);
  return interpolate(quoted, data);
}

/**
 * What a `freeTextCountingFormula` row adds about its Convert (issue 2006): a kept macro read as
 * the successes needed, the records overriding only the DC, or the count that falls outside 0–20.
 */
function conversionNotes(data, text) {
  const notes = [];
  if (data?.dynamic) {
    notes.push(
      text(
        'FABRICATE.Admin.Manager.Checks.Count.Convert.DynamicNote',
        'Converting keeps the macro, and its return is then read as the successes needed.'
      )
    );
  }
  if (data?.overrides) {
    const sentence = text(
      'FABRICATE.Admin.Manager.Checks.Count.Convert.OverridesNote',
      "{names} override the DC but not the successes needed, so after converting they use the check's successes needed.",
      { names: data.overrides }
    );
    notes.push(interpolate(sentence, { names: data.overrides }));
  }
  if (Number.isFinite(data?.outOfRange)) {
    const value = formatSigned(data.outOfRange);
    const sentence = text(
      'FABRICATE.Admin.Manager.Checks.Count.Convert.OutOfRange',
      'It cannot be converted: it would need {value} successes, outside 0 to 20.',
      { value }
    );
    notes.push(interpolate(sentence, { value }));
  }
  return notes;
}

/**
 * The Convert action a convertible `freeTextCountingFormula` issue offers, as `[key, fallback]`
 * pairs for its verb and its accessible description, or null for any other issue.
 */
export function convertActionCopy(issue) {
  if (issue?.id !== 'freeTextCountingFormula' || issue.data?.convertible !== true) return null;
  return {
    label: ['FABRICATE.Admin.Manager.Checks.Count.Convert.Action', 'Convert to count successes'],
    description: issue.data.exceed
      ? [
          'FABRICATE.Admin.Manager.Checks.Count.Convert.DescriptionExceed',
          'Copies each DC plus one into successes needed, because this check passes only above its DC. The formula and DCs are kept.',
        ]
      : [
          'FABRICATE.Admin.Manager.Checks.Count.Convert.Description',
          'Copies the DCs into successes needed. The formula and DCs are kept.',
        ],
  };
}

/** A readiness issue's one sentence, as `checkIssueText` fills it. */
export function checkIssueSentence(id, data, text) {
  const resolved = issueData(data, text);
  const one = id === 'countTriggerGroupUnreachable' && data?.triggers?.length === 1;
  const copy = one ? ONE_TRIGGER_UNREACHABLE : checkIssueCopy(id);
  const sentence = interpolate(text(copy.key, copy.fallback, resolved), resolved);
  if (id !== 'freeTextCountingFormula') return sentence;
  return [sentence, ...conversionNotes(data, text)].join(' ');
}

/**
 * The words one readiness issue renders, `{ title, detail }`: its short title over its sentence.
 * An id with no title degrades to its own id rather than throwing. `text(key, fallback, data)`.
 */
export function checkIssueText(id, data, text) {
  const title = copyFor(CHECK_ISSUE_TITLES, id);
  return { title: text(title.key, title.fallback), detail: checkIssueSentence(id, data, text) };
}

/**
 * Interpolate `{name}` placeholders into an already-resolved sentence. Foundry's `i18n.format`
 * does this for a LOCALIZED string, but the fallbacks above are module constants that never
 * reach it, so a world with no `lang/` entry would render a literal `{names}`. Deliberately the
 * same `{key}` syntax Foundry uses, and here rather than in the two components that need it.
 * @param {string} sentence The resolved sentence.
 * @param {object} [data] Interpolation values.
 * @returns {string}
 */
export function interpolate(sentence, data) {
  const text = typeof sentence === 'string' ? sentence : '';
  if (!data || typeof data !== 'object') return text;
  return text.replaceAll(/\{(\w+)\}/g, (match, key) =>
    Object.hasOwn(data, key) ? String(data[key]) : match
  );
}

/** U+2212, the minus the Studio writes every negative number with. */
export const MINUS = '−';

/** A number with the true minus; `plus` signs zero and above too, as `margin +0` reads. */
export function formatSigned(value, { plus = false } = {}) {
  if (value < 0) return `${MINUS}${Math.abs(value)}`;
  return plus ? `+${value}` : String(value);
}

/** The roll-under comparison word: `at or under`, or `under` for a strict comparison. */
export function underComparisonPhrase(thresholdMode, text) {
  return thresholdMode === 'exceed'
    ? text('FABRICATE.Admin.Manager.Checks.Evaluation.CmpExceed', 'under')
    : text('FABRICATE.Admin.Manager.Checks.Evaluation.CmpMeet', 'at or under');
}

/** A count's per-die comparison word: `at or above` / `above` over, `at or under` / `under` under. */
export function countComparisonPhrase(direction, thresholdMode, text) {
  if (direction === 'under') return underComparisonPhrase(thresholdMode, text);
  return thresholdMode === 'exceed'
    ? text('FABRICATE.Admin.Manager.Checks.Count.CmpOverExceed', 'above')
    : text('FABRICATE.Admin.Manager.Checks.Count.CmpOverMeet', 'at or above');
}

/**
 * A counting check's Two outcomes subtitles, `{ success, failure }`, in the successes `required`
 * (issue 2006): the prototype's `Reaches {T} successes` and `Fewer than {T}` for the `record`.
 */
export function countOutcomeCopy(required, record, text) {
  const success =
    required === 1
      ? text(
          'FABRICATE.Admin.Manager.Checks.Count.Outcomes.SuccessOne',
          "Reaches 1 success — the {record}'s result group is produced in full."
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Count.Outcomes.Success',
          "Reaches {required} successes — the {record}'s result group is produced in full."
        );
  const failure =
    required === 1
      ? text(
          'FABRICATE.Admin.Manager.Checks.Count.Outcomes.FailureOne',
          'Fewer than 1 success — nothing is produced; the failure policy decides the cost.'
        )
      : text(
          'FABRICATE.Admin.Manager.Checks.Count.Outcomes.Failure',
          'Fewer than {required} — nothing is produced; the failure policy decides the cost.'
        );
  return {
    success: interpolate(success, { required, record }),
    failure: interpolate(failure, { required }),
  };
}

/** The Formula card's lead: a counting check is built from controls, not typed. */
export function formulaCardLead(evaluation, text, key, fallback) {
  if (evaluation?.product === 'count') {
    return text(
      'FABRICATE.Admin.Manager.Checks.Count.FormulaLead',
      'Built from the controls below, so every part of the roll can be checked.'
    );
  }
  return text(key, fallback);
}

/**
 * The Formula inset's target chip: `Target {dc}` for a fixed source, else the character expression,
 * or `Character value` while none is written.
 */
export function checkTargetChip(evaluation, dc, text) {
  if (evaluation?.target?.source === 'attribute') {
    return (
      String(evaluation.target.expression ?? '').trim() ||
      text('FABRICATE.Admin.Manager.Checks.Evaluation.SourceAttribute', 'Character value')
    );
  }
  return interpolate(text('FABRICATE.Admin.Manager.Checks.Evaluation.TargetChip', 'Target {dc}'), {
    dc: Number(dc ?? 0) || 0,
  });
}

/**
 * The Check type chooser's two options (the prototype's copy), each sentence resolved with the
 * activity's own record words before it reaches `RadioCardGroup`, which takes no interpolation.
 * Icons name what a tier threshold IS: an offset from the record's DC, or a measured segment.
 */
export function checkTypeOptions(text, { record, records }) {
  const words = { record, records };
  return [
    {
      value: 'relative',
      icon: 'fas fa-plus-minus',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeRelative',
      fallback: 'Relative',
      description: interpolate(
        text(
          'FABRICATE.Admin.Manager.Checks.Crafting.TypeRelativeDesc',
          "Bands are offsets from the {record}'s own DC, so they move with it — DC −10 to −5 might be Bad. Each {record} picks a difficulty tier or overrides the DC with a number."
        ),
        words
      ),
    },
    {
      value: 'fixed',
      icon: 'fas fa-ruler',
      labelKey: 'FABRICATE.Admin.Manager.Checks.Crafting.TypeFixed',
      fallback: 'Fixed',
      description: interpolate(
        text(
          'FABRICATE.Admin.Manager.Checks.Crafting.TypeFixedDesc',
          'Bands are absolute roll values and never move — 13 to 17 is always Good. {records} carry no DC at all; they only route their result groups to these tiers.'
        ),
        words
      ),
    },
  ];
}

/**
 * An outcome tier's threshold field names, shared by the row's accessible names and the list's
 * column head: `[start, end]` for a fixed range, else the one field `column` edits.
 */
export function outcomeThresholdLabels(type, column, text) {
  if (type === 'fixed') {
    return [
      text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeStart', 'Start'),
      text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeEnd', 'End'),
    ];
  }
  if (column === 'adjustment') {
    return [text('FABRICATE.Admin.Manager.Checks.Evaluation.Adjustment', 'Adjustment')];
  }
  if (column === 'benefit') {
    return [text('FABRICATE.Admin.Manager.Checks.Evaluation.OutcomeBenefit', 'Benefit ±')];
  }
  if (column === 'successes') {
    return [text('FABRICATE.Admin.Manager.Checks.Count.Bands.ExtraSuccesses', 'Extra successes')];
  }
  return [text('FABRICATE.Admin.Manager.Checks.Crafting.OutcomeDc', 'DC ±')];
}

/** The prototype's reference-kind glyphs, each a Font Awesome Free name, first match wins. */
const FORMULA_TOKEN_KINDS = Object.freeze([
  [/^\d*d\d+/i, 'fas fa-dice-d20'],
  [/^@prof\b/, 'fas fa-medal'],
  [/^@abilities\./, 'fas fa-hand'],
  [/^@ingredients\b/, 'fas fa-flask'],
  [/^@(?:details\.)?level\b/, 'fas fa-arrow-up-9-1'],
]);

/** A quick formula token's kind glyph (a die, proficiency, an ability…), or `''` for a kind the
 *  prototype draws none for. */
export function formulaTokenIcon(token) {
  const source = String(token ?? '').trim();
  return FORMULA_TOKEN_KINDS.find(([pattern]) => pattern.test(source))?.[1] ?? '';
}

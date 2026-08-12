/**
 * The ONE set of sentences the Checks Studio uses to describe a readiness result (issue
 * 1096).
 *
 * These lived inside `ChecksValidationTab.svelte` while Validation was the only surface that
 * named an issue. It is not any more: a section's warning dot is now explained IN the panel
 * by a `Callout`, and a dot whose sentence is a second copy of Validation's is how one issue
 * comes to be described two different ways on two screens a single click apart.
 *
 * Each entry is `[localizationSuffix, englishFallback]`, resolved against the shared
 * `FABRICATE.Admin.Manager.Checks.Validation.` namespace by {@link checkIssueCopy} /
 * {@link checkTickCopy} — the components keep their own `text()` bridge, because the
 * localization seam belongs to the Svelte layer and this module stays pure.
 *
 * The issue map is PROVEN EXHAUSTIVE against `CHECK_READINESS_ISSUE_IDS` by
 * `tests/checks-readiness.test.js`, in both directions: an id the evaluator can raise with no
 * sentence here would render its raw id to a GM, and a sentence for an id the evaluator
 * cannot raise is copy nobody will ever see.
 */

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
});

/** The ISSUES a check can raise, keyed by `CHECK_READINESS_ISSUE_IDS` member. */
export const CHECK_ISSUE_LABELS = Object.freeze({
  noRollFormula: [
    'IssueNoRollFormula',
    'This check has no roll formula; it will not resolve until one is set.',
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
    'Name every outcome tier — an unnamed tier cannot be routed to a result group.',
  ],
  noSuccessOutcome: [
    'IssueNoSuccessOutcome',
    "No outcome tier is marked as a Success — successful crafts can't route to a result set. Mark at least one tier as Success.",
  ],
  rangeInvalid: ['IssueRangeInvalid', 'Some tiers have a start greater than their end.'],
  rangeOverlap: ['IssueRangeOverlap', 'Some tier ranges overlap. Each value range must be unique.'],
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
    'Two or more triggers set a target tier; if more than one matches, the lowest-ranked wins.',
  ],
});

const NAMESPACE = 'FABRICATE.Admin.Manager.Checks.Validation.';

function copyFor(map, id) {
  const meta = map[id] || [id, id];
  return { key: `${NAMESPACE}${meta[0]}`, fallback: meta[1] };
}

/**
 * The localization key and English fallback for a readiness ISSUE id.
 * @param {string} id A `CHECK_READINESS_ISSUE_IDS` member.
 * @returns {{ key: string, fallback: string }}
 */
export function checkIssueCopy(id) {
  return copyFor(CHECK_ISSUE_LABELS, id);
}

/**
 * The localization key and English fallback for a readiness TICK id.
 * @param {string} id A check tick id.
 * @returns {{ key: string, fallback: string }}
 */
export function checkTickCopy(id) {
  return copyFor(CHECK_TICK_LABELS, id);
}

/**
 * Interpolate `{name}` placeholders into an already-resolved sentence (issue 1117).
 *
 * Foundry's `i18n.format` does this for a LOCALIZED string, but the fallbacks above are
 * plain module constants that never reach it — a world with no `lang/` entry for a new key
 * would otherwise render a literal `{names}` to the GM. This is deliberately the same
 * `{key}` syntax Foundry uses, so one sentence serves both paths, and it lives here rather
 * than in the two components that need it because a second copy is a duplication-gate
 * finding and a drift risk at once.
 *
 * A sentence with no placeholders, or a call with no data, returns the input unchanged.
 *
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

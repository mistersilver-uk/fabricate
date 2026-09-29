/**
 * The Difficulty card's callouts for a counting check (issue 2006). The required-count rows are
 * Validation's own, raised by the readiness evaluator against the same literal base, so the card
 * has no shortfall predicate of its own and never claims more than issue 2004's sentences do.
 */
import { checkIssueSentence, checkTickCopy } from './checksCopy.js';
import { countRequiredReadiness, literalBaseDice } from './checksReadiness.js';

const REQUIRED_TONES = Object.freeze({
  countRequiredExceedsMaxPool: 'danger',
  countRequiredExceedsBasePool: 'warning',
});
const CHARACTER_TICK = 'countPoolCharacterDependent';

/**
 * `{ id, tone, icon, text }[]`: the ceiling sentences and the character-dependent tick, where
 * `tiers` are the recipe tiers readiness grades (null when the check grades no required count),
 * then the zero-pool sentence for a literal base the runtime settles to no dice.
 */
export function countDifficultyCallouts({ evaluation, thresholdMode, tiers = null }, text) {
  const literal = literalBaseDice(evaluation, thresholdMode);
  const callouts = [];
  if (Array.isArray(tiers)) {
    const found = { checks: [], issues: [] };
    countRequiredReadiness(found, evaluation, { tiers, literal });
    for (const issue of found.issues) {
      if (!Object.hasOwn(REQUIRED_TONES, issue.id)) continue;
      const sentence = checkIssueSentence(issue.id, issue.data, text);
      callouts.push({ id: issue.id, tone: REQUIRED_TONES[issue.id], icon: '', text: sentence });
    }
    if (found.checks.some(({ id }) => id === CHARACTER_TICK)) {
      const copy = checkTickCopy(CHARACTER_TICK);
      const tick = text(copy.key, copy.fallback);
      callouts.push({ id: CHARACTER_TICK, tone: 'info', icon: 'fas fa-circle-check', text: tick });
    }
  }
  if (literal.ok && literal.policy.zeroPool) {
    callouts.push({
      id: 'countZeroPool',
      tone: 'warning',
      icon: '',
      text: text(
        'FABRICATE.Admin.Manager.Checks.Count.Difficulty.ZeroPool',
        'This pool is reduced to zero, so the check fails automatically unless modifiers add dice.'
      ),
    });
  }
  return callouts;
}

/**
 * The `chooseAward` command's own rules at the journal-run edge (issue 1773): its payload shape,
 * the authorization that replaces the crafting source-owner check, and the dismissal it blocks.
 */
import { holdsUnsettledAwardChoice, isUnsettledChoice } from './choiceGroupAward.js';

const list = (value) => (Array.isArray(value) ? value : []);
const validText = (value) => typeof value === 'string' && value.trim() !== '';

/** A `chooseAward` payload names one choice and lists alternative ids; nothing else is read. */
export const validAwardChoicePayload = (payload) =>
  validText(payload?.choiceId) && Array.isArray(payload.picks) && payload.picks.every(validText);

/**
 * `chooseAward`'s authorization once the sender is the actor's owner or a GM: `true`, or the
 * refusal for a run that is not a crafting run or a choice already settled. The settle's own
 * request is never refused here, so its replay answers the committed outcome.
 */
export function authorizeAwardChoice({ run, request }) {
  if (request?.runType !== 'crafting') return { success: false, reason: 'unsupported-operation' };
  if (run?.awardChoiceJournal?.requestId === request.requestId) return true;
  const matches = list(run?.steps)
    .flatMap((step) => list(step?.pendingAwardChoices))
    .filter((choice) => choice?.choiceId === request.payload?.choiceId);
  if (matches.length > 0 && !matches.some(isUnsettledChoice)) {
    return { success: false, reason: 'award-choice-settled' };
  }
  return true;
}

/**
 * Why a terminal run cannot be dismissed, or `null`: it still owes a pick, unless its settle is
 * awaiting recovery, which nothing in the Journal can finish.
 */
export function awardChoiceDismissalRefusal(run) {
  if (!holdsUnsettledAwardChoice(run)) return null;
  if (run?.awardChoiceJournal?.status === 'recoveryRequired') return null;
  return { success: false, reason: 'award-choice-pending' };
}

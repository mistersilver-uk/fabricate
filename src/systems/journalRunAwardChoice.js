/**
 * `chooseAward` at the journal-run edge (issue 1773): its payload, its authorization and the
 * dismissal it blocks. A replayed settle carries its own `requestId`, which the ledger answers.
 */
import { arrayOrEmpty as list } from '../utils/scalars.js';

import { holdsUnsettledAwardChoice, isUnsettledChoice } from './choiceGroupAward.js';
import { validText } from './journalRunReply.js';

export const validAwardChoicePayload = (payload) =>
  validText(payload?.choiceId) && Array.isArray(payload.picks) && payload.picks.every(validText);

/** After the owner-or-GM check: refuse a non-crafting run or a settled choice, but never the
 *  settle's own request, so its replay answers the committed outcome. */
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

/** A run still owing a pick is not dismissible, unless its settle awaits recovery. */
export function awardChoiceDismissalRefusal(run) {
  if (!holdsUnsettledAwardChoice(run)) return null;
  if (run?.awardChoiceJournal?.status === 'recoveryRequired') return null;
  return { success: false, reason: 'award-choice-pending' };
}

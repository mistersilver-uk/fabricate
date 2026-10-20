/**
 * The Workbench's reading of one `submitAlchemyAttempt` reply (issue 2574). Statuses:
 * `success` and `tiered-tier` for a passed brew; `produced-on-failure` for a failed check that
 * yielded results; `check-failed` for a failed check; `brewing` for a run the call left live;
 * `no-match-fizzle` for `disposition: 'no-match'` only; `refused` for anything else.
 * A version-1 start spends the bench, so a reply carrying its run never reads as a refusal.
 */
import { journalCommandRefusal } from '../../presenters/additionalDicePrompt.js';
import { isResolvedFailureOutcome } from '../util/journalRunReasons.js';

/** Whether the reply carries the run a version-1 start left behind. */
function startedRun(result) {
  return (
    typeof result?.runId === 'string' &&
    result.runId !== '' &&
    Object.hasOwn(result, 'requiresExecution')
  );
}

/** A dismissed roll before anything was spent: the bench stays as it was. */
export function isQuietDismissal(result) {
  return result?.cancelled === true && !startedRun(result);
}

/** A facade message that is a raw lang key, localized; any other text as it is. */
function wordedMessage(result, localize) {
  const message = typeof result?.message === 'string' ? result.message.trim() : '';
  if (!message.startsWith('FABRICATE.') || typeof localize !== 'function') return message;
  return localize(message) || message;
}

function failureStatus(result) {
  if (result?.disposition === 'produced-on-failure') return 'produced-on-failure';
  if (!isResolvedFailureOutcome(result)) return null;
  const created = Array.isArray(result.createdResultUuids) ? result.createdResultUuids : [];
  return created.length > 0 ? 'produced-on-failure' : 'check-failed';
}

/**
 * `{ lastBrew, notice }`: the banner, and the one toast to raise, if any. A refused execute
 * after a start toasts its reason; `generic` words a refusal that names none.
 */
export function classifyBrewReply(
  result,
  { discovered = null, tiered = false, localize, generic }
) {
  const banner = (status, message = '') => ({ status, discovered, message });
  if (result?.success === true) {
    if (startedRun(result) && result.disposition === 'started') {
      return { lastBrew: banner('brewing'), notice: '' };
    }
    const status = tiered ? 'tiered-tier' : 'success';
    return { lastBrew: banner(status, wordedMessage(result, localize)), notice: '' };
  }
  // A check kept secret from the player names no outcome, only where the run ended.
  if (result?.secret === true && result.status === 'failed') {
    return { lastBrew: banner('check-failed'), notice: '' };
  }
  const failed = failureStatus(result);
  if (failed === 'produced-on-failure') {
    return { lastBrew: banner(failed, wordedMessage(result, localize)), notice: '' };
  }
  if (failed) return { lastBrew: banner(failed), notice: '' };
  if (result?.disposition === 'timed-start') return { lastBrew: banner('brewing'), notice: '' };
  if (result?.disposition === 'no-match') {
    return {
      lastBrew: {
        status: 'no-match-fizzle',
        discovered: null,
        message: wordedMessage(result, localize),
      },
      notice: '',
    };
  }
  const refusal = journalCommandRefusal(
    { ...result, message: wordedMessage(result, localize) },
    localize,
    generic
  );
  // Bought dice already raised their one warning, and a dismissed roll is the player's choice.
  const notice = result?.additionalDiceRefusal || result?.cancelled === true ? '' : refusal;
  if (startedRun(result)) return { lastBrew: banner('brewing'), notice };
  return { lastBrew: { status: 'refused', discovered: null, message: refusal }, notice };
}

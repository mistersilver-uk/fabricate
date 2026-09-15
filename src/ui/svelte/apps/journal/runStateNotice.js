/**
 * ONE run has ONE state, so the detail reports it ONCE.
 *
 * Three separate alert blocks used to describe a single run — the action bar's floating
 * blocker, the header's paused/recovery notice, and a bottom guidance callout that only
 * pointed back at the first. This composes them into a single descriptor whose title is
 * the actionable sentence and whose detail is the state that sentence is about.
 */
import { journalRefusalMessage, journalRunReasonMessage } from '../../util/journalRunReasons.js';

/**
 * Codes that report an ordinary next step rather than a refusal. A stage the player has not
 * begun is the normal state of every timed stage, and it already has its own control, so
 * raising a warning notice for it would put a banner on routine play.
 */
const NON_BLOCKING_REASONS = new Set(['stageNotStarted']);

/** The blocker code, when execution is actually refused. `''` otherwise. */
export function runBlockerCode(run) {
  const code = run?.actions?.disabledReason;
  const reported = typeof code === 'string' && code && !NON_BLOCKING_REASONS.has(code);
  return reported && run?.actions?.execute !== true ? code : '';
}

/**
 * Compose the run's single state notice.
 *
 * @param {object|null} run The RunModel.
 * @param {(key: string, data?: object) => string} localize
 * @returns {{tone: string, blocking: boolean, title: string, detail: string, dataAttr: string,
 *   dataValue: string, stateDataAttr: string, stateDataValue: string, evidence: boolean,
 *   claim: object|null}|null} `null` when the run has nothing to report.
 */
export function runStateNotice(run, localize) {
  const text = (key, ...data) => localize(`FABRICATE.App.Journal.Notice.${key}`, ...data);
  const paused = Boolean(run?.pauseState);
  const blocker = runBlockerCode(run);
  const pausedHook = paused
    ? { stateDataAttr: 'data-journal-paused', stateDataValue: 'true' }
    : { stateDataAttr: '', stateDataValue: '' };

  // The run's OWN uncertain effect. It outranks every other state because no other change
  // may happen until a person has looked at the receipts it publishes beneath this notice.
  if (run?.recoveryEvidence?.required === true) {
    return {
      tone: 'danger',
      blocking: true,
      title: text('RecoveryTitle'),
      detail: text('RecoveryDetail', { count: run.recoveryEvidence.appliedEffectCount ?? 0 }),
      dataAttr: 'data-journal-recovery',
      dataValue: 'true',
      ...pausedHook,
      evidence: true,
      claim: null,
    };
  }

  // A run created by an unsupported version is a RECORD, not a refusal to act on.
  if (blocker === 'unsupportedLifecycle') {
    return {
      tone: 'warning',
      blocking: false,
      title: text('UnsupportedTitle'),
      detail: localize('FABRICATE.App.Journal.Actions.UnsupportedLifecycle'),
      dataAttr: 'data-journal-unsupported',
      dataValue: 'true',
      ...pausedHook,
      evidence: false,
      claim: null,
    };
  }

  if (blocker) {
    const claim = run?.actions?.recoveryClaim ?? null;
    return {
      tone: ['recovery-required', 'recoveryRequired'].includes(blocker) ? 'danger' : 'warning',
      blocking: false,
      title:
        journalRunReasonMessage(blocker, localize) ||
        localize('FABRICATE.App.Journal.Actions.Unavailable'),
      detail: claim ? retainedClaimDetail(claim, localize) : paused ? text('PausedInline') : '',
      dataAttr: 'data-journal-action-blocker',
      dataValue: blocker,
      ...pausedHook,
      evidence: false,
      claim,
    };
  }

  // Waiting on the player's OWN choice. It reads as guidance rather than as a refusal,
  // because a stage that has not been given its materials yet is ordinary play — the same
  // reason `stageNotStarted` raises no banner. Ranked under the blockers: a run that is also
  // refused has a cause the player cannot choose their way out of (issue 1648, M10).
  if (run?.awaitingChoice === true) {
    return {
      tone: 'info',
      blocking: false,
      title: text('ChoiceTitle'),
      detail: text('ChoiceDetail'),
      dataAttr: 'data-journal-awaiting-choice',
      dataValue: 'true',
      ...pausedHook,
      evidence: false,
      claim: null,
    };
  }

  if (paused) {
    return {
      tone: 'warning',
      blocking: false,
      title: text('PausedTitle'),
      detail: text('PausedDetail'),
      dataAttr: 'data-journal-paused',
      dataValue: 'true',
      stateDataAttr: '',
      stateDataValue: '',
      evidence: false,
      claim: null,
    };
  }

  return null;
}

/**
 * What the retained claim leaves uncertain. The request id is opaque, so the recorded
 * refusal is the only thing that can name the interrupted operation.
 *
 * @param {object} claim `run.actions.recoveryClaim`.
 * @param {(key: string, data?: object) => string} localize
 * @returns {string}
 */
export function retainedClaimDetail(claim, localize) {
  return localize('FABRICATE.App.Journal.Recovery.ClaimDetail', {
    failure: journalRefusalMessage(
      { message: claim?.failureMessage, reason: claim?.failureReason },
      localize,
      localize('FABRICATE.App.Journal.Recovery.UnknownFailure')
    ),
  });
}

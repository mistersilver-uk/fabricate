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
 * raising a warning notice for it would put a banner on routine play. `choiceRequired` is the
 * same shape: the unmade pick already has its own `awaitingChoice` guidance notice below, so
 * this code must not also raise the warning-toned blocker banner for it (issue 1648, M15).
 * `routeRequired` is the SAME unmade pick, reported in its own words because a route decision
 * and an option or allocation decision are not the same act (issue 1648, F5), so it is
 * non-blocking for the same reason. `awardChoicePending` is the reward the run's own notice asks
 * for (issue 1773), so it raises no second banner either.
 */
const NON_BLOCKING_REASONS = new Set([
  'stageNotStarted',
  'choiceRequired',
  'routeRequired',
  'awardChoicePending',
]);

/**
 * The reward notice's title and detail for this viewer: one who may not pick is told who does,
 * and one who may is told to choose below, or that nothing there can be claimed now.
 */
function rewardNoticeKeys(run) {
  const blocker = run?.awardChoiceBlocker;
  if (blocker === 'notOwner') return ['RewardWaitingTitle', 'RewardOwnerDetail'];
  if (blocker === 'notEntitled') return ['RewardWaitingTitle', 'RewardGmDetail'];
  const claimable = (run?.awardChoices ?? []).some((choice) =>
    (choice.alternatives ?? []).some((alternative) => !alternative.unclaimable)
  );
  return ['RewardTitle', claimable ? 'RewardDetail' : 'RewardNoneClaimableDetail'];
}

/** The picks a hidden recipe withholds from this viewer, as `stageReadiness.js` names them. */
const WITHHELD_PICKS = Object.freeze(['routeRequired', 'choiceRequired']);

/**
 * A redacted run's stage that owes a route or option pick (issue 3033). No pick is offered to a
 * viewer the recipe is hidden from and its code raises no banner, while a disabled control's
 * title is not reliably announced, so the notice says what waits and who resolves it.
 */
function withheldChoiceNotice(run, text, pausedHook) {
  if (run?.redacted !== true || !WITHHELD_PICKS.includes(run?.actions?.disabledReason)) return null;
  return {
    tone: 'info',
    blocking: false,
    title: text('RedactedChoiceTitle'),
    detail: text('RedactedChoiceDetail'),
    hooks: {
      'data-journal-awaiting-choice': 'true',
      'data-journal-choice-withheld': 'true',
      ...pausedHook,
    },
    evidence: false,
    claim: null,
  };
}

/** The blocker code, when execution is actually refused. `''` otherwise. */
export function runBlockerCode(run) {
  const code = run?.actions?.disabledReason;
  const reported = typeof code === 'string' && code && !NON_BLOCKING_REASONS.has(code);
  return reported && run?.actions?.execute !== true ? code : '';
}

/**
 * The ranked tiers of one run's notice, highest first: recovery, an unsupported version (a record,
 * so non-blocking), any other blocker, the Iterative Attempt notice, then the shipped reward,
 * choice and paused notices. Only the first tier that applies is shown.
 */
export const NOTICE_RANK = Object.freeze([
  'recovery',
  'unsupported',
  'blocker',
  'iterative',
  'award',
  'choice',
  'paused',
]);

const UNSUPPORTED_BLOCKERS = new Set(['unsupportedLifecycle', 'version-unsupported']);

/** An iterative descriptor as a notice: polite, with its glyph, ledger, yields and two hooks. */
function iterativeState(descriptor, pausedHook) {
  return {
    tone: descriptor.tone,
    blocking: false,
    title: descriptor.title,
    detail: descriptor.detail,
    hooks: {
      'data-iterative-notice': descriptor.kind,
      'data-iterative-reason': descriptor.reason,
      ...pausedHook,
    },
    evidence: false,
    claim: null,
    icon: descriptor.icon,
    ledger: descriptor.ledger ?? null,
    yields: descriptor.yields ?? [],
  };
}

/**
 * Compose the run's single state notice.
 *
 * @param {object|null} run The RunModel.
 * @param {(key: string, data?: object) => string} localize
 * @param {object|null} [iterativeNotice] The workpiece's own notice (`iterativeAttempt` store), which
 *   outranks the shipped reward, choice and paused notices and nothing above them.
 * @returns {{tone: string, blocking: boolean, title: string, detail: string,
 *   hooks: Record<string, string>, evidence: boolean, claim: object|null, icon?: string,
 *   ledger?: object|null, yields?: object[]}|null} `hooks` is the notice's own `data-*` hook
 *   followed by the paused one; `null` when the run has nothing to report.
 */
export function runStateNotice(run, localize, iterativeNotice = null) {
  const text = (key, ...data) => localize(`FABRICATE.App.Journal.Notice.${key}`, ...data);
  const paused = Boolean(run?.pauseState);
  const blocker = runBlockerCode(run);
  const pausedHook = paused ? { 'data-journal-paused': 'true' } : {};

  // The run's OWN uncertain effect. It outranks every other state because no other change
  // may happen until a person has looked at the receipts it publishes beneath this notice.
  //
  // It still carries the retained claim when the projection offers one. This is the run a GM
  // opens FIRST when the world is stuck, and answering `null` here is what left them with no
  // release control anywhere and a console call as the only way out (issue 1648, M27). The
  // receipts stay the thing they read before deciding; the control is simply on the same screen.
  if (run?.recoveryEvidence?.required === true) {
    return {
      tone: 'danger',
      blocking: true,
      title: text('RecoveryTitle'),
      detail: text('RecoveryDetail', { count: run.recoveryEvidence.appliedEffectCount ?? 0 }),
      hooks: { 'data-journal-recovery': 'true', ...pausedHook },
      evidence: true,
      claim: run?.actions?.recoveryClaim ?? null,
    };
  }

  // A run created by an unsupported version is a RECORD, not a refusal to act on.
  if (UNSUPPORTED_BLOCKERS.has(blocker)) {
    return {
      tone: 'warning',
      blocking: false,
      title: text('UnsupportedTitle'),
      detail: localize('FABRICATE.App.Journal.Actions.UnsupportedLifecycle'),
      hooks: { 'data-journal-unsupported': 'true', ...pausedHook },
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
        journalRunReasonMessage(blocker, localize, { redacted: run?.redacted === true }) ||
        localize('FABRICATE.App.Journal.Actions.Unavailable'),
      detail: claim ? retainedClaimDetail(claim, localize) : paused ? text('PausedInline') : '',
      hooks: { 'data-journal-action-blocker': blocker, ...pausedHook },
      evidence: false,
      claim,
    };
  }

  if (iterativeNotice) return iterativeState(iterativeNotice, pausedHook);

  // A reward waiting for a pick, worded for whether this viewer can make it (issue 1773).
  if (run?.awardChoicePending === true) {
    const [title, detail] = rewardNoticeKeys(run);
    return {
      tone: 'info',
      blocking: false,
      title: text(title),
      detail: text(detail),
      hooks: { 'data-journal-award-pending': 'true', ...pausedHook },
      evidence: false,
      claim: null,
    };
  }

  const withheld = withheldChoiceNotice(run, text, pausedHook);
  if (withheld) return withheld;

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
      hooks: { 'data-journal-awaiting-choice': 'true', ...pausedHook },
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
      hooks: pausedHook,
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

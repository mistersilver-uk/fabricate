/**
 * The reply a journal-run command answers its sender: the operation's result reduced to plain,
 * serializable fields, or to its bare outcome for a secret check.
 */
import { holdsUnsettledAwardChoice } from './choiceGroupAward.js';

export function terminalRun(run) {
  return ['succeeded', 'complete', 'completed', 'cancelled', 'failed', 'archived'].includes(
    String(run?.status ?? '').toLowerCase()
  );
}

const validText = (value) => typeof value === 'string' && value.trim() !== '';

export function serializedOperationResult(result, { secret = false, runId = '' } = {}) {
  const source =
    result && typeof result === 'object'
      ? result
      : { success: false, reason: 'operation-unavailable' };
  const run = source.run && typeof source.run === 'object' ? source.run : {};
  const base = {
    success: source.success === true,
    runId: source.runId ?? run.id ?? runId,
    status: source.status ?? run.status ?? null,
    runRevision: source.runRevision ?? run.runRevision ?? null,
  };
  if (secret) {
    return {
      ...base,
      secret: true,
      reason: source.success === true ? null : 'operation-failed',
    };
  }
  const results = Array.isArray(source.results) ? source.results : [];
  return {
    ...base,
    reason: source.reason ?? null,
    message: source.message ?? null,
    disposition: source.disposition ?? null,
    waiting: source.waiting === true,
    terminal: source.terminal === true || terminalRun(run),
    authorityUnavailable: source.authorityUnavailable === true,
    automaticBlocked: source.automaticBlocked === true,
    blocker: source.blocker ?? null,
    accepted: source.accepted === true,
    cancelled: source.cancelled === true,
    refunded: source.refunded === true,
    partialRefund: source.partialRefund === true,
    restoredCount: Number.isFinite(source.restoredCount) ? source.restoredCount : 0,
    consumed: source.consumed === true,
    // A stage that left a reward for the player to pick says so, so the crafting outcome can name
    // it and open the run in the Journal (issue 1773).
    ...((source.awardChoicePending === true || holdsUnsettledAwardChoice(run)) && {
      awardChoicePending: true,
    }),
    ...(Object.hasOwn(source, 'requiresExecution') && {
      requiresExecution: source.requiresExecution === true,
    }),
    ...(Object.hasOwn(source, 'canExecuteImmediately') && {
      canExecuteImmediately: source.canExecuteImmediately === true,
    }),
    // Gathering refuses in its own vocabulary (`state` and the coded `blockedReasons`), where
    // crafting uses `reason` and `message`; dropping them left a refusal no surface could word
    // (issue 1759).
    ...(Object.hasOwn(source, 'state') && { state: source.state ?? null }),
    ...(Object.hasOwn(source, 'blockedReasons') && {
      blockedReasons: Array.isArray(source.blockedReasons) ? source.blockedReasons : [],
    }),
    createdResultUuids:
      source.createdResultUuids ?? results.map((item) => item?.uuid).filter(validText),
  };
}

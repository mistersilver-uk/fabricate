/** The terminal half of a gathering attempt, as one ordered pipeline over injected collaborators. */

import { plainObjectOrNull } from './gatheringEngineInternals.js';

export function passThroughAttempt(context) {
  return context;
}

export function noRefusal() {
  return null;
}

/**
 * `prepare` answers the attempt context or a `{ refusal }`, `validate` and `checkPersistAvailable`
 * a `{ kind, details }` refusal or null, and a `writeTerminalHistory` response ends the pipeline.
 */
export function createGatheringAttemptResolution({
  prepare,
  validate,
  resolveOutcome,
  checkPersistAvailable,
  planSideEffects,
  composeHistory,
  writeTerminalHistory,
  commit,
  respond,
  refuse,
}) {
  return async function resolveAttempt(entry) {
    const attempt = await prepare(entry);
    if (attempt.refusal) {
      return refuse(attempt.refusal.kind, { ...entry, ...attempt.refusal.details });
    }
    const misconfigured = await validate(attempt);
    if (misconfigured) {
      return refuse(misconfigured.kind, { ...attempt, ...misconfigured.details });
    }

    const outcome = await resolveOutcome(attempt);
    if (outcome.status === 'cancelled') return refuse('cancelled', { ...attempt, outcome });
    if (outcome.status === 'misconfigured') {
      return refuse('task-misconfigured-outcome', { ...attempt, outcome });
    }
    const unavailable = await checkPersistAvailable(attempt);
    if (unavailable) {
      return refuse(unavailable.kind, { ...attempt, ...unavailable.details });
    }

    // `outcome` travels on by identity: the plan writes a voided award back onto it, and every
    // stage below reads the written value.
    const checkResult = plainObjectOrNull(outcome.checkResult) ?? undefined;
    const plan = await planSideEffects({ ...attempt, outcome, checkResult });
    if (plan.status === 'misconfigured') {
      return refuse('task-misconfigured-plan', { ...attempt, outcome: plan });
    }

    const settled = { ...attempt, outcome, checkResult, plan };
    const { runData, payload } = await composeHistory(settled);
    const written = await writeTerminalHistory({ ...settled, runData, payload });
    if (written.response) return written.response;

    const commitReceipt = await commit({ ...settled, run: written.run });
    return respond({ ...settled, ...commitReceipt });
  };
}

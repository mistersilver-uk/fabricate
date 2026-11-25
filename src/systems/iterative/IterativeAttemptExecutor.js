/**
 * Takes one Iterative Attempt under the authority's claim (`recipes-and-steps` § Iterative Step
 * Lifecycle): re-reads and re-checks the run, resolves the attempt, and persists a non-terminal
 * one as one revision-checked run write. Every throw before a plan is written is a refusal.
 */
import { RUN_JOURNAL_KEYS } from '../runJournalReconstruction.js';
import { applyGuardedRunMutation, assertRunLifecycleMutation } from '../runLifecycleState.js';
import {
  authorityUnavailableResult,
  versionedTransitionResult,
} from '../versionedCommandResults.js';

import { inspectIterativeAttempt, iterativeCheckSummary } from './iterativeAttemptCheck.js';
import { appendAttemptEntry, recordAttemptOnRun } from './iterativeStepState.js';
import { resolveAttempt } from './resolveAttempt.js';

/** An Iterative Attempt journals into the stage's `executionJournal`, on an active run only. */
export const ITERATIVE_LANE = Object.freeze({
  operation: 'takeAction',
  journal: 'executionJournal',
  otherJournal: 'awardChoiceJournal',
  terminalAdmitted: false,
});

/** The refusal each code thrown before a plan is written answers; nothing was written for any. */
const PRE_PLAN_REASONS = new Map([
  ['STALE_RUN_REVISION', 'stale-run'],
  ['EXECUTION_IN_PROGRESS', 'executionInProgress'],
  ['EXECUTION_RECOVERY_REQUIRED', 'recoveryRequired'],
  ['RUN_PAUSED', 'lifecycle-refused'],
  ['RUN_NOT_FOUND', 'lifecycle-refused'],
  ['STALE_RUN_STAGE', 'lifecycle-refused'],
  ['PLAN_MISMATCH', 'lifecycle-refused'],
  ['LEGACY_RUN', 'lifecycle-refused'],
  ['LIFECYCLE_OPERATION_UNAVAILABLE', 'lifecycle-refused'],
  ['UNSUPPORTED_RUN', 'lifecycle-refused'],
]);

const failure = (reason, extra = {}) => ({ success: false, reason, ...extra });

function prePlanRefusal({ code, message }) {
  const reason = PRE_PLAN_REASONS.get(code);
  if (!reason) return null;
  return reason === 'lifecycle-refused' ? failure(reason, { message }) : failure(reason);
}

/** The run under the claim, or the refusal that keeps it unchanged. */
function claimedRun(engine, { actor, runId, expectedRevision }) {
  const runManager = engine._craftingRunManager();
  runManager?.invalidateCache?.(actor?.id);
  const run = runManager?.getActiveRun?.(actor, runId) ?? null;
  if (!run) return { refusal: failure('lifecycle-refused', { message: 'The run is not active.' }) };
  assertRunLifecycleMutation(run, { currentOnly: true, expectedRevision });
  if (RUN_JOURNAL_KEYS.some((key) => run[key] && run[key].status !== 'committed')) {
    return { refusal: failure('recoveryRequired') };
  }
  return { run };
}

/** Whether the grant's prepared check is this action's own: one for a roll, none otherwise. */
function checkMatches(action, trusted) {
  const prepared = trusted?.preparedActionId;
  if (action.check !== 'roll') return !prepared;
  return prepared === action.id && Boolean(trusted?.resolvedCheckResult);
}

/** `next` with `toolBreakOwed` latched by the first checked attempt whose trigger fires. */
function latchToolBreak(engine, { next, entry, recipe, trusted, checked }) {
  if (!checked || next.toolBreakOwed !== null) return next;
  const system = engine._getRecipeSystem(recipe);
  const decision = engine._resolveCraftingBreakageDecision(
    system,
    recipe,
    trusted.resolvedCheckResult
  );
  return decision.forceBreak ? { ...next, toolBreakOwed: { attempt: entry.attempt } } : next;
}

async function persistAttempt(engine, { actor, run, inspected, next, checked, expectedRevision }) {
  recordAttemptOnRun(run, inspected.stepIndex, next, { checked });
  const runManager = engine._craftingRunManager();
  const outcome = await applyGuardedRunMutation(() =>
    runManager.updateRun(actor, run, { expectedRevision })
  );
  if (outcome.refused) return prePlanRefusal(outcome.refused) ?? failure('lifecycle-refused');
  return outcome.run;
}

async function resolveAndPersist(engine, request, settleTerminal) {
  const claimed = claimedRun(engine, request);
  if (claimed.refusal) return claimed.refusal;
  const { run } = claimed;
  const inspected = await inspectIterativeAttempt(engine, { ...request, run });
  if (inspected.refusal) return inspected.refusal;
  const { action } = inspected;
  if (!checkMatches(action, request.trusted)) {
    return failure('check-mismatch', { detail: { actionId: request.actionId } });
  }
  const check =
    action.check === 'roll' ? iterativeCheckSummary(request.trusted.resolvedCheckResult) : null;
  const resolved = resolveAttempt({ ...inspected, check, rollDie: engine.rollDie });
  if (!resolved.ok) return failure(resolved.reason, { detail: resolved.detail });
  const checked = check !== null;
  const entry = { ...resolved.entry, requestId: request.attemptId };
  const appended = appendAttemptEntry(resolved.next, entry, request.attemptId);
  const next = latchToolBreak(engine, {
    next: appended,
    entry,
    recipe: inspected.recipe,
    trusted: request.trusted,
    checked,
  });
  if (resolved.terminal) {
    return settleTerminal(engine, { ...request, run, inspected, next, entry, checked });
  }
  const saved = await persistAttempt(engine, { ...request, run, inspected, next, checked });
  if (saved?.success === false) return saved;
  return {
    ...versionedTransitionResult(saved, { success: true }),
    iterative: { attempt: next.log.at(-1), stepEnd: null, replayed: false },
  };
}

/**
 * One Iterative Attempt of `actionId` under `executionGrant`, recorded as `attemptId`. A committed
 * attempt answers `success: true` with `iterative: { attempt, stepEnd, replayed: false }`, even
 * when its step failed; `success: false` is always a refusal.
 */
export async function takeIterativeAttempt(engine, request, { settleTerminal }) {
  const { actor, runId, expectedRevision, requestId, executionGrant } = request;
  let trusted;
  try {
    trusted = await engine._consumeVersionedGrant(executionGrant, {
      operation: ITERATIVE_LANE.operation,
      actor,
      runId,
      expectedRevision,
      requestId,
    });
  } catch (error) {
    if (error?.code === 'AUTHORITY_UNAVAILABLE') return authorityUnavailableResult();
    throw error;
  }
  try {
    return await resolveAndPersist(engine, { ...request, trusted }, settleTerminal);
  } catch (error) {
    const refusal = prePlanRefusal(error ?? {});
    if (refusal) return refusal;
    throw error;
  }
}

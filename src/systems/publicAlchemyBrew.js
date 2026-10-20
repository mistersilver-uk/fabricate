/**
 * One-call brewing for `submitAlchemyAttempt` (issue 2574), as `executePublicCraft` is for crafting:
 * a matched version-1 start whose stage can execute now is executed in the same call.
 * Kept apart from `executePublicCraft`, because sharing its ready-start test would grow the
 * oversized `journalRunCommands.js`.
 */
import { actorUuidList, executeCommandUnavailable } from './journalRunCommands.js';
import { validText } from './journalRunReply.js';

/**
 * The start reply, executed when it is ready. A fizzle, a waiting or unready start and a refusal
 * return unchanged; otherwise the execute reply lies over the start, so a cancelled or refused
 * execute still names the run the start left live. `interactive` is the caller's flag.
 */
export async function executePublicBrew({
  requestStart,
  actor,
  sourceActors,
  executeCommand = null,
  interactive = false,
} = {}) {
  const started = await requestStart();
  if (
    started?.success !== true ||
    started.requiresExecution !== true ||
    started.canExecuteImmediately !== true ||
    !validText(started.runId)
  ) {
    return started;
  }
  if (typeof executeCommand !== 'function') return executeCommandUnavailable(started);
  const command = {
    actorUuid: actor?.uuid,
    runType: 'crafting',
    runId: started.runId,
    expectedRevision: started.runRevision,
    action: 'execute',
    // No client selection plan: the start already locked the plan the authority derived.
    payload: { trigger: 'manual', sourceActorUuids: actorUuidList(sourceActors) },
  };
  let settled;
  try {
    settled = await executeCommand(command, { interactive: interactive === true });
  } catch {
    // The start already spent the bench, so a lost execute still answers the live run.
    settled = { success: false, reason: 'operation-failed' };
  }
  // The execute reply speaks for the outcome; a secret one names none, so the start's own
  // `disposition` and created results must not stand in for it.
  const { disposition: _started, createdResultUuids: _none, ...run } = started;
  return { ...run, ...settled };
}

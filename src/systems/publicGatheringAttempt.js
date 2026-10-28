/**
 * One-call gathering for `startGatheringAttempt`, as `executePublicCraft` is for crafting: a
 * version-1 start whose stage can execute now is executed in the same call.
 */
import { executeCommandUnavailable, operationUnavailable } from './journalRunCommands.js';
import { validText } from './journalRunReply.js';
import { decisionAdditionalDice } from './preparedDecisionPolicy.js';

/**
 * The start reply, executed when the command layer's `canExecuteImmediately` says it is ready; a
 * refused, waiting or timed start returns unchanged. The execute reply lies over the start, so an
 * accepted attempt whose execute failed still reads `accepted`. `interactive` is the caller's flag,
 * and a station's `presentTools` is an execute payload key only when the caller supplied one.
 */
export async function executePublicGather({
  requestStart,
  actor,
  executeCommand = null,
  interactive = false,
  additionalDice = 0,
  presentTools = null,
} = {}) {
  if (typeof requestStart !== 'function') return operationUnavailable();
  const started = await requestStart();
  if (started?.accepted !== true) return started;
  if (started.requiresExecution !== true || started.canExecuteImmediately !== true) return started;
  const runId = validText(started.runId) ? started.runId : null;
  if (!runId) return started;
  if (typeof executeCommand !== 'function') return executeCommandUnavailable(started);
  const settled = await executeCommand(
    {
      actorUuid: actor?.uuid,
      runType: 'gathering',
      runId,
      // The normalised start lifts the revision to the top level and drops the run document.
      expectedRevision: started.runRevision,
      action: 'execute',
      payload: { trigger: 'manual', ...(presentTools && { presentTools }) },
    },
    { interactive: interactive === true, ...decisionAdditionalDice({ additionalDice }) }
  );
  return { ...started, ...settled };
}

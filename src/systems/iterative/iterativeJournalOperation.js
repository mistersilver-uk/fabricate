/**
 * The crafting operations an Iterative Attempt adds to the Journal command table: `takeAction`,
 * and `answerReplay`, which answers a replayed Attempt id from the run's attempt log before any
 * revision test or authorization, changing nothing.
 */
import { RUN_JOURNAL_KEYS } from '../runJournalReconstruction.js';
import { engineWithStationPresence } from '../stationPresence.js';

import { takeIterativeAttempt } from './IterativeAttemptExecutor.js';
import { findAttemptEntry } from './iterativeStepState.js';
import { settleIterativeTerminal } from './iterativeTerminalOperation.js';

export const ATTEMPT_ID_MAX_LENGTH = 64;

const failure = (reason, extra = {}) => ({ success: false, reason, ...extra });

const validAttemptId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= ATTEMPT_ID_MAX_LENGTH;

/** A `takeAction` payload names its action and an Attempt id of at most 64 characters. */
export function validTakeActionPayload(payload) {
  const actionId = payload?.actionId;
  return (
    typeof actionId === 'string' && actionId.trim() !== '' && validAttemptId(payload.attemptId)
  );
}

/** The recorded attempt a replayed Attempt id names on the run, active or archived, or `null`. */
function answerReplay(runManager, { actor, request }) {
  if (request.action !== 'takeAction') return null;
  runManager?.invalidateCache?.(actor?.id);
  const run = runManager?.getRun?.(actor, request.runId) ?? null;
  const found = findAttemptEntry(run, request.payload?.attemptId);
  if (!found) return null;
  if (RUN_JOURNAL_KEYS.some((key) => run[key] && run[key].status !== 'committed')) {
    return failure('recoveryRequired');
  }
  return {
    success: true,
    replayed: true,
    runId: run.id,
    status: run.status,
    runRevision: run.runRevision,
    iterative: { ...found, replayed: true },
  };
}

/**
 * `operations` with the iterative crafting legs added. `resolveSourceActors(run, payload, actor)`
 * answers the run's component source actors, or `null` when one cannot be resolved.
 */
export function withIterativeOperations(operations, { fabricate, resolveSourceActors }) {
  return {
    ...operations,
    answerReplay: (context) => answerReplay(fabricate.craftingRunManager, context),
    takeAction: async ({ actor, run, payload, executionGrant, requestId, expectedRevision }) => {
      const componentSourceActors = await resolveSourceActors(run, payload, actor);
      if (!componentSourceActors) return failure('source-actor-not-found');
      const engine = engineWithStationPresence(fabricate.craftingEngine, payload.presentTools);
      if (!engine) return failure('unsupported-operation');
      const request = {
        actor,
        componentSourceActors,
        runId: run.id,
        expectedRevision,
        recipeVisibility: fabricate.getRecipeVisibilityService?.() ?? null,
      };
      return takeIterativeAttempt(
        engine,
        {
          ...request,
          executionGrant,
          requestId,
          actionId: payload.actionId,
          attemptId: payload.attemptId,
        },
        { settleTerminal: settleIterativeTerminal }
      );
    },
  };
}

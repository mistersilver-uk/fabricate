/**
 * Native Reconciliation's command edge: the active GM records a disposition that archives an
 * uncertain legacy crafting or salvage run without replaying, undoing or refunding anything.
 */
import { validText } from './journalRunReply.js';

const DISPOSITIONS = new Set(['reconciled', 'abandoned']);

function failure(reason) {
  return { success: false, reason };
}

/**
 * `isActiveGM` is the one recovery door per world, matching the retained-claim authority, so two
 * GM clients cannot close one run with different dispositions; it fails closed by default.
 * `runManagers` maps a `runType` to its `RunContainerManagerBase`.
 */
export function createJournalRunReconciliation({
  isActiveGM = () => false,
  currentUser = () => null,
  resolveActor = async () => null,
  runManagers = {},
} = {}) {
  async function resolve(actorUuid) {
    if (!validText(actorUuid)) return null;
    try {
      return await resolveActor(actorUuid);
    } catch {
      return null;
    }
  }

  async function archive(manager, actor, runId, reconciliation) {
    try {
      return await manager.reconcileUncertainRun(actor, runId, reconciliation);
    } catch (error) {
      console.error('Fabricate | Native Reconciliation could not archive the run', error);
      return { status: 'failed' };
    }
  }

  async function reconcileUncertainJournalRun({
    actorUuid,
    runType,
    runId,
    disposition,
    note,
  } = {}) {
    if (isActiveGM() !== true) return failure('active-gm-required');
    if (!DISPOSITIONS.has(disposition)) return failure('invalid-disposition');
    const manager = Object.hasOwn(runManagers, runType) ? runManagers[runType] : null;
    if (!manager || !validText(runId)) return failure('run-not-found');
    const actor = await resolve(actorUuid);
    if (!actor) return failure('actor-not-found');
    const user = currentUser();
    const { status } = await archive(manager, actor, runId, {
      disposition,
      userId: user?.id,
      userName: user?.name,
      note,
    });
    if (status === 'archived') return { success: true, disposition };
    if (status === 'certain') return failure('run-not-uncertain');
    if (status === 'invalid') return failure('invalid-disposition');
    if (status === 'failed') return failure('operation-failed');
    return failure('run-not-found');
  }

  return { reconcileUncertainJournalRun };
}

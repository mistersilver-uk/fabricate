/**
 * Per-user dismissal of a finished journal run: a hidden run is a user-setting entry, and the
 * actor's history is never deleted.
 */
import { awardChoiceDismissalRefusal } from './journalRunAwardChoice.js';
import { terminalRun, validText } from './journalRunReply.js';

const DISMISSAL_LIMIT = 500;

function failure(reason, extra = {}) {
  return { success: false, reason, ...extra };
}

/**
 * The JSON tuple key hiding one native run per user and world, never deleting actor history;
 * alchemy uses its native `crafting` run type.
 */
export function journalRunDismissalKey({ actorUuid, runType, runId }) {
  return JSON.stringify([String(actorUuid ?? ''), String(runType ?? ''), String(runId ?? '')]);
}

/**
 * Keep valid identity/timestamp entries, bounded to the 500 most recently hidden runs, as a new
 * map for the replacing user-setting write.
 */
export function normalizeJournalRunDismissals(value) {
  const entries = Object.entries(value && typeof value === 'object' ? value : {})
    .filter(([key, hiddenAt]) => {
      if (!validText(key) || !Number.isFinite(Number(hiddenAt))) return false;
      try {
        const tuple = JSON.parse(key);
        return Array.isArray(tuple) && tuple.length === 3 && tuple.every(validText);
      } catch {
        return false;
      }
    })
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, DISMISSAL_LIMIT);
  return Object.fromEntries(entries);
}

/** The command service's dismissal pair, over its operations registry and setting seams. */
export function createJournalRunDismissals({
  operations,
  currentUser,
  resolveUuid,
  getDismissals,
  setDismissals,
  now,
  onDismissalsChanged,
}) {
  function getDismissedJournalRunKeys({ actorUuid, viewerId } = {}) {
    if (viewerId && viewerId !== currentUser?.()?.id) return new Set();
    const normalized = normalizeJournalRunDismissals(getDismissals());
    const actorPrefix = JSON.stringify([String(actorUuid ?? '')]).slice(0, -1) + ',';
    return new Set(Object.keys(normalized).filter((key) => key.startsWith(actorPrefix)));
  }

  async function dismissJournalRun({ actorUuid, runType, runId } = {}) {
    const operation = operations[runType];
    if (!operation || !validText(actorUuid) || !validText(runId))
      return failure('invalid-dismissal');
    let actor;
    try {
      actor = await resolveUuid(actorUuid);
    } catch {
      return failure('actor-not-found');
    }
    const run = actor ? await operation.getRun?.({ actor, runId, includeHistory: true }) : null;
    if (!run) return failure('run-not-found');
    const refused = terminalRun(run) ? awardChoiceDismissalRefusal(run) : failure('active-run');
    if (refused) return refused;
    const key = journalRunDismissalKey({ actorUuid, runType, runId });
    const next = normalizeJournalRunDismissals({ ...getDismissals(), [key]: now() });
    await setDismissals(next);
    onDismissalsChanged({ actorUuid, runType, runId });
    return { success: true, key };
  }

  return { dismissJournalRun, getDismissedJournalRunKeys };
}

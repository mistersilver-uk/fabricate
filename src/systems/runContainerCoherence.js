/**
 * Document-coherent reconciliation for actor-scoped run containers (crafting, salvage,
 * gathering). A manager's in-memory container can predate another client's write or the
 * primary-GM world-time resume, so persisting it blindly clobbers out-of-band terminal runs (issue
 * 733) and drops other writers' active runs (issue 739). Each persist therefore reconciles against
 * the CURRENT document, removing only what this writer intentionally dropped since its baseline.
 */

import { trimRunHistory } from './choiceGroupAward.js';
import {
  getRunLifecycleContract,
  normalizeRevision,
  RunLifecycleError,
} from './runLifecycleState.js';

function isRunMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Newest-first union of two histories by run `id`, capped at `historyLimit` (`<= 0` uncaps) save a
 * run still owing an award choice (issue 1773). The writer's entries win shared ids and
 * document-only ones are kept; the sort is stable, so an already-ordered single writer's history
 * is unchanged.
 */
export function unionRunHistory(currentHistory, nextHistory, compareHistory, historyLimit = 0) {
  const merged = [];
  const seen = new Set();
  const push = (entry) => {
    const id = entry?.id;
    if (id !== undefined && id !== null) {
      if (seen.has(id)) return;
      seen.add(id);
    }
    merged.push(entry);
  };
  for (const entry of Array.isArray(nextHistory) ? nextHistory : []) push(entry);
  for (const entry of Array.isArray(currentHistory) ? currentHistory : []) push(entry);
  if (typeof compareHistory === 'function') merged.sort(compareHistory);
  return historyLimit > 0 ? trimRunHistory(merged, historyLimit) : merged;
}

/**
 * Drop the document entries this writer removed (in its baseline, gone from `next`, as a cleanup
 * sweep does), then union the rest with its own; entries another client archived survive.
 */
export function reconcileRunHistory(
  currentHistory,
  nextHistory,
  compareHistory,
  previousHistoryIds = [],
  historyLimit = 0
) {
  const next = Array.isArray(nextHistory) ? nextHistory : [];
  const removed = new Set(previousHistoryIds);
  for (const entry of next) {
    if (entry?.id !== undefined && entry?.id !== null) removed.delete(entry.id);
  }
  const survivingCurrent = (Array.isArray(currentHistory) ? currentHistory : []).filter(
    (entry) => !(entry?.id !== undefined && entry?.id !== null && removed.has(entry.id))
  );
  return unionRunHistory(survivingCurrent, next, compareHistory, historyLimit);
}

/**
 * The fresh document's active runs minus the keys this writer removed since its baseline, overlaid
 * with its own; runs another client added are in neither set, so they survive.
 */
export function reconcileActiveRuns(currentActive, nextActive, previousActiveKeys = []) {
  const next = isRunMap(nextActive) ? nextActive : {};
  const removed = new Set(previousActiveKeys);
  for (const key of Object.keys(next)) removed.delete(key);

  const active = {};
  for (const [id, run] of Object.entries(isRunMap(currentActive) ? currentActive : {})) {
    if (!removed.has(id)) active[id] = run;
  }
  for (const [id, run] of Object.entries(next)) active[id] = run;
  return active;
}

export function reconcileRunContainer({
  current,
  next,
  previousActiveKeys = [],
  previousHistoryIds = [],
  compareHistory,
  historyLimit = 0,
} = {}) {
  return {
    active: reconcileActiveRuns(current?.active, next?.active, previousActiveKeys),
    history: reconcileRunHistory(
      current?.history,
      next?.history,
      compareHistory,
      previousHistoryIds,
      historyLimit
    ),
  };
}

/**
 * The active keys and history ids a manager records, to tell a removal from another's addition,
 * and the `revisions` of its version-1 runs, to tell a stale write from a fresh one.
 */
export function runContainerBaseline(container) {
  const { active, history } = versionedRevisions(container);
  return {
    activeKeys: Object.keys(container?.active || {}),
    historyIds: historyIdsOf(container?.history),
    revisions: new Map([...history, ...active]),
  };
}

/** Each version-1 run's `runRevision`, by active key and by history id. */
function versionedRevisions(container) {
  const revisionsOf = (entries) =>
    new Map(
      entries
        .filter(([id, run]) => id != null && getRunLifecycleContract(run) === 'current')
        .map(([id, run]) => [id, normalizeRevision(run.runRevision)])
    );
  const active = isRunMap(container?.active) ? Object.entries(container.active) : [];
  const history = Array.isArray(container?.history) ? container.history : [];
  return {
    active: revisionsOf(active),
    history: revisionsOf(history.map((run) => [run?.id, run])),
  };
}

/**
 * Refuse a write that would replace a stored version-1 run with an older copy: a lower revision,
 * an archive that does not advance the stored active revision, or a change or removal made from a
 * `baseline` the stored run has since moved past. Legacy and unsupported runs are never compared.
 * @throws {RunLifecycleError} `STALE_RUN_REVISION`, before anything is written.
 */
export function assertNoStaleRunWrite(current, next, baseline = null) {
  const stored = versionedRevisions(current);
  const written = versionedRevisions(next);
  const storedRevision = (id) => stored.active.get(id) ?? stored.history.get(id);
  const writtenRevision = (id) => written.active.get(id) ?? written.history.get(id);
  const stale = [...written.active, ...written.history].some(
    ([id, revision]) => revision < (storedRevision(id) ?? revision)
  );
  const unadvancedArchive = [...written.history].some(
    ([id, revision]) =>
      stored.active.has(id) && !stored.history.has(id) && revision <= stored.active.get(id)
  );
  const movedSinceBaseline = [...(baseline?.revisions ?? [])].some(([id, revision]) => {
    const storedNow = storedRevision(id);
    if (storedNow === undefined || storedNow === revision) return false;
    const writtenNow = writtenRevision(id);
    return writtenNow === undefined || writtenNow > revision;
  });
  if (stale || unadvancedArchive || movedSinceBaseline) {
    throw new RunLifecycleError('The run revision is stale', 'STALE_RUN_REVISION');
  }
}

/**
 * `reconcileRunContainer` against the writer's baseline, or the current document without one,
 * after refusing a stale version-1 write with {@link assertNoStaleRunWrite}.
 */
export function reconcileAgainstDocument({
  current,
  next,
  baseline,
  compareHistory,
  historyLimit = 0,
} = {}) {
  assertNoStaleRunWrite(current, next, baseline);
  return reconcileRunContainer({
    current,
    next,
    previousActiveKeys: baseline?.activeKeys ?? Object.keys(current?.active || {}),
    previousHistoryIds: baseline?.historyIds ?? historyIdsOf(current?.history),
    compareHistory,
    historyLimit,
  });
}

/** Collect the run ids present in a history list, for baseline snapshots. */
export function historyIdsOf(history) {
  const ids = [];
  for (const entry of Array.isArray(history) ? history : []) {
    if (entry?.id !== undefined && entry?.id !== null) ids.push(entry.id);
  }
  return ids;
}

/** Newest-first by `finishedAt`; a tie compares `0`, so a stable sort keeps insertion order. */
export function compareFinishedAtNewestFirst(a, b) {
  return Number(b?.finishedAt || 0) - Number(a?.finishedAt || 0);
}

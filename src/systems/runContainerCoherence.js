/**
 * Document-coherent reconciliation for actor-scoped run containers (crafting, salvage,
 * gathering). A manager's in-memory container can predate another client's write or the
 * primary-GM world-time resume, so persisting it blindly clobbers out-of-band terminal runs (issue
 * 733) and drops other writers' active runs (issue 739). Each persist therefore reconciles against
 * the CURRENT document, removing only what this writer intentionally dropped since its baseline.
 */

function isRunMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Newest-first union of two histories by run `id`, capped at `historyLimit` (`<= 0` uncaps). The
 * writer's entries win shared ids and document-only ones are kept; the sort is stable, so an
 * already-ordered single writer's history is unchanged.
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
  return historyLimit > 0 ? merged.slice(0, historyLimit) : merged;
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

/** The active keys and history ids a manager records, to tell a removal from another's addition. */
export function runContainerBaseline(container) {
  return {
    activeKeys: Object.keys(container?.active || {}),
    historyIds: historyIdsOf(container?.history),
  };
}

/** `reconcileRunContainer` against the writer's baseline, or the current document without one. */
export function reconcileAgainstDocument({
  current,
  next,
  baseline,
  compareHistory,
  historyLimit = 0,
} = {}) {
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

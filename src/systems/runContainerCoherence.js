/**
 * Document-coherent reconciliation for actor-scoped run containers
 * (crafting / salvage / gathering).
 *
 * Each run manager holds a per-actor in-memory container that can predate writes
 * made by another client/session or by the primary-GM world-time resume. Blindly
 * persisting that container overwrites the actor document, so a stale view silently
 * CLOBBERS terminal runs written out-of-band (issue 733) and drops other writers'
 * active runs (issue 739). Reconciling the about-to-persist container against the
 * CURRENT persisted document keeps every terminal run (history union by id) and
 * every active run another writer added (active merge against the fresh document,
 * removing only what THIS writer intentionally dropped).
 */

function isRunMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Merge two history lists newest-first, union by run `id`, capped at `historyLimit`.
 *
 * The writer's entries are pushed first so they win for shared ids; document-only
 * entries the writer never saw (a run another client archived) are appended and thus
 * preserved. The final ordering is a STABLE sort by `compareHistory`, so entries with
 * an equal sort key keep their pre-sort order — a single writer whose `next` history
 * is already newest-first is left byte-for-byte unchanged.
 *
 * @param {Array} currentHistory the persisted document's history
 * @param {Array} nextHistory the writer's about-to-persist history
 * @param {(a: object, b: object) => number} [compareHistory] newest-first comparator
 * @param {number} [historyLimit] retention cap (<= 0 means uncapped)
 * @returns {Array} the reconciled history
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
 * Reconcile history against the current document.
 *
 * Drops the document entries this writer intentionally removed (present in its
 * baseline history but no longer in its `next` history — e.g. a system/component
 * cleanup sweep), then unions the remaining document entries with the writer's own,
 * newest-first, capped. Terminal entries another client archived that this writer
 * never saw survive.
 *
 * @param {Array} currentHistory the persisted document's history
 * @param {Array} nextHistory the writer's about-to-persist history
 * @param {Iterable<string>} previousHistoryIds the history ids the writer last observed
 * @param {(a: object, b: object) => number} [compareHistory] newest-first comparator
 * @param {number} [historyLimit] retention cap
 * @returns {Array} the reconciled history
 */
export function reconcileRunHistory(
  currentHistory,
  nextHistory,
  previousHistoryIds = [],
  compareHistory,
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
 * Reconcile the active run map against the current document.
 *
 * Starts from the fresh document's active runs, drops the keys this writer
 * intentionally removed (present in its baseline but no longer in its `next` view),
 * then overlays the writer's own active runs. Active runs another client added that
 * this writer never observed are neither in the baseline nor removed, so they survive.
 *
 * @param {object} currentActive the persisted document's active map
 * @param {object} nextActive the writer's about-to-persist active map
 * @param {Iterable<string>} previousActiveKeys the active keys the writer last observed
 * @returns {object} the reconciled active map
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

/**
 * Reconcile a whole run container ({ active, history }) against the current document.
 *
 * @param {object} args
 * @param {{active?: object, history?: Array}} args.current the persisted document container
 * @param {{active?: object, history?: Array}} args.next the writer's about-to-persist container
 * @param {Iterable<string>} [args.previousActiveKeys] active keys the writer last observed
 * @param {Iterable<string>} [args.previousHistoryIds] history ids the writer last observed
 * @param {(a: object, b: object) => number} [args.compareHistory] newest-first comparator
 * @param {number} [args.historyLimit] retention cap
 * @returns {{active: object, history: Array}} the reconciled container
 */
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
      previousHistoryIds,
      compareHistory,
      historyLimit
    ),
  };
}

/** Collect the run ids present in a history list, for baseline snapshots. */
export function historyIdsOf(history) {
  const ids = [];
  for (const entry of Array.isArray(history) ? history : []) {
    if (entry?.id !== undefined && entry?.id !== null) ids.push(entry.id);
  }
  return ids;
}

/**
 * Newest-first comparator keyed on `finishedAt` (the crafting/salvage terminal field).
 * Returns 0 for equal timestamps so a stable sort preserves insertion order.
 */
export function compareFinishedAtNewestFirst(a, b) {
  return Number(b?.finishedAt || 0) - Number(a?.finishedAt || 0);
}

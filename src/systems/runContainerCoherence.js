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

import {
  getFabricateFlag,
  setFabricateFlag,
  deleteRemovedActiveRunFlags,
} from '../config/flags.js';

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
 * @param {(a: object, b: object) => number} [compareHistory] newest-first comparator
 * @param {Iterable<string>} [previousHistoryIds] the history ids the writer last observed
 * @param {number} [historyLimit] retention cap
 * @returns {Array} the reconciled history
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
      compareHistory,
      previousHistoryIds,
      historyLimit
    ),
  };
}

/**
 * Build the baseline snapshot (active keys + history ids) a run manager records so a
 * later `_persist` can distinguish an intentional removal from another writer's
 * concurrently-added run. Shared by every actor-scoped run manager's `_recordBaseline`.
 *
 * @param {{active?: object, history?: Array}} container
 * @returns {{activeKeys: string[], historyIds: Array}}
 */
export function runContainerBaseline(container) {
  return {
    activeKeys: Object.keys(container?.active || {}),
    historyIds: historyIdsOf(container?.history),
  };
}

/**
 * Reconcile the about-to-persist `next` container against the freshly-read `current`
 * document, using the writer's last-observed `baseline` (falling back to the current
 * document when the writer has no baseline yet). Wraps {@link reconcileRunContainer}
 * with the baseline-fallback logic every run manager repeats.
 *
 * @param {object} args
 * @param {{active?: object, history?: Array}} args.current freshly-read document container
 * @param {{active?: object, history?: Array}} args.next the writer's about-to-persist container
 * @param {{activeKeys?: string[], historyIds?: Array}|null} [args.baseline] last-observed snapshot
 * @param {(a: object, b: object) => number} [args.compareHistory] newest-first comparator
 * @param {number} [args.historyLimit] retention cap
 * @returns {{active: object, history: Array}} the reconciled container
 */
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

/**
 * Persist a doubly-nested Fabricate run container (crafting / salvage) coherently:
 * read the CURRENT document, reconcile the about-to-persist container against it
 * (keeping other writers' runs), apply the reconciled result onto the SAME container
 * object, refresh the manager's cache + baseline, then write the flag with an explicit
 * removed-active-key deletion (setFlag's recursive merge can't delete keys, so a
 * completed/discarded run would otherwise resurrect on reload).
 *
 * Shared by CraftingRunManager and SalvageRunManager, which differ only in flag key.
 *
 * @param {object} args
 * @param {object} args.actor the actor owning the container
 * @param {{active: object, history: Array}} args.container mutated in place with the reconciled result
 * @param {string} args.flagKey the container flag key ('craftingRuns' | 'salvageRuns')
 * @param {(raw?: object) => {active: object, history: Array}} args.normalizeContainer manager normalizer
 * @param {Map} args.cache the manager's actorId -> container cache
 * @param {Map} args.baseline the manager's actorId -> baseline-snapshot map
 * @param {(a: object, b: object) => number} [args.compareHistory] newest-first comparator
 * @param {number} [args.historyLimit] retention cap
 */
export async function persistFabricateRunContainer({
  actor,
  container,
  flagKey,
  normalizeContainer,
  cache,
  baseline,
  compareHistory = compareFinishedAtNewestFirst,
  historyLimit = 0,
}) {
  const current = normalizeContainer(getFabricateFlag(actor, flagKey, null));
  const reconciled = reconcileAgainstDocument({
    current,
    next: container,
    baseline: baseline.get(actor.id),
    compareHistory,
    historyLimit,
  });
  container.active = reconciled.active;
  container.history = reconciled.history;
  cache.set(actor.id, container);
  baseline.set(actor.id, runContainerBaseline(container));
  await deleteRemovedActiveRunFlags(actor, flagKey, container);
  await setFabricateFlag(actor, flagKey, container);
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
